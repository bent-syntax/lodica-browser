package be.syntaxya.lodica.ui

import androidx.compose.foundation.Canvas
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
