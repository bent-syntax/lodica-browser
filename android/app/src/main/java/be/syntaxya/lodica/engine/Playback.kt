package be.syntaxya.lodica.engine

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.MediaSession
import be.syntaxya.lodica.R
import be.syntaxya.lodica.ui.MainActivity

/**
 * Background audio. While a page has an active media session, a media-playback foreground service keeps
 * the process alive after the app is left, and its notification offers play/pause and stop.
 */
object Playback : MediaSession.Delegate {
    private const val TAG = "LodicaPlayback"
    private lateinit var app: Context
    private var media: MediaSession? = null
    internal var title = ""
    internal var playing = false

    fun init(ctx: Context) { app = ctx.applicationContext }

    override fun onActivated(session: GeckoSession, mediaSession: MediaSession) { media = mediaSession }

    override fun onDeactivated(session: GeckoSession, mediaSession: MediaSession) {
        if (media !== mediaSession) return
        media = null; playing = false
        app.stopService(Intent(app, PlaybackService::class.java))
    }

    override fun onMetadata(session: GeckoSession, mediaSession: MediaSession, meta: MediaSession.Metadata) {
        if (media !== mediaSession) return
        title = listOfNotNull(meta.title, meta.artist).filter { it.isNotBlank() }.joinToString(" · ")
        if (playing) refresh()
    }

    override fun onPlay(session: GeckoSession, mediaSession: MediaSession) {
        media = mediaSession; playing = true; refresh()
    }

    override fun onPause(session: GeckoSession, mediaSession: MediaSession) {
        if (media !== mediaSession) return
        playing = false; refresh()
    }

    override fun onStop(session: GeckoSession, mediaSession: MediaSession) = onDeactivated(session, mediaSession)

    private fun refresh() {
        // Android 12+ refuses to start a foreground service from the background; the page keeps playing
        // as long as the process lives, so failing here only loses the notification.
        try { ContextCompat.startForegroundService(app, Intent(app, PlaybackService::class.java)) }
        catch (e: Exception) { Log.w(TAG, "playback service not started: ${e.javaClass.simpleName}") }
    }

    internal fun toggle() { media?.let { if (playing) it.pause() else it.play() } }
    internal fun stop() { media?.stop() }
}

class PlaybackService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TOGGLE -> Playback.toggle()
            ACTION_STOP -> { Playback.stop(); stopSelf(); return START_NOT_STICKY }
        }
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "Media playback", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        fun action(a: String) = PendingIntent.getService(
            this, a.hashCode(), Intent(this, PlaybackService::class.java).setAction(a),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_mail)
            .setContentTitle(Playback.title.ifBlank { "Playing in Lodica" })
            .setContentText(if (Playback.playing) "Playing" else "Paused")
            .setContentIntent(open)
            .setOngoing(Playback.playing)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, if (Playback.playing) "Pause" else "Play", action(ACTION_TOGGLE))
            .addAction(0, "Stop", action(ACTION_STOP))
            .build()
        val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        ServiceCompat.startForeground(this, ID, n, type)
        return START_NOT_STICKY
    }

    companion object {
        private const val CHANNEL = "playback"
        private const val ID = 4207
        private const val ACTION_TOGGLE = "be.syntaxya.lodica.TOGGLE"
        private const val ACTION_STOP = "be.syntaxya.lodica.STOP"
    }
}
