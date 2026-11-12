'use strict';
/* Whole-engine smoke test without a GPU.

   The other suites boot one module at a time. This one loads every plain
   script in the real order against a stub WebGL 2 context and a small DOM,
   starts the renderer, renders frames, regenerates a Mossland archipelago and
   switches ships. It cannot prove a shader compiles on a real driver (the
   browser tests do that), but it does catch broken draw paths, missing
   uniforms, undefined helpers and allocation bugs across module boundaries.

   Run with: node --test tests/scene-smoke.test.js
*/
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'js',name+'.js'),'utf8');
const SCRIPTS=['core','engine','shaders','ocean','materials','environment','splash','surf','islands',
  'island-details','island-scenery','weather','physics','ship','quake','input','explore','voyage','audio','render','ui'];

function elementStub(id){
  const children=[];
  const el={
    id,style:{setProperty(){},removeProperty(){}},dataset:{},children,value:'0',
    textContent:'',hidden:false,disabled:false,offsetWidth:40,offsetLeft:0,offsetHeight:20,
    scrollTop:0,scrollIntoView(){},focus(){},blur(){},remove(){},
    classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},
      toggle(c,on){if(on===undefined) on=!this._s.has(c); if(on) this._s.add(c); else this._s.delete(c); return on;},
      contains(c){return this._s.has(c);}},
    setAttribute(){},getAttribute(){return null;},removeAttribute(){},
    addEventListener(){},removeEventListener(){},dispatchEvent(){},
    appendChild(child){children.push(child);return child;},removeChild(){},
    replaceChildren(){children.length=0;},querySelector(){return elementStub(id+'-q');},
    getContext(kind){
      if(kind==='2d') return {drawImage(){},fillRect(){},clearRect(){},imageSmoothingEnabled:false,
        imageSmoothingQuality:'low',getImageData:()=>({data:new Uint8ClampedArray(4),width:1,height:1}),
        putImageData(){},createImageData:()=>({data:new Uint8ClampedArray(4)}),save(){},restore(){}};
      return null;
    },
    toBlob(cb){cb&&cb({});},captureStream(){return {getTracks:()=>[],getVideoTracks:()=>[]};},
    querySelectorAll(){return [];},closest(){return null;},
    get firstChild(){
      if(!children.length) children.push(elementStub(id+'-c0'));
      return children[0];
    },
    get lastChild(){
      if(!children.length) children.push(elementStub(id+'-c0'));
      return children[children.length-1];
    },
    set innerHTML(html){
      children.length=0;
      const count=(String(html).match(/</g)||[]).length?4:0;
      for(let i=0;i<count;i++) children.push(elementStub(id+'-'+i));
    },get innerHTML(){return '';},
    fields:[]
  };
  el.appendChild=(child)=>{children.push(child);return child;};
  return el;
}

function glStub(state){
  let objects=0;
  const constants=new Proxy({},{get(){return 0;}});
  const base={
    FRAMEBUFFER:0x8d40,RENDERBUFFER:0x8d41,TEXTURE_2D:0x0de1,RGBA8:0x8058,RGBA:0x1908,
    UNSIGNED_BYTE:0x1401,DEPTH_COMPONENT24:0x81a6,DEPTH_COMPONENT:0x1902,UNSIGNED_INT:0x1405,
    FRAMEBUFFER_COMPLETE:0x8cd5,NO_ERROR:0,VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,
    COMPILE_STATUS:0x8b81,LINK_STATUS:0x8b82,TEXTURE0:0x84c0,TEXTURE1:0x84c1,TEXTURE2:0x84c2,
    TEXTURE3:0x84c3,TEXTURE4:0x84c4,TEXTURE5:0x84c5,TEXTURE6:0x84c6,TEXTURE7:0x84c7,
    TEXTURE8:0x84c8,TEXTURE9:0x84c9,TEXTURE10:0x84ca,TEXTURE11:0x84cb,TEXTURE12:0x84cc,
    TEXTURE13:0x84cd,TEXTURE14:0x84ce,TEXTURE15:0x84cf,
    MAX_TEXTURE_SIZE:0x0d33,MAX_RENDERBUFFER_SIZE:0x84e8,MAX_VIEWPORT_DIMS:0x0d3a,
    MAX_TEXTURE_IMAGE_UNITS:0x8872,TRIANGLES:4,TRIANGLE_STRIP:5,UNSIGNED_SHORT:0x1403,
    COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x100,ARRAY_BUFFER:0x8892,ELEMENT_ARRAY_BUFFER:0x8893,
    STATIC_DRAW:0x88e4,FLOAT:0x1406,LEQUAL:0x0203,LESS:0x0201,ONE:1,SRC_ALPHA:0x0302,
    ONE_MINUS_SRC_ALPHA:0x0303,REPEAT:0x2901,CLAMP_TO_EDGE:0x812f,LINEAR:0x2601,NEAREST:0x2600,
    LINEAR_MIPMAP_LINEAR:0x2703,DEPTH_TEST:0x0b71,BLEND:0x0be2,CULL_FACE:0x0b44,
    UNPACK_FLIP_Y_WEBGL:0x9240,DITHER:0x0bd0,POLYGON_OFFSET_FILL:0x8037,DEPTH_COMPONENT16:0x81a5,
    RG8:0x822b,RG:0x8227,READ_FRAMEBUFFER:0x8ca8,DRAW_FRAMEBUFFER:0x8ca9,
    createTexture(){return {kind:'texture',id:++objects};},
    createBuffer(){return {kind:'buffer',id:++objects};},
    createVertexArray(){return {kind:'vao',id:++objects};},
    createFramebuffer(){return {kind:'fb',id:++objects};},
    createRenderbuffer(){return {kind:'rb',id:++objects};},
    createShader(type){return {kind:'shader',type,id:++objects};},
    createProgram(){return {kind:'program',id:++objects,u:{}};},
    getShaderParameter(){return true;},getProgramParameter(){return true;},
    getShaderInfoLog(){return null;},getProgramInfoLog(){return null;},
    getUniformLocation(p,n){return {uniform:n};},
    getAttribLocation(){return 0;},
    getParameter(key){
      if(key===this.MAX_VIEWPORT_DIMS) return [4096,4096];
      if(key===this.MAX_TEXTURE_IMAGE_UNITS) return 16;
      return 4096;
    },
    getExtension(){return null;},
    getError(){return 0;},
    checkFramebufferStatus(){return this.FRAMEBUFFER_COMPLETE;},
    isContextLost(){return false;},
    readPixels(){},
    drawingBufferWidth:800,drawingBufferHeight:600
  };
  return new Proxy(base,{
    get(target,key){
      if(key in target) return target[key];
      if(typeof key==='symbol') return undefined;
      if(/^[A-Z0-9_]+$/.test(key)) return constants[key];
      return ()=>{};
    }
  });
}

function harness(){
  const elements=new Map(), frames=[], gl=glStub();
  const canvas=elementStub('gl');
  canvas.width=300; canvas.height=150;
  canvas.getContext=(kind)=>{
    if(kind==='webgl2') return gl;
    if(kind==='2d') return {drawImage(){},imageSmoothingEnabled:false,imageSmoothingQuality:'low',
      getImageData:()=>({data:new Uint8ClampedArray(4)})};
    return null;
  };
  const getElement=(id)=>{
    if(id==='gl') return canvas;
    if(!elements.has(id)) elements.set(id,elementStub(id));
    return elements.get(id);
  };
  const document={
    hidden:false,activeElement:null,
    body:elementStub('body'),
    documentElement:elementStub('html'),
    getElementById:getElement,
    querySelector:()=>elementStub('q'),
    querySelectorAll:()=>[],
    createElement:(tag)=>elementStub(tag),
    createElementNS:()=>elementStub('svg'),
    createTextNode:(text)=>({text}),
    addEventListener(){},removeEventListener(){},
    head:{appendChild(script){ if(script&&script.onload) script.onload(); }}
  };
  const storage={_m:new Map(),getItem(k){return this._m.has(k)?this._m.get(k):null;},
    setItem(k,v){this._m.set(k,String(v));},removeItem(k){this._m.delete(k);}};
  const location={href:'http://localhost:8000/',search:'',reload(){},assign(){}};
  class ImageStub{
    constructor(){this.width=1024;this.height=1024;this.decoding='';}
    set src(value){ this._src=value; if(this.onload) this.onload(); }
    get src(){ return this._src; }
  }
  const ctx=vm.createContext({
    console,Math,JSON,Number,Array,Object,String,Boolean,Date,Error,URL,
    Float32Array,Float64Array,Uint8Array,Uint16Array,Uint32Array,Int32Array,ArrayBuffer,Set,Map,
    Image:ImageStub,ImageData:class{},document,location,storage,
    localStorage:storage,sessionStorage:storage,
    innerWidth:1280,innerHeight:800,devicePixelRatio:2,
    performance:{now:()=>1000},
    requestAnimationFrame:(fn)=>{frames.push(fn);return frames.length;},
    cancelAnimationFrame(){},setTimeout:(fn)=>{return 1;},clearTimeout(){},
    matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
    addEventListener(){},removeEventListener(){},getComputedStyle:()=>({getPropertyValue:()=>''}),
    requestIdleCallback:(fn)=>1,cancelIdleCallback(){},
    navigator:{userAgent:'node',maxTouchPoints:0,hardwareConcurrency:4},
    AudioContext:undefined,webkitAudioContext:undefined,MediaRecorder:undefined,
    Blob:class{},URL:Object.assign(function(){},{createObjectURL:()=>'blob:',revokeObjectURL(){}})
  });
  ctx.window=ctx; ctx.globalThis=ctx; ctx.self=ctx;
  ctx.window.AquaBoot={state:'loading',safeMode:false,canRender(){return this.state==='running';},
    attachContext(){},firstFrame(){},fail(error){throw error;},contextLost(){}};
  return {ctx,gl,elements,getElement,canvas,frames,document};
}

function boot(){
  const h=harness();
  for(const name of SCRIPTS) vm.runInContext(read(name),h.ctx,{filename:'js/'+name+'.js',timeout:30000});
  vm.runInContext('AquaStart()',h.ctx,{timeout:30000});
  h.ctx.AquaBoot.state='running';
  return h;
}

test('every script boots against a stub WebGL 2 context and draws frames',()=>{
  const h=boot();
  const api=vm.runInContext('({balls,ballAtlas,islands,pShip:typeof pShip,bloom:typeof bloom})',h.ctx);
  assert.equal(api.balls.length,3,'the start-up balls are spawned');
  assert.equal(api.ballAtlas.ready,true,'the generated ball atlas uploads after its six images');
  assert.equal(api.ballAtlas.cols,3);
  assert.ok(h.frames.length>0,'the frame loop is scheduled');
  /* Drive two real frames: camera, simulation, every draw pass and post. */
  for(let i=0;i<2;i++){
    const frame=h.frames.shift();
    assert.equal(typeof frame,'function');
    frame(1032+i*16);
  }
  const effects=vm.runInContext('({w:bloom&&bloom.w,hasTargets:!!(bloom&&bloom.a.color&&bloom.b.color),'+
    'on:bloomOn,fxaa:fxaaOn,atlasTile:ballAtlas.tile})',h.ctx);
  assert.ok(effects.w>0,'the quarter-resolution bloom chain is allocated');
  assert.equal(effects.hasTargets,true);
  assert.equal(effects.on,true);assert.equal(effects.fxaa,true);
  assert.ok(effects.atlasTile>=160,'the atlas keeps a usable tile size');
  /* The public toggles must not leave the post pass in a broken state. */
  const off=vm.runInContext("const r=Aqua.post('bloom',false);Aqua.post('fxaa',false);r",h.ctx);
  assert.equal(off.bloom,false);
  const frameOff=h.frames.shift();frameOff(1200);
  const afterOff=vm.runInContext('({balls:balls.length})',h.ctx);
  assert.equal(afterOff.balls,3);
  const back=vm.runInContext("Aqua.post('bloom',true);Aqua.post('fxaa',true);({on:bloomOn,fxaa:fxaaOn})",h.ctx);
  assert.equal(back.on,true);assert.equal(back.fxaa,true);
  const after=vm.runInContext('({balls:balls.length})',h.ctx);
  assert.equal(after.balls,3);
});

test('the Mossland biome builds terraced terrain, plants and cascades without artefacts',()=>{
  const h=boot();
  const result=vm.runInContext(`(()=>{
    const seed=generateIslands(0x51f2a7,islandConfig({biome:'moss',count:3,trees:1,grass:1.4,flowers:1.2}));
    const land=islands.land;
    const heights=[];
    for(const I of land){
      for(let k=0;k<I.h.length;k+=97) heights.push(I.h[k]);
    }
    return {seed,count:land.length,biomes:land.map(I=>I.biome),max:Math.max(...heights),
      min:Math.min(...heights),trees:islands.treeCount,
      scenery:{ferns:islands.scenery.ferns.count,reeds:islands.scenery.reeds.count,
        mushrooms:islands.scenery.mushrooms.count,cushions:islands.scenery.cushions.count,
        cascades:islands.scenery.cascades.count},
      resolution:land[0].n};
  })()`,h.ctx,{timeout:60000});
  assert.equal(result.count,3);
  assert.ok(result.biomes.every(b=>b==='moss'));
  assert.ok(result.max<=28&&result.max>-30,'heights stay inside the shoreline map');
  assert.ok(result.trees>0,'mossland keeps some pines');
  assert.ok(result.scenery.ferns>0&&result.scenery.reeds>0&&result.scenery.mushrooms>0&&result.scenery.cushions>0,
    'all four new plant layers are planted');
  assert.ok(result.resolution>=130,'the dense mossland heightfield is used');
  /* The drawn frame must still survive a regenerated coast. */
  const frame=h.frames.shift(); frame(1400);
});

test('the ship catalogue re-proportions hull, deck and camera without breaking the pose',()=>{
  const h=boot();
  const result=vm.runInContext(`(()=>{
    /* The mesh asset itself is exercised by ship-quake.test.js; here the
       catalogue only needs the pose and the class scaling. */
    ship.enabled=true;ship.status='ready';ship.poseReady=false;ship.anchored=false;ship.throttle=1;updateShip(0,0);
    const out=[];
    for(let i=0;i<SHIP_CLASSES.length;i++){
      setShipClass(i);
      updateShip(0.016,0.016);
      const deck=shipPoint(0,1.75,0);
      const back=shipLocal(deck[0],deck[1],deck[2]);
      out.push({name:SHIP_CLASSES[i].name,scale:ship.hull.slice(),
        roundtrip:back.map(v=>Math.abs(v)<1e-6?0:+v.toFixed(4)),speed:ship.speed});
    }
    return out;
  })()`,h.ctx,{timeout:30000});
  assert.equal(result.length,8);
  for(const shipClass of result){
    const [x,y,z]=shipClass.roundtrip;
    assert.ok(Math.abs(x)<1e-4&&Math.abs(y-1.75)<1e-4&&Math.abs(z)<1e-4,
      shipClass.name+' keeps an inverse deck transform: '+JSON.stringify(shipClass.roundtrip));
  }
  const frame=h.frames.shift(); frame(2000);
});

test('sailing responds to points of sail, hull weight and heel',()=>{
  const h=boot();
  const result=vm.runInContext(`(()=>{
    const run=(heading,cls,wind,ang,seconds)=>{
      setShipClass(cls);
      /* The catalogue only needs the pose here; the mesh asset is covered by
         ship-quake.test.js, which loads the real geometry. */
      ship.enabled=true;ship.status='ready';
      ship.heading=heading;ship.speed=0;ship.throttle=1;ship.anchored=false;
      ship.rudder=0;ship.heel=0;ship.poseReady=false;ship.x=0;ship.z=0;
      envS.wind=wind;windAng=ang;
      for(let i=0;i<seconds*10;i++){simT+=0.1;updateShip(0.1,0.1);}
      return {speed:ship.speed,heel:ship.heel,point:ship.pointOfSail};
    };
    return {
      down:run(Math.PI,0,20,0,20),
      up:run(0,0,20,0,20),
      reach:run(Math.PI/2,0,20,0,20),
      clipper:run(Math.PI,5,20,0,20),
      galleon:run(Math.PI,7,20,0,20),
      beam:run(0,4,20,Math.PI/2,20),
      astern:run(Math.PI,4,20,0,20)
    };
  })()`,h.ctx);
  const r=result;
  assert.ok(r.down.speed>r.up.speed+0.30,
    'a following wind drives her harder than beating to windward: '+r.down.speed.toFixed(2)+' vs '+r.up.speed.toFixed(2));
  assert.ok(r.reach.speed>r.up.speed&&r.reach.speed<r.down.speed,'a reach sits between the two');
  assert.ok(Math.abs(r.down.point-1)<0.02&&Math.abs(r.up.point-0.6)<0.02,'point-of-sail factors are bounded');
  assert.ok(r.clipper.speed>r.galleon.speed+0.10,'the clipper outruns the galleon on the same course');
  assert.ok(r.beam.heel>0.05,'a beam wind lays her over');
  assert.ok(Math.abs(r.astern.heel)<0.02,'a following wind does not heel her');
  assert.ok(Math.abs(r.beam.heel)<=0.20,'heel stays inside the deck-settling limit');
});
