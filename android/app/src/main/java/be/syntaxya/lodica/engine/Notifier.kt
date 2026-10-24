package be.syntaxya.lodica.engine

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import be.syntaxya.lodica.R
import be.syntaxya.lodica.ui.MainActivity
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Background notifications: a new browser version, and new messages in the server chat. A periodic
 * job (Android's minimum is 15 minutes) asks the relay once and posts what it finds.
 */
object Notifier {
    private const val UPDATES = "updates"
    private const val SUPPORT = "support"
    private const val CHAT = "chat"
    private const val CHAT_CH = "chat-high"
    private const val WORK = "lodica-notify"
    const val ACTION_OPEN = "be.syntaxya.lodica.OPEN_FROM_NOTIFICATION"
    const val EXTRA_TARGET = "target"
    const val TARGET_CHAT = CHAT

    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<NotifyWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx.applicationContext)
            .enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    fun enabled(ctx: Context) = NotificationManagerCompat.from(ctx).areNotificationsEnabled()

    /** Posts a sample chat notification so the user can see whether notifications reach them. */
    fun test(ctx: Context) = post(ctx, CHAT_CH, "Chat messages", "test", 90, "Lodica test notification", "If you can read this, chat notifications work.", high = true)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("notifier", Context.MODE_PRIVATE)

    internal fun post(ctx: Context, channel: String, channelName: String, tag: String, id: Int, title: String, text: String, high: Boolean = false) {
        val nm = NotificationManagerCompat.from(ctx)
        if (!nm.areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 26) {
            ctx.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(NotificationChannel(channel, channelName, if (high) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT))
        }
        val open = Intent(ctx, MainActivity::class.java).setAction(ACTION_OPEN)
            .putExtra(EXTRA_TARGET, if (channel == CHAT_CH) CHAT else channel)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        nm.notify(
            tag, id,
            NotificationCompat.Builder(ctx, channel)
                .setSmallIcon(R.drawable.ic_stat_mail)
                .setColor(0xFFF59E0B.toInt())
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .apply { if (high) priority = NotificationCompat.PRIORITY_HIGH }
                .build(),
        )
    }

    internal suspend fun run(ctx: Context) {
        Relay.init(ctx)
        if (!Relay.available) return
        runCatching { checkUpdate(ctx) }
        runCatching { Relay.request("GET", "/api/chat/users?name=" + Uri.encode(Room.name(ctx))) }
        runCatching { checkChat(ctx) }
        runCatching { Support.refresh(ctx, notify = true) }
    }

    fun supportSent(ctx: Context) =
        post(ctx, SUPPORT, "Support", "support", 91, "Message sent to support", "We got your message. You'll be notified here when there's an update or a question.")

    fun supportReply(ctx: Context, text: String, status: String) =
        post(ctx, SUPPORT, "Support", "support", 92, if (status == "done" || status == "awaiting-confirm") "Support: your issue is fixed" else if (status == "needs-info") "Support needs more information" else "Support replied", text)

    private suspend fun checkUpdate(ctx: Context) {
        val cur = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: return
        val (code, body) = Relay.request("GET", "/api/update/check?app=android&version=" + Uri.encode(cur))
        if (code != 200) return
        val o = JSONObject(body)
        if (!o.optBoolean("newer")) return
        val v = o.optString("version")
        val p = prefs(ctx)
        if (v.isBlank() || p.getString("updateSeen", null) == v) return
        p.edit().putString("updateSeen", v).apply()
        post(ctx, UPDATES, "App updates", "update", 1, "Lodica $v is available", "Open Settings to download the new version.")
    }

    /** Posts one notification for the messages in [room] that were not written by this device. */
    internal fun chatArrived(ctx: Context, room: String, all: List<JSONObject>) {
        // The chat screen only counts as open while the app is on screen; a chat left open in the background still notifies.
        val onScreen = androidx.lifecycle.ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)
        if (Room.listening && onScreen) return
        // No own-name filter: the same name is often used on several devices, and messages sent from this
        // device are only posted while the chat screen is open, which already suppresses notifications.
        val msgs = all
        if (msgs.isEmpty()) return
        val text = msgs.takeLast(5).joinToString("\n") { it.optString("name") + ": " + it.optString("text") }
        val where = if (room.isEmpty()) "server chat" else Room.label(ctx, room)
        val title = if (msgs.size == 1) "New message in $where" else "${msgs.size} new messages in $where"
        post(ctx, CHAT_CH, "Chat messages", "chat", 2 + (listOf("") + Room.savedChats(ctx)).indexOf(room).coerceAtLeast(0), title, text, high = true)
    }

    private suspend fun checkChat(ctx: Context) {
        if (ChatService.running) return
        val p = prefs(ctx)
        val last = p.getLong("chatLast", -1L)
        var newLast = last
        // The id counter is shared by all rooms, so one cursor serves the shared room and every private chat or group.
        for ((n, r) in (listOf("") + Room.savedChats(ctx)).withIndex()) {
            val rq = if (r.isEmpty()) "" else "&room=" + java.net.URLEncoder.encode(r, "UTF-8")
            val (code, body) = Relay.request("GET", "/api/chat?after=${maxOf(last, 0)}$rq")
            if (code != 200) continue
            val o = JSONObject(body)
            val srv = o.optLong("last", last)
            // Ids restart from 0 when the relay restarts, so a cursor ahead of the server is stale: resync without notifying.
            if (srv < last) { newLast = srv; continue }
            newLast = maxOf(newLast, srv)
            if (last < 0) continue
            val arr = o.optJSONArray("messages")
            chatArrived(ctx, r, (0 until (arr?.length() ?: 0)).map { arr!!.getJSONObject(it) })
        }
        if (newLast != last) p.edit().putLong("chatLast", newLast).apply()
    }
}

class NotifyWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        Notifier.run(applicationContext)
        return Result.success()
    }
}
