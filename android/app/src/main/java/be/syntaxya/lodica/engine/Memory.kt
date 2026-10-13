package be.syntaxya.lodica.engine

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * AI memory: short facts about the user, one per line. Stored encrypted with an AES-GCM key that lives in
 * the Android Keystore. Only ever sent to the local Claude Code bridge, never to the VPS.
 */
object Memory {
    private const val TAG = "LodicaMemory"
    private const val KEY_ALIAS = "lodica_memory"
    /** Characters of memory included in a prompt (about 100 tokens). */
    const val PROMPT_CHARS = 400
    private const val MAX_CHARS = 4000
    private lateinit var app: Context

    var text by mutableStateOf("")
        private set

    val facts: List<String> get() = text.lines().map { it.trim() }.filter { it.isNotEmpty() }

    fun init(ctx: Context) {
        app = ctx.applicationContext
        text = runCatching { load() }.getOrElse { Log.w(TAG, "memory unreadable: ${it.javaClass.simpleName}"); "" }
    }

    /** Adds a fact unless an equal one is already stored. */
    fun add(fact: String) {
        val f = fact.trim().replace('\n', ' ').take(200)
        if (f.isEmpty() || facts.any { it.equals(f, ignoreCase = true) }) return
        set((facts + f).joinToString("\n"))
    }

    fun set(v: String) {
        var t = v.trim()
        // Drop the oldest facts first when the store grows too large.
        while (t.length > MAX_CHARS && t.contains('\n')) t = t.substringAfter('\n')
        text = t.take(MAX_CHARS)
        save(text)
    }

    fun clear() {
        text = ""
        app.getSharedPreferences("memory", Context.MODE_PRIVATE).edit().clear().apply()
    }

    /** Newest facts that fit in [PROMPT_CHARS], oldest first. */
    fun prompt(): String {
        val out = ArrayDeque<String>()
        var n = 0
        for (f in facts.asReversed()) {
            if (n + f.length + 1 > PROMPT_CHARS) break
            out.addFirst(f); n += f.length + 1
        }
        return out.joinToString("\n")
    }

    private fun save(v: String) {
        val sp = app.getSharedPreferences("memory", Context.MODE_PRIVATE)
        if (v.isEmpty()) { sp.edit().clear().apply(); return }
        try {
            val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            val ct = c.doFinal(v.toByteArray())
            sp.edit()
                .putString("ct", Base64.encodeToString(ct, Base64.NO_WRAP))
                .putString("iv", Base64.encodeToString(c.iv, Base64.NO_WRAP))
                .apply()
        } catch (e: Exception) {
            Log.w(TAG, "memory not saved: ${e.javaClass.simpleName}")
        }
    }

    private fun load(): String {
        val sp = app.getSharedPreferences("memory", Context.MODE_PRIVATE)
        val ct = sp.getString("ct", null) ?: return ""
        val iv = sp.getString("iv", null) ?: return ""
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        return String(c.doFinal(Base64.decode(ct, Base64.NO_WRAP)))
    }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        fun gen(strongBox: Boolean, unlocked: Boolean): SecretKey {
            val b = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
            if (Build.VERSION.SDK_INT >= 28) {
                b.setIsStrongBoxBacked(strongBox)
                b.setUnlockedDeviceRequired(unlocked)
            }
            return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                .apply { init(b.build()) }.generateKey()
        }
        var last: Exception? = null
        for ((sb, ul) in listOf(true to true, false to true, false to false)) {
            try { return gen(sb, ul) } catch (e: Exception) { last = e }
        }
        throw IllegalStateException("keystore unavailable", last)
    }
}
