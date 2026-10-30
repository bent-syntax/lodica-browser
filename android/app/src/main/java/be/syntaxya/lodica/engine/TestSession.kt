package be.syntaxya.lodica.engine

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import be.syntaxya.lodica.tabs.TabManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Remote test session. Runs only after the user turned on "Let support connect for testing" and pressed Start.
 * Support joins with the code the user reads out and may run a short allowlist of in-app actions: tap, swipe,
 * scroll, a few keys and a few harmless settings. Nothing outside this app's own window, no vault, no files.
 * The settings are saved before the session and put back when it ends, also after a crash (see [recover]).
 */
object TestSession {
    /** "off", "waiting" (code shown, nobody joined yet) or "active". */
    var state by mutableStateOf("off"); private set
    var code by mutableStateOf(""); private set
    var note by mutableStateOf(""); private set
    var activity: Activity? = null

    private var id = ""
    private var seq = 0
    private var run = 0
    private var expires = 0L
    private val main = Handler(Looper.getMainLooper())

    private val BOOL = setOf("darkPages", "forceDark", "holidayFx", "autoCorrect", "historySuggest", "quickAuto", "desktopDefault", "fastRender4", "tiltRotate", "gestureSwipeTabs", "gestureBarHide")
    private val FLOAT = setOf("startDim", "startBlur", "tiltDeadZone", "tiltZoom")
    private val KEYS = mapOf("back" to KeyEvent.KEYCODE_BACK, "enter" to KeyEvent.KEYCODE_ENTER, "tab" to KeyEvent.KEYCODE_TAB, "up" to KeyEvent.KEYCODE_DPAD_UP,
        "down" to KeyEvent.KEYCODE_DPAD_DOWN, "left" to KeyEvent.KEYCODE_DPAD_LEFT, "right" to KeyEvent.KEYCODE_DPAD_RIGHT, "delete" to KeyEvent.KEYCODE_DEL)

    private fun store(ctx: Context) = ctx.getSharedPreferences("testbackup", Context.MODE_PRIVATE)
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("prefs", Context.MODE_PRIVATE)

    /** Saves every pref with its type so [restore] can put it back exactly. */
    private fun backup(ctx: Context) {
        val a = JSONArray()
        for ((k, v) in prefs(ctx).all) {
            val t = when (v) { is Boolean -> "b"; is Int -> "i"; is Long -> "l"; is Float -> "f"; is String -> "s"; else -> continue }
            a.put(JSONObject().put("k", k).put("t", t).put("v", v.toString()))
        }
        store(ctx).edit().putString("all", a.toString()).commit()
    }

    private fun restore(ctx: Context) {
        val raw = store(ctx).getString("all", null) ?: return
        val a = runCatching { JSONArray(raw) }.getOrNull() ?: return
        val e = prefs(ctx).edit().clear()
        for (i in 0 until a.length()) {
            val o = a.getJSONObject(i); val k = o.getString("k"); val v = o.getString("v")
            when (o.getString("t")) {
                "b" -> e.putBoolean(k, v.toBoolean()); "i" -> e.putInt(k, v.toInt()); "l" -> e.putLong(k, v.toLong())
                "f" -> e.putFloat(k, v.toFloat()); else -> e.putString(k, v)
            }
        }
        e.commit()
        store(ctx).edit().clear().commit()
        Prefs.init(ctx, force = true)
        Engine.applyPrefs()
    }

    /** After a crash in the middle of a session the backup is still on disk. Put it back at launch. */
    fun recover(ctx: Context) { if (store(ctx).contains("all")) restore(ctx) }

    /** Returns an error message, or null when the session started and [code] is showing. */
    fun start(ctx: Context): String? {
        if (!Prefs.remoteTest) return "Turn on 'Let support connect for testing' first."
        if (state != "off") return null
        Relay.init(ctx)
        if (!Relay.available) return "No relay is set up. Pair this browser with your server first."
        val (st, body) = try { Relay.request("POST", "/api/support/test", "{}".toByteArray(), "application/json") } catch (e: java.io.IOException) { return "Support is not reachable right now." }
        val j = runCatching { JSONObject(body) }.getOrNull()
        if (st != 200 || j == null || !j.has("id")) return if (st == 429) "Too many tries. Try again later." else "Support is not reachable right now."
        backup(ctx)
        id = j.getString("id"); code = j.getString("code"); expires = j.optLong("expires"); seq = 0; run++
        state = "waiting"; note = ""
        val me = run
        thread(name = "test-session") { poll(ctx.applicationContext, me) }
        return null
    }

    fun stop(ctx: Context, why: String = "stopped by you") {
        if (state == "off") return
        val old = id
        thread { runCatching { Relay.request("POST", "/api/support/test/$old", """{"stop":true}""".toByteArray(), "application/json") } }
        end(ctx, why)
    }

    private fun end(ctx: Context, why: String) {
        if (state == "off") return
        run++
        restore(ctx)
        main.post { state = "off"; code = ""; id = ""; note = "Test session ended: $why. Your settings are back as they were." }
    }

    private fun poll(ctx: Context, me: Int) {
        while (run == me && state != "off") {
            if (System.currentTimeMillis() > expires) { end(ctx, "expired"); return }
            val (st, body) = try { Relay.request("GET", "/api/support/test/$id?after=$seq&wait=20", readTimeoutMs = 30_000) } catch (e: java.io.IOException) { 0 to "" }
            if (run != me) return
            val j = runCatching { JSONObject(body) }.getOrNull()
            if (st == 404 || j?.optString("state") == "stopped") { end(ctx, j?.optString("why")?.ifBlank { null } ?: "closed"); return }
            if (st != 200 || j == null) { Thread.sleep(3000); continue }
            if (j.optString("state") == "active" && state != "active") { expires = j.optLong("expires", expires); main.post { state = "active" } }
            val cmds = j.optJSONArray("cmds") ?: continue
            for (i in 0 until cmds.length()) {
                if (run != me) return
                val c = cmds.getJSONObject(i)
                seq = maxOf(seq, c.optInt("seq"))
                val out = JSONObject().put("seq", c.optInt("seq"))
                try { out.put("ok", true).put("data", exec(ctx, c.optString("action"), c.optJSONObject("args") ?: JSONObject())) }
                catch (e: Exception) { out.put("ok", false).put("data", (e.message ?: "failed").take(300)) }
                runCatching { Relay.request("POST", "/api/support/test/$id", JSONObject().put("result", out).toString().toByteArray(), "application/json") }
            }
        }
    }

    /** Runs [block] on the main thread and waits for it. */
    private fun <T> onMain(block: () -> T): T {
        var r: Result<T>? = null
        val lock = Object()
        main.post { r = runCatching(block); synchronized(lock) { lock.notifyAll() } }
        synchronized(lock) { val end = SystemClock.uptimeMillis() + 5000; while (r == null && SystemClock.uptimeMillis() < end) lock.wait(200) }
        return (r ?: throw IllegalStateException("app busy")).getOrThrow()
    }

    private fun touch(a: Activity, action: Int, down: Long, x: Float, y: Float) {
        val e = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0)
        a.window.decorView.dispatchTouchEvent(e); e.recycle()
    }

    /** The whole allowlist. Each action touches only this app's own window. */
    private fun exec(ctx: Context, action: String, a: JSONObject): Any {
        val x = a.optDouble("x", 0.0).coerceIn(0.0, 8000.0).toFloat(); val y = a.optDouble("y", 0.0).coerceIn(0.0, 8000.0).toFloat()
        when (action) {
            "tap", "click" -> onMain {
                val act = activity ?: throw IllegalStateException("app not in front")
                val t = SystemClock.uptimeMillis(); touch(act, MotionEvent.ACTION_DOWN, t, x, y); touch(act, MotionEvent.ACTION_UP, t, x, y)
            }
            "swipe", "scroll", "pointer" -> {
                val x2 = if (a.has("x2")) a.optDouble("x2").toFloat() else x + a.optDouble("dx", 0.0).toFloat()
                val y2 = if (a.has("y2")) a.optDouble("y2").toFloat() else y + a.optDouble("dy", 0.0).toFloat()
                val t = SystemClock.uptimeMillis(); val n = 12
                onMain { touch(activity ?: throw IllegalStateException("app not in front"), MotionEvent.ACTION_DOWN, t, x, y) }
                for (i in 1..n) { Thread.sleep(16); onMain { touch(activity ?: return@onMain, MotionEvent.ACTION_MOVE, t, x + (x2 - x) * i / n, y + (y2 - y) * i / n) } }
                onMain { touch(activity ?: return@onMain, MotionEvent.ACTION_UP, t, x2, y2) }
            }
            "key" -> {
                val k = KEYS[a.optString("key").lowercase()] ?: throw IllegalArgumentException("key not allowed")
                onMain { val act = activity ?: throw IllegalStateException("app not in front")
                    act.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, k)); act.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, k)) }
            }
            "setting" -> {
                val k = a.optString("key"); val e = prefs(ctx).edit()
                when {
                    k in BOOL -> e.putBoolean(k, a.getBoolean("value"))
                    k in FLOAT -> e.putFloat(k, a.getDouble("value").toFloat())
                    else -> throw IllegalArgumentException("setting not allowed: ${k.take(40)}")
                }
                e.commit(); Prefs.init(ctx, force = true); Engine.applyPrefs()
            }
            "snapshot" -> return onMain { val v = activity?.window?.decorView; JSONObject().put("w", v?.width ?: 0).put("h", v?.height ?: 0).put("tab", TabManager.current?.url ?: "") }
            else -> throw IllegalArgumentException("unknown action")
        }
        return true
    }
}
