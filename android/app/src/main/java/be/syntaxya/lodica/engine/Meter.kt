package be.syntaxya.lodica.engine

import android.content.Context
import androidx.compose.runtime.mutableIntStateOf

/** Per-site data use and requests skipped by Lite mode, kept on the phone only. */
object Meter {
    data class Site(val host: String, val bytes: Long, val saved: Int)

    private lateinit var app: Context

    /** Bumped on every change so Compose screens re-read [sites]. */
    val version = mutableIntStateOf(0)

    fun init(ctx: Context) { app = ctx.applicationContext }

    private val sp get() = app.getSharedPreferences("data", Context.MODE_PRIVATE)

    private fun key(host: String) = host.removePrefix("www.")

    fun used(host: String, bytes: Long) {
        if (host.isBlank() || bytes <= 0) return
        val k = "b:" + key(host)
        sp.edit().putLong(k, sp.getLong(k, 0) + bytes).apply()
        version.intValue++
    }

    fun saved(host: String, count: Int) {
        if (host.isBlank() || count <= 0) return
        val k = "s:" + key(host)
        sp.edit().putInt(k, sp.getInt(k, 0) + count).apply()
        version.intValue++
    }

    fun sites(): List<Site> {
        val all = sp.all
        val hosts = all.keys.mapNotNull { it.substringAfter(':', "").ifEmpty { null } }.toSet()
        return hosts.map { h -> Site(h, (all["b:$h"] as? Long) ?: 0L, (all["s:$h"] as? Int) ?: 0) }
            .sortedByDescending { it.bytes }
    }

    fun clear() { sp.edit().clear().apply(); version.intValue++ }
}
