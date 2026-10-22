package be.syntaxya.lodica.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import be.syntaxya.lodica.engine.Relay
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.GraphiteHigh
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

// Installer for the relay in this repository (relay/deploy/install.sh).
private const val INSTALL_URL = "https://raw.githubusercontent.com/bent-syntax/lodica-browser/main/relay/deploy/install.sh"

/** First-run setup: browse without a server, or link the app to your own relay step by step. */
@Composable
fun SetupScreen() {
    val ctx = LocalContext.current
    // 0 = choose, 1 = no-server info, 2.. = server steps
    var step by remember { mutableIntStateOf(0) }
    var domain by remember { mutableStateOf(if (Relay.available) Relay.DOMAIN else "") }
    val clean = Relay.cleanDomain(domain)
    val ok = Relay.validDomain(clean)
    val last = 6

    Box(Modifier.fillMaxSize().background(Graphite).systemBarsPadding()) {
        Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (step >= 2) "Server setup · step ${step - 1} of ${last - 1}" else "Welcome to Lodica",
                    color = Muted, fontSize = 13.sp, modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { Relay.finishSetup() }) { Text("Skip", color = Muted) }
            }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when (step) {
                    0 -> {
                        Title("How do you want to use Lodica?")
                        Body("You can change this any time in Settings, under Identity & mail.")
                        Choice("Without a server", "Just the browser. Nothing to set up. Search falls back to DuckDuckGo.") { step = 1 }
                        Choice("With my own server", "Adds hidden email with an inbox, tab sharing between devices, the private tunnel and Lodica Search. Takes about 5 minutes.") { step = 2 }
                    }
                    1 -> {
                        Title("Without a server")
                        Body("Works fully on its own: ad and tracker blocking, HTTPS-only, passwords, themes, PDF viewer, extensions and your tabs on this phone.")
                        Body("Not available: hidden email addresses and the inbox, tab sharing, routing through your own server, and Lodica Search.")
                        Body("If you add a server later, open Settings, then Identity & mail, then Run setup.")
                    }
                    2 -> {
                        Title("What you need")
                        Bullet("A small Linux server (VPS) with a public IP address. 1 CPU and 1 GB RAM is plenty. Debian or Ubuntu is what the installer supports.")
                        Bullet("A domain name whose wildcard DNS record (*.example.com) already points to the server.")
                        Bullet("Root access to the server over SSH.")
                        Body("Everything happens on the server: you only copy one command and paste the token back here.")
                    }
                    3 -> {
                        Title("Your domain")
                        Body("Type the domain you own. Not a full address: just example.com.")
                        Field(domain, "example.com", false) { domain = it }
                        if (domain.isNotBlank() && !ok) Warn("That doesn't look like a domain yet")
                        if (ok) Body("The app will use lodica.$clean and tunnel.$clean. Hidden email addresses will end in @$clean.")
                    }
                    4 -> {
                        Title("Run this on the server")
                        Body("Log in over SSH, then paste this one command. It installs Node and the Lodica relay, and Caddy if you do not have it. Caddy routes the domain and gets the certificates by itself. Sites you already run in Caddy are left alone.")
                        Code(ctx, "curl -fsSL $INSTALL_URL | sudo bash -s -- ${d(clean)}")
                        Body("When it finishes it prints your token, a long random string. Keep that screen open: you need it in the next step.")
                        Body("Everything runs over port 443, which restrictive networks allow, so open 80 and 443 in your host's firewall. The relay also keeps TCP ports 44741 and 44742 as a fallback and opens them in ufw if ufw is active. Running the command again is safe.")
                    }
                    5 -> LinkStep(ctx, clean, ok) { step++ }
                    else -> {
                        Title("You're set")
                        Body("Hidden email, the inbox, tab sharing, the tunnel and Lodica Search now use your server.")
                        Title("Optional: receiving mail")
                        Body("Hidden addresses need mail delivered to your server. Add this DNS record, then install Exim on the server:")
                        Code(ctx, "${d(clean)}    MX 10    lodica.${d(clean)}", "${d(clean)} MX 10 lodica.${d(clean)}")
                        Body("Without it everything else still works, you just won't receive confirmation mails.")
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (step > 0) TextButton(onClick = { step = if (step == 1) 0 else step - 1 }) { Text("Back", color = Muted) }
                Spacer(Modifier.weight(1f))
                when {
                    step == 1 || step == last -> Primary("Start browsing") { Relay.finishSetup() }
                    step in 2..4 -> Primary("Next", enabled = step != 3 || ok) { step++ }
                    else -> Unit
                }
            }
        }
    }
}

private fun d(clean: String) = clean.ifBlank { "example.com" }

@Composable
private fun LinkStep(ctx: Context, clean: String, ok: Boolean, next: () -> Unit) {
    var token by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Title("Link the app")
    Body("Paste the token the installer printed. You can also read it on the server with: sudo cat /etc/lodica-relay/token")
    Field(token, "Token", true) { token = it.trim(); result = null }
    Body("Server: lodica.${d(clean)}")
    Primary(if (busy) "Testing…" else "Test and save", enabled = ok && token.length >= 16 && !busy) {
        busy = true; result = null
        scope.launch {
            val err = withContext(Dispatchers.IO) { Relay.check(clean, token) }
            busy = false
            if (err == null) {
                Relay.configure(clean, token)
                Toast.makeText(ctx, "Connected", Toast.LENGTH_SHORT).show()
                next()
            } else result = err
        }
    }
    result?.let { Warn(it) }
}

@Composable private fun Title(t: String) = Text(t, color = Mist, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
@Composable private fun Body(t: String) = Text(t, color = Muted, fontSize = 14.sp, lineHeight = 20.sp)
@Composable private fun Warn(t: String) = Text(t, color = be.syntaxya.lodica.ui.theme.Coral, fontSize = 14.sp)
@Composable private fun Bullet(t: String) = Text("•  $t", color = Mist, fontSize = 14.sp, lineHeight = 20.sp)

@Composable
private fun Choice(title: String, sub: String, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(GraphiteRaised).clickable(onClick = onClick).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, color = Amber, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Text(sub, color = Muted, fontSize = 13.sp, lineHeight = 18.sp)
    }
}

@Composable
private fun Primary(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick, enabled = enabled, shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Amber, contentColor = Graphite, disabledContainerColor = GraphiteHigh, disabledContentColor = Muted),
    ) { Text(label) }
}

@Composable
private fun Code(ctx: Context, text: String, copy: String = text) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(GraphiteRaised).padding(12.dp)) {
        Text(text, color = Mist, fontFamily = FontFamily.Monospace, fontSize = 12.sp, lineHeight = 17.sp)
        TextButton(onClick = {
            (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Lodica setup", copy))
            Toast.makeText(ctx, "Copied", Toast.LENGTH_SHORT).show()
        }) { Text("Copy", color = Amber) }
    }
}

@Composable
private fun Field(value: String, hint: String, secret: Boolean, onChange: (String) -> Unit) {
    OutlinedTextField(
        value, onChange, Modifier.fillMaxWidth(),
        placeholder = { Text(hint, color = Muted) },
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (secret) KeyboardType.Password else KeyboardType.Uri, autoCorrectEnabled = false),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = Mist, unfocusedTextColor = Mist, cursorColor = Amber,
            focusedBorderColor = Amber, unfocusedBorderColor = GraphiteHigh,
            focusedContainerColor = GraphiteRaised, unfocusedContainerColor = GraphiteRaised,
        ),
    )
}
