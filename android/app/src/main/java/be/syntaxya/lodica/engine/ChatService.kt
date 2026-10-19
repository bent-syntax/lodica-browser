package be.syntaxya.lodica.engine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import be.syntaxya.lodica.R
import be.syntaxya.lodica.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Foreground service that keeps one long poll open per chat room, so messages arrive in seconds instead of
 * at the 15-minute WorkManager interval. It shows a silent, minimised status notification (Android requires one).
 * The periodic job stays as a fallback and skips its chat check while this service runs.
 */
class ChatService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val loops = HashMap<String, Job>()
    private var super_: Job? = null

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(i: Intent?, flags: Int, startId: Int): Int {
        if (!goForeground()) { stopSelf(); return START_NOT_STICKY }
        running = true
        if (super_?.isActive != true) super_ = scope.launch { supervise() }
        return START_STICKY
    }

    override fun onDestroy() { running = false; scope.coroutineContext[Job]?.cancel(); super.onDestroy() }

    private fun goForeground(): Boolean {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(
            NotificationChannel(CH, "Live chat connection", NotificationManager.IMPORTANCE_MIN).apply { setShowBadge(false) })
        val pi = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n: Notification = NotificationCompat.Builder(this, CH)
            .setSmallIcon(R.drawable.ic_stat_mail).setContentTitle("Lodica chat is connected")
            .setContentText("Keeps messages arriving right away. Turn off in Settings.")
            .setPriority(NotificationCompat.PRIORITY_MIN).setOngoing(true).setSilent(true).setContentIntent(pi).build()
        return try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING)
            else startForeground(ID, n)
            true
        } catch (e: Exception) { false }
    }

    /** Keeps one loop per room (the shared room plus saved chats) and re-reads the room list every minute. */
    private suspend fun supervise() {
        Relay.init(applicationContext)
        Room.resumeOutbox(applicationContext)
        while (scope.isActive) {
            if (!Relay.available || !Prefs.liveChat) { stopSelf(); return }
            val want = listOf("") + Room.savedChats(applicationContext)
            for (r in want) if (loops[r]?.isActive != true) loops[r] = scope.launch { poll(r) }
            for (r in loops.keys.toList()) if (r !in want) loops.remove(r)?.cancel()
            delay(60_000)
        }
    }

    private suspend fun poll(room: String) {
        val ctx = applicationContext
        val sp = ctx.getSharedPreferences("notifier", Context.MODE_PRIVATE)
        var last = sp.getLong("chatLast", -1L)
        while (scope.isActive) {
            try {
                val rq = if (room.isEmpty()) "" else "&room=" + java.net.URLEncoder.encode(room, "UTF-8")
                val q = if (last < 0) "?" + rq.drop(1) else "?after=$last&wait=20$rq"
                val (code, body) = Relay.request("GET", "/api/chat$q", readTimeoutMs = 35_000)
                if (code != 200) throw java.io.IOException("status $code")
                val o = JSONObject(body)
                val first = last < 0
                val srv = o.optLong("last", last)
                // The relay keeps ids in memory: after a restart they start again from 0, so a cursor ahead of the server is stale.
                if (srv < last) { last = srv; sp.edit().putLong("chatLast", srv).apply(); continue }
                last = srv
                if (sp.getLong("chatLast", -1L) < last) sp.edit().putLong("chatLast", last).apply()
                if (first) continue
                val arr = o.optJSONArray("messages") ?: continue
                Notifier.chatArrived(ctx, room, (0 until arr.length()).map { arr.getJSONObject(it) })
            } catch (e: Exception) {
                if (!scope.isActive) return
                delay(5_000)
            }
        }
    }

    companion object {
        private const val CH = "chat-live"
        private const val ID = 77
        @Volatile var running = false; private set

        fun start(ctx: Context) {
            if (!Prefs.liveChat) return
            runCatching { ContextCompat.startForegroundService(ctx, Intent(ctx, ChatService::class.java)) }
        }

        fun stop(ctx: Context) { ctx.stopService(Intent(ctx, ChatService::class.java)) }

        fun ignoringBattery(ctx: Context) =
            ctx.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(ctx.packageName)

        /** Intent for the system dialog that exempts Lodica from battery optimisation. */
        fun batteryIntent(ctx: Context) = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}
