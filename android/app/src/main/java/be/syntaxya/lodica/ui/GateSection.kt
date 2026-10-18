package be.syntaxya.lodica.ui

import androidx.compose.runtime.Composable
import be.syntaxya.lodica.engine.Relay
import be.syntaxya.lodica.tabs.TabManager

/** Opens the relay's device gate page. The server owner approves the code there with `sudo lodica-approve`. */
@Composable
fun GateSection() {
    if (!Relay.available) return
    LinkRow("Authenticate this browser") { Ui.screen = Screen.Browser; TabManager.open(Relay.API + "/gate") }
}
