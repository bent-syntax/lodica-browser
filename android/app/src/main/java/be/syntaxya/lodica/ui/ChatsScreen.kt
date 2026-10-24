package be.syntaxya.lodica.ui

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.Ai
import be.syntaxya.lodica.engine.Chats
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Coral
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

/** AI chats: a list, and one thread with an input. The same chats appear on linked devices. */
@Composable
fun ChatsScreen() {
    val ctx = LocalContext.current
    var open by remember { mutableStateOf<String?>(null) }
    var fresh by remember { mutableStateOf(false) }
    val chat = Chats.get(open)
    Column(Modifier.fillMaxSize().background(Graphite).imePadding()) {
        TopBar(if (open != null || fresh) chat?.title?.ifBlank { "Chat" } ?: "New chat" else "AI chats") {
            if (open != null || fresh) { open = null; fresh = false } else Ui.screen = Ui.returnTo
        }
        if (open == null && !fresh) {
            if (!Ai.connected) {
                Text("Add an Anthropic API key in Settings > Ask AI to start chatting.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(20.dp))
            }
            Row(
                Modifier.fillMaxWidth().clickable { fresh = true }.padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(Icons.Rounded.Add, null, tint = Amber)
                Text("New chat", color = Amber, fontSize = 15.sp)
            }
            if (Chats.list.isEmpty()) Text("No chats yet. Chats made on a linked device show up here.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp))
            LazyColumn(Modifier.fillMaxSize()) {
                items(Chats.list, key = { it.id }) { c ->
                    Row(Modifier.fillMaxWidth().clickable { open = c.id }.padding(start = 20.dp, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
                            Text(c.title.ifBlank { "Chat" }, color = Mist, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                android.text.format.DateUtils.getRelativeTimeSpanString(c.updated).toString() + " · " + c.messages.size + " messages",
                                color = Muted, fontSize = 12.sp,
                            )
                        }
                        IconButton(onClick = { Chats.delete(c.id) }) { Icon(Icons.Rounded.Delete, "Delete", tint = Muted) }
                    }
                }
            }
        } else {
            var text by remember { mutableStateOf("") }
            val state = rememberLazyListState()
            val msgs = chat?.messages.orEmpty()
            val busy = Chats.sending != null && Chats.sending == (open ?: Chats.sending)
            LaunchedEffect(msgs.size, busy) { if (msgs.isNotEmpty()) runCatching { state.animateScrollToItem(msgs.size) } }
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = state, contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(msgs.size) { i ->
                    val m = msgs[i]
                    val mine = m.role == "user"
                    Box(Modifier.fillMaxWidth(), contentAlignment = if (mine) Alignment.CenterEnd else Alignment.CenterStart) {
                        androidx.compose.foundation.text.selection.SelectionContainer(
                            Modifier.fillMaxWidth(0.88f).clip(RoundedCornerShape(12.dp))
                                .background(if (mine) GraphiteHigh else GraphiteRaised),
                        ) {
                            Text(m.text, color = Mist, fontSize = 14.sp, modifier = Modifier.padding(12.dp))
                        }
                    }
                }
                item { if (busy) Text("Researching…", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(8.dp)) else Box(Modifier) }
            }
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    text, { text = it }, Modifier.weight(1f), maxLines = 4,
                    placeholder = { Text("Ask something", color = Muted) },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
                        focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
                    ),
                )
                IconButton(
                    enabled = !busy && text.isNotBlank(),
                    onClick = {
                        if (!Ai.connected) { Toast.makeText(ctx, "Add an API key in Settings first", Toast.LENGTH_SHORT).show(); return@IconButton }
                        val q = text; text = ""
                        Chats.send(open, q) { id, err ->
                            open = id; fresh = false
                            if (err != null) Toast.makeText(ctx, err, Toast.LENGTH_LONG).show()
                        }
                    },
                ) { Icon(Icons.AutoMirrored.Rounded.Send, "Send", tint = if (!busy && text.isNotBlank()) Amber else Muted) }
            }
        }
    }
}
