package be.syntaxya.lodica.engine

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import be.syntaxya.lodica.BuildConfig
import be.syntaxya.lodica.R
import be.syntaxya.lodica.ui.MainActivity
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.SecureRandom
import java.time.Instant

/** One message delivered to a @your-domain alias, as served by the relay's /api/mail. */
@Serializable
data class Mail(
    val id: String,
    val alias: String = "",
    val to: String = "",
    val from: String = "",
    val subject: String = "",
    val date: String = "",
    val received: String = "",
    val text: String = "",
    val html: String? = null,
    val links: List<String> = emptyList(),
) {
    val receivedMs: Long get() = runCatching { Instant.parse(received).toEpochMilli() }.getOrDefault(0L)
}

/** A hidden address handed to a site. [address] is the full alias, e.g. `shop-x1y2z3@your-domain`. */
@Serializable
data class Alias(val address: String, val site: String, val created: Long = System.currentTimeMillis()) {
    val local: String get() = address.substringBefore('@')
}

/**
 * Client for the Lodica VPS relay: shared token, mail API, alias bookkeeping and the
 * "confirmation mail arrived" watch. Blocking HTTP calls must stay off the main thread.
 */
object Relay {
    private const val TAG = "LodicaRelay"
    private const val DEFAULT_DOMAIN = ""
    /** The relay's domain, as set up in the app. Empty until a server is linked. */
    var DOMAIN: String = DEFAULT_DOMAIN; private set
    /** True for relays installed before port 443 support: the API is on 44741 and the tunnel on 44742. */
    var legacyPorts = false; private set
    val API: String get() = "https://lodica.$DOMAIN" + if (legacyPorts) ":44741" else ""
    const val ACTION_MAIL = "be.syntaxya.lodica.MAIL"
    const val EXTRA_MAIL = "mail"
    private const val CHANNEL = "mail"
    private const val POLL_MS = 5_000L
    private const val WATCH_MS = 5 * 60_000L

    private var token: String = BuildConfig.RELAY_TOKEN
    /** False when the build carried no relay token: every VPS feature hides itself. */
    val available: Boolean get() = token.isNotEmpty()
    /** Bearer token for the helper extension's search page. */
    val apiToken: String get() = token
    val proxyAuth: String
        get() = if (!available) "" else
            "Basic " + Base64.encodeToString("lodica:$token".toByteArray(), Base64.NO_WRAP)

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private val rnd = SecureRandom()
    private val main = Handler(Looper.getMainLooper())
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var app: Context

    val aliases = mutableStateListOf<Alias>()
    val mails = mutableStateListOf<Mail>()
    var loading by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    /** Fresh confirmation mail for the in-app banner. */
    var incoming by mutableStateOf<Mail?>(null)
    /** Mail id the Inbox should open (set by the notification). */
    var selected by mutableStateOf<String?>(null)

    private val watches = HashMap<String, Job>()

    fun init(ctx: Context) {
        if (::app.isInitialized) return
        app = ctx.applicationContext
        val rp = app.getSharedPreferences("relay", Context.MODE_PRIVATE)
        rp.getString("domain", null)?.takeIf { validDomain(it) }?.let { DOMAIN = it }
        rp.getString("token", null)?.takeIf { it.length >= 16 }?.let { token = it }
        // Installs linked before port 443 existed keep using the old ports until the user re-links.
        legacyPorts = rp.getBoolean("legacy", rp.contains("domain") && !rp.contains("legacy"))
        if (rp.getBoolean("off", false)) token = ""
        val raw = app.getSharedPreferences("aliases", Context.MODE_PRIVATE).getString("list", null)
        if (raw != null) runCatching { aliases.addAll(json.decodeFromString<List<Alias>>(raw)) }
        removed.addAll(app.getSharedPreferences("aliases", Context.MODE_PRIVATE).getStringSet("removed", null).orEmpty())
        scope.launch { while (true) { checkUp(); delay(30_000) } }
    }

    /**
     * Whether the server answered its health check last time. While false, VPS routing is skipped and Lodica
     * Search falls back to a plain web search, so the browser keeps working with the server offline.
     */
    @Volatile var up: Boolean = true; private set

    private fun checkUp() {
        if (!available || DOMAIN.isEmpty()) return
        val ok = runCatching {
            val c = URL("$API/api/health").openConnection() as HttpURLConnection
            c.connectTimeout = 4000; c.readTimeout = 4000
            try { c.responseCode in 200..299 } finally { c.disconnect() }
        }.getOrDefault(false)
        if (ok != up) { up = ok; main.post { Helper.push() } }
    }

    // ---- Setup ------------------------------------------------------------------------------

    /** True once the user finished or skipped the first-run setup. Existing installs with a built-in server skip it. */
    var setupDone by mutableStateOf(false); private set

    fun loadSetup(ctx: Context) {
        val rp = ctx.applicationContext.getSharedPreferences("relay", Context.MODE_PRIVATE)
        setupDone = rp.getBoolean("setupDone", false) || available // existing linked installs skip the wizard
    }

    fun finishSetup() {
        app.getSharedPreferences("relay", Context.MODE_PRIVATE).edit().putBoolean("setupDone", true).apply()
        setupDone = true
    }

    fun reopenSetup() {
        app.getSharedPreferences("relay", Context.MODE_PRIVATE).edit().putBoolean("setupDone", false).apply()
        setupDone = false
    }

    fun validDomain(d: String) = Regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$").matches(d)

    /** Lower-cases and strips scheme, path and a leading lodica./tunnel. so pasted URLs still work. */
    fun cleanDomain(raw: String): String =
        raw.trim().lowercase().removePrefix("https://").removePrefix("http://").substringBefore('/')
            .removePrefix("lodica.").removePrefix("tunnel.")

    /** Saves the server. Main thread. Tells the helper extension so the tunnel and search follow. */
    fun configure(domain: String, newToken: String) {
        DOMAIN = domain
        token = newToken
        app.getSharedPreferences("relay", Context.MODE_PRIVATE).edit().putString("domain", domain).putString("token", newToken).putBoolean("off", false).putBoolean("legacy", probedLegacy).apply()
        legacyPorts = probedLegacy
        mails.clear(); error = null
        Helper.push()
        refresh()
    }

    /** Back to no server. Main thread. */
    fun disconnect() {
        DOMAIN = DEFAULT_DOMAIN
        token = ""
        app.getSharedPreferences("relay", Context.MODE_PRIVATE).edit().putString("domain", "").putString("token", "").putBoolean("off", true).apply()
        mails.clear()
        Helper.push()
    }

    private var probedLegacy = false

    /** Blocking. Null when the server answers and accepts the token, else a short reason. Tries port 443 first, then the old 44741. */
    fun check(domain: String, tok: String): String? {
        val first = checkAt(domain, tok, "")
        if (first == null) { probedLegacy = false; return null }
        val old = checkAt(domain, tok, ":44741")
        if (old == null) { probedLegacy = true; return null }
        return if (first.startsWith("The server is there")) first else old.takeIf { it.startsWith("The server is there") } ?: first
    }

    private fun checkAt(domain: String, tok: String, port: String): String? {
        val c = runCatching { URL("https://lodica.$domain$port/api/aliases").openConnection() as HttpURLConnection }.getOrNull()
            ?: return "That domain doesn't look right"
        return try {
            c.connectTimeout = 10_000; c.readTimeout = 10_000; c.useCaches = false
            c.setRequestProperty("Authorization", "Bearer $tok")
            when (val code = c.responseCode) {
                200 -> if (c.contentType.orEmpty().contains("json")) null else "That address is not a Lodica relay"
                401, 403 -> "The server is there, but the token is wrong"
                else -> "The server answered with $code"
            }
        } catch (e: javax.net.ssl.SSLException) {
            "HTTPS failed. DNS is probably not ready or the server has no valid certificate yet"
        } catch (e: java.net.UnknownHostException) {
            "lodica.$domain doesn't resolve yet. Check the DNS record"
        } catch (e: IOException) {
            "Can't reach lodica.$domain (${e.javaClass.simpleName}). Re-run the relay installer on the server so it serves port 443"
        } finally {
            c.disconnect()
        }
    }

    // ---- HTTP -------------------------------------------------------------------------------

    /** Blocking. Returns (status, body). Throws IOException on network failure. */
    fun request(method: String, path: String, body: ByteArray? = null, type: String? = null, readTimeoutMs: Int = 15_000): Pair<Int, String> {
        val (code, bytes) = requestBytes(method, path, body, type, readTimeoutMs)
        return code to bytes.toString(Charsets.UTF_8)
    }

    /** Same as [request] but returns the raw response body, for binary payloads. */
    fun requestBytes(method: String, path: String, body: ByteArray? = null, type: String? = null, readTimeoutMs: Int = 15_000): Pair<Int, ByteArray> {
        val c = URL(API + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 10_000
            c.readTimeout = readTimeoutMs
            c.useCaches = false
            c.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", type ?: "application/octet-stream")
                c.setFixedLengthStreamingMode(body.size)
                c.outputStream.use { it.write(body) }
            }
            val code = c.responseCode
            val stream = if (code >= 400) c.errorStream else c.inputStream
            val bytes = stream?.use { it.readBytes() } ?: ByteArray(0)
            return code to bytes
        } finally {
            c.disconnect()
        }
    }

    /** Uploads [body] in chunks so [progress] (0-100) can follow it. Returns the status and response text. */
    fun upload(path: String, body: ByteArray, progress: (Int) -> Unit): Pair<Int, String> {
        val c = URL(API + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 10_000
            c.readTimeout = 60_000
            c.useCaches = false
            c.setRequestProperty("Authorization", "Bearer $token")
            c.setRequestProperty("Content-Type", "application/octet-stream")
            c.doOutput = true
            c.setFixedLengthStreamingMode(body.size)
            c.outputStream.use { o ->
                var at = 0
                while (at < body.size) {
                    val n = minOf(32 * 1024, body.size - at)
                    o.write(body, at, n); at += n
                    progress(at * 100 / body.size)
                }
            }
            val code = c.responseCode
            val stream = if (code >= 400) c.errorStream else c.inputStream
            return code to (stream?.use { it.readBytes() } ?: ByteArray(0)).toString(Charsets.UTF_8)
        } finally {
            c.disconnect()
        }
    }

    /** Streams [size] bytes of [input] without holding them in memory. Returns the status and response text. */
    fun uploadStream(path: String, input: java.io.InputStream, size: Long, progress: (Int) -> Unit): Pair<Int, String> {
        val c = URL(API + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 10_000
            c.readTimeout = 120_000
            c.useCaches = false
            c.setRequestProperty("Authorization", "Bearer $token")
            c.setRequestProperty("Content-Type", "application/octet-stream")
            c.doOutput = true
            c.setFixedLengthStreamingMode(size)
            c.outputStream.use { o ->
                val buf = ByteArray(64 * 1024)
                var at = 0L; var last = -1
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    o.write(buf, 0, n); at += n
                    val p = (at * 100 / size).toInt()
                    if (p != last) { last = p; progress(p) }
                }
            }
            val code = c.responseCode
            val stream = if (code >= 400) c.errorStream else c.inputStream
            return code to (stream?.use { it.readBytes() } ?: ByteArray(0)).toString(Charsets.UTF_8)
        } finally {
            c.disconnect()
        }
    }

    /** Streams a GET into [out]. Returns the status; nothing is written unless it is 200. */
    fun downloadTo(path: String, out: java.io.OutputStream): Int {
        val c = URL(API + path).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000
            c.readTimeout = 60_000
            c.useCaches = false
            c.setRequestProperty("Authorization", "Bearer $token")
            val code = c.responseCode
            if (code == 200) c.inputStream.use { it.copyTo(out, 64 * 1024) } else c.errorStream?.close()
            return code
        } finally {
            c.disconnect()
        }
    }

    /** Blocking. Newest first. */
    fun fetch(alias: String? = null, since: Long? = null): List<Mail> {
        val q = buildList {
            alias?.let { add("alias=" + URLEncoder.encode(it, "UTF-8")) }
            since?.let { add("since=$it") }
        }.joinToString("&")
        val (code, body) = request("GET", "/api/mail" + if (q.isEmpty()) "" else "?$q")
        if (code != 200) throw IOException("mail $code")
        return json.decodeFromString<List<Mail>>(body)
    }

    // ---- Inbox ------------------------------------------------------------------------------

    /**
     * Blocking. The address list lives per account on the relay, so every browser shows every hidden
     * address. Pushes what only this device knows, applies pending removals, returns the relay's list.
     */
    private fun syncAliases(local: List<Alias>, gone: Set<String>): List<Alias>? {
        val (code, body) = request("GET", "/api/aliases")
        if (code != 200) return null
        val remote = json.decodeFromString<List<Alias>>(body)
        val have = remote.map { it.address.lowercase() }.toSet()
        val missing = local.filter { it.address.lowercase() !in have && it.address.lowercase() !in gone }
        if (missing.isNotEmpty()) request("POST", "/api/aliases", json.encodeToString(missing).toByteArray(), "application/json")
        for (g in gone) {
            val c = request("DELETE", "/api/aliases/" + Uri.encode(g.substringBefore('@'))).first
            if (c == 204 || c == 404) removed.remove(g)
        }
        saveRemoved()
        return remote.filter { it.address.lowercase() !in gone }
    }

    private val removed: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()

    private fun saveRemoved() {
        app.getSharedPreferences("aliases", Context.MODE_PRIVATE).edit().putStringSet("removed", HashSet(removed)).apply()
    }

    /** Blocking. Newest-wins sync of the custom theme. Returns the theme to adopt, or null when local is current. */
    private fun syncTheme(local: CustomTheme?): CustomTheme? {
        val (code, body) = request("GET", "/api/theme")
        val remote = if (code == 200) runCatching {
            val o = org.json.JSONObject(body)
            CustomTheme(o.getString("bg"), o.getString("text"), o.getString("accent"), o.getString("accent2"), o.optLong("at"))
                .takeIf { CustomTheme.valid(it.bg, it.text, it.accent, it.accent2) }
        }.getOrNull() else null
        if (remote != null && remote.at > (local?.at ?: 0L)) return remote
        if (local != null && local.at > (remote?.at ?: 0L)) {
            val o = org.json.JSONObject().put("bg", local.bg).put("text", local.text).put("accent", local.accent).put("accent2", local.accent2).put("at", local.at)
            request("PUT", "/api/theme", o.toString().toByteArray(), "application/json")
        }
        return null
    }

    /** Syncs the custom theme in the background; call after saving one. */
    fun syncThemeNow() {
        if (!available) return
        scope.launch {
            val adopt = runCatching { syncTheme(Prefs.customTheme) }.getOrNull() ?: return@launch
            withContext(Dispatchers.Main) { Prefs.updateCustomTheme(adopt) }
        }
    }

    fun refresh() {
        if (!available || loading) return
        loading = true
        val local = aliases.toList()
        val gone = removed.toSet()
        scope.launch {
            val synced = runCatching { syncAliases(local, gone) }.getOrNull()
            runCatching { syncTheme(Prefs.customTheme) }.getOrNull()?.let { withContext(Dispatchers.Main) { Prefs.updateCustomTheme(it) } }
            runCatching { Emojis.syncBlocking() }
            val r = runCatching { fetch() }
            withContext(Dispatchers.Main) {
                loading = false
                if (synced != null) {
                    val known = aliases.map { it.address.lowercase() }.toSet()
                    val extra = synced.filter { it.address.lowercase() !in known }
                    if (extra.isNotEmpty()) { aliases.addAll(extra); aliases.sortByDescending { it.created }; persist() }
                }
                r.onSuccess { list -> mails.clear(); mails.addAll(list); error = null; up = true }
                    .onFailure { e -> error = "Couldn't reach the relay"; up = false; Log.w(TAG, "fetch failed", e) }
            }
        }
    }

    fun delete(mail: Mail, done: (Boolean) -> Unit = {}) {
        scope.launch {
            val ok = runCatching { request("DELETE", "/api/mail/" + Uri.encode(mail.id)).first in 200..299 }
                .getOrDefault(false)
            withContext(Dispatchers.Main) {
                if (ok) { mails.removeAll { it.id == mail.id }; if (incoming?.id == mail.id) incoming = null }
                done(ok)
            }
        }
    }

    fun forget(alias: Alias) {
        aliases.removeAll { it.address == alias.address }
        watches.remove(alias.address)?.cancel()
        persist()
        if (available) {
            removed.add(alias.address.lowercase())
            saveRemoved()
            scope.launch {
                val c = runCatching { request("DELETE", "/api/aliases/" + Uri.encode(alias.local)).first }.getOrNull()
                if (c == 204 || c == 404) withContext(Dispatchers.Main) { removed.remove(alias.address.lowercase()); saveRemoved() }
            }
        }
    }

    fun siteOf(address: String): String? = aliases.firstOrNull { it.address.equals(address, true) }?.site

    // ---- Aliases ----------------------------------------------------------------------------

    /** `<site-slug>-<6 random>@your-domain`, remembered against [host]. Main thread. */
    fun newAlias(host: String): Alias {
        val base = host.lowercase().removePrefix("www.").removePrefix("m.")
        val parts = base.split('.').filter { it.isNotEmpty() }
        val name = (if (parts.size >= 2) parts[parts.size - 2] else parts.firstOrNull()).orEmpty()
        val slug = name.replace(Regex("[^a-z0-9]+"), "-").trim('-').take(40).ifEmpty { "site" }
        val abc = "abcdefghijklmnopqrstuvwxyz0123456789"
        val tail = (1..6).map { abc[rnd.nextInt(abc.length)] }.joinToString("")
        val a = Alias("$slug-$tail@$DOMAIN", base)
        aliases.add(0, a)
        persist()
        if (available) scope.launch {
            runCatching { request("POST", "/api/aliases", json.encodeToString(a).toByteArray(), "application/json") }
        }
        return a
    }

    private fun persist() {
        app.getSharedPreferences("aliases", Context.MODE_PRIVATE).edit()
            .putString("list", json.encodeToString(aliases.toList())).apply()
    }

    /** Polls for the first mail to [alias] for five minutes, then notifies. */
    fun watch(alias: Alias) {
        if (!available) return
        askNotifications()
        watches.remove(alias.address)?.cancel()
        val since = alias.created - 60_000
        watches[alias.address] = scope.launch {
            val end = System.currentTimeMillis() + WATCH_MS
            while (System.currentTimeMillis() < end) {
                delay(POLL_MS)
                val got = runCatching { fetch(alias.local, since) }.getOrNull()?.firstOrNull() ?: continue
                withContext(Dispatchers.Main) { arrived(alias, got) }
                break
            }
            withContext(Dispatchers.Main) { watches.remove(alias.address) }
        }
    }

    private fun arrived(alias: Alias, m: Mail) {
        if (mails.none { it.id == m.id }) mails.add(0, m)
        incoming = m
        notify(alias, m)
        codeOf(m)?.let { Helper.code(alias, it) }
    }

    /** `canva.com`, `bbc.co.uk`: the registrable part of [host], close enough without a suffix list. */
    fun baseDomain(host: String): String {
        val parts = host.lowercase().trim('.').split('.')
        if (parts.size <= 2 || host.contains(':') || host.all { it.isDigit() || it == '.' }) return host.lowercase()
        val n = if (parts.last().length == 2 && parts[parts.size - 2] in SLD) 3 else 2
        return parts.takeLast(n).joinToString(".")
    }

    private val SLD = setOf("co", "com", "org", "net", "ac", "gov", "edu", "ne", "or")

    /** The one-time code in a verification mail: 6 digits in the subject, then digits after a keyword. */
    fun codeOf(m: Mail): String? {
        val num = Regex("(?<![\\d.,:/-])(\\d{3}[ -]?\\d{3}|\\d{4,8})(?![\\d.,:/%-])")
        val key = Regex("code|otp|verif|pin|one.time", RegexOption.IGNORE_CASE)
        fun all(t: String) = num.findAll(t).map { it.value.replace(Regex("[ -]"), "") }
        all(m.subject).firstOrNull { it.length == 6 }?.let { return it }
        if (key.containsMatchIn(m.subject)) all(m.subject).firstOrNull { it.length in 4..8 }?.let { return it }
        val body = m.text.ifBlank { m.html.orEmpty().replace(Regex("<[^>]+>"), " ") }.replace(Regex("\\s+"), " ")
        key.findAll(body).forEach { k ->
            all(body.substring(k.range.last + 1, minOf(body.length, k.range.last + 160))).firstOrNull { it.length in 4..8 }?.let { return it }
        }
        return all(body).firstOrNull { it.length == 6 }
    }

    /** First link that looks like an account confirmation, else the first link at all. */
    fun confirmLink(m: Mail): String? {
        val web = m.links.filter { it.startsWith("https://") || it.startsWith("http://") }
        return web.firstOrNull { Regex("confirm|verif|activat|token", RegexOption.IGNORE_CASE).containsMatchIn(it) }
            ?: web.firstOrNull { !Regex("unsubscribe|privacy|terms|help", RegexOption.IGNORE_CASE).containsMatchIn(it) }
    }

    /** Whether a request for [url] would go through the tunnel. Mirrors helper/background.js. */
    fun routed(url: String): Boolean {
        if (!available || !Prefs.routeVps || !up) return false
        val u = runCatching { Uri.parse(url) }.getOrNull() ?: return false
        if (u.scheme != "http" && u.scheme != "https") return false
        val host = u.host?.lowercase() ?: return false
        if (host == "localhost" || host.endsWith(".local") || host == DOMAIN || host.endsWith(".$DOMAIN")) return false
        if (Regex("^(10|127|0)\\.|^192\\.168\\.|^172\\.(1[6-9]|2\\d|3[01])\\.|^169\\.254\\.").containsMatchIn(host)) return false
        if (host.startsWith("[") || host.contains(':')) return false
        if (DIRECT_HOSTS.any { host == it || host.endsWith(".$it") }) return false
        if (Prefs.direct.any { host == it || host.endsWith(".$it") }) return false
        return !(SENSITIVE.containsMatchIn(host) || SENSITIVE.containsMatchIn(u.path.orEmpty()))
    }

    private val SENSITIVE = Regex("(log-?in|sign-?in|sign-?on|oauth|sso|checkout|bank)|(^|[^a-z])(auth|account|pay)", RegexOption.IGNORE_CASE)
    private val DIRECT_HOSTS = listOf(
        "accounts.google.com", "accounts.youtube.com", "myaccount.google.com",
        "login.microsoftonline.com", "login.live.com", "login.microsoft.com",
        "appleid.apple.com", "idmsa.apple.com", "id.apple.com",
        "auth0.com", "okta.com", "onelogin.com", "paypal.com", "stripe.com", "pay.google.com",
        "itsme.be", "itsme-id.com",
    )

    // ---- Notifications ----------------------------------------------------------------------

    private fun askNotifications() {
        if (Build.VERSION.SDK_INT < 33) return
        if (ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        main.post { be.syntaxya.lodica.ui.Prompts.host?.requestAndroid(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) {} }
    }

    @SuppressLint("MissingPermission")
    private fun notify(alias: Alias, m: Mail) {
        val nm = NotificationManagerCompat.from(app)
        if (!nm.areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 26) {
            app.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "Confirmation mail", NotificationManager.IMPORTANCE_HIGH)
                    .apply { description = "Mail arriving at your hidden @$DOMAIN addresses" }
            )
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val code = m.id.hashCode()
        val view = Intent(app, MainActivity::class.java).setAction(ACTION_MAIL).putExtra(EXTRA_MAIL, m.id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val viewPi = PendingIntent.getActivity(app, code, view, flags)
        val site = m.from.substringAfterLast('<').substringBefore('>').ifBlank { alias.site }
        val b = NotificationCompat.Builder(app, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_mail)
            .setColor(0xFFF59E0B.toInt())
            .setContentTitle("Confirmation mail from ${alias.site}")
            .setContentText(m.subject.ifBlank { site })
            .setAutoCancel(true)
            .setContentIntent(viewPi)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_EMAIL)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        confirmLink(m)?.let { link ->
            val open = Intent(Intent.ACTION_VIEW, Uri.parse(link), app, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            b.addAction(0, "Open link", PendingIntent.getActivity(app, code + 1, open, flags))
        }
        b.addAction(0, "View mail", viewPi)
        runCatching { nm.notify(code, b.build()) }
    }
}
