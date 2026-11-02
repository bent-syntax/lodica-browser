package be.syntaxya.lodica.ui

import android.provider.Settings
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.Mist
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

/**
 * Download start animation, the same as on desktop: a sheet of paper lifts off where the finger last
 * touched and drops into an Android style folder at the top right, in the colours of the current theme. About 3 s, 1.5 s for
 * files under 1 MB, and a short fade when system animations are off.
 */
@Composable
fun DownloadAnim() {
    val run = Ui.dlAnim ?: return
    val ctx = LocalContext.current
    val reduced = remember { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    val total = when { reduced -> 900; run.second in 1 until (1L shl 20) -> 1500; else -> 3000 }
    val tail = if (reduced) 0 else 400
    var ms by remember(run.first) { mutableFloatStateOf(0f) }
    LaunchedEffect(run.first) {
        val start = withFrameMillis { it }
        while (true) {
            val now = withFrameMillis { it }
            ms = (now - start).toFloat()
            if (ms >= total + tail) break
        }
        if (Ui.dlAnim?.first == run.first) Ui.dlAnim = null
    }
    val q = (ms / total).coerceIn(0f, 1f)
    fun phase(a: Float, b: Float) = FastOutSlowInEasing.transform(((q - a) / (b - a)).coerceIn(0f, 1f))
    val alpha = if (reduced) when {
        q < .3f -> q / .3f
        q > .7f -> (1f - q) / .3f
        else -> 1f
    } else minOf((q / .08f).coerceIn(0f, 1f), 1f - ((ms - total) / tail).coerceIn(0f, 1f))
    val density = LocalDensity.current.density
    val tx = Ui.lastTouchX / density
    val ty = Ui.lastTouchY / density
    val back = androidx.compose.ui.graphics.lerp(Amber, Color.Black, .38f)

    BoxWithConstraints(Modifier.fillMaxSize()) {
        // Folder centre in dp; the paper starts at the last touch relative to it.
        val cx = maxWidth.value - 24f - 56f
        val cy = 96f + 54f
        val fromX = if (tx > 0f) tx - cx else 0f
        val fromY = if (ty > 0f) ty - cy else 160f
        val path = if (reduced) 1f else phase(0f, .5f)
        val sink = if (reduced) 1f else phase(.5f, .66f)
        val px = fromX * (1f - path)
        val py = fromY * (1f - path) - 40f * kotlin.math.sin(Math.PI.toFloat() * path) * (1f - sink) + 18f * sink - 14f * path * (1f - sink)
        val scale = 1f - .25f * path
        val open = if (reduced) 0f else phase(0f, .2f) - phase(.7f, .9f)
        Box(Modifier.align(Alignment.TopEnd).padding(top = 96.dp, end = 24.dp).size(112.dp, 108.dp)
            .graphicsLayer { this.alpha = alpha; translationY = (1f - alpha) * 12f * density }) {
            Box(Modifier.align(Alignment.TopStart).size(48.dp, 22.dp).background(back, RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp)))
            Box(Modifier.align(Alignment.BottomStart).size(112.dp, 90.dp).shadow(12.dp, RoundedCornerShape(12.dp)).background(back, RoundedCornerShape(12.dp)))
            Box(Modifier.align(Alignment.BottomStart).offset(x = 24.dp, y = (-20).dp).size(64.dp, 80.dp)
                .graphicsLayer {
                    translationX = px * density
                    translationY = py * density
                    scaleX = scale; scaleY = scale
                    rotationZ = -10f * (1f - path)
                }
                .background(Graphite, RoundedCornerShape(4.dp))
                .border(2.dp, Amber, RoundedCornerShape(4.dp)).padding(horizontal = 10.dp)) {
                Column {
                    repeat(4) { n ->
                        Spacer(Modifier.height(if (n == 0) 12.dp else 8.dp))
                        Box(Modifier.fillMaxWidth().height(3.dp).background(if (n == 0) Amber else Mist.copy(alpha = .45f), RoundedCornerShape(2.dp)))
                    }
                }
            }
            Box(Modifier.align(Alignment.BottomStart).size(112.dp, 70.dp)
                .graphicsLayer {
                    rotationX = -55f * open
                    cameraDistance = 8f * density
                    transformOrigin = TransformOrigin(.5f, 1f)
                }
                .background(Amber, RoundedCornerShape(12.dp)))
        }
    }
}
