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
data class RoomMsg(val id: Long, val name: String, val text: String, val at: Long)

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
                    val q = if (last < 0) "" else "?after=$last&wait=20"
                    val (code, body) = Relay.request("GET", "/api/chat$q", readTimeoutMs = 35_000)
                    if (code != 200) throw java.io.IOException("server answered $code")
                    val o = JSONObject(body)
                    val arr: JSONArray = o.optJSONArray("messages") ?: JSONArray()
                    val fresh = (0 until arr.length()).map { arr.getJSONObject(it) }
                        .map { RoomMsg(it.getLong("id"), it.optString("name"), it.optString("text"), it.optLong("at")) }
                        .filter { m -> messages.none { it.id == m.id } }
                    if (fresh.isNotEmpty()) messages.addAll(fresh)
                    last = o.optLong("last", last)
                    while (messages.size > 200) messages.removeAt(0)
                    error = null
                } catch (e: Exception) {
                    if (!isActive) return@launch
                    error = "Can't reach the server"
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
                val b = JSONObject().put("name", name).put("text", text).toString().toByteArray()
                val (code, _) = Relay.request("POST", "/api/chat", b, "application/json")
                if (code == 200) null else if (code == 429) "Slow down a little" else "Server answered $code"
            } catch (e: Exception) { "Can't reach the server" }
            if (err == null) start()
            done(err)
        }
    }
}
