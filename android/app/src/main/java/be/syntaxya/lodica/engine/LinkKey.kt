package be.syntaxya.lodica.engine

import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.KeyAgreement
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * The link key: one random 256-bit key that protects the passwords and authenticator keys shared between linked devices.
 * Same protocol as desktop/main/linkkey.js. It moves to a new device with an ECDH (P-256) exchange that the device which
 * showed the linking code confirms. PcTabs carries the messages; the server only sees public keys and the wrapped key.
 */
object LinkKey {
    @Serializable
    private data class State(val key: String? = null)

    /** A one-off key pair. [pub] is SPKI DER in base64. */
    class Pair(val pub: String, val priv: PrivateKey)

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = false }
    private val rnd = SecureRandom()
    private var state = State()
    private var loaded = false

    /** True when this device holds the link key. */
    var hasKey by mutableStateOf(false)
        private set

    @Synchronized
    private fun load(): State {
        if (loaded) return state
        val text = Secret.get("linkkey")
        // A stored key that cannot be read right now (keystore busy after boot) must not look like "no key",
        // or create() would replace it. Try again on the next call.
        if (text == null && Secret.has("linkkey")) return state
        loaded = true
        state = try { text?.let { json.decodeFromString<State>(it) } ?: State() } catch (_: Exception) { State() }
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

    /** Makes a key when there is none. Never when a stored key is only unreadable for now. */
    fun create() {
        val s = load()
        if (loaded && s.key == null) save(s.copy(key = b64(random(32))))
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

    // ---- moving the key (ECDH P-256) ----
    fun newPair(): Pair {
        val g = KeyPairGenerator.getInstance("EC")
        g.initialize(ECGenParameterSpec("secp256r1"))
        val kp = g.generateKeyPair()
        return Pair(b64(kp.public.encoded), kp.private)
    }

    private fun wrapKeyOf(priv: PrivateKey, peerPub: String): ByteArray {
        val pk = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(unb64(peerPub)))
        val ka = KeyAgreement.getInstance("ECDH")
        ka.init(priv)
        ka.doPhase(pk, true)
        return hmac(ka.generateSecret(), "lodica-link-key")
    }

    /** Origin: wraps the link key for the device that sent [peerPub]. Returns (pub, wrap), or null when this device has no key. */
    fun wrapFor(peerPub: String): kotlin.Pair<String, String>? = try {
        keyBytes() ?: throw IllegalStateException("no key")
        val mine = newPair()
        mine.pub to b64(seal(keyBytes()!!, wrapKeyOf(mine.priv, peerPub)))
    } catch (_: Exception) { null }

    /** New device: opens the answer with its private key and keeps the key. */
    fun adoptWrapped(priv: PrivateKey, peerPub: String, wrap: String): Boolean = try {
        val k = open(unb64(wrap), wrapKeyOf(priv, peerPub))
        if (k.size != 32) false else { save(load().copy(key = b64(k))); true }
    } catch (_: Exception) { false }

    /** Four digits both devices can compare, from the two public keys. */
    fun fingerprint(joinerPub: String, originPub: String): String {
        val h = MessageDigest.getInstance("SHA-256").digest("$joinerPub|$originPub".toByteArray())
        val n = ((h[0].toLong() and 0xff) shl 24) or ((h[1].toLong() and 0xff) shl 16) or ((h[2].toLong() and 0xff) shl 8) or (h[3].toLong() and 0xff)
        return (n % 10000).toString().padStart(4, '0')
    }

    /** Four digits that name the key, so two devices can see they hold the same one. Null without a key. */
    fun keyId(): String? {
        val k = keyBytes() ?: return null
        val md = MessageDigest.getInstance("SHA-256")
        md.update("lodica-keyid|".toByteArray())
        val h = md.digest(k)
        val n = ((h[0].toLong() and 0xff) shl 24) or ((h[1].toLong() and 0xff) shl 16) or ((h[2].toLong() and 0xff) shl 8) or (h[3].toLong() and 0xff)
        return (n % 10000).toString().padStart(4, '0')
    }

    @Synchronized
    fun forget() { save(State()) }
}
