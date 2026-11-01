// removeOld() keeps the new installer and deletes older ones and stale .part files. Run: node test/updater-clean.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const Module = require("module");
const orig = Module._load;
Module._load = function (r, ...a) { return r === "electron" ? {} : orig.call(this, r, ...a); };
const up = require("../main/updater");

function run(platform, files, keep, left) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lodica-clean-"));
  try {
    for (const f of files) fs.writeFileSync(path.join(dir, f), "x");
    up._setEnv({ platform, dir: () => dir });
    up._removeOld(dir, path.join(dir, keep));
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), left.sort());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

run("win", ["Lodica-Setup-1.14.13.exe", "Lodica-Setup-1.14.14.exe.part", "Lodica-Setup-1.14.15.exe", "Lodica-Portable-1.14.13.exe", "notes.txt"],
  "Lodica-Setup-1.14.15.exe", ["Lodica-Setup-1.14.15.exe", "Lodica-Portable-1.14.13.exe", "notes.txt"]);
run("linux", ["Lodica-1.14.13.AppImage", "Lodica-1.14.14.AppImage.part", "Lodica-1.14.15.AppImage", "Other.AppImage"],
  "Lodica-1.14.15.AppImage", ["Lodica-1.14.15.AppImage", "Other.AppImage"]);
run("linux", [], "Lodica-1.14.15.AppImage", []);
console.log("updater-clean ok");
