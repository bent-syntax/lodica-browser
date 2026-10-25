package be.syntaxya.lodica.engine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import be.syntaxya.lodica.R
import be.syntaxya.lodica.ui.MainActivity
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Shares the phone screen with the desktop browser through the server. The user starts it in
 * Settings > Server, chat & mail and confirms the system screen capture dialog each time.
 * About five small JPEG frames a second go to the server, which keeps only the newest one in memory.
 * A foreground service of type mediaProjection keeps it alive and shows an ongoing notification with a Stop button.
 */
class ScreenShare : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var loop: Job? = null

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(i: Intent?, flags: Int, startId: Int): Int {
        if (i?.action == STOP) { shutdown(); return START_NOT_STICKY }
        val code = i?.getIntExtra(CODE, 0) ?: 0
        @Suppress("DEPRECATION")
        val grant = i?.getParcelableExtra<Intent>(GRANT)
        // The grant is single use, so a restarted service has nothing to capture with.
        if (grant == null || code == 0 || !Relay.available || !goForeground()) { shutdown(); return START_NOT_STICKY }
        if (loop?.isActive == true) return START_NOT_STICKY
        val mp = runCatching { getSystemService(MediaProjectionManager::class.java).getMediaProjection(code, grant) }.getOrNull()
        if (mp == null) { shutdown(); return START_NOT_STICKY }
        projection = mp
        mp.registerCallback(object : MediaProjection.Callback() { override fun onStop() { shutdown() } }, Handler(Looper.getMainLooper()))
        val m = resources.displayMetrics
        val w = minOf(WIDTH, m.widthPixels) and 1.inv()
        val h = (m.heightPixels.toLong() * w / m.widthPixels).toInt() and 1.inv()
        val r = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
        reader = r
        display = mp.createVirtualDisplay("lodica-share", w, h, m.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            r.surface, null, null)
        running = true
        loop = scope.launch { send(r, w, h) }
        return START_NOT_STICKY
    }

    override fun onDestroy() { teardown(); super.onDestroy() }

    private fun shutdown() { teardown(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }

    private fun teardown() {
        val was = running
        running = false
        loop?.cancel(); loop = null
        runCatching { display?.release() }; display = null
        runCatching { reader?.close() }; reader = null
        runCatching { projection?.stop() }; projection = null
        scope.coroutineContext[Job]?.cancel()
        // Tells the server to drop the last frame so the desktop shows "not sharing" right away.
        if (was) Thread { runCatching { Relay.request("DELETE", "/api/screen") } }.start()
    }

    private fun goForeground(): Boolean {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(
            NotificationChannel(CH, "Screen sharing", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, ScreenShare::class.java).setAction(STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n: Notification = NotificationCompat.Builder(this, CH)
            .setSmallIcon(R.drawable.ic_stat_mail).setContentTitle("Sharing your screen")
            .setContentText("Your linked browser can see this screen.")
            .setOngoing(true).setSilent(true).setContentIntent(open)
            .addAction(0, "Stop", stop).build()
        return try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
            else startForeground(ID, n)
            true
        } catch (e: Exception) { false }
    }

    /** Sends the newest frame about five times a second, and the last one again every few seconds while the screen is still. */
    private suspend fun send(r: ImageReader, w: Int, h: Int) {
        Relay.init(applicationContext)
        var jpeg: ByteArray? = null
        var sentAt = 0L
        var fails = 0
        while (scope.isActive) {
            delay(200)
            val img = runCatching { r.acquireLatestImage() }.getOrNull()
            if (img != null) {
                try {
                    val p = img.planes[0]
                    val pad = p.rowStride - p.pixelStride * w
                    val bmp = Bitmap.createBitmap(w + pad / p.pixelStride, h, Bitmap.Config.ARGB_8888)
                    bmp.copyPixelsFromBuffer(p.buffer)
                    val out = ByteArrayOutputStream()
                    Bitmap.createBitmap(bmp, 0, 0, w, h).compress(Bitmap.CompressFormat.JPEG, QUALITY, out)
                    bmp.recycle()
                    jpeg = out.toByteArray()
                } finally { img.close() }
            }
            val data = jpeg ?: continue
            val now = System.currentTimeMillis()
            if (img == null && now - sentAt < KEEP_ALIVE_MS) continue
            // The server refuses frames over 1 MB.
            if (data.size > 1_000_000) { jpeg = null; continue }
            try {
                val (code, _) = Relay.request("PUT", "/api/screen", data, "image/jpeg")
                if (code !in 200..299) throw java.io.IOException("status $code")
                fails = 0; sentAt = now
            } catch (e: Exception) {
                if (!scope.isActive) return
                if (++fails >= MAX_FAILS) { Handler(Looper.getMainLooper()).post { shutdown() }; return }
                delay(1_000)
            }
        }
    }

    companion object {
        private const val CH = "screen-share"
        private const val ID = 78
        private const val STOP = "be.syntaxya.lodica.SCREEN_STOP"
        private const val CODE = "code"
        private const val GRANT = "grant"
        private const val WIDTH = 720
        private const val QUALITY = 55
        private const val KEEP_ALIVE_MS = 4_000L
        private const val MAX_FAILS = 10
        @Volatile var running = false; private set

        /** The system dialog that asks the user to allow capturing the screen. */
        fun consentIntent(ctx: Context): Intent = ctx.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent()

        /** Starts sharing with the result of [consentIntent]. */
        fun start(ctx: Context, resultCode: Int, grant: Intent) {
            runCatching {
                ContextCompat.startForegroundService(ctx, Intent(ctx, ScreenShare::class.java).putExtra(CODE, resultCode).putExtra(GRANT, grant))
            }
        }

        fun stop(ctx: Context) { ctx.stopService(Intent(ctx, ScreenShare::class.java)) }
    }
}
