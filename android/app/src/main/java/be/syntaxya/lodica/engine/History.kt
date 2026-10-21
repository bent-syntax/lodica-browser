package be.syntaxya.lodica.engine

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri
import java.util.concurrent.Executors

data class Visit(val url: String, val title: String, val visits: Int, val last: Long)

/** Local browsing history for suggestions and top sites. Private tabs never reach here. */
object History {
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "lodica-history") }
    private lateinit var helper: SQLiteOpenHelper

    fun init(ctx: Context) {
        if (::helper.isInitialized) return
        helper = object : SQLiteOpenHelper(ctx.applicationContext, "history.db", null, 2) {
            override fun onCreate(db: SQLiteDatabase) {
                db.execSQL("CREATE TABLE visits(url TEXT PRIMARY KEY, title TEXT, host TEXT, visits INTEGER DEFAULT 0, last INTEGER)")
                db.execSQL("CREATE INDEX visits_host ON visits(host)")
                db.execSQL("CREATE INDEX visits_last ON visits(last)")
                createSearches(db)
            }
            override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
                if (old < 2) createSearches(db)
            }
        }
    }

    private fun createSearches(db: SQLiteDatabase) =
        db.execSQL("CREATE TABLE IF NOT EXISTS searches(q TEXT PRIMARY KEY COLLATE NOCASE, count INTEGER DEFAULT 0, last INTEGER)")

    private fun normal(url: String) = url.startsWith("http://") || url.startsWith("https://")

    fun visit(url: String) {
        if (!normal(url)) return
        io.execute {
            val db = helper.writableDatabase
            val now = System.currentTimeMillis()
            db.execSQL(
                "INSERT INTO visits(url, title, host, visits, last) VALUES(?, '', ?, 1, ?) " +
                    "ON CONFLICT(url) DO UPDATE SET visits = visits + 1, last = excluded.last",
                arrayOf<Any>(url, Uri.parse(url).host ?: "", now),
            )
        }
    }

    /** Bulk-merges visits from another browser: counts add up, the newest timestamp wins. */
    fun importVisits(items: List<Visit>) = io.execute {
        val db = helper.writableDatabase
        db.beginTransaction()
        try {
            val st = db.compileStatement(
                "INSERT INTO visits(url, title, host, visits, last) VALUES(?, ?, ?, ?, ?) " +
                    "ON CONFLICT(url) DO UPDATE SET visits = visits + excluded.visits, " +
                    "last = MAX(last, excluded.last), title = CASE WHEN title = '' THEN excluded.title ELSE title END",
            )
            for (v in items) {
                st.clearBindings()
                st.bindString(1, v.url); st.bindString(2, v.title)
                st.bindString(3, Uri.parse(v.url).host ?: ""); st.bindLong(4, v.visits.toLong()); st.bindLong(5, v.last)
                st.executeInsert()
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }

    /** Records a typed search for suggestions. Callers skip private tabs. */
    fun search(q: String) {
        val t = q.trim().take(200)
        if (t.isEmpty()) return
        io.execute {
            helper.writableDatabase.execSQL(
                "INSERT INTO searches(q, count, last) VALUES(?, 1, ?) " +
                    "ON CONFLICT(q) DO UPDATE SET count = count + 1, last = excluded.last",
                arrayOf<Any>(t, System.currentTimeMillis()),
            )
        }
    }

    /** Frecency: frequency damped by a two-week recency half-life. */
    private fun score(count: Int, last: Long, now: Long): Double {
        val days = ((now - last).coerceAtLeast(0)) / 86_400_000.0
        return (1.0 + Math.log(count.coerceAtLeast(1).toDouble())) * Math.pow(0.5, days / 14.0)
    }

    /** Blocking. Past searches containing [text], best frecency first. */
    fun suggestSearches(text: String, limit: Int = 3): List<String> {
        val q = text.trim().replace("%", "").replace("_", "")
        if (q.isEmpty()) return emptyList()
        val now = System.currentTimeMillis()
        val rows = ArrayList<Triple<String, Int, Long>>()
        helper.readableDatabase.rawQuery(
            "SELECT q, count, last FROM searches WHERE q LIKE ? AND q != ? COLLATE NOCASE ORDER BY last DESC LIMIT 60",
            arrayOf("%$q%", q),
        ).use { c -> while (c.moveToNext()) rows += Triple(c.getString(0), c.getInt(1), c.getLong(2)) }
        return rows.sortedByDescending { score(it.second, it.third, now) }.take(limit).map { it.first }
    }

    fun title(url: String, title: String) {
        if (!normal(url) || title.isBlank()) return
        io.execute {
            helper.writableDatabase.update("visits", ContentValues().apply { put("title", title) }, "url = ?", arrayOf(url))
        }
    }

    private fun read(sql: String, args: Array<String>): List<Visit> {
        val out = ArrayList<Visit>()
        helper.readableDatabase.rawQuery(sql, args).use { c ->
            while (c.moveToNext()) out += Visit(c.getString(0), c.getString(1) ?: "", c.getInt(2), c.getLong(3))
        }
        return out
    }

    /** Blocking; call off the main thread. */
    fun suggest(text: String, limit: Int = 6): List<Visit> {
        val q = text.trim().replace("%", "").replace("_", "")
        if (q.isEmpty()) return emptyList()
        val now = System.currentTimeMillis()
        val hostFirst = q.lowercase()
        return read(
            "SELECT url, title, visits, last FROM visits WHERE url LIKE ? OR title LIKE ? " +
                "ORDER BY last DESC LIMIT 80",
            arrayOf("%$q%", "%$q%"),
        ).sortedByDescending {
            val host = Uri.parse(it.url).host?.removePrefix("www.")?.lowercase() ?: ""
            score(it.visits, it.last, now) * (if (host.startsWith(hostFirst)) 2.0 else 1.0)
        }.take(limit)
    }

    /** Blocking; call off the main thread. One entry per host, most visited first. */
    fun topSites(limit: Int = 8): List<Visit> = read(
        "SELECT url, title, SUM(visits) AS v, MAX(last) FROM visits WHERE host != '' GROUP BY host ORDER BY v DESC LIMIT $limit",
        emptyArray(),
    )

    /** Newest first, with URLs differing only by fragment or trailing slash merged into one entry. */
    fun recent(limit: Int = 200): List<Visit> =
        read("SELECT url, title, visits, last FROM visits ORDER BY last DESC LIMIT ${limit * 3}", emptyArray())
            .groupBy { it.url.substringBefore('#').trimEnd('/') }
            .values
            .map { g -> g.first().copy(title = g.firstOrNull { it.title.isNotBlank() }?.title.orEmpty(), visits = g.sumOf { it.visits }) }
            .take(limit)

    fun clear() = io.execute { helper.writableDatabase.delete("visits", null, null) }

    /** Wipes the past-search suggestions and the page history they draw on. */
    fun clearSuggestions() = io.execute {
        val db = helper.writableDatabase
        db.delete("searches", null, null)
        db.delete("visits", null, null)
    }

    fun remove(url: String) = io.execute { helper.writableDatabase.delete("visits", "url = ?", arrayOf(url)) }
}
