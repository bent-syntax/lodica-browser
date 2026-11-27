"use strict";
// Posts the held image to Google or Bing as a normal form, so the result page opens in this tab with the user's own session.
(async () => {
  const q = new URLSearchParams(location.search), m = document.getElementById("m");
  try {
    const r = await fetch("/rev-image?id=" + encodeURIComponent(q.get("id") || ""));
    if (!r.ok) throw new Error("The image is no longer available");
    const blob = await r.blob();
    const f = document.createElement("form");
    f.method = "POST"; f.enctype = "multipart/form-data";
    if (q.get("e") === "bing") {
      f.action = "https://www.bing.com/images/search?view=detailv2&iss=sbiupload&FORM=SBIHMP";
      const i = document.createElement("input");
      i.type = "hidden"; i.name = "imageBin";
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
      i.value = btoa(s);
      f.appendChild(i);
    } else {
      f.action = "https://www.google.com/searchbyimage/upload";
      const i = document.createElement("input");
      i.type = "file"; i.name = "encoded_image";
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "image.png", { type: blob.type || "image/png" }));
      i.files = dt.files;
      f.appendChild(i);
    }
    document.body.appendChild(f);
    f.submit();
  } catch (e) { m.textContent = "Could not search: " + (e && e.message || e); }
})();
