"use strict";

// The full helper (content.js) runs in the top frame only: in every iframe it cost half the Speedometer score.
// In Medium mode subframes get this small probe instead (background.js registers it; Fast skips it). Frames that hold a sign-in field or a consent dialog ask the
// background to load the full helper into them, so alias fill, login save and cookie rejection still work there.
// shortcut: fields inside shadow roots or added after 3 s are missed, widen the checks if a site needs them.
(() => {
  if (window === window.top) return;
  const FIELD = 'input[type=password],input[type=email],input[inputmode=email],input[autocomplete*=email],'
    + 'input[autocomplete*=username],input[autocomplete*=one-time-code],input[name*=mail i],input[id*=mail i]';
  const want = () => {
    if (document.querySelector(FIELD)) return true;
    const b = document.body;
    return !!b && b.textContent.length < 6000 && /cookie|consent|privacy|gdpr|toestemming|einwilligung/i.test(b.textContent);
  };
  let n = 0;
  const check = () => {
    if (want()) browser.runtime.sendMessage({ type: "frameHelper" }).catch(() => {});
    else if (++n < 3) setTimeout(check, 1500);
  };
  check();
})();
