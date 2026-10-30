package be.syntaxya.lodica.engine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.setValue
import com.caverock.androidsvg.SVG
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/** One custom emoji. The 128px PNG lives in files/emojis/<name>.png. */
data class Emoji(val name: String, val at: Long)

/**
 * Custom emojis shared by every browser linked to the same Lodica server. They are stored locally, merged with the
 * server by name (newest write wins, deletes are tombstones), and shown in the Lodica keyboard's emoji tab.
 */
object Emojis {
    private const val SIZE = 256 // sharp when sent on to Snapchat and other apps; add() steps down when the server cap (96 KB) needs it
    private lateinit var app: Context
    private lateinit var dir: File
    private val meta get() = app.getSharedPreferences("emojis", Context.MODE_PRIVATE)
    /** Live, newest first. Compose reads this directly. */
    val list = mutableStateListOf<Emoji>()
    private var tombs = HashMap<String, Long>()

    fun init(ctx: Context) {
        if (::app.isInitialized) return
        app = ctx.applicationContext
        dir = File(app.filesDir, "emojis").apply { mkdirs() }
        scale = meta.getInt("scale", 150)
        load()
    }

    /** Chat emoji size in percent of the base size, same meaning as the desktop chatEmojiScale. */
    var scale by mutableIntStateOf(150)
        private set
    fun setScale(pct: Int) { scale = pct.coerceIn(50, 400); meta.edit().putInt("scale", scale).apply() }

    var keyboardPromptSeen: Boolean
        get() = meta.getBoolean("promptSeen", false)
        set(v) { meta.edit().putBoolean("promptSeen", v).apply() }

    private fun load() {
        val a = runCatching { JSONArray(meta.getString("list", "[]")) }.getOrDefault(JSONArray())
        val live = ArrayList<Emoji>(); tombs = HashMap()
        for (i in 0 until a.length()) {
            val o = a.optJSONObject(i) ?: continue
            val n = o.optString("name"); val at = o.optLong("at")
            if (o.optBoolean("del")) tombs[n] = at else if (file(n).exists()) live += Emoji(n, at)
        }
        list.clear(); list.addAll(live.sortedByDescending { it.at })
    }

    private fun save() {
        val a = JSONArray()
        list.forEach { a.put(JSONObject().put("name", it.name).put("at", it.at)) }
        tombs.forEach { (n, at) -> a.put(JSONObject().put("name", n).put("at", at).put("del", true)) }
        meta.edit().putString("list", a.toString()).apply()
    }

    fun file(name: String) = File(dir, "$name.png")

    fun cleanName(raw: String): String {
        val n = raw.lowercase().replace(Regex("[^a-z0-9_]+"), "_").trim('_').take(32)
        return n.ifEmpty { "emoji" }
    }

    /** First free name based on [raw]. */
    fun uniqueName(raw: String): String {
        val base = cleanName(raw).take(28)
        var n = base; var i = 2
        while (list.any { it.name == n }) n = base + "_" + i++
        return n
    }

    /**
     * Makes a plain background transparent: when the four corners are one opaque colour, every pixel of that colour
     * that touches the edge (flood fill) is cleared. Pictures that already have transparency are left alone.
     */
    fun removeBackground(src: Bitmap): Bitmap {
        val w = src.width; val h = src.height
        if (w < 4 || h < 4) return src
        val px = IntArray(w * h); src.getPixels(px, 0, w, 0, 0, w, h)
        val corners = intArrayOf(px[0], px[w - 1], px[(h - 1) * w], px[h * w - 1])
        if (corners.any { (it ushr 24) < 230 }) return src
        fun ch(c: Int, sh: Int) = (c shr sh) and 255
        val r0 = corners.sumOf { ch(it, 16) } / 4; val g0 = corners.sumOf { ch(it, 8) } / 4; val b0 = corners.sumOf { ch(it, 0) } / 4
        fun near(c: Int, tol: Int): Boolean {
            val dr = ch(c, 16) - r0; val dg = ch(c, 8) - g0; val db = ch(c, 0) - b0
            return dr * dr + dg * dg + db * db <= tol * tol
        }
        if (corners.any { !near(it, 40) }) return src
        val clear = BooleanArray(w * h); val q = IntArray(w * h); var head = 0; var tail = 0
        fun seed(i: Int) { if (!clear[i] && near(px[i], 48)) { clear[i] = true; q[tail++] = i } }
        for (x in 0 until w) { seed(x); seed((h - 1) * w + x) }
        for (y in 0 until h) { seed(y * w); seed(y * w + w - 1) }
        while (head < tail) {
            val i = q[head++]; val x = i % w; val y = i / w
            if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (y > 0) seed(i - w); if (y < h - 1) seed(i + w)
        }
        if (tail < w * h / 50 || tail > w * h * 95 / 100) return src   // nothing to remove, or it would eat the whole picture
        for (i in px.indices) if (clear[i]) px[i] = 0
        return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
    }

    /** Scales [src] to a centred 256px square PNG (smaller if the server cap needs it), stores it under [name] and syncs. Returns the final name. */
    fun add(name: String, original: Bitmap): String {
        val src = removeBackground(original)
        val n = uniqueName(name)
        val out = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
        val s = minOf(SIZE.toFloat() / src.width, SIZE.toFloat() / src.height)
        val w = (src.width * s).toInt().coerceAtLeast(1); val h = (src.height * s).toInt().coerceAtLeast(1)
        Canvas(out).drawBitmap(Bitmap.createScaledBitmap(src, w, h, true), ((SIZE - w) / 2).toFloat(), ((SIZE - h) / 2).toFloat(), null)
        var png = java.io.ByteArrayOutputStream().also { out.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
        var side = SIZE
        // The server keeps a PNG up to 96 KB (as base64): step the size down until it fits.
        while (png.size * 4 / 3 > 96 * 1024 && side > 64) {
            side = side * 3 / 4
            val small = Bitmap.createScaledBitmap(out, side, side, true)
            png = java.io.ByteArrayOutputStream().also { small.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
        }
        file(n).writeBytes(png)
        val at = System.currentTimeMillis()
        list.add(0, Emoji(n, at)); tombs.remove(n); save()
        push(n)
        return n
    }

    fun addFromBytes(name: String, bytes: ByteArray): String? {
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        return add(name, bmp)
    }

    fun svgToBitmap(svg: String): Bitmap {
        val s = SVG.getFromString(svg)
        val bmp = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
        s.setDocumentWidth(SIZE.toFloat()); s.setDocumentHeight(SIZE.toFloat())
        s.renderToCanvas(Canvas(bmp))
        return bmp
    }

    fun remove(name: String) {
        file(name).delete()
        list.removeAll { it.name == name }
        val at = System.currentTimeMillis()
        tombs[name] = at; save()
        if (!Relay.available) return
        Relay.scope.launch {
            runCatching { Relay.request("POST", "/api/emojis", JSONObject().put("name", name).put("del", true).put("at", at).toString().toByteArray(), "application/json") }
        }
    }

    private fun push(name: String) {
        if (!Relay.available) return
        val e = list.firstOrNull { it.name == name } ?: return
        val png = runCatching { Base64.encodeToString(file(name).readBytes(), Base64.NO_WRAP) }.getOrNull() ?: return
        Relay.scope.launch {
            runCatching { Relay.request("POST", "/api/emojis", JSONObject().put("name", name).put("png", png).put("at", e.at).toString().toByteArray(), "application/json") }
        }
    }

    /** Blocking. Pulls the server list and merges it, then uploads anything newer or missing there. Run off the main thread. */
    fun syncBlocking() {
        if (!::app.isInitialized || !Relay.available) return
        val (code, body) = Relay.request("GET", "/api/emojis", readTimeoutMs = 30_000)
        if (code != 200) return // server without the emoji endpoint, or offline: stay local
        val remote = runCatching { JSONArray(body) }.getOrNull() ?: return
        val seen = HashSet<String>()
        var changed = false
        for (i in 0 until remote.length()) {
            val o = remote.optJSONObject(i) ?: continue
            val n = o.optString("name"); val at = o.optLong("at")
            if (!Regex("[a-z0-9_]{1,32}").matches(n)) continue
            seen += n
            val local = list.firstOrNull { it.name == n }?.at ?: tombs[n] ?: -1L
            if (at <= local) continue
            changed = true
            if (o.optBoolean("del")) {
                file(n).delete(); list.removeAll { it.name == n }; tombs[n] = at
            } else {
                val bytes = runCatching { Base64.decode(o.optString("png"), Base64.DEFAULT) }.getOrNull() ?: continue
                if (BitmapFactory.decodeByteArray(bytes, 0, bytes.size) == null) continue
                file(n).writeBytes(bytes); tombs.remove(n)
                list.removeAll { it.name == n }; list.add(Emoji(n, at))
            }
        }
        for (e in list.toList()) {
            val r = (0 until remote.length()).firstNotNullOfOrNull { remote.optJSONObject(it)?.takeIf { x -> x.optString("name") == e.name } }
            if (r == null || r.optLong("at") < e.at) push(e.name)
        }
        for ((n, at) in tombs.toMap()) {
            val r = (0 until remote.length()).firstNotNullOfOrNull { remote.optJSONObject(it)?.takeIf { x -> x.optString("name") == n } }
            if (r != null && r.optLong("at") < at) Relay.request("POST", "/api/emojis", JSONObject().put("name", n).put("del", true).put("at", at).toString().toByteArray(), "application/json")
        }
        if (changed) {
            val sorted = list.sortedByDescending { it.at }
            list.clear(); list.addAll(sorted); save()
        }
    }

    fun syncNow() {
        if (!::app.isInitialized || !Relay.available) return
        Relay.scope.launch { runCatching { syncBlocking() } }
    }
}
