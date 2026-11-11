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
  const gl=new Proxy({
    createTexture:()=>({}),createBuffer:()=>({}),createVertexArray:()=>({}),
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
    ${physics}
    globalThis.api={islands,generateIslands,removeIslands,islandGround,collideIsland,updateIslandSurf,
      setConditions(s,storm){sea=s;sky.storm=storm;},
      tick(dt){simT+=dt;updateIslandSurf(dt);},
      resetTime(){simT=0;islands.nextCrash=0;for(const p of islands.coast){p.last=0;p.cool=0;}}
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
  api.generateIslands(123456);
  const second=api.islands.land.map(i=>[i.x,i.z,api.islandGround(i.x,i.z)]);
  assert.deepEqual(first,second,'same seed must recreate the same terrain');
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
  const beforePause=hits.length;
  for(let i=0;i<100;i++) api.tick(0);
  assert.equal(hits.length,beforePause,'paused simulation creates no splashes');
  api.removeIslands();
  for(let i=0;i<120;i++) api.tick(1/60);
  assert.equal(hits.length,beforePause,'removed islands create no splashes');
  assert.equal(api.islandGround(I.x,I.z),-1000);
});
