package be.syntaxya.lodica.tabs

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File

/** Tab card previews kept as small JPEGs so cards are not blank after a restart or an idle unload. Private tabs are never written. */
object Thumbs {
    private lateinit var dir: File

    /** Kept in the files folder: Android may clear the cache folder at any time. */
    fun init(ctx: Context) { dir = File(ctx.filesDir, "thumbs").apply { mkdirs() } }

    private fun file(id: String) = File(dir, "$id.jpg")

    fun save(tab: Tab, b: Bitmap) {
        if (tab.private || !::dir.isInitialized) return
        Thread {
            runCatching { file(tab.id).outputStream().use { b.compress(Bitmap.CompressFormat.JPEG, 70, it) } }
        }.start()
    }

    /** Fills thumbnails of restored tabs off the main thread, then drops files of tabs that no longer exist. */
    fun restore(tabs: List<Tab>, keep: Set<String>) {
        if (!::dir.isInitialized) return
        Thread {
            for (t in tabs) {
                if (t.private || t.thumbnail != null) continue
                val f = file(t.id)
                if (f.exists()) runCatching { BitmapFactory.decodeFile(f.path) }.getOrNull()?.let { if (t.thumbnail == null) t.thumbnail = it }
            }
            dir.listFiles()?.forEach { if (it.nameWithoutExtension !in keep) it.delete() }
        }.start()
    }
}
