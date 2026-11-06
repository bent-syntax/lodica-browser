package be.syntaxya.lodica.engine

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import org.json.JSONArray
import org.json.JSONObject
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Passphrase-protected copy of the passwords and authenticator keys, written to Documents/Lodica so it survives an uninstall.
 * The Keystore key that protects the live vault is deleted with the app, so the copy uses its own key derived from a passphrase
 * only the user knows (PBKDF2-SHA256, AES-256-GCM). The passphrase is never written to the file.
 */
object VaultBackup {
    const val NAME = "lodica-vault.lbk"
    private const val FOLDER = "Documents/Lodica"
    private val MAGIC = "LVB1".toByteArray()
    private const val ITER = 210_000

    private fun derive(pass: CharArray, salt: ByteArray): SecretKeySpec {
        val spec = PBEKeySpec(pass, salt, ITER, 256)
        val raw = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        spec.clearPassword()
        return SecretKeySpec(raw, "AES")
    }

    internal fun seal(json: String, pass: CharArray): ByteArray {
        val rnd = SecureRandom()
        val salt = ByteArray(16).also { rnd.nextBytes(it) }
        val iv = ByteArray(12).also { rnd.nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, derive(pass, salt), GCMParameterSpec(128, iv))
        return MAGIC + salt + iv + c.doFinal(json.toByteArray())
    }

    /** Null when the passphrase is wrong or the file is not a Lodica backup. */
    internal fun open(data: ByteArray, pass: CharArray): String? = runCatching {
        if (data.size < 4 + 16 + 12 + 16 || !data.copyOfRange(0, 4).contentEquals(MAGIC)) return null
        val salt = data.copyOfRange(4, 20); val iv = data.copyOfRange(20, 32)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, derive(pass, salt), GCMParameterSpec(128, iv))
        String(c.doFinal(data, 32, data.size - 32))
    }.getOrNull()

    private fun collect(done: (String?) -> Unit) {
        Vault.all().accept({ logins ->
            Vault.totpAll().accept({ totp ->
                val root = JSONObject().put("v", 1)
                root.put("logins", JSONArray().apply {
                    logins.orEmpty().forEach { l ->
                        put(JSONObject().put("origin", l.origin).put("formAction", l.formAction).put("realm", l.realm)
                            .put("username", l.username).put("password", l.password))
                    }
                })
                root.put("totp", JSONArray().apply {
                    totp.orEmpty().forEach { t ->
                        put(JSONObject().put("id", t.id).put("host", t.host).put("label", t.label).put("secret", t.secret)
                            .put("digits", t.digits).put("period", t.period).put("algo", t.algo))
                    }
                })
                done(root.toString())
            }, { done(null) })
        }, { done(null) })
    }

    /** Writes the backup. [done] gets null on success or a short error. Needs Android 10 or newer to write to Documents without a permission. */
    fun export(ctx: Context, pass: CharArray, done: (String?) -> Unit) {
        if (pass.size < 6) { done("Use a passphrase of at least 6 characters."); return }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { done("Backups to Documents need Android 10 or newer."); return }
        collect { json ->
            if (json == null) { done("Could not read the vault."); return@collect }
            val err = runCatching {
                val bytes = seal(json, pass)
                val res = ctx.contentResolver
                val coll = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                val existing = res.query(
                    coll, arrayOf(MediaStore.MediaColumns._ID),
                    "${MediaStore.MediaColumns.DISPLAY_NAME} = ? AND ${MediaStore.MediaColumns.RELATIVE_PATH} = ?",
                    arrayOf(NAME, "$FOLDER/"), null,
                )?.use { c -> if (c.moveToFirst()) android.content.ContentUris.withAppendedId(coll, c.getLong(0)) else null }
                val uri = existing ?: res.insert(coll, ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, NAME)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, FOLDER)
                }) ?: error("insert")
                res.openOutputStream(uri, "wt")!!.use { it.write(bytes) }
            }.exceptionOrNull()
            done(if (err == null) null else "Could not write to Documents/Lodica.")
        }
    }

    /** Reads a backup chosen by the user and merges it into the vault. [done] gets the number of items restored, or an error. */
    fun restore(ctx: Context, uri: Uri, pass: CharArray, done: (Int, String?) -> Unit) {
        val data = runCatching { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }.getOrNull()
        if (data == null) { done(0, "Could not read that file."); return }
        val json = open(data, pass)
        if (json == null) { done(0, "Wrong passphrase, or not a Lodica backup."); return }
        val n = runCatching {
            val root = JSONObject(json)
            var count = 0
            val logins = root.optJSONArray("logins") ?: JSONArray()
            for (i in 0 until logins.length()) {
                val o = logins.getJSONObject(i)
                Vault.save(null, o.getString("origin"), o.optString("formAction").ifEmpty { null },
                    o.optString("realm").ifEmpty { null }, o.getString("username"), o.getString("password"))
                count++
            }
            val totp = root.optJSONArray("totp") ?: JSONArray()
            for (i in 0 until totp.length()) {
                val o = totp.getJSONObject(i)
                Vault.totpAdd(TotpEntry(o.getString("id"), o.getString("host"), o.getString("label"), o.getString("secret"),
                    o.optInt("digits", 6), o.optInt("period", 30), o.optString("algo", "SHA1")))
                count++
            }
            count
        }.getOrElse { done(0, "The backup is damaged."); return }
        done(n, null)
    }

    /** Re-writes the backup when the user has set a passphrase. Called when the app goes to the background. */
    fun auto(ctx: Context) {
        val p = Secret.get("vaultBackupPass") ?: return
        export(ctx, p.toCharArray()) { }
    }
}
