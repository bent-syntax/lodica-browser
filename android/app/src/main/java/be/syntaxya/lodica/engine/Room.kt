package be.syntaxya.lodica.engine

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/** One message in the server's shared chat room. */
data class RoomMsg(val id: Long, val name: String, val text: String, val at: Long, val room: String = "")

/**
 * Same-server chat: everyone linked to the same server shares one room, kept in the relay's memory
 * (last 200 messages, 24 h, not end-to-end encrypted). New messages arrive by long polling, so they
 * show up within a moment while the chat screen is open.
 */
object Room {
    val messages = mutableStateListOf<RoomMsg>()
    var error by mutableStateOf<String?>(null); private set
    private var job: Job? = null
    private var last = -1L
    val listening: Boolean get() = job?.isActive == true
    /** Selected conversation: "" is everyone, "dm:<a>|<b>" a private chat, "grp:<name>" a group. */
    var room by mutableStateOf(""); private set
    /** Private chats and groups this device keeps in its list. */
    val chats = mutableStateListOf<String>()
    private val main = android.os.Handler(android.os.Looper.getMainLooper())

    private fun rp(ctx: Context) = ctx.getSharedPreferences("room", Context.MODE_PRIVATE)

    fun loadChats(ctx: Context) {
        if (chats.isNotEmpty()) return
        chats.addAll(rp(ctx).getString("chats", "")!!.split("\n").filter { it.isNotBlank() })
    }

    private fun saveChats(ctx: Context) { rp(ctx).edit().putString("chats", chats.joinToString("\n")).apply() }

    fun savedChats(ctx: Context): List<String> { loadChats(ctx); return chats.toList() }

    /** Room id of the private chat between this device's name and [peer]. */
    fun dm(ctx: Context, peer: String): String {
        val a = clean(name(ctx)); val b = clean(peer)
        return "dm:" + listOf(a, b).sortedBy { it.lowercase() }.joinToString("|")
    }

    fun group(name: String) = "grp:" + name.replace(Regex("[^\\w .-]"), "").trim().take(32)

    private fun clean(n: String) = n.replace(Regex("[\\s|]"), "_").take(32)

    /** Human label for a room id, as seen from this device. */
    fun label(ctx: Context, r: String): String = when {
        r.isEmpty() -> "Everyone"
        r.startsWith("grp:") -> r.removePrefix("grp:")
        else -> r.removePrefix("dm:").split("|").firstOrNull { it != clean(name(ctx)) } ?: r.removePrefix("dm:")
    }

    fun addChat(ctx: Context, r: String) {
        loadChats(ctx)
        if (r.length > 4 && r !in chats) { chats.add(r); saveChats(ctx) }
    }

    fun removeChat(ctx: Context, r: String) {
        chats.remove(r); saveChats(ctx)
        if (room == r) select("")
    }

    /** Switches conversation and restarts the listener. */
    fun select(r: String) {
        stop()
        main.post { messages.clear(); error = null }
        last = -1L
        room = r
        start()
    }

    /** Adds private chats others have started with this device's name. */
    fun discover(ctx: Context) {
        if (!Relay.available) return
        Relay.scope.launch {
            runCatching {
                val (code, body) = Relay.request("GET", "/api/chat/rooms")
                if (code != 200) return@runCatching
                val arr = JSONObject(body).optJSONArray("rooms") ?: return@runCatching
                val me = clean(name(ctx))
                val found = (0 until arr.length()).map { arr.getJSONObject(it).optString("room") }
                    .filter { it.startsWith("dm:") && it.removePrefix("dm:").split("|").contains(me) }
                main.post { found.forEach { addChat(ctx, it) } }
            }
        }
    }

    fun name(ctx: Context): String =
        ctx.getSharedPreferences("room", Context.MODE_PRIVATE).getString("name", null)?.takeIf { it.isNotBlank() } ?: "Me"

    fun setName(ctx: Context, v: String) {
        ctx.getSharedPreferences("room", Context.MODE_PRIVATE).edit().putString("name", v.trim().take(32)).apply()
    }

    /** Start listening. Safe to call again while already running. */
    fun start() {
        if (job?.isActive == true || !Relay.available) return
        job = Relay.scope.launch {
            while (isActive) {
                try {
                    val rq = if (room.isEmpty()) "" else "&room=" + java.net.URLEncoder.encode(room, "UTF-8")
                    val q = if (last < 0) "?" + rq.drop(1) else "?after=$last&wait=20$rq"
                    val (code, body) = Relay.request("GET", "/api/chat$q", readTimeoutMs = 35_000)
                    if (code != 200) throw java.io.IOException("server answered $code")
                    val o = JSONObject(body)
                    val arr: JSONArray = o.optJSONArray("messages") ?: JSONArray()
                    val fresh = (0 until arr.length()).map { arr.getJSONObject(it) }
                        .map { RoomMsg(it.getLong("id"), it.optString("name"), it.optString("text"), it.optLong("at"), it.optString("room")) }
                        .distinctBy { it.id }
                    last = o.optLong("last", last)
                    main.post {
                        val add = fresh.filter { m -> m.room == room && messages.none { it.id == m.id } }
                        if (add.isNotEmpty()) messages.addAll(add)
                        while (messages.size > 200) messages.removeAt(0)
                        error = null
                    }
                } catch (e: Exception) {
                    if (!isActive) return@launch
                    main.post { error = "Can't reach the server" }
                    delay(5_000)
                }
            }
        }
    }

    fun stop() { job?.cancel(); job = null }

    /** Posts [text]; [done] gets an error message, or null on success. */
    fun send(name: String, text: String, done: (String?) -> Unit) {
        Relay.scope.launch {
            val err = try {
                val b = JSONObject().put("name", name).put("text", text).put("room", room).toString().toByteArray()
                val (code, _) = Relay.request("POST", "/api/chat", b, "application/json")
                if (code == 200) null else if (code == 429) "Slow down a little" else "Server answered $code"
            } catch (e: Exception) { "Can't reach the server" }
            if (err == null) start()
            main.post { done(err) }
        }
    }
}
