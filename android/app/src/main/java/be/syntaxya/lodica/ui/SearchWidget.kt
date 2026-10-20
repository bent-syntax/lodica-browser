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
        ids.forEach { manager.updateAppWidget(it, build(ctx, manager, it)) }
    }

    override fun onAppWidgetOptionsChanged(ctx: Context, manager: AppWidgetManager, id: Int, options: android.os.Bundle) {
        manager.updateAppWidget(id, build(ctx, manager, id))
    }

    companion object {
        const val ACTION_SEARCH = "be.syntaxya.lodica.NEW_SEARCH"

        /** Redraws every placed widget; call after the theme or widget settings change. */
        fun refresh(ctx: Context) {
            val m = AppWidgetManager.getInstance(ctx)
            val ids = m.getAppWidgetIds(ComponentName(ctx, SearchWidget::class.java))
            if (ids.isNotEmpty()) ids.forEach { m.updateAppWidget(it, build(ctx, m, it)) }
        }

        private fun build(ctx: Context, m: AppWidgetManager, id: Int): RemoteViews {
            val open = PendingIntent.getActivity(
                ctx, 0,
                Intent(ctx, MainActivity::class.java).setAction(ACTION_SEARCH).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val p = ThemeState.palette
            return RemoteViews(ctx.packageName, R.layout.widget_search).apply {
                setOnClickPendingIntent(R.id.widget_search, open)
                setImageViewBitmap(R.id.widget_bg, roundedBackground(ctx, m, id))
                setImageViewBitmap(R.id.widget_logo, kiteBitmap(p))
                setTextViewText(R.id.widget_text, Prefs.widgetText.ifBlank { "Search or type a URL" })
                setTextColor(R.id.widget_text, p.muted.toInt())
            }
        }
    }
}
