package be.syntaxya.lodica.engine

import android.content.Context
import android.net.Uri
import android.util.Log
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.WebExtension
import be.syntaxya.lodica.tabs.Tab
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.ui.Prompts
import java.lang.ref.WeakReference
import java.security.SecureRandom
import java.util.WeakHashMap

/**
 * The built-in helper extension (assets/extensions/helper). Its background script owns
 * proxy.onRequest for VPS routing; its content script reports email fields and fills aliases.
 * Both talk to the app over native messaging on the "lodica" channel.
 */
object Helper {
    private const val TAG = "LodicaHelper"
    const val ID = "helper@lodica.example.com"
    private const val APP = "lodica"

    private lateinit var app: Context
    var ext: WebExtension? = null
        private set
    private var runtime: GeckoRuntime? = null
    private var background: WebExtension.Port? = null
    private val sessions = WeakHashMap<GeckoSession, Tab>()
    private val frames = HashMap<Tab, MutableList<Frame>>()
    private val pending = HashMap<Tab, Fill>()
    private val owners = HashMap<String, WeakReference<Tab>>() // alias address -> tab it was filled in
    private val users = WeakHashMap<Tab, Pair<String, String>>() // tab -> (base domain, last username typed or filled)
    private val signups = WeakHashMap<Tab, Signup>() // tab -> identity being signed up with, for multi-step forms
    private val rnd = SecureRandom()

    /** Everything a sign-up form may ask for, generated with the alias so the user types nothing. */
    private class Signup(val alias: Alias, val pass: String, val user: String, val first: String, val last: String) {
        val until = System.currentTimeMillis() + 15 * 60_000
        var saved = ""
        fun json(type: String): JSONObject = JSONObject().put("type", type).put("value", alias.address).put("pass", pass)
            .put("user", user).put("first", first).put("last", last)
    }

    /** One connected content script: the top frame, or a subframe that holds a field. */
    private class Frame(val port: WebExtension.Port) {
        var form = false
        var focus = false
        var signup = false
    }

    /** An alias waiting for its frames to report whether they could fill it. */
    private class Fill(val alias: Alias, val signup: Signup, val waiting: MutableSet<WebExtension.Port>) {
        var ok = false
    }

    fun install(ctx: Context, rt: GeckoRuntime) {
        app = ctx.applicationContext
        runtime = rt
        rt.webExtensionController
            .ensureBuiltIn("resource://android/assets/extensions/helper/", ID)
            .then<WebExtension> { e -> if (e == null) GeckoResult.fromValue(null) else rt.webExtensionController.setAllowedInPrivateBrowsing(e, true) }
            .accept({ e ->
                if (e == null) return@accept
                ext = e
                e.setMessageDelegate(Background, APP)
                for ((s, tab) in sessions.entries.toList()) bind(tab, s, e)
            }, { t -> Log.w(TAG, "helper failed to load", t) })
    }

    /** Send the current routing config to the background script. Safe before it connects. */
    fun push() {
        val p = background ?: return
        val on = Relay.available && Prefs.routeVps && Relay.up
        p.postMessage(
            JSONObject().put("type", "config").put("enabled", on).put("auth", if (on) Relay.proxyAuth else "")
                .put("direct", JSONArray(Prefs.direct.toList()))
                .put("lite", JSONArray(Prefs.lite.toList()))
                .put("page", JSONObject().put("cookies", Prefs.cookieReject).put("dark", Prefs.darkPages).put("speed", Prefs.speed.toDouble())
                    .put("quality", Prefs.quality).put("qualities", JSONObject(Prefs.qualities as Map<*, *>)))
                .put("api", if (Relay.available) Relay.apiToken else "")
                .put("domain", Relay.DOMAIN)
                .put("legacy", Relay.legacyPorts)
                .put("dns", JSONArray(Prefs.dnsPairs().map { JSONArray(it) }))
                .put("ai", Ai.connected)
                // The engine picked in Settings. Empty means Lodica Search, so the search page keeps its own results.
                .put("engine", if (Prefs.search == SearchEngine.LODICA) "" else Prefs.search.query)
                .put("theme", themeJson())
        )
    }

    /** Palette colours for the start page, so it matches the app theme. */
    private fun themeJson(): JSONObject {
        val p = be.syntaxya.lodica.ui.theme.ThemeState.palette
        fun hex(c: Long) = String.format("#%06X", c and 0xFFFFFF)
        return JSONObject().put("dark", p.dark).put("bg", hex(p.bg)).put("raised", hex(p.raised)).put("high", hex(p.high))
            .put("text", hex(p.text)).put("muted", hex(p.muted)).put("amber", hex(p.accent)).put("coral", hex(p.accent2))
    }

    /** moz-extension:// base of the helper, where the Lodica Search page lives; null until it loads. */
    val searchBase: String? get() = ext?.metaData?.baseUrl

    /** Called for every new GeckoSession so content scripts in it can reach us. */
    fun attach(tab: Tab, s: GeckoSession) {
        sessions[s] = tab
        ext?.let { bind(tab, s, it) }
    }

    private fun bind(tab: Tab, s: GeckoSession, e: WebExtension) {
        s.webExtensionController.setMessageDelegate(e, Content(tab), APP)
    }

    /**
     * Creates a hidden alias for the tab's site and asks the page to fill it.
     * Frames with a focused email field get it first, otherwise every connected frame does.
     * Returns false when no content script is connected for the tab.
     */
    fun fill(tab: Tab): Boolean {
        if (!Relay.available) return false
        val list = frames[tab]?.takeIf { it.isNotEmpty() } ?: return false
        val targets = list.filter { it.focus }.ifEmpty { list }
        pending.remove(tab)?.let { if (!it.ok) Relay.forget(it.alias) }
        val alias = Relay.newAlias(tab.host.ifBlank { "site" })
        val signup = Signup(alias, password(), username(), FIRST.pick(), LAST.pick())
        pending[tab] = Fill(alias, signup, targets.mapTo(HashSet()) { it.port })
        val msg = signup.json("fill")
        for (f in targets) f.port.postMessage(msg)
        return true
    }

    private fun <T> List<T>.pick(): T = this[rnd.nextInt(size)]

    /** 18 chars with every class most sites demand; symbols limited to ones rarely rejected. */
    private fun password(): String {
        val sets = listOf("abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!#%*-_.@")
        val out = sets.map { it[rnd.nextInt(it.length)] }.toMutableList()
        val all = sets.joinToString("")
        while (out.size < 18) out += all[rnd.nextInt(all.length)]
        for (i in out.indices.reversed()) { val j = rnd.nextInt(i + 1); out[i] = out[j].also { out[j] = out[i] } }
        // Some sites refuse a leading symbol or digit.
        val k = out.indexOfFirst { it.isLetter() }
        out[0] = out[k].also { out[k] = out[0] }
        return out.joinToString("")
    }

    private fun username() = WORDS.pick() + WORDS.pick().replaceFirstChar { it.uppercase() } + (100 + rnd.nextInt(9900))

    private val WORDS = listOf(
        "amber", "brisk", "cedar", "delta", "ember", "fable", "glint", "harbor", "ivory", "juniper", "kestrel", "lumen",
        "maple", "nova", "orbit", "pebble", "quartz", "raven", "sable", "tidal", "umber", "vale", "willow", "zephyr",
    )
    private val FIRST = listOf("Alex", "Sam", "Robin", "Jamie", "Noah", "Emma", "Lucas", "Mila", "Leo", "Nora", "Finn", "Lena")
    private val LAST = listOf("Peeters", "Jansen", "Maes", "Claes", "Wouters", "Martin", "Dubois", "Smith", "Meyer", "Vos")

    /**
     * Fills a one-time code from mail sent to [alias] into the tab that used it,
     * else into an open tab on the same site.
     */
    fun code(alias: Alias, value: String) {
        val site = alias.site
        fun same(t: Tab) = t.host.isNotEmpty() && (t.host == site || t.host.endsWith(".$site") || site.endsWith(".${t.host}"))
        val tab = owners[alias.address]?.get()?.takeIf { frames[it] != null }
            ?: TabManager.current?.takeIf { frames[it] != null && same(it) }
            ?: TabManager.tabs.firstOrNull { frames[it] != null && same(it) }
            ?: return
        val msg = JSONObject().put("type", "code").put("value", value)
        for (f in frames[tab].orEmpty()) f.port.postMessage(msg)
    }

    /** A verification-code field got focus on [host]: answer with the current authenticator code saved for that site. */
    private fun totpFill(host: String, port: WebExtension.Port) {
        if (host.isEmpty()) return
        Vault.totpFor(host).accept({ list ->
            val code = list?.firstNotNullOfOrNull { Totp.code(it) } ?: return@accept
            port.postMessage(JSONObject().put("type", "code").put("value", code))
        }, { })
    }

    /** Asks the tab's top frame for its main text; the answer arrives as an "article" message. */
    fun reader(tab: Tab): Boolean {
        val list = frames[tab]?.takeIf { it.isNotEmpty() } ?: return false
        val msg = JSONObject().put("type", "reader").put("value", "")
        for (f in list) f.port.postMessage(msg)
        return true
    }

    /** Remember the site so its future requests skip the VPS. */
    /** A bot challenge blocked the page: turn on compatibility mode for the site once and reload. */
    private fun challenge(tab: Tab) {
        val host = tab.host.removePrefix("www.")
        if (host.isBlank() || Prefs.isCompat(host)) return
        be.syntaxya.lodica.tabs.TabManager.setCompat(tab, true)
        Toast.makeText(app, "Compatibility mode on for $host", Toast.LENGTH_SHORT).show()
    }

    private fun signedIn(tab: Tab, host: String) {
        Prefs.addDirect(listOf(host, tab.host).filter { it.isNotBlank() }.map { Relay.baseDomain(it) })
    }

    private fun remember(tab: Tab, host: String, value: String) {
        val v = value.trim()
        if (v.isNotEmpty()) users[tab] = Relay.baseDomain(host.ifBlank { tab.host }) to v
    }

    /** The username last typed or filled on [origin]'s site in this session's tab, for two-step logins. */
    fun userFor(s: GeckoSession, origin: String): String {
        val tab = sessions[s] ?: return ""
        val (site, user) = users[tab] ?: return ""
        val host = Uri.parse(origin).host ?: return ""
        return if (Relay.baseDomain(host) == site) user else ""
    }

    /** A login the page sent. Gecko only offers to save classic form posts, so offer it here too. */
    private fun creds(tab: Tab, m: JSONObject) {
        val origin = m.optString("origin")
        val pass = m.optString("pass")
        if (pass.isEmpty() || !(origin.startsWith("https://") || origin.startsWith("http://"))) return
        val s = tab.session ?: return
        val user = m.optString("user").trim().ifBlank { userFor(s, origin) }
        remember(tab, Uri.parse(origin).host.orEmpty(), user)
        Prompts.offerSave(s, origin, user, pass)
    }

    /** The page took the generated password; store it with the alias right away, no prompt. */
    private fun signed(tab: Tab, m: JSONObject) {
        val su = signups[tab] ?: return
        val origin = m.optString("origin")
        val pass = m.optString("pass")
        if (pass.isEmpty() || tab.private || !(origin.startsWith("https://") || origin.startsWith("http://"))) return
        val key = origin + "\n" + pass
        if (su.saved == key) return
        su.saved = key
        Vault.save(null, origin, null, null, su.alias.address, pass)
        Toast.makeText(app, "Login saved for ${Uri.parse(origin).host.orEmpty().removePrefix("www.")}", Toast.LENGTH_SHORT).show()
    }

    /** A new frame on the same site during a sign-up gets the identity too, for forms split over pages. */
    private fun resume(tab: Tab, port: WebExtension.Port) {
        val su = signups[tab] ?: return
        if (System.currentTimeMillis() > su.until) { signups.remove(tab); return }
        val site = Relay.baseDomain(tab.host)
        if (site.isEmpty() || site != Relay.baseDomain(su.alias.site)) return
        port.postMessage(su.json("signup"))
    }

    private fun sync(tab: Tab) {
        val list = frames[tab].orEmpty()
        tab.emailForm = list.any { it.form }
        tab.emailFocus = list.any { it.focus }
        tab.emailSignup = list.any { it.focus && it.signup }
    }

    private object Background : WebExtension.MessageDelegate {
        override fun onConnect(port: WebExtension.Port) {
            background = port
            port.setDelegate(object : WebExtension.PortDelegate {
                override fun onPortMessage(message: Any, port: WebExtension.Port) {
                    val m = message as? JSONObject ?: return
                    when (m.optString("type")) {
                        "saved" -> Meter.saved(m.optString("host"), m.optInt("count"))
                        // Search page suggestions and top sites, from local history.
                        "suggest", "top" -> {
                            val id = m.optInt("id"); val q = m.optString("q"); val kind = m.optString("type")
                            Thread {
                                val items = org.json.JSONArray()
                                if (kind == "top") History.topSites().forEach { items.put(JSONObject().put("url", it.url).put("title", it.title)) }
                                else {
                                    History.suggestSearches(q).forEach { items.put(JSONObject().put("title", it)) }
                                    History.suggest(q).forEach { items.put(JSONObject().put("url", it.url).put("title", it.title)) }
                                }
                                port.postMessage(JSONObject().put("type", "reply").put("id", id).put("items", items))
                            }.start()
                        }
                        // The search page's AI box: answered on the phone, never through the VPS.
                        "ask" -> {
                            val id = m.optInt("id")
                            if (!Ai.connected) { port.postMessage(JSONObject().put("type", "answer").put("id", id).put("error", "AI not connected")); return }
                            val prior = m.optJSONArray("history")
                            val turns = buildList {
                                if (prior != null) for (k in maxOf(0, prior.length() - 10) until prior.length()) {
                                    val t = prior.optJSONObject(k) ?: continue
                                    add((if (t.optString("role") == "assistant") "assistant" else "user") to t.optString("text"))
                                }
                            }
                            val done = { r: Result<String> ->
                                val out = JSONObject().put("type", "answer").put("id", id)
                                r.onSuccess { out.put("text", it) }.onFailure { out.put("error", it.message ?: "AI failed") }
                                port.postMessage(out)
                            }
                            Ai.ask(m.optString("q"), m.optString("ctx"), turns, done)
                        }
                    }
                }
                override fun onDisconnect(port: WebExtension.Port) { if (background === port) background = null }
            })
            push()
        }
    }

    private class Content(val tab: Tab) : WebExtension.MessageDelegate {
        override fun onConnect(port: WebExtension.Port) {
            val frame = Frame(port)
            frames.getOrPut(tab) { ArrayList() }.add(frame)
            resume(tab, port)
            port.setDelegate(object : WebExtension.PortDelegate {
                override fun onPortMessage(message: Any, port: WebExtension.Port) {
                    val m = message as? JSONObject ?: return
                    when (m.optString("type")) {
                        "email" -> { frame.form = true; frame.focus = m.optBoolean("focused"); frame.signup = m.optBoolean("signup"); sync(tab) }
                        "focus" -> { frame.form = true; frame.focus = m.optBoolean("on"); frame.signup = m.optBoolean("signup"); sync(tab) }
                        "filled" -> filled(port, m.optBoolean("ok"))
                        "login" -> signedIn(tab, m.optString("host"))
                        "user" -> remember(tab, m.optString("host"), m.optString("value"))
                        "creds" -> creds(tab, m)
                        "signed" -> signed(tab, m)
                        "article" -> be.syntaxya.lodica.ui.Ui.reader = m.optString("title") to m.optString("text")
                        "data" -> if (!tab.private) Meter.used(m.optString("host"), m.optLong("used"))
                        "challenge" -> challenge(tab)
                        "icons" -> m.optJSONArray("list")?.let { a ->
                            tab.icons = (0 until a.length()).map { a.optString(it) }
                                .filter { it.startsWith("https://") || it.startsWith("http://") || it.startsWith("data:image/") }
                                .distinct().take(12)
                        }
                        "codefield" -> totpFill(m.optString("host"), port)
                        "coded" -> if (m.optBoolean("ok")) Toast.makeText(app, "Code filled in", Toast.LENGTH_SHORT).show()
                    }
                }

                override fun onDisconnect(port: WebExtension.Port) {
                    frames[tab]?.let { it.remove(frame); if (it.isEmpty()) frames.remove(tab) }
                    sync(tab)
                    filled(port, false)
                }
            })
        }

        private fun filled(port: WebExtension.Port, ok: Boolean) {
            val f = pending[tab] ?: return
            if (!f.waiting.remove(port)) return
            if (ok && !f.ok) {
                f.ok = true
                owners[f.alias.address] = WeakReference(tab)
                signups[tab] = f.signup
                remember(tab, "", f.alias.address)
                signedIn(tab, "")
                Relay.watch(f.alias)
                Toast.makeText(app, "Using ${f.alias.address}", Toast.LENGTH_SHORT).show()
            }
            if (f.waiting.isNotEmpty()) return
            pending.remove(tab)
            if (!f.ok) {
                Relay.forget(f.alias)
                Toast.makeText(app, "No email field on this page", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
