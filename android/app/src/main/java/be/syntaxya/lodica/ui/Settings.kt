package be.syntaxya.lodica.ui

import android.text.format.DateUtils
import be.syntaxya.lodica.ui.theme.customPalette
import be.syntaxya.lodica.engine.CustomTheme
import android.view.WindowManager
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.mozilla.geckoview.StorageController
import be.syntaxya.lodica.engine.ChromeImport
import be.syntaxya.lodica.engine.Chats
import be.syntaxya.lodica.engine.Engine
import be.syntaxya.lodica.engine.UpdateState
import be.syntaxya.lodica.engine.Updater
import be.syntaxya.lodica.engine.History
import be.syntaxya.lodica.engine.Language
import be.syntaxya.lodica.engine.PcTabs
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.engine.Meter
import be.syntaxya.lodica.engine.UserAgent
import be.syntaxya.lodica.engine.Relay
import be.syntaxya.lodica.engine.SavedLogin
import be.syntaxya.lodica.engine.SearchEngine
import be.syntaxya.lodica.engine.Vault
import be.syntaxya.lodica.engine.Visit
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Coral
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import be.syntaxya.lodica.engine.Ai
import be.syntaxya.lodica.engine.Memory
import be.syntaxya.lodica.engine.SilentInstall
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.border
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import kotlinx.coroutines.launch
import be.syntaxya.lodica.ui.theme.Palettes
import be.syntaxya.lodica.ui.theme.ThemeChoices

/* ---------- Settings ---------- */

@Composable
fun SettingsScreen() {
    val ctx = LocalContext.current
    var confirm by remember { mutableStateOf<Confirm?>(null) }
    var pairing by remember { mutableStateOf(false) }
    var pairText by remember { mutableStateOf("") }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val scroll = rememberScrollState()
    LaunchedEffect(tab) { scroll.scrollTo(0) }

    Column(Modifier.fillMaxSize()) {
        TopBar("Settings") { Ui.screen = Screen.Browser }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SettingsTabs.forEachIndexed { i, label -> Chip(label, tab == i) { tab = i } }
        }
        Column(Modifier.fillMaxSize().verticalScroll(scroll).padding(bottom = 32.dp)) {
            when (tab) {
                0 -> {
            Section("Search")
            EnginePicker()


                    Section("Browsing")
            SwitchRow("Desktop sites", "Request desktop pages in new tabs", Prefs.desktopDefault) { Prefs.updateDesktopDefault(it) }
            AgentPicker()
            LanguagePicker()
            QualityPicker()

            Section("Data use")
            DataMeter()

            Section("AI")
            AiSection()

            Section("Web apps")
            SilentInstallSection()

            Section("Extensions")
            ExtensionsSection()

                }
                1 -> {
                    Section("Theme")
                    ThemePicker()
                    Section("Search widget")
                    WidgetEditor()
                    Section("Page colours")
            SwitchRow("Dark pages", "Darken sites that have no dark mode", Prefs.darkPages) { Prefs.updateDarkPages(it) }

                    Section("Start page background")
                    StartBackgroundSettings()
                }
                2 -> {
            Section("Tabs")
            Text(
                "Auto-archive tabs unused for", color = Muted, fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
            Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(0 to "Never", 7 to "7 days", 14 to "14 days", 30 to "30 days").forEach { (d, label) ->
                    Chip(label, Prefs.autoArchiveDays == d) { Prefs.updateAutoArchiveDays(d) }
                }
            }


            if (Relay.available) {
                Section("Tabs on PC")
                SwitchRow("Tabs on PC", "Open tabs on an encrypted page you can read on a computer", PcTabs.enabled) { PcTabs.toggle(it) }
                val link = PcTabs.link
                if (PcTabs.enabled && link != null) {
                    Text(
                        link, color = Muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace,
                        maxLines = 2, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    )
                    Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = {
                            copy(ctx, link, true)
                            Toast.makeText(ctx, "Link copied", Toast.LENGTH_SHORT).show()
                        }) { Text("Copy", color = Amber) }
                        TextButton(onClick = { Prompts.host?.share("Lodica tabs", null, link) }) { Text("Share", color = Amber) }
                        TextButton(onClick = {
                            confirm = Confirm("Reset link?", "The current link stops working. A new one is made.", "Reset") { PcTabs.reset() }
                        }) { Text("Reset link", color = Coral) }
                    }
                    Text(
                        "Tabs sync both ways. Paste the link from your other device to share tabs once; no code needed again.",
                        color = Muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 2.dp),
                    )
                    Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = { pairText = ""; pairing = true }) { Text("Link with other device", color = Amber) }
                        TextButton(onClick = { PcTabs.refresh() }) { Text("Refresh", color = Amber) }
                    }
                    PcTabs.status?.let {
                        Text(it, color = Coral, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 2.dp))
                    }
                    if (PcTabs.remote.isNotEmpty()) {
                        Text(
                            "Tabs from your other device", color = Muted, fontSize = 13.sp,
                            modifier = Modifier.padding(start = 20.dp, top = 8.dp, bottom = 2.dp),
                        )
                        PcTabs.remote.take(40).forEach { t ->
                            Column(
                                Modifier.fillMaxWidth()
                                    .clickable { TabManager.open(t.url); Ui.screen = Screen.Browser }
                                    .padding(horizontal = 20.dp, vertical = 6.dp),
                            ) {
                                Text(t.title.ifBlank { t.url }, color = Mist, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(t.url, color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }

                }
                3 -> {
                    Section("Blocking")
            SwitchRow("HTTPS-only", "Upgrade every connection, warn on plain HTTP", Prefs.httpsOnly) { Prefs.updateHttpsOnly(it) }
            SwitchRow("Reject cookie banners", "Click \"Reject all\" or hide consent pop-ups", Prefs.cookieReject) { Prefs.updateCookieReject(it) }

                    Section("VPS")
                    if (!Relay.available) {
                        Text(
                            "No server linked. Run server setup under Identity & mail", color = Muted, fontSize = 13.sp,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                        )
                    } else {
                SwitchRow("Route through VPS", "Send browsing through your server's tunnel. Logins and payments stay direct", Prefs.routeVps) {
                    Prefs.updateRouteVps(it)
                }
                    }
                    Section("Search suggestions")
                    SwitchRow("Suggest from history", "Address bar offers visited pages and past searches. Stays on this device", Prefs.historySuggest) { Prefs.updateHistorySuggest(it) }
                    LinkRow("Clear suggestions", Coral) {
                        confirm = Confirm("Clear suggestions?", "Past searches and visit counts are removed from this device.") { History.clearSuggestions() }
                    }

                    Section("Custom DNS")
                    DnsSection()

                    Section("Import from Chrome")
            ChromeImportSection()

                    Section("Privacy")
            LinkRow("AI chats (${Chats.list.size})") { Ui.screen = Screen.Chats }
            LinkRow("History") { Ui.screen = Screen.History }
            LinkRow("Clear history", Coral) {
                confirm = Confirm("Clear history?", "Every visited page is removed from this device.") { History.clear() }
            }
            LinkRow("Reset site permissions") {
                Prompts.clearSitePermissions()
                Toast.makeText(ctx, "Site permissions reset", Toast.LENGTH_SHORT).show()
            }
            LinkRow("Clear site data", Coral) {
                confirm = Confirm("Clear site data?", "Cookies, cache and storage for all sites. You will be logged out everywhere.") {
                    Engine.runtime(ctx).storageController.clearData(StorageController.ClearFlags.ALL)
                    Toast.makeText(ctx, "Site data cleared", Toast.LENGTH_SHORT).show()
                }
            }

                }
                4 -> ControlsSection()
                5 -> {
                    Section("Identity")
            SwitchRow("Hidden email", "Offer a private address on your own domain on sign-up forms", Prefs.dummyLogin) { Prefs.updateDummyLogin(it) }
            LinkRow("Passwords") { Ui.screen = Screen.Passwords }

                    Section("Authenticator")
                    AuthenticatorSection()

                    Section("Mail")
                    if (!Relay.available) {
                        Text(
                            "No server linked", color = Muted, fontSize = 13.sp,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                        )
                    } else {
                        LinkRow("Inbox") { Ui.screen = Screen.Inbox }
                        LinkRow("Disconnect server") { Relay.disconnect() }
                    }
                    LinkRow("Run server setup") { Ui.screen = Screen.Browser; Relay.reopenSetup() }
                }
                else -> {
            Section("About")
            val version = remember {
                runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "?"
            }
            InfoRow("Lodica", version)
            InfoRow("uBlock Origin", Engine.ublock?.metaData?.version ?: "loading…")
            InfoRow("Engine", "GeckoView")
            var notes by remember { mutableStateOf(false) }
            LinkRow("What's new") { notes = true }
            if (notes) {
                val text = remember {
                    runCatching { ctx.assets.open("PATCH_NOTES.md").bufferedReader().readText() }
                        .getOrDefault("No patch notes found.")
                }
                AlertDialog(
                    onDismissRequest = { notes = false },
                    containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
                    title = { Text("What's new") },
                    text = {
                        Column(Modifier.verticalScroll(rememberScrollState())) {
                            Text(text.replace(Regex("(?m)^#+ "), "").replace("**", ""), fontSize = 13.sp)
                        }
                    },
                    confirmButton = { TextButton(onClick = { notes = false }) { Text("Close") } },
                )
            }
            val upd = Updater.state
            when (upd) {
                is UpdateState.Idle -> LinkRow("Check for updates") { Updater.check(ctx) }
                is UpdateState.Checking -> InfoRow("Updates", "Checking…")
                is UpdateState.Latest -> LinkRow("Up to date (${upd.version}) — check again") { Updater.check(ctx) }
                is UpdateState.Available -> LinkRow("Download ${upd.info.version} (${upd.info.size / 1_048_576} MB)", color = Amber) { Updater.download(ctx) }
                is UpdateState.Downloading -> LinkRow(
                    "Downloading ${if (upd.info.size > 0) upd.received * 100 / upd.info.size else 0}% — tap to cancel",
                ) { Updater.cancel() }
                is UpdateState.Ready -> LinkRow("Install ${upd.info.version}", color = Amber) { Updater.install(ctx) }
                is UpdateState.Failed -> LinkRow("${upd.message} — retry") { Updater.check(ctx) }
            }
            Spacer(Modifier.height(24.dp))
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Kite(40.dp) }
                }
            }
        }
    }
    confirm?.let { c -> ConfirmDialog(c) { confirm = null } }
    if (pairing) {
        AlertDialog(
            onDismissRequest = { pairing = false },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Link with other device") },
            text = {
                Column {
                    Text("Paste the tabs link shown on your other Lodica. Both devices then share one key and see each other's tabs.", fontSize = 13.sp)
                    OutlinedTextField(
                        pairText, { pairText = it },
                        Modifier.fillMaxWidth().padding(top = 8.dp),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
                            focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
                        ),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val ok = PcTabs.pair(pairText)
                    pairing = false
                    Toast.makeText(ctx, if (ok) "Linked" else "Not a valid tabs link", Toast.LENGTH_SHORT).show()
                }) { Text("Link", color = Amber) }
            },
            dismissButton = { TextButton(onClick = { pairing = false }) { Text("Cancel", color = Muted) } },
        )
    }
}

@Composable
private fun AiSection() {
    val ctx = LocalContext.current
    var steps by remember { mutableStateOf(false) }
    var memory by remember { mutableStateOf(false) }
    var reset by remember { mutableStateOf<Confirm?>(null) }
    var keyDialog by remember { mutableStateOf(false) }
    LinkRow(if (Ai.hasKey) "Anthropic API key: set (Haiku 5.5)" else "Anthropic API key", if (Ai.hasKey) Mist else Amber) { keyDialog = true }
    if (keyDialog) {
        var draft by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { keyDialog = false },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Anthropic API key") },
            text = {
                Column {
                    Text("Used for Ask AI and AI chats, with the Haiku 5.5 model only. Stored encrypted on this phone and sent only to Anthropic.", fontSize = 13.sp)
                    OutlinedTextField(
                        draft, { draft = it }, Modifier.fillMaxWidth().padding(top = 8.dp), singleLine = true,
                        placeholder = { Text("sk-ant-…", color = Muted) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
                            focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
                        ),
                    )
                }
            },
            confirmButton = { TextButton(onClick = { Ai.setKey(draft); keyDialog = false }) { Text("Save", color = Amber) } },
            dismissButton = { if (Ai.hasKey) TextButton(onClick = { Ai.setKey(""); keyDialog = false }) { Text("Remove", color = Coral) } else TextButton(onClick = { keyDialog = false }) { Text("Cancel", color = Muted) } },
        )
    }
    SwitchRow("Ask AI via Termux", "No API key? Use your own Claude Code in Termux instead. Off by default, at your own risk", Ai.enabled) {
        Ai.updateEnabled(it)
    }
    if (Ai.enabled) {
        LinkRow("Status: ${Ai.status}", if (Ai.connected) Mist else Amber) { Ai.connect() }
        LinkRow("Setup steps") { steps = true }
        LinkRow("Termux battery settings") {
            runCatching {
                ctx.startActivity(
                    android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:com.termux"))
                        .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }.onFailure { Toast.makeText(ctx, "Termux not installed", Toast.LENGTH_SHORT).show() }
        }
    }
    LinkRow("Memory (${Memory.facts.size} facts)") { memory = true }
    Ai.usageVersion // re-read the counters after each request or reset
    InfoRow("Today", usageText(Ai.usage(1)))
    InfoRow("Last 30 days", usageText(Ai.usage(30)))
    InfoRow("All time", usageText(Ai.usage(null)))
    LinkRow("Reset usage", Coral) {
        reset = Confirm("Reset usage?", "Request and token counts go back to zero.", "Reset") { Ai.resetUsage() }
    }
    reset?.let { c -> ConfirmDialog(c) { reset = null } }
    if (steps) {
        AlertDialog(
            onDismissRequest = { steps = false },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Set up Ask AI") },
            text = {
                Text(
                    "1. Install Termux from F-Droid.\n" +
                        "2. In Termux run: pkg install nodejs\n" +
                        "3. Then: npm i -g @anthropic-ai/claude-code@2.1.112\n" +
                        "4. Run claude and sign in. Lodica never sees your login.\n" +
                        "5. Add allow-external-apps=true to ~/.termux/termux.properties, then restart Termux.\n" +
                        "6. Turn off battery optimisation for Termux.\n" +
                        "7. Tap Status here and allow Lodica to run commands in Termux.",
                )
            },
            confirmButton = { TextButton(onClick = { steps = false }) { Text("OK", color = Amber) } },
        )
    }
    if (memory) {
        var draft by remember { mutableStateOf(Memory.text) }
        AlertDialog(
            onDismissRequest = { memory = false },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("AI memory") },
            text = {
                Column {
                    Text("One fact per line. Stored encrypted on this phone only.", fontSize = 13.sp)
                    OutlinedTextField(
                        draft, { draft = it },
                        Modifier.fillMaxWidth().heightIn(min = 140.dp, max = 320.dp).padding(top = 8.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
                            focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
                        ),
                    )
                }
            },
            confirmButton = { TextButton(onClick = { Memory.set(draft); memory = false }) { Text("Save", color = Amber) } },
            dismissButton = { TextButton(onClick = { Memory.clear(); memory = false }) { Text("Clear all", color = Coral) } },
        )
    }
}

private fun usageText(u: Ai.Usage) = "${u.requests} req · ${tokens(u.input)} in · ${tokens(u.output)} out"

private fun tokens(n: Long) = when {
    n >= 1_000_000 -> "%.1fM".format(n / 1_000_000.0)
    n >= 1_000 -> "%.1fk".format(n / 1_000.0)
    else -> n.toString()
}

@Composable
private fun ExtensionsSection() {
    val ctx = LocalContext.current
    var q by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { be.syntaxya.lodica.engine.Extensions.refresh(ctx) }
    val ex = be.syntaxya.lodica.engine.Extensions
    ex.prompt?.let { p ->
        AlertDialog(
            onDismissRequest = { ex.answer(false) },
            title = { Text("Add ${p.name}?") },
            text = { Text(if (p.permissions.isEmpty()) "It asks for no special permissions." else "It can: " + p.permissions.joinToString(", ")) },
            confirmButton = { TextButton({ ex.answer(true) }) { Text("Add", color = Amber) } },
            dismissButton = { TextButton({ ex.answer(false) }) { Text("Cancel", color = Muted) } },
        )
    }
    OutlinedTextField(
        q, { q = it }, singleLine = true,
        placeholder = { Text("Search Firefox add-ons", color = Muted) },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { ex.search(q) }),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
    )
    if (ex.busy) InfoRow("Working", "…")
    ex.status?.let { InfoRow("Status", it) }
    ex.hits.forEach { h -> LinkRow("Install ${h.name}", Amber) { ex.install(ctx, h) } }
    ex.installed.forEach { i ->
        SwitchRow(i.name, "v${i.version}", i.enabled) { ex.toggle(ctx, i) }
        LinkRow("Remove ${i.name}", Muted) { ex.remove(ctx, i) }
    }
}

@Composable
private fun SilentInstallSection() {
    val ctx = LocalContext.current
    val act = ctx as FragmentActivity
    var steps by remember { mutableStateOf(false) }
    DisposableEffect(act) {
        SilentInstall.init(ctx)
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) SilentInstall.refresh() }
        act.lifecycle.addObserver(obs)
        onDispose { act.lifecycle.removeObserver(obs) }
    }
    InfoRow("Silent install", SilentInstall.state.label)
    SilentInstall.nextStep()?.let { next ->
        LinkRow(next, Amber) {
            SilentInstall.runNextStep(ctx)?.let { Toast.makeText(ctx, it, Toast.LENGTH_LONG).show() }
        }
    }
    if (SilentInstall.state == SilentInstall.State.Stopped) {
        LinkRow("Open developer options") { SilentInstall.openDeveloperOptions(ctx) }
    }
    LinkRow("Setup steps") { steps = true }
    if (steps) {
        AlertDialog(
            onDismissRequest = { steps = false },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Install web apps without prompts") },
            text = {
                Text(
                    "Lodica can install web apps silently through Shizuku. Tap the amber button above for each step.\n\n" +
                        "1. Get Shizuku from the Play Store.\n" +
                        "2. Turn on developer options: tap Build number 7 times.\n" +
                        "3. In developer options, turn on Wireless debugging.\n" +
                        "4. In Shizuku, pair with wireless debugging, then tap Start. Repeat Start after each reboot.\n" +
                        "5. Allow Lodica in Shizuku.\n\n" +
                        "Without Shizuku, Android asks once per app. On Android 12+ updates skip the prompt.\n\n" +
                        "Play Protect may still warn about the new app. Tap More details, then Install anyway. " +
                        "Or turn off Play Store > Play Protect > Scan apps with Play Protect.",
                )
            },
            confirmButton = { TextButton(onClick = { steps = false }) { Text("OK", color = Amber) } },
        )
    }
}

@Composable
private fun QualityPicker() {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Video quality", color = Mist, fontSize = 15.sp)
                Text("YouTube default. Change per site from the site menu", color = Muted, fontSize = 13.sp)
            }
            Text("${Prefs.quality}p", color = Muted, fontSize = 14.sp)
        }
        DropdownMenu(open, { open = false }, containerColor = GraphiteHigh) {
            Prefs.QUALITIES.forEach { q ->
                DropdownMenuItem(
                    text = { Text("${q}p", color = if (q == Prefs.quality) Amber else Mist) },
                    onClick = { Prefs.updateQuality(q); open = false },
                )
            }
        }
    }
}

internal class Confirm(val title: String, val body: String, val action: String = "Clear", val run: () -> Unit)

@Composable
internal fun ConfirmDialog(c: Confirm, dismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = dismiss,
        containerColor = GraphiteRaised,
        titleContentColor = Mist,
        textContentColor = Muted,
        title = { Text(c.title) },
        text = { Text(c.body) },
        confirmButton = { TextButton(onClick = { c.run(); dismiss() }) { Text(c.action, color = Coral) } },
        dismissButton = { TextButton(onClick = dismiss) { Text("Cancel", color = Muted) } },
    )
}

@Composable
internal fun TopBar(title: String, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = Mist) }
        Text(title, color = Mist, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
internal fun Section(title: String) {
    Text(
        title.uppercase(), color = Amber, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp,
        modifier = Modifier.padding(start = 20.dp, top = 22.dp, bottom = 6.dp),
    )
}

@Composable
private fun EnginePicker() {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Search engine", color = Mist, fontSize = 15.sp, modifier = Modifier.weight(1f))
            Text(Prefs.search.label, color = Muted, fontSize = 14.sp)
        }
        DropdownMenu(open, { open = false }, containerColor = GraphiteHigh) {
            SearchEngine.entries.forEach { e ->
                DropdownMenuItem(
                    text = { Text(e.label, color = if (e == Prefs.search) Amber else Mist) },
                    onClick = { Prefs.updateSearch(e); open = false },
                )
            }
        }
    }
}

@Composable
private fun AgentPicker() {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Identify as", color = Mist, fontSize = 15.sp, modifier = Modifier.weight(1f))
            Text(Prefs.userAgent.label, color = Muted, fontSize = 14.sp)
        }
        DropdownMenu(open, { open = false }, containerColor = GraphiteHigh) {
            UserAgent.entries.forEach { e ->
                DropdownMenuItem(
                    text = { Text(e.label, color = if (e == Prefs.userAgent) Amber else Mist) },
                    onClick = { Prefs.updateUserAgent(e); open = false },
                )
            }
        }
    }
}

@Composable
private fun LanguagePicker() {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Site language", color = Mist, fontSize = 15.sp, modifier = Modifier.weight(1f))
            Text(Prefs.language.label, color = Muted, fontSize = 14.sp)
        }
        DropdownMenu(open, { open = false }, containerColor = GraphiteHigh) {
            Language.entries.forEach { e ->
                DropdownMenuItem(
                    text = { Text(e.label, color = if (e == Prefs.language) Amber else Mist) },
                    onClick = { Prefs.updateLanguage(e); open = false },
                )
            }
        }
    }
}

@Composable
private fun DataMeter() {
    val v = Meter.version.intValue
    val sites = remember(v) { Meter.sites() }
    if (sites.isEmpty()) {
        Text("Nothing measured yet", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        return
    }
    val total = sites.sumOf { it.bytes }
    val saved = sites.sumOf { it.saved }
    InfoRow("Total", "${bytes(total)} · $saved blocked")
    sites.take(8).forEach { InfoRow(it.host, "${bytes(it.bytes)}" + if (it.saved > 0) " · ${it.saved} blocked" else "") }
    LinkRow("Reset data counters") { Meter.clear() }
}

private fun bytes(b: Long): String = when {
    b >= 1L shl 30 -> "%.1f GB".format(b / (1L shl 30).toDouble())
    b >= 1L shl 20 -> "%.1f MB".format(b / (1L shl 20).toDouble())
    b >= 1L shl 10 -> "${b shr 10} KB"
    else -> "$b B"
}

@Composable
internal fun SwitchRow(title: String, sub: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Mist, fontSize = 15.sp)
            Text(sub, color = Muted, fontSize = 12.sp)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked, onChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Graphite, checkedTrackColor = Amber,
                uncheckedThumbColor = Muted, uncheckedTrackColor = GraphiteHigh, uncheckedBorderColor = GraphiteHigh,
            ),
        )
    }
}

@Composable
private fun Chip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label, color = if (selected) Graphite else Mist, fontSize = 13.sp,
        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(if (selected) Amber else GraphiteRaised)
            .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

@Composable
internal fun LinkRow(title: String, color: androidx.compose.ui.graphics.Color = Mist, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = color, fontSize = 15.sp, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Muted)
    }
}

@Composable
internal fun InfoRow(title: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)) {
        Text(title, color = Mist, fontSize = 15.sp, modifier = Modifier.weight(1f))
        Text(value, color = Muted, fontSize = 14.sp)
    }
}

@Composable
private fun FilterField(value: String, hint: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value, onChange,
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        placeholder = { Text(hint, color = Muted) },
        leadingIcon = { Icon(Icons.Rounded.Search, null, tint = Muted) },
        trailingIcon = {
            if (value.isNotEmpty()) IconButton(onClick = { onChange("") }) { Icon(Icons.Rounded.Close, "Clear", tint = Muted) }
        },
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
            focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
            focusedContainerColor = GraphiteRaised, unfocusedContainerColor = GraphiteRaised,
        ),
    )
}

/* ---------- History ---------- */

@Composable
fun HistoryScreen() {
    var filter by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf<Confirm?>(null) }
    val items = remember { mutableStateListOf<Visit>() }
    LaunchedEffect(Unit) {
        val list = withContext(Dispatchers.IO) { runCatching { History.recent(200) }.getOrDefault(emptyList()) }
        items.clear(); items.addAll(list)
    }
    val shown = items.filter {
        filter.isBlank() || it.url.contains(filter, true) || it.title.contains(filter, true)
    }

    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { TopBar("History") { Ui.back() } }
            if (items.isNotEmpty()) TextButton(onClick = {
                confirm = Confirm("Clear history?", "Every visited page is removed from this device.") {
                    History.clear(); items.clear()
                }
            }) { Text("Clear all", color = Coral) }
        }
        FilterField(filter, "Search history") { filter = it }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
            if (shown.isEmpty()) item {
                Text(
                    if (items.isEmpty()) "No history yet" else "No matches",
                    color = Muted, fontSize = 14.sp, modifier = Modifier.padding(32.dp),
                )
            }
            items(shown, key = { it.url }) { v ->
                Row(
                    Modifier.fillMaxWidth().animateItem()
                        .clickable { TabManager.load(v.url); Ui.screen = Screen.Browser }
                        .padding(start = 20.dp, top = 6.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(v.title.ifBlank { v.url }, color = Mist, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${DateUtils.getRelativeTimeSpanString(v.last)} · ${v.url}",
                            color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    IconButton(onClick = { History.remove(v.url); items.remove(v) }) {
                        Icon(Icons.Rounded.Close, "Remove", tint = Muted, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
    confirm?.let { c -> ConfirmDialog(c) { confirm = null } }
}

/* ---------- Passwords ---------- */

@Composable
fun PasswordsScreen() {
    val ctx = LocalContext.current
    val act = ctx as FragmentActivity
    var unlocked by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var filter by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<SavedLogin?>(null) }
    val logins = remember { mutableStateListOf<SavedLogin>() }

    // Keep secrets out of screenshots, the recents thumbnail and screen recordings.
    DisposableEffect(Unit) {
        act.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose { act.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
    // Leaving the app locks the vault view again.
    DisposableEffect(act) {
        val obs = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_STOP) { unlocked = false; logins.clear() }
        }
        act.lifecycle.addObserver(obs)
        onDispose { act.lifecycle.removeObserver(obs) }
    }

    fun unlock() {
        error = null
        if (!Biometric.available(act)) {
            error = "Set a screen lock to view passwords."
            return
        }
        Biometric.unlock(act, "Unlock passwords", onOk = { unlocked = true }, onError = { error = it })
    }

    LaunchedEffect(unlocked) {
        if (!unlocked) { unlock(); return@LaunchedEffect }
        Vault.all().accept({ list -> logins.clear(); logins.addAll(list.orEmpty()) }, { e -> error = e?.message ?: "Vault error" })
    }

    Column(Modifier.fillMaxSize()) {
        TopBar("Passwords") { Ui.back() }
        if (!unlocked) {
            Column(
                Modifier.fillMaxSize().padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Rounded.Lock, null, tint = Amber, modifier = Modifier.size(48.dp))
                Spacer(Modifier.height(12.dp))
                Text("Passwords are locked", color = Mist, fontSize = 16.sp)
                error?.let { Text(it, color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp)) }
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = { unlock() },
                    colors = ButtonDefaults.buttonColors(containerColor = Amber, contentColor = Graphite),
                ) { Text("Unlock") }
            }
            return@Column
        }

        FilterField(filter, "Search logins") { filter = it }
        val shown = logins.filter {
            filter.isBlank() || it.origin.contains(filter, true) || it.username.contains(filter, true)
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp)) {
            if (shown.isEmpty()) item {
                Text(
                    if (logins.isEmpty()) "No saved logins" else "No matches",
                    color = Muted, fontSize = 14.sp, modifier = Modifier.padding(20.dp),
                )
            }
            items(shown, key = { it.guid }) { l ->
                LoginCard(l, Modifier.animateItem()) { pendingDelete = l }
            }
        }
    }

    pendingDelete?.let { l ->
        ConfirmDialog(Confirm("Delete login?", "${l.username} on ${l.origin.removePrefix("https://")}") {
            Vault.delete(l.guid).accept({ _ -> logins.removeAll { it.guid == l.guid } }, { _ -> })
        }) { pendingDelete = null }
    }
}

@Composable
private fun LoginCard(l: SavedLogin, modifier: Modifier, onDelete: () -> Unit) {
    val ctx = LocalContext.current
    var reveal by remember { mutableStateOf(false) }
    Column(
        modifier.fillMaxWidth().padding(vertical = 5.dp).clip(RoundedCornerShape(14.dp))
            .background(GraphiteRaised).animateContentSize().padding(start = 16.dp, top = 12.dp, bottom = 6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                l.origin.removePrefix("https://").removePrefix("www."), color = Mist, fontSize = 15.sp,
                fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onDelete) { Icon(Icons.Rounded.Delete, "Delete", tint = Muted, modifier = Modifier.size(20.dp)) }
        }
        HorizontalDivider(Modifier.padding(end = 16.dp, bottom = 4.dp), color = GraphiteHigh)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Person, null, tint = Muted, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Text(l.username.ifEmpty { "(no username)" }, color = Mist, fontSize = 14.sp, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            IconButton(onClick = { copy(ctx, l.username) }) {
                Icon(Icons.Rounded.ContentCopy, "Copy username", tint = Muted, modifier = Modifier.size(18.dp))
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Lock, null, tint = Muted, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Text(
                if (reveal) l.password else "•".repeat(l.password.length.coerceIn(6, 14)),
                color = Mist, fontSize = 14.sp, fontFamily = FontFamily.Monospace, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { reveal = !reveal }) {
                Icon(
                    if (reveal) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                    if (reveal) "Hide" else "Show", tint = Muted, modifier = Modifier.size(18.dp),
                )
            }
            IconButton(onClick = {
                copy(ctx, l.password, sensitive = true)
                Toast.makeText(ctx, "Password copied", Toast.LENGTH_SHORT).show()
            }) {
                Icon(Icons.Rounded.ContentCopy, "Copy password", tint = Amber, modifier = Modifier.size(18.dp))
            }
        }
    }
}

private val SettingsTabs = listOf("General", "Appearance", "Tabs", "Privacy & blocking", "Controls", "Identity & mail", "Updates & about")

@Composable
private fun ThemePicker() {
    Text(
        "Colours the browser, start page and settings. Websites keep their own.", color = Muted, fontSize = 13.sp,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
    )
    ThemeChoices.forEach { (key, label) ->
        val pal = Palettes.firstOrNull { it.key == key }
        Row(
            Modifier.fillMaxWidth().clickable { Prefs.updateTheme(key) }.padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.width(60.dp)) {
                if (pal == null) {
                    Box(Modifier.size(16.dp).clip(RoundedCornerShape(4.dp)).background(Color(0xFF101418)))
                    Box(Modifier.size(16.dp).clip(RoundedCornerShape(4.dp)).background(Color(0xFFF4F1EA)))
                } else {
                    listOf(pal.bg, pal.raised, pal.accent).forEach {
                        Box(Modifier.size(16.dp).clip(RoundedCornerShape(4.dp)).background(Color(it)))
                    }
                }
            }
            Text(label, color = if (Prefs.theme == key) Amber else Mist, fontSize = 15.sp, modifier = Modifier.weight(1f))
            if (Prefs.theme == key) Text("Active", color = Amber, fontSize = 12.sp)
        }
    }
    CustomThemeEditor()
}

/** Four hex colours, a live preview, and save. Saved themes sync to the relay and to other devices. */
@Composable
private fun WidgetEditor() {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    var text by remember { mutableStateOf(Prefs.widgetText) }
    Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = text, onValueChange = { text = it.take(40) }, singleLine = true,
            label = { Text("Hint text") }, placeholder = { Text("Search or type a URL") },
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("pill" to "Pill", "rounded" to "Rounded", "square" to "Square").forEach { (k, l) ->
                val on = Prefs.widgetShape == k
                TextButton(onClick = { Prefs.updateWidget(text, k); SearchWidget.refresh(ctx) }) { Text(if (on) "• $l" else l) }
            }
        }
        Button(onClick = { Prefs.updateWidget(text, Prefs.widgetShape); SearchWidget.refresh(ctx) }) { Text("Update widget") }
        Text("The widget uses your theme colours. Add it from the home screen widget list.", color = Muted)
    }
}

@Composable
private fun CustomThemeEditor() {
    val saved = Prefs.customTheme
    var bg by remember { mutableStateOf(saved?.bg ?: "#111827") }
    var text by remember { mutableStateOf(saved?.text ?: "#E5E7EB") }
    var accent by remember { mutableStateOf(saved?.accent ?: "#F59E0B") }
    var accent2 by remember { mutableStateOf(saved?.accent2 ?: "#F43F5E") }
    // A theme pulled from another device replaces the fields.
    androidx.compose.runtime.LaunchedEffect(saved) {
        saved?.let { bg = it.bg; text = it.text; accent = it.accent; accent2 = it.accent2 }
    }
    val ok = CustomTheme.valid(bg, text, accent, accent2)
    val preview = if (ok) customPalette(CustomTheme(bg, text, accent, accent2, 0)) else null
    Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Your own theme", color = Mist, fontSize = 15.sp, fontWeight = FontWeight.Medium)
        Text(
            if (Relay.available) "Syncs to your other devices." else "Connect a relay to sync it to your other devices.",
            color = Muted, fontSize = 13.sp,
        )
        listOf(
            Triple("Background", bg) { v: String -> bg = v },
            Triple("Text", text) { v: String -> text = v },
            Triple("Accent", accent) { v: String -> accent = v },
            Triple("Second accent", accent2) { v: String -> accent2 = v },
        ).forEach { (label, value, set) ->
            OutlinedTextField(
                value = value, onValueChange = { set(it.trim()) }, label = { Text(label) }, singleLine = true,
                isError = !CustomTheme.valid(value), modifier = Modifier.fillMaxWidth(),
            )
        }
        if (preview != null) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(preview.bg)).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Preview", color = Color(preview.text), fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text("Muted text looks like this", color = Color(preview.muted), fontSize = 13.sp)
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color(preview.raised)).padding(10.dp)) {
                    Text("example.com", color = Color(preview.text), fontSize = 14.sp)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(24.dp).clip(RoundedCornerShape(6.dp)).background(Color(preview.accent)))
                    Box(Modifier.size(24.dp).clip(RoundedCornerShape(6.dp)).background(Color(preview.accent2)))
                    Box(Modifier.size(24.dp).clip(RoundedCornerShape(6.dp)).background(Color(preview.high)))
                }
            }
        }
        Button(
            enabled = ok,
            onClick = {
                Prefs.updateCustomTheme(CustomTheme(bg, text, accent, accent2, System.currentTimeMillis()))
                Prefs.updateTheme("custom")
                Relay.syncThemeNow()
            },
        ) { Text("Save and use") }
    }
}

@Composable
private fun StartBackgroundSettings() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            if (StartBg.importImage(ctx, uri)) {
                Prefs.touchStartImage()
                Prefs.updateStartBg("image")
            } else Toast.makeText(ctx, "Could not read that image", Toast.LENGTH_SHORT).show()
        }
    }
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Chip("None", Prefs.startBg == "none") { Prefs.updateStartBg("none") }
        Chip("Gradient", Prefs.startBg == "gradient") {
            if (Prefs.startBg != "gradient") Prefs.updateStartBg("gradient", StartBg.Gradients[0].key)
        }
        Chip("Colour", Prefs.startBg == "color") {
            if (Prefs.startBg != "color") Prefs.updateStartBg("color", StartBg.Colors[0])
        }
        Chip("Image", Prefs.startBg == "image") {
            if (StartBg.imageFile(ctx).exists()) Prefs.updateStartBg("image") else pick.launch("image/*")
        }
    }
    when (Prefs.startBg) {
        "gradient" -> Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StartBg.Gradients.forEach { g ->
                val on = Prefs.startBgValue == g.key
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)).background(StartBg.brush(g))
                            .border(if (on) 2.dp else 0.dp, if (on) Amber else Color.Transparent, RoundedCornerShape(12.dp))
                            .clickable { Prefs.updateStartBg("gradient", g.key) },
                    )
                    Text(g.label, color = if (on) Amber else Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
                }
            }
        }
        "color" -> Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StartBg.Colors.forEach { hex ->
                val on = Prefs.startBgValue.equals(hex, true)
                Box(
                    Modifier.size(44.dp).clip(RoundedCornerShape(22.dp)).background(StartBg.parseColor(hex))
                        .border(if (on) 2.dp else 1.dp, if (on) Amber else GraphiteHigh, RoundedCornerShape(22.dp))
                        .clickable { Prefs.updateStartBg("color", hex) },
                )
            }
        }
        "image" -> Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = { pick.launch("image/*") }) { Text("Choose another image", color = Amber) }
            TextButton(onClick = { StartBg.removeImage(ctx); Prefs.touchStartImage(); Prefs.updateStartBg("none") }) {
                Text("Remove", color = Coral)
            }
        }
        else -> {}
    }
    if (Prefs.startBg == "none") {
        TextButton(onClick = { pick.launch("image/*") }, modifier = Modifier.padding(horizontal = 12.dp)) {
            Text("Pick your own image", color = Amber)
        }
    } else {
        Text("Dim", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(start = 20.dp, top = 8.dp))
        Slider(
            Prefs.startDim, { Prefs.updateStartDim(it) }, valueRange = 0f..0.9f,
            colors = SliderDefaults.colors(thumbColor = Amber, activeTrackColor = Amber, inactiveTrackColor = GraphiteHigh),
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        Text("Blur", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(start = 20.dp))
        Slider(
            Prefs.startBlur, { Prefs.updateStartBlur(it) }, valueRange = 0f..24f,
            colors = SliderDefaults.colors(thumbColor = Amber, activeTrackColor = Amber, inactiveTrackColor = GraphiteHigh),
            modifier = Modifier.padding(horizontal = 16.dp),
        )
    }
}

@Composable
private fun ControlsSection() {
    Text(
        "Choose what each gesture does.", color = Muted, fontSize = 13.sp,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
    )
    Section("Toggles")
    SwitchRow("Swipe the address bar to change tab", "Swipe left or right on the URL pill", Prefs.gestureSwipeTabs) { Prefs.updateGestureSwipeTabs(it) }
    SwitchRow("Hide bars on scroll", "Scrolling down tucks the toolbar away, scrolling up brings it back", Prefs.gestureBarHide) { Prefs.updateGestureBarHide(it) }
    Section("Gestures")
    GestureSlot.values().forEach { slot -> GestureRow(slot) }
    LinkRow("Reset gestures to default") { GestureSlot.values().forEach { Prefs.updateGestureAction(it.name, it.def.name) } }
    Section("Fixed")
    listOf(
        "Scroll the page" to "Hide or show the bars",
        "Tap the address bar" to "Search or type a URL",
        "Long-press a link or image" to "Open the context menu",
    ).forEach { (g, a) ->
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(g, color = Mist, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Text(a, color = Muted, fontSize = 13.sp)
        }
    }
}

@Composable
private fun GestureRow(slot: GestureSlot) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(slot.label, color = Mist, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Text(slot.action.label, color = Amber, fontSize = 13.sp)
        }
        DropdownMenu(open, { open = false }, containerColor = GraphiteHigh) {
            GestureAction.values().forEach { a ->
                DropdownMenuItem(
                    text = { Text(a.label, color = if (a == slot.action) Amber else Mist) },
                    onClick = { Prefs.updateGestureAction(slot.name, a.name); open = false },
                )
            }
        }
    }
}

@Composable
private fun ChromeImportSection() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    fun picker(run: (Uri) -> ChromeImport.Result, what: String) = { uri: Uri? ->
        if (uri != null) scope.launch {
            val msg = runCatching { withContext(Dispatchers.IO) { run(uri) } }
                .map { "Imported ${it.count} $what" + if (it.skipped > 0) " (${it.skipped} skipped)" else "" }
                .getOrElse { "Could not read that file" }
            Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show()
        }
    }
    val pass = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument(), picker({ ChromeImport.passwords(ctx, it) }, "logins"))
    val hist = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument(), picker({ ChromeImport.history(ctx, it) }, "history entries"))
    Text(
        "Chrome shares nothing with other apps, so export first. Passwords: Chrome > Password Manager > Settings > Export (CSV). " +
            "History: Google Takeout > Chrome, then pick History.json. Delete the CSV afterwards: it holds plain-text passwords.",
        color = Muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
    )
    LinkRow("Import passwords (CSV)") { pass.launch(arrayOf("text/*", "application/csv", "application/vnd.ms-excel", "application/octet-stream")) }
    LinkRow("Import history (History.json)") { hist.launch(arrayOf("application/json", "text/*", "application/octet-stream")) }
}

@Composable
private fun DnsSection() {
    var rules by remember { mutableStateOf(false) }
    var server by remember { mutableStateOf(false) }
    val n = Prefs.dnsPairs().size
    LinkRow(if (n == 0) "Own domain names" else "Own domain names ($n)") { rules = true }
    LinkRow(if (Prefs.dnsServer.isBlank()) "DNS server: default" else "DNS server: custom") { server = true }
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
        focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
    )
    if (rules) {
        var draft by remember { mutableStateOf(Prefs.dnsRules) }
        AlertDialog(
            onDismissRequest = { rules = false },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Own domain names") },
            text = {
                Column {
                    Text("One per line: name, space, target. A name can be .home, *.lab.me or a full host. A target is a host, an IP or a URL. Only works in this browser, loads directly without the VPS.", fontSize = 13.sp)
                    OutlinedTextField(
                        draft, { draft = it }, Modifier.fillMaxWidth().padding(top = 8.dp),
                        placeholder = { Text(".home 192.168.1.10:8080", color = Muted) }, colors = fieldColors,
                    )
                }
            },
            confirmButton = { TextButton(onClick = { Prefs.updateDnsRules(draft); rules = false }) { Text("Save", color = Amber) } },
            dismissButton = { TextButton(onClick = { rules = false }) { Text("Cancel", color = Muted) } },
        )
    }
    if (server) {
        var draft by remember { mutableStateOf(Prefs.dnsServer) }
        AlertDialog(
            onDismissRequest = { server = false },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("DNS server") },
            text = {
                Column {
                    Text("Your own DNS over HTTPS address. Leave blank for the default.", fontSize = 13.sp)
                    OutlinedTextField(
                        draft, { draft = it }, Modifier.fillMaxWidth().padding(top = 8.dp), singleLine = true,
                        placeholder = { Text("https://dns.example.com/dns-query", color = Muted) }, colors = fieldColors,
                    )
                }
            },
            confirmButton = { TextButton(onClick = { Prefs.updateDnsServer(draft); server = false }) { Text("Save", color = Amber) } },
            dismissButton = { TextButton(onClick = { server = false }) { Text("Cancel", color = Muted) } },
        )
    }
}
