package be.syntaxya.lodica.engine

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.FileProvider
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.coroutines.coroutineContext

@Serializable
data class UpdateInfo(
    val version: String = "",
    val name: String = "",
    val notes: String = "",
    val file: String = "",
    val size: Long = 0,
    val sha256: String? = null,
    val newer: Boolean = false,
    val url: String = "",
)

@Serializable
private data class GhAsset(val name: String = "", val size: Long = 0, val digest: String? = null, val browser_download_url: String = "")

@Serializable
private data class GhRelease(val tag_name: String = "", val name: String? = null, val body: String? = null, val prerelease: Boolean = false, val draft: Boolean = false, val assets: List<GhAsset> = emptyList())

sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data class Latest(val version: String) : UpdateState
    data class Available(val info: UpdateInfo) : UpdateState
    data class Downloading(val info: UpdateInfo, val received: Long) : UpdateState
    data class Ready(val info: UpdateInfo, val path: String) : UpdateState
    data class Failed(val message: String) : UpdateState
}

/**
 * In-app updates from the public GitHub releases of bent-syntax/lodica-browser. The APK is only
 * handed to the installer after its SHA-256 matches the digest GitHub reports for the asset.
 */
object Updater {
    private const val TAG = "LodicaUpdater"
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private var job: Job? = null

    var state by mutableStateOf<UpdateState>(UpdateState.Idle)
        private set

    private fun currentVersion(ctx: Context): String =
        runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "0"

    private const val LATEST = "https://api.github.com/repos/bent-syntax/lodica-browser/releases/latest"
    private const val ALL = "https://api.github.com/repos/bent-syntax/lodica-browser/releases?per_page=30"

    /** Numeric parts first; a "-beta.N" suffix sorts below the same version without one. */
    internal fun cmp(a: String, b: String): Int {
        fun parts(v: String): Pair<List<Int>, Int> {
            val t = v.removePrefix("v")
            val core = t.substringBefore('-')
            val pre = if (t.contains('-')) (Regex("\\d+").findAll(t.substringAfter('-')).firstOrNull()?.value?.toIntOrNull() ?: 0) else Int.MAX_VALUE
            return core.split('.').map { it.toIntOrNull() ?: 0 } to pre
        }
        val (x, px) = parts(a)
        val (y, py) = parts(b)
        for (i in 0 until maxOf(x.size, y.size)) {
            val d = x.getOrElse(i) { 0 } - y.getOrElse(i) { 0 }
            if (d != 0) return d
        }
        return px.compareTo(py)
    }

    private fun get(url: String, timeout: Int = 15_000): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        return try {
            c.connectTimeout = timeout; c.readTimeout = timeout; c.useCaches = false
            c.setRequestProperty("Accept", "application/vnd.github+json")
            c.setRequestProperty("User-Agent", "Lodica-updater")
            val code = c.responseCode
            code to (if (code == 200) c.inputStream.bufferedReader().use { it.readText() } else "")
        } finally { c.disconnect() }
    }

    private fun dir(ctx: Context) = File(ctx.cacheDir, "updates").apply { mkdirs() }

    fun check(ctx: Context) {
        if (state is UpdateState.Checking || state is UpdateState.Downloading) return
        state = UpdateState.Checking
        val cur = currentVersion(ctx)
        job = Relay.scope.launch(kotlinx.coroutines.Dispatchers.IO) {
            state = runCatching {
                val beta = Prefs.betaEnabled
                val (code, body) = get(if (beta) ALL else LATEST)
                when (code) {
                    200 -> {
                        val rel = if (beta) {
                            json.decodeFromString<List<GhRelease>>(body).filter { !it.draft && it.tag_name.isNotEmpty() }
                                .maxWithOrNull { x, y -> cmp(x.tag_name, y.tag_name) } ?: GhRelease()
                        } else json.decodeFromString<GhRelease>(body)
                        val ver = rel.tag_name.removePrefix("v")
                        val a = rel.assets.firstOrNull { it.name.endsWith(".apk") }
                        if (ver.isEmpty() || cmp(ver, cur) <= 0) UpdateState.Latest(cur)
                        else if (a == null) UpdateState.Failed("This release has no APK")
                        else {
                            var sha = a.digest?.removePrefix("sha256:")?.lowercase()
                            if (sha.isNullOrEmpty()) {
                                val s = rel.assets.firstOrNull { it.name == a.name + ".sha256" }
                                if (s != null) sha = Regex("[0-9a-fA-F]{64}").find(get(s.browser_download_url).second)?.value?.lowercase()
                            }
                            UpdateState.Available(UpdateInfo(ver, rel.name ?: "v$ver", rel.body ?: "", a.name, a.size, sha, true, a.browser_download_url))
                        }
                    }
                    404 -> UpdateState.Failed("No release published yet")
                    else -> UpdateState.Failed("Update check failed ($code)")
                }
            }.getOrElse { Log.w(TAG, "check failed", it); UpdateState.Failed("Could not reach GitHub") }
        }
    }

    fun download(ctx: Context) {
        val info = (state as? UpdateState.Available)?.info ?: return
        state = UpdateState.Downloading(info, 0)
        val dest = File(dir(ctx), "lodica-update.apk")
        val part = File(dir(ctx), "lodica-update.apk.part")
        job = Relay.scope.launch(kotlinx.coroutines.Dispatchers.IO) {
            val result = runCatching { fetch(info, part, dest) }
            part.delete()
            state = result.fold(
                onSuccess = { UpdateState.Ready(info, dest.absolutePath) },
                onFailure = {
                    dest.delete()
                    if (it is kotlinx.coroutines.CancellationException) UpdateState.Available(info)
                    else { Log.w(TAG, "download failed", it); UpdateState.Failed(it.message ?: "Download failed") }
                },
            )
        }
    }

    private suspend fun fetch(info: UpdateInfo, part: File, dest: File) {
        val c = URL(info.url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000
            c.readTimeout = 30_000
            c.useCaches = false
            c.setRequestProperty("User-Agent", "Lodica-updater")
            if (c.responseCode != 200) throw IllegalStateException("Download failed (${c.responseCode})")
            val expected = info.sha256?.lowercase()
            if (expected.isNullOrEmpty()) throw IllegalStateException("Update has no checksum; refusing to install")
            val md = MessageDigest.getInstance("SHA-256")
            var got = 0L
            var last = 0L
            c.inputStream.use { input ->
                part.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        coroutineContext.ensureActive()
                        md.update(buf, 0, n)
                        out.write(buf, 0, n)
                        got += n
                        if (got - last >= 256 * 1024) { last = got; state = UpdateState.Downloading(info, got) }
                    }
                }
            }
            val actual = md.digest().joinToString("") { "%02x".format(it) }
            if (actual != expected) throw IllegalStateException("Checksum mismatch; update discarded")
            if (!part.renameTo(dest)) throw IllegalStateException("Could not save update")
        } finally {
            c.disconnect()
        }
    }

    fun cancel() { job?.cancel() }

    /** Release tags the user can go back to. Betas only show with beta mode on. */
    var versions by mutableStateOf<List<String>?>(null)
        private set

    fun loadVersions() {
        versions = null
        Relay.scope.launch(kotlinx.coroutines.Dispatchers.IO) {
            versions = runCatching {
                val (code, body) = get(ALL.replace("per_page=30", "per_page=50"))
                if (code != 200) emptyList() else json.decodeFromString<List<GhRelease>>(body)
                    .filter { !it.draft && it.tag_name.isNotEmpty() && (Prefs.betaEnabled || !it.prerelease) && it.assets.any { a -> a.name.endsWith(".apk") } }
                    .sortedWith { x, y -> cmp(y.tag_name, x.tag_name) }.map { it.tag_name }
            }.getOrElse { emptyList() }
        }
    }

    /** Offers any listed release, older or newer, as the next download. */
    fun pickVersion(ctx: Context, tag: String) {
        if (state is UpdateState.Checking || state is UpdateState.Downloading) return
        state = UpdateState.Checking
        job = Relay.scope.launch(kotlinx.coroutines.Dispatchers.IO) {
            state = runCatching {
                val (code, body) = get(ALL.substringBefore("?").replace("/releases", "/releases/tags/") + java.net.URLEncoder.encode(tag, "UTF-8"))
                if (code != 200) return@runCatching UpdateState.Failed("GitHub answered $code")
                val rel = json.decodeFromString<GhRelease>(body)
                val a = rel.assets.firstOrNull { it.name.endsWith(".apk") } ?: return@runCatching UpdateState.Failed("This release has no APK")
                var sha = a.digest?.removePrefix("sha256:")?.lowercase()
                if (sha.isNullOrEmpty()) {
                    val sf = rel.assets.firstOrNull { it.name == a.name + ".sha256" }
                    if (sf != null) sha = Regex("[0-9a-fA-F]{64}").find(get(sf.browser_download_url).second)?.value?.lowercase()
                }
                val ver = rel.tag_name.removePrefix("v")
                UpdateState.Available(UpdateInfo(ver, rel.name ?: "v$ver", rel.body ?: "", a.name, a.size, sha, cmp(ver, currentVersion(ctx)) > 0, a.browser_download_url))
            }.getOrElse { Log.w(TAG, "pick failed", it); UpdateState.Failed("Could not reach GitHub") }
        }
    }

    /** Opens the system installer for the verified APK; sends the user to the "install unknown apps" screen first if needed. */
    fun install(ctx: Context) {
        val path = (state as? UpdateState.Ready)?.path ?: return
        val file = File(path)
        if (!file.exists()) { state = UpdateState.Failed("Downloaded file is gone"); return }
        if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
            ctx.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            return
        }
        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", file)
        ctx.startActivity(
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    fun reset() { state = UpdateState.Idle }
}
