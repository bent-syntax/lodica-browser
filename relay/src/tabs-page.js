'use strict';
// Self-contained viewer page for /t/<id>. The decryption key lives only in location.hash
// (never sent to the server). Inline script/style are pinned by CSP hashes.
const crypto = require('crypto');

const STYLE = `
*{box-sizing:border-box}
html,body{margin:0;background:#111827;color:#E5E7EB;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 18px 60px}
.bar{height:4px;border-radius:2px;background:linear-gradient(90deg,#F59E0B,#F43F5E);margin-bottom:22px}
h1{margin:0 0 4px;font-size:28px;font-weight:800;letter-spacing:-.01em;background:linear-gradient(90deg,#F59E0B,#F43F5E);-webkit-background-clip:text;background-clip:text;color:transparent}
#meta{color:#9CA3AF;font-size:14px;margin-bottom:20px;min-height:20px}
ul{list-style:none;margin:0;padding:0}
li{margin:0 0 10px}
a.tab,div.tab{display:block;padding:12px 14px;border-radius:12px;background:#1F2937;border:1px solid #374151;text-decoration:none;color:inherit;transition:border-color .15s,transform .15s}
a.tab:hover,a.tab:focus{border-color:#F59E0B;outline:none;transform:translateY(-1px)}
.t{display:block;font-weight:600;color:#F9FAFB;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.u{display:block;font-size:13px;color:#9CA3AF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}
.msg{padding:16px;border-radius:12px;background:#1F2937;border:1px solid #374151}
.msg b{display:block;margin-bottom:6px;color:#FCA5A5}
.empty{color:#9CA3AF}
footer{margin-top:30px;color:#6B7280;font-size:12px}
`.trim();

const SCRIPT = `
(function(){
'use strict';
var list=document.getElementById('list'),meta=document.getElementById('meta'),box=document.getElementById('msg');
var id=location.pathname.split('/').pop();
var key=null,keyStr=null,updated=null,timer=null;
function b64u(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
function ago(ms){var s=Math.max(0,Math.round((Date.now()-ms)/1000));if(s<45)return 'just now';var m=Math.round(s/60);if(m<60)return m+(m===1?' minute':' minutes')+' ago';var h=Math.round(m/60);if(h<36)return h+(h===1?' hour':' hours')+' ago';var d=Math.round(h/24);return d+(d===1?' day':' days')+' ago';}
function showMsg(title,text){box.textContent='';var b=document.createElement('b');b.textContent=title;box.appendChild(b);box.appendChild(document.createTextNode(text));box.hidden=false;}
function clearMsg(){box.hidden=true;}
function setMeta(){meta.textContent=updated?('Updated '+ago(updated)):'';}
function safeUrl(u){try{var x=new URL(u);return (x.protocol==='https:'||x.protocol==='http:')?x.href:null;}catch(e){return null;}}
function render(o){
  var tabs=(o&&Array.isArray(o.tabs)?o.tabs:[]).filter(function(t){return t&&t.private!==true;});
  updated=typeof o.updated==='number'?o.updated:null;
  list.textContent='';
  if(!tabs.length){var e=document.createElement('li');e.className='empty';e.textContent='No open tabs.';list.appendChild(e);}
  tabs.forEach(function(t){
    var li=document.createElement('li'),href=safeUrl(String(t.url||'')),el;
    if(href){el=document.createElement('a');el.href=href;el.target='_blank';el.rel='noreferrer noopener';}
    else el=document.createElement('div');
    el.className='tab';
    var ti=document.createElement('span');ti.className='t';ti.textContent=String(t.title||t.url||'Untitled');
    var ur=document.createElement('span');ur.className='u';ur.textContent=String(t.url||'');
    el.appendChild(ti);el.appendChild(ur);li.appendChild(el);list.appendChild(li);
  });
  document.title='Lodica tabs ('+tabs.length+')';
  setMeta();
}
function getKey(){
  var h=location.hash.replace(/^#/,'');
  if(h!==keyStr){keyStr=h;key=null;}
  if(key)return Promise.resolve(key);
  if(!/^[A-Za-z0-9_-]{43}$/.test(h))return Promise.reject({kind:'nokey'});
  var raw=b64u(h);
  if(raw.length!==32)return Promise.reject({kind:'nokey'});
  return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']).then(function(k){key=k;return k;});
}
function load(){
  if(!window.crypto||!crypto.subtle){showMsg('Cannot decrypt','This browser does not support WebCrypto. Open the link in a current browser over HTTPS.');return;}
  getKey().then(function(k){
    return fetch('/api/tabs/'+encodeURIComponent(id),{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'}).then(function(r){
      if(r.status===404)throw {kind:'gone'};
      if(!r.ok)throw {kind:'net'};
      return r.arrayBuffer();
    }).then(function(buf){
      var a=new Uint8Array(buf);
      if(a.length<29)throw {kind:'decrypt'};
      return crypto.subtle.decrypt({name:'AES-GCM',iv:a.slice(0,12)},k,a.slice(12)).catch(function(){throw {kind:'decrypt'};});
    }).then(function(pt){
      var o;try{o=JSON.parse(new TextDecoder().decode(pt));}catch(e){throw {kind:'decrypt'};}
      clearMsg();render(o);
    });
  }).catch(function(e){
    var k=e&&e.kind;
    if(k==='nokey'){list.textContent='';showMsg('Key missing','This link is missing its decryption key. Open the complete link from Lodica, including the part after the # sign.');return;}
    if(k==='gone'){list.textContent='';updated=null;setMeta();showMsg('Nothing shared here','No tabs are shared under this link. It may have expired or been turned off in Lodica.');return;}
    if(k==='decrypt'){list.textContent='';showMsg('Could not decrypt','The key in this link does not match the shared tabs. The link may be incomplete or out of date.');return;}
    showMsg('Connection problem','Could not reach the server. Retrying automatically.');
  });
}
load();
setInterval(load,30000);
setInterval(setMeta,10000);
window.addEventListener('hashchange',load);
document.addEventListener('visibilitychange',function(){if(!document.hidden)load();});
})();
`.trim();

const sha = (s) => "'sha256-" + crypto.createHash('sha256').update(s, 'utf8').digest('base64') + "'";

const CSP = [
  "default-src 'none'",
  `script-src ${sha(SCRIPT)}`,
  `style-src ${sha(STYLE)}`,
  "connect-src 'self'",
  "img-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="dark">
<title>Lodica tabs</title>
<style>${STYLE}</style>
</head><body><main>
<div class="bar"></div>
<h1>Lodica tabs</h1>
<div id="meta"></div>
<div id="msg" class="msg" hidden></div>
<ul id="list"></ul>
<footer>End-to-end encrypted. The key stays in your link and is never sent to the server.</footer>
</main>
<script>${SCRIPT}</script>
</body></html>
`;

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow',
};

module.exports = { HTML: Buffer.from(HTML, 'utf8'), HEADERS };
