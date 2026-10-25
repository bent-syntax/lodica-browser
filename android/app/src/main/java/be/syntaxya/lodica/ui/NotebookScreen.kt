package be.syntaxya.lodica.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.Notebook
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

private const val NOTE_MAX = 100_000

/** The notebook shared with every linked device. Saves a moment after typing and checks for changes every 10 seconds while open. */
@Composable
fun NotebookScreen() {
    var text by remember { mutableStateOf("") }
    var rev by remember { mutableStateOf(0) }
    var sent by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Loading...") }

    // Sends the text when it differs from the last saved one. On a conflict the newer text from another device is kept
    // and this device's own text goes under it.
    suspend fun save() {
        val mine = text
        if (mine == sent) { status = "Synced with your linked devices"; return }
        status = "Saving..."
        var r = withContext(Dispatchers.IO) { Notebook.put(mine, rev) }
        if (r != null && r.conflict) {
            val merged = Notebook.merge(r.text, mine)
            if (text == mine) text = merged
            rev = r.rev; sent = r.text
            r = if (merged != r.text) withContext(Dispatchers.IO) { Notebook.put(merged, rev) } else r
        }
        if (r == null) { status = "Can't reach the server. Will try again."; return }
        if (!r.conflict) { rev = r.rev; sent = r.text }
        status = if (text == sent) "Synced with your linked devices" else "Saving..."
    }

    LaunchedEffect(Unit) {
        val n = withContext(Dispatchers.IO) { Notebook.get() }
        if (n != null) { text = n.text; rev = n.rev; sent = n.text; loaded = true; status = "Synced with your linked devices" }
        else status = "Can't reach the server"
        while (true) {
            delay(10_000)
            if (!loaded) {
                val f = withContext(Dispatchers.IO) { Notebook.get() }
                if (f != null) { text = f.text; rev = f.rev; sent = f.text; loaded = true; status = "Synced with your linked devices" }
                continue
            }
            if (text != sent) { save(); continue }
            val f = withContext(Dispatchers.IO) { Notebook.get() }
            if (f == null) { status = "Can't reach the server"; continue }
            if (f.rev != rev && text == sent) { text = f.text; rev = f.rev; sent = f.text }
            status = "Synced with your linked devices"
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
        Text(status, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        OutlinedTextField(
            text, { if (loaded && it.length <= NOTE_MAX) text = it },
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
}
