// Serial monitor: Web Serial inside the UI view. requestPort() is answered by main/serial.js (port picker).
const SM = { port: null, reader: null, writer: null, open: false, L: null, log: null };

function openSerial() {
  if (!navigator.serial) { toast("Web Serial not available"); return null; }
  const baud = h("select", { class: "field" }, ...[300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
    .map((b) => h("option", { value: b, selected: b === 9600 }, String(b))));
  const status = h("div", { class: "t2", style: "margin:0 20px", text: "Not connected" });
  const log = h("pre", { class: "ser-log" });
  const input = h("input", { class: "field", placeholder: "Send…", autocomplete: "off" });
  const eol = h("select", { class: "field" }, h("option", { value: "" }, "No line ending"), h("option", { value: "\n", selected: true }, "LF"),
    h("option", { value: "\r" }, "CR"), h("option", { value: "\r\n" }, "CR+LF"));
  const conn = btn("Connect", () => (SM.open ? serialClose() : serialConnect()));
  SM.log = log; SM.status = status; SM.conn = conn; SM.baud = baud;
  const send = async () => {
    if (!SM.open || !input.value && !eol.value) return;
    try { await SM.writer.write(new TextEncoder().encode(input.value + eol.value)); serialLog("> " + input.value + "\n", "tx"); input.value = ""; }
    catch (e) { serialLog("Send failed: " + e.message + "\n", "err"); }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
  SM.L = sheet({ title: "Serial monitor", key: "serial", tall: true, onClose: () => { SM.L = null; serialClose(); },
    head: btn("Clear", () => clear(log), "muted") }, () => {});
  SM.L.body.append(
    h("div", { class: "ser-bar" }, baud, conn),
    status, log,
    h("div", { class: "ser-bar" }, input, eol, btn("Send", send)));
  return SM.L;
}

function serialLog(text, cls) {
  const log = SM.log;
  if (!log) return;
  const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
  log.append(h("span", { class: cls || "rx", text }));
  while (log.childNodes.length > 2000) log.removeChild(log.firstChild);
  if (stick) log.scrollTop = log.scrollHeight;
}

async function serialConnect() {
  try {
    SM.port = await navigator.serial.requestPort();
    await SM.port.open({ baudRate: +SM.baud.value });
  } catch (e) {
    SM.port = null;
    if (e.name !== "NotFoundError") serialLog("Connect failed: " + e.message + "\n", "err");
    return;
  }
  SM.open = true;
  SM.writer = SM.port.writable.getWriter();
  SM.conn.textContent = "Disconnect"; SM.baud.disabled = true;
  const i = SM.port.getInfo ? SM.port.getInfo() : {};
  SM.status.textContent = "Connected @ " + SM.baud.value + (i.usbVendorId != null ? " · " + i.usbVendorId.toString(16).padStart(4, "0") + ":" + (i.usbProductId || 0).toString(16).padStart(4, "0") : "");
  const port = SM.port, dec = new TextDecoder();
  (async () => {
    while (port.readable && SM.port === port) {
      SM.reader = port.readable.getReader();
      try {
        for (;;) { const { value, done } = await SM.reader.read(); if (done) break; if (value) serialLog(dec.decode(value, { stream: true })); }
      } catch (e) { serialLog("\nRead error: " + e.message + "\n", "err"); }
      finally { try { SM.reader.releaseLock(); } catch {} SM.reader = null; }
    }
    if (SM.port === port) serialClose(); // device unplugged
  })();
}

async function serialClose() {
  const port = SM.port;
  SM.port = null;
  const was = SM.open;
  SM.open = false;
  try { await SM.reader?.cancel(); } catch {}
  try { SM.writer?.releaseLock(); } catch {}
  SM.writer = null;
  try { await port?.close(); } catch {}
  if (SM.L && SM.conn && was) { SM.conn.textContent = "Connect"; SM.baud.disabled = false; SM.status.textContent = "Disconnected"; }
}
