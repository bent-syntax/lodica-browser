package be.syntaxya.lodica.engine

import android.content.Context
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** A device linked to the same relay account. [online] comes from the last registry heartbeat. */
data class LinkedDevice(val id: String, val name: String, val platform: String, val online: Boolean)

/**
 * Device registry for remote control. Every app announces a stable id, its name and platform, then lists the other devices so
 * the user can pick which PC or phone a remote-control panel should talk to. Only metadata is stored, never screen frames.
 */
object LinkedDevices {
    private const val PREF = "remoteDevices"
    private const val HEARTBEAT_MS = 30_000L
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    // Settings renders the device list in Composition before its LaunchedEffect can call init().
    // Keep this nullable so name()/id() can render a safe placeholder until init has run.
    private val prefs get() = app?.getSharedPreferences(PREF, Context.MODE_PRIVATE)
    private var app: Context? = null
    private var job: kotlinx.coroutines.Job? = null

    val devices = mutableStateListOf<LinkedDevice>()
    val revision = mutableStateOf(0)
    private var idCache = ""

    fun init(ctx: Context) {
        val base = ctx.applicationContext ?: ctx
        if (app == null) app = base
        if (job?.isActive == true) return
        id()
        refresh()
        job = scope.launch {
            while (isActive) {
                delay(HEARTBEAT_MS)
                refresh()
            }
        }
    }

    /** Stable per-install id, kept even when the relay link changes. */
    fun id(): String {
        if (idCache.isNotEmpty()) return idCache
        val p = prefs ?: return ""
        val saved = p.getString("id", null)
        idCache = if (saved.isNullOrBlank()) UUID.randomUUID().toString().replace("-", "") else saved
        if (saved.isNullOrBlank()) p.edit().putString("id", idCache).apply()
        return idCache
    }

    fun name(): String {
        val context = app ?: return "Phone"
        return Room.deviceName(context).take(80).ifBlank { "Phone" }
    }

    /** Remembered target id for one platform ("desktop" for PC screen, "android" for phone screen). */
    fun target(platform: String): String {
        val p = prefs ?: return ""
        val key = if (platform == "desktop") "targetDesktop" else "targetAndroid"
        val saved = p.getString(key, null).orEmpty()
        val pool = devices.filter { it.platform == platform && it.id != id() }
        if (saved.isNotEmpty() && pool.any { it.id == saved }) return saved
        return (pool.firstOrNull { it.online } ?: pool.firstOrNull())?.id.orEmpty()
    }

    fun setTarget(platform: String, deviceId: String) {
        val p = prefs ?: return
        val key = if (platform == "desktop") "targetDesktop" else "targetAndroid"
        p.edit().putString(key, deviceId).apply()
        revision.value++
    }

    /** Registers this phone and refreshes the list. Safe to call from an IO coroutine. */
    fun refresh() {
        if (app == null || !Relay.available) return
        val me = JSONObject()
            .put("id", id())
            .put("name", name())
            .put("platform", "android")
        runCatching { Relay.request("POST", "/api/devices", me.toString().toByteArray(), "application/json") }
        val (code, body) = runCatching { Relay.request("GET", "/api/devices") }.getOrNull() ?: return
        if (code !in 200..299) return
        val arr = runCatching { JSONObject(body).optJSONArray("devices") ?: JSONArray() }.getOrDefault(JSONArray())
        val next = ArrayList<LinkedDevice>()
        for (i in 0 until arr.length()) {
            val d = arr.optJSONObject(i) ?: continue
            val did = d.optString("id")
            if (did.isEmpty() || did == id()) continue
            next.add(LinkedDevice(did, d.optString("name").ifBlank { "Device" },
                if (d.optString("platform") == "desktop") "desktop" else "android", d.optBoolean("online")))
        }
        if (next.map { "${it.id}:${it.name}:${it.online}" } != devices.map { "${it.id}:${it.name}:${it.online}" }) {
            devices.clear()
            devices.addAll(next)
            revision.value++
        }
    }
}
