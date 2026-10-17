// Writes the default (dark theme) Lodica kite icon to build/icon.png.
const fs = require("fs");
const path = require("path");
const { render } = require("../main/logo");

const out = path.join(__dirname, "..", "build", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, render(256));
console.log("icon written", out);
