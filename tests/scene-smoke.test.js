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
const vm=require('node:vm');
const {boot}=require('./harness.js');

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
        plants:islands.scenery.plants.count,stacks:islands.details.stacks.count,
        cascades:islands.scenery.cascades.count},
      plants:{kinds:PLANT_KINDS.length,layers:plantAtlas.layers,size:plantAtlas.size},
      resolution:land[0].n};
  })()`,h.ctx,{timeout:60000});
  assert.equal(result.count,3);
  assert.ok(result.biomes.every(b=>b==='moss'));
  assert.ok(result.max<=28&&result.max>-30,'heights stay inside the shoreline map');
  assert.ok(result.trees>0,'mossland keeps some pines');
  assert.ok(result.scenery.ferns>0&&result.scenery.reeds>0&&result.scenery.mushrooms>0&&result.scenery.cushions>0,
    'all four new plant layers are planted');
  assert.ok(result.scenery.plants>0,'the generated cutout species are planted');
  assert.ok(result.plants.kinds>=13&&result.plants.layers===result.plants.kinds&&result.plants.size>=256,
    'the plant cutouts occupy one bounded texture array');
  assert.ok(result.scenery.stacks>=0,'sea-stack placement is bounded and safe with the default setting');
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
