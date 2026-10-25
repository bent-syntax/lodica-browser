package be.syntaxya.lodica.engine

import java.math.BigDecimal
import java.math.MathContext
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.sqrt

/** Math answer for selected text: "12*(3+4)" gives "84", "3x - 24 = -6" gives "x = 6". Port of calc and solve in the helper extension's content.js. Keep in step. */
object MathSolver {
    private class Bad : Exception()

    fun answer(text: String): String? = solve(text) ?: calc(text)

    private val ci = RegexOption.IGNORE_CASE

    /** JS String(Number(v.toPrecision(p))) for the ranges used here. */
    private fun num(v: Double, p: Int): String {
        if (v == 0.0) return "0"
        if (abs(v) < 1e-6) return String.format(java.util.Locale.ROOT, "%.${p - 1}e", v).replace(Regex("e([+-])0*(\\d)"), "e$1$2").replaceFirst(Regex("\\.?0+e"), "e")
        return BigDecimal(v).round(MathContext(p)).stripTrailingZeros().toPlainString()
    }

    fun calc(src: String): String? {
        var s = src.trim().replace(Regex("\\s*=\\s*\\??\\s*$"), "")
        if (s.isEmpty() || s.length > 200 || !Regex("\\d").containsMatchIn(s)) return null
        s = s.replace(Regex("[×·⋅]"), "*").replace("÷", "/").replace(Regex("[−–—]"), "-").replace(' ', ' ')
        s = s.replace(Regex("(?<=[\\d)])\\s*x\\s*(?=[\\d(])", ci), "*").replace("**", "^")
        if (!Regex("^[\\d\\s.,+\\-*/^%()a-z]+$", ci).matches(s)) return null
        if (Regex("^\\d{1,4}[-/.]\\d{1,2}[-/.]\\d{1,4}$").matches(s) || Regex("^\\+?[\\d\\s()-]{7,}$").matches(s) && !Regex("[+*/^%]").containsMatchIn(s)) return null
        if (!Regex("[+\\-*/^%]|sqrt|pi", ci).containsMatchIn(s)) return null
        if (Regex("^-?[\\d.,]+(?:\\s*-\\s*[\\d.,]+)$").matches(s) && !Regex("\\s").containsMatchIn(s)) return null
        // 1,234.5 and 1.234,5 both read as one number; a lone comma is a decimal comma
        s = s.replace(Regex("\\d[\\d.,]*")) { m ->
            val n = m.value
            val c = n.lastIndexOf(','); val d = n.lastIndexOf('.')
            when {
                c < 0 -> n
                d >= 0 -> if (c > d) n.replace(".", "").replace(",", ".") else n.replace(",", "")
                Regex("^\\d{1,3}(,\\d{3})+$").matches(n) -> n.replace(",", "")
                else -> n.replace(",", ".")
            }
        }
        val t = Regex("\\d+\\.?\\d*|\\.\\d+|sqrt|pi|[+\\-*/^%()]|\\s+", ci).findAll(s).map { it.value }.toList()
        if (t.joinToString("") != s) return null
        val tk = t.filter { it.isNotBlank() }
        var i = 0
        var ops = 0
        fun peek() = tk.getOrNull(i)
        lateinit var expr: () -> Double
        lateinit var unary: () -> Double
        fun atom(): Double {
            val x = tk.getOrNull(i++) ?: throw Bad()
            if (x == "(") { val v = expr(); if (tk.getOrNull(i++) != ")") throw Bad(); return v }
            if (x.equals("sqrt", true)) { ops++; return sqrt(atom()) }
            if (x.equals("pi", true)) return Math.PI
            if (x[0].isDigit() || x[0] == '.') return x.toDouble()
            throw Bad()
        }
        fun post(): Double {
            var v = atom()
            while (peek() == "%") { i++; v /= 100; ops++ }
            return v
        }
        fun power(): Double {
            val b = post()
            if (peek() == "^") { i++; val e = unary(); ops++; return b.pow(e) }
            return b
        }
        unary = {
            when (peek()) {
                "-" -> { i++; -unary() }
                "+" -> { i++; unary() }
                else -> power()
            }
        }
        fun term(): Double {
            var v = unary()
            while (peek() == "*" || peek() == "/") { val o = tk[i++]; val r = unary(); v = if (o == "*") v * r else v / r; ops++ }
            return v
        }
        expr = {
            var v = term()
            while (peek() == "+" || peek() == "-") { val o = tk[i++]; val r = term(); v = if (o == "+") v + r else v - r; ops++ }
            v
        }
        val v = try { expr().also { if (i != tk.size) return null } } catch (e: Bad) { return null }
        if (ops == 0 || v.isNaN() || v.isInfinite()) return null
        if (abs(v) >= 1e15 || (v != 0.0 && abs(v) < 1e-9)) return String.format(java.util.Locale.ROOT, "%.6e", v).replace(Regex("e([+-])0*(\\d)"), "e$1$2").replaceFirst(Regex("\\.?0+e"), "e")
        return num(v, 12)
    }

    /** "3x - 24 = -6" gives "x = 6"; one letter unknown, degree 1 or 2. */
    fun solve(src: String): String? {
        val s = src.trim().replace(Regex("[−–—]"), "-").replace(Regex("[×·⋅]"), "*").replace("÷", "/").replace("**", "^")
        if (s.length > 120 || s.count { it == '=' } != 1) return null
        val (l, r) = s.split("=")
        if (l.isBlank() || r.isBlank()) return null
        val vars = Regex("[a-z]", ci).findAll(s.replace(Regex("sqrt|pi", ci), "")).map { it.value.lowercase() }.toSet()
        if (vars.size != 1) return null
        val v = vars.first()
        if (!Regex("^[\\d\\s.,+\\-*/^%()a-z=]+$", ci).matches(s) || !Regex("\\d").containsMatchIn(s)) return null
        fun side(t: String, x: Int): String = t.replace(Regex("sqrt|pi", ci)) { "\u0000" + it.value.lowercase() + "\u0000" }
            .replace(Regex(v, ci), "\u0001")
            .replace(Regex("(?<=[\\d)])\\s*(?=\u0001)"), "*").replace(Regex("(?<=\u0001)\\s*(?=[\\d(])"), "*").replace(Regex("\u0001\\s*(?=\u0001)"), "\u0001*")
            .replace("\u0001", "($x)").replace("\u0000", "").replace(Regex("(?<=[\\d)])\\s*(?=\\()"), "*")
        fun f(x: Int): Double = calc("(" + side(l, x) + ")-(" + side(r, x) + ")")?.toDoubleOrNull() ?: Double.NaN
        val f0 = f(0); val f1 = f(1); val f2 = f(2); val f3 = f(3)
        if (listOf(f0, f1, f2, f3).any { it.isNaN() || it.isInfinite() }) return null
        val a = (f2 - 2 * f1 + f0) / 2; val b = f1 - f0 - a; val c = f0
        val tol = 1e-7 * (1 + abs(f0) + abs(f1) + abs(f2))
        if (abs(a * 9 + b * 3 + c - f3) > tol) return null
        val eps = 1e-9
        if (abs(a) < eps) {
            if (abs(b) < eps) return null
            return "$v = " + num(-c / b, 10)
        }
        val d = b * b - 4 * a * c
        if (d < -eps) return null
        if (abs(d) <= eps) return "$v = " + num(-b / (2 * a), 10)
        val q = sqrt(d); val x1 = (-b - q) / (2 * a); val x2 = (-b + q) / (2 * a)
        return "$v = " + num(minOf(x1, x2), 10) + " or " + num(maxOf(x1, x2), 10)
    }
}
