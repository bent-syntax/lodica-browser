package be.syntaxya.lodica.ui

import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.delay
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Coral
import be.syntaxya.lodica.ui.theme.Graphite

/** The Lodica kite: amber-to-coral diamond with graphite spars and a trailing tail. */
@Composable
fun Kite(size: Dp = 64.dp, modifier: Modifier = Modifier, tail: Boolean = true) {
    Canvas(modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val top = Offset(w * 0.55f, h * 0.04f)
        val right = Offset(w * 0.86f, h * 0.34f)
        val bottom = Offset(w * 0.50f, h * 0.70f)
        val left = Offset(w * 0.22f, h * 0.30f)
        val body = Path().apply {
            moveTo(top.x, top.y); lineTo(right.x, right.y); lineTo(bottom.x, bottom.y); lineTo(left.x, left.y); close()
        }
        drawPath(body, Brush.linearGradient(listOf(Amber, Coral), start = top, end = bottom))
        val spar = w * 0.03f
        drawLine(Graphite.copy(alpha = 0.55f), top, bottom, spar, StrokeCap.Round)
        drawLine(Graphite.copy(alpha = 0.55f), left, right, spar, StrokeCap.Round)
        if (tail) {
            val t = Path().apply {
                moveTo(bottom.x, bottom.y)
                cubicTo(w * 0.40f, h * 0.80f, w * 0.58f, h * 0.86f, w * 0.38f, h * 0.97f)
            }
            drawPath(t, Brush.linearGradient(listOf(Coral, Amber.copy(alpha = 0.4f)), start = bottom, end = Offset(w * 0.38f, h)),
                style = Stroke(w * 0.035f, cap = StrokeCap.Round))
        }
    }
}

private var introShown = false

/** Brief theme-colored kite intro over the first frame. Tap skips; off when animations are disabled. Plays once per process. */
@Composable
fun Intro(content: @Composable () -> Unit) {
    val ctx = LocalContext.current
    var show by remember {
        val scale = Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        val play = !introShown && scale > 0f
        introShown = true
        mutableStateOf(play)
    }
    val t = remember { Animatable(0f) }
    LaunchedEffect(show) {
        if (!show) return@LaunchedEffect
        t.animateTo(1f, tween(450, easing = FastOutSlowInEasing))
        delay(150)
        show = false
    }
    Box(Modifier.fillMaxSize()) {
        content()
        AnimatedVisibility(show, exit = fadeOut(tween(200))) {
            Box(
                Modifier.fillMaxSize().background(Graphite)
                    .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) { show = false },
                contentAlignment = Alignment.Center,
            ) {
                Kite(96.dp, Modifier.graphicsLayer {
                    val p = t.value
                    alpha = p; scaleX = 0.8f + 0.2f * p; scaleY = 0.8f + 0.2f * p
                    translationY = (1f - p) * 24f; rotationZ = (p - 1f) * 10f
                })
            }
        }
    }
}
