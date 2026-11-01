package be.syntaxya.lodica.engine

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import be.syntaxya.lodica.R
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.MainActivity
import org.mozilla.geckoview.WebNotification
import org.mozilla.geckoview.WebNotificationDelegate
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Shows web page notifications (the Notification API) as Android notifications. Without this
 * delegate GeckoView drops them even when the site was allowed to notify. A tap opens Lodica on
 * the tab that sent it and tells the page it was clicked. Push messages from closed sites are not
 * supported.
 */
object SiteNotify : WebNotificationDelegate {
    private const val CHANNEL = "sites"
    const val ACTION_OPEN = "be.syntaxya.lodica.OPEN_SITE_NOTIFICATION"
    const val EXTRA_KEY = "key"
    const val EXTRA_SOURCE = "source"
    private const val TAG = "site"
    private const val MAX_BYTES = 1 shl 20

    private lateinit var app: Context
    private val live = HashMap<String, WebNotification>()
    private val main = Handler(Looper.getMainLooper())
    private var seq = 0

    fun init(ctx: Context) { app = ctx.applicationContext }

    private fun key(n: WebNotification) = (n.source.orEmpty() + "|" + n.tag).let { if (n.tag.isEmpty()) it + "|" + (++seq) else it }

    private fun idOf(key: String) = key.hashCode()

    override fun onShowNotification(n: WebNotification) {
        if (!::app.isInitialized) return
        val nm = NotificationManagerCompat.from(app)
        if (!nm.areNotificationsEnabled()) return
        val k = key(n)
        synchronized(live) { live[k] = n }
        val img = n.imageUrl
        if (img.isNullOrEmpty() || n.privateBrowsing) post(n, k, null)
        else Thread { post(n, k, runCatching { icon(img) }.getOrNull()) }.start()
    }

    override fun onCloseNotification(n: WebNotification) {
        if (!::app.isInitialized) return
        val k = synchronized(live) { live.entries.firstOrNull { it.value === n }?.key } ?: return
        synchronized(live) { live.remove(k) }
        NotificationManagerCompat.from(app).cancel(TAG, idOf(k))
    }

    private fun host(source: String?) = runCatching { android.net.Uri.parse(source).host.orEmpty() }.getOrDefault("").removePrefix("www.")

    private fun post(n: WebNotification, k: String, icon: Bitmap?) {
        if (Build.VERSION.SDK_INT >= 26) {
            app.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(NotificationChannel(CHANNEL, "Site notifications", NotificationManager.IMPORTANCE_DEFAULT))
        }
        val h = host(n.source)
        val open = Intent(app, MainActivity::class.java).setAction(ACTION_OPEN)
            .putExtra(EXTRA_KEY, k).putExtra(EXTRA_SOURCE, n.source.orEmpty())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(app, idOf(k), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val text = n.text.orEmpty()
        val b = NotificationCompat.Builder(app, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_mail)
            .setColor(0xFFF59E0B.toInt())
            .setContentTitle(n.title.orEmpty().ifEmpty { h })
            .setContentText(text)
            .setSubText(h)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(!n.requireInteraction)
            .setSilent(n.silent)
        if (icon != null) b.setLargeIcon(icon)
        runCatching { NotificationManagerCompat.from(app).notify(TAG, idOf(k), b.build()) }
    }

    /** Called by MainActivity when the user taps a site notification. */
    fun clicked(key: String?, source: String?) {
        val n = key?.let { synchronized(live) { live.remove(it) } }
        val h = host(source)
        val tab = TabManager.tabs.toList().firstOrNull { it.url == source }
            ?: TabManager.tabs.toList().firstOrNull { h.isNotEmpty() && it.host == h }
        if (tab != null) TabManager.select(tab)
        else if (!source.isNullOrEmpty()) TabManager.open(source)
        n?.let { main.post { runCatching { it.click() } } }
    }

    private fun icon(u: String): Bitmap? {
        val url = URL(u)
        if (url.protocol != "https" && url.protocol != "http") return null
        val c = url.openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 4000; c.readTimeout = 4000
            if (c.responseCode != 200) return null
            val bytes = c.inputStream.use { ins ->
                val out = ByteArrayOutputStream()
                val buf = ByteArray(16384)
                while (true) {
                    val r = ins.read(buf); if (r < 0) break
                    out.write(buf, 0, r)
                    if (out.size() > MAX_BYTES) return null
                }
                out.toByteArray()
            }
            val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
            return Bitmap.createScaledBitmap(bmp, 128, 128, true)
        } finally { c.disconnect() }
    }
}
