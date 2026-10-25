package be.syntaxya.lodica.engine

import org.json.JSONObject

/** One note kept on the relay, shown on every linked device. [conflict] is set when another device saved first, [gone] when another device deleted it. */
data class Note(val id: String, val text: String, val rev: Int, val conflict: Boolean = false, val gone: Boolean = false)

/** A note in the list: its first line is the [title], empty for a blank note. */
data class NoteInfo(val id: String, val title: String)

/** Client for the relay's /api/notebook, mirrored by the desktop main/notebook.js. Blocking calls: keep them off the main thread. */
object Notebook {
    private fun path(id: String?) = "/api/notebook" + if (id != null) "?id=" + java.net.URLEncoder.encode(id, "UTF-8") else ""

    private fun parse(body: String, conflict: Boolean = false): Note {
        val o = JSONObject(body)
        return Note(o.optString("id", "1"), o.optString("text", ""), o.optInt("rev", 0), conflict)
    }

    private fun parseList(body: String): List<NoteInfo> {
        // A relay without several notes answers with the one note only.
        val a = JSONObject(body).optJSONArray("notes") ?: return listOf(NoteInfo("1", ""))
        return List(a.length()) { val o = a.getJSONObject(it); NoteInfo(o.getString("id"), o.optString("title", "")) }
    }

    /** The notes in order, or null when the relay cannot answer. */
    fun list(): List<NoteInfo>? = runCatching {
        val (code, body) = Relay.request("GET", path(null))
        if (code == 200) parseList(body) else null
    }.getOrNull()

    /** The stored note [id], or null when the relay cannot answer. */
    fun get(id: String): Note? = runCatching {
        val (code, body) = Relay.request("GET", path(id))
        if (code == 200) parse(body) else null
    }.getOrNull()

    /** Saves [text] in note [id] on top of revision [base]. Null when the relay cannot answer. A conflict carries the newer note. */
    fun put(id: String, text: String, base: Int): Note? = runCatching {
        val b = JSONObject().put("text", text).put("base", base).toString().toByteArray()
        val (code, body) = Relay.request("PUT", path(id), b, "application/json")
        when (code) {
            200 -> parse(body)
            409 -> parse(body, conflict = true)
            404 -> Note(id, "", 0, gone = true)
            else -> null
        }
    }.getOrNull()

    /** Adds an empty note. Null when the relay cannot answer. */
    fun create(): Note? = runCatching {
        val (code, body) = Relay.request("POST", path(null), "{}".toByteArray(), "application/json")
        if (code == 200) parse(body) else null
    }.getOrNull()

    /** Deletes note [id]. The remaining notes, or null when the relay cannot answer. */
    fun remove(id: String): List<NoteInfo>? = runCatching {
        val (code, body) = Relay.request("DELETE", path(id))
        if (code == 200) parseList(body) else null
    }.getOrNull()

    /** Text to show after a conflict: the newer remote text, with this device's own text added under it so nothing is lost. */
    fun merge(remote: String, mine: String): String = when {
        remote == mine || mine.isBlank() -> remote
        remote.isBlank() -> mine
        else -> remote.trimEnd() + "\n\n" + mine
    }
}
