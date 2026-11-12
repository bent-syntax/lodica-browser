package be.syntaxya.lodica.ui.theme

import android.app.Activity
import android.content.ContextWrapper
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
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
    val danger: Long = accent2,
    /** 1px borders. */
    val line: Long = mix(bg, text, 0.14f),
    /** Private tabs. */
    val priv: Long = if (dark) 0xFFA79BFF else 0xFF5B4BDB,
    val ok: Long = if (dark) 0xFF5FCF8B else 0xFF157F3C,
    /** Accent used as text or icon colour; [accent] is for fills only. */
    val ink: Long = accent,
)

val Palettes: List<Palette> = listOf(
    Palette("dark", "Dark", true, 0xFF17181B, 0xFF202226, 0xFF2B2E33, 0xFFF59E0B, 0xFFF87185, 0xFFECEDEE, 0xFFA0A4AB, line = 0xFF33363C, ink = 0xFFF5A524),
    Palette("light", "Light", false, 0xFFECECEA, 0xFFFFFFFF, 0xFFF3F3F1, 0xFFF59E0B, 0xFFC81E3F, 0xFF1B1C1F, 0xFF5F636A, line = 0xFFDADAD6, ink = 0xFF9A4B08),
    Palette("everforest_dark", "Everforest Dark", true, 0xFF2D353B, 0xFF343F44, 0xFF3D484D, 0xFFA7C080, 0xFFE67E80, 0xFFD3C6AA, 0xFFA9AA98),
    Palette("everforest_light", "Everforest Light", false, 0xFFFDF6E3, 0xFFF4F0D9, 0xFFE6E2CC, 0xFF8DA101, 0xFFF85552, 0xFF5C6A72, 0xFF606E74),
    Palette("nord", "Nord", true, 0xFF2E3440, 0xFF3B4252, 0xFF434C5E, 0xFF88C0D0, 0xFFBF616A, 0xFFECEFF4, 0xFFA6B0C1),
    Palette("gruvbox", "Gruvbox", true, 0xFF282828, 0xFF3C3836, 0xFF504945, 0xFFFABD2F, 0xFFFB4934, 0xFFEBDBB2, 0xFFB0A18A),
    Palette("catppuccin_mocha", "Catppuccin Mocha", true, 0xFF1E1E2E, 0xFF313244, 0xFF45475A, 0xFFCBA6F7, 0xFFF38BA8, 0xFFCDD6F4, 0xFFA6ADC8),
    Palette("tokyo_night", "Tokyo Night", true, 0xFF1A1B26, 0xFF24283B, 0xFF414868, 0xFF7AA2F7, 0xFFF7768E, 0xFFC0CAF5, 0xFF898FAF),
    Palette("rose_pine", "Rose Pine", true, 0xFF191724, 0xFF1F1D2E, 0xFF2A2740, 0xFFEBBCBA, 0xFFEB6F92, 0xFFE0DEF4, 0xFF908CAA),
    Palette("solarized_dark", "Solarized Dark", true, 0xFF002B36, 0xFF073642, 0xFF124856, 0xFFB58900, 0xFFDC322F, 0xFFEEE8D5, 0xFF93A1A1),
)

fun mix(a: Long, b: Long, t: Float): Long {
    fun ch(s: Int) = (((a shr s) and 0xFF) * (1 - t) + ((b shr s) and 0xFF) * t).toInt().coerceIn(0, 255).toLong()
    return 0xFF000000 or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
}

private fun contrast(a: Long, b: Long): Float {
    val x = Color(a).luminance(); val y = Color(b).luminance()
    return (maxOf(x, y) + 0.05f) / (minOf(x, y) + 0.05f)
}

/** Moves a muted text colour toward the main text (or white/black) until it reads at 4.5:1 on both surfaces. */
private fun readableMuted(muted: Long, bg: Long, raised: Long, text: Long, dark: Boolean): Long {
    fun ok(m: Long) = contrast(m, bg) >= 4.55f && contrast(m, raised) >= 4.55f
    val target = if (ok(text)) text else if (dark) 0xFFFFFFFF else 0xFF000000
    var m = muted
    var i = 0
    while (!ok(m) && i < 100) { i++; m = mix(muted, target, i / 100f) }
    return m
}

/** Builds a full palette from the four colours the user picked. */
fun customPalette(c: CustomTheme): Palette {
    fun px(h: String) = 0xFF000000 or h.removePrefix("#").toLong(16)
    val bg = px(c.bg); val text = px(c.text)
    val lum = (0.299 * ((bg shr 16) and 0xFF) + 0.587 * ((bg shr 8) and 0xFF) + 0.114 * (bg and 0xFF)) / 255
    fun opt(k: String, d: Long) = c.extra[k]?.let { px(it) } ?: d
    val raised = opt("raised", mix(bg, text, 0.08f))
    return Palette("custom", "Custom", lum < 0.5, bg, raised, opt("high", mix(bg, text, 0.18f)), px(c.accent), px(c.accent2), text,
        c.extra["muted"]?.let { px(it) } ?: readableMuted(mix(bg, text, 0.6f), bg, raised, text, lum < 0.5), opt("danger", px(c.accent2)))
}

/** A colour from the active custom theme's optional extras (tab, startBg), or null when none is set. */
fun customExtraColor(key: String): Color? {
    if (be.syntaxya.lodica.engine.Prefs.theme != "custom") return null
    val h = be.syntaxya.lodica.engine.Prefs.customTheme?.extra?.get(key)?.removePrefix("#") ?: return null
    return runCatching { Color(0xFF000000 or h.toLong(16)) }.getOrNull()
}

/** The pattern for [key] (tabTex, startTex, barTex, tileTex) of the active custom theme, or null. */
fun customTexture(key: String): String? =
    if (be.syntaxya.lodica.engine.Prefs.theme != "custom") null
    else be.syntaxya.lodica.engine.Prefs.customTheme?.extra?.get(key)?.takeIf { it in be.syntaxya.lodica.engine.CustomTheme.TEXTURES }

/** Fills with the custom theme colour [colorKey] (or [default]) and draws the pattern [texKey] over it, using the edge colour. */
@androidx.compose.runtime.Composable
fun androidx.compose.ui.Modifier.themedFill(colorKey: String, texKey: String, default: Color, shape: androidx.compose.ui.graphics.Shape): androidx.compose.ui.Modifier {
    val tex = customTexture(texKey)
    val edge = customExtraColor("tabEdge") ?: be.syntaxya.lodica.ui.theme.Amber
    val filled = this.clip(shape).background(customExtraColor(colorKey) ?: default)
    return if (tex != null) filled.drawBehind { drawTabTexture(tex, edge.copy(alpha = 0.28f)) } else filled
}

/** The tab card pattern of the active custom theme (stripes, dots, grid, checker, planks, gradient), or null. */
fun customTabTexture(): String? =
    if (be.syntaxya.lodica.engine.Prefs.theme != "custom") null
    else be.syntaxya.lodica.engine.Prefs.customTheme?.extra?.get("tabTex")?.takeIf { it in be.syntaxya.lodica.engine.CustomTheme.TEXTURES }

/** Draws the tab card pattern over [size] in [color]. Only these shapes exist, nothing is loaded from outside. */
fun androidx.compose.ui.graphics.drawscope.DrawScope.drawTabTexture(kind: String, color: Color) {
    val w = size.width
    val h = size.height
    val step = 12.dp.toPx()
    when (kind) {
        "stripes" -> {
            var x = -h
            while (x < w) {
                drawLine(color, androidx.compose.ui.geometry.Offset(x, h), androidx.compose.ui.geometry.Offset(x + h, 0f), strokeWidth = 4.dp.toPx())
                x += step
            }
        }
        "dots" -> {
            var y = step / 2
            while (y < h) {
                var x = step / 2
                while (x < w) { drawCircle(color, 1.5.dp.toPx(), androidx.compose.ui.geometry.Offset(x, y)); x += step }
                y += step
            }
        }
        "grid" -> {
            var x = step
            while (x < w) { drawLine(color, androidx.compose.ui.geometry.Offset(x, 0f), androidx.compose.ui.geometry.Offset(x, h), strokeWidth = 1.dp.toPx()); x += step }
            var y = step
            while (y < h) { drawLine(color, androidx.compose.ui.geometry.Offset(0f, y), androidx.compose.ui.geometry.Offset(w, y), strokeWidth = 1.dp.toPx()); y += step }
        }
        "checker" -> {
            val n = (step * 1.5f)
            var row = 0
            var y = 0f
            while (y < h) {
                var x = if (row % 2 == 0) 0f else n
                while (x < w) { drawRect(color, androidx.compose.ui.geometry.Offset(x, y), androidx.compose.ui.geometry.Size(n, n)); x += n * 2 }
                y += n
                row++
            }
        }
        "planks" -> {
            val plank = 16.dp.toPx()
            var y = plank
            var row = 0
            while (y < h + plank) {
                drawLine(color, androidx.compose.ui.geometry.Offset(0f, y), androidx.compose.ui.geometry.Offset(w, y), strokeWidth = 1.5.dp.toPx())
                val x = if (row % 2 == 0) w * 0.35f else w * 0.7f
                drawLine(color, androidx.compose.ui.geometry.Offset(x, y - plank), androidx.compose.ui.geometry.Offset(x, y), strokeWidth = 1.5.dp.toPx())
                y += plank
                row++
            }
        }
        "gradient" -> drawRect(Brush.verticalGradient(listOf(Color.Transparent, color.copy(alpha = 0.5f))))
    }
}

/** Picker entries: "system" first, then every palette. */
val ThemeChoices: List<Pair<String, String>> =
    listOf("system" to "System") +
        (if (android.os.Build.VERSION.SDK_INT >= 31) listOf("dynamic" to "Wallpaper") else emptyList()) +
        Palettes.map { it.key to it.label }

/** Palette from the wallpaper-derived Material You scheme. */
@androidx.annotation.RequiresApi(31)
private fun dynamicPalette(ctx: android.content.Context, dark: Boolean): Palette {
    val s = if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
    fun c(x: Color) = x.toArgb().toLong() and 0xFFFFFFFFL
    return Palette("dynamic", "Wallpaper", dark, c(s.surface), c(s.surfaceContainer), c(s.surfaceContainerHighest),
        c(s.primary), c(s.tertiary), c(s.onSurface),
        readableMuted(c(s.onSurfaceVariant), c(s.surface), c(s.surfaceContainer), c(s.onSurface), dark))
}

object ThemeState {
    /** Mirrors the system night mode; written by LodicaTheme. Starts dark, the app's historical look. */
    var systemDark by mutableStateOf(true)

    /** Wallpaper colours (Android 12+), written by LodicaTheme. Null where the OS has none. */
    var dynamic by mutableStateOf<Palette?>(null)

    val palette: Palette
        get() {
            if (Prefs.theme == "dynamic") dynamic?.let { return it }
            if (Prefs.theme == "custom") Prefs.customTheme?.let { return customPalette(if (systemDark) it else it.forLight()) }
            val key = when (val k = Prefs.theme) {
                "system", "dynamic" -> if (systemDark) "dark" else "light"
                else -> k
            }
            holiday(key)?.let { if (key in Prefs.claimedThemes) return it.palette }
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
val Danger: Color get() = Color(ThemeState.palette.danger)
val Mist: Color get() = Color(ThemeState.palette.text)
val Muted: Color get() = Color(ThemeState.palette.muted)
val Line: Color get() = Color(ThemeState.palette.line)
val Private: Color get() = Color(ThemeState.palette.priv)
val Ok: Color get() = Color(ThemeState.palette.ok)
val AmberInk: Color get() = Color(ThemeState.palette.ink)

/** Black or white, whichever reads better on a filled accent (the point where both give the same contrast is luminance 0.179). */
fun onFill(c: Color): Color = if (c.luminance() > 0.179f) Color.Black else Color.White
val OnAmber: Color get() = onFill(Amber)
val OnCoral: Color get() = onFill(Coral)

/** Flat accent; the redesign has no gradients. */
val KiteGradient: Brush get() = Brush.horizontalGradient(listOf(Amber, Amber))

private fun scheme(p: Palette) = if (p.dark) {
    darkColorScheme(
        primary = Color(p.accent), onPrimary = onFill(Color(p.accent)),
        secondary = Color(p.accent2), onSecondary = onFill(Color(p.accent2)),
        background = Color(p.bg), onBackground = Color(p.text),
        surface = Color(p.bg), onSurface = Color(p.text),
        surfaceVariant = Color(p.raised), onSurfaceVariant = Color(p.muted),
        surfaceContainer = Color(p.raised), surfaceContainerHigh = Color(p.raised),
        surfaceContainerHighest = Color(p.high), surfaceContainerLow = Color(p.bg),
        outline = Color(p.line), error = Color(p.danger),
    )
} else {
    lightColorScheme(
        primary = Color(p.accent), onPrimary = onFill(Color(p.accent)),
        secondary = Color(p.accent2), onSecondary = onFill(Color(p.accent2)),
        background = Color(p.bg), onBackground = Color(p.text),
        surface = Color(p.bg), onSurface = Color(p.text),
        surfaceVariant = Color(p.raised), onSurfaceVariant = Color(p.muted),
        surfaceContainer = Color(p.raised), surfaceContainerHigh = Color(p.raised),
        surfaceContainerHighest = Color(p.high), surfaceContainerLow = Color(p.bg),
        outline = Color(p.line), error = Color(p.danger),
    )
}

@Composable
fun LodicaTheme(content: @Composable () -> Unit) {
    val sysDark = isSystemInDarkTheme()
    SideEffect { if (ThemeState.systemDark != sysDark) ThemeState.systemDark = sysDark }
    val view = LocalView.current
    val appCtx = LocalContext.current.applicationContext
    if (android.os.Build.VERSION.SDK_INT >= 31) {
        val dyn = dynamicPalette(appCtx, sysDark)
        SideEffect { ThemeState.dynamic = dyn }
    }
    val p = ThemeState.palette
    LaunchedEffect(p.key, p.bg, p.accent) { LauncherIcon.schedule(p) }
    SideEffect {
        var c = view.context
        while (c is ContextWrapper && c !is Activity) c = c.baseContext
        (c as? Activity)?.window?.let {
            val ctl = WindowCompat.getInsetsController(it, view)
            ctl.isAppearanceLightStatusBars = !p.dark
            ctl.isAppearanceLightNavigationBars = !p.dark
        }
    }
    MaterialTheme(colorScheme = scheme(p), typography = LodicaTypography, shapes = LodicaShapes, content = content)
}

/** The motion a custom theme picked for [key] (openAnim, startAnim, closeAnim), or "" when none or animations are off. */
fun themeMotion(key: String): String {
    if (be.syntaxya.lodica.engine.Prefs.theme != "custom") return ""
    return be.syntaxya.lodica.engine.Prefs.customTheme?.extra?.get(key).orEmpty()
}

/** Animation spec for [kind]: bounce springs, the rest ease over [ms]. */
fun motionSpec(kind: String, ms: Int = 320): androidx.compose.animation.core.AnimationSpec<Float> =
    if (kind == "bounce") androidx.compose.animation.core.spring(0.45f, 260f) else androidx.compose.animation.core.tween(ms)

/** Draws a [kind] entrance at progress [p] (0 hidden, 1 settled). Does nothing at 1, so a settled view costs nothing. */
fun androidx.compose.ui.Modifier.themeEnter(kind: String, p: Float): androidx.compose.ui.Modifier =
    if (kind.isEmpty() || p >= 1f) this else this.graphicsLayer {
        val q = p.coerceIn(0f, 1f); val r = 1f - p
        alpha = if (kind == "bounce") q.coerceAtLeast(0.2f) else q
        when (kind) {
            "slide" -> translationX = size.width * r
            "rise" -> translationY = size.height * 0.4f * r
            "drop" -> translationY = -size.height * 0.6f * r
            "zoom" -> { scaleX = 0.3f + 0.7f * p; scaleY = scaleX }
            "bounce" -> { scaleX = 0.5f + 0.5f * p; scaleY = scaleX }
            "flip" -> { rotationY = 90f * r; cameraDistance = 12f * density }
            "spin" -> { rotationZ = -180f * r; scaleX = 0.4f + 0.6f * q; scaleY = scaleX }
        }
    }
