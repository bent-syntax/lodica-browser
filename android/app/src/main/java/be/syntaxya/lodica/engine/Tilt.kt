package be.syntaxya.lodica.engine

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.view.Choreographer
import android.view.View
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign
import kotlin.math.sin

/**
 * Tilt rotate: while the phone turns, the page turns the other way so it stays upright. The activity itself stays in portrait,
 * only the page view (and the start page over it) is rotated and scaled, so touches map through the view matrix and the page
 * is never laid out again. The sensor angle is eased towards the view once per frame instead of being applied at once.
 */
object Tilt : SensorEventListener {
    /** Page rotation and scale for Compose layers (the start page); the page view itself is moved directly. */
    var angle by mutableStateOf(0f); private set
    var zoomed by mutableStateOf(1f); private set

    /** Set by the page host: rotating a SurfaceView does not follow its parent, so the feature needs the texture backend. */
    var textureBackend = false

    /** On, and the page is drawn in a view that can rotate. */
    val active: Boolean get() = Prefs.tiltRotate && textureBackend

    private var x = 0f
    private var y = 0f
    private var w = 0
    private var h = 0
    private var deg = 0.0
    private var target = 0.0
    private var view: View? = null
    private var activity: Activity? = null
    private var running = false
    private var previous: Int? = null

    private val tick = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            if (!running) return
            if (abs(target - deg) > 0.02) { deg += (target - deg) * 0.2; apply() }
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    /** The page view that gets rotated; null when it is released. */
    fun attach(v: View?) {
        view = v
        apply()
    }

    /** Size of the area the page fills, from a layout listener. */
    fun size(width: Int, height: Int) {
        if (width == w && height == h) return
        w = width; h = height
        apply()
    }

    fun resume(a: Activity) {
        activity = a
        update()
    }

    fun pause() {
        stop()
        activity = null
    }

    /** Call after the setting changes: starts or stops the sensor and the portrait lock. */
    fun update() {
        val a = activity ?: return
        if (Prefs.tiltRotate) start(a) else {
            stop()
            reset()
            previous?.let { a.requestedOrientation = it }
            previous = null
        }
    }

    private fun start(a: Activity) {
        if (previous == null) previous = a.requestedOrientation
        a.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        if (running) return
        val sm = a.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
        val sensor = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
        sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
        running = true
        Choreographer.getInstance().postFrameCallback(tick)
    }

    private fun stop() {
        if (!running) return
        running = false
        Choreographer.getInstance().removeFrameCallback(tick)
        (activity?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager)?.unregisterListener(this)
    }

    private fun reset() {
        deg = 0.0; target = 0.0
        apply()
    }

    override fun onSensorChanged(e: SensorEvent) {
        x += 0.1f * (e.values[0] - x)
        y += 0.1f * (e.values[1] - y)
        if (hypot(x, y) < 4) return   // lying flat: no direction to follow
        val a = max(-90.0, min(90.0, Math.toDegrees(atan2(x.toDouble(), y.toDouble()))))
        // Nothing moves inside the dead zone; past it the turn maps linearly so the full 90 degrees is reached at 90.
        val dz = Prefs.tiltDeadZone / 100.0 * 90
        target = sign(a) * max(0.0, abs(a) - dz) * 90 / (90 - dz)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun apply() {
        val on = Prefs.tiltRotate && textureBackend
        val v = view
        if (!on || w == 0 || h == 0) {
            if (angle != 0f) angle = 0f
            if (zoomed != 1f) zoomed = 1f
            v?.let { if (it.rotation != 0f || it.scaleX != 1f || it.scaleY != 1f) { it.rotation = 0f; it.scaleX = 1f; it.scaleY = 1f } }
            return
        }
        val c = abs(cos(Math.toRadians(deg)))
        val s = abs(sin(Math.toRadians(deg)))
        val fit = min(1.0, min(w / (w * c + h * s), h / (w * s + h * c)))        // whole page visible, with borders
        val fill = max((w * c + h * s) / w, (w * s + h * c) / h)                // fills the screen, crops the edges
        val scale = (fit + Prefs.tiltZoom * (fill - fit)).toFloat()
        // Positive deg is a clockwise page rotation (checked on a phone).
        angle = deg.toFloat()
        zoomed = scale
        v?.let { it.rotation = deg.toFloat(); it.scaleX = scale; it.scaleY = scale }
    }
}
