package be.syntaxya.lodica.ui

import android.provider.Settings
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

private val FolderFront = Color(0xFFF59E0B)
private val FolderBack = Color(0xFFB45309)
private val FolderInside = Color(0xFF111827)
private val PaperLine = Color(0xFFD1D5DB)
private val PaperGreen = Color(0xFF10B981)

/**
 * Download start animation, the same as on desktop: an amber folder opens, a sheet of paper
 * drops in, and the folder closes with the top of the paper still showing. About 3 s, 1.5 s for
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
    val open = if (reduced) 0f else phase(0f, .33f) - phase(.66f, 1f)
    val drop1 = if (reduced) 1f else phase(0f, .33f)
    val drop2 = if (reduced) 1f else phase(.33f, .66f)
    val paperY = -72f + 32f * drop1 + 40f * drop2
    val paperRot = -12f * (1f - drop1)
    val density = LocalDensity.current.density

    Box(Modifier.fillMaxSize().navigationBarsPadding().padding(bottom = 96.dp), contentAlignment = Alignment.BottomCenter) {
        Box(Modifier.size(112.dp, 132.dp).graphicsLayer { this.alpha = alpha; translationY = (1f - alpha) * 16f * density }) {
            Box(Modifier.align(Alignment.BottomStart).offset(x = 8.dp, y = (-80).dp).size(44.dp, 16.dp)
                .background(FolderBack, RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp)))
            Box(Modifier.align(Alignment.BottomStart).size(112.dp, 84.dp).shadow(16.dp, RoundedCornerShape(8.dp))
                .background(FolderBack, RoundedCornerShape(8.dp)).padding(6.dp)) {
                Box(Modifier.fillMaxSize().background(FolderInside, RoundedCornerShape(6.dp)))
            }
            Column(Modifier.align(Alignment.BottomStart).offset(x = 24.dp, y = (-12).dp).size(64.dp, 80.dp)
                .graphicsLayer {
                    translationY = paperY * density
                    rotationZ = paperRot
                    transformOrigin = TransformOrigin(.5f, 1f)
                }
                .background(Color.White, RoundedCornerShape(4.dp)).padding(horizontal = 10.dp)) {
                repeat(5) { n ->
                    Spacer(Modifier.height(if (n == 0) 10.dp else 7.dp))
                    Box(Modifier.fillMaxWidth().height(3.dp).background(if (n == 0) PaperGreen else PaperLine, RoundedCornerShape(2.dp)))
                }
            }
            Box(Modifier.align(Alignment.BottomStart).size(112.dp, 72.dp)
                .graphicsLayer {
                    rotationX = -52f * open
                    cameraDistance = 8f * density
                    transformOrigin = TransformOrigin(.5f, 1f)
                }
                .background(FolderFront, RoundedCornerShape(8.dp)))
        }
    }
}
