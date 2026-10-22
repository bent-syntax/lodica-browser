package be.syntaxya.lodica.ui

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import be.syntaxya.lodica.engine.Diag
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AlternateEmail
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Search
import androidx.compose.ui.graphics.asImageBitmap
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
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
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
import be.syntaxya.lodica.engine.WebApps
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
    Overlay(Ui.screen == Screen.Downloads) { DownloadsScreen() }
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
        Ui.totpAsk?.let { TotpAskDialog(it) }
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

private val FILE_URL = Regex("\\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|epub)$", RegexOption.IGNORE_CASE)

private fun isFileUrl(url: String): Boolean =
    url.startsWith("file:") || url.startsWith("content:") || FILE_URL.containsMatchIn(url.substringBefore('#').substringBefore('?'))

@Composable
private fun BrowserScreen() {
    val tab = TabManager.current
    val full = TabManager.fullscreen
    var query by remember { mutableStateOf(TextFieldValue()) }

    DisposableEffect(Unit) {
        TabManager.onScroll = { dy, y ->
            Ui.barOffset = if (Ui.barHidden) Ui.barHeight else if (y <= 0 || Ui.editing || Ui.finding || !Prefs.gestureBarHide) 0f else (Ui.barOffset + dy).coerceIn(0f, Ui.barHeight)
        }
        onDispose { TabManager.onScroll = null }
    }
    // A file (PDF, document, local file) hides the bar by itself; a new page brings it back. Long-press toggles it by hand.
    LaunchedEffect(tab?.url) { Ui.barHidden = tab?.url?.let(::isFileUrl) == true }
    LaunchedEffect(Ui.editing, Ui.finding) { if (Ui.editing || Ui.finding) Ui.barHidden = false }
    LaunchedEffect(Ui.barHidden, Ui.barHeight) { Ui.barOffset = if (Ui.barHidden) Ui.barHeight else 0f }
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
    // Selecting or copying the address must never move the bar: pin it while editing or finding.
    LaunchedEffect(Ui.editing, Ui.finding) { if (Ui.editing || Ui.finding) Ui.showBar() }

    Box(
        Modifier.fillMaxSize()
            .then(if (full) Modifier else Modifier.systemBarsPadding().imePadding())
            .clipToBounds()
    ) {
        val locked = tab?.locked == true
        PageGestures(tab?.takeUnless { locked }, Modifier.fillMaxSize()) {
            GeckoHost(tab?.session?.takeUnless { locked }, Modifier.fillMaxSize())
        }

        val home = tab != null && tab.url == TabManager.HOME && !locked && Ui.screen == Screen.Browser
        AnimatedVisibility(home && !Ui.editing, enter = fadeIn(tween(200)), exit = fadeOut(tween(160))) {
            StartPage(Modifier.fillMaxSize())
        }
        if (Diag.overlay) androidx.compose.material3.Text(Diag.stats, color = androidx.compose.ui.graphics.Color.Yellow, fontSize = 12.sp,
            modifier = Modifier.align(Alignment.TopStart).background(androidx.compose.ui.graphics.Color(0xAA000000)).padding(4.dp))
        if (tab?.crashed == true && !locked) CrashedView(tab)
        if (locked) LockedView()

        AnimatedVisibility(Ui.editing, enter = fadeIn(tween(160)), exit = fadeOut(tween(140))) {
            // Sit exactly on top of the measured bar (it grows with the keyboard inset), not a guessed height.
            val barDp = with(androidx.compose.ui.platform.LocalDensity.current) { Ui.barHeight.toDp() }.coerceAtLeast(58.dp)
            Suggestions(query.text, Modifier.fillMaxSize().padding(bottom = barDp)) { go(it) }
        }

        if (!full) {
            // Offset is read in the layout phase, so scrolling moves the chips without recomposing the screen.
            Column(
                Modifier.align(Alignment.BottomCenter)
                    .offset { androidx.compose.ui.unit.IntOffset(0, -(Ui.barHeight - Ui.barOffset).coerceAtLeast(0f).toInt()) }
                    .padding(bottom = 8.dp).padding(horizontal = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Ui.clipLink?.takeIf { !Ui.editing }?.let { ClipChip(it) }
                if (tab != null && !Ui.editing && !locked && tab.emailFocus && tab.emailSignup && Prefs.dummyLogin && Relay.available && Relay.baseDomain(tab.host) !in Prefs.noDummy) HiddenEmailChip(tab)
                if (tab != null && !Ui.editing && !locked && WebApps.installable(tab) && tab.host !in Ui.installDismissed) InstallChip(tab)
                Relay.incoming?.let { MailBanner(it) }
            }
            BottomBar(query, { query = it }, Modifier.align(Alignment.BottomCenter))
            if (Ui.barHidden) {
                // Long-press where the bar sits to bring it back.
                val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
                Box(
                    Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(with(androidx.compose.ui.platform.LocalDensity.current) { Ui.barHeight.toDp() }.coerceAtLeast(58.dp))
                        .pointerInput(Unit) {
                            detectTapGestures(onLongPress = {
                                haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                                Ui.barHidden = false
                            })
                        },
                )
            }
        }
    }
}

/** Offered while an email field on a sign-up form has focus. */
@Composable
private fun HiddenEmailChip(tab: Tab) {
    val ctx = LocalContext.current
    Surface(
        shape = RoundedCornerShape(24.dp),
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
            Text("Hidden email", fontSize = 14.sp)
        }
    }
}

/** A link the user copied elsewhere, offered when they come back to Lodica. */
/** Offered when the page declares an installable web app manifest. */
@Composable
private fun InstallChip(tab: be.syntaxya.lodica.tabs.Tab) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val name = remember(tab.manifest) { tab.manifest?.let { m -> listOf("short_name", "name").map { if (m.isNull(it)) "" else m.optString(it).trim() }.firstOrNull { it.isNotEmpty() } }.orEmpty() }
    Surface(shape = RoundedCornerShape(24.dp), color = GraphiteRaised, contentColor = Mist, shadowElevation = 4.dp, modifier = Modifier.padding(bottom = 6.dp)) {
        Row(Modifier.padding(start = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Install ${name.ifEmpty { tab.host }} as an app", fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            TextButton(onClick = { Ui.installDismissed += tab.host; WebApps.install(ctx, tab) }) { Text("Install", color = Amber, fontSize = 13.sp) }
            TextButton(onClick = { Ui.installDismissed += tab.host }) { Text("Not now", color = Muted, fontSize = 13.sp) }
        }
    }
}

@Composable
private fun ClipChip(link: String) {
    val host = remember(link) { runCatching { android.net.Uri.parse(link).host.orEmpty() }.getOrDefault("").removePrefix("www.") }
    Surface(
        shape = RoundedCornerShape(24.dp),
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
        shape = RoundedCornerShape(18.dp),
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
    // Under a full-screen overlay the page is invisible, so stop drawing it once the slide-in has finished.
    var covered by remember { mutableStateOf(false) }
    LaunchedEffect(Ui.screen) {
        if (Ui.screen == Screen.Browser) covered = false
        else { kotlinx.coroutines.delay(350); covered = true }
    }
    AndroidView(
        factory = { ctx ->
            GeckoView(ctx).apply {
                // GeckoView draws straight to a SurfaceView by default. Do not call setViewBackend(BACKEND_SURFACE_VIEW):
                // re-creating the surface view leaves the compositor without a surface and every page stays blank.
                // The TextureView option costs an extra GPU copy per frame and made scrolling choppy on 2-core GPUs.
                if (!Prefs.fastRender) {
                    setViewBackend(GeckoView.BACKEND_TEXTURE_VIEW)
                    // 120Hz panels give a texture view an 8.3ms budget that mid-range GPUs miss on every frame; 60Hz fits.
                    if (android.os.Build.VERSION.SDK_INT >= 35) requestedFrameRate = 60f
                }
                coverUntilFirstPaint(bg)
                Ui.gecko = this
            }
        },
        update = { v ->
            Ui.gecko = v
            // A hidden SurfaceView loses its surface and can come back blank, so only texture views are hidden.
            v.visibility = if (covered && !Prefs.fastRender) android.view.View.INVISIBLE else android.view.View.VISIBLE
            if (v.session !== session) {
                if (v.session != null) v.releaseSession()
                if (session != null) {
                    // No cover here: a session that already painted never fires "first paint" again,
                    // so the cover would stay on screen as a black view.
                    v.setSession(session)
                    // select() activates the session before the view is attached; repeat it so the
                    // compositor resumes on the new surface.
                    if (TabManager.current?.locked != true) { session.setActive(true); session.setFocused(true) }
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

private val FavCache = HashMap<String, androidx.compose.ui.graphics.ImageBitmap>()

private class Shortcut(val url: String, val title: String, val mine: Boolean)

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun StartPage(modifier: Modifier) {
    val top by produceState(emptyList<Visit>(), TabManager.current) {
        value = withContext(Dispatchers.IO) { runCatching { History.topSites(8) }.getOrDefault(emptyList()) }
    }
    val mine = Prefs.quickList()
    val seen = mine.map { runCatching { android.net.Uri.parse(it.first).host.orEmpty() }.getOrDefault("") }.toSet()
    val priv = TabManager.current?.private == true
    val auto = if (Prefs.quickAuto && !priv) top.filter { !it.title.contains("Forbidden") && !it.title.startsWith("Problem loading") && !it.title.startsWith("Server not found") }.filter { runCatching { android.net.Uri.parse(it.url).host.orEmpty() }.getOrDefault("") !in seen }.take(maxOf(0, 8 - mine.size)) else emptyList()
    val tiles = mine.map { Shortcut(it.first, it.second, true) } + auto.map { Shortcut(it.url, runCatching { android.net.Uri.parse(it.url).host.orEmpty().removePrefix("www.") }.getOrDefault("").ifBlank { it.title }, false) }
    var adding by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<Shortcut?>(null) }
    Box(modifier.background(Graphite)) {
    StartBackdrop(Modifier.fillMaxSize())
    var q by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, bottom = 72.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // The mark is the "l" of the name.
            if (TabManager.current?.private == true) IncognitoMark(52.dp) else Kite(52.dp)
            Text(
                "odica",
                style = MaterialTheme.typography.headlineMedium,
                color = Mist,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.sp,
            )
        }
        Spacer(Modifier.height(28.dp))
        OutlinedTextField(
            q, { q = it },
            Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(28.dp),
            placeholder = { Text("Search or enter address", color = Muted) },
            trailingIcon = { Icon(Icons.Rounded.Search, null, tint = Amber, modifier = Modifier.clickable { go(q); q = "" }) },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Search),
            keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { go(q); q = "" }),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
                focusedBorderColor = Amber, unfocusedBorderColor = Amber.copy(alpha = 0.6f),
                focusedContainerColor = GraphiteRaised, unfocusedContainerColor = GraphiteRaised,
            ),
        )
        Spacer(Modifier.height(28.dp))
        tiles.chunked(4).forEach { row ->
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                row.forEach { s -> SiteTile(s.url, s.title, { TabManager.load(s.url) }, if (s.mine) ({ removing = s }) else null) }
                repeat(4 - row.size) { Spacer(Modifier.width(64.dp)) }
            }
        }
        if (mine.size < 24) Row(
            Modifier.padding(top = 8.dp).height(36.dp).clip(CircleShape).background(GraphiteRaised).clickable { adding = true }.padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Rounded.Add, null, tint = Amber, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("Add shortcut", color = Amber, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        }
    }
    }
    if (adding) {
        var url by remember { mutableStateOf("") }
        var name by remember { mutableStateOf("") }
        val colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
            focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
        )
        AlertDialog(
            onDismissRequest = { adding = false },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Add shortcut") },
            text = {
                Column {
                    OutlinedTextField(name, { name = it }, singleLine = true, label = { Text("Name", color = Muted) }, colors = colors)
                    OutlinedTextField(url, { url = it }, Modifier.padding(top = 8.dp), singleLine = true, label = { Text("Address", color = Muted) }, placeholder = { Text("example.com", color = Muted) }, colors = colors)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val u = url.trim().let { if (it.isEmpty() || Regex("^[a-z][a-z0-9+.-]*:", RegexOption.IGNORE_CASE).containsMatchIn(it)) it else "https://$it" }
                    if (u.isNotEmpty()) Prefs.updateQuick(Prefs.quickList() + (u to name.trim().ifEmpty { android.net.Uri.parse(u).host.orEmpty().removePrefix("www.") }))
                    adding = false
                }) { Text("Add", color = Amber) }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Cancel", color = Muted) } },
        )
    }
    removing?.let { r ->
        AlertDialog(
            onDismissRequest = { removing = null },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Remove ${r.title.ifBlank { r.url }}?") },
            confirmButton = { TextButton(onClick = { Prefs.updateQuick(Prefs.quickList().filter { it.first != r.url }); removing = null }) { Text("Remove", color = Amber) } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancel", color = Muted) } },
        )
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun SiteTile(url: String, title: String, onClick: () -> Unit, onLong: (() -> Unit)?) {
    val host = remember(url) { runCatching { android.net.Uri.parse(url).host.orEmpty() }.getOrDefault("").removePrefix("www.") }
    Column(
        Modifier.width(64.dp).clip(RoundedCornerShape(12.dp)).combinedClickable(onClick = onClick, onLongClick = onLong).padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val icon by produceState<androidx.compose.ui.graphics.ImageBitmap?>(FavCache[host], host) {
            if (value == null && host.isNotEmpty()) value = withContext(Dispatchers.IO) {
                runCatching {
                    val c = java.net.URL("https://$host/favicon.ico").openConnection() as java.net.HttpURLConnection
                    c.connectTimeout = 4000; c.readTimeout = 4000
                    c.inputStream.use { android.graphics.BitmapFactory.decodeStream(it) }?.asImageBitmap()
                }.getOrNull()
            }?.also { FavCache[host] = it }
        }
        Box(Modifier.size(44.dp).clip(CircleShape).background(GraphiteRaised), contentAlignment = Alignment.Center) {
            val ic = icon
            if (ic != null) androidx.compose.foundation.Image(ic, null, Modifier.size(26.dp))
            else Text(host.firstOrNull()?.uppercase() ?: "•", color = Amber, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
        }
        Spacer(Modifier.height(6.dp))
        Text(
            title.ifBlank { host }, color = Muted, fontSize = 11.sp,
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
