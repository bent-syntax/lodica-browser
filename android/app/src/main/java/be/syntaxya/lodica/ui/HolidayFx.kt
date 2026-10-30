package be.syntaxya.lodica.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.runtime.withFrameNanos
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.theme.holiday
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.random.Random

private class Fx(val n: Int, val size: ClosedFloatingPointRange<Float>, val colors: List<Long>, val fall: ClosedFloatingPointRange<Float>, val sway: Float, val settle: Boolean, val rect: Boolean)

private val FX = mapOf(
    "christmas" to Fx(110, 2f..5f, listOf(0xFFFFFFFF, 0xFFE8F1FF), 30f..80f, 28f, true, false),
    "new-year" to Fx(70, 4f..9f, listOf(0xFFFFD700, 0xFFFF4D8D, 0xFF7DD3FC, 0xFF86EFAC, 0xFFFFFFFF), 60f..120f, 36f, true, true),
    "halloween" to Fx(26, 10f..18f, listOf(0xFFFF7A18, 0xFF9BE564, 0xFFB49BD1), -45f..-12f, 48f, false, false),
    "valentine" to Fx(26, 10f..20f, listOf(0xFFFF5C8A, 0xFFFF3B5C, 0xFFFFB3C9), -60f..-20f, 28f, false, false),
    "st-patrick" to Fx(40, 9f..15f, listOf(0xFF4CC96B, 0xFF8EE6A0, 0xFFF5D76E), 25f..55f, 36f, false, false),
    "national-day" to Fx(90, 4f..8f, listOf(0xFFFDDA24, 0xFF111111, 0xFFEF3340), 35f..80f, 28f, true, true),
)

private class P(var x: Float, var y: Float, var vx: Float, var vy: Float, val s: Float, val c: Color, var ph: Float)

/**
 * Wraps the app. While a claimed holiday theme is active it draws falling snow, confetti, bats or hearts over the app.
 * A finger pushes them aside and snow and confetti pile up along the bottom of the screen. Touches pass through untouched.
 */
@Composable
fun HolidayFxHost(content: @Composable () -> Unit) {
    val kind = Prefs.theme.takeIf { Prefs.holidayFx && it in Prefs.claimedThemes && holiday(it) != null && it in FX }
    val touch = remember { floatArrayOf(-999f, -999f, 0f, 0f) }
    val tick = remember { mutableLongStateOf(0L) }
    Box(
        Modifier.fillMaxSize().pointerInput(kind) {
            if (kind == null) return@pointerInput
            awaitPointerEventScope {
                while (true) {
                    val e = awaitPointerEvent(PointerEventPass.Initial)
                    val c = e.changes.firstOrNull { it.pressed }
                    if (c == null) { touch[0] = -999f; touch[1] = -999f } else {
                        touch[2] = c.position.x - c.previousPosition.x; touch[3] = c.position.y - c.previousPosition.y
                        touch[0] = c.position.x; touch[1] = c.position.y
                    }
                }
            }
        },
    ) {
        content()
        if (kind != null) {
            val cfg = FX.getValue(kind)
            val parts = remember(kind) { ArrayList<P>() }
            val heights = remember(kind) { FloatArray(COLS) }
            Canvas(Modifier.fillMaxSize()) {
                tick.longValue // redraw every frame
                val w = size.width; val h = size.height
                viewW = w; viewH = h
                val col = w / COLS
                for (p in parts) drawShape(kind, cfg, p)
                if (cfg.settle) for (i in heights.indices) if (heights[i] > 0.4f) drawRect(Color(cfg.colors[0]), Offset(i * col, h - heights[i]), Size(col + 1f, heights[i]))
            }
            LaunchedEffect(kind) {
                var last = 0L
                while (true) {
                    withFrameNanos { t ->
                        val dt = if (last == 0L) 0.016f else ((t - last) / 1e9f).coerceAtMost(0.05f); last = t
                        stepFx(cfg, parts, heights, touch, dt)
                        touch[2] *= exp(-dt * 8f); touch[3] *= exp(-dt * 8f)
                        tick.longValue = t
                    }
                }
            }
        }
    }
}

private const val COLS = 160
private var viewW = 1080f
private var viewH = 1920f

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawShape(kind: String, cfg: Fx, p: P) {
    if (cfg.rect) drawRect(p.c, Offset(p.x - p.s / 2, p.y - p.s / 3), Size(p.s, p.s * 0.6f))
    else if (kind == "christmas") drawCircle(p.c, p.s, Offset(p.x, p.y))
    else if (kind == "st-patrick") {
        val r = p.s * 0.32f
        for (d in arrayOf(Offset(-r, 0f), Offset(r, 0f), Offset(0f, -r), Offset(0f, r))) drawCircle(p.c, r, Offset(p.x + d.x, p.y + d.y))
        drawLine(p.c, Offset(p.x, p.y), Offset(p.x + r, p.y + p.s * 0.9f), strokeWidth = 2f)
    }
    else drawCircle(p.c.copy(alpha = 0.85f), p.s * 0.6f, Offset(p.x, p.y)) // bats and hearts are drawn as soft glows on Android
}

private fun stepFx(cfg: Fx, parts: ArrayList<P>, heights: FloatArray, touch: FloatArray, dt: Float) {
    val w = viewW; val h = viewH; val col = w / COLS
    fun make(top: Boolean): P {
        val s = cfg.size.start + Random.nextFloat() * (cfg.size.endInclusive - cfg.size.start)
        val vy = cfg.fall.start + Random.nextFloat() * (cfg.fall.endInclusive - cfg.fall.start)
        val y = if (cfg.fall.endInclusive < 0) h + Random.nextFloat() * 40f else if (top) -Random.nextFloat() * h * 0.2f else Random.nextFloat() * h
        return P(Random.nextFloat() * w, y, 0f, vy, s, Color(cfg.colors[Random.nextInt(cfg.colors.size)]), Random.nextFloat() * 6.28f)
    }
    while (parts.size < cfg.n) parts.add(make(false))
    val r = 140f
    val cap = (h * 0.1f).coerceAtMost(120f)
    for (i in parts.indices) {
        val p = parts[i]
        val dx = p.x - touch[0]; val dy = p.y - touch[1]; val d = hypot(dx, dy)
        if (d < r) {
            val f = 1 - d / r
            p.vx += dx / (d.coerceAtLeast(1f)) * f * 600f * dt + touch[2] * f * 0.3f
            p.vy += dy / (d.coerceAtLeast(1f)) * f * 600f * dt + touch[3] * f * 0.3f
        }
        p.ph += dt * 1.6f
        p.vx *= exp(-dt * 1.4f)
        val rest = cfg.fall.start + (cfg.fall.endInclusive - cfg.fall.start) / 2
        p.vy += (rest - p.vy) * (dt * 0.8f).coerceAtMost(1f)
        p.x += (p.vx + sin(p.ph) * cfg.sway) * dt; p.y += p.vy * dt
        if (cfg.settle && p.vy > 0 && heights.isNotEmpty()) {
            val idx = (p.x / col).toInt().coerceIn(0, heights.size - 1)
            if (p.y >= h - heights[idx]) {
                heights[idx] = (heights[idx] + p.s * 0.35f).coerceAtMost(cap)
                for (j in intArrayOf(idx - 1, idx + 1)) if (j in heights.indices && heights[idx] - heights[j] > 3f) { heights[j] += 0.5f; heights[idx] -= 0.5f }
                parts[i] = make(true); continue
            }
        }
        if (p.y > h + 30 || p.y < -60 || p.x < -40 || p.x > w + 40) parts[i] = make(true)
    }
    // A finger moving through a pile blows it away.
    if (cfg.settle && touch[1] > h - cap - 140f) {
        val speed = hypot(touch[2], touch[3])
        for (i in heights.indices) {
            if (heights[i] <= 0f || abs(i * col - touch[0]) > 70f) continue
            val take = minOf(heights[i], 0.8f + speed * 0.05f)
            heights[i] -= take
            if (Random.nextFloat() < 0.5f && parts.size < 400) parts.add(P(i * col, h - heights[i] - 2f, touch[2] * 0.5f + Random.nextFloat() * 80f - 40f, -Random.nextFloat() * 160f, 3f, Color(cfg.colors[0]), 0f))
        }
    }
}
