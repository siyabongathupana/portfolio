(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const IMAGE_PATH = /^public-project-images\/[a-z0-9][a-z0-9_.-]{0,125}\.(?:png|jpe?g|webp)$/i;
  const t = (value, length=450) => typeof value === 'string' ? value.trim().slice(0,length) : '';
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const link = (href, text, cls) => {
    const node=el('a',cls,text); node.href=href; return node;
  };
  const themeKey = 'yourportfolio-public-theme';
  function setTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    $('themeIcon').textContent = next === 'light' ? '☾' : '☼';
    $('themeToggle').setAttribute('aria-label', next === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    try { localStorage.setItem(themeKey, next); } catch {}
  }
  try { setTheme(localStorage.getItem(themeKey) || 'dark'); } catch { setTheme('dark'); }
  $('themeToggle').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));
  const menu = $('siteNav');
  $('menuToggle').addEventListener('click', () => {
    const expanded = $('menuToggle').getAttribute('aria-expanded') === 'true';
    $('menuToggle').setAttribute('aria-expanded', String(!expanded));
    menu.classList.toggle('open', !expanded);
  });
  for (const navLink of menu.querySelectorAll('a')) navLink.addEventListener('click', () => {
    menu.classList.remove('open');
    $('menuToggle').setAttribute('aria-expanded','false');
  });
  $('copyrightYear').textContent=String(new Date().getFullYear());

  async function publicCatalog(name, collection) {
    const response=await fetch(name, {cache:'no-store',credentials:'omit',headers:{'Accept':'application/json'}});
    if (!response.ok) throw new Error('Catalog unavailable');
    const data=await response.json();
    if (data?.schemaVersion !== 1 || !Array.isArray(data[collection])) throw new Error('Catalog format not recognised');
    return data[collection];
  }

  function projectCard(p) {
    const card=el('article','featured-card');
    if (IMAGE_PATH.test(t(p.coverImage,200))) {
      const img=el('img','feature-image'); img.src=p.coverImage;
      img.alt=t(p.title,100)+' project cover'; img.loading='lazy'; img.decoding='async';
      img.addEventListener('error',()=>img.replaceWith(el('div','feature-image-fallback','⌘')));
      card.append(img);
    } else card.append(el('div','feature-image-fallback','⌘'));
    const body=el('div','featured-body'), pills=el('div','pills');
    for (const value of [p.category,p.status]) if (t(value,65)) pills.append(el('span','pill',t(value,65)));
    body.append(pills,el('h3',null,t(p.title,130)),el('p',null,t(p.summary,280)),link('project-details.html?slug='+encodeURIComponent(p.slug),'View project details ↗','card-link'));
    card.append(body); return card;
  }
  function emptyState(message) {
    const container=el('div','empty-projects');
    container.append(el('div','empty-icon','⌁'),el('h3',null,'New public projects coming soon'),el('p',null,message),link('projects.html','Open projects gallery →','text-link'));
    return container;
  }
  async function loadProjects() {
    const grid=$('featuredGrid');
    try {
      const items=await publicCatalog('public-projects.json','projects');
      const projects=items.filter(p=>p && typeof p==='object' && VALID_SLUG.test(p.slug||'') && t(p.title,130)).slice(0,1000);
      $('projectMetric').textContent=String(projects.length);
      if (!projects.length){grid.replaceChildren(emptyState('The gallery will update automatically when selected projects are approved for public viewing.')); $('featuredStatus').textContent='No public projects have been published yet.';return;}
      const featured=projects.slice(0,6);grid.replaceChildren(...featured.map(projectCard));
      $('featuredStatus').textContent='Showing '+featured.length+' of '+projects.length+' approved project'+(projects.length===1?'':'s')+'.';
    } catch {
      $('projectMetric').textContent='—';
      grid.replaceChildren(emptyState('The approved project catalog could not be loaded. Please visit the gallery again later.'));
      $('featuredStatus').textContent='Public project list temporarily unavailable.';
    }
  }
  async function loadCertificates() {
    try {
      const items=await publicCatalog('public-certificates.json','certificates');
      $('certificateMetric').textContent=String(items.filter(c=>c&&typeof c==='object'&&t(c.title)).length);
    } catch { $('certificateMetric').textContent='—'; }
  }
  loadProjects();loadCertificates();

  $('contactForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('contactForm').reportValidity()) return;
    const name=t($('contactName').value,100), email=t($('contactEmail').value,160), message=t($('contactMsg').value,2500);
    const subject=encodeURIComponent('Portfolio enquiry from '+name);
    const body=encodeURIComponent('Name: '+name+'\nEmail: '+email+'\n\n'+message+'\n');
    // This is a mail draft, not a server submission. The sender must press Send in their mail application.
    $('contactStatus').textContent='Opening your mail application. Please review the draft and press Send there.';
    window.location.href='mailto:siyabongatshem@gmail.com?subject='+subject+'&body='+body;
  });
})();
