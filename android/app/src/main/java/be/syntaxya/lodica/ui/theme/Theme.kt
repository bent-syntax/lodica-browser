package be.syntaxya.lodica.ui.theme

import android.app.Activity
import android.content.ContextWrapper
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.core.view.WindowCompat
import be.syntaxya.lodica.engine.CustomTheme
import be.syntaxya.lodica.engine.Prefs

/** One browser UI colour set. Websites keep their own colours; this only paints the app chrome. */
class Palette(
    val key: String,
    val label: String,
    val dark: Boolean,
    val bg: Long,
    val raised: Long,
    val high: Long,
    val accent: Long,
    val accent2: Long,
    val text: Long,
    val muted: Long,
)

val Palettes: List<Palette> = listOf(
    Palette("dark", "Dark", true, 0xFF111827, 0xFF1F2937, 0xFF374151, 0xFFF59E0B, 0xFFF43F5E, 0xFFE5E7EB, 0xFF9CA3AF),
    Palette("light", "Light", false, 0xFFF9FAFB, 0xFFE5E7EB, 0xFFD1D5DB, 0xFFD97706, 0xFFE11D48, 0xFF111827, 0xFF6B7280),
    Palette("everforest_dark", "Everforest Dark", true, 0xFF2D353B, 0xFF343F44, 0xFF3D484D, 0xFFA7C080, 0xFFE67E80, 0xFFD3C6AA, 0xFF859289),
    Palette("everforest_light", "Everforest Light", false, 0xFFFDF6E3, 0xFFF4F0D9, 0xFFE6E2CC, 0xFF8DA101, 0xFFF85552, 0xFF5C6A72, 0xFF829181),
    Palette("nord", "Nord", true, 0xFF2E3440, 0xFF3B4252, 0xFF434C5E, 0xFF88C0D0, 0xFFBF616A, 0xFFECEFF4, 0xFF9AA5B8),
    Palette("gruvbox", "Gruvbox", true, 0xFF282828, 0xFF3C3836, 0xFF504945, 0xFFFABD2F, 0xFFFB4934, 0xFFEBDBB2, 0xFFA89984),
    Palette("catppuccin_mocha", "Catppuccin Mocha", true, 0xFF1E1E2E, 0xFF313244, 0xFF45475A, 0xFFCBA6F7, 0xFFF38BA8, 0xFFCDD6F4, 0xFFA6ADC8),
    Palette("tokyo_night", "Tokyo Night", true, 0xFF1A1B26, 0xFF24283B, 0xFF414868, 0xFF7AA2F7, 0xFFF7768E, 0xFFC0CAF5, 0xFF787C99),
    Palette("rose_pine", "Rose Pine", true, 0xFF191724, 0xFF1F1D2E, 0xFF2A2740, 0xFFEBBCBA, 0xFFEB6F92, 0xFFE0DEF4, 0xFF908CAA),
    Palette("solarized_dark", "Solarized Dark", true, 0xFF002B36, 0xFF073642, 0xFF124856, 0xFFB58900, 0xFFDC322F, 0xFFEEE8D5, 0xFF93A1A1),
)

private fun mix(a: Long, b: Long, t: Float): Long {
    fun ch(s: Int) = (((a shr s) and 0xFF) * (1 - t) + ((b shr s) and 0xFF) * t).toInt().coerceIn(0, 255).toLong()
    return 0xFF000000 or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
}

/** Builds a full palette from the four colours the user picked. */
fun customPalette(c: CustomTheme): Palette {
    fun px(h: String) = 0xFF000000 or h.removePrefix("#").toLong(16)
    val bg = px(c.bg); val text = px(c.text)
    val lum = (0.299 * ((bg shr 16) and 0xFF) + 0.587 * ((bg shr 8) and 0xFF) + 0.114 * (bg and 0xFF)) / 255
    return Palette("custom", "Custom", lum < 0.5, bg, mix(bg, text, 0.08f), mix(bg, text, 0.18f), px(c.accent), px(c.accent2), text, mix(bg, text, 0.6f))
}

/** Picker entries: "system" first, then every palette. */
val ThemeChoices: List<Pair<String, String>> = listOf("system" to "System") + Palettes.map { it.key to it.label }

object ThemeState {
    /** Mirrors the system night mode; written by LodicaTheme. Starts dark, the app's historical look. */
    var systemDark by mutableStateOf(true)

    val palette: Palette
        get() {
            if (Prefs.theme == "custom") Prefs.customTheme?.let { return customPalette(it) }
            val key = when (val k = Prefs.theme) {
                "system" -> if (systemDark) "dark" else "light"
                else -> k
            }
            return Palettes.firstOrNull { it.key == key } ?: Palettes[0]
        }
}

// The old fixed constants stay as getters so every call site follows the active theme. They read
// Compose state, so composables that use them recompose when the theme changes.
val Graphite: Color get() = Color(ThemeState.palette.bg)
val GraphiteRaised: Color get() = Color(ThemeState.palette.raised)
val GraphiteHigh: Color get() = Color(ThemeState.palette.high)
val Amber: Color get() = Color(ThemeState.palette.accent)
val Coral: Color get() = Color(ThemeState.palette.accent2)
val Mist: Color get() = Color(ThemeState.palette.text)
val Muted: Color get() = Color(ThemeState.palette.muted)

val KiteGradient: Brush get() = Brush.horizontalGradient(listOf(Amber, Coral))

private fun scheme(p: Palette) = if (p.dark) {
    darkColorScheme(
        primary = Color(p.accent), onPrimary = Color(p.bg),
        secondary = Color(p.accent2), onSecondary = Color.White,
        background = Color(p.bg), onBackground = Color(p.text),
        surface = Color(p.bg), onSurface = Color(p.text),
        surfaceVariant = Color(p.raised), onSurfaceVariant = Color(p.muted),
        surfaceContainer = Color(p.raised), surfaceContainerHigh = Color(p.raised),
        surfaceContainerHighest = Color(p.high), surfaceContainerLow = Color(p.bg),
        outline = Color(p.high), error = Color(p.accent2),
    )
} else {
    lightColorScheme(
        primary = Color(p.accent), onPrimary = Color.White,
        secondary = Color(p.accent2), onSecondary = Color.White,
        background = Color(p.bg), onBackground = Color(p.text),
        surface = Color(p.bg), onSurface = Color(p.text),
        surfaceVariant = Color(p.raised), onSurfaceVariant = Color(p.muted),
        surfaceContainer = Color(p.raised), surfaceContainerHigh = Color(p.raised),
        surfaceContainerHighest = Color(p.high), surfaceContainerLow = Color(p.bg),
        outline = Color(p.high), error = Color(p.accent2),
    )
}

@Composable
fun LodicaTheme(content: @Composable () -> Unit) {
    val sysDark = isSystemInDarkTheme()
    SideEffect { if (ThemeState.systemDark != sysDark) ThemeState.systemDark = sysDark }
    val p = ThemeState.palette
    val view = LocalView.current
    val appCtx = LocalContext.current.applicationContext
    LaunchedEffect(p.key, p.bg, p.accent) { withContext(Dispatchers.IO) { runCatching { LauncherIcon.apply(appCtx, p) } } }
    SideEffect {
        var c = view.context
        while (c is ContextWrapper && c !is Activity) c = c.baseContext
        (c as? Activity)?.window?.let {
            val ctl = WindowCompat.getInsetsController(it, view)
            ctl.isAppearanceLightStatusBars = !p.dark
            ctl.isAppearanceLightNavigationBars = !p.dark
        }
    }
    MaterialTheme(colorScheme = scheme(p), typography = Typography(), content = content)
}
