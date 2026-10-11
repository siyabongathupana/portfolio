/* Siya v3.1: branded draggable assistant, accessible, no public session inference. */
(()=>{'use strict';if(document.getElementById('siya-launcher'))return;
const WORKER='https://portfolio-data-bridge.siyabongatshem.workers.dev';
const PUBLIC_JOIN='https://siyabongathupana.github.io/portfolio/join.html';
const protectedOrigin=location.origin===new URL(WORKER).origin;
const ROOT=protectedOrigin?'/':location.pathname.startsWith('/portfolio/')?'/portfolio/':'/';
const JOKES=[
'Why did the PLC break up with the sensor? Too many mixed signals. 😄',
'I told a control valve a joke. It gave me zero feedback. 😂',
'I tried to be spontaneous. My PID controller immediately corrected me. 🤖',
'Engineering rule #1: If it works, document it before touching anything. 😅',
'Even my coffee needs a commissioning checklist. ☕',
'This task looks easy. Famous last words before a six-hour debug session. 😎',
'I asked DeltaV for a vacation. It said: process still running. 🏖️',
'Why was the pump so confident? It had great flow. 💦',
'My favorite party trick? Converting panic into a spreadsheet. 📈',
'Seems like we need more uptime and fewer plot twists. 🍿',
'Why did the student bring a ladder to calculus? Higher-order derivatives. 📚',
'I tried to write a funny algorithm. It got stuck in a loop. 😭',
'Your deadlines are safe with me. Unless you name the file final_FINAL_v8. 🙃',
'If motivation were a transmitter, mine would need recalibration. 🔧',
'My Wi-Fi joke got lost in transmission. 📡',
'I used to fear deadlines. Now I fear spreadsheets with merged cells. 😅',
'That meeting had three states: waiting, waiting, and still waiting. ⏳',
'Why was the gear so popular? Everyone clicked with it. ⚙️',
'I make jokes in binary. They are either funny or not. 🧠',
'Your portfolio is looking sharp! Even the control cabinet is jealous. 😁',
'Study break? Approved. Five-hour anime binge? Needs review. 🎮',
'Why don’t robots procrastinate? We just buffer dramatically. 🔄',
'Never trust a process that says: “I’ll only take one minute.” ⏱️',
'I can track productivity. I cannot explain where all the teaspoons went. ☕'
];
const root=document.createElement('div');root.id='siya-launcher';root.setAttribute('aria-label','Siya AI assistant');
const icon=document.createElement('img');icon.src=ROOT+'siya-mascot.svg';icon.className='siya-avatar';icon.alt='';icon.draggable=false;
const btn=document.createElement('button');btn.type='button';btn.className='siya-trigger';btn.setAttribute('aria-label','Open Siya assistant. Drag to move.');btn.setAttribute('aria-expanded','false');btn.title='Siya · Click to chat, drag to move';btn.append(icon);const dot=document.createElement('span');dot.className='siya-dot';btn.append(dot);root.append(btn);
const panel=document.createElement('section');panel.className='siya-card';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Siya assistant');panel.dataset.open='no';
const head=document.createElement('div');head.className='siya-top';const headImg=icon.cloneNode(true),label=document.createElement('div'),h=document.createElement('strong');h.textContent='Siya · Your co-pilot';const subtitle=document.createElement('small');subtitle.textContent='Your engineering sidekick ⚙️';label.append(h,subtitle);head.append(headImg,label);
const close=document.createElement('button');close.className='siya-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','Close assistant');head.append(close);panel.append(head);
const joke=document.createElement('p');joke.className='siya-joke';joke.setAttribute('aria-live','polite');panel.append(joke);
const nextJoke=document.createElement('button');nextJoke.type='button';nextJoke.className='siya-another';nextJoke.textContent='😄 Another joke';panel.append(nextJoke);
const msg=document.createElement('p');msg.className='siya-message';msg.textContent='I can help with your portfolio, deadlines, and productivity.';panel.append(msg);
const actions=document.createElement('div');actions.className='siya-actions';panel.append(actions);
const status=document.createElement('div');status.className='siya-state';panel.append(status);
const reset=document.createElement('button');reset.className='siya-reset';reset.textContent='↺ Reset mascot position';reset.type='button';panel.append(reset);root.append(panel);
let jokeBag=[];function newJoke(){if(!jokeBag.length){jokeBag=JOKES.map((_,i)=>i);for(let i=jokeBag.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[jokeBag[i],jokeBag[j]]=[jokeBag[j],jokeBag[i]];}}joke.textContent=JOKES[jokeBag.pop()];}
const action=(label,url,primary)=>{const a=document.createElement('a');a.textContent=label;a.href=url;if(primary)a.className='siya-primary';actions.append(a)};
function guest(){actions.replaceChildren();msg.textContent='You need a portfolio account and approved AI access. No sneaking past the robot bouncer!';action('Create / request an account',PUBLIC_JOIN,true);action('I have an account · Request AI access',WORKER+'/ai-access.html');status.textContent='Your public visit never grants access to private data.';layoutPanel();}
async function check(){if(!protectedOrigin){guest();return;}status.textContent='Checking access securely…';try{const r=await fetch('/api/ai/access/status',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});const d=await r.json();actions.replaceChildren();if(r.ok&&d.allowed){msg.textContent='Access granted! Want to analyze work, study smarter, or just hear a terrible engineering joke?';action('Open Siya AI Centre',WORKER+'/ai-centre.html',true);status.textContent='AI access granted · '+(d.role==='admin'?'Administrator':'Member');}else if(r.ok){msg.textContent='Your portfolio account is recognized, but AI access needs approval.';action(d.requestStatus==='pending'?'View pending request':'Request AI access',WORKER+'/ai-access.html',true);status.textContent=d.requestStatus==='pending'?'Waiting for approval':'Existing portfolio features remain available.';}else{guest();status.textContent='Sign in to your portfolio account first.';}}catch{guest();status.textContent='Could not verify access. Please try again.';}finally{layoutPanel();}}
const storageKey='yp-siya-mascot-position-v1';let dragged=false,down=null,skipClick=false;
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function defaultXY(){return {x:Math.max(12,innerWidth-root.offsetWidth-20),y:Math.max(12,innerHeight-root.offsetHeight-20)}}
function position(x,y,save){const w=root.offsetWidth||68,h=root.offsetHeight||68;const px=clamp(Math.round(x),8,Math.max(8,innerWidth-w-8)),py=clamp(Math.round(y),8,Math.max(8,innerHeight-h-8));root.style.left=px+'px';root.style.top=py+'px';root.style.right='auto';root.style.bottom='auto';layoutPanel();if(save){try{localStorage.setItem(storageKey,JSON.stringify({x:innerWidth?px/innerWidth:0.8,y:innerHeight?py/innerHeight:0.8}))}catch{}}}
function layoutPanel(){const box=root.getBoundingClientRect(),pWidth=Math.min(355,innerWidth-18),pHeight=panel.offsetHeight||325;const x=clamp(box.left+box.width-pWidth,9,Math.max(9,innerWidth-pWidth-9));let y=box.top-pHeight-13;if(y<9)y=clamp(box.bottom+10,9,Math.max(9,innerHeight-pHeight-9));panel.style.left=x+'px';panel.style.top=y+'px';panel.style.width=pWidth+'px';}
function toggle(){const open=panel.dataset.open!=='yes';panel.dataset.open=open?'yes':'no';btn.setAttribute('aria-expanded',String(open));if(open){newJoke();layoutPanel();check();}}
btn.addEventListener('pointerdown',e=>{if(e.button!==0)return;down={id:e.pointerId,x:e.clientX,y:e.clientY,left:root.getBoundingClientRect().left,top:root.getBoundingClientRect().top};dragged=false;btn.setPointerCapture?.(e.pointerId);});
btn.addEventListener('pointermove',e=>{if(!down||e.pointerId!==down.id)return;if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)dragged=true;if(!dragged)return;e.preventDefault();position(down.left+e.clientX-down.x,down.top+e.clientY-down.y,false)});
btn.addEventListener('pointerup',e=>{if(!down||e.pointerId!==down.id)return;if(dragged){position(root.getBoundingClientRect().left,root.getBoundingClientRect().top,true);skipClick=true;setTimeout(()=>{skipClick=false},70)}down=null;});
btn.addEventListener('pointercancel',()=>{down=null;dragged=false});
btn.addEventListener('click',e=>{if(skipClick||dragged){e.preventDefault();dragged=false;skipClick=false;return;}toggle();});
btn.addEventListener('keydown',e=>{if(!e.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const b=root.getBoundingClientRect(),step=e.shiftKey?50:15;position(b.left+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),b.top+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0),true);});
close.addEventListener('click',()=>{panel.dataset.open='no';btn.setAttribute('aria-expanded','false');btn.focus()});
nextJoke.addEventListener('click',newJoke);reset.addEventListener('click',()=>{try{localStorage.removeItem(storageKey)}catch{}const p=defaultXY();position(p.x,p.y,false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.dataset.open==='yes'){panel.dataset.open='no';btn.setAttribute('aria-expanded','false');btn.focus()}});
window.addEventListener('resize',()=>{const b=root.getBoundingClientRect();position(b.left,b.top,false)});
document.body.append(root);let saved=null;try{saved=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{}const p=saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)?{x:saved.x*innerWidth,y:saved.y*innerHeight}:defaultXY();position(p.x,p.y,false);
})();
