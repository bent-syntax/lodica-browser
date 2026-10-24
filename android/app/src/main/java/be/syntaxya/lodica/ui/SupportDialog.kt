package be.syntaxya.lodica.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
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
    var pics by remember { mutableStateOf<List<Uri>>(emptyList()) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { pics = (pics + it).take(3) }
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
                        val steps = listOf("Sent", "Reviewing", "Asking", "Fixing", "Confirming", "Done")
                        val at = when (Support.status) { "seen" -> 1; "needs-info" -> 2; "fixing" -> 3; "awaiting-confirm" -> 4; "done", "closed" -> 5; else -> 0 }
                        LinearProgressIndicator(progress = { (at + 1f) / steps.size }, modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp))
                        Text(steps.mapIndexed { i, x -> if (i == at) "[$x]" else x }.joinToString(" > "), Modifier.padding(bottom = 8.dp), fontSize = 11.sp, color = Muted)
                        Support.messages.forEach { m ->
                            Text((if (m.fromUser) "You: " else "Support: ") + m.text + (if (m.images > 0) " [${m.images} image${if (m.images > 1) "s" else ""}]" else ""), Modifier.padding(bottom = 6.dp), fontSize = 13.sp)
                        }
                        if (Support.status == "needs-info") Text("Support needs more information. Reply below.", fontSize = 12.sp, color = Amber)
                        if (Support.status == "fixing") Text("A fix is being built and tested.", fontSize = 12.sp, color = Muted)
                        if (Support.status == "awaiting-confirm") Text("Is it fixed or working now?", fontSize = 12.sp, color = Amber)
                        if (Support.status == "done") Text("Fixed. Update the browser to get it.", fontSize = 12.sp, color = Amber)
                    } else Text("Describe a bug or something you'd like added. You'll get a notification when it's sent, and again when there's news.", fontSize = 12.sp, color = Muted)
                }
                OutlinedTextField(
                    value = text, onValueChange = { text = it },
                    label = { Text(if (open) "Reply" else "Your message") },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp), minLines = 3,
                )
                Row {
                    TextButton(enabled = pics.size < 3 && !busy, onClick = { pick.launch("image/*") }) { Text(if (pics.isEmpty()) "Add image" else "Images: ${pics.size}/3") }
                    if (pics.isNotEmpty()) TextButton(onClick = { pics = emptyList() }) { Text("Clear") }
                }
                if (Support.status == "awaiting-confirm") Row {
                    TextButton(enabled = !busy, onClick = {
                        busy = true; error = null
                        scope.launch {
                            val err = withContext(Dispatchers.IO) { Support.send(ctx, "Yes, it is fixed.", resolved = true) }
                            busy = false
                            if (err != null) error = err else onClose()
                        }
                    }) { Text("Yes, fixed") }
                    TextButton(enabled = !busy, onClick = { text = "No, it is still not fixed: " }) { Text("No") }
                }
                error?.let { Text(it, fontSize = 12.sp, color = androidx.compose.ui.graphics.Color(0xFFEF4444)) }
            }
        },
        confirmButton = {
            TextButton(enabled = text.isNotBlank() && !busy, onClick = {
                busy = true; error = null
                scope.launch {
                    val err = withContext(Dispatchers.IO) { Support.send(ctx, text.trim(), pics) }
                    busy = false
                    if (err == null) { text = ""; pics = emptyList() } else error = err
                }
            }) { Text(if (busy) "Sending…" else "Send") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}
