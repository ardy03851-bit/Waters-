'use strict';
/* The complete ripple field is still uploaded after every real change. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fixture(){
  const source=fs.readFileSync(path.join(__dirname,'../js/ocean.js'),'utf8');
  const section=source.slice(source.indexOf('const RN=192'),source.indexOf('/* ============================================================\n   Render targets'));
  const uploads=[];
  const gl=new Proxy({
    createTexture:()=>({}),
    texSubImage2D(...args){uploads.push(Array.from(args[8]));}
  },{get(target,key){if(key in target)return target[key];if(typeof key==='string'&&key.toUpperCase()===key)return 0;return ()=>{};}});
  const ctx=vm.createContext({gl,Float32Array,Math,isFinite});
  vm.runInContext(`${section}
    globalThis.api={addRipple,addFoam,addRing,ripAdd,rippleStep,resetRipples,uploadRipple,
      snapshot(){return {height:Array.from(cur),foam:Array.from(foamArr)};}};
  `,ctx);
  return {api:ctx.api,uploads};
}

function checkUpload(api,uploads){
  const state=api.snapshot(),data=uploads[uploads.length-1];
  assert.equal(data.length,state.height.length*2);
  for(let i=0;i<state.height.length;i++){
    assert.equal(data[i*2],state.height[i],`height at ${i}`);
    assert.equal(data[i*2+1],state.foam[i],`foam at ${i}`);
  }
}

test('unchanged ripples avoid uploads; every disturbance, step and reset remains exact',()=>{
  const {api,uploads}=fixture();
  api.uploadRipple();assert.equal(uploads.length,0,'the initial texture is already flat');
  api.addRipple(0,0,0.7,0.2);api.uploadRipple();
  assert.equal(uploads.length,1);checkUpload(api,uploads);
  assert.ok(uploads[0].some(value=>value>0));
  api.uploadRipple();assert.equal(uploads.length,1,'repeated renders do not upload unchanged data');
  api.addFoam(0.5,0,0.8,0.5);api.uploadRipple();
  assert.equal(uploads.length,2);checkUpload(api,uploads);
  api.addRing(0,0,1,0.3,0.1);api.uploadRipple();
  assert.equal(uploads.length,3);checkUpload(api,uploads);
  api.rippleStep();api.uploadRipple();
  assert.equal(uploads.length,4);checkUpload(api,uploads);
  api.resetRipples();api.uploadRipple();
  assert.equal(uploads.length,5);checkUpload(api,uploads);
  assert.ok(uploads[4].every(value=>value===0),'reset clears the GPU texture as well as both CPU states');
  api.addRipple(100,100,1,1);api.addFoam(100,100,1,1);api.addRing(100,100,1,0.2,1);api.uploadRipple();
  assert.equal(uploads.length,5,'out-of-grid effects do not trigger uploads');
  api.ripAdd(192*96+96,0.05);api.uploadRipple();
  assert.equal(uploads.length,6,'direct valid ripple injections invalidate the texture');checkUpload(api,uploads);
});
