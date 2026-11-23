package be.syntaxya.lodica.ui

import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import be.syntaxya.lodica.engine.QrImage
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.theme.Amber
import be.syntaxya.lodica.ui.theme.GraphiteRaised
import be.syntaxya.lodica.ui.theme.Mist
import be.syntaxya.lodica.ui.theme.Muted

/** Permanent, client-side QR generator: the text never leaves the device. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrSheet() {
    val ctx = LocalContext.current
    var text by remember { mutableStateOf(TabManager.current?.url ?: "") }
    val bitmap = remember(text) { QrImage.encode(text, 512) }
    ModalBottomSheet(
        onDismissRequest = { Ui.qrOpen = false },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = GraphiteRaised,
        contentColor = Mist,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text("Text or link") })
            if (bitmap != null) Image(bitmap.asImageBitmap(), "QR code", modifier = Modifier.size(220.dp).padding(12.dp))
            else Text("Type up to 2000 characters", color = Muted)
            Row {
                Button(onClick = { if (text.isNotBlank()) { copy(ctx, text); Toast.makeText(ctx, "Copied", Toast.LENGTH_SHORT).show() } }) { Text("Copy", color = Amber) }
            }
        }
    }
}
