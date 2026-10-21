/* YourPortfolio public visitor metrics. Disabled until separate public collector is deployed.
 * Set COLLECT_URL to your real collector endpoint ending /collect.
 * Do not add tokens or secrets here. No cookies, IPs, query strings, fingerprinting.
 */
(()=>{'use strict';
const COLLECT_URL=''; // e.g. https://yourportfolio-traffic.siyabongatshem.workers.dev/collect
if(!/^https:\/\/[a-z0-9.-]+\.workers\.dev\/collect$/.test(COLLECT_URL))return;
if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
const pages=new Set(['/portfolio/','/portfolio/index.html','/portfolio/projects.html','/portfolio/certificates.html','/portfolio/project-details.html','/portfolio/join.html','/portfolio/access.html','/portfolio/siya-guide.html','/portfolio/gallery-health.html']);
const page=location.pathname;if(!pages.has(page))return;
let sid='';try{const key='yp-public-metrics-session-v1',timeKey=key+':time',saved=sessionStorage.getItem(key),stamp=Number(sessionStorage.getItem(timeKey)||0);if(saved&&Date.now()-stamp<30*60000)sid=saved;else{sid=crypto.randomUUID();sessionStorage.setItem(key,sid)}sessionStorage.setItem(timeKey,String(Date.now()))}catch{sid=crypto.randomUUID()}
try{fetch(COLLECT_URL,{method:'POST',mode:'cors',credentials:'omit',keepalive:true,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({sid,page})}).catch(()=>{})}catch{}
})();
