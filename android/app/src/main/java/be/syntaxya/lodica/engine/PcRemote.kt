package be.syntaxya.lodica.engine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/** Live view of the linked PC's screen: JPEG frames on /api/pcscreen, touch and keyboard input back on /api/pcscreen/input. */
object PcRemote {
    val frame = mutableStateOf<Bitmap?>(null)
    val live = mutableStateOf(false)
    private var scope: CoroutineScope? = null
    private val main = Handler(Looper.getMainLooper())

    fun init(ctx: Context) { Relay.init(ctx.applicationContext) }

    fun start() {
        if (scope != null) return
        val s = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        scope = s
        s.launch {
            delay(200)
            while (s.isActive) {
                try {
                    val (code, bytes) = Relay.requestBytes("GET", "/api/pcscreen?after=0&wait=20", readTimeoutMs = 30_000)
                    if (code == 200 && bytes.size > 4 && bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte()) {
                        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        main.post {
                            // Do not recycle the previous bitmap here: Compose may still be drawing it.
                            frame.value = bmp
                            live.value = true
                        }
                    } else if (code != 200) {
                        main.post { live.value = false }
                        delay(1_000)
                    } else {
                        // after=0 always returns the newest frame; slow the loop so the relay is not hammered.
                        delay(120)
                    }
                } catch (e: Exception) {
                    main.post { live.value = false }
                    delay(1_000)
                }
            }
        }
    }

    /** Asks the linked desktop to start sending its screen. The desktop still enforces its pcRemote permission. */
    fun request() {
        if (scope == null) start()
        scope?.launch { runCatching { Relay.request("POST", "/api/pcscreen/request") } }
    }

    /** Sends tap/swipe/move/key/text events. Coordinates are fractions of the PC screen (0..1). */
    fun send(events: JSONArray) {
        if (events.length() == 0) return
        val body = JSONObject().put("events", events).toString().toByteArray()
        scope?.launch {
            runCatching { Relay.request("POST", "/api/pcscreen/input", body, "application/json") }
        }
    }

    fun tap(x: Float, y: Float) = send(JSONArray().put(JSONObject().put("t", "tap").put("x", x).put("y", y)))
    fun swipe(x: Float, y: Float, x2: Float, y2: Float) = send(JSONArray().put(
        JSONObject().put("t", "swipe").put("x", x).put("y", y).put("x2", x2).put("y2", y2)))
    fun key(key: String) = send(JSONArray().put(JSONObject().put("t", "key").put("key", key)))
    fun text(text: String) = send(JSONArray().put(JSONObject().put("t", "text").put("text", text.take(500))))

    fun stop() {
        scope?.cancel()
        scope = null
        main.post { frame.value = null; live.value = false }
        CoroutineScope(Dispatchers.IO).launch { runCatching { Relay.request("DELETE", "/api/pcscreen") } }
    }
}
