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
    val settings: Map<String, JsonPrimitive>? = null,
    val settingsAt: Long = 0,
    val sites: PcSites? = null,
    val hidden: List<String>? = null,
    val bluetooth: List<String>? = null,
    val sealed: String? = null,
)

@Serializable
private data class PcKq(val session: String = "", val type: String = "", val id: String = "", val proof: String = "", val t: Long = 0)

@Serializable
private data class PcKa(val session: String = "", val type: String = "", val wrap: String? = null, val error: String? = null, val t: Long = 0)

/** One step of the key exchange, shown in Settings. */
class LinkStep(val step: String, val code: String = "", val error: String = "")

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
    private const val POLL_MS = 30_000L
    private const val KEEPALIVE_MS = 12L * 3600 * 1000
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
                if (enabled && ex === e) linkStep = LinkStep("expired")
                ex = null
                return
            }
            exchange(e)
            main.postDelayed(this, 2_000)
        }
    }
    private val tick = Runnable { upload() }
    private val pollTick = object : Runnable {
        override fun run() {
            if (!enabled) return
            if (System.currentTimeMillis() - lastKeep > KEEPALIVE_MS) lastSent = null
            upload()
            refresh()
            main.postDelayed(this, POLL_MS)
        }
    }

    private fun startPoll() {
        main.removeCallbacks(pollTick)
        main.post(pollTick)
    }

    fun init(ctx: Context) {
        if (::sp.isInitialized) return
        sp = ctx.applicationContext.getSharedPreferences("pctabs", Context.MODE_PRIVATE)
        enabled = Relay.available && sp.getBoolean("enabled", false)
        shareHistory = sp.getBoolean("shareHistory", false)
        if (shareHistory && !sp.contains("share.history")) sp.edit().putBoolean("share.history", true).putBoolean("shareHistory", false).apply()
        shareHistory = sp.getBoolean("share.history", false)
        linkShare = SHARE_IDS.associateWith { sp.getBoolean("share.$it", it == "tabs") }
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
            withContext(Dispatchers.Main) { onDone(code) }
        }
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

    private fun settingsMap(): Map<String, JsonPrimitive> = mapOf(
        "language" to JsonPrimitive(Prefs.language.name),
        "darkPages" to JsonPrimitive(Prefs.darkPages),
        "httpsOnly" to JsonPrimitive(Prefs.httpsOnly),
        "searchFallback" to JsonPrimitive(Prefs.searchFallback.name),
        "cookieReject" to JsonPrimitive(Prefs.cookieReject),
        "spell" to JsonPrimitive(Prefs.spell),
        "spellAuto" to JsonPrimitive(Prefs.spellAuto),
    )

    /** When the shared settings last changed here. Spots edits by comparing a fingerprint, so no hooks in Prefs are needed. */
    private fun settingsStamp(): Long {
        val f = fp(settingsMap().toString())
        val known = sp.getString("settingsSig", null)
        if (f != known) sp.edit().putString("settingsSig", f).putLong("linkat.settings", if (known == null) 0L else System.currentTimeMillis()).apply()
        return sp.getLong("linkat.settings", 0L)
    }

    private fun applySettings(m: Map<String, JsonPrimitive>) {
        m["language"]?.takeIf { it.isString }?.content?.let { n -> Language.values().firstOrNull { it.name == n }?.let { if (it != Prefs.language) Prefs.updateLanguage(it) } }
        m["searchFallback"]?.takeIf { it.isString }?.content?.let { n -> SearchEngine.values().firstOrNull { it.name == n }?.let { if (it != Prefs.searchFallback) Prefs.updateSearchFallback(it) } }
        m["darkPages"]?.booleanOrNull?.let { if (it != Prefs.darkPages) Prefs.updateDarkPages(it) }
        m["httpsOnly"]?.booleanOrNull?.let { if (it != Prefs.httpsOnly) Prefs.updateHttpsOnly(it) }
        m["cookieReject"]?.booleanOrNull?.let { if (it != Prefs.cookieReject) Prefs.updateCookieReject(it) }
        m["spell"]?.booleanOrNull?.let { if (it != Prefs.spell) Prefs.updateSpell(it) }
        m["spellAuto"]?.booleanOrNull?.let { if (it != Prefs.spellAuto) Prefs.updateSpellAuto(it) }
    }

    private fun isWeb(u: String) = u.startsWith("https://") || u.startsWith("http://")

    private fun applyData(d: PcData) {
        if (linkShare["settings"] == true && d.settings != null) {
            val local = settingsStamp()
            if (d.settingsAt > local) {
                applySettings(d.settings)
                sp.edit().putString("settingsSig", fp(settingsMap().toString())).putLong("linkat.settings", d.settingsAt).apply()
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
            if (plain == null) keyMissing = true
            else {
                keyMissing = false
                if (markNew("sealed", plain)) runCatching { applySecret(json.decodeFromString<PcSecret>(plain)) }
            }
        }
    }

    /** Merges received passwords and authenticator keys. Adds what is missing; replaces a password only when the other side marks it newer. */
    private fun applySecret(s: PcSecret) {
        val pw = s.passwords
        if (linkShare["passwords"] == true && !pw.isNullOrEmpty()) {
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
        if (linkShare["totp"] == true && !tk.isNullOrEmpty()) {
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

    private class Exchange(val role: String, val session: String, val file: LinkKey.Parsed?, var code: String, var lastT: Long, val until: Long)

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

    private fun originStep(e: Exchange, k: ByteArray) {
        val m = getChan(k, "kq")?.let { runCatching { json.decodeFromString<PcKq>(it) }.getOrNull() } ?: return
        val now = System.currentTimeMillis()
        if (m.session.isEmpty() || m.t <= e.lastT || now - m.t > 2 * 60_000L) return
        e.lastT = m.t
        fun reply(type: String, wrap: String? = null, error: String? = null) =
            putChan(k, "ka", json.encodeToString(PcKa(m.session, type, wrap, error, System.currentTimeMillis())))
        when (m.type) {
            "req" -> {
                val code = LinkKey.request(m.session, m.id)
                if (code == null) { reply("unknown"); note(LinkStep("unknown")) }
                else { reply("code"); note(LinkStep("code", code = code)) }
            }
            "proof" -> {
                val (wrap, err) = LinkKey.answer(m.session, m.proof, k)
                if (wrap != null) { reply("ok", wrap = wrap); note(LinkStep("sent")); stopEx(e) }
                else { reply("bad", error = err); note(LinkStep("bad", error = err ?: "")) }
            }
        }
    }

    private fun newStep(e: Exchange, k: ByteArray) {
        val m = getChan(k, "ka")?.let { runCatching { json.decodeFromString<PcKa>(it) }.getOrNull() } ?: return
        if (m.session != e.session || m.t <= e.lastT) return
        e.lastT = m.t
        when (m.type) {
            "code" -> note(LinkStep("enter"))
            "unknown" -> { note(LinkStep("unknown")); stopEx(e) }
            "bad" -> note(LinkStep("bad", error = m.error ?: ""))
            "ok" -> {
                val file = e.file
                val w = if (m.wrap != null && e.code.isNotEmpty()) LinkKey.unwrapAnswer(m.wrap, k, e.session, e.code) else null
                if (w != null && file != null && LinkKey.adopt(file, w)) {
                    stopEx(e)
                    main.post { linkStep = LinkStep("done"); gotKey() }
                } else note(LinkStep("bad", error = "wrong code"))
            }
        }
    }

    /** The link key changed here: send and fetch again. */
    private fun gotKey() {
        keyMissing = false
        sp.edit().remove("linkseen.sealed").apply()
        lastSent = null
        lastKeep = 0L
        if (enabled) { upload(); refresh() }
    }

    /** Makes the link key when there is none. */
    fun createKey() {
        LinkKey.create()
        gotKey()
    }

    /** Key file text. A file without [cable] needs a code from this device, so the exchange starts here. */
    fun makeKeyFile(cable: Boolean): String {
        val text = LinkKey.makeFile(cable)
        if (!cable && enabled && key != null) {
            startEx(Exchange("origin", "", null, "", 0L, System.currentTimeMillis() + 5 * 60_000L))
        }
        gotKey()
        return text
    }

    /** Reads a key file. [onDone] gets step "done", "wait" (a code is coming) or "error". */
    fun insertKeyFile(text: String, onDone: (LinkStep) -> Unit) {
        val f = LinkKey.readFile(text)
        if (f == null) { onDone(LinkStep("error", error = "That is not a key file")); return }
        if (f.w != null) {
            if (LinkKey.adopt(f, f.w)) { gotKey(); onDone(LinkStep("done")) }
            else onDone(LinkStep("error", error = "The key file is damaged"))
            return
        }
        val k = key
        if (!enabled || k == null) { onDone(LinkStep("error", error = "Link the device that made this file first")); return }
        val session = ByteArray(8).also { rnd.nextBytes(it) }.joinToString("") { "%02x".format(it) }
        Relay.scope.launch {
            val ok = putChan(k, "kq", json.encodeToString(PcKq(session, "req", f.id, "", System.currentTimeMillis())))
            withContext(Dispatchers.Main) {
                if (!ok) { onDone(LinkStep("error", error = "Could not reach the server")); return@withContext }
                startEx(Exchange("new", session, f, "", 0L, System.currentTimeMillis() + 5 * 60_000L))
                onDone(LinkStep("wait"))
            }
        }
    }

    /** New device: sends the typed 6-digit code as proof. */
    fun enterKeyCode(code: String) {
        val e = ex ?: return
        val k = key ?: return
        val c = code.filter { it.isDigit() }
        if (c.length != 6 || e.role != "new") return
        e.code = c
        Relay.scope.launch {
            putChan(k, "kq", json.encodeToString(PcKq(e.session, "proof", "", LinkKey.proofOf(k, e.session, c), System.currentTimeMillis())))
        }
    }

    fun dismissLinkStep() { linkStep = null }

    fun forgetKey() {
        main.removeCallbacks(exTick)
        ex = null
        linkStep = null
        LinkKey.forget()
        keyMissing = false
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
        val data = PcData(null, shortcuts, settings, stamp, sites, hidden, null, sealed)
        val dataSig = fp(json.encodeToString(data))
        val sig = list.joinToString("\n") { it.url + "\t" + it.title } + "\n@" + (hist?.size ?: -1) + "\n#" +
            chats.joinToString(",") { it.id + ":" + it.updated } + "\n$" + dataSig
        if (sig == lastSent) return
        lastSent = sig
        lastKeep = System.currentTimeMillis()
        Relay.scope.launch {
            io.withLock {
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
                        if (++shrink > 8) throw IllegalStateException("too much to share")
                        if (!h.isNullOrEmpty()) h = h.take(h.size / 2) else c = c.take(c.size / 2)
                    }
                    Relay.request("PUT", "/api/tabs/$tid", payload).first
                }.onFailure { Log.w(TAG, "upload failed", it) }.getOrNull()
                withContext(Dispatchers.Main) {
                    if (ok == 204 || ok == 200) status = null
                    else { status = "Last upload failed"; if (lastSent == sig) lastSent = null }
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
