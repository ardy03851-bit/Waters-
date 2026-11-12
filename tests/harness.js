'use strict';
/* Shared test harness without a GPU.

   The other suites boot one module at a time. This one loads every plain
   script in the real order against a stub WebGL 2 context and a small DOM,
   starts the renderer, renders frames, regenerates a Mossland archipelago and
   switches ships. It cannot prove a shader compiles on a real driver (the
   browser tests do that), but it does catch broken draw paths, missing
   uniforms, undefined helpers and allocation bugs across module boundaries.

   Both the smoke test and the boat suite boot the real scripts against these
   stubs; keeping one copy means the two suites cannot drift apart.
*/
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'js',name+'.js'),'utf8');
const SCRIPTS=['core','engine','shaders','ocean','materials','environment','splash','surf','islands',
  'island-details','island-scenery','vfx','weather','physics','kit','boats','ship','quake','input','explore','voyage','audio','render','ui'];

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
    /* The model kits are fetched only on request; a stub that rejects keeps
       tests offline and exercises the failed-load path instead. */
    fetch:()=>Promise.reject(new Error('offline test harness')),TextDecoder,
    Blob:class{constructor(){}},
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


module.exports={harness,boot,elementStub,glStub,SCRIPTS,read};
