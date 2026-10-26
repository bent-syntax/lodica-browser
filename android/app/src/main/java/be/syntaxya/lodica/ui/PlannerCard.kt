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
    val ctx = androidx.compose.ui.platform.LocalContext.current
    var drag by remember { mutableStateOf(0f) }
    val shown = Prefs.plannerRows
    // a task or test inside a lesson is already shown when that lesson is opened, so it gets no row of its own
    val vis = rows.filter { r -> !(r.kind != 0 && !r.allDay && rows.any { l -> l.kind == 0 && !l.allDay && l.day == r.day && r.from >= l.from && r.from < l.to }) }
    Column(modifier.clip(RoundedCornerShape(20.dp)).background(GraphiteRaised).padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text("Smartschool planner", color = Mist, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Box(Modifier.height(8.dp))
        if (note != null) Text(note!!, color = Muted, fontSize = 13.sp)
        else Column(Modifier.fillMaxWidth().height(ROW_H * shown.coerceAtMost(vis.size.coerceAtLeast(1))).verticalScroll(rememberScrollState())) {
            val (today, minute) = clock
            val cur = vis.indexOfFirst { it.kind == 0 && !it.allDay && it.day == today && minute >= it.from && minute < it.to }
            val next = if (cur >= 0) -1 else vis.indexOfFirst { !it.allDay && (it.day > today || (it.day == today && it.from > minute)) }
            val done = Prefs.plannerDone
            for ((i, r) in vis.withIndex()) {
                // tasks and tests that start inside this lesson are folded into it
                val inside = if (r.kind == 0 && !r.allDay) rows.filter { it.kind != 0 && !it.allDay && it.day == r.day && it.from >= r.from && it.from < r.to } else emptyList()
                val tests = inside.count { it.kind == 2 }
                val red = Color(0x59F43F5E)
                val yellow = Color(0x59F59E0B)
                val plain = Color(0x26808080)
                // a lesson with 2 tests and 1 task is 2/3 red and 1/3 yellow
                val fill: androidx.compose.ui.graphics.Brush = if (!Prefs.plannerColors) androidx.compose.ui.graphics.SolidColor(plain)
                    else if (r.kind == 2) androidx.compose.ui.graphics.SolidColor(red)
                    else if (r.kind == 1) androidx.compose.ui.graphics.SolidColor(yellow)
                    else if (inside.isEmpty()) androidx.compose.ui.graphics.SolidColor(plain)
                    else { val f = tests.toFloat() / inside.size; androidx.compose.ui.graphics.Brush.horizontalGradient(0f to red, f to red, f to yellow, 1f to yellow) }
                val shownTasks = inside.filter { it.key !in done }
                val label = r.text.substringBefore(' ') + " " + r.range + "  " + r.title + (if (shownTasks.isEmpty()) "" else "  " + shownTasks.joinToString(" · ") { it.title })
                val ticked = r.kind != 0 && r.key in done
                Box(Modifier.fillMaxWidth().height(ROW_H - 4.dp)) {
                    Text(
                        label, color = if (ticked) Muted else Mist, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        textDecoration = if (ticked) androidx.compose.ui.text.style.TextDecoration.LineThrough else null,
                        modifier = Modifier.fillMaxWidth().height(ROW_H - 4.dp).clip(RoundedCornerShape(12.dp)).background(fill).clickable { open = if (open == i) -1 else i }.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                    if (i == cur) {
                        val f = (minute - r.from).toFloat() / (r.to - r.from).coerceAtLeast(1)
                        Box(Modifier.fillMaxWidth().offset(y = (ROW_H - 4.dp) * f).height(2.dp).background(Amber))
                        Text(PlannerWidget.hhmm(minute), color = Amber, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.align(Alignment.TopEnd).offset(y = (ROW_H - 4.dp) * f - 7.dp, x = (-6).dp).background(GraphiteRaised).padding(horizontal = 4.dp))
                    } else if (i == next) {
                        Box(Modifier.fillMaxWidth().offset(y = (-3).dp).height(2.dp).background(Amber))
                        Text(PlannerWidget.hhmm(minute), color = Amber, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.align(Alignment.TopEnd).offset(y = (-10).dp, x = (-6).dp).background(GraphiteRaised).padding(horizontal = 4.dp))
                    }
                }
                Box(Modifier.height(4.dp))
                if (open == i) {
                    Column(Modifier.fillMaxWidth().padding(bottom = 4.dp).clip(RoundedCornerShape(12.dp)).background(Color(0x26808080)).padding(horizontal = 12.dp, vertical = 8.dp)) {
                        Text(r.title, color = Mist, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                        Text(r.text.substringBefore(' ') + ", " + r.range, color = Muted, fontSize = 13.sp)
                        if (r.detail.isNotBlank()) Text(r.detail, color = Mist, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
                        for (t in if (r.kind != 0) listOf(r) else inside) {
                            val d = t.key in done
                            Text((if (d) "\u2611 " else "\u2610 ") + t.title, color = if (d) Muted else Mist, fontSize = 13.sp, modifier = Modifier.fillMaxWidth().clickable {
                                Prefs.togglePlannerDone(t.key)
                                // ticking the last open task or test of a day is worth a cheer
                                val day = rows.filter { it.kind != 0 && !it.allDay && it.day == t.day }
                                if (t.key in Prefs.plannerDone && day.all { it.key in Prefs.plannerDone })
                                    android.widget.Toast.makeText(ctx, "\uD83C\uDF89 All done for today!", android.widget.Toast.LENGTH_LONG).show()
                            }.padding(top = 8.dp))
                            if (t !== r && t.detail.isNotBlank()) Text(t.detail, color = Muted, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
        if (note == null && vis.size > 2) Box(
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
