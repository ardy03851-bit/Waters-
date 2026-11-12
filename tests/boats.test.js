'use strict';
/* The harbour fleet, against the real CC0 models in assets/kenney/watercraft.

   These tests boot the whole engine (stub WebGL, stub DOM) and feed the model
   loader the actual .glb files, so they cover the GLB parser, the interleaved
   vertex layout, spawning on open water, buoyancy, navigation and the draw
   path. They are the reason a missing asset or a bad stride cannot ship.

   Run with: node --test tests/boats.test.js
*/
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {harness}=require('./harness.js');

const root=path.join(__dirname,'..');
const KIT=path.join(root,'assets','kenney');

/* Boot the engine with a fetch that serves the workspace files, so kit.js
   exercises its real decode path instead of a stub. */
function bootWithAssets(){
  const h=harness();
  h.ctx.fetch=async(url)=>{
    const file=path.join(root,String(url));
    if(!fs.existsSync(file)) return {ok:false,status:404};
    const buffer=fs.readFileSync(file);
    return {ok:true,arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)};
  };
  /* The colormap is a real PNG: report load synchronously so the texture path
     runs without a decoder. */
  h.ctx.Image=class{
    constructor(){ this.width=512; this.height=512; }
    set src(value){ this._src=value; if(this.onload) this.onload(); }
    get src(){ return this._src; }
  };
  const scripts=require('./harness.js').SCRIPTS;
  for(const name of scripts) vm.runInContext(require('./harness.js').read(name),h.ctx,{filename:'js/'+name+'.js'});
  vm.runInContext('AquaStart()',h.ctx);
  h.ctx.AquaBoot.state='running';
  return h;
}

test('the watercraft kit decodes every model and keeps its authored proportions',()=>{
  const h=bootWithAssets();
  const models=vm.runInContext(`(()=>{
    const names=Object.keys(BOAT_CLASSES);
    return names.map(name=>({name,scale:BOAT_CLASSES[name].scale||1}));
  })()`,h.ctx);
  assert.ok(models.length>=13,'every catalogue entry is described');
  const facts=vm.runInContext(`new Promise(resolve=>{
    loadKits(${JSON.stringify(models.map(m=>['watercraft',m.name]))}).then(list=>resolve(list.map(m=>m&&({
      name:m.name,count:m.count,wide:m.wide,box:m.box,materials:m.materials,
      indexType:m.indexType===gl.UNSIGNED_INT?'u32':'u16'
    }))));
  })`,h.ctx);
  return facts.then(list=>{
    for(const model of list){
      assert.ok(model,'model decoded');
      assert.ok(model.count>0&&model.count%3===0,'triangle list: '+model.name);
      assert.ok(model.box.max[1]>=model.box.min[1],'upright bounds: '+model.name);
      assert.ok(Array.isArray(model.materials)&&model.materials.length>0,'palette recorded: '+model.name);
    }
    const runabout=list.find(m=>m.name==='boat-speed-a');
    const length=runabout.box.max[2]-runabout.box.min[2];
    const beam=runabout.box.max[0]-runabout.box.min[0];
    assert.ok(Math.abs(length-3.37)<0.01&&Math.abs(beam-1.78)<0.01,'the kit scale is unchanged');
    assert.equal(runabout.indexType,'u16','small craft stay on 16-bit indices');
    const coaster=list.find(m=>m.name==='ship-cargo-a');
    assert.ok(coaster.count>1500,'the coaster keeps its detail');
  });
});

test('the shared colour atlas is uploaded once and released with the fleet',()=>{
  const h=bootWithAssets();
  return vm.runInContext(`(async()=>{
    setBoatsEnabled(true);
    await boats.load;
    const texture=boats.texture;
    const loaded=kitState.loaded;
    releaseBoats();
    return {status:boats.status,hasTexture:!!texture,loaded,
      held:Object.keys(kitTextures).length,count:boats.list.length,
      enabled:boats.enabled};
  })()`,h.ctx).then(result=>{
    assert.equal(result.hasTexture,true,'the atlas uploads');
    assert.ok(result.loaded>0,'models were uploaded');
    assert.equal(result.count,0,'the fleet is cleared from the scene');
    assert.equal(result.enabled,true,'the setting itself stays on');
    assert.equal(result.status,'idle','the loader is ready for a re-enable');
  });
});

test('boats spawn on open water, float on the swell and never run aground',async()=>{
  const h=bootWithAssets();
  const result=await vm.runInContext(`(async()=>{
    generateIslands(0x51f2a7,islandConfig({biome:'temperate',count:5}));
    setBoatsEnabled(true);
    await boats.load;
    const start=boats.list.map(b=>({kind:b.kind,x:b.x,z:b.z,length:b.length,beam:b.beam}));
    let aground=0,outside=0,underwater=0,maxRoll=0,maxPitch=0;
    for(let i=0;i<9000;i++){
      simT+=1/60;
      updateBoats(1/60,1/60);
      for(const b of boats.list){
        if(islandGround(b.x,b.z)>-1.0) aground++;
        if(Math.hypot(b.x,b.z)>100) outside++;
        /* A hull sits on the surface: its deck never sinks far below it. */
        if(b.y<-2.2) underwater++;
        maxRoll=Math.max(maxRoll,Math.abs(b.roll));
        maxPitch=Math.max(maxPitch,Math.abs(b.pitch));
      }
    }
    const end=boats.list.map(b=>({kind:b.kind,x:b.x,z:b.z,speed:b.speed}));
    const fleet={count:boats.count,status:boats.status,error:boats.error,seen:boats.list.length};
    let minPair=1e9;
    for(let a=0;a<end.length;a++) for(let c=a+1;c<end.length;c++)
      minPair=Math.min(minPair,Math.hypot(end[a].x-end[c].x,end[a].z-end[c].z));
    return Object.assign(fleet,{start,end,aground,outside,underwater,maxRoll,maxPitch,minPair,
      moved:start.filter((s,i)=>Math.hypot(s.x-end[i].x,s.z-end[i].z)>6).length});
  })()`,h.ctx);
  assert.ok(result.count>=7,'a useful fleet is afloat');
  assert.equal(result.aground,0,'no hull is ever left on the beach');
  assert.equal(result.outside,0,'no hull leaves the bay');
  assert.equal(result.underwater,0,'no hull is swamped by the swell');
  assert.ok(result.moved>=2,'powered craft get underway');
  assert.ok(result.maxRoll<0.35&&result.maxPitch<0.35,'the swell tips hulls, it does not roll them over');
  assert.ok(result.minPair>0,'hulls are pushed apart rather than overlapping');
  assert.ok(result.start.every(s=>s.length>2&&s.length<30),'hull lengths stay sane');
});

test('the fleet draws in every pass while on and not at all while off',async()=>{
  const h=bootWithAssets();
  /* The newest scheduled callback is the real loop; the first one is the
     browser's initial request, queued before the renderer started. */
  const runFrame=()=>{
    const frame=h.frames.pop();
    assert.equal(typeof frame,'function','the frame loop is scheduled');
    frame(3000);
  };
  /* Hull geometry is the only thing drawn with a boat-sized index list, and
     the fleet is drawn three times per frame (reflection, scene, main). */
  let pBoat=null, boatDraws=0;
  const count=await vm.runInContext(`(async()=>{ setBoatsEnabled(true); await boats.load; return boats.count; })()`,h.ctx);
  {
    pBoat=vm.runInContext('pBoat',h.ctx);
    assert.ok(pBoat,'the boat program exists');
    assert.ok(count>=7,'a fleet is loaded');
    const useProgram=h.gl.useProgram;
    let current=null;
    h.gl.useProgram=(program)=>{ current=program; return useProgram&&useProgram(program); };
    const drawElements=h.gl.drawElements;
    h.gl.drawElements=(mode,count,type,offset)=>{
      if(current===pBoat) boatDraws++;
      return drawElements&&drawElements(mode,count,type,offset);
    };
    runFrame();
    assert.ok(boatDraws>=count,'all visible hulls draw, across passes: '+boatDraws);
    vm.runInContext('setBoatsEnabled(false)',h.ctx);
    boatDraws=0;
    runFrame();
    assert.equal(boatDraws,0,'a disabled fleet issues no geometry');
  }
});
