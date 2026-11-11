'use strict';
/* CPU-side lifecycle and budget checks. The real shaders and blending are
   exercised separately in a WebGL 2 browser. Run: node --test tests/*.test.js */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fixture(){
  const gl=new Proxy({createBuffer:()=>({}),createVertexArray:()=>({})},{get(target,key){
    if(key in target) return target[key];
    if(typeof key==='string'&&key.toUpperCase()===key) return 0;
    return ()=>{};
  }});
  const ctx=vm.createContext({gl,console,Math,Float32Array,Uint8Array,Uint16Array,
    HDR:'',COMMON:'',program:()=>({}),L:()=>null});
  const root=path.join(__dirname,'..','js');
  vm.runInContext(`
    const G=9.81,RHO_W=1000;
    const clamp=(x,a,b)=>x<a?a:x>b?b:x;
    let grav=G, simT=0, windX=0, windZ=0, hqMode=false;
    const islands={active:true}, balls=[], wv=[{A:1}];
    function surfH(){return -100;}
    function addFoam(){} function addRing(){} function addRipple(){}
    ${fs.readFileSync(path.join(root,'splash.js'),'utf8')}
    ${fs.readFileSync(path.join(root,'surf.js'),'utf8')}
    globalThis.api={
      cliffSplash,crownSurfSheet,jetSurfSheet,clearCliffSurf,clearSplashes,
      tick(dt){simT+=dt;particlesStep(dt);},
      snapshot(){return {
        sheets:surfSheets.map(s=>({...s})), foam:coastFoam.map(s=>({...s})),
        events:cliffEvents.length, particles:pCount,
        largestDrop:Math.max(0,...Array.from(PSize.slice(0,pCount)))
      };},
      setGravity(g){grav=g;}
    };
  `,ctx);
  return ctx.api;
}

test('breaking sheets, fine spray and foam age, pause, clear and stay bounded',()=>{
  const api=fixture();
  api.cliffSplash(5,0,3,0,1,1);
  let state=api.snapshot();
  assert.equal(state.sheets.length,2);
  assert.equal(state.foam.length,1);
  assert.ok(state.particles>100&&state.particles<600,'a breaker uses fine spray, not an oversized particle cloud');
  assert.ok(state.largestDrop<0.8,'even aerosol puffs stay modest');
  const age=state.sheets[0].age;
  api.tick(0);
  assert.equal(api.snapshot().sheets[0].age,age,'pause does not age effects');
  api.tick(0.5);
  state=api.snapshot();
  assert.equal(state.sheets[0].age,0.5);
  assert.equal(state.foam[0].age,0.5);

  api.crownSurfSheet(0,0,0,0.6,12);
  api.jetSurfSheet(0,0,0,0.6,7);
  api.clearCliffSurf();
  state=api.snapshot();
  assert.deepEqual(Array.from(state.sheets,s=>s.kind).sort(),[1,2],'regenerating islands leaves ball splashes alone');
  assert.equal(state.foam.length,0);
  assert.equal(state.events,0);

  for(let i=0;i<100;i++) api.cliffSplash(i,0,0,0,1,1);
  state=api.snapshot();
  assert.ok(state.sheets.length<=48);
  assert.ok(state.foam.length<=24);
  assert.ok(state.particles<=16000);
  api.tick(6);
  state=api.snapshot();
  assert.equal(state.sheets.length,0);
  assert.equal(state.foam.length,0);
  api.clearSplashes();
  assert.equal(api.snapshot().particles,0);
});

test('sheet lifetimes are finite under different gravity settings',()=>{
  const api=fixture();
  for(const gravity of [1.62,9.81,24.79]){
    api.setGravity(gravity);
    api.cliffSplash(0,0,0,1,0,0.6);
    api.crownSurfSheet(0,0,0,0.5,10);
    api.jetSurfSheet(0,0,0,0.5,6);
    assert.ok(api.snapshot().sheets.every(s=>Number.isFinite(s.life)&&s.life>0&&s.life<=2.5));
    api.clearSplashes();
  }
});
