package be.syntaxya.lodica.engine

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import be.syntaxya.lodica.tabs.TabManager
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

@Serializable
private data class PcTab(val title: String, val url: String, val private: Boolean = false)

/** A tab open on the other device. */
data class RemoteTab(val title: String, val url: String)

@Serializable
private data class PcMsg(val role: String = "", val text: String = "", val t: Long = 0)

@Serializable
private data class PcChat(val id: String = "", val title: String = "", val updated: Long = 0, val messages: List<PcMsg> = emptyList(), val deleted: Boolean = false)

@Serializable
private data class PcHist(val url: String = "", val title: String = "", val time: Long = 0, val visits: Int = 1)

@Serializable
private data class PcList(val updated: Long, val tabs: List<PcTab>, val chats: List<PcChat> = emptyList(), val history: List<PcHist>? = null, val data: PcData? = null)

@Serializable
private data class PcShortcut(val url: String = "", val title: String = "")

@Serializable
private data class PcSites(val trusted: List<String> = emptyList(), val compat: List<String> = emptyList(), val direct: List<String> = emptyList(), val noDummy: List<String> = emptyList())

@Serializable
private data class PcPass(val origin: String = "", val user: String = "", val pass: String = "", val saved: Long = 0)

@Serializable
private data class PcTotp(val id: String = "", val label: String = "", val issuer: String = "", val name: String = "", val secret: String = "", val digits: Int = 6, val period: Int = 30, val algo: String = "SHA1", val host: String = "")

@Serializable
private data class PcSecret(val passwords: List<PcPass>? = null, val totp: List<PcTotp>? = null)

@Serializable
private data class PcData(
    val chatName: String? = null,
    val shortcuts: List<PcShortcut>? = null,
    val settings: Map<String, JsonElement>? = null,
    val settingsAt: Long = 0,
    val sites: PcSites? = null,
    val hidden: List<String>? = null,
    val bluetooth: List<String>? = null,
    val sealed: String? = null,
    val sealedKey: String? = null,
    /** Four digits naming the sender's link key, sent always so a mismatch shows even with nothing sealed. Not secret. */
    val keyId: String? = null,
)

@Serializable
private data class PcKq(val session: String = "", val type: String = "", val pub: String = "", val t: Long = 0)

@Serializable
private data class PcKa(val session: String = "", val type: String = "", val pub: String = "", val wrap: String = "", val t: Long = 0)

/** One step of the key exchange, shown in Settings. */
class LinkStep(val step: String, val code: String = "", val session: String = "", val fp: String = "")

@Serializable
private data class PcCmd(val at: Long = 0, val type: String = "", val url: String = "")

@Serializable
private data class PcCmds(val cmds: List<PcCmd> = emptyList())

/**
 * "Tabs on PC": an end-to-end encrypted copy of the open (non-private) tabs at
 * lodica.<domain>/t/<id>#<key>. The key only ever leaves the phone inside that link's
 * fragment, which browsers never send to the server.
 *
 * Two-way sync: the link doubles as the pairing code. One 48-byte secret (16-byte id seed plus
 * 32-byte AES key) is shared by both devices. The device that made the secret writes the blob
 * under the base id and reads the blob under the derived id; a device that pasted the link does
 * the opposite. Each blob has a single writer, so there are no write races.
 */
object PcTabs {
    private const val TAG = "LodicaPcTabs"
    private const val KEY_ALIAS = "lodica_pctabs"
    private const val DEBOUNCE_MS = 3_000L
    private const val MAX_BODY = 512 * 1024
    private const val LOCAL_MS = 4_000L
    private const val KEEPALIVE_MS = 12L * 3600 * 1000
    /** On for a fresh link until switched off. History and Bluetooth stay off. */
    private val DEFAULT_SHARE = setOf("tabs", "settings", "shortcuts", "sites", "passwords", "totp")
    private val SHARE_IDS = listOf("tabs", "history", "totp", "passwords", "bluetooth", "shortcuts", "settings", "sites")
    private val LINK = Regex("([A-Za-z0-9_-]{22})#([A-Za-z0-9_-]{43})")

    private lateinit var sp: SharedPreferences
    private val main = Handler(Looper.getMainLooper())
    private val rnd = SecureRandom()
    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = true }
    private val io = Mutex()

    var enabled by mutableStateOf(false); private set
    var link by mutableStateOf<String?>(null); private set
    var status by mutableStateOf<String?>(null); private set
    /** Tabs last read from the other device. */
    var remote by mutableStateOf<List<RemoteTab>>(emptyList()); private set
    var remoteUpdated by mutableStateOf(0L); private set
    /** Share browsing history with the linked device. */
    var shareHistory by mutableStateOf(false); private set
    /** What this device sends to and takes from the linked device. */
    var linkShare by mutableStateOf<Map<String, Boolean>>(emptyMap()); private set
    /** The other device sent passwords or keys this device cannot open yet. */
    var keyMissing by mutableStateOf(false); private set
    /** This device has a link key, but the other device sealed its data under another one. */
    var keyDiffers by mutableStateOf(false); private set
    var otherKeyId by mutableStateOf<String?>(null); private set
    /** Names of the other device's Bluetooth devices. */
    var remoteBluetooth by mutableStateOf<List<String>>(emptyList()); private set
    /** Latest step of the key exchange, or null when none runs. */
    var linkStep by mutableStateOf<LinkStep?>(null); private set
    /** Let the linked desktop open, close, focus and reload tabs here. */
    var allowControl by mutableStateOf(false); private set

    private var id: String? = null
    private var key: ByteArray? = null
    private var peer = false
    private var lastSent: String? = null
    private var lastKeep = 0L
    private var seenSealed = ""
    private var exBusy = false
    private var ex: Exchange? = null
    private val exTick = object : Runnable {
        override fun run() {
            val e = ex ?: return
            if (!enabled || System.currentTimeMillis() > e.until) {
                if (enabled && ex === e && linkStep?.step != "confirm") linkStep = LinkStep("expired")
                ex = null
                return
            }
            exchange(e)
            main.postDelayed(this, 2_000)
        }
    }
    private val tick = Runnable { upload() }
    private var pollRound = 0
    private val pollTick = object : Runnable {
        override fun run() {
            if (!enabled) return
            if (System.currentTimeMillis() - lastKeep > KEEPALIVE_MS) lastSent = null
            upload()
            if (pollRound++ % 8 == 0) { refresh(); checkJoin() }
            main.postDelayed(this, LOCAL_MS)
        }
    }
    private var watching = false

    /** Long poll the other device's blob so a change shows within a second or two. */
    private fun watch() {
        if (watching) return
        watching = true
        Relay.scope.launch {
            var since = 0L
            var bad = 0
            while (enabled) {
                val rid = readId()
                if (rid == null) { kotlinx.coroutines.delay(5_000); continue }
                val m = runCatching { pollBlob(rid, since) }.getOrNull()
                if (m == null) { bad = minOf(bad + 1, 6); kotlinx.coroutines.delay(2_000L * bad); continue }
                bad = 0
                if (m < 0) { since = 0; kotlinx.coroutines.delay(5_000); continue }
                if (m > since) { val fresh = since != 0L; since = m; if (fresh) withContext(Dispatchers.Main) { refresh() } }
            }
            watching = false
        }
    }

    /** Returns the blob's mtime, the same [since] on 304, or -1 when it does not exist. */
    private fun pollBlob(rid: String, since: Long): Long {
        val c = java.net.URL(Relay.API + "/api/tabs/$rid?wait=25&since=$since").openConnection() as java.net.HttpURLConnection
        try {
            c.connectTimeout = 10_000
            c.readTimeout = 40_000
            c.useCaches = false
            c.setRequestProperty("Authorization", "Bearer ${Relay.token}")
            return when (c.responseCode) {
                200 -> { c.inputStream.use { it.readBytes() }; c.getHeaderField("X-Mtime")?.toLongOrNull() ?: run { Thread.sleep(5_000); since } }
                304 -> since
                404 -> -1L
                else -> throw java.io.IOException("status")
            }
        } finally { c.disconnect() }
    }

    private fun startPoll() {
        main.removeCallbacks(pollTick)
        main.post(pollTick)
        watch()
    }

    fun init(ctx: Context) {
        if (::sp.isInitialized) return
        sp = ctx.applicationContext.getSharedPreferences("pctabs", Context.MODE_PRIVATE)
        enabled = Relay.available && sp.getBoolean("enabled", false)
        shareHistory = sp.getBoolean("shareHistory", false)
        if (shareHistory && !sp.contains("share.history")) sp.edit().putBoolean("share.history", true).putBoolean("shareHistory", false).apply()
        shareHistory = sp.getBoolean("share.history", false)
        themeFrom = sp.getString("themeFrom", "newest").takeIf { it in listOf("newest", "this", "other") } ?: "newest"
        // Before 1.14.17 passwords and authenticator keys were off by default, so an old "off" was rarely a choice. Reset them once.
        if (!sp.getBoolean("shareReset17", false)) sp.edit().remove("share.passwords").remove("share.totp").putBoolean("shareReset17", true).apply()
        linkShare = SHARE_IDS.associateWith { sp.getBoolean("share.$it", it in DEFAULT_SHARE) }
        LinkKey.init()
        allowControl = sp.getBoolean("allowControl", false)
        if (enabled) runCatching { load() }.onFailure { Log.w(TAG, "secrets unreadable", it); enabled = false }
        if (enabled) startPoll()
    }

    fun toggle(on: Boolean) {
        if (!Relay.available) return
        enabled = on
        sp.edit().putBoolean("enabled", on).apply()
        if (on) {
            runCatching { if (!load()) generate() }.onFailure { Log.w(TAG, "keystore", it); status = "Keystore unavailable"; enabled = false; return }
            lastSent = null
            upload()
            startPoll()
        } else {
            main.removeCallbacks(tick)
            main.removeCallbacks(pollTick)
            val old = writeId()
            lastSent = null
            remote = emptyList()
            remoteUpdated = 0L
            if (old != null) Relay.scope.launch { io.withLock { remove(old) } }
        }
    }

    fun updateShare(id: String, on: Boolean) {
        if (id !in SHARE_IDS) return
        linkShare = linkShare + (id to on)
        if (id == "history") shareHistory = on
        sp.edit().putBoolean("share.$id", on).apply()
        lastSent = null
        if (enabled) { upload(); if (on) refresh() }
    }

    fun updateAllowControl(on: Boolean) {
        allowControl = on
        sp.edit().putBoolean("allowControl", on).apply()
        // Ignore anything the desktop queued while control was off.
        if (on) sp.edit().putLong("cmdAt", System.currentTimeMillis()).apply()
    }

    /** New id and key. The old page is deleted first so the old link stops working. */
    fun reset() {
        if (!Relay.available) return
        val olds = listOfNotNull(id, key?.let { derivedId(it) })
        main.removeCallbacks(tick)
        lastSent = null
        remote = emptyList()
        remoteUpdated = 0L
        runCatching { generate() }.onFailure { status = "Keystore unavailable"; return }
        Relay.scope.launch {
            io.withLock { olds.forEach { remove(it) } }
            withContext(Dispatchers.Main) { if (enabled) upload() }
        }
    }

    /** Tab list changed: upload after things settle. */
    fun changed() {
        if (!enabled) return
        main.removeCallbacks(tick)
        main.postDelayed(tick, DEBOUNCE_MS)
    }

    /** App going to background: send now. */
    fun flush() {
        if (!enabled) return
        main.removeCallbacks(tick)
        upload()
    }

    // ---- pairing and download ---------------------------------------------------------------

    private fun derivedId(k: ByteArray): String {
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(k, "HmacSHA256")) }
        return b64url(mac.doFinal("pc".toByteArray()).copyOfRange(0, 16))
    }

    /** Blob this device writes. */
    private fun writeId(): String? {
        val k = key ?: return null
        return if (peer) derivedId(k) else id
    }

    /** Blob this device reads. */
    private fun readId(): String? {
        val k = key ?: return null
        return if (peer) id else derivedId(k)
    }

    /** Adopts the secret from a link made on another device. False when the text holds no valid link. */
    fun pair(text: String): Boolean {
        if (!Relay.available || !enabled) return false
        val m = LINK.find(text) ?: return false
        val idBytes = runCatching { Base64.decode(m.groupValues[1], Base64.URL_SAFE) }.getOrNull() ?: return false
        val keyBytes = runCatching { Base64.decode(m.groupValues[2], Base64.URL_SAFE) }.getOrNull() ?: return false
        if (idBytes.size != 16 || keyBytes.size != 32) return false
        val old = writeId()
        main.removeCallbacks(tick)
        runCatching { store(idBytes + keyBytes, true) }.onFailure { Log.w(TAG, "keystore", it); status = "Keystore unavailable"; return false }
        remote = emptyList()
        remoteUpdated = 0L
        lastSent = null
        Relay.scope.launch { io.withLock { if (old != null) remove(old) } }
        upload()
        refresh()
        askKey()
        return true
    }

    /** Asks the relay for a short code that hands this device's link to another device. Null on failure. */
    fun makeCode(onDone: (String?) -> Unit) {
        val l = link
        if (!Relay.available || !enabled || l == null) { onDone(null); return }
        Relay.scope.launch {
            val code = runCatching {
                val body = """{"link":"$l"}""".toByteArray()
                val (st, txt) = Relay.request("POST", "/api/pair", body, "application/json")
                if (st == 200) Regex("\"code\"\\s*:\\s*\"([A-Za-z0-9]+)\"").find(txt)?.groupValues?.get(1) else null
            }.onFailure { Log.w(TAG, "pair code failed", it) }.getOrNull()
            // A join request already on the relay is old: only one made after this code counts.
            if (code != null) key?.let { k -> readKq(k)?.let { markKq(it.t) } }
            withContext(Dispatchers.Main) {
                if (code != null) {
                    // The device that takes the code becomes a peer, so this one must be the owner. A device
                    // that was a peer of an older link would otherwise write and read the same blobs as the new one.
                    becomeOwner()
                    startEx(Exchange("origin", "", null, code, 0L, System.currentTimeMillis() + 10 * 60_000L))
                }
                onDone(code)
            }
        }
    }

    private fun becomeOwner() {
        if (!peer) return
        val i = id ?: return
        val k = key ?: return
        val idBytes = runCatching { Base64.decode(i, Base64.URL_SAFE) }.getOrNull() ?: return
        runCatching { store(idBytes + k, false) }.onFailure { Log.w(TAG, "keystore", it); return }
        remote = emptyList()
        remoteUpdated = 0L
        lastSent = null
        upload()
    }

    /** Redeems a code made on another device, turns Tabs on PC on and adopts its secret. */
    fun redeemCode(code: String, onDone: (Boolean) -> Unit) {
        val c = code.trim().uppercase()
        if (!Relay.available || !Regex("[A-Z0-9]{6}").matches(c)) { onDone(false); return }
        Relay.scope.launch {
            val found = runCatching {
                val (st, txt) = Relay.request("GET", "/api/pair/$c")
                if (st == 200) LINK.find(txt)?.value else null
            }.onFailure { Log.w(TAG, "redeem failed", it) }.getOrNull()
            withContext(Dispatchers.Main) {
                if (found == null) { onDone(false); return@withContext }
                if (!enabled) toggle(true)
                onDone(enabled && pair(found))
            }
        }
    }

    /** Fetches and decrypts the other device's tabs. */
    fun refresh() {
        if (!enabled) return
        val rid = readId() ?: return
        val k = key ?: return
        Relay.scope.launch {
            val (code, bytes) = runCatching { Relay.requestBytes("GET", "/api/tabs/$rid") }
                .onFailure { Log.w(TAG, "download failed", it) }.getOrNull() ?: return@launch
            val list: PcList = when {
                code == 404 -> PcList(0L, emptyList())
                code != 200 || bytes.size < 29 -> return@launch
                else -> runCatching {
                    val c = Cipher.getInstance("AES/GCM/NoPadding")
                    c.init(Cipher.DECRYPT_MODE, SecretKeySpec(k, "AES"), GCMParameterSpec(128, bytes, 0, 12))
                    json.decodeFromString<PcList>(String(c.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8))
                }.onFailure { Log.w(TAG, "decrypt failed", it) }.getOrNull() ?: return@launch
            }
            val tabs = list.tabs
                .filter { it.url.startsWith("https://") || it.url.startsWith("http://") }
                .take(200)
                .map { RemoteTab(it.title.take(300), it.url) }
            val hist = list.history.orEmpty().take(1000)
                .filter { it.url.startsWith("https://") || it.url.startsWith("http://") }
                .map { Visit(it.url.take(2000), it.title.take(300), it.visits.coerceIn(1, 100000), it.time) }
            val chats = list.chats.take(100).map { c -> Chat(c.id, c.title.take(80), c.updated, c.messages.takeLast(200).map { ChatMsg(it.role, it.text.take(8000), it.t) }, c.deleted) }
            withContext(Dispatchers.Main) {
                if (!enabled || rid != readId()) return@withContext
                val showTabs = linkShare["tabs"] != false
                remote = if (showTabs) tabs else emptyList()
                remoteUpdated = if (showTabs) list.updated else 0L
                Chats.merge(chats)
                if (shareHistory && hist.isNotEmpty()) History.importVisits(hist)
                list.data?.let { runCatching { applyData(it) }.onFailure { e -> Log.w(TAG, "apply failed", e) } }
            }
        }
        pollCommands()
        pollUnlock()
    }

    /** The desktop asks (channel "ur") to unlock its passwords. Shows a confirm dialog; [answerUnlock] replies on "ua". */
    private fun pollUnlock() {
        if (!enabled) return
        val k = key ?: return
        Relay.scope.launch {
            val raw = getChan(k, "ur") ?: return@launch
            val o = runCatching { json.parseToJsonElement(raw) as kotlinx.serialization.json.JsonObject }.getOrNull() ?: return@launch
            val id = (o["id"] as? JsonPrimitive)?.content ?: return@launch
            val t = (o["t"] as? JsonPrimitive)?.content?.toLongOrNull() ?: return@launch
            if (System.currentTimeMillis() - t > 60_000L || id == sp.getString("unlockSeen", "")) return@launch
            sp.edit().putString("unlockSeen", id).apply()
            withContext(Dispatchers.Main) { be.syntaxya.lodica.ui.Ui.pendingUnlock = id }
        }
    }

    fun answerUnlock(id: String, ok: Boolean) {
        val k = key ?: return
        Relay.scope.launch { putChan(k, "ua", """{"id":"$id","ok":$ok}""") }
    }

    // ---- what to share: collect and apply --------------------------------------------------

    private fun fp(text: String): String =
        MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).take(8).joinToString("") { "%02x".format(it) }

    /** True when [value] differs from what was last applied for [name]; remembers it. */
    private fun markNew(name: String, value: String): Boolean {
        val f = fp(value)
        if (sp.getString("linkseen.$name", null) == f) return false
        sp.edit().putString("linkseen.$name", f).apply()
        return true
    }

    // The same keys and value shapes as the desktop's linkdata.SETTINGS, so both sides read what the other sends.
    private fun settingsMap(): Map<String, JsonElement> = mapOf(
        "theme" to JsonPrimitive(if (Prefs.theme == "dynamic") "system" else Prefs.theme),
        "customTheme" to (Prefs.customTheme?.let { c -> JsonObject(mapOf("bg" to JsonPrimitive(c.bg), "text" to JsonPrimitive(c.text),
            "accent" to JsonPrimitive(c.accent), "accent2" to JsonPrimitive(c.accent2), "at" to JsonPrimitive(c.at))) } ?: JsonNull),
        "savedThemes" to JsonArray(Prefs.savedThemes.map { t -> JsonObject(mapOf("name" to JsonPrimitive(t.name), "bg" to JsonPrimitive(t.bg),
            "text" to JsonPrimitive(t.text), "accent" to JsonPrimitive(t.accent), "accent2" to JsonPrimitive(t.accent2))) }),
        "language" to JsonPrimitive(Prefs.language.name),
        "darkPages" to JsonPrimitive(Prefs.darkPages),
        "httpsOnly" to JsonPrimitive(Prefs.httpsOnly),
        "search" to JsonPrimitive(Prefs.searchPicked?.name ?: ""),
        "searchFallback" to JsonPrimitive(Prefs.searchFallback.name),
        "cookieReject" to JsonPrimitive(Prefs.cookieReject),
        "spell" to JsonPrimitive(Prefs.spell),
        "spellAuto" to JsonPrimitive(Prefs.spellAuto),
        "searchWords" to JsonArray(Prefs.searchWordPairs().map { (w, u) -> JsonObject(mapOf("word" to JsonPrimitive(w), "url" to JsonPrimitive(u))) }),
        "shortcutNames" to JsonPrimitive(Prefs.shortcutNames),
        "autoTop" to JsonPrimitive(Prefs.quickAuto),
        "startNotes" to JsonPrimitive(Prefs.startNotes),
        "startPlanner" to JsonPrimitive(Prefs.startPlanner),
        "plannerPos" to JsonPrimitive(Prefs.plannerPos),
        "notesPos" to JsonPrimitive(Prefs.notesPos),
    )

    /** When the shared settings last changed here. Spots edits by comparing a fingerprint, so no hooks in Prefs are needed. */
    private fun settingsStamp(): Long {
        val f = fp(settingsMap().toString())
        val known = sp.getString("settingsSig", null)
        if (f != known) sp.edit().putString("settingsSig", f).putLong("linkat.settings", if (known == null) 0L else System.currentTimeMillis()).apply()
        return sp.getLong("linkat.settings", 0L)
    }

    /** Where the theme comes from: "newest" change, "this" device or "other" device. */
    var themeFrom by mutableStateOf("newest"); private set
    fun updateThemeFrom(v: String) {
        if (v !in listOf("newest", "this", "other")) return
        themeFrom = v
        sp.edit().putString("themeFrom", v).apply()
    }

    private fun applySettings(m: Map<String, JsonElement>, theme: Boolean = true, rest: Boolean = true) {
        fun str(k: String) = (m[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
        fun bool(k: String) = (m[k] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
        if (theme) (m["customTheme"] as? JsonObject)?.let { o ->
            fun c(k: String) = (o[k] as? JsonPrimitive)?.contentOrNull.orEmpty()
            val at = (o["at"] as? JsonPrimitive)?.contentOrNull?.toLongOrNull() ?: System.currentTimeMillis()
            if (CustomTheme.valid(c("bg"), c("text"), c("accent"), c("accent2"))) {
                val t = CustomTheme(c("bg"), c("text"), c("accent"), c("accent2"), at)
                if (t != Prefs.customTheme) Prefs.updateCustomTheme(t)
            }
        }
        if (theme) (m["savedThemes"] as? JsonArray)?.let { arr ->
            val list = arr.mapNotNull { e ->
                val o = e as? JsonObject ?: return@mapNotNull null
                fun c(k: String) = (o[k] as? JsonPrimitive)?.contentOrNull.orEmpty()
                if (c("name").isNotBlank() && CustomTheme.valid(c("bg"), c("text"), c("accent"), c("accent2")))
                    SavedTheme(c("name").replace('|', ' ').replace('\n', ' ').trim().take(40), c("bg"), c("text"), c("accent"), c("accent2")) else null
            }
            Prefs.updateSavedThemes(list)
        }
        if (theme) str("theme")?.let { v ->
            val known = v == "custom" || be.syntaxya.lodica.ui.theme.ThemeChoices.any { it.first == v }
            if (known && v != Prefs.theme && !(v == "system" && Prefs.theme == "dynamic")) Prefs.updateTheme(v)
        }
        if (!rest) return
        str("language")?.let { n -> Language.values().firstOrNull { it.name == n }?.let { if (it != Prefs.language) Prefs.updateLanguage(it) } }
        str("search")?.let { n -> SearchEngine.values().firstOrNull { it.name == n }?.let { if (it != Prefs.searchPicked) Prefs.updateSearch(it) } }
        str("searchFallback")?.let { n -> SearchEngine.values().firstOrNull { it.name == n }?.let { if (it != Prefs.searchFallback) Prefs.updateSearchFallback(it) } }
        bool("darkPages")?.let { if (it != Prefs.darkPages) Prefs.updateDarkPages(it) }
        bool("httpsOnly")?.let { if (it != Prefs.httpsOnly) Prefs.updateHttpsOnly(it) }
        bool("cookieReject")?.let { if (it != Prefs.cookieReject) Prefs.updateCookieReject(it) }
        bool("spell")?.let { if (it != Prefs.spell) Prefs.updateSpell(it) }
        bool("spellAuto")?.let { if (it != Prefs.spellAuto) Prefs.updateSpellAuto(it) }
        (m["searchWords"] as? JsonArray)?.let { a ->
            val lines = a.take(200).mapNotNull { e ->
                val o = e as? JsonObject ?: return@mapNotNull null
                val w = (o["word"] as? JsonPrimitive)?.contentOrNull?.trim()?.take(40).orEmpty()
                val u = (o["url"] as? JsonPrimitive)?.contentOrNull?.trim()?.take(2000).orEmpty()
                if (w.isEmpty() || u.isEmpty() || w.contains(' ') || u.contains('\n')) null else "$w $u"
            }.joinToString("\n")
            if (lines != Prefs.searchWords) Prefs.updateSearchWords(lines)
        }
        bool("shortcutNames")?.let { if (it != Prefs.shortcutNames) Prefs.updateShortcutNames(it) }
        bool("autoTop")?.let { if (it != Prefs.quickAuto) Prefs.updateQuickAuto(it) }
        bool("startNotes")?.let { if (it != Prefs.startNotes) Prefs.updateStartNotes(it) }
        bool("startPlanner")?.let { if (it != Prefs.startPlanner) Prefs.updateStartPlanner(it) }
        val places = setOf("left", "right", "below")
        str("plannerPos")?.takeIf { it in places && it != Prefs.plannerPos }?.let { Prefs.updatePlannerPos(it) }
        str("notesPos")?.takeIf { it in places && it != Prefs.notesPos }?.let { Prefs.updateNotesPos(it) }
    }

    private fun isWeb(u: String) = u.startsWith("https://") || u.startsWith("http://")

    private fun applyData(d: PcData) {
        if (linkShare["settings"] == true && d.settings != null) {
            val local = settingsStamp()
            val newer = d.settingsAt > local
            val themeJson = (d.settings["theme"]?.toString().orEmpty() + d.settings["customTheme"]?.toString().orEmpty() + d.settings["savedThemes"]?.toString().orEmpty())
            val takeTheme = when (themeFrom) { "other" -> markNew("theme", themeJson); "this" -> false; else -> newer }
            if (newer || takeTheme) {
                applySettings(d.settings, takeTheme, newer)
                sp.edit().putString("settingsSig", fp(settingsMap().toString())).putLong("linkat.settings", if (newer) d.settingsAt else local).apply()
            }
        }
        val s = d.sites
        if (linkShare["sites"] == true && s != null && markNew("sites", json.encodeToString(s) + d.hidden.orEmpty())) {
            s.noDummy.take(500).forEach { h -> val b = Relay.baseDomain(h.take(300)); if (b.isNotBlank() && b !in Prefs.noDummy) Prefs.toggleNoDummy(b) }
            s.compat.take(500).forEach { Prefs.setCompat(it.take(300), true) }
            Prefs.addDirect(s.direct.take(500).map { it.take(300) })
            val hidden = Prefs.quickHidden.lines().toSet()
            d.hidden.orEmpty().take(500).map { it.take(300) }.filter { it.isNotBlank() && it !in hidden }.forEach { Prefs.hideQuickHost(it) }
        }
        val sc = d.shortcuts
        if (linkShare["shortcuts"] == true && sc != null && markNew("shortcuts", json.encodeToString(sc))) {
            val cur = Prefs.quickList()
            val seen = cur.map { it.first }.toMutableSet()
            val next = cur.toMutableList()
            for (x in sc) {
                if (next.size >= 24) break
                val u = x.url.take(500)
                if (!isWeb(u) || !seen.add(u)) continue
                next += u to x.title.take(40)
            }
            if (next.size != cur.size) Prefs.updateQuick(next)
        }
        if (linkShare["bluetooth"] == true) remoteBluetooth = d.bluetooth.orEmpty().take(50).map { it.take(100) }
        if (d.sealed != null && (linkShare["passwords"] == true || linkShare["totp"] == true)) {
            val plain = LinkKey.openData(d.sealed)
            if (plain == null) {
                // Without a key we need one; with a key the two devices hold different keys.
                if (LinkKey.hasKey) { keyMissing = false; keyDiffers = true; otherKeyId = d.sealedKey?.take(8) }
                else { keyMissing = true; keyDiffers = false }
            } else {
                keyMissing = false
                keyDiffers = false
                if (markNew("sealed", plain)) runCatching { applySecret(json.decodeFromString<PcSecret>(plain)) }
            }
        } else if (d.keyId != null && (linkShare["passwords"] == true || linkShare["totp"] == true)) {
            val mine = LinkKey.keyId()
            if (mine == null) { keyMissing = true; keyDiffers = false }
            else if (mine != d.keyId) { keyMissing = false; keyDiffers = true; otherKeyId = d.keyId.take(8) }
            else { keyMissing = false; keyDiffers = false }
        }
    }

    /** Merges received passwords and authenticator keys. Adds what is missing; replaces a password only when the other side marks it newer. */
    private fun applySecret(s: PcSecret) {
        val pw = s.passwords
        if (!pw.isNullOrEmpty()) {
            Vault.all().accept({ cur ->
                val have = cur.orEmpty().associateBy { it.origin + "\n" + it.username }
                for (e in pw.take(500)) {
                    if (e.origin.isEmpty() || e.pass.isEmpty()) continue
                    val origin = e.origin.take(500)
                    val c = have[origin + "\n" + e.user.take(300)]
                    if (c == null || (e.saved > 0 && c.password != e.pass)) runCatching { Vault.save(c?.guid, origin, null, null, e.user.take(300), e.pass.take(500)) }
                }
            }, { e -> Log.w(TAG, "vault unavailable", e) })
        }
        val tk = s.totp
        if (!tk.isNullOrEmpty()) {
            Vault.totpAll().accept({ cur ->
                val have = cur.orEmpty().map { it.secret }.toMutableSet()
                for (t in tk.take(200)) {
                    if (t.secret.isEmpty() || !have.add(t.secret)) continue
                    runCatching { Vault.totpAdd(TotpEntry(java.util.UUID.randomUUID().toString(), t.host.take(200), t.label.take(80), t.secret.take(200), t.digits, t.period, t.algo.take(10))) }
                }
            }, { e -> Log.w(TAG, "vault unavailable", e) })
        }
    }

    /** Collects passwords and authenticator keys to share, or nulls when sharing is off or the key is missing. */
    private fun gather(done: (List<PcPass>?, List<PcTotp>?) -> Unit) {
        val wantP = linkShare["passwords"] == true
        val wantT = linkShare["totp"] == true
        if (!LinkKey.hasKey || (!wantP && !wantT)) { done(null, null); return }
        fun totps(p: List<PcPass>?) {
            if (!wantT) { done(p, null); return }
            Vault.totpAll().accept(
                { l -> done(p, l.orEmpty().map { PcTotp(it.id, it.label, "", "", it.secret, it.digits, it.period, it.algo, it.host) }) },
                { done(p, null) },
            )
        }
        if (!wantP) { totps(null); return }
        Vault.all().accept(
            { l -> totps(l.orEmpty().map { PcPass(it.origin, it.username, it.password, 0) }) },
            { totps(null) },
        )
    }

    // ---- link key exchange -----------------------------------------------------------------

    /** [asking] is the new device's session and public key while the confirm popup is open (origin only). */
    private class Exchange(val role: String, val session: String, val pair: LinkKey.Pair?, val code: String, var lastT: Long, val until: Long) {
        var asking: Pair<String, String>? = null
    }

    private fun hmac(k: ByteArray, text: String): ByteArray =
        Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(k, "HmacSHA256")) }.doFinal(text.toByteArray())

    private fun chanId(k: ByteArray, name: String) = b64url(hmac(k, "ch:$name").copyOfRange(0, 16))

    /** Blocking. Puts [text] encrypted under the link secret on the named channel. */
    private fun putChan(k: ByteArray, name: String, text: String): Boolean = runCatching {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        val iv = ByteArray(12).also { rnd.nextBytes(it) }
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(k, "AES"), GCMParameterSpec(128, iv))
        val st = Relay.request("PUT", "/api/tabs/${chanId(k, name)}", iv + c.doFinal(text.toByteArray())).first
        st == 200 || st == 204
    }.getOrDefault(false)

    /** Blocking. Reads and decrypts a channel, or null. */
    private fun getChan(k: ByteArray, name: String): String? = runCatching {
        val (st, b) = Relay.requestBytes("GET", "/api/tabs/${chanId(k, name)}")
        if (st != 200 || b.size < 29) null else {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, SecretKeySpec(k, "AES"), GCMParameterSpec(128, b, 0, 12))
            String(c.doFinal(b, 12, b.size - 12), Charsets.UTF_8)
        }
    }.getOrNull()

    private fun note(step: LinkStep) { main.post { linkStep = step } }

    private fun startEx(e: Exchange) {
        main.removeCallbacks(exTick)
        ex = e
        linkStep = null
        main.post(exTick)
    }

    private fun stopEx(e: Exchange) {
        main.post { if (ex === e) { ex = null; main.removeCallbacks(exTick) } }
    }

    private fun exchange(e: Exchange) {
        val k = key ?: return
        if (exBusy) return
        exBusy = true
        Relay.scope.launch {
            try {
                if (e.role == "origin") originStep(e, k) else newStep(e, k)
            } catch (t: Exception) {
                Log.w(TAG, "exchange failed", t)
            } finally {
                main.post { exBusy = false }
            }
        }
    }

    /*
     * Every linked device answers a request for the link key, not only the one that showed a code: it checks with every
     * poll and every 2 seconds while a code is shown. A request counts only once (its time is kept in linkseen) and only
     * when it is under 10 minutes old, because the relay keeps the last request for weeks and an old one must not take
     * the place of a new device.
     */
    private fun readKq(k: ByteArray): PcKq? =
        getChan(k, "kq")?.let { runCatching { json.decodeFromString<PcKq>(it) }.getOrNull() }

    private fun markKq(t: Long) { sp.edit().putString("linkseen.kq", t.toString()).apply() }

    /** Blocking. A join request no one here has seen yet, or null. Marks it seen. */
    private fun freshJoin(k: ByteArray): PcKq? {
        val m = readKq(k) ?: return null
        if (m.type != "join" || m.session.isEmpty() || m.pub.isEmpty() || m.t == 0L) return null
        if (sp.getString("linkseen.kq", null) == m.t.toString()) return null
        markKq(m.t)
        return if (kotlin.math.abs(System.currentTimeMillis() - m.t) > 10 * 60_000L) null else m
    }

    /** From the regular poll: a device asked for the key while no code was shown here. */
    private fun checkJoin() {
        val k = key ?: return
        if (ex != null || exBusy) return
        exBusy = true
        Relay.scope.launch {
            val m = try { freshJoin(k) } catch (t: Exception) { null }
            withContext(Dispatchers.Main) {
                exBusy = false
                if (m == null || ex != null || !enabled) return@withContext
                val e = Exchange("origin", "", null, "", 0L, System.currentTimeMillis() + 10 * 60_000L)
                e.asking = m.session to m.pub
                startEx(e)
                linkStep = LinkStep("confirm", code = "", session = m.session)
            }
        }
    }

    private fun originStep(e: Exchange, k: ByteArray) {
        if (e.asking != null) return
        val m = freshJoin(k) ?: return
        e.asking = m.session to m.pub
        note(LinkStep("confirm", code = e.code, session = m.session))
    }

    private fun newStep(e: Exchange, k: ByteArray) {
        val m = getChan(k, "ka")?.let { runCatching { json.decodeFromString<PcKa>(it) }.getOrNull() } ?: return
        if (m.session != e.session || m.t == e.lastT) return
        e.lastT = m.t
        val pair = e.pair ?: return
        when (m.type) {
            "no" -> { note(LinkStep("no")); stopEx(e) }
            // The other device has no key yet: keep ours, or make one, so the other device can ask for it.
            "nokey" -> { LinkKey.create(); stopEx(e); main.post { linkStep = LinkStep("nokey"); gotKey() } }
            "ok" -> if (LinkKey.adoptWrapped(pair.priv, m.pub, m.wrap)) {
                val fp = LinkKey.fingerprint(pair.pub, m.pub)
                stopEx(e)
                main.post { linkStep = LinkStep("done", fp = fp); gotKey() }
            } else { note(LinkStep("bad")); stopEx(e) }
        }
    }

    /** The link key changed here: send and fetch again. */
    private fun gotKey() {
        keyMissing = false
        keyDiffers = false
        sp.edit().remove("linkseen.sealed").apply()
        lastSent = null
        lastKeep = 0L
        if (enabled) { upload(); refresh() }
    }

    /** Right after linking, or later from Settings: asks the other device for the link key. False when not linked. */
    fun askKey(): Boolean {
        val k = key ?: return false
        if (!enabled) return false
        val pair = LinkKey.newPair()
        val session = ByteArray(8).also { rnd.nextBytes(it) }.joinToString("") { "%02x".format(it) }
        val t = System.currentTimeMillis()
        markKq(t)
        Relay.scope.launch {
            val ok = putChan(k, "kq", json.encodeToString(PcKq(session, "join", pair.pub, t)))
            withContext(Dispatchers.Main) {
                if (!ok) return@withContext
                startEx(Exchange("new", session, pair, "", 0L, System.currentTimeMillis() + 10 * 60_000L))
                linkStep = LinkStep("wait")
            }
        }
        return true
    }

    /** The user answered the confirm popup. */
    fun confirmKey(session: String, yes: Boolean) {
        val e = ex ?: return
        val k = key ?: return
        val asking = e.asking
        if (e.role != "origin" || asking == null || asking.first != session) return
        e.asking = null
        linkStep = null
        Relay.scope.launch {
            if (!yes) { putChan(k, "ka", json.encodeToString(PcKa(session, "no", "", "", System.currentTimeMillis()))); return@launch }
            val w = LinkKey.wrapFor(asking.second)
            if (w == null) {
                if (putChan(k, "ka", json.encodeToString(PcKa(session, "nokey", "", "", System.currentTimeMillis())))) {
                    stopEx(e)
                    main.post { linkStep = LinkStep("nokey-sent") }
                }
                return@launch
            }
            val ok = putChan(k, "ka", json.encodeToString(PcKa(session, "ok", w.first, w.second, System.currentTimeMillis())))
            if (ok) {
                stopEx(e)
                val fp = LinkKey.fingerprint(asking.second, w.first)
                main.post { linkStep = LinkStep("sent", fp = fp); gotKey() }
            }
        }
    }

    fun dismissLinkStep() { linkStep = null }

    fun forgetKey() {
        main.removeCallbacks(exTick)
        ex = null
        linkStep = null
        LinkKey.forget()
        keyMissing = false
        keyDiffers = false
        lastSent = null
        if (enabled) upload()
    }

    /** Commands queued by the linked desktop. Runs only when the user allowed control. */
    private fun pollCommands() {
        if (!allowControl || !enabled) return
        val k = key ?: return
        val cid = b64url(Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(k, "HmacSHA256")) }.doFinal("cmd".toByteArray()).copyOfRange(0, 16))
        Relay.scope.launch {
            val (code, bytes) = runCatching { Relay.requestBytes("GET", "/api/tabs/$cid") }.getOrNull() ?: return@launch
            if (code != 200 || bytes.size < 29) return@launch
            val cmds = runCatching {
                val c = Cipher.getInstance("AES/GCM/NoPadding")
                c.init(Cipher.DECRYPT_MODE, SecretKeySpec(k, "AES"), GCMParameterSpec(128, bytes, 0, 12))
                json.decodeFromString<PcCmds>(String(c.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)).cmds
            }.getOrNull() ?: return@launch
            val now = System.currentTimeMillis()
            withContext(Dispatchers.Main) {
                if (!allowControl) return@withContext
                val last = sp.getLong("cmdAt", 0L)
                val fresh = cmds.filter { it.at > last && now - it.at < 10 * 60_000L }.sortedBy { it.at }
                if (cmds.isNotEmpty()) sp.edit().putLong("cmdAt", maxOf(last, cmds.maxOf { it.at })).apply()
                fresh.take(10).forEach { runCommand(it) }
            }
        }
    }

    private fun runCommand(c: PcCmd) {
        val web = c.url.startsWith("https://") || c.url.startsWith("http://")
        when (c.type) {
            "open" -> if (web) TabManager.open(c.url)
            "close" -> TabManager.tabs.firstOrNull { !it.private && it.url == c.url }?.let { TabManager.close(it) }
            "focus" -> TabManager.tabs.firstOrNull { !it.private && it.url == c.url }?.let { TabManager.select(it) }
            "reload" -> TabManager.current?.session?.reload()
        }
    }

    // ---- upload ----------------------------------------------------------------------------

    /** Main thread: snapshot what is shared, then encrypt and PUT off the main thread. */
    private fun upload() {
        if (writeId() == null || key == null || !enabled) return
        gather { pw, tk -> if (enabled) send(pw, tk) }
    }

    private fun send(pw: List<PcPass>?, tk: List<PcTotp>?) {
        val tid = writeId() ?: return
        val k = key ?: return
        val list = if (linkShare["tabs"] != false) TabManager.tabs.filter { !it.private && isWeb(it.url) }
            .map { PcTab(it.title.ifBlank { it.host }, it.url, false) } else emptyList()
        val chats = Chats.raw().map { c -> PcChat(c.id, c.title, c.updated, c.messages.map { PcMsg(it.role, it.text, it.t) }, c.deleted) }
        var hist = if (shareHistory) History.recent(300).filter { !it.url.startsWith("about:") }.map { PcHist(it.url, it.title, it.last, it.visits) } else null
        val sealed = if (pw != null || tk != null) LinkKey.sealData(json.encodeToString(PcSecret(pw, tk))) else null
        val settings = if (linkShare["settings"] == true) settingsMap() else null
        val stamp = if (settings != null) settingsStamp() else 0L
        val sites = if (linkShare["sites"] == true)
            PcSites(emptyList(), Prefs.compat.toList(), Prefs.direct.toList(), Prefs.noDummy.toList()) else null
        val hidden = if (linkShare["sites"] == true) Prefs.quickHidden.lines().filter { it.isNotBlank() } else null
        val shortcuts = if (linkShare["shortcuts"] == true) Prefs.quickList().map { PcShortcut(it.first, it.second) } else null
        val data = PcData(null, shortcuts, settings, stamp, sites, hidden, null, sealed, if (sealed != null) LinkKey.keyId() else null, LinkKey.keyId())
        val dataSig = fp(json.encodeToString(data))
        val sig = list.joinToString("\n") { it.url + "\t" + it.title } + "\n@" + (hist?.size ?: -1) + "\n#" +
            chats.joinToString(",") { it.id + ":" + it.updated } + "\n$" + dataSig
        if (sig == lastSent) return
        lastSent = sig
        lastKeep = System.currentTimeMillis()
        Relay.scope.launch {
            io.withLock {
                var tooBig = false
                val ok = runCatching {
                    var h = hist
                    var c = chats
                    var payload: ByteArray
                    var shrink = 0
                    while (true) {
                        val body = json.encodeToString(PcList(System.currentTimeMillis(), list, c, h, data)).toByteArray()
                        val ci = Cipher.getInstance("AES/GCM/NoPadding")
                        val iv = ByteArray(12).also { rnd.nextBytes(it) }
                        ci.init(Cipher.ENCRYPT_MODE, SecretKeySpec(k, "AES"), GCMParameterSpec(128, iv))
                        payload = iv + ci.doFinal(body)
                        if (payload.size <= MAX_BODY) break
                        if (++shrink > 8) { tooBig = true; throw IllegalStateException("too much to share") }
                        if (!h.isNullOrEmpty()) h = h.take(h.size / 2) else c = c.take(c.size / 2)
                    }
                    Relay.request("PUT", "/api/tabs/$tid", payload).first
                }.onFailure { Log.w(TAG, "upload failed", it) }.getOrNull()
                withContext(Dispatchers.Main) {
                    if (ok == 204 || ok == 200) status = null
                    else { status = if (tooBig) "Too much to send: passwords and keys are over 512 KB" else if (ok != null) "Sending failed (server answered $ok)" else "Sending failed, no connection to the server"; if (lastSent == sig) lastSent = null }
                }
            }
        }
    }

    /** Blocking, under [io]. */
    private fun remove(old: String) {
        runCatching { Relay.request("DELETE", "/api/tabs/$old") }.onFailure { Log.w(TAG, "delete failed", it) }
    }

    // ---- secrets ---------------------------------------------------------------------------

    private fun b64url(b: ByteArray) = Base64.encodeToString(b, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    private fun publish(newId: String, newKey: ByteArray) {
        id = newId
        key = newKey
        link = "${Relay.API}/t/$newId#${b64url(newKey)}"
    }

    /** Unwraps stored id+key. False when none stored yet. */
    private fun load(): Boolean {
        val ct = sp.getString("blob", null) ?: return false
        val iv = sp.getString("iv", null) ?: return false
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, keystoreKey(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        val raw = c.doFinal(Base64.decode(ct, Base64.NO_WRAP))
        peer = sp.getBoolean("peer", false)
        publish(b64url(raw.copyOfRange(0, 16)), raw.copyOfRange(16, 48))
        return true
    }

    private fun generate() = store(ByteArray(48).also { rnd.nextBytes(it) }, false)

    /** Wraps the 48-byte secret with the keystore key, persists it and makes it current. */
    private fun store(raw: ByteArray, asPeer: Boolean) {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, keystoreKey())
        val ct = c.doFinal(raw)
        sp.edit()
            .putString("blob", Base64.encodeToString(ct, Base64.NO_WRAP))
            .putString("iv", Base64.encodeToString(c.iv, Base64.NO_WRAP))
            .putBoolean("peer", asPeer)
            .commit()
        peer = asPeer
        publish(b64url(raw.copyOfRange(0, 16)), raw.copyOfRange(16, 48))
    }

    private fun keystoreKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val b = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
        // Uploads run while the screen may be off, so no unlocked-device requirement here.
        if (Build.VERSION.SDK_INT >= 28) {
            runCatching {
                return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                    .apply { init(b.setIsStrongBoxBacked(true).build()) }.generateKey()
            }
            b.setIsStrongBoxBacked(false)
        }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply { init(b.build()) }.generateKey()
    }
}
