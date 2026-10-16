package be.syntaxya.lodica.engine

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import android.util.Log
import net.zetetic.database.sqlcipher.SQLiteDatabase
import org.mozilla.geckoview.Autocomplete
import org.mozilla.geckoview.GeckoResult
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class SavedLogin(
    val guid: String,
    val origin: String,
    val formAction: String?,
    val realm: String?,
    val username: String,
    val password: String,
    val timesUsed: Int,
)

/**
 * Encrypted login store. The SQLCipher key is 32 random bytes, wrapped by an
 * AES-GCM key that lives in the Android Keystore and never leaves the device.
 * Nothing here is backed up or sent anywhere.
 */
object Vault : Autocomplete.StorageDelegate {
    private const val TAG = "LodicaVault"
    private const val KEY_ALIAS = "lodica_vault"
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "lodica-vault") }
    private lateinit var app: Context
    private var db: SQLiteDatabase? = null

    fun init(ctx: Context) {
        app = ctx.applicationContext
    }

    private fun keystoreKey(): SecretKey {
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
        val attempts = listOf(true to true, false to true, false to false)
        var last: Exception? = null
        for ((sb, ul) in attempts) {
            try { return gen(sb, ul) } catch (e: StrongBoxUnavailableException) { last = e } catch (e: Exception) { last = e }
        }
        throw IllegalStateException("keystore unavailable", last)
    }

    private fun dbKey(): ByteArray {
        val sp = app.getSharedPreferences("vault", Context.MODE_PRIVATE)
        val key = keystoreKey()
        val wrapped = sp.getString("k", null)
        val iv = sp.getString("iv", null)
        if (wrapped != null && iv != null) {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            return c.doFinal(Base64.decode(wrapped, Base64.NO_WRAP))
        }
        val raw = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key)
        val ct = c.doFinal(raw)
        sp.edit()
            .putString("k", Base64.encodeToString(ct, Base64.NO_WRAP))
            .putString("iv", Base64.encodeToString(c.iv, Base64.NO_WRAP))
            .commit()
        return raw
    }

    /** Must run on [io]. */
    private fun open(): SQLiteDatabase {
        db?.let { return it }
        System.loadLibrary("sqlcipher")
        val raw = dbKey()
        val hex = raw.joinToString("") { "%02x".format(it) }
        raw.fill(0)
        // Raw key syntax skips the passphrase KDF; the key is already random.
        val pass = "x'$hex'".toByteArray()
        val file = File(app.noBackupFilesDir, "vault.db")
        val d = SQLiteDatabase.openOrCreateDatabase(file, pass, null, null)
        pass.fill(0)
        d.execSQL(
            "CREATE TABLE IF NOT EXISTS logins(guid TEXT PRIMARY KEY, origin TEXT NOT NULL, form_action TEXT, " +
                "realm TEXT, username TEXT NOT NULL, password TEXT NOT NULL, created INTEGER, used INTEGER, times_used INTEGER DEFAULT 0)"
        )
        d.execSQL("CREATE INDEX IF NOT EXISTS logins_origin ON logins(origin)")
        d.execSQL(
            "CREATE TABLE IF NOT EXISTS totp(id TEXT PRIMARY KEY, host TEXT NOT NULL, label TEXT NOT NULL, secret TEXT NOT NULL, " +
                "digits INTEGER DEFAULT 6, period INTEGER DEFAULT 30, algo TEXT DEFAULT 'SHA1', created INTEGER)"
        )
        db = d
        return d
    }

    private fun <T> async(fallback: T, block: (SQLiteDatabase) -> T): GeckoResult<T> {
        val r = GeckoResult<T>()
        io.execute {
            val v = try { block(open()) } catch (e: Exception) {
                Log.w(TAG, "vault op failed: ${e.javaClass.simpleName}")
                fallback
            }
            r.complete(v)
        }
        return r
    }

    private fun hostOf(origin: String): String = Uri.parse(origin).host ?: origin

    private fun query(d: SQLiteDatabase, where: String?, args: Array<String>?): List<SavedLogin> {
        val out = ArrayList<SavedLogin>()
        d.rawQuery(
            "SELECT guid, origin, form_action, realm, username, password, times_used FROM logins" +
                (if (where != null) " WHERE $where" else "") + " ORDER BY used DESC",
            args ?: emptyArray(),
        ).use { c ->
            while (c.moveToNext()) out += SavedLogin(
                c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4), c.getString(5), c.getInt(6),
            )
        }
        return out
    }

    private fun SavedLogin.toEntry(): Autocomplete.LoginEntry = Autocomplete.LoginEntry.Builder()
        .guid(guid).origin(origin).formActionOrigin(formAction).httpRealm(realm)
        .username(username).password(password).build()

    // --- GeckoView storage delegate ---

    override fun onLoginFetch(domain: String): GeckoResult<Array<Autocomplete.LoginEntry>> = async(emptyArray()) { d ->
        query(d, null, null)
            .filter { val h = hostOf(it.origin); h == domain || h.endsWith(".$domain") || domain.endsWith(".$h") }
            .map { it.toEntry() }.toTypedArray()
    }

    override fun onLoginFetch(): GeckoResult<Array<Autocomplete.LoginEntry>> = async(emptyArray()) { d ->
        query(d, null, null).map { it.toEntry() }.toTypedArray()
    }

    override fun onLoginSave(login: Autocomplete.LoginEntry) {
        save(login.guid, login.origin, login.formActionOrigin, login.httpRealm, login.username, login.password)
    }

    override fun onLoginUsed(login: Autocomplete.LoginEntry, usedFields: Int) {
        val guid = login.guid ?: return
        async(Unit) { d ->
            d.execSQL("UPDATE logins SET used = ?, times_used = times_used + 1 WHERE guid = ?", arrayOf<Any>(System.currentTimeMillis(), guid))
        }
    }

    // --- app API ---

    fun save(guid: String?, origin: String, formAction: String?, realm: String?, username: String, password: String) {
        async(Unit) { d ->
            val now = System.currentTimeMillis()
            // Same origin + username replaces the old entry instead of duplicating it.
            val id = guid ?: query(d, "origin = ? AND username = ?", arrayOf(origin, username)).firstOrNull()?.guid
                ?: UUID.randomUUID().toString()
            val cv = ContentValues().apply {
                put("guid", id); put("origin", origin); put("form_action", formAction); put("realm", realm)
                put("username", username); put("password", password); put("used", now)
            }
            if (d.update("logins", cv, "guid = ?", arrayOf(id)) == 0) {
                cv.put("created", now)
                d.insert("logins", null, cv)
            }
        }
    }

    fun all(): GeckoResult<List<SavedLogin>> = async(emptyList()) { d -> query(d, null, null) }

    fun hasLoginFor(host: String): GeckoResult<Boolean> = async(false) { d ->
        query(d, null, null).any { val h = hostOf(it.origin); h == host || h.endsWith(".$host") || host.endsWith(".$h") }
    }

    /** True when this exact username and password are already stored for the site. */
    fun has(origin: String, username: String, password: String): GeckoResult<Boolean> = async(false) { d ->
        val host = hostOf(origin)
        query(d, null, null).any {
            val h = hostOf(it.origin)
            (h == host || h.endsWith(".$host") || host.endsWith(".$h")) && it.username == username && it.password == password
        }
    }

    fun delete(guid: String): GeckoResult<Unit> = async(Unit) { d -> d.delete("logins", "guid = ?", arrayOf(guid)); Unit }

    // ---- Authenticator (TOTP) secrets, in the same encrypted database --------------------------------

    fun totpAll(): GeckoResult<List<TotpEntry>> = async(emptyList()) { d ->
        val out = ArrayList<TotpEntry>()
        d.rawQuery("SELECT id, host, label, secret, digits, period, algo FROM totp ORDER BY label COLLATE NOCASE", emptyArray()).use { c ->
            while (c.moveToNext()) out += TotpEntry(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getInt(4), c.getInt(5), c.getString(6))
        }
        out
    }

    fun totpAdd(e: TotpEntry): GeckoResult<Unit> = async(Unit) { d ->
        val cv = ContentValues().apply {
            put("id", e.id); put("host", e.host); put("label", e.label); put("secret", e.secret)
            put("digits", e.digits); put("period", e.period); put("algo", e.algo); put("created", System.currentTimeMillis())
        }
        d.insertWithOnConflict("totp", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
        Unit
    }

    fun totpDelete(id: String): GeckoResult<Unit> = async(Unit) { d -> d.delete("totp", "id = ?", arrayOf(id)); Unit }

    /** Entries whose site matches [host] (same site or a subdomain either way), for autofilling a code field. */
    fun totpFor(host: String): GeckoResult<List<TotpEntry>> = async(emptyList()) { d ->
        val out = ArrayList<TotpEntry>()
        d.rawQuery("SELECT id, host, label, secret, digits, period, algo FROM totp WHERE host <> ''", emptyArray()).use { c ->
            while (c.moveToNext()) {
                val h = c.getString(1)
                if (h == host || host.endsWith(".$h") || h.endsWith(".$host"))
                    out += TotpEntry(c.getString(0), h, c.getString(2), c.getString(3), c.getInt(4), c.getInt(5), c.getString(6))
            }
        }
        out
    }
}
