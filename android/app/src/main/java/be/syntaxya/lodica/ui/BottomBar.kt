package be.syntaxya.lodica.ui

import android.graphics.Bitmap
import android.widget.Toast
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.KeyboardDoubleArrowRight
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.RemoveModerator
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.VpnLock
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.mozilla.geckoview.GeckoSession
import be.syntaxya.lodica.engine.Engine
import be.syntaxya.lodica.engine.History
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.engine.Relay
import be.syntaxya.lodica.engine.Visit
import be.syntaxya.lodica.tabs.Tab
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Coral
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.KiteGradient
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import androidx.compose.material.icons.rounded.AutoAwesome
import be.syntaxya.lodica.engine.Ai

private enum class BarMode { Main, Edit, Find }

/** Bottom toolbar: address pill, find bar or URL editor, with a gradient load line on top. */
@Composable
fun BottomBar(query: TextFieldValue, onQuery: (TextFieldValue) -> Unit, modifier: Modifier) {
    val tab = TabManager.current
    val mode = when {
        Ui.finding -> BarMode.Find
        Ui.editing -> BarMode.Edit
        else -> BarMode.Main
    }
    Column(
        modifier.fillMaxWidth()
            .graphicsLayer { translationY = if (mode == BarMode.Main) Ui.barOffset else 0f }
            .onSizeChanged { Ui.barHeight = it.height.toFloat() }
            .background(GraphiteRaised)
    ) {
        LoadLine(tab)
        AnimatedContent(
            mode,
            transitionSpec = { fadeIn(tween(160)) togetherWith fadeOut(tween(120)) },
            label = "bar",
        ) { m ->
            when (m) {
                BarMode.Main -> MainBar(tab) {
                    if (tab?.locked == true) return@MainBar
                    val url = tab?.url?.takeIf { it != TabManager.HOME }?.let { Prefs.searchQuery(it) ?: it }.orEmpty()
                    onQuery(TextFieldValue(url, TextRange(0, url.length)))
                    // Editing first: scroll events from the keyboard resize must not slide the bar while it is pinned.
                    Ui.editing = true
                    Ui.showBar()
                }
                BarMode.Edit -> EditBar(query, onQuery)
                BarMode.Find -> FindBar()
            }
        }
    }
}

@Composable
private fun LoadLine(tab: Tab?) {
    val loading = tab != null && tab.loading && tab.progress < 100
    val fill = remember { Animatable(1f) }
    LaunchedEffect(tab, loading) { if (loading) fill.snapTo(0.04f) }
    LaunchedEffect(tab?.progress, loading) {
        fill.animateTo(if (loading) (tab?.progress ?: 100).coerceAtLeast(4) / 100f else 1f, tween(260))
    }
    val alpha by animateFloatAsState(if (loading) 1f else 0f, tween(if (loading) 120 else 420), label = "load")
    Box(Modifier.fillMaxWidth().height(2.dp).graphicsLayer { this.alpha = alpha }) {
        Box(Modifier.fillMaxWidth(fill.value).fillMaxHeight().background(Amber))
    }
}

@Composable
private fun MainBar(tab: Tab?, onEdit: () -> Unit) {
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val threshold = with(LocalDensity.current) { 72.dp.toPx() }
    var drag by remember { mutableFloatStateOf(0f) }

    Row(
        Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Shield(tab)
        Row(
            Modifier.weight(1f).height(40.dp)
                .graphicsLayer { translationX = drag; alpha = 1f - (kotlin.math.abs(drag) / (threshold * 3)).coerceAtMost(0.5f) }
                .clip(RoundedCornerShape(20.dp))
                .background(Graphite)
                .pointerInput(tab, Prefs.gestureSwipeTabs) {
                    if (!Prefs.gestureSwipeTabs) return@pointerInput
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            val slot = when {
                                drag <= -threshold -> GestureSlot.ADDR_LEFT
                                drag >= threshold -> GestureSlot.ADDR_RIGHT
                                else -> null
                            }
                            if (slot != null && slot.action != GestureAction.NONE) {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                runGesture(slot.action, tab)
                            }
                            scope.launch { animate(drag, 0f, animationSpec = tween(220)) { v, _ -> drag = v } }
                        },
                        onDragCancel = { scope.launch { animate(drag, 0f, animationSpec = tween(220)) { v, _ -> drag = v } } },
                    ) { change, dx ->
                        change.consume()
                        drag += dx
                    }
                }
                .clickable(onClick = onEdit)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val home = tab == null || tab.url == TabManager.HOME
            val locked = tab?.locked == true
            val (icon, tint) = when {
                locked -> Icons.Rounded.Lock to Coral
                home -> Icons.Rounded.Search to Muted
                tab!!.url.startsWith("https://") && tab.secure -> Icons.Rounded.Lock to Muted
                tab.url.startsWith("http://") -> Icons.Rounded.Warning to Coral
                else -> Icons.Rounded.Public to Muted
            }
            Icon(icon, null, tint = tint, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(8.dp))
            Text(
                when {
                    locked -> "Private tab locked"
                    home -> "Search or type URL"
                    else -> Prefs.searchQuery(tab!!.url) ?: tab.host.ifBlank { tab.url }
                },
                color = if (home || locked) Muted else Mist,
                fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            val routed = !home && !locked && Relay.routed(tab!!.url)
            if (tab?.private == true || routed) Spacer(Modifier.weight(1f))
            if (routed) {
                Icon(Icons.Rounded.VpnLock, "Routed through VPS", tint = Amber, modifier = Modifier.size(16.dp))
            }
            if (tab?.private == true) {
                if (routed) Spacer(Modifier.width(6.dp))
                Text("Private", color = Coral, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        IconButton(onClick = { TabManager.open(TabManager.HOME, private = tab?.private == true); Ui.editing = false }) {
            Icon(Icons.Rounded.Add, "New tab", tint = Mist)
        }
        TabCount(tab)
        IconButton(onClick = { Ui.menuOpen = true }) { Icon(Icons.Rounded.MoreVert, "Menu", tint = Mist) }
    }
}

@Composable
private fun Shield(tab: Tab?) {
    val ctx = LocalContext.current
    val trusted = tab?.trusted == true
    val on = Engine.ublock != null && !trusted
    Box(
        Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).clickable(enabled = tab != null) {
            val t = tab ?: return@clickable
            val msg = when {
                !TabManager.toggleTrust(t) -> "Wait for the page to load"
                t.trusted -> "Protection off for ${t.host}"
                else -> "Protection back on for ${t.host}"
            }
            Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()
        },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            if (trusted) Icons.Rounded.RemoveModerator else Icons.Rounded.Shield,
            if (trusted) "Protection off for this site" else "Protection on. Tap to trust this site",
            tint = if (on) Amber else Muted, modifier = Modifier.size(22.dp),
        )
        val n = tab?.blocked ?: 0
        if (n > 0 && !trusted) {
            Text(
                if (n > 99) "99+" else "$n",
                color = Graphite, fontSize = 8.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.Center).padding(top = 1.dp),
            )
        }
    }
}

@Composable
private fun TabCount(tab: Tab?) {
    val private = tab?.private == true
    val n = TabManager.tabs.count { it.private == private }
    Box(
        Modifier.padding(start = 6.dp).size(44.dp).clip(RoundedCornerShape(10.dp)).clickable { openTabs() },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(24.dp).border(1.5.dp, if (private) Coral else Mist, RoundedCornerShape(6.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(if (n > 99) ":D" else "$n", color = Mist, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun EditBar(query: TextFieldValue, onQuery: (TextFieldValue) -> Unit) {
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(Unit) { focus.requestFocus() }
    DisposableEffect(Unit) { onDispose { keyboard?.hide() } }

    Row(
        Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = { Ui.editing = false }) { Icon(Icons.Rounded.ArrowBack, "Cancel", tint = Mist) }
        Box(
            Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(Graphite).padding(horizontal = 14.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            BasicTextField(
                value = query,
                onValueChange = onQuery,
                singleLine = true,
                textStyle = TextStyle(color = Mist, fontSize = 15.sp),
                cursorBrush = SolidColor(Amber),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Go,
                    autoCorrectEnabled = false,
                ),
                keyboardActions = KeyboardActions(onGo = { go(query.text) }),
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
                decorationBox = { inner ->
                    if (query.text.isEmpty()) Text("Search ${Prefs.search.label} or type URL", color = Muted, fontSize = 15.sp, maxLines = 1)
                    inner()
                },
            )
        }
        if (query.text.isNotEmpty()) {
            if (Ai.connected) {
                IconButton(onClick = { askAi(query.text.trim()); Ui.editing = false }) {
                    Icon(Icons.Rounded.AutoAwesome, "Ask AI", tint = Amber)
                }
            }
            if (query.text.length > 28) {
                // Long links need no manual scrolling: jump the text marker to the end.
                IconButton(onClick = { onQuery(query.copy(selection = TextRange(query.text.length))); focus.requestFocus() }) {
                    Icon(Icons.Rounded.KeyboardDoubleArrowRight, "Cursor to end", tint = Muted)
                }
            }
            IconButton(onClick = { onQuery(TextFieldValue()) }) { Icon(Icons.Rounded.Close, "Clear", tint = Muted) }
        }
    }
}

@Composable
private fun FindBar() {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    LaunchedEffect(Ui.findQuery) {
        delay(140)
        find(Ui.findQuery, GeckoSession.FINDER_FIND_FORWARD)
    }

    Row(
        Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(Graphite).padding(horizontal = 14.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            BasicTextField(
                value = Ui.findQuery,
                onValueChange = { Ui.findQuery = it },
                singleLine = true,
                textStyle = TextStyle(color = Mist, fontSize = 15.sp),
                cursorBrush = SolidColor(Amber),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { find(null, GeckoSession.FINDER_FIND_FORWARD) }),
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
                decorationBox = { inner ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.weight(1f)) {
                            if (Ui.findQuery.isEmpty()) Text("Find in page", color = Muted, fontSize = 15.sp)
                            inner()
                        }
                        if (Ui.findCount.isNotEmpty()) Text(Ui.findCount, color = Muted, fontSize = 12.sp)
                    }
                },
            )
        }
        IconButton(onClick = { find(null, GeckoSession.FINDER_FIND_BACKWARDS) }) { Icon(Icons.Rounded.KeyboardArrowUp, "Previous", tint = Mist) }
        IconButton(onClick = { find(null, GeckoSession.FINDER_FIND_FORWARD) }) { Icon(Icons.Rounded.KeyboardArrowDown, "Next", tint = Mist) }
        IconButton(onClick = { Ui.stopFind() }) { Icon(Icons.Rounded.Close, "Close", tint = Mist) }
    }
}

/** null text = step to the next/previous match of the last search. */
private fun find(text: String?, flags: Int) {
    val f = TabManager.current?.session?.finder ?: return
    if (text != null && text.isEmpty()) {
        f.clear(); Ui.findCount = ""; return
    }
    if (text == null && Ui.findQuery.isEmpty()) return
    f.find(text, flags).accept(
        { r -> Ui.findCount = if (r != null && r.found) "${r.current}/${r.total}" else "0/0" },
        { _ -> Ui.findCount = "0/0" },
    )
}

/** Snapshot the current page for its card, then show the tab switcher. */
fun openTabs() {
    Ui.editing = false
    if (Ui.finding) Ui.stopFind()
    Ui.menuOpen = false
    val tab = TabManager.current
    val g = Ui.gecko
    if (tab == null || g == null || g.session == null || tab.url == TabManager.HOME || tab.crashed || tab.locked) {
        Ui.screen = Screen.Tabs
        return
    }
    // Capture while the page is still on screen, then show the switcher. A capture that never answers
    // (compositor paused) must not leave the switcher stuck, so a short timeout opens it anyway.
    var shown = false
    fun show() { if (!shown) { shown = true; Ui.screen = Screen.Tabs } }
    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ show() }, 500)
    g.capturePixels().accept(
        { b ->
            // A blank frame keeps the previous thumbnail instead of replacing it with an empty card.
            if (b != null) { if (isBlank(b)) b.recycle() else tab.thumbnail = shrink(b) }
            show()
        },
        { _ -> show() },
    )
}

/** True when a coarse grid of pixels is one flat colour (or fully transparent): nothing was rendered. */
private fun isBlank(b: Bitmap): Boolean {
    if (b.width < 2 || b.height < 2) return true
    val first = b.getPixel(b.width / 2, b.height / 2)
    for (i in 1..7) for (j in 1..7) {
        val p = b.getPixel(b.width * i / 8, b.height * j / 8)
        if (p != first) return false
    }
    return (first ushr 24) == 0 || first == 0xFF000000.toInt()
}

private fun shrink(b: Bitmap): Bitmap {
    val w = 360
    if (b.width <= w) return b
    val s = Bitmap.createScaledBitmap(b, w, (b.height * w.toFloat() / b.width).toInt().coerceAtLeast(1), true)
    if (s !== b) b.recycle()
    return s
}

/** Search row, past searches, then history matches, ranked by recency and frequency. All local. */
@Composable
fun Suggestions(text: String, modifier: Modifier, onPick: (String) -> Unit) {
    val on = Prefs.historySuggest
    val visits by produceState(emptyList<Visit>(), text, on) {
        if (!on) { value = emptyList(); return@produceState }
        delay(60)
        value = withContext(Dispatchers.IO) {
            runCatching { if (text.isBlank()) History.topSites(8) else History.suggest(text, 8) }.getOrDefault(emptyList())
        }
    }
    val past by produceState(emptyList<String>(), text, on) {
        if (!on) { value = emptyList(); return@produceState }
        delay(60)
        value = withContext(Dispatchers.IO) { runCatching { History.suggestSearches(text, 3) }.getOrDefault(emptyList()) }
    }
    LazyColumn(modifier.background(Graphite), reverseLayout = true) {
        if (text.isNotBlank()) {
            item(key = "search") {
                SuggestionRow(Icons.Rounded.Search, text.trim(), "Search ${Prefs.search.label}", Amber) { onPick(text) }
            }
        }
        items(past, key = { "q:$it" }) { q ->
            SuggestionRow(Icons.Rounded.History, q, "Past search", Muted) { onPick(q) }
        }
        items(visits, key = { "u:" + it.url }) { v ->
            SuggestionRow(Icons.Rounded.History, v.title.ifBlank { v.url }, v.url, Muted) { onPick(v.url) }
        }
    }
}

@Composable
private fun SuggestionRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    tint: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(GraphiteHigh), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Mist, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
