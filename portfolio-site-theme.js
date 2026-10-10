/* Shared palette and cross-origin navigation. No private data or network calls. */
(()=>{'use strict';
const KEY='site-theme';
const ALLOWED=new Set(['https://siyabongathupana.github.io','https://portfolio-data-bridge.siyabongatshem.workers.dev']);
const norm=v=>v==='light'||v==='dark'?v:null;
const here=new URL(location.href);
let stored=null;try{stored=norm(localStorage.getItem(KEY));}catch{}
const incoming=norm(here.searchParams.get('theme'));
let active=incoming||stored||'dark';
function updateButton(btn){if(!btn)return;const light=active==='light';btn.setAttribute('aria-label',light?'Switch to dark mode':'Switch to light mode');btn.title=light?'Switch to dark mode':'Switch to light mode';btn.setAttribute('aria-pressed',String(light));const glyph=btn.querySelector('#themeIcon')||btn.querySelector('.theme-glyph');if(glyph)glyph.textContent=light?'☾':'☼';else if(btn.id==='secureThemeToggle'||btn.id==='universalThemeToggle')btn.textContent=light?'☾ Dark':'☼ Light';}
function apply(t,save=true){active=norm(t)||'dark';document.documentElement.dataset.theme=active;document.documentElement.classList.toggle('theme-dark',active==='dark');document.documentElement.classList.toggle('theme-light',active==='light');document.documentElement.style.colorScheme=active;const legacy=document.getElementById('theme-dark-css');if(legacy)legacy.disabled=active==='light';document.querySelectorAll('#themeToggle,#secureThemeToggle,#universalThemeToggle').forEach(updateButton);if(save)try{localStorage.setItem(KEY,active);}catch{}}
apply(active);
if(incoming){try{here.searchParams.delete('theme');history.replaceState(history.state,'',here.pathname+here.search+here.hash);}catch{}}
function init(){
 // Existing homepage already wires its button in homepage.js; avoid a double-click handler.
 let existing=document.getElementById('themeToggle');
 if(!existing){
   const btn=document.createElement('button');btn.id='universalThemeToggle';btn.className='portfolio-global-theme';btn.type='button';btn.innerHTML='<span class="theme-glyph" aria-hidden="true">☼</span><span class="theme-text">Theme</span>';
   const actions=document.querySelector('.site-header .nav-actions,.topbar .nav-actions');
   if(actions)actions.prepend(btn);else {btn.classList.add('floating-theme');document.body.append(btn);}
   btn.addEventListener('click',()=>apply(active==='dark'?'light':'dark'));
   updateButton(btn);
 }else updateButton(existing);
 // Only port the preference when navigating between the public and protected sites.
 document.addEventListener('click',e=>{
   const a=e.target instanceof Element?e.target.closest('a[href]'):null;if(!a)return;
   try{const dest=new URL(a.href);if(dest.origin===location.origin||!ALLOWED.has(dest.origin)||!ALLOWED.has(location.origin))return;
   dest.searchParams.set('theme',active);a.href=dest.href;}catch{}
 },true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.addEventListener('storage',e=>{if(e.key===KEY&&norm(e.newValue))apply(e.newValue,false)});
// Public homepage's existing toggle uses the same storage key.
const obs=new MutationObserver(()=>{const t=norm(document.documentElement.dataset.theme);if(t&&t!==active){active=t;const legacy=document.getElementById('theme-dark-css');if(legacy)legacy.disabled=t==='light';try{localStorage.setItem(KEY,t)}catch{}}});obs.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
})();
