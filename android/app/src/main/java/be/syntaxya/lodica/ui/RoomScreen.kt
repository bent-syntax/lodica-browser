package be.syntaxya.lodica.ui

import be.syntaxya.lodica.ui.theme.DlgSecondary
import be.syntaxya.lodica.ui.theme.DlgPrimary
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.EmojiEmotions
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.buildAnnotatedString
import be.syntaxya.lodica.engine.Emojis
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.asImageBitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.heightIn as heightInMax
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.Room
import be.syntaxya.lodica.engine.RoomMsg
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

/** Shared chat room of the linked server. Listens only while this screen is open. */
@Composable
fun RoomScreen() {
    val ctx = LocalContext.current
    var name by remember { mutableStateOf(Room.name(ctx)) }
    var text by remember { mutableStateOf("") }
    var sendError by remember { mutableStateOf<String?>(null) }
    val state = rememberLazyListState()
    val msgs = Room.messages
    var adding by remember { mutableStateOf(false) }
    var emojis by remember { mutableStateOf(false) }
    DisposableEffect(Unit) { Emojis.syncNow(); Room.resumeOutbox(ctx); Room.loadChats(ctx); Room.discover(ctx); Room.loadUsers(ctx); Room.start(); onDispose { Room.stop() } }
    LaunchedEffect(msgs.size) { if (msgs.isNotEmpty()) runCatching { state.animateScrollToItem(msgs.size - 1) } }
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
        focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
    )

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) { sendError = null; Room.upload(ctx, uri, name) { err -> if (err != null) sendError = err } }
    }

    if (adding) NewChatDialog { adding = false }
    if (emojis) AlertDialog(
        onDismissRequest = { emojis = false },
        confirmButton = { DlgPrimary({ emojis = false }) { Text("Close") } },
        title = { Text("Server emojis") },
        text = {
            if (Emojis.list.isEmpty()) Text("No server emojis yet. Sync them in Settings.", color = Muted)
            else LazyVerticalGrid(GridCells.Adaptive(48.dp), Modifier.heightIn(max = 300.dp)) {
                gridItems(Emojis.list.toList(), key = { it.name }) { e ->
                    val bmp = remember(e.name, e.at) { android.graphics.BitmapFactory.decodeFile(Emojis.file(e.name).path)?.asImageBitmap() }
                    if (bmp != null) Image(bmp, e.name, Modifier.padding(4.dp).size(56.dp).clickable { text += ":" + e.name + ":"; emojis = false })
                }
            }
        },
    )
    Column(Modifier.fillMaxSize().imePadding()) {
        TopBar("Server chat") { Ui.screen = Ui.returnTo }
        LazyRow(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items((listOf("") + Room.chats).toList(), key = { it }) { r ->
                val on = Room.room == r
                Row(
                    Modifier.clip(RoundedCornerShape(50)).background(if (on) Amber else GraphiteRaised)
                        .clickable { Room.select(r) }.padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        (if (r.startsWith("grp:")) "# " else "") + Room.label(ctx, r),
                        color = if (on) GraphiteRaised else Mist, fontSize = 13.sp,
                    )
                    if (on && r.isNotEmpty()) {
                        Icon(
                            Icons.Rounded.Close, "Remove chat", tint = GraphiteRaised,
                            modifier = Modifier.padding(start = 6.dp).clickable { Room.removeChat(ctx, r) },
                        )
                    }
                }
            }
            item {
                IconButton(onClick = { adding = true }) { Icon(Icons.Rounded.Add, "New chat", tint = Amber) }
            }
        }
        Text(
            Room.error ?: when {
                Room.room.isEmpty() -> "Everyone linked to this server is in this room. Messages are not end-to-end encrypted and are kept 24 hours."
                Room.room.startsWith("grp:") -> "Group chat. Anyone who adds a group with this exact name sees these messages. Not encrypted, kept 24 hours."
                else -> "Private chat with ${Room.label(ctx, Room.room)}, matched by device name. Not encrypted, kept 24 hours."
            },
            color = Muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
        )
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(), state = state,
            contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(msgs, key = { it.id }) { m -> Bubble(m, mine = Room.isMine(ctx, m.name)) }
            items(Room.pending.filter { it.room == Room.room }, key = { it.id }) { m -> Bubble(m, mine = true, waiting = true) }
        }
        Room.uploading?.let { Text("Uploading $it%", color = Amber, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp)) }
        sendError?.let { Text(it, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp)) }
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column {
                IconButton(enabled = Room.uploading == null, onClick = { pick.launch("*/*") }) { Icon(Icons.Rounded.AttachFile, "Send a file (max 5 GB)", tint = Amber) }
                IconButton(onClick = { emojis = true }) { Icon(Icons.Rounded.EmojiEmotions, "Server emojis", tint = Amber) }
            }
            Column(Modifier.weight(1f)) {
                OutlinedTextField(
                    name, { name = it.take(32) },
                    Modifier.fillMaxWidth().onFocusChanged { f ->
                        if (!f.isFocused && name != Room.name(ctx)) Room.changeName(ctx, name) { now, refused ->
                            name = now
                            if (refused) sendError = "That name is already used by another device"
                        }
                    },
                    singleLine = true,
                    label = { Text("Your name", color = Muted) }, colors = fieldColors,
                )
                OutlinedTextField(
                    text, { text = it }, Modifier.fillMaxWidth().padding(top = 6.dp), maxLines = 4,
                    placeholder = { Text(sendError ?: "Message", color = Muted) },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default), colors = fieldColors,
                )
            }
            IconButton(
                enabled = text.isNotBlank(),
                onClick = {
                    val t = text
                    text = ""
                    sendError = null
                    Room.send(ctx, Room.name(ctx), t) { err -> if (err != null) { sendError = err; text = t } }
                },
            ) { Icon(Icons.AutoMirrored.Rounded.Send, "Send", tint = if (text.isNotBlank()) Amber else Muted) }
        }
    }
}

@Composable
private fun NewChatDialog(onDone: () -> Unit) {
    val ctx = LocalContext.current
    var target by remember { mutableStateOf("") }
    var isGroup by remember { mutableStateOf(false) }
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
        focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
    )
    AlertDialog(
        onDismissRequest = onDone,
        containerColor = GraphiteRaised,
        title = { Text("New chat", color = Mist) },
        text = {
            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton({ isGroup = false }) { Text("Private", color = if (!isGroup) Amber else Muted) }
                    TextButton({ isGroup = true }) { Text("Group", color = if (isGroup) Amber else Muted) }
                }
                if (!isGroup && Room.users.isNotEmpty()) {
                    Text("Available users", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                    LazyColumn(Modifier.heightIn(max = 180.dp)) {
                        items(Room.users.toList(), key = { it }) { u ->
                            Text(
                                u, color = if (u == target) Amber else Mist, fontSize = 15.sp,
                                modifier = Modifier.fillMaxWidth().clickable { target = u }.padding(vertical = 10.dp),
                            )
                        }
                    }
                }
                OutlinedTextField(
                    target, { target = it.take(32) }, singleLine = true, colors = fieldColors,
                    label = { Text(if (isGroup) "Group name" else "Device name", color = Muted) },
                )
                Text(
                    if (isGroup) "Others join by adding a group with the same name."
                    else "Pick a user above, or type the name that device shows under \"Your name\".",
                    color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp),
                )
            }
        },
        confirmButton = {
            DlgPrimary(
                enabled = target.isNotBlank(),
                onClick = {
                    val r = if (isGroup) Room.group(target) else Room.dm(ctx, target)
                    Room.addChat(ctx, r); Room.select(r); onDone()
                },
            ) { Text("Open") }
        },
        dismissButton = { DlgSecondary(onDone) { Text("Cancel") } },
    )
}

@Composable
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
private fun Bubble(m: RoomMsg, mine: Boolean, waiting: Boolean = false) {
    val clip = androidx.compose.ui.platform.LocalClipboardManager.current
    val ctx = LocalContext.current
    Box(Modifier.fillMaxWidth(), contentAlignment = if (mine) Alignment.CenterEnd else Alignment.CenterStart) {
        Column(
            Modifier.fillMaxWidth(0.88f).clip(RoundedCornerShape(12.dp)).background(if (mine) GraphiteHigh else GraphiteRaised)
                .combinedClickable(onClick = {}, onLongClick = {
                    if (m.fileId == null) {
                        clip.setText(androidx.compose.ui.text.AnnotatedString(m.text))
                        android.widget.Toast.makeText(ctx, "Message copied", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }).padding(12.dp),
        ) {
            if (!mine) Text(m.name, color = Amber, fontSize = 12.sp)
            if (m.fileId != null) FileBody(m) else SelectionContainer { EmojiText(m.text) }
            if (waiting) Text("Waiting for the server…", color = Muted, fontSize = 11.sp)
            Text(
                java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(m.at)),
                color = Muted, fontSize = 11.sp,
            )
        }
    }
}

/** An attachment: previewed only when it is a verified image, otherwise saved by the user. Never opened or run. */
@Composable
private fun FileBody(m: RoomMsg) {
    val ctx = LocalContext.current
    val id = m.fileId ?: return
    var preview by remember(id) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var status by remember(id) { mutableStateOf<String?>(null) }
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        if (uri != null) Room.scopeIo {
            val ok = runCatching { ctx.contentResolver.openOutputStream(uri)?.use { Room.saveFile(id, it) } == true }.getOrDefault(false)
            if (!ok) runCatching { android.provider.DocumentsContract.deleteDocument(ctx.contentResolver, uri) }
            status = if (ok) "Saved" else "Download failed"
        }
    }
    val size = when {
        m.fileSize < 1024 * 1024 -> "${maxOf(1, m.fileSize / 1024)} KB"
        m.fileSize < 1024L * 1024 * 1024 -> "%.1f MB".format(m.fileSize / 1048576.0)
        else -> "%.2f GB".format(m.fileSize / 1073741824.0)
    }
    Text(m.fileName, color = Mist, fontSize = 14.sp)
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton({ save.launch(m.fileName.ifBlank { "file" }) }) { Text("Save ($size)", color = Amber) }
        if (m.fileType.startsWith("image/") && preview == null && m.fileSize <= 20L * 1024 * 1024) TextButton({
            Room.scopeIo {
                val bytes = Room.fetchFile(id)
                val bmp = bytes?.let { runCatching { android.graphics.BitmapFactory.decodeByteArray(it, 0, it.size) }.getOrNull() }
                if (bmp != null) preview = bmp else status = "Preview unavailable"
            }
        }) { Text("Preview", color = Amber) }
    }
    preview?.let { Image(it.asImageBitmap(), m.fileName, Modifier.fillMaxWidth().heightInMax(max = 260.dp)) }
    status?.let { Text(it, color = Muted, fontSize = 11.sp) }
}

/** Message text where :name: of a known server emoji is drawn as its image. */
@Composable
private fun EmojiText(t: String) {
    val known = Emojis.list.map { it.name }.toSet()
    val re = Regex(":([a-z0-9_]{1,32}):")
    val used = re.findAll(t).map { it.groupValues[1] }.filter { it in known }.toSet()
    val text = buildAnnotatedString {
        var at = 0
        for (m in re.findAll(t)) {
            if (m.groupValues[1] !in used) continue
            append(t.substring(at, m.range.first)); appendInlineContent(m.groupValues[1], m.value); at = m.range.last + 1
        }
        append(t.substring(at))
    }
    val inline = used.associateWith { n ->
        InlineTextContent(Placeholder(40.sp, 40.sp, PlaceholderVerticalAlign.TextCenter)) {
            val bmp = remember(n) { android.graphics.BitmapFactory.decodeFile(Emojis.file(n).path)?.asImageBitmap() }
            if (bmp != null) Image(bmp, n, Modifier.fillMaxSize())
        }
    }
    Text(text, color = Mist, fontSize = 14.sp, inlineContent = inline)
}
