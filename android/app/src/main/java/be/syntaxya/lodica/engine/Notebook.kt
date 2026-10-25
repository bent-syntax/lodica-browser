package be.syntaxya.lodica.engine

import org.json.JSONObject

/** The notebook text kept on the relay, shown on every linked device. [conflict] is set when another device saved first. */
data class Note(val text: String, val rev: Int, val conflict: Boolean = false)

/** Client for the relay's /api/notebook, mirrored by the desktop main/notebook.js. Blocking calls: keep them off the main thread. */
object Notebook {
    private fun parse(body: String, conflict: Boolean = false): Note {
        val o = JSONObject(body)
        return Note(o.optString("text", ""), o.optInt("rev", 0), conflict)
    }

    /** The stored note, or null when the relay cannot answer. */
    fun get(): Note? = runCatching {
        val (code, body) = Relay.request("GET", "/api/notebook")
        if (code == 200) parse(body) else null
    }.getOrNull()

    /** Saves [text] on top of revision [base]. Null when the relay cannot answer. A conflict carries the newer note. */
    fun put(text: String, base: Int): Note? = runCatching {
        val b = JSONObject().put("text", text).put("base", base).toString().toByteArray()
        val (code, body) = Relay.request("PUT", "/api/notebook", b, "application/json")
        when (code) {
            200 -> parse(body)
            409 -> parse(body, conflict = true)
            else -> null
        }
    }.getOrNull()

    /** Text to show after a conflict: the newer remote text, with this device's own text added under it so nothing is lost. */
    fun merge(remote: String, mine: String): String = when {
        remote == mine || mine.isBlank() -> remote
        remote.isBlank() -> mine
        else -> remote.trimEnd() + "\n\n" + mine
    }
}
