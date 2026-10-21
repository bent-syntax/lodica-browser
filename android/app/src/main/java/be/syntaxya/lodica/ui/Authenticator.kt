package be.syntaxya.lodica.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.QrImage
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.engine.Totp
import be.syntaxya.lodica.engine.TotpEntry
import be.syntaxya.lodica.engine.TotpMigration
import be.syntaxya.lodica.engine.Vault
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import kotlinx.coroutines.delay

/**
 * Built-in authenticator: 2FA secrets live in the encrypted vault and the current code is filled into
 * verification-code fields on the matching site. Add a secret or an otpauth:// link by pasting it.
 */
@Composable
fun AuthenticatorSection() {
    val ctx = LocalContext.current
    var entries by remember { mutableStateOf<List<TotpEntry>>(emptyList()) }
    var rev by remember { mutableStateOf(0) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var adding by remember { mutableStateOf(false) }
    var importing by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<TotpEntry?>(null) }

    LaunchedEffect(rev) { Vault.totpAll().accept({ entries = it ?: emptyList() }, { }) }
    // Codes tick once a second, but only while this section is on screen.
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(1000) } }

    if (entries.isEmpty()) {
        Text(
            "No codes yet. Add the secret key (or otpauth:// link) a site shows when you turn on two-factor sign-in.",
            color = Muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
        )
    }
    entries.forEach { e ->
        val code = Totp.code(e, now)
        Row(
            Modifier.fillMaxWidth()
                .clickable(enabled = code != null) {
                    val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("code", code))
                    Toast.makeText(ctx, "Code copied", Toast.LENGTH_SHORT).show()
                }
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(e.label, color = Mist, fontSize = 15.sp, maxLines = 1)
                Text(
                    (e.host.ifEmpty { "Not tied to a site: copy only" }) + "  ·  " + (if (e.host.isEmpty()) "tap to set site" else "tap to change"),
                    color = Muted, fontSize = 12.sp, maxLines = 1, modifier = Modifier.clickable { editing = e },
                )
            }
            Text(
                code?.let { it.take(it.length / 2) + " " + it.drop(it.length / 2) } ?: "Bad key",
                color = Amber, fontSize = 20.sp,
            )
            Text("${Totp.remaining(e, now)}s", color = Muted, fontSize = 12.sp)
            IconButton(onClick = { Vault.totpDelete(e.id).accept({ rev++ }, { }) }) {
                Icon(Icons.Rounded.Close, "Remove", tint = Muted)
            }
        }
    }
    LinkRow("Add authenticator code") { adding = true }
    LinkRow("Import from Google Authenticator") { importing = true }

    if (importing || Ui.pendingMigration != null) {
        var link by remember { mutableStateOf(Ui.pendingMigration.orEmpty()) }
        var picked by remember { mutableStateOf<Set<String>>(emptySet()) }
        val found = remember(link) { TotpMigration.parse(link) }
        LaunchedEffect(found) { picked = found?.map { it.id }?.toSet().orEmpty() }
        val close = { importing = false; Ui.pendingMigration = null }
        var noQr by remember { mutableStateOf(false) }
        val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null) {
                val text = QrImage.decode(ctx, uri)
                noQr = text == null
                if (text != null) link = text
            }
        }
        AlertDialog(
            onDismissRequest = close,
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Import from Google Authenticator") },
            text = {
                Column {
                    if (found == null) {
                        Text(
                            "In Google Authenticator choose Transfer accounts, Export, and scan the QR code with your camera app or Google Lens: it opens here. Or paste the otpauth-migration:// link.",
                            fontSize = 13.sp,
                        )
                        OutlinedTextField(
                            link, { link = it }, Modifier.fillMaxWidth().padding(top = 8.dp), singleLine = true,
                            label = { Text("otpauth-migration:// link", color = Muted) },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
                                focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
                            ),
                        )
                        TextButton(onClick = { pickImage.launch("image/*") }) { Text("Pick a screenshot of the QR code", color = Amber) }
                        if (noQr) Text("No QR code found in that image.", fontSize = 12.sp)
                        else if (link.isNotBlank()) Text("No codes found in that link.", fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                    } else {
                        found.forEach { e ->
                            Row(
                                Modifier.fillMaxWidth().clickable { picked = if (e.id in picked) picked - e.id else picked + e.id },
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(e.id in picked, { picked = if (it) picked + e.id else picked - e.id })
                                Column {
                                    Text(e.label, color = Mist, fontSize = 15.sp, maxLines = 1)
                                    Text("${e.digits} digits · ${e.algo}", color = Muted, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = found != null && picked.isNotEmpty(),
                    onClick = {
                        found?.filter { it.id in picked }?.forEach { Vault.totpAdd(it).accept({ rev++ }, { }) }
                        close()
                    },
                ) { Text("Import ${picked.size}", color = Amber) }
            },
            dismissButton = { TextButton(onClick = close) { Text("Cancel", color = Muted) } },
        )
    }

    editing?.let { e ->
        var site by remember(e.id) { mutableStateOf(e.host) }
        AlertDialog(
            onDismissRequest = { editing = null },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Auto-fill site") },
            text = {
                OutlinedTextField(
                    site, { site = it }, Modifier.fillMaxWidth(), singleLine = true,
                    label = { Text("Site, e.g. github.com (empty = copy only)", color = Muted) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
                        focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val h = site.trim().lowercase().removePrefix("www.")
                    if (h.isNotEmpty()) Prefs.setTotpSkip(h, false)
                    Vault.totpSetHost(e.id, h).accept({ rev++ }, { })
                    editing = null
                }) { Text("Save", color = Amber) }
            },
            dismissButton = { TextButton(onClick = { editing = null }) { Text("Cancel", color = Muted) } },
        )
    }

    if (adding) {
        var site by remember { mutableStateOf(TabManager.current?.takeIf { it.url.startsWith("http") }?.host.orEmpty().removePrefix("www.")) }
        var secret by remember { mutableStateOf("") }
        val fieldColors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
            focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
        )
        val parsed = Totp.parse(secret, site.trim().lowercase())
        AlertDialog(
            onDismissRequest = { adding = false },
            containerColor = GraphiteRaised, titleContentColor = Mist, textContentColor = Muted,
            title = { Text("Add authenticator code") },
            text = {
                Column {
                    OutlinedTextField(
                        secret, { secret = it }, Modifier.fillMaxWidth(), singleLine = true,
                        label = { Text("Secret key or otpauth:// link", color = Muted) }, colors = fieldColors,
                    )
                    OutlinedTextField(
                        site, { site = it }, Modifier.fillMaxWidth().padding(top = 8.dp), singleLine = true,
                        label = { Text("Site, e.g. github.com (fills codes there)", color = Muted) }, colors = fieldColors,
                    )
                    if (secret.isNotBlank() && parsed == null) {
                        Text("That is not a valid key.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = parsed != null,
                    onClick = { parsed?.let { Prefs.setTotpSkip(it.host, false); Vault.totpAdd(it).accept({ rev++ }, { }) }; adding = false },
                ) { Text("Add", color = Amber) }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Cancel", color = Muted) } },
        )
    }
}
