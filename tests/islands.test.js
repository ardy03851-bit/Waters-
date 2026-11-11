'use strict';
/* Run with: node --test tests/islands.test.js
   These CPU-side tests use a small WebGL stub; the real shaders and render
   passes should also be exercised in a WebGL 2 browser. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fixture(){
  const deleted={buffers:0,vaos:0};
  let boundBuffer=null;
  const gl=new Proxy({
    createTexture:()=>({}),createBuffer:()=>({}),createVertexArray:()=>({}),
    bindBuffer:(_target,buffer)=>{boundBuffer=buffer;},
    bufferData:(_target,data)=>{if(boundBuffer&&ArrayBuffer.isView(data)) boundBuffer.data=Array.from(data);},
    deleteBuffer:()=>deleted.buffers++,deleteVertexArray:()=>deleted.vaos++,
    getExtension:()=>null
  },{get(target,key){
    if(key in target) return target[key];
    if(typeof key==='string'&&key.toUpperCase()===key) return 0;
    return ()=>{};
  }});
  class ImageStub{ set src(value){ this.url=value; } }
  const ctx=vm.createContext({gl,Image:ImageStub,console,Uint8Array,Uint16Array,Float32Array,Math,
    HDR:'',COMMON:'',program:()=>({}),L:()=>null,hits:[],deleted,
    cliffSplash:(...args)=>ctx.hits.push(args),audioCliff:()=>{},audioKnock:()=>{},waterBalloonBurst:()=>{}});
  const root=path.join(__dirname,'..');
  const ocean=fs.readFileSync(path.join(root,'js/ocean.js'),'utf8');
  const noise=ocean.slice(ocean.indexOf('function hash2('),ocean.indexOf('function makeDetailTexture('));
  const islands=fs.readFileSync(path.join(root,'js/islands.js'),'utf8');
  const details=fs.readFileSync(path.join(root,'js/island-details.js'),'utf8');
  const scenery=fs.readFileSync(path.join(root,'js/island-scenery.js'),'utf8');
  const physics=fs.readFileSync(path.join(root,'js/physics.js'),'utf8');
  vm.runInContext(`
    const G=9.81, RHO_W=1000, RHO_A=1.2;
    const clamp=(x,a,b)=>x<a?a:x>b?b:x;
    const lerp=(a,b,t)=>a+(b-a)*t;
    const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    let sea=0.2, windAng=1.1; const sky={storm:0}; let eye=[0,40,65];
    function surfH(x,z,t){return Math.sin(t*1.9+x*0.19+z*0.23);}
    ${noise}
    ${islands}
    ${details}
    ${scenery}
    ${physics}
    globalThis.api={islands,islandConfig,islandProfile,generateIslands,removeIslands,islandGround,collideIsland,updateIslandSurf,rebuildIslandTrees,rebuildIslandDetails,
      setConditions(s,storm){sea=s;sky.storm=storm;},
      tick(dt){simT+=dt;updateIslandSurf(dt);},
      resetTime(){simT=0;islands.nextCrash=0;for(const p of islands.coast){p.last=0;p.cool=0;}},
      enableFastLayout(){
        makeIslandMesh=I=>{I.vao=null;I.vb=null;I.ib=null;};
        makeIslandMap=()=>{}; makeIslandTrees=()=>{}; makeIslandCoast=()=>{}; makeIslandDetails=()=>{}; makeIslandScenery=()=>{};
      }
    };
  `,ctx,{timeout:20000});
  return {api:ctx.api,hits:ctx.hits,deleted};
}

/* Count connected dry-land components using a one-metre raster. */
function landComponents(api){
  const n=141, origin=-70, cells=new Uint8Array(n*n), stack=[];
  for(let z=0;z<n;z++) for(let x=0;x<n;x++){
    if(api.islandGround(origin+x,origin+z)>0) cells[z*n+x]=1;
  }
  const sizes=[];
  for(let k=0;k<cells.length;k++){
    if(!cells[k]) continue;
    cells[k]=0;stack.push(k);let count=0;
    while(stack.length){
      const p=stack.pop(),x=p%n,z=Math.floor(p/n);count++;
      const neighbors=[];
      if(x>0) neighbors.push(p-1); if(x<n-1) neighbors.push(p+1);
      if(z>0) neighbors.push(p-n); if(z<n-1) neighbors.push(p+n);
      for(const q of neighbors) if(cells[q]){cells[q]=0;stack.push(q);}
    }
    if(count>=10) sizes.push(count);
  }
  return sizes.sort((a,b)=>b-a);
}

test('archipelagos are reproducible, separated, collidable, and storm-driven',()=>{
  const {api,hits,deleted}=fixture();
  for(const seed of [1,123456,0xdeadbeef,0x80000000]){
    api.generateIslands(seed);
    assert.equal(api.islands.active,true);
    assert.equal(api.islands.land.length,5);
    assert.ok(api.islands.coast.length>80,'exposed cliffs were sampled');
    assert.ok(api.islands.treeCount>10,'vegetation was placed');
    assert.equal(landComponents(api).length,5,`seed ${seed} must produce five separate islands`);
    for(let i=0;i<api.islands.land.length;i++) for(let j=0;j<i;j++){
      const a=api.islands.land[i],b=api.islands.land[j];
      const minimum=1.36*(Math.max(a.rx,a.rz)+Math.max(b.rx,b.rz))+1.5;
      assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=minimum-1e-6,'coastline bounds leave a water channel');
    }
    for(const island of api.islands.land){
      assert.ok(api.islandGround(island.x,island.z)>2,'each island has above-water terrain');
      assert.ok(island.indexCount>0);
    }
    assert.equal(api.islandGround(79,79),-1000,'open ocean has no land collision');
  }

  api.generateIslands(123456);
  const first=api.islands.land.map(i=>[i.x,i.z,api.islandGround(i.x,i.z)]);
  const firstTrees=api.islands.trees.buffer.data.slice();
  api.generateIslands(123456);
  const second=api.islands.land.map(i=>[i.x,i.z,api.islandGround(i.x,i.z)]);
  assert.deepEqual(first,second,'same seed must recreate the same terrain');
  assert.deepEqual(firstTrees,api.islands.trees.buffer.data,'tree placement and variations are seeded too');
  assert.ok(api.islands.treeCount>100,'the archipelago has varied forest clusters');
  for(let i=0;i<firstTrees.length;i+=8){
    const [x,y,z,height]=firstTrees.slice(i,i+4);
    assert.ok(height>=1.8&&height<=5.2,'trees vary in height');
    assert.ok(Math.abs(y+height*0.025-api.islandGround(x,z))<0.001,'each trunk is rooted on the sampled terrain');
    for(let j=0;j<i;j+=8){
      const dx=x-firstTrees[j],dz=z-firstTrees[j+2],min=0.62+0.08*Math.min(height,firstTrees[j+3]);
      assert.ok(dx*dx+dz*dz>=min*min-0.0001,'tree trunks do not overlap');
    }
  }
  assert.ok(deleted.vaos>=6&&deleted.buffers>=11,'regeneration releases old GPU meshes');

  const I=api.islands.land[0],h=api.islandGround(I.x,I.z);
  const ball={x:I.x,y:h+0.2,z:I.z,vx:0,vy:-5,vz:0,wx:0,wy:0,wz:0,r:0.5,e:0.5,type:0};
  const beforeY=ball.y;
  api.collideIsland(ball,1/240);
  assert.ok(ball.y>beforeY,'terrain separates a penetrating ball');
  assert.ok(ball.vy>-5,'terrain applies a collision impulse');
  assert.ok(Number.isFinite(ball.x+ball.y+ball.z+ball.vx+ball.vy+ball.vz));
  const oceanBall={x:70,y:2,z:70,vx:1,vy:-2,vz:0,wx:0,wy:0,wz:0,r:0.5,e:0.5,type:0};
  api.collideIsland(oceanBall,1/240);
  assert.equal(oceanBall.y,2,'open ocean remains unaffected');

  api.resetTime();api.setConditions(0.2,0);
  for(let i=0;i<600;i++) api.tick(1/60);
  assert.equal(hits.length,0,'calm water does not produce cliff crashes');
  api.resetTime();api.setConditions(0.95,1);
  for(let i=0;i<1200;i++) api.tick(1/60);
  assert.ok(hits.length>=3,'rising storm crests produce cliff splashes');
  assert.ok(hits.every(hit=>hit[5]>=0.35&&hit[5]<=1.25));
  const beforeDisabled=hits.length;
  api.islands.options.surf=0; api.resetTime();
  for(let i=0;i<600;i++) api.tick(1/60);
  assert.equal(hits.length,beforeDisabled,'zero cliff-surf intensity suppresses new impacts');
  api.islands.options.surf=1;
  const beforePause=hits.length;
  for(let i=0;i<100;i++) api.tick(0);
  assert.equal(hits.length,beforePause,'paused simulation creates no splashes');
  api.removeIslands();
  for(let i=0;i<120;i++) api.tick(1/60);
  assert.equal(hits.length,beforePause,'removed islands create no splashes');
  assert.equal(api.islandGround(I.x,I.z),-1000);
});


test('coast styles, independent detail layers and rooted placements are seeded and configurable',()=>{
  const {api,deleted}=fixture();
  const seed=0x789abcde;
  api.generateIslands(seed,{style:'coves',count:3,trees:0,grass:0,rocks:0,birds:false});
  assert.equal(api.islands.land.length,3);
  assert.equal(api.islands.treeCount,0);
  assert.equal(api.islands.details.grass.count,0);
  assert.equal(api.islands.details.rocks.count,0);
  assert.equal(api.islands.options.birds,false);
  assert.equal(landComponents(api).length,3,'configurable island counts remain separate');

  api.generateIslands(seed,{style:'wild'});
  const trees=api.islands.trees.buffer.data.slice();
  const rocks=api.islands.details.rocks.instances.data.slice();
  const grass=api.islands.details.grass.instances.data.slice();
  const birds=api.islands.details.birds.instances.data.slice();
  const shape=api.islands.land.map(I=>[I.x,I.z,api.islandGround(I.x,I.z)]);
  assert.ok(rocks.length>80&&grass.length>1000&&birds.length>40,'new island details have bounded, nonempty populations');
  assert.ok(rocks.length/8<400&&grass.length/8<3000&&birds.length/8<=20);
  for(let i=0;i<rocks.length;i+=8){
    assert.ok(Math.abs(rocks[i+1]+rocks[i+3]*0.42-api.islandGround(rocks[i],rocks[i+2]))<0.0001,'boulders are partly buried at ground height');
  }
  for(let i=0;i<grass.length;i+=8){
    assert.ok(Math.abs(grass[i+1]+0.035-api.islandGround(grass[i],grass[i+2]))<0.0001,'grasses are rooted in the collision heightfield');
  }
  api.generateIslands(seed,{style:'wild'});
  assert.deepEqual(api.islands.trees.buffer.data,trees);
  assert.deepEqual(api.islands.details.rocks.instances.data,rocks);
  assert.deepEqual(api.islands.details.grass.instances.data,grass);
  assert.deepEqual(api.islands.details.birds.instances.data,birds);
  assert.deepEqual(api.islands.land.map(I=>[I.x,I.z,api.islandGround(I.x,I.z)]),shape);

  const originalLand=api.islands.land[0], originalCoast=api.islands.coast;
  api.rebuildIslandTrees(api.islandConfig({trees:0}));
  assert.equal(api.islands.treeCount,0);
  api.rebuildIslandDetails(api.islandConfig({grass:0}));
  assert.equal(api.islands.details.grass.count,0);
  assert.equal(api.islands.land[0],originalLand,'detail-only updates retain terrain meshes');
  assert.equal(api.islands.coast,originalCoast,'detail-only updates do not clear cliff surf sources');
  assert.deepEqual(api.islands.details.rocks.instances.data,rocks,'detail-only changes preserve independent rock placement');

  api.generateIslands(seed,{style:'wild',trees:0,grass:0});
  assert.deepEqual(api.islands.details.rocks.instances.data,rocks,'vegetation changes do not reshuffle rocks');
  assert.deepEqual(api.islands.details.birds.instances.data,birds,'detail layers have independent random streams');
  api.generateIslands(seed,{style:'highlands'});
  assert.notDeepEqual(api.islands.land.map(I=>api.islandGround(I.x,I.z)),shape.map(v=>v[2]),'style changes the terrain');
  assert.equal(landComponents(api).length,5,'highland shores keep their channels');
  const invalid=api.islandConfig({style:'unknown',count:100,trees:-1,grass:NaN,wind:8,surf:-2});
  assert.equal(invalid.style,'wild'); assert.equal(invalid.count,5); assert.equal(invalid.trees,0);
  assert.equal(invalid.grass,1); assert.equal(invalid.wind,1.5); assert.equal(invalid.surf,0);
  const buffersBefore=deleted.buffers,vaosBefore=deleted.vaos;
  api.removeIslands();
  assert.equal(api.islands.details,null);
  assert.ok(deleted.buffers-buffersBefore>=6&&deleted.vaos-vaosBefore>=4,'all detail buffers and VAOs are released');
});


test('many seeded layouts stay within the shoreline map and keep conservative channels',()=>{
  const {api}=fixture(); api.enableFastLayout();
  const layouts=new Set();
  for(let k=0;k<2000;k++){
    const seed=Math.imul(k+1,0x9e3779b1)>>>0;
    api.generateIslands(seed,{coast:1.2});
    const land=api.islands.land;
    layouts.add(`${Math.round(land[0].x)},${Math.round(land[0].z)}`);
    for(let i=0;i<land.length;i++){
      const a=land[i], r=1.36*Math.max(a.rx,a.rz);
      assert.ok(Math.abs(a.x)+r<80&&Math.abs(a.z)+r<80,`seed ${seed}: land stays within the shoreline map`);
      for(let j=0;j<i;j++){
        const b=land[j],minimum=1.36*(Math.max(a.rx,a.rz)+Math.max(b.rx,b.rz))+1.5;
        assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=minimum-1e-6,`seed ${seed}: separated land bounds`);
      }
    }
  }
  assert.ok(layouts.size>200,`the archipelago layout varies substantially between seeds (${layouts.size} positions)`);
});

test('extreme coastal controls keep islands visible and detail budgets finite',()=>{
  const {api}=fixture();
  for(const [seed,options] of [
    [19,{style:'coves',relief:0.6,coast:1.2,beach:1.5,trees:1.7,treeScale:1.4,grass:1.5,rocks:1.5}],
    [0xf02a33,{style:'highlands',relief:1.45,coast:0.5,beach:0.5,trees:0.4,grass:0.3,rocks:0.3}],
    [0xe12003,{biome:'alpine',style:'highlands',features:1.5,relief:1.45,coast:0.5,trees:0.4,grass:0.3,rocks:0.3}]
  ]){
    api.generateIslands(seed,options);
    assert.equal(landComponents(api).length,5,`extreme ${options.style} settings leave five separate islands`);
    assert.ok(api.islands.land.every(I=>api.islandGround(I.x,I.z)>0),'each island retains dry ground');
    assert.ok(api.islands.treeCount<1000&&api.islands.details.grass.count<3000&&api.islands.details.rocks.count<400);
    assert.ok(api.islands.land.every(I=>I.h.every(h=>Number.isFinite(h)&&h<=28)),'heightfields stay finite and within the shoreline map range');
  }
});

test('each biome changes the landform and ecology without breaking collision or water channels',()=>{
  const {api}=fixture(), seed=0x1234abcd, shapes=new Set();
  let layout=null;
  for(const biome of ['temperate','tropical','volcanic','alpine','desert']){
    api.generateIslands(seed,{biome,count:3});
    const land=api.islands.land, scenery=api.islands.scenery;
    assert.ok(land.every(I=>I.biome===biome&&I.h.every(Number.isFinite)));
    assert.equal(landComponents(api).length,3,`${biome} keeps its islands separate`);
    const positions=land.map(I=>[I.x,I.z,I.rx,I.rz]);
    if(layout) assert.deepEqual(positions,layout,'biome changes do not reshuffle the layout'); else layout=positions;
    shapes.add(land.map(I=>api.islandGround(I.x,I.z).toFixed(3)).join(','));
    for(const I of land){
      const h=api.islandGround(I.x,I.z);
      assert.ok(h>0,`${biome} keeps a dry centre`);
      const b={x:I.x,y:h+0.15,z:I.z,vx:0,vy:-4,vz:0,wx:0,wy:0,wz:0,r:0.5,e:0.5,type:0};
      api.collideIsland(b,1/240);
      assert.ok(b.y>h+0.15&&Number.isFinite(b.y+b.vy),`${biome} remains collidable`);
    }
    if(biome==='tropical') assert.ok(scenery.palms.count>10&&api.islands.treeCount===0,'tropics grow palms, not pines');
    if(biome==='desert'){
      assert.ok(scenery.cacti.count>5&&scenery.cascades.count===0,'arid terrain grows cacti without cascades');
      const I=land[0],withFeatures=api.islandProfile(I,I.x,I.z);I.features=0;
      assert.notEqual(api.islandProfile(I,I.x,I.z),withFeatures,'landform detail changes the actual heightfield');I.features=1;
    }
    if(biome==='volcanic') assert.equal(scenery.cascades.count,0,'dry volcanic terrain has no cascades');
    if(biome==='alpine') assert.ok(api.islands.treeCount>0,'alpine forests retain pines');
    assert.ok(scenery.palms.count<200&&scenery.cacti.count<150&&scenery.flowers.count<600&&scenery.spires.count<25&&scenery.cascades.count<1500);
  }
  assert.equal(shapes.size,5,'biomes have materially different heightfields, not just colours');
  api.generateIslands(seed,{biome:'mixed'});
  assert.equal(new Set(api.islands.land.map(I=>I.biome)).size,5,'mixed mode assigns all five biomes without duplicates');
  const first=api.islands.land.map(I=>I.biome);
  api.generateIslands(seed,{biome:'mixed'});
  assert.deepEqual(api.islands.land.map(I=>I.biome),first,'mixed assignment is seeded');
  const invalid=api.islandConfig({biome:'bogus',features:Infinity,flowers:-3,landmarks:8,cascades:NaN});
  assert.equal(invalid.biome,'temperate');assert.equal(invalid.features,1);assert.equal(invalid.flowers,0);
  assert.equal(invalid.landmarks,1.5);assert.equal(invalid.cascades,1);
});

test('scenery is rooted, reproducible, independently adjustable and released on removal',()=>{
  const {api,deleted}=fixture(), seed=0x2384d22;
  const options=api.islandConfig({biome:'tropical',count:3});
  api.generateIslands(seed,options);
  const scenery=api.islands.scenery;
  assert.ok(scenery.palms.count>0&&scenery.flowers.count>0&&scenery.spires.count>0);
  const palmVariants=scenery.palms.instances.data.filter((_v,i)=>i%8===7);
  assert.ok(palmVariants.some(v=>v<0.5)&&palmVariants.some(v=>v>=0.5),'both palm silhouettes occur in the seeded planting');
  assert.ok(scenery.cascades.paths.length>0,'suitable wet islands receive cascades');
  for(const item of [scenery.palms,scenery.flowers,scenery.spires]){
    const data=item.instances.data;
    for(let i=0;i<data.length;i+=8)
      assert.ok(Math.abs(data[i+1]+0.04-api.islandGround(data[i],data[i+2]))<0.0002,'scenery is rooted in the rendered/collision heightfield');
  }
  const waterfall=scenery.cascades.vb.data;
  for(let i=0;i<waterfall.length;i+=6)
    assert.ok(Math.abs(waterfall[i+1]-0.12-api.islandGround(waterfall[i],waterfall[i+2]))<0.0002,'cascade strips follow terrain');
  for(const path of scenery.cascades.paths){
    assert.ok(path[0][2]-path.at(-1)[2]>2.2,'each cascade follows a descending course');
  }
  const snapshot={palms:scenery.palms.instances.data.slice(),flowers:scenery.flowers.instances.data.slice(),
    spires:scenery.spires.instances.data.slice(),waterfall:waterfall.slice(),rocks:api.islands.details.rocks.instances.data.slice()};
  api.generateIslands(seed,options);
  for(const name of ['palms','flowers','spires']) assert.deepEqual(api.islands.scenery[name].instances.data,snapshot[name]);
  assert.deepEqual(api.islands.scenery.cascades.vb.data,snapshot.waterfall);
  api.rebuildIslandDetails(api.islandConfig({biome:'tropical',count:3,flowers:0}));
  assert.equal(api.islands.scenery.flowers.count,0);
  assert.deepEqual(api.islands.scenery.palms.instances.data,snapshot.palms);
  assert.deepEqual(api.islands.scenery.spires.instances.data,snapshot.spires);
  assert.deepEqual(api.islands.scenery.cascades.vb.data,snapshot.waterfall);
  assert.deepEqual(api.islands.details.rocks.instances.data,snapshot.rocks);
  api.rebuildIslandTrees(api.islandConfig({biome:'tropical',count:3,trees:0,flowers:0,landmarks:0,cascades:0}));
  assert.equal(api.islands.scenery.palms.count,0);assert.equal(api.islands.scenery.spires.count,0);assert.equal(api.islands.scenery.cascades.count,0);
  const old=deleted.vaos;
  api.removeIslands();
  assert.equal(api.islands.scenery,null);assert.ok(deleted.vaos>=old+5,'scenery VAOs are released');
});

test('mixed-biome assignments vary by seed and extreme procedural profiles stay bounded',()=>{
  const {api}=fixture();api.enableFastLayout();const orders=new Set();
  for(let k=0;k<128;k++){
    const seed=Math.imul(k+17,0x9e3779b1)>>>0;
    api.generateIslands(seed,{biome:'mixed',style:'highlands',relief:1.45,features:1.5});
    const land=api.islands.land, order=land.map(I=>I.biome);
    assert.equal(new Set(order).size,5);orders.add(order.join(','));
    const volcano=land.find(I=>I.biome==='volcanic');
    const profile=(u,v)=>api.islandProfile(volcano,volcano.x+volcano.cs*u*volcano.rx-volcano.sn*v*volcano.rz,
      volcano.z+volcano.sn*u*volcano.rx+volcano.cs*v*volcano.rz);
    const u=volcano.peakX*0.45,v=volcano.peakZ*0.45,centre=profile(u,v);
    const rim=Array.from({length:16},(_,i)=>profile(u+Math.cos(i*Math.PI/8)*0.25,v+Math.sin(i*Math.PI/8)*0.25));
    assert.ok(Math.max(...rim)>centre,`seed ${seed} retains a volcanic crater rim`);
    for(const I of land) for(let u=-0.8;u<=0.8;u+=0.4) for(let v=-0.8;v<=0.8;v+=0.4){
      const x=I.x+I.cs*u*I.rx-I.sn*v*I.rz,z=I.z+I.sn*u*I.rx+I.cs*v*I.rz;
      const h=api.islandProfile(I,x,z);
      assert.ok(Number.isFinite(h)&&h<=28,`seed ${seed} has a finite, map-safe ${I.biome} profile`);
    }
  }
  assert.ok(orders.size>50,`seeded mixed islands should use many biome orders (${orders.size})`);
});
