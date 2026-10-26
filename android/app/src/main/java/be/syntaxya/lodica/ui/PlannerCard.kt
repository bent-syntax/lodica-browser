package be.syntaxya.lodica.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

private val ROW_H = 31.dp

/** The Smartschool planner on the native start page. Every row has its own box; tasks are amber, tests red. Drag the grip to show more lessons. */
@Composable
fun PlannerCard(modifier: Modifier = Modifier) {
    var rows by remember { mutableStateOf(PlannerWidget.plan()) }
    var note by remember { mutableStateOf(PlannerWidget.note()) }
    var clock by remember { mutableStateOf(PlannerWidget.now()) }
    var open by remember { mutableStateOf(-1) }
    LaunchedEffect(Prefs.plannerIcs, Prefs.plannerTz, Prefs.plannerSlots) {
        while (true) {
            withContext(Dispatchers.IO) { runCatching { PlannerWidget.fetch() } }
            rows = PlannerWidget.plan()
            note = PlannerWidget.note()
            clock = PlannerWidget.now()
            delay(60_000)
        }
    }
    val density = androidx.compose.ui.platform.LocalDensity.current
    var drag by remember { mutableStateOf(0f) }
    val shown = Prefs.plannerRows
    Column(modifier.clip(RoundedCornerShape(20.dp)).background(GraphiteRaised).padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text("Smartschool planner", color = Mist, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Box(Modifier.height(8.dp))
        if (note != null) Text(note!!, color = Muted, fontSize = 13.sp)
        else Column(Modifier.fillMaxWidth().height(ROW_H * shown.coerceAtMost(rows.size.coerceAtLeast(1))).verticalScroll(rememberScrollState())) {
            val (today, minute) = clock
            val cur = rows.indexOfFirst { it.kind == 0 && !it.allDay && it.day == today && minute >= it.from && minute < it.to }
            val next = if (cur >= 0) -1 else rows.indexOfFirst { it.kind == 0 && !it.allDay && (it.day > today || (it.day == today && it.from > minute)) }
            for ((i, r) in rows.withIndex()) {
                val bg = when {
                    r.kind == 1 -> Color(0x59F59E0B)
                    r.kind == 2 -> Color(0x59F43F5E)
                    else -> Color(0x26808080)
                }
                Box(Modifier.fillMaxWidth().height(ROW_H - 4.dp)) {
                    Text(
                        r.text.substringBefore(' ') + " " + r.range + "  " + r.title, color = Mist, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.fillMaxWidth().height(ROW_H - 4.dp).clip(RoundedCornerShape(12.dp)).background(bg).clickable { open = if (open == i) -1 else i }.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                    if (i == cur) {
                        val f = (minute - r.from).toFloat() / (r.to - r.from).coerceAtLeast(1)
                        Box(Modifier.fillMaxWidth().offset(y = (ROW_H - 4.dp) * f).height(2.dp).background(Amber))
                    } else if (i == next) Box(Modifier.fillMaxWidth().offset(y = (-3).dp).height(2.dp).background(Amber))
                }
                Box(Modifier.height(4.dp))
                if (open == i) {
                    Column(Modifier.fillMaxWidth().padding(bottom = 4.dp).clip(RoundedCornerShape(12.dp)).background(Color(0x26808080)).padding(horizontal = 12.dp, vertical = 8.dp)) {
                        Text(r.title, color = Mist, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                        Text(r.text.substringBefore(' ') + ", " + r.range, color = Muted, fontSize = 13.sp)
                        if (r.detail.isNotBlank()) Text(r.detail, color = Mist, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
        }
        if (note == null && rows.size > 2) Box(
            Modifier.fillMaxWidth().padding(top = 6.dp).draggable(
                orientation = Orientation.Vertical,
                state = rememberDraggableState { d ->
                    drag += d
                    val step = with(density) { ROW_H.toPx() }
                    while (drag > step) { Prefs.updatePlannerRows(Prefs.plannerRows + 1); drag -= step }
                    while (drag < -step) { Prefs.updatePlannerRows(Prefs.plannerRows - 1); drag += step }
                },
            ),
            contentAlignment = Alignment.Center,
        ) { Box(Modifier.width(40.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(Muted)) }
    }
}
