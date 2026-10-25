package be.syntaxya.lodica.ui

import android.text.format.DateUtils
import android.text.format.Formatter
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.rounded.InsertDriveFile
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.IconTile
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.syntaxya.lodica.engine.Dl
import be.syntaxya.lodica.engine.Downloads
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.Coral
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

/** Files being downloaded now and the ones saved earlier; tap a finished one to open it. */
@Composable
fun DownloadsScreen() {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { Downloads.load(ctx) }
    val items = Downloads.items
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { TopBar("Downloads") { Ui.back() } }
            if (items.any { it.status != Dl.ACTIVE }) TextButton(onClick = { Downloads.clearFinished(ctx) }) {
                Text("Clear list", color = Coral)
            }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
            if (items.isEmpty()) item {
                Text("Nothing downloaded yet", color = Muted, fontSize = 14.sp, modifier = Modifier.padding(32.dp))
            }
            items(items, key = { it.id }) { d ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(GraphiteRaised)
                        .clickable(enabled = d.status == Dl.DONE) { Downloads.open(ctx, d) }
                        .padding(start = 12.dp, top = 12.dp, bottom = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconTile(Icons.Rounded.InsertDriveFile, 44, if (d.status == Dl.ACTIVE) Amber else null)
                    androidx.compose.foundation.layout.Spacer(Modifier.size(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(d.name, color = Mist, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        when (d.status) {
                            Dl.ACTIVE -> {
                                if (d.total > 0) LinearProgressIndicator(
                                    progress = { (d.received.toFloat() / d.total).coerceIn(0f, 1f) },
                                    color = Amber, modifier = Modifier.fillMaxWidth().padding(top = 6.dp, end = 12.dp),
                                ) else LinearProgressIndicator(color = Amber, modifier = Modifier.fillMaxWidth().padding(top = 6.dp, end = 12.dp))
                                val got = Formatter.formatShortFileSize(ctx, d.received)
                                Text(
                                    if (d.total > 0) "$got of ${Formatter.formatShortFileSize(ctx, d.total)}" else "$got downloaded",
                                    color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 2.dp),
                                )
                            }
                            Dl.DONE -> Text(
                                (if (d.received > 0) Formatter.formatShortFileSize(ctx, d.received) + " · " else "") + DateUtils.getRelativeTimeSpanString(d.at),
                                color = Muted, fontSize = 11.sp,
                            )
                            else -> Text("Failed · " + DateUtils.getRelativeTimeSpanString(d.at), color = Coral, fontSize = 11.sp)
                        }
                    }
                    if (d.status != Dl.ACTIVE) IconButton(onClick = { Downloads.remove(ctx, d) }) {
                        Icon(Icons.Rounded.Close, "Remove from list", tint = Muted, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}
