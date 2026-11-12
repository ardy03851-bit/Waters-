'use strict';
/* A safely airborne ball has zero buoyancy at all five sample points. Compare
   the fast path with the original full sampling under swells and seaquakes. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..','js');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

function fixture(fullSampling){
  const ocean=read('ocean.js'),quake=read('quake.js');
  const noise=ocean.slice(ocean.indexOf('function hash2('),ocean.indexOf('function makeDetailTexture('));
  const waves=ocean.slice(ocean.indexOf('let windAng=1.1;'),ocean.indexOf('/* ============================================================\n   Interactive ripple'));
  const quakeModel=quake.slice(quake.indexOf('const quake='),quake.indexOf('function setQuakeUniform('));
  const math=Object.create(Math);let randomSeed=0x12345678;
  math.random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};
  const ctx=vm.createContext({Math:math,Float32Array,console});
  vm.runInContext(`
    const G=9.81,RHO_W=1000,RHO_A=1.2;
    const clamp=(x,a,b)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t;
    const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    const islands={active:false};
    function addRipple(){} function addFoam(){} function rippleStep(){}
    function splash(){} function breach(){} function drip(){} function wakeSpray(){} function waterBalloonBurst(){}
    ${noise}
    ${waves}
    ${quakeModel}
    ${read('physics.js')}
    let calls=0;const originalSample=waveSample;
    waveSample=function(...args){calls++;return originalSample(...args);};
    globalThis.api={spawnBall,stepBall,
      configure(sea,strength,time){
        setWaveSeed(123456);updateWaves(sea);simT=time;
        quake.sea=strength?{x:3,z:-2,start:time-1,strength}:null;
        const bound=waveHeightBound+seaQuakeHeightBound();
        if(${fullSampling}) waveHeightBound=Infinity;
        return bound;
      },
      advance(ball){simT+=1/240;stepBall(ball,1/240);},
      resetCalls(){calls=0;},get calls(){return calls;}
    };
  `,ctx);
  return ctx.api;
}
function snap(ball){return JSON.stringify(ball);}

test('safely airborne balls use one wave sample with identical physics, including a seaquake',()=>{
  for(const strength of [0,0.3,1.5]){
    const fast=fixture(false),full=fixture(true);
    const bound=fast.configure(1,strength,2);full.configure(1,strength,2);
    const a=fast.spawnBall(2,bound+2,-1,0,1,-3,0.4),b=full.spawnBall(2,bound+2,-1,0,1,-3,0.4);
    fast.resetCalls();full.resetCalls();fast.stepBall(a,1/240);full.stepBall(b,1/240);
    assert.equal(fast.calls,1);assert.equal(full.calls,5);
    assert.equal(snap(a),snap(b),'all ball state matches the original five samples exactly');
  }
});

test('fast and full wave sampling agree across heights, sea states and a falling transition',()=>{
  const fast=fixture(false),full=fixture(true);
  for(const sea of [0,0.4,1]) for(const strength of [0,0.3,1.5]){
    const bound=fast.configure(sea,strength,2);full.configure(sea,strength,2);
    for(const bottom of [-8,-1,0,bound-0.01,bound+0.01,bound+2]){
      const a=fast.spawnBall(3,0,-2,0,0.8,-1.5,-0.3),b=full.spawnBall(3,0,-2,0,0.8,-1.5,-0.3);
      a.y=bottom+a.r;b.y=bottom+b.r;
      fast.stepBall(a,1/240);full.stepBall(b,1/240);
      assert.equal(snap(a),snap(b),`sea ${sea}, quake ${strength}, bottom ${bottom}`);
    }
  }
  const bound=fast.configure(0.8,1.5,2);full.configure(0.8,1.5,2);
  const a=fast.spawnBall(2,bound+3,-2,0,0,-12,0),b=full.spawnBall(2,bound+3,-2,0,0,-12,0);
  for(let i=0;i<200;i++){
    fast.advance(a);full.advance(b);
    assert.equal(snap(a),snap(b),`falling physics step ${i}`);
  }
});
