'use strict';
/* Advanced VFX and the night pass: level plumbing, safe-mode clamp and the
   seeded firefly population. Shader compilation is covered by the smoke test
   and the static GLSL check; this file exercises the CPU state and budgets. */
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {boot}=require('./harness.js');

test('advanced VFX levels are exposed, clamped and safe-mode aware',()=>{
  const h=boot();
  const run=(code)=>vm.runInContext(code,h.ctx,{timeout:60000});
  assert.equal(run('S.vfx'),'enhanced','the shipped default enables the upgrade');
  assert.equal(run('vfxLevel'),1);
  assert.deepEqual(JSON.parse(run('JSON.stringify(Aqua.vfx().levels)')),['off','enhanced','cinematic']);

  let r=JSON.parse(run("JSON.stringify(Aqua.vfx('cinematic'))"));
  assert.equal(r.level,'cinematic');
  assert.equal(run('vfxLevel'),2);
  r=JSON.parse(run("JSON.stringify(Aqua.vfx('off'))"));
  assert.equal(r.level,'off'); assert.equal(run('vfxLevel'),0);
  r=JSON.parse(run("JSON.stringify(Aqua.vfx('bogus'))"));
  assert.equal(r.level,'enhanced','an unknown name falls back to enhanced');
  assert.equal(run('vfxLevel'),1);

  /* Low-memory mode must never pay for the extra passes. */
  run('AquaBoot.safeMode=true');
  r=JSON.parse(run("JSON.stringify(Aqua.vfx('cinematic'))"));
  assert.equal(r.level,'off'); assert.equal(run('vfxLevel'),0);
  run('AquaBoot.safeMode=false');
  assert.equal(JSON.parse(run("JSON.stringify(Aqua.vfx('enhanced'))")).level,'enhanced');
});

test('a clear midnight has a moon, lifted ambience and a seeded firefly cloud',()=>{
  const h=boot();
  const run=(code)=>vm.runInContext(code,h.ctx,{timeout:60000});
  run("env.season=1;env.hour=0;env.cloud=0;env.precip=0;env.weather='clear';envS.cloud=0;envS.precip=0;updateEnv(30,0);");
  const night=JSON.parse(run('JSON.stringify({night:sky.night,moonUp:sky.moonUp,amb:sky.ambLum,disc:sky.moonDisc[0],zen:sky.zenith,hor:sky.horizon})'));
  assert.ok(night.night>0.8,'a clear midnight is fully night');
  assert.ok(night.moonUp>0.5&&night.disc>0.5,'the moon lights the scene');
  assert.ok(night.amb>0.05,'moonlight lifts the ambient term above the old near-black night');
  assert.ok(night.zen[2]>night.zen[0]*2,'the night zenith stays blue rather than neutral black');

  run("Aqua.vfx('cinematic'); generateIslands(0x5eed1234,islandConfig({count:3,biome:'moss'}));");
  const count=run('buildFireflies(); fireflyCount');
  assert.ok(count>20,'night fireflies are seeded over the islands');
  let bad=0;
  for(let i=0;i<count;i++){
    const x=run(`fireflyData[${i*4}]`),y=run(`fireflyData[${i*4+1}]`),z=run(`fireflyData[${i*4+2}]`);
    if(!(Number.isFinite(x+y+z))) bad++;
    if(run(`islandGround(${x},${z})`)>y+0.01) bad++;
  }
  assert.equal(bad,0,'every firefly floats above the sampled ground');
  /* They are a night effect: the same call at noon builds nothing. */
  run("env.hour=12;env.cloud=0;envS.cloud=0;updateEnv(30,0);drawVFX();");
  assert.equal(run('sky.night'),0);
});

test('night lights ride on the fleet and the ship, and switch off by day',()=>{
  const h=boot();
  const run=(code)=>vm.runInContext(code,h.ctx,{timeout:60000});
  run("env.hour=0.5;env.cloud=0;envS.cloud=0;envS.precip=0;updateEnv(30,0);");
  run("boats.enabled=true;boats.status='ready';boats.list=[{x:6,y:0,z:4,height:2.4,index:0},{x:-8,y:0,z:9,height:1.4,index:1}];");
  run("ship.enabled=true;ship.status='ready';ship.x=2;ship.y=0;ship.z=1;ship.classScale=1;");
  run('updateNightLights();');
  assert.equal(run('lightCount'),7,'two cabin lights + two mastheads + three ship lights');
  assert.equal(run('drawVFX(); lightCount'),7,'the draw keeps the same light list');
  run("env.hour=12;env.cloud=0;envS.cloud=0;updateEnv(30,0);updateNightLights();");
  assert.equal(run('lightCount'),0,'daylight has no harbour lights');
});
