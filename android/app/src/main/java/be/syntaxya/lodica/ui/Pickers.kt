package be.syntaxya.lodica.ui

import android.Manifest
import android.content.pm.PackageManager
import android.content.Context
import android.text.format.DateUtils
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import android.os.Build
import android.speech.tts.TextToSpeech
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import be.syntaxya.lodica.engine.Ai
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.engine.Remind
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

/** Clean article view with read-aloud. The text comes from the helper's article extractor. */
@Composable
fun ReaderSheet(title: String, text: String) {
    val ctx = LocalContext.current
    var speaking by remember { mutableStateOf(false) }
    val tts = remember {
        val holder = arrayOfNulls<TextToSpeech>(1)
        holder[0] = TextToSpeech(ctx.applicationContext) { }
        holder[0]!!
    }
    DisposableEffect(tts) { onDispose { tts.stop(); tts.shutdown() } }
    val paragraphs = remember(text) { text.split("\n").map { it.trim() }.filter { it.isNotEmpty() } }
    val spoken = remember(paragraphs) { paragraphs.map { it.removePrefix("## ") } }

    Dialog(
        onDismissRequest = { Ui.reader = null },
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(Modifier.fillMaxSize().background(Graphite).systemBarsPadding()) {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Reader", color = Muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    IconButton(onClick = {
                        if (speaking) { tts.stop(); speaking = false }
                        else {
                            val max = TextToSpeech.getMaxSpeechInputLength()
                            tts.speak(title, TextToSpeech.QUEUE_FLUSH, null, "t")
                            spoken.flatMap { it.chunked(max) }.forEachIndexed { i, p ->
                                tts.speak(p, TextToSpeech.QUEUE_ADD, null, "p$i")
                            }
                            speaking = true
                        }
                    }) {
                        Icon(if (speaking) Icons.Rounded.Stop else Icons.Rounded.PlayArrow,
                            if (speaking) "Stop reading" else "Read aloud", tint = Amber)
                    }
                    IconButton(onClick = { Ui.reader = null }) {
                        Icon(Icons.Rounded.Close, "Close reader", tint = Muted, modifier = Modifier.size(18.dp))
                    }
                }
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 22.dp, vertical = 8.dp)) {
                    Text(title, color = Mist, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, lineHeight = 30.sp,
                        style = androidx.compose.ui.text.TextStyle(textDirection = androidx.compose.ui.text.style.TextDirection.Content))
                    Spacer(Modifier.padding(6.dp))
                    val dir = androidx.compose.ui.text.style.TextDirection.Content
                    paragraphs.forEach {
                        if (it.startsWith("## ")) {
                            Text(it.removePrefix("## "), color = Mist, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, lineHeight = 26.sp,
                                style = androidx.compose.ui.text.TextStyle(textDirection = dir),
                                modifier = Modifier.padding(top = 8.dp, bottom = 8.dp))
                        } else {
                            Text(it, color = Mist, fontSize = 17.sp, lineHeight = 27.sp, fontFamily = FontFamily.Serif,
                                style = androidx.compose.ui.text.TextStyle(textDirection = dir),
                                modifier = Modifier.padding(bottom = 14.dp))
                        }
                    }
                }
            }
        }
    }
}

/** Small list dialog for video speed and quality, page reminders and recently closed tabs. */
@Composable
fun PickerDialog(p: Picker) {
    val ctx = LocalContext.current
    val tab = TabManager.current
    val rows: List<Pair<String, () -> Unit>> = when (p) {
        Picker.Speed -> listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f).map { v ->
            (if (v == Prefs.speed) "● ${v}x" else "${v}x") to { Prefs.updateSpeed(v) }
        }
        Picker.Quality -> {
            val cur = tab?.let { Prefs.qualityFor(it.host) }
            listOf((if (cur == null) "● " else "") + "Default (${Prefs.quality}p)" to { tab?.let { Prefs.setQuality(it.host, null) }; Unit }) +
                Prefs.QUALITIES.map { v -> (if (v == cur) "● ${v}p" else "${v}p") to { tab?.let { Prefs.setQuality(it.host, v) }; Unit } }
        }
        Picker.Remind -> Remind.When.entries.map { w ->
            w.label to { if (tab != null) remind(ctx, tab.url, tab.title, Remind.at(w)) }
        } + ("Pick date and time…" to { Ui.picker = Picker.RemindAt })
        Picker.RemindAt -> { RemindAtDialog(); return }
        Picker.Closed -> TabManager.recentlyClosed().map { r ->
            r.title.ifBlank { r.url } to { TabManager.reopen(r); Ui.screen = Screen.Browser; Unit }
        }
    }
    val heading = when (p) { Picker.Speed -> "Video speed"; Picker.Quality -> "Video quality for ${tab?.host.orEmpty().removePrefix("www.")}"; Picker.Remind, Picker.RemindAt -> "Remind me"; Picker.Closed -> "Recently closed" }

    Dialog(onDismissRequest = { Ui.picker = null }) {
        Column(Modifier.width(300.dp).clip(RoundedCornerShape(18.dp)).background(GraphiteRaised).padding(vertical = 10.dp)) {
            Text(heading, color = Muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 18.dp, vertical = 8.dp))
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                rows.forEach { (label, action) ->
                    Text(
                        label, color = Mist, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.fillMaxWidth().clickable { Ui.picker = null; action() }
                            .padding(horizontal = 18.dp, vertical = 12.dp),
                    )
                }
            }
        }
    }
}

private fun remind(ctx: Context, url: String, title: String, at: Long) {
    if (Build.VERSION.SDK_INT >= 33 &&
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) Prompts.host?.requestAndroid(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) {}
    Remind.schedule(ctx, url, title, at)
    val f = SimpleDateFormat(if (DateUtils.isToday(at)) "HH:mm" else "EEE d MMM, HH:mm", Locale.getDefault())
    Toast.makeText(ctx, "Reminder set for ${f.format(Date(at))}", Toast.LENGTH_SHORT).show()
}

/** Free reminder time: a date picker, then a 24-hour time picker. Past moments are refused. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RemindAtDialog() {
    val ctx = LocalContext.current
    val tab = TabManager.current
    val today = remember {
        Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
            val local = Calendar.getInstance()
            clear(); set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH))
        }.timeInMillis
    }
    var day by remember { mutableStateOf<Long?>(null) }
    val close = { Ui.picker = null }
    val picked = day
    if (picked == null) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = today,
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis >= today
            },
        )
        DatePickerDialog(
            onDismissRequest = close,
            confirmButton = {
                TextButton(onClick = { day = state.selectedDateMillis ?: today }) { Text("Next", color = Amber) }
            },
            dismissButton = { TextButton(onClick = close) { Text("Cancel", color = Muted) } },
            colors = DatePickerDefaults.colors(containerColor = GraphiteRaised),
        ) { DatePicker(state) }
    } else {
        val soon = remember { Calendar.getInstance().apply { add(Calendar.HOUR_OF_DAY, 1) } }
        val state = rememberTimePickerState(soon.get(Calendar.HOUR_OF_DAY), 0, is24Hour = true)
        AlertDialog(
            onDismissRequest = close,
            containerColor = GraphiteRaised,
            confirmButton = {
                TextButton(onClick = {
                    val utc = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = picked }
                    val at = Calendar.getInstance().apply {
                        clear()
                        set(utc.get(Calendar.YEAR), utc.get(Calendar.MONTH), utc.get(Calendar.DAY_OF_MONTH), state.hour, state.minute)
                    }.timeInMillis
                    if (at <= System.currentTimeMillis()) {
                        Toast.makeText(ctx, "Pick a time in the future", Toast.LENGTH_SHORT).show()
                    } else {
                        close()
                        if (tab != null) remind(ctx, tab.url, tab.title, at)
                    }
                }) { Text("Set", color = Amber) }
            },
            dismissButton = { TextButton(onClick = { day = null }) { Text("Back", color = Muted) } },
            text = { TimePicker(state) },
        )
    }
}

/** Sends [question] to the Claude Code bridge and shows the answer. [context] defaults to the current page. */
fun askAi(question: String, context: String? = null) {
    val ctx = context ?: TabManager.current?.let { t -> listOf(t.title, t.host).filter { it.isNotBlank() }.joinToString(" - ") }.orEmpty()
    val a = Answer(question)
    Ui.answer = a
    Ai.ask(question, ctx) { r ->
        if (Ui.answer !== a) return@ask
        Ui.answer = r.fold(
            { a.copy(text = it.ifBlank { "(no answer)" }, loading = false) },
            { a.copy(error = it.message ?: "Request failed", loading = false) },
        )
    }
}

@Composable
fun AnswerSheet(a: Answer) {
    Dialog(onDismissRequest = { Ui.answer = null }) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(GraphiteRaised).padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Ask AI", color = Amber, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                IconButton(onClick = { Ui.answer = null }, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Rounded.Close, "Close", tint = Muted, modifier = Modifier.size(18.dp))
                }
            }
            Text(a.question, color = Muted, fontSize = 14.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.padding(6.dp))
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                when {
                    a.loading -> Text("Thinking…", color = Muted, fontSize = 16.sp)
                    a.error != null -> Text(a.error, color = Amber, fontSize = 15.sp)
                    else -> Text(a.text, color = Mist, fontSize = 16.sp, lineHeight = 23.sp)
                }
            }
            if (a.error != null) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.End) {
                    TextButton(onClick = { Ai.connect(); askAi(a.question) }) { Text("Retry", color = Amber) }
                }
            }
        }
    }
}

@Composable
fun TotpAskDialog(a: Ui.TotpAsk) {
    var answered = false
    fun done(e: be.syntaxya.lodica.engine.TotpEntry?) { if (answered) return; answered = true; Ui.totpAsk = null; a.onPick(e) }
    Dialog(onDismissRequest = { done(null) }) {
        Column(Modifier.width(300.dp).clip(RoundedCornerShape(18.dp)).background(GraphiteRaised).padding(vertical = 10.dp)) {
            Text(
                "Which authenticator code for ${a.host.removePrefix("www.")}? It fills automatically next time.",
                color = Muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 18.dp, vertical = 8.dp),
            )
            Column(Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState())) {
                a.entries.forEach { e ->
                    Text(
                        e.label.ifBlank { e.host }, color = Mist, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.fillMaxWidth().clickable { done(e) }.padding(horizontal = 18.dp, vertical = 12.dp),
                    )
                }
                Text(
                    "Don't use", color = Muted, fontSize = 15.sp,
                    modifier = Modifier.fillMaxWidth().clickable { done(null) }.padding(horizontal = 18.dp, vertical = 12.dp),
                )
            }
        }
    }
}
