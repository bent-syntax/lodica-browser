package be.syntaxya.lodica.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.fragment.app.FragmentActivity
import be.syntaxya.lodica.engine.PcTabs
import be.syntaxya.lodica.ui.theme.Amber

/** The linked desktop asks to unlock its passwords. Approving checks the fingerprint or screen lock first when the phone has one. */
@Composable
fun UnlockAskDialog() {
    val id = Ui.pendingUnlock ?: return
    val act = LocalContext.current as? FragmentActivity
    fun answer(ok: Boolean) { Ui.pendingUnlock = null; PcTabs.answerUnlock(id, ok) }
    AlertDialog(
        onDismissRequest = { answer(false) },
        title = { Text("Unlock the PC passwords?") },
        text = { Text("Your desktop is asking to open its saved passwords. Only approve it if this is you.") },
        confirmButton = {
            TextButton(onClick = {
                if (act != null && Biometric.available(act)) {
                    Ui.pendingUnlock = null
                    Biometric.unlock(act, "Unlock the PC passwords", { PcTabs.answerUnlock(id, true) }, { PcTabs.answerUnlock(id, false) })
                } else answer(true)
            }) { Text("Approve", color = Amber) }
        },
        dismissButton = { TextButton(onClick = { answer(false) }) { Text("Deny", color = Amber) } },
    )
}
