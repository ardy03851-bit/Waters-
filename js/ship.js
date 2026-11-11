'use strict';
/* ============================================================
   A moored sailing ship

   Dutch Ship Medium is kept locally as three indexed meshes and 1K PBR
   maps. It is loaded only when requested; a failure is isolated from the
   ocean renderer. The hull, camera, deck samples and balls share one pose.
   ============================================================ */
const SHIP_VS=HDR+`
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uVP,uModel;
uniform float uMirror,uSail,uTime,uWind;
out vec3 vWorld,vN; out vec2 vUV;
void main(){
  vec3 local=aPos;
  /* The cloth responds gently to the breeze; hull and collision stay rigid. */
  if(uSail>0.5) local.z+=sin(local.x*1.35+local.y*0.7+uTime*(0.8+uWind))*0.045*uWind;
  vec4 w=uModel*vec4(local,1.0);
  vWorld=w.xyz; vN=mat3(uModel)*aNormal; vUV=aUV;
  if(uMirror>0.5) w.y=-w.y;
  gl_Position=uVP*w;
}`;
const SHIP_FS=HDR+COMMON+`
in vec3 vWorld,vN; in vec2 vUV; out vec4 o;
uniform sampler2D uAlbedo,uNormalMap,uMaterial;
uniform vec3 uCamEff;
uniform float uMirror,uMode,uSail,uUnderwater;
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
  vec3 albedo=pow(tex.rgb,vec3(1.8))*1.18;
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
  if(uMode<0.5) col+=albedo*vec3(0.035,0.10,0.12)*uUnderwater;
  col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  if(uMode>0.5) o=vec4(enc(col),1.0); else o=vec4(tonemap(col),1.0);
}`;
const SHIP_MOTION_VS=HDR+`
layout(location=0) in vec3 aPos; layout(location=2) in vec2 aUV;
uniform mat4 uVP,uPrevVP,uModel,uPrevModel;
uniform float uSail,uWind,uTime,uPrevTime;
out vec4 vNow,vOld; out vec2 vUV;
void main(){
  vec3 p=aPos,old=aPos;
  if(uSail>0.5){
    p.z+=sin(p.x*1.35+p.y*0.7+uTime*(0.8+uWind))*0.045*uWind;
    old.z+=sin(old.x*1.35+old.y*0.7+uPrevTime*(0.8+uWind))*0.045*uWind;
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
const ship={enabled:false,status:'idle',error:'',x:0,z:0,y:0,roll:0,pitch:0,poseReady:false,
  matrix:new Float32Array(16),meshes:[],textures:[],buffers:[],grid:null,load:null,foamClock:0,motionPrev:null,prevTime:0};
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

/* Keep the hull and its eight-metre rig clear of dry ground. Search a stable
   grid around the original play area; island regeneration can relocate it. */
function shipPlacementOK(x,z){
  if(!islands.active) return true;
  for(let dx=-10;dx<=10;dx+=2) for(const dz of [-3,-1.5,0,1.5,3])
    if(islandGround(x+dx,z+dz)>-2.3) return false;
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
  ship.poseReady=false;
  if(typeof onShipRelocated==='function') onShipRelocated(ship.x-oldX,ship.z-oldZ);
  return true;
}
function onIslandsChanged(){
  if(typeof clearIslandQuake==='function') clearIslandQuake();
  if(!ship.enabled) return;
  if(!islands.active&&(ship.x!==0||ship.z!==0)){
    const dx=-ship.x,dz=-ship.z;ship.x=0;ship.z=0;ship.poseReady=false;
    if(typeof onShipRelocated==='function') onShipRelocated(dx,dz);
  }else relocateShip();
}
function setShipEnabled(on){
  ship.enabled=!!on;
  ship.motionPrev=null; havePrev=false;
  if(on){
    relocateShip(); ship.poseReady=false;
    ensureShip();
  }else{
    if(typeof exitExplore==='function') exitExplore();
    ship.foamClock=0;
    /* Do not retain the nine GPU textures after the ship is hidden. If a
       request is already in flight, loadShip releases it on completion. */
    if(ship.status==='ready'){releaseShipResources();ship.status='idle';}
  }
}
function shipPoint(x,y,z){
  const m=ship.matrix;
  return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
}
function shipLocal(x,y,z){
  const m=ship.matrix,dx=x-m[12],dy=y-m[13],dz=z-m[14];
  return [m[0]*dx+m[1]*dy+m[2]*dz,m[4]*dx+m[5]*dy+m[6]*dz,m[8]*dx+m[9]*dy+m[10]*dz];
}
function shipMatrix(){
  const cx=Math.cos(ship.roll),sx=Math.sin(ship.roll),cz=Math.cos(ship.pitch),sz=Math.sin(ship.pitch),m=ship.matrix;
  m.set([cz,sz,0,0,-sz*cx,cz*cx,sx,0,sz*sx,-cz*sx,cx,0,ship.x,ship.y,ship.z,1]);
}
const shipWave={h:0,vx:0,vy:0,vz:0,ax:0,az:0};
function shipHeight(x,z){waveSample(x,z,simT,false,shipWave);return shipWave.h;}
function updateShip(dt,sdt){
  if(!ship.enabled) return;
  const h0=shipHeight(ship.x,ship.z),fore=shipHeight(ship.x+6,ship.z),aft=shipHeight(ship.x-6,ship.z),
    port=shipHeight(ship.x,ship.z+2.2),star=shipHeight(ship.x,ship.z-2.2);
  const pitch=clamp(Math.atan2(fore-aft,12),-0.12,0.12),roll=clamp(-Math.atan2(port-star,4.4),-0.14,0.14);
  if(!ship.poseReady){ship.y=h0;ship.pitch=pitch;ship.roll=roll;ship.poseReady=true;}
  else if(sdt>0){
    const k=1-Math.exp(-sdt*2.3),kr=1-Math.exp(-sdt*1.6);
    ship.y+=(h0-ship.y)*k; ship.pitch+=(pitch-ship.pitch)*kr; ship.roll+=(roll-ship.roll)*kr;
  }
  shipMatrix();
  if(sdt>0&&ship.status==='ready'){
    ship.foamClock-=sdt;
    if(ship.foamClock<=0){
      ship.foamClock=lerp(1.5,0.55,clamp(sea,0,1));
      const side=Math.random()<0.5?-1:1,x=ship.x+(Math.random()-0.5)*15,z=ship.z+side*2.5;
      putSurf(coastFoam,MAX_COAST_FOAM,{x,y:surfH(x,z,simT),z,width:1.6+sea,nx:0,nz:side,power:0.25+sea*0.6,kind:0,
        age:0,life:1.8+sea,seed:Math.random(),layer:0});
      addFoam(x,z,0.8,0.10+sea*0.13);
      if(sea>0.70&&Math.random()<0.3) crownSurfSheet(x,surfH(x,z,simT),z,0.25,2.3+sea*2);
    }
  }
}
Hooks.on('frame',updateShip);

function drawShip(mode,mirror){
  if(!ship.enabled||ship.status!=='ready') return;
  gl.useProgram(pShip); setSky(pShip);
  gl.uniformMatrix4fv(L(pShip,'uVP'),false,VP); gl.uniformMatrix4fv(L(pShip,'uModel'),false,ship.matrix);
  gl.uniform3f(L(pShip,'uCamEff'),eye[0],mirror?-eye[1]:eye[1],eye[2]);
  gl.uniform1f(L(pShip,'uMirror'),mirror); gl.uniform1f(L(pShip,'uMode'),mode);
  gl.uniform1f(L(pShip,'uUnderwater'),cameraSubmerge());
  gl.uniform1f(L(pShip,'uWind'),clamp(envS.wind/20,0,1.4));
  gl.uniform1i(L(pShip,'uAlbedo'),6); gl.uniform1i(L(pShip,'uNormalMap'),7); gl.uniform1i(L(pShip,'uMaterial'),8);
  for(let i=0;i<ship.meshes.length;i++){
    const m=ship.meshes[i]; gl.uniform1f(L(pShip,'uSail'),i===2?1:0);
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
  for(let i=0;i<ship.meshes.length;i++){
    const m=ship.meshes[i];gl.uniform1f(L(pShipMotion,'uSail'),i===2?1:0);
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
  const p=shipLocal(b.x,b.y,b.z);
  if(Math.abs(p[0])>10.5||Math.abs(p[2])>2.7||p[1]<0.5||p[1]>7) return;
  const floor=shipDeckAt(p[0],p[2],p[1]-b.r+0.15);
  if(floor===null||p[1]-b.r>floor||p[1]<floor-0.2) return;
  const target=shipPoint(p[0],floor+b.r,p[2]);
  b.x=target[0];b.y=target[1];b.z=target[2];
  if(b.vy<0){
    if(b.type===6&&b.vy<-4.2){waterBalloonBurst(b,-b.vy);b.dead=true;return;}
    if(b.vy<-2&&typeof audioKnock==='function') audioKnock(-b.vy*0.6);
    b.vy=-b.vy*Math.min(0.55,b.e*bounceMul*0.55);
  }
  const friction=Math.min(1,dt*3); b.vx*=1-friction; b.vz*=1-friction;
}
