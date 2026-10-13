package be.syntaxya.lodica.ui

import android.text.format.DateUtils
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.Mail
import be.syntaxya.lodica.engine.Relay
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Coral
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

/** Hidden-email aliases and the mail the relay received for them. */
@Composable
fun InboxScreen() {
    LaunchedEffect(Unit) { Relay.refresh() }
    val sel = Relay.selected
    val mail = sel?.let { id -> Relay.mails.firstOrNull { it.id == id } }
    if (sel != null && mail != null) MailDetail(mail) else MailList()
}

@Composable
private fun MailList() {
    var confirm by remember { mutableStateOf<Confirm?>(null) }
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { TopBar("Inbox") { Ui.back() } }
            IconButton(onClick = { Relay.refresh() }, enabled = !Relay.loading) {
                Icon(Icons.Rounded.Refresh, "Refresh", tint = if (Relay.loading) Muted else Mist)
            }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
            item { Section("Mail") }
            Relay.error?.let { e -> item { Text(e, color = Coral, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp)) } }
            if (Relay.mails.isEmpty()) item {
                Text(
                    if (Relay.loading) "Loading…" else "No mail yet",
                    color = Muted, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                )
            }
            items(Relay.mails, key = { "m" + it.id }) { m ->
                Column(
                    Modifier.fillMaxWidth().clickable { Relay.selected = m.id }
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                ) {
                    Text(m.subject.ifBlank { "(no subject)" }, color = Mist, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "${when_(m)} · ${m.from.ifBlank { "unknown sender" }}",
                        color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        Relay.siteOf(m.to)?.let { "for $it · ${m.to}" } ?: m.to,
                        color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            item { Section("Addresses") }
            if (Relay.aliases.isEmpty()) item {
                Text(
                    "Tap \"Use hidden email\" on a sign-up form to make one",
                    color = Muted, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                )
            }
            items(Relay.aliases.sortedByDescending { it.created }, key = { "a" + it.address }) { a ->
                Row(Modifier.fillMaxWidth().padding(start = 20.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        SelectionContainer { Text(a.address, color = Mist, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        Text(
                            "${a.site} · ${DateUtils.getRelativeTimeSpanString(a.created)}",
                            color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    IconButton(onClick = {
                        confirm = Confirm("Forget address?", "${a.address} is removed from this list. Mail to it still arrives at the relay.", "Forget") {
                            Relay.forget(a)
                        }
                    }) { Icon(Icons.Rounded.Close, "Forget", tint = Muted, modifier = Modifier.size(18.dp)) }
                }
            }
        }
    }
    confirm?.let { c -> ConfirmDialog(c) { confirm = null } }
}

@Composable
private fun MailDetail(m: Mail) {
    val ctx = LocalContext.current
    var confirm by remember { mutableStateOf<Confirm?>(null) }
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { TopBar("Mail") { Ui.back() } }
            TextButton(onClick = {
                confirm = Confirm("Delete mail?", m.subject.ifBlank { "(no subject)" }, "Delete") {
                    Relay.delete(m) { ok ->
                        if (ok) Relay.selected = null
                        else Toast.makeText(ctx, "Couldn't delete", Toast.LENGTH_SHORT).show()
                    }
                }
            }) { Text("Delete", color = Coral) }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
            Text(m.subject.ifBlank { "(no subject)" }, color = Mist, fontSize = 18.sp)
            Spacer(Modifier.height(6.dp))
            Text("From ${m.from.ifBlank { "unknown" }}", color = Muted, fontSize = 12.sp)
            Text("To ${m.to}${Relay.siteOf(m.to)?.let { " ($it)" } ?: ""}", color = Muted, fontSize = 12.sp)
            Text(when_(m), color = Muted, fontSize = 12.sp)
            if (m.links.isNotEmpty()) {
                Section("Links")
                m.links.forEach { url ->
                    Text(
                        url, color = Amber, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.fillMaxWidth().clickable { openLink(url) }.padding(vertical = 8.dp),
                    )
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 12.dp), color = GraphiteHigh)
            SelectionContainer { Text(m.text.ifBlank { "(no text body)" }, color = Mist, fontSize = 14.sp) }
            Spacer(Modifier.height(32.dp))
        }
    }
    confirm?.let { c -> ConfirmDialog(c) { confirm = null } }
}

private fun when_(m: Mail): String {
    val t = m.receivedMs
    return if (t > 0) DateUtils.getRelativeTimeSpanString(t).toString() else m.date
}

/** Opens a mail link in a new tab and returns to the browser. */
internal fun openLink(url: String) {
    TabManager.open(url)
    Relay.selected = null
    Relay.incoming = null
    Ui.screen = Screen.Browser
}
