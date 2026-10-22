package be.syntaxya.lodica.engine

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONObject
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.WebExtension
import org.mozilla.geckoview.WebExtensionController
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Browser extensions from Firefox Add-ons (addons.mozilla.org). Search, install, enable/disable and remove.
 * The built-in uBlock Origin and Lodica helper are hidden from the list. The Chrome Web Store is not
 * possible here: GeckoView only runs Firefox add-ons.
 */
object Extensions {
    private const val TAG = "LodicaExtensions"
    private val main = Handler(Looper.getMainLooper())
    private val builtIn = setOf("uBlock0@raymondhill.net", Helper.ID)

    class Item(val ext: WebExtension, val name: String, val version: String, val enabled: Boolean) { val id: String get() = ext.id }
    /** The add-ons API returns a plain string or a {"en-US": "..."} map. */
    private fun localized(v: Any?): String = when (v) {
        is String -> v
        is JSONObject -> v.optString("en-US").ifEmpty { v.keys().asSequence().firstNotNullOfOrNull { k -> v.optString(k).ifEmpty { null } }.orEmpty() }
        else -> ""
    }

    class Hit(val name: String, val summary: String, val xpi: String)
    class Prompt(val name: String, val permissions: List<String>, val answer: GeckoResult<WebExtension.PermissionPromptResponse>)

    val installed = mutableStateListOf<Item>()
    val hits = mutableStateListOf<Hit>()
    var busy by mutableStateOf(false); private set
    var status by mutableStateOf<String?>(null); private set
    var prompt by mutableStateOf<Prompt?>(null); private set
    /** Popup session of the extension action the user opened. Shown in a dialog by the settings screen. */
    var popup by mutableStateOf<GeckoSession?>(null); private set
    var popupName by mutableStateOf(""); private set
    private val actions = HashMap<String, WebExtension.Action>()

    fun hasAction(item: Item) = actions.containsKey(item.id)

    fun openAction(item: Item) { actions[item.id]?.click() }

    fun closePopup() {
        popup?.close()
        popup = null
    }

    private fun hook(ctx: Context, ext: WebExtension) {
        ext.setActionDelegate(object : WebExtension.ActionDelegate {
            override fun onBrowserAction(extension: WebExtension, session: GeckoSession?, action: WebExtension.Action) {
                main.post { actions[extension.id] = action }
            }
            override fun onPageAction(extension: WebExtension, session: GeckoSession?, action: WebExtension.Action) {
                main.post { if (!actions.containsKey(extension.id)) actions[extension.id] = action }
            }
            override fun onOpenPopup(extension: WebExtension, action: WebExtension.Action): GeckoResult<GeckoSession>? = show(ctx, extension)
            override fun onTogglePopup(extension: WebExtension, action: WebExtension.Action): GeckoResult<GeckoSession>? = show(ctx, extension)
        })
    }

    private fun show(ctx: Context, ext: WebExtension): GeckoResult<GeckoSession> {
        val s = GeckoSession()
        s.open(Engine.runtime(ctx))
        main.post { popup?.close(); popup = s; popupName = ext.metaData.name ?: ext.id }
        return GeckoResult.fromValue(s)
    }

    private fun ctl(ctx: Context) = Engine.runtime(ctx).webExtensionController

    /** Hook the install prompt. Call once after the runtime exists. */
    fun init(ctx: Context) {
        ctl(ctx).promptDelegate = object : WebExtensionController.PromptDelegate {
            override fun onInstallPromptRequest(
                extension: WebExtension, permissions: Array<out String>, origins: Array<out String>, dataCollection: Array<out String>,
            ): GeckoResult<WebExtension.PermissionPromptResponse> {
                val answer = GeckoResult<WebExtension.PermissionPromptResponse>()
                val asked = (permissions.toList() + origins.toList()).distinct()
                main.post { prompt = Prompt(extension.metaData.name ?: extension.id, asked, answer) }
                return answer
            }
        }
    }

    fun answer(allow: Boolean) {
        val p = prompt ?: return
        prompt = null
        p.answer.complete(WebExtension.PermissionPromptResponse(allow, false, false))
    }

    fun refresh(ctx: Context) {
        ctl(ctx).list().accept({ all ->
            val items = (all ?: emptyList()).filter { it.id !in builtIn }
                .onEach { hook(ctx, it) }
                .map { Item(it, it.metaData.name ?: it.id, it.metaData.version ?: "", it.metaData.enabled) }
            main.post { installed.clear(); installed.addAll(items) }
        }, { e -> Log.w(TAG, "list failed", e) })
    }

    fun search(query: String) {
        val q = query.trim()
        if (q.isEmpty()) return
        busy = true; status = null
        Thread {
            try {
                val url = "https://addons.mozilla.org/api/v5/addons/search/?app=android&type=extension&lang=en-US&page_size=15&q=" +
                    URLEncoder.encode(q, "UTF-8")
                val c = URL(url).openConnection() as HttpURLConnection
                c.connectTimeout = 10000; c.readTimeout = 15000
                val json = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
                val rs = json.getJSONArray("results")
                val out = (0 until rs.length()).mapNotNull {
                    val r = rs.getJSONObject(it)
                    val xpi = r.optJSONObject("current_version")?.optJSONObject("file")?.optString("url").orEmpty()
                    if (xpi.isEmpty()) null else Hit(localized(r.opt("name")), localized(r.opt("summary")).take(120), xpi)
                }
                main.post { hits.clear(); hits.addAll(out); busy = false; status = if (out.isEmpty()) "Nothing found" else null }
            } catch (e: Exception) {
                Log.w(TAG, "search failed", e)
                main.post { busy = false; status = "Search failed. Check your connection." }
            }
        }.start()
    }

    fun install(ctx: Context, hit: Hit) {
        busy = true; status = null
        ctl(ctx).install(hit.xpi, WebExtensionController.INSTALLATION_METHOD_MANAGER).accept({
            busy = false; status = "Installed ${hit.name}"; refresh(ctx)
        }, { e ->
            Log.w(TAG, "install failed", e)
            busy = false; status = "Install failed"
        })
    }

    fun toggle(ctx: Context, item: Item) {
        val c = ctl(ctx)
        val r = if (item.enabled) c.disable(item.ext, WebExtensionController.EnableSource.USER)
        else c.enable(item.ext, WebExtensionController.EnableSource.USER)
        r.accept({ refresh(ctx) }, { e -> Log.w(TAG, "toggle failed", e) })
    }

    fun remove(ctx: Context, item: Item) {
        ctl(ctx).uninstall(item.ext).accept({ refresh(ctx) }, { e -> Log.w(TAG, "uninstall failed", e) })
    }
}
