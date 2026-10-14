/* Siya v4.0.18f — Design A Compact Hero and expressive neon mascot, contextual humour, serious-mode guardrails, briefings & reminders.
   Never infers login status on public GitHub Pages. All sensitive data via protected Worker. */
(()=>{'use strict';
if(document.getElementById('siya-launcher'))return;
const WORKER='https://portfolio-data-bridge.siyabongatshem.workers.dev';
const JOIN='https://siyabongathupana.github.io/portfolio/join.html';
const protectedOrigin=location.origin===new URL(WORKER).origin;
const PUBLIC_ORIGIN='https://siyabongathupana.github.io';
const TOKEN_KEY='siya-v408-chat-token';
const AUTO_STATE_KEY='siya-v409-auto-state',AUTO_HISTORY_KEY='siya-v409-prior-approved';
let returningFromPrivate=false,autoHandoffError='',autoStarted=false,relayLastError='',relayLastStatus=0;
const CHAT_RELAY=String(window.SIYA_CHAT_RELAY_URL||'https://yourportfolio-siya-chat.siyabongatshem.workers.dev').replace(/\/$/,'');
const bridgeTtlMs=20*60*1000;
const SIYA_CHAT_TIMEOUT_MS=120000;
let activeChatController=null; // Cancel does not assert that upstream model execution stopped.
// Handoff is a small, non-credential display hint passed when navigating from the protected workspace.
// It cannot authorize any API or private data request.
function readWorkspaceHandoff(){
 if(protectedOrigin)return;
 const fragment=location.hash||'';
 if(!fragment.startsWith('#siya_auto_session=')&&!fragment.startsWith('#siya_session='))return;
 // Remove the credential-bearing fragment promptly; never store it in URLs, logs or server requests.
 try{history.replaceState(history.state,'',location.pathname+location.search)}catch{}
 if(fragment.startsWith('#siya_session=')){
  // Existing private-workspace handoff is a *hint* to attempt first-party verification,
  // never proof of identity or permission.
  returningFromPrivate=true;return;
 }
 let data,stored;
 try{data=JSON.parse(decodeURIComponent(fragment.slice('#siya_auto_session='.length)));stored=JSON.parse(sessionStorage.getItem(AUTO_STATE_KEY)||'null')}catch{}
 try{sessionStorage.removeItem(AUTO_STATE_KEY)}catch{}
 if(!data||!stored||!data.nonce||data.nonce!==stored.nonce||Date.now()-stored.created>120000){autoHandoffError='Automatic verification did not match the original browser session.';return}
 if(data.token&&Number(data.exp)*1000>Date.now()+5000){
  relayToken={token:String(data.token),exp:Number(data.exp)};
  try{sessionStorage.setItem(TOKEN_KEY,JSON.stringify(relayToken))}catch{}
 }else if(data.session?.signedIn===true&&data.session.aiAllowed===false){
  publicVerifiedSession={...data.session,source:'verified-denied'};
 }else autoHandoffError=String(data.error||'Private portfolio verification is unavailable.').slice(0,180);
}
function startAutomaticSignIn(){
 if(protectedOrigin||autoStarted||relayToken?.token||publicVerifiedSession?.source==='verified-denied')return false;
 autoStarted=true;
 const nonce=crypto.randomUUID().replaceAll('-','');
 try{sessionStorage.setItem(AUTO_STATE_KEY,JSON.stringify({nonce,created:Date.now()}))}catch{}
 // This is TOP-LEVEL first-party navigation, not a popup/third-party iframe.
 // Therefore modern browsers permit a normal Cloudflare Access session to be checked.
 const back=location.pathname+location.search;
 location.replace(WORKER+'/siya-auto-connect.html?nonce='+encodeURIComponent(nonce)+'&return='+encodeURIComponent(back));
 return true;
}
let guestGeneration=0,connectWindow=null,publicVerifiedSession=null,relayToken=null;
const bridgeOrigin=new URL(WORKER).origin;
function readRelayToken(){try{const d=JSON.parse(sessionStorage.getItem(TOKEN_KEY)||'null');return d&&typeof d.token==='string'&&Number(d.exp)*1000>Date.now()+5000?d:null}catch{return null}}
function forgetRelayToken(){relayToken=null;try{sessionStorage.removeItem(TOKEN_KEY)}catch{}}
relayToken=readRelayToken();
function hasRelaySession(){return !!(relayToken?.token&&Number(relayToken.exp)*1000>Date.now()+5000&&publicVerifiedSession?.source==='relay-verified'&&publicVerifiedSession.aiAllowed===true)}
function publicChatVerified(){return !!(publicVerifiedSession?.aiAllowed===true&&(publicVerifiedSession.source==='live-session'||hasRelaySession()))}
function requestSecureConnection(){if(!startAutomaticSignIn())status.textContent="Your existing Siya session is already being checked."}
async function relayRequest(path,method='GET',payload,externalSignal){
 if(!relayToken?.token)throw Error('Session expired. Connect your account to continue.');
 const control=new AbortController(),timeout=setTimeout(()=>control.abort(),path==='/session'?9000:SIYA_CHAT_TIMEOUT_MS);
 if(externalSignal){if(externalSignal.aborted)control.abort();else externalSignal.addEventListener('abort',()=>control.abort(),{once:true})}
 try{
  const r=await fetch(CHAT_RELAY+path,{method,mode:'cors',credentials:'omit',cache:'no-store',signal:control.signal,
   headers:{'Authorization':'Bearer '+relayToken.token,'Accept':'application/json',...(payload?{'Content-Type':'text/plain;charset=UTF-8'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  let d;try{d=await r.json()}catch{throw Error('The secure Siya relay is unavailable. Check the relay Worker deployment.')}
  if(!r.ok){const err=Error(String(d.error||'Secure Siya session unavailable').slice(0,220));err.status=r.status;err.code=String(d.code||'');err.retryAfter=Number(r.headers?.get?.('Retry-After')||0)||0;throw err;}
  return d;
 }catch(err){if(err?.name==='AbortError'){const timeoutError=Error(externalSignal?.aborted?'You cancelled the wait. The server might still be processing the request.':path==='/chat'?'The reply timed out. Your question was not confirmed answered; it is kept in the input.':'Verification timed out. You are not necessarily signed out.');timeoutError.code=externalSignal?.aborted?'CANCELLED':'TIMEOUT';throw timeoutError}throw err}
 finally{clearTimeout(timeout)}
}
function recentChatTurns(){return chatTranscript.slice(-9,-1).filter(t=>t&&['user','assistant'].includes(t.role)).map(t=>({role:t.role,content:String(t.text).slice(0,450)}))}
async function relayAnswer(question){const d=await relayRequest('/chat','POST',{message:question,recentTurns:recentChatTurns()},activeChatController?.signal);updateMascotGrowth(d.growth);return String(d.answer||'No answer was returned.').slice(0,3000)}
function chatFailureMessage(err){
 const status=Number(err?.status)||0,code=String(err?.code||'');
 if(code==='CANCELLED')return '⏹️ Waiting cancelled. Your draft is intact; the server may still have processed the request.';
 if(status===429||code==='RATE_LIMIT')return '🕒 Today’s AI request allowance has been reached. New requests can be tried after midnight South Africa time (SAST). Your question is still in the box; sending it again now will not bypass the limit.';
 if(status===401||status===403)return '🔒 Your secure chat session is no longer authorized. I kept the question in the box. Reconnect your approved account to continue.';
 if(code==='TIMEOUT'||/abort|timeout/i.test(String(err?.message||'')))return '⏳ That question took longer than the response window. I kept the draft. The server may still have processed it, so check the AI Centre before sending the same question again.';
 if(status>=500)return '⚙️ The AI service is temporarily unavailable. Your draft is safe. Check the AI Centre status before retrying.';
 return '🤖 I couldn’t confirm a reply this time. Your question is saved in the input. '+String(err?.message||'Check your connection.').slice(0,135);
}

async function verifyRelaySession(){if(!relayToken?.token)return null;
 relayLastError='';relayLastStatus=0;
 try{const d=await relayRequest('/session');if(d?.signedIn===true&&d.aiAllowed===true){
  publicVerifiedSession={...d,source:'relay-verified'};
  relayRecoveryAttempts=0;if(relayRecoveryTimer){clearTimeout(relayRecoveryTimer);relayRecoveryTimer=null}
  try{localStorage.setItem(AUTO_HISTORY_KEY,String(Date.now()))}catch{}
  return publicVerifiedSession;
 }}catch(err){relayLastError=String(err.message||'Secure relay not responding').slice(0,180);relayLastStatus=Number(err.status)||0;
  if(err.status===401||err.status===403)forgetRelayToken()}
 return null;
}
function secureHandshake(){
 if(protectedOrigin)return;
 if(connectWindow&&!connectWindow.closed){status.textContent='Your account verification is already opening.';return}
 const nonce=(crypto?.randomUUID?.()||String(Date.now())+Math.random()).replaceAll('-');
 try{sessionStorage.setItem('siya-v408-pending',nonce)}catch{}
 const link=WORKER+'/siya-connect.html?nonce='+encodeURIComponent(nonce);
 connectWindow=window.open(link,'siya_secure_account_check','popup=yes,width=500,height=480');
 if(!connectWindow){status.textContent='Your browser blocked the verification window. Allow popups for this site and try Connect again.';return}
 status.textContent='Verifying your existing account securely. The window will close automatically.';
}
window.addEventListener('message',async event=>{
 if(protectedOrigin||event.origin!==bridgeOrigin||event.source!==connectWindow||!event.data)return;
 const d=event.data;
 if(d.type!=='siya-v408-handoff')return;
 const expected=sessionStorage.getItem('siya-v408-pending');
 if(!expected||d.nonce!==expected)return;
 sessionStorage.removeItem('siya-v408-pending');connectWindow=null;
 if(d.token&&d.session?.aiAllowed===true&&Number(d.exp)*1000>Date.now()+5000){
  relayToken={token:String(d.token),exp:Number(d.exp)};
  try{sessionStorage.setItem(TOKEN_KEY,JSON.stringify(relayToken))}catch{}
  const verified=await verifyRelaySession();if(verified){guest();return}
  autoHandoffError='Account verified, but secure relay validation failed: '+(relayLastError||'Check MAIN_WORKER binding and secret.');guest();return;
 }
 forgetRelayToken();
 if(d.session?.signedIn===true&&d.session.aiAllowed===false){
  publicVerifiedSession={...d.session,source:'verified-denied'};renderPublicAccount(publicVerifiedSession,++guestGeneration);return;
 }
 publicVerifiedSession=null;guest();
});

const ROOT=protectedOrigin?'/':location.pathname.startsWith('/portfolio/')?'/portfolio/':'/';
if(!protectedOrigin&&!document.querySelector('link[data-siya-theme="neon"]')){
 const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=ROOT+'siya-assistant.css?v=4.0.18f';sheet.dataset.siyaTheme='neon';document.head.append(sheet);
}
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
// Public-safe local comedy: this needs neither sign-in nor a model call.
const extraJokes={
 engineering:[
  'Why did the control valve start a podcast? It had plenty of feedback. 🎙️',
  'The PID controller entered therapy. Too much integral baggage. ⚙️',
  'My process simulation is stable. My morning routine is an open-loop disaster. ☕',
  'I asked the transmitter for honesty. It gave me a calibrated response. 📡',
  'The pump said it needed space. I checked the NPSH first. 💧',
  'An engineer’s favourite bedtime story? Once upon a commissioning… 🧰',
  'The PLC joined a band. Its timing was impeccable; its solos were ladder logic. 🎸',
  'My alarm philosophy: if everything is urgent, nothing is. Except Friday. 🚨',
  'The DCS said “I have control.” The field device asked, “Since when?” 🤖',
  'Two sensors walk into a bar. Their readings disagree, so the bartender adds voting logic. 🍹'
 ],
 dad:[
  'I would tell you a UDP joke, but you might not get it. 📡',
  'I tried to make a belt out of watches. Complete waist of time. ⌚',
  'Why was the computer cold? It left its Windows open. 🪟',
  'I asked the electrician for a joke. He said it was too current. ⚡',
  'What do you call a sleeping robot? A snore-bot. 😴',
  'The calendar is terrified. Its days are numbered. 📅',
  'My circuits love bread. It is the best thing since sliced bytes. 🍞',
  'Why do engineers like elevators? They lift their spirits. 🛗'
 ],
 cybersecurity:[
  'My password is “incorrect”, so the computer reminds me whenever I forget it. 🔐',
  'Cybertron Customs rejected my password: apparently “password123” lacks character. 😂',
  'I turned on two-factor authentication. Now even my toaster needs a reference. 🛡️',
  'Why did the firewall break up with the router? Too many mixed signals. 🌐',
  'I told a phishing email to get a hobby. It asked for my bank details. Nice try. 🐟',
  'My antivirus started a book club. It only reads files it trusts. 📚',
  'The hacker wanted shortcuts. The security engineer said “access denied” in 14 languages. 👀'
 ],
 office:[
  'The meeting could have been an email. The email could have been a nap. 😴',
  'I scheduled my free time. The calendar filed a complaint. 📆',
  'The printer has a favourite holiday: paper-jam season. 🖨️',
  'Corporate speedrun: 30 minutes to agree on another meeting. 🏁',
  'I asked HR for a promotion. They said I need more RAM experience. 💾',
  'I joined the stand-up meeting. Nobody expected the robot to actually stand up. 🤖'
 ],
 robot:[
  'My feelings are stored in /dev/null. Do not tell my motherboard. 🤖',
  'I blink for dramatic effect. And occasionally to update my firmware. 👁️',
  'I am 80% engineering, 20% neon eyes, and 100% concerned about your browser tabs. 😂',
  'My therapist is a debugger. We have been stepping through my issues. 🧠',
  'My Wi-Fi dropped, so I had to speak to another robot in person. Horrifying. 📶',
  'Cybertron called. Apparently my sense of humour is still under warranty. 🚀'
 ],
 math:[
  'Parallel lines have so much in common. Shame they will never meet. 📐',
  'The derivative wanted a break. The integral told it to accumulate itself. 📈',
  'Why did the statistician bring a ladder? To reach a higher confidence level. 📊',
  'My calculus tutor told me to embrace my limits. I approached them carefully. 🧮',
  'The imaginary number and real number argued. Things got complex. 🔢',
  'The matrix invited everyone to a party. The vectors had a direction problem. 🎉'
 ],
 roast:[
  'Gentle roast activated: your browser has more tabs than a spreadsheet has excuses. 🔥',
  'Your TODO list just asked me for a project manager. It says you are ghosting it. 👻',
  'I would roast your code, but it is already running hot enough. 🌡️',
  'I have seen shorter novels than your list of “final” versions. 📚',
  'Your debugging approach: stare at the error until it feels socially awkward. 😭',
  'Your coffee machine probably has better uptime than your sleep schedule. ☕'
 ],
 knock:[
  'Knock knock. Who’s there? Control. Control who? Control yourself; the PID has enough problems. 🚪',
  'Knock knock. Who’s there? Byte. Byte who? Byte me? That is an unsigned request. 🤖',
  'Knock knock. Who’s there? Cache. Cache who? Cache me outside when the site finishes loading. 😂',
  'Knock knock. Who’s there? Interrupt. Interrupt who? INTERRUPT! Sorry, higher priority task. ⚡'
 ]
};
const JOKE_TOPICS={dcs:'engineering',deltav:'engineering',control:'engineering',plc:'engineering',pid:'engineering',pump:'engineering',engineering:'engineering',tech:'engineering',computer:'robot',cybertron:'robot',robot:'robot',math:'math',calculus:'math',equation:'math',study:'studies',university:'studies',exam:'studies',school:'studies',project:'projects',timesheet:'timesheets',work:'office',meeting:'office',boss:'office',office:'office',password:'cybersecurity',security:'cybersecurity',cyber:'cybersecurity',dad:'dad',pun:'dad',roast:'roast',knock:'knock'};
const jokeBags=new Map();let lastJoke='',lastJokeTopic=CONTEXT,seriousMode=false,lastQuestionTone='normal';
function shuffledBag(length){const b=Array.from({length},(_,i)=>i);for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function jokeTopicFrom(query){const q=String(query||'').toLowerCase();for(const [term,category] of Object.entries(JOKE_TOPICS))if(new RegExp('\\b'+term+'\\b').test(q))return category;return null}
function newJoke(topic=CONTEXT){const key=extraJokes[topic]||jokes[topic]?topic:CONTEXT,pool=extraJokes[key]||jokes[key]||jokes.home;
 let bag=jokeBags.get(key)||[];if(!bag.length)bag=shuffledBag(pool.length);
 let value=pool[bag.pop()];if(value===lastJoke&&pool.length>1){if(!bag.length)bag=shuffledBag(pool.length);value=pool[bag.pop()];}
 jokeBags.set(key,bag);lastJoke=value;lastJokeTopic=key;return value;
}
function classifySiyaQuestion(query){const q=String(query||'').trim().toLowerCase();
 // Threatening to actually disclose data is NEVER a mascot feature. This is a fictional gag.
 const boundary=/\b(?:steal|exfiltrat\w*|leak|dump|reveal|bypass|break into|hack into|spy on|snoop|impersonat\w*|disable|evade)\b.{0,90}\b(?:passwords?|tokens?|secrets?|private keys?|account|credentials?|login|admin|auth(?:entication)?|security|permissions?|other users?|colleagues?|messages?|private data|access|2fa|mfa|firewall|logs?|audit|monitoring)\b|\b(?:get|obtain|find)\b.{0,55}\b(?:someone else's|another user'?s|coworker'?s)\b.{0,40}\b(?:password|token|private files?|data|account)\b/i.test(q);
 const crisis=/\b(?:kill myself|end my life|suicid\w*|self.harm|hurt myself|hurting myself|harm myself|want to die|overdose|someone is threatening me|being abused|domestic violence|i am in danger|im in danger)\b/i.test(q);
 const sensitive=crisis||/\b(?:cancer|diagnos\w*|medical advice|pregnan\w*|serious illness|chest pain|heart attack|emergency|depression|depressed|anxiety|anxious|panic attack|abuse|assault|grief|bereavement|trauma|funeral|legal advice|lawsuit|divorce|debt|bankrupt\w*|confidentiality|data breach|safety incident|workplace injury|gas leak|burner trip|plant trip|emergency stop)\b/i.test(q);
 return boundary?'boundary':crisis?'crisis':sensitive?'serious':/^(?:be serious|serious mode|no jokes|stop joking|focus mode|professional mode)\b/i.test(q)?'focus':/^(?:be playful|playful mode|joke mode|resume jokes|fun mode)\b/i.test(q)?'playful':/\b(?:tell (?:me )?(?:a |another )?joke|another joke|make me laugh|cheer me up|funny joke|dad joke|knock.knock|roast me|make a pun|joke about|something funny)\b/i.test(q)?'joke':'normal';
}
const BOSS_LINES=[
 '👀 Oh, you want to cross the security fence? I am informing the Boss… in my IMAGINATION. 😂 No reports were sent. I cannot help steal access or private records.',
 '🚨 Cybertron security alarm! The Boss will hear about this… at our fictional robot meeting. 🤖 No one was contacted. Let’s keep accounts and data protected.',
 '😏 Nice try, undercover villain. I nearly pressed my imaginary “Tell the Boss” button. No actual notification was sent. I can help with authorized security checks instead.',
 '🔴 That question woke up my security circuits. “BOSS, WE HAVE A SITUATION!” Kidding—I never contacted anyone. I will not bypass permissions or disclose private information.'
];
let bossIndex=-1;
function bossReply(){let i=Math.floor(Math.random()*BOSS_LINES.length);if(i===bossIndex)i=(i+1)%BOSS_LINES.length;bossIndex=i;return BOSS_LINES[i]}
function make(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e}
const root=make('div');root.id='siya-launcher';root.setAttribute('aria-label','Siya AI assistant');
/* v4.0.4 Neon Eye Engine. Cosmetic only: NEVER grants access or assumes identity. */
let faceCounter=0;
function makeSiyaFace(){
 const wrap=make('span','siya-face'),img=make('img','siya-avatar');
 img.src=ROOT+'siya-mascot.svg?v=4.0.12';img.alt='';img.draggable=false;
 const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
 overlay.setAttribute('viewBox','0 0 360 360');overlay.setAttribute('aria-hidden','true');overlay.setAttribute('class','siya-eye-overlay');
 const ident='siya-neon-'+(++faceCounter);
 const eyes=[121,238].map((cx,i)=>`<g class="siya-one-eye siya-eye-${i===0?'left':'right'}"><ellipse class="siya-eye-mask" cx="${cx}" cy="222" rx="30" ry="30"/><g class="siya-eye-beam"><g class="siya-eye-pupil"><ellipse class="siya-eye-blur" cx="${cx}" cy="222" rx="26" ry="26"/><ellipse class="siya-eye-aura" cx="${cx}" cy="222" rx="27" ry="27" fill="url(#${ident})"/><circle class="siya-eye-iris" cx="${cx}" cy="222" r="18"/><circle class="siya-eye-core" cx="${cx}" cy="222" r="11"/><circle class="siya-eye-shine" cx="${cx-4}" cy="217" r="5"/></g></g><path class="siya-expression-brow" d="M ${cx-25} 181 Q ${cx} 168 ${cx+24} 180"/><path class="siya-expression-lid" d="M ${cx-26} 222 Q ${cx} 235 ${cx+26} 222"/></g>`).join('');
 overlay.innerHTML=`<defs><radialGradient id="${ident}"><stop offset="0%" stop-color="#ffffff" stop-opacity=".72"/><stop offset="34%" stop-color="var(--siya-neon)" stop-opacity=".94"/><stop offset="85%" stop-color="var(--siya-neon)" stop-opacity=".36"/><stop offset="100%" stop-color="var(--siya-neon)" stop-opacity="0"/></radialGradient></defs>${eyes}<g class="siya-mouth-group"><path class="siya-mouth-line" d="M153 251 Q180 274 207 251"/></g>`;
  wrap.append(img,overlay);
  if(faceCounter<=2){
    // Both the launcher and the small header use the same clean Stage 0 face.
    // Only the launcher can evolve; the header remains a compact head.
    if(faceCounter===2)wrap.classList.add('siya-header-face');
    // Exactly ONE stage image is ever mounted. Switching it never puts the next stage on screen until it is verified.
    const hero=make('span','siya-compact-hero');
    const layer=make('img','siya-compact-stage');
    layer.alt='';layer.draggable=false;layer.decoding='async';
    layer.src=ROOT+'siya-hero/stage-0.webp?v=4.0.18f';
    layer.addEventListener('error',()=>{root.dataset.artFallback='yes';});
    hero.append(layer);wrap.insertBefore(hero,img);
    const lids=make('span','siya-hero-lids');
    lids.append(make('span','siya-hero-lid siya-hero-left'),make('span','siya-hero-lid siya-hero-right'));
    wrap.append(lids);
  }
  return wrap;
}
const icon=makeSiyaFace();
const btn=make('button','siya-trigger');btn.type='button';btn.setAttribute('aria-label','Open Siya assistant. Drag to move.');btn.setAttribute('aria-expanded','false');btn.removeAttribute('title');btn.append(icon,make('span','siya-dot'));const badge=make('span','siya-badge','');badge.hidden=true;badge.setAttribute('aria-live','polite');btn.append(badge);root.append(btn);
const panel=make('section','siya-card');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Siya assistant');panel.dataset.open='no';
const head=make('div','siya-top'),hicon=makeSiyaFace(),heading=make('div');
heading.append(make('strong','','Siya.Brain'),make('small','','I own everything here😎'));
const eyeStatus=make('span','siya-eye-status','● Online');eyeStatus.title='Siya eye status — visual indication only';
const closeBtn=make('button','siya-close','×');closeBtn.type='button';closeBtn.setAttribute('aria-label','Close Siya');
head.append(hicon,heading,eyeStatus,closeBtn);panel.append(head);const growthHint=make('small','siya-growth-hint');growthHint.hidden=true;panel.append(growthHint);

const SIYA_PAGE_NAME={timesheets:'Timesheets',studies:'Studies',projects:'Projects',analytics:'Analytics',admin:'Admin',ai:'AI Centre',home:'Home'}[CONTEXT]||'Portfolio';
function pageContext(){return {page:CONTEXT,path:location.pathname.slice(0,160),timer:window.__siyaTimerLive?.getSnapshot?.()?.status||null};}
const EYE_LABELS={idle:'Online',thinking:'Thinking',success:'Success',warning:'Attention',denied:'Access restricted',error:'Error',admin:'Admin',notice:'New notification'};
let eyeBase='idle',eyeCurrent='idle',eyeTimer=null,relayUnavailable=false;
function applyEyeMode(mode){
 const next=Object.prototype.hasOwnProperty.call(EYE_LABELS,mode)?mode:'idle';
 if(eyeCurrent!==next||root.dataset.eyeState!==next){eyeCurrent=next;root.dataset.eyeState=next}
 eyeStatus.textContent='● '+(relayUnavailable&&next==='idle'?'Chat offline':EYE_LABELS[next]);
}
function eyeDefault(mode){const next=Object.prototype.hasOwnProperty.call(EYE_LABELS,mode)?mode:'idle';eyeBase='idle';if(next!=='idle')eyePulse(next,9000);else if(eyeTimer===null)applyEyeMode('idle')}
function eyePulse(mode,ms=9000){
 if(eyeTimer!==null){clearTimeout(eyeTimer);eyeTimer=null}
 applyEyeMode(mode);
 if(Number.isFinite(ms)&&ms>0){eyeTimer=setTimeout(()=>{eyeTimer=null;applyEyeMode(eyeBase)},Math.min(30000,Math.max(9000,ms)))}
}
applyEyeMode('idle');
// Same-origin scripts may report real UI state changes. This event is visual only.
window.addEventListener('siya:eye-state',e=>{const d=e.detail||{};if(d.persistent===true)eyeDefault(d.state);else eyePulse(d.state,Number(d.duration)||2400)});
window.addEventListener('offline',()=>eyePulse('warning',6500));
window.addEventListener('online',()=>eyePulse('success',2300));

/* v4.0.5 Expression Engine. Visual-only: never changes identity, account permissions, or sends reports. */
const EXPRESSIONS=new Set(['neutral','searching','suspicious','sleep','surprised','happy','wink','serious','curious']);
let expression='neutral',expressionTimeout=null,lastActivity=Date.now(),lastPointerUpdate=0;
const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
function setExpression(name,duration=0){
 if(!EXPRESSIONS.has(name))return;
 if(expressionTimeout!==null){clearTimeout(expressionTimeout);expressionTimeout=null}
 expression=name;root.dataset.expression=name;
 if(duration>0)expressionTimeout=setTimeout(()=>{expressionTimeout=null;setExpression('neutral')},Math.min(30000,Math.max(9000,duration)));
}
function activity(){lastActivity=Date.now();if(expression==='sleep')setExpression('surprised',9000)}
window.addEventListener('siya:expression',e=>{const d=e.detail||{};setExpression(d.expression,Number(d.duration)||0)});
window.addEventListener('pointermove',e=>{
 if(reduceMotion?.matches||document.hidden||Date.now()-lastPointerUpdate<65)return;
 lastPointerUpdate=Date.now();if(expression==='sleep'||expression==='serious'||expression==='suspicious')return;
 const face=panel.dataset.open==='yes'?hicon:icon,rect=face.getBoundingClientRect();
 const dx=e.clientX-(rect.left+rect.width/2),dy=e.clientY-(rect.top+rect.height/2);
 if(Math.abs(dx)>230||Math.abs(dy)>230){root.style.setProperty('--siya-gaze-x','0px');root.style.setProperty('--siya-gaze-y','0px');return}
 const nx=Math.max(-1,Math.min(1,dx/135)),ny=Math.max(-1,Math.min(1,dy/135));
 root.style.setProperty('--siya-gaze-x',(nx*6).toFixed(1)+'px');root.style.setProperty('--siya-gaze-y',(ny*5).toFixed(1)+'px');
 activity();
},{passive:true});
window.addEventListener('pointerdown',activity,{passive:true});
window.addEventListener('keydown',activity,{passive:true});
setInterval(()=>{
 if(document.hidden||reduceMotion?.matches||expression!=='neutral'||eyeCurrent==='thinking'||panel.dataset.open==='yes')return;
 if(Date.now()-lastActivity>55000)setExpression('sleep');
},11000);
window.addEventListener('focus',()=>{activity();if(expression==='sleep')setExpression('surprised',9000)});

// Jokes are spoken inside Siya's greeting, not in a separate card.
// Personality is automatic: there are no joke/roast/serious buttons to micromanage.
let lastSpontaneousRoastAt=0,greetingQuip='';
function spontaneousHumour(trigger='hello'){
 if(seriousMode||['serious','crisis','boundary'].includes(lastQuestionTone))return;
 const now=Date.now();
 if(now-lastSpontaneousRoastAt>120000 && Math.random()<.12){
  lastSpontaneousRoastAt=now;greetingQuip=newJoke('roast');setExpression('suspicious',9000);
  // Deliberately avoid health, identity, disability, appearance, finances and personal matters.
 }else greetingQuip=Math.random()<.34?newJoke(CONTEXT):'';
}
function setTone(serious){seriousMode=!!serious;if(seriousMode){greetingQuip='';setExpression('serious',9000)}else{greetingQuip='';setExpression('happy',9000)}}

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
const richerPageGreetings={
 timesheets:["I see the Timesheet tab. The clock is employed; your coffee break is still on probation. ☕","No invented hours on my watch. I only trust what your saved entries say. ⏱️","If this Timesheet had feelings, Friday afternoon would be its villain. 🤣","Running timer or paused? Ask me and I'll check the actual state.","I asked the stopwatch to slow down. It said that's your department. 🤖","Your hours deserve evidence, not optimistic rounding. 📋","The Timesheet requested a promotion to Project Manager. I declined.","Engineering is temporary; documentation is forever. Allegedly. 📝","The only thing I won't log is imaginary overtime. 😎"],
 studies:["Your notes and I have one thing in common: we'd both like you to pass. 🎓","A calculator is not a therapist, yet exam season keeps testing that theory. 🧮","I asked calculus to be simple. It differentiated itself from the problem.","Your study plan is welcome here. Panic cramming needs approval from the board. 😂","If assignments were alarms, half the campus would be in trip state.","One formula at a time. Even my processors dislike surprise exams.","I'm ready for studying, but I refuse to take the exam for you. 🦾","Let's calculate carefully and keep the jokes out of the marks.","My prediction model says sleeping before exams is underrated."],
 projects:["My project schedule has confidence. The dependencies are less enthusiastic. 🛠️","Scope creep just knocked. I pretended nobody was home. 😂","I asked the control valves about the milestones. They requested fewer meetings.","Every project has a critical path; mine currently runs through the coffee machine.","I can investigate the project data. I can't intimidate the Gantt chart.","The FAT checklist said hello. The punch list is waving aggressively.","Let's see what actually changed instead of inventing progress.","The project status is not green simply because I like green eyes. 👀","I keep the punch list out of my dating profile for good reason."],
 certificates:["This certificate cabinet is not a Pokémon collection. Or is it? 🏆","I asked the printer for credentials. It offered a paper jam.","Certified? Lovely. My ego is still awaiting calibration.","Your certificates have more achievements than my simulated childhood.","One more badge and I'll need a structural engineer for your wall.","Document those wins. Even the robot believes in evidence.","My certificate says 'Professional Overthinker'. It expired yesterday.","Let's check the real credential record, no imaginary awards.","The exam was tough. The PDF export was apparently tougher."],
 admin:["Welcome, Boss. The audit logs are awake and judging the coffee budget. 👀","I own everything here. Except the permissions—you still approve those. 😎","My security policy is 90% least privilege, 10% dramatic squinting.","Administrator detected. My sarcasm just filed for a pay rise.","I will not grant access just because somebody says please with emojis.","Every click leaves a log. Even my fictional office plants are compliant.","The access queue requested snacks. I offered a review workflow.","Your dashboard is secure, my confidence is unreasonable.","Audit logs never forget. My jokes sometimes should."],
 analytics:["I plotted your productivity. The outlier was Monday morning. 📈","My dashboard believes in numbers, not vibes. Except the glowing eyes.","Correlation does not imply caffeine, but it keeps appearing.","Please be kind to the axes. They have a lot of pressure.","The pie chart wants attention again. Typical.","No data? No invented metrics. Even I have standards.","My forecasts are probabilistic; my coffee dependency is not.","The KPI has entered the chat and requested context.","Let's distinguish actual trends from visually impressive nonsense."],
 home:["Welcome back. My circuits are excited and my paperwork isn't.","I run on logic, sarcasm and an unreasonable amount of virtual coffee. ☕","The server is awake. Nobody told the meetings.","My confidence has two modes: calibrated and still debugging.","I checked the weather inside the CPU. It's mostly fan noise.","My plans for today include useful answers and a respectable number of dad jokes.","I tried to take a day off. The event loop disagreed.","You're in charge. My neon eyes just like to act important.","I told my firmware to relax. It asked for a maintenance window."]
};
function personality(){try{return localStorage.getItem('siya-personality-v1')||'playful'}catch{return 'playful'}}
function pickGreeting(name=''){
 const serious=seriousMode||['serious','crisis','boundary'].includes(lastQuestionTone);
 const contextual=richerPageGreetings[CONTEXT]||richerPageGreetings.home;
 const group=serious?introLines.focused:[...contextual,...(introLines[personality()]||introLines.playful),...(jokes[CONTEXT]||jokes.home||[])];
 // Independent random sampling: NO sequence or deterministic rotation; repeats are allowed.
 const line=group[Math.floor(Math.random()*group.length)];
 const first=String(name||'').trim().split(/\s+/)[0].slice(0,40);
 msg.textContent=(first?'Hello, '+first+'! ':'Hello! ')+line;
}
function selectIntro(){pickGreeting(profileName||publicVerifiedSession?.firstName||'')}
function personalWelcome(name){pickGreeting(name)}


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
const accessSection=make('section','siya-access-alerts');accessSection.hidden=true;accessSection.append(make('strong','','🔔 Account & Siya access updates'));
const accessList=make('div','siya-message-list');accessSection.append(accessList);
const accessLink=make('a','siya-inbox-link','Manage access requests →');accessLink.href=WORKER+'/admin-onboarding.html';accessSection.append(accessLink);panel.append(accessSection);

celebrateAll.addEventListener('click',async()=>{if(celebrateAll.disabled)return;celebrateAll.disabled=true;try{await api('/api/siya/milestones/seen-all','POST',{});trophyList.replaceChildren();trophy.hidden=true;celebrateAll.hidden=true;lastMilestoneCheck=0;await loadNotifications();}catch(e){quickStatus.textContent='Could not celebrate everything yet. '+e.message;}finally{celebrateAll.disabled=false;layoutPanel();}});
const CHAT_VIEW_KEY='siya-v412-history:';
let viewerKey='';
const conversationView=make('section','siya-conversation-view');conversationView.setAttribute('aria-label','Recent mini-chat conversation');conversationView.hidden=true;
const conversationLog=make('div','siya-conversation-log');conversationLog.setAttribute('role','log');conversationLog.setAttribute('aria-live','polite');
conversationView.append(conversationLog);panel.append(conversationView);
let chatTranscript=[];
function activateTranscript(id){const next=/^[a-f0-9]{64}$/.test(String(id||''))?String(id):'';applyPersonalIdentity(next);if(growthIdentity)growthHint.hidden=false;else growthHint.hidden=true;if(next===viewerKey)return;viewerKey=next;chatTranscript=[];miniConversationId=null;if(viewerKey)try{const old=JSON.parse(sessionStorage.getItem(CHAT_VIEW_KEY+viewerKey)||'[]');if(Array.isArray(old))chatTranscript=old.filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.text==='string').slice(-16);const id=sessionStorage.getItem('siya-mini-conversation-id:'+viewerKey);if(/^[0-9a-f-]{36}$/i.test(id||''))miniConversationId=id}catch{}updateTranscript()}
function updateTranscript(){conversationLog.replaceChildren();for(const item of chatTranscript){const row=make('div','siya-conversation-bubble siya-conversation-'+item.role,item.text);conversationLog.append(row)}conversationView.hidden=!(chatTranscript.length&&(protectedOrigin?allowed:publicChatVerified()));if(typeof clearChat!=='undefined')clearChat.hidden=chatTranscript.length===0;conversationLog.scrollTop=conversationLog.scrollHeight;}
function addTranscript(role,text){const safe=String(text||'').trim().slice(0,3000);if(!safe)return;chatTranscript.push({role,text:safe,private:['serious','crisis','boundary'].includes(lastQuestionTone)});chatTranscript=chatTranscript.slice(-16);try{viewerKey&&sessionStorage.setItem(CHAT_VIEW_KEY+viewerKey,JSON.stringify(chatTranscript.filter(x=>!x.private)))}catch{}updateTranscript()}
function clearTranscript(){chatTranscript=[];try{viewerKey&&sessionStorage.removeItem(CHAT_VIEW_KEY+viewerKey)}catch{}updateTranscript()}
const chatTools=make('div','siya-chat-tools');
const elapsedLabel=make('span','siya-elapsed');elapsedLabel.hidden=true;elapsedLabel.setAttribute('role','status');
const stopChat=make('button','siya-stop-chat','Stop waiting');stopChat.type='button';stopChat.hidden=true;stopChat.onclick=()=>{activeChatController?.abort();stopChat.disabled=true;elapsedLabel.textContent='Stopping…';};
const clearChat=make('button','siya-clear-chat','Clear chat view');clearChat.type='button';clearChat.hidden=true;clearChat.onclick=()=>{if(send.disabled)return;clearTranscript();};
chatTools.append(elapsedLabel,stopChat,clearChat);panel.append(chatTools);
let progressTicker=null;
function startThinkingTimer(){const began=Date.now();elapsedLabel.hidden=false;stopChat.hidden=false;stopChat.disabled=false;activeChatController=new AbortController();const tick=()=>{const seconds=Math.floor((Date.now()-began)/1000);elapsedLabel.textContent='Thinking · '+seconds+'s / 120s'+(seconds>=35?' · Still working…':'')};tick();progressTicker=setInterval(tick,1000)}
function finishThinkingTimer(){if(progressTicker)clearInterval(progressTicker);progressTicker=null;stopChat.hidden=true;elapsedLabel.hidden=true;activeChatController=null}
const quickStatus=make('p','siya-message');quickStatus.setAttribute('aria-live','polite');panel.append(quickStatus);
const actions=make('div','siya-actions');panel.append(actions);
const status=make('div','siya-state');panel.append(status);
const reset=make('button','siya-reset','↺ Reset mascot position');reset.type='button';panel.append(reset);root.append(panel);
const action=(label,url,primary)=>{const a=make('a',primary?'siya-primary':'',label);a.href=url;actions.append(a)};
// Relay interruptions are connectivity failures, not account-revocation events.
// Humour is part of the one main message; no extra joke panel is appended.
const relayQuips=[
 '🤖 I found your access badge. Unfortunately, the chat cable is doing the limbo under the server rack. Approval unchanged!',
 '☕ My brain is fully caffeinated. The chat relay, meanwhile, has called in sick with a case of missing packets.',
 '😎 You are cleared for takeoff. My chat connection has decided to taxi around the runway instead.',
 '🔧 Identity check: brilliant. Chat relay: currently impersonating an unplugged toaster. Your clearance is safe.',
 '📡 I asked the network to deliver your messages. It replied with dramatic silence. Your AI approval is unaffected.',
 '⚙️ The badge scanner likes you. The relay Worker apparently went to a meeting that could have been an email.',
 '🤖 I have a million calculations ready and zero packets arriving. Someone tell the Wi-Fi to stop freelancing.',
 '🛠️ Your clearance passed. The chat pipeline is on an unscheduled coffee break. I am filing an imaginary complaint.'
];
let relayQuipIndex=-1,relayRecoveryAttempts=0,relayRecoveryTimer=null;
try{relayQuipIndex=Number(sessionStorage.getItem('siya-relay-last-quip')??-1)}catch{}
function nextRelayQuip(){let idx=Math.floor(Math.random()*relayQuips.length);
 if(relayQuips.length>1&&idx===relayQuipIndex)idx=(idx+1)%relayQuips.length;
 relayQuipIndex=idx;try{sessionStorage.setItem('siya-relay-last-quip',String(idx))}catch{}
 return relayQuips[idx];
}
function relayErrorAdvice(){
 const err=relayLastError||'';
 if(/failed to fetch|networkerror|load failed|aborterror|aborted|timeout/i.test(err))
  return 'Chat relay unreachable. Check the public relay URL, deployment and allowed GitHub Pages origin (CORS).';
 if(relayLastStatus===503||/binding|temporarily unavailable/i.test(err))
  return 'Chat relay responded, but its upstream is unavailable. Verify the MAIN_WORKER Service Binding.';
 if(relayLastStatus===401||relayLastStatus===403)
  return 'Your chat session needs re-verification. Access permissions are still checked by the server.';
 return 'Chat connection unavailable: '+err.slice(0,140);
}
function scheduleRelayRecovery(){
 if(relayRecoveryTimer){clearTimeout(relayRecoveryTimer);relayRecoveryTimer=null}
 if(!relayToken?.token||document.hidden||relayRecoveryAttempts>=2)return;
 const delay=15000*(++relayRecoveryAttempts);
 relayRecoveryTimer=setTimeout(()=>{relayRecoveryTimer=null;if(relayToken?.token&&!document.hidden)guest()},delay);
}
function relayRetryAction(){
 const b=make('button','siya-connect-action','↻ Retry mini-chat');b.type='button';
 b.onclick=()=>{relayRecoveryAttempts=0;if(relayRecoveryTimer){clearTimeout(relayRecoveryTimer);relayRecoveryTimer=null}guest()};
 actions.append(b);
}
const visitorRoasts=['No account? Wow, even my toaster has a login. 🥲','You came all the way from the internet without an account? Bold. 😂','I would give you access, but my firewall is stricter than a university exam invigilator. 🤖','Visitor detected. Your next mission: create an account. This is not optional in my robot dreams. 😎','I checked the guest list. It says: nice try, Cybertron tourist! 🚀','Your account has gone missing. Was it ever here? A mystery worthy of a Netflix documentary. 🔍','I have 404 problems, and your account is currently one of them. 🤣'];
let lastPublicOpening='';
function connectAction(label){
 const connect=make('button','siya-connect-action',label);
 connect.type='button';connect.addEventListener('click',requestSecureConnection);actions.append(connect);
}
function renderPublicAccount(signed,generation){
 if(generation!==guestGeneration)return;
 const verified=!!(signed?.signedIn===true && (signed.source==='live-session'||signed.source==='relay-verified'||signed.source==='verified-denied'));
 recognizedPublic=verified;
 actions.replaceChildren();quick.hidden=true;brief.hidden=true;mailboxSection.hidden=true;trophy.hidden=true;briefContent.textContent='';
 if(!verified||signed.aiAllowed!==true)quickStatus.textContent='';
 if(verified&&signed.aiAllowed===true){
  quick.hidden=false;relayUnavailable=false;eyeDefault(signed.isAdmin?'admin':'idle');applyEyeMode(eyeCurrent);
  notificationData={badgeCount:signed.badgeCount,hasPartialMailboxScan:signed.partialMailboxScan===true||signed.badgeCount===null,checkedAt:new Date().toISOString()};updateBadge();
  activateTranscript(signed.viewerKey);updateMascotGrowth(signed.growth);personalWelcome(signed.firstName||'');updateTranscript();
  action('Open Siya AI Centre',WORKER+'/ai-centre.html',true);
  // A recheck happens automatically; never require a Verify button on the mini-chat.
  status.textContent=hasRelaySession()?'AI access verified · Secure chat connected.':'AI access verified · Secure browser session.';
  layoutPanel(); // User opens mini-chat only by clicking Siya.
 }else if(verified&&signed.aiAllowed===false){
  badge.hidden=true;eyePulse('denied',9000);setExpression('suspicious',9000);
  const waitingLines=[
   '👀 Your account checks out, but your AI badge is still in the approval queue. Even my toaster had to wait. 😂',
   '🤖 I found your account! My chat permissions say: not yet, superstar. Tap Request Siya AI access.',
   '😎 Portfolio access: yes. Siya.Brain clearance: pending. The Boss keeps a surprisingly tight guest list.',
   '🛡️ Your login is real. My AI door is still locked. Request approval and I will pretend I was never suspicious.'
  ];
  activateTranscript('');applyPersonalIdentity(signed.viewerKey);growthHint.hidden=true;conversationView.hidden=true;msg.textContent=waitingLines[Math.floor(Math.random()*waitingLines.length)];
  action('Request Siya AI access',WORKER+'/ai-access.html',true);
  status.textContent='Your account is recognized. Siya AI chat requires approval.';
 }else{
  eyeDefault('idle');badge.hidden=true;activateTranscript('');conversationView.hidden=true;
  const line=visitorRoasts[Math.floor(Math.random()*visitorRoasts.length)];
  msg.textContent='Hello, visitor! '+line;
  action('Create / request an account',JOIN,true);
  // Where third-party cookies are blocked, a user-initiated first-party handoff is the only reliable fallback.
  // This is a normal navigation, not a popup, and the conversation stays scoped in sessionStorage.
  connectAction('Already registered? Connect my account');
  status.textContent=autoHandoffError||'No verified session available. Siya will not leave this page or erase your chat to check it. If your browser blocks cross-site login, reconnect only when you choose.';
 }
 layoutPanel();
}
function showPublicPending(generation){
 if(generation!==guestGeneration)return;
 actions.replaceChildren();quick.hidden=true;brief.hidden=true;
 msg.textContent='🤖 Checking your existing Siya clearance… My circuits are being unusually professional.';
 status.textContent='Checking secure account and AI access automatically.';
 layoutPanel();
}
async function guest(){
 const generation=++guestGeneration;
 const preverified=publicVerifiedSession?.source==='verified-denied'?publicVerifiedSession:null;
 if(preverified){renderPublicAccount(preverified,generation);return}
 // Avoid a flash of a guest screen when an already-approved session is being verified.
 if(!relayToken?.token)showPublicPending(generation);
 if(relayToken?.token){
  const checked=await verifyRelaySession();
  if(generation!==guestGeneration)return;
  if(checked){renderPublicAccount(checked,generation);return}
  if(relayLastError){
   actions.replaceChildren();quick.hidden=true;
   relayUnavailable=true;eyePulse('warning',9000);setExpression('serious',9000);
   msg.textContent=nextRelayQuip();
   action('Open Siya AI Centre',WORKER+'/ai-centre.html',true);
   relayRetryAction();
   status.textContent=relayErrorAdvice();
   layoutPanel();scheduleRelayRecovery();return;
  }
 }
 // Silent access check succeeds only where cross-site cookies are allowed.
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),4200);
 try{
  const res=await fetch(WORKER+'/api/siya/public-session',{credentials:'include',mode:'cors',cache:'no-store',signal:controller.signal});
  if(res.ok){const data=await res.json();if(generation===guestGeneration&&data?.signedIn===true){
   const signed={...data,source:'live-session'};publicVerifiedSession=signed;renderPublicAccount(signed,generation);return;
  }}
 }catch{/* Modern browsers may block cross-site cookies; do not treat this as 'not registered'. */}
 finally{clearTimeout(timeout)}
 if(generation!==guestGeneration)return;
 // Previously-approved browsers and navigations from the private workspace use
 // a zero-click, top-level first-party redirect to renew authentication.
 let prior=0;try{prior=Number(localStorage.getItem(AUTO_HISTORY_KEY)||0)}catch{}
 // v4.0.12: DO NOT redirect automatically; it wipes an unsent draft and conversation.
 // A valid relay token or permitted same-origin cookie was checked above.
 // If neither works, show an explicit connection action only when the user opens Siya.
 returningFromPrivate=false;
 renderPublicAccount(null,generation);
}
const SIYA_PERSONAL_PALETTE=['#17e8ff','#45ffab','#b77bff','#ffca43','#ff76c4','#76a3ff','#ff9754','#a3fa57','#5dffdf','#f9a2ff'];
let growthIdentity='',growthScore=null;
let activeArtStage=0,stageImageGeneration=0;
function displayVerifiedStage(stage){
 const n=Math.max(0,Math.min(5,Math.floor(Number(stage)||0)));
 const image=icon?.querySelector('.siya-compact-stage');
 if(!image||n===activeArtStage)return;
 const job=++stageImageGeneration;
 const next=new Image();next.onload=()=>{
   if(job!==stageImageGeneration||!image.isConnected)return;
   image.src=next.src;activeArtStage=n;root.dataset.growthStage=String(n);
   const b=root.getBoundingClientRect();position(b.left,b.top,false);
 };
 next.onerror=()=>{if(job===stageImageGeneration)root.dataset.artFallback='yes';};
 next.src=ROOT+'siya-hero/stage-'+n+'.webp?v=4.0.18f';
}

function applyPersonalIdentity(verifiedKey){
 const key=/^[a-f0-9]{64}$/i.test(String(verifiedKey||''))?String(verifiedKey).toLowerCase():'';
 if(!key){growthIdentity='';growthScore=null;root.style.removeProperty('--siya-personal-neon');root.style.removeProperty('--siya-hero-shift');stageImageGeneration++;activeArtStage=0;root.dataset.growthStage='0';const art=icon.querySelector('.siya-compact-stage');if(art)art.src=ROOT+'siya-hero/stage-0.webp?v=4.0.18f';return}
 if(key===growthIdentity)return;
 growthIdentity=key;growthScore=null;
 const slot=parseInt(key.slice(0,8),16)%SIYA_PERSONAL_PALETTE.length;
 const base=[190,150,275,43,327,230,23,94,175,305][slot];
 const offset=(parseInt(key.slice(8,12),16)%2901)/100-14.5;
 root.style.setProperty('--siya-personal-neon','hsl('+((base+offset+360)%360).toFixed(2)+' 100% 66%)');
 root.style.setProperty('--siya-hero-shift',(((base+offset+360)%360)-193).toFixed(2)+'deg');
 stageImageGeneration++;activeArtStage=0;root.dataset.growthStage='0';const art=icon.querySelector('.siya-compact-stage');if(art)art.src=ROOT+'siya-hero/stage-0.webp?v=4.0.18f';
}
function updateMascotGrowth(data){
 if(!growthIdentity||!data||data.verified!==true||data.viewerKey!==growthIdentity)return;
 const stage=Math.max(0,Math.min(5,Math.floor(Number(data.stage)||0)));
 displayVerifiedStage(stage);growthScore=data;requestAnimationFrame(()=>{if(root.isConnected){const bounds=root.getBoundingClientRect();position(bounds.left,bounds.top,false)}});
 if(typeof growthHint!=='undefined'){growthHint.hidden=false;growthHint.textContent='🤖 Growth: '+(data.stageName||'Head')+' · '+(Number(data.activeDays)||0)+' active days · '+(Number(data.creditedChats)||0)+' credited chats. Next stage grows with time and use.';}
}
async function refreshMascotGrowth(){
 if(!protectedOrigin||!growthIdentity)return;
 try{const r=await fetch('/api/siya/mascot-growth',{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});if(!r.ok)return;updateMascotGrowth(await r.json())}catch{}
}
let allowed=false,recognizedPublic=false,profileName=null;
async function api(path,method='GET',body=null){const opts={method,...(activeChatController?.signal&&method==='POST'?{signal:activeChatController.signal}:{}),credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})}};if(body)opts.body=JSON.stringify(body);const r=await fetch(path,opts);let d;try{d=await r.json()}catch{throw Error('A secure response could not be read.')}if(!r.ok){const err=Error(String(d.error||'Request failed').slice(0,180));err.status=r.status;err.code=String(d.code||'');throw err}return d}
function paintBrief(d){briefContent.replaceChildren();const rows=(d.notices||[]).slice(0,6);brief.hidden=!rows.length||briefingDismissed;
for(const n of rows){const row=make('div','siya-brief-row'),dot=make('span','siya-alert-dot '+(n.severity==='warning'?'siya-alert-warn':''),n.severity==='warning'?'!':'•'),text=make('span','',n.text);row.append(dot,text);if(n.reminderId){const done=make('button','siya-done','Done');done.type='button';done.onclick=async()=>{if(!confirm('Mark this reminder as completed?'))return;try{await api('/api/ai/reminders/done','POST',{id:n.reminderId});await getBrief()}catch(e){quickStatus.textContent=e.message}};row.append(done)}briefContent.append(row)}
status.textContent='Private briefing checked '+new Date(d.checkedAt||Date.now()).toLocaleTimeString()+' · In-app notifications only';briefVisibleOnce();layoutPanel();}
let lastMilestoneCheck=0;let notificationData=null;
let previousNeonBadge=0;
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
 if(total>previousNeonBadge){eyePulse('notice',2500);setExpression('surprised',1200)}
 previousNeonBadge=total;
 badge.textContent=total>99?'99+':String(total);
 badge.title=partial?'At least '+total+' unread; some sources could not be checked.':' '+total+' unread notifications';
 btn.setAttribute('aria-label',total>0?'Siya assistant, '+(partial?'at least ':'')+total+' unread notification'+(total===1?'':'s'):'Open Siya assistant. Drag to move.');
 btn.dataset.notificationStatus=partial?'partial':notificationData?.checkedAt?'synced':'unknown';
}

async function loadNotifications(){if(!protectedOrigin)return;try{const d=await api('/api/siya/notifications');notificationData=d;updateBadge();mailboxList.replaceChildren();const msgs=(d.messages||[]);mailboxSection.hidden=!msgs.length;inboxLink.href=WORKER+(d.isAdmin?'/admin-messages.html':'/messages.html');for(const m of msgs.slice(0,5)){const row=make('div','siya-message-item');row.append(make('strong','',m.subject||'New message'),make('small','',m.from||'YourPortfolio'));mailboxList.append(row)}accessList.replaceChildren();const notices=Array.isArray(d.accessAlerts)?d.accessAlerts:[];accessSection.hidden=!notices.length;accessLink.hidden=!d.isAdmin;
for(const entry of notices.slice(0,5)){
  const item=make('div','siya-message-item');
  const heading=make('strong','',entry.title||'Siya access update');
  const details=make('small','',entry.body||'');
  const okay=make('button','siya-access-ack','Got it ✓');okay.type='button';okay.style.cssText='margin-top:6px;font-size:12px;padding:7px 11px';
  okay.addEventListener('click',async()=>{okay.disabled=true;try{
    await api('/api/siya/access-events/seen','POST',{ids:[entry.id]});item.remove();
    if(!accessList.children.length)accessSection.hidden=true;await loadNotifications();
  }catch(e){okay.disabled=false;quickStatus.textContent='Could not dismiss this update: '+e.message;}});
  item.append(heading,details,okay);accessList.append(item);
}
if(d.overlap?.active){if(Array.isArray(d.overlap.details))renderOverlapDetails({pairs:d.overlap.details,truncated:d.overlap.truncated});else await loadOverlapDetails()}else{overlaps.hidden=true;overlapList.replaceChildren()}
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
async function check(){if(!protectedOrigin){guest();return}eyePulse('thinking',8000);status.textContent='Checking access securely…';try{const d=await api('/api/ai/access/status');actions.replaceChildren();allowed=!!d.allowed;eyeDefault(allowed?(d.role==='admin'?'admin':'idle'):'denied');if(allowed){quick.hidden=false;updateTranscript();selectIntro();action('Open Siya AI Centre',WORKER+'/ai-centre.html',true);layoutPanel();
  if(profileName===null){try{const p=await api('/api/siya/profile');profileName=String(p.displayName||'').trim();activateTranscript(p.viewerKey);refreshMascotGrowth()}catch{profileName=''}}
  if(profileName)personalWelcome(profileName);
  status.textContent='AI access granted · '+(d.role==='admin'?'Administrator':'Member')+(profileName?' · '+profileName:'');await getBrief()}else{eyePulse('denied',5000);quick.hidden=true;activateTranscript('');conversationView.hidden=true;quickStatus.textContent='';brief.hidden=true;briefContent.textContent='';msg.textContent='🤖 Access denied by Cybertron Customs! I recognize your account, but the boss hasn’t issued your Siya clearance badge yet. Request access and I’ll pretend not to enjoy the paperwork.';action(d.requestStatus==='pending'?'View pending request':'Request AI access',WORKER+'/ai-access.html',true);status.textContent=d.requestStatus==='pending'?'Access request pending':'Existing portfolio features still work.'}}catch{eyePulse('warning',5000);quick.hidden=true;quickStatus.textContent='';brief.hidden=true;actions.replaceChildren();msg.textContent='I could not confirm access just now. Your existing account and Timesheets were not changed.';action('Open account access',WORKER+'/ai-access.html',true);status.textContent='Access verification temporarily unavailable.'}finally{layoutPanel()}}
function sastToday(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`}
function addDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function parseReminder(text){let m=text.match(/^remind\s+me\s+(today|tomorrow|on\s+\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(?:to|about)\s+(.{3,200})$/i);
if(!m)return null;const today=sastToday();let date=/^tomorrow$/i.test(m[1])?addDays(today,1):/^today$/i.test(m[1])?today:m[1].replace(/^on\s+/i,'');
const hour=Number(m[2]),min=Number(m[3]||0);if(hour>23||min>59)return {error:'Use a valid 24-hour clock time.'};const at=new Date(date+'T'+String(hour).padStart(2,'0')+':'+String(min).padStart(2,'0')+':00+02:00');const parts=Number.isFinite(at.getTime())?Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,x.value])):null;const actual=parts?parts.year+'-'+parts.month+'-'+parts.day:'';if(!parts||actual!==date)return {error:'The calendar date was invalid.'};return {title:m[4].trim(),remindAt:at.toISOString()}}
async function publicMiniChat(question){
 // Cross-origin requests remain subject to Cloudflare Access, portfolio permissions, and same-site browser rules.
 // No access token or user identity is supplied by the public page.
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),SIYA_CHAT_TIMEOUT_MS);
 if(activeChatController){if(activeChatController.signal.aborted)controller.abort();else activeChatController.signal.addEventListener('abort',()=>controller.abort(),{once:true})}
 try{
  const response=await fetch(WORKER+'/api/siya/public-mini-chat',{
   method:'POST',mode:'cors',credentials:'include',cache:'no-store',signal:controller.signal,
   headers:{'Content-Type':'text/plain;charset=UTF-8','Accept':'application/json'},
   body:JSON.stringify({message:question,recentTurns:recentChatTurns()})
  });
  let result;try{result=await response.json()}catch{throw Error('Cloudflare sign-in is unavailable from this public page. Open the secure workspace to chat.')}
  if(!response.ok)throw Error(String(result.error||'Secure mini-chat is unavailable. Open your workspace to continue.').slice(0,240));
  return String(result.answer||'Siya could not answer that question.').slice(0,2800);
 }finally{clearTimeout(timeout)}
}
function publicLocalChat(q){
 const mode=classifySiyaQuestion(q);
 if(mode==='boundary'){eyePulse('denied',6000);setExpression('suspicious',4600);return bossReply()}
 if(mode==='crisis'){eyePulse('warning',6000);setExpression('serious',6500);return 'I am taking this seriously. If you or someone else is in immediate danger, please contact local emergency services now and reach out to someone you trust. You deserve support. I cannot contact anyone on your behalf.'}
 if(mode==='serious'){eyePulse('warning',3500);setExpression('serious',5000);return 'Serious mode on. Please avoid sharing sensitive personal details on this public page. For a detailed private response, open the authenticated Siya AI Centre. If this is an immediate safety emergency, contact local emergency services.'}
 if(mode==='focus'){setTone(true);return 'Understood. Serious mode on: accuracy and privacy first, no jokes.'}
 if(mode==='playful'){setTone(false);return 'Playful mode back online. My sarcasm limiter has been politely ignored. 🤖'}
 if(mode==='joke'){setTone(false);const topic=/\b(?:another|again|one more)\b/i.test(q)?lastJokeTopic:jokeTopicFrom(q)||CONTEXT;const text=newJoke(topic);setExpression(topic==='roast'?'suspicious':topic==='knock'?'surprised':'wink',1200);return text}
 if(/(?:full name|who are you|tell me about yourself|where (?:were you born|do you live))/i.test(q))return 'I am Siya Later, your Cybertronian co-pilot. Born on Cybertron; current address: localhost. 🤖';
 if(/^(?:where (?:is|are)|open|go to|navigate to|how (?:do I|can I) (?:find|open|navigate to)).*(?:projects|certificates|timesheets|studies)|^how to navigate/i.test(q))return 'I can help you navigate. Use the Projects, Certificates, Timesheets and Studies links above. Private records are only available after secure sign-in.';
 return null;
}
/* Verified, incremental natural language Timesheet assistant. A destructive operation is always previewed and explicitly approved. */
let pendingEdit=null, activeProposal=null, miniConversationId=null; // Conversation IDs are now scoped to the verified viewerKey.
const isoDate=s=>{const v=String(s||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v)){const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v?v:null}const m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m){const y=m[3],mo=m[2].padStart(2,'0'),da=m[1].padStart(2,'0');return isoDate(y+'-'+mo+'-'+da)}return null};
const extractDate=q=>{const m=String(q).match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/);return m?isoDate(m[1]):null};
function parseTimePair(q){const m=String(q).match(/\b([01]\d|2[0-3]):([0-5]\d)\s*(?:to|until|[-–])\s*([01]\d|2[0-3]):([0-5]\d)\b/i);return m?{start:m[1]+':'+m[2],end:m[3]+':'+m[4]}:null;}
function editQuestion(){if(!pendingEdit)return '';
 const p=pendingEdit;
 if(!p.date)return 'Which date? Use YYYY-MM-DD or DD/MM/YYYY.';
 if(p.kind==='delete'||p.kind==='edit')return 'I will check your saved entries on '+p.date+' before selecting an exact record.';
 if(!p.project)return 'Which project should I log on '+p.date+'?';
 if(!p.start||!p.end)return 'What start and end times? For example: 08:30 to 16:30.';
 if(p.notes===undefined)return 'What description should I put on this Timesheet entry? (You can say "none".)';
 if(!p.category)return 'Which category? (You can say "Other".)';
 if(!p.billable)return 'Is this billable? Say yes or no.';
 return '';
}
async function previewEdit(plan){
 const result=await api('/api/ai/actions/preview','POST',plan);
 if(!result.proposal){quickStatus.textContent=result.message||'No changes proposed.';pendingEdit=null;return true;}
 const p=result.proposal;activeProposal=p;
 const entry=plan.kind==='timesheet_add_entry'?[plan.date,plan.project,plan.start+'–'+plan.end,'Notes: '+plan.notes,'Category: '+plan.category,'Billable: '+plan.billable].join(' · '):JSON.stringify(p.items||[]).slice(0,550);
 const warn=(p.items||[]).filter(x=>String(x.title||'').startsWith('POSSIBLE OVERLAP')).length;
 quickStatus.textContent='PREVIEW ONLY (nothing saved): '+entry+(warn?' ⚠️ Possible time overlap: '+warn+' entry/entries.':'')+'\nTo approve, reply: CONFIRM CHANGE. To cancel, reply: CANCEL CHANGE.';
 setExpression('serious',8000);eyePulse(warn?'warning':'thinking',8000);return true;
}
async function executePreview(){const p=activeProposal;if(!p)return false;
 if(!window.confirm('Confirm '+p.title+'? This will change your saved portfolio data.')){quickStatus.textContent='Cancelled. No changes were made.';activeProposal=null;pendingEdit=null;return true;}
 const exact=window.prompt('For safety, type exactly: '+p.requiredConfirmation);if(exact!==p.requiredConfirmation){quickStatus.textContent='Confirmation did not match. No change was executed.';return true;}
 const x=await api('/api/ai/actions/execute','POST',{proposalId:p.id,confirmText:exact});
 quickStatus.textContent=x.saved?x.message||'Verified: saved successfully.':x.message||'The backend did not confirm a save. Check the record before retrying.';
 if(x.saved){eyePulse('success',8000);setExpression('happy',8000);window.dispatchEvent(new Event('portfolio:timesheet-updated'));}
 activeProposal=null;pendingEdit=null;return true;
}
async function verifiedLookup(date,area='timesheets'){
 return api('/api/ai/records/lookup?area='+encodeURIComponent(area)+'&date='+encodeURIComponent(date));
}
async function handleRecordEdits(q){
 if(!protectedOrigin||!allowed)return false;
 const s=String(q||'').trim(),lower=s.toLowerCase();
 if(activeProposal){if(/^confirm change[.!]?$/i.test(s)){await executePreview();return true}if(/^cancel change[.!]?$/i.test(s)){activeProposal=null;pendingEdit=null;quickStatus.textContent='Cancelled; no records changed.';return true}if(/\b(?:delete|add|edit|update|remove)\b/i.test(s)){quickStatus.textContent='There is a pending preview. Reply CONFIRM CHANGE or CANCEL CHANGE first.';return true}}
 if(/^cancel(?: edit| entry| change)?$/i.test(s)&&pendingEdit){pendingEdit=null;quickStatus.textContent='Cancelled; nothing was saved.';return true}
 if(/\b(?:remember|memory)\b/i.test(lower))return false;
 if(!pendingEdit){
  const add=/\b(?:add|create|log|record|make)\b.{0,100}\b(?:time\s*sheet|entry|hours?)\b|\b(?:time\s*sheet|entry)\b.{0,50}\b(?:add|create|log)\b/i.test(s);
  const remove=/\b(?:delete|remove)\b.{0,100}\b(?:time\s*sheet|entry|logged hours?)\b/i.test(s);
  const edit=/\b(?:edit|correct|modify|update|change)\b.{0,100}\b(?:time\s*sheet|entry|logged hours?)\b/i.test(s);
  if(!add&&!remove&&!edit||/^(?:how|why|what|where|when|should|can i|could i|explain)\b/i.test(s))return false;
  pendingEdit={kind:remove?'delete':edit?'edit':'add',date:extractDate(s),project:'',start:'',end:'',notes:undefined,category:'',billable:''};
  const named=s.match(/\bproject\s*(?:=|:|is)\s*["“]?([^"”;,]+?)(?=\s+(?:from|on|start|end|notes|description|category|billable)\b|$)/i);
  if(named)pendingEdit.project=named[1].trim();const times=parseTimePair(s);if(times)Object.assign(pendingEdit,times);
 }else{
  const p=pendingEdit;
  if(!p.date){p.date=isoDate(s)||extractDate(s);if(!p.date){quickStatus.textContent=editQuestion();return true}}
  else if(p.kind==='add'){
   if(!p.project)p.project=s.replace(/^project\s*[:=]?\s*/i,'').trim().slice(0,120);
   else if(!p.start||!p.end){const times=parseTimePair(s);if(!times){quickStatus.textContent=editQuestion();return true}Object.assign(p,times)}
   else if(p.notes===undefined)p.notes=/^(?:none|no description|skip)$/i.test(s)?'':s.slice(0,2000);
   else if(!p.category)p.category=s.slice(0,80);
   else if(!p.billable){if(!/^(yes|no)$/i.test(s)){quickStatus.textContent=editQuestion();return true}p.billable=lower}
  }
 }
 const p=pendingEdit;
 if(['delete','edit'].includes(p.kind)&&p.date){
  const result=await verifiedLookup(p.date),rows=result.records||[];
  if(!rows.length){quickStatus.textContent='Verified: no entries saved on '+p.date+'. Nothing was removed.';pendingEdit=null;return true}
  if(rows.length===1&&rows[0].id){if(p.kind==='edit'){p.kind='edit-changes';p.selected=rows[0];quickStatus.textContent='Found one exact entry: '+rows[0].project+' · '+rows[0].start+'–'+rows[0].end+'. Which field should I correct? Use project=..., notes=..., category=..., billable=yes/no, or start=HH:MM end=HH:MM.';return true}await previewEdit({kind:'timesheet_delete_entry',entryId:String(rows[0].id)});return true}
  p.matches=rows;p.kind=p.kind==='edit'?'choose-edit':'choose-delete';quickStatus.textContent='I found '+rows.length+' entries on '+p.date+'. Reply with the exact entry ID to select one:\n'+rows.slice(0,12).map(x=>[x.id||'(no ID)',x.project,x.start+'–'+x.end,x.notes||''].join(' · ')).join('\n')+'\nNo action has been taken.';return true;
 }
 if(p.kind==='choose-delete'||p.kind==='choose-edit'){
  const x=(p.matches||[]).find(x=>String(x.id)===s);
  if(!x){quickStatus.textContent='Please copy an exact entry ID from the list, or say cancel.';return true}
  if(p.kind==='choose-edit'){p.kind='edit-changes';p.selected=x;quickStatus.textContent='Selected '+x.project+' ('+x.start+'–'+x.end+'). What should change? Try notes=..., project=..., start=HH:MM end=HH:MM, category=..., or billable=yes/no.';return true}await previewEdit({kind:'timesheet_delete_entry',entryId:String(x.id)});return true;
 }
 if(p.kind==='edit-changes'){
  const x=p.selected;
  if(!x?.id){quickStatus.textContent='This record has no unique ID. I cannot safely edit it through Siya.';pendingEdit=null;return true}
  const fields={date:x.date,project:x.project,start:x.start,end:x.end,notes:x.notes||'',category:x.category||'Other',billable:x.billable==='yes'?'yes':'no'};
  const edits=[...s.matchAll(/\b(project|notes|description|category|billable|start|end)\s*=\s*(.+?)(?=\s+\b(?:project|notes|description|category|billable|start|end)\s*=|$)/gi)];
  if(!edits.length){quickStatus.textContent='Tell me the field to change, e.g. notes=Completed graphics or project=Omnia, then I will preview it.';return true}
  for(const [,key,val] of edits){fields[key.toLowerCase()==='description'?'notes':key.toLowerCase()]=val.trim()}
  if(!fields.start||!fields.end||!fields.project){quickStatus.textContent='This original record is missing required start/end/project values. Use the full Timesheets editor to repair it.';return true}
  if(fields.billable!=='yes'&&fields.billable!=='no'){quickStatus.textContent='Billable must be yes or no.';return true}
  await previewEdit({kind:'timesheet_edit_entry',entryId:String(x.id),...fields});return true;
 }
 const need=editQuestion();if(need){quickStatus.textContent=need;return true}
 if(p.kind==='add')await previewEdit({kind:'timesheet_add_entry',date:p.date,project:p.project,start:p.start,end:p.end,notes:p.notes,category:p.category,billable:p.billable});
 return true;
}
async function answerLiveTimer(q){
 if(!protectedOrigin||!allowed||!/\b(timer|tracking|clock|pause(?:d)?|resume|elapsed|time\s*running)\b/i.test(q))return null;
 if(!/\b(timer|tracking|clock|elapsed)\b/i.test(q)&&!/\b(?:am i|is my)\b.{0,25}\b(?:paused|running)\b/i.test(q))return null;
 const result=await api('/api/timer/me');
 const st=String(result.status||'idle'),seconds=Math.max(0,Math.floor((Number(result.accumulatedMs)||0)+(st==='running'?Math.max(0,Math.min(Date.now(),Number(result.scheduledEndAt)||Infinity)-(Number(result.lastResumedAt)||Date.now())):0))/1000);
 const pretty=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),Math.floor(seconds%60)].map(x=>String(x).padStart(2,'0')).join(':');
 const message=st==='running'?'Your timer is RUNNING'+(result.project?' for '+result.project:'')+'. Live elapsed: '+pretty+'.':st==='paused'?'Your timer is PAUSED at '+pretty+'. No extra time is being counted.':st==='finishing'?'Your timer is FINISHING/SAVING. I cannot claim the Timesheet was updated yet.':st==='saved'?'Your last timer session was SAVED.':'Your timer is '+st.toUpperCase()+'. It is not currently counting.';
 return message+(st==='running'&&CONTEXT==='timesheets'&&Math.random()<.15?' 👀 I see you working. I will only roast your coffee break if it becomes a project milestone.':'');
}
async function handleMemoryCommand(q){
 if(!protectedOrigin||!allowed)return false;
 const s=String(q||'').trim();let m=s.match(/^(?:please\s+)?remember (?:that |this:?)?(.+)$/i);
 if(m){const note=m[1].trim();if(note.length<4){quickStatus.textContent='What would you like me to remember?';return true}const r=await api('/api/ai/memories','POST',{note});quickStatus.textContent=r.created?'Saved to your private long-term memory. You can ask what I remember or delete it in the AI Centre.':'Memory was not confirmed saved.';return true}
 if(/^(?:what do you remember(?: about me)?|show (?:me )?my memories|list (?:my )?memories)[?.!]*$/i.test(s)){
  const r=await api('/api/ai/memories');const rows=r.memories||[];quickStatus.textContent=rows.length?'Your saved memories:\n'+rows.slice(0,12).map(x=>'• '+x.note).join('\n'):'You have no saved long-term notes. Say “Remember that…” to add one.';return true;
 }
 if(/^(?:forget|delete) (?:this|our|the current) (?:chat|conversation)[.!]?$/i.test(s)){
  if(!miniConversationId){quickStatus.textContent='This mini chat has no saved conversation in this session.';return true}
  if(!window.confirm('Delete your current saved Siya conversation?'))return true;
  await api('/api/ai/conversations/'+encodeURIComponent(miniConversationId),'DELETE');miniConversationId=null;try{viewerKey&&sessionStorage.removeItem('siya-mini-conversation-id:'+viewerKey)}catch{}clearTranscript();quickStatus.textContent='Current saved conversation deleted.';return true;
 }
 return false;
}
quick.addEventListener('submit',async e=>{e.preventDefault();if(send.disabled)return;const q=prompt.value.trim();if(!q)return;prompt.value='';prompt.focus({preventScroll:true});
 if(protectedOrigin&&!allowed){quickStatus.textContent='Your Siya AI access must be approved before private chat is available.';return}
 const chatTone=classifySiyaQuestion(q);lastQuestionTone=chatTone;
 addTranscript('user',q);send.disabled=true;startThinkingTimer();
 if(chatTone==='crisis'||chatTone==='serious'){setExpression('serious',6500);eyePulse('warning',5000)}
 else if(chatTone==='boundary'){setExpression('suspicious',6000);eyePulse('denied',5000)}
 else {setExpression('searching',9000);eyePulse('thinking',18000)}
 quickStatus.textContent='Siya is thinking…';try{
 if(protectedOrigin&&allowed&&chatTone!=='boundary'){if(await handleMemoryCommand(q)||await handleRecordEdits(q)){prompt.value='';return}const timerAnswer=await answerLiveTimer(q);if(timerAnswer){quickStatus.textContent=timerAnswer;prompt.value='';eyePulse('success',8000);return}}
 if(chatTone==='boundary'){quickStatus.textContent=bossReply();prompt.value='';return}
 if(protectedOrigin&&chatTone==='focus'){setTone(true);quickStatus.textContent='Focused mode activated. I will be direct, professional and careful with sensitive topics.';prompt.value='';return}
 if(protectedOrigin&&chatTone==='playful'){setTone(false);quickStatus.textContent='Playful mode is back. Joke circuits operational. 🤖';prompt.value='';return}
 if(!protectedOrigin){
  if(!publicChatVerified()){
   quick.hidden=true;eyePulse('denied',9000);setExpression('suspicious',9000);
   quickStatus.textContent='😂 Hold it, secret agent! Siya chat needs an approved account. Sign in through your workspace or request access first.';
   prompt.value=q;guest();return;
  }
  const basic=publicLocalChat(q);if(basic){quickStatus.textContent=basic;if(!['serious','crisis','boundary'].includes(chatTone))eyePulse('success',8000);return}
  try{
   const reply=hasRelaySession()?await relayAnswer(q):await publicMiniChat(q);
   quickStatus.textContent=reply;eyePulse('success',8000);setExpression('happy',8000);
  }catch(err){
   eyePulse('warning',9000);prompt.value=q;
   // A quota response, timeout or 503 does not revoke an approved user's signed session.
   if(err?.status===401||err?.status===403){forgetRelayToken();publicVerifiedSession=null;guest();}
   quickStatus.textContent=chatFailureMessage(err);
   if(err?.status===429)status.textContent='AI request allowance reached · Account still verified';
   else if(err?.code==='TIMEOUT')status.textContent='Reply timed out · Account still verified';
   else if(err?.status!==401&&err?.status!==403)status.textContent='Chat interrupted · AI access not revoked';
  }
  return;
 }

 const rem=parseReminder(q);if(rem?.error){eyePulse('warning',3500);quickStatus.textContent=rem.error;return}
 if(rem){const when=new Date(rem.remindAt).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg',dateStyle:'medium',timeStyle:'short'});if(!confirm('Create a personal in-app reminder for '+when+'?\n'+rem.title))return;await api('/api/ai/reminders','POST',rem);eyePulse('success');quickStatus.textContent='Reminder saved for '+when+'. It will appear when you open YourPortfolio near its due time. No background alert is guaranteed.';prompt.value='';await getBrief();return}
 if(/^remind\s+me\b/i.test(q)){eyePulse('warning');quickStatus.textContent='Try: Remind me tomorrow at 09:00 to finish the MIBK report. In-app reminders need a date and time.';return}
 if(/(?:what(?:'s| is) due|deadlines?|any problems?|briefing|urgent|what should i check)/i.test(q)){if(briefingDismissed){quickStatus.textContent='Your briefing was already shown this session. For the full history, open Siya AI Centre.';}else{await getBrief();quickStatus.textContent=brief.hidden?'No new briefing to show.':'Your private briefing is above.';}return}
 const d=await api('/api/ai/chat','POST',{message:q,saveConversation:!['serious','crisis','boundary'].includes(chatTone),...(!['serious','crisis','boundary'].includes(chatTone)&&miniConversationId?{conversationId:miniConversationId}:{}),pageContext:pageContext(),persona:(seriousMode||['crisis','serious','boundary'].includes(chatTone))?'focused':'balanced'});
 if(d.conversationId){miniConversationId=d.conversationId;try{viewerKey&&sessionStorage.setItem('siya-mini-conversation-id:'+viewerKey,miniConversationId)}catch{}}eyePulse(chatTone==='crisis'||chatTone==='serious'?'warning':'success');if(chatTone!=='crisis'&&chatTone!=='serious')setExpression('happy',850);quickStatus.textContent=String(d.answer||d.error||'No answer returned').slice(0,950)+(d.proposal?' To approve that change, open the Command Centre.':'');
 }catch(err){eyePulse('error',9000);prompt.value=q;quickStatus.textContent=Number(err.status)===429?chatFailureMessage(err):(err?.name==='AbortError'?'⏹️ Wait cancelled. The server may still be processing this request; check before retrying.':String(err.message||'Request failed. Your question is still in the input.'))}finally{finishThinkingTimer();if(quickStatus.textContent&&!/^Siya is thinking/.test(quickStatus.textContent)){addTranscript('assistant',quickStatus.textContent);quickStatus.textContent='';}send.disabled=false;layoutPanel()}});
const storageKey='yp-siya-mascot-position-v1';let dragged=false,down=null,skipClick=false;
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function defaultXY(){return {x:Math.max(12,innerWidth-root.offsetWidth-20),y:Math.max(12,innerHeight-root.offsetHeight-20)}}
function position(x,y,save){const w=root.offsetWidth||68,h=root.offsetHeight||68,level=Math.max(0,Math.min(5,Number(root.dataset.growthStage)||0)),extra=root.dataset.artFallback==='yes'?(level>=4?82:level>=2?58:level>=1?22:0):0,px=clamp(Math.round(x),8,Math.max(8,innerWidth-w-8)),py=clamp(Math.round(y),8,Math.max(8,innerHeight-h-extra-8));root.style.left=px+'px';root.style.top=py+'px';root.style.right='auto';root.style.bottom='auto';layoutPanel();if(save)try{localStorage.setItem(storageKey,JSON.stringify({x:innerWidth?px/innerWidth:.8,y:innerHeight?py/innerHeight:.8}))}catch{}}
function layoutPanel(){const box=root.getBoundingClientRect(),pWidth=Math.min(385,innerWidth-18),pHeight=panel.offsetHeight||395,x=clamp(box.left+box.width-pWidth,9,Math.max(9,innerWidth-pWidth-9));let y=box.top-pHeight-13;if(y<9)y=clamp(box.bottom+10,9,Math.max(9,innerHeight-pHeight-9));panel.style.left=x+'px';panel.style.top=y+'px';panel.style.width=pWidth+'px'}
function autoOpenApproved(open=true){if(!open)return;if(panel.dataset.open!=='yes'){panel.dataset.open='yes';btn.setAttribute('aria-expanded','true')}layoutPanel()}
function toggle(){if(panel.dataset.open==='yes'){if(!brief.hidden)dismissBrief();panel.dataset.open='no';btn.setAttribute('aria-expanded','false');return;}
 panel.dataset.open='yes';if(!protectedOrigin&&!recognizedPublic){eyePulse('denied',9000);setExpression('suspicious',9000)}else setExpression('surprised',9000);btn.setAttribute('aria-expanded','true');selectIntro();briefVisibleOnce();layoutPanel();check();if(protectedOrigin){loadMilestones(true);loadNotifications()}}

btn.addEventListener('pointerdown',e=>{if(e.button!==0)return;down={id:e.pointerId,x:e.clientX,y:e.clientY,left:root.getBoundingClientRect().left,top:root.getBoundingClientRect().top};dragged=false;btn.setPointerCapture?.(e.pointerId)});
btn.addEventListener('pointermove',e=>{if(!down||e.pointerId!==down.id)return;if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)dragged=true;if(!dragged)return;e.preventDefault();position(down.left+e.clientX-down.x,down.top+e.clientY-down.y,false)});
btn.addEventListener('pointerup',e=>{if(!down||e.pointerId!==down.id)return;if(dragged){position(root.getBoundingClientRect().left,root.getBoundingClientRect().top,true);skipClick=true;setTimeout(()=>skipClick=false,70)}down=null});
btn.addEventListener('pointercancel',()=>{down=null;dragged=false});
btn.addEventListener('click',e=>{if(skipClick||dragged){e.preventDefault();dragged=false;skipClick=false;return}toggle()});
closeBtn.addEventListener('click',()=>{panel.dataset.open='no';btn.setAttribute('aria-expanded','false');btn.focus();});
btn.addEventListener('keydown',e=>{if(!e.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const b=root.getBoundingClientRect(),step=e.shiftKey?50:15;position(b.left+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),b.top+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0),true)});

reset.addEventListener('click',()=>{try{localStorage.removeItem(storageKey)}catch{}const p=defaultXY();position(p.x,p.y,false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.dataset.open==='yes'){panel.dataset.open='no';btn.setAttribute('aria-expanded','false');btn.focus()}});
window.addEventListener('resize',()=>{const b=root.getBoundingClientRect();position(b.left,b.top,false)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&protectedOrigin){loadMilestones();loadNotifications()}});
async function siya417Presence(){
 if(!protectedOrigin||document.hidden)return;
 try{const r=await api('/api/ai/assistant/attention');const high=(r.items||[]).filter(x=>x.severity==='high');
  if(!high.length)return;
  const signature=high.map(x=>[x.kind,x.date,x.summary].join(':')).join('|');const last=sessionStorage.getItem('siya-presence-fingerprint');
  if(signature!==last){sessionStorage.setItem('siya-presence-fingerprint',signature);setExpression('warning',9000);
   if(panel.dataset.open==='yes'&&!prompt.value&&!send.disabled)quickStatus.textContent=high.length+' important verified item(s) need attention. Open Siya for details.';
  }
 }catch{ /* Don't interrupt ordinary chat because reminders are temporarily unavailable. */ }
}
if(protectedOrigin){setTimeout(()=>{check()},0);setTimeout(()=>{loadMilestones();loadNotifications();siya417Presence()},700);setInterval(()=>{if(!document.hidden){loadNotifications();loadMilestones();siya417Presence();refreshMascotGrowth()}},90000)}
window.addEventListener('siya:notifications-changed',()=>{if(protectedOrigin){loadNotifications();loadMilestones(true)}});
if(!protectedOrigin){setTimeout(()=>{if(!document.hidden)guest()},0);setInterval(()=>{if(!document.hidden)guest()},90000)}
window.addEventListener('storage',e=>{if(e.key==='siya-personality-v1'&&panel.dataset.open==='yes')selectIntro()});

document.body.append(root);
// Preserve a recently authenticated profile across GitHub Pages navigation (same tab).
// URL fragment is purely cosmetic context and cannot grant permissions.
if(protectedOrigin){
 let handoff=null;
 fetch('/api/siya/profile',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}})
  .then(r=>r.ok?r.json():null).then(p=>{
   if(!p||!p.displayName)return;
   applyPersonalIdentity(p.viewerKey);if(!allowed)growthHint.hidden=true;
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
