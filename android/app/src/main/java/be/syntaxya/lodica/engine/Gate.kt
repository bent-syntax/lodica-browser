package be.syntaxya.lodica.engine

import org.json.JSONObject
import java.security.SecureRandom

/** Device gate: a random per-device token sent as X-Lodica-Gate to the hosts the user lists. */
object Gate {
    private const val KEY = "deviceGate"

    /** The device token, created on first use. Null if the Keystore cannot hold it. */
    fun token(): String? {
        Secret.get(KEY)?.let { return it }
        val t = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        Secret.put(KEY, t)
        return Secret.get(KEY)
    }

    /** Hosts to send the token to, normalised. */
    fun hosts(raw: String): List<String> =
        raw.split(Regex("[,\\s]+")).map { it.trim().lowercase().replace(Regex("^[a-z][a-z0-9+.-]*://"), "").substringBefore('/').substringBefore('?').substringBefore('#').substringBefore(':').removePrefix("*.").trimStart('.').trimEnd('.') }
            .filter { it.matches(Regex("^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$")) }.distinct().take(50)

    /** Pushed to the background script. The token is only included when hosts are set. */
    fun config(): JSONObject {
        val h = hosts(Prefs.gatedHosts)
        val o = JSONObject().put("hosts", org.json.JSONArray(h))
        if (h.isNotEmpty()) token()?.let { o.put("token", it) }
        return o
    }

    /** Registers the token with the relay. Returns the pairing code, or an error message. */
    fun enroll(): Result<String> {
        if (!Relay.available) return Result.failure(Exception("No server linked"))
        val t = token() ?: return Result.failure(Exception("Secure storage unavailable"))
        val body = JSONObject().put("token", t).put("label", "Lodica Android " + android.os.Build.MODEL).toString()
        val (code, text) = Relay.request("POST", "/enroll", body.toByteArray(), "application/json")
        if (code == 429) return Result.failure(Exception("Too many attempts. Try again later."))
        if (code !in 200..299) return Result.failure(Exception("Server refused ($code)"))
        val c = runCatching { JSONObject(text).getString("code") }.getOrNull()
            ?: return Result.failure(Exception("Bad server reply"))
        return Result.success(c)
    }

    /** "pending", "approved" or "expired" for a pairing code, or null when the server can't be reached. */
    fun status(code: String): String? {
        val (c, text) = Relay.request("GET", "/enroll/" + android.net.Uri.encode(code))
        return if (c == 200) runCatching { JSONObject(text).getString("state") }.getOrNull() else null
    }
}
