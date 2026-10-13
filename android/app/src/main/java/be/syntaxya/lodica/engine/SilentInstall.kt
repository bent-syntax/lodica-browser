package be.syntaxya.lodica.engine

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import rikka.shizuku.Shizuku
import java.io.File

/**
 * Silent web-app installs (#34) through Shizuku. Shizuku runs `pm` as the shell user,
 * so wrapper APKs install without the system prompt. Falls back to PackageInstaller
 * whenever Shizuku is missing, stopped or has not granted Lodica access.
 */
object SilentInstall {
    const val SHIZUKU = "moe.shizuku.privileged.api"
    private const val TAG = "SilentInstall"
    private const val REQUEST = 4127

    enum class State(val label: String) {
        Missing("Shizuku not installed"),
        Stopped("Shizuku not running"),
        Denied("Lodica not allowed in Shizuku"),
        Ready("Ready, installs skip the prompt"),
    }

    var state by mutableStateOf(State.Missing)
        private set

    private lateinit var app: Context
    private var started = false

    /** Registers the Shizuku listeners once. Call on the main thread. */
    fun init(ctx: Context) {
        if (started) return
        started = true
        app = ctx.applicationContext
        Shizuku.addBinderReceivedListenerSticky { refresh() }
        Shizuku.addBinderDeadListener { refresh() }
        Shizuku.addRequestPermissionResultListener { _, _ -> refresh() }
        refresh()
    }

    fun refresh() {
        if (!started) return
        state = when {
            !installed() -> State.Missing
            !runCatching { Shizuku.pingBinder() }.getOrDefault(false) -> State.Stopped
            runCatching { Shizuku.checkSelfPermission() }.getOrDefault(-1) != PackageManager.PERMISSION_GRANTED -> State.Denied
            else -> State.Ready
        }
    }

    val ready get() = started && state == State.Ready

    private fun installed() = runCatching { app.packageManager.getPackageInfo(SHIZUKU, 0) }.isSuccess

    private fun developerOptions() =
        Settings.Global.getInt(app.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1

    /** Label of the next setup step, or null when setup is done. */
    fun nextStep(): String? = when (state) {
        State.Missing -> "Get Shizuku"
        State.Stopped -> if (developerOptions()) "Start Shizuku" else "Turn on developer options"
        State.Denied -> "Allow Lodica in Shizuku"
        State.Ready -> null
    }

    /** Runs the next setup step; returns a hint to show the user. */
    fun runNextStep(ctx: Context): String? {
        refresh()
        return when (state) {
            State.Missing -> {
                open(ctx, Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$SHIZUKU")))
                    || open(ctx, Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$SHIZUKU")))
                "Install Shizuku, then come back"
            }
            State.Stopped -> if (!developerOptions()) {
                open(ctx, Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))
                "Tap Build number 7 times, then come back"
            } else {
                ctx.packageManager.getLaunchIntentForPackage(SHIZUKU)?.let { open(ctx, it) }
                "In Shizuku: pair with wireless debugging, then tap Start"
            }
            State.Denied -> {
                runCatching { Shizuku.requestPermission(REQUEST) }
                null
            }
            State.Ready -> "Silent install is ready"
        }
    }

    fun openDeveloperOptions(ctx: Context) {
        open(ctx, Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))
    }

    private fun open(ctx: Context, i: Intent) =
        runCatching { ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess

    /**
     * Installs [apk] with `pm install`, streaming it over stdin. Blocking; call off the
     * main thread. Returns null on success, else the error text.
     */
    fun install(apk: File): String? = try {
        // newProcess is private in api 13 but stays the simplest way to run pm; kept by R8 rules.
        val m = Shizuku::class.java.getDeclaredMethod(
            "newProcess", Array<String>::class.java, Array<String>::class.java, String::class.java,
        ).apply { isAccessible = true }
        val p = m.invoke(null, arrayOf("pm", "install", "-r", "-S", apk.length().toString()), null, null) as Process
        p.outputStream.use { out -> apk.inputStream().use { it.copyTo(out) } }
        val out = p.inputStream.bufferedReader().readText() + p.errorStream.bufferedReader().readText()
        p.waitFor()
        if (out.contains("Success")) null else out.trim().ifEmpty { "pm exited ${p.exitValue()}" }.take(200)
    } catch (e: Exception) {
        Log.w(TAG, "shizuku install failed: ${e.javaClass.simpleName}")
        e.javaClass.simpleName
    }
}
