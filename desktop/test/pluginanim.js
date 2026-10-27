// animationCss only emits allowlisted targets and properties, split between the browser UI and the start page.
const Module = require("module"), path = require("path");
const load = Module._load;
Module._load = (r, ...a) => r === "electron" ? { app: { getPath: () => "/tmp" } } : load(r, ...a);
const { animationCss } = require(path.join(__dirname, "..", "main", "themeplugins.js"));
let bad = 0;
const check = (name, ok) => { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) bad++; };
const fade = { target: "tab", duration: 300, keyframes: { from: { opacity: "0" }, to: { opacity: "1" } } };
const css = animationCss({ fade });
check("tab animation compiled", /@keyframes pl-fade/.test(css) && /\.t\{animation:pl-fade 300ms/.test(css));
check("reduced motion wrapper", css.startsWith("@media (prefers-reduced-motion:no-preference)"));
check("start target not allowed in the UI", animationCss({ a: { ...fade, target: "logo" } }) === "");
check("logo allowed on the start page", /\.mark\{/.test(animationCss({ a: { ...fade, target: "logo" } }, { logo: ".mark" })));
check("disallowed property dropped", animationCss({ a: { ...fade, keyframes: { to: { position: "fixed" } } } }) === "");
check("unsafe value dropped", animationCss({ a: { ...fade, keyframes: { to: { opacity: "1;}body{x:y" } } } }) === "");
check("bad name dropped", animationCss({ "x{}": fade }) === "");
process.exit(bad ? 1 : 0);
