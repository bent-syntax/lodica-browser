// Duplicate Tab is available from the tab context menu and Ctrl/Cmd+Shift+D, and lands right of its source.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const keys = require("../main/keys");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const map = keys._js.map();

assert.strictEqual(map["Ctrl+D"], "duplicateTab");
assert.strictEqual(map["Ctrl+Shift+D"], "duplicateTab");
assert.strictEqual(map["Ctrl+Shift+G"], "draw");

const commands = read("main/commands.js");
assert.match(commands, /label:\s*"Duplicate tab", accelerator:\s*"CmdOrCtrl\+Shift\+D", click:\s*\(\)\s*=>\s*tabs\.duplicate\(t\.id\)/);

const tabs = read("main/tabs.js");
assert.match(tabs, /list\.splice\(list\.indexOf\(s\)\s*\+\s*1,\s*0,\s*t\)/);

const rust = fs.readFileSync(path.join(__dirname, "..", "..", "core", "src", "keys.rs"), "utf8");
assert.match(rust, /"duplicateTab", "Duplicate tab", &\["Ctrl\+D", "Ctrl\+Shift\+D"\]/);
assert.match(rust, /"draw", "Draw on tab", &\["Ctrl\+Shift\+G"\]/);

console.log("duplicate tab ok");
