package be.syntaxya.lodica.engine

import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject

data class ChatMsg(val role: String, val text: String, val t: Long)

data class Chat(val id: String, val title: String, val updated: Long, val messages: List<ChatMsg>, val deleted: Boolean = false)

/**
 * AI chats, kept encrypted on the phone and mirrored to linked devices through [PcTabs]. Same rules as the
 * desktop: newest `updated` wins per chat id, deletes are tombstones so they reach the other device.
 */
object Chats {
    private const val MAX_CHATS = 100
    private const val MAX_MSGS = 200
    private val main = Handler(Looper.getMainLooper())

    private var all: List<Chat> = emptyList()
    private var loaded = false

    /** Visible chats, newest first. Replaced on every change so Compose re-reads it. */
    var list by mutableStateOf<List<Chat>>(emptyList()); private set
    var sending by mutableStateOf<String?>(null); private set
    var onChange: () -> Unit = {}

    private fun ensure() {
        if (loaded) return
        loaded = true
        all = runCatching { parse(JSONArray(Secret.get("aichats") ?: "[]")) }.getOrDefault(emptyList())
        publish()
    }

    fun init() = ensure()

    private fun publish() { list = all.filter { !it.deleted }.sortedByDescending { it.updated } }

    private fun commit(next: List<Chat>, notify: Boolean = true) {
        all = next
        publish()
        Secret.put("aichats", toJson(all).toString())
        if (notify) onChange()
    }

    fun get(id: String?): Chat? = if (id == null) null else list.firstOrNull { it.id == id }

    fun raw(): List<Chat> { ensure(); return all }

    /** Adds the user's message, asks Haiku with the whole thread and appends the answer. [done] gets the chat id. */
    fun send(id: String?, text: String, done: (String, String?) -> Unit) {
        ensure()
        val t = text.trim().take(4000)
        if (t.isEmpty()) return
        val now = System.currentTimeMillis()
        val cur = all.firstOrNull { it.id == id && !it.deleted }
        val cid = cur?.id ?: (java.lang.Long.toString(now, 36) + java.lang.Long.toString((Math.random() * 1679616).toLong(), 36).padStart(4, '0'))
        val withUser = (cur ?: Chat(cid, t.take(48), now, emptyList())).let { it.copy(messages = it.messages + ChatMsg("user", t, now), updated = now) }
        commit(all.filter { it.id != cid } + withUser, false)
        sending = cid
        Ai.chat(withUser.messages.map { it.role to it.text }) { r ->
            sending = null
            val latest = all.firstOrNull { it.id == cid } ?: withUser
            val err = r.exceptionOrNull()?.message
            val msgs = r.getOrNull()?.let { latest.messages + ChatMsg("assistant", it, System.currentTimeMillis()) } ?: latest.messages.dropLast(1)
            commit(all.filter { it.id != cid } + latest.copy(messages = msgs.takeLast(MAX_MSGS), updated = System.currentTimeMillis()))
            done(cid, err)
        }
    }

    fun delete(id: String) {
        ensure()
        commit(all.map { if (it.id == id) Chat(id, "", System.currentTimeMillis(), emptyList(), true) else it })
    }

    /** Merges chats read from another device. */
    fun merge(remote: List<Chat>) {
        ensure()
        var changed = false
        val map = all.associateBy { it.id }.toMutableMap()
        for (r in remote.take(MAX_CHATS)) {
            val mine = map[r.id]
            if (mine != null && mine.updated >= r.updated) continue
            map[r.id] = r.copy(messages = r.messages.takeLast(MAX_MSGS))
            changed = true
        }
        if (!changed) return
        var next = map.values.toList()
        if (next.size > MAX_CHATS) next = next.sortedByDescending { it.updated }.take(MAX_CHATS)
        // A sync merge must not trigger another upload by itself.
        commit(next, false)
    }

    fun clearAll() { ensure(); commit(all.map { if (it.deleted) it else Chat(it.id, "", System.currentTimeMillis(), emptyList(), true) }) }

    fun toJson(chats: List<Chat>): JSONArray = JSONArray().apply {
        chats.forEach { c ->
            put(JSONObject().put("id", c.id).put("title", c.title).put("updated", c.updated).put("deleted", c.deleted)
                .put("messages", JSONArray().apply { c.messages.forEach { m -> put(JSONObject().put("role", m.role).put("text", m.text).put("t", m.t)) } }))
        }
    }

    fun parse(a: JSONArray): List<Chat> = (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        val id = o.optString("id").takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        val ms = o.optJSONArray("messages") ?: JSONArray()
        Chat(id, o.optString("title").take(80), o.optLong("updated"),
            (0 until ms.length()).mapNotNull { j ->
                val m = ms.optJSONObject(j) ?: return@mapNotNull null
                ChatMsg(if (m.optString("role") == "assistant") "assistant" else "user", m.optString("text").take(8000), m.optLong("t"))
            }, o.optBoolean("deleted"))
    }
}
