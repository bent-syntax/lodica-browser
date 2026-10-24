package be.syntaxya.lodica.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Redesign foundations: radius 12 controls, 20 cards, 24 dialogs/sheets; type 26/20/15/13/12. */
val LodicaShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

val LodicaTypography = Typography(
    headlineSmall = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.SemiBold),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Medium),
    bodyLarge = TextStyle(fontSize = 15.sp),
    bodyMedium = TextStyle(fontSize = 13.sp),
    bodySmall = TextStyle(fontSize = 12.sp),
    labelLarge = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 12.sp),
)

@Composable
private fun DlgButton(onClick: () -> Unit, modifier: Modifier, fill: Color, content: Color, body: @Composable RowScope.() -> Unit) {
    Button(
        onClick, modifier.defaultMinSize(minHeight = 44.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = fill, contentColor = content),
        content = body,
    )
}

/** Filled accent button for the confirming action of a dialog. */
@Composable
fun DlgPrimary(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) =
    DlgButton(onClick, modifier, Amber, OnAmber, content)

/** Filled raised button for Cancel and other secondary actions. */
@Composable
fun DlgSecondary(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) =
    DlgButton(onClick, modifier, GraphiteHigh, Mist, content)

/** Filled danger button for destructive actions. */
@Composable
fun DlgDanger(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) =
    DlgButton(onClick, modifier, Coral, Color.Black, content)

/** Rounded-square icon tile; tinted when [tint] is given. */
@Composable
fun IconTile(icon: ImageVector, size: Int = 40, tint: Color? = null, modifier: Modifier = Modifier) {
    Box(
        modifier.size(size.dp).clip(RoundedCornerShape(12.dp)).background(if (tint != null) tint.copy(alpha = 0.16f) else GraphiteHigh),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = tint ?: Mist, modifier = Modifier.size((size * 0.55f).dp)) }
}
