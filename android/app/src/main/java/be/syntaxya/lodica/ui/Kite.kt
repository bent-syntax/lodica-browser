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
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import be.syntaxya.lodica.ui.theme.Mist
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Coral
import be.syntaxya.lodica.ui.theme.Graphite

/** The Lodica mark (viewBox 20 8 70 90) as path data: the body, and the accent bar that takes the theme's accent colour. */
internal object Mark {
    const val BODY = "M28,8 H40 Q44,8 46.5,12 L49,16 L46.5,20 Q44,24 40,24 H28 A8,8 0 0 1 28,8 Z M28,32 H40 A8,8 0 0 1 40,48 H28 A8,8 0 0 1 28,32 Z M28,80 H54 A8,8 0 0 1 54,96 H28 A8,8 0 0 1 28,80 Z M77,68.5 C84.5,68.5 89,79 89,86.5 C89,92.5 84,96 77,96 C70,96 65,92.5 65,86.5 C65,79 69.5,68.5 77,68.5 Z"
    const val BAR = "M28,56 H44 A8,8 0 0 1 44,72 H28 A8,8 0 0 1 28,56 Z"
    const val X = 20f; const val Y = 8f; const val W = 70f; const val H = 90f
}

/** The Lodica mark drawn in the active theme: body in the text colour, bar in the accent. The tail flag is kept for callers and ignored. */
@Composable
fun Kite(size: Dp = 64.dp, modifier: Modifier = Modifier, tail: Boolean = true) {
    val body = remember { PathParser().parsePathString(Mark.BODY).toPath() }
    val bar = remember { PathParser().parsePathString(Mark.BAR).toPath() }
    val ink = Mist; val accent = Amber
    Canvas(modifier.size(size)) {
        val k = minOf(this.size.width / Mark.W, this.size.height / Mark.H) * 0.96f
        val ox = (this.size.width - Mark.W * k) / 2 - Mark.X * k
        val oy = (this.size.height - Mark.H * k) / 2 - Mark.Y * k
        withTransform({ translate(ox, oy); scale(k, k, Offset.Zero) }) {
            drawPath(body, ink)
            drawPath(bar, accent)
        }
    }
}

/** The incognito variant of the mark (same geometry as the app icon): outlined shapes, violet bar, ghost with eyes. */
@Composable
fun IncognitoMark(size: Dp = 64.dp, modifier: Modifier = Modifier) {
    val outline = remember {
        listOf(
            "M28,9.5 H38.5 C43,9.5 46,12 47,14.6 Q47.6,16 47,17.4 C46,20 43,22.5 38.5,22.5 H28 A6.5,6.5 0 0 1 28,9.5 Z",
            "M28,33.5 H40 A6.5,6.5 0 0 1 40,46.5 H28 A6.5,6.5 0 0 1 28,33.5 Z",
            "M28,81.5 H54 A6.5,6.5 0 0 1 54,94.5 H28 A6.5,6.5 0 0 1 28,81.5 Z",
        ).map { PathParser().parsePathString(it).toPath() }
    }
    val bar = remember { PathParser().parsePathString(Mark.BAR).toPath() }
    val ghost = remember { PathParser().parsePathString("M77,68.5 C84.5,68.5 89,79 89,86.5 C89,92.5 84,96 77,96 C70,96 65,92.5 65,86.5 C65,79 69.5,68.5 77,68.5 Z").toPath() }
    val sheet = remember { PathParser().parsePathString("M64,82.5 Q70,79.3 77,81.8 Q84,79.3 90,82.5 Q91.4,88.2 86.4,90.6 Q82.2,92.2 78.6,88.4 Q77,87.2 75.4,88.4 Q71.8,92.2 67.6,90.6 Q62.6,88.2 64,82.5 Z").toPath() }
    val ink = Mist; val violet = androidx.compose.ui.graphics.Color(0xFF8B7DFF); val sheetColor = androidx.compose.ui.graphics.Color(0xFF5A48E6)
    Canvas(modifier.size(size)) {
        val k = minOf(this.size.width / Mark.W, this.size.height / Mark.H) * 0.96f
        val ox = (this.size.width - Mark.W * k) / 2 - Mark.X * k
        val oy = (this.size.height - Mark.H * k) / 2 - Mark.Y * k
        withTransform({ translate(ox, oy); scale(k, k, Offset.Zero) }) {
            outline.forEach { drawPath(it, ink, style = Stroke(width = 3f, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round)) }
            drawPath(bar, violet)
            drawPath(ghost, ink)
            drawPath(sheet, sheetColor)
            drawOval(ink, Offset(69.1f, 83.4f), androidx.compose.ui.geometry.Size(5.4f, 4.4f))
            drawOval(ink, Offset(79.5f, 83.4f), androidx.compose.ui.geometry.Size(5.4f, 4.4f))
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
