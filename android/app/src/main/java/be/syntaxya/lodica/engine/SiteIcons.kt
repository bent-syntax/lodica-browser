package be.syntaxya.lodica.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import be.syntaxya.lodica.tabs.TabManager
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Site icons for start page shortcuts and the tab switcher. Many sites declare their real icon with
 * `<link rel=icon>` and have no working `/favicon.ico`, so this tries, in order: the icons an open tab
 * on the host already reported, the icons the home page declares, then `/favicon.ico`.
 * A good icon is kept per host for the session and is never replaced by a failed fetch.
 */
object SiteIcons {
    private const val PX = 96
    private const val MAX_BYTES = 1 shl 20
    private val cache = HashMap<String, ImageBitmap>()
    private val failed = HashMap<String, Long>()

    private val dark = HashSet<String>()

    /** True when the logo's visible pixels are mostly dark, so the tile should be light to keep it readable. */
    fun isDark(host: String): Boolean = synchronized(cache) { key(host) in dark }

    private fun mostlyDark(b: Bitmap): Boolean {
        val w = b.width; val h = b.height
        var sum = 0.0; var n = 0
        for (y in 0 until h step 2) for (x in 0 until w step 2) {
            val c = b.getPixel(x, y)
            if ((c ushr 24) < 128) continue
            sum += (0.299 * ((c shr 16) and 255) + 0.587 * ((c shr 8) and 255) + 0.114 * (c and 255)) / 255.0
            n++
        }
        return n > 0 && sum / n < 0.3
    }

    fun cached(host: String): ImageBitmap? = synchronized(cache) { cache[key(host)] }

    /** Blocking: call off the main thread. */
    fun load(host: String, http: Boolean = false): ImageBitmap? {
        val h = key(host)
        if (h.isEmpty()) return null
        cached(h)?.let { return it }
        synchronized(cache) { failed[h]?.let { if (System.currentTimeMillis() - it < 2 * 60_000) return null } }
        val origin = (if (http) "http://" else "https://") + host.lowercase()
        val fromTabs = runCatching {
            TabManager.tabs.toList().filter { key(it.host) == h && !it.private }.flatMap { it.icons }
        }.getOrDefault(emptyList())
        val cands = (fromTabs + declared(origin) + "$origin/favicon.ico").distinct().take(8)
        for (u in cands) {
            val bmp = runCatching { fetch(URL(u)) }.getOrNull() ?: continue
            val cleared = clearBackground(bmp)
            val img = cleared.asImageBitmap()
            synchronized(cache) { cache[h] = img; failed.remove(h); if (mostlyDark(cleared)) dark.add(h) else dark.remove(h) }
            return img
        }
        synchronized(cache) { failed[h] = System.currentTimeMillis() }
        return null
    }

    /** Makes the flat background colour around a logo transparent: flood fill from the edges over pixels close to the corner colour. Leaves logos that fill the whole square (no uniform border) alone. */
    internal fun clearBackground(src: Bitmap): Bitmap {
        val w = src.width; val h = src.height
        if (w < 8 || h < 8) return src
        val px = IntArray(w * h)
        src.getPixels(px, 0, w, 0, 0, w, h)
        fun dist(a: Int, b: Int): Int {
            val da = (a ushr 24) - (b ushr 24); val dr = ((a shr 16) and 255) - ((b shr 16) and 255)
            val dg = ((a shr 8) and 255) - ((b shr 8) and 255); val db = (a and 255) - (b and 255)
            return maxOf(maxOf(Math.abs(da), Math.abs(dr)), maxOf(Math.abs(dg), Math.abs(db)))
        }
        val corners = intArrayOf(px[0], px[w - 1], px[(h - 1) * w], px[h * w - 1])
        val ref = corners.firstOrNull { (it ushr 24) >= 200 } ?: return src
        if (corners.count { dist(it, ref) <= 24 } < 3) return src
        val seen = BooleanArray(w * h)
        val stack = IntArray(w * h); var sp = 0
        fun push(x: Int, y: Int) { val i = y * w + x; if (!seen[i] && dist(px[i], ref) <= 40) { seen[i] = true; stack[sp++] = i } }
        for (x in 0 until w) { push(x, 0); push(x, h - 1) }
        for (y in 0 until h) { push(0, y); push(w - 1, y) }
        var cleared = 0
        while (sp > 0) {
            val i = stack[--sp]; px[i] = 0; cleared++
            val x = i % w; val y = i / w
            if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y)
            if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1)
        }
        if (cleared == 0 || cleared > w * h * 9 / 10) return src
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        out.setPixels(px, 0, w, 0, 0, w, h)
        return out
    }

    /** Opens [u] and follows up to 4 redirects, including http to https and a changed host, which HttpURLConnection will not do. */
    private fun open(u: URL): HttpURLConnection {
        var cur = u
        repeat(5) {
            val c = cur.openConnection() as HttpURLConnection
            c.connectTimeout = 4000; c.readTimeout = 4000; c.instanceFollowRedirects = false
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Android 14; Mobile) Lodica")
            val code = c.responseCode
            val loc = c.getHeaderField("Location")
            if (code in 300..399 && loc != null) {
                c.disconnect()
                cur = URL(cur, loc)
                if (cur.protocol != "https" && cur.protocol != "http") throw java.io.IOException("redirect")
                return@repeat
            }
            return c
        }
        throw java.io.IOException("too many redirects")
    }

    private fun key(host: String) = host.lowercase().removePrefix("www.")

    /** `<link rel="icon">` and apple-touch-icon hrefs from the home page, plain icons first. */
    private fun declared(origin: String): List<String> = runCatching {
        val c = open(URL("$origin/"))
        try {
            if (c.responseCode != 200 || !c.contentType.orEmpty().contains("html")) return emptyList()
            val html = c.inputStream.bufferedReader().use { r -> val b = CharArray(256 * 1024); var n = 0
                while (n < b.size) { val k = r.read(b, n, b.size - n); if (k < 0) break; n += k }
                String(b, 0, n) }
            val tags = Regex("<link\\b[^>]*>", RegexOption.IGNORE_CASE).findAll(html).map { it.value }.toList()
            fun href(t: String) = Regex("href\\s*=\\s*[\"']([^\"']+)[\"']", RegexOption.IGNORE_CASE).find(t)?.groupValues?.get(1)
            fun rel(t: String) = Regex("rel\\s*=\\s*[\"']([^\"']+)[\"']", RegexOption.IGNORE_CASE).find(t)?.groupValues?.get(1)?.lowercase().orEmpty()
            val plain = tags.filter { rel(it).split(' ').contains("icon") }.mapNotNull(::href)
            val apple = tags.filter { rel(it).startsWith("apple-touch-icon") }.mapNotNull(::href)
            (plain + apple).filter { !it.startsWith("data:") }.mapNotNull { runCatching { URL(c.url, it).toString() }.getOrNull() }
        } finally { c.disconnect() }
    }.getOrDefault(emptyList())

    private fun fetch(u: URL): Bitmap? {
        if (u.protocol != "https" && u.protocol != "http") return null
        val c = open(u)
        try {
            if (c.responseCode != 200) return null
            val bytes = c.inputStream.use { ins ->
                val out = ByteArrayOutputStream()
                val buf = ByteArray(16384)
                while (true) {
                    val n = ins.read(buf); if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > MAX_BYTES) return null
                }
                out.toByteArray()
            }
            val svg = c.contentType.orEmpty().contains("svg") || u.path.endsWith(".svg", ignoreCase = true)
            if (!svg) return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            val doc = com.caverock.androidsvg.SVG.getFromString(String(bytes))
            if (doc.documentViewBox == null && doc.documentWidth > 0 && doc.documentHeight > 0)
                doc.setDocumentViewBox(0f, 0f, doc.documentWidth, doc.documentHeight)
            doc.setDocumentWidth("100%"); doc.setDocumentHeight("100%")
            val out = Bitmap.createBitmap(PX, PX, Bitmap.Config.ARGB_8888)
            doc.renderToCanvas(Canvas(out))
            return out
        } finally {
            c.disconnect()
        }
    }
}
