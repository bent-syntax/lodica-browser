"use strict";
// agentFor: a mobile-site tab gets the Android UA, except on sites marked desktopInput.
// Run as real Electron: DISPLAY=:97 node_modules/.bin/electron --no-sandbox test/agentfor.js
const { app } = require("electron");
const assert = require("assert");
app.whenReady().then(() => {
  const prefs = require("../main/prefs");
  const desk = prefs.userAgentValue();
  const mob = { desktop: false, host: "example.com" };
  const pc = { desktop: true, host: "example.com" };
  assert(/Mobile/.test(prefs.agentFor(mob)), "mobile tab on normal site -> Android UA");
  assert.strictEqual(prefs.agentFor(pc), desk, "desktop tab -> desktop UA");
  assert.strictEqual(prefs.agentFor(mob, "classic.minecraft.net"), desk, "override host -> desktop UA");
  assert.strictEqual(prefs.agentFor(mob, "www.classic.minecraft.net"), desk, "subdomain of override host");
  assert.strictEqual(prefs.agentFor(mob, "notminecraft.net"), prefs.agentFor(mob), "unrelated host unaffected");
  assert(!/Mobile/.test(desk));
  console.log("agentfor OK");
  app.exit(0);
}).catch((e) => { console.log("FAIL", e.message); app.exit(1); });
