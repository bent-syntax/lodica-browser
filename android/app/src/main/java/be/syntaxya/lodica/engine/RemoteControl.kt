package be.syntaxya.lodica.engine

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Path
import android.os.Bundle
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

/**
 * Lets the linked desktop browser control this phone while the screen is shared. The user switches it on in
 * Android Settings > Accessibility. It reads no screen content: it only performs the taps, swipes, system keys and
 * text that [ScreenShare] fetches from the server.
 */
class RemoteControl : AccessibilityService() {
    override fun onServiceConnected() {
        instance = this
        // Text needs the focused node; the manifest keeps gestures as the only default capability.
        runCatching {
            val info = serviceInfo ?: AccessibilityServiceInfo()
            info.flags = info.flags or AccessibilityServiceInfo.FLAG_RETRIEVE_WINDOW_CONTENT
            serviceInfo = info
        }
    }
    override fun onUnbind(intent: android.content.Intent?): Boolean { if (instance === this) instance = null; return super.onUnbind(intent) }
    override fun onAccessibilityEvent(e: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    /**
     * Gestures use the current Android display, while the shared frame keeps the geometry it had when capture started.
     * Rotate the frame fractions by the change in display rotation, then scale to the current displayMetrics. Nothing here
     * changes the phone's orientation.
     */
    private fun point(e: JSONObject, kx: String, ky: String): Pair<Float, Float> {
        val u = e.optDouble(kx, 0.0).coerceIn(0.0, 1.0).toFloat()
        val v = e.optDouble(ky, 0.0).coerceIn(0.0, 1.0).toFloat()
        val m = resources.displayMetrics
        val dw = m.widthPixels.toFloat().coerceAtLeast(1f)
        val dh = m.heightPixels.toFloat().coerceAtLeast(1f)
        if (ScreenShare.capturedWidth <= 0 || ScreenShare.capturedHeight <= 0) return u * dw to v * dh
        val turn = ((ScreenShare.rotation(this) - ScreenShare.capturedRotation) % 4 + 4) % 4
        val (x, y) = when (turn) {
            1 -> 1f - v to u       // phone turned 90° clockwise after capture
            2 -> 1f - u to 1f - v
            3 -> v to 1f - u       // 90° counter-clockwise
            else -> u to v
        }
        return x * dw to y * dh
    }

    private fun typeText(text: String) {
        var node: AccessibilityNodeInfo? = null
        try {
            node = findFocus(AccessibilityService.FOCUS_INPUT)
            val target = node ?: return
            val args = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        } finally { node?.recycle() }
    }

    private fun perform(e: JSONObject) {
        when (e.optString("t")) {
            "tap", "swipe" -> {
                val (x, y) = point(e, "x", "y")
                val path = Path().apply { moveTo(x, y) }
                if (e.optString("t") == "swipe") {
                    val (x2, y2) = point(e, "x2", "y2")
                    path.lineTo(x2, y2)
                } else path.lineTo(x + 0.1f, y) // a zero length path is refused on some versions
                val ms = e.optLong("ms", 50).coerceIn(10L, 2000L)
                runCatching { dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, ms)).build(), null, null) }
            }
            "key" -> when (e.optString("key")) {
                "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
                "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
                "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
                "notifications" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
            }
            "text" -> {
                val text = e.optString("text").take(500)
                if (text.isNotEmpty()) typeText(text)
            }
        }
    }

    companion object {
        @Volatile private var instance: RemoteControl? = null
        val enabled: Boolean get() = instance != null

        /** Runs one event from the server. Ignored when the service is off. */
        fun run(e: JSONObject) { instance?.perform(e) }

        /** Current display rotation, kept here so callers do not need their own deprecated Display lookup. */
        @Suppress("DEPRECATION")
        fun rotation(ctx: Context): Int = (ctx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.defaultDisplay?.rotation ?: 0
    }
}
