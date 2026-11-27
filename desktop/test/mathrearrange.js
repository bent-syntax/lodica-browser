"use strict";
// The notebook solves a formula for each other letter, like the page bubble does.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "ui", "js", "mathsolve.js"), "utf8") + ";this.R = mathRearrange; this.A = mathAnswer;", ctx);
assert.deepStrictEqual(Array.from(ctx.R("n=m/M")), ["m = n*M", "M = m/n"]);
assert.deepStrictEqual(Array.from(ctx.R("F = m*a")), ["m = F/a", "a = F/m"]);
assert.strictEqual(ctx.R("x+1=3"), null, "one letter is a plain equation, not a formula");
assert.strictEqual(ctx.A("3x - 24 = -6"), "x = 6", "equations still solve");
assert.ok(fs.readFileSync(path.join(__dirname, "..", "ui", "js", "notebook.js"), "utf8").includes("mathRearrange(sel)"), "the notebook uses it");
console.log("math rearrange ok");
