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
    data class Msg(val fromUser: Boolean, val text: String, val images: Int = 0)

    var messages by mutableStateOf<List<Msg>>(emptyList())
        private set
    var status by mutableStateOf("")
        private set

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("support", Context.MODE_PRIVATE)

    fun ticketId(ctx: Context): String? = prefs(ctx).getString("ticket", null)

    /** The email linked to support, or "" when none. Linked: mail from it counts as a request, and updates also go there. */
    fun linkedEmail(ctx: Context): String = prefs(ctx).run { if (getString("link", null) != null) getString("email", "") ?: "" else "" }

    private fun linkCall(ctx: Context, step: String, body: JSONObject): Pair<JSONObject?, String?> {
        Relay.init(ctx)
        if (!Relay.available) return null to "No relay is set up. Pair this browser with your server first."
        val (code, resp) = try {
            Relay.request("POST", "/api/support/link/$step", body.toString().toByteArray(), "application/json", readTimeoutMs = 25_000)
        } catch (e: java.io.IOException) {
            return null to "Can't reach the server. Try again later."
        }
        val j = runCatching { JSONObject(resp) }.getOrNull()
        return if (code == 200) (j ?: JSONObject()) to null else null to (j?.optString("error")?.ifBlank { null } ?: resp.ifBlank { "Support refused it ($code)" })
    }

    /** Asks support to mail a code to [email]. Returns an error message, or null when the code is on its way. */
    fun linkStart(ctx: Context, email: String): String? = linkCall(ctx, "start", JSONObject().put("email", email.trim())).second

    /** Checks the mailed [code] and stores the link. Returns an error message, or null on success. */
    fun linkVerify(ctx: Context, email: String, code: String): String? {
        val (j, err) = linkCall(ctx, "verify", JSONObject().put("email", email.trim()).put("code", code.trim()))
        if (err != null) return err
        val link = j!!.optString("link")
        if (!Regex("^[0-9a-f]{64}$").matches(link)) return "Support sent an odd answer. Try again."
        prefs(ctx).edit().putString("link", link).putString("email", j.optString("email").ifBlank { email.trim() }).apply()
        return null
    }

    fun unlink(ctx: Context) {
        prefs(ctx).getString("link", null)?.let { runCatching { linkCall(ctx, "remove", JSONObject().put("link", it)) } }
        prefs(ctx).edit().remove("link").remove("email").apply()
    }

    /** Sends [text] as a new ticket, or as a reply when a ticket is open. Returns an error message, or null on success. */
    fun send(ctx: Context, text: String, images: List<Uri> = emptyList(), resolved: Boolean = false): String? {
        Relay.init(ctx)
        if (!Relay.available) return "No relay is set up. Pair this browser with your server first."
        val id = ticketId(ctx)?.takeIf { status != "closed" && status != "done" }
        if (prefs(ctx).getString("link", null) == null) return "Link your email first."
        val body = JSONObject().put("text", text)
        if (images.isNotEmpty()) body.put("images", org.json.JSONArray(images.mapNotNull { encode(ctx, it) }))
        if (resolved && id != null) body.put("resolved", true)
        prefs(ctx).getString("link", null)?.let { body.put("link", it) }   // every message, so the desk can mail the answer
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
        if (code == 404 && id != null) { prefs(ctx).edit().remove("ticket").apply(); messages = emptyList(); return send(ctx, text, images, resolved) }
        if (code != 200) return resp.ifBlank { "Support refused the message ($code)" }
        apply(ctx, JSONObject(resp), notifyTeam = false)
        Notifier.supportSent(ctx)
        SupportPush.register(ctx)
        return null
    }

    /** Shrinks a picked image to a JPEG the relay accepts (longest side 1280 px, under 700 KB). */
    private fun encode(ctx: Context, uri: Uri): String? = runCatching {
        val bmp = ctx.contentResolver.openInputStream(uri)!!.use { android.graphics.BitmapFactory.decodeStream(it) } ?: return null
        val k = 1280f / maxOf(bmp.width, bmp.height)
        val b = if (k < 1f) android.graphics.Bitmap.createScaledBitmap(bmp, (bmp.width * k).toInt(), (bmp.height * k).toInt(), true) else bmp
        var q = 85
        var out: ByteArray
        do {
            val o = java.io.ByteArrayOutputStream(); b.compress(android.graphics.Bitmap.CompressFormat.JPEG, q, o); out = o.toByteArray(); q -= 15
        } while (out.size > 650_000 && q > 20)
        android.util.Base64.encodeToString(out, android.util.Base64.NO_WRAP)
    }.getOrNull()

    /** Fetches the open ticket and notifies about new answers from the team. */
    fun refresh(ctx: Context, notify: Boolean) {
        val id = ticketId(ctx) ?: return
        Relay.init(ctx)
        if (!Relay.available) return
        SupportPush.register(ctx)
        val (code, resp) = Relay.request("GET", "/api/support/" + Uri.encode(id))
        if (code == 404) { prefs(ctx).edit().remove("ticket").remove("seen").apply(); return }
        if (code != 200) return
        apply(ctx, JSONObject(resp), notifyTeam = notify)
    }

    private fun apply(ctx: Context, t: JSONObject, notifyTeam: Boolean) {
        val arr = t.optJSONArray("messages")
        val list = (0 until (arr?.length() ?: 0)).map { val m = arr!!.getJSONObject(it); Msg(m.optString("from") == "user", m.optString("text"), m.optJSONArray("images")?.length() ?: 0) }
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
