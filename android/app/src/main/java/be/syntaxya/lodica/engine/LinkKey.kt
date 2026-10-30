package be.syntaxya.lodica.engine

import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * The link key: one random 256-bit key that protects the passwords and authenticator keys shared between linked devices.
 * Same protocol as desktop/main/linkkey.js. A key file holds the key wrapped under a one-off file key W; W reaches a new
 * device either through a 6-digit code (PcTabs carries the messages) or inside a cable file.
 */
object LinkKey {
    private const val CODE_MS = 30_000L
    private const val MAX_TRIES = 3
    private const val FILE_KEEP_MS = 7L * 24 * 3600 * 1000

    @Serializable
    private data class FileEntry(val w: String, val at: Long)

    @Serializable
    private data class State(val key: String? = null, val files: Map<String, FileEntry> = emptyMap())

    @Serializable
    private data class KeyFile(val v: Int = 1, val id: String, val wrapped: String, val w: String? = null)

    class Parsed(val id: String, val wrapped: String, val w: String?)

    private class Pending(val id: String, val code: String, val exp: Long, var tries: Int)

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = false }
    private val rnd = SecureRandom()
    private val pending = HashMap<String, Pending>()
    private var state = State()
    private var loaded = false

    /** True when this device holds the link key. */
    var hasKey by mutableStateOf(false)
        private set

    @Synchronized
    private fun load(): State {
        if (loaded) return state
        loaded = true
        state = try { Secret.get("linkkey")?.let { json.decodeFromString<State>(it) } ?: State() } catch (_: Exception) { State() }
        hasKey = state.key != null
        return state
    }

    @Synchronized
    private fun save(s: State) {
        state = s
        hasKey = s.key != null
        Secret.put("linkkey", json.encodeToString(s))
    }

    fun init() { load() }

    private fun b64(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)
    private fun unb64(s: String) = Base64.decode(s, Base64.DEFAULT)
    private fun random(n: Int) = ByteArray(n).also { rnd.nextBytes(it) }

    private fun seal(data: ByteArray, key: ByteArray): ByteArray {
        val iv = random(12)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        return iv + c.doFinal(data)
    }

    private fun open(data: ByteArray, key: ByteArray): ByteArray {
        require(data.size >= 29) { "short" }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, data, 0, 12))
        return c.doFinal(data, 12, data.size - 12)
    }

    private fun hmac(key: ByteArray, text: String): ByteArray {
        val m = Mac.getInstance("HmacSHA256")
        m.init(SecretKeySpec(key, "HmacSHA256"))
        return m.doFinal(text.toByteArray())
    }

    private fun keyBytes(): ByteArray? = load().key?.let { unb64(it) }

    /** Makes a key when there is none. */
    fun create() {
        val s = load()
        if (s.key == null) save(s.copy(key = b64(random(32))))
    }

    /** Protected data: JSON text sealed under the link key, base64. Null without a key. */
    fun sealData(text: String): String? {
        val k = keyBytes() ?: return null
        return b64(seal(text.toByteArray(), k))
    }

    /** The other way round. Null without a key or when sealed under another key. */
    fun openData(text: String?): String? {
        val k = keyBytes() ?: return null
        if (text.isNullOrEmpty()) return null
        return try { String(open(unb64(text), k)) } catch (_: Exception) { null }
    }

    /** A key file for this key. With [cable] the file carries its own file key; otherwise the key stays here until used. */
    fun makeFile(cable: Boolean): String {
        create()
        var s = load()
        val id = random(8).joinToString("") { "%02x".format(it) }
        val w = random(32)
        val wrapped = b64(seal(keyBytes()!!, w))
        if (!cable) {
            val now = System.currentTimeMillis()
            s = s.copy(files = (s.files + (id to FileEntry(b64(w), now))).filterValues { now - it.at <= FILE_KEEP_MS })
            save(s)
        }
        return json.encodeToString(KeyFile(1, id, wrapped, if (cable) b64(w) else null))
    }

    fun readFile(text: String): Parsed? = try {
        val f = json.decodeFromString<KeyFile>(text)
        if (f.v != 1 || !Regex("^[0-9a-f]{16}$").matches(f.id)) null else Parsed(f.id, f.wrapped, f.w)
    } catch (_: Exception) { null }

    /** Unwraps the key of [file] with [w] (base64) and keeps it. False when [w] does not fit. */
    fun adopt(file: Parsed, w: String): Boolean = try {
        val k = open(unb64(file.wrapped), unb64(w))
        if (k.size != 32) false else { save(load().copy(key = b64(k))); true }
    } catch (_: Exception) { false }

    // ---- the one-time code; [linkSecret] is the 32-byte key of the PcTabs link ----
    fun proofOf(linkSecret: ByteArray, session: String, code: String) = b64(hmac(linkSecret, "proof|$session|$code"))
    private fun wrapKeyOf(linkSecret: ByteArray, session: String, code: String) = hmac(linkSecret, "wrap|$session|$code")

    /** Device that made the file: a new device asked for file [id]. Returns the code to show, or null when no such file exists. */
    @Synchronized
    fun request(session: String, id: String, now: Long = System.currentTimeMillis()): String? {
        if (!load().files.containsKey(id)) return null
        pending.values.removeAll { now > it.exp }
        val code = (rnd.nextInt(1_000_000)).toString().padStart(6, '0')
        pending[session] = Pending(id, code, now + CODE_MS, 0)
        return code
    }

    /** Device that made the file: the new device sent its proof. Returns the wrap to send back, or an error text. */
    @Synchronized
    fun answer(session: String, proof: String, linkSecret: ByteArray, now: Long = System.currentTimeMillis()): Pair<String?, String?> {
        val p = pending[session] ?: return null to "no code"
        if (now > p.exp) { pending.remove(session); return null to "expired" }
        if (++p.tries > MAX_TRIES) { pending.remove(session); return null to "too many tries" }
        val want = proofOf(linkSecret, session, p.code).toByteArray()
        if (!MessageDigest.isEqual(want, proof.toByteArray())) return null to "wrong code"
        pending.remove(session)
        val s = load()
        val entry = s.files[p.id] ?: return null to "no code"
        save(s.copy(files = s.files - p.id)) // one use
        return b64(seal(unb64(entry.w), wrapKeyOf(linkSecret, session, p.code))) to null
    }

    /** New device: opens the answer with the typed code. Returns W (base64) or null. */
    fun unwrapAnswer(wrap: String, linkSecret: ByteArray, session: String, code: String): String? = try {
        b64(open(unb64(wrap), wrapKeyOf(linkSecret, session, code.trim())))
    } catch (_: Exception) { null }

    @Synchronized
    fun forget() { pending.clear(); save(State()) }
}
