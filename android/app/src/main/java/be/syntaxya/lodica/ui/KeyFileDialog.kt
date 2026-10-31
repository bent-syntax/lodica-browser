package be.syntaxya.lodica.ui

import android.widget.Toast
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import be.syntaxya.lodica.engine.PcTabs
import be.syntaxya.lodica.ui.theme.Amber

/** Asks before a key file opened from a file manager replaces this device's link key. */
@Composable
fun KeyFileDialog() {
    val text = Ui.pendingKeyFile ?: return
    val ctx = LocalContext.current
    AlertDialog(
        onDismissRequest = { Ui.pendingKeyFile = null },
        title = { Text("Inject the key?") },
        text = { Text("This key file replaces the link key on this phone. Passwords and codes shared with the desktop use it.") },
        confirmButton = {
            TextButton(onClick = {
                Ui.pendingKeyFile = null
                PcTabs.insertKeyFile(text) { st ->
                    Toast.makeText(ctx, when (st.step) { "done" -> "Key inserted"; "wait" -> "Asking the other device for a code…"; else -> st.error }, Toast.LENGTH_LONG).show()
                    if (st.step == "wait") { Ui.menuOpen = false; Ui.screen = Screen.Settings }
                }
            }) { Text("Inject", color = Amber) }
        },
        dismissButton = { TextButton(onClick = { Ui.pendingKeyFile = null }) { Text("Cancel", color = Amber) } },
    )
}
