package be.syntaxya.lodica.ui

import be.syntaxya.lodica.ui.theme.DlgSecondary
import be.syntaxya.lodica.ui.theme.DlgPrimary
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.IconTile
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.OnAmber
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

/** Email updates: link an address with a code mailed to it. Then mail to support from it also works. */
@Composable
private fun LinkEmail() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var linked by remember { mutableStateOf(Support.linkedEmail(ctx)) }
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Text("Email updates", fontSize = 13.sp, color = Mist)
        if (linked.isNotEmpty()) {
            Text("Linked to $linked. You get updates by email, and you can mail lodica@syntaxya.be from this address.", fontSize = 12.sp, color = Muted)
            TextButton(enabled = !busy, onClick = {
                busy = true
                scope.launch { withContext(Dispatchers.IO) { Support.unlink(ctx) }; busy = false; linked = ""; sent = false; code = "" }
            }) { Text("Unlink") }
            return@Column
        }
        Text("Link your email to get updates by mail and to send requests to lodica@syntaxya.be. We send a code to check it is yours.", fontSize = 12.sp, color = Muted)
        OutlinedTextField(
            value = email, onValueChange = { email = it.take(120) }, enabled = !sent, singleLine = true,
            label = { Text("Email") }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Email),
        )
        if (sent) OutlinedTextField(
            value = code, onValueChange = { code = it.filter(Char::isDigit).take(6) }, singleLine = true,
            label = { Text("6-digit code") }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
        )
        TextButton(enabled = !busy && email.isNotBlank() && (!sent || code.length == 6), onClick = {
            busy = true; note = null
            scope.launch {
                val err = withContext(Dispatchers.IO) { if (sent) Support.linkVerify(ctx, email, code) else Support.linkStart(ctx, email) }
                busy = false
                when {
                    err != null -> note = err
                    sent -> linked = Support.linkedEmail(ctx)
                    else -> { sent = true; note = "Code sent. Check your mail." }
                }
            }
        }) { Text(if (sent) "Link" else "Send code") }
        note?.let { Text(it, fontSize = 12.sp, color = Muted) }
    }
}

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
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconTile(Icons.Rounded.ChatBubbleOutline, 40, Amber)
                Spacer(Modifier.width(12.dp))
                Text("Contact support")
            }
        },
        text = {
            Column {
                Column(Modifier.heightIn(max = 260.dp).verticalScroll(rememberScrollState())) {
                    if (open) {
                        val steps = listOf("Sent", "Reviewing", "Asking", "Fixing", "Confirming", "Done")
                        val at = when (Support.status) { "seen" -> 1; "needs-info" -> 2; "fixing" -> 3; "awaiting-confirm" -> 4; "done", "closed" -> 5; else -> 0 }
                        LinearProgressIndicator(progress = { (at + 1f) / steps.size }, modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp))
                        Text(steps.mapIndexed { i, x -> if (i == at) "[$x]" else x }.joinToString(" > "), Modifier.padding(bottom = 8.dp), fontSize = 11.sp, color = Muted)
                        Support.messages.forEach { m ->
                            Box(Modifier.fillMaxWidth().padding(bottom = 8.dp), contentAlignment = if (m.fromUser) Alignment.CenterEnd else Alignment.CenterStart) {
                                Text(
                                    m.text + (if (m.images > 0) " [${m.images} image${if (m.images > 1) "s" else ""}]" else ""),
                                    color = if (m.fromUser) OnAmber else Mist, fontSize = 13.sp,
                                    modifier = Modifier.widthIn(max = 240.dp).clip(RoundedCornerShape(20.dp))
                                        .background(if (m.fromUser) Amber else GraphiteHigh).padding(horizontal = 16.dp, vertical = 12.dp),
                                )
                            }
                        }
                        if (Support.status == "needs-info") Text("Support needs more information. Reply below.", fontSize = 12.sp, color = Amber)
                        if (Support.status == "fixing") Text("A fix is being built and tested.", fontSize = 12.sp, color = Muted)
                        if (Support.status == "awaiting-confirm") Text("Is it fixed or working now?", fontSize = 12.sp, color = Amber)
                        if (Support.status == "done") Text("Fixed. Update the browser to get it.", fontSize = 12.sp, color = Amber)
                    } else Text("Describe a bug or something you'd like added. You'll get a notification when it's sent, and again when there's news.", fontSize = 12.sp, color = Muted)
                    LinkEmail()
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
            DlgPrimary(enabled = text.isNotBlank() && !busy, onClick = {
                busy = true; error = null
                scope.launch {
                    val err = withContext(Dispatchers.IO) { Support.send(ctx, text.trim(), pics) }
                    busy = false
                    if (err == null) { text = ""; pics = emptyList() } else error = err
                }
            }) { Text(if (busy) "Sending…" else "Send") }
        },
        dismissButton = { DlgSecondary(onClick = onClose) { Text("Close") } },
    )
}
