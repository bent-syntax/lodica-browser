package be.syntaxya.lodica.ui

import be.syntaxya.lodica.ui.theme.DlgSecondary
import be.syntaxya.lodica.ui.theme.DlgPrimary
import androidx.compose.ui.window.Dialog
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Surface
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.systemBarsPadding
import be.syntaxya.lodica.ui.theme.Graphite
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

/** One attached image: thumbnail fetched lazily through the authenticated relay client, tap to view full size. */
@Composable
private fun MsgThumb(name: String, onZoom: (androidx.compose.ui.graphics.ImageBitmap) -> Unit) {
    val ctx = LocalContext.current
    var bmp by remember(name) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    LaunchedEffect(name) {
        val bytes = withContext(Dispatchers.IO) { Support.image(ctx, name) }
        if (bytes != null) {
            val b = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            if (b != null) bmp = b.asImageBitmap()
        }
    }
    val b = bmp
    if (b != null) {
        Image(
            bitmap = b, contentDescription = "attached image",
            contentScale = ContentScale.Crop,
            modifier = Modifier.width(72.dp).heightIn(min = 72.dp, max = 72.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(GraphiteHigh)
                .clickable { onZoom(b) },
        )
    } else {
        Box(Modifier.width(72.dp).heightIn(min = 72.dp, max = 72.dp).clip(RoundedCornerShape(12.dp)).background(GraphiteHigh))
    }
}

/** Email updates: link an address with a code mailed to it. Then mail to support from it also works. */
@Composable
private fun LinkEmail(onLinked: (String) -> Unit) {
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
                scope.launch { withContext(Dispatchers.IO) { Support.unlink(ctx) }; busy = false; linked = ""; sent = false; code = ""; onLinked("") }
            }) { Text("Unlink") }
            return@Column
        }
        Text("We send a code to your email to check it is yours. You get updates by mail, and you can also mail lodica@syntaxya.be from it.", fontSize = 12.sp, color = Muted)
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
                    sent -> { linked = Support.linkedEmail(ctx); onLinked(linked) }
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
    var zoomed by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    LaunchedEffect(Unit) { withContext(Dispatchers.IO) { Support.open(ctx) } }
    val open = Support.messages.isNotEmpty() && Support.status != "closed" && Support.status != "done"
    // a new request needs a linked email, so answers can always reach the user
    var linked by remember { mutableStateOf(Support.linkedEmail(ctx)) }
    val canWrite = linked.isNotEmpty()
    var cat by remember { mutableStateOf("") }
    // full screen: a floating box moves with the keyboard and leaves little room to read answers
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Surface(Modifier.fillMaxSize(), color = Graphite) {
            Column(Modifier.fillMaxSize().systemBarsPadding().imePadding().padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 12.dp)) {
                    IconTile(Icons.Rounded.ChatBubbleOutline, 40, Amber)
                    Spacer(Modifier.width(12.dp))
                    Text("Contact support", fontSize = 20.sp, color = Mist)
                }
                if (linked.isNotEmpty()) Text("Answers go to $linked", Modifier.padding(bottom = 8.dp), fontSize = 12.sp, color = Amber)
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                    if (open) {
                        val steps = listOf("Sent", "Reviewing", "Asking", "Fixing", "Confirming", "Done")
                        val at = when (Support.status) { "seen" -> 1; "needs-info" -> 2; "fixing" -> 3; "awaiting-confirm" -> 4; "done", "closed" -> 5; else -> 0 }
                        LinearProgressIndicator(progress = { (at + 1f) / steps.size }, modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp))
                        Text(steps.mapIndexed { i, x -> if (i == at) "[$x]" else x }.joinToString(" > "), Modifier.padding(bottom = 8.dp), fontSize = 11.sp, color = Muted)
                        Support.messages.forEach { m ->
                            Box(Modifier.fillMaxWidth().padding(bottom = 8.dp), contentAlignment = if (m.fromUser) Alignment.CenterEnd else Alignment.CenterStart) {
                                Column(horizontalAlignment = if (m.fromUser) Alignment.End else Alignment.Start) {
                                    if (m.text.isNotBlank()) Text(
                                        m.text,
                                        color = if (m.fromUser) OnAmber else Mist, fontSize = 13.sp,
                                        modifier = Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(20.dp))
                                            .background(if (m.fromUser) Amber else GraphiteHigh).padding(horizontal = 16.dp, vertical = 12.dp),
                                    )
                                    if (m.images.isNotEmpty()) Row(
                                        modifier = Modifier.padding(top = if (m.text.isNotBlank()) 4.dp else 0.dp),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        m.images.forEach { name -> MsgThumb(name, onZoom = { zoomed = it }) }
                                    }
                                }
                            }
                        }
                        if (Support.status == "needs-info") Text("Support needs more information. Reply below.", fontSize = 12.sp, color = Amber)
                        if (Support.status == "fixing") Text("A fix is being built and tested.", fontSize = 12.sp, color = Muted)
                        if (Support.status == "awaiting-confirm") Text("Is it fixed or working now?", fontSize = 12.sp, color = Amber)
                        if (Support.status == "done") Text("Fixed. Update the browser to get it.", fontSize = 12.sp, color = Amber)
                    } else if (canWrite) {
                        Support.messages.lastOrNull()?.let { m ->
                            Column(Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(20.dp)).background(GraphiteHigh).padding(12.dp)) {
                                Text("Last update from support", fontSize = 12.sp, color = Muted)
                                Text(m.text, fontSize = 15.sp, color = Mist)
                            }
                        }
                        Text("Describe a bug or something you'd like added. You'll get a notification when it's sent, and again when there's news.", fontSize = 12.sp, color = Muted)
                    } else Text("Link your email first. Then you can report a bug or ask for a feature.", fontSize = 12.sp, color = Muted)
                    LinkEmail { linked = it }
                }
                if (canWrite && !open) {
                    Text("What is this about? (required)", Modifier.padding(top = 8.dp), fontSize = 12.sp, color = Muted)
                    Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("bug" to "Bug", "question" to "Question", "idea" to "Idea", "other" to "Other").forEach { (k, label) ->
                            Text(
                                label, fontSize = 13.sp, color = if (cat == k) OnAmber else Mist,
                                modifier = Modifier.clip(RoundedCornerShape(50)).background(if (cat == k) Amber else GraphiteHigh)
                                    .clickable(enabled = !busy) { cat = k }.padding(horizontal = 16.dp, vertical = 8.dp),
                            )
                        }
                    }
                }
                if (canWrite) OutlinedTextField(
                    value = text, onValueChange = { text = it },
                    label = { Text(if (open) "Reply" else "Your message") },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp), minLines = 3, maxLines = 3,
                )
                if (canWrite) Row {
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
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                    DlgSecondary(onClick = onClose) { Text("Close") }
                    DlgPrimary(enabled = canWrite && text.isNotBlank() && (open || cat.isNotEmpty()) && !busy, onClick = {
                        busy = true; error = null
                        scope.launch {
                            val err = withContext(Dispatchers.IO) { Support.send(ctx, text.trim(), pics, category = cat) }
                            busy = false
                            if (err == null) { text = ""; pics = emptyList(); cat = "" } else error = err
                        }
                    }) { Text(if (busy) "Sending…" else "Send") }
                }
            }
        }
    }
    zoomed?.let { b ->
        Dialog(onDismissRequest = { zoomed = null }) {
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(androidx.compose.ui.graphics.Color.Black)
                    .clickable { zoomed = null },
                contentAlignment = Alignment.Center,
            ) {
                Image(bitmap = b, contentDescription = "attached image, full size", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
