package be.syntaxya.lodica.ui

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Close
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
    DisposableEffect(Unit) { Room.resumeOutbox(ctx); Room.loadChats(ctx); Room.discover(ctx); Room.loadUsers(ctx); Room.start(); onDispose { Room.stop() } }
    LaunchedEffect(msgs.size) { if (msgs.isNotEmpty()) runCatching { state.animateScrollToItem(msgs.size - 1) } }
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
        focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
    )

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) { sendError = null; Room.upload(ctx, uri, name) { err -> if (err != null) sendError = err } }
    }

    if (adding) NewChatDialog { adding = false }
    Column(Modifier.fillMaxSize().imePadding()) {
        TopBar("Server chat") { Ui.screen = Screen.Settings }
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
            IconButton(enabled = Room.uploading == null, onClick = { pick.launch("*/*") }) { Icon(Icons.Rounded.AttachFile, "Send a file (max 5 MB)", tint = Amber) }
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
            TextButton(
                enabled = target.isNotBlank(),
                onClick = {
                    val r = if (isGroup) Room.group(target) else Room.dm(ctx, target)
                    Room.addChat(ctx, r); Room.select(r); onDone()
                },
            ) { Text("Open", color = Amber) }
        },
        dismissButton = { TextButton(onDone) { Text("Cancel", color = Muted) } },
    )
}

@Composable
private fun Bubble(m: RoomMsg, mine: Boolean, waiting: Boolean = false) {
    Box(Modifier.fillMaxWidth(), contentAlignment = if (mine) Alignment.CenterEnd else Alignment.CenterStart) {
        Column(
            Modifier.fillMaxWidth(0.88f).clip(RoundedCornerShape(12.dp)).background(if (mine) GraphiteHigh else GraphiteRaised).padding(12.dp),
        ) {
            if (!mine) Text(m.name, color = Amber, fontSize = 12.sp)
            if (m.fileId != null) FileBody(m) else Text(m.text, color = Mist, fontSize = 14.sp)
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
            val bytes = Room.fetchFile(id, true)
            val ok = bytes != null && runCatching { ctx.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } }.isSuccess
            status = if (ok) "Saved" else "Download failed"
        }
    }
    val size = if (m.fileSize < 1024 * 1024) "${maxOf(1, m.fileSize / 1024)} KB" else "%.1f MB".format(m.fileSize / 1048576.0)
    Text(m.fileName, color = Mist, fontSize = 14.sp)
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton({ save.launch(m.fileName.ifBlank { "file" }) }) { Text("Save ($size)", color = Amber) }
        if (m.fileType.startsWith("image/") && preview == null) TextButton({
            Room.scopeIo {
                val bytes = Room.fetchFile(id, false)
                val bmp = bytes?.let { runCatching { android.graphics.BitmapFactory.decodeByteArray(it, 0, it.size) }.getOrNull() }
                if (bmp != null) preview = bmp else status = "Preview unavailable"
            }
        }) { Text("Preview", color = Amber) }
    }
    preview?.let { Image(it.asImageBitmap(), m.fileName, Modifier.fillMaxWidth().heightInMax(max = 260.dp)) }
    status?.let { Text(it, color = Muted, fontSize = 11.sp) }
}
