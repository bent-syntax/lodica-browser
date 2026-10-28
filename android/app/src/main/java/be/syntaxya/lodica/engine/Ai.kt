package be.syntaxya.lodica.engine

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import be.syntaxya.lodica.ui.Prompts
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Ask AI. With an Anthropic API key (stored in the Keystore) questions go straight to Claude Haiku 5.5 with web search.
 * Without a key, they go through the official Claude Code running inside Termux. Lodica starts `assets/ai/bridge.js` in Termux
 * with RUN_COMMAND and talks to it over a localhost socket guarded by a random token. Lodica never sees the
 * user's Claude credentials, and questions, answers and memory never leave the phone except to Anthropic.
 */
object Ai {
    private const val TAG = "LodicaAi"
    private const val PORT = 47821
    private const val TERMUX = "com.termux"
    private const val BIN = "/data/data/com.termux/files/usr/bin"
    const val PERMISSION = "com.termux.permission.RUN_COMMAND"
    /** Characters Lodica sends per request (about 300 tokens); Claude Code adds its own fixed overhead. */
    private const val PROMPT_CHARS = 1200
    private const val CONTEXT_CHARS = 480
    /** Haiku 5.5 only, on purpose: cheap and fast. */
    const val MODEL = "claude-haiku-5-5"
    private const val SYSTEM = "You are Lodica's browser assistant. Plain text only, no markdown headings. " +
        "Answer the question that was actually asked, directly. Keep it short for simple questions and thorough for hard ones. " +
        "A 'Background about the user' list may follow. It is private context, not a topic. Use a fact only when the question is about the user or the fact changes the answer. " +
        "Never mention, summarize or react to the list otherwise. A question unrelated to the list gets an answer unrelated to the list. " +
        "If the user states a lasting fact about themselves, add a final line 'MEMO: <fact>' (one short fact). Add no MEMO line otherwise. " +
        "Never invent facts. If unsure, say so."
    private const val RESEARCH = " For factual, current or complex questions, research first: run one focused web search (never more), compare sources, then write one answer that states what is established, flags disagreement, and names the sources by site name."
    private const val FOLLOW_UP = " This is a follow-up in a conversation. Answer briefly, using the earlier messages."
    private const val API_URL = "https://api.anthropic.com/v1/messages"

    private lateinit var app: Context
    private lateinit var token: String
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    var enabled by mutableStateOf(false)
        private set
    var connected by mutableStateOf(false)
        private set
    var status by mutableStateOf("Off")
        private set
    /** True when an Anthropic API key is stored; the key itself never leaves [Secret] except to Anthropic. */
    var hasKey by mutableStateOf(false)
        private set
    private var apiKey: String? = null

    fun setKey(k: String) {
        val v = k.trim().ifEmpty { null }
        apiKey = v
        hasKey = v != null
        Secret.put("aikey", v)
        connected = hasKey || (enabled && status == "Connected")
        Helper.push()
    }

    fun init(ctx: Context) {
        app = ctx.applicationContext
        val sp = app.getSharedPreferences("ai", Context.MODE_PRIVATE)
        token = sp.getString("token", null) ?: ByteArray(24).also { SecureRandom().nextBytes(it) }
            .joinToString("") { "%02x".format(it) }.also { sp.edit().putString("token", it).apply() }
        enabled = sp.getBoolean("enabled", false)
        Secret.init(app)
        apiKey = Secret.get("aikey")
        hasKey = apiKey != null
        connected = hasKey
        Helper.push()
        if (enabled) { status = "Checking…"; io.execute { val ok = ping(); main.post { setConnected(ok, false) } } }
    }

    fun updateEnabled(v: Boolean) {
        enabled = v
        app.getSharedPreferences("ai", Context.MODE_PRIVATE).edit().putBoolean("enabled", v).apply()
        if (v) connect() else { connected = hasKey; status = "Off"; Helper.push() }
    }

    val termuxInstalled: Boolean
        get() = runCatching { app.packageManager.getPackageInfo(TERMUX, 0) }.isSuccess

    /** Pings the bridge; if it is not running, asks for the Termux permission and starts it. */
    fun connect() {
        if (!enabled) return
        if (!termuxInstalled) { connected = hasKey; status = "Termux not installed"; return }
        status = "Connecting…"
        io.execute {
            if (ping()) { main.post { setConnected(true, false) }; return@execute }
            main.post {
                val host = Prompts.host
                if (host == null) { start(); return@post }
                host.requestAndroid(arrayOf(PERMISSION)) { ok ->
                    if (ok) start() else { connected = hasKey; status = "Termux permission denied" }
                }
            }
        }
    }

    private fun start() {
        val script = runCatching { app.assets.open("ai/bridge.js").bufferedReader().readText() }.getOrElse { "" }
        val intent = Intent().setClassName(TERMUX, "com.termux.app.RunCommandService")
            .setAction("com.termux.RUN_COMMAND")
            .putExtra("com.termux.RUN_COMMAND_PATH", "$BIN/node")
            .putExtra("com.termux.RUN_COMMAND_ARGUMENTS", arrayOf("-e", script, token, PORT.toString(), SYSTEM))
            .putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home")
            .putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
        try { app.startService(intent) } catch (e: Exception) {
            Log.w(TAG, "termux start failed: ${e.javaClass.simpleName}")
            connected = hasKey; status = "Termux refused the command (allow-external-apps?)"; return
        }
        io.execute {
            var ok = false
            for (i in 0 until 12) { Thread.sleep(1000); if (ping()) { ok = true; break } }
            main.post { setConnected(ok, true) }
        }
    }

    private fun setConnected(ok: Boolean, started: Boolean) {
        connected = hasKey || (ok && enabled)
        status = when {
            !enabled -> "Off"
            ok -> "Connected"
            started -> "Bridge did not start (Node and Claude Code installed?)"
            else -> "Not running. Tap to connect"
        }
        Helper.push()
    }

    private fun sysWithMemory(): String {
        val m = Memory.prompt()
        return SYSTEM + if (m.isNotEmpty()) "\n\nBackground about the user:\n$m" else ""
    }

    /** One question with optional page or search text. Facts reported with `MEMO:` go to [Memory]. */
    fun ask(question: String, context: String, prior: List<Pair<String, String>> = emptyList(), done: (Result<String>) -> Unit) {
        val ctx = context.replace(Regex("\\s+"), " ").trim().take(1200)
        val q = question.trim().take(4000)
        val content = if (ctx.isEmpty()) q else "Page context (only if the question is about it):\n$ctx\n\nQuestion: $q"
        run(prior + ("user" to content), done)
    }

    /** A chat turn: [turns] is the whole thread, the last one is the user's new message. */
    fun chat(turns: List<Pair<String, String>>, done: (Result<String>) -> Unit) = run(turns, done)

    private fun run(all: List<Pair<String, String>>, done: (Result<String>) -> Unit) {
        // A first message may search (one search). Follow-ups never search and send only a short tail of the thread:
        // old answers are clipped, so remembering the conversation costs few tokens.
        val search = all.size == 1
        val tail = all.takeLast(6)
        val turns = tail.mapIndexed { i, t ->
            t.first to t.second.take(if (i == tail.lastIndex) 4000 else if (t.first == "assistant") 700 else 400)
        }
        val system = sysWithMemory()
        val key = apiKey
        io.execute {
            val r = runCatching {
                var input = 0L; var output = 0L
                val text = if (key != null) {
                    val res = viaApi(key, turns, system, search)
                    input = res.input; output = res.output; res.text
                } else {
                    val prompt = system + "\n\n" + turns.joinToString("\n\n") { (if (it.first == "user") "User: " else "Assistant: ") + it.second } + "\n\nAssistant:"
                    val res = call(JSONObject().put("token", token).put("prompt", prompt.take(16000)), 120_000)
                    res.optJSONObject("usage")?.let { u ->
                        input = u.optLong("input_tokens") + u.optLong("cache_creation_input_tokens") + u.optLong("cache_read_input_tokens")
                        output = u.optLong("output_tokens")
                    }
                    res.optString("error").takeIf { it.isNotEmpty() }?.let { throw IllegalStateException(it) }
                    res.optString("text")
                }
                main.post { record(input, output) }
                val lines = text.lines()
                lines.mapNotNull { Regex("^\\s*MEMO:\\s*(.+)$", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1) }
                    .forEach { m -> main.post { Memory.add(m) } }
                val out = lines.filterNot { Regex("^\\s*MEMO:", RegexOption.IGNORE_CASE).containsMatchIn(it) }.joinToString("\n").trim()
                if (out.isEmpty()) throw IllegalStateException("Empty answer")
                out
            }
            if (key == null && r.exceptionOrNull() is java.io.IOException) main.post { connected = hasKey; status = "Not running. Tap to connect"; Helper.push() }
            main.post { done(r) }
        }
    }

    private class Reply(val text: String, val input: Long, val output: Long)

    /** Asks Claude for a flat SVG of [idea]. [done] gets the SVG markup, on the main thread. Needs an API key. */
    fun drawEmoji(idea: String, done: (Result<String>) -> Unit) {
        val key = apiKey ?: return done(Result.failure(IllegalStateException("Add an Anthropic API key first")))
        io.execute {
            val r = runCatching {
                val body = JSONObject().put("model", MODEL).put("max_tokens", 1500)
                    .put("system", "You draw emoji. Reply with one complete SVG and nothing else: viewBox=\"0 0 64 64\", flat colours, no text, no scripts, no external references, under 1500 characters.")
                    .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", "Emoji: ${idea.take(80)}")))
                val (code, j) = post(key, body)
                if (code !in 200..299) throw apiError(code, j)
                val a = j.optJSONArray("content") ?: throw IllegalStateException("Empty reply")
                val text = (0 until a.length()).mapNotNull { a.optJSONObject(it)?.optString("text") }.joinToString("")
                val s = text.indexOf("<svg"); val e = text.lastIndexOf("</svg>")
                if (s < 0 || e < s) throw IllegalStateException("No drawing returned")
                text.substring(s, e + 6)
            }
            main.post { done(r) }
        }
    }

    private fun post(key: String, body: JSONObject): Pair<Int, JSONObject> {
        val c = URL(API_URL).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15_000
            c.readTimeout = 90_000
            c.doOutput = true
            c.setRequestProperty("x-api-key", key)
            c.setRequestProperty("anthropic-version", "2023-06-01")
            c.setRequestProperty("content-type", "application/json")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.readText().orEmpty()
            return code to (runCatching { JSONObject(text) }.getOrNull() ?: JSONObject())
        } finally { c.disconnect() }
    }

    private fun apiError(code: Int, j: JSONObject): Exception {
        val m = j.optJSONObject("error")?.optString("message").orEmpty()
        return IllegalStateException(when (code) {
            401 -> "API key rejected"
            429 -> "Rate limited, try again in a moment"
            else -> m.ifEmpty { "AI failed ($code)" }
        })
    }

    /** One Haiku 5.5 call. Web search is tried first (deep research); when the account has it off the call retries without. */
    private fun viaApi(key: String, turns: List<Pair<String, String>>, system: String, search: Boolean): Reply {
        fun msgs() = JSONArray().apply { turns.forEach { put(JSONObject().put("role", if (it.first == "assistant") "assistant" else "user").put("content", it.second)) } }
        var input = 0L; var output = 0L
        fun add(j: JSONObject) {
            j.optJSONObject("usage")?.let { u ->
                input += u.optLong("input_tokens") + u.optLong("cache_creation_input_tokens") + u.optLong("cache_read_input_tokens")
                output += u.optLong("output_tokens")
            }
        }
        fun textOf(j: JSONObject): String {
            val a = j.optJSONArray("content") ?: return ""
            return (0 until a.length()).mapNotNull { a.optJSONObject(it)?.takeIf { b -> b.optString("type") == "text" }?.optString("text") }.joinToString("").trim()
        }
        val conv = msgs()
        var last: JSONObject? = null
        var failed = !search
        for (i in 0 until (if (search) 4 else 0)) {
            val body = JSONObject().put("model", MODEL).put("max_tokens", 4096).put("system", system + RESEARCH).put("messages", conv)
                .put("tools", JSONArray().put(JSONObject().put("type", "web_search_20250305").put("name", "web_search").put("max_uses", 1)))
            val (code, j) = post(key, body)
            if (code == 400 || code == 403) { failed = true; break }
            if (code !in 200..299) throw apiError(code, j)
            add(j); last = j
            if (j.optString("stop_reason") != "pause_turn") break
            conv.put(JSONObject().put("role", "assistant").put("content", j.optJSONArray("content")))
        }
        if (failed || last == null) {
            val (code, j) = post(key, JSONObject().put("model", MODEL).put("max_tokens", if (search) 4096 else 1500).put("system", if (search) system else system + FOLLOW_UP).put("messages", msgs()))
            if (code !in 200..299) throw apiError(code, j)
            add(j); last = j
        }
        if (last!!.optString("stop_reason") == "refusal") throw IllegalStateException("The assistant declined to answer that.")
        return Reply(textOf(last), input, output)
    }

    /** Token totals for one span of days. Input counts cache reads and writes too. */
    data class Usage(val requests: Long, val input: Long, val output: Long)

    /** Bumped on every change so Compose re-reads [usage]. */
    var usageVersion by mutableStateOf(0)
        private set

    private fun usagePrefs() = app.getSharedPreferences("ai_usage", Context.MODE_PRIVATE)
    private fun day(offset: Int = 0): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(System.currentTimeMillis() - offset * 86_400_000L))

    /** Adds one answer's usage to today's totals and the all-time totals; days older than 30 are dropped. */
    private fun record(input: Long, output: Long) {
        val sp = usagePrefs()
        val days = runCatching { JSONObject(sp.getString("days", "{}")!!) }.getOrElse { JSONObject() }
        val today = day()
        val d = days.optJSONObject(today) ?: JSONObject()
        days.put(today, d.put("r", d.optLong("r") + 1).put("i", d.optLong("i") + input).put("o", d.optLong("o") + output))
        val keep = (0 until 30).map { day(it) }.toSet()
        days.keys().asSequence().toList().filter { it !in keep }.forEach { days.remove(it) }
        sp.edit().putString("days", days.toString())
            .putLong("r", sp.getLong("r", 0) + 1).putLong("i", sp.getLong("i", 0) + input).putLong("o", sp.getLong("o", 0) + output)
            .apply()
        usageVersion++
    }

    /** Totals over the last [days] days including today, or all time when null. */
    fun usage(days: Int?): Usage {
        val sp = usagePrefs()
        if (days == null) return Usage(sp.getLong("r", 0), sp.getLong("i", 0), sp.getLong("o", 0))
        val all = runCatching { JSONObject(sp.getString("days", "{}")!!) }.getOrElse { JSONObject() }
        var r = 0L; var i = 0L; var o = 0L
        for (k in 0 until days) all.optJSONObject(day(k))?.let { r += it.optLong("r"); i += it.optLong("i"); o += it.optLong("o") }
        return Usage(r, i, o)
    }

    fun resetUsage() { usagePrefs().edit().clear().apply(); usageVersion++ }

    private fun ping(): Boolean =
        runCatching { call(JSONObject().put("token", token).put("ping", true), 2000).optBoolean("ok") }.getOrDefault(false)

    private fun call(req: JSONObject, timeout: Int): JSONObject = Socket().use { s ->
        s.connect(InetSocketAddress("127.0.0.1", PORT), 1500)
        s.soTimeout = timeout
        s.getOutputStream().apply { write((req.toString() + "\n").toByteArray()); flush() }
        val line = s.getInputStream().bufferedReader().readLine() ?: throw java.io.IOException("bridge closed")
        JSONObject(line)
    }
}
