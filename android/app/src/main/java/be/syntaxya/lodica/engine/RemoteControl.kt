package be.syntaxya.lodica.engine

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityEvent
import org.json.JSONObject

/**
 * Lets the linked desktop browser control this phone while the screen is shared. The user switches it on in
 * Android Settings > Accessibility. It reads no screen content: it only performs the taps, swipes and system keys
 * that [ScreenShare] fetches from the server.
 */
class RemoteControl : AccessibilityService() {
    override fun onServiceConnected() { instance = this }
    override fun onUnbind(intent: android.content.Intent?): Boolean { if (instance === this) instance = null; return super.onUnbind(intent) }
    override fun onAccessibilityEvent(e: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    private fun perform(e: JSONObject) {
        val m = resources.displayMetrics
        val w = m.widthPixels.toFloat()
        val h = m.heightPixels.toFloat()
        when (e.optString("t")) {
            "tap", "swipe" -> {
                val x = (e.optDouble("x") * w).toFloat()
                val y = (e.optDouble("y") * h).toFloat()
                val path = Path().apply { moveTo(x, y) }
                if (e.optString("t") == "swipe") path.lineTo((e.optDouble("x2") * w).toFloat(), (e.optDouble("y2") * h).toFloat())
                else path.lineTo(x + 0.1f, y) // a zero length path is refused on some versions
                val ms = e.optLong("ms", 50).coerceIn(10L, 2000L)
                runCatching { dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, ms)).build(), null, null) }
            }
            "key" -> when (e.optString("key")) {
                "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
                "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
                "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
                "notifications" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
            }
        }
    }

    companion object {
        @Volatile private var instance: RemoteControl? = null
        val enabled: Boolean get() = instance != null

        /** Runs one event from the server. Ignored when the service is off. */
        fun run(e: JSONObject) { instance?.perform(e) }
    }
}
