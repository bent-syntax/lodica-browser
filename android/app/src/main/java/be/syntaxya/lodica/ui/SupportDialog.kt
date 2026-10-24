package be.syntaxya.lodica.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.Support
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Muted
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Contact support: write what is wrong or missing, and read the team's answers and questions. */
@Composable
internal fun SupportDialog(onClose: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { withContext(Dispatchers.IO) { Support.open(ctx) } }
    val open = Support.messages.isNotEmpty() && Support.status != "closed"
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Contact support") },
        text = {
            Column {
                Column(Modifier.heightIn(max = 260.dp).verticalScroll(rememberScrollState())) {
                    if (open) {
                        Support.messages.forEach { m ->
                            Text((if (m.fromUser) "You: " else "Support: ") + m.text, Modifier.padding(bottom = 6.dp), fontSize = 13.sp)
                        }
                        if (Support.status == "needs-info") Text("Support needs more information. Reply below.", fontSize = 12.sp, color = Amber)
                        if (Support.status == "fixing") Text("A fix is being built and tested.", fontSize = 12.sp, color = Muted)
                        if (Support.status == "done") Text("Fixed. Update the browser to get it.", fontSize = 12.sp, color = Amber)
                    } else Text("Describe a bug or something you'd like added. You'll get a notification when it's sent, and again when there's news.", fontSize = 12.sp, color = Muted)
                }
                OutlinedTextField(
                    value = text, onValueChange = { text = it },
                    label = { Text(if (open) "Reply" else "Your message") },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp), minLines = 3,
                )
                error?.let { Text(it, fontSize = 12.sp, color = androidx.compose.ui.graphics.Color(0xFFEF4444)) }
            }
        },
        confirmButton = {
            TextButton(enabled = text.isNotBlank() && !busy, onClick = {
                busy = true; error = null
                scope.launch {
                    val err = withContext(Dispatchers.IO) { Support.send(ctx, text.trim()) }
                    busy = false
                    if (err == null) text = "" else error = err
                }
            }) { Text(if (busy) "Sending…" else "Send") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}
