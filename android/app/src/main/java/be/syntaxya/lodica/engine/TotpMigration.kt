package be.syntaxya.lodica.engine

/**
 * Decoder for Google Authenticator's export link: otpauth-migration://offline?data=<base64 protobuf>.
 * Never logs or throws on bad input; secrets stay in the returned entries only.
 */
object TotpMigration {
    private const val B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    fun isLink(text: String) = text.trim().startsWith("otpauth-migration://", ignoreCase = true)

    /** Entries in the link, or null when it is not a valid export. HOTP entries are skipped. */
    fun parse(link: String, host: String = ""): List<TotpEntry>? {
        val t = link.trim()
        if (!isLink(t)) return null
        val q = t.substringAfter('?', "").substringBefore('#')
        val raw = q.split('&').firstOrNull { it.startsWith("data=") }?.removePrefix("data=") ?: return null
        val data = decodeB64(java.net.URLDecoder.decode(raw.replace("+", "%2B"), "UTF-8")) ?: return null
        return runCatching { payload(data, host) }.getOrNull()?.takeIf { it.isNotEmpty() }
    }

    private fun decodeB64(s: String): ByteArray? {
        val clean = s.trim().replace('-', '+').replace('_', '/').trimEnd('=')
        return runCatching { java.util.Base64.getDecoder().decode(clean) }.getOrNull()
    }

    private class Reader(val b: ByteArray) {
        var i = 0
        val more get() = i < b.size
        fun varint(): Long {
            var r = 0L; var s = 0
            while (true) {
                require(i < b.size && s < 64)
                val x = b[i++].toInt()
                r = r or ((x and 0x7F).toLong() shl s)
                if (x and 0x80 == 0) return r
                s += 7
            }
        }
        fun bytes(): ByteArray {
            val n = varint().toInt()
            require(n >= 0 && i + n <= b.size)
            return b.copyOfRange(i, i + n).also { i += n }
        }
        fun skip(wire: Int) {
            when (wire) { 0 -> varint(); 1 -> i += 8; 2 -> bytes(); 5 -> i += 4; else -> error("wire") }
            require(i <= b.size)
        }
    }

    private fun payload(data: ByteArray, host: String): List<TotpEntry> {
        val out = ArrayList<TotpEntry>()
        val r = Reader(data)
        while (r.more) {
            val tag = r.varint().toInt()
            if (tag shr 3 == 1 && tag and 7 == 2) otp(r.bytes(), host)?.let(out::add) else r.skip(tag and 7)
        }
        return out
    }

    private fun otp(b: ByteArray, host: String): TotpEntry? {
        val r = Reader(b)
        var secret = ByteArray(0); var name = ""; var issuer = ""
        var algo = 1; var digits = 1; var type = 2
        while (r.more) {
            val tag = r.varint().toInt()
            when (tag) {
                0x0A -> secret = r.bytes()
                0x12 -> name = String(r.bytes(), Charsets.UTF_8)
                0x1A -> issuer = String(r.bytes(), Charsets.UTF_8)
                0x20 -> algo = r.varint().toInt()
                0x28 -> digits = r.varint().toInt()
                0x30 -> type = r.varint().toInt()
                else -> r.skip(tag and 7)
            }
        }
        if (type != 2 || secret.isEmpty()) return null
        val label = listOf(issuer, name.substringAfter(':').trim()).filter { it.isNotEmpty() }.distinct().joinToString(" · ")
            .ifEmpty { name.ifEmpty { "Account" } }
        return TotpEntry(
            id = java.util.UUID.randomUUID().toString(), host = host, label = label, secret = base32(secret),
            digits = if (digits == 2) 8 else 6,
            period = 30,
            algo = when (algo) { 2 -> "SHA256"; 3 -> "SHA512"; else -> "SHA1" },
        )
    }

    fun base32(b: ByteArray): String {
        val sb = StringBuilder()
        var buf = 0; var bits = 0
        for (x in b) {
            buf = (buf shl 8) or (x.toInt() and 0xFF); bits += 8
            while (bits >= 5) { bits -= 5; sb.append(B32[(buf shr bits) and 31]) }
            buf = buf and ((1 shl bits) - 1)
        }
        if (bits > 0) sb.append(B32[(buf shl (5 - bits)) and 31])
        return sb.toString()
    }
}
