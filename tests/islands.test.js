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
      plantKinds:PLANT_KINDS.map(k=>k.name),
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

test('cinematic generation settings add drama, terraces, sea stacks and a wider shelf',()=>{
  const {api}=fixture(), seed=0x51c0ffee;
  const flat=api.generateIslands(seed,{count:3,drama:0,terraces:0,shelf:1,stacks:0});
  const plain=api.islands.land.map(I=>I.h.slice());
  const plainMax=Math.max(...plain.map(h=>Math.max(...h)));
  assert.equal(api.islands.details.stacks.count,0,'sea stacks are off when their control is zero');

  api.generateIslands(seed,{count:3,drama:1.5,terraces:1.2,shelf:1.5,stacks:1.5});
  assert.ok(api.islands.land.length===3);
  const dramatic=api.islands.land.map(I=>I.h);
  assert.ok(Math.max(...dramatic.map(h=>Math.max(...h)))>plainMax,'vertical drama raises the skyline');
  assert.notDeepEqual(dramatic[0],plain[0],'terraces and drama change the sampled surface');
  assert.ok(api.islands.land.every(I=>I.h.every(h=>Number.isFinite(h)&&h<=28)),'extreme drama stays inside the shoreline range');
  assert.equal(landComponents(api).length,3,'drama keeps every island separate');

  const stacks=api.islands.details.stacks;
  assert.ok(stacks.count>2&&stacks.count<200,'sea stacks are bounded and present');
  const data=stacks.instances.data;
  for(let i=0;i<data.length;i+=8){
    const x=data[i],y=data[i+1],z=data[i+2],width=data[i+3],height=width*data[i+5];
    assert.ok(Number.isFinite(x+y+z+width+height)&&width>0&&height>0,'stack instances are finite');
    assert.ok(y<0,'each stack rises from submerged ground');
    assert.ok(y+height*0.72>0,'the stack breaks the surface');
    assert.ok(Math.abs(y+0.15-api.islandGround(x,z))<0.01,'the stack base sits on the sampled seabed');
  }
  /* Shallower shelf: more of the ring around the coast is above -12 m. */
  let shallow=0,total=0;
  for(const I of api.islands.land) for(let a=0;a<32;a++){
    const ang=a*Math.PI*2/32,r=1.12;
    const lx=Math.cos(ang)*I.rx*r,lz=Math.sin(ang)*I.rz*r;
    const h=api.islandGround(I.x+I.cs*lx-I.sn*lz,I.z+I.sn*lx+I.cs*lz);
    total++; if(h>-7) shallow++;
  }
  assert.ok(shallow/total>0.5,'a wide shelf keeps the near coast shallow');
  assert.equal(flat,api.islands.seed,'the returned seed is stable');
});

test('atoll and fjord biomes build connected, collidable landforms',()=>{
  const {api}=fixture(), seed=0x2b7c11a3;
  api.generateIslands(seed,{biome:'atoll',count:3,stacks:0});
  assert.equal(landComponents(api).length,3,'each atoll ring is one connected shore');
  for(const I of api.islands.land){
    assert.ok(api.islandGround(I.x,I.z)<0.5,'the atoll centre is a real lagoon');
    let crest=-99;
    for(let a=0;a<32;a++){
      const ang=a*Math.PI*2/32,u=Math.cos(ang)*0.70,v=Math.sin(ang)*0.70;
      const x=I.x+I.cs*u*I.rx-I.sn*v*I.rz,z=I.z+I.sn*u*I.rx+I.cs*v*I.rz;
      crest=Math.max(crest,api.islandGround(x,z));
    }
    assert.ok(crest>1.2,'the motu ring rises above the sea');
  }
  const atollTrees=api.islands.treeCount;

  api.generateIslands(seed,{biome:'fjord',count:3,stacks:0});
  assert.equal(landComponents(api).length,3,'the drowned channel does not split an island');
  for(const I of api.islands.land){
    assert.ok(api.islandGround(I.x,I.z)>1.5,'the massif summit stays dry');
    let drowned=99;
    for(let u=-0.9;u<=-0.15;u+=0.05){
      const v=-0.10+0.09*Math.sin(u*3.1+I.phase*2.0);
      const x=I.x+I.cs*u*I.rx-I.sn*v*I.rz,z=I.z+I.sn*u*I.rx+I.cs*v*I.rz;
      drowned=Math.min(drowned,api.islandGround(x,z));
    }
    assert.ok(drowned<0,'water reaches inland along the fjord');
    const b={x:I.x,y:api.islandGround(I.x,I.z)+0.2,z:I.z,vx:0,vy:-4,vz:0,wx:0,wy:0,wz:0,r:0.5,e:0.5,type:0};
    api.collideIsland(b,1/240);
    assert.ok(b.y>api.islandGround(I.x,I.z)&&Number.isFinite(b.y+b.vy),'fjord terrain remains collidable');
  }
  assert.ok(atollTrees===0,'atolls do not plant pines');
});

test('layouts, spread and the new plant cutouts stay seeded, bounded and rooted',()=>{
  const {api}=fixture(), seed=0x6a09e667;
  api.generateIslands(seed,{layout:'lagoon',count:5,stacks:0});
  assert.equal(landComponents(api).length,5,'a lagoon layout keeps five separate islands');
  const ring=api.islands.land.map(I=>Math.hypot(I.x,I.z+12));
  assert.ok(ring.every(r=>r>18),'lagoon islands sit on a ring around open water');

  api.generateIslands(seed,{layout:'chain',count:5,stacks:0});
  assert.equal(landComponents(api).length,5,'the barrier chain keeps every island separate');
  for(let i=0;i<api.islands.land.length;i++) for(let j=0;j<i;j++){
    const a=api.islands.land[i],b=api.islands.land[j];
    const min=1.36*(Math.max(a.rx,a.rz)+Math.max(b.rx,b.rz))+1.5;
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=min-1e-6,'the chain keeps navigable water between islands');
  }

  const options=api.islandConfig({biome:'temperate',count:3,trees:1.2,grass:1.1,stacks:0});
  api.generateIslands(seed,options);
  const plants=api.islands.scenery.plants;
  assert.ok(plants.count>20,'the generated cutout species are planted');
  const data=plants.instances.data;
  for(let i=0;i<data.length;i+=8){
    const x=data[i],y=data[i+1],z=data[i+2],height=data[i+3],id=data[i+4];
    assert.ok(Number.isFinite(x+y+z+height+id)&&height>0.4&&height<11,'plant instances are finite and bounded');
    assert.ok(Math.abs(y+0.05-api.islandGround(x,z))<0.002,'every cutout is rooted in the collision heightfield');
    const kind=Math.round(id)%16;
    assert.ok(kind>=0&&kind<api.plantKinds.length,'the species index is inside the cutout atlas');
  }
  const snapshot=data.slice();
  api.generateIslands(seed,options);
  assert.deepEqual(api.islands.scenery.plants.instances.data,snapshot,'plant placement is seeded');
  api.generateIslands(seed,api.islandConfig({biome:'temperate',count:3,trees:0,grass:0,stacks:0}));
  assert.equal(api.islands.scenery.plants.count,0,'zeroed tree and grass sliders remove every cutout');

  /* Surf sources now cover beaches as well as cliffs, and each has a real
     seaward normal instead of an ellipse approximation. */
  api.generateIslands(seed,{count:3});
  const coast=api.islands.coast;
  assert.ok(coast.length>80&&coast.some(p=>p.steep)&&coast.some(p=>!p.steep),'beaches and cliffs are both sampled');
  for(const p of coast){
    assert.ok(Number.isFinite(p.nx+p.nz)&&p.nx*p.nx+p.nz*p.nz>0.9,'coast normals are unit length');
  }
  const invalid=api.islandConfig({layout:'bogus',drama:-2,terraces:9,shelf:NaN,stacks:8,mist:-1,spread:0});
  assert.equal(invalid.layout,'scattered');assert.equal(invalid.drama,0);assert.equal(invalid.terraces,1.5);
  assert.equal(invalid.shelf,1);assert.equal(invalid.stacks,1.5);assert.equal(invalid.mist,0);assert.equal(invalid.spread,0.75);
});

test('sea stacks are surf sources and rebuilds swap them without leaking entries',()=>{
  const {api}=fixture(), seed=0xbb67ae85;
  api.generateIslands(seed,{label:'stack coast',count:3,stacks:1.2});
  const stacks=api.islands.details.stacks;
  assert.ok(stacks.count>0,'the stack slider generates offshore rocks');
  const stackCoast=()=>api.islands.coast.filter(p=>p.stack);
  assert.equal(stackCoast().length,stacks.count,'every stack feeds the surf system');
  for(const p of stackCoast()){
    assert.ok(api.islandGround(p.x,p.z)<0.5,'a stack surf source sits in water, not on the beach');
  }
  const before=api.islands.coast.length;
  api.rebuildIslandDetails(api.islandConfig({label:'stack coast',count:3,stacks:0.4}));
  assert.equal(stackCoast().length,api.islands.details.stacks.count,'a detail rebuild refreshes stack surf sources');
  assert.notEqual(api.islands.coast.length,before,'the stack count is reflected in the coast list');
  assert.equal(new Set(stackCoast().map(p=>p.x+':'+p.z)).size,stackCoast().length,'no duplicate stack entries');
});

test('the barrier chain stays inside the shoreline map for any spread',()=>{
  const {api}=fixture();
  for(const spread of [0.85,1.15,1.5]){
    api.generateIslands(0x3c6ef372,{layout:'chain',count:5,spread,stacks:0});
    for(const I of api.islands.land){
      assert.ok(Math.hypot(I.x,I.z)+I.extent<78,'chain island '+I.x.toFixed(1)+','+I.z.toFixed(1)+' fits the 80 m shoreline map');
    }
  }
});
