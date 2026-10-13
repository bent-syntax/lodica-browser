package be.syntaxya.lodica.tabs

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.util.AtomicFile
import android.util.Log
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

@Serializable
data class Snapshot(
    val tabs: List<TabRecord> = emptyList(),
    val currentId: String? = null,
    val archived: List<TabRecord> = emptyList(),
)

/** Debounced, crash-safe tab persistence. Private tabs are saved too; the app locks them on restore. */
object TabStore {
    private const val TAG = "LodicaTabs"
    private const val DEBOUNCE_MS = 400L
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = false }
    private lateinit var file: AtomicFile
    private val io by lazy { Handler(HandlerThread("lodica-tabs").apply { start() }.looper) }
    @Volatile private var pending: Snapshot? = null
    private val flush = Runnable { pending?.let { pending = null; synchronized(this) { write(it) } } }

    fun init(ctx: Context) {
        if (!::file.isInitialized) file = AtomicFile(File(ctx.filesDir, "tabs.json"))
    }

    fun load(): Snapshot = runCatching {
        json.decodeFromString(Snapshot.serializer(), file.readFully().decodeToString())
    }.onFailure { Log.w(TAG, "tab restore failed", it) }.getOrDefault(Snapshot())

    fun save(tabs: List<Tab>, current: Tab?, archived: List<TabRecord>) {
        pending = Snapshot(tabs.map { it.record() }, current?.id, archived)
        io.removeCallbacks(flush)
        io.postDelayed(flush, DEBOUNCE_MS)
    }

    /** Called from onStop so nothing is lost when the process dies. */
    fun flushNow() {
        io.removeCallbacks(flush)
        pending?.let { pending = null; synchronized(this) { write(it) } }
    }

    private fun write(s: Snapshot) {
        val out = runCatching { file.startWrite() }.getOrNull() ?: return
        try {
            out.write(json.encodeToString(Snapshot.serializer(), s).encodeToByteArray())
            file.finishWrite(out)
        } catch (e: Exception) {
            Log.w(TAG, "tab save failed", e)
            file.failWrite(out)
        }
    }
}
