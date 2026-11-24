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

/** Live view of a selected linked PC's full screen: JPEG frames on /api/pcscreen, input back on /api/pcscreen/input. */
object PcRemote {
    val frame = mutableStateOf<Bitmap?>(null)
    /** Bumped with every frame so Compose always redraws the surface even when the bitmap instance is reused. */
    val frameSeq = mutableStateOf(0)
    val live = mutableStateOf(false)
    private var scope: CoroutineScope? = null
    private val main = Handler(Looper.getMainLooper())

    fun init(ctx: Context) {
        Relay.init(ctx.applicationContext)
        LinkedDevices.init(ctx.applicationContext)
    }

    /** Relay query for the selected PC. The target is re-read on every poll so linking a new PC works without a restart. */
    private fun targetQuery(extra: String = ""): String {
        val target = LinkedDevices.target("desktop")
        val q = if (target.isEmpty()) extra else (if (extra.isEmpty()) "" else extra + "&") + "deviceId=" + target
        return if (q.isEmpty()) "" else "?" + q
    }

    fun start() {
        if (scope != null) return
        val s = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        scope = s
        s.launch {
            LinkedDevices.refresh()
            delay(200)
            var after = 0
            while (s.isActive) {
                try {
                    val q = targetQuery("after=$after&wait=20")
                    val (code, bytes) = Relay.requestBytes("GET", "/api/pcscreen$q", readTimeoutMs = 30_000)
                    if (code == 200 && bytes.size > 4 && bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte()) {
                        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        main.post {
                            // Do not recycle the previous bitmap here: Compose may still be drawing it.
                            frame.value = bmp
                            frameSeq.value++
                            live.value = true
                        }
                        after++
                    } else if (code != 200) {
                        main.post { live.value = false }
                        delay(1_000)
                    } else {
                        // The relay answers a long poll only when a newer frame arrives.
                        after = 0
                    }
                } catch (e: Exception) {
                    main.post { live.value = false }
                    delay(1_000)
                }
            }
        }
    }

    /** Asks the selected desktop to start sending its screen. The desktop still enforces its pcRemote permission. */
    fun request() {
        if (scope == null) start()
        scope?.launch {
            LinkedDevices.refresh()
            val body = JSONObject().put("deviceId", LinkedDevices.target("desktop")).put("from", LinkedDevices.id()).toString()
            runCatching { Relay.request("POST", "/api/pcscreen/request", body.toByteArray(), "application/json") }
        }
    }

    /** Sends tap/swipe/move/key/text events. Coordinates are fractions of the PC screen (0..1). */
    fun send(events: JSONArray) {
        if (events.length() == 0) return
        val body = JSONObject().put("deviceId", LinkedDevices.target("desktop")).put("from", LinkedDevices.id()).put("events", events).toString()
        scope?.launch {
            runCatching { Relay.request("POST", "/api/pcscreen/input", body.toByteArray(), "application/json") }
        }
    }

    fun tap(x: Float, y: Float) = send(JSONArray().put(JSONObject().put("t", "tap").put("x", x).put("y", y)))
    fun swipe(x: Float, y: Float, x2: Float, y2: Float) = send(JSONArray().put(
        JSONObject().put("t", "swipe").put("x", x).put("y", y).put("x2", x2).put("y2", y2)))
    fun scroll(x: Float, y: Float, steps: Int) = send(JSONArray().put(JSONObject().put("t", "scroll").put("x", x).put("y", y).put("steps", steps)))
    fun right(x: Float, y: Float) = send(JSONArray().put(JSONObject().put("t", "right").put("x", x).put("y", y)))
    fun key(key: String) = send(JSONArray().put(JSONObject().put("t", "key").put("key", key)))
    fun text(text: String) = send(JSONArray().put(JSONObject().put("t", "text").put("text", text.take(500))))

    fun stop() {
        scope?.cancel()
        scope = null
        main.post { frame.value = null; live.value = false }
        CoroutineScope(Dispatchers.IO).launch {
            runCatching { Relay.request("DELETE", "/api/pcscreen" + targetQuery()) }
        }
    }
}
