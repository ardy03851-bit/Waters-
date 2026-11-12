'use strict';
/* Regression tests for simultaneous contacts and burst-ball cleanup. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fixture(){
  const source=fs.readFileSync(path.join(__dirname,'../js/physics.js'),'utf8');
  const ctx=vm.createContext({Math,Float32Array,console});
  vm.runInContext(`
    const G=9.81,RHO_W=1000,RHO_A=1.2;
    const clamp=(x,a,b)=>x<a?a:x>b?b:x;
    const islands={active:false};let bursts=0,burstAction=()=>{};
    function waveSample(x,z,t,full,out){Object.assign(out,{h:0,vx:0,vy:0,vz:0,ax:0,az:0});}
    function waterBalloonBurst(){bursts++;burstAction();}
    function rippleStep(){} function addRipple(){} function addFoam(){}
    function splash(){} function breach(){} function drip(){} function wakeSpray(){}
    ${source}
    globalThis.api={balls,spawnBall,collide,physicsStep,
      get bursts(){return bursts;}, onBurst(fn){burstAction=fn;}, setGrab(b){grab={ball:b};b.grab={x:b.x,y:b.y,z:b.z};},
      hasGrab(){return !!grab;}};
  `,ctx);
  return ctx.api;
}

function contactBall(x,vx,type=0){
  return {x,y:5,z:0,vx,vy:0,vz:0,wx:0,wy:0,wz:0,r:0.4,im:1,I:1,e:0.8,type,frac:0,wh:0,dead:false};
}

test('a balloon burst does not skip unrelated simultaneous collisions',()=>{
  for(const balloonFirst of [true,false]){
    const api=fixture();
    const a=contactBall(0,5,balloonFirst?6:0),b=contactBall(0.5,-5,balloonFirst?0:6);
    const c=contactBall(4,2),d=contactBall(4.5,-2);
    api.balls.push(a,b,c,d);
    api.collide();
    assert.equal(api.bursts,1);
    assert.equal(balloonFirst?a.dead:b.dead,true);
    assert.ok(c.vx<0&&d.vx>0,'the other pair still bounces in this physics step');
  }
});

test('a burst hook may clear balls during the contact pass',()=>{
  const api=fixture();
  api.balls.push(contactBall(0,5,0),contactBall(0.5,-5,6),contactBall(4,2),contactBall(4.5,-2));
  api.onBurst(()=>{api.balls.length=0;});
  assert.doesNotThrow(()=>api.collide());
  assert.equal(api.bursts,1);assert.equal(api.balls.length,0);
});

test('burst balloons leave the simulation immediately and cannot burst twice',()=>{
  const api=fixture();
  const balloon=api.spawnBall(0,5,0,6,5,0,0);
  api.spawnBall(0.5,5,0,0,-5,0,0);
  api.setGrab(balloon);
  api.physicsStep();
  assert.equal(api.bursts,1);
  assert.equal(api.balls.includes(balloon),false,'a popped ball is removed in the same step');
  assert.equal(api.hasGrab(),false,'a popped grabbed ball is released');
  api.physicsStep();
  assert.equal(api.bursts,1);
});
