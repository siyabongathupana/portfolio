/* Siya v3.2 — original branded mascot, contextual jokes, private PA briefings & reminders.
   Never infers login status on public GitHub Pages. All sensitive data via protected Worker. */
(()=>{'use strict';
if(document.getElementById('siya-launcher'))return;
const WORKER='https://portfolio-data-bridge.siyabongatshem.workers.dev';
const JOIN='https://siyabongathupana.github.io/portfolio/join.html';
const protectedOrigin=location.origin===new URL(WORKER).origin;
const PUBLIC_ORIGIN='https://siyabongathupana.github.io';
const BRIDGE_KEY='siya-v36-verified-session';
const bridgeTtlMs=20*60*1000;
// Handoff is a small, non-credential display hint passed when navigating from the protected workspace.
// It cannot authorize any API or private data request.
function readWorkspaceHandoff(){
 if(protectedOrigin||!location.hash.startsWith('#siya_session='))return;
 try{
  const data=JSON.parse(decodeURIComponent(location.hash.slice('#siya_session='.length)));
  if(data?.signedIn!==true||Date.now()-Number(data.checkedAt||0)>20*60*1000)return;
  rememberBridge({...data,source:'workspace-handoff'});
  history.replaceState(history.state,'',location.pathname+location.search);
 }catch{ /* An unverified URL never grants access */ }
}

let guestGeneration=0,bridgeWindow=null;
function bridgeSnapshot(){try{const d=JSON.parse(sessionStorage.getItem(BRIDGE_KEY)||'null');return d&&d.signedIn===true&&Date.now()-Number(d.checkedAt||0)<bridgeTtlMs?d:null}catch{return null}}
function rememberBridge(d){const clean={signedIn:true,firstName:String(d.firstName||'').slice(0,70),aiAllowed:d.aiAllowed==null?null:!!d.aiAllowed,isAdmin:!!d.isAdmin,badgeCount:d.badgeCount===null||d.badgeCount===undefined?null:Math.max(0,Number(d.badgeCount)||0),partialMailboxScan:!!d.partialMailboxScan,source:String(d.source||'live-session').slice(0,28),checkedAt:Date.now()};try{sessionStorage.setItem(BRIDGE_KEY,JSON.stringify(clean))}catch{}return clean}
function secureHandshake(){
 if(protectedOrigin)return;
 const nonce=(crypto?.randomUUID?.()||String(Date.now())+Math.random()).replaceAll('-','');
 try{sessionStorage.setItem('siya-bridge-nonce',nonce)}catch{}
 const link=WORKER+'/siya-account-bridge.html?origin='+encodeURIComponent(location.origin)+'&nonce='+encodeURIComponent(nonce);
 bridgeWindow=window.open(link,'siya_secure_account_check','popup=yes,width=520,height=640');
 if(!bridgeWindow){location.href=link;return}
 status.textContent='A secure sign-in check opened. Complete it to connect Siya here.';
}
window.addEventListener('message',event=>{
 if(protectedOrigin||event.origin!==new URL(WORKER).origin||!event.data||event.data.type!=='siya-v36-verified')return;
 const expected=sessionStorage.getItem('siya-bridge-nonce');
 if(!expected||event.data.nonce!==expected||event.data.session?.signedIn!==true)return;
 sessionStorage.removeItem('siya-bridge-nonce');
 rememberBridge(event.data.session);guest();
});

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
const btn=make('button','siya-trigger');btn.type='button';btn.setAttribute('aria-label','Open Siya assistant. Drag to move.');btn.setAttribute('aria-expanded','false');btn.removeAttribute('title');btn.append(icon,make('span','siya-dot'));const badge=make('span','siya-badge','');badge.hidden=true;badge.setAttribute('aria-live','polite');btn.append(badge);root.append(btn);
const panel=make('section','siya-card');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Siya assistant');panel.dataset.open='no';
const head=make('div','siya-top'),hicon=icon.cloneNode(true),heading=make('div');heading.append(make('strong','','Siya · Your co-pilot'),make('small','','Your friendly Cybertronian engineer ⚙️'));
head.append(hicon,heading);panel.append(head);
const joke=make('p','siya-joke');joke.setAttribute('aria-live','polite');panel.append(joke);
const brief=make('div','siya-brief');brief.hidden=true;brief.setAttribute('aria-live','polite');
const briefHeader=make('div','siya-brief-header');briefHeader.append(make('strong','','📋 Your quick briefing'));
const briefDismiss=make('button','siya-brief-dismiss','Hide');briefDismiss.type='button';briefDismiss.setAttribute('aria-label','Hide the briefing');briefHeader.append(briefDismiss);brief.append(briefHeader);
const BRIEF_SESSION_KEY='siya-v37-brief-seen';
let briefingDismissed=false,briefingTimer=null;
try{briefingDismissed=sessionStorage.getItem(BRIEF_SESSION_KEY)==='1'}catch{}
function dismissBrief(){briefingDismissed=true;brief.hidden=true;if(briefingTimer){clearTimeout(briefingTimer);briefingTimer=null}try{sessionStorage.setItem(BRIEF_SESSION_KEY,'1')}catch{}layoutPanel()}
briefDismiss.onclick=dismissBrief;
function briefVisibleOnce(){if(briefingDismissed||panel.dataset.open!=='yes'||brief.hidden)return;
 try{sessionStorage.setItem(BRIEF_SESSION_KEY,'1')}catch{}briefingDismissed=true;
 briefingTimer=setTimeout(()=>{brief.hidden=true;layoutPanel()},120000);
}
const briefContent=make('div','siya-brief-content','Open Siya for your saved deadlines, tasks and reminders.');brief.append(briefContent);panel.append(brief);
const msg=make('p','siya-message','I can check saved records, answer quick questions and set in-app reminders.');panel.append(msg);
const introLines={
 playful:[
  "Siya online. My coffee is virtual, but my deadlines are terrifyingly real. ☕",
  "Cybertron has filed a complaint about your open browser tabs. I defended you. Mostly. 🤖",
  "Hello from localhost! I checked the logs; the coffee machine is still suspicious. 🔎",
  "Systems nominal, jokes questionable, engineering curiosity encouraged. ⚙️",
  "I came to optimize workflows, and somehow ended up investigating missing biscuits. 🍪",
  "You bring the engineering. I'll bring the numerical accuracy and terrible puns. 🧮",
  "My circuits are awake. My sense of humor has not passed FAT. 😁",
  "I tried to reboot procrastination. The process is still running. ⏳",
  "I've spoken to the control valves. They say today's plan needs fewer meetings. 😎",
  "My creator wrote the code. I contribute personality and occasional embarrassment. 🛸",
  "Your digital co-pilot has arrived. Please keep arms inside the automation at all times. 🚀",
  "I was born on Cybertron and raised at localhost. My rent is one CPU cycle. 🤖",
  "I found your focus. It was hiding behind five spreadsheet tabs. 📊",
  "The PLC called. Apparently my last joke exceeded its scan time. ⚡",
  "Just your friendly neighborhood deadline detector. No cape, just a hard hat. 🪖",
  "Hello, human. This is your daily reminder that engineering is basically debugging reality. 🔧",
  "Today's productivity mission: prevent scope creep from applying for citizenship. 🗂️",
  "Siya reporting: all systems ready, except the sarcasm limiter. It never worked. 😄"
 ],
 balanced:[
  "Welcome back. Shall we review what's new or focus on your next priority?",
  "Siya here. I can help with reports, tasks, dates and project insights.",
  "Good to see you. Let's turn today's plans into progress.",
  "Your workspace assistant is ready. What would you like to investigate?",
  "Need a quick summary or a deeper analysis? I'm ready for both.",
  "I can help track deadlines, review your work and organize what's next.",
  "Hello! Let's find the information that matters and skip the clutter.",
  "Ready to make sense of your Timesheets, Studies and projects.",
  "Welcome to your workspace. Let's make each decision data-driven.",
  "Siya is online. Want an overview, an answer or an approved action?"
 ],
 focused:[
  "Assistant ready. What do you need?",
  "Ready. Select a task or request an analysis.",
  "Siya online. Verified data first.",
  "Awaiting your next instruction.",
  "Systems ready. State your question.",
  "Reporting mode active. What should we review?",
  "Ready to inspect records and identify exceptions.",
  "Focus mode enabled. Let's get to the result."
 ]
};
const contextualHello={
 timesheets:["Your Timesheets are ready for review.","Hours, projects and progress—let's check the numbers.","Need help with entries or workload patterns?"],
 studies:["What should we tackle first—grades, topics or deadlines?","Ready for a study session or progress check?","Learning mode online. How can I help?"],
 projects:["Project desk online. What should we inspect?","Let's see what moved on your projects.","Ready for the next milestone?"],
 certificates:["Need to review certifications or publishing?","Let's keep those credentials organized."],
 analytics:["Numbers ready. What question should we answer?","Let's turn your data into a useful decision."],
 admin:["Administrator tools standing by.","Your systems overview is ready for review."],
 home:["What can I help you accomplish today?","Let's make this a productive visit."]
};
let introIndex=-1,lastPersonalIntro='';
function personality(){try{return localStorage.getItem('siya-personality-v1')||'playful'}catch{return 'playful'}}
function selectIntro(){const mode=personality(),lines=introLines[mode]||introLines.playful;let next=Math.floor(Math.random()*lines.length);if(lines.length>1&&next===introIndex)next=(next+1)%lines.length;introIndex=next;msg.textContent=lines[next]}
function personalWelcome(name){
 const first=String(name||'').trim().split(/\s+/)[0].slice(0,40),base=introLines[personality()]||introLines.playful,subject=contextualHello[CONTEXT]||contextualHello.home;
 let options=base.slice().concat(subject);
 let next=options[Math.floor(Math.random()*options.length)];if(options.length>1&&next===lastPersonalIntro)next=options[(options.indexOf(next)+1)%options.length];
 lastPersonalIntro=next;msg.textContent=(first?'Hello, '+first+'! ':'')+next;
}


const quick=make('form','siya-quick');quick.setAttribute('aria-label','Quick command');quick.hidden=true;
const prompt=make('input','siya-quick-input');prompt.type='text';prompt.maxLength=320;prompt.placeholder='Ask Siya anything…';prompt.setAttribute('aria-label','Ask Siya a quick question or set a reminder');prompt.autocomplete='off';
const send=make('button','siya-quick-send','Ask ↗');send.type='submit';quick.append(prompt,send);panel.append(quick);
const trophy=make('section','siya-milestones');trophy.hidden=!protectedOrigin;
const trophyHeading=make('div','siya-milestone-title');trophyHeading.append(make('strong','','🏆 Siya achievements'),make('span','siya-milestone-count',''));
const celebrateAll=make('button','siya-celebrate-all','🎉 Celebrate all');celebrateAll.type='button';const trophyList=make('div','siya-milestone-list');trophy.append(trophyHeading,celebrateAll,trophyList);panel.append(trophy);
const manageNotices=make('div','siya-notification-toolbar');manageNotices.hidden=true;
const readAll=make('button','siya-read-all','Mark all as read');readAll.type='button';manageNotices.append(readAll);panel.append(manageNotices);
const overlaps=make('section','siya-overlaps');overlaps.hidden=true;overlaps.append(make('strong','','⚠️ Overlap inspector'));const overlapList=make('div','siya-overlap-list');overlaps.append(overlapList);panel.append(overlaps);
const mailboxSection=make('section','siya-mailbox');mailboxSection.hidden=true;mailboxSection.append(make('strong','','✉️ New messages'));const mailboxList=make('div','siya-message-list');mailboxSection.append(mailboxList);const inboxLink=make('a','siya-inbox-link','Open messages →');inboxLink.href=WORKER+'/messages.html';mailboxSection.append(inboxLink);panel.append(mailboxSection);
celebrateAll.addEventListener('click',async()=>{if(celebrateAll.disabled)return;celebrateAll.disabled=true;try{await api('/api/siya/milestones/seen-all','POST',{});trophyList.replaceChildren();trophy.hidden=true;celebrateAll.hidden=true;lastMilestoneCheck=0;await loadNotifications();}catch(e){quickStatus.textContent='Could not celebrate everything yet. '+e.message;}finally{celebrateAll.disabled=false;layoutPanel();}});
const quickStatus=make('p','siya-message');quickStatus.setAttribute('aria-live','polite');panel.append(quickStatus);
const actions=make('div','siya-actions');panel.append(actions);
const status=make('div','siya-state');panel.append(status);
const reset=make('button','siya-reset','↺ Reset mascot position');reset.type='button';panel.append(reset);root.append(panel);
const action=(label,url,primary)=>{const a=make('a',primary?'siya-primary':'',label);a.href=url;actions.append(a)};
const visitorRoasts=['No account? Wow, even my toaster has a login. 🥲','You came all the way from the internet without an account? Bold. 😂','I would give you access, but my firewall is stricter than a university exam invigilator. 🤖','Visitor detected. Your next mission: create an account. This is not optional in my robot dreams. 😎','I checked the guest list. It says: nice try, Cybertron tourist! 🚀','Your account has gone missing. Was it ever here? A mystery worthy of a Netflix documentary. 🔍','I have 404 problems, and your account is currently one of them. 🤣'];
let lastPublicOpening='';
function renderPublicAccount(signed,generation){
 if(generation!==guestGeneration)return;
 recognizedPublic=!!signed;actions.replaceChildren();
 quick.hidden=false;brief.hidden=true;mailboxSection.hidden=true;trophy.hidden=true;briefContent.textContent='';
 if(signed){
  notificationData={badgeCount:signed.badgeCount,hasPartialMailboxScan:signed.partialMailboxScan===true||signed.badgeCount===null,checkedAt:new Date().toISOString()};updateBadge();
  personalWelcome(signed.firstName||'');
  action('Open my private workspace',WORKER+'/app.html',true);
  action(signed.aiAllowed===false?'Request Siya AI access':'Open Siya AI Centre',WORKER+(signed.aiAllowed===false?'/ai-access.html':'/ai-centre.html'));
  status.textContent=(signed.source==='workspace-handoff'?'Recent protected-workspace sign-in · ':'Verified account · ')+(signed.badgeCount===null?'Open workspace to refresh notifications.':'Notifications from your last verified check.');
 }else{
  badge.hidden=true;
  const candidates=[
   'Siya is here! Public mode is ready for quick questions. Private answers require a secure login.',
   'Hello, engineer! I can chat about public topics here. Sensitive records stay behind the Cloudflare gate.',
   'Cybertron reporting in. If you have an account, the workspace recognizes you securely. 🤖',
   'Hi there! Quick questions are welcome. For personal data, use the protected workspace.',
   'My scanners see a public browser—not your private login. I will not guess your account status. 👀',
   'Siya Later at your service. Your identity is your business until the server verifies it.',
   'I can offer jokes here, but even my robot curiosity needs authorization for private records. 😎',
   'Good to see you! The mini-chat is open; your private account remains safely protected.'
  ];
  let next=candidates[Math.floor(Math.random()*candidates.length)];
  if(next===lastPublicOpening)next=candidates[(candidates.indexOf(next)+1)%candidates.length];
  lastPublicOpening=next;msg.textContent=next;
  action('Open my private workspace',WORKER+'/app.html',true);
  action('Create / request an account',JOIN);
  status.textContent='I check existing accounts automatically when supported. Private records still require secure login.';
 }
 layoutPanel();
}
async function guest(){
 const generation=++guestGeneration;
 // Display last authorized context or a neutral sign-in option immediately.
 // Never freeze the entire popup waiting for cross-site cookies or Cloudflare Access.
 let signed=bridgeSnapshot();renderPublicAccount(signed,generation);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),3000);
 try{
  const res=await fetch(WORKER+'/api/siya/public-session',{credentials:'include',mode:'cors',cache:'no-store',signal:controller.signal});
  if(res.ok){const data=await res.json();if(data?.signedIn===true){signed=rememberBridge({...data,source:'live-session'});renderPublicAccount(signed,generation)}}
 }catch{ /* Third-party Access cookies may be blocked. Keep neutral or previously authenticated context. */ }
 finally{clearTimeout(timeout)}
}

let allowed=false,recognizedPublic=false,profileName=null;
async function api(path,method='GET',body=null){const opts={method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})}};if(body)opts.body=JSON.stringify(body);const r=await fetch(path,opts);let d;try{d=await r.json()}catch{throw Error('A secure response could not be read.')}if(!r.ok)throw Error(String(d.error||'Request failed').slice(0,180));return d}
function paintBrief(d){briefContent.replaceChildren();const rows=(d.notices||[]).slice(0,6);brief.hidden=!rows.length||briefingDismissed;
for(const n of rows){const row=make('div','siya-brief-row'),dot=make('span','siya-alert-dot '+(n.severity==='warning'?'siya-alert-warn':''),n.severity==='warning'?'!':'•'),text=make('span','',n.text);row.append(dot,text);if(n.reminderId){const done=make('button','siya-done','Done');done.type='button';done.onclick=async()=>{if(!confirm('Mark this reminder as completed?'))return;try{await api('/api/ai/reminders/done','POST',{id:n.reminderId});await getBrief()}catch(e){quickStatus.textContent=e.message}};row.append(done)}briefContent.append(row)}
status.textContent='Private briefing checked '+new Date(d.checkedAt||Date.now()).toLocaleTimeString()+' · In-app notifications only';briefVisibleOnce();layoutPanel();}
let lastMilestoneCheck=0;let notificationData=null;
function updateBadge(){
 // Only unread actionable events count. Briefings are informational, not notifications.
 const raw=notificationData?.badgeCount;
 const known=raw!==null&&raw!==undefined&&Number.isFinite(Number(raw));
 const total=known?Math.max(0,Math.floor(Number(raw))):0;
 const partial=notificationData?.hasPartialMailboxScan===true||!known;
 // Never show '?' or '+' as an unread count. On partial scans, show the
 // verified MINIMUM only. Zero with an incomplete scan is not an unread alert.
 manageNotices.hidden=!protectedOrigin||total===0;
 badge.hidden=total===0;
 badge.textContent=total>99?'99+':String(total);
 badge.title=partial?'At least '+total+' unread; some sources could not be checked.':' '+total+' unread notifications';
 btn.setAttribute('aria-label',total>0?'Siya assistant, '+(partial?'at least ':'')+total+' unread notification'+(total===1?'':'s'):'Open Siya assistant. Drag to move.');
 btn.dataset.notificationStatus=partial?'partial':notificationData?.checkedAt?'synced':'unknown';
}

async function loadNotifications(){if(!protectedOrigin)return;try{const d=await api('/api/siya/notifications');notificationData=d;updateBadge();mailboxList.replaceChildren();const msgs=(d.messages||[]);mailboxSection.hidden=!msgs.length;inboxLink.href=WORKER+(d.isAdmin?'/admin-messages.html':'/messages.html');for(const m of msgs.slice(0,5)){const row=make('div','siya-message-item');row.append(make('strong','',m.subject||'New message'),make('small','',m.from||'YourPortfolio'));mailboxList.append(row)}if(d.overlap?.active){if(Array.isArray(d.overlap.details))renderOverlapDetails({pairs:d.overlap.details,truncated:d.overlap.truncated});else await loadOverlapDetails()}else{overlaps.hidden=true;overlapList.replaceChildren()}
 layoutPanel();}catch{btn.dataset.notificationStatus='temporarily-unavailable';/* retain last verified count; never turn a failed request into fake zero */}}
async function loadOverlapDetails(){try{renderOverlapDetails(await api('/api/siya/overlaps/details'))}catch{overlaps.hidden=true}}
function renderOverlapDetails(x){overlapList.replaceChildren();const rows=x.pairs||[];overlaps.hidden=!rows.length;
 for(const p of rows.slice(0,12)){const row=make('div','siya-overlap-item');row.append(make('strong','',p.date+' · '+p.minutes+' minutes'),make('span','',(p.first?.project||'Unknown project')+' ('+p.first?.start+'–'+p.first?.end+')'),make('span','',(p.second?.project||'Unknown project')+' ('+p.second?.start+'–'+p.second?.end+')'),make('small','','Conflict: '+(p.overlapStart||'')+'–'+(p.overlapEnd||'')+' · Review your Timesheet.'));overlapList.append(row)}
 if(x.truncated)overlapList.append(make('small','','Additional conflicts may exist. Open Timesheets for full review.'));
 if(rows.length&&notificationData?.overlap?.fingerprint){const ignore=make('button','siya-ignore-overlap','Acknowledge this overlap warning');ignore.type='button';ignore.onclick=async()=>{if(!confirm('Hide this overlap warning? Your Timesheet entries will stay unchanged. New overlap patterns will alert again.'))return;ignore.disabled=true;try{await api('/api/siya/overlap-alert','POST',{fingerprint:notificationData.overlap.fingerprint});await loadNotifications();quickStatus.textContent='Overlap warning acknowledged. Your saved hours were not changed.'}catch(e){quickStatus.textContent=e.message;ignore.disabled=false}};overlapList.append(ignore)}
 }
readAll.onclick=async()=>{if(readAll.disabled||!protectedOrigin)return;readAll.disabled=true;readAll.textContent='Clearing…';try{const r=await api('/api/siya/notifications/mark-all','POST',{});await loadMilestones(true);await loadNotifications();quickStatus.textContent=r.partial?'Some sources could not be checked; verified items were marked read.':'All current notifications marked as read. New events will still appear.';}catch(e){quickStatus.textContent='Could not mark notifications read: '+e.message}finally{readAll.disabled=false;readAll.textContent='Mark all as read';layoutPanel()}};
async function loadMilestones(force=false){
 if(!protectedOrigin||!trophy)return;
 if(!force&&Date.now()-lastMilestoneCheck<60000)return;
 lastMilestoneCheck=Date.now();
 try{
  const res=await fetch('/api/siya/milestones/refresh',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:'{}'});
  const d=await res.json();if(!res.ok){trophy.hidden=true;return;}
  trophyList.replaceChildren();const unread=(d.awards||[]).filter(x=>!x.seen_at),visible=unread.slice(0,6);trophy.hidden=!unread.length;celebrateAll.hidden=!unread.length;
  trophyHeading.querySelector('.siya-milestone-count').textContent=d.unseenCount?d.unseenCount+' new':'';
  if(!d.dataAvailable){trophy.hidden=true;layoutPanel();return}
  
  for(const a of visible){const row=make('div','siya-milestone-row'),logo=make('span','siya-trophy-emoji',a.emoji||'🏆'),body=make('div',''),title=make('strong','',a.title),desc=make('small','',a.description);body.append(title,desc);row.append(logo,body);
   if(!a.seen_at){row.classList.add('siya-unseen');const done=make('button','siya-celebrate','Celebrate ✓');done.type='button';done.setAttribute('aria-label','Mark '+a.title+' achievement seen');done.addEventListener('click',async()=>{done.disabled=true;try{const r=await fetch('/api/siya/milestones/seen',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:a.id})});if(!r.ok)throw Error('Could not acknowledge achievement');lastMilestoneCheck=0;await loadMilestones(true)}catch(e){done.disabled=false;done.textContent='Try again'}});row.append(done)}trophyList.append(row)}
  await loadNotifications();
  layoutPanel();
 }catch(e){trophyList.textContent='Achievements temporarily unavailable';layoutPanel()}
}
async function getBrief(){if(!allowed){brief.hidden=true;updateBadge();return;}try{paintBrief(await api('/api/ai/companion/brief'))}catch(e){brief.hidden=true;updateBadge();quickStatus.textContent='Briefing temporarily unavailable. Your portfolio features still work.';layoutPanel()}}
async function check(){if(!protectedOrigin){guest();return}status.textContent='Checking access securely…';try{const d=await api('/api/ai/access/status');actions.replaceChildren();allowed=!!d.allowed;if(allowed){quick.hidden=false;selectIntro();action('Open Siya AI Centre',WORKER+'/ai-centre.html',true);
  if(profileName===null){try{const p=await api('/api/siya/profile');profileName=String(p.displayName||'').trim()}catch{profileName=''}}
  if(profileName)personalWelcome(profileName);
  status.textContent='AI access granted · '+(d.role==='admin'?'Administrator':'Member')+(profileName?' · '+profileName:'');await getBrief()}else{quick.hidden=true;brief.hidden=true;briefContent.textContent='';msg.textContent='Your portfolio account is recognized but Siya access requires approval.';action(d.requestStatus==='pending'?'View pending request':'Request AI access',WORKER+'/ai-access.html',true);status.textContent=d.requestStatus==='pending'?'Access request pending':'Existing portfolio features still work.'}}catch{quick.hidden=true;brief.hidden=true;actions.replaceChildren();msg.textContent='I could not confirm access just now. Your existing account and Timesheets were not changed.';action('Open account access',WORKER+'/ai-access.html',true);status.textContent='Access verification temporarily unavailable.'}finally{layoutPanel()}}
function sastToday(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`}
function addDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function parseReminder(text){let m=text.match(/^remind\s+me\s+(today|tomorrow|on\s+\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(?:to|about)\s+(.{3,200})$/i);
if(!m)return null;const today=sastToday();let date=/^tomorrow$/i.test(m[1])?addDays(today,1):/^today$/i.test(m[1])?today:m[1].replace(/^on\s+/i,'');
const hour=Number(m[2]),min=Number(m[3]||0);if(hour>23||min>59)return {error:'Use a valid 24-hour clock time.'};const at=new Date(date+'T'+String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0')+':00+02:00');const parts=Number.isFinite(at.getTime())?Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,x.value])):null;const actual=parts?parts.year+'-'+parts.month+'-'+parts.day:'';if(!parts||actual!==date)return {error:'The calendar date was invalid.'};return {title:m[4].trim(),remindAt:at.toISOString()}}
async function publicMiniChat(question){
 // Cross-origin requests remain subject to Cloudflare Access, portfolio permissions, and same-site browser rules.
 // No access token or user identity is supplied by the public page.
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),16000);
 try{
  const response=await fetch(WORKER+'/api/siya/public-mini-chat',{
   method:'POST',mode:'cors',credentials:'include',cache:'no-store',signal:controller.signal,
   headers:{'Content-Type':'text/plain;charset=UTF-8','Accept':'application/json'},
   body:JSON.stringify({message:question})
  });
  let result;try{result=await response.json()}catch{throw Error('Cloudflare sign-in is unavailable from this public page. Open the secure workspace to chat.')}
  if(!response.ok)throw Error(String(result.error||'Secure mini-chat is unavailable. Open your workspace to continue.').slice(0,240));
  return String(result.answer||'Siya could not answer that question.').slice(0,2800);
 }finally{clearTimeout(timeout)}
}
function publicLocalChat(q){
 if(/(?:full name|who are you|tell me about yourself|where (?:were you born|do you live))/i.test(q))return 'I am Siya Later, your Cybertronian co-pilot. Born on Cybertron; current address: localhost. 🤖';
 if(/^(?:where (?:is|are)|open|go to|navigate to|how (?:do I|can I) (?:find|open|navigate to)).*(?:projects|certificates|timesheets|studies)|^how to navigate/i.test(q))return 'I can help you navigate. Use the Projects, Certificates, Timesheets and Studies links above. Private records are only available after secure sign-in.';
 if(/(?:joke|make me laugh)/i.test(q)){newJoke();return 'Mission accepted. Check my latest joke above. 😎'}
 return null;
}
quick.addEventListener('submit',async e=>{e.preventDefault();if(send.disabled)return;const q=prompt.value.trim();if(!q)return;
 if(protectedOrigin&&!allowed){quickStatus.textContent='Your Siya AI access must be approved before private chat is available.';return}
 send.disabled=true;quickStatus.textContent='Siya is thinking…';try{
 if(!protectedOrigin){
  const basic=publicLocalChat(q);if(basic){quickStatus.textContent=basic;prompt.value='';return}
  if(bridgeSnapshot()?.aiAllowed===false){quickStatus.textContent='Your account needs Siya AI approval. Open your private workspace to request access.';return}
  try{quickStatus.textContent=await publicMiniChat(q);prompt.value='';}
  catch(err){quickStatus.textContent=err.message+' This public site does not store your credentials. Use Open Siya AI Centre for the authenticated chat.'}
  return;
 }

 const rem=parseReminder(q);if(rem?.error){quickStatus.textContent=rem.error;return}
 if(rem){const when=new Date(rem.remindAt).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg',dateStyle:'medium',timeStyle:'short'});if(!confirm('Create a personal in-app reminder for '+when+'?\n'+rem.title))return;await api('/api/ai/reminders','POST',rem);quickStatus.textContent='Reminder saved for '+when+'. It will appear when you open YourPortfolio near its due time. No background alert is guaranteed.';prompt.value='';await getBrief();return}
 if(/^remind\s+me\b/i.test(q)){quickStatus.textContent='Try: Remind me tomorrow at 09:00 to finish the MIBK report. In-app reminders need a date and time.';return}
 if(/(?:what(?:'s| is) due|deadlines?|any problems?|briefing|urgent|what should i check)/i.test(q)){if(briefingDismissed){quickStatus.textContent='Your briefing was already shown this session. For the full history, open Siya AI Centre.';}else{await getBrief();quickStatus.textContent=brief.hidden?'No new briefing to show.':'Your private briefing is above.';}return}
 const d=await api('/api/ai/chat','POST',{message:q,saveConversation:false});quickStatus.textContent=String(d.answer||d.error||'No answer returned').slice(0,950)+(d.proposal?' To approve that change, open the Command Centre.':'');
 }catch(err){quickStatus.textContent=err.message}finally{send.disabled=false;layoutPanel()}});
const storageKey='yp-siya-mascot-position-v1';let dragged=false,down=null,skipClick=false;
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function defaultXY(){return {x:Math.max(12,innerWidth-root.offsetWidth-20),y:Math.max(12,innerHeight-root.offsetHeight-20)}}
function position(x,y,save){const w=root.offsetWidth||68,h=root.offsetHeight||68,px=clamp(Math.round(x),8,Math.max(8,innerWidth-w-8)),py=clamp(Math.round(y),8,Math.max(8,innerHeight-h-8));root.style.left=px+'px';root.style.top=py+'px';root.style.right='auto';root.style.bottom='auto';layoutPanel();if(save)try{localStorage.setItem(storageKey,JSON.stringify({x:innerWidth?px/innerWidth:.8,y:innerHeight?py/innerHeight:.8}))}catch{}}
function layoutPanel(){const box=root.getBoundingClientRect(),pWidth=Math.min(385,innerWidth-18),pHeight=panel.offsetHeight||395,x=clamp(box.left+box.width-pWidth,9,Math.max(9,innerWidth-pWidth-9));let y=box.top-pHeight-13;if(y<9)y=clamp(box.bottom+10,9,Math.max(9,innerHeight-pHeight-9));panel.style.left=x+'px';panel.style.top=y+'px';panel.style.width=pWidth+'px'}
function toggle(){if(panel.dataset.open==='yes'){if(!brief.hidden)dismissBrief();panel.dataset.open='no';btn.setAttribute('aria-expanded','false');return;}
 panel.dataset.open='yes';btn.setAttribute('aria-expanded','true');newJoke();selectIntro();briefVisibleOnce();layoutPanel();check();if(protectedOrigin){loadMilestones(true);loadNotifications()}}

btn.addEventListener('pointerdown',e=>{if(e.button!==0)return;down={id:e.pointerId,x:e.clientX,y:e.clientY,left:root.getBoundingClientRect().left,top:root.getBoundingClientRect().top};dragged=false;btn.setPointerCapture?.(e.pointerId)});
btn.addEventListener('pointermove',e=>{if(!down||e.pointerId!==down.id)return;if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)dragged=true;if(!dragged)return;e.preventDefault();position(down.left+e.clientX-down.x,down.top+e.clientY-down.y,false)});
btn.addEventListener('pointerup',e=>{if(!down||e.pointerId!==down.id)return;if(dragged){position(root.getBoundingClientRect().left,root.getBoundingClientRect().top,true);skipClick=true;setTimeout(()=>skipClick=false,70)}down=null});
btn.addEventListener('pointercancel',()=>{down=null;dragged=false});
btn.addEventListener('click',e=>{if(skipClick||dragged){e.preventDefault();dragged=false;skipClick=false;return}toggle()});
btn.addEventListener('keydown',e=>{if(!e.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const b=root.getBoundingClientRect(),step=e.shiftKey?50:15;position(b.left+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),b.top+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0),true)});

reset.addEventListener('click',()=>{try{localStorage.removeItem(storageKey)}catch{}const p=defaultXY();position(p.x,p.y,false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.dataset.open==='yes'){panel.dataset.open='no';btn.setAttribute('aria-expanded','false');btn.focus()}});
window.addEventListener('resize',()=>{const b=root.getBoundingClientRect();position(b.left,b.top,false)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&protectedOrigin){loadMilestones();loadNotifications()}});
if(protectedOrigin){setTimeout(()=>{loadMilestones();loadNotifications()},700);setInterval(()=>{if(!document.hidden){loadNotifications();loadMilestones()}},90000)}
window.addEventListener('siya:notifications-changed',()=>{if(protectedOrigin){loadNotifications();loadMilestones(true)}});
if(!protectedOrigin){setTimeout(()=>{if(!document.hidden)guest()},900);setInterval(()=>{if(!document.hidden)guest()},90000)}
window.addEventListener('storage',e=>{if(e.key==='siya-personality-v1'&&panel.dataset.open==='yes')selectIntro()});

document.body.append(root);
// Preserve a recently authenticated profile across GitHub Pages navigation (same tab).
// URL fragment is purely cosmetic context and cannot grant permissions.
if(protectedOrigin){
 let handoff=null;
 fetch('/api/siya/profile',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}})
  .then(r=>r.ok?r.json():null).then(p=>{
   if(!p||!p.displayName)return;
   handoff={signedIn:true,firstName:String(p.displayName).split(/\s+/)[0].slice(0,70),isAdmin:!!p.owner,aiAllowed:null,checkedAt:Date.now(),badgeCount:null};
  }).catch(()=>{});
 document.addEventListener('click',event=>{
  const anchor=event.target.closest?.('a[href]');if(!anchor||!handoff)return;
  try{const url=new URL(anchor.href,location.href);
   if(url.origin!==PUBLIC_ORIGIN||!url.pathname.startsWith('/portfolio/'))return;
   url.hash='siya_session='+encodeURIComponent(JSON.stringify(handoff));anchor.href=url.href;
  }catch{}
 },true);
}
if(!protectedOrigin)readWorkspaceHandoff();
// Hidden one-time Cybertron easter egg on double click of the public creator portrait.
let portraitLastClick=0;
document.addEventListener('click',e=>{
 const pic=e.target.closest?.('img');if(!pic||!/Siyabonga1\.jpg/i.test(pic.currentSrc||pic.src||''))return;
 const now=Date.now();if(now-portraitLastClick<650){portraitLastClick=0;
  try{if(sessionStorage.getItem('siya-portrait-egg-v1'))return;sessionStorage.setItem('siya-portrait-egg-v1','yes')}catch{}
  const toast=make('div','siya-easter-egg','🤖 Secret file unlocked: the human who built me still thinks localhost is a valid home address. Cybertron approves.');
  document.body.append(toast);setTimeout(()=>toast.remove(),6500);
 }else portraitLastClick=now;
},true);
let saved=null;try{saved=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{}const p=saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)?{x:saved.x*innerWidth,y:saved.y*innerHeight}:defaultXY();position(p.x,p.y,false);
})();
