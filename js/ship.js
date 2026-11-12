'use strict';
/* ============================================================
   A sailing ship

   Dutch Ship Medium is kept locally as three indexed meshes and 1K PBR
   maps. It is loaded only when requested; a failure is isolated from the
   ocean renderer. The hull, helm, camera, deck and balls share one pose.
   ============================================================ */
const SHIP_VS=HDR+`
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uVP,uModel;
uniform vec3 uMeshScale;
uniform float uMirror,uSail,uTime,uWind,uBillow;
out vec3 vWorld,vN; out vec2 vUV;
void main(){
  /* Each class re-proportions the same mesh: hull beam and length, mast
     height and sail area are all a per-mesh scale, so the CPU collision
     transform can stay an exact match of what is drawn. */
  vec3 local=aPos*uMeshScale;
  if(uSail>0.5){
    /* Cloth bellies out downwind and flutters in smaller panel waves. The
       displacement is only a few centimetres on a 24 m ship, so the canvas
       reads as fastened to the yards while it breathes. */
    float panel=sin(local.x*2.15+local.y*1.1+uTime*(0.9+uWind*0.5));
    float ripple=sin(local.y*6.4-uTime*(3.1+uWind*1.7)+local.x*0.7)*0.35;
    local.z+=(panel*0.050+ripple*0.018)*uWind*uBillow;
  }
  vec4 w=uModel*vec4(local,1.0);
  vWorld=w.xyz;
  vN=mat3(uModel)*normalize(aNormal/max(uMeshScale,vec3(0.001)));
  vUV=aUV;
  if(uMirror>0.5) w.y=-w.y;
  gl_Position=uVP*w;
}`;
const SHIP_FS=HDR+COMMON+`
in vec3 vWorld,vN; in vec2 vUV; out vec4 o;
uniform sampler2D uAlbedo,uNormalMap,uMaterial;
uniform vec3 uCamEff,uTint;
uniform float uMirror,uMode,uSail,uUnderwater,uSailTrans;
void main(){
  if(uMirror>0.5&&vWorld.y<0.0) discard;
  vec4 tex=texture(uAlbedo,vUV);
  if(uSail>0.5&&tex.a<0.5) discard;
  vec3 N=normalize(vN);
  if(!gl_FrontFacing) N=-N;
  /* The source has no tangent attribute. Derivatives reconstruct its tangent
     frame per fragment, preserving the authored normal maps. */
  vec3 dp1=dFdx(vWorld),dp2=dFdy(vWorld);
  vec2 duv1=dFdx(vUV),duv2=dFdy(vUV);
  vec3 T=dp1*duv2.y-dp2*duv1.y;
  vec3 B=-dp1*duv2.x+dp2*duv1.x;
  float tl=length(T),bl=length(B);
  if(tl>0.00001&&bl>0.00001){
    T/=tl; B/=bl;
    vec3 nm=texture(uNormalMap,vUV).xyz*2.0-1.0;
    N=normalize(T*nm.x+B*nm.y+N*nm.z);
  }
  vec3 orm=texture(uMaterial,vUV).rgb;
  float rough=clamp(orm.g,0.20,1.0), metal=uSail>0.5?0.0:orm.b;
  vec3 albedo=pow(tex.rgb,vec3(1.8))*1.18*uTint;
  if(uSail>0.5){
    /* Canvas: a woven thread pattern that fades out before it can alias,
       patch seams, and sunlight bleeding through the cloth from behind. */
    float fade=1.0-smoothstep(0.015,0.09,length(fwidth(vUV)));
    float weave=sin(vUV.x*540.0)*sin(vUV.y*540.0);
    albedo*=1.0+weave*0.055*fade;
    float seam=1.0-smoothstep(0.0,0.006,min(abs(fract(vUV.x*3.0)-0.5),abs(fract(vUV.y*2.0)-0.5)));
    albedo*=1.0-seam*0.10*fade;
    float back=max(dot(normalize(-uLight),N),0.0);
    albedo+=uSunCol*back*uSailTrans*0.16;
  }
  float wet=max(uRain*0.35,1.0-smoothstep(-0.1,1.2,vWorld.y));
  albedo*=mix(1.0,0.68,wet*(1.0-uSail));
  rough=mix(rough,0.24,wet*0.55*(1.0-uSail));
  vec3 V=normalize(uCamEff-vWorld), H=normalize(uLight+V);
  float nl=max(dot(N,uLight),0.0);
  vec3 hemi=mix(uHorizon*0.37+vec3(0.035),uZenith*0.45+vec3(0.10),N.y*0.5+0.5);
  vec3 col=albedo*(hemi+vec3(0.22*uAmbLum)+uSunCol*nl*0.54)*(0.7+0.3*orm.r);
  float gloss=mix(6.0,110.0,1.0-rough);
  float spec=pow(max(dot(N,H),0.0),gloss)*(0.04+metal*0.32+wet*0.08)*nl;
  col+=uSunCol*spec;
  /* Sails glow a little when backlit; timber does not. */
  if(uSail>0.5){
    float back=max(dot(normalize(-uLight),N),0.0);
    col+=albedo*uSunCol*back*uSailTrans*0.32+albedo*vec3(0.10,0.11,0.12)*uAmbLum*0.35;
  }
  if(uMode<0.5) col+=albedo*vec3(0.035,0.10,0.12)*uUnderwater;
  col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  if(uMode>0.5) o=vec4(enc(col),1.0); else o=vec4(tonemap(col),1.0);
}`;
const SHIP_MOTION_VS=HDR+`
layout(location=0) in vec3 aPos; layout(location=2) in vec2 aUV;
uniform mat4 uVP,uPrevVP,uModel,uPrevModel;
uniform vec3 uMeshScale;
uniform float uSail,uWind,uTime,uPrevTime,uBillow;
out vec4 vNow,vOld; out vec2 vUV;
void main(){
  vec3 p=aPos*uMeshScale,old=aPos*uMeshScale;
  if(uSail>0.5){
    float panel=sin(p.x*2.15+p.y*1.1),ripple=sin(p.y*6.4+p.x*0.7)*0.35;
    float prevPanel=sin(old.x*2.15+old.y*1.1),prevRipple=sin(old.y*6.4+old.x*0.7)*0.35;
    p.z+=(panel*sin(uTime*(0.9+uWind*0.5))*0.050+ripple*sin(-uTime*(3.1+uWind*1.7))*0.018)*uWind*uBillow;
    old.z+=(prevPanel*sin(uPrevTime*(0.9+uWind*0.5))*0.050+prevRipple*sin(-uPrevTime*(3.1+uWind*1.7))*0.018)*uWind*uBillow;
  }
  vNow=uVP*uModel*vec4(p,1.0);vOld=uPrevVP*uPrevModel*vec4(old,1.0);vUV=aUV;gl_Position=vNow;
}`;
const SHIP_MOTION_FS=HDR+`
in vec4 vNow,vOld; in vec2 vUV; out vec4 o;
uniform vec2 uRes; uniform sampler2D uAlbedo; uniform float uSail;
void main(){
  if(uSail>0.5&&texture(uAlbedo,vUV).a<0.5) discard;
  if(vOld.w<=0.001){o=vec4(0.0);return;}
  vec2 pixels=(vNow.xy/vNow.w-vOld.xy/vOld.w)*0.5*uRes;
  vec2 q=floor(clamp(pixels/128.0+0.5,0.0,1.0)*4095.0+0.5);
  vec2 hi=floor(q/256.0),lo=q-hi*256.0;
  o=vec4(lo.x,lo.y,hi.x*16.0+hi.y,255.0)/255.0;
}`;
const pShip=program(SHIP_VS,SHIP_FS,'ship'),pShipMotion=program(SHIP_MOTION_VS,SHIP_MOTION_FS,'ship motion');
const SHIP_ASSET='assets/ship/';
/* Heading is clockwise from north; the model's bow is its local +X axis. */
const SHIP_LIMIT=180;
/* ---------------------------------------------------------------
   Ship selection

   Every class is built from the same CC0 CC0 Dutch-ship geometry, which is the
   only redistributable hull in this repository: no external download is
   required at runtime. Each class re-proportions the hull, masts and canvas,
   retints the timber, rigging and sails, and changes how the vessel behaves
   under sail. The local mesh, deck sampling and ball contacts stay exact for
   every class because the collision transform uses the same hull scale.
   --------------------------------------------------------------- */
const SHIP_CLASSES=[
  {name:'Merchantman',short:'Merchant',tag:'Dutch merchant · balanced all-rounder',
   note:'The original tall-pooped trader. Forgiving, roomy deck, steady in a seaway.',
   hull:[1.00,1.00,1.00],mast:1.00,speed:1.00,agility:1.00,heel:1.00,
   hullTint:[1.00,0.98,0.94],rigTint:[0.94,0.92,0.86],sailTint:[0.97,0.93,0.82]},
  {name:'Coastal sloop',short:'Sloop',tag:'Small, nimble single-master',
   note:'Short hull, tall rig, quick helm. Tacks fast but pounds in a steep sea.',
   hull:[0.80,0.94,0.88],mast:1.10,speed:1.06,agility:1.34,heel:1.12,
   hullTint:[0.86,1.00,0.96],rigTint:[0.98,0.96,0.90],sailTint:[1.00,0.97,0.88]},
  {name:'Brigantine',short:'Brig',tag:'Two-masted raider',
   note:'A long, low hull with a big sail plan. Fast off the wind, stiff to leeward.',
   hull:[0.94,1.02,0.94],mast:1.06,speed:1.07,agility:1.06,heel:1.05,
   hullTint:[0.82,0.92,0.80],rigTint:[0.90,0.90,0.86],sailTint:[0.93,0.91,0.82]},
  {name:'Caravel',short:'Caravel',tag:'Round-bowed explorer',
   note:'Beamy and buoyant: a comfortable, slow-turning blue-water hull.',
   hull:[0.90,0.98,1.14],mast:0.94,speed:0.90,agility:0.94,heel:0.92,
   hullTint:[1.06,0.88,0.72],rigTint:[0.94,0.88,0.78],sailTint:[0.98,0.92,0.78]},
  {name:'Frigate',short:'Frigate',tag:'Fast naval square-rigger',
   note:'Long, fine entry and a towering rig. Reaches hard, carries her way far.',
   hull:[1.16,1.05,1.00],mast:1.14,speed:1.14,agility:0.92,heel:1.08,
   hullTint:[1.02,0.98,0.80],rigTint:[0.96,0.94,0.88],sailTint:[1.02,1.00,0.96]},
  {name:'Clipper',short:'Clipper',tag:'Extreme, slender and quick',
   note:'The fastest hull here: knife-thin bow, towering canvas, wet ride.',
   hull:[1.26,1.00,0.88],mast:1.20,speed:1.26,agility:1.04,heel:1.18,
   hullTint:[1.06,1.02,0.92],rigTint:[0.98,0.97,0.94],sailTint:[1.05,1.03,0.98]},
  {name:'Dhow',short:'Dhow',tag:'Lateen-rigged trader',
   note:'Low freeboard and a light, weatherly rig. Wears round and reaches well.',
   hull:[0.94,0.92,0.98],mast:0.92,speed:1.02,agility:1.20,heel:1.14,
   hullTint:[1.08,0.80,0.62],rigTint:[0.92,0.84,0.70],sailTint:[1.06,0.98,0.80]},
  {name:'Ghost galleon',short:'Galleon',tag:'Barnacled, half-forgotten',
   note:'A heavy galleon under pale, patched canvas. Slow to answer, hard to stop.',
   hull:[1.10,1.08,1.06],mast:1.10,speed:0.96,agility:0.84,heel:1.02,
   hullTint:[0.70,0.84,0.84],rigTint:[0.74,0.80,0.78],sailTint:[0.82,0.88,0.86]}
];
const SHIP_HULL_IDENTITY=[1,1,1];
const ship={enabled:false,status:'idle',error:'',x:0,z:0,y:0,roll:0,pitch:0,heading:Math.PI/2,poseReady:false,
  speed:0,throttle:0,anchored:true,vx:0,vy:0,vz:0,turnRate:0,rudder:0,heel:0,pointOfSail:1,travelled:0,relocated:false,warningTime:-10,
  classIndex:0,hull:[1,1,1],hullMax:1,classScale:1,
  matrix:new Float32Array(16),meshes:[],textures:[],buffers:[],grid:null,load:null,foamClock:0,wakeClock:0,motionPrev:null,prevTime:0};
const SHIP_GRID={minX:-11,minZ:-3.5,cell:0.5,width:48,height:14};

/* A compact broad-phase for horizontal deck triangles. This is deliberately
   limited to the model's open decks: it is not a made-up cabin interior. */
function buildShipDeck(buffer,mesh){
  const verts=new Float32Array(buffer,mesh.vertexOffset,mesh.vertexCount*8);
  const indices=new Uint16Array(buffer,mesh.indexOffset,mesh.indexCount);
  const cells=Array.from({length:SHIP_GRID.width*SHIP_GRID.height},()=>[]), triangles=[];
  const {minX,minZ,cell,width,height}=SHIP_GRID;
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*8,b=indices[i+1]*8,c=indices[i+2]*8;
    if(c+2>=verts.length||b+2>=verts.length||a+2>=verts.length) throw new Error('Invalid ship deck indices');
    const x=verts[a],y=verts[a+1],z=verts[a+2];
    const ux=verts[b]-x,uy=verts[b+1]-y,uz=verts[b+2]-z;
    const vx=verts[c]-x,vy=verts[c+1]-y,vz=verts[c+2]-z;
    const den=ux*vz-uz*vx, nx=uy*vz-uz*vy,nz=ux*vy-uy*vx, len=Math.hypot(nx,den,nz);
    if(len<0.001||Math.abs(den)<len*0.68) continue;
    if(Math.max(y,verts[b+1],verts[c+1])<1.0||Math.min(y,verts[b+1],verts[c+1])>5.8) continue;
    const x0=clamp(Math.floor((Math.min(x,verts[b],verts[c])-minX)/cell),0,width-1);
    const x1=clamp(Math.floor((Math.max(x,verts[b],verts[c])-minX)/cell),0,width-1);
    const z0=clamp(Math.floor((Math.min(z,verts[b+2],verts[c+2])-minZ)/cell),0,height-1);
    const z1=clamp(Math.floor((Math.max(z,verts[b+2],verts[c+2])-minZ)/cell),0,height-1);
    const id=triangles.length; triangles.push({x,y,z,ux,uy,uz,vx,vy,vz,den});
    for(let iz=z0;iz<=z1;iz++) for(let ix=x0;ix<=x1;ix++) cells[iz*width+ix].push(id);
  }
  return {cells,triangles};
}
function shipDeckAt(x,z,reference){
  if(!ship.grid) return null;
  const {minX,minZ,cell,width,height}=SHIP_GRID;
  const ix=Math.floor((x-minX)/cell),iz=Math.floor((z-minZ)/cell);
  if(ix<0||iz<0||ix>=width||iz>=height) return null;
  const candidates=ship.grid.cells[iz*width+ix];
  let best=null,score=Infinity;
  for(const id of candidates){
    const t=ship.grid.triangles[id],dx=x-t.x,dz=z-t.z;
    const u=(dx*t.vz-dz*t.vx)/t.den,v=(t.ux*dz-t.uz*dx)/t.den;
    if(u<-.0001||v<-.0001||u+v>1.0001) continue;
    const y=t.y+u*t.uy+v*t.vy;
    if(y<1||y>5.8) continue;
    if(Number.isFinite(reference)){
      /* Small steps are climbable; large jumps and floors below the deck are
         rejected. Prefer the current floor to furniture above or below it. */
      if(y>reference+0.50||y<reference-0.85) continue;
      const d=Math.abs(y-reference);
      if(d<score){score=d;best=y;}
    }else if(best===null||y>best) best=y;
  }
  return best;
}

function validateShipAsset(meta,bytes){
  if(!meta||meta.format!==1||meta.byteLength!==bytes.byteLength||!Array.isArray(meta.meshes)||meta.meshes.length!==3) throw new Error('Invalid ship geometry');
  for(const m of meta.meshes){
    if(!Number.isInteger(m.vertexOffset)||!Number.isInteger(m.vertexCount)||m.stride!==32||
       !Number.isInteger(m.indexOffset)||!Number.isInteger(m.indexCount)||m.vertexOffset<0||m.indexOffset<0||
       m.vertexOffset%4||m.indexOffset%2||m.vertexCount<=0||m.indexCount<=0||
       m.vertexOffset+m.vertexCount*32>bytes.byteLength||m.indexOffset+m.indexCount*2>bytes.byteLength)
      throw new Error('Invalid ship geometry offsets');
  }
}
function releaseShipResources(){
  for(const m of ship.meshes) if(m.vao) gl.deleteVertexArray(m.vao);
  for(const b of ship.buffers) if(b) gl.deleteBuffer(b);
  for(const t of ship.textures) if(t) gl.deleteTexture(t);
  ship.meshes=[]; ship.buffers=[]; ship.textures=[]; ship.grid=null;
}
function shipTexture(file){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onerror=()=>reject(new Error('Could not load '+file));
    image.onload=()=>{
      if(gl.isContextLost()){reject(new Error('Graphics context was lost'));return;}
      let tex=null;
      try{
        let source=image;
        const max=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE)||1024,window.AquaBoot.safeMode?512:
          (matchMedia('(pointer: coarse)').matches||matchMedia('(any-pointer: coarse)').matches?768:1024));
        if(Math.max(image.width,image.height)>max){
          const ratio=max/Math.max(image.width,image.height),small=document.createElement('canvas');
          small.width=Math.max(1,Math.round(image.width*ratio)); small.height=Math.max(1,Math.round(image.height*ratio));
          const ctx=small.getContext('2d');
          if(!ctx) throw new Error('Could not reduce the ship texture');
          ctx.drawImage(image,0,0,small.width,small.height); source=small;
        }
        tex=gl.createTexture(); if(!tex) throw new Error('Could not allocate a ship texture');
        gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D,tex);
        /* glTF UVs use the image's top row as v=0. Do not flip here. */
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        gl.generateMipmap(gl.TEXTURE_2D);
        if(gl.isContextLost()) throw new Error('Graphics context was lost');
        const error=gl.getError();
        if(error!==gl.NO_ERROR) throw new Error('Could not upload a ship texture (WebGL '+error+')');
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
        const aniso=gl.getExtension('EXT_texture_filter_anisotropic');
        if(aniso) gl.texParameterf(gl.TEXTURE_2D,aniso.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        gl.activeTexture(gl.TEXTURE0); ship.textures.push(tex); resolve(tex);
      }catch(error){ if(tex) gl.deleteTexture(tex); gl.activeTexture(gl.TEXTURE0); reject(error); }
    };
    image.src=SHIP_ASSET+file;
  });
}
async function loadShip(){
  ship.status='loading'; ship.error='';
  try{
    const responses=await Promise.all([fetch(SHIP_ASSET+'mesh.json'),fetch(SHIP_ASSET+'dutch-ship.bin')]);
    if(responses.some(r=>!r.ok)) throw new Error('Ship geometry could not be downloaded');
    const [meta,bytes]=await Promise.all([responses[0].json(),responses[1].arrayBuffer()]);
    validateShipAsset(meta,bytes);
    if(gl.isContextLost()) throw new Error('Graphics context was lost');
    ship.grid=buildShipDeck(bytes,meta.meshes[1]);
    const minIndex=Math.min(...meta.meshes.map(m=>m.indexOffset));
    const maxIndex=Math.max(...meta.meshes.map(m=>m.indexOffset+m.indexCount*2));
    const ib=gl.createBuffer(); if(!ib) throw new Error('Could not allocate ship indices');
    ship.buffers.push(ib); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint8Array(bytes,minIndex,maxIndex-minIndex),gl.STATIC_DRAW);
    for(const m of meta.meshes){
      const vao=gl.createVertexArray(),vb=gl.createBuffer();
      if(!vao||!vb){if(vao) gl.deleteVertexArray(vao);if(vb) gl.deleteBuffer(vb);throw new Error('Could not allocate ship mesh');}
      ship.buffers.push(vb); ship.meshes.push({vao,count:m.indexCount,offset:m.indexOffset-minIndex,maps:null});
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,new Uint8Array(bytes,m.vertexOffset,m.vertexCount*32),gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,32,0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,32,12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,2,gl.FLOAT,false,32,24);
    }
    gl.bindVertexArray(null);
    if(gl.isContextLost()) throw new Error('Graphics context was lost');
    const error=gl.getError();
    if(error!==gl.NO_ERROR) throw new Error('Could not upload the ship geometry (WebGL '+error+')');
    /* Upload serially to avoid holding nine decoded source images at once. */
    for(const [i,name] of ['rigging','hull','sails'].entries()){
      const ext=name==='sails'?'png':'jpg';
      ship.meshes[i].maps=[await shipTexture(name+'-color.'+ext),await shipTexture(name+'-normal.jpg'),await shipTexture(name+'-material.jpg')];
    }
    if(!ship.enabled){releaseShipResources();ship.status='idle';return false;}
    ship.status='ready'; ship.motionPrev=null; havePrev=false;
    return true;
  }catch(error){
    releaseShipResources(); ship.status='error'; ship.error=error&&error.message||'Ship could not load';
    if(ship.enabled&&typeof toast==='function') toast('Ship could not load · check the local assets and try again');
    console.warn('Aqua ship:',error);
    return false;
  }finally{ ship.load=null; }
}
function ensureShip(){
  if(ship.status==='ready') return Promise.resolve(true);
  if(ship.load) return ship.load;
  ship.load=loadShip(); return ship.load;
}

/* Test the whole rotated footprint, not only the centre or an axis-aligned
   bounding box. Small movement steps keep the boat from tunnelling ashore. */
function shipPlacementOK(x,z,heading=ship.heading){
  if(!islands.active) return true;
  const fx=Math.sin(heading),fz=-Math.cos(heading),rx=Math.cos(heading),rz=Math.sin(heading);
  /* Reject only when the rotated footprint cannot overlap any sampled
     heightfield square. The small margin is conservative at mesh edges; near
     shore, the original 65-point test remains authoritative. */
  const reachX=12*Math.abs(fx)+3*Math.abs(rx)+0.01,reachZ=12*Math.abs(fz)+3*Math.abs(rz)+0.01;
  let near=islands.land.length===0;
  for(const I of islands.land){
    if(!Number.isFinite(I.x+I.z+I.extent)||
       (Math.abs(x-I.x)<=I.extent+reachX&&Math.abs(z-I.z)<=I.extent+reachZ)){near=true;break;}
  }
  if(!near) return true;
  for(let lx=-12;lx<=12;lx+=2) for(const lz of [-3,-1.5,0,1.5,3])
    if(islandGround(x+fx*lx+rx*lz,z+fz*lx+rz*lz)>-2.3) return false;
  return true;
}
function relocateShip(){
  if(shipPlacementOK(ship.x,ship.z)) return false;
  const oldX=ship.x,oldZ=ship.z;
  let found=false;
  for(let r=8;r<=72&&!found;r+=8){
    for(let i=0;i<24;i++){
      const a=i*Math.PI*2/24,x=Math.round(Math.sin(a)*r),z=Math.round(Math.cos(a)*r);
      if(shipPlacementOK(x,z)){ship.x=x;ship.z=z;found=true;break;}
    }
  }
  if(!found){ ship.x=0; ship.z=105; }
  ship.poseReady=false;ship.speed=ship.throttle=ship.vx=ship.vy=ship.vz=ship.turnRate=0;
  ship.anchored=true;ship.relocated=true;ship.travelled=0;
  if(typeof onShipRelocated==='function') onShipRelocated(ship.x-oldX,ship.z-oldZ);
  return true;
}
function onIslandsChanged(){
  if(typeof clearIslandQuake==='function') clearIslandQuake();
  if(typeof onVoyageIslandsChanged==='function') onVoyageIslandsChanged();
  if(!ship.enabled) return;
  /* Undo an automatic placement only if the user has not sailed away from it. */
  if(!islands.active&&ship.relocated&&ship.travelled<0.5){
    const dx=-ship.x,dz=-ship.z;ship.x=0;ship.z=0;ship.poseReady=false;ship.relocated=false;
    if(typeof onShipRelocated==='function') onShipRelocated(dx,dz);
  }else if(islands.active) relocateShip();
}
function setShipAnchor(on){
  ship.anchored=!!on;
  if(ship.anchored){
    ship.throttle=0;
    if(typeof stopVoyagePilot==='function') stopVoyagePilot();
  }
}
function setShipEnabled(on){
  if(!on&&ship.enabled){
    /* Balls carried beyond the original sandbox need time to drift home when
       the ship disappears, just as they do when distant islands are removed. */
    for(const b of balls){
      if(Math.hypot(b.x-ship.x,b.z-ship.z)<32&&Math.hypot(b.x,b.z)>(islands.active?140:28)) b.shipRecovery=true;
    }
  }
  ship.enabled=!!on;
  ship.motionPrev=null; havePrev=false;
  if(on){
    relocateShip(); ship.poseReady=false;
    ensureShip();
  }else{
    if(typeof exitExplore==='function') exitExplore();
    setShipAnchor(true);ship.speed=ship.vx=ship.vy=ship.vz=ship.turnRate=0;
    if(typeof onShipDisabled==='function') onShipDisabled();
    ship.foamClock=ship.wakeClock=0;
    /* Do not retain the nine GPU textures after the ship is hidden. If a
       request is already in flight, loadShip releases it on completion. */
    if(ship.status==='ready'){releaseShipResources();ship.status='idle';}
  }
}
function shipClass(){ return SHIP_CLASSES[ship.classIndex]||SHIP_CLASSES[0]; }
function shipHullScale(){ return ship.hull; }
/* Choosing a class re-proportions the hull. Everything that maps between the
   model's local frame and the world - rendering, deck walking, boarding and
   ball contacts - uses this one scale, so no two systems can disagree. */
function setShipClass(index){
  const next=clamp(Math.round(index)||0,0,SHIP_CLASSES.length-1);
  ship.classIndex=next;
  const hull=SHIP_CLASSES[next].hull;
  ship.hull[0]=hull[0]; ship.hull[1]=hull[1]; ship.hull[2]=hull[2];
  ship.hullMax=Math.max(hull[0],hull[1],hull[2]);
  ship.classScale=Math.max(hull[0],hull[2]);
  ship.poseReady=false; ship.motionPrev=null;
  if(typeof havePrev!=='undefined') havePrev=false;
  shipMatrix();
  return next;
}
function shipPoint(x,y,z){
  const m=ship.matrix,h=ship.hull;
  x*=h[0]; y*=h[1]; z*=h[2];
  return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
}
function shipLocal(x,y,z){
  const m=ship.matrix,h=ship.hull,dx=x-m[12],dy=y-m[13],dz=z-m[14];
  return [(m[0]*dx+m[1]*dy+m[2]*dz)/h[0],(m[4]*dx+m[5]*dy+m[6]*dz)/h[1],(m[8]*dx+m[9]*dy+m[10]*dz)/h[2]];
}
function shipMatrix(){
  const cx=Math.cos(ship.roll),sx=Math.sin(ship.roll),cz=Math.cos(ship.pitch),sz=Math.sin(ship.pitch),m=ship.matrix;
  const fx=Math.sin(ship.heading),fz=-Math.cos(ship.heading),rx=Math.cos(ship.heading),rz=Math.sin(ship.heading);
  m.set([cz*fx,sz,cz*fz,0,
    -sz*cx*fx+sx*rx,cz*cx,-sz*cx*fz+sx*rz,0,
    sz*sx*fx+cx*rx,-cz*sx,sz*sx*fz+cx*rz,0,ship.x,ship.y,ship.z,1]);
}
const shipWave={h:0,vx:0,vy:0,vz:0,ax:0,az:0};
function shipHeight(x,z){waveSample(x,z,simT,false,shipWave);return shipWave.h;}
function shipWarning(message){
  if(simT-ship.warningTime<3) return;
  ship.warningTime=simT;
  if(typeof toast==='function') toast(message);
}
function updateShip(dt,sdt){
  if(!ship.enabled) return;
  let fx=Math.sin(ship.heading),fz=-Math.cos(ship.heading),rx=Math.cos(ship.heading),rz=Math.sin(ship.heading);
  const cls=shipClass();
  if(sdt>0&&ship.status==='ready'){
    const atHelm=typeof explore!=='undefined'&&explore.active&&explore.mode==='helm';
    let power=0,steer=0;
    if(atHelm&&typeof explorePressed==='function'){
      power=(explorePressed('w')||explorePressed('arrowup')?1:0)-(explorePressed('s')||explorePressed('arrowdown')?1:0);
      steer=(explorePressed('d')||explorePressed('arrowright')?1:0)-(explorePressed('a')||explorePressed('arrowleft')?1:0);
      if(power>0&&ship.anchored) ship.anchored=false;
      if(!ship.anchored) ship.throttle=clamp(ship.throttle+power*sdt*0.55,0,1);
    }
    if((steer||power)&&typeof stopVoyagePilot==='function') stopVoyagePilot();
    else if(!steer&&typeof voyageSteering==='function') steer=voyageSteering();
    const wind=typeof envS==='undefined'?8:clamp(envS.wind,0,28);
    const windDirection=typeof windAng===undefined?0:windAng;
    const windX=Math.sin(windDirection), windZ=Math.cos(windDirection);
    const along=fx*windX+fz*windZ;
    /* Points of sail. Square rigs run best with the wind astern but still
       make ground to windward; the heading therefore changes speed the way
       it does on the water, while the model stays forgiving. */
    ship.pointOfSail=0.60+0.40*clamp(0.5+0.5*along,0,1);
    const drive=clamp(wind/4,0,1)*ship.pointOfSail;
    const target=ship.anchored?0:ship.throttle*(2.0+wind*0.16)*cls.speed*drive;
    /* Weight: the hull gains way slowly and carries it long after the wind
       eases, so acceleration is a curve rather than a step response. */
    const tau=ship.anchored?0.55:(target>ship.speed?1.9:1.8);
    ship.speed+=(target-ship.speed)*(1-Math.exp(-sdt/tau));
    if(ship.speed<0.005) ship.speed=0;
    /* Rudder inertia: the helm answers over about a second, and a longer or
       finer hull turns with more authority once it has way on. */
    ship.rudder+=(clamp(steer,-1,1)-ship.rudder)*(1-Math.exp(-sdt*4.2));
    const authority=(0.20+0.34*clamp(ship.speed/4,0,1))*cls.agility;
    const turn=ship.anchored?0:ship.rudder*authority*sdt;
    let nextHeading=ship.heading+turn;
    if(turn&&!shipPlacementOK(ship.x,ship.z,nextHeading)){
      nextHeading=ship.heading;shipWarning('Too close to shore to turn that way');
    }
    const dh=nextHeading-ship.heading;
    const nfx=Math.sin(nextHeading),nfz=-Math.cos(nextHeading);
    const nrx=Math.cos(nextHeading),nrz=Math.sin(nextHeading);
    /* A touch of leeward slip: the wake is not exactly where the bow points. */
    const slip=clamp(ship.speed*0.05,0,0.24)*ship.rudder;
    const dx=(nfx*ship.speed-nrx*slip)*sdt,dz=(nfz*ship.speed-nrz*slip)*sdt,nx=ship.x+dx,nz=ship.z+dz;
    if(dx===0&&dz===0){ship.vx=ship.vz=0;}
    else if(Math.hypot(nx,nz)<=SHIP_LIMIT&&shipPlacementOK(nx,nz,nextHeading)){
      ship.x=nx;ship.z=nz;ship.travelled+=Math.hypot(dx,dz);
      ship.vx=dx/sdt;ship.vz=dz/sdt;
    }else{
      ship.speed=ship.throttle=ship.vx=ship.vz=0;
      if(typeof stopVoyagePilot==='function') stopVoyagePilot();
      shipWarning(Math.hypot(nx,nz)>SHIP_LIMIT?'Edge of the sailing area · turn back':'Shallow water ahead · turn to open sea');
    }
    ship.heading=nextHeading;ship.turnRate=dh/sdt;
    if(dh&&typeof onShipTurned==='function') onShipTurned(dh);
    fx=nfx;fz=nfz;rx=Math.cos(ship.heading);rz=Math.sin(ship.heading);
  }else if(sdt<=0){ship.vx=ship.vz=ship.turnRate=0;}
  const h0=shipHeight(ship.x,ship.z),fore=shipHeight(ship.x+fx*6,ship.z+fz*6),aft=shipHeight(ship.x-fx*6,ship.z-fz*6),
    port=shipHeight(ship.x+rx*2.2,ship.z+rz*2.2),star=shipHeight(ship.x-rx*2.2,ship.z-rz*2.2);
  const pitch=clamp(Math.atan2(fore-aft,12),-0.12,0.12),roll=clamp(-Math.atan2(port-star,4.4),-0.14,0.14);
  /* Heel: wind pressure on the canvas plus the outward lean of a turn. It is
     smoothed separately from the wave roll, so the deck settles instead of
     snapping when the wind or the helm changes. */
  const windNow=typeof envS==='undefined'?8:envS.wind;
  const windDirNow=typeof windAng==='undefined'?0:windAng;
  /* Beam wind is what lays a sailing ship over: a following wind pushes from
     astern and barely heels her, a reaching wind puts her lee rail down. The
     sideways component is the wind projected onto the beam (starboard +). */
  const windX=Math.sin(windDirNow), windZ=Math.cos(windDirNow);
  const beamWind=rx*windX+rz*windZ;
  const windHeel=clamp(beamWind,-1,1)*clamp(ship.throttle,0,1)*clamp(windNow/22,0,1)*0.13*cls.heel;
  const turnHeel=-clamp(ship.turnRate*7,-1,1)*0.05*cls.heel;
  if(sdt>0) ship.heel+=((windHeel+turnHeel)-ship.heel)*(1-Math.exp(-sdt*1.3));
  const oldY=ship.y,hadPose=ship.poseReady;
  if(!ship.poseReady){ship.y=h0;ship.pitch=pitch;ship.roll=roll+ship.heel;ship.poseReady=true;}
  else if(sdt>0){
    const k=1-Math.exp(-sdt*2.3),kr=1-Math.exp(-sdt*1.6);
    ship.y+=(h0-ship.y)*k; ship.pitch+=(pitch-ship.pitch)*kr; ship.roll+=(roll+ship.heel-ship.roll)*kr;
  }
  ship.vy=hadPose&&sdt>0?(ship.y-oldY)/sdt:0;
  shipMatrix();
  if(sdt>0&&ship.status==='ready'){
    ship.foamClock-=sdt;
    if(ship.foamClock<=0){
      ship.foamClock=lerp(1.5,0.55,clamp(sea,0,1));
      const side=Math.random()<0.5?-1:1,along=(Math.random()-0.5)*15;
      const x=ship.x+fx*along+rx*side*2.5,z=ship.z+fz*along+rz*side*2.5;
      putSurf(coastFoam,MAX_COAST_FOAM,{x,y:surfH(x,z,simT),z,width:1.6+sea,nx:rx*side,nz:rz*side,power:0.25+sea*0.6,kind:0,
        age:0,life:1.8+sea,seed:Math.random(),layer:0});
      addFoam(x,z,0.8,0.10+sea*0.13);
      if(sea>0.70&&Math.random()<0.3) crownSurfSheet(x,surfH(x,z,simT),z,0.25,2.3+sea*2);
    }
    if(ship.speed>0.55){
      ship.wakeClock-=sdt;
      if(ship.wakeClock<=0){
        ship.wakeClock=clamp(0.6-ship.speed*0.07,0.22,0.56);
        for(const side of [-1,1]){
          const x=ship.x-fx*8+rx*side*1.2,z=ship.z-fz*8+rz*side*1.2;
          putSurf(coastFoam,MAX_COAST_FOAM,{x,y:surfH(x,z,simT),z,width:1.8+ship.speed*0.22,
            nx:-fx*0.75+rx*side*0.66,nz:-fz*0.75+rz*side*0.66,power:clamp(ship.speed/4,0.2,1),kind:0,
            age:0,life:3.4,seed:Math.random(),layer:0});
        }
        /* Bow wave: a bright, fine sheet peeling away from the stem. */
        if(ship.speed>1.4){
          const bx=ship.x+fx*8.2*cls.hull[0],bz=ship.z+fz*8.2*cls.hull[0];
          for(const side of [-1,1]) putSurf(coastFoam,MAX_COAST_FOAM,{x:bx+rx*side*0.9,y:surfH(bx,bz,simT),z:bz+rz*side*0.9,
            width:1.1+ship.speed*0.12,nx:fx*0.55+rx*side*0.8,nz:fz*0.55+rz*side*0.8,
            power:clamp(ship.speed/5,0.18,0.9),kind:0,age:0,life:2.4,seed:Math.random(),layer:0});
          addFoam(bx,bz,1.4,0.05+ship.speed*0.02);
        }
      }
    }
  }
}
Hooks.on('frame',updateShip);

/* How hard the canvas is drawing: eased sail, a windy sky and sheeted-in
   sails all make the cloth belly out, while a furled or becalmed ship hangs
   slack. Kept as one function so the motion-vector pass displaces the sails
   exactly like the colour pass. */
function sailBillow(){
  const wind=clamp((typeof envS==='undefined'?10:envS.wind)/20,0,1.4);
  const trim=0.28+0.72*clamp(ship.throttle,0,1);
  return clamp(trim*(0.45+wind*0.85)*(ship.anchored?0.62:1),0.10,1.35);
}
function drawShip(mode,mirror,submerge=cameraSubmerge()){
  if(!ship.enabled||ship.status!=='ready') return;
  const cls=shipClass(),hull=cls.hull;
  gl.useProgram(pShip); setSky(pShip);
  gl.uniformMatrix4fv(L(pShip,'uVP'),false,VP); gl.uniformMatrix4fv(L(pShip,'uModel'),false,ship.matrix);
  gl.uniform3f(L(pShip,'uCamEff'),eye[0],mirror?-eye[1]:eye[1],eye[2]);
  gl.uniform1f(L(pShip,'uMirror'),mirror); gl.uniform1f(L(pShip,'uMode'),mode);
  gl.uniform1f(L(pShip,'uUnderwater'),submerge);
  gl.uniform1f(L(pShip,'uWind'),clamp(envS.wind/20,0,1.4));
  gl.uniform1f(L(pShip,'uBillow'),sailBillow());
  gl.uniform1f(L(pShip,'uSailTrans'),clamp(0.35+envS.wind/26,0.35,1));
  gl.uniform1i(L(pShip,'uAlbedo'),6); gl.uniform1i(L(pShip,'uNormalMap'),7); gl.uniform1i(L(pShip,'uMaterial'),8);
  for(let i=0;i<ship.meshes.length;i++){
    const m=ship.meshes[i],sail=i===2;
    gl.uniform1f(L(pShip,'uSail'),sail?1:0);
    /* Hull, rigging and canvas each get their own proportions and tint. */
    gl.uniform3f(L(pShip,'uMeshScale'),hull[0],hull[1],hull[2]);
    if(sail) gl.uniform3f(L(pShip,'uMeshScale'),hull[0],hull[1]*cls.mast,hull[2]);
    const tint=sail?cls.sailTint:(i===1?cls.rigTint:cls.hullTint);
    gl.uniform3fv(L(pShip,'uTint'),tint);
    for(let j=0;j<3;j++){gl.activeTexture(gl.TEXTURE6+j);gl.bindTexture(gl.TEXTURE_2D,m.maps[j]);}
    gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,m.offset);
  }
  gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
}
function drawShipMotion(){
  if(!ship.enabled||ship.status!=='ready') return;
  gl.useProgram(pShipMotion);
  gl.uniformMatrix4fv(L(pShipMotion,'uVP'),false,VP);gl.uniformMatrix4fv(L(pShipMotion,'uPrevVP'),false,prevVPm);
  gl.uniformMatrix4fv(L(pShipMotion,'uModel'),false,ship.matrix);
  gl.uniformMatrix4fv(L(pShipMotion,'uPrevModel'),false,ship.motionPrev||ship.matrix);
  gl.uniform2f(L(pShipMotion,'uRes'),canvas.width,canvas.height);
  gl.uniform1f(L(pShipMotion,'uTime'),simT);gl.uniform1f(L(pShipMotion,'uPrevTime'),ship.motionPrev?ship.prevTime:simT);
  gl.uniform1f(L(pShipMotion,'uWind'),clamp(envS.wind/20,0,1.4));gl.uniform1i(L(pShipMotion,'uAlbedo'),6);
  gl.uniform1f(L(pShipMotion,'uBillow'),sailBillow());
  const cls=shipClass(),hull=cls.hull;
  for(let i=0;i<ship.meshes.length;i++){
    const m=ship.meshes[i],sail=i===2;
    gl.uniform1f(L(pShipMotion,'uSail'),sail?1:0);
    gl.uniform3f(L(pShipMotion,'uMeshScale'),hull[0],hull[1]*(sail?cls.mast:1),hull[2]);
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,m.maps[0]);
    gl.bindVertexArray(m.vao);gl.drawElements(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,m.offset);
  }
  gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);
}
function shipHasMotion(){
  if(!ship.enabled||ship.status!=='ready'||!ship.motionPrev) return false;
  for(let i=0;i<16;i++) if(Math.abs(ship.matrix[i]-ship.motionPrev[i])>1e-5) return true;
  return Math.abs(simT-ship.prevTime)>1e-5&&envS.wind>0.1;
}
function rememberShipMotion(){
  if(ship.enabled&&ship.status==='ready'){
    if(!ship.motionPrev) ship.motionPrev=new Float32Array(16);
    ship.motionPrev.set(ship.matrix);ship.prevTime=simT;
  }else ship.motionPrev=null;
}

/* Ball contacts use the same actual open deck as the walker. The hull walls
   and decorative rigging are visual, not a full rigid-body collider. */
function collideShip(b,dt){
  if(!ship.enabled||ship.status!=='ready'||!ship.poseReady) return;
  /* A rigid rotation preserves distance. This enclosing sphere is larger
     than the complete local contact box (10.5 × 7 × 2.7 m), even at its
     corners, so remote balls need no matrix transform or deck lookup. */
  const m=ship.matrix,dx=b.x-m[12],dy=b.y-m[13],dz=b.z-m[14];
  const reach=13.4*ship.hullMax;
  if(dx*dx+dy*dy+dz*dz>reach*reach) return;
  const p=shipLocal(b.x,b.y,b.z);
  if(Math.abs(p[0])>10.5||Math.abs(p[2])>2.7||p[1]<0.5||p[1]>7) return;
  const floor=shipDeckAt(p[0],p[2],p[1]-b.r+0.15);
  if(floor===null||p[1]-b.r>floor||p[1]<floor-0.2) return;
  const target=shipPoint(p[0],floor+b.r,p[2]);
  b.x=target[0];b.y=target[1];b.z=target[2];
  const relativeVy=b.vy-ship.vy;
  if(relativeVy<0){
    if(b.type===6&&relativeVy<-4.2){waterBalloonBurst(b,-relativeVy);b.dead=true;return;}
    if(relativeVy<-2&&typeof audioKnock==='function') audioKnock(-relativeVy*0.6);
    b.vy=ship.vy-relativeVy*Math.min(0.55,b.e*bounceMul*0.55);
  }
  /* Deck friction approaches the moving hull velocity, including a turn. */
  const friction=Math.min(1,dt*30),fx=Math.sin(ship.heading),fz=-Math.cos(ship.heading),rx=Math.cos(ship.heading),rz=Math.sin(ship.heading);
  const vx=ship.vx+ship.turnRate*(p[0]*rx-p[2]*fx),vz=ship.vz+ship.turnRate*(p[0]*rz-p[2]*fz);
  b.vx+=(vx-b.vx)*friction; b.vz+=(vz-b.vz)*friction;
}
