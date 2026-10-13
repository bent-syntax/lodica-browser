package be.syntaxya.lodica.engine

import android.content.Context
import android.net.Uri
import org.json.JSONObject

/**
 * Imports what Chrome can export. Chrome on Android hands its data to no other app, so the user
 * exports on the other side: Password Manager > Export (CSV), and Google Takeout > Chrome (History.json).
 */
object ChromeImport {
    data class Result(val count: Int, val skipped: Int)

    /** Chrome password CSV: name,url,username,password,note. Columns are found by header name. */
    fun passwords(ctx: Context, uri: Uri): Result {
        val rows = parseCsv(ctx.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }.orEmpty())
        val head = rows.firstOrNull()?.map { it.trim().lowercase() } ?: return Result(0, 0)
        val iUrl = head.indexOf("url").takeIf { it >= 0 } ?: return Result(0, rows.size)
        val iUser = head.indexOf("username")
        val iPass = head.indexOf("password").takeIf { it >= 0 } ?: return Result(0, rows.size)
        var ok = 0
        var skipped = 0
        for (r in rows.drop(1)) {
            val u = Uri.parse(r.getOrNull(iUrl).orEmpty().trim())
            val pass = r.getOrNull(iPass).orEmpty()
            val host = u.host
            if (host == null || pass.isEmpty() || (u.scheme != "http" && u.scheme != "https")) { skipped++; continue }
            val port = if (u.port > 0) ":" + u.port else ""
            Vault.save(null, "${u.scheme}://$host$port", null, null, if (iUser >= 0) r.getOrNull(iUser).orEmpty() else "", pass)
            ok++
        }
        return Result(ok, skipped)
    }

    /** Takeout History.json: {"Browser History": [{"title", "url", "time_usec", ...}]}. */
    fun history(ctx: Context, uri: Uri): Result {
        val text = ctx.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: return Result(0, 0)
        val arr = JSONObject(text).optJSONArray("Browser History") ?: return Result(0, 0)
        val items = ArrayList<Visit>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val url = o.optString("url")
            if (!url.startsWith("http://") && !url.startsWith("https://")) continue
            items.add(Visit(url, o.optString("title"), 1, o.optLong("time_usec") / 1000))
        }
        History.importVisits(items)
        return Result(items.size, arr.length() - items.size)
    }

    /** Minimal RFC 4180 reader: quoted fields, doubled quotes, newlines inside quotes. */
    internal fun parseCsv(text: String): List<List<String>> {
        val rows = ArrayList<List<String>>()
        var row = ArrayList<String>()
        val f = StringBuilder()
        var quoted = false
        var i = 0
        val s = text.removePrefix("﻿")
        while (i < s.length) {
            val c = s[i]
            when {
                quoted && c == '"' && s.getOrNull(i + 1) == '"' -> { f.append('"'); i++ }
                c == '"' -> quoted = !quoted
                !quoted && c == ',' -> { row.add(f.toString()); f.setLength(0) }
                !quoted && (c == '\n' || c == '\r') -> {
                    if (c == '\r' && s.getOrNull(i + 1) == '\n') i++
                    row.add(f.toString()); f.setLength(0)
                    if (row.any { it.isNotEmpty() }) rows.add(row)
                    row = ArrayList()
                }
                else -> f.append(c)
            }
            i++
        }
        if (f.isNotEmpty() || row.isNotEmpty()) { row.add(f.toString()); rows.add(row) }
        return rows
    }
}
