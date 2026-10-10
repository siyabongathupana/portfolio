(()=>{'use strict';
const $=id=>document.getElementById(id);
const themeKey='site-theme';
function theme(next){document.documentElement.dataset.theme=next;document.documentElement.style.colorScheme=next;$('themeIcon').textContent=next==='dark'?'☼':'☾';$('themeToggle').setAttribute('aria-label',next==='dark'?'Switch to light theme':'Switch to dark theme');try{localStorage.setItem(themeKey,next);}catch{}}
let chosen='dark';try{chosen=localStorage.getItem(themeKey)||'dark';}catch{}theme(chosen==='light'?'light':'dark');$('themeToggle').addEventListener('click',()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
$('year').textContent=String(new Date().getFullYear());
const safeProject=/^public-project-images\/[a-z0-9][a-z0-9_.-]{0,125}\.(?:jpg|jpeg|png|webp)$/i;
const safeCertificate=/^public-certificate-images\/[a-z0-9][a-z0-9_.-]{0,125}\.(?:jpg|jpeg|png|webp)$/i;
const safeSlug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const short=(val,max=160)=>typeof val==='string'?val.trim().slice(0,max):'';
function elem(tag,cl,txt){let e=document.createElement(tag);if(cl)e.className=cl;if(txt!==undefined)e.textContent=txt;return e;}
function card(title,category,summary,href,image,pattern){const root=elem('article','feature-card');if(pattern.test(image||'')){const img=elem('img','feature-image');img.src=image;img.alt=title+' thumbnail';img.loading='lazy';img.onerror=()=>img.replaceWith(elem('div','feature-fallback','✦'));root.append(img);}else root.append(elem('div','feature-fallback','✦'));const body=elem('div','feature-body');body.append(elem('span','pill',category),elem('h3','',title),elem('p','',summary));const a=elem('a','','View details ↗');a.href=href;body.append(a);root.append(body);return root;}
async function getCatalog(filename,key){const r=await fetch(filename,{cache:'no-store',credentials:'omit'});if(!r.ok)throw Error('Catalog offline');const data=await r.json();if(data.schemaVersion!==1||!Array.isArray(data[key]))throw Error('Invalid catalog');return data[key];}
async function projects(){const box=$('featuredProjects');try{const all=(await getCatalog('public-projects.json','projects')).filter(p=>p&&safeSlug.test(p.slug||'')&&short(p.title));$('publicProjectCount').textContent=String(all.length);box.replaceChildren(...(all.length?all.slice(0,3).map(p=>card(short(p.title,90),short(p.category,70),short(p.summary,175),'project-details.html?slug='+encodeURIComponent(p.slug),p.coverImage,safeProject)):[elem('p','empty-state','Public projects will appear here once published. Browse the Projects page for the full gallery.') ]));}catch{box.replaceChildren(elem('p','empty-state','Projects are temporarily unavailable.'));$('publicProjectCount').textContent='—';}}
async function certs(){const box=$('featuredCerts');try{const all=(await getCatalog('public-certificates.json','certificates')).filter(c=>c&&short(c.title));$('publicCertificateCount').textContent=String(all.length);box.replaceChildren(...(all.length?all.slice(0,3).map(c=>card(short(c.title,90),short(c.issuer,80),short(c.date,70),'certificates.html',c.image,safeCertificate)):[elem('p','empty-state','Published certificates will appear here soon.') ]));}catch{box.replaceChildren(elem('p','empty-state','Certificates are temporarily unavailable.'));$('publicCertificateCount').textContent='—';}}
projects();certs();
})();
