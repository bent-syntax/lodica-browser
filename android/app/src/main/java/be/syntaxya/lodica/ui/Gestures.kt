package be.syntaxya.lodica.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.tabs.Tab
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import kotlin.math.abs
import kotlin.math.roundToInt

/** What a gesture can do. The user picks one per [GestureSlot] in Settings. */
enum class GestureAction(val label: String) {
    NONE("Nothing"), BACK("Back"), FORWARD("Forward"), RELOAD("Reload"), NEW_TAB("New tab"),
    CLOSE_TAB("Close tab"), PREV_TAB("Previous tab"), NEXT_TAB("Next tab"),
}

enum class GestureSlot(val label: String, val def: GestureAction) {
    EDGE_LEFT("Swipe in from the left edge", GestureAction.BACK),
    EDGE_RIGHT("Swipe in from the right edge", GestureAction.FORWARD),
    FOUR_DOWN("Four-finger swipe down", GestureAction.RELOAD),
    FOUR_UP("Four-finger swipe up", GestureAction.NONE),
    ADDR_LEFT("Swipe the address bar left", GestureAction.NEXT_TAB),
    ADDR_RIGHT("Swipe the address bar right", GestureAction.PREV_TAB);

    val action get() = runCatching { GestureAction.valueOf(Prefs.gestureActions[name] ?: "") }.getOrDefault(def)
}

fun runGesture(a: GestureAction, tab: Tab?) {
    when (a) {
        GestureAction.NONE -> {}
        GestureAction.BACK -> tab?.session?.goBack()
        GestureAction.FORWARD -> tab?.session?.goForward()
        GestureAction.RELOAD -> tab?.session?.reload()
        GestureAction.NEW_TAB -> TabManager.open(TabManager.HOME, tab?.private == true)
        GestureAction.CLOSE_TAB -> tab?.let { TabManager.close(it) }
        GestureAction.PREV_TAB, GestureAction.NEXT_TAB -> if (tab != null) {
            val group = TabManager.tabs.filter { it.private == tab.private }
            group.getOrNull(group.indexOf(tab) + if (a == GestureAction.NEXT_TAB) 1 else -1)?.let { TabManager.select(it) }
        }
    }
}

/**
 * Swipe down with four fingers to reload, swipe in from the left edge to go back. Events are watched on
 * the way down to the GeckoView; once a gesture is recognised it is consumed so the page gets a cancel.
 */
@Composable
fun PageGestures(tab: Tab?, modifier: Modifier, content: @Composable BoxScope.() -> Unit) {
    val d = LocalDensity.current
    val edge = with(d) { 24.dp.toPx() }
    val slop = with(d) { 12.dp.toPx() }
    val pullMax = with(d) { 110.dp.toPx() }
    val pullAt = pullMax * 0.7f
    val backMax = with(d) { 120.dp.toPx() }
    val backAt = backMax * 0.7f
    val pull = remember { Animatable(0f) }
    val back = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val springy = spring<Float>(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow)

    var pullAction by remember { mutableStateOf(GestureAction.NONE) }
    var backAction by remember { mutableStateOf(GestureAction.NONE) }
    var backRight by remember { mutableStateOf(false) }

    Box(modifier.pointerInput(tab) {
        awaitPointerEventScope {
            val width = size.width
            while (true) {
                val down = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.pressed } ?: continue
                val t = tab ?: continue
                val leftAct = GestureSlot.EDGE_LEFT.action.takeIf { usable(it, t) }
                val rightAct = GestureSlot.EDGE_RIGHT.action.takeIf { usable(it, t) }
                val fromLeft = down.position.x < edge && leftAct != null && leftAct != GestureAction.NONE
                val fromRight = down.position.x > width - edge && rightAct != null && rightAct != GestureAction.NONE
                var mode = 0 // 0 undecided, 2 edge swipe, 3 four-finger swipe, -1 neither
                var dx = 0f; var dy = 0f
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    val held = ev.changes.filter { it.pressed }
                    if (held.isEmpty()) break
                    if (held.size >= 4 && mode != 2 && mode != 3) { mode = 3; dy = 0f }
                    if (mode == 3) {
                        if (held.size < 4) break
                        dy += held.sumOf { it.positionChange().y.toDouble() }.toFloat() / held.size
                        held.forEach { it.consume() }
                        pullAction = (if (dy >= 0) GestureSlot.FOUR_DOWN else GestureSlot.FOUR_UP).action
                        scope.launch { pull.snapTo(if (pullAction == GestureAction.NONE) 0f else (abs(dy) * 0.5f).coerceIn(0f, pullMax)) }
                        continue
                    }
                    // Two or three fingers may still become a four-finger swipe; they only cancel an edge swipe.
                    if (held.size > 1) { if (mode == 2) break else continue }
                    val c = held.firstOrNull { it.id == down.id } ?: continue
                    val p = c.positionChange()
                    dx += p.x; dy += p.y
                    if (mode == 0) {
                        mode = when {
                            fromLeft && dx > slop && abs(dx) > abs(dy) -> { backRight = false; backAction = leftAct!!; 2 }
                            fromRight && -dx > slop && abs(dx) > abs(dy) -> { backRight = true; backAction = rightAct!!; 2 }
                            abs(dx) > slop || abs(dy) > slop -> -1
                            else -> 0
                        }
                    }
                    if (mode == 2) { c.consume(); scope.launch { back.snapTo((abs(dx) * 0.6f).coerceIn(0f, backMax)) } }
                }
                if (mode == 3 && pull.value >= pullAt) runGesture(pullAction, t)
                if (mode == 2 && back.value >= backAt) runGesture(backAction, t)
                scope.launch { pull.animateTo(0f, springy) }
                scope.launch { back.animateTo(0f, springy) }
            }
        }
    }) {
        content()
        if (pull.value > 0f) {
            val ready = pull.value >= pullAt
            Bubble(
                Modifier.align(Alignment.TopCenter).offset { IntOffset(0, pull.value.roundToInt()) }
                    .graphicsLayer { rotationZ = if (pullAction == GestureAction.RELOAD) pull.value / pullMax * 300f else 0f; alpha = (pull.value / pullAt).coerceAtMost(1f) },
                ready,
            ) { Icon(gestureIcon(pullAction), pullAction.label, tint = if (ready) GraphiteRaised else Amber) }
        }
        if (back.value > 0f) {
            val ready = back.value >= backAt
            val off = if (backRight) -(back.value - with(d) { 44.dp.toPx() }) else back.value - with(d) { 44.dp.toPx() }
            Bubble(
                Modifier.align(if (backRight) Alignment.CenterEnd else Alignment.CenterStart).offset { IntOffset(off.roundToInt(), 0) }
                    .graphicsLayer { alpha = (back.value / backAt).coerceAtMost(1f) },
                ready,
            ) { Icon(gestureIcon(backAction), backAction.label, tint = if (ready) GraphiteRaised else Amber) }
        }
    }
}

private fun usable(a: GestureAction, t: Tab) = when (a) {
    GestureAction.BACK -> t.canBack
    GestureAction.FORWARD -> t.canFwd
    else -> true
}

private fun gestureIcon(a: GestureAction) = when (a) {
    GestureAction.BACK, GestureAction.PREV_TAB -> Icons.AutoMirrored.Rounded.ArrowBack
    GestureAction.FORWARD, GestureAction.NEXT_TAB -> Icons.AutoMirrored.Rounded.ArrowForward
    GestureAction.RELOAD -> Icons.Rounded.Refresh
    GestureAction.NEW_TAB -> Icons.Rounded.Add
    GestureAction.CLOSE_TAB -> Icons.Rounded.Close
    GestureAction.NONE -> Icons.Rounded.Check
}

@Composable
private fun Bubble(modifier: Modifier, ready: Boolean, icon: @Composable () -> Unit) {
    Box(
        modifier.padding(8.dp).size(40.dp).clip(CircleShape).background(if (ready) Amber else GraphiteRaised),
        contentAlignment = Alignment.Center,
    ) { icon() }
}
