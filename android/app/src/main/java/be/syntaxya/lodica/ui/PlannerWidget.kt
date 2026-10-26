package be.syntaxya.lodica.ui

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import be.syntaxya.lodica.R
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.theme.ThemeState
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale

/** The Smartschool planner from the start page as a home screen and lock screen widget: the full planner or only tasks and tests. */
class PlannerWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, build(ctx, manager, it)) }
        if (System.currentTimeMillis() - fetchedAt > STALE) reload(ctx)
    }

    override fun onAppWidgetOptionsChanged(ctx: Context, manager: AppWidgetManager, id: Int, options: android.os.Bundle) {
        manager.updateAppWidget(id, build(ctx, manager, id))
    }

    private class Ev(var day: Long, val min: Int, val end: Int, val endDay: Long, val allDay: Boolean, val title: String, val subject: String, val kind: Int, val desc: String = "")

    /** One planner row: [text] for the widget, the rest for the start page card. */
    class Row(val text: String, val kind: Int, val day: Long, val from: Int, val to: Int, val allDay: Boolean, val title: String, val detail: String) {
        val key: String get() = "$day|$from|$title"
        val range: String get() = if (allDay) "All day" else hhmm(from) + "-" + hhmm(to)
    }

    private class Rule(val wd: Int, val from: Int, val to: Int, val subject: String)

    private class Ics(val y: Int, val mo: Int, val d: Int, val h: Int, val mi: Int, val z: Boolean, val allDay: Boolean)

    companion object {
        private const val STALE = 25 * 60 * 1000L
        private const val LESSON = 0
        private const val TASK = 1
        private const val TEST = 2
        private const val ROWS = 12
        private val ROW_IDS = intArrayOf(R.id.p0, R.id.p1, R.id.p2, R.id.p3, R.id.p4, R.id.p5, R.id.p6, R.id.p7, R.id.p8, R.id.p9, R.id.p10, R.id.p11)

        @Volatile private var text: String? = null
        @Volatile private var failed = false
        @Volatile private var fetchedAt = 0L
        @Volatile private var fetching = false

        fun refresh(ctx: Context) {
            val m = AppWidgetManager.getInstance(ctx)
            m.getAppWidgetIds(ComponentName(ctx, PlannerWidget::class.java)).forEach { m.updateAppWidget(it, build(ctx, m, it)) }
        }

        /** Downloads the ICS again (off the main thread) and redraws every planner widget. */
        fun reload(ctx: Context) {
            val app = ctx.applicationContext
            val m = AppWidgetManager.getInstance(app)
            if (m.getAppWidgetIds(ComponentName(app, PlannerWidget::class.java)).isEmpty() || fetching) return
            fetching = true
            Thread {
                try {
                    val url = Prefs.plannerIcs
                    if (url.startsWith("https://") || url.startsWith("http://")) {
                        val got = runCatching { download(url) }.getOrNull()
                        if (got != null) { text = got; failed = false } else failed = true
                    } else { text = null; failed = false }
                    fetchedAt = System.currentTimeMillis()
                } finally {
                    fetching = false
                }
                refresh(app)
            }.start()
        }

        private fun download(url: String): String {
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 10000
            c.readTimeout = 15000
            return try {
                c.inputStream.use { it.bufferedReader().readText().take(4_000_000) }
            } finally {
                c.disconnect()
            }
        }

        private fun zoneOf(tz: String): ZoneId {
            val t = tz.trim()
            if (t.isEmpty()) return ZoneId.of("Europe/Brussels")
            if (t.equals("local", true)) return ZoneId.systemDefault()
            return runCatching { ZoneId.of(t) }.getOrDefault(ZoneId.of("Europe/Brussels"))
        }

        private fun icsDate(v: String, params: String): Ics? {
            val m = Regex("^(\\d{4})(\\d\\d)(\\d\\d)(?:T(\\d\\d)(\\d\\d)(\\d\\d)?(Z)?)?$").find(v) ?: return null
            val g = m.groupValues
            val allDay = g[4].isEmpty() || Regex("VALUE=DATE(?!-)").containsMatchIn(params)
            return Ics(g[1].toInt(), g[2].toInt(), g[3].toInt(), g[4].toIntOrNull() ?: 0, g[5].toIntOrNull() ?: 0, g[7].isNotEmpty() && !allDay, allDay)
        }

        /** Epoch day and minute of the day of an ICS time in the planner zone. */
        private fun wall(r: Ics, zone: ZoneId): Pair<Long, Int> {
            if (r.z) {
                val t = ZonedDateTime.ofInstant(Instant.parse("%04d-%02d-%02dT%02d:%02d:00Z".format(Locale.ROOT, r.y, r.mo, r.d, r.h, r.mi)), zone)
                return t.toLocalDate().toEpochDay() to t.hour * 60 + t.minute
            }
            return LocalDate.of(r.y, r.mo, r.d).toEpochDay() to (if (r.allDay) 0 else r.h * 60 + r.mi)
        }

        private fun slotRules(t: String): List<Rule> {
            val days = listOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")
            val re = Regex("^\\s*(?:(sun|mon|tue|wed|thu|fri|sat)\\w*\\s+)?(\\d{1,2}):(\\d\\d)\\s*-\\s*(\\d{1,2}):(\\d\\d)\\s+(.+?)\\s*$", RegexOption.IGNORE_CASE)
            return t.lines().mapNotNull { line ->
                val g = re.find(line)?.groupValues ?: return@mapNotNull null
                Rule(if (g[1].isEmpty()) -1 else days.indexOf(g[1].lowercase()), g[2].toInt() * 60 + g[3].toInt(), g[4].toInt() * 60 + g[5].toInt(), g[6].take(60))
            }
        }

        private fun parse(src: String, zone: ZoneId, nowDay: Long): MutableList<Ev> {
            val out = mutableListOf<Ev>()
            var cur: MutableMap<String, String>? = null
            var start: Ics? = null
            var end: Ics? = null
            for (line in src.replace(Regex("\r?\n[ \t]"), "").split(Regex("\r?\n"))) {
                if (line == "BEGIN:VEVENT") { cur = mutableMapOf(); start = null; end = null; continue }
                if (line == "END:VEVENT") {
                    val s = start
                    val e = cur
                    if (e != null && s != null) {
                        val a = wall(s, zone)
                        val b = end?.let { wall(it, zone) } ?: a
                        val title = e["title"] ?: "Untitled"
                        val kind = if (Regex("^(huistaak|meebrengen):\\s", RegexOption.IGNORE_CASE).containsMatchIn(title)) TASK
                        else if (Regex("^toets:\\s", RegexOption.IGNORE_CASE).containsMatchIn(title)) TEST else LESSON
                        val sub = Regex("Vakken:[ \t]*([^\n]+)", RegexOption.IGNORE_CASE).find(e["desc"] ?: "")?.groupValues?.get(1)?.trim().orEmpty()
                        if ((if (s.allDay) b.first - 1 else b.first) >= nowDay && a.first < nowDay + 7) {
                            out.add(Ev(maxOf(a.first, nowDay), a.second, b.second, b.first, s.allDay, title, sub, kind, (e["desc"] ?: "").trim().take(600)))
                        }
                    }
                    cur = null
                    continue
                }
                val c = cur ?: continue
                val i = line.indexOf(':')
                if (i < 0) continue
                val head = line.substring(0, i).split(";")
                val raw = line.substring(i + 1)
                val v = raw.replace(Regex("\\\\n", RegexOption.IGNORE_CASE), " ").replace(Regex("\\\\([,;\\\\])"), "$1")
                when (head[0]) {
                    "DTSTART" -> icsDate(v, head.drop(1).joinToString(";"))?.let { start = it }
                    "DTEND" -> icsDate(v, head.drop(1).joinToString(";"))?.let { end = it }
                    "SUMMARY" -> c["title"] = v
                    "DESCRIPTION" -> c["desc"] = raw.replace(Regex("\\\\n", RegexOption.IGNORE_CASE), "\n").replace(Regex("\\\\([,;\\\\])"), "$1")
                }
            }
            return out
        }

        /** Today (epoch day) and the minute of the day in the planner zone. */
        fun now(): Pair<Long, Int> { val t = ZonedDateTime.now(zoneOf(Prefs.plannerTz)); return t.toLocalDate().toEpochDay() to t.hour * 60 + t.minute }

        fun hhmm(m: Int) = "%02d:%02d".format(Locale.ROOT, m / 60, m % 60)

        /** The rows to show: day, time and subject; in tasks mode only tasks and tests. */
        private fun rows(zone: ZoneId, tasksOnly: Boolean = Prefs.plannerWidgetMode == "tasks"): List<Row> {
            val src = text ?: return emptyList()
            val now = ZonedDateTime.now(zone)
            val nowDay = now.toLocalDate().toEpochDay()
            var evs = parse(src, zone, nowDay)
            val rules = slotRules(Prefs.plannerSlots)
            for (d in nowDay until nowDay + 7) {
                for (r in rules) {
                    if (r.wd >= 0 && r.wd.toLong() != (d + 4) % 7) continue
                    evs = evs.filter { !(it.kind == LESSON && !it.allDay && it.day == d && it.min < r.to && it.end > r.from) }.toMutableList()
                    evs.add(Ev(d, r.from, r.to, d, false, r.subject, "", LESSON))
                }
            }
            if (tasksOnly) evs = evs.filter { it.kind != LESSON }.toMutableList()
            evs.sortWith(compareBy<Ev>({ it.day }, { if (it.allDay) 0 else 1 }, { it.min }, { if (it.kind == LESSON) 1 else 0 }))
            return evs.map { e ->
                val day = if (e.day == nowDay) "Today" else java.time.LocalDate.ofEpochDay(e.day).dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, Locale.getDefault())
                val main = if (e.kind == LESSON && e.subject.isNotEmpty()) e.subject else e.title
                val more = if (e.kind != LESSON && e.subject.isNotEmpty()) " · " + e.subject else ""
                val colour = if (!Prefs.plannerColors) 0 else if (e.kind == TASK) 1 else if (e.kind == TEST) 2 else 0
                Row("$day ${if (e.allDay) "All day" else hhmm(e.min)}  $main$more", colour, e.day, e.min, if (e.end < e.min || e.endDay != e.day) 24 * 60 else e.end, e.allDay, main + more, e.desc)
            }
        }

        /** Rows for the start page planner: lessons, tasks and tests of the next 7 days. */
        fun plan(): List<Row> = if (Prefs.plannerIcs.isBlank()) emptyList() else rows(zoneOf(Prefs.plannerTz), false)

        /** What to show instead of rows, or null when there are rows. */
        fun note(): String? = when {
            Prefs.plannerIcs.isBlank() -> "Add your Smartschool link in Settings, Start page"
            text == null && failed -> "Planner could not be loaded"
            text == null -> "Loading the planner"
            plan().isEmpty() -> "Nothing planned in the next 7 days"
            else -> null
        }

        /** Downloads the ICS when it is stale (blocking, call off the main thread). */
        fun fetch() {
            val url = Prefs.plannerIcs
            if (url.startsWith("https://") || url.startsWith("http://")) {
                if (text != null && System.currentTimeMillis() - fetchedAt < STALE) return
                val got = runCatching { download(url) }.getOrNull()
                if (got != null) { text = got; failed = false } else failed = true
            } else { text = null; failed = false }
            fetchedAt = System.currentTimeMillis()
        }

        private fun build(ctx: Context, m: AppWidgetManager, id: Int): RemoteViews {
            val p = ThemeState.palette
            val rv = RemoteViews(ctx.packageName, R.layout.widget_planner)
            rv.setImageViewBitmap(R.id.widget_bg, roundedBackground(ctx, m, id, Prefs.plannerWidgetAlpha))
            rv.setTextViewText(R.id.p_title, if (Prefs.plannerWidgetMode == "tasks") "Tasks and tests" else "Smartschool planner")
            rv.setTextColor(R.id.p_title, p.text.toInt())
            val d = ctx.resources.displayMetrics.density
            val h = m.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT).takeIf { it > 0 } ?: 110
            val fit = ((h - 44) / 27).coerceIn(1, ROWS)
            val list = if (Prefs.plannerIcs.isBlank()) emptyList() else rows(zoneOf(Prefs.plannerTz))
            val note = when {
                Prefs.plannerIcs.isBlank() -> "Add your Smartschool link in Settings, Start page"
                text == null && failed -> "Planner could not be loaded"
                text == null -> "Loading the planner"
                list.isEmpty() -> "Nothing planned in the next 7 days"
                else -> null
            }
            for (i in 0 until ROWS) {
                val row = if (note != null) (if (i == 0) Row(note, 0, 0, 0, 0, false, "", "") else null) else list.getOrNull(i)
                if (row == null || i >= fit) {
                    rv.setViewVisibility(ROW_IDS[i], android.view.View.GONE)
                    continue
                }
                rv.setViewVisibility(ROW_IDS[i], android.view.View.VISIBLE)
                rv.setTextViewText(ROW_IDS[i], row.text)
                rv.setInt(ROW_IDS[i], "setBackgroundResource", when (row.kind) { 1 -> R.drawable.planner_task; 2 -> R.drawable.planner_test; else -> R.drawable.planner_row })
                rv.setTextColor(ROW_IDS[i], if (note != null) p.muted.toInt() else p.text.toInt())
            }
            val intent = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            rv.setOnClickPendingIntent(R.id.widget_planner, PendingIntent.getActivity(ctx, 300, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            return rv
        }
    }
}
