package be.syntaxya.lodica.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.mozilla.geckoview.GeckoSession.PromptDelegate.ChoicePrompt
import org.mozilla.geckoview.GeckoSession.PromptDelegate.DateTimePrompt
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Renders the pending Gecko prompt (by default the current tab's), one at a time. */
@Composable
fun PromptDialogs(req: Req? = Prompts.visible) {
    req ?: return
    key(req) {
        when (req) {
            is Req.Alert -> AlertPrompt(req)
            is Req.Ask -> AskPrompt(req)
            is Req.Text -> TextPrompt(req)
            is Req.Auth -> AuthPrompt(req)
            is Req.Choice -> ChoicePromptDialog(req)
            is Req.Color -> ColorPrompt(req)
            is Req.DateTime -> DateTimePromptDialog(req)
        }
    }
}

@Composable
private fun Dialog(
    req: Req,
    title: String?,
    confirm: String? = "OK",
    onConfirm: () -> Unit = {},
    dismiss: String? = "Cancel",
    extra: (@Composable () -> Unit)? = null,
    body: @Composable () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { req.cancel() },
        containerColor = GraphiteRaised,
        titleContentColor = Mist,
        textContentColor = Mist,
        title = title?.let { { Text(it, fontSize = 18.sp) } },
        text = { Column(Modifier.verticalScroll(rememberScrollState())) { body() } },
        confirmButton = {
            if (confirm != null) TextButton(onClick = onConfirm) { Text(confirm, color = Amber) }
        },
        dismissButton = {
            Row {
                extra?.invoke()
                if (dismiss != null) TextButton(onClick = { req.cancel() }) { Text(dismiss, color = Muted) }
            }
        },
    )
}

@Composable
private fun Origin(host: String) {
    if (host.isNotBlank()) Text(host, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 8.dp))
}

@Composable
private fun AlertPrompt(req: Req.Alert) {
    Dialog(req, req.title, onConfirm = { req.ok() }, dismiss = null) {
        Origin(req.host)
        req.message?.let { Text(it) }
    }
}

@Composable
private fun AskPrompt(req: Req.Ask) {
    var remember by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { req.cancel() },
        containerColor = GraphiteRaised,
        titleContentColor = Mist,
        textContentColor = Mist,
        title = { Text(req.title, fontSize = 18.sp) },
        text = {
            Column {
                Origin(req.host)
                req.message?.let { Text(it) }
                if (req.rememberable) {
                    Row(
                        Modifier.fillMaxWidth().clickable { remember = !remember }.padding(top = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(remember, { remember = it }, colors = boxColors())
                        Text("Remember for this site", color = Muted, fontSize = 14.sp)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { req.answer(true, remember) }) { Text(req.yes, color = Amber) } },
        dismissButton = { TextButton(onClick = { req.answer(false, remember) }) { Text(req.no, color = Muted) } },
    )
}

@Composable
private fun TextPrompt(req: Req.Text) {
    var v by remember { mutableStateOf(req.default) }
    Dialog(req, req.title, onConfirm = { req.submit(v) }) {
        Origin(req.host)
        req.message?.let { Text(it, modifier = Modifier.padding(bottom = 8.dp)) }
        Field(v, { v = it }, null)
    }
}

@Composable
private fun AuthPrompt(req: Req.Auth) {
    var user by remember { mutableStateOf(req.user) }
    var pw by remember { mutableStateOf("") }
    Dialog(req, "Sign in", confirm = "Sign in", onConfirm = { req.submit(user, pw) }) {
        Origin(req.host)
        req.message?.let { Text(it, color = Muted, fontSize = 13.sp, modifier = Modifier.padding(bottom = 8.dp)) }
        if (!req.onlyPassword) {
            Field(user, { user = it }, "Username")
            Spacer(Modifier.size(8.dp))
        }
        Field(pw, { pw = it }, "Password", password = true)
    }
}

private fun flatten(list: List<ChoicePrompt.Choice>): List<ChoicePrompt.Choice> =
    list.flatMap { c -> if (c.items != null) listOf(c) + flatten(c.items!!.toList()) else listOf(c) }
        .filter { !it.separator }

@Composable
private fun ChoicePromptDialog(req: Req.Choice) {
    val all = remember(req) { flatten(req.choices) }
    if (!req.multiple) {
        Dialog(req, req.title, confirm = null) {
            all.forEach { c ->
                if (c.items != null) GroupLabel(c.label)
                else ChoiceRow(c, c.selected, radio = true) { req.pick(c) }
            }
        }
        return
    }
    val picked = remember(req) { mutableStateListOf<ChoicePrompt.Choice>().apply { addAll(all.filter { it.selected && it.items == null }) } }
    Dialog(req, req.title, onConfirm = { req.pickMany(picked.toList()) }) {
        all.forEach { c ->
            if (c.items != null) GroupLabel(c.label)
            else ChoiceRow(c, c in picked, radio = false) { if (c in picked) picked.remove(c) else picked.add(c) }
        }
    }
}

@Composable
private fun GroupLabel(label: String) {
    Text(label, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp, bottom = 2.dp))
}

@Composable
private fun ChoiceRow(c: ChoicePrompt.Choice, on: Boolean, radio: Boolean, toggle: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(CircleShape)
            .then(if (c.disabled) Modifier else Modifier.clickable(onClick = toggle)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (radio) RadioButton(on, if (c.disabled) null else toggle,
            colors = RadioButtonDefaults.colors(selectedColor = Amber, unselectedColor = Muted), enabled = !c.disabled)
        else Checkbox(on, if (c.disabled) null else { _ -> toggle() }, colors = boxColors(), enabled = !c.disabled)
        Text(c.label, color = if (c.disabled) Muted else Mist, fontSize = 15.sp)
    }
}

@Composable
private fun ColorPrompt(req: Req.Color) {
    var hex by remember { mutableStateOf(req.default.ifBlank { "#000000" }) }
    val presets = remember(req) {
        (req.presets + listOf("#111827", "#F59E0B", "#F43F5E", "#10B981", "#3B82F6", "#8B5CF6", "#FFFFFF", "#000000"))
            .distinctBy { it.lowercase() }.take(16)
    }
    Dialog(req, "Pick a color", onConfirm = { req.submit(hex) }) {
        presets.chunked(4).forEach { row ->
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                row.forEach { p ->
                    val c = parseHex(p) ?: return@forEach
                    Box(
                        Modifier.size(40.dp).clip(CircleShape).background(c)
                            .border(if (p.equals(hex, true)) 3.dp else 1.dp, if (p.equals(hex, true)) Amber else GraphiteHigh, CircleShape)
                            .clickable { hex = p }
                    )
                }
            }
        }
        Spacer(Modifier.size(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(28.dp).clip(CircleShape).background(parseHex(hex) ?: GraphiteHigh))
            Spacer(Modifier.width(12.dp))
            Field(hex, { hex = it.trim() }, "Hex")
        }
    }
}

private fun parseHex(s: String): androidx.compose.ui.graphics.Color? = runCatching {
    androidx.compose.ui.graphics.Color(android.graphics.Color.parseColor(if (s.startsWith("#")) s else "#$s"))
}.getOrNull()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateTimePromptDialog(req: Req.DateTime) {
    when (req.type) {
        DateTimePrompt.Type.DATE -> {
            val fmt = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") } }
            val state = rememberDatePickerState(runCatching { fmt.parse(req.default)?.time }.getOrNull())
            DatePickerDialog(
                onDismissRequest = { req.cancel() },
                confirmButton = {
                    TextButton(onClick = {
                        val ms = state.selectedDateMillis
                        if (ms == null) req.clear() else req.submit(fmt.format(java.util.Date(ms)))
                    }) { Text("OK", color = Amber) }
                },
                dismissButton = {
                    Row {
                        TextButton(onClick = { req.clear() }) { Text("Clear", color = Muted) }
                        TextButton(onClick = { req.cancel() }) { Text("Cancel", color = Muted) }
                    }
                },
                colors = DatePickerDefaults.colors(containerColor = GraphiteRaised),
            ) { DatePicker(state) }
        }
        DateTimePrompt.Type.TIME -> {
            val parts = req.default.split(":").mapNotNull { it.toIntOrNull() }
            val state = rememberTimePickerState(parts.getOrElse(0) { 12 }, parts.getOrElse(1) { 0 }, is24Hour = true)
            Dialog(
                req, null,
                onConfirm = { req.submit("%02d:%02d".format(state.hour, state.minute)) },
                extra = { TextButton(onClick = { req.clear() }) { Text("Clear", color = Muted) } },
            ) { TimePicker(state) }
        }
        else -> {
            var v by remember { mutableStateOf(req.default) }
            val hint = when (req.type) {
                DateTimePrompt.Type.MONTH -> "YYYY-MM"
                DateTimePrompt.Type.WEEK -> "YYYY-Www"
                else -> "YYYY-MM-DDTHH:MM"
            }
            Dialog(
                req, null,
                onConfirm = { req.submit(v.trim()) },
                extra = { TextButton(onClick = { req.clear() }) { Text("Clear", color = Muted) } },
            ) { Field(v, { v = it }, hint) }
        }
    }
}

@Composable
private fun Field(v: String, set: (String) -> Unit, label: String?, password: Boolean = false) {
    OutlinedTextField(
        v, set,
        Modifier.fillMaxWidth(),
        label = label?.let { { Text(it) } },
        singleLine = true,
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = if (password) KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false) else KeyboardOptions.Default,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
            focusedLabelColor = Amber, unfocusedLabelColor = Muted,
            cursorColor = Amber, focusedTextColor = Mist, unfocusedTextColor = Mist,
        ),
    )
}

@Composable
private fun boxColors() = CheckboxDefaults.colors(checkedColor = Amber, uncheckedColor = Muted, checkmarkColor = GraphiteRaised)
