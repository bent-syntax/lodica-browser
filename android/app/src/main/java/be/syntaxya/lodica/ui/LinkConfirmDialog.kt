package be.syntaxya.lodica.ui

import android.widget.Toast
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import be.syntaxya.lodica.engine.PcTabs
import be.syntaxya.lodica.ui.theme.Amber

/** Link key hand-over: the confirm popup on the device that showed the linking code, and the result toasts on both. */
@Composable
fun LinkConfirmDialog() {
    val step = PcTabs.linkStep ?: return
    val ctx = LocalContext.current
    LaunchedEffect(step) {
        val msg = when (step.step) {
            "done" -> "Key received. Check code ${step.fp} matches the other device"
            "sent" -> "Key sent. Check code ${step.fp} matches the other device"
            "no" -> "The other device did not confirm the link"
            "bad" -> "Could not read the key. Link again"
            "expired" -> "Waited too long. Link again"
            else -> null
        }
        if (msg != null) { Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show(); PcTabs.dismissLinkStep() }
    }
    if (step.step != "confirm") return
    AlertDialog(
        onDismissRequest = { PcTabs.confirmKey(step.session, false) },
        title = { Text("Confirm the link") },
        text = { Text((if (step.code.isEmpty()) "A linked device asked for the link key" else "A device entered linking code ${step.code}") + ". Only confirm if that was you. It then gets the key for passwords and authenticator codes.") },
        confirmButton = { TextButton(onClick = { PcTabs.confirmKey(step.session, true) }) { Text("Confirm", color = Amber) } },
        dismissButton = { TextButton(onClick = { PcTabs.confirmKey(step.session, false) }) { Text("Deny", color = Amber) } },
    )
}
