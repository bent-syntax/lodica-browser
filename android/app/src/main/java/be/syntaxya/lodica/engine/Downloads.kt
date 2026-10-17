package be.syntaxya.lodica.engine

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.compose.runtime.mutableStateListOf
import org.json.JSONArray
import org.json.JSONObject
import android.webkit.MimeTypeMap
import android.widget.Toast
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoWebExecutor
import org.mozilla.geckoview.WebRequest
import org.mozilla.geckoview.WebResponse
import java.io.File
import java.io.InputStream
import java.util.concurrent.Executors

/** One download shown on the Downloads screen. [uri] is where the finished file can be opened from. */
data class Dl(
    val id: Long, val name: String, val mime: String, val total: Long, val received: Long,
    val status: Int, val at: Long, val uri: String? = null,
) {
    companion object { const val ACTIVE = 0; const val DONE = 1; const val FAILED = 2 }
}

/** Writes downloads to the public Downloads folder. */
object Downloads {
    /** Newest first. Only touched on the main thread. */
    val items = mutableStateListOf<Dl>()
    private var loaded = false
    private var nextId = System.currentTimeMillis()

    private fun sp(ctx: Context) = ctx.getSharedPreferences("downloads", Context.MODE_PRIVATE)

    /** Reads the saved list once. Downloads that were still running when the app died are marked failed. */
    fun load(ctx: Context) {
        if (loaded) return
        loaded = true
        val arr = runCatching { JSONArray(sp(ctx).getString("list", "[]")) }.getOrDefault(JSONArray())
        val list = (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val o = arr.getJSONObject(i)
                Dl(o.getLong("id"), o.getString("name"), o.optString("mime"), o.optLong("total", -1), o.optLong("received"),
                    o.optInt("status"), o.optLong("at"), o.optString("uri").ifEmpty { null })
            }.getOrNull()
        }.map { if (it.status == Dl.ACTIVE) it.copy(status = Dl.FAILED) else it }
        items.addAll(list)
    }

    private fun persist(ctx: Context) {
        val arr = JSONArray()
        items.filter { it.status != Dl.ACTIVE }.take(100).forEach {
            arr.put(JSONObject().put("id", it.id).put("name", it.name).put("mime", it.mime).put("total", it.total)
                .put("received", it.received).put("status", it.status).put("at", it.at).put("uri", it.uri ?: ""))
        }
        sp(ctx).edit().putString("list", arr.toString()).apply()
    }

    private fun update(ctx: Context, id: Long, f: (Dl) -> Dl) = main.post {
        val i = items.indexOfFirst { it.id == id }
        if (i >= 0) { items[i] = f(items[i]); if (items[i].status != Dl.ACTIVE) persist(ctx) }
    }

    fun remove(ctx: Context, d: Dl) { items.remove(d); persist(ctx) }

    fun clearFinished(ctx: Context) { items.removeAll { it.status != Dl.ACTIVE }; persist(ctx) }

    /** Opens a finished download with whatever app handles its type. */
    fun open(ctx: Context, d: Dl) {
        val raw = d.uri ?: run { toast(ctx, "File location unknown"); return }
        var uri = Uri.parse(raw)
        if (uri.scheme == "file") {
            // Android 8 and 9: file:// links cannot be shared, so look up the MediaStore entry for the path.
            val found = runCatching {
                ctx.contentResolver.query(MediaStore.Files.getContentUri("external"), arrayOf(MediaStore.Files.FileColumns._ID),
                    MediaStore.Files.FileColumns.DATA + "=?", arrayOf(uri.path), null)?.use {
                    if (it.moveToFirst()) android.content.ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), it.getLong(0)) else null
                }
            }.getOrNull()
            if (found == null) { toast(ctx, "Find the file in your Files app, Downloads folder"); return }
            uri = found
        }
        val intent = android.content.Intent(android.content.Intent.ACTION_VIEW)
            .setDataAndType(uri, d.mime.ifBlank { "*/*" })
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching { ctx.startActivity(intent) }.onFailure { toast(ctx, "No app can open this file") }
    }

    private val io = Executors.newFixedThreadPool(2) { r -> Thread(r, "lodica-download") }
    private val main = Handler(Looper.getMainLooper())

    private fun header(r: WebResponse, name: String): String? =
        r.headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value

    private val generic = setOf("application/octet-stream", "binary/octet-stream", "application/force-download", "application/download")

    private fun ext(name: String) = name.substringAfterLast('.', "").lowercase()

    private val dispStar = Regex("filename\\*\\s*=\\s*([^']*)'[^']*'([^;]+)", RegexOption.IGNORE_CASE)
    private val dispPlain = Regex("filename\\s*=\\s*(\"([^\"]*)\"|[^;]+)", RegexOption.IGNORE_CASE)
    private val badChars = Regex("[\\u0000-\\u001f:*?\"<>|]")

    /** Real file name: Content-Disposition first, then the URL path, then a mime-based extension, `.bin` last. */
    internal fun fileName(url: String, disposition: String?, type: String?): String {
        var name: String? = disposition?.let { d ->
            dispStar.find(d)?.let {
                runCatching {
                    java.net.URLDecoder.decode(it.groupValues[2].trim().trim('"').replace("+", "%2B"), it.groupValues[1].ifBlank { "UTF-8" })
                }.getOrNull()
            } ?: dispPlain.find(d)?.let { (it.groups[2]?.value ?: it.groupValues[1]).trim() }
        }
        val last = runCatching { Uri.parse(url).lastPathSegment }.getOrNull()
        if (name.isNullOrBlank()) name = last?.takeIf { ext(it).isNotEmpty() }
        name = name?.substringAfterLast('/')?.substringAfterLast('\\')?.replace(badChars, "_")?.trim()?.trim('.')
        if (name.isNullOrBlank()) name = last?.replace(badChars, "_")?.takeIf { it.isNotBlank() } ?: "download"
        if (ext(name).isEmpty()) {
            val e = type?.lowercase()?.takeIf { it !in generic }?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
            name = "$name.${e ?: "bin"}"
        }
        return name
    }

    /** Called for responses Gecko cannot render (attachments, apks, archives). */
    fun save(ctx: Context, response: WebResponse, private: Boolean = false) {
        val body = response.body ?: return
        val type = header(response, "Content-Type")?.substringBefore(';')?.trim()
        val name = fileName(response.uri, header(response, "Content-Disposition"), type)
        val ranges = header(response, "Accept-Ranges")?.contains("bytes", ignoreCase = true) == true
        val app = ctx.applicationContext
        val total = header(response, "Content-Length")?.trim()?.toLongOrNull() ?: -1L
        write(app, name, type, total, body, if (ranges) Resume(Engine.runtime(app), response.uri, private) else null)
    }

    /** What is needed to ask the server for the rest of a file after the connection drops. */
    private class Resume(val runtime: GeckoRuntime, val url: String, val private: Boolean)

    /** Re-requests [r.url] from byte [from]; null unless the server answers 206 with that exact offset. */
    private fun reopen(r: Resume, from: Long): InputStream? = runCatching {
        val req = WebRequest.Builder(r.url).addHeader("Range", "bytes=$from-").build()
        val flags = if (r.private) GeckoWebExecutor.FETCH_FLAGS_PRIVATE else GeckoWebExecutor.FETCH_FLAGS_NONE
        val res = GeckoWebExecutor(r.runtime).fetch(req, flags).poll(30_000) ?: return null
        val start = header(res, "Content-Range")?.substringAfter("bytes ")?.substringBefore('-')?.trim()?.toLongOrNull()
        if (res.statusCode == 206 && start == from) res.body else { res.body?.close(); null }
    }.getOrNull()

    /** Copies [first] into [out]; when the stream breaks, resumes with Range requests up to 5 times. */
    private fun copy(first: InputStream, out: java.io.OutputStream, resume: Resume?, progress: (Long) -> Unit = {}) {
        var input = first
        var done = 0L
        var tries = 0
        val buf = ByteArray(64 * 1024)
        var lastTick = 0L
        while (true) {
            try {
                input.use {
                    while (true) {
                        val n = it.read(buf)
                        if (n < 0) return
                        out.write(buf, 0, n)
                        done += n
                        tries = 0
                        val now = System.currentTimeMillis()
                        if (now - lastTick > 400) { lastTick = now; progress(done) }
                    }
                }
            } catch (e: java.io.IOException) {
                if (resume == null || ++tries > 5) throw e
                Thread.sleep(1000L * tries)
                input = reopen(resume, done) ?: throw e
            }
        }
    }

    /** Fetch through Gecko's network stack so cookies and proxy settings apply. */
    fun fetch(ctx: Context, runtime: GeckoRuntime, url: String, private: Boolean = false) {
        val app = ctx.applicationContext
        val req = WebRequest.Builder(url).build()
        val flags = if (private) GeckoWebExecutor.FETCH_FLAGS_PRIVATE else GeckoWebExecutor.FETCH_FLAGS_NONE
        GeckoWebExecutor(runtime).fetch(req, flags).accept(
            { r -> if (r != null) save(app, r, private) },
            { toast(app, "Download failed") },
        )
    }

    private fun write(ctx: Context, name: String, type: String?, total: Long, body: InputStream, resume: Resume?) {
        toast(ctx, "Downloading $name")
        val id = synchronized(this) { nextId++ }
        val mimeGuess = type?.takeIf { it.lowercase() !in generic }
            ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext(name)) ?: "application/octet-stream"
        main.post { load(ctx); items.add(0, Dl(id, name, mimeGuess, total, 0, Dl.ACTIVE, System.currentTimeMillis())) }
        val tick: (Long) -> Unit = { n -> update(ctx, id) { it.copy(received = n) } }
        var savedUri: String? = null
        io.execute {
            val ok = runCatching {
                body.use { input ->
                    if (Build.VERSION.SDK_INT >= 29) {
                        // A generic type makes MediaStore tack ".bin" on, so prefer the type implied by the extension.
                        val byExt = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext(name))
                        val mime = if (type == null || type.lowercase() in generic) byExt ?: "application/octet-stream" else type
                        val cv = ContentValues().apply {
                            put(MediaStore.Downloads.DISPLAY_NAME, name)
                            put(MediaStore.Downloads.MIME_TYPE, mime)
                            put(MediaStore.Downloads.IS_PENDING, 1)
                        }
                        val resolver = ctx.contentResolver
                        val uri: Uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)
                            ?: error("insert failed")
                        resolver.openOutputStream(uri)!!.use { copy(input, it, resume, tick) }
                        resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
                        savedUri = uri.toString()
                    } else {
                        @Suppress("DEPRECATION")
                        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                        dir.mkdirs()
                        val f = File(dir, name)
                        f.outputStream().use { copy(input, it, resume, tick) }
                        savedUri = Uri.fromFile(f).toString()
                    }
                }
            }.isSuccess
            update(ctx, id) { it.copy(status = if (ok) Dl.DONE else Dl.FAILED, uri = savedUri, received = if (ok && it.total > 0) it.total else it.received) }
            toast(ctx, if (ok) "Saved $name to Downloads" else "Download failed")
        }
    }

    private fun toast(ctx: Context, msg: String) = main.post { Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show() }
}
