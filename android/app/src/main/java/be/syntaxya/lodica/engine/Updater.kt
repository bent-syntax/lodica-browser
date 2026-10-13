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
)

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
 * In-app updates. The app never talks to GitHub: the repository is private, so the relay holds the
 * read-only token and proxies the release. The APK is only handed to the installer after its
 * SHA-256 matches the checksum the relay reports.
 */
object Updater {
    private const val TAG = "LodicaUpdater"
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private var job: Job? = null

    var state by mutableStateOf<UpdateState>(UpdateState.Idle)
        private set

    private fun currentVersion(ctx: Context): String =
        runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "0"

    private fun dir(ctx: Context) = File(ctx.cacheDir, "updates").apply { mkdirs() }

    fun check(ctx: Context) {
        if (state is UpdateState.Checking || state is UpdateState.Downloading) return
        if (!Relay.available) { state = UpdateState.Failed("Relay not configured"); return }
        state = UpdateState.Checking
        val cur = currentVersion(ctx)
        job = Relay.scope.launch {
            state = runCatching {
                val (code, body) = Relay.request("GET", "/api/update/check?app=android&version=" + Uri.encode(cur))
                when (code) {
                    200 -> {
                        val i = json.decodeFromString<UpdateInfo>(body)
                        if (i.newer) UpdateState.Available(i) else UpdateState.Latest(cur)
                    }
                    503 -> UpdateState.Failed("Updates are not set up on the server yet")
                    404 -> UpdateState.Failed("No release published yet")
                    401 -> UpdateState.Failed("Relay refused this app")
                    else -> UpdateState.Failed("Update check failed ($code)")
                }
            }.getOrElse { Log.w(TAG, "check failed", it); UpdateState.Failed("Could not reach the update server") }
        }
    }

    fun download(ctx: Context) {
        val info = (state as? UpdateState.Available)?.info ?: return
        state = UpdateState.Downloading(info, 0)
        val dest = File(dir(ctx), "lodica-update.apk")
        val part = File(dir(ctx), "lodica-update.apk.part")
        job = Relay.scope.launch {
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
        val c = URL(Relay.API + "/api/update/download?app=android").openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000
            c.readTimeout = 30_000
            c.useCaches = false
            c.setRequestProperty("Authorization", "Bearer ${Relay.apiToken}")
            if (c.responseCode != 200) throw IllegalStateException("Download failed (${c.responseCode})")
            val expected = (c.getHeaderField("X-Sha256") ?: info.sha256)?.lowercase()
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
