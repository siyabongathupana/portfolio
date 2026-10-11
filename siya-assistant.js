/* Siya v3.2 — original branded mascot, contextual jokes, private PA briefings & reminders.
   Never infers login status on public GitHub Pages. All sensitive data via protected Worker. */
(()=>{'use strict';
if(document.getElementById('siya-launcher'))return;
const WORKER='https://portfolio-data-bridge.siyabongatshem.workers.dev';
const JOIN='https://siyabongathupana.github.io/portfolio/join.html';
const protectedOrigin=location.origin===new URL(WORKER).origin;
const ROOT=protectedOrigin?'/':location.pathname.startsWith('/portfolio/')?'/portfolio/':'/';
const PATH=location.pathname.toLowerCase();
const CONTEXT=/timesheet|time-?track/.test(PATH)?'timesheets':/studies|study|grade|assessment|cad/.test(PATH)?'studies':/analytic|insight|report/.test(PATH)?'analytics':/project|milestone|publish/.test(PATH)?'projects':/certificat/.test(PATH)?'certificates':/admin|access|user/.test(PATH)?'admin':/ai-centre/.test(PATH)?'ai':'home';
const jokes={
 timesheets:[
  'Your Timesheet called. It wants closure, preferably before Friday. 🕒','8 hours of debugging counts as work, not an emotional support group. 😂',
  'My Timesheet has commitment issues. It keeps saying “save changes.” 💾','“Just 10 more minutes” — famous last words of every overtime entry. ☕',
  'Billable or not billable? That is the spreadsheet question. 📊','The only thing faster than your lunch break is a missing Timesheet entry. 🏃',
  'I logged 8 hours of productivity and 3 hours of looking for my cursor. 🖱️','Deadline approaching. Even the clock has started logging overtime. ⏰',
  'Why did the Timesheet go to therapy? Too many unresolved hours. 🤯','My favourite shift is Ctrl+Shift+S. Because at least that one saves. 💻',
  'If coffee counted as project time, we would all be senior engineers. ☕','Friday feels like a successful FAT: everyone signs and escapes. ✅',
  'I entered “existing peacefully” as billable time. Finance disagreed. 😭','Your project hours look precise. Your estimation skills? An exciting experiment. 🤖',
  'Whoever invented Monday Timesheets deserves a 30-minute status meeting. 😅','I asked for a day off. The Timesheet offered unpaid absence. Rude. 😤',
  'My overtime has overtime. Please send snacks. 🍕','You cannot spell “productive” without “I should log that.” Probably. 😎'
 ],
 studies:[
  'I took calculus for fun. Turns out the fun was only an approximation. 📚','The exam said “show your working.” I showed my coffee receipts. ☕',
  'My study plan has three phases: optimism, panic, and PDF. 🫠','What did the derivative say to the integral? Stop accumulating problems. 📈',
  'I love deadlines. Especially the sound they make as they whoosh by. 😭','Why is my calculator so calm? It has no emotional variables. 🔢',
  'That assignment is worth 10 marks and 100 emotional damage. 😂','I solved for x. Turns out x was on a study break. 🤖',
  'The lecturer said “it is intuitive.” That is when the horror began. 🧠','Every CAD assembly works perfectly until you click the final constraint. 🛠️',
  'My brain is currently buffering. Please cite your sources. 📖','The only constant in engineering mathematics is my confusion. 😅',
  'Integration by parts? I prefer integration by snacks. 🍪','“Open-book test” is just a scavenger hunt with consequences. 🧭',
  'Exam tomorrow? Time to discover the mysterious fourth study mode: prayer. 😇','I trust the chain rule. It never breaks the chain of blame. 🔗',
  'A 50-page assignment is simply a novel with stricter deadlines. 😏','Did you hear about the lazy vector? It had no direction. 📐'
 ],
 projects:[
  'Scope creep walks into a meeting. It brings five friends. 😂','This project has a critical path and several emotional detours. 🛣️',
  'Why was the Gantt chart lonely? Too many dependencies. 📅','A milestone achieved without screenshots? An urban legend. 📸',
  '“Quick change request” — three words that age engineers instantly. 😭','The client said “one tiny addition.” My estimate started crying. 😎',
  'My projects are organised. The universe just refuses to cooperate. ⚙️','I gave the control valve a promotion. It was already under pressure. 🌡️',
  'I named my final revision final_final_REAL_this_time. 💀','Your P&ID looks beautiful. The instrument tags have opinions. 🔧',
  'The only project with zero risks is the one nobody started. 🤖','My task list has its own task list. Send reinforcements. ✅',
  'SFC steps are like Mondays. You have to transition eventually. ☕','Why did the pump fail its interview? It lacked drive. 💦',
  'The test passed once. That is technically a tradition now. 😇','One does not simply “just update the FHX.” 🛠️'
 ],
 analytics:[
  'The chart is going up. Please do not ask which axis. 📈','I found a trend: more coffee, more dashboards. ☕',
  'Correlation does not imply causation. But it does inspire meetings. 🤔','The KPI is glowing green. A suspiciously good day. 🟢',
  'Graphs do not lie. Axis labels occasionally take creative liberties. 😬','I asked the data for answers. It gave me three CSVs and an attitude. 📊',
  'My forecasting model predicts I will need another forecasting model. 🤖','The bar chart is jealous of the pie chart. Too many slices of attention. 🥧',
  'Data cleaning is 90% “why is this cell merged?” 😭','I make dashboards look expensive so spreadsheets feel respected. 😎',
  'Missing data is not zero. My optimism is, occasionally. 😂','When in doubt, label the trend “interesting.” 📉'
 ],
 certificates:[
  'One more certificate and the wall may need structural engineering. 🏅','I passed the exam. My browser history deserves a diploma too. 🎓',
  'Certified to troubleshoot devices and occasionally my own decisions. 😎','LinkedIn called. It wants me to slow down on achievements. 😂',
  'Behind every certificate is a brave person and several cups of coffee. ☕','I collect qualifications like Pokémon. Gotta audit them all. 🤖',
  'A certificate is proof you survived the documentation. 📜','My printer is now more qualified than I am. It prints everything. 🖨️'
 ],
 admin:[
  'Admin rights: great power, great responsibility, and 17 audit logs. 🔐','I could grant access. But first, a dramatic confirmation dialog. 😎',
  'Your least favourite user? Probably “permission denied.” 🚫','Why did the administrator bring a shield? Defence in depth. 🛡️',
  'I checked the logs. They checked me back. 👀','“Who changed that?” — the most popular question in IT. 🤖',
  'The only thing more secure than the server is my Cybertronian diary. 🔒','This access request has been approved by the Committee of Tiny Robots. 🤖'
 ],
 ai:[
  'My neural networks are doing squats. Very deep learning. 🧠','I am not procrastinating. I am running asynchronous thoughts. 🤖',
  'I can process your data but cannot process Monday mornings. ☕','My full name sounds like a goodbye. Convenient, right? 😅',
  'I speak fluent JSON and mildly sarcastic engineer. ⚙️','If I could dream, it would be about a perfectly formatted Excel export. 📊',
  'I moved from Cybertron to localhost. The rent is unbeatable. 🏡','My mission: fewer surprises, more useful dashboards, better jokes. 🚀'
 ],
 home:[
  'Welcome aboard. Please keep your snacks inside the engineering lab. 🤖','I was born on Cybertron. My housewarming party was at localhost. 🏠',
  'I promised to behave. My code agreed, conditionally. 😇','Why did the engineer bring a ladder? To reach higher specifications. 🪜',
  'I have 99 problems and an intermittent Ethernet connection is one. 🌐','Your portfolio looks so good, my gears are blushing. ⚙️',
  'If you need me, I am the tiny robot pretending to be responsible. 😎','I drink electrons and occasionally a virtual cappuccino. ☕',
  'I cannot solve life, but I can label its variables. 📐','A robot without a plan is just a toaster with ambition. 🍞',
  'My Cybertron passport says occupation: your co-pilot. 🚀','Ctrl+Z is the closest thing engineers have to time travel. ⏳',
  'I asked my circuits to relax. They went into standby mode. 😴','Some call it multitasking. I call it controlled chaos. 💻'
 ]
};
const pool=jokes[CONTEXT]||jokes.home;
let jokeBag=[],lastJoke='';
function newJoke(){if(!jokeBag.length){jokeBag=pool.map((_,i)=>i);for(let i=jokeBag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[jokeBag[i],jokeBag[j]]=[jokeBag[j],jokeBag[i]]}}let candidate=pool[jokeBag.pop()];if(candidate===lastJoke&&jokeBag.length){jokeBag.unshift(pool.indexOf(candidate));candidate=pool[jokeBag.pop()]}lastJoke=candidate;joke.textContent=candidate;}
function make(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e}
const root=make('div');root.id='siya-launcher';root.setAttribute('aria-label','Siya AI assistant');
const icon=make('img','siya-avatar');icon.src=ROOT+'siya-mascot.svg';icon.alt='';icon.draggable=false;
const btn=make('button','siya-trigger');btn.type='button';btn.setAttribute('aria-label','Open Siya assistant. Drag to move.');btn.setAttribute('aria-expanded','false');btn.title='Siya · Click for a new joke and your personal briefing; drag to move';btn.append(icon,make('span','siya-dot'));root.append(btn);
const panel=make('section','siya-card');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Siya assistant');panel.dataset.open='no';
const head=make('div','siya-top'),hicon=icon.cloneNode(true),heading=make('div');heading.append(make('strong','','Siya · Your co-pilot'),make('small','','Your friendly Cybertronian engineer ⚙️'));
const close=make('button','siya-close','×');close.type='button';close.setAttribute('aria-label','Close assistant');head.append(hicon,heading,close);panel.append(head);
const joke=make('p','siya-joke');joke.setAttribute('aria-live','polite');panel.append(joke);
const brief=make('div','siya-brief');brief.setAttribute('aria-live','polite');brief.append(make('strong','','📋 Your quick briefing'));
const briefContent=make('div','siya-brief-content','Open Siya for your saved deadlines, tasks and reminders.');brief.append(briefContent);panel.append(brief);
const msg=make('p','siya-message','I can check saved records, answer quick questions and set in-app reminders.');panel.append(msg);
const quick=make('form','siya-quick');quick.setAttribute('aria-label','Quick command');quick.hidden=true;
const prompt=make('input','siya-quick-input');prompt.type='text';prompt.maxLength=320;prompt.placeholder='Ask Siya, or: Remind me tomorrow at 09:00 to…';prompt.setAttribute('aria-label','Ask Siya a quick question or set a reminder');prompt.autocomplete='off';
const send=make('button','siya-quick-send','Ask ↗');send.type='submit';quick.append(prompt,send);panel.append(quick);
const trophy=make('section','siya-milestones');trophy.hidden=!protectedOrigin;
const trophyHeading=make('div','siya-milestone-title');trophyHeading.append(make('strong','','🏆 Siya achievements'),make('span','siya-milestone-count',''));
const trophyList=make('div','siya-milestone-list','Checking your saved Timesheet milestones…');trophy.append(trophyHeading,trophyList);panel.append(trophy);
const quickStatus=make('p','siya-message');quickStatus.setAttribute('aria-live','polite');panel.append(quickStatus);
const actions=make('div','siya-actions');panel.append(actions);
const status=make('div','siya-state');panel.append(status);
const reset=make('button','siya-reset','↺ Reset mascot position');reset.type='button';panel.append(reset);root.append(panel);
const action=(label,url,primary)=>{const a=make('a',primary?'siya-primary':'',label);a.href=url;actions.append(a)};
function guest(){quick.hidden=true;briefContent.textContent='Sign in to see your personal updates. No private information is shown to visitors.';actions.replaceChildren();msg.textContent='Create an account, then request AI access. My robot bouncer takes privacy seriously.';action('Create / request an account',JOIN,true);action('I have an account · Request AI access',WORKER+'/ai-access.html');status.textContent='Public visitors have no access to private data.';layoutPanel()}
let allowed=false;
async function api(path,method='GET',body=null){const opts={method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})}};if(body)opts.body=JSON.stringify(body);const r=await fetch(path,opts);let d;try{d=await r.json()}catch{throw Error('A secure response could not be read.')}if(!r.ok)throw Error(String(d.error||'Request failed').slice(0,180));return d}
function paintBrief(d){briefContent.replaceChildren();const rows=(d.notices||[]).slice(0,6);if(!rows.length)briefContent.append(make('p','','No urgent saved-record alerts. I cannot check external university or work systems.'));
for(const n of rows){const row=make('div','siya-brief-row'),dot=make('span','siya-alert-dot '+(n.severity==='warning'?'siya-alert-warn':''),n.severity==='warning'?'!':'•'),text=make('span','',n.text);row.append(dot,text);if(n.reminderId){const done=make('button','siya-done','Done');done.type='button';done.onclick=async()=>{if(!confirm('Mark this reminder as completed?'))return;try{await api('/api/ai/reminders/done','POST',{id:n.reminderId});await getBrief()}catch(e){quickStatus.textContent=e.message}};row.append(done)}briefContent.append(row)}
status.textContent='Private briefing checked '+new Date(d.checkedAt||Date.now()).toLocaleTimeString()+' · In-app notifications only';layoutPanel();}
let lastMilestoneCheck=0,noticeShown=false;
async function loadMilestones(force=false){
 if(!protectedOrigin||!trophy)return;
 if(!force&&Date.now()-lastMilestoneCheck<60000)return;
 lastMilestoneCheck=Date.now();
 try{
  const res=await fetch('/api/siya/milestones/refresh',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:'{}'});
  const d=await res.json();if(!res.ok){trophy.hidden=true;return;}
  trophy.hidden=false;trophyList.replaceChildren();const awards=(d.awards||[]),unread=awards.filter(x=>!x.seen_at),visible=[...unread.slice(0,3),...awards.filter(x=>x.seen_at).slice(0,2)];
  trophyHeading.querySelector('.siya-milestone-count').textContent=d.unseenCount?d.unseenCount+' new':'';
  if(!d.dataAvailable){trophyList.append(make('p','siya-milestone-muted','Start logging valid Timesheet entries to unlock achievements.'));layoutPanel();return}
  if(!visible.length)trophyList.append(make('p','siya-milestone-muted','Your first Timesheet achievement is waiting. Localhost believes in you.'));
  for(const a of visible){const row=make('div','siya-milestone-row'),logo=make('span','siya-trophy-emoji',a.emoji||'🏆'),body=make('div',''),title=make('strong','',a.title),desc=make('small','',a.description);body.append(title,desc);row.append(logo,body);
   if(!a.seen_at){row.classList.add('siya-unseen');const done=make('button','siya-celebrate','Celebrate ✓');done.type='button';done.setAttribute('aria-label','Mark '+a.title+' achievement seen');done.addEventListener('click',async()=>{done.disabled=true;try{const r=await fetch('/api/siya/milestones/seen',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:a.id})});if(!r.ok)throw Error('Could not acknowledge achievement');lastMilestoneCheck=0;await loadMilestones(true)}catch(e){done.disabled=false;done.textContent='Try again'}});row.append(done)}trophyList.append(row)}
  if(unread.length&&!noticeShown){noticeShown=true;const bubble=make('span','siya-floating-achievement','🏆 '+unread.length+' achievement'+(unread.length===1?'':'s')+'!');root.append(bubble);const b=root.getBoundingClientRect();bubble.style.left=Math.max(8,Math.min(innerWidth-210,b.left))+'px';bubble.style.top=(b.top>110?Math.max(8,b.top-64):Math.min(innerHeight-80,b.bottom+12))+'px';setTimeout(()=>bubble.remove(),9000)}
  layoutPanel();
 }catch(e){trophyList.textContent='Achievements temporarily unavailable';layoutPanel()}
}
async function getBrief(){if(!allowed)return;briefContent.textContent='Checking your saved deadlines, personal tasks and reminders…';try{paintBrief(await api('/api/ai/companion/brief'))}catch(e){briefContent.textContent='Could not retrieve a briefing: '+e.message+'. Your other portfolio features remain available.';layoutPanel()}}
async function check(){if(!protectedOrigin){guest();return}status.textContent='Checking access securely…';try{const d=await api('/api/ai/access/status');actions.replaceChildren();allowed=!!d.allowed;if(allowed){quick.hidden=false;msg.textContent='Ask me here for quick help, or open Command Centre for serious engineering stuff.';action('Open Siya AI Centre',WORKER+'/ai-centre.html',true);status.textContent='AI access granted · '+(d.role==='admin'?'Administrator':'Member');await getBrief()}else{quick.hidden=true;briefContent.textContent='Your AI access is awaiting approval. No private records displayed.';msg.textContent='Your portfolio account is recognized but Siya access requires approval.';action(d.requestStatus==='pending'?'View pending request':'Request AI access',WORKER+'/ai-access.html',true);status.textContent=d.requestStatus==='pending'?'Access request pending':'Existing portfolio features still work.'}}catch{guest();status.textContent='Sign in to your portfolio account to use private features.'}finally{layoutPanel()}}
function sastToday(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`}
function addDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function parseReminder(text){let m=text.match(/^remind\s+me\s+(today|tomorrow|on\s+\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(?:to|about)\s+(.{3,200})$/i);
if(!m)return null;const today=sastToday();let date=/^tomorrow$/i.test(m[1])?addDays(today,1):/^today$/i.test(m[1])?today:m[1].replace(/^on\s+/i,'');
const hour=Number(m[2]),min=Number(m[3]||0);if(hour>23||min>59)return {error:'Use a valid 24-hour clock time.'};const at=new Date(date+'T'+String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0')+':00+02:00');const parts=Number.isFinite(at.getTime())?Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,x.value])):null;const actual=parts?parts.year+'-'+parts.month+'-'+parts.day:'';if(!parts||actual!==date)return {error:'The calendar date was invalid.'};return {title:m[4].trim(),remindAt:at.toISOString()}}
quick.addEventListener('submit',async e=>{e.preventDefault();if(!allowed||send.disabled)return;const q=prompt.value.trim();if(!q)return;send.disabled=true;quickStatus.textContent='Siya is on it…';try{
 const rem=parseReminder(q);if(rem?.error){quickStatus.textContent=rem.error;return}
 if(rem){const when=new Date(rem.remindAt).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg',dateStyle:'medium',timeStyle:'short'});if(!confirm('Create a personal in-app reminder for '+when+'?\n'+rem.title))return;await api('/api/ai/reminders','POST',rem);quickStatus.textContent='Reminder saved for '+when+'. It will appear when you open YourPortfolio near its due time. No background alert is guaranteed.';prompt.value='';await getBrief();return}
 if(/^remind\s+me\b/i.test(q)){quickStatus.textContent='Try: Remind me tomorrow at 09:00 to finish the MIBK report. In-app reminders need a date and time.';return}
 if(/(?:what(?:'s| is) due|deadlines?|any problems?|briefing|urgent|what should i check)/i.test(q)){await getBrief();quickStatus.textContent='Your private briefing is above.';return}
 const d=await api('/api/ai/chat','POST',{message:q,saveConversation:false});quickStatus.textContent=String(d.answer||d.error||'No answer returned').slice(0,950)+(d.proposal?' To approve that change, open the Command Centre.':'');
 }catch(err){quickStatus.textContent=err.message}finally{send.disabled=false;layoutPanel()}});
const storageKey='yp-siya-mascot-position-v1';let dragged=false,down=null,skipClick=false;
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function defaultXY(){return {x:Math.max(12,innerWidth-root.offsetWidth-20),y:Math.max(12,innerHeight-root.offsetHeight-20)}}
function position(x,y,save){const w=root.offsetWidth||68,h=root.offsetHeight||68,px=clamp(Math.round(x),8,Math.max(8,innerWidth-w-8)),py=clamp(Math.round(y),8,Math.max(8,innerHeight-h-8));root.style.left=px+'px';root.style.top=py+'px';root.style.right='auto';root.style.bottom='auto';layoutPanel();if(save)try{localStorage.setItem(storageKey,JSON.stringify({x:innerWidth?px/innerWidth:.8,y:innerHeight?py/innerHeight:.8}))}catch{}}
function layoutPanel(){const box=root.getBoundingClientRect(),pWidth=Math.min(385,innerWidth-18),pHeight=panel.offsetHeight||395,x=clamp(box.left+box.width-pWidth,9,Math.max(9,innerWidth-pWidth-9));let y=box.top-pHeight-13;if(y<9)y=clamp(box.bottom+10,9,Math.max(9,innerHeight-pHeight-9));panel.style.left=x+'px';panel.style.top=y+'px';panel.style.width=pWidth+'px'}
function toggle(){if(panel.dataset.open==='yes'){newJoke();getBrief();loadMilestones(true);return;}panel.dataset.open='yes';btn.setAttribute('aria-expanded','true');newJoke();layoutPanel();check();loadMilestones(true)}
btn.addEventListener('pointerdown',e=>{if(e.button!==0)return;down={id:e.pointerId,x:e.clientX,y:e.clientY,left:root.getBoundingClientRect().left,top:root.getBoundingClientRect().top};dragged=false;btn.setPointerCapture?.(e.pointerId)});
btn.addEventListener('pointermove',e=>{if(!down||e.pointerId!==down.id)return;if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)dragged=true;if(!dragged)return;e.preventDefault();position(down.left+e.clientX-down.x,down.top+e.clientY-down.y,false)});
btn.addEventListener('pointerup',e=>{if(!down||e.pointerId!==down.id)return;if(dragged){position(root.getBoundingClientRect().left,root.getBoundingClientRect().top,true);skipClick=true;setTimeout(()=>skipClick=false,70)}down=null});
btn.addEventListener('pointercancel',()=>{down=null;dragged=false});
btn.addEventListener('click',e=>{if(skipClick||dragged){e.preventDefault();dragged=false;skipClick=false;return}toggle()});
btn.addEventListener('keydown',e=>{if(!e.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const b=root.getBoundingClientRect(),step=e.shiftKey?50:15;position(b.left+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),b.top+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0),true)});
close.addEventListener('click',()=>{panel.dataset.open='no';btn.setAttribute('aria-expanded','false');btn.focus()});
reset.addEventListener('click',()=>{try{localStorage.removeItem(storageKey)}catch{}const p=defaultXY();position(p.x,p.y,false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.dataset.open==='yes'){panel.dataset.open='no';btn.setAttribute('aria-expanded','false');btn.focus()}});
window.addEventListener('resize',()=>{const b=root.getBoundingClientRect();position(b.left,b.top,false)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&protectedOrigin)loadMilestones()});
if(protectedOrigin){setTimeout(()=>loadMilestones(),1400);if(CONTEXT==='timesheets')setInterval(()=>{if(!document.hidden)loadMilestones()},120000)}
document.body.append(root);let saved=null;try{saved=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{}const p=saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)?{x:saved.x*innerWidth,y:saved.y*innerHeight}:defaultXY();position(p.x,p.y,false);
})();
