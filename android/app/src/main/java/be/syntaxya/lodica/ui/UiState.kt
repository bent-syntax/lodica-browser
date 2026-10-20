package be.syntaxya.lodica.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.mozilla.geckoview.GeckoView

enum class Screen { Browser, Tabs, Settings, Passwords, History, Inbox, Chats, Room, Downloads }

enum class Picker { Speed, Quality, Remind, RemindAt, Closed }

/** UI-only state shared by the screens. Process-wide so it survives activity recreation. */
object Ui {
    var screen by mutableStateOf(Screen.Browser)
    var menuOpen by mutableStateOf(false)
    var editing by mutableStateOf(false)
    /** otpauth-migration:// link waiting for the import dialog in Settings. */
    var pendingMigration by mutableStateOf<String?>(null)
    var finding by mutableStateOf(false)
    var findQuery by mutableStateOf("")
    var findCount by mutableStateOf("")

    /** A link copied in another app, offered once when Lodica regains focus. */
    var clipLink by mutableStateOf<String?>(null)

    /** Last clipboard text already offered or copied by Lodica itself, so it is not offered again. */
    var clipSeen: String? = null

    /** URL shown in the throwaway preview window, or null. */
    var preview by mutableStateOf<String?>(null)

    /** Reader view of the current page: title to plain text. */
    var reader by mutableStateOf<Pair<String, String>?>(null)
    /** Ask AI answer being shown; text stays empty while loading. */
    var answer by mutableStateOf<Answer?>(null)

    /** Small choice dialog opened from the menu. */
    var picker by mutableStateOf<Picker?>(null)

    /** First-time "which authenticator code for this site?" prompt. */
    class TotpAsk(val host: String, val entries: List<be.syntaxya.lodica.engine.TotpEntry>, val onPick: (be.syntaxya.lodica.engine.TotpEntry?) -> Unit)
    var totpAsk by mutableStateOf<TotpAsk?>(null)

    /** How far the bottom bar has slid out of view, in px (0 = fully shown). */
    var barOffset by mutableFloatStateOf(0f)
    var barHeight by mutableFloatStateOf(0f)

    /** Hosts whose "install as app" offer was answered this session. */
    val installDismissed = mutableStateListOf<String>()

    /** Address bar tucked away on purpose (long-press) or because a file is open. Cleared on a new page or when typing. */
    var barHidden by mutableStateOf(false)

    /** The single GeckoView, set while the browser screen is composed. */
    var gecko: GeckoView? = null

    fun showBar() { barOffset = 0f }

    /** Drops every overlay, sheet and dialog so the browser is what shows. */
    fun closeAll() {
        screen = Screen.Browser
        menuOpen = false
        finding = false
        reader = null
        answer = null
        picker = null
        totpAsk = null
        preview = null
        editing = false
        showBar()
    }

    /** Back press inside the UI. Returns false when nothing was consumed. */
    fun back(): Boolean = when {
        Prompts.visible != null -> { Prompts.visible?.cancel(); true }
        reader != null -> { reader = null; true }
        answer != null -> { answer = null; true }
        picker != null -> { picker = null; true }
        totpAsk != null -> { totpAsk?.onPick?.invoke(null); totpAsk = null; true }
        preview != null -> { preview = null; true }
        menuOpen -> { menuOpen = false; true }
        finding -> { stopFind(); true }
        editing -> { editing = false; true }
        screen == Screen.Inbox && be.syntaxya.lodica.engine.Relay.selected != null -> { be.syntaxya.lodica.engine.Relay.selected = null; true }
        screen == Screen.Downloads -> { screen = Screen.Browser; true }
        screen == Screen.Passwords || screen == Screen.History || screen == Screen.Inbox || screen == Screen.Chats || screen == Screen.Room -> { screen = Screen.Settings; true }
        screen != Screen.Browser -> { screen = Screen.Browser; true }
        else -> false
    }

    fun stopFind() {
        finding = false
        findQuery = ""
        findCount = ""
        be.syntaxya.lodica.tabs.TabManager.current?.session?.finder?.clear()
    }
}

data class Answer(val question: String, val text: String = "", val error: String? = null, val loading: Boolean = true)
