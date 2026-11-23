package be.syntaxya.lodica.ui

import android.app.Activity
import android.content.pm.ActivityInfo
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import be.syntaxya.lodica.engine.PcRemote
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

/** Phone view of the linked PC. Landscape fullscreen gives the remote screen the whole display. */
@Composable
fun PcScreen() {
    val ctx = LocalContext.current
    val activity = ctx as? Activity
    val bitmap by PcRemote.frame
    val live by PcRemote.live
    var full by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }

    DisposableEffect(Unit) {
        PcRemote.init(ctx)
        PcRemote.start()
        onDispose { PcRemote.stop() }
    }
    DisposableEffect(full, activity) {
        if (activity != null) {
            activity.requestedOrientation = if (full) ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            val c = WindowInsetsControllerCompat(activity.window, activity.window.decorView)
            if (full) { c.hide(WindowInsetsCompat.Type.systemBars()); c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
            else c.show(WindowInsetsCompat.Type.systemBars())
        }
        onDispose {
            if (activity != null) {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                WindowInsetsControllerCompat(activity.window, activity.window.decorView).show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Graphite).then(if (full) Modifier else Modifier.padding(16.dp)), horizontalAlignment = Alignment.CenterHorizontally) {
        if (!full) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("PC screen", color = Mist, fontSize = 20.sp, modifier = Modifier.weight(1f))
            Button(onClick = { full = !full }) { Text(if (full) "Exit full screen" else "Full screen") }
        }
        Box(
            Modifier.fillMaxWidth().weight(1f)
                .background(Color.Black)
                .pointerInput(Unit) {
                    detectTapGestures { PcRemote.tap(it.x / size.width, it.y / size.height) }
                }
                .pointerInput(Unit) {
                    var sx = 0f; var sy = 0f; var ex = 0f; var ey = 0f
                    detectDragGestures(
                        onDragStart = { sx = it.x; sy = it.y; ex = it.x; ey = it.y },
                        onDragEnd = { PcRemote.swipe(sx / size.width, sy / size.height, ex / size.width, ey / size.height) },
                    ) { change, _ -> ex = change.position.x; ey = change.position.y }
                },
            contentAlignment = Alignment.Center,
        ) {
            val frame = bitmap
            if (frame != null) Image(frame.asImageBitmap(), "Linked PC screen", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
            else Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(if (live) "Waiting for the first frame" else "Start “PC to phone” on the desktop, or ask below", color = Muted, fontSize = 13.sp)
                if (!live) Button(onClick = { PcRemote.request() }, modifier = Modifier.padding(top = 10.dp)) {
                    Text("Ask desktop to share", maxLines = 1, softWrap = false)
                }
            }
        }
        if (!full) Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(text, { text = it }, Modifier.weight(1f), singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = ImeAction.Send),
                placeholder = { Text("Type on the PC", color = Muted) })
            Button(onClick = { if (text.isNotBlank()) { PcRemote.text(text); text = "" } }) { Text("➤ Send", maxLines = 1, softWrap = false) }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp).horizontalScroll(rememberScrollState())) {
            listOf("back", "enter", "escape", "tab", "left", "right", "up", "down").forEach {
                Button(onClick = { PcRemote.key(it) }, modifier = Modifier.padding(end = 4.dp)) {
                    Text(it, fontSize = 12.sp, maxLines = 1, softWrap = false)
                }
            }
        }
    }
}
