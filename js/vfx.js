'use strict';
/* ============================================================
   Advanced VFX
   ------------------------------------------------------------
   One master quality control that upgrades every effect in the scene, rather
   than adding a separate showpiece:

     off        the original pass, all extra work skipped
     enhanced   god rays, lens flare and dirt, far depth of field, anamorphic
                bloom, denser spray/mist, night fireflies and plankton glow
     cinematic  the same at full strength plus a wider bloom pyramid, longer
                light shafts, stronger flare and richer night effects

   The level is a single number (0/1/2) read by shaders through uVFX and by the
   particle and weather budgets, so every system scales together.
   ============================================================ */
vfxLevel=(window.AquaBoot&&window.AquaBoot.safeMode)?0:1;
function vfxIndex(name){
  const i=VFX_LEVELS.indexOf(name);
  return i<0?1:i;
}
/* Changing the level only changes uniforms and the next frame's budgets, so
   it never rebuilds a buffer, texture or shader program. */
function setVFX(name){
  let level=vfxIndex(name);
  if(window.AquaBoot&&window.AquaBoot.safeMode) level=0;
  vfxLevel=level;
  return VFX_LEVELS[vfxLevel];
}

/* ------------------------------------------------------------
   Lens dirt
   A photographic smudge map, additively lit by bright parts of the frame in
   the post pass. A missing file leaves a black 1x1, which contributes nothing.
   ------------------------------------------------------------ */
const vfxTex={dirt:null};
function makeVfxTexture(fallback,file){
  const tex=gl.createTexture();
  gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(fallback));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const image=new Image();
  image.onload=()=>{
    if(gl.isContextLost()) return;
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  };
  image.src='assets/vfx/'+file;
  return tex;
}
vfxTex.dirt=makeVfxTexture([0,0,0,255],'lens-dirt.png');

/* ------------------------------------------------------------
   Night fireflies
   A seeded cloud of glow points over the islands. Their drift and pulse are
   evaluated in the vertex/fragment shaders from one seed each, so the CPU
   only rebuilds the instance list when the archipelago or level changes.
   ------------------------------------------------------------ */
const FIREFLY_MAX=220;
const fireflyData=new Float32Array(FIREFLY_MAX*4);
let fireflyCount=0, fireflyKey='';
function fireflySeed(n){
  let a=(n^0x9e3779b9)>>>0;
  return ()=>{ a=(a+0x6d2b79f5)>>>0; let t=a; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
}
function buildFireflies(){
  fireflyCount=0;
  if(!islands.active||!islands.land.length) return;
  const rand=fireflySeed((islands.seed^0x51ed270b)+vfxLevel*977);
  const target=vfxLevel>=2?180:90;
  for(const I of islands.land){
    if(I.biome==='desert'||I.biome==='volcanic') continue;
    const per=Math.max(4,Math.round(target*I.rx*I.rz/Math.max(1,islands.land.length*120)));
    for(let i=0;i<per&&fireflyCount<FIREFLY_MAX;i++){
      const a=rand()*Math.PI*2, r=0.28+rand()*0.58;
      const lx=Math.cos(a)*I.rx*r, lz=Math.sin(a)*I.rz*r;
      const x=I.x+I.cs*lx-I.sn*lz, z=I.z+I.sn*lx+I.cs*lz;
      const y=islandGround(x,z);
      if(y<0.8||y>15) continue;
      const o=fireflyCount++*4;
      fireflyData[o]=x; fireflyData[o+1]=y+0.5+rand()*2.2; fireflyData[o+2]=z; fireflyData[o+3]=rand();
    }
  }
  if(fireflyCount){
    gl.bindBuffer(gl.ARRAY_BUFFER,fireflyBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,fireflyData,0,fireflyCount*4);
  }
}
function fireflyKeyNow(){
  if(!islands.active) return 'off';
  let sig=islands.seed+'|'+islands.land.length+'|'+vfxLevel;
  for(const I of islands.land) sig+='|'+I.biome+I.rx.toFixed(1)+I.rz.toFixed(1);
  return sig;
}
const FIREFLY_VS=HDR+`
layout(location=0) in vec4 aFly;
uniform mat4 uVP; uniform vec3 uCamR,uCamU; uniform float uTime;
out vec2 vQ; out float vSeed; out float vBlink;
void main(){
  vec2 c=vec2(float(gl_VertexID&1),float(gl_VertexID>>1))*2.0-1.0;
  float seed=aFly.w;
  float ph=uTime*(0.35+0.5*fract(seed*13.7))+seed*23.0;
  vec3 drift=vec3(sin(ph*1.31+seed*7.0),sin(ph*0.93+seed*3.1)*0.55,
                  cos(ph*1.13+seed*5.7))*(0.35+0.8*fract(seed*4.9));
  vec3 p=aFly.xyz+drift;
  vBlink=smoothstep(0.15,0.95,0.5+0.5*sin(uTime*(0.7+1.5*fract(seed*7.3))+seed*31.0));
  float size=0.075+0.075*fract(seed*3.3);
  vQ=c; vSeed=seed;
  gl_Position=uVP*vec4(p+uCamR*(c.x*size)+uCamU*(c.y*size),1.0);
}`;
const FIREFLY_FS=HDR+COMMON+`
in vec2 vQ; in float vSeed; in float vBlink; out vec4 o;
void main(){
  float d=dot(vQ,vQ); if(d>1.0) discard;
  float core=exp(-d*16.0), halo=exp(-d*3.6)*0.30;
  float a=(core+halo)*vBlink*0.9;
  vec3 col=mix(vec3(0.72,1.0,0.45),vec3(0.55,0.95,0.85),fract(vSeed*5.7));
  col*=1.15+uAmbLum*0.5;
  o=vec4(col*a,a);
}`;
const pFirefly=program(FIREFLY_VS,FIREFLY_FS,'night fireflies');
const fireflyBuf=gl.createBuffer(), fireflyVAO=gl.createVertexArray();
gl.bindVertexArray(fireflyVAO);
gl.bindBuffer(gl.ARRAY_BUFFER,fireflyBuf);
gl.bufferData(gl.ARRAY_BUFFER,fireflyData.byteLength,gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,0); gl.vertexAttribDivisor(0,1);
gl.bindVertexArray(null);

/* ------------------------------------------------------------
   Harbour and ship lights
   Warm cabin lamps and a blinking masthead on every working boat, plus the
   ship's own riding light. These are part of the night pass even at VFX Off;
   they are what turns a dark bay into a harbour.
   ------------------------------------------------------------ */
const MAX_LIGHTS=64, lightData=new Float32Array(MAX_LIGHTS*8);
let lightCount=0;
function pushLight(x,y,z,size,r,g,b,a){
  if(lightCount>=MAX_LIGHTS) return;
  const o=lightCount++*8;
  lightData[o]=x; lightData[o+1]=y; lightData[o+2]=z; lightData[o+3]=size;
  lightData[o+4]=r; lightData[o+5]=g; lightData[o+6]=b; lightData[o+7]=a;
}
function updateNightLights(){
  lightCount=0;
  if(sky.night<0.05) return;
  if(typeof boats!=='undefined'&&boats.enabled&&boats.status==='ready'&&boats.list){
    for(const b of boats.list){
      const d=Math.hypot(b.x-eye[0],b.z-eye[2]);
      if(d>260) continue;
      /* Never let a distant lamp fall below a pixel or two: it should read as
         a point of light across the bay, not disappear. */
      const minSize=d*0.0017, fade=1-Math.max(0,(d-190)/70)*0.85;
      pushLight(b.x,b.y+b.height*0.58,b.z,Math.max(0.16+b.height*0.035,minSize),1.0,0.62,0.28,0.85*fade);
      const blink=0.55+0.45*Math.sin(simT*1.9+b.index), top=b.y+b.height*0.97;
      pushLight(b.x,top,b.z,Math.max(0.09,minSize*0.7),0.80,0.92,1.0,0.75*blink*fade);
    }
  }
  if(typeof ship!=='undefined'&&ship.enabled&&ship.status==='ready'){
    const sc=ship.classScale||1, d=Math.hypot(ship.x-eye[0],ship.z-eye[2]), minSize=d*0.0017;
    pushLight(ship.x,ship.y+2.2*sc,ship.z,Math.max(0.34,minSize),1.0,0.70,0.36,0.9);
    pushLight(ship.x,ship.y+9.5*sc,ship.z,Math.max(0.18,minSize*0.6),0.85,0.95,1.0,0.8);
    pushLight(ship.x,ship.y+7.0*sc,ship.z,Math.max(0.12,minSize*0.5),1.0,0.30,0.24,0.75);
  }
}
const LIGHT_VS=HDR+`
layout(location=0) in vec4 aLight;
layout(location=1) in vec4 aTint;
uniform mat4 uVP; uniform vec3 uCamR,uCamU;
out vec2 vQ; out vec4 vTint;
void main(){
  vec2 c=vec2(float(gl_VertexID&1),float(gl_VertexID>>1))*2.0-1.0;
  vQ=c; vTint=aTint;
  gl_Position=uVP*vec4(aLight.xyz+uCamR*(c.x*aLight.w)+uCamU*(c.y*aLight.w),1.0);
}`;
const LIGHT_FS=HDR+COMMON+`
in vec2 vQ; in vec4 vTint; out vec4 o;
void main(){
  float d=dot(vQ,vQ); if(d>1.0) discard;
  float glow=exp(-d*5.5)*0.55+exp(-d*26.0);
  vec3 c=vTint.rgb*(1.30+uAmbLum*0.5);
  float a=glow*vTint.a;
  o=vec4(c*a,a);
}`;
const pLight=program(LIGHT_VS,LIGHT_FS,'night lights');
const lightBuf=gl.createBuffer(), lightVAO=gl.createVertexArray();
gl.bindVertexArray(lightVAO);
gl.bindBuffer(gl.ARRAY_BUFFER,lightBuf);
gl.bufferData(gl.ARRAY_BUFFER,lightData.byteLength,gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,4,gl.FLOAT,false,32,0); gl.vertexAttribDivisor(0,1);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,4,gl.FLOAT,false,32,16); gl.vertexAttribDivisor(1,1);
gl.bindVertexArray(null);
function drawNightLights(){
  updateNightLights();
  if(!lightCount) return;
  gl.bindBuffer(gl.ARRAY_BUFFER,lightBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,lightData,0,lightCount*8);
  gl.useProgram(pLight); setSky(pLight);
  gl.uniformMatrix4fv(L(pLight,'uVP'),false,VP);
  gl.uniform3fv(L(pLight,'uCamR'),camR); gl.uniform3fv(L(pLight,'uCamU'),camU);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE); gl.depthMask(false);
  gl.bindVertexArray(lightVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,lightCount);
  gl.bindVertexArray(null);
  gl.depthMask(true); gl.disable(gl.BLEND);
}

/* Fireflies appear only in still, mild weather: rain and gales ground them. */
function drawVFX(){
  drawNightLights();
  if(vfxLevel<1||!islands.active) return;
  if(sky.night<0.12||envS.precip>0.45||envS.wind>20) return;
  const key=fireflyKeyNow();
  if(key!==fireflyKey){ fireflyKey=key; buildFireflies(); }
  if(!fireflyCount) return;
  gl.useProgram(pFirefly); setSky(pFirefly);
  gl.uniformMatrix4fv(L(pFirefly,'uVP'),false,VP);
  gl.uniform3fv(L(pFirefly,'uCamR'),camR); gl.uniform3fv(L(pFirefly,'uCamU'),camU);
  gl.uniform1f(L(pFirefly,'uTime'),simT);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE); gl.depthMask(false);
  gl.bindVertexArray(fireflyVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,fireflyCount);
  gl.bindVertexArray(null);
  gl.depthMask(true); gl.disable(gl.BLEND);
}
/* Night plankton: a handful of soft cyan motes in the surf, emitted by the
   spray calls when the advanced level is on and the sun is well below the
   horizon. Kept here so the water, foam and air all share one night signal. */
function vfxNightGlow(){ return vfxLevel>0?clamp(sky.night,0,1):0; }
