"use strict";

// Web NFC is not implemented by GeckoView. Expose NDEFReader so pages can feature-detect and show their own
// fallback: scan() and write() reject with NotSupportedError instead of the page crashing on a missing class.
(() => {
  try {
    const w = window.wrappedJSObject;
    if (!w || w.NDEFReader) return;
    const fail = () => new w.DOMException("Web NFC is not supported by this browser engine.", "NotSupportedError");
    const NDEFReader = exportFunction(function () {}, w);
    const proto = new w.Object();
    for (const m of ["scan", "write", "makeReadOnly"]) {
      proto[m] = exportFunction(function () { return w.Promise.reject(fail()); }, w);
    }
    NDEFReader.prototype = proto;
    Object.defineProperty(w, "NDEFReader", { value: NDEFReader, configurable: true, writable: true });
  } catch (_) { /* page keeps working without it */ }
})();
