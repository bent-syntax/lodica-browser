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
import be.syntaxya.lodica.tabs.TabManager
import java.security.KeyStore
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
private data class PcList(val updated: Long, val tabs: List<PcTab>, val chats: List<PcChat> = emptyList())

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

    private var id: String? = null
    private var key: ByteArray? = null
    private var peer = false
    private var lastSent: String? = null
    private var lastKeep = 0L
    private val tick = Runnable { upload() }
    private val pollTick = object : Runnable {
        override fun run() {
            if (!enabled) return
            if (System.currentTimeMillis() - lastKeep > KEEPALIVE_MS) { lastSent = null; upload() }
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
            val chats = list.chats.take(100).map { c -> Chat(c.id, c.title.take(80), c.updated, c.messages.takeLast(200).map { ChatMsg(it.role, it.text.take(8000), it.t) }, c.deleted) }
            withContext(Dispatchers.Main) {
                if (enabled && rid == readId()) { remote = tabs; remoteUpdated = list.updated; Chats.merge(chats) }
            }
        }
    }

    // ---- upload ----------------------------------------------------------------------------

    /** Main thread: snapshot the tabs, then encrypt and PUT off the main thread. */
    private fun upload() {
        val tid = writeId() ?: return
        val k = key ?: return
        if (!enabled) return
        val list = TabManager.tabs.filter { !it.private && (it.url.startsWith("https://") || it.url.startsWith("http://")) }
            .map { PcTab(it.title.ifBlank { it.host }, it.url, false) }
        val chats = Chats.raw().map { c -> PcChat(c.id, c.title, c.updated, c.messages.map { PcMsg(it.role, it.text, it.t) }, c.deleted) }
        val sig = list.joinToString("\n") { it.url + "\t" + it.title } + "\n#" + chats.joinToString(",") { it.id + ":" + it.updated }
        if (sig == lastSent) return
        lastSent = sig
        lastKeep = System.currentTimeMillis()
        val body = json.encodeToString(PcList(System.currentTimeMillis(), list, chats)).toByteArray()
        Relay.scope.launch {
            io.withLock {
                val ok = runCatching {
                    val c = Cipher.getInstance("AES/GCM/NoPadding")
                    val iv = ByteArray(12).also { rnd.nextBytes(it) }
                    c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(k, "AES"), GCMParameterSpec(128, iv))
                    val payload = iv + c.doFinal(body)
                    if (payload.size > MAX_BODY) throw IllegalStateException("too many tabs")
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
