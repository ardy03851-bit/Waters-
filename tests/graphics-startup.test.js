'use strict';
/* Run with: node --test tests/*.test.js
   These tests exercise the real startup, shader and framebuffer logic with
   controlled failure injection. Actual shaders also need a WebGL 2 browser. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'js',name),'utf8');

function bootFixture({storage=new Map(),blocked=false,href='https://example.test/aqua/'}={}){
  const elements={}, scripts=[], timeouts=[], errors=[];
  const element=id=>elements[id]={id,style:{},hidden:false,textContent:'',handlers:{},
    addEventListener(type,fn){this.handlers[type]=fn;},
    dispatch(type,event={}){if(this.handlers[type]) this.handlers[type](event);}};
  for(const id of ['gl','fail','failTitle','failMessage','failDetails','err','retryGraphics','safeGraphics']) element(id);
  let reloads=0, assigned=null;
  const location={href,reload(){reloads++;},assign(url){assigned=url;}};
  const sessionStorage={
    getItem(k){if(blocked) throw new Error('storage unavailable');return storage.get(k)||null;},
    setItem(k,v){if(blocked) throw new Error('storage unavailable');storage.set(k,String(v));},
    removeItem(k){if(blocked) throw new Error('storage unavailable');storage.delete(k);}
  };
  const windowEvents={};
  const document={hidden:false,events:{},getElementById:id=>elements[id],body:{classList:{add(){}}},
    addEventListener(type,fn){this.events[type]=fn;},
    createElement:()=>({}),head:{appendChild(script){scripts.push(script);}}};
  const ctx=vm.createContext({document,location,sessionStorage,URL,
    history:{state:null,replaceState(_state,_title,url){location.href=url;}},
    console:{error:(...args)=>errors.push(args)},
    setTimeout:fn=>{timeouts.push(fn);return timeouts.length;},
    addEventListener:(type,fn)=>{windowEvents[type]=fn;}});
  ctx.window=ctx;
  vm.runInContext(read('boot.js'),ctx);
  return {ctx,elements,scripts,timeouts,errors,storage,location,
    reloads:()=>reloads,assigned:()=>assigned,
    error(error){windowEvents.error({error,preventDefault(){}});},
    advanceTo(name){while(scripts.at(-1).src!=='js/'+name+'.js') scripts.at(-1).onload();}};
}

test('script errors stop loading at the first failure instead of reaching an uninitialized island program',()=>{
  const f=bootFixture();
  f.ctx.AquaBoot.attachContext({isContextLost:()=>false});
  f.advanceTo('islands');
  const count=f.scripts.length;
  f.error(new Error('island shader failed'));
  f.scripts.at(-1).onload(); // A script load event still fires after an evaluation error.
  f.error(new ReferenceError("Cannot access 'pIsland' before initialization"));
  assert.equal(f.ctx.AquaBoot.state,'failed');
  assert.equal(f.scripts.length,count);
  assert.equal(f.scripts.at(-1).src,'js/islands.js');
  assert.match(f.elements.err.textContent,/island shader failed/);
  assert.doesNotMatch(f.elements.err.textContent,/pIsland/);
  assert.equal(f.errors.length,1);
  assert.equal(f.elements.fail.style.display,'flex');
  assert.equal(f.elements.failDetails.hidden,false);
});

test('startup completes in order and reports missing scripts or WebGL clearly',()=>{
  const f=bootFixture(); let starts=0;
  f.ctx.AquaStart=()=>{starts++;};
  while(f.ctx.AquaBoot.state==='loading') f.scripts.at(-1).onload();
  assert.equal(f.ctx.AquaBoot.state,'running');
  assert.equal(starts,1);
  assert.equal(f.scripts.length,24);
  assert.ok(f.scripts.findIndex(s=>s.src==='js/island-scenery.js')>f.scripts.findIndex(s=>s.src==='js/island-details.js'));
  /* VFX shaders need the sky/plant modules and must exist before the renderer
     that calls drawVFX and feeds the post pass. */
  assert.ok(f.scripts.findIndex(s=>s.src==='js/vfx.js')>f.scripts.findIndex(s=>s.src==='js/island-scenery.js'));
  assert.ok(f.scripts.findIndex(s=>s.src==='js/vfx.js')<f.scripts.findIndex(s=>s.src==='js/render.js'));
  /* The boat fleet needs the shader helpers and the wave sampler, and must be
     defined before the renderer that draws it. */
  assert.ok(f.scripts.findIndex(s=>s.src==='js/boats.js')>f.scripts.findIndex(s=>s.src==='js/shaders.js'));
  assert.ok(f.scripts.findIndex(s=>s.src==='js/boats.js')<f.scripts.findIndex(s=>s.src==='js/render.js'));
  f.error(new Error('runtime failure'));
  assert.equal(f.elements.failTitle.textContent,'Graphics stopped');
  assert.equal(f.elements.err.textContent,'runtime failure');

  const missing=bootFixture(); missing.scripts[0].onerror();
  assert.equal(missing.ctx.AquaBoot.state,'failed');
  assert.match(missing.elements.err.textContent,/Could not load js\/core.js/);
  assert.equal(missing.scripts.length,1);

  const unavailable=bootFixture();
  const error=new Error('WebGL is unavailable'); error.code='WEBGL_UNAVAILABLE';
  unavailable.error(error);
  assert.equal(unavailable.elements.failTitle.textContent,'WebGL 2 is unavailable');
});

test('a transient null shader diagnostic retries in low-memory mode only once',()=>{
  const storage=new Map(), first=bootFixture({storage});
  first.ctx.AquaBoot.attachContext({isContextLost:()=>false});
  const error=new Error('no driver diagnostic'); error.code='GRAPHICS_RETRYABLE';
  first.error(error);
  assert.equal(first.ctx.AquaBoot.state,'restarting');
  assert.equal(storage.get('aqua.graphics.safe'),'1');
  assert.equal(storage.get('aqua.graphics.autoRetry'),'1');
  assert.equal(first.timeouts.length,1);
  first.scripts[0].onload();
  assert.equal(first.scripts.length,1);
  first.timeouts[0]();
  assert.equal(first.reloads(),1);

  const second=bootFixture({storage});
  assert.equal(second.ctx.AquaBoot.safeMode,true);
  second.error(error);
  assert.equal(second.ctx.AquaBoot.state,'failed');
  assert.equal(second.timeouts.length,0);
  assert.match(second.elements.err.textContent,/no driver diagnostic/);
});

test('context loss pauses startup and restoration cannot create an endless reload loop',()=>{
  const storage=new Map(), first=bootFixture({storage}); let prevented=false;
  first.elements.gl.dispatch('webglcontextlost',{preventDefault(){prevented=true;}});
  first.scripts[0].onload();
  assert.ok(prevented);
  assert.equal(first.ctx.AquaBoot.state,'lost');
  assert.equal(first.scripts.length,1);
  first.elements.gl.dispatch('webglcontextrestored');
  assert.equal(first.reloads(),1);
  first.timeouts[0]();
  assert.equal(first.reloads(),1,'the timeout cannot reload again after restoration');

  const second=bootFixture({storage});
  assert.equal(second.ctx.AquaBoot.safeMode,true);
  second.ctx.AquaBoot.firstFrame();
  assert.equal(storage.has('aqua.graphics.safe'),false,'safe mode is one-shot after a rendered frame');
  second.elements.gl.dispatch('webglcontextlost',{preventDefault(){}});
  second.elements.gl.dispatch('webglcontextrestored');
  assert.equal(second.reloads(),0);
  assert.equal(second.elements.failTitle.textContent,'Graphics restored');
  second.elements.safeGraphics.dispatch('click');
  assert.equal(storage.get('aqua.graphics.safe'),'1');
  assert.equal(second.reloads(),1);
});

test('a visible tab retries once even if the browser never restores the context',()=>{
  const f=bootFixture();
  f.ctx.document.hidden=true;
  f.elements.gl.dispatch('webglcontextlost',{preventDefault(){}});
  assert.equal(f.timeouts.length,1);
  f.timeouts[0]();
  assert.equal(f.reloads(),0,'do not restart while the tab is hidden');
  f.ctx.document.hidden=false;
  f.ctx.document.events.visibilitychange();
  assert.equal(f.reloads(),1);
  f.elements.gl.dispatch('webglcontextrestored');
  f.ctx.document.events.visibilitychange();
  assert.equal(f.reloads(),1,'late restoration cannot trigger a second reload');
});

test('manual low-memory retry works even when session storage is disabled',()=>{
  const f=bootFixture({blocked:true});
  f.error(new Error('test'));
  f.elements.safeGraphics.dispatch('click');
  assert.equal(new URL(f.assigned()).searchParams.get('aquaSafe'),'1');
  const next=bootFixture({blocked:true,href:'https://example.test/aqua/?other=1&aquaSafe=1#view'});
  assert.equal(next.ctx.AquaBoot.safeMode,true);
  const url=new URL(next.location.href);
  assert.equal(url.searchParams.get('aquaSafe'),null);
  assert.equal(url.searchParams.get('other'),'1');
  assert.equal(url.hash,'#view');
});

function shaderFixture(options={}){
  const calls={created:[],deleted:[],detached:[],programs:[],deletedPrograms:[]};
  let count=0;
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
    createShader(type){count++; if(options.nullShader===count) return null; const s={type};calls.created.push(s);return s;},
    shaderSource(){},compileShader(){},
    getShaderParameter(s){return s.type!==options.failShader;},
    getShaderInfoLog(){return options.shaderLog||null;},
    deleteShader(s){calls.deleted.push(s);},
    createProgram(){if(options.nullProgram) return null; const p={};calls.programs.push(p);return p;},
    attachShader(){},detachShader(p,s){calls.detached.push([p,s]);},linkProgram(){},
    getProgramParameter(){return !options.failLink;},getProgramInfoLog(){return options.linkLog||null;},
    deleteProgram(p){calls.deletedPrograms.push(p);}
  };
  const source=read('shaders.js');
  const helpers=source.slice(source.indexOf('function shaderFailure('),source.indexOf('const pWater='));
  const ctx=vm.createContext({gl});
  vm.runInContext(helpers+'\nglobalThis.api={program};',ctx);
  return {api:ctx.api,calls};
}

test('shader programs release temporary shaders and preserve actionable failure diagnostics',()=>{
  const good=shaderFixture();
  const program=good.api.program('vertex','fragment','island');
  assert.ok(program.u);
  assert.equal(good.calls.created.length,2);
  assert.equal(good.calls.detached.length,2);
  assert.equal(good.calls.deleted.length,2);
  assert.equal(good.calls.deletedPrograms.length,0);

  const bad=shaderFixture({failShader:2});
  assert.throws(()=>bad.api.program('vertex','fragment','island'),error=>{
    assert.equal(error.code,'GRAPHICS_RETRYABLE');
    assert.match(error.message,/island fragment shader.*no diagnostic/);
    return true;
  });
  assert.equal(bad.calls.deleted.length,2,'both the failed fragment and the compiled vertex are released');
  assert.equal(bad.calls.programs.length,0);

  const link=shaderFixture({failLink:true,linkLog:'bad varying'});
  assert.throws(()=>link.api.program('vertex','fragment','surf'),/surf graphics program: bad varying/);
  assert.equal(link.calls.deleted.length,2);
  assert.equal(link.calls.deletedPrograms.length,1);

  const noObject=shaderFixture({nullShader:1});
  assert.throws(()=>noObject.api.program('vertex','fragment','water'),error=>error.code==='GRAPHICS_RETRYABLE');
});

function targetFixture({failChecks=0,failTexture=0,zeroBufferReads=0,safe=false,coarse=false,width=800,height=600,limit=4096}={}){
  const canvas={width:300,height:150}, state={checks:0,textures:0,bufferReads:0,created:[],deleted:[],warnings:[]};
  function create(kind){const obj={kind,id:state.created.length};state.created.push(obj);return obj;}
  function remove(obj){if(obj) state.deleted.push(obj);}
  const gl={
    FRAMEBUFFER:1,RENDERBUFFER:2,TEXTURE_2D:3,TEXTURE7:7,MAX_TEXTURE_SIZE:8,MAX_RENDERBUFFER_SIZE:9,MAX_VIEWPORT_DIMS:10,
    FRAMEBUFFER_COMPLETE:0x8cd5,FRAMEBUFFER_INCOMPLETE_ATTACHMENT:0x8cd6,NO_ERROR:0,
    createFramebuffer:()=>create('framebuffer'),
    createRenderbuffer:()=>create('renderbuffer'),
    createTexture(){state.textures++;return state.textures===failTexture?null:create('texture');},
    deleteFramebuffer:remove,deleteRenderbuffer:remove,deleteTexture:remove,
    getParameter(p){return p===this.MAX_VIEWPORT_DIMS?[limit,limit]:limit;},
    checkFramebufferStatus(){state.checks++;return state.checks<=failChecks?this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:this.FRAMEBUFFER_COMPLETE;},
    getError:()=>0,isContextLost:()=>false
  };
  for(const name of ['bindFramebuffer','bindRenderbuffer','activeTexture','bindTexture','texImage2D','texParameteri','framebufferTexture2D','renderbufferStorage','framebufferRenderbuffer']) gl[name]=()=>{};
  Object.defineProperties(gl,{
    drawingBufferWidth:{get:()=>++state.bufferReads<=zeroBufferReads?0:canvas.width},
    drawingBufferHeight:{get:()=>canvas.height}
  });
  const window={devicePixelRatio:2,AquaBoot:{safeMode:safe,state:'loading',contextLost(){this.state='lost';}}};
  const ctx=vm.createContext({gl,canvas,window,innerWidth:width,innerHeight:height,Float32Array,Math,Infinity,
    matchMedia:()=>({matches:coarse}),addEventListener:()=>{},setTimeout:()=>{},console:{warn:msg=>state.warnings.push(msg)}});
  const ocean=read('ocean.js'), render=read('render.js');
  const targets=ocean.slice(ocean.indexOf('let scene=null, refl=null, post=null, motion=null, rW=0, rH=0;'));
  const sizing=render.slice(0,render.indexOf('function drawBalls('));
  vm.runInContext(targets+'\n'+sizing+`\nglobalThis.api={
    makeTargets,disposeTargets,resize,setQuality,
    start(){rendererStarted=true;resize();},
    snapshot(){return {w:curW,h:curH,actualPR,limit:allocationPixelLimit,pixels:targetPixels,targets:[scene,refl,post,motion].map(Boolean)};}
  };`,ctx);
  return {api:ctx.api,canvas,state};
}

test('incomplete targets are deleted and retried smaller; permanent failures stop after four attempts',()=>{
  const f=targetFixture({failChecks:1});
  f.api.start();
  let s=f.api.snapshot();
  assert.equal(f.state.checks,8,'one failed check and seven completed targets');
  assert.ok(s.w<1200&&s.h<900);
  assert.ok(s.targets.every(Boolean));
  assert.ok(f.state.deleted.length>=3,'partial framebuffer and textures were released');
  assert.equal(f.state.warnings.length,1);
  assert.ok(Number.isFinite(s.limit));
  f.api.resize();f.api.resize();
  s=f.api.snapshot();
  assert.ok(s.targets.every(Boolean));
  assert.ok(f.state.checks<=13,'the fallback size does not trigger an endless allocation loop');

  const bad=targetFixture({failChecks:99});
  assert.throws(()=>bad.api.start(),/Scene framebuffer is incomplete/);
  assert.equal(bad.state.checks,4);
  assert.ok(bad.api.snapshot().targets.every(x=>!x));
  assert.equal(bad.state.created.length,bad.state.deleted.length);
});

test('missing WebGL resources are detected and partial targets are cleaned up',()=>{
  const f=targetFixture({failTexture:2});
  assert.throws(()=>f.api.makeTargets(800,600),/Could not create the scene depth/);
  assert.equal(f.state.created.length,f.state.deleted.length);
  assert.ok(f.api.snapshot().targets.every(x=>!x));
});

test('an unavailable drawing buffer also retries at a smaller size',()=>{
  const f=targetFixture({zeroBufferReads:1});
  f.api.start();
  const s=f.api.snapshot();
  assert.equal(f.state.bufferReads,2);
  assert.ok(s.w<1200&&s.h<900);
  assert.ok(s.targets.every(Boolean));
});

test('sizing respects mobile, low-memory, and hardware limits',()=>{
  const mobile=targetFixture({coarse:true,width:1366,height:1024});mobile.api.start();
  let s=mobile.api.snapshot();assert.ok(s.w*s.h<=1800000);assert.equal(s.pixels,1800000);
  const safe=targetFixture({safe:true,width:1600,height:1000});safe.api.start();
  s=safe.api.snapshot();assert.ok(s.w*s.h<=650000);assert.ok(s.actualPR<=0.75);assert.equal(s.pixels,650000);
  const limited=targetFixture({width:3000,height:2000,limit:1024});limited.api.start();
  s=limited.api.snapshot();assert.ok(s.w<=1024&&s.h<=1024);
});

function frameFixture({throwRender=false,lost=false}={}){
  const result={scheduled:0,failed:0,rendered:0,first:0,lost:0};
  const boot={state:'running',canRender(){return this.state==='running';},
    fail(error){result.failed++;result.error=error.message;this.state='failed';},
    contextLost(){result.lost++;this.state='lost';},firstFrame(){result.first++;}};
  const ctx=vm.createContext({window:{AquaBoot:boot},gl:{isContextLost:()=>lost},
    performance:{now:()=>100},requestAnimationFrame:()=>{result.scheduled++;},
    document:{addEventListener(){}},result});
  const src=read('render.js'), loop=src.slice(src.indexOf('let lastT=performance.now()'));
  vm.runInContext(`
    let quality='auto',hqMode=false,pr=1,prCeil=1,maxPR=1,havePrev=false,frameInterval=0,paused=false,timeScale=1,sea=0,actualPR=1;
    const H=1/120,balls=[],Hooks={run(){}};
    function resize(){} function updateEnv(){} function updateWaves(){} function updateCamera(){} function physicsStep(){}
    function updateIslandSurf(){} function updateWindStreaks(){} function particlesStep(){} function updatePrecip(){} function uploadRipple(){}
    function render(){result.rendered++;${throwRender?"throw new ReferenceError(\"Cannot access 'pIsland' before initialization\");":''}}
    function sigWaveHeight(){return 0;} function updateStats(){} function uiReady(){}
    ${loop}
    globalThis.api={frame};
  `,ctx);
  return {api:ctx.api,result};
}

test('the animation loop schedules only after success and stops after an exception or context loss',()=>{
  const good=frameFixture();good.api.frame(116);good.api.frame(132);
  assert.equal(good.result.rendered,2);assert.equal(good.result.scheduled,2);assert.equal(good.result.first,1);
  const bad=frameFixture({throwRender:true});bad.api.frame(116);bad.api.frame(132);
  assert.equal(bad.result.rendered,1);assert.equal(bad.result.failed,1);assert.equal(bad.result.scheduled,0);
  assert.match(bad.result.error,/pIsland/);
  const lost=frameFixture({lost:true});lost.api.frame(116);lost.api.frame(132);
  assert.equal(lost.result.lost,1);assert.equal(lost.result.rendered,0);assert.equal(lost.result.scheduled,0);
});
