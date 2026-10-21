package be.syntaxya.lodica.engine

import android.opengl.EGL14
import android.opengl.GLES20
import android.view.Choreographer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** Hidden scroll diagnostics: GPU info and live frame times. */
object Diag {
    var overlay by mutableStateOf(false)
    var stats by mutableStateOf("")
    private var last = 0L
    private var n = 0
    private var slow = 0
    private var worst = 0L
    private var winStart = 0L
    private var running = false
    private val cb = object : Choreographer.FrameCallback {
        override fun doFrame(t: Long) {
            if (last != 0L) {
                val d = t - last
                n++
                if (d > 20_000_000L) slow++
                if (d > worst) worst = d
            }
            last = t
            if (winStart == 0L) winStart = t
            if (t - winStart >= 1_000_000_000L) {
                stats = "fps ${n} slow>20ms $slow worst ${worst / 1_000_000}ms"
                n = 0; slow = 0; worst = 0; winStart = t
            }
            if (overlay) Choreographer.getInstance().postFrameCallback(this) else { running = false; last = 0; winStart = 0 }
        }
    }

    fun enableOverlay(on: Boolean) {
        overlay = on
        if (on && !running) { running = true; Choreographer.getInstance().postFrameCallback(cb) }
    }

    /** GL vendor/renderer read through a throwaway EGL context. */
    fun gpu(): String = runCatching {
        val d = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        val v = IntArray(2); EGL14.eglInitialize(d, v, 0, v, 1)
        val cfg = arrayOfNulls<android.opengl.EGLConfig>(1); val nc = IntArray(1)
        EGL14.eglChooseConfig(d, intArrayOf(EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_NONE), 0, cfg, 0, 1, nc, 0)
        val ctx = EGL14.eglCreateContext(d, cfg[0], EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
        val sf = EGL14.eglCreatePbufferSurface(d, cfg[0], intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0)
        EGL14.eglMakeCurrent(d, sf, sf, ctx)
        val s = GLES20.glGetString(GLES20.GL_VENDOR) + " / " + GLES20.glGetString(GLES20.GL_RENDERER)
        EGL14.eglMakeCurrent(d, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
        EGL14.eglDestroySurface(d, sf); EGL14.eglDestroyContext(d, ctx)
        s
    }.getOrDefault("unknown")
}
