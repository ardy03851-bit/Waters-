'use strict';
/* CPU-side ship geometry, contact and quake regressions; the accompanying
   WebGL browser test exercises actual rendering and desktop/touch input. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const zlib=require('node:zlib');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const meta=JSON.parse(read('assets/ship/mesh.json'));
const raw=fs.readFileSync(path.join(root,'assets/ship/dutch-ship.bin'));
const asset=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);

function fixture(){
  const gl=new Proxy({createBuffer:()=>({}),createVertexArray:()=>({}),deleteBuffer(){},deleteVertexArray(){},deleteTexture(){}},{
    get(target,key){if(key in target)return target[key];if(typeof key==='string'&&key.toUpperCase()===key)return 0;return ()=>{};}
  });
  const ctx=vm.createContext({gl,console,Math,Float32Array,Uint8Array,Uint16Array,ArrayBuffer,Number,meta,asset,
    HDR:'',COMMON:'',program:()=>({}),L:()=>null});
  vm.runInContext(`
    const clamp=(x,a,b)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t;
    const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    let simT=0,grav=9.81,windX=0,windZ=0,sea=0.4,havePrev=false,bounceMul=1;
    let blocked=false,groundHeight=2; const islands={active:false,seed:31,land:[]};
    const balls=[],cam={target:[0,0,0]},explore={active:false,pos:[0,0,0]};
    const Hooks={on(){}};
    function islandGround(x,z){return blocked?(Math.abs(x)<18&&Math.abs(z)<12?groundHeight:-1000):groundHeight;}
    function onShipRelocated(dx,dz){globalThis.relocation=[dx,dz];}
    function waterBalloonBurst(){} function audioKnock(){};
    ${read('js/ship.js')}
    ${read('js/quake.js')}
    globalThis.api={ship,quake,meta,validateShipAsset,buildShipDeck,shipDeckAt,shipPoint,shipLocal,shipMatrix,collideShip,
      shipPlacementOK,relocateShip,onIslandsChanged,triggerSeaQuake,triggerIslandQuake,seaQuakeParameters,seaQuakeHeight,
      seaQuakeVelocity,quakeCameraOffset,updateQuakes,clearIslandQuake,islands,balls,
      setTime(t){simT=t;}, time(){return simT;},
      setBlocked(v){blocked=v;},setGround(v){groundHeight=v;},
      activateDeck(){ship.grid=buildShipDeck(asset,meta.meshes[1]);ship.enabled=true;ship.status='ready';ship.poseReady=true;shipMatrix();}
    };
  `,ctx,{timeout:20000});
  return {api:ctx.api,ctx};
}

test('ship asset is bounded, aligned and has genuine walkable deck samples',()=>{
  const {api}=fixture();
  api.validateShipAsset(meta,asset);
  assert.equal(meta.meshes.length,3);
  assert.equal(meta.meshes.reduce((n,m)=>n+m.indexCount,0)/3,69162);
  assert.throws(()=>api.validateShipAsset({...meta,byteLength:1},asset),/geometry/);
  const broken=JSON.parse(JSON.stringify(meta));broken.meshes[1].vertexOffset=asset.byteLength+4;
  assert.throws(()=>api.validateShipAsset(broken,asset),/offset/);
  api.activateDeck();
  assert.ok(api.ship.grid.triangles.length>1000);
  for(const x of [-3,-1,0,1,2,3]){
    const h=api.shipDeckAt(x,0.8,1.75);
    assert.ok(h!==null&&h>1.3&&h<2.3,`actual main deck is sampleable at x=${x}`);
  }
  assert.equal(api.shipDeckAt(30,0,1.75),null);
  assert.equal(api.shipDeckAt(1,0.8,10),null,'a player far above the deck cannot snap to it');
});

test('deck and ball contacts follow the same floating transform without lifting submerged balls',()=>{
  const {api}=fixture();api.activateDeck();
  Object.assign(api.ship,{x:4,z:-3,y:0.7,pitch:0.08,roll:-0.11});api.shipMatrix();
  const world=api.shipPoint(1.2,1.7,0.8),local=api.shipLocal(...world);
  for(const [got,want] of local.map((v,i)=>[v,[1.2,1.7,0.8][i]])) assert.ok(Math.abs(got-want)<1e-6);
  const floor=api.shipDeckAt(1.2,0.8,1.75),near=api.shipPoint(1.2,floor+0.22,0.8);
  const b={x:near[0],y:near[1],z:near[2],vx:1,vy:-3,vz:0,r:0.4,type:0,e:0.7};
  api.collideShip(b,1/240);
  const after=api.shipLocal(b.x,b.y,b.z);
  assert.ok(Math.abs(after[1]-(floor+b.r))<1e-5);assert.ok(b.vy>0,'a falling ball bounces off the deck');
  const under=api.shipPoint(1.2,-1,0.8),submerged={x:under[0],y:under[1],z:under[2],vx:0,vy:-1,vz:0,r:0.3,type:0,e:0.5};
  api.collideShip(submerged,1/240);
  assert.equal(submerged.y,under[1],'submerged balls are not teleported through the hull');
});

test('ship relocation searches for navigable water and returns to the play area when islands are removed',()=>{
  const {api,ctx}=fixture();api.islands.active=true;api.setBlocked(true);api.ship.enabled=true;
  assert.equal(api.shipPlacementOK(0,0),false);
  assert.equal(api.relocateShip(),true);
  assert.ok(api.shipPlacementOK(api.ship.x,api.ship.z));
  assert.ok(Math.hypot(api.ship.x,api.ship.z)>0);
  assert.equal(ctx.relocation[0],api.ship.x);assert.equal(ctx.relocation[1],api.ship.z);
  api.islands.active=false;api.onIslandsChanged();
  assert.equal(api.ship.x,0);assert.equal(api.ship.z,0);
});

test('seaquake CPU heights match the shader wavefront, remain bounded and decay',()=>{
  const {api}=fixture();api.quake.strength=1.5;api.triggerSeaQuake(true);
  const shader=read('js/shaders.js');
  assert.match(shader,/exp\(-d\*d\*0\.12\)\*sin\(d\*1\.7\)/);
  for(const age of [0,0.5,2,7,10,11.99,12,20]){
    const p=api.seaQuakeParameters(age);
    for(const x of [-35,-8,0,4,17,40]){
      const d=Math.hypot(x-p[0],3-p[1])-p[2];
      const expected=p[3]*Math.exp(-d*d*0.12)*Math.sin(d*1.7),height=api.seaQuakeHeight(x,3,age);
      assert.ok(Math.abs(height-expected)<1e-12);
      assert.ok(Math.abs(height)<=0.825+1e-12);
      assert.ok(Number.isFinite(api.seaQuakeVelocity(x,3,age)));
    }
  }
  assert.equal(api.seaQuakeHeight(5,0,12),0);
  api.setTime(13);api.updateQuakes(0.1,0.1);assert.equal(api.quake.sea,null);
});

test('island quakes are temporary, bounded, pausable and do not mutate the terrain',()=>{
  const {api}=fixture();
  assert.equal(api.triggerIslandQuake(true),false);
  api.islands.active=true;api.islands.land.push({x:0,z:0,rx:10,rz:8});api.setGround(3);
  const land=api.islands.land[0],before=JSON.stringify(land);
  api.balls.push({x:0,y:3.4,z:0,vx:0,vy:0,vz:0,r:0.5});
  assert.equal(api.triggerIslandQuake(true),true);
  assert.ok(api.quake.crackCount>0&&api.quake.crackCount<=1200);
  for(let t=0;t<6;t+=0.05){api.setTime(t);api.updateQuakes(.05,.05);assert.ok(api.quake.particles.length<=96);}
  assert.ok(api.balls[0].vy>0,'grounded nearby balls receive a small impulse');
  assert.equal(JSON.stringify(land),before,'the terrain heightfield is not permanently altered');
  const count=api.quake.particles.length;api.updateQuakes(1,0);assert.equal(api.quake.particles.length,count);
  api.quake.motion=0;assert.deepEqual(Array.from(api.quakeCameraOffset(0,0)),[0,0,0]);
  api.setTime(23);api.updateQuakes(.1,.1);
  assert.equal(api.quake.land,null);assert.equal(api.quake.crackCount,0);assert.equal(api.quake.particles.length,0);
  api.triggerIslandQuake(true);api.islands.active=false;api.updateQuakes(.1,.1);
  assert.equal(api.quake.land,null,'removing islands cancels their temporary effects');
});

/* Decode just enough PNG to verify the redistributed sail alpha really has
   both opaque cloth and transparent tears. No third-party module is needed. */
function pngAlphaCounts(buffer){
  assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let pos=8,w,h,depth,type;const chunks=[];
  while(pos<buffer.length){
    const len=buffer.readUInt32BE(pos),kind=buffer.toString('ascii',pos+4,pos+8),data=buffer.subarray(pos+8,pos+8+len);
    if(kind==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);depth=data[8];type=data[9];}
    if(kind==='IDAT') chunks.push(data);
    pos+=12+len;if(kind==='IEND') break;
  }
  assert.equal(depth,8);assert.equal(type,6);const bytes=zlib.inflateSync(Buffer.concat(chunks));
  const stride=w*4,prev=Buffer.alloc(stride),row=Buffer.alloc(stride);let offset=0,opaque=0,transparent=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<h;y++){
    const filter=bytes[offset++];
    for(let i=0;i<stride;i++){
      const a=i>=4?row[i-4]:0,b=prev[i],c=i>=4?prev[i-4]:0;
      const predict=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):NaN;
      assert.ok(Number.isFinite(predict));row[i]=(bytes[offset++]+predict)&255;
    }
    for(let i=3;i<stride;i+=4){if(row[i]>=250) opaque++;if(row[i]<128) transparent++;}
    row.copy(prev);
  }
  return {w,h,opaque,transparent};
}
test('the sail texture preserves the authored alpha mask',()=>{
  const a=pngAlphaCounts(fs.readFileSync(path.join(root,'assets/ship/sails-color.png')));
  assert.equal(a.w,1024);assert.equal(a.h,1024);
  assert.ok(a.opaque>900000);assert.ok(a.transparent>100,'the tears are not flattened into an opaque JPEG');
});
