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

/** The Lodica mark drawn in the theme's colours (the launcher icon cannot be recoloured at runtime, so widgets draw their own). */
internal fun kiteBitmap(p: be.syntaxya.lodica.ui.theme.Palette): Bitmap {
    val n = 128
    val bmp = Bitmap.createBitmap(n, n, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val k = n / Mark.H * 0.92f
    c.translate((n - Mark.W * k) / 2 - Mark.X * k, (n - Mark.H * k) / 2 - Mark.Y * k)
    c.scale(k, k, 0f, 0f)
    c.drawPath(androidx.core.graphics.PathParser.createPathFromPathData(Mark.BODY), Paint(Paint.ANTI_ALIAS_FLAG).apply { color = p.text.toInt() })
    c.drawPath(androidx.core.graphics.PathParser.createPathFromPathData(Mark.BAR), Paint(Paint.ANTI_ALIAS_FLAG).apply { color = p.accent.toInt() })
    return bmp
}

private val SLOTS = intArrayOf(R.id.s0, R.id.s1, R.id.s2, R.id.s3)

/** Draws the rounded backdrop at the widget's real pixel size so corners stay round at any size. */
internal fun roundedBackground(ctx: Context, m: AppWidgetManager, id: Int, alpha: Float = 1f): Bitmap {
    val d = ctx.resources.displayMetrics.density
    val o = m.getAppWidgetOptions(id)
    val w = ((o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH).takeIf { it > 0 } ?: 250) * d).toInt().coerceIn(64, 2048)
    val h = ((o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT).takeIf { it > 0 } ?: 56) * d).toInt().coerceIn(32, 512)
    val radius = when (Prefs.widgetShape) { "square" -> 8f * d; "rounded" -> 28f * d; else -> h / 2f }.coerceAtMost(h / 2f)
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    Canvas(bmp).drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ThemeState.palette.raised.toInt(); this.alpha = (alpha.coerceIn(0f, 1f) * 255).toInt() })
    return bmp
}

private fun refreshAll(ctx: Context, cls: Class<*>, build: (Context, AppWidgetManager, Int) -> RemoteViews) {
    val m = AppWidgetManager.getInstance(ctx)
    m.getAppWidgetIds(ComponentName(ctx, cls)).forEach { m.updateAppWidget(it, build(ctx, m, it)) }
}

/** Four buttons: new tab, server chat, inbox, settings. */
class ShortcutsWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, build(ctx, manager, it)) }
    }

    override fun onAppWidgetOptionsChanged(ctx: Context, manager: AppWidgetManager, id: Int, options: android.os.Bundle) {
        manager.updateAppWidget(id, build(ctx, manager, id))
    }

    companion object {
        const val ACTION_SHORTCUT = "be.syntaxya.lodica.SHORTCUT"
        const val EXTRA_TO = "to"
        private val ITEMS = listOf("New tab" to "newtab", "Chat" to "chat", "Inbox" to "inbox", "Settings" to "settings")

        fun refresh(ctx: Context) = refreshAll(ctx, ShortcutsWidget::class.java, ::build)

        private fun build(ctx: Context, m: AppWidgetManager, id: Int): RemoteViews {
            val rv = RemoteViews(ctx.packageName, R.layout.widget_shortcuts)
            rv.setImageViewBitmap(R.id.widget_bg, roundedBackground(ctx, m, id))
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
        ids.forEach { manager.updateAppWidget(it, build(ctx, manager, it)) }
    }

    override fun onAppWidgetOptionsChanged(ctx: Context, manager: AppWidgetManager, id: Int, options: android.os.Bundle) {
        manager.updateAppWidget(id, build(ctx, manager, id))
    }

    companion object {
        fun refresh(ctx: Context) = refreshAll(ctx, SitesWidget::class.java, ::build)

        private fun build(ctx: Context, m: AppWidgetManager, id: Int): RemoteViews {
            val rv = RemoteViews(ctx.packageName, R.layout.widget_sites)
            rv.setImageViewBitmap(R.id.widget_bg, roundedBackground(ctx, m, id))
            val sites = Prefs.quickList().take(4)
            SLOTS.forEachIndexed { i, slot ->
                val s = sites.getOrNull(i)
                val name = s?.let { it.second.ifEmpty { Uri.parse(it.first).host.orEmpty().removePrefix("www.") } }.orEmpty()
                rv.setTextViewText(slot, if (s == null && i == 0) "Add quick sites in the app" else name)
                rv.setTextColor(slot, ThemeState.palette.muted.toInt())
                if (s != null) {
                    val intent = Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
                        .setData(Uri.parse(s.first)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    rv.setOnClickPendingIntent(
                        slot,
                        PendingIntent.getActivity(ctx, 200 + i, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE),
                    )
                }
            }
            return rv
        }
    }
}
