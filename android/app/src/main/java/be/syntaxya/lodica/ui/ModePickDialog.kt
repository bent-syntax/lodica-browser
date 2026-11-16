package be.syntaxya.lodica.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import be.syntaxya.lodica.engine.Mode
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.DlgPrimary
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

/** Shown until a Mode is picked. It cannot be dismissed: the choice decides how pages load. */
@Composable
fun ModePickDialog() {
    if (Prefs.modePicked != null) return
    var pick by remember { mutableStateOf(Mode.MEDIUM) }
    AlertDialog(
        onDismissRequest = {},
        properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
        containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
        title = { Text("Choose a mode") },
        text = {
            Column {
                Text("You can change this later in Settings.", fontSize = 13.sp, color = Muted)
                ModeRows(pick) { pick = it }
            }
        },
        confirmButton = { DlgPrimary(onClick = { Prefs.updateMode(pick) }) { Text("Continue") } },
    )
}

/** One selectable row per Mode, shared with Settings. */
@Composable
fun ModeRows(sel: Mode, onPick: (Mode) -> Unit) {
    Column {
        for (m in Mode.entries) Row(
            Modifier.fillMaxWidth().padding(top = 8.dp).clip(RoundedCornerShape(6.dp)).clickable { onPick(m) }.padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RadioButton(m == sel, { onPick(m) }, colors = RadioButtonDefaults.colors(selectedColor = Amber, unselectedColor = Muted))
            Column {
                Text(m.label, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Mist)
                Text(m.blurb, fontSize = 12.sp, color = Muted)
            }
        }
    }
}
