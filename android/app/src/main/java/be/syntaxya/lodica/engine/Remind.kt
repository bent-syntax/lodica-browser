package be.syntaxya.lodica.engine

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import be.syntaxya.lodica.R
import be.syntaxya.lodica.ui.MainActivity
import java.util.Calendar

/** "Remind me" for a page: an inexact alarm, at a preset or any picked date and time, that posts a notification which reopens the URL. */
object Remind {
    private const val CHANNEL = "remind"
    private const val EXTRA_URL = "url"
    private const val EXTRA_TITLE = "title"

    enum class When(val label: String) { Hour("In 1 hour"), Evening("This evening (19:00)"), Morning("Tomorrow 9:00") }

    fun at(w: When, now: Long = System.currentTimeMillis()): Long = when (w) {
        When.Hour -> now + 60 * 60 * 1000L
        else -> Calendar.getInstance().apply {
            timeInMillis = now
            if (w == When.Morning) add(Calendar.DAY_OF_YEAR, 1)
            set(Calendar.HOUR_OF_DAY, if (w == When.Morning) 9 else 19)
            set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            // Already past 19:00: this evening means in an hour.
            if (timeInMillis <= now) timeInMillis = now + 60 * 60 * 1000L
        }.timeInMillis
    }

    fun schedule(ctx: Context, url: String, title: String, w: When) = schedule(ctx, url, title, at(w))

    fun schedule(ctx: Context, url: String, title: String, at: Long) {
        val app = ctx.applicationContext
        val i = Intent(app, RemindReceiver::class.java).putExtra(EXTRA_URL, url).putExtra(EXTRA_TITLE, title)
        val pi = PendingIntent.getBroadcast(app, url.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        // Inexact on purpose: no exact-alarm permission needed, and a few minutes late is fine for a reminder.
        app.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }

    @SuppressLint("MissingPermission")
    internal fun fire(ctx: Context, i: Intent) {
        val url = i.getStringExtra(EXTRA_URL) ?: return
        val title = i.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { url }
        val nm = NotificationManagerCompat.from(ctx)
        if (!nm.areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 26) {
            ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "Page reminders", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
        val open = Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(url))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(ctx, url.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        nm.notify(
            "remind", url.hashCode(),
            NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_mail)
                .setColor(0xFFF59E0B.toInt())
                .setContentTitle("Reminder")
                .setContentText(title)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build(),
        )
    }
}

class RemindReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, i: Intent) = Remind.fire(ctx, i)
}
