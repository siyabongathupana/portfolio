(()=>{'use strict';
const $=id=>document.getElementById(id),E=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=String(txt??'');return el;};
const pathOK=/^public-certificate-images\/[a-z0-9][a-z0-9_.-]{0,100}\.(?:jpg|jpeg|png|webp)$/i;
const pdfOK=/^public-certificate-files\/[a-z0-9][a-z0-9_.-]{0,120}\.pdf$/i;
function approvedUrl(value){
 if(typeof value!=='string')return null;
 const v=value.trim();if(pdfOK.test(v))return v;
 try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)return null;
   // Avoid accidentally linking to a private Cloudflare or GitHub API route as a public credential.
   if(u.hostname==='portfolio-data-bridge.siyabongatshem.workers.dev'||u.pathname.includes('/data/users/'))return null;
   return u.href;
 }catch{return null;}
}
function render(data){
 const certs=data.filter(c=>c&&typeof c==='object'&&typeof c.title==='string'&&c.title.trim()&&typeof c.issuer==='string');
 const issuers=[...new Set(certs.map(c=>c.issuer.trim()).filter(Boolean))].sort();
 for(const issuer of issuers){const o=E('option',null,issuer);o.value=issuer;$('cert-issuer').append(o);}
 function renderCards(){const search=$('cert-search').value.trim().toLowerCase(),issuer=$('cert-issuer').value;
 const selection=certs.filter(c=>(!issuer||c.issuer===issuer)&&[c.title,c.issuer,c.date].join(' ').toLowerCase().includes(search));
 const frag=document.createDocumentFragment();
 for(const c of selection){
   const card=E('article','cert-card');const url=approvedUrl(c.url);
   let cover;if(typeof c.image==='string'&&pathOK.test(c.image)){
     cover=E('img','thumb');cover.src=c.image;cover.alt='Certificate thumbnail: '+c.title.slice(0,130);cover.loading='lazy';cover.decoding='async';cover.addEventListener('error',()=>cover.replaceWith(E('div','illustration','✧')));
   } else cover=E('div','illustration','✧');
   if(url){const a=E('a','cert-cover-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','View '+c.title.slice(0,130));a.append(cover);card.append(a);}else card.append(cover);
   card.append(E('h2',null,c.title.slice(0,160)),E('p','issuer',c.issuer.slice(0,140)),E('p',null,String(c.date||'').slice(0,50)));
   if(url){const a=E('a','cert-link','View certificate ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
   frag.append(card);
 }
 $('cert-list').replaceChildren(frag);
 $('cert-count').textContent=selection.length+' public certificate'+(selection.length===1?'':'s');
 $('cert-error').hidden=selection.length!==0;
 $('cert-error').textContent=certs.length?'No certificates match your search.':'No public certificates have been approved yet.';
 }
 $('cert-search').addEventListener('input',renderCards);$('cert-issuer').addEventListener('change',renderCards);renderCards();
}
fetch('public-certificates.json',{credentials:'omit',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Public certificate catalog unavailable (HTTP '+r.status+')');const data=await r.json();if(data.schemaVersion!==1||!Array.isArray(data.certificates))throw Error('Invalid public certificate catalog');render(data.certificates);}).catch(e=>{$('cert-count').textContent='Could not load certificates';$('cert-error').hidden=false;$('cert-error').textContent=e.message;});
})();
