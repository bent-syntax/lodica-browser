package be.syntaxya.lodica.tabs

import android.graphics.Bitmap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import org.mozilla.geckoview.GeckoSession
import java.util.UUID

/** What survives a restart. Private tabs are kept too, but their cookies and logins die with the process. */
@Serializable
data class TabRecord(
    val id: String,
    val url: String,
    val title: String = "",
    val private: Boolean = false,
    val state: String? = null,
    val lastUsed: Long = System.currentTimeMillis(),
    val desktop: Boolean = false,
)

/** Live tab. Compose observes the mutable fields; the session is created on demand. */
class Tab(
    val id: String = UUID.randomUUID().toString(),
    val private: Boolean = false,
    url: String = "about:blank",
    title: String = "",
    /** Serialized GeckoSession.SessionState, kept fresh so evicted tabs restore exactly. */
    var state: String? = null,
    lastUsed: Long = System.currentTimeMillis(),
    desktop: Boolean = false,
) {
    var url by mutableStateOf(url)
    var title by mutableStateOf(title)
    var progress by mutableIntStateOf(100)
    var loading by mutableStateOf(false)
    var canBack by mutableStateOf(false)
    var canFwd by mutableStateOf(false)
    var secure by mutableStateOf(true)
    var origin by mutableStateOf("")
    var navStart: String? = null
    var blocked by mutableIntStateOf(0)
    var desktop by mutableStateOf(desktop)
    var lastUsed by mutableStateOf(lastUsed)
    var thumbnail by mutableStateOf<Bitmap?>(null)
    var crashed by mutableStateOf(false)
    /** Helper content script saw an email field on this page / one has focus. */
    var emailForm by mutableStateOf(false)
    var emailFocus by mutableStateOf(false)
    /** The focused email field sits on a sign-up page. */
    var emailSignup by mutableStateOf(false)
    /** Tracking and fingerprinting protection are off for this site. */
    var trusted by mutableStateOf(false)
    /** Private tab hidden behind a biometric check; set on restore and whenever the app goes to the background. */
    var locked by mutableStateOf(false)
    /** The site's tracking-protection permission from the last location change. */
    internal var trackPerm: GeckoSession.PermissionDelegate.ContentPermission? = null
    /** The page's web app manifest, if it declared one; used by "Install as app". */
    var manifest: org.json.JSONObject? = null
    /** Icons the page links (`<link rel=icon>`, apple-touch-icon) as absolute URLs, biggest first. */
    var icons: List<String> = emptyList()

    /** Owned GeckoSession, or null while the tab is evicted to save memory. Observable so the view rebinds. */
    var session by mutableStateOf<GeckoSession?>(null)

    /** Last reported scroll offset, used to derive toolbar show/hide deltas. */
    internal var scrollY = 0

    val displayTitle: String get() = title.ifBlank { host.ifBlank { url } }
    val host: String get() = runCatching { android.net.Uri.parse(url).host.orEmpty() }.getOrDefault("").removePrefix("www.")

    fun record() = TabRecord(id, url, title, private, state, lastUsed, desktop)

    companion object {
        fun from(r: TabRecord) = Tab(r.id, r.private, r.url, r.title, r.state, r.lastUsed, r.desktop).also { it.locked = r.private }
    }
}
