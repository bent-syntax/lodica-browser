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
data class RoomMsg(
    val id: Long, val name: String, val text: String, val at: Long, val room: String = "",
    val fileId: String? = null, val fileName: String = "", val fileSize: Long = 0, val fileType: String = "",
)

/**
 * Same-server chat: everyone linked to the same server shares one room, kept in the relay's memory
 * (last 200 messages, 24 h, not end-to-end encrypted). New messages arrive by long polling, so they
 * show up within a moment while the chat screen is open.
 */
private fun RoomMsg.withFile(f: JSONObject?) =
    if (f == null) this else copy(fileId = f.optString("id").takeIf { it.matches(Regex("[0-9a-f]{24}")) }, fileName = f.optString("name"), fileSize = f.optLong("size"), fileType = f.optString("type"))

object Room {
    const val MAX_FILE = 5L * 1024 * 1024 * 1024
    /** Upload progress 0-100 while a file is going out, else null. */
    var uploading by mutableStateOf<Int?>(null); private set
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
        return "dm:" + listOf(a, b).sortedWith(compareBy<String>({ it.lowercase() }, { it })).joinToString("|")
    }

    fun group(name: String) = "grp:" + name.replace(Regex("[^\\w .-]"), "").trim().take(32)

    private fun clean(n: String) = n.replace(CLEAN, "_").take(32).ifEmpty { "_" }
    // Must match desktop room.js and the relay's room pattern.
    private val CLEAN = Regex("[\\s|\\p{Cntrl}\\u00a0\\u2000-\\u200f\\u2028\\u2029\\ufeff]")

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
    /** Device names seen on this server (including this one), newest first. Filled by [loadUsers]. */
    val users = mutableStateListOf<String>()

    /** Registers this device by name and fetches the list of names to pick a private chat from. */
    fun loadUsers(ctx: Context) {
        if (!Relay.available) return
        Relay.scope.launch {
            runCatching {
                settleName(ctx)
                val me = name(ctx)
                val (code, body) = Relay.request("GET", "/api/chat/users?name=" + java.net.URLEncoder.encode(me, "UTF-8"))
                if (code != 200) return@runCatching
                val arr = JSONObject(body).optJSONArray("users") ?: return@runCatching
                val names = (0 until arr.length()).map { arr.getJSONObject(it).optString("name") }
                    .filter { it.isNotBlank() && clean(it) != clean(me) }
                main.post { users.clear(); users.addAll(names) }
            }
        }
    }

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

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("room", Context.MODE_PRIVATE)

    /** The device's own name (Settings > About phone), used until the user picks a chat name. */
    fun deviceName(ctx: Context): String {
        val g = runCatching { android.provider.Settings.Global.getString(ctx.contentResolver, "device_name") }.getOrNull()
        return (g?.takeIf { it.isNotBlank() } ?: android.os.Build.MODEL ?: "Me").replace("|", " ").trim().take(32).ifBlank { "Me" }
    }

    fun name(ctx: Context): String = prefs(ctx).getString("name", null)?.takeIf { it.isNotBlank() } ?: deviceName(ctx)

    fun hasName(ctx: Context): Boolean = prefs(ctx).getString("name", null)?.isNotBlank() == true

    fun setName(ctx: Context, v: String) {
        val old = name(ctx)
        val sp = prefs(ctx)
        val past = sp.getStringSet("pastNames", emptySet())!!.toMutableSet().apply { add(old) }
        sp.edit().putString("name", v.trim().take(32)).putStringSet("pastNames", past.toList().takeLast(20).toSet()).apply()
    }

    /** True for the current name and any earlier name of this device, so old bubbles stay on the own side. */
    fun isMine(ctx: Context, n: String): Boolean = n == name(ctx) || n in prefs(ctx).getStringSet("pastNames", emptySet())!!

    private fun deviceId(ctx: Context): String {
        val sp = prefs(ctx)
        return sp.getString("deviceId", null) ?: java.util.UUID.randomUUID().toString().replace("-", "")
            .also { sp.edit().putString("deviceId", it).apply() }
    }

    /** Asks the server to reserve [n] for this device. False only when another device holds it; old servers and errors count as free. */
    private fun claim(ctx: Context, n: String): Boolean = runCatching {
        val q = "name=" + java.net.URLEncoder.encode(n, "UTF-8") + "&id=" + deviceId(ctx)
        Relay.request("GET", "/api/chat/claim?$q").first != 409
    }.getOrDefault(true)

    /** Saves [v] as the chat name if no other device uses it. Calls [done] on the main thread with the name now in effect and whether [v] was refused. */
    fun changeName(ctx: Context, v: String, done: (String, Boolean) -> Unit) {
        val want = v.trim().take(32)
        if (want.isBlank() || !Relay.available) { if (want.isNotBlank()) setName(ctx, want); main.post { done(name(ctx), false) }; return }
        Relay.scope.launch {
            val ok = claim(ctx, want)
            if (ok) setName(ctx, want)
            main.post { done(name(ctx), !ok) }
        }
    }

    private var settled = false

    /** Once per launch: if another device already has this name, add -2, -3 ... so names stay unique. */
    private fun settleName(ctx: Context) {
        if (settled) return
        val base = name(ctx)
        var n = base
        var i = 2
        while (!claim(ctx, n) && i <= 20) { n = "${base.take(28)}-$i"; i++ }
        settled = true
        if (n != base) setName(ctx, n)
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
                        .map { RoomMsg(it.getLong("id"), it.optString("name"), it.optString("text"), it.optLong("at"), it.optString("room")).withFile(it.optJSONObject("file")) }
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

    /** Messages the server could not take yet (down or unreachable). Saved to disk, sent in order once it answers. */
    val pending = mutableStateListOf<RoomMsg>()
    private var outboxLoaded = false
    private var seq = 0L
    private var flushJob: Job? = null
    private const val MAX_OUTBOX = 200

    private fun loadOutbox(ctx: Context) {
        if (outboxLoaded) return
        outboxLoaded = true
        runCatching {
            val a = JSONArray(rp(ctx).getString("outbox", "[]"))
            for (i in 0 until a.length()) { val o = a.getJSONObject(i); pending.add(RoomMsg(-(++seq), o.getString("name"), o.getString("text"), o.optLong("at"), o.optString("room"))) }
        }
    }

    private fun saveOutbox(ctx: Context) {
        val a = JSONArray()
        for (m in pending) a.put(JSONObject().put("name", m.name).put("text", m.text).put("at", m.at).put("room", m.room))
        rp(ctx).edit().putString("outbox", a.toString()).apply()
    }

    /** Sends any messages left from earlier; call when the app or the chat service starts. */
    fun resumeOutbox(ctx: Context) {
        val app = ctx.applicationContext
        main.post { loadOutbox(app); flush(app) }
    }

    /** 0 = sent, 1 = retry later, 2 = refused for good. */
    private fun post(m: RoomMsg): Pair<Int, String?> = try {
        val b = JSONObject().put("name", m.name).put("text", m.text).put("room", m.room).toString().toByteArray()
        val (code, _) = Relay.request("POST", "/api/chat", b, "application/json")
        when {
            code == 200 -> 0 to null
            code == 429 -> 1 to "Slow down a little"
            code >= 500 || code == 408 -> 1 to "Server answered $code"
            code == 400 -> 2 to "Message not sent: this chat name is not valid"
            else -> 2 to "Server answered $code"
        }
    } catch (e: Exception) { 1 to "Can't reach the server" }

    private fun flush(ctx: Context) {
        if (flushJob?.isActive == true || pending.isEmpty()) return
        flushJob = Relay.scope.launch {
            while (pending.isNotEmpty()) {
                val m = pending.firstOrNull() ?: break
                val (res, _) = post(m)
                if (res == 1) { delay(5_000); continue }
                main.post { pending.remove(m); saveOutbox(ctx) }
                delay(50)
            }
            main.post { start() }
        }
    }

    /** Posts [text]; [done] gets an error message, or null on success or when it was queued for later. */
    fun send(ctx: Context, name: String, text: String, done: (String?) -> Unit) {
        val app = ctx.applicationContext
        val m = RoomMsg(-(++seq), name, text, System.currentTimeMillis(), room)
        loadOutbox(app)
        if (pending.isNotEmpty()) {
            if (pending.size >= MAX_OUTBOX) { done("Too many unsent messages"); return }
            pending.add(m); saveOutbox(app); flush(app); done(null); return
        }
        Relay.scope.launch {
            val (res, err) = post(m)
            main.post {
                when (res) {
                    0 -> { start(); done(null) }
                    1 -> { pending.add(m); saveOutbox(app); flush(app); done(null) }
                    else -> done(err)
                }
            }
        }
    }

    /** Streams [uri] (at most 5 GB) to the current chat. [done] gets an error message or null. */
    fun upload(ctx: Context, uri: android.net.Uri, name: String, done: (String?) -> Unit) {
        val app = ctx.applicationContext
        val from = name(app); val r = room
        Relay.scope.launch {
            val err = try {
                val cr = app.contentResolver
                var fname = "file"; var size = -1L
                cr.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME, android.provider.OpenableColumns.SIZE), null, null, null)?.use {
                    if (it.moveToFirst()) {
                        it.getString(0)?.let { n -> fname = n }
                        if (!it.isNull(1)) size = it.getLong(1)
                    }
                }
                if (size <= 0) size = cr.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
                when {
                    size == 0L -> "Can't read that file"
                    size < 0 -> "Can't read that file"
                    size > MAX_FILE -> "File is larger than 5 GB"
                    else -> {
                        main.post { uploading = 0 }
                        val q = "?name=" + java.net.URLEncoder.encode(fname, "UTF-8") + "&from=" + java.net.URLEncoder.encode(from, "UTF-8") +
                            if (r.isEmpty()) "" else "&room=" + java.net.URLEncoder.encode(r, "UTF-8")
                        val input = cr.openInputStream(uri)
                        if (input == null) "Can't read that file" else {
                            val (code, _) = input.use { Relay.uploadStream("/api/chat/file$q", it, size) { p -> main.post { uploading = p } } }
                            when (code) {
                                200 -> null
                                415 -> "This file type is not allowed"
                                413 -> "File is larger than 5 GB"
                                507 -> "The chat file store is full, try later"
                                429 -> "Slow down a little"
                                else -> "Server answered $code"
                            }
                        }
                    }
                }
            } catch (e: Exception) { "Can't reach the server" }
            main.post { uploading = null; done(err) }
            if (err == null) start()
        }
    }

    /** Runs blocking [block] on the relay's background scope; Compose state may be written from there. */
    fun scopeIo(block: () -> Unit) { Relay.scope.launch { runCatching(block) } }

    /** Streams an attachment into [out] (blocking; call off the main thread). True on success. */
    fun saveFile(id: String, out: java.io.OutputStream): Boolean {
        if (!id.matches(Regex("[0-9a-f]{24}"))) return false
        return runCatching { Relay.downloadTo("/api/chat/file/$id?dl=1", out) == 200 }.getOrDefault(false)
    }

    /** Downloads an image attachment for the preview (blocking; call off the main thread). Null on failure. */
    fun fetchFile(id: String): ByteArray? {
        if (!id.matches(Regex("[0-9a-f]{24}"))) return null
        val (code, bytes) = Relay.requestBytes("GET", "/api/chat/file/$id", readTimeoutMs = 60_000)
        return if (code == 200) bytes else null
    }
}
