'use strict';
/* Load the plain scripts in order and stop if one fails. A later script must
   never run against a partially initialized WebGL program or context. */
(function(){
  const scripts=['core','engine','shaders','ocean','environment','splash','surf','islands','island-details','island-scenery','weather','physics','input','audio','render','ui'];
  const safeKey='aqua.graphics.safe', retryKey='aqua.graphics.autoRetry';
  const canvas=document.getElementById('gl'), panel=document.getElementById('fail');
  const title=document.getElementById('failTitle'), message=document.getElementById('failMessage');
  const details=document.getElementById('failDetails'), diagnostic=document.getElementById('err');
  let state='loading', context=null, autoRecover=false, recoveryReady=false, safeMode=false, safeFromQuery=false, currentScript='';
  try{ safeMode=sessionStorage.getItem(safeKey)==='1'; }catch(e){}
  try{
    const url=new URL(location.href);
    if(url.searchParams.get('aquaSafe')==='1'){
      safeMode=true; safeFromQuery=true; url.searchParams.delete('aquaSafe');
      try{ history.replaceState(history.state,'',url.href); }catch(e){}
    }
  }catch(e){}

  function describe(error){
    if(error&&error.message) return error.message;
    return error==null?'No graphics diagnostic was supplied.':String(error);
  }
  function show(t,m,detail){
    const wasVisible=panel.style.display==='flex';
    document.body.classList.add('nogl');
    title.textContent=t; message.textContent=m;
    diagnostic.textContent=detail?String(detail).slice(0,6000):''; details.hidden=!detail;
    panel.style.display='flex';
    const retry=document.getElementById('retryGraphics');
    if(!wasVisible&&retry&&typeof retry.focus==='function'){
      try{ retry.focus({preventScroll:true}); }catch(e){ retry.focus(); }
    }
  }
  function rememberSafeMode(){
    try{ sessionStorage.setItem(safeKey,'1'); return true; }catch(e){ return false; }
  }
  function retryInSafeMode(){
    state='restarting';
    if(rememberSafeMode()){ location.reload(); return; }
    /* Storage can be disabled in private browsing. The temporary URL flag
       still permits a manual low-memory retry in that case. */
    try{ const url=new URL(location.href); url.searchParams.set('aquaSafe','1'); location.assign(url.href); }
    catch(e){ location.reload(); }
  }
  function reserveAutomaticRetry(){
    /* At most one automatic reload per tab session; otherwise a device that
       repeatedly loses its context could get stuck in a reload loop. */
    try{
      if(sessionStorage.getItem(retryKey)==='1') return false;
      sessionStorage.setItem(safeKey,'1'); sessionStorage.setItem(retryKey,'1');
      return true;
    }catch(e){ return false; }
  }
  function retryLostContext(){
    if(state!=='lost'||!autoRecover||!recoveryReady||document.hidden) return;
    state='restarting'; autoRecover=false; location.reload();
  }
  function enterLost(){
    if(state==='lost'||state==='failed'||state==='restarting') return;
    state='lost';
    autoRecover=reserveAutomaticRetry();
    show('Graphics paused',
      autoRecover?'The browser lost its graphics context. Aqua will retry shortly, or you can retry in low-memory mode.'
        :'The browser lost its graphics context. Retry to rebuild the scene, or use low-memory mode.',
      'The WebGL context was lost; graphics resources need to be rebuilt.');
    /* Some browsers never dispatch restoration after a GPU reset. If this tab
       is visible, make the same single low-memory retry after a short wait. */
    if(autoRecover) setTimeout(()=>{ recoveryReady=true; retryLostContext(); },5000);
  }
  function fail(error){
    if(state==='failed'||state==='lost'||state==='restarting') return;
    if(context&&context.isContextLost()){ enterLost(); return; }
    /* A null shader log or failed object creation can be a transient driver
       resource failure. Try once with a smaller footprint, never in a loop. */
    if(error&&error.code==='GRAPHICS_RETRYABLE'&&!safeMode&&reserveAutomaticRetry()){
      state='restarting';
      show('Restarting graphics','The graphics driver did not finish starting. Aqua will retry once in low-memory mode.',describe(error));
      setTimeout(()=>location.reload(),0);
      return;
    }
    const wasLoading=state==='loading';
    state='failed';
    const text=describe(error);
    const unsupported=error&&error.code==='WEBGL_UNAVAILABLE';
    show(unsupported?'WebGL 2 is unavailable':wasLoading?'Graphics could not start':'Graphics stopped',
      unsupported?'This device or browser could not create a WebGL 2 context. Try a current browser with hardware acceleration enabled.'
        :(wasLoading?'Aqua could not initialize its graphics. ':'Aqua could not continue rendering. ')+
          'Try low-memory mode or reload the page. Your saved settings are not deleted.',
      (currentScript?'While loading '+currentScript+': ':'')+text);
    if(typeof console!=='undefined'&&console.error) console.error('Aqua graphics:',error);
  }
  const boot={
    get state(){return state;}, get safeMode(){return safeMode;},
    canRender(){return state==='running';},
    attachContext(gl){context=gl;},
    fail, contextLost:enterLost,
    firstFrame(){
      /* The retry setting is one-shot. The automatic-retry guard remains for
         the tab session so another loss cannot cause an endless reload. */
      if(safeMode&&!safeFromQuery){ try{sessionStorage.removeItem(safeKey);}catch(e){} }
    }
  };
  window.AquaBoot=boot;
  canvas.addEventListener('webglcontextlost',event=>{ event.preventDefault(); enterLost(); });
  canvas.addEventListener('webglcontextrestored',()=>{
    if(state!=='lost') return;
    if(autoRecover){ state='restarting'; autoRecover=false; location.reload(); }
    else show('Graphics restored','The browser restored its graphics context. Retry to rebuild the scene, or start in low-memory mode.','');
  });
  document.addEventListener('visibilitychange',retryLostContext);
  document.getElementById('retryGraphics').addEventListener('click',()=>{ state='restarting'; location.reload(); });
  document.getElementById('safeGraphics').addEventListener('click',retryInSafeMode);
  window.addEventListener('error',event=>{
    if(state!=='failed'&&state!=='lost') fail(event.error||event.message);
    if(event.preventDefault) event.preventDefault();
  });

  let index=0;
  function next(){
    if(state!=='loading') return;
    if(context&&context.isContextLost()){ enterLost(); return; }
    if(index===scripts.length){
      currentScript='startup';
      try{
        if(typeof window.AquaStart!=='function') throw new Error('The renderer did not finish loading.');
        window.AquaStart();
        if(context&&context.isContextLost()){ enterLost(); return; }
        if(state==='loading'){ state='running'; currentScript=''; }
      }catch(error){ fail(error); }
      return;
    }
    const name=scripts[index++], script=document.createElement('script');
    currentScript='js/'+name+'.js'; script.src=currentScript; script.async=false;
    script.onload=next;
    script.onerror=()=>fail(new Error('Could not load '+script.src+'. Check the connection and retry.'));
    document.head.appendChild(script);
  }
  next();
})();
