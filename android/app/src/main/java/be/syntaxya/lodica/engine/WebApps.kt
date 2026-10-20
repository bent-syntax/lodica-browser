package be.syntaxya.lodica.engine

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import android.widget.Toast
import com.android.apksig.ApkSigner
import org.json.JSONObject
import be.syntaxya.lodica.tabs.Tab
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.math.BigInteger
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.security.spec.ECGenParameterSpec
import java.util.Date
import java.util.concurrent.Executors
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.security.auth.x500.X500Principal

/**
 * Web apps as real apps (#27). Builds a small wrapper APK per site on the phone: the `webapp/template.apk` asset
 * gets its package name, label, start URL and icon patched, is signed with an EC key generated in the Android
 * Keystore, and is handed to the PackageInstaller. The wrapper's launcher opens [be.syntaxya.lodica.ui.WebAppActivity].
 */
object WebApps {
    private const val TAG = "LodicaWebApps"
    private const val KEY_ALIAS = "lodica_webapp_signer"
    private const val TEMPLATE_PKG = "be.syntaxya.lodica.app.w000000000000"
    private const val LABEL = "LODICA_LABEL_PLACEHOLDER"
    private const val URL_PH = "LODICA_URL_PLACEHOLDER"
    private const val HOST = "LODICA_HOST_PLACEHOLDER"
    private const val ICON_PX = 432
    private const val MAX_ICON_BYTES = 2 shl 20

    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    class Record(val url: String, val label: String, val display: String = "standalone")

    /** The stored start URL and label of an installed web app, or null. */
    fun record(ctx: Context, pkg: String): Record? = runCatching {
        val o = JSONObject(File(dir(ctx), "$pkg.json").readText())
        Record(o.getString("url"), o.getString("label"), o.optString("display", "standalone"))
    }.getOrNull()

    /** True when the page declared a manifest that can be installed as a standalone app (not a plain browser tab). */
    fun installable(tab: Tab): Boolean {
        val m = tab.manifest ?: return false
        if (tab.private || !tab.url.startsWith("https://")) return false
        return m.optString("display", "browser") != "browser" && (m.has("name") || m.has("short_name"))
    }

    fun icon(ctx: Context, pkg: String): Bitmap? =
        File(dir(ctx), "$pkg.png").takeIf { it.isFile }?.let { BitmapFactory.decodeFile(it.path) }

    private fun dir(ctx: Context) = File(ctx.filesDir, "webapps").apply { mkdirs() }

    /** Builds and installs a wrapper app for [tab]'s site. Call on the main thread. */
    fun install(ctx: Context, tab: Tab) {
        val app = ctx.applicationContext
        val page = Uri.parse(tab.url)
        if (page.scheme != "https" && page.scheme != "http" || page.host.isNullOrEmpty()) {
            toast(app, "Only web pages can be installed"); return
        }
        SilentInstall.init(app)
        // Shizuku installs as the shell user, so Lodica's own install permission is not needed then.
        if (!SilentInstall.ready && !app.packageManager.canRequestPackageInstalls()) {
            runCatching {
                app.startActivity(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + app.packageName))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
            toast(app, "Allow Lodica to install apps, then try again"); return
        }
        val origin = origin(page)
        val manifest = tab.manifest?.takeIf { m ->
            // A manifest is only trusted when its start URL stays on the page's origin.
            m.optString("start_url").let { it.isEmpty() || origin(resolve(tab.url, it)) == origin }
        }
        val label = listOf(manifest?.optString("short_name"), manifest?.optString("name"), tab.title, tab.host)
            .firstOrNull { !it.isNullOrBlank() }!!.trim().take(40)
        val url = manifest?.optString("start_url")?.takeIf { it.isNotEmpty() }?.let { resolve(tab.url, it).toString() } ?: tab.url
        val links = tab.icons
        toast(app, "Building $label…")
        io.execute {
            try {
                val pkg = "be.syntaxya.lodica.app.w" + sha256(origin.toByteArray()).joinToString("") { "%02x".format(it) }.take(12)
                val png = iconPng(tab.url, origin, manifest, links, label)
                val apk = build(app, pkg, label, url, png)
                File(dir(app), "$pkg.json").writeText(JSONObject().put("url", url).put("label", label).put("display", manifest?.optString("display").orEmpty().ifEmpty { "standalone" }).toString())
                File(dir(app), "$pkg.png").writeBytes(png)
                val err = if (SilentInstall.ready) SilentInstall.install(apk) else "skipped"
                if (err == null) main.post { toast(app, "Installed $label") }
                else main.post { commit(app, apk, pkg, label) }
            } catch (e: Exception) {
                Log.w(TAG, "build failed: ${e.javaClass.simpleName}")
                main.post { toast(app, "Could not build the app") }
            }
        }
    }

    private fun origin(u: Uri) = "${u.scheme}://${u.host}${if (u.port > 0) ":${u.port}" else ""}"
    private fun resolve(base: String, ref: String): Uri = Uri.parse(URL(URL(base), ref).toString())
    private fun sha256(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b)
    private fun toast(ctx: Context, msg: String) = Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show()

    // ---- APK ----

    private fun build(ctx: Context, pkg: String, label: String, url: String, png: ByteArray): File {
        val work = File(ctx.cacheDir, "webapp").apply { deleteRecursively(); mkdirs() }
        val unsigned = File(work, "unsigned.apk")
        ZipInputStream(ctx.assets.open("webapp/template.apk")).use { zin ->
            ZipOutputStream(FileOutputStream(unsigned)).use { zout ->
                while (true) {
                    val e = zin.nextEntry ?: break
                    if (e.name.startsWith("META-INF/")) continue
                    var data = zin.readBytes()
                    data = when {
                        e.name == "AndroidManifest.xml" -> patchXml(data) { s ->
                            when (s) {
                                LABEL -> label
                                URL_PH -> url
                                HOST -> ctx.packageName
                                else -> s.replace(TEMPLATE_PKG, pkg)
                            }
                        }
                        e.name == "resources.arsc" -> patchArsc(data, pkg)
                        e.name.startsWith("res/") && e.name.endsWith(".png") -> png
                        else -> data
                    }
                    val out = ZipEntry(e.name)
                    if (e.method == ZipEntry.STORED) {
                        out.method = ZipEntry.STORED
                        out.size = data.size.toLong()
                        out.compressedSize = data.size.toLong()
                        out.crc = CRC32().apply { update(data) }.value
                    }
                    zout.putNextEntry(out)
                    zout.write(data)
                    zout.closeEntry()
                }
            }
        }
        val signed = File(work, "$pkg.apk")
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!ks.containsAlias(KEY_ALIAS)) genKey()
        val key = ks.getKey(KEY_ALIAS, null) as PrivateKey
        val cert = ks.getCertificate(KEY_ALIAS) as X509Certificate
        val cfg = ApkSigner.SignerConfig.Builder("lodica", key, listOf(cert)).build()
        ApkSigner.Builder(listOf(cfg))
            .setInputApk(unsigned).setOutputApk(signed)
            .setV1SigningEnabled(false).setV2SigningEnabled(true)
            .setV3SigningEnabled(false).setV4SigningEnabled(false)
            .setMinSdkVersion(26)
            .build().sign()
        unsigned.delete()
        return signed
    }

    /** One signing key for all web apps, so a rebuilt wrapper installs as an update of the old one. */
    private fun genKey() {
        fun gen(strongBox: Boolean) {
            val b = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setCertificateSubject(X500Principal("CN=Lodica web app"))
                .setCertificateSerialNumber(BigInteger.ONE)
                .setCertificateNotBefore(Date(0))
                .setCertificateNotAfter(Date(4102444800000L)) // 2100-01-01
            if (Build.VERSION.SDK_INT >= 28) b.setIsStrongBoxBacked(strongBox)
            KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
                .apply { initialize(b.build()) }.generateKeyPair()
        }
        try { gen(true) } catch (_: Exception) { gen(false) }
    }

    /**
     * Rewrites the UTF-16 string pool of a binary XML file through [map]. The pool keeps its string count,
     * so every index in the rest of the file stays valid; the chunks after the pool are copied unchanged.
     */
    private fun patchXml(src: ByteArray, map: (String) -> String): ByteArray {
        val b = ByteBuffer.wrap(src).order(ByteOrder.LITTLE_ENDIAN)
        require(b.getShort(0).toInt() == 3 && b.getShort(2).toInt() == 8) { "not binary xml" }
        val p = 8
        require(b.getShort(p).toInt() == 1) { "no string pool" }
        val hs = b.getShort(p + 2).toInt() and 0xffff
        val size = b.getInt(p + 4)
        val count = b.getInt(p + 8)
        val styles = b.getInt(p + 12)
        val flags = b.getInt(p + 16)
        val start = b.getInt(p + 20)
        require(styles == 0 && flags and 0x100 == 0) { "unsupported pool" }
        val strings = (0 until count).map { i ->
            var o = p + start + b.getInt(p + hs + i * 4)
            var len = b.getShort(o).toInt() and 0xffff
            o += 2
            if (len and 0x8000 != 0) { len = (len and 0x7fff shl 16) or (b.getShort(o).toInt() and 0xffff); o += 2 }
            String(src, o, len * 2, Charsets.UTF_16LE)
        }.map(map)
        val data = ByteArrayOutputStream()
        val offsets = IntArray(count)
        for ((i, s) in strings.withIndex()) {
            offsets[i] = data.size()
            val n = s.length
            val head = if (n > 0x7fff) intArrayOf(0x8000 or (n shr 16), n and 0xffff) else intArrayOf(n)
            for (h in head) { data.write(h and 0xff); data.write(h shr 8 and 0xff) }
            data.write(s.toByteArray(Charsets.UTF_16LE))
            data.write(0); data.write(0)
        }
        while (data.size() % 4 != 0) data.write(0)
        val newStart = hs + count * 4
        val newSize = newStart + data.size()
        val out = ByteBuffer.allocate(8 + newSize + (src.size - p - size)).order(ByteOrder.LITTLE_ENDIAN)
        out.put(src, 0, 8)
        out.put(src, p, hs)
        out.putInt(p + 4, newSize)
        out.putInt(p + 20, newStart)
        out.putInt(p + 24, 0)
        offsets.forEach { out.putInt(it) }
        out.put(data.toByteArray())
        out.put(src, p + size, src.size - p - size)
        out.putInt(4, out.capacity())
        return out.array()
    }

    /** The package name in resources.arsc is a fixed-size field, so a same-length replace is enough. */
    private fun patchArsc(src: ByteArray, pkg: String): ByteArray {
        require(pkg.length == TEMPLATE_PKG.length)
        var out = src
        for (cs in listOf(Charsets.UTF_16LE, Charsets.UTF_8)) out = replace(out, TEMPLATE_PKG.toByteArray(cs), pkg.toByteArray(cs))
        return out
    }

    private fun replace(src: ByteArray, from: ByteArray, to: ByteArray): ByteArray {
        val out = src.copyOf()
        var i = 0
        while (i <= out.size - from.size) {
            if ((from.indices).all { out[i + it] == from[it] }) { to.copyInto(out, i); i += from.size } else i++
        }
        return out
    }

    // ---- Icon ----

    /**
     * A 432 px adaptive-icon foreground. Order: maskable manifest icon, large manifest icon, the page's own
     * `<link rel=icon>` / apple-touch-icon tags (biggest first), `/apple-touch-icon.png`, `/favicon.ico`, a letter.
     */
    private fun iconPng(page: String, origin: String, manifest: JSONObject?, links: List<String>, label: String): ByteArray {
        class Cand(val src: String, val size: Int, val maskable: Boolean)
        val cands = mutableListOf<Cand>()
        manifest?.optJSONArray("icons")?.let { arr ->
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val src = o.optString("src").takeIf { it.isNotEmpty() } ?: continue
                val size = o.optString("sizes").split(' ').mapNotNull { it.substringBefore('x').toIntOrNull() }.maxOrNull()
                    ?: if (o.optString("sizes") == "any") 512 else 0
                cands += Cand(src, size, o.optString("purpose").split(' ').contains("maskable"))
            }
        }
        val ordered = cands.filter { it.maskable }.sortedByDescending { it.size } +
            cands.filter { !it.maskable && it.size >= 48 }.sortedByDescending { it.size } +
            links.map { Cand(it, 0, false) } +
            Cand("$origin/apple-touch-icon.png", 180, false) +
            Cand("$origin/favicon.ico", 32, false)
        for (c in ordered.distinctBy { it.src }) {
            val bmp = runCatching { load(page, c.src) }.getOrNull() ?: continue
            return png(draw(bmp, c.maskable))
        }
        return png(letter(label))
    }

    private fun load(page: String, src: String): Bitmap? {
        if (src.startsWith("data:image/")) {
            val head = src.substringBefore(',')
            val body = src.substringAfter(',', "")
            val bytes = if (head.endsWith(";base64")) android.util.Base64.decode(body, android.util.Base64.DEFAULT)
            else Uri.decode(body).toByteArray()
            return if (bytes.size > MAX_ICON_BYTES) null else decode(bytes, head.contains("svg"))
        }
        return fetch(URL(URL(page), src))
    }

    private fun fetch(u: URL): Bitmap? {
        if (u.protocol != "https" && u.protocol != "http") return null
        val c = u.openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8000; c.readTimeout = 8000
            if (c.responseCode != 200) return null
            val bytes = c.inputStream.use { ins ->
                val out = ByteArrayOutputStream()
                val buf = ByteArray(16384)
                while (true) {
                    val n = ins.read(buf); if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > MAX_ICON_BYTES) return null
                }
                out.toByteArray()
            }
            val svg = c.contentType.orEmpty().contains("svg") || u.path.endsWith(".svg", ignoreCase = true)
            return decode(bytes, svg)
        } finally {
            c.disconnect()
        }
    }

    private fun decode(bytes: ByteArray, svg: Boolean): Bitmap? {
        if (!svg) return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.takeIf { it.width >= 32 }
        // SVG logos (common for modern sites) are rendered at full icon size.
        val doc = com.caverock.androidsvg.SVG.getFromString(String(bytes))
        if (doc.documentViewBox == null && doc.documentWidth > 0 && doc.documentHeight > 0)
            doc.setDocumentViewBox(0f, 0f, doc.documentWidth, doc.documentHeight)
        doc.setDocumentWidth("100%"); doc.setDocumentHeight("100%")
        val out = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
        doc.renderToCanvas(Canvas(out))
        return out
    }

    private fun draw(src: Bitmap, maskable: Boolean): Bitmap {
        val out = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        if (maskable) {
            c.drawColor(src.getPixel(0, 0) or 0xff000000.toInt())
            c.drawBitmap(src, null, Rect(0, 0, ICON_PX, ICON_PX), paint)
        } else {
            c.drawColor(Color.WHITE)
            val s = 240; val o = (ICON_PX - s) / 2
            c.drawBitmap(src, null, Rect(o, o, o + s, o + s), paint)
        }
        return out
    }

    private fun letter(label: String): Bitmap {
        val out = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        c.drawColor(0xff111827.toInt())
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xfff59e0b.toInt(); textSize = 180f; textAlign = Paint.Align.CENTER
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val ch = label.firstOrNull { it.isLetterOrDigit() }?.uppercase() ?: "L"
        c.drawText(ch, ICON_PX / 2f, ICON_PX / 2f - (p.descent() + p.ascent()) / 2, p)
        return out
    }

    private fun png(b: Bitmap) = ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()

    // ---- Install ----

    private fun commit(ctx: Context, apk: File, pkg: String, label: String) {
        try {
            val pi = ctx.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(pkg)
            // Android 12+: updates of wrappers Lodica installed itself skip the confirm screen.
            if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            val id = pi.createSession(params)
            pi.openSession(id).use { s ->
                s.openWrite("base.apk", 0, apk.length()).use { out ->
                    apk.inputStream().use { it.copyTo(out) }
                    s.fsync(out)
                }
                var flags = PendingIntent.FLAG_UPDATE_CURRENT
                if (Build.VERSION.SDK_INT >= 31) flags = flags or PendingIntent.FLAG_MUTABLE
                val status = PendingIntent.getBroadcast(
                    ctx, id, Intent(ctx, InstallReceiver::class.java).putExtra("label", label), flags,
                )
                s.commit(status.intentSender)
            }
        } catch (e: Exception) {
            Log.w(TAG, "install failed: ${e.javaClass.simpleName}")
            toast(ctx, "Could not install $label")
        }
    }

    class InstallReceiver : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val label = intent.getStringExtra("label") ?: "app"
            when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                    else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_INTENT)
                    confirm?.let { runCatching { ctx.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
                }
                PackageInstaller.STATUS_SUCCESS -> toast(ctx, "Installed $label")
                PackageInstaller.STATUS_FAILURE_ABORTED -> {}
                else -> toast(ctx, "Install failed: ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "unknown error"}")
            }
        }
    }
}
