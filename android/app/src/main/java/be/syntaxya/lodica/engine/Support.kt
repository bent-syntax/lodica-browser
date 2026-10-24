package be.syntaxya.lodica.engine

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONObject

/**
 * Talks to the support desk through the relay. One ticket is the open conversation; the maintainer's
 * answers and questions arrive as notifications (see [Notifier]) and show up in the support dialog.
 */
object Support {
    data class Msg(val fromUser: Boolean, val text: String)

    var messages by mutableStateOf<List<Msg>>(emptyList())
        private set
    var status by mutableStateOf("")
        private set

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("support", Context.MODE_PRIVATE)

    fun ticketId(ctx: Context): String? = prefs(ctx).getString("ticket", null)

    /** Sends [text] as a new ticket, or as a reply when a ticket is open. Returns an error message, or null on success. */
    fun send(ctx: Context, text: String): String? {
        Relay.init(ctx)
        if (!Relay.available) return "No relay is set up. Pair this browser with your server first."
        val id = ticketId(ctx)?.takeIf { status != "closed" }
        val body = JSONObject().put("text", text)
        val path = if (id == null) {
            val v = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: ""
            body.put("name", Room.name(ctx)).put("app", "android").put("version", v)
                .put("platform", "Android " + android.os.Build.VERSION.RELEASE + " " + android.os.Build.MODEL)
            "/api/support"
        } else "/api/support/$id"
        val (code, resp) = try {
            Relay.request("POST", path, body.toString().toByteArray(), "application/json")
        } catch (e: java.io.IOException) {
            return "Can't reach the server. Try again later."
        }
        if (code == 404 && id != null) { prefs(ctx).edit().remove("ticket").apply(); messages = emptyList(); return send(ctx, text) }
        if (code != 200) return resp.ifBlank { "Support refused the message ($code)" }
        apply(ctx, JSONObject(resp), notifyTeam = false)
        if (id == null) Notifier.supportSent(ctx)
        return null
    }

    /** Fetches the open ticket and notifies about new answers from the team. */
    fun refresh(ctx: Context, notify: Boolean) {
        val id = ticketId(ctx) ?: return
        Relay.init(ctx)
        if (!Relay.available) return
        val (code, resp) = Relay.request("GET", "/api/support/" + Uri.encode(id))
        if (code == 404) { prefs(ctx).edit().remove("ticket").remove("seen").apply(); return }
        if (code != 200) return
        apply(ctx, JSONObject(resp), notifyTeam = notify)
    }

    private fun apply(ctx: Context, t: JSONObject, notifyTeam: Boolean) {
        val arr = t.optJSONArray("messages")
        val list = (0 until (arr?.length() ?: 0)).map { val m = arr!!.getJSONObject(it); Msg(m.optString("from") == "user", m.optString("text")) }
        val p = prefs(ctx)
        val seen = p.getInt("seen", 0)
        val st = t.optString("status")
        p.edit().putString("ticket", t.optString("id")).putInt("seen", list.size).apply()
        if (notifyTeam && list.size > seen) {
            val fresh = list.drop(seen).filter { !it.fromUser }
            if (fresh.isNotEmpty()) Notifier.supportReply(ctx, fresh.last().text, st)
        }
        messages = list
        status = st
    }

    /** Called when the dialog opens: shows what is stored and marks everything as read. */
    fun open(ctx: Context) {
        runCatching { refresh(ctx, notify = false) }
    }
}
