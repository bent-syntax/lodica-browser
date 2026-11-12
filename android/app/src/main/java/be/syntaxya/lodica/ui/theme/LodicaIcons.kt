package be.syntaxya.lodica.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/** Brief icon style: 24 grid, 1.75 stroke, round caps and joins, no fills. */
private fun stroked(name: String, build: PathBuilder.() -> Unit): ImageVector =
    ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).path(
        fill = null,
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.75f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
        pathBuilder = build,
    ).build()

object LodicaIcons {
    /** Settings: three sliders. */
    val Sliders: ImageVector by lazy {
        stroked("sliders") {
            moveTo(4f, 7f); horizontalLineTo(11f)
            moveTo(16f, 7f); horizontalLineTo(20f)
            moveTo(4f, 17f); horizontalLineTo(8f)
            moveTo(13f, 17f); horizontalLineTo(20f)
            moveTo(11f, 7f); arcToRelative(2.5f, 2.5f, 0f, true, false, 5f, 0f)
            arcToRelative(2.5f, 2.5f, 0f, true, false, -5f, 0f)
            moveTo(8f, 17f); arcToRelative(2.5f, 2.5f, 0f, true, false, 5f, 0f)
            arcToRelative(2.5f, 2.5f, 0f, true, false, -5f, 0f)
        }
    }

    /** Menu: vertical three dots. */
    val MoreVertical: ImageVector by lazy {
        stroked("more_vertical") {
            moveTo(12f, 5f); lineTo(12f, 5.01f)
            moveTo(12f, 12f); lineTo(12f, 12.01f)
            moveTo(12f, 19f); lineTo(12f, 19.01f)
        }
    }
}
