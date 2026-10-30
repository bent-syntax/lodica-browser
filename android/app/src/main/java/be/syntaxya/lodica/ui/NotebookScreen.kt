package be.syntaxya.lodica.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.MathSolver
import be.syntaxya.lodica.engine.Note
import be.syntaxya.lodica.engine.NoteInfo
import be.syntaxya.lodica.engine.Notebook
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Coral
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import kotlin.math.abs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val NOTE_MAX = 100_000
private const val SYNCED = "Synced with your linked devices"

private fun firstLine(s: String) = s.lineSequence().firstOrNull { it.isNotBlank() }?.trim()?.take(60) ?: ""

/** The notebook shared with every linked device: several notes. Saves a moment after typing and checks for changes every 10 seconds while open. */
@Composable
fun NotebookScreen() {
    var notes by remember { mutableStateOf(emptyList<NoteInfo>()) }
    var id by remember { mutableStateOf<String?>(null) }
    var text by remember { mutableStateOf("") }
    var sel by remember { mutableStateOf(TextRange.Zero) }
    var rev by remember { mutableStateOf(0) }
    var sent by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Loading...") }
    var confirmDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun show(n: Note) { id = n.id; text = n.text; sel = TextRange.Zero; rev = n.rev; sent = n.text; loaded = true; status = SYNCED }

    // Loads the list and shows the wanted note, else the current one, else the first.
    suspend fun reload(want: String? = null) {
        val l = withContext(Dispatchers.IO) { Notebook.list() }
        if (l == null) { status = "Can't reach the server"; return }
        notes = l
        val pick = listOfNotNull(want, id).firstOrNull { w -> l.any { it.id == w } } ?: l.firstOrNull()?.id ?: return
        val n = withContext(Dispatchers.IO) { Notebook.get(pick) }
        if (n != null) show(n) else status = "Can't reach the server"
    }

    // Sends the text when it differs from the last saved one. On a conflict the newer text from another device is kept
    // and this device's own text goes under it. Returns false when it could not be saved.
    suspend fun save(): Boolean {
        val cur = id ?: return true
        val mine = text
        if (mine == sent) { status = SYNCED; return true }
        status = "Saving..."
        var r = withContext(Dispatchers.IO) { Notebook.put(cur, mine, rev) }
        if (r != null && r.conflict) {
            val merged = Notebook.merge(r.text, mine)
            if (id == cur && text == mine) text = merged
            rev = r.rev; sent = r.text
            r = if (merged != r.text) withContext(Dispatchers.IO) { Notebook.put(cur, merged, rev) } else r
        }
        if (r == null) { status = "Can't reach the server. Will try again."; return false }
        if (r.gone) { reload(); return true }
        if (!r.conflict && id == cur) { rev = r.rev; sent = r.text }
        status = if (text == sent) SYNCED else "Saving..."
        return !r.conflict
    }

    LaunchedEffect(Unit) {
        reload()
        while (true) {
            delay(10_000)
            if (!loaded) { reload(); continue }
            if (text != sent) { save(); continue }
            val cur = id ?: continue
            val l = withContext(Dispatchers.IO) { Notebook.list() }
            val f = withContext(Dispatchers.IO) { Notebook.get(cur) }
            if (l == null) { status = "Can't reach the server"; continue }
            if (f == null) { reload(); continue }
            notes = l
            if (id == cur && f.rev != rev && text == sent) { text = f.text; rev = f.rev; sent = f.text }
            status = SYNCED
        }
    }
    // Debounced save: restarts on every keystroke.
    LaunchedEffect(text) {
        if (!loaded || text == sent) return@LaunchedEffect
        status = "Saving..."
        delay(800)
        save()
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        TopBar("Notebook") { Ui.screen = Ui.returnTo }
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(status, color = Muted, fontSize = 12.sp, modifier = Modifier.weight(1f))
            if (loaded) IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Rounded.Delete, "Delete note", tint = Muted) }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            for (n in notes) {
                val title = if (n.id == id) firstLine(text) else n.title
                Chip(title.ifEmpty { "New note" }, n.id == id) {
                    if (n.id == id || !loaded) return@Chip
                    scope.launch {
                        if (!save()) return@launch
                        val f = withContext(Dispatchers.IO) { Notebook.get(n.id) }
                        if (f != null) show(f) else reload()
                    }
                }
            }
            if (loaded) IconButton(onClick = {
                scope.launch {
                    if (!save()) return@launch
                    val c = withContext(Dispatchers.IO) { Notebook.create() }
                    if (c == null) { status = "Can't add a note. Check the server."; return@launch }
                    notes = notes + NoteInfo(c.id, "")
                    show(c)
                }
            }) { Icon(Icons.Rounded.Add, "New note", tint = Amber) }
        }
        // Math shows its answer above the note, with a button that writes it after the math. It reads the selection,
        // or the line with the cursor when nothing is selected.
        val from = sel.start.coerceIn(0, text.length); val to = sel.end.coerceIn(0, text.length)
        val lineStart = text.lastIndexOf('\n', maxOf(0, from - 1)).let { if (from == 0 || text[from - 1] == '\n') from else it + 1 }
        val lineEnd = text.indexOf('\n', from).let { if (it < 0) text.length else it }
        val picked = if (from == to) text.substring(lineStart, lineEnd).trim() else text.substring(minOf(from, to), maxOf(from, to))
        // A function of x ("y = x^2", "sin(x)") shows its graph instead.
        // Several selected lines that are each a function share one graph.
        val curves = if (picked.isEmpty()) emptyList() else picked.split("\n").mapNotNull { MathSolver.graph(it) }.take(GRAPH_COLORS.size)
        val curve = if (curves.size > 1) curves[0] else if (picked.isEmpty()) null else MathSolver.graph(picked)
        if (curve != null) Graph(if (curves.size > 1) curves else listOf(curve), Modifier.fillMaxWidth().height(160.dp).padding(start = 12.dp, end = 12.dp, bottom = 8.dp))
        val answer = if (curve != null || picked.isEmpty()) null else MathSolver.answer(picked)
        if (answer != null) {
            val add = (if (answer.contains("=")) "\n" else " = ") + answer
            val end = if (from == to) lineEnd else maxOf(from, to)
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text((if (answer.contains("=")) "" else "= ") + answer, color = Amber, fontSize = 15.sp, modifier = Modifier.weight(1f))
                Chip("Insert", false) {
                    if (text.length + add.length > NOTE_MAX) return@Chip
                    text = text.substring(0, end) + add + text.substring(end)
                    sel = TextRange(end + add.length)
                }
            }
        }
        OutlinedTextField(
            TextFieldValue(text, TextRange(from, to)),
            { if (loaded && it.text.length <= NOTE_MAX) { text = it.text; sel = it.selection } },
            Modifier.fillMaxWidth().weight(1f).padding(12.dp),
            enabled = loaded,
            shape = RoundedCornerShape(12.dp),
            placeholder = { Text("Write here. Every linked device shows the same notes.", color = Muted) },
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Mist, unfocusedTextColor = Mist, disabledTextColor = Muted, cursorColor = Amber,
                focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh, disabledBorderColor = GraphiteHigh,
            ),
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Delete this note?") },
            text = { Text("It is removed on every linked device.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    val cur = id
                    if (cur != null) scope.launch {
                        val left = withContext(Dispatchers.IO) { Notebook.remove(cur) }
                        if (left == null) { status = "Can't delete. Check the server."; return@launch }
                        sent = text; id = null
                        notes = left
                        val n = left.firstOrNull()?.let { f -> withContext(Dispatchers.IO) { Notebook.get(f.id) } }
                        if (n != null) show(n) else status = "Can't reach the server"
                    }
                }) { Text("Delete", color = Coral) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel", color = Muted) } },
        )
    }
}

private val GRAPH_COLORS = listOf(Amber, Color(0xFF38BDF8), Color(0xFF34D399), Color(0xFFF43F5E), Color(0xFFA78BFA))

/**
 * Graph of [fs]: axes and the curves, zoomed so the points where one crosses y = 0 and x = 0 are both in view and labelled.
 * With several curves they share the graph; with exactly two their meeting points are marked instead.
 * Same as drawGraph in desktop/ui/js/mathsolve.js.
 */
@Composable
private fun Graph(fs: List<(Double) -> Double>, modifier: Modifier = Modifier) {
    val f = fs[0]; val multi = fs.size > 1
    val measurer = rememberTextMeasurer()
    Canvas(modifier.background(GraphiteRaised, RoundedCornerShape(12.dp))) {
        val w = size.width; val h = size.height
        val roots = MathSolver.graphRoots(f)
        val y0 = f(0.0)
        fun few(a: List<Double>) = if (a.size <= 4) a else emptyList()
        val marks = if (multi) emptyList() else few(roots)
        val meet = if (fs.size == 2) few(MathSolver.graphRoots { fs[0](it) - fs[1](it) }) else emptyList()
        val at0 = y0.isFinite() && abs(y0) < 1e9
        // x range: the origin and every x-intercept, with some room around them
        val xs = listOf(0.0) + marks + meet + (if (multi) fs.flatMap { few(MathSolver.graphRoots(it)) } else emptyList())
        var lo = xs.min(); var hi = xs.max()
        if (hi - lo < 1e-6) { lo = -10.0; hi = 10.0 } else { val p = (hi - lo) * 0.4; lo -= p; hi += p }
        val n = w.toInt().coerceAtLeast(1)
        val yl = fs.map { g -> DoubleArray(n + 1) { g(lo + (hi - lo) * it / n) } }
        var ymin = Double.POSITIVE_INFINITY; var ymax = Double.NEGATIVE_INFINITY
        for (ys in yl) for (y in ys) if (y.isFinite() && abs(y) < 1e6) { ymin = minOf(ymin, y); ymax = maxOf(ymax, y) }
        if (!ymin.isFinite()) { ymin = -10.0; ymax = 10.0 }
        if (ymax - ymin < 1e-6) { ymin -= 1; ymax += 1 }
        val pad = (ymax - ymin) * 0.1
        ymin = maxOf(ymin - pad, -50.0); ymax = minOf(ymax + pad, 50.0)
        if (ymax <= ymin) { ymin = -10.0; ymax = 10.0 }
        if (marks.isNotEmpty() && at0) {
            val a = minOf(0.0, y0); val b = maxOf(0.0, y0)
            val p = (b - a) * 0.2
            ymin = minOf(ymin, a - p); ymax = maxOf(ymax, b + p)
        }
        val span = ymax - ymin
        val px = { x: Double -> ((x - lo) / (hi - lo) * w).toFloat() }
        val py = { y: Double -> (h - (y - ymin) / span * h).toFloat() }
        val stroke = Stroke(1.8.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        if (ymin < 0 && ymax > 0) drawLine(Muted, Offset(0f, py(0.0)), Offset(w, py(0.0)), stroke.width, StrokeCap.Round)
        if (lo < 0 && hi > 0) drawLine(Muted, Offset(px(0.0), 0f), Offset(px(0.0), h), stroke.width, StrokeCap.Round)
        yl.forEachIndexed { k, ys ->
            val path = Path()
            var pen = false
            ys.forEachIndexed { i, y ->
                if (!y.isFinite() || y < ymin - span || y > ymax + span) { pen = false; return@forEachIndexed }
                val x = i.toFloat() * w / n
                if (pen) path.lineTo(x, py(y)) else path.moveTo(x, py(y))
                pen = true
            }
            drawPath(path, if (multi) GRAPH_COLORS[k] else Amber, style = stroke)
        }

        // Labelled dots at the x-intercepts and at (0, y), kept inside the canvas and apart from each other.
        val style = TextStyle(color = Muted, fontSize = 12.sp)
        val placed = ArrayList<Rect>()
        val gap = 14.dp.toPx()
        fun mark(x: Double, y: Double, onXAxis: Boolean) {
            val cx = px(x); val cy = py(y)
            drawCircle(Amber, 3.dp.toPx(), Offset(cx, cy))
            val t = measurer.measure("(" + MathSolver.frac(x, 6) + ", " + MathSolver.frac(y, 6) + ")", style)
            val tw = t.size.width.toFloat(); val th = t.size.height.toFloat()
            var left = if (onXAxis) cx - tw / 2 else if (cx + 8.dp.toPx() + tw > w) cx - 8.dp.toPx() - tw else cx + 8.dp.toPx()
            var top = if (onXAxis) cy + 6.dp.toPx() else cy - th - 4.dp.toPx()
            fun fit() { left = left.coerceIn(0f, maxOf(0f, w - tw)); top = top.coerceIn(0f, maxOf(0f, h - th)) }
            fit()
            var tries = 0
            while (tries < 4 && placed.any { it.overlaps(Rect(left, top, left + tw, top + th)) }) {
                top += if (onXAxis) gap else -gap
                fit(); tries++
            }
            placed.add(Rect(left, top, left + tw, top + th))
            drawText(t, topLeft = Offset(left, top))
        }
        if (marks.isNotEmpty()) {
            for (r in marks) mark(r, 0.0, true)
            if (at0 && abs(y0) > 1e-9) mark(0.0, y0, false)
        }
        for (x in meet) mark(x, fs[0](x), false)
    }
}
