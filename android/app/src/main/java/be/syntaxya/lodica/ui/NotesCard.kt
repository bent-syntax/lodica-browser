package be.syntaxya.lodica.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.Notebook
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/** Notebook note on the native start page: the chosen note (pref notesBook) or the newest, with a quick-add line. Drag the title to move it, the grip to resize it, double tap the title to reset. */
@Composable
fun NotesCard(modifier: Modifier = Modifier) {
    val density = androidx.compose.ui.platform.LocalDensity.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var id by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var rev by remember { mutableStateOf(0) }
    var draft by remember { mutableStateOf("") }
    var offline by remember { mutableStateOf(false) }
    suspend fun load() {
        val all = withContext(Dispatchers.IO) { Notebook.list() }
        if (all == null) { offline = true; return }
        offline = false
        val pick = all.firstOrNull { it.id == Prefs.notesBook } ?: all.firstOrNull { it.title.isNotBlank() } ?: all.firstOrNull() ?: return
        val n = withContext(Dispatchers.IO) { Notebook.get(pick.id) } ?: return
        id = n.id; text = n.text; rev = n.rev
    }
    LaunchedEffect(Prefs.notesBook) {
        while (true) { load(); delay(60_000) }
    }
    val wDp = Prefs.notesW
    Column(
        modifier.offset { IntOffset((Prefs.notesX * density.density).roundToInt(), (Prefs.notesY * density.density).roundToInt()) }
            .then(if (wDp > 0f) Modifier.width(wDp.dp) else Modifier)
            .clip(RoundedCornerShape(20.dp)).background(GraphiteRaised).padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text("Notes", color = Mist, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth().pointerInput(Unit) {
            detectDragGestures { change, d ->
                change.consume()
                Prefs.updateNotesRect(Prefs.notesX + d.x / density.density, Prefs.notesY + d.y / density.density, Prefs.notesW)
            }
        }.pointerInput(Unit) { detectTapGestures(onDoubleTap = { Prefs.updateNotesRect(0f, 0f, 0f) }) })
        Box(Modifier.height(8.dp))
        if (offline) Text("Notes need a linked device", color = Muted, fontSize = 13.sp)
        else Text(text.ifBlank { "Empty note" }, color = if (text.isBlank()) Muted else Mist, fontSize = 13.sp, maxLines = 6, overflow = TextOverflow.Ellipsis)
        Box(Modifier.height(8.dp))
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(androidx.compose.ui.graphics.Color(0x26808080)).padding(horizontal = 12.dp, vertical = 8.dp)) {
            if (draft.isEmpty()) Text("Add a line", color = Muted, fontSize = 13.sp)
            BasicTextField(
                draft, { draft = it }, singleLine = true, textStyle = TextStyle(color = Mist, fontSize = 13.sp), cursorBrush = SolidColor(Amber),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Done),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = {
                    val line = draft.trim()
                    if (line.isEmpty() || id.isEmpty()) return@KeyboardActions
                    draft = ""
                    scope.launch {
                        val mine = if (text.isBlank()) line else text.trimEnd() + "\n" + line
                        var r = withContext(Dispatchers.IO) { Notebook.put(id, mine, rev) }
                        if (r != null && r.conflict) {
                            val merged = Notebook.merge(r.text, line)
                            r = withContext(Dispatchers.IO) { Notebook.put(id, merged, r!!.rev) }
                        }
                        if (r != null && !r.gone) { text = r.text; rev = r.rev } else load()
                    }
                }),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Box(
            Modifier.fillMaxWidth().padding(top = 6.dp).pointerInput(Unit) {
                detectDragGestures { change, d ->
                    change.consume()
                    val cur = if (Prefs.notesW > 0f) Prefs.notesW else 320f
                    Prefs.updateNotesRect(Prefs.notesX, Prefs.notesY, (cur + d.x / density.density).coerceIn(200f, 600f))
                }
            },
            contentAlignment = Alignment.Center,
        ) { Box(Modifier.width(40.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(Muted)) }
    }
}
