package be.syntaxya.lodica.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.theme.Graphite
import java.io.File

/** Start page background: built-in gradients, a custom image copied into app storage, or a solid colour. */
object StartBg {
    class Grad(val key: String, val label: String, val colors: List<Long>, val radial: Boolean = false)

    val Gradients = listOf(
        Grad("dusk", "Dusk", listOf(0xFF1E1B4B, 0xFF7C3AED, 0xFFF472B6)),
        Grad("aurora", "Aurora", listOf(0xFF022C22, 0xFF0F766E, 0xFF38BDF8)),
        Grad("ember", "Ember", listOf(0xFF1C0A0A, 0xFFB91C1C, 0xFFFBBF24)),
        Grad("ocean", "Ocean", listOf(0xFF0B1B3A, 0xFF1D4ED8, 0xFF67E8F9)),
        Grad("forest", "Forest", listOf(0xFF0F1F14, 0xFF166534, 0xFFA3E635)),
        Grad("glow", "Glow", listOf(0xFF6D28D9, 0xFF1E1B4B, 0xFF0B0B14), radial = true),
        Grad("horizon", "Horizon", listOf(0xFF0B0B14, 0xFF1E3A8A, 0xFFFB923C), radial = true),
        Grad("mist", "Mist", listOf(0xFFE0E7FF, 0xFFC7D2FE, 0xFFFBCFE8)),
    )

    /** Solid colour swatches offered in settings. */
    val Colors = listOf(
        "#111827", "#000000", "#1E293B", "#14532D", "#4C1D95", "#7F1D1D", "#78350F", "#F8FAFC",
    )

    fun grad(key: String): Grad = Gradients.firstOrNull { it.key == key } ?: Gradients[0]

    fun brush(g: Grad): Brush {
        val c = g.colors.map { Color(it) }
        return if (g.radial) Brush.radialGradient(c, radius = 1400f) else Brush.verticalGradient(c)
    }

    fun parseColor(hex: String): Color =
        runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Graphite)

    fun imageFile(ctx: Context) = File(ctx.filesDir, "startbg.jpg")

    /** Copies the picked image into app storage, scaled down so it decodes quickly. Returns false on failure. */
    suspend fun importImage(ctx: Context, uri: Uri): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            ctx.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2000) sample *= 2
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            val bmp = ctx.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, opts) }!!
            imageFile(ctx).outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 88, it) }
            bmp.recycle()
            true
        }.getOrDefault(false)
    }

    fun removeImage(ctx: Context) {
        imageFile(ctx).delete()
    }
}

@Composable
fun StartBackdrop(modifier: Modifier = Modifier) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val kind = Prefs.startBg
    val blur = Prefs.startBlur
    val native = Build.VERSION.SDK_INT >= 31
    val bitmap by produceState<Bitmap?>(null, kind, Prefs.startImageRev, if (native) 0f else blur) {
        value = if (kind != "image") null else withContext(Dispatchers.IO) {
            runCatching {
                val src = BitmapFactory.decodeFile(StartBg.imageFile(ctx).absolutePath) ?: return@runCatching null
                // Before Android 12 there is no render blur, so fake it by scaling down and letting the draw scale back up.
                if (!native && blur > 0f) {
                    val f = 1f + blur / 3f
                    Bitmap.createScaledBitmap(src, (src.width / f).toInt().coerceAtLeast(8), (src.height / f).toInt().coerceAtLeast(8), true)
                } else src
            }.getOrNull()
        }
    }
    Box(modifier.clipToBounds()) {
        val layer = Modifier.fillMaxSize().let { if (native && blur > 0f) it.blur(blur.dp) else it }
        when (kind) {
            "gradient" -> Box(layer.background(StartBg.brush(StartBg.grad(Prefs.startBgValue))))
            "color" -> Box(layer.background(StartBg.parseColor(Prefs.startBgValue)))
            "image" -> {
                val b = bitmap
                if (b != null) Image(b.asImageBitmap(), null, layer, contentScale = ContentScale.Crop)
                else Box(layer.background(Graphite))
            }
            else -> Box(layer.background(Graphite))
        }
        if (kind != "none" && Prefs.startDim > 0f) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = Prefs.startDim)))
        }
    }
}
