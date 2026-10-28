package be.syntaxya.lodica.ui

import android.Manifest
import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.compose.runtime.mutableStateListOf
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.Autocomplete
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSession.PermissionDelegate
import org.mozilla.geckoview.GeckoSession.PermissionDelegate.ContentPermission
import org.mozilla.geckoview.GeckoSession.PermissionDelegate.MediaSource
import org.mozilla.geckoview.GeckoSession.PromptDelegate
import org.mozilla.geckoview.GeckoSession.PromptDelegate.PromptResponse
import be.syntaxya.lodica.engine.Helper
import be.syntaxya.lodica.engine.Vault
import be.syntaxya.lodica.tabs.TabManager

/** Things only the activity can do: pickers, runtime permissions, share sheet. */
interface PromptHost {
    fun pickFiles(mimeTypes: Array<String>, multiple: Boolean, capture: Boolean, done: (Array<Uri>?) -> Unit)
    fun requestAndroid(permissions: Array<String>, done: (Boolean) -> Unit)
    fun share(title: String?, text: String?, uri: String?): Boolean
}

/** A page asking the user something. The UI renders the first one for the current tab. */
sealed class Req(val session: GeckoSession, val host: String) {
    abstract fun cancel()

    /** Completes once; later calls (double taps, Gecko dismissing) are ignored. */
    protected fun finish(block: () -> Unit) {
        if (Prompts.queue.remove(this)) block()
    }

    class Alert(s: GeckoSession, host: String, val title: String?, val message: String?, private val ok: () -> Unit) : Req(s, host) {
        fun ok() = finish(ok)
        override fun cancel() = ok()
    }

    /** Yes/no question. [rememberable] shows a "remember for this site" switch. */
    class Ask(
        s: GeckoSession, host: String,
        val title: String, val message: String?,
        val yes: String, val no: String,
        val rememberable: Boolean = false,
        private val answer: (Boolean, Boolean) -> Unit,
    ) : Req(s, host) {
        fun answer(allow: Boolean, remember: Boolean = false) = finish { answer.invoke(allow, remember) }
        override fun cancel() = answer(false)
    }

    class Text(s: GeckoSession, host: String, val title: String?, val message: String?, val default: String,
               private val r: GeckoResult<PromptResponse>, private val p: PromptDelegate.TextPrompt) : Req(s, host) {
        fun submit(v: String) = finish { r.complete(p.confirm(v)) }
        override fun cancel() = finish { r.complete(p.dismiss()) }
    }

    class Auth(s: GeckoSession, host: String, val message: String?, val user: String, val onlyPassword: Boolean,
               private val r: GeckoResult<PromptResponse>, private val p: PromptDelegate.AuthPrompt) : Req(s, host) {
        fun submit(u: String, pw: String) = finish { r.complete(if (onlyPassword) p.confirm(pw) else p.confirm(u, pw)) }
        override fun cancel() = finish { r.complete(p.dismiss()) }
    }

    class Choice(s: GeckoSession, host: String, val title: String?, val multiple: Boolean,
                 val choices: List<PromptDelegate.ChoicePrompt.Choice>,
                 private val r: GeckoResult<PromptResponse>, private val p: PromptDelegate.ChoicePrompt) : Req(s, host) {
        fun pick(c: PromptDelegate.ChoicePrompt.Choice) = finish { r.complete(p.confirm(c)) }
        fun pickMany(cs: List<PromptDelegate.ChoicePrompt.Choice>) = finish { r.complete(p.confirm(cs.toTypedArray())) }
        override fun cancel() = finish { r.complete(p.dismiss()) }
    }

    class Color(s: GeckoSession, host: String, val default: String, val presets: List<String>,
                private val r: GeckoResult<PromptResponse>, private val p: PromptDelegate.ColorPrompt) : Req(s, host) {
        fun submit(hex: String) = finish { r.complete(p.confirm(hex)) }
        override fun cancel() = finish { r.complete(p.dismiss()) }
    }

    /** [type] is a DateTimePrompt.Type constant; values use the HTML input formats. */
    class DateTime(s: GeckoSession, host: String, val type: Int, val default: String, val min: String, val max: String,
                   private val r: GeckoResult<PromptResponse>, private val p: PromptDelegate.DateTimePrompt) : Req(s, host) {
        fun submit(v: String) = finish { r.complete(p.confirm(v)) }
        fun clear() = finish { r.complete(p.confirm("")) }
        override fun cancel() = finish { r.complete(p.dismiss()) }
    }
}

object Prompts : PromptDelegate, PermissionDelegate {
    val queue = mutableStateListOf<Req>()
    var host: PromptHost? = null
    private lateinit var app: Context
    private const val PERMS = "lodica_site_perms"

    fun init(ctx: Context) {
        app = ctx.applicationContext
    }

    /** The request to show now: only prompts from the visible tab. */
    val visible: Req? get() = TabManager.current?.session?.let { s -> queue.firstOrNull { it.session === s } }

    fun dropFor(s: GeckoSession) = queue.filter { it.session === s }.forEach { it.cancel() }

    private fun hostOf(s: GeckoSession, uri: String? = null): String {
        val u = uri ?: TabManager.tabs.firstOrNull { it.session === s }?.url
        return u?.let { Uri.parse(it).host?.removePrefix("www.") } ?: ""
    }

    private fun isPrivate(s: GeckoSession) = s.settings.usePrivateMode

    /** Queue [req]; if Gecko gives up on [p] (navigation, tab closed) drop it silently. */
    private fun <R : Req> show(req: R, p: PromptDelegate.BasePrompt? = null): R {
        p?.delegate = object : PromptDelegate.PromptInstanceDelegate {
            override fun onPromptDismiss(prompt: PromptDelegate.BasePrompt) {
                queue.remove(req)
            }
        }
        queue.add(req)
        return req
    }

    private fun result() = GeckoResult<PromptResponse>()

    // --- page dialogs ---

    override fun onAlertPrompt(s: GeckoSession, p: PromptDelegate.AlertPrompt): GeckoResult<PromptResponse> {
        val r = result()
        show(Req.Alert(s, hostOf(s), p.title, p.message) { r.complete(p.dismiss()) }, p)
        return r
    }

    override fun onButtonPrompt(s: GeckoSession, p: PromptDelegate.ButtonPrompt): GeckoResult<PromptResponse> {
        val r = result()
        show(Req.Ask(s, hostOf(s), p.title ?: hostOf(s), p.message, "OK", "Cancel") { yes, _ ->
            r.complete(p.confirm(if (yes) PromptDelegate.ButtonPrompt.Type.POSITIVE else PromptDelegate.ButtonPrompt.Type.NEGATIVE))
        }, p)
        return r
    }

    override fun onTextPrompt(s: GeckoSession, p: PromptDelegate.TextPrompt): GeckoResult<PromptResponse> {
        val r = result()
        show(Req.Text(s, hostOf(s), p.title, p.message, p.defaultValue ?: "", r, p), p)
        return r
    }

    override fun onAuthPrompt(s: GeckoSession, p: PromptDelegate.AuthPrompt): GeckoResult<PromptResponse> {
        val r = result()
        val o = p.authOptions
        val only = o.flags and PromptDelegate.AuthPrompt.AuthOptions.Flags.ONLY_PASSWORD != 0
        show(Req.Auth(s, hostOf(s, o.uri), p.message, o.username ?: "", only, r, p), p)
        return r
    }

    override fun onChoicePrompt(s: GeckoSession, p: PromptDelegate.ChoicePrompt): GeckoResult<PromptResponse> {
        val r = result()
        val multiple = p.type == PromptDelegate.ChoicePrompt.Type.MULTIPLE
        show(Req.Choice(s, hostOf(s), p.title ?: p.message, multiple, p.choices.toList(), r, p), p)
        return r
    }

    override fun onColorPrompt(s: GeckoSession, p: PromptDelegate.ColorPrompt): GeckoResult<PromptResponse> {
        val r = result()
        show(Req.Color(s, hostOf(s), p.defaultValue ?: "#000000", p.predefinedValues?.toList().orEmpty(), r, p), p)
        return r
    }

    override fun onDateTimePrompt(s: GeckoSession, p: PromptDelegate.DateTimePrompt): GeckoResult<PromptResponse> {
        val r = result()
        show(Req.DateTime(s, hostOf(s), p.type, p.defaultValue ?: "", p.minValue ?: "", p.maxValue ?: "", r, p), p)
        return r
    }

    override fun onBeforeUnloadPrompt(s: GeckoSession, p: PromptDelegate.BeforeUnloadPrompt): GeckoResult<PromptResponse> {
        val r = result()
        show(Req.Ask(s, hostOf(s), "Leave this page?", "Changes you made may not be saved.", "Leave", "Stay") { yes, _ ->
            r.complete(p.confirm(if (yes) AllowOrDeny.ALLOW else AllowOrDeny.DENY))
        }, p)
        return r
    }

    override fun onRepostConfirmPrompt(s: GeckoSession, p: PromptDelegate.RepostConfirmPrompt): GeckoResult<PromptResponse> {
        val r = result()
        show(Req.Ask(s, hostOf(s), "Resend form?", "The page will send the data you entered again.", "Resend", "Cancel") { yes, _ ->
            r.complete(p.confirm(if (yes) AllowOrDeny.ALLOW else AllowOrDeny.DENY))
        }, p)
        return r
    }

    override fun onPopupPrompt(s: GeckoSession, p: PromptDelegate.PopupPrompt): GeckoResult<PromptResponse> {
        val r = result()
        val h = hostOf(s)
        when (siteDecision(h, "popup")) {
            true -> return GeckoResult.fromValue(p.confirm(AllowOrDeny.ALLOW))
            false -> return GeckoResult.fromValue(p.confirm(AllowOrDeny.DENY))
            null -> Unit
        }
        show(Req.Ask(s, h, "Pop-up blocked", p.targetUri, "Open", "Block", rememberable = !isPrivate(s)) { yes, remember ->
            if (remember) remember(h, "popup", yes)
            r.complete(p.confirm(if (yes) AllowOrDeny.ALLOW else AllowOrDeny.DENY))
        }, p)
        return r
    }

    override fun onFolderUploadPrompt(s: GeckoSession, p: PromptDelegate.FolderUploadPrompt): GeckoResult<PromptResponse> {
        val r = result()
        show(Req.Ask(s, hostOf(s), "Upload folder?", "All files in the folder will be sent to ${hostOf(s)}.", "Upload", "Cancel") { yes, _ ->
            r.complete(p.confirm(if (yes) AllowOrDeny.ALLOW else AllowOrDeny.DENY))
        }, p)
        return r
    }

    override fun onSharePrompt(s: GeckoSession, p: PromptDelegate.SharePrompt): GeckoResult<PromptResponse> {
        val ok = host?.share(p.title, p.text, p.uri) == true
        return GeckoResult.fromValue(p.confirm(if (ok) PromptDelegate.SharePrompt.Result.SUCCESS else PromptDelegate.SharePrompt.Result.FAILURE))
    }

    private fun copyToCache(u: Uri): Uri? = runCatching {
        if (u.scheme == "file") return u
        val name = app.contentResolver.query(u, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { if (it.moveToFirst()) it.getString(0) else null }
            ?.replace(Regex("[/\\\\]"), "_")?.takeIf { it.isNotBlank() } ?: "upload"
        val dir = java.io.File(app.cacheDir, "uploads/${System.nanoTime()}").apply { mkdirs() }
        val f = java.io.File(dir, name)
        app.contentResolver.openInputStream(u)!!.use { i -> f.outputStream().use { i.copyTo(it) } }
        Uri.fromFile(f)
    }.getOrNull()

    override fun onFilePrompt(s: GeckoSession, p: PromptDelegate.FilePrompt): GeckoResult<PromptResponse> {
        val h = host ?: return GeckoResult.fromValue(p.dismiss())
        val r = result()
        val mimes = p.mimeTypes?.filterNotNull()?.toTypedArray() ?: emptyArray()
        h.pickFiles(mimes, p.type == PromptDelegate.FilePrompt.Type.MULTIPLE, p.capture != PromptDelegate.FilePrompt.Capture.NONE) { uris ->
            if (p.isComplete) return@pickFiles
            // Gecko can't resolve some document-provider content:// URIs ("Unrecognized path"), so hand it cache copies.
            val local = uris?.mapNotNull { copyToCache(it) }?.toTypedArray()
            r.complete(
                when {
                    local.isNullOrEmpty() -> p.dismiss()
                    p.type == PromptDelegate.FilePrompt.Type.MULTIPLE -> p.confirm(app, local)
                    else -> p.confirm(app, local[0])
                }
            )
        }
        return r
    }

    // --- logins (stored in the encrypted Vault via Autocomplete.StorageDelegate) ---

    /** Sessions whose current page already got its saved login filled; cleared on the next page load. */
    private val loginFilled = java.util.Collections.synchronizedMap(java.util.WeakHashMap<GeckoSession, Boolean>())

    fun resetLoginFill(s: GeckoSession) { loginFilled.remove(s) }

    /** A saved login exists for this form: fill it once per page, so a field the user cleared stays cleared. */
    override fun onLoginSelect(
        s: GeckoSession, req: PromptDelegate.AutocompleteRequest<Autocomplete.LoginSelectOption>,
    ): GeckoResult<PromptResponse> {
        if (loginFilled.containsKey(s)) return GeckoResult.fromValue(req.dismiss())
        // Saved logins only: never Gecko's suggested strong password or a Relay mask.
        val first = req.options.firstOrNull {
            it.hint and (Autocomplete.SelectOption.Hint.GENERATED or Autocomplete.SelectOption.Hint.FIREFOX_RELAY) == 0
        } ?: return GeckoResult.fromValue(req.dismiss())
        loginFilled[s] = true
        return GeckoResult.fromValue(req.confirm(first))
    }

    override fun onLoginSave(
        s: GeckoSession, req: PromptDelegate.AutocompleteRequest<Autocomplete.LoginSaveOption>,
    ): GeckoResult<PromptResponse> {
        val opt = req.options.firstOrNull() ?: return GeckoResult.fromValue(req.dismiss())
        val v = opt.value
        // Two-step pages leave Gecko without the username; use the one typed or filled earlier in the tab.
        val user = v.username.ifBlank { Helper.userFor(s, v.origin) }
        val r = result()
        askSave(s, v.origin, user, v.password) { yes ->
            r.complete(when {
                !yes -> req.dismiss()
                user == v.username -> req.confirm(opt)
                else -> { Vault.save(v.guid, v.origin, v.formActionOrigin, v.httpRealm, user, v.password); req.dismiss() }
            })
        }
        return r
    }

    private val asking = HashSet<String>()   // host + username with a save prompt open
    private val declined = HashSet<String>() // answered "Not now" this run; don't ask again

    /**
     * Asks once per site and username whether to store the login. Gecko's own prompt and the
     * helper's capture can both fire for one sign-in, so open, declined and already stored
     * logins answer false without asking.
     */
    private fun askSave(s: GeckoSession, origin: String, user: String, pass: String, answer: (Boolean) -> Unit) {
        val h = hostOf(s, origin)
        val key = "$h\n$user"
        if (isPrivate(s) || pass.isEmpty() || key in asking || key in declined) return answer(false)
        asking += key
        Vault.has(origin, user, pass).accept { have ->
            if (have == true) { asking -= key; answer(false); return@accept }
            val msg = if (user.isNotBlank()) "Login: $user. Stored encrypted on this phone only." else "Stored encrypted on this phone only."
            show(Req.Ask(s, h, "Save password for $h?", msg, "Save", "Not now") { yes, _ ->
                asking -= key
                if (!yes) declined += key
                answer(yes)
            })
        }
    }

    /** A login the helper saw being sent that Gecko may not offer to save (script logins, aliases). */
    fun offerSave(s: GeckoSession, origin: String, user: String, pass: String) =
        askSave(s, origin, user, pass) { yes -> if (yes) Vault.save(null, origin, null, null, user, pass) }

    // --- site permissions ---

    private fun siteDecision(host: String, key: String): Boolean? {
        if (host.isEmpty()) return null
        return when (app.getSharedPreferences(PERMS, 0).getInt("$host|$key", 0)) {
            1 -> true
            2 -> false
            else -> null
        }
    }

    private fun remember(host: String, key: String, allow: Boolean) {
        if (host.isEmpty()) return
        app.getSharedPreferences(PERMS, 0).edit().putInt("$host|$key", if (allow) 1 else 2).apply()
    }

    fun forgetSite(host: String) {
        val sp = app.getSharedPreferences(PERMS, 0)
        sp.edit().apply { sp.all.keys.filter { it.startsWith("$host|") }.forEach { remove(it) } }.apply()
    }

    fun clearSitePermissions() = app.getSharedPreferences(PERMS, 0).edit().clear().apply()

    /** Ask once per site (or reuse the stored answer). */
    private fun ask(s: GeckoSession, h: String, key: String, title: String, message: String?, done: (Boolean) -> Unit) {
        siteDecision(h, key)?.let { return done(it) }
        show(Req.Ask(s, h, title, message, "Allow", "Block", rememberable = !isPrivate(s)) { yes, keep ->
            if (keep) remember(h, key, yes)
            done(yes)
        })
    }

    override fun onAndroidPermissionsRequest(s: GeckoSession, permissions: Array<out String>?, callback: PermissionDelegate.Callback) {
        val h = host
        if (permissions.isNullOrEmpty() || h == null) return callback.reject()
        h.requestAndroid(arrayOf(*permissions)) { ok -> if (ok) callback.grant() else callback.reject() }
    }

    override fun onContentPermissionRequest(s: GeckoSession, perm: ContentPermission): GeckoResult<Int> {
        val allow = GeckoResult.fromValue(ContentPermission.VALUE_ALLOW)
        val deny = GeckoResult.fromValue(ContentPermission.VALUE_DENY)
        val h = hostOf(s, perm.uri)
        val (key, title) = when (perm.permission) {
            PermissionDelegate.PERMISSION_AUTOPLAY_INAUDIBLE,
            PermissionDelegate.PERMISSION_PERSISTENT_STORAGE,
            PermissionDelegate.PERMISSION_MEDIA_KEY_SYSTEM_ACCESS -> return allow
            // Sound only after a tap: saves data and nerves.
            PermissionDelegate.PERMISSION_AUTOPLAY_AUDIBLE,
            PermissionDelegate.PERMISSION_TRACKING,
            PermissionDelegate.PERMISSION_XR -> return deny
            PermissionDelegate.PERMISSION_GEOLOCATION -> "geo" to "Share your location with $h?"
            PermissionDelegate.PERMISSION_DESKTOP_NOTIFICATION -> "notify" to "Allow $h to send notifications?"
            PermissionDelegate.PERMISSION_STORAGE_ACCESS -> "storage" to "Let ${perm.thirdPartyOrigin?.let { Uri.parse(it).host } ?: "an embedded site"} use cookies on $h?"
            PermissionDelegate.PERMISSION_LOCAL_DEVICE_ACCESS,
            PermissionDelegate.PERMISSION_LOCAL_NETWORK_ACCESS -> "local" to "Allow $h to reach devices on your network?"
            else -> return deny
        }
        val r = GeckoResult<Int>()
        ask(s, h, key, title, null) { yes ->
            if (!yes) return@ask r.complete(ContentPermission.VALUE_DENY)
            if (key == "notify" && Build.VERSION.SDK_INT >= 33) {
                val hst = host ?: return@ask r.complete(ContentPermission.VALUE_DENY)
                hst.requestAndroid(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) { ok ->
                    r.complete(if (ok) ContentPermission.VALUE_ALLOW else ContentPermission.VALUE_DENY)
                }
            } else {
                r.complete(ContentPermission.VALUE_ALLOW)
            }
        }
        return r
    }

    override fun onMediaPermissionRequest(
        s: GeckoSession, uri: String,
        video: Array<out MediaSource>?, audio: Array<out MediaSource>?,
        callback: PermissionDelegate.MediaCallback,
    ) {
        val cam = video?.firstOrNull { it.source == MediaSource.SOURCE_CAMERA } ?: video?.firstOrNull()
        val mic = audio?.firstOrNull { it.source == MediaSource.SOURCE_MICROPHONE } ?: audio?.firstOrNull()
        if (cam == null && mic == null) return callback.reject()
        val h = hostOf(s, uri)
        val what = listOfNotNull(cam?.let { "camera" }, mic?.let { "microphone" }).joinToString(" and ")
        ask(s, h, "media:${cam != null}:${mic != null}", "Allow $h to use your $what?", null) { yes ->
            if (yes) callback.grant(cam, mic) else callback.reject()
        }
    }
}
