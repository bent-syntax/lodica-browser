package be.syntaxya.lodica.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Unarchive
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import be.syntaxya.lodica.tabs.Tab
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.tabs.TabRecord
import androidx.compose.ui.platform.LocalContext
import androidx.fragment.app.FragmentActivity
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Coral
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

@Composable
fun TabSwitcher() {
    var private by remember { mutableStateOf(TabManager.current?.private == true) }
    var undoTick by remember { mutableIntStateOf(0) }
    val shown = TabManager.tabs.filter { it.private == private }

    // Undo stays offered for 4s after the last close.
    var undoVisible by remember { mutableStateOf(false) }
    LaunchedEffect(undoTick) {
        if (undoTick == 0) return@LaunchedEffect
        undoVisible = true
        delay(4000)
        undoVisible = false
    }

    fun closeTab(t: Tab) {
        TabManager.close(t)
        if (!t.private) undoTick++
        if (TabManager.tabs.none { it.private == private } && private) private = false
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ModeToggle(private) { private = it }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = {
                    TabManager.closeAll(private)
                    if (!private) undoTick++
                    private = false
                    Ui.screen = Screen.Browser
                }) { Text("Close all", color = Muted) }
            }

            LazyVerticalGrid(
                GridCells.Fixed(2),
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(12.dp, 4.dp, 12.dp, 96.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (shown.isEmpty()) {
                    item(span = { GridItemSpan(2) }) {
                        Text(
                            if (private) "No private tabs" else "No tabs",
                            color = Muted, modifier = Modifier.padding(32.dp), fontSize = 14.sp,
                        )
                    }
                }
                items(shown, key = { it.id }) { t ->
                    val act = LocalContext.current as FragmentActivity
                    TabCard(
                        t, t === TabManager.current, Modifier.animateItem(),
                        private,
                        onOpen = {
                            val go = { TabManager.select(t); Ui.screen = Screen.Browser }
                            when {
                                !t.locked -> go()
                                !Biometric.available(act) -> { TabManager.unlockPrivate(); go() }
                                else -> Biometric.unlock(act, "Unlock private tabs", onOk = { TabManager.unlockPrivate(); go() })
                            }
                        },
                        onClose = { closeTab(t) },
                    )
                }
                item(key = "new-tab") {
                    val accent = if (private) Coral else Amber
                    val shape = RoundedCornerShape(16.dp)
                    Box(
                        Modifier.animateItem().fillMaxWidth().aspectRatio(0.8f).clip(shape)
                            .border(BorderStroke(1.5.dp, accent.copy(alpha = 0.5f)), shape)
                            .clickable { TabManager.open(TabManager.HOME, private); Ui.screen = Screen.Browser },
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Rounded.Add, "New tab", tint = accent, modifier = Modifier.size(32.dp))
                            Text(if (private) "New private tab" else "New tab", color = accent, fontSize = 13.sp)
                        }
                    }
                }
                if (!private && TabManager.archived.isNotEmpty()) {
                    item(span = { GridItemSpan(2) }, key = "archive-head") {
                        Row(
                            Modifier.fillMaxWidth().padding(top = 20.dp).animateItem(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Rounded.Inventory2, null, tint = Muted, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Archived (${TabManager.archived.size})", color = Muted, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            Spacer(Modifier.weight(1f))
                            TextButton(onClick = { TabManager.clearArchive() }) { Text("Clear", color = Coral) }
                        }
                    }
                    items(TabManager.archived.toList(), key = { "a-" + it.id }, span = { GridItemSpan(2) }) { r ->
                        ArchivedRow(r, Modifier.animateItem())
                    }
                }
            }
        }

        AnimatedVisibility(
            undoVisible && TabManager.canUndo,
            Modifier.align(Alignment.BottomCenter).padding(16.dp),
            enter = slideInVertically(tween(220)) { it } + fadeIn(tween(200)),
            exit = slideOutVertically(tween(180)) { it } + fadeOut(tween(160)),
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GraphiteHigh, contentColor = Mist, shadowElevation = 6.dp) {
                Row(Modifier.padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Tab closed", fontSize = 14.sp)
                    Spacer(Modifier.width(24.dp))
                    TextButton(onClick = {
                        TabManager.undoClose()?.let { private = it.private }
                        undoVisible = false
                    }) { Text("Undo", color = Amber, fontWeight = FontWeight.SemiBold) }
                }
            }
        }
    }
}

@Composable
private fun ModeToggle(private: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.clip(RoundedCornerShape(50)).background(GraphiteRaised).padding(3.dp)) {
        listOf(false to "Tabs", true to "Private").forEach { (p, label) ->
            val bg by animateColorAsState(if (p == private) GraphiteHigh else GraphiteRaised, tween(200), label = "mode")
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(bg).clickable { onChange(p) }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (p) {
                    Icon(Icons.Rounded.VisibilityOff, null, tint = if (private) Coral else Muted, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                }
                val n = TabManager.tabs.count { it.private == p }
                Text("$label $n", color = if (p == private) Mist else Muted, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun TabCard(t: Tab, selected: Boolean, modifier: Modifier, incognito: Boolean, onOpen: () -> Unit, onClose: () -> Unit) {
    val shape = RoundedCornerShape(16.dp)
    val accent = if (incognito) Coral else Amber
    var entered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entered = true }
    val grow by animateFloatAsState(if (entered) 1f else 0.82f, tween(260), label = "tab-in")
    Column(
        modifier.graphicsLayer { scaleX = grow; scaleY = grow; alpha = (grow - 0.82f) / 0.18f }
            .clip(shape).background(if (incognito) Coral.copy(alpha = 0.10f).compositeOver(GraphiteRaised) else GraphiteRaised)
            .then(if (selected) Modifier.border(BorderStroke(2.dp, accent), shape) else if (incognito) Modifier.border(BorderStroke(1.dp, Coral.copy(alpha = 0.35f)), shape) else Modifier)
            .clickable(onClick = onOpen),
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                when {
                    t.locked -> "Locked"
                    t.url == TabManager.HOME -> "New tab"
                    else -> t.displayTitle
                },
                color = Mist, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onClose, modifier = Modifier.size(36.dp)) {
                Icon(Icons.Rounded.Close, "Close tab", tint = Muted, modifier = Modifier.size(18.dp))
            }
        }
        Box(Modifier.fillMaxWidth().aspectRatio(0.8f).background(Graphite), contentAlignment = Alignment.Center) {
            val thumb = t.thumbnail
            if (t.locked) {
                Icon(Icons.Rounded.Lock, "Locked", tint = Amber, modifier = Modifier.size(32.dp))
            } else if (thumb != null) {
                Image(
                    thumb.asImageBitmap(), null, Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop, alignment = Alignment.TopCenter,
                )
            } else {
                Kite(40.dp, tail = false)
            }
        }
    }
}

@Composable
private fun ArchivedRow(r: TabRecord, modifier: Modifier) {
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(GraphiteRaised)
            .clickable { TabManager.unarchive(r); Ui.screen = Screen.Browser }
            .padding(start = 14.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(Muted))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(r.title.ifBlank { r.url }, color = Mist, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(r.url, color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        IconButton(onClick = { TabManager.unarchive(r); Ui.screen = Screen.Browser }) {
            Icon(Icons.Rounded.Unarchive, "Restore", tint = Amber, modifier = Modifier.size(20.dp))
        }
        IconButton(onClick = { TabManager.archived.remove(r); TabManager.save() }) {
            Icon(Icons.Rounded.Delete, "Delete", tint = Muted, modifier = Modifier.size(20.dp))
        }
    }
}
