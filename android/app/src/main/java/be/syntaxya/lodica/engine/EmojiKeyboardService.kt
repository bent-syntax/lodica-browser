package be.syntaxya.lodica.engine

import android.content.ClipDescription
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.LruCache
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.textservice.SentenceSuggestionsInfo
import android.view.textservice.SpellCheckerSession
import android.view.textservice.SuggestionsInfo
import android.view.textservice.TextInfo
import android.view.textservice.TextServicesManager
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.FileProvider
import androidx.core.view.inputmethod.EditorInfoCompat
import androidx.core.view.inputmethod.InputConnectionCompat
import androidx.core.view.inputmethod.InputContentInfoCompat
import java.util.Locale

/**
 * Lodica keyboard: Gboard-style layout with better autocorrect and an emoji tab that holds the custom emojis shared
 * with every browser on the same Lodica server. Built from plain Views so the service has no Compose dependency.
 */
class EmojiKeyboardService : InputMethodService() {
    private enum class Layer { LETTERS, SYM1, SYM2, EMOJI }
    private enum class Shift { OFF, ONCE, CAPS }

    private val ui = Handler(Looper.getMainLooper())
    private var layer = Layer.LETTERS
    private var shift = Shift.ONCE
    private var dark = false
    private var autocorrect = true
    private var root: LinearLayout? = null
    private var strip: LinearLayout? = null
    private var body: FrameLayout? = null
    private val sugg = arrayOf("", "", "")
    private var lastSpace = 0L
    private var undo: Pair<String, String>? = null // original, corrected (valid right after an autocorrect)
    private var spell: SpellCheckerSession? = null
    private var spellWord = ""
    private var spellTop: String? = null
    private var emojiTab = -1 // -1 custom, otherwise index into UNICODE
    private val bitmaps = object : LruCache<String, Bitmap>(80) {}

    private val learned by lazy { getSharedPreferences("kb_learned", Context.MODE_PRIVATE) }

    override fun onCreate() {
        super.onCreate()
        Relay.init(this)
        Emojis.init(this)
        runCatching {
            val tsm = getSystemService(Context.TEXT_SERVICES_MANAGER_SERVICE) as TextServicesManager
            spell = tsm.newSpellCheckerSession(null, Locale.getDefault(), object : SpellCheckerSession.SpellCheckerSessionListener {
                override fun onGetSuggestions(results: Array<out SuggestionsInfo>?) {}
                override fun onGetSentenceSuggestions(results: Array<out SentenceSuggestionsInfo>?) {
                    val info = results?.firstOrNull()?.takeIf { it.suggestionsCount > 0 }?.getSuggestionsInfoAt(0) ?: return
                    val typo = info.suggestionsAttributes and SuggestionsInfo.RESULT_ATTR_LOOKS_LIKE_TYPO != 0
                    val top = if (typo && info.suggestionsCount > 0) info.getSuggestionAt(0) else null
                    ui.post { spellTop = top; refreshStrip() }
                }
            }, true)
        }
    }

    override fun onDestroy() {
        runCatching { spell?.close() }
        super.onDestroy()
    }

    override fun onEvaluateFullscreenMode() = false

    override fun onCreateInputView(): View {
        dark = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        val r = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(if (dark) 0xFF202124.toInt() else 0xFFE8EAED.toInt())
            setPadding(0, 0, 0, dp(4))
            setOnApplyWindowInsetsListener { v, ins ->
                val nav = androidx.core.view.WindowInsetsCompat.toWindowInsetsCompat(ins, v)
                    .getInsets(androidx.core.view.WindowInsetsCompat.Type.navigationBars()).bottom
                v.setPadding(0, 0, 0, dp(4) + nav)
                ins
            }
        }
        strip = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        r.addView(strip, LinearLayout.LayoutParams(-1, dp(44)))
        body = FrameLayout(this)
        r.addView(body, LinearLayout.LayoutParams(-1, -2))
        root = r
        refreshStrip()
        build()
        return r
    }

    override fun onStartInputView(info: EditorInfo, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        val cls = info.inputType and InputType.TYPE_MASK_CLASS
        val variation = info.inputType and InputType.TYPE_MASK_VARIATION
        autocorrect = cls == InputType.TYPE_CLASS_TEXT &&
            variation !in listOf(InputType.TYPE_TEXT_VARIATION_PASSWORD, InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD, InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
                InputType.TYPE_TEXT_VARIATION_URI, InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS) &&
            info.inputType and InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS == 0
        layer = if (cls == InputType.TYPE_CLASS_NUMBER || cls == InputType.TYPE_CLASS_PHONE) Layer.SYM1 else Layer.LETTERS
        undo = null; spellTop = null; spellWord = ""
        updateAutoShift()
        refreshStrip()
        if (root != null) build()
    }

    // ---------------------------------------------------------------- input helpers

    private fun ic(): InputConnection? = currentInputConnection

    private fun updateAutoShift() {
        if (shift == Shift.CAPS || layer != Layer.LETTERS) return
        val ei = currentInputEditorInfo ?: return
        val caps = if (ei.inputType and InputType.TYPE_MASK_CLASS == InputType.TYPE_CLASS_TEXT) ic()?.getCursorCapsMode(ei.inputType) ?: 0 else 0
        val want = if (caps != 0) Shift.ONCE else Shift.OFF
        if (want != shift) { shift = want; if (layer == Layer.LETTERS) build() }
    }

    private fun wordBeforeCursor(): String {
        val t = ic()?.getTextBeforeCursor(40, 0)?.toString() ?: return ""
        var i = t.length
        while (i > 0 && (t[i - 1].isLetter() || t[i - 1] == '\'' || t[i - 1] == '’')) i--
        return t.substring(i)
    }

    private fun typeText(s: String) {
        undo = null
        ic()?.commitText(s, 1)
        if (shift == Shift.ONCE) { shift = Shift.OFF; build() }
        onTyped()
    }

    private fun onTyped() {
        val w = wordBeforeCursor()
        spellTop = null
        if (w.length >= 3 && autocorrect) {
            spellWord = w
            ui.removeCallbacks(spellReq)
            ui.postDelayed(spellReq, 120)
        }
        refreshStrip()
        updateAutoShift()
    }

    private val spellReq = Runnable {
        val w = spellWord
        if (w.isNotEmpty()) runCatching { spell?.getSentenceSuggestions(arrayOf(TextInfo(w)), 5) }
    }

    private fun space() {
        val c = ic() ?: return
        val now = System.currentTimeMillis()
        val before = c.getTextBeforeCursor(2, 0)?.toString() ?: ""
        if (now - lastSpace < 600 && before.length == 2 && before[1] == ' ' && before[0].isLetterOrDigit()) {
            c.deleteSurroundingText(1, 0); c.commitText(". ", 1)
            lastSpace = 0; undo = null
            if (shift == Shift.OFF) { shift = Shift.ONCE; build() }
            refreshStrip(); return
        }
        lastSpace = now
        val w = wordBeforeCursor()
        var done = false
        if (w.isNotEmpty() && autocorrect) {
            val fix = correction(w)
            if (fix != null) {
                c.beginBatchEdit(); c.deleteSurroundingText(w.length, 0); c.commitText("$fix ", 1); c.endBatchEdit()
                undo = w to fix; done = true
            } else learn(w, 1)
        }
        if (!done) { c.commitText(" ", 1); undo = null }
        spellTop = null
        refreshStrip(); updateAutoShift()
    }

    /** Best replacement for a finished word, or null to keep it. */
    private fun correction(w: String): String? {
        val low = w.lowercase(Locale.ROOT)
        val fix = TYPOS[low]
        if (fix != null) return matchCase(w, fix)
        if (w.length < 3 || learned.getInt(low, 0) >= 2) return null
        val top = spellTop?.takeIf { spellWord == w } ?: return null
        if (top.equals(w, true) || distance(low, top.lowercase(Locale.ROOT)) > 2) return null
        return matchCase(w, top)
    }

    private fun matchCase(orig: String, fix: String): String = when {
        orig.length > 1 && orig.all { it.isUpperCase() } -> fix.uppercase(Locale.ROOT)
        orig[0].isUpperCase() -> fix.replaceFirstChar { it.uppercase(Locale.ROOT) }
        else -> fix
    }

    private fun learn(w: String, n: Int) {
        val low = w.lowercase(Locale.ROOT)
        if (low.length < 2 || low.any { it.isDigit() }) return
        learned.edit().putInt(low, (learned.getInt(low, 0) + n).coerceAtMost(1000)).apply()
    }

    private fun distance(a: String, b: String): Int {
        var prev = IntArray(b.length + 1) { it }
        for (i in 1..a.length) {
            val cur = IntArray(b.length + 1); cur[0] = i
            for (j in 1..b.length) cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
            prev = cur
        }
        return prev[b.length]
    }

    private fun backspace() {
        val c = ic() ?: return
        val u = undo
        if (u != null) {
            val txt = c.getTextBeforeCursor(u.second.length + 1, 0)?.toString() ?: ""
            if (txt == u.second + " ") {
                c.beginBatchEdit(); c.deleteSurroundingText(u.second.length + 1, 0); c.commitText(u.first, 1); c.endBatchEdit()
                learn(u.first, 3); undo = null; spellTop = null
                refreshStrip(); return
            }
        }
        undo = null
        if (c.getSelectedText(0).isNullOrEmpty()) c.deleteSurroundingText(1, 0) else c.commitText("", 1)
        onTyped()
    }

    private fun enter() {
        val c = ic() ?: return
        val ei = currentInputEditorInfo
        val action = ei.imeOptions and EditorInfo.IME_MASK_ACTION
        val multiline = ei.inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE != 0
        if (!multiline && ei.imeOptions and EditorInfo.IME_FLAG_NO_ENTER_ACTION == 0 && action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
            c.performEditorAction(action)
        } else {
            c.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER)); c.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
        }
        undo = null; spellTop = null; refreshStrip(); updateAutoShift()
    }

    private fun pick(i: Int) {
        val s = sugg[i]; if (s.isEmpty()) return
        val c = ic() ?: return
        val w = wordBeforeCursor()
        c.beginBatchEdit(); c.deleteSurroundingText(w.length, 0); c.commitText("$s ", 1); c.endBatchEdit()
        learn(s, 1); undo = null; spellTop = null; lastSpace = 0
        refreshStrip(); updateAutoShift()
    }

    // ---------------------------------------------------------------- suggestion strip

    private fun refreshStrip() {
        val s = strip ?: return
        val w = wordBeforeCursor()
        val low = w.lowercase(Locale.ROOT)
        val out = ArrayList<String>()
        if (w.isNotEmpty()) {
            out.add(w)
            val fix = correction(w)
            if (fix != null) out.add(0, fix)
            val st = spellTop
            if (st != null && spellWord == w && st !in out) out.add(st)
            if (low.length >= 1) {
                learned.all.entries.asSequence()
                    .filter { it.key.startsWith(low) && it.key != low && (it.value as? Int ?: 0) >= 2 }
                    .sortedByDescending { it.value as? Int ?: 0 }
                    .take(3).forEach { if (matchCase(w, it.key) !in out) out.add(matchCase(w, it.key)) }
            }
        }
        val shown = if (out.size >= 3 && out[0] != w) listOf(out[1], out[0], out[2]) else out
        // Centre slot is the one that will be applied on space.
        for (i in 0..2) sugg[i] = shown.getOrNull(i) ?: ""
        s.removeAllViews()
        val fg = if (dark) 0xFFE8EAED.toInt() else 0xFF202124.toInt()
        for (i in 0..2) {
            val tv = TextView(this).apply {
                text = sugg[i]; setTextColor(fg); setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f); gravity = Gravity.CENTER
                maxLines = 1; if (i == 1 && sugg[1].isNotEmpty()) typeface = Typeface.DEFAULT_BOLD
                setOnClickListener { pick(i) }
            }
            s.addView(tv, LinearLayout.LayoutParams(0, -1, 1f))
            if (i < 2) s.addView(View(this).apply { setBackgroundColor(if (dark) 0xFF3C4043.toInt() else 0xFFCDD0D4.toInt()) }, LinearLayout.LayoutParams(dp(1), dp(22)))
        }
    }

    // ---------------------------------------------------------------- keyboard layers

    private fun build() {
        val b = body ?: return
        b.removeAllViews()
        when (layer) {
            Layer.LETTERS -> b.addView(letters())
            Layer.SYM1 -> b.addView(symbols(false))
            Layer.SYM2 -> b.addView(symbols(true))
            Layer.EMOJI -> b.addView(emojiPanel())
        }
    }

    private fun letters(): View {
        val col = column()
        val rows = listOf("qwertyuiop", "asdfghjkl", "zxcvbnm")
        rows.forEachIndexed { r, chars ->
            val row = row()
            if (r == 1) row.addView(spacer(0.5f))
            if (r == 2) row.addView(fnKey(shiftLabel(), 1.5f, shift != Shift.OFF) { onShift() })
            chars.forEach { ch ->
                val label = if (shift == Shift.OFF) ch.toString() else ch.uppercase()
                val digit = if (r == 0) "1234567890"[chars.indexOf(ch)].toString() else null
                row.addView(charKey(label, 1f, digit))
            }
            if (r == 1) row.addView(spacer(0.5f))
            if (r == 2) row.addView(fnKey("⌫", 1.5f, false, repeat = true) { backspace() })
            col.addView(row, rowParams())
        }
        col.addView(bottomRow("?123") { layer = Layer.SYM1; build() }, rowParams())
        return col
    }

    private fun symbols(second: Boolean): View {
        val col = column()
        val rows = if (!second) listOf("1234567890", "@#$%&-+()/", "*\"':;!?") else listOf("~`|•√π÷×¶∆", "£¢€¥^°={}\\", "©®™✓[]<>")
        rows.forEachIndexed { r, chars ->
            val row = row()
            if (r == 2) row.addView(fnKey(if (second) "?123" else "=\\<", 1.5f, false) { layer = if (second) Layer.SYM1 else Layer.SYM2; build() })
            chars.forEach { row.addView(charKey(it.toString(), 1f, null)) }
            if (r == 2) row.addView(fnKey("⌫", 1.5f, false, repeat = true) { backspace() })
            col.addView(row, rowParams())
        }
        col.addView(bottomRow("ABC") { layer = Layer.LETTERS; build(); updateAutoShift() }, rowParams())
        return col
    }

    private fun bottomRow(switchLabel: String, switchTo: () -> Unit): View {
        val row = row()
        row.addView(fnKey(switchLabel, 1.5f, false) { switchTo() })
        row.addView(charKey(",", 1f, null))
        row.addView(fnKey("☺", 1f, false) { layer = Layer.EMOJI; build(); Emojis.syncNow(); ui.postDelayed({ if (layer == Layer.EMOJI) build() }, 2000) })
        row.addView(key(" ", 5f, false, bg(letterColor())) { space() })
        row.addView(charKey(".", 1f, null))
        row.addView(fnKey("↵", 1.5f, true) { enter() })
        return row
    }

    private fun onShift() {
        shift = when (shift) { Shift.OFF -> Shift.ONCE; Shift.ONCE -> Shift.CAPS; Shift.CAPS -> Shift.OFF }
        build()
    }

    private fun shiftLabel() = when (shift) { Shift.OFF -> "⇧"; Shift.ONCE -> "⬆"; Shift.CAPS -> "⇪" }

    // ---------------------------------------------------------------- emoji panel

    private fun emojiPanel(): View {
        val col = column()
        val tabs = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val tabRow = LinearLayout(this)
        fun tab(label: String, sel: Boolean, go: () -> Unit) {
            tabRow.addView(TextView(this).apply {
                text = label; setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f); gravity = Gravity.CENTER
                setPadding(dp(14), 0, dp(14), 0)
                setTextColor(fgColor())
                background = if (sel) bg(fnColor(), 8) else null
                setOnClickListener { go() }
            }, LinearLayout.LayoutParams(-2, dp(40)))
        }
        tab("ABC", false) { layer = Layer.LETTERS; build(); updateAutoShift() }
        tab("★", emojiTab == -1) { emojiTab = -1; build() }
        UNICODE.forEachIndexed { i, (icon, _) -> tab(icon, emojiTab == i) { emojiTab = i; build() } }
        tab("⌫", false) { backspace() }
        tabs.addView(tabRow)
        col.addView(tabs, LinearLayout.LayoutParams(-1, dp(44)))

        val scroll = ScrollView(this)
        val cols = 7
        val grid = GridLayout(this).apply { columnCount = cols }
        val cell = (resources.displayMetrics.widthPixels - dp(8)) / cols
        if (emojiTab == -1) {
            val items = Emojis.list.toList()
            if (items.isEmpty()) {
                scroll.addView(TextView(this).apply {
                    text = "No custom emojis yet.\nAdd some in Lodica > Settings > Emoji keyboard."
                    setTextColor(fgColor()); gravity = Gravity.CENTER; setPadding(dp(24), dp(40), dp(24), dp(40))
                })
            } else {
                items.forEach { e ->
                    val iv = ImageView(this).apply {
                        setPadding(dp(8), dp(8), dp(8), dp(8))
                        background = bg(letterColor(), 10)
                        bitmap(e.name)?.let { setImageBitmap(it) }
                        setOnClickListener { performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); sendCustom(e.name) }
                    }
                    grid.addView(iv, GridLayout.LayoutParams().apply { width = cell - dp(4); height = cell - dp(4); setMargins(dp(2), dp(2), dp(2), dp(2)) })
                }
                scroll.addView(grid)
            }
        } else {
            UNICODE[emojiTab].second.split(" ").filter { it.isNotEmpty() }.forEach { e ->
                val tv = TextView(this).apply {
                    text = e; setTextSize(TypedValue.COMPLEX_UNIT_SP, 26f); gravity = Gravity.CENTER
                    setOnClickListener { performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); typeText(e) }
                }
                grid.addView(tv, GridLayout.LayoutParams().apply { width = cell; height = cell })
            }
            scroll.addView(grid)
        }
        col.addView(scroll, LinearLayout.LayoutParams(-1, if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) dp(110) else dp(164)))
        return col
    }

    private fun bitmap(name: String): Bitmap? = bitmaps.get(name) ?: runCatching { BitmapFactory.decodeFile(Emojis.file(name).path) }.getOrNull()?.also { bitmaps.put(name, it) }

    /** Sends the emoji as an image when the editor takes PNGs, otherwise as `:name:`. */
    private fun sendCustom(name: String) {
        val c = ic() ?: return
        val ei = currentInputEditorInfo
        val accepts = ei != null && EditorInfoCompat.getContentMimeTypes(ei).any { ClipDescription.compareMimeTypes(it, "image/png") }
        if (accepts) {
            val ok = runCatching {
                val uri: Uri = FileProvider.getUriForFile(this, "$packageName.files", Emojis.file(name))
                val info = InputContentInfoCompat(uri, ClipDescription(name, arrayOf("image/png")), null)
                InputConnectionCompat.commitContent(c, ei, info, InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION, null)
            }.getOrDefault(false)
            if (ok) return
        }
        typeText(if (name.all { it.isDigit() }) ":emoji$name:" else ":$name:")
    }

    // ---------------------------------------------------------------- view factories

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun fgColor() = if (dark) 0xFFE8EAED.toInt() else 0xFF202124.toInt()
    private fun letterColor() = if (dark) 0xFF3C4043.toInt() else 0xFFFFFFFF.toInt()
    private fun fnColor() = if (dark) 0xFF5F6368.toInt() else 0xFFC4C7CC.toInt()
    private fun accentColor() = if (dark) 0xFF8AB4F8.toInt() else 0xFF1A73E8.toInt()
    private fun bg(color: Int, radius: Int = 8) = GradientDrawable().apply { setColor(color); cornerRadius = dp(radius).toFloat() }

    private fun column() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(3), dp(2), dp(3), 0) }
    private fun row() = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    private fun rowParams() = LinearLayout.LayoutParams(-1, dp(52))
    private fun spacer(w: Float) = View(this).apply { layoutParams = LinearLayout.LayoutParams(0, -1, w) }

    private fun charKey(label: String, w: Float, longDigit: String?): View =
        key(label, w, false, bg(letterColor()), longPress = longDigit?.let { d -> { typeText(d) } }) { typeText(label) }

    private fun fnKey(label: String, w: Float, accent: Boolean, repeat: Boolean = false, tap: () -> Unit): View =
        key(label, w, repeat, bg(if (accent) accentColor() else fnColor()), accent, tap = tap)

    private fun key(label: String, w: Float, repeat: Boolean, background: GradientDrawable, accentText: Boolean = false,
                    longPress: (() -> Unit)? = null, tap: () -> Unit): View {
        val wrap = FrameLayout(this).apply { setPadding(dp(3), dp(4), dp(3), dp(4)) }
        val tv = TextView(this).apply {
            text = label; gravity = Gravity.CENTER; this.background = background
            setTextColor(if (accentText && !dark) Color.WHITE else if (accentText) 0xFF202124.toInt() else fgColor())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, if (label.length > 1 && label != " ") 14f else 21f)
            isClickable = true
        }
        val normal = (background.color)?.defaultColor ?: 0
        var fired = false
        val rep = object : Runnable { override fun run() { fired = true; tap(); ui.postDelayed(this, 50) } }
        val lp = Runnable { fired = true; tv.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS); longPress?.invoke() }
        tv.setOnTouchListener { v, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    fired = false
                    background.setColor(shade(normal)); v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    if (repeat) ui.postDelayed(rep, 400) else if (longPress != null) ui.postDelayed(lp, 380)
                }
                MotionEvent.ACTION_UP -> {
                    background.setColor(normal); ui.removeCallbacks(rep); ui.removeCallbacks(lp)
                    if (!fired) tap()
                }
                MotionEvent.ACTION_CANCEL -> { background.setColor(normal); ui.removeCallbacks(rep); ui.removeCallbacks(lp) }
            }
            true
        }
        wrap.addView(tv, FrameLayout.LayoutParams(-1, -1))
        wrap.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, w)
        return wrap
    }

    private fun shade(c: Int): Int {
        val f = if (dark) 1.3f else 0.85f
        return Color.rgb((Color.red(c) * f).toInt().coerceIn(0, 255), (Color.green(c) * f).toInt().coerceIn(0, 255), (Color.blue(c) * f).toInt().coerceIn(0, 255))
    }

    companion object {
        /** Small table of very common slips, applied on space. The system spell checker and learned words cover the rest. */
        private val TYPOS = mapOf(
            "dont" to "don't", "cant" to "can't", "wont" to "won't", "isnt" to "isn't", "arent" to "aren't", "wasnt" to "wasn't",
            "werent" to "weren't", "didnt" to "didn't", "doesnt" to "doesn't", "couldnt" to "couldn't", "shouldnt" to "shouldn't",
            "wouldnt" to "wouldn't", "havent" to "haven't", "hasnt" to "hasn't", "hadnt" to "hadn't", "im" to "I'm", "ive" to "I've",
            "id" to "I'd", "ill" to "I'll", "thats" to "that's", "whats" to "what's", "youre" to "you're", "theyre" to "they're",
            "thier" to "their", "teh" to "the", "adn" to "and", "taht" to "that", "waht" to "what", "recieve" to "receive",
            "definately" to "definitely", "seperate" to "separate", "occured" to "occurred", "untill" to "until", "wich" to "which",
            "becuase" to "because", "beacuse" to "because", "alot" to "a lot", "i" to "I", "u" to "you", "tomorow" to "tomorrow",
            "wierd" to "weird", "freind" to "friend", "truely" to "truly", "goverment" to "government", "enviroment" to "environment"
        )

        private val UNICODE = listOf(
            "😀" to "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫡 🤭 🤫 🫠 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕",
            "👍" to "👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐 🖖 👋 🤝 🙏 ✍️ 💅 💪 🦾 👏 🙌 👐 🤲 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🕳 💬 💭 💤",
            "🐶" to "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🦎 🐙 🦑 🦀 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐘 🦒 🦓 🌵 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🌹 🌻 🌼 🌸 🌞 🌝 ⭐ 🌈 ☁️ ⛄ 🔥 💧 🌊",
            "🍔" to "🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥕 🌽 🌶 🥔 🍞 🥐 🧀 🍳 🥞 🥓 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🍝 🍜 🍣 🍤 🍙 🍚 🍦 🍩 🍪 🎂 🍰 🍫 🍬 🍭 ☕ 🍵 🥤 🍺 🍻 🥂 🍷",
            "⚽" to "⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🎯 🎮 🎲 🎸 🎹 🎧 🎤 🎬 🎨 🚗 🚕 🚌 🏎 🚓 🚑 🚒 🚲 🛵 🏍 ✈️ 🚀 🛸 🚁 ⛵ 🚢 🏠 🏢 🏰 🗽 🗼 ⌚ 📱 💻 ⌨️ 🖥 📷 🔋 💡 🔑 🔒 🎁 🎈 🎉 🎊 🏆 🥇 💎 📌 📎 ✏️ 📚 ✅ ❌ ❓ ❗ ⚠️ 🔔 ♻️"
        )
    }
}
