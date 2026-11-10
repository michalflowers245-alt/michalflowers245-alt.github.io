import { initGalleries } from './gallery.mjs?v=db7c7da8fb7dbeeb';
import { initFolio } from './folio.mjs?v=db7c7da8fb7dbeeb';
import { initReadingState } from './reading-state.mjs?v=db7c7da8fb7dbeeb';

const lifetime = new AbortController();
// Secondary scene controls stay available without occupying the main reading path.
for(const more of document.querySelectorAll('[data-cosmic-more]')){
 const summary=more.querySelector('summary');
 more.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&more.open){event.preventDefault();event.stopPropagation();more.open=false;summary.focus({preventScroll:true});}
 },{capture:true,signal:lifetime.signal});
 more.addEventListener('click',event=>{
  if(event.target.closest('button')){more.open=false;summary.focus({preventScroll:true});}
 },{signal:lifetime.signal});
 document.addEventListener('click',event=>{if(more.open&&!more.contains(event.target))more.open=false;},{signal:lifetime.signal});
}
// Header changes surface without changing document height or intercepting scroll.
const homeHero=document.getElementById('home-intro');
if(homeHero){
 const header=document.querySelector('.site-header');let headerFrame=0;
 const updateHeader=()=>{headerFrame=0;document.body.toggleAttribute('data-header-solid',homeHero.getBoundingClientRect().bottom<=header.getBoundingClientRect().height+80);};
 const queueHeader=()=>{if(!headerFrame)headerFrame=requestAnimationFrame(updateHeader);};
 addEventListener('scroll',queueHeader,{passive:true,signal:lifetime.signal});
 addEventListener('resize',queueHeader,{signal:lifetime.signal});
 addEventListener('pageshow',queueHeader,{signal:lifetime.signal});
 lifetime.signal.addEventListener('abort',()=>cancelAnimationFrame(headerFrame),{once:true});updateHeader();
}
const galleries=initGalleries(lifetime.signal);
const folio=initFolio(lifetime.signal);
initReadingState(galleries,folio,lifetime.signal);
// A local reading index follows the visible category without moving the page or focus.
for(const collection of document.querySelectorAll('.cdg-collection')){
 const nav=collection.querySelector('[data-category-nav]');
 if(!nav)continue;
 const links=[...nav.querySelectorAll('a[href^="#"]')];
 const groups=links.map(link=>document.getElementById(link.hash.slice(1)));
 const header=document.querySelector('.site-header');
 let frame=0,measureFrame=0;
 const update=()=>{
  frame=0;
  const sticky=collection.dataset.categoryMode==='compact';
  const threshold=header.getBoundingClientRect().bottom+(sticky?nav.getBoundingClientRect().height+8:0)+32;
  let active=0;groups.forEach((group,i)=>{if(group&&group.getBoundingClientRect().top<=threshold+1)active=i;});
  links.forEach((link,i)=>{if(i===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
 };
 const scheduleUpdate=()=>{if(!frame)frame=requestAnimationFrame(update);};
 const measure=()=>{
  measureFrame=0;
  const headerHeight=header.getBoundingClientRect().height;
  const labelSize=parseFloat(getComputedStyle(links[0].lastElementChild).fontSize);
  const small=innerWidth<=780;
  const compact=small&&innerHeight>=600&&labelSize<=22&&nav.getBoundingClientRect().height<innerHeight*.22;
  const rail=!small&&innerHeight>=640&&nav.scrollHeight+headerHeight+36<innerHeight;
  collection.dataset.categoryMode=compact?'compact':rail?'rail':'flow';
  collection.style.setProperty('--category-header-height',headerHeight+'px');
  const scrollPadding=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
  const landing=headerHeight+(compact?nav.getBoundingClientRect().height+24:24);
  collection.style.setProperty('--category-clearance',Math.max(0,landing-scrollPadding)+'px');
  scheduleUpdate();
 };
 const scheduleMeasure=()=>{if(!measureFrame)measureFrame=requestAnimationFrame(measure);};
 const observer=new ResizeObserver(scheduleMeasure);observer.observe(nav);observer.observe(header);
 addEventListener('scroll',scheduleUpdate,{passive:true,signal:lifetime.signal});
 addEventListener('resize',scheduleMeasure,{signal:lifetime.signal});
 addEventListener('pageshow',scheduleMeasure,{signal:lifetime.signal});
 document.fonts?.ready.then(()=>{if(!lifetime.signal.aborted)scheduleMeasure();});
 lifetime.signal.addEventListener('abort',()=>{observer.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(measureFrame);},{once:true});
 measure();update();
}
for(const button of document.querySelectorAll('[data-wrap-code]')){
  const pre=button.closest('.implementation').querySelector('pre');
  const setWrapped=wrapped=>{
    pre.dataset.wrap=String(wrapped);
    button.setAttribute('aria-pressed',String(wrapped));
    button.textContent=wrapped?'取消换行':'换行阅读';
  };
  button.hidden=false;
  setWrapped(matchMedia('(max-width: 600px)').matches);
  button.addEventListener('click',()=>setWrapped(pre.dataset.wrap!=='true'),{signal:lifetime.signal});
}
for(const button of document.querySelectorAll('[data-copy-code]')){
  button.hidden=false;
  const sample=button.closest('.implementation');
  let copying=false;
  button.addEventListener('click',async()=>{
    if(copying)return;copying=true;button.setAttribute('aria-busy','true');
    const code=sample.querySelector('pre code'),feedback=sample.querySelector('.code-feedback');
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code.textContent);
      feedback.textContent='代码已复制。';
    }catch{
      const range=document.createRange();range.selectNodeContents(code);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      feedback.textContent='未能自动复制，代码已选中，可使用系统复制操作。';
    }finally{copying=false;button.removeAttribute('aria-busy');}
  },{signal:lifetime.signal});
}
for(const button of document.querySelectorAll('[data-copy-email]')) {
  button.hidden=false;
  const label=button.textContent;let pending=false,resetTimer=0;
  lifetime.signal.addEventListener('abort',()=>clearTimeout(resetTimer),{once:true});
  button.addEventListener('click',async()=>{
    if(pending)return;pending=true;clearTimeout(resetTimer);button.textContent=label;button.setAttribute('aria-busy','true');
    const feedback=button.closest('.contact-card').querySelector('[data-contact-feedback]');
    try {
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(button.dataset.copyEmail);
      if(lifetime.signal.aborted)return;
      button.textContent='已复制';feedback.textContent='邮箱已复制，可以粘贴到邮件应用。';
      resetTimer=setTimeout(()=>{button.textContent=label;},2000);
    } catch {
      if(lifetime.signal.aborted)return;
      const address=button.closest('.contact-card').querySelector('.contact-email');
      const range=document.createRange();range.selectNodeContents(address);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      feedback.textContent='邮箱已选中，请使用系统复制，或直接点击邮箱发送邮件。';
    } finally {pending=false;button.removeAttribute('aria-busy');}
  },{signal:lifetime.signal});
}
for(const button of document.querySelectorAll('[data-print-resume]')) {
  button.hidden=false;
  button.addEventListener('click',()=>window.print(),{signal:lifetime.signal});
}
// One progressive TOC: plain links without JS, rail or compact disclosure with JS.
const reader=document.querySelector('[data-case-reader]');
const toc=reader?.querySelector('[data-case-toc]');
let collapseContents=()=>{};
if(toc) {
  const toggle=toc.querySelector('[data-case-toc-toggle]');
  const current=toc.querySelector('[data-case-toc-current]');
  const action=toc.querySelector('[data-case-toc-action]');
  const next=toc.querySelector('[data-case-next]');
  const list=toc.querySelector('ol');
  const links=[...list.querySelectorAll('a')];
  const sections=links.map(link=>document.getElementById(link.hash.slice(1)));
  const header=document.querySelector('.site-header');
  let expanded=false,frame=0,measureFrame=0,mode='flow',activeIndex=-1;
  const render=()=>{
    const compact=mode==='compact';
    toggle.hidden=!compact;
    list.hidden=compact&&!expanded;
    toggle.setAttribute('aria-expanded',String(!list.hidden));
    toc.dataset.collapsed=String(list.hidden);
    action.textContent=expanded?'收起':'展开';
    const headerHeight=header.getBoundingClientRect().height;
    reader.style.setProperty('--case-top',`${headerHeight+(compact?0:12)}px`);
    const scrollPadding=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
    const landing=headerHeight+(compact?Math.min(toggle.getBoundingClientRect().height+16,116):20);
    reader.style.setProperty('--case-scroll-gap',`${Math.max(0,landing-scrollPadding)}px`);
  };
  const measure=()=>{
    measureFrame=0;
    const headerHeight=header.getBoundingClientRect().height;
    const largeText=Math.max(parseFloat(getComputedStyle(document.documentElement).fontSize),parseFloat(getComputedStyle(document.body).fontSize))>24;
    const enoughHeight=innerHeight>=640&&!largeText&&headerHeight<innerHeight*.25;
    const previous=mode;
    mode=enoughHeight?(innerWidth>=1100?'rail':'compact'):'flow';
    reader.dataset.tocMode=mode;
    render();
    if(mode==='rail'&&toc.getBoundingClientRect().height+headerHeight+48>innerHeight) {
      mode='flow';reader.dataset.tocMode=mode;render();
    }
    if(previous!==mode&&toc.contains(document.activeElement)&&document.activeElement!==toggle&&list.hidden) {
      expanded=true;render();
    }
  };
  const scheduleMeasure=()=>{if(!measureFrame)measureFrame=requestAnimationFrame(measure);};
  const update=()=>{
    frame=0;
    const threshold=header.getBoundingClientRect().bottom+120;
    let active=0;
    sections.forEach((section,i)=>{if(section.getBoundingClientRect().top<=threshold)active=i;});
    links.forEach((link,i)=>{if(i===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
    if(next&&active!==activeIndex){
      const following=sections[active+1];
      next.setAttribute('href',following?'#'+following.id:'#related-work');
      next.setAttribute('aria-label',following?'下一节：'+following.querySelector('h2').textContent:'继续浏览相关项目');
      next.title=next.getAttribute('aria-label');
      next.querySelector('.case-next-label').textContent=following?'下一节':'相关项目';
      activeIndex=active;
    }
    const title=sections[active].querySelector('h2').textContent;
    if(current.textContent!==title){current.textContent=title;render();}
  };
  const scheduleUpdate=()=>{if(!frame)frame=requestAnimationFrame(update);};
  collapseContents=(section)=>{if(mode==='compact'){expanded=false;const title=section?.querySelector('h2');if(title && section.classList.contains('case-chapter'))current.textContent=title.textContent;render();}};
  toggle.addEventListener('click',()=>{expanded=!expanded;render();},{signal:lifetime.signal});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&mode==='compact'&&expanded&&toc.contains(document.activeElement)) {
      collapseContents();toggle.focus({preventScroll:true});event.preventDefault();
    }
  },{signal:lifetime.signal});
  addEventListener('scroll',scheduleUpdate,{passive:true,signal:lifetime.signal});
  addEventListener('resize',()=>{scheduleMeasure();scheduleUpdate();},{signal:lifetime.signal});
  addEventListener('pageshow',()=>{scheduleMeasure();scheduleUpdate();},{signal:lifetime.signal});
  const observer=new ResizeObserver(scheduleMeasure);
  observer.observe(header);observer.observe(list);observer.observe(toggle);
  document.fonts?.ready.then(()=>{if(!lifetime.signal.aborted)scheduleMeasure();});
  lifetime.signal.addEventListener('abort',()=>{observer.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(measureFrame);},{once:true});
  measure();update();
}
// Keep chapter links shareable without adding history entries that would trap
// the detail page's "return to reading" action inside its own table of contents.
document.addEventListener('click',event=>{
  const link=event.target.closest('#case-toc-links a[href^="#"],a[data-evidence-link],a[data-implementation-link],a[data-story-link],a[data-case-next]');
  if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const section=document.getElementById(link.hash.slice(1));
  if(!section)return;
  try{history.replaceState(history.state,'',link.hash);}catch{return;}
  event.preventDefault();
  collapseContents(section.closest('.case-chapter')||section);
  section.scrollIntoView({behavior:'instant',block:'start'});
  section.focus({preventScroll:true});
},{signal:lifetime.signal});
document.documentElement.dataset.enhanced='ready';
window.addEventListener('pagehide',event=>{if(!event.persisted)lifetime.abort();},{signal:lifetime.signal});

// Load project scenes as they enter the viewport; no activation click is needed.
const projectViewerURL=document.querySelector('script[data-project-module]')?.dataset.projectModule;
let projectModule;
const loadProjectModule=()=>projectModule||(projectModule=import(projectViewerURL).catch(error=>{projectModule=null;throw error;}));
for(const figure of document.querySelectorAll('[data-project-art]')){
 const activate=figure.querySelector('[data-project-activate]'),status=figure.querySelector('[data-project-art-status]');let initialized=false,loading=false;
 if(!projectViewerURL||!activate)continue;
 activate.hidden=false;
 const initialize=async()=>{
  if(initialized||loading||lifetime.signal.aborted)return;loading=true;activate.setAttribute('aria-busy','true');activate.textContent='准备动画…';
  try{const module=await loadProjectModule();if(!lifetime.signal.aborted){module.mountProjectViewer(figure);initialized=true;}}
  catch(error){status.textContent='3D 暂时无法加载，封面与案例仍可浏览；可以再次尝试。';activate.textContent='重试动画';console.warn('Project sculpture fallback',error);}
  finally{loading=false;if(!initialized)activate.removeAttribute('aria-busy');}
 };
 activate.addEventListener('click',initialize,{signal:lifetime.signal});
 const observer=new IntersectionObserver(changes=>{if(changes.some(e=>e.isIntersecting)){observer.disconnect();initialize();}},{threshold:0});
 observer.observe(figure);lifetime.signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
}
const firstCover=document.querySelector('[data-orbital-cover]');
if(projectViewerURL&&firstCover){
 const covers=[...document.querySelectorAll('[data-orbital-cover]')];let requested=false;
 const observer=new IntersectionObserver(changes=>{
  if(requested||!changes.some(e=>e.isIntersecting))return;requested=true;observer.disconnect();
  loadProjectModule().then(module=>{if(!lifetime.signal.aborted)module.mountProjectCovers();}).catch(error=>console.warn('Automatic project covers fallback',error));
 },{threshold:0});covers.forEach(cover=>observer.observe(cover));
 lifetime.signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
}
