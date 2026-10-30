package be.syntaxya.lodica.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.TestSession
import be.syntaxya.lodica.ui.theme.Coral
import androidx.compose.ui.graphics.Color

/** Always-visible strip while a remote test session runs, with a Stop button. There is no way to hide it. */
@Composable
fun TestSessionBar() {
    if (TestSession.state == "off") return
    val ctx = LocalContext.current
    Box(Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp)) {
        Row(
            Modifier.align(Alignment.TopCenter).clip(RoundedCornerShape(50)).background(Coral).padding(start = 16.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (TestSession.state == "active") "Support is testing" else "Waiting for support · code ${TestSession.code}",
                color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Stop", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 8.dp).clip(RoundedCornerShape(50)).clickable { TestSession.stop(ctx) }.padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
    }
}
