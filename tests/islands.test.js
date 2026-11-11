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
    ${physics}
    globalThis.api={islands,islandConfig,generateIslands,removeIslands,islandGround,collideIsland,updateIslandSurf,rebuildIslandTrees,rebuildIslandDetails,
      setConditions(s,storm){sea=s;sky.storm=storm;},
      tick(dt){simT+=dt;updateIslandSurf(dt);},
      resetTime(){simT=0;islands.nextCrash=0;for(const p of islands.coast){p.last=0;p.cool=0;}},
      enableFastLayout(){
        makeIslandMesh=I=>{I.vao=null;I.vb=null;I.ib=null;};
        makeIslandMap=()=>{}; makeIslandTrees=()=>{}; makeIslandCoast=()=>{}; makeIslandDetails=()=>{};
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
    [0xf02a33,{style:'highlands',relief:1.45,coast:0.5,beach:0.5,trees:0.4,grass:0.3,rocks:0.3}]
  ]){
    api.generateIslands(seed,options);
    assert.equal(landComponents(api).length,5,`extreme ${options.style} settings leave five separate islands`);
    assert.ok(api.islands.land.every(I=>api.islandGround(I.x,I.z)>0),'each island retains dry ground');
    assert.ok(api.islands.treeCount<1000&&api.islands.details.grass.count<3000&&api.islands.details.rocks.count<400);
    assert.ok(api.islands.land.every(I=>I.h.every(Number.isFinite)),'heightfields stay finite');
  }
});
