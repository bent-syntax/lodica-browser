package be.syntaxya.lodica.engine

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

enum class SearchEngine(val label: String, val query: String, val suggest: String?) {
    DUCKDUCKGO("DuckDuckGo", "https://duckduckgo.com/?q=%s", "https://duckduckgo.com/ac/?type=list&q=%s"),
    STARTPAGE("Startpage", "https://www.startpage.com/do/search?q=%s", null),
    BRAVE("Brave", "https://search.brave.com/search?q=%s", null),
    GOOGLE("Google", "https://www.google.com/search?q=%s", null),
    /** SearXNG on the VPS, rendered by the helper extension's search page; falls back to DuckDuckGo. */
    LODICA("Lodica Search", "", null),
}

enum class UserAgent(val label: String, val value: String?) {
    DEFAULT("Lodica (default)", null),
    CHROME_ANDROID("Chrome on Android", "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36"),
    SAFARI_IPHONE("Safari on iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1"),
    CHROME_DESKTOP("Chrome on Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"),
    FIREFOX_DESKTOP("Firefox on Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0"),
}

/** Language pages are asked for: sets Accept-Language and Google's hl parameter. */
enum class Language(val label: String, val code: String, val accept: Array<String>) {
    EN("English", "en", arrayOf("en-US", "en")),
    NL("Nederlands", "nl", arrayOf("nl-BE", "nl", "en")),
}

/** User-made theme: four #RRGGBB colours plus the time they were last changed, so devices can sync newest-wins. */
data class CustomTheme(val bg: String, val text: String, val accent: String, val accent2: String, val at: Long) {
    companion object {
        private val HEX = Regex("^#[0-9a-fA-F]{6}$")
        fun valid(vararg c: String) = c.all { HEX.matches(it) }
    }
}

/** App preferences, observable from Compose. */
object Prefs {
    private lateinit var sp: SharedPreferences

    var search by mutableStateOf(SearchEngine.DUCKDUCKGO); private set
    var darkPages by mutableStateOf(true); private set
    var httpsOnly by mutableStateOf(true); private set
    var dummyLogin by mutableStateOf(true); private set
    /** The user's own names, one per line: "name target". [name] may be ".tld" or "*.suffix"; [target] is a host, IP or URL. */
    var dnsRules by mutableStateOf(""); private set
    /** Start-page shortcuts the user added: one "url<TAB>name" per line. */
    var quickSites by mutableStateOf(""); private set
    var quickAuto by mutableStateOf(true); private set
    /** Own DNS-over-HTTPS server; blank keeps the built-in one. */
    var dnsServer by mutableStateOf(""); private set
    var autoArchiveDays by mutableStateOf(14); private set
    var desktopDefault by mutableStateOf(false); private set
    var routeVps by mutableStateOf(false); private set
    /** Base domains the user signed in or up on. Always loaded direct, never through the VPS. */
    var direct by mutableStateOf<Set<String>>(emptySet()); private set

    var cookieReject by mutableStateOf(true); private set
    /** Sites where the "use dummy mail" chip is hidden. */
    /** The user-made theme, or null until one is saved. Used when [theme] is "custom". */
    var customTheme by mutableStateOf<CustomTheme?>(null); private set
    var noDummy by mutableStateOf<Set<String>>(emptySet()); private set
    /** Home-screen search widget: hint text and corner shape ("pill", "rounded", "square"). */
    var widgetText by mutableStateOf(""); private set
    var widgetShape by mutableStateOf("pill"); private set
    var speed by mutableStateOf(1f); private set
    val QUALITIES = listOf(144, 240, 360, 480, 720, 1080, 1440, 2160)
    /** Default YouTube quality as a height in pixels; [qualities] overrides it per host. */
    var quality by mutableStateOf(720); private set
    var qualities by mutableStateOf<Map<String, Int>>(emptyMap()); private set
    var userAgent by mutableStateOf(UserAgent.DEFAULT); private set
    /** Hosts opened in lite mode: no images, media, fonts or scripts. */
    var lite by mutableStateOf<Set<String>>(emptySet()); private set
    /** Hosts in compatibility mode: no fingerprinting protection or user-agent spoof, so bot checks pass. */
    var compat by mutableStateOf<Set<String>>(emptySet()); private set
    var language by mutableStateOf(Language.EN); private set
    /** UI theme key: "system" or a palette key from ui.theme.Palettes. */
    var theme by mutableStateOf("dark"); private set
    /** Suggest history pages and past searches in the address bar. Local only. */
    var historySuggest by mutableStateOf(true); private set
    /** Start page background kind: "none", "gradient", "image" or "color". */
    var startBg by mutableStateOf("none"); private set
    /** Gradient key, or colour as #RRGGBB, depending on [startBg]. The image lives in the app files dir. */
    var startBgValue by mutableStateOf(""); private set
    var startDim by mutableStateOf(0.3f); private set
    var startBlur by mutableStateOf(0f); private set
    /** Bumped when the custom start image file is replaced, so the start page reloads it. */
    var startImageRev by mutableStateOf(0); private set
    /** Gesture toggles for the Keybinds and controls section. */
    var gestureSwipeTabs by mutableStateOf(true); private set
    var gestureBarHide by mutableStateOf(true); private set
    /** Chosen action per gesture slot (see GestureSlot); missing means the slot's default. */
    var gestureActions by mutableStateOf<Map<String, String>>(emptyMap()); private set

    private var appCtx: Context? = null

    fun init(ctx: Context) {
        if (::sp.isInitialized) return
        sp = ctx.getSharedPreferences("prefs", Context.MODE_PRIVATE)
        appCtx = ctx.applicationContext
        search = runCatching { SearchEngine.valueOf(sp.getString("search", "")!!) }.getOrDefault(SearchEngine.DUCKDUCKGO)
        darkPages = sp.getBoolean("darkPages", true)
        httpsOnly = sp.getBoolean("httpsOnly", true)
        dummyLogin = sp.getBoolean("dummyLogin", true)
        dnsRules = sp.getString("dnsRules", "") ?: ""
        quickSites = sp.getString("quickSites", "") ?: ""
        quickAuto = sp.getBoolean("quickAuto", true)
        dnsServer = sp.getString("dnsServer", "") ?: ""
        autoArchiveDays = sp.getInt("autoArchiveDays", 14)
        desktopDefault = sp.getBoolean("desktopDefault", false)
        routeVps = sp.getBoolean("routeVps", false)
        direct = sp.getStringSet("direct", emptySet())!!.toSet()
        cookieReject = sp.getBoolean("cookieReject", true)
        customTheme = sp.getString("customTheme", null)?.split(',')?.takeIf { it.size == 5 && CustomTheme.valid(it[0], it[1], it[2], it[3]) }
            ?.let { CustomTheme(it[0], it[1], it[2], it[3], it[4].toLongOrNull() ?: 0L) }
        noDummy = sp.getStringSet("noDummy", emptySet())!!.toSet()
        widgetText = sp.getString("widgetText", "") ?: ""
        widgetShape = sp.getString("widgetShape", "pill") ?: "pill"
        // The old "Force dark" switch is merged into "Dark pages".
        if (sp.getBoolean("forceDark", false)) { darkPages = true; sp.edit().putBoolean("darkPages", true).remove("forceDark").apply() }
        speed = sp.getFloat("speed", 1f)
        quality = sp.getInt("quality", 720)
        qualities = sp.getStringSet("qualities", emptySet())!!.mapNotNull { e ->
            val (h, v) = e.split('=', limit = 2).takeIf { it.size == 2 } ?: return@mapNotNull null
            v.toIntOrNull()?.let { h to it }
        }.toMap()
        userAgent = runCatching { UserAgent.valueOf(sp.getString("userAgent", "")!!) }.getOrDefault(UserAgent.DEFAULT)
        lite = sp.getStringSet("lite", emptySet())!!.toSet()
        compat = sp.getStringSet("compat", emptySet())!!.toSet()
        language = runCatching { Language.valueOf(sp.getString("language", "")!!) }.getOrDefault(Language.EN)
        theme = sp.getString("theme", "dark")!!
        historySuggest = sp.getBoolean("historySuggest", true)
        startBg = sp.getString("startBg", "none")!!
        startBgValue = sp.getString("startBgValue", "")!!
        startDim = sp.getFloat("startDim", 0.3f)
        startBlur = sp.getFloat("startBlur", 0f)
        gestureSwipeTabs = sp.getBoolean("gestureSwipeTabs", true)
        gestureBarHide = sp.getBoolean("gestureBarHide", true)
        gestureActions = sp.getString("gestureActions", "")!!.split(',').mapNotNull { e ->
            e.split('=', limit = 2).takeIf { it.size == 2 && it[0].isNotBlank() }?.let { it[0] to it[1] }
        }.toMap()
    }

    /** Redraws every placed home-screen widget. */
    fun refreshWidgets(c: android.content.Context) {
        be.syntaxya.lodica.ui.SearchWidget.refresh(c)
        be.syntaxya.lodica.ui.ShortcutsWidget.refresh(c)
        be.syntaxya.lodica.ui.SitesWidget.refresh(c)
    }
    fun updateTheme(v: String) { theme = v; sp.edit().putString("theme", v).apply(); Helper.push(); appCtx?.let { refreshWidgets(it) } }
    fun updateWidget(text: String, shape: String) {
        widgetText = text.take(40); widgetShape = shape
        sp.edit().putString("widgetText", widgetText).putString("widgetShape", shape).apply()
    }
    fun updateCustomTheme(c: CustomTheme?) {
        customTheme = c
        sp.edit().apply { if (c == null) remove("customTheme") else putString("customTheme", "${c.bg},${c.text},${c.accent},${c.accent2},${c.at}") }.apply()
        Helper.push()
    }
    fun updateHistorySuggest(v: Boolean) { historySuggest = v; sp.edit().putBoolean("historySuggest", v).apply() }
    fun updateStartBg(kind: String, value: String = "") {
        startBg = kind; startBgValue = value
        sp.edit().putString("startBg", kind).putString("startBgValue", value).apply()
    }
    fun updateStartDim(v: Float) { startDim = v; sp.edit().putFloat("startDim", v).apply() }
    fun updateStartBlur(v: Float) { startBlur = v; sp.edit().putFloat("startBlur", v).apply() }
    fun touchStartImage() { startImageRev++ }
    fun updateGestureSwipeTabs(v: Boolean) { gestureSwipeTabs = v; sp.edit().putBoolean("gestureSwipeTabs", v).apply() }
    fun updateGestureAction(slot: String, action: String) {
        gestureActions = gestureActions + (slot to action)
        sp.edit().putString("gestureActions", gestureActions.entries.joinToString(",") { "${it.key}=${it.value}" }).apply()
    }
    fun updateGestureBarHide(v: Boolean) { gestureBarHide = v; sp.edit().putBoolean("gestureBarHide", v).apply() }

    fun updateSearch(v: SearchEngine) { search = v; sp.edit().putString("search", v.name).apply(); Helper.push() }
    fun updateDarkPages(v: Boolean) { darkPages = v; sp.edit().putBoolean("darkPages", v).apply(); Engine.applyPrefs(); Helper.push() }
    fun updateHttpsOnly(v: Boolean) { httpsOnly = v; sp.edit().putBoolean("httpsOnly", v).apply(); Engine.applyPrefs() }
    /** User shortcuts as (url, name) pairs. */
    fun quickList(): List<Pair<String, String>> = quickSites.lines().mapNotNull { l ->
        val u = l.substringBefore('\t').trim()
        if (u.isEmpty()) null else u to l.substringAfter('\t', "").trim()
    }
    fun updateQuick(l: List<Pair<String, String>>) {
        quickSites = l.joinToString("\n") { it.first + "\t" + it.second.replace('\n', ' ').replace('\t', ' ') }
        sp.edit().putString("quickSites", quickSites).apply()
        appCtx?.let { refreshWidgets(it) }
    }
    fun updateQuickAuto(v: Boolean) { quickAuto = v; sp.edit().putBoolean("quickAuto", v).apply() }
    fun updateDnsRules(v: String) { dnsRules = v.trim(); sp.edit().putString("dnsRules", dnsRules).apply(); Helper.push() }
    fun updateDnsServer(v: String) {
        val u = v.trim()
        dnsServer = if (u.startsWith("https://")) u else ""
        sp.edit().putString("dnsServer", dnsServer).apply()
        Engine.applyDns()
    }
    /**
     * Parsed own-DNS lines as [name, target] pairs. Forgiving: "name target", "name=target", "name, target",
     * "name -> target", hosts-file order ("192.168.1.10 nas.home"), trailing "# comments" and a scheme on the name.
     */
    fun dnsPairs(): List<List<String>> = dnsRules.lines().mapNotNull { raw ->
        val line = raw.substringBefore(" #").trim()
        if (line.isEmpty() || line.startsWith("#")) return@mapNotNull null
        val t = line.split(Regex("\\s*(->|=>|→|=|,)\\s*|\\s+")).filter { it.isNotEmpty() }
        if (t.size != 2) return@mapNotNull null
        fun isIp(x: String) = Regex("^(\\d{1,3}\\.){3}\\d{1,3}(:\\d+)?$").matches(x) || x.startsWith("[")
        var (a, b) = t
        if (isIp(a) && !isIp(b) && !b.contains("://")) { val x = a; a = b; b = x }
        a = a.substringAfter("://").substringBefore('/').trimEnd('.')
        if (a.isEmpty()) null else listOf(a, b)
    }
    /** True when the typed host matches one of the user's own names, so it loads instead of being searched. */
    fun isCustomHost(host: String): Boolean {
        val h = host.lowercase()
        return dnsPairs().any { (n, _) ->
            val x = n.lowercase()
            when {
                x.startsWith("*.") -> h.endsWith(x.substring(1))
                x.startsWith(".") -> h.endsWith(x) || h == x.substring(1)
                else -> h == x
            }
        }
    }
    fun updateDummyLogin(v: Boolean) { dummyLogin = v; sp.edit().putBoolean("dummyLogin", v).apply() }
    fun updateAutoArchiveDays(v: Int) { autoArchiveDays = v; sp.edit().putInt("autoArchiveDays", v).apply() }
    fun updateDesktopDefault(v: Boolean) { desktopDefault = v; sp.edit().putBoolean("desktopDefault", v).apply() }
    fun updateRouteVps(v: Boolean) { routeVps = v; sp.edit().putBoolean("routeVps", v).apply(); Helper.push() }
    fun updateCookieReject(v: Boolean) { cookieReject = v; sp.edit().putBoolean("cookieReject", v).apply(); Helper.push() }
    fun toggleNoDummy(host: String) {
        val h = Relay.baseDomain(host)
        if (h.isBlank()) return
        noDummy = if (h in noDummy) noDummy - h else noDummy + h
        sp.edit().putStringSet("noDummy", noDummy).apply()
    }
    fun updateSpeed(v: Float) { speed = v; sp.edit().putFloat("speed", v).apply(); Helper.push() }
    fun updateQuality(v: Int) { quality = v; sp.edit().putInt("quality", v).apply(); Helper.push() }
    /** The quality set for [host] or a parent domain, or null when it follows the default. */
    fun qualityFor(host: String): Int? {
        val h = host.removePrefix("www.")
        return qualities.entries.firstOrNull { h == it.key || h.endsWith("." + it.key) }?.value
    }
    /** Pins [host] to a quality; null goes back to the default. */
    fun setQuality(host: String, v: Int?) {
        val h = host.removePrefix("www.").removePrefix("m.")
        if (h.isBlank()) return
        qualities = if (v == null) qualities - h else qualities + (h to v)
        sp.edit().putStringSet("qualities", qualities.map { "${it.key}=${it.value}" }.toSet()).apply()
        Helper.push()
    }
    fun updateUserAgent(v: UserAgent) { userAgent = v; sp.edit().putString("userAgent", v.name).apply(); be.syntaxya.lodica.tabs.TabManager.applyUserAgent() }
    fun toggleLite(host: String) {
        val h = host.removePrefix("www.")
        if (h.isBlank()) return
        lite = if (h in lite) lite - h else lite + h
        sp.edit().putStringSet("lite", lite).apply()
        Helper.push()
    }
    fun updateLanguage(v: Language) { language = v; sp.edit().putString("language", v.name).apply(); Engine.applyPrefs() }
    /**
     * Google refuses sign-in ("browser or app may not be secure") when the user agent is spoofed or the
     * fingerprint is hidden, so its account pages always run in compatibility mode.
     */
    private val ALWAYS_COMPAT = setOf("accounts.google.com", "accounts.youtube.com", "myaccount.google.com", "gds.google.com")
    fun isForcedCompat(host: String): Boolean = host.removePrefix("www.") in ALWAYS_COMPAT
    fun isCompat(host: String): Boolean {
        val h = host.removePrefix("www.")
        return h.isNotBlank() && (h in ALWAYS_COMPAT || compat.any { h == it || h.endsWith(".$it") })
    }
    fun setCompat(host: String, on: Boolean) {
        val h = host.removePrefix("www.")
        if (h.isBlank() || (h in compat) == on) return
        compat = if (on) compat + h else compat - h
        sp.edit().putStringSet("compat", compat).apply()
    }
    fun addDirect(domains: Collection<String>) {
        val next = direct + domains.filter { it.contains('.') }
        if (next.size == direct.size) return
        direct = next
        sp.edit().putStringSet("direct", next).apply()
        Helper.push()
    }

    /** Drops "?query" and everything after it. A "#fragment" before the "?" stays; one behind it goes with the query. */
    fun cleanUrl(u: String): String = u.substringBefore('?')

    /** True when [input] would go to the search engine rather than load as an address. */
    fun isSearch(input: String): Boolean {
        val t = input.trim()
        if (t.isEmpty()) return false
        val schemes = listOf("http://", "https://", "about:", "file://", "data:", "view-source:", "moz-extension://", "resource://")
        if (schemes.any { t.startsWith(it, ignoreCase = true) }) return false
        val looksLikeHost = !t.contains(' ') &&
            (Regex("^[\\w-]+(\\.[\\w-]+)+(:\\d+)?(/.*)?$").matches(t) || t.startsWith("localhost") ||
                isCustomHost(t.substringBefore('/').substringBefore(':')))
        return !looksLikeHost
    }

    /** Turns typed text into a URL: keeps URLs, adds https:// to hosts, otherwise searches. */
    fun resolve(input: String): String {
        val t = input.trim()
        if (t.isEmpty()) return "about:blank"
        val schemes = listOf("http://", "https://", "about:", "file://", "data:", "view-source:", "moz-extension://", "resource://")
        if (schemes.any { t.startsWith(it, ignoreCase = true) }) return t
        val looksLikeHost = !t.contains(' ') &&
            (Regex("^[\\w-]+(\\.[\\w-]+)+(:\\d+)?(/.*)?$").matches(t) || t.startsWith("localhost") ||
                isCustomHost(t.substringBefore('/').substringBefore(':')))
        if (looksLikeHost) return withLanguage("https://$t")
        val base = Helper.searchBase
        if (search == SearchEngine.LODICA && base != null && Relay.available && Relay.up)
            return base + "search.html?q=" + android.net.Uri.encode(t)
        // Linked server offline: fall back to Google. No server at all keeps the DuckDuckGo default.
        val engine = if (search != SearchEngine.LODICA) search else if (Relay.available) SearchEngine.GOOGLE else SearchEngine.DUCKDUCKGO
        return withLanguage(engine.query.format(android.net.Uri.encode(t)))
    }

    /** The query of a Lodica Search page, shown in the address bar instead of the moz-extension URL. */
    fun searchQuery(url: String): String? {
        val base = Helper.searchBase ?: return null
        if (!url.startsWith(base + "search.html")) return null
        return android.net.Uri.parse(url).getQueryParameter("q")?.takeIf { it.isNotBlank() }
    }

    private val GOOGLE = Regex("^https?://(www\\.)?google\\.[a-z.]+(/|$)", RegexOption.IGNORE_CASE)

    /** Google picks its UI language from the IP; pin it to the chosen language instead. */
    fun withLanguage(url: String): String {
        if (!GOOGLE.containsMatchIn(url)) return url
        val u = android.net.Uri.parse(url)
        if (u.getQueryParameter("hl") == language.code) return url
        val b = u.buildUpon().clearQuery()
        for (n in u.queryParameterNames) if (n != "hl") for (v in u.getQueryParameters(n)) b.appendQueryParameter(n, v)
        return b.appendQueryParameter("hl", language.code).build().toString()
    }
}
