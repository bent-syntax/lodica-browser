package be.syntaxya.lodica

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import java.io.File
import java.text.DateFormat
import java.util.Date

/**
 * Keeps the last crash so the next launch can show it. Java crashes are written by the
 * uncaught-exception handler. Native and killed processes come from Android's own exit history.
 */
object CrashLog {
    private const val FILE = "crash.txt"
    private const val PREFS = "crashlog"
    private const val SEEN = "seen"

    @Volatile private var appCtx: Context? = null
    @Volatile private var mine: Thread.UncaughtExceptionHandler? = null

    /** Safe to call repeatedly: GeckoView swaps in its own handler at startup, so this wraps it again. */
    fun install(ctx: Context) {
        appCtx = ctx.applicationContext
        val current = Thread.getDefaultUncaughtExceptionHandler()
        if (current != null && current === mine) return
        val file = File(ctx.filesDir, FILE)
        val handler = Thread.UncaughtExceptionHandler { t, e ->
            runCatching {
                file.appendText("Java crash in ${currentProcess(ctx)} (thread ${t.name})\n${e.stackTraceToString().take(6000)}\n\n")
            }
            current?.uncaughtException(t, e)
        }
        mine = handler
        Thread.setDefaultUncaughtExceptionHandler(handler)
    }

    /** Records a handled error so it shows in the next crash report. */
    fun note(msg: String, e: Throwable) {
        runCatching { File(appCtx?.filesDir ?: return, FILE).appendText("$msg\n${e.stackTraceToString().take(4000)}\n\n") }
    }

    /** The crash report to show, or null when the last run ended normally. */
    fun pending(ctx: Context): String? {
        val out = StringBuilder()
        runCatching { File(ctx.filesDir, FILE).takeIf { it.exists() }?.readText()?.let(out::append) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) runCatching { out.append(exitHistory(ctx)) }
        return out.toString().trim().takeIf { it.isNotEmpty() }?.let {
            "Lodica ${Build.MODEL}, Android ${Build.VERSION.RELEASE}\n\n$it"
        }
    }

    fun clear(ctx: Context) {
        File(ctx.filesDir, FILE).delete()
    }

    private fun currentProcess(ctx: Context): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) android.app.Application.getProcessName() else ctx.packageName

    private fun exitHistory(ctx: Context): String {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val seen = prefs.getLong(SEEN, 0L)
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val bad = setOf(
            ApplicationExitInfo.REASON_CRASH, ApplicationExitInfo.REASON_CRASH_NATIVE,
            ApplicationExitInfo.REASON_ANR, ApplicationExitInfo.REASON_SIGNALED,
            ApplicationExitInfo.REASON_INITIALIZATION_FAILURE, ApplicationExitInfo.REASON_LOW_MEMORY,
            ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE, ApplicationExitInfo.REASON_DEPENDENCY_DIED,
        )
        val fresh = am.getHistoricalProcessExitReasons(ctx.packageName, 0, 8).filter { it.reason in bad && it.timestamp > seen }
        if (fresh.isEmpty()) return ""
        prefs.edit().putLong(SEEN, fresh.maxOf { it.timestamp }).apply()
        return fresh.joinToString("\n\n") { i ->
            val time = DateFormat.getDateTimeInstance().format(Date(i.timestamp))
            val trace = if (i.reason == ApplicationExitInfo.REASON_CRASH_NATIVE || i.reason == ApplicationExitInfo.REASON_ANR) {
                runCatching { i.traceInputStream?.use { it.readBytes() }?.let(::strings) }.getOrNull().orEmpty()
            } else ""
            "Exit of ${i.processName} at $time: reason ${i.reason}, status ${i.status}, ${i.description.orEmpty()}\n$trace"
        }
    }

    /** Readable text runs from a native crash dump, which is mostly binary. */
    private fun strings(b: ByteArray): String {
        val s = StringBuilder()
        val run = StringBuilder()
        for (x in b) {
            val c = x.toInt().toChar()
            if (c in ' '..'~') run.append(c) else {
                if (run.length >= 6) s.append(run).append('\n')
                run.clear()
            }
            if (s.length > 4000) break
        }
        if (run.length >= 6) s.append(run)
        return s.toString().take(4000)
    }
}
