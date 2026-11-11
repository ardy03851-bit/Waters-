'use strict';
/* CPU/GPU phase data must describe the same water; actual GLSL is also
   exercised in a WebGL 2 browser. Run: node --test tests/*.test.js */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('seeded swell phases stay reproducible and synchronized with physics',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../js/ocean.js'),'utf8');
  const noise=source.slice(source.indexOf('function hash2('),source.indexOf('function makeDetailTexture('));
  const model=source.slice(source.indexOf('let windAng=1.1;'),source.indexOf('/* ============================================================\n   Interactive ripple'));
  const ctx=vm.createContext({Math,Float32Array});
  vm.runInContext(`
    const G=9.81, clamp=(x,a,b)=>x<a?a:x>b?b:x, lerp=(a,b,t)=>a+(b-a)*t;
    ${noise}
    ${model}
    globalThis.api={setWaveSeed,updateWaves,waveSample,surfH,approxH,wv,uPhaseArr,uWArr};
  `,ctx);
  const api=ctx.api;
  api.setWaveSeed(123456); api.updateWaves(0.8);
  const first=Array.from(api.uPhaseArr);
  for(let i=0;i<8;i++){
    assert.ok(Math.abs(first[i]-api.wv[i].ph)<0.000001,'GPU phase matches the phase used by CPU wave sampling');
    assert.ok(Number.isFinite(api.uWArr[i*4+3]));
  }
  const samples=[[-9,4,1.5],[0,0,0],[22,-31,17]];
  const heights=samples.map(([x,z,t])=>api.surfH(x,z,t));
  for(const [x,z,t] of samples){
    const out={}; api.waveSample(x,z,t,true,out);
    assert.ok(Object.values(out).every(Number.isFinite));
    assert.ok(Number.isFinite(api.approxH(x,z,t)));
  }
  api.setWaveSeed(123456);
  assert.deepEqual(Array.from(api.uPhaseArr),first);
  assert.deepEqual(samples.map(([x,z,t])=>api.surfH(x,z,t)),heights);
  api.setWaveSeed(987654);
  assert.notDeepEqual(Array.from(api.uPhaseArr),first,'another seed produces a different sea');
  assert.notDeepEqual(samples.map(([x,z,t])=>api.surfH(x,z,t)),heights);
});
