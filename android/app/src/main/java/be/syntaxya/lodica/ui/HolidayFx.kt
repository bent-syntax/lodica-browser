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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.runtime.withFrameNanos
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.theme.holiday
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.random.Random

private class Fx(val n: Int, val size: ClosedFloatingPointRange<Float>, val colors: List<Long>, val fall: ClosedFloatingPointRange<Float>, val sway: Float, val settle: Boolean, val rect: Boolean)

private val FX = mapOf(
    "christmas" to Fx(110, 2f..5f, listOf(0xFFFFFFFF, 0xFFE8F1FF), 30f..80f, 28f, true, false),
    "new-year" to Fx(80, 5f..10f, listOf(0xFFFFD700, 0xFFFF4D8D, 0xFF7DD3FC, 0xFF86EFAC, 0xFFFFFFFF), 50f..100f, 40f, false, true),
    "halloween" to Fx(22, 14f..24f, listOf(0xFFFF7A18, 0xFF9BE564, 0xFFB49BD1), -45f..-12f, 48f, false, false),
    "valentine" to Fx(26, 12f..22f, listOf(0xFFFF5C8A, 0xFFFF3B5C, 0xFFFFB3C9), -60f..-20f, 28f, false, false),
    "st-patrick" to Fx(40, 9f..15f, listOf(0xFF4CC96B, 0xFF8EE6A0, 0xFFF5D76E), 25f..55f, 36f, false, false),
    "national-day" to Fx(45, 10f..18f, listOf(0xFFFDDA24, 0xFF111111, 0xFFEF3340), 30f..60f, 36f, false, true),
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
    val s = p.s
    when (kind) {
        // Snowflakes: a dot, with six arms on the bigger ones.
        "christmas" -> {
            drawCircle(p.c, s * 0.6f, Offset(p.x, p.y))
            if (s > 3.5f) for (k in 0 until 3) {
                val a = p.ph * 0.3f + k * 1.0472f
                val dx = cos(a) * s * 1.6f; val dy = sin(a) * s * 1.6f
                drawLine(p.c.copy(alpha = 0.8f), Offset(p.x - dx, p.y - dy), Offset(p.x + dx, p.y + dy), strokeWidth = 1.2f)
            }
        }
        // Confetti strips that spin as they fall: the width follows the spin so they look like they tumble.
        "new-year" -> {
            val w = s * (0.25f + 0.75f * abs(cos(p.ph * 2f)))
            rotate(sin(p.ph) * 40f, Offset(p.x, p.y)) { drawRect(p.c, Offset(p.x - w / 2, p.y - s * 0.8f), Size(w, s * 1.6f)) }
        }
        // Bats: two wings that flap, a body and two ears.
        "halloween" -> {
            val flap = sin(p.ph * 5f) * 0.55f
            val body = Color(0xFF1B1030)
            val path = Path().apply {
                for (side in intArrayOf(-1, 1)) {
                    moveTo(p.x, p.y)
                    cubicTo(p.x + side * s * 0.6f, p.y - s * (0.9f + flap), p.x + side * s * 1.3f, p.y - s * (0.5f + flap), p.x + side * s * 1.6f, p.y - s * (0.1f - flap))
                    quadraticTo(p.x + side * s * 1.1f, p.y + s * 0.15f, p.x + side * s * 0.8f, p.y + s * 0.35f)
                    quadraticTo(p.x + side * s * 0.4f, p.y + s * 0.1f, p.x, p.y + s * 0.5f)
                    close()
                }
            }
            drawPath(path, body)
            drawCircle(body, s * 0.3f, Offset(p.x, p.y))
            drawCircle(p.c, s * 0.07f, Offset(p.x - s * 0.1f, p.y - s * 0.03f)); drawCircle(p.c, s * 0.07f, Offset(p.x + s * 0.1f, p.y - s * 0.03f))
        }
        // Hearts: two lobes and a point.
        "valentine" -> {
            val path = Path().apply {
                moveTo(p.x, p.y + s * 0.9f)
                cubicTo(p.x - s * 1.5f, p.y - s * 0.1f, p.x - s * 0.7f, p.y - s * 1.1f, p.x, p.y - s * 0.35f)
                cubicTo(p.x + s * 0.7f, p.y - s * 1.1f, p.x + s * 1.5f, p.y - s * 0.1f, p.x, p.y + s * 0.9f)
                close()
            }
            rotate(sin(p.ph) * 14f, Offset(p.x, p.y)) { drawPath(path, p.c.copy(alpha = 0.9f)) }
        }
        "st-patrick" -> {
            val r = s * 0.32f
            for (d in arrayOf(Offset(-r, 0f), Offset(r, 0f), Offset(0f, -r), Offset(0f, r))) drawCircle(p.c, r, Offset(p.x + d.x, p.y + d.y))
            drawLine(p.c, Offset(p.x, p.y), Offset(p.x + r, p.y + s * 0.9f), strokeWidth = 2f)
        }
        // Small Belgian flags: black, yellow and red stripes on a flutter.
        else -> {
            val w = s * 1.2f; val h = s * 0.8f
            val wave = sin(p.ph * 3f) * h * 0.12f
            val cols = arrayOf(Color(0xFF111111), Color(0xFFFDDA24), Color(0xFFEF3340))
            rotate(sin(p.ph) * 12f, Offset(p.x, p.y)) {
                for (i in 0 until 3) drawRect(cols[i], Offset(p.x - w / 2 + i * w / 3, p.y - h / 2 + (if (i == 1) wave else 0f)), Size(w / 3 + 0.5f, h))
                drawLine(Color(0xFF8A8A8A), Offset(p.x - w / 2, p.y - h / 2), Offset(p.x - w / 2, p.y + h * 1.2f), strokeWidth = 1.5f)
            }
        }
    }
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
