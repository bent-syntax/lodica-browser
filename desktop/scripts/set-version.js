// Usage: node scripts/set-version.js <x.y.z>
// Sets the same version in the desktop app (package.json, package-lock.json) and the Android app
// (app/build.gradle.kts versionName, versionCode + 1). With no argument, prints both and exits 1 if they differ.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const gradle = process.env.LODICA_ANDROID_DIR ? path.join(process.env.LODICA_ANDROID_DIR, "app/build.gradle.kts") : path.join(__dirname, "..", "..", "android", "app", "build.gradle.kts");
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const g = fs.readFileSync(gradle, "utf8");
const androidVer = (g.match(/versionName\s*=\s*"([^"]+)"/) || [])[1];
const desktopVer = readJson(path.join(root, "package.json")).version;
const ver = process.argv[2];
if (!ver) {
  console.log("desktop " + desktopVer + "\nandroid " + androidVer);
  process.exit(desktopVer === androidVer ? 0 : 1);
}
if (!/^\d+\.\d+\.\d+$/.test(ver)) { console.error("version must look like 1.0.5"); process.exit(2); }
for (const f of ["package.json", "package-lock.json"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  const s = fs.readFileSync(p, "utf8");
  fs.writeFileSync(p, s.replace(/("version":\s*")[^"]+(")/, "$1" + ver + "$2"));
}
fs.writeFileSync(gradle, g
  .replace(/versionName\s*=\s*"[^"]+"/, 'versionName = "' + ver + '"')
  .replace(/versionCode\s*=\s*(\d+)/, (_, n) => "versionCode = " + (+n + 1)));
console.log("desktop and android set to " + ver);
