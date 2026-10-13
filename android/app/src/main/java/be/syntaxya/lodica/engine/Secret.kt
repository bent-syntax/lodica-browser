package be.syntaxya.lodica.engine

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Small strings (API key, AI chats) encrypted with an AES-GCM key held in the Android Keystore. */
object Secret {
    private const val TAG = "LodicaSecret"
    private const val KEY_ALIAS = "lodica_secret"
    private lateinit var app: Context

    fun init(ctx: Context) { app = ctx.applicationContext }

    private fun sp() = app.getSharedPreferences("secret", Context.MODE_PRIVATE)

    fun get(name: String): String? = runCatching {
        val s = sp()
        val ct = s.getString("$name.ct", null) ?: return null
        val iv = s.getString("$name.iv", null) ?: return null
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        String(c.doFinal(Base64.decode(ct, Base64.NO_WRAP)), Charsets.UTF_8)
    }.onFailure { Log.w(TAG, "unreadable: ${it.javaClass.simpleName}") }.getOrNull()

    fun put(name: String, value: String?) {
        val e = sp().edit()
        if (value == null) { e.remove("$name.ct").remove("$name.iv").apply(); return }
        runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            val ct = c.doFinal(value.toByteArray(Charsets.UTF_8))
            e.putString("$name.ct", Base64.encodeToString(ct, Base64.NO_WRAP))
                .putString("$name.iv", Base64.encodeToString(c.iv, Base64.NO_WRAP)).apply()
        }.onFailure { Log.w(TAG, "not saved: ${it.javaClass.simpleName}") }
    }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        fun gen(strongBox: Boolean): SecretKey {
            val b = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
            if (Build.VERSION.SDK_INT >= 28) b.setIsStrongBoxBacked(strongBox)
            return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                .apply { init(b.build()) }.generateKey()
        }
        return runCatching { gen(true) }.getOrElse { gen(false) }
    }
}
