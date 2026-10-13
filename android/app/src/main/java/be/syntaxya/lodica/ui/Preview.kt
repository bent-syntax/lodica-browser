package be.syntaxya.lodica.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.GeckoView
import be.syntaxya.lodica.engine.Engine
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted
import java.util.UUID

/**
 * Throwaway preview of a link. The session is private and gets its own cookie jar (contextId), and it
 * is never handed to Helper, History or TabManager, so the page sees no logins, fills, or saved data.
 * Everything it stored is dropped when the window closes.
 */
@Composable
fun PreviewSheet(url: String) {
    val ctx = LocalContext.current
    var title by remember(url) { mutableStateOf("") }
    var host by remember(url) { mutableStateOf(hostOf(url)) }
    var current by remember(url) { mutableStateOf(url) }
    var progress by remember(url) { mutableIntStateOf(0) }
    val session = remember(url) {
        GeckoSession(
            GeckoSessionSettings.Builder()
                .usePrivateMode(true)
                .contextId("preview-" + UUID.randomUUID())
                .useTrackingProtection(true)
                .build()
        ).apply {
            contentDelegate = object : GeckoSession.ContentDelegate {
                override fun onTitleChange(session: GeckoSession, t: String?) { title = t.orEmpty() }
            }
            progressDelegate = object : GeckoSession.ProgressDelegate {
                override fun onProgressChange(session: GeckoSession, p: Int) { progress = p }
                override fun onPageStop(session: GeckoSession, success: Boolean) { progress = 100 }
            }
            navigationDelegate = object : GeckoSession.NavigationDelegate {
                override fun onLocationChange(
                    session: GeckoSession, u: String?,
                    perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>, user: Boolean,
                ) { if (u != null) { current = u; host = hostOf(u) } }
            }
            open(Engine.runtime(ctx))
            loadUri(url)
        }
    }
    DisposableEffect(session) { onDispose { session.close() } }

    Dialog(
        onDismissRequest = { Ui.preview = null },
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(Modifier.fillMaxSize().background(Graphite.copy(alpha = 0.6f)).systemBarsPadding().padding(12.dp)) {
            Column(Modifier.fillMaxSize().clip(RoundedCornerShape(18.dp)).background(GraphiteRaised)) {
                Row(Modifier.fillMaxWidth().padding(start = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Visibility, null, tint = Amber, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(title.ifBlank { host }, color = Mist, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("Preview · $host", color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    TextButton(onClick = { Ui.preview = null; Ui.screen = Screen.Browser; TabManager.open(current) }) {
                        Text("Open in tab", color = Amber, fontSize = 13.sp)
                    }
                    IconButton(onClick = { Ui.preview = null }) {
                        Icon(Icons.Rounded.Close, "Close preview", tint = Muted, modifier = Modifier.size(18.dp))
                    }
                }
                if (progress in 1..99) {
                    LinearProgressIndicator(
                        progress = { progress / 100f }, color = Amber, trackColor = GraphiteRaised,
                        modifier = Modifier.fillMaxWidth().height(2.dp),
                    )
                } else Spacer(Modifier.height(2.dp))
                val bg = Graphite.toArgb()
                AndroidView(
                    factory = { c ->
                        GeckoView(c).apply {
                            // A second SurfaceView would fight the main one for z-order; draw into a texture instead.
                            setViewBackend(GeckoView.BACKEND_TEXTURE_VIEW)
                            coverUntilFirstPaint(bg)
                            setSession(session)
                        }
                    },
                    onRelease = { it.releaseSession() },
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

private fun hostOf(url: String) =
    runCatching { android.net.Uri.parse(url).host.orEmpty() }.getOrDefault("").removePrefix("www.").ifBlank { url }
