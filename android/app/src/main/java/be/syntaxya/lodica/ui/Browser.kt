package be.syntaxya.lodica.ui

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AlternateEmail
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MarkEmailUnread
import androidx.compose.material.icons.rounded.SentimentDissatisfied
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView
import be.syntaxya.lodica.engine.Helper
import be.syntaxya.lodica.engine.History
import be.syntaxya.lodica.engine.Mail
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.engine.Relay
import be.syntaxya.lodica.engine.Visit
import be.syntaxya.lodica.tabs.Tab
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.KiteGradient
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

/** App root: the browser stays composed underneath so its GeckoView never gets torn down. */
@Composable
fun LodicaRoot() {
    Box(Modifier.fillMaxSize().background(Graphite)) {
        BrowserScreen()
        Overlay(Ui.screen == Screen.Tabs) { TabSwitcher() }
        Overlay(Ui.screen == Screen.Settings || Ui.screen == Screen.History || Ui.screen == Screen.Passwords || Ui.screen == Screen.Inbox) { SettingsScreen() }
        Overlay(Ui.screen == Screen.History) { HistoryScreen() }
        Overlay(Ui.screen == Screen.Passwords) { PasswordsScreen() }
        Overlay(Ui.screen == Screen.Inbox) { InboxScreen() }
        Overlay(Ui.screen == Screen.Chats) { ChatsScreen() }
        Overlay(Ui.screen == Screen.Room) { RoomScreen() }
        PromptDialogs()
        if (Ui.menuOpen) MenuSheet()
        TabManager.contextMenu?.let { ContextMenuSheet(it) }
        Ui.preview?.let { PreviewSheet(it) }
        Ui.reader?.let { ReaderSheet(it.first, it.second) }
        Ui.answer?.let { AnswerSheet(it) }
        Ui.picker?.let { PickerDialog(it) }
    }
}

@Composable
private fun Overlay(visible: Boolean, content: @Composable () -> Unit) {
    AnimatedVisibility(
        visible,
        enter = slideInVertically(tween(280, easing = FastOutSlowInEasing)) { it / 8 } + fadeIn(tween(220)),
        exit = slideOutVertically(tween(220, easing = FastOutSlowInEasing)) { it / 8 } + fadeOut(tween(180)),
    ) {
        Surface(Modifier.fillMaxSize(), color = Graphite, contentColor = Mist) {
            Box(Modifier.systemBarsPadding()) { content() }
        }
    }
}

@Composable
private fun BrowserScreen() {
    val tab = TabManager.current
    val full = TabManager.fullscreen
    var query by remember { mutableStateOf(TextFieldValue()) }

    DisposableEffect(Unit) {
        TabManager.onScroll = { dy, y ->
            Ui.barOffset = if (y <= 0 || Ui.editing || Ui.finding || !Prefs.gestureBarHide) 0f else (Ui.barOffset + dy).coerceIn(0f, Ui.barHeight)
        }
        onDispose { TabManager.onScroll = null }
    }
    // Bottom toolbar slides with the page: tell Gecko how much of the viewport the bar still covers.
    LaunchedEffect(Unit) {
        snapshotFlow { Triple(Ui.barOffset, Ui.barHeight, TabManager.fullscreen) }.collect { (off, h, fs) ->
            val g = Ui.gecko ?: return@collect
            if (fs) {
                g.setDynamicToolbarMaxHeight(0); g.setVerticalClipping(0)
            } else {
                g.setDynamicToolbarMaxHeight(h.toInt())
                val clip = -off.toInt()
                g.setVerticalClipping(if (kotlin.math.abs(h.toInt() + clip) <= 2) -h.toInt() else clip)
            }
        }
    }
    LaunchedEffect(tab) { Ui.showBar() }

    Box(
        Modifier.fillMaxSize()
            .then(if (full) Modifier else Modifier.systemBarsPadding().imePadding())
            .clipToBounds()
    ) {
        val locked = tab?.locked == true
        PageGestures(tab?.takeUnless { locked }, Modifier.fillMaxSize()) {
            GeckoHost(tab?.session?.takeUnless { locked }, Modifier.fillMaxSize())
        }

        val home = tab != null && tab.url == TabManager.HOME && !locked
        AnimatedVisibility(home && !Ui.editing, enter = fadeIn(tween(200)), exit = fadeOut(tween(160))) {
            StartPage(Modifier.fillMaxSize().padding(bottom = 72.dp))
        }
        if (tab?.crashed == true && !locked) CrashedView(tab)
        if (locked) LockedView()

        AnimatedVisibility(Ui.editing, enter = fadeIn(tween(160)), exit = fadeOut(tween(140))) {
            Suggestions(query.text, Modifier.fillMaxSize().padding(bottom = 64.dp)) { go(it) }
        }

        if (!full) {
            val lift = with(LocalDensity.current) { (Ui.barHeight - Ui.barOffset).coerceAtLeast(0f).toDp() }
            Column(
                Modifier.align(Alignment.BottomCenter).padding(bottom = lift + 8.dp).padding(horizontal = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Ui.clipLink?.takeIf { !Ui.editing }?.let { ClipChip(it) }
                if (tab != null && !Ui.editing && !locked && tab.emailFocus && tab.emailSignup && Prefs.dummyLogin && Relay.available && Relay.baseDomain(tab.host) !in Prefs.noDummy) HiddenEmailChip(tab)
                Relay.incoming?.let { MailBanner(it) }
            }
            BottomBar(query, { query = it }, Modifier.align(Alignment.BottomCenter))
        }
    }
}

/** Offered while an email field on a sign-up form has focus. */
@Composable
private fun HiddenEmailChip(tab: Tab) {
    val ctx = LocalContext.current
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = GraphiteRaised,
        contentColor = Mist,
        shadowElevation = 4.dp,
        modifier = Modifier.padding(bottom = 6.dp),
    ) {
        Row(
            Modifier.clickable {
                if (!Helper.fill(tab)) Toast.makeText(ctx, "No email field on this page", Toast.LENGTH_SHORT).show()
            }.padding(horizontal = 14.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Rounded.AlternateEmail, null, tint = Amber, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(8.dp))
            Text("Use hidden email", fontSize = 14.sp)
        }
    }
}

/** A link the user copied elsewhere, offered when they come back to Lodica. */
@Composable
private fun ClipChip(link: String) {
    val host = remember(link) { runCatching { android.net.Uri.parse(link).host.orEmpty() }.getOrDefault("").removePrefix("www.") }
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = GraphiteRaised,
        contentColor = Mist,
        shadowElevation = 4.dp,
        modifier = Modifier.padding(bottom = 6.dp),
    ) {
        Row(Modifier.padding(start = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.clickable { Ui.clipLink = null; TabManager.open(link) }.padding(vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Rounded.Link, null, tint = Amber, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text("Open copied link", fontSize = 14.sp)
                if (host.isNotEmpty()) {
                    Spacer(Modifier.width(6.dp))
                    Text(host, color = Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            TextButton(onClick = { Ui.clipLink = null; Ui.preview = link }) { Text("Preview", color = Amber, fontSize = 13.sp) }
            IconButton(onClick = { Ui.clipLink = null }, modifier = Modifier.size(36.dp)) {
                Icon(Icons.Rounded.Close, "Dismiss", tint = Muted, modifier = Modifier.size(16.dp))
            }
        }
    }
}

/** Shown instead of a private tab until the user confirms with biometrics or the screen lock. */
@Composable
private fun LockedView() {
    val act = LocalContext.current as FragmentActivity
    var error by remember { mutableStateOf<String?>(null) }
    fun unlock() {
        if (!Biometric.available(act)) { TabManager.unlockPrivate(); return }
        Biometric.unlock(act, "Unlock private tabs", onOk = { TabManager.unlockPrivate() }, onError = { error = it })
    }
    LaunchedEffect(Unit) { unlock() }
    Column(
        Modifier.fillMaxSize().background(Graphite).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Rounded.Lock, null, tint = Amber, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text("Private tabs locked", color = Mist, style = MaterialTheme.typography.titleMedium)
        error?.let { Text(it, color = Muted, fontSize = 13.sp) }
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { error = null; unlock() },
            colors = ButtonDefaults.buttonColors(containerColor = Amber, contentColor = Graphite),
        ) { Text("Unlock") }
    }
}

/** A confirmation mail arrived for an alias we are watching. */
@Composable
private fun MailBanner(m: Mail) {
    val link = remember(m.id) { Relay.confirmLink(m) }
    val site = Relay.siteOf(m.to) ?: m.to.substringBefore('@')
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = GraphiteRaised,
        contentColor = Mist,
        shadowElevation = 6.dp,
        modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
    ) {
        Row(Modifier.padding(start = 14.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.MarkEmailUnread, null, tint = Amber, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("Confirmation mail from $site", fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(m.subject.ifBlank { m.from }, color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (link != null) TextButton(onClick = { openLink(link) }) { Text("Open link", color = Amber, fontSize = 13.sp) }
            TextButton(onClick = {
                Relay.incoming = null
                Relay.selected = m.id
                Ui.menuOpen = false
                Ui.screen = Screen.Inbox
            }) { Text("View", color = Mist, fontSize = 13.sp) }
            IconButton(onClick = { Relay.incoming = null }) {
                Icon(Icons.Rounded.Close, "Dismiss", tint = Muted, modifier = Modifier.size(18.dp))
            }
        }
    }
}

/** Hosts the single GeckoView; swapping tabs swaps the session, not the view. */
@Composable
private fun GeckoHost(session: GeckoSession?, modifier: Modifier) {
    val bg = Graphite.toArgb()
    AndroidView(
        factory = { ctx ->
            GeckoView(ctx).apply {
                coverUntilFirstPaint(bg)
                Ui.gecko = this
            }
        },
        update = { v ->
            Ui.gecko = v
            if (v.session !== session) {
                if (v.session != null) v.releaseSession()
                if (session != null) {
                    v.coverUntilFirstPaint(bg)
                    v.setSession(session)
                    v.setDynamicToolbarMaxHeight(if (TabManager.fullscreen) 0 else Ui.barHeight.toInt())
                }
            }
        },
        onRelease = { v ->
            v.releaseSession()
            if (Ui.gecko === v) Ui.gecko = null
        },
        modifier = modifier,
    )
}

fun go(input: String) {
    val text = input.trim()
    if (text.isEmpty()) return
    Ui.editing = false
    if (Prefs.historySuggest && TabManager.current?.private != true && Prefs.isSearch(text)) History.search(text)
    TabManager.load(text)
}

@Composable
private fun StartPage(modifier: Modifier) {
    val sites by produceState(emptyList<Visit>(), TabManager.current) {
        value = withContext(Dispatchers.IO) { runCatching { History.topSites(8) }.getOrDefault(emptyList()) }
    }
    Box(modifier) {
    StartBackdrop(Modifier.fillMaxSize())
    Column(
        Modifier.fillMaxSize().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Kite(92.dp)
        Spacer(Modifier.height(10.dp))
        Text(
            "Lodica",
            style = MaterialTheme.typography.headlineMedium,
            color = Mist,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.sp,
        )
        Spacer(Modifier.height(36.dp))
        sites.chunked(4).forEach { row ->
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                row.forEach { SiteTile(it) }
                repeat(4 - row.size) { Spacer(Modifier.width(64.dp)) }
            }
        }
    }
    }
}

@Composable
private fun SiteTile(v: Visit) {
    val host = remember(v.url) { runCatching { android.net.Uri.parse(v.url).host.orEmpty() }.getOrDefault("").removePrefix("www.") }
    Column(
        Modifier.width(64.dp).clip(RoundedCornerShape(12.dp)).clickable { TabManager.load(v.url) }.padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(GraphiteRaised), contentAlignment = Alignment.Center) {
            Text(host.firstOrNull()?.uppercase() ?: "•", color = Amber, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
        }
        Spacer(Modifier.height(6.dp))
        Text(
            v.title.ifBlank { host }, color = Muted, fontSize = 11.sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun CrashedView(tab: Tab) {
    Column(
        Modifier.fillMaxSize().background(Graphite).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Rounded.SentimentDissatisfied, null, tint = Muted, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text("This tab crashed", color = Mist, style = MaterialTheme.typography.titleMedium)
        Text(tab.host, color = Muted, fontSize = 13.sp)
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { TabManager.reviveCrashed(tab) },
            colors = ButtonDefaults.buttonColors(containerColor = Amber, contentColor = Graphite),
        ) { Text("Reload tab") }
    }
}
