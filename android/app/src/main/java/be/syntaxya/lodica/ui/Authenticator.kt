package be.syntaxya.lodica.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
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
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.Totp
import be.syntaxya.lodica.engine.TotpEntry
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
                Text(e.host.ifEmpty { "Not tied to a site: copy only" }, color = Muted, fontSize = 12.sp, maxLines = 1)
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

    if (adding) {
        var site by remember { mutableStateOf(TabManager.current?.host.orEmpty().removePrefix("www.")) }
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
                    onClick = { parsed?.let { Vault.totpAdd(it).accept({ rev++ }, { }) }; adding = false },
                ) { Text("Add", color = Amber) }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Cancel", color = Muted) } },
        )
    }
}
