(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const isDetails = location.pathname.endsWith('/project-details.html');
  const acceptedImage = /^(?:public-project-images\/)[a-z0-9][a-z0-9_.-]{0,125}\.(?:jpg|jpeg|png|webp)$/i;
  const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const asText = (v,n=500) => typeof v==='string' ? v.slice(0,n).trim() : '';
  const E = (tag, className, value) => {
    const node=document.createElement(tag);
    if(className) node.className=className;
    if(value!==undefined) node.textContent=value;
    return node;
  };
  const link = (url,label,cl) => {const a=E('a',cl,label);a.href=url;return a;};
  const safeProject = p => p&&typeof p==='object'&&!Array.isArray(p)&&validSlug.test(p.slug||'')&&asText(p.title).length>0;
  function cover(p) {
    if(acceptedImage.test(p.coverImage||'')) {
      const img=E('img','project-cover');img.src=p.coverImage;img.alt=asText(p.title,120)+' project cover';img.loading='lazy';img.decoding='async';
      img.addEventListener('error',()=>img.replaceWith(E('div','project-cover fallback','PROJECT')));
      return img;
    }
    return E('div','project-cover fallback','PROJECT');
  }
  function pill(value) {return value ? E('span','pill',asText(value,70)) : null;}
  function renderGallery(projects) {
    const cards=$('project-cards'), count=$('project-count'), search=$('project-search'), filter=$('category-filter');
    const cats=Array.from(new Set(projects.map(p=>asText(p.category,80)).filter(Boolean))).sort();
    cats.forEach(c=>{const o=E('option',null,c);o.value=c;filter.append(o);});
    const update=()=>{
      const term=search.value.trim().toLowerCase(), cat=filter.value;
      const result=projects.filter(p=>(!cat||p.category===cat)&&[p.title,p.summary,p.category,p.industry,p.tags].join(' ').toLowerCase().includes(term));
      const fragment=document.createDocumentFragment();
      result.forEach(p=>{
        const article=E('article','public-project-card'); article.append(cover(p));
        const body=E('div','body');const pills=E('div','pills');[p.category,p.status].forEach(s=>{let b=pill(s);if(b)pills.append(b);});
        body.append(pills,E('h2',null,asText(p.title,130)),E('p',null,asText(p.summary,600)),link('project-details.html?slug='+encodeURIComponent(p.slug),'Explore project →','more'));
        article.append(body); fragment.append(article);
      });
      cards.replaceChildren(fragment);count.textContent=result.length+' public project'+(result.length===1?'':'s');
      const err=$('project-error');err.hidden=result.length>0;
      err.textContent=projects.length ? 'No published projects match the current filters.' : 'Projects will appear here after they are individually approved for publication. Private project records are never loaded on this page.';
    };
    search.addEventListener('input',update);filter.addEventListener('change',update);update();
  }
  function renderDetails(projects){
    const el=$('project-detail');const slug=new URLSearchParams(location.search).get('slug')||'';
    if(!validSlug.test(slug)) {el.replaceChildren(E('h1',null,'Public project not selected'),E('p',null,'Open the Projects gallery to choose an approved project.'));return;}
    const p=projects.find(x=>x.slug===slug);
    if(!p){el.replaceChildren(E('h1',null,'Project not publicly available'),E('p',null,'This project is not included in the approved public catalog. You may need to sign in for your own private records.'));return;}
    const fragment=document.createDocumentFragment();
    fragment.append(E('div','eyebrow','Public project profile'),E('h1',null,asText(p.title,130)));
    if(p.coverImage&&acceptedImage.test(p.coverImage)) {const img=cover(p);img.className='detail-image';fragment.append(img);}
    const meta=E('div','project-meta');[p.category,p.industry,p.status].forEach(x=>{const tag=pill(x);if(tag)meta.append(tag);});fragment.append(meta);
    if(p.summary)fragment.append(E('p','lead',asText(p.summary,600)));
    if(p.description){fragment.append(E('h2',null,'Overview'),E('p','detail-body',asText(p.description,3200)));}
    if(p.tags){fragment.append(E('h2',null,'Technologies'),E('p','detail-body',asText(p.tags,300)));}
    el.replaceChildren(fragment);
    document.title=asText(p.title,100)+' | YourPortfolio';
  }
  async function main(){
    try{
      const response=await fetch('public-projects.json',{cache:'no-store',credentials:'omit'});
      if(!response.ok)throw new Error('The public catalog is not available.');
      const obj=await response.json();
      if(obj?.schemaVersion!==1||!Array.isArray(obj.projects))throw new Error('Invalid public catalog format.');
      const projects=obj.projects.filter(safeProject);
      if(isDetails) renderDetails(projects);else renderGallery(projects);
    }catch(error){
      if(isDetails)$('project-detail').replaceChildren(E('h1',null,'Unable to load public project'),E('p',null,error.message));
      else {const e=$('project-error');e.hidden=false;e.textContent=error.message;$('project-count').textContent='Unavailable';}
    }
  }
  main();
})();
