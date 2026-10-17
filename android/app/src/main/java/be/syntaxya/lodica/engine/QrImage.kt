package be.syntaxya.lodica.engine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader

/** Reads the text of a QR code out of an image (for example a screenshot of an export code). */
object QrImage {
    fun decode(ctx: Context, uri: Uri): String? = runCatching {
        // Large screenshots are sampled down first so they fit in memory.
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2400) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val bmp = ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null
        decode(bmp) ?: decode(Bitmap.createScaledBitmap(bmp, bmp.width / 2, bmp.height / 2, true))
    }.getOrNull()

    private fun decode(bmp: Bitmap): String? {
        val px = IntArray(bmp.width * bmp.height)
        bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
        val bin = BinaryBitmap(HybridBinarizer(RGBLuminanceSource(bmp.width, bmp.height, px)))
        return runCatching { QRCodeReader().decode(bin, mapOf(DecodeHintType.TRY_HARDER to true)).text }.getOrNull()
    }
}
