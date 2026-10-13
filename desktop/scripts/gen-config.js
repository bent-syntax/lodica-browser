// Writes config.json (gitignored) from LODICA_API, LODICA_DOMAIN and a relay token file (LODICA_TOKEN_FILE or ./relay-token). Never prints the token.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = process.env.LODICA_TOKEN_FILE || path.join(root, "relay-token");
let token = "";
try { token = fs.readFileSync(src, "utf8").trim(); } catch (e) { /* no token: VPS features stay hidden */ }
fs.writeFileSync(path.join(root, "config.json"), JSON.stringify({ api: process.env.LODICA_API || "", domain: process.env.LODICA_DOMAIN || "", token }));
console.log(token ? "config.json written (token present)" : "config.json written (no token)");
