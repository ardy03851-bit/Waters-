'use strict';
/* ============================================================
   CC0 model library (Kenney "Pirate", "Watercraft" and "Nature" kits)

   These are small, atlas-mapped GLB kits released under CC0 by Kenney
   (www.kenney.nl). The files are served from this site as downloaded; the
   geometry is converted into Aqua's own interleaved format the first time a
   kit is used and cached in localStorage, so later visits skip that work.

   Everything here is optional and lazy: nothing is fetched until a boat,
   wreck or landmark is actually needed, a failure simply leaves that extra
   out, and the ocean, ship and balls never depend on it.
   ============================================================ */
const KIT_DIR='assets/kenney/';
const KIT_SETS={watercraft:'colormap.png',pirate:'colormap.png'};
const kitCache=new Map();
const kitState={loaded:0,failed:0,bytes:0};
const KIT_CACHE_KEY='aqua.kit.v2.';

/* ---------------------------------------------------------------
   Minimal GLB reader. The kits store one indexed mesh per node with
   POSITION, NORMAL and TEXCOORD_0; node transforms are baked in.
   --------------------------------------------------------------- */
function readGLB(buffer){
  if(buffer.byteLength<20) throw new Error('Empty model file');
  const view=new DataView(buffer);
  if(view.getUint32(0,true)!==0x46546c67) throw new Error('Not a GLB file');
  const total=Math.min(view.getUint32(8,true),buffer.byteLength);
  let offset=12, json=null, bin=null;
  while(offset+8<=total){
    const length=view.getUint32(offset,true), type=view.getUint32(offset+4,true);
    const start=offset+8;
    if(start+length>total) break;
    if(type===0x4e4f534a) json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,start,length)));
    else if(type===0x004e4942) bin={offset:start,length};
    offset=start+length+((4-(length%4))%4);
  }
  if(!json||!bin) throw new Error('GLB is missing its scene or buffer');
  return {json,bin:new DataView(buffer),binOffset:bin.offset};
}
const GLB_COMP={5120:['getInt8',1],5121:['getUint8',1],5122:['getInt16',2],
  5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]};
const GLB_ITEMS={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
function glbAccessor(glb,index){
  const a=glb.json.accessors&&glb.json.accessors[index];
  if(!a) throw new Error('Missing accessor');
  const bv=glb.json.bufferViews&&glb.json.bufferViews[a.bufferView===undefined?0:a.bufferView];
  if(!bv) throw new Error('Missing buffer view');
  const comp=GLB_COMP[a.componentType];
  if(!comp) throw new Error('Unsupported component type');
  const items=GLB_ITEMS[a.type]||1;
  const dv=glb.bin, origin=glb.binOffset;
  const stride=bv.byteStride||comp[1]*items;
  const out=new Float32Array(a.count*items);
  for(let i=0;i<a.count;i++){
    const at=origin+(bv.byteOffset||0)+(a.byteOffset||0)+i*stride;
    for(let k=0;k<items;k++) out[i*items+k]=dv[comp[0]](at+k*comp[1],true);
  }
  return {data:out,items,count:a.count,min:a.min,max:a.max};
}
function glbIdentity(){ return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function glbMul(a,b){
  const o=new Float64Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++){
    let s=0; for(let k=0;k<4;k++) s+=a[k*4+r]*b[c*4+k];
    o[c*4+r]=s;
  }
  return o;
}
function glbTRS(node){
  const t=node.translation||[0,0,0], r=node.rotation||[0,0,0,1], s=node.scale||[1,1,1];
  if(node.matrix&&node.matrix.length===16) return node.matrix.slice();
  const x=r[0],y=r[1],z=r[2],w=r[3];
  return [
    (1-2*(y*y+z*z))*s[0], (2*(x*y+w*z))*s[0], (2*(x*z-w*y))*s[0], 0,
    (2*(x*y-w*z))*s[1], (1-2*(x*x+z*z))*s[1], (2*(y*z+w*x))*s[1], 0,
    (2*(x*z+w*y))*s[2], (2*(y*z-w*x))*s[2], (1-2*(x*x+y*y))*s[2], 0,
    t[0],t[1],t[2],1];
}

/* Convert a GLB to interleaved position/normal/uv triples (8 floats). */
function convertGLB(buffer){
  const glb=readGLB(buffer);
  const nodes=glb.json.nodes||[], meshes=glb.json.meshes||[], scenes=glb.json.scenes||[];
  const root=scenes[glb.json.scene||0]||scenes[0];
  const verts=[], indices=[];
  const materials=[];
  const box={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  function visit(index,parent){
    const node=nodes[index];
    if(!node) return;
    const world=glbMul(parent,glbTRS(node));
    if(node.mesh!==undefined){
      for(const prim of (meshes[node.mesh].primitives||[])){
        const pos=glbAccessor(glb,prim.attributes.POSITION);
        const nrm=prim.attributes.NORMAL!==undefined?glbAccessor(glb,prim.attributes.NORMAL):null;
        const uv=prim.attributes.TEXCOORD_0!==undefined?glbAccessor(glb,prim.attributes.TEXCOORD_0):null;
        const base=verts.length/8;
        for(let i=0;i<pos.count;i++){
          const at=verts.length;
          const x=pos.data[i*3],y=pos.data[i*3+1],z=pos.data[i*3+2];
          verts.push(
            world[0]*x+world[4]*y+world[8]*z+world[12],
            world[1]*x+world[5]*y+world[9]*z+world[13],
            world[2]*x+world[6]*y+world[10]*z+world[14]);
          if(nrm) verts.push(
            world[0]*nrm.data[i*3]+world[4]*nrm.data[i*3+1]+world[8]*nrm.data[i*3+2],
            world[1]*nrm.data[i*3]+world[5]*nrm.data[i*3+1]+world[9]*nrm.data[i*3+2],
            world[2]*nrm.data[i*3]+world[6]*nrm.data[i*3+1]+world[10]*nrm.data[i*3+2]);
          else verts.push(0,1,0);
          verts.push(uv?uv.data[i*2]:0,uv?uv.data[i*2+1]:0);
          for(let k=0;k<3;k++){
            const v=verts[at+k];
            if(v<box.min[k]) box.min[k]=v;
            if(v>box.max[k]) box.max[k]=v;
          }
        }
        const material=glb.json.materials&&glb.json.materials[prim.material];
        const factor=(material&&material.pbrMetallicRoughness&&material.pbrMetallicRoughness.baseColorFactor)||[0.8,0.8,0.8,1];
        if(!materials.some(m=>Math.abs(m[0]-factor[0])+Math.abs(m[1]-factor[1])+Math.abs(m[2]-factor[2])<0.01))
          materials.push([Math.round(factor[0]*255),Math.round(factor[1]*255),Math.round(factor[2]*255)]);
        if(prim.indices!==undefined){
          const idx=glbAccessor(glb,prim.indices);
          for(let i=0;i<idx.data.length;i++) indices.push(base+idx.data[i]);
        }else for(let i=0;i<pos.count;i++) indices.push(base+i);
      }
    }
    for(const child of node.children||[]) visit(child,world);
  }
  if(root&&root.nodes) for(const n of root.nodes) visit(n,glbIdentity());
  if(!indices.length) throw new Error('Model has no geometry');
  let wide=0;
  for(const v of indices) if(v>65535){ wide=1; break; }
  return {
    verts:new Float32Array(verts),
    indices:wide?new Uint32Array(indices):new Uint16Array(indices),
    wide, count:indices.length, box, materials
  };
}

/* ---------------------------------------------------------------
   Loading: fetch once, convert once, cache in this tab and on disk.
   --------------------------------------------------------------- */
function kitKey(set,name){ return set+'/'+name; }
function kitStoreGet(set,name){
  try{
    const raw=localStorage.getItem(KIT_CACHE_KEY+kitKey(set,name));
    if(!raw) return null;
    const data=JSON.parse(raw);
    if(!data||data.v!==2||!data.verts||!data.indices||!data.box) return null;
    return data;
  }catch(e){ return null; }
}
function kitStoreSet(set,name,record){
  try{
    localStorage.setItem(KIT_CACHE_KEY+kitKey(set,name),JSON.stringify({
      v:2,verts:Array.from(record.verts),indices:Array.from(record.indices),
      wide:record.wide,box:record.box,materials:record.materials
    }));
  }catch(e){ /* Private mode or quota: conversion simply repeats next visit. */ }
}
function kitUpload(record,name,set){
  if(gl.isContextLost()) throw new Error('Graphics context was lost');
  const vao=gl.createVertexArray(), vb=gl.createBuffer(), ib=gl.createBuffer();
  if(!vao||!vb||!ib){
    if(vao) gl.deleteVertexArray(vao); if(vb) gl.deleteBuffer(vb); if(ib) gl.deleteBuffer(ib);
    throw new Error('Could not allocate model buffers');
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,record.verts,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,32,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,32,12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,2,gl.FLOAT,false,32,24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,record.indices,gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  const error=gl.getError();
  if(error!==gl.NO_ERROR){
    gl.deleteVertexArray(vao); gl.deleteBuffer(vb); gl.deleteBuffer(ib);
    throw new Error('Could not upload '+name+' (WebGL '+error+')');
  }
  return {vao,vb,ib,record,materials:record.materials||[],count:record.count,
    indexType:record.wide?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,box:record.box,name,set};
}
async function loadKit(set,name){
  const key=kitKey(set,name);
  if(kitCache.has(key)) return kitCache.get(key);
  const job=(async()=>{
    let record=null;
    const stored=kitStoreGet(set,name);
    if(stored) record={verts:new Float32Array(stored.verts),indices:stored.wide?new Uint32Array(stored.indices):new Uint16Array(stored.indices),
      wide:!!stored.wide,count:stored.indices.length,box:stored.box,materials:stored.materials||[]};
    if(!record){
      const url=KIT_DIR+set+'/'+name+'.glb';
      const response=await fetch(url);
      if(!response.ok) throw new Error('Could not load '+url);
      const buffer=await response.arrayBuffer();
      kitState.bytes+=buffer.byteLength;
      record=convertGLB(buffer);
      /* Only the small craft are worth persisting; a tall ship's vertex list
         would spend most of the origin's storage quota on one model. */
      if(record.count<=3000) kitStoreSet(set,name,record);
    }
    const model=kitUpload(record,name,set);
    kitState.loaded++;
    return model;
  })();
  kitCache.set(key,job);
  try{ return await job; }
  catch(error){
    kitCache.delete(key); kitState.failed++;
    if(typeof console!=='undefined'&&console.warn) console.warn('Aqua model:',name,error&&error.message||error);
    return null;
  }
}
function loadKits(list){ return Promise.all(list.map(item=>loadKit(item[0],item[1]))); }
function releaseKits(prefix){
  for(const [key,job] of [...kitCache]){
    if(prefix&&key.indexOf(prefix)!==0) continue;
    kitCache.delete(key);
    job.then(model=>{
      if(!model) return;
      gl.deleteVertexArray(model.vao); gl.deleteBuffer(model.vb); gl.deleteBuffer(model.ib);
    }).catch(()=>{});
  }
}
const kitTextures={};
/* Releasing a kit must release its atlas too: the GPU handle in the cache
   would otherwise still be bound on the next enable after it was deleted. */
function releaseKitTexture(set){
  const tex=kitTextures[set];
  if(!tex) return;
  delete kitTextures[set];
  gl.deleteTexture(tex);
}
function loadKitTexture(set){
  if(kitTextures[set]) return Promise.resolve(kitTextures[set]);
  return new Promise(resolve=>{
    const file=KIT_SETS[set];
    if(!file) return resolve(null);
    const image=new Image();
    image.onerror=()=>resolve(null);
    image.onload=()=>{
      if(gl.isContextLost()) return resolve(null);
      let tex=null;
      try{
        tex=gl.createTexture();
        if(!tex) return resolve(null);
        gl.activeTexture(gl.TEXTURE14); gl.bindTexture(gl.TEXTURE_2D,tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.activeTexture(gl.TEXTURE0);
        kitTextures[set]=tex;
        resolve(tex);
      }catch(e){ if(tex) gl.deleteTexture(tex); resolve(null); }
    };
    image.src=KIT_DIR+set+'/'+file;
  });
}
