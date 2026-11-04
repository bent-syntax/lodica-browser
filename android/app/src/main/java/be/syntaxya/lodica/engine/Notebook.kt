package be.syntaxya.lodica.engine

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** One note on this device. [conflict] is set when a linked device changed the note first, [gone] when a linked device deleted it. [at] is the time of the last edit. */
data class Note(val id: String, val text: String, val rev: Int, val conflict: Boolean = false, val gone: Boolean = false, val at: Long = 0)

/** A note in the list: its first line is the [title], empty for a blank note. */
data class NoteInfo(val id: String, val title: String, val at: Long = 0)

/** A note as linked devices share it. A deleted note stays as a [deleted] entry so the delete travels too. */
data class SyncNote(val id: String, val text: String, val deleted: Boolean, val at: Long)

/**
 * Notebook kept on this device and shared only with the linked devices (the "notes" link category). Nothing goes to the relay.
 * Mirrors the desktop main/notebook.js. Each note carries `rev` (counts changes on this device, so an open editor notices a note a
 * linked device changed) and `at` (time of the last edit, decides which side wins when devices merge).
 */
object Notebook {
    private const val NOTES_MAX = 500
    private const val NOTE_TEXT = 200_000
    private const val TOMB_TTL = 30L * 24 * 3600 * 1000
    private val ID = Regex("^[\\w-]{1,40}$")

    private class Stored(val id: String, var text: String, var rev: Int, var at: Long, var deleted: Boolean = false)

    private lateinit var app: Context
    private var notes: MutableList<Stored>? = null

    /** Called after a note changed on this device, so the link sync can send it. */
    var onChange: () -> Unit = {}

    fun init(ctx: Context) { app = ctx.applicationContext }

    private fun sp() = app.getSharedPreferences("notebook", Context.MODE_PRIVATE)

    @Synchronized private fun all(): MutableList<Stored> {
        notes?.let { return it }
        val out = mutableListOf<Stored>()
        runCatching {
            val a = JSONArray(sp().getString("notes", "[]"))
            for (i in 0 until a.length()) {
                val o = a.getJSONObject(i)
                val id = o.optString("id")
                if (id.isEmpty()) continue
                out.add(Stored(id, o.optString("text", ""), o.optInt("rev", 0), o.optLong("at", 0), o.optBoolean("deleted", false)))
            }
        }
        notes = out
        return out
    }

    private fun persist() {
        val a = JSONArray()
        for (n in all()) a.put(JSONObject().put("id", n.id).put("text", n.text).put("rev", n.rev).put("at", n.at).put("deleted", n.deleted))
        sp().edit().putString("notes", a.toString()).apply()
        onChange()
    }

    private fun title(n: Stored) = n.text.lineSequence().firstOrNull { it.isNotBlank() }?.trim()?.take(60) ?: ""
    private fun live() = all().filter { !it.deleted }.sortedByDescending { it.at }
    private fun info(n: Stored) = NoteInfo(n.id, title(n), n.at)
    private fun note(n: Stored, conflict: Boolean = false) = Note(n.id, n.text, n.rev, conflict, false, n.at)

    /** The notes, newest first. */
    @Synchronized fun list(): List<NoteInfo> = live().map { info(it) }

    /** The note [id], or null when there is none. */
    @Synchronized fun get(id: String): Note? = live().firstOrNull { it.id == id }?.let { note(it) }

    /** Saves [text] in note [id] on top of revision [base]. A conflict carries the newer note; [gone] says a linked device deleted it. */
    @Synchronized fun put(id: String, text: String, base: Int): Note {
        val n = all().firstOrNull { it.id == id }
        if (n == null || n.deleted) return Note(id, "", 0, gone = true)
        if (base != n.rev) return note(n, conflict = true)
        val t = text.take(NOTE_TEXT)
        if (t != n.text) { n.text = t; n.rev += 1; n.at = System.currentTimeMillis(); persist() }
        return note(n)
    }

    /** Adds an empty note. */
    @Synchronized fun create(): Note {
        val b = ByteArray(8).also { java.security.SecureRandom().nextBytes(it) }
        val n = Stored(b.joinToString("") { "%02x".format(it) }, "", 0, System.currentTimeMillis())
        all().add(n); persist()
        return note(n)
    }

    /** Deletes note [id]; the delete travels to the linked devices. The notes that are left. */
    @Synchronized fun remove(id: String): List<NoteInfo> {
        val n = all().firstOrNull { it.id == id }
        if (n != null && !n.deleted) { n.deleted = true; n.text = ""; n.rev += 1; n.at = System.currentTimeMillis(); persist() }
        return live().map { info(it) }
    }

    /** Text to show after a conflict: the newer text, with this device's own text added under it so nothing is lost. */
    fun merge(remote: String, mine: String): String = when {
        remote == mine || mine.isBlank() -> remote
        remote.isBlank() -> mine
        else -> remote.trimEnd() + "\n\n" + mine
    }

    /** Every note, deleted ones included, for the link sync. */
    @Synchronized fun everything(): List<SyncNote> = all().map { SyncNote(it.id, it.text, it.deleted, it.at) }

    /**
     * Merges notes from a linked device: one per id, the newer edit wins and on a tie a delete beats an edit, then the longer text.
     * An adopted note gets a new `rev` so an open editor notices. Deletes older than 30 days are dropped. Returns how many changed here.
     */
    @Synchronized fun mergeFrom(remote: List<SyncNote>, now: Long = System.currentTimeMillis()): Int {
        val out = LinkedHashMap<String, Stored>()
        for (n in all()) out[n.id] = n
        var changed = 0
        for (r in remote) {
            if (!ID.matches(r.id)) continue
            val e = Stored(r.id, if (r.deleted) "" else r.text.take(NOTE_TEXT), 0, maxOf(0L, r.at), r.deleted)
            val cur = out[e.id]
            val wins = cur == null || e.at > cur.at || (e.at == cur.at && ((e.deleted && !cur.deleted) || (!e.deleted && !cur.deleted && e.text > cur.text)))
            if (!wins) continue
            if (cur != null && cur.deleted == e.deleted && cur.text == e.text && cur.at == e.at) continue
            e.rev = (cur?.rev ?: 0) + 1
            out[e.id] = e; changed++
        }
        if (changed == 0) return 0
        val kept = out.values.filter { !it.deleted || now - it.at < TOMB_TTL }.sortedByDescending { it.at }.take(NOTES_MAX)
        notes = kept.toMutableList()
        persist()
        return changed
    }

    /** The part of the notes that fits the sync [budget] in characters, newest first: whole notes only. */
    fun forSync(list: List<SyncNote>, budget: Int = 200_000): List<SyncNote> {
        val out = mutableListOf<SyncNote>()
        var used = 0
        for (n in list.sortedByDescending { it.at }) {
            val item = if (n.deleted) SyncNote(n.id, "", true, n.at) else n
            val size = item.id.length + item.text.length + 40
            if (used + size > budget) continue
            used += size; out.add(item)
        }
        return out
    }
}
