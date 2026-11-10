const key='zhangxi-reading-v1';
const checkpointKey=key+':checkpoint';
// Restoring focus is not a new keyboard entry into the project stack.
export function restoreReadingFocus(target) {
  if(!target)return;
  target.setAttribute('data-reading-focus-restore','');
  try{target.focus({preventScroll:true});}
  finally{target.removeAttribute('data-reading-focus-restore');}
}
export function initReadingState(galleries,folio,signal) {
  const on=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal});
  const makeId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
  let state=history.state?.[key]||{entry:makeId()};
  let departing=false;
  let pendingRestore=null;
  let checkpointTimer=null;
  const route=location.pathname;
  const navigationKeys=new Set(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ','Spacebar','Enter']);
  function cancelRestore(){
    if(!pendingRestore)return;
    const token=pendingRestore;pendingRestore=null;
    token.canceled=true;
    for(const frame of token.frames)cancelAnimationFrame(frame);
    token.listeners.abort();
  }
  function clearCheckpoint(){clearTimeout(checkpointTimer);checkpointTimer=null;}
  signal.addEventListener('abort',()=>{cancelRestore();clearCheckpoint();},{once:true});
  function replace(value){try{history.replaceState({...history.state,[key]:value},'');state=value;}catch{}}
  if(!history.state?.[key])replace(state);
  function save(link=null){
    // Programmatic disclosure/image restoration must not replace its own snapshot.
    if(pendingRestore||departing||signal.aborted)return state;
    clearCheckpoint();
    const project=link?.dataset.projectLink||folio?.current;
    const anchor=link?.closest('.project-card[id]')||(project?document.querySelector(`#project-${CSS.escape(project)}`):null);
    const disclosures=Object.fromEntries([...document.querySelectorAll('details[id][data-reading-disclosure]')].map(detail=>[detail.id,detail.open]));
    const value={...state,route,y:scrollY,width:innerWidth,height:innerHeight,project,anchorId:anchor?.id||state.anchorId,keyboard:folio?.keyboard,offset:anchor?anchor.getBoundingClientRect().top:0,images:Object.fromEntries([...galleries].map(([id,g])=>[id,g.imageId])),disclosures,focus:link?.id||state.focus||null,savedAt:Math.max(Date.now(),(state.savedAt||0)+1)};
    replace(value);return value;
  }
  // A trailing checkpoint writes once after reading has settled, not each frame
  // or periodically during a long scroll. pagehide captures the final position.
  on(window,'scroll',()=>{
    if(pendingRestore||departing||signal.aborted)return;
    clearCheckpoint();checkpointTimer=setTimeout(()=>{checkpointTimer=null;save();},180);
  },{passive:true});
  on(document,'toggle',event=>{
    const detail=event.target;
    if(!detail.matches?.('details[id][data-reading-disclosure]'))return;
    // Native toggle events may arrive after the restore RAF has completed.
    if(pendingRestore||state.disclosures?.[detail.id]===detail.open)return;
    save();
  },{capture:true});
  on(document,'click',event=>{
    const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||event.button!==0||link.hasAttribute('download')||link.hasAttribute('data-lightbox')||link.hasAttribute('data-gallery-preview'))return;
    const target=new URL(link.href,location.href);
    if(target.origin!==location.origin||target.pathname===route||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target==='_blank')return;
    const value=save(link);
    departing=true;folio?.suspend();
    if(target.pathname.startsWith('/work/')&&target.pathname!=='/work/'){
      try{sessionStorage.setItem(key+':return',JSON.stringify({from:route+location.hash,to:target.pathname,entry:value.entry}));}catch{}
    }
  },{capture:true});
  // Keep the click-time snapshot: hidden-page layout changes are not reading.
  on(window,'pagehide',()=>{
    clearCheckpoint();
    if(!departing&&!pendingRestore)save();
    // A browser can take its reload history snapshot before pagehide replaceState.
    // This same-entry fallback captures even an immediate toggle/scroll + reload.
    // It is never consumed for ordinary navigation or back/forward restoration.
    try{sessionStorage.setItem(checkpointKey,JSON.stringify(state));}catch{}
    cancelRestore();
  });
  on(window,'reading:checkpoint',()=>save());
  on(window,'reading:new-entry',()=>{cancelRestore();clearCheckpoint();state={entry:makeId()};replace(state);});
  function restore(persisted=false){
    cancelRestore();
    clearCheckpoint();
    if(signal.aborted)return;
    state=history.state?.[key]||state;
    if(performance.getEntriesByType('navigation')[0]?.type==='reload'){
      try{
        const checkpoint=JSON.parse(sessionStorage.getItem(checkpointKey)||'null');
        if(checkpoint?.entry===state.entry&&checkpoint.route===route&&Number.isFinite(checkpoint.savedAt)&&checkpoint.savedAt>(state.savedAt||0))replace(checkpoint);
      }catch{}
    }
    if(persisted&&state.width===innerWidth&&state.height===innerHeight){folio?.measure();return;}
    if(state.route!==route)return;
    const snapshot=state;
    const token={canceled:false,frames:[],listeners:new AbortController()};
    pendingRestore=token;
    // Restore native disclosures before measuring or positioning the page.
    // Otherwise a cold history return would apply the old y to a shorter document.
    for(const [id,open] of Object.entries(state.disclosures||{})){
      const detail=document.getElementById(id);
      if(typeof open==='boolean'&&detail?.matches('details[data-reading-disclosure]'))detail.open=open;
    }
    for(const [id,image] of Object.entries(state.images||{}))galleries.get(id)?.select(image);
    const cancel=()=>{if(pendingRestore===token)cancelRestore();};
    for(const type of ['wheel','touchstart','pointerdown'])window.addEventListener(type,cancel,{passive:true,capture:true,signal:token.listeners.signal});
    window.addEventListener('keydown',event=>{if(navigationKeys.has(event.key))cancel();},{capture:true,signal:token.listeners.signal});
    token.frames.push(requestAnimationFrame(()=>{
      if(token.canceled||pendingRestore!==token)return;
      token.frames.push(requestAnimationFrame(()=>{
      if(token.canceled||pendingRestore!==token)return;
      // Restoration has a finite lifetime: completed attempts leave no input listeners.
      pendingRestore=null;token.listeners.abort();
      folio?.measure();
      const anchor=(snapshot.anchorId&&document.getElementById(snapshot.anchorId))||(snapshot.project?document.getElementById('project-'+snapshot.project):null);
      const resized=snapshot.width!==innerWidth||snapshot.height!==innerHeight;
      const readTop=parseFloat(getComputedStyle(document.querySelector('[data-folio]')||document.documentElement).getPropertyValue('--folio-top'))||90;
      const target=resized&&anchor?anchor.getBoundingClientRect().top+scrollY-readTop:snapshot.y;
      if(Number.isFinite(target)&&Math.abs(scrollY-target)>3)window.scrollTo({top:target,behavior:'instant'});
      if(performance.getEntriesByType('navigation')[0]?.type==='back_forward'&&snapshot.focus){
        const target=document.getElementById(snapshot.focus);
        if(snapshot.keyboard)target?.focus({preventScroll:true});else restoreReadingFocus(target);
      }
      }));
    }));
  }
  on(window,'pageshow',event=>{departing=false;restore(event.persisted);});
  on(window,'popstate',()=>{state=history.state?.[key]||{entry:makeId()};restore(false);});
  if(document.readyState==='complete')restore(false);
  const backs=document.querySelectorAll('[data-reading-back]');
  if(backs.length){
    let source;try{source=JSON.parse(sessionStorage.getItem(key+':return')||'null');}catch{}
    const referrer=document.referrer?new URL(document.referrer):null;
    if(source?.to===route&&new URL(source.from,location.origin).origin===location.origin&&referrer?.origin===location.origin&&referrer.pathname===new URL(source.from,location.origin).pathname){
      for(const back of backs){
      back.href=source.from;back.firstChild.textContent=back.classList.contains('reader-back')?'返回 ':'返回刚才的位置 ';
      back.setAttribute('aria-label','返回刚才的位置');
      on(back,'click',event=>{
        if(event.defaultPrevented||event.button!==0||back.hasAttribute('download')||back.target==='_blank')return;
        if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
        const referrer=document.referrer?new URL(document.referrer):null;
        if(referrer?.origin===location.origin&&referrer.pathname===new URL(source.from,location.origin).pathname&&history.length>1){event.preventDefault();history.back();}
      });
      }
    }
  }
  return {save};
}
