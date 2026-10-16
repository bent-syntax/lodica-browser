package be.syntaxya.lodica.engine

import android.net.Uri
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** One authenticator entry. [secret] is the base32 text exactly as the site showed it (spaces and case removed). */
data class TotpEntry(
    val id: String,
    val host: String,
    val label: String,
    val secret: String,
    val digits: Int = 6,
    val period: Int = 30,
    val algo: String = "SHA1",
)

/** RFC 6238 time-based one-time passwords, the same codes Google Authenticator shows. */
object Totp {
    private const val B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    /** Base32 (RFC 4648) to bytes; null for empty or invalid text. Ignores spaces, dashes, case and padding. */
    fun decode(text: String): ByteArray? {
        val s = text.uppercase().filter { it != ' ' && it != '-' && it != '=' }
        if (s.isEmpty()) return null
        var buf = 0
        var bits = 0
        val out = java.io.ByteArrayOutputStream()
        for (ch in s) {
            val v = B32.indexOf(ch)
            if (v < 0) return null
            buf = (buf shl 5) or v
            bits += 5
            if (bits >= 8) { bits -= 8; out.write((buf shr bits) and 0xFF) }
        }
        return out.toByteArray().takeIf { it.isNotEmpty() }
    }

    fun clean(secret: String): String = secret.uppercase().filter { it != ' ' && it != '-' && it != '=' }

    /** The code for [e] at [nowMs], or null when the secret is not valid base32. */
    fun code(e: TotpEntry, nowMs: Long = System.currentTimeMillis()): String? {
        val key = decode(e.secret) ?: return null
        val algo = when (e.algo.uppercase()) { "SHA256" -> "HmacSHA256"; "SHA512" -> "HmacSHA512"; else -> "HmacSHA1" }
        val counter = nowMs / 1000 / e.period.coerceAtLeast(1)
        val msg = ByteArray(8) { i -> (counter shr (8 * (7 - i))).toByte() }
        val h = Mac.getInstance(algo).run { init(SecretKeySpec(key, algo)); doFinal(msg) }
        val o = h.last().toInt() and 0x0F
        val bin = ((h[o].toInt() and 0x7F) shl 24) or ((h[o + 1].toInt() and 0xFF) shl 16) or
            ((h[o + 2].toInt() and 0xFF) shl 8) or (h[o + 3].toInt() and 0xFF)
        var mod = 1L
        repeat(e.digits.coerceIn(6, 8)) { mod *= 10 }
        return (bin % mod).toString().padStart(e.digits.coerceIn(6, 8), '0')
    }

    /** Seconds left before the code for [e] changes. */
    fun remaining(e: TotpEntry, nowMs: Long = System.currentTimeMillis()): Int {
        val p = e.period.coerceAtLeast(1)
        return p - ((nowMs / 1000) % p).toInt()
    }

    /**
     * Reads either an otpauth://totp/Issuer:account?secret=...&issuer=... link or a bare base32 secret.
     * [host] is the site the codes belong to (used to autofill); it may be blank.
     */
    fun parse(input: String, host: String): TotpEntry? {
        val t = input.trim()
        if (t.startsWith("otpauth://", ignoreCase = true)) {
            val u = runCatching { Uri.parse(t) }.getOrNull() ?: return null
            if (!u.host.equals("totp", ignoreCase = true)) return null
            val secret = clean(u.getQueryParameter("secret").orEmpty())
            if (decode(secret) == null) return null
            val path = Uri.decode(u.path.orEmpty()).trim('/')
            val issuer = u.getQueryParameter("issuer") ?: path.substringBefore(':', "").trim()
            val account = path.substringAfter(':').trim()
            val label = listOf(issuer, account).filter { it.isNotEmpty() }.distinct().joinToString(" · ").ifEmpty { host.ifEmpty { "Account" } }
            return TotpEntry(
                id = java.util.UUID.randomUUID().toString(), host = host, label = label, secret = secret,
                digits = u.getQueryParameter("digits")?.toIntOrNull()?.takeIf { it in 6..8 } ?: 6,
                period = u.getQueryParameter("period")?.toIntOrNull()?.takeIf { it in 10..120 } ?: 30,
                algo = u.getQueryParameter("algorithm")?.uppercase()?.takeIf { it in setOf("SHA1", "SHA256", "SHA512") } ?: "SHA1",
            )
        }
        val secret = clean(t)
        if (decode(secret) == null) return null
        return TotpEntry(java.util.UUID.randomUUID().toString(), host, host.ifEmpty { "Account" }, secret)
    }
}
