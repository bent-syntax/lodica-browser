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
import android.widget.RemoteViews
import be.syntaxya.lodica.R
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.theme.ThemeState

/**
 * Home-screen search bar. A tap opens Lodica on a new tab with the address bar focused.
 * Colours follow the app theme (including the user's own); the hint text and corner shape are set in Settings.
 */
class SearchWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, build(ctx)) }
    }

    companion object {
        const val ACTION_SEARCH = "be.syntaxya.lodica.NEW_SEARCH"

        /** Redraws every placed widget; call after the theme or widget settings change. */
        fun refresh(ctx: Context) {
            val m = AppWidgetManager.getInstance(ctx)
            val ids = m.getAppWidgetIds(ComponentName(ctx, SearchWidget::class.java))
            if (ids.isNotEmpty()) ids.forEach { m.updateAppWidget(it, build(ctx)) }
        }

        private fun build(ctx: Context): RemoteViews {
            val open = PendingIntent.getActivity(
                ctx, 0,
                Intent(ctx, MainActivity::class.java).setAction(ACTION_SEARCH).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val p = ThemeState.palette
            // The background is a small bitmap so the corner shape and theme colour work on every Android version.
            val h = 120f
            val radius = when (Prefs.widgetShape) { "square" -> 8f; "rounded" -> 28f; else -> h / 2 }
            val bmp = Bitmap.createBitmap(720, h.toInt(), Bitmap.Config.ARGB_8888)
            Canvas(bmp).drawRoundRect(RectF(0f, 0f, 720f, h), radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = p.raised.toInt() })
            return RemoteViews(ctx.packageName, R.layout.widget_search).apply {
                setOnClickPendingIntent(R.id.widget_search, open)
                setImageViewBitmap(R.id.widget_bg, bmp)
                setTextViewText(R.id.widget_text, Prefs.widgetText.ifBlank { "Search or type a URL" })
                setTextColor(R.id.widget_text, p.muted.toInt())
            }
        }
    }
}
