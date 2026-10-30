package be.syntaxya.lodica.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.AiAgent
import be.syntaxya.lodica.engine.Chats
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import be.syntaxya.lodica.ui.theme.OnAmber

private val Danger = Color(0xFFF43F5E)

/**
 * The AI browser agent. Docked on the right with a phone ratio so the page stays visible beside it.
 * Minimizing shrinks it to a chip and the run goes on. The full-screen button opens the AI chats screen.
 */
@Composable
fun AgentPanel() {
    if (!AiAgent.open) return
    if (AiAgent.minimized) {
        val pulse = rememberInfiniteTransition(label = "agent").animateFloat(0.4f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "a")
        Box(Modifier.fillMaxSize().padding(end = 8.dp, bottom = 96.dp), contentAlignment = Alignment.BottomEnd) {
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(GraphiteRaised).border(BorderStroke(1.dp, Amber), RoundedCornerShape(50))
                    .clickable { AiAgent.minimized = false }.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Rounded.AutoAwesome, null, tint = Amber, modifier = Modifier.size(20.dp).alpha(if (AiAgent.running) pulse.value else 1f))
                Text(if (AiAgent.running) "AI working" else "AI", color = Mist, fontSize = 13.sp)
            }
        }
        return
    }
    var older by remember { mutableStateOf(false) }
    var viewing by remember { mutableStateOf<String?>(null) }
    var input by remember { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(AiAgent.steps.size) { if (AiAgent.steps.isNotEmpty()) list.animateScrollToItem(AiAgent.steps.size - 1) }
    Box(Modifier.fillMaxSize().padding(top = 48.dp, bottom = 88.dp, end = 8.dp), contentAlignment = Alignment.CenterEnd) {
        Column(
            Modifier.fillMaxHeight().aspectRatio(9f / 16f).clip(RoundedCornerShape(20.dp)).background(GraphiteRaised)
                .border(BorderStroke(1.dp, if (AiAgent.running) Amber else Muted.copy(alpha = 0.3f)), RoundedCornerShape(20.dp)),
        ) {
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                if (older) IconButton(onClick = { if (viewing != null) viewing = null else older = false }) { Icon(Icons.Rounded.ArrowBack, "Back", tint = Mist) }
                else Icon(Icons.Rounded.AutoAwesome, null, tint = Amber, modifier = Modifier.size(20.dp))
                Text(if (older) "Older chats" else "AI browser", color = Mist, fontSize = 15.sp, modifier = Modifier.weight(1f).padding(start = 8.dp))
                if (!older) IconButton(onClick = { older = true }) { Icon(Icons.Rounded.History, "Older chats", tint = Muted) }
                IconButton(onClick = { AiAgent.open = false; Ui.screen = Screen.Chats; Ui.returnTo = Screen.Browser }) { Icon(Icons.Rounded.Fullscreen, "Full screen", tint = Muted) }
                IconButton(onClick = { AiAgent.minimized = true }) { Icon(Icons.Rounded.Remove, "Minimize", tint = Muted) }
                IconButton(onClick = { AiAgent.stop(); AiAgent.open = false }) { Icon(Icons.Rounded.Close, "Close", tint = Muted) }
            }
            if (older) {
                val chat = Chats.get(viewing)
                LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (chat == null) {
                        if (Chats.list.isEmpty()) item { Text("No chats yet.", color = Muted, fontSize = 13.sp) }
                        items(Chats.list, key = { it.id }) { c ->
                            Text(c.title.ifBlank { "Chat" }, color = Mist, fontSize = 13.sp, maxLines = 2,
                                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Graphite).clickable { viewing = c.id }.padding(12.dp))
                        }
                    } else items(chat.messages) { m ->
                        Bubble(m.text, m.role == "user")
                    }
                }
            } else {
                LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp), state = list, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (AiAgent.steps.isEmpty()) item { Text("Tell the AI what to do in the browser, for example: open the planner on Smartschool.", color = Muted, fontSize = 13.sp) }
                    items(AiAgent.steps.toList()) { s ->
                        when (s.kind) {
                            "ai" -> Bubble(s.text, false)
                            "act" -> Text("› ${s.text}", color = Amber, fontSize = 12.sp)
                            else -> Text(s.text, color = Muted, fontSize = 12.sp)
                        }
                    }
                }
                AiAgent.confirm?.let { label ->
                    Column(Modifier.fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(12.dp)).background(Graphite).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("The AI wants to click \"$label\". Allow?", color = Mist, fontSize = 13.sp)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Allow", color = OnAmber, fontSize = 13.sp, modifier = Modifier.clip(RoundedCornerShape(50)).background(Amber).clickable { AiAgent.answer(true) }.padding(horizontal = 16.dp, vertical = 8.dp))
                            Text("Stop", color = Danger, fontSize = 13.sp, modifier = Modifier.clip(RoundedCornerShape(50)).border(BorderStroke(1.dp, Danger), RoundedCornerShape(50)).clickable { AiAgent.answer(false) }.padding(horizontal = 16.dp, vertical = 8.dp))
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f).clip(RoundedCornerShape(50)).background(Graphite).padding(horizontal = 16.dp, vertical = 12.dp)) {
                        if (input.isEmpty()) Text(if (AiAgent.running) "Working..." else "What should I do?", color = Muted, fontSize = 13.sp)
                        BasicTextField(input, { input = it }, enabled = !AiAgent.running, singleLine = true,
                            textStyle = TextStyle(color = Mist, fontSize = 13.sp), cursorBrush = SolidColor(Amber), modifier = Modifier.fillMaxWidth())
                    }
                    IconButton(
                        onClick = { if (AiAgent.running) AiAgent.stop() else { AiAgent.start(input); input = "" } },
                        modifier = Modifier.size(44.dp).clip(CircleShape).background(if (AiAgent.running) Danger else Amber),
                    ) { Icon(if (AiAgent.running) Icons.Rounded.Stop else Icons.Rounded.Send, if (AiAgent.running) "Stop" else "Send", tint = OnAmber) }
                }
            }
        }
    }
}

@Composable
private fun Bubble(text: String, mine: Boolean) {
    Box(Modifier.fillMaxWidth(), contentAlignment = if (mine) Alignment.CenterEnd else Alignment.CenterStart) {
        Text(text, color = if (mine) OnAmber else Mist, fontSize = 13.sp,
            modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(if (mine) Amber else Graphite).padding(horizontal = 12.dp, vertical = 8.dp))
    }
}
