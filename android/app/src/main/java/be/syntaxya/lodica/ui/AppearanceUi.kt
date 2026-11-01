package be.syntaxya.lodica.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Gradient
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.CustomTheme
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.engine.Relay
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import be.syntaxya.lodica.ui.theme.Palette
import be.syntaxya.lodica.ui.theme.Palettes
import be.syntaxya.lodica.ui.theme.ThemeState

/** A round swatch with a label underneath; the ring shows the current choice. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun RoundChoice(
    label: String, selected: Boolean, size: Dp = 52.dp, onLongClick: (() -> Unit)? = null, onClick: () -> Unit, content: @Composable () -> Unit,
) {
    val ring by animateColorAsState(if (selected) Amber else GraphiteHigh, tween(180), label = "ring")
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(size + 12.dp)) {
        Box(
            Modifier.size(size).clip(CircleShape).border(if (selected) 2.dp else 1.dp, ring, CircleShape).combinedClickable(onLongClick = onLongClick, onClick = onClick),
            contentAlignment = Alignment.Center,
        ) { content() }
        Text(
            label, color = if (selected) Amber else Muted, fontSize = 11.sp, maxLines = 1,
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal, modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/** Circle showing a theme: its background with the raised surface and accent as two dots. */
@Composable
private fun ThemeDot(p: Palette?) {
    if (p == null) {
        // "System": half dark, half light.
        Row(Modifier.fillMaxWidth().fillMaxHeight()) {
            Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFF111827)))
            Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFFF9FAFB)))
        }
        return
    }
    Box(Modifier.fillMaxWidth().fillMaxHeight().background(Color(p.bg)), contentAlignment = Alignment.Center) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(12.dp).clip(CircleShape).background(Color(p.raised)).border(1.dp, Color(p.high), CircleShape))
            Box(Modifier.size(12.dp).clip(CircleShape).background(Color(p.accent)))
        }
    }
}

/** Circle with [bg] as the base and two dots in the other colours of a theme. */
@Composable
private fun ColourDot(bg: Long, a: Long, b: Long) {
    Box(Modifier.fillMaxWidth().fillMaxHeight().background(Color(bg)), contentAlignment = Alignment.Center) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(12.dp).clip(CircleShape).background(Color(a)))
            Box(Modifier.size(12.dp).clip(CircleShape).background(Color(b)))
        }
    }
}

private fun px(h: String) = 0xFF000000 or h.removePrefix("#").toLong(16)

/** Saved custom themes as round swatches. Tap to use, long-press to delete. */
@Composable
internal fun SavedThemeSwatches() {
    if (Prefs.savedThemes.isEmpty()) return
    Text("Saved themes", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        val cur = Prefs.customTheme
        Prefs.savedThemes.forEach { t ->
            val on = Prefs.theme == "custom" && cur != null && cur.bg.equals(t.bg, true) && cur.text.equals(t.text, true) &&
                cur.accent.equals(t.accent, true) && cur.accent2.equals(t.accent2, true)
            RoundChoice(t.name, on, onLongClick = { Prefs.updateSavedThemes(Prefs.savedThemes.filter { it != t }); Relay.syncThemeNow() }, onClick = {
                Prefs.updateCustomTheme(CustomTheme(t.bg, t.text, t.accent, t.accent2, System.currentTimeMillis()))
                Prefs.updateTheme("custom")
                Relay.syncThemeNow()
            }) { ColourDot(px(t.bg), px(t.accent), px(t.accent2)) }
        }
    }
    Text("Long-press a saved theme to delete it.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp))
}

/** Scrollable row of round theme swatches, "System" first. */
@Composable
internal fun ThemeSwatches() {
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        be.syntaxya.lodica.ui.theme.ThemeChoices.forEach { (key, label) ->
            RoundChoice(label.substringBefore(' '), Prefs.theme == key, onClick = { Prefs.updateTheme(key) }) {
                ThemeDot(if (key == "dynamic") be.syntaxya.lodica.ui.theme.ThemeState.dynamic else Palettes.firstOrNull { it.key == key })
            }
        }
    }
}

@Composable
private fun anim(c: Long): Color {
    val v by animateColorAsState(Color(c), tween(260), label = "pv")
    return v
}

/** A small browser drawn in the colours of [p]: tabs, address bar, search box, tiles. Updates as the theme changes. */
@Composable
internal fun ThemePreview(p: Palette = ThemeState.palette) {
    val bg = anim(p.bg); val raised = anim(p.raised); val high = anim(p.high)
    val accent = anim(p.accent); val accent2 = anim(p.accent2); val text = anim(p.text); val muted = anim(p.muted)
    Column(
        Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp))
            .border(1.dp, GraphiteHigh, RoundedCornerShape(20.dp)).background(bg),
    ) {
        Row(Modifier.fillMaxWidth().background(raised).padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("Lodica", "Mail", "Docs").forEachIndexed { i, t ->
                Text(
                    t, color = if (i == 0) accent else muted, fontSize = 11.sp, maxLines = 1,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(if (i == 0) bg else Color.Transparent).padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
        Row(Modifier.fillMaxWidth().background(raised).padding(horizontal = 8.dp).padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "lodica://search", color = muted, fontSize = 11.sp,
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(bg).padding(horizontal = 10.dp, vertical = 6.dp),
            )
            Spacer(Modifier.width(8.dp))
            Box(Modifier.size(8.dp).clip(CircleShape).background(accent2))
        }
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                "Search the web", color = muted, fontSize = 12.sp,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(raised).padding(horizontal = 14.dp, vertical = 9.dp),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                repeat(4) { i -> Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(if (i == 0) accent else raised)) }
            }
            Box(Modifier.fillMaxWidth(0.8f).height(6.dp).clip(RoundedCornerShape(3.dp)).background(text.copy(alpha = 0.55f)))
            Box(Modifier.fillMaxWidth(0.5f).height(6.dp).clip(RoundedCornerShape(3.dp)).background(high))
        }
    }
}

/** Round icon button for the start-page background type. */
@Composable
private fun TypeChoice(label: String, icon: ImageVector, selected: Boolean, onClick: () -> Unit) {
    RoundChoice(label, selected, onClick = onClick) {
        Box(Modifier.fillMaxWidth().fillMaxHeight().background(GraphiteRaised), contentAlignment = Alignment.Center) {
            Icon(if (selected) Icons.Rounded.Check else icon, null, tint = if (selected) Amber else Mist, modifier = Modifier.size(22.dp))
        }
    }
}

/** The four background kinds as round buttons (none, gradient, colour, image). */
@Composable
internal fun BackgroundTypes(onNone: () -> Unit, onGradient: () -> Unit, onColour: () -> Unit, onImage: () -> Unit) {
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        TypeChoice("None", Icons.Rounded.Block, Prefs.startBg == "none", onNone)
        TypeChoice("Gradient", Icons.Rounded.Gradient, Prefs.startBg == "gradient", onGradient)
        TypeChoice("Colour", Icons.Rounded.Palette, Prefs.startBg == "color", onColour)
        TypeChoice("Image", Icons.Rounded.Image, Prefs.startBg == "image", onImage)
    }
}

/** The start page background as it will look, with the current dim and blur, and a search box on top. */
@Composable
internal fun StartPreview() {
    Box(
        Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().aspectRatio(1.8f)
            .clip(RoundedCornerShape(20.dp)).border(1.dp, GraphiteHigh, RoundedCornerShape(14.dp)),
    ) {
        StartBackdrop(Modifier.fillMaxWidth().fillMaxHeight())
        Text(
            "Search the web", color = Mist, fontSize = 12.sp,
            modifier = Modifier.align(Alignment.Center).clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.35f))
                .padding(horizontal = 22.dp, vertical = 9.dp),
        )
    }
}

/** Holiday themes as round swatches: tap a claimed one to use it, tap a claimable one to claim it. */
@Composable
internal fun HolidayThemes() {
    val claimed = Prefs.claimedThemes
    Section("Holiday themes")
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        be.syntaxya.lodica.ui.theme.Holidays.forEach { h ->
            val have = h.id in claimed
            val can = be.syntaxya.lodica.ui.theme.canClaim(h.id)
            Box(Modifier.alpha(if (have || can) 1f else 0.45f)) {
                RoundChoice(h.label, Prefs.theme == h.id, onClick = {
                    if (have) Prefs.updateTheme(h.id) else if (can) Prefs.claimTheme(h.id)
                }) { ColourDot(h.palette.bg, h.palette.accent, h.palette.accent2) }
            }
        }
    }
    val next = be.syntaxya.lodica.ui.theme.Holidays.filter { it.id !in claimed }.minByOrNull { be.syntaxya.lodica.ui.theme.daysTo(it).let { d -> if (d < -7) d + 365 else d } }
    val hint = next?.let {
        if (be.syntaxya.lodica.ui.theme.canClaim(it.id)) "${it.label} can be claimed now. Tap it." else "Next: ${it.label}, claimable a week before."
    } ?: "All holiday themes claimed."
    Text(hint, color = Muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp))
    SwitchRow("Holiday effects", "Falling snow, confetti and similar effects on holiday themes", Prefs.holidayFx) { Prefs.updateHolidayFx(it) }
}
