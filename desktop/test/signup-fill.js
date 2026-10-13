// Fills a sign-up form through the generated content preload with the same payload main/helper.js sends, and prints the result.
// Run: DISPLAY=:97 node_modules/.bin/electron --no-sandbox test/signup-fill.js
const { app, BrowserWindow, ipcMain } = require("electron");
const http = require("http");
const page = `<form>
<input name=firstname placeholder="First name" required autofocus><input name=lastname placeholder="Last name" required>
<input type=email name=email required><input name=username required>
<input name=street placeholder="Street" required><input name=zip placeholder="Postcode" required><input name=city placeholder="City" required>
<input type=date name=dob required><input type=password name=pw autocomplete=new-password required></form>`;
const srv = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end(`<!doctype html><title>t</title><body>${page}</body>`); });
const msg = { type: "fill", value: "x.y@alias.test", pass: "Aa1!aaaaaaaaaaaaaa", user: "annamaes42", first: "Anna", last: "Maes",
  addr: { street: "Rue de la Loi", number: "16", postcode: "1000", city: "Brussels", state: "Brussels-Capital Region", country: "Belgium", countryCode: "BE" }, bday: { year: 1994, month: 5, day: 17 } };
let sent = false;
ipcMain.handle("page", async () => ({}));
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  await new Promise(r => srv.listen(8791, "127.0.0.1", r));
  const w = new BrowserWindow({ show: false, webPreferences: { preload: require("path").join(__dirname, "..", "preload", "content.js"), sandbox: true, contextIsolation: true } });
  await w.loadURL("http://127.0.0.1:8791/");
  await new Promise(r => setTimeout(r, 3000));
  const vals = await w.webContents.executeJavaScript(`JSON.stringify([...document.querySelectorAll("input")].map(i => [i.name, i.name === "pw" ? (i.value ? "set" : "") : i.value]))`);
  console.log(vals);
  app.exit(0);
});
