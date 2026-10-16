package be.syntaxya.lodica.ui

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.widget.RemoteViews
import be.syntaxya.lodica.R
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.theme.ThemeState

private val SLOTS = intArrayOf(R.id.s0, R.id.s1, R.id.s2, R.id.s3)

private fun background(rv: RemoteViews) {
    val p = ThemeState.palette
    val h = 120f
    val radius = when (Prefs.widgetShape) { "square" -> 8f; "rounded" -> 28f; else -> h / 2 }
    val bmp = Bitmap.createBitmap(720, h.toInt(), Bitmap.Config.ARGB_8888)
    Canvas(bmp).drawRoundRect(RectF(0f, 0f, 720f, h), radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = p.raised.toInt() })
    rv.setImageViewBitmap(R.id.widget_bg, bmp)
}

private fun refreshAll(ctx: Context, cls: Class<*>, build: (Context) -> RemoteViews) {
    val m = AppWidgetManager.getInstance(ctx)
    m.getAppWidgetIds(ComponentName(ctx, cls)).forEach { m.updateAppWidget(it, build(ctx)) }
}

/** Four buttons: new tab, server chat, inbox, settings. */
class ShortcutsWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, build(ctx)) }
    }

    companion object {
        const val ACTION_SHORTCUT = "be.syntaxya.lodica.SHORTCUT"
        const val EXTRA_TO = "to"
        private val ITEMS = listOf("New tab" to "newtab", "Chat" to "chat", "Inbox" to "inbox", "Settings" to "settings")

        fun refresh(ctx: Context) = refreshAll(ctx, ShortcutsWidget::class.java, ::build)

        private fun build(ctx: Context): RemoteViews {
            val rv = RemoteViews(ctx.packageName, R.layout.widget_shortcuts)
            background(rv)
            ITEMS.forEachIndexed { i, (label, to) ->
                rv.setTextViewText(SLOTS[i], label)
                rv.setTextColor(SLOTS[i], ThemeState.palette.muted.toInt())
                val intent = Intent(ctx, MainActivity::class.java).setAction(ACTION_SHORTCUT)
                    .putExtra(EXTRA_TO, to).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                rv.setOnClickPendingIntent(
                    SLOTS[i],
                    PendingIntent.getActivity(ctx, 100 + i, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE),
                )
            }
            return rv
        }
    }
}

/** The first four quick sites from the start page. */
class SitesWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, build(ctx)) }
    }

    companion object {
        fun refresh(ctx: Context) = refreshAll(ctx, SitesWidget::class.java, ::build)

        private fun build(ctx: Context): RemoteViews {
            val rv = RemoteViews(ctx.packageName, R.layout.widget_sites)
            background(rv)
            val sites = Prefs.quickList().take(4)
            SLOTS.forEachIndexed { i, id ->
                val s = sites.getOrNull(i)
                val name = s?.let { it.second.ifEmpty { Uri.parse(it.first).host.orEmpty().removePrefix("www.") } }.orEmpty()
                rv.setTextViewText(id, if (s == null && i == 0) "Add quick sites in the app" else name)
                rv.setTextColor(id, ThemeState.palette.muted.toInt())
                if (s != null) {
                    val intent = Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
                        .setData(Uri.parse(s.first)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    rv.setOnClickPendingIntent(
                        id,
                        PendingIntent.getActivity(ctx, 200 + i, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE),
                    )
                }
            }
            return rv
        }
    }
}
