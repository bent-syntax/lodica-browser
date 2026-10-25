package be.syntaxya.lodica.ui

import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PersistableBundle
import android.widget.Toast
import be.syntaxya.lodica.engine.WebApps
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.material.icons.rounded.ExpandLess
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.automirrored.outlined.Article as OutlinedArticle
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.automirrored.rounded.Article
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.DataSaverOn
import androidx.compose.material.icons.rounded.RestoreFromTrash
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.AlternateEmail
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DesktopWindows
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.HighQuality
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.InstallMobile
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.Downloads
import be.syntaxya.lodica.engine.Engine
import be.syntaxya.lodica.engine.Helper
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.engine.Relay
import be.syntaxya.lodica.tabs.ContextMenuRequest
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Coral
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MenuSheet() {
    val ctx = LocalContext.current
    val tab = TabManager.current
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    fun close() { Ui.menuOpen = false }
    val navTile = Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)).background(GraphiteHigh)

    ModalBottomSheet(
        onDismissRequest = { close() },
        sheetState = state,
        containerColor = GraphiteRaised,
        contentColor = Mist,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 12.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                IconButton(modifier = navTile, onClick = { tab?.session?.goBack(); close() }, enabled = tab?.canBack == true) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = if (tab?.canBack == true) Mist else Muted)
                }
                IconButton(modifier = navTile, onClick = { tab?.session?.goForward(); close() }, enabled = tab?.canFwd == true) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowForward, "Forward", tint = if (tab?.canFwd == true) Mist else Muted)
                }
                IconButton(modifier = navTile, onClick = {
                    if (tab?.loading == true) tab.session?.stop() else tab?.session?.reload()
                    close()
                }) {
                    if (tab?.loading == true) Icon(Icons.Rounded.Close, "Stop", tint = Mist)
                    else Icon(Icons.Rounded.Refresh, "Reload", tint = Mist)
                }
                IconButton(modifier = navTile, onClick = {
                    tab?.let {
                        val q = Prefs.searchQuery(it.url)
                        if (q != null) Prompts.host?.share(q, null, Prefs.publicSearchUrl(q))
                        else Prompts.host?.share(it.title, null, Prefs.cleanUrl(it.url))
                    }
                    close()
                }, enabled = tab != null && tab.url != TabManager.HOME) {
                    Icon(Icons.Rounded.Share, "Share", tint = Mist)
                }
            }
            Spacer(Modifier.height(12.dp))

            val items = buildList {
                add(MenuItem("new", Icons.Outlined.Add, "New tab") {
                    TabManager.open(TabManager.HOME); Ui.screen = Screen.Browser
                })
                add(MenuItem("private", Icons.Outlined.VisibilityOff, "Private tab", Coral) {
                    TabManager.open(TabManager.HOME, private = true); Ui.screen = Screen.Browser
                })
                add(MenuItem("find", Icons.Outlined.Search, "Find in page") { Ui.finding = true })
                add(MenuItem("desktop", Icons.Outlined.DesktopWindows, if (tab?.desktop == true) "Mobile site" else "Desktop site",
                    if (tab?.desktop == true) Amber else Mist) {
                    tab?.let { TabManager.setDesktop(it, !it.desktop) }
                })
                add(MenuItem("downloads", Icons.Outlined.Download, "Downloads") { Ui.screen = Screen.Downloads })
                add(MenuItem("history", Icons.Outlined.History, "History") { Ui.go(Screen.History) })
                add(MenuItem("aichats", Icons.Outlined.AutoAwesome, "AI chats") { Ui.go(Screen.Chats) })
                add(MenuItem("passwords", Icons.Outlined.Key, "Passwords") { Ui.go(Screen.Passwords) })
                add(MenuItem("settings", Icons.Outlined.Settings, "Settings") { Ui.screen = Screen.Settings })
                if (Relay.available) {
                    if (tab != null && tab.url != TabManager.HOME) add(MenuItem("hidden", Icons.Outlined.AlternateEmail, "Hidden email", Amber) {
                        if (!Helper.fill(tab)) Toast.makeText(ctx, "No email field on this page", Toast.LENGTH_SHORT).show()
                    })
                    add(MenuItem("chat", Icons.Outlined.Forum, "Server chat") { Ui.go(Screen.Room) })
                    add(MenuItem("inbox", Icons.Outlined.Inbox, "Inbox") { Ui.go(Screen.Inbox) })
                    if (tab != null && tab.url != TabManager.HOME) {
                        val off = Relay.baseDomain(tab.host) in Prefs.noDummy
                        add(MenuItem("dummy", Icons.Outlined.AlternateEmail, if (off) "Email prompt off" else "Email prompt on", if (off) Amber else Mist) {
                            Prefs.toggleNoDummy(tab.host)
                            Toast.makeText(ctx, if (off) "Hidden email offered on this site" else "Hidden email not offered on this site", Toast.LENGTH_SHORT).show()
                        })
                    }
                }
                if (tab != null && tab.url != TabManager.HOME) {
                    add(MenuItem("reader", Icons.AutoMirrored.Outlined.OutlinedArticle, "Reader") {
                        if (!Helper.reader(tab)) Toast.makeText(ctx, "Page not ready", Toast.LENGTH_SHORT).show()
                    })
                    val lite = tab.host in Prefs.lite
                    add(MenuItem("lite", Icons.Outlined.DataSaverOn, if (lite) "Full site" else "Lite mode", if (lite) Amber else Mist) {
                        Prefs.toggleLite(tab.host); tab.session?.reload()
                        Toast.makeText(ctx, if (lite) "Full site" else "Lite mode on for this site", Toast.LENGTH_SHORT).show()
                    })
                    add(MenuItem("remind", Icons.Outlined.Alarm, "Remind me") { Ui.picker = Picker.Remind })
                    val compat = Prefs.isCompat(tab.host)
                    add(MenuItem("compat", Icons.Outlined.Build, if (compat) "Compat on" else "Compat mode", if (compat) Amber else Mist) {
                        TabManager.setCompat(tab, !compat)
                        Toast.makeText(ctx, if (compat) "Compat mode off" else "Compat mode on for this site", Toast.LENGTH_SHORT).show()
                    })
                    if (WebApps.installable(tab)) add(MenuItem("install", Icons.Outlined.InstallMobile, "Install as app") { WebApps.install(ctx, tab) })
                }
                add(MenuItem("speed", Icons.Outlined.Speed, if (Prefs.speed != 1f) "Speed ${Prefs.speed}x" else "Video speed",
                    if (Prefs.speed != 1f) Amber else Mist) { Ui.picker = Picker.Speed })
                if (tab != null) {
                    val q = Prefs.qualityFor(tab.host)
                    add(MenuItem("quality", Icons.Outlined.HighQuality, "Video ${q ?: Prefs.quality}p", if (q != null) Amber else Mist) {
                        Ui.picker = Picker.Quality
                    })
                }
                if (TabManager.recentlyClosed().isNotEmpty()) {
                    add(MenuItem("closed", Icons.Outlined.RestoreFromTrash, "Closed tabs") { Ui.picker = Picker.Closed })
                }
                if (tab != null && !tab.private && tab.url != TabManager.HOME) {
                    add(MenuItem("archive", Icons.Outlined.Inventory2, "Archive tab") { TabManager.archive(tab); Toast.makeText(ctx, "Tab archived", Toast.LENGTH_SHORT).show() })
                }
            }
            var all by remember { mutableStateOf(false) }
            val tileKeys = listOf("new", "private", "reader")
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                tileKeys.forEach { k ->
                    val m = items.firstOrNull { it.key == k }
                    if (m != null) MenuTile(m, Modifier.weight(1f)) { m.action(); close() }
                    else MenuTile(MenuItem(k, Icons.AutoMirrored.Outlined.OutlinedArticle, "Reader", Muted) {}, Modifier.weight(1f), enabled = false) {}
                }
            }
            Spacer(Modifier.height(8.dp))
            val rest = items.filter { it.key !in tileKeys }
            val shown = if (all) rest else rest.filter { it.key in Prefs.menuPins }
            shown.forEach { m ->
                val pin = all && m.key in Prefs.menuPins
                MenuRow(m, pin, onLong = if (all) ({ Prefs.togglePin(m.key) }) else null) { m.action(); close() }
            }
            HorizontalDivider(Modifier.padding(horizontal = 20.dp, vertical = 6.dp), color = GraphiteHigh)
            MenuRow(MenuItem("more", if (all) Icons.Outlined.ExpandLess else Icons.Outlined.MoreHoriz, if (all) "Fewer" else "More") { all = !all }) { all = !all }
            if (all) Text("Long-press an item to pin it to the quick menu.", color = Muted, fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        }
    }
}

private class MenuItem(
    val key: String,
    val icon: ImageVector,
    val label: String,
    val tint: androidx.compose.ui.graphics.Color = Mist,
    val action: () -> Unit,
)

@Composable
private fun MenuTile(m: MenuItem, modifier: Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).background(Graphite).clickable(enabled = enabled, onClick = onClick).padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val tint = when { !enabled -> Muted; m.key == "new" -> Amber; else -> Mist }
        Icon(m.icon, null, tint = tint, modifier = Modifier.size(24.dp))
        Spacer(Modifier.height(8.dp))
        Text(m.label.removeSuffix(" tab").takeIf { m.key == "private" } ?: m.label, color = if (enabled) Mist else Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun MenuRow(m: MenuItem, pinned: Boolean = false, onLong: (() -> Unit)? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp).clip(RoundedCornerShape(12.dp))
            .combinedClickable(onLongClick = onLong, onClick = onClick).padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(m.icon, null, tint = if (m.tint != Mist) m.tint else Muted, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(16.dp))
        Text(m.label, color = if (m.tint != Mist) m.tint else Mist, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (pinned) Icon(Icons.Outlined.PushPin, "Pinned", tint = Amber, modifier = Modifier.size(18.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContextMenuSheet(req: ContextMenuRequest) {
    val ctx = LocalContext.current
    val el = req.element
    val link = el.linkUri
    val media = el.srcUri?.takeIf { el.type != 0 }
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    fun close() { TabManager.contextMenu = null }

    ModalBottomSheet(
        onDismissRequest = { close() },
        sheetState = state,
        containerColor = GraphiteRaised,
        contentColor = Mist,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 12.dp)) {
            Text(
                link ?: media ?: el.title ?: "",
                color = Muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
            HorizontalDivider(Modifier.padding(vertical = 6.dp), color = GraphiteHigh)
            if (link != null) {
                Action(Icons.AutoMirrored.Rounded.OpenInNew, "Open in new tab") {
                    TabManager.open(link, private = req.tab.private, select = false, parent = req.tab)
                }
                if (!req.tab.private) Action(Icons.Rounded.VisibilityOff, "Open in private tab", Coral) {
                    TabManager.open(link, private = true, select = false, parent = req.tab)
                }
                Action(Icons.Rounded.Visibility, "Preview link") { Ui.preview = link }
                Action(Icons.Rounded.ContentCopy, "Copy link") { copy(ctx, Prefs.cleanUrl(link)) }
                Action(Icons.Rounded.Download, "Download link") {
                    Downloads.fetch(ctx, Engine.runtime(ctx), link, req.tab.private)
                }
                Action(Icons.Rounded.Share, "Share link") { Prompts.host?.share(el.linkText, null, Prefs.cleanUrl(link)) }
            }
            if (media != null) {
                val kind = when (el.type) { 1 -> "image"; 2 -> "video"; else -> "audio" }
                if (link == null || link != media) Action(Icons.AutoMirrored.Rounded.OpenInNew, "Open $kind in new tab") {
                    TabManager.open(media, private = req.tab.private, select = false, parent = req.tab)
                }
                Action(Icons.Rounded.Download, "Download $kind") {
                    Downloads.fetch(ctx, Engine.runtime(ctx), media, req.tab.private)
                }
                Action(Icons.Rounded.ContentCopy, "Copy $kind address") { copy(ctx, Prefs.cleanUrl(media)) }
                Action(Icons.Rounded.Share, "Share $kind") { Prompts.host?.share(el.altText ?: el.title, null, Prefs.cleanUrl(media)) }
            }
        }
    }
}

@Composable
private fun Action(icon: ImageVector, label: String, tint: androidx.compose.ui.graphics.Color = Mist, run: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { run(); TabManager.contextMenu = null }.padding(horizontal = 20.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(if (tint != Mist) tint.copy(alpha = 0.16f) else GraphiteHigh),
            contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint, modifier = Modifier.size(22.dp)) }
        Spacer(Modifier.width(16.dp))
        Text(label, color = Mist, fontSize = 15.sp)
    }
}

internal fun copy(ctx: Context, text: String, sensitive: Boolean = false) {
    val cm = ctx.getSystemService(ClipboardManager::class.java) ?: return
    val clip = ClipData.newPlainText(if (sensitive) "secret" else "link", text)
    if (sensitive && Build.VERSION.SDK_INT >= 33) {
        clip.description.extras = PersistableBundle().apply {
            putBoolean(android.content.ClipDescription.EXTRA_IS_SENSITIVE, true)
        }
    }
    cm.setPrimaryClip(clip)
    Ui.clipSeen = text
}
