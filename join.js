(()=>{'use strict';
const $=id=>document.getElementById(id),form=$('requestForm');if(!form)return;
const cfg=window.YP_ACCOUNT_REQUEST_CONFIG||{},status=$('requestStatus'),submit=$('reqSubmit');let widgetId=null;
const setStatus=(message)=>{status.textContent=message};
function fallback(name,email,reason){
 const subject=encodeURIComponent('YourPortfolio account request'),body=encodeURIComponent('Name: '+name+'\nEmail: '+email+'\nReason: '+reason+'\n\nPlease review my account request.');
 setStatus('Automatic requests are not ready. Your email app will open; review and press Send to submit.');
 location.href='mailto:siyabongatshem@gmail.com?subject='+subject+'&body='+body;
}
function widgetReady(){
 return cfg.turnstileSiteKey&&!cfg.turnstileSiteKey.startsWith('PASTE_')&&window.turnstile;
}
function renderTurnstile(){if(!widgetReady())return;try{widgetId=window.turnstile.render('#turnstile-slot',{sitekey:cfg.turnstileSiteKey,theme:'auto',callback:()=>setStatus('Verification complete. You can submit your request.')});}catch{setStatus('Verification is not ready. You can request by email instead.')}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderTurnstile,{once:true});else renderTurnstile();
form.addEventListener('submit',async e=>{
 e.preventDefault();if(!form.reportValidity())return;
 const name=$('reqName').value.trim().slice(0,100),email=$('reqEmail').value.trim().toLowerCase().slice(0,160),reason=$('reqReason').value.trim().slice(0,500);
 if(!cfg.endpoint||!cfg.endpoint.startsWith('https://')||!widgetReady()||widgetId==null){fallback(name,email,reason);return}
 const token=window.turnstile.getResponse(widgetId);if(!token){setStatus('Please finish the verification above before submitting.');return}
 submit.disabled=true;setStatus('Submitting your request securely…');try{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),16000);
  let r;try{r=await fetch(cfg.endpoint,{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({name,email,reason,website:$('reqWebsite').value,turnstileToken:token}),signal:controller.signal});}finally{clearTimeout(timeout)}
  const data=await r.json();if(!r.ok)throw Error(data.error||'Request could not be saved');
  setStatus('✅ '+(data.message||'Request submitted.')+' You can keep browsing the public portfolio.');
  form.reset();window.turnstile.reset(widgetId);
 }catch(err){setStatus('Submission failed: '+err.message+'. You can use the email fallback below.');try{window.turnstile.reset(widgetId)}catch{}}
 finally{submit.disabled=false}
});
})()