package be.syntaxya.lodica.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import be.syntaxya.lodica.engine.Gate
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Mist
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Settings rows for the device gate: enroll this device and choose the gated hosts. */
@Composable
fun GateSection() {
    val scope = rememberCoroutineScope()
    var msg by remember { mutableStateOf<String?>(null) }
    var title by remember { mutableStateOf("") }
    var edit by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }
    LinkRow("Enroll this device") {
        scope.launch {
            val r = withContext(Dispatchers.IO) { Gate.enroll() }
            r.onSuccess { title = "Pairing code: $it"; msg = "On the server run:\nsudo lodica-approve $it\n\nThe code works once and expires in 10 minutes." }
                .onFailure { title = "Enroll failed"; msg = it.message ?: "Unknown error" }
        }
    }
    LinkRow("Gated hosts") { text = Prefs.gatedHosts; edit = true }
    msg?.let {
        AlertDialog(onDismissRequest = { msg = null }, title = { Text(title) }, text = { Text(it) },
            confirmButton = { TextButton({ msg = null }) { Text("OK", color = Amber) } })
    }
    if (edit) AlertDialog(
        onDismissRequest = { edit = false }, title = { Text("Gated hosts") },
        text = { OutlinedTextField(text, { text = it }, label = { Text("One host per line", color = Mist) }) },
        confirmButton = { TextButton({ Prefs.updateGatedHosts(text); edit = false }) { Text("Save", color = Amber) } },
        dismissButton = { TextButton({ edit = false }) { Text("Cancel", color = Mist) } },
    )
}
