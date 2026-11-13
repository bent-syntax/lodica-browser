
// Google sign-in rejects embedded browsers: make the page-visible identity match the Chrome UA we send.
if (/(^|\.)(google|youtube)\.[a-z.]+$/.test(location.hostname)) {
  try {
    webFrame.executeJavaScript(`(()=>{
      const v=(/Chrome\\/(\\d+)/.exec(navigator.userAgent)||[])[1]||"141";
      const b=[{brand:"Chromium",version:v},{brand:"Not?A_Brand",version:"8"},{brand:"Google Chrome",version:v}];
      const fb=b.map(x=>({brand:x.brand,version:x.version+".0.0.0"}));
      const d=(o,k,g)=>{try{Object.defineProperty(o,k,{get:g,configurable:true})}catch(e){}};
      const u=navigator.userAgentData;
      if(u){
        const P=Object.getPrototypeOf(u);
        const an=/Android/.test(navigator.userAgent),mo=/Mobile/.test(navigator.userAgent),pl=an?"Android":"Windows";
        d(P,"brands",()=>b);
        d(P,"mobile",()=>mo);
        d(P,"platform",()=>pl);
        const gh=P.getHighEntropyValues;
        P.getHighEntropyValues=function(h){return gh.call(this,h).then(r=>Object.assign(r,{brands:b,fullVersionList:fb,mobile:mo,platform:pl,platformVersion:an?"14.0.0":"10.0.0",architecture:an?"":"x86",bitness:"64",model:an?"K":"",wow64:false}))};
      }
      d(Navigator.prototype,"webdriver",()=>false);
      if(!window.chrome)window.chrome={};
      if(!window.chrome.runtime)window.chrome.runtime={};
      if(!window.chrome.loadTimes)window.chrome.loadTimes=()=>({});
      if(!window.chrome.csi)window.chrome.csi=()=>({});
      if(!window.chrome.app)window.chrome.app={isInstalled:false};
    })()`).catch(() => {});
  } catch {}
}
