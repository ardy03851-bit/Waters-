'use strict';
/* ============================================================
   Breaking water

   A breaking wave is a thin, irregular sheet, not a cloud of oversized
   droplets. These small instanced meshes form the cliff fan and the splash
   crown; fine ballistic spray and mist are still simulated in splash.js.
   Coastal foam has its own wave-displaced mesh so impacts outside the local
   ripple simulation leave a fading wash on the actual ocean surface.
   ============================================================ */
const MAX_SURF_SHEETS=48, MAX_COAST_FOAM=24, MAX_WIND_STREAKS=28;
const surfSheets=[], coastFoam=[], windStreaks=[];
let windStreakAcc=0;
const SURF_STRIDE=12;

function surfMesh(nx,ny,capacity){
  const vertices=new Float32Array((nx+1)*(ny+1)*2), indices=[];
  for(let y=0;y<=ny;y++) for(let x=0;x<=nx;x++){
    const i=(y*(nx+1)+x)*2; vertices[i]=x/nx; vertices[i+1]=y/ny;
  }
  for(let y=0;y<ny;y++) for(let x=0;x<nx;x++){
    const a=y*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const vao=gl.createVertexArray(), vb=gl.createBuffer(), ib=gl.createBuffer(), instances=gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,instances); gl.bufferData(gl.ARRAY_BUFFER,capacity*SURF_STRIDE*4,gl.DYNAMIC_DRAW);
  for(let i=0;i<3;i++){
    gl.enableVertexAttribArray(i+1); gl.vertexAttribPointer(i+1,4,gl.FLOAT,false,SURF_STRIDE*4,i*16); gl.vertexAttribDivisor(i+1,1);
  }
  gl.bindVertexArray(null);
  return {vao,instances,count:indices.length,data:new Float32Array(capacity*SURF_STRIDE)};
}
const sheetMesh=surfMesh(48,14,MAX_SURF_SHEETS), foamMesh=surfMesh(14,10,MAX_COAST_FOAM), windMesh=surfMesh(14,4,MAX_WIND_STREAKS);

/* aBase = origin + width/radius; aDir = normal + power + kind;
   aLife = age, lifetime, random phase, layer */
const SURF_VS=HDR+`
layout(location=0) in vec2 aUV;
layout(location=1) in vec4 aBase;
layout(location=2) in vec4 aDir;
layout(location=3) in vec4 aLife;
uniform mat4 uVP; uniform float uGravity;
out vec2 vUV; out vec3 vWorld; out float vAge; out float vSeed; out float vKind; out float vLayer;
void main(){
  float t=aLife.x, s=aUV.x*2.0-1.0, v=aUV.y, seed=aLife.z;
  float g=clamp(uGravity,1.5,25.0);
  vec3 p;
  if(aDir.w<0.5){
    vec2 n=aDir.xy, tangent=vec2(-n.y,n.x);
    float speed=7.0+4.8*aDir.z;
    float rise=max(0.0,speed*t-0.5*g*t*t);
    float fingers=0.89+0.11*sin(s*11.0+seed*17.0)+0.075*sin(s*23.0-seed*9.0)+0.035*sin(s*47.0+seed*5.0);
    float fan=(1.0-0.37*pow(abs(s),1.6))*fingers;
    float along=s*aBase.w*0.5*(1.0+0.12*v*t)+0.13*sin(v*8.0+seed*9.0+s*7.0)*v;
    float outwards=0.22+aLife.w*0.30+v*(0.12+0.55*t)+0.12*sin(s*8.0+v*5.0+seed*11.0)*v;
    p=vec3(aBase.x+tangent.x*along+n.x*outwards,
           aBase.y+0.04+v*rise*fan,
           aBase.z+tangent.y*along+n.y*outwards);
  } else if(aDir.w<1.5) {
    float angle=aUV.x*6.2831853, speed=2.0+aDir.z*0.36;
    float rise=max(0.0,speed*t-0.5*g*t*t);
    float lobes=5.0+floor(fract(seed)*5.0);
    float fingers=0.78+0.16*sin(angle*lobes+seed*10.0)+0.09*sin(angle*(lobes+6.0)-seed*7.0)+0.04*sin(angle*(lobes+14.0)+seed*5.0);
    float radius=aBase.w*(0.90+t*0.75)+v*t*(0.45+aDir.z*0.10);
    p=vec3(aBase.x+cos(angle)*radius,aBase.y+0.03+v*rise*fingers,aBase.z+sin(angle)*radius);
  } else if(aDir.w<2.5) {
    /* A narrow Worthington jet rises as a continuous column before it
       pinches off into small ballistic drops. */
    float angle=aUV.x*6.2831853, rise=max(0.0,aDir.z*t-0.5*g*t*t);
    float radius=aBase.w*(1.0-0.55*v)*(1.0+0.16*sin(v*17.0-t*8.0+seed*8.0));
    p=vec3(aBase.x+cos(angle)*radius,aBase.y+0.03+v*rise,aBase.z+sin(angle)*radius);
  } else if(aDir.w<3.5) {
    /* An oblique entry sweeps a thin, ragged fan forward, distinct from the
       radial crown. The sheet spreads as its ballistic lip rises and falls. */
    vec2 n=normalize(aDir.xy), tangent=vec2(-n.y,n.x);
    float speed=2.3+0.38*aDir.z, rise=max(0.0,speed*0.65*t-0.5*g*t*t);
    float lip=(0.86+0.10*sin(s*13.0+seed*12.0)+0.06*sin(s*29.0-seed*5.0))*(1.0-0.25*abs(s));
    float forward=aBase.w*0.7+speed*t*(0.45+0.36*(1.0-abs(s)))+v*0.16;
    float across=s*(aBase.w+speed*t*0.42);
    p=vec3(aBase.x+n.x*forward+tangent.x*across,aBase.y+0.025+v*rise*lip,
           aBase.z+n.y*forward+tangent.y*across);
  } else {
    /* The incoming lip pitches over the face of the breaker as it hits the
       cliff, with a wavy, asymmetric silhouette on each impact. */
    vec2 n=aDir.xy, tangent=vec2(-n.y,n.x);
    float rise=max(0.0,(6.0+3.3*aDir.z)*t-0.5*g*t*t);
    float rim=0.88+0.10*sin(s*12.0+seed*11.0)+0.06*sin(s*31.0-seed*8.0);
    float across=s*aBase.w*0.5*(1.0+0.1*t);
    float curl=0.9*(1.0-smoothstep(0.0,0.7,t))+0.35*sin(v*3.14159)-0.8*v*v;
    float outward=0.30+curl*v;
    p=vec3(aBase.x+tangent.x*across+n.x*outward,
           aBase.y+0.04+v*rise*rim*(1.0-0.30*abs(s)),
           aBase.z+tangent.y*across+n.y*outward);
  }
  vUV=aUV; vWorld=p; vAge=clamp(t/aLife.y,0.0,1.0); vSeed=seed; vKind=aDir.w; vLayer=aLife.w;
  gl_Position=uVP*vec4(p,1.0);
}`;
const SURF_FS=HDR+COMMON+`
in vec2 vUV; in vec3 vWorld; in float vAge; in float vSeed; in float vKind; in float vLayer;
out vec4 o;
uniform vec3 uCam;
void main(){
  /* Take derivatives before the torn-sheet alpha discard. */
  vec3 faceCross=cross(dFdx(vWorld),dFdy(vWorld));
  vec3 faceN=faceCross/max(length(faceCross),0.00001);
  float x=vUV.x, y=vUV.y;
  vec2 ring=vec2(cos(x*6.2831853),sin(x*6.2831853));
  bool planar=vKind<0.5||vKind>2.5;
  vec2 uv=planar?vec2(x*1.9+0.12*sin(y*10.0+vSeed*9.0)+vSeed*8.1,y*1.35-vAge*0.24+vSeed*3.7)
                    :ring*1.8+vec2(y*0.65+vSeed*8.1,y*1.4-vAge*0.24+vSeed*3.7);
  float broad=texture(uDetail,uv).a;
  float fine=texture(uDetail,uv*2.9+vec2(3.4,-1.8)).a;
  vec2 threadUV=planar?vec2(x*3.6+y*0.32+vSeed*13.0,y*1.8-vAge*0.42)
                          :ring*3.2+vec2(y*0.4+vSeed*13.0,y*1.3-vAge*0.42);
  float threads=texture(uDetail,threadUV).a;
  float lace=smoothstep(0.36,0.68,broad*0.55+fine*0.45+0.18*(1.0-y));
  float strands=smoothstep(0.40,0.70,threads+0.12*(1.0-y));
  float top=1.0-smoothstep(0.76+0.15*(broad-0.5),0.99,y);
  float sides=planar?smoothstep(0.0,0.09,x)*(1.0-smoothstep(0.91,1.0,x)):1.0;
  float fade=smoothstep(0.0,0.08,vAge)*(1.0-smoothstep(0.67,1.0,vAge));
  float foot=mix(0.28,1.0,smoothstep(0.0,0.12,y));
  float a=fade*sides*top*foot*(0.16+0.65*lace)*(0.65+0.35*strands)*(0.82+0.18*(1.0-y));
  if(vKind>1.5&&vKind<2.5) a=fade*top*foot*(0.30+0.35*lace);
  if(a<0.006) discard;
  vec3 V=normalize(uCam-vWorld);
  float back=pow(max(dot(-V,uLight),0.0),3.0);
  vec3 water=vec3(0.80,0.89,0.92)*(0.28+0.52*uAmbLum+0.12*uStorm)
             +uSunCol*(0.035+0.08*back)
             +vec3(0.04,0.52,0.48)*uNight*(0.35+0.65*lace);
  float fresnel=pow(1.0-abs(dot(faceN,V)),3.0);
  vec3 skyRefl=skyCol(reflect(-V,faceN),0.0);
  water=mix(water,skyRefl,0.20*fresnel);
  water*=0.83+0.34*fine;
  water=mix(water,uFogCol,1.0-exp(-length(uCam-vWorld)*uFogD));
  o=vec4(tonemap(water)*a,a);
}`;

/* Match WATER_VS's Gerstner displacement, including its distance-dependent
   wave filtering. This prevents the foam from floating above the swell. */
const COAST_FOAM_VS=HDR+QUAKE_WAVE_GLSL+`
layout(location=0) in vec2 aUV;
layout(location=1) in vec4 aBase;
layout(location=2) in vec4 aDir;
layout(location=3) in vec4 aLife;
uniform mat4 uVP; uniform float uTime; uniform vec4 uW[8]; uniform float uQ[8],uPhase[8];
uniform sampler2D uIslandMap; uniform float uIslands;
out vec2 vUV; out vec3 vWorld; out float vAge; out float vSeed;
void main(){
  vec2 n=aDir.xy, tangent=vec2(-n.y,n.x);
  /* aLife.w picks the direction: cliff foam runs seaward, beach wash runs
     landward so the sheet visibly climbs the sand after each breaker. */
  vec2 dir=mix(n,-n,clamp(aLife.w,0.0,1.0));
  vec2 p0=aBase.xz+tangent*((aUV.x*2.0-1.0)*aBase.w*0.78)+dir*(0.25+aUV.y*(2.2+1.5*aDir.z));
  float sp=0.0417*(max(abs(p0.x),abs(p0.y))+1.5);
  vec3 disp=vec3(0.0);
  for(int i=0;i<8;i++){
    vec4 w=uW[i]; float k=w.z, f=smoothstep(1.5*sp,4.5*sp,6.2831853/k);
    float th=k*dot(w.xy,p0)-sqrt(9.81*k)*uTime+uPhase[i];
    disp.xz+=w.xy*(uQ[i]*f/k)*cos(th); disp.y+=w.w*f*sin(th);
  }
  vec3 p=vec3(p0.x+disp.x,disp.y+0.075,p0.y+disp.z);
  if(uSeaQuake.w>0.0001) p.y+=seaQuakeWave(p.xz);
  /* On a beach the wash must follow the sand instead of hovering at sea
     level: sample the same shoreline height field the ocean uses and never
     sink below it. Offshore the floor is far below, so this does nothing. */
  if(uIslands>0.5){
    vec2 imuv=p.xz/160.0+0.5;
    if(all(greaterThan(imuv,vec2(0.0)))&&all(lessThan(imuv,vec2(1.0)))){
      float floorY=texture(uIslandMap,imuv).r*40.0-12.0;
      p.y=max(p.y,floorY+0.045);
    }
  }
  vUV=aUV; vWorld=p; vAge=clamp(aLife.x/aLife.y,0.0,1.0); vSeed=aLife.z;
  gl_Position=uVP*vec4(p,1.0);
}`;
const COAST_FOAM_FS=HDR+COMMON+`
in vec2 vUV; in vec3 vWorld; in float vAge; in float vSeed; out vec4 o;
uniform vec3 uCam;
void main(){
  vec2 q=vec2((vUV.x-0.5)*2.0,(vUV.y-0.38)*1.45);
  float edge=1.0-smoothstep(0.35,1.0,length(q));
  vec2 p=vWorld.xz*0.48+vec2(vSeed*9.0,-vAge*0.18);
  float n=texture(uDetail,p).a*0.62+texture(uDetail,p*2.6+3.7).a*0.38;
  float lace=smoothstep(0.43,0.68,n+edge*0.12);
  float a=edge*lace*(1.0-smoothstep(0.25,1.0,vAge))*0.48;
  if(a<0.005) discard;
  vec3 col=vec3(0.85,0.91,0.92)*(0.28+0.55*uAmbLum+0.13*uStorm)+uSunCol*0.08
          +vec3(0.05,0.55,0.50)*uNight*(0.30+0.70*lace);
  col=mix(col,uFogCol,1.0-exp(-length(uCam-vWorld)*uFogD));
  o=vec4(tonemap(col)*a,a);
}`;
/* Wind tears low, elongated veils from wave crests. Their base uses the same
   filtered Gerstner displacement and phase uniforms as the water mesh. */
const WIND_SPRAY_VS=HDR+QUAKE_WAVE_GLSL+`
layout(location=0) in vec2 aUV;
layout(location=1) in vec4 aBase; layout(location=2) in vec4 aDir; layout(location=3) in vec4 aLife;
uniform mat4 uVP; uniform float uTime; uniform vec4 uW[8]; uniform float uQ[8],uPhase[8];
out vec2 vUV; out vec3 vWorld; out float vAge; out float vSeed;
void main(){
  vec2 n=aDir.xy, tangent=vec2(-n.y,n.x);
  vec2 p0=aBase.xz+n*(aUV.x*aBase.w+aLife.x*(1.3+1.4*aDir.z))+
          tangent*((aUV.y-0.5)*(0.35+0.22*aDir.z));
  float sp=0.0417*(max(abs(p0.x),abs(p0.y))+1.5);
  vec3 disp=vec3(0.0);
  for(int i=0;i<8;i++){
    vec4 w=uW[i]; float k=w.z, f=smoothstep(1.5*sp,4.5*sp,6.2831853/k);
    float th=k*dot(w.xy,p0)-sqrt(9.81*k)*uTime+uPhase[i];
    disp.xz+=w.xy*(uQ[i]*f/k)*cos(th); disp.y+=w.w*f*sin(th);
  }
  float lift=sin(aUV.x*3.14159)*min(0.25,aLife.x*0.25);
  vWorld=vec3(p0.x+disp.x,disp.y+0.06+lift,p0.y+disp.z);
  if(uSeaQuake.w>0.0001) vWorld.y+=seaQuakeWave(vWorld.xz);
  vUV=aUV; vAge=clamp(aLife.x/aLife.y,0.0,1.0); vSeed=aLife.z;
  gl_Position=uVP*vec4(vWorld,1.0);
}`;
const WIND_SPRAY_FS=HDR+COMMON+`
in vec2 vUV; in vec3 vWorld; in float vAge; in float vSeed; out vec4 o; uniform vec3 uCam;
void main(){
  float side=1.0-smoothstep(0.35,1.0,abs(vUV.y*2.0-1.0));
  float ends=smoothstep(0.0,0.14,vUV.x)*(1.0-smoothstep(0.68,1.0,vUV.x));
  vec2 uv=vec2(vUV.x*2.1+vSeed*13.0,vUV.y*1.8-vAge*0.35);
  float n=texture(uDetail,uv).a*0.65+texture(uDetail,uv*2.7+4.7).a*0.35;
  float strands=smoothstep(0.40,0.70,n+0.12*side);
  float fade=smoothstep(0.0,0.12,vAge)*(1.0-smoothstep(0.55,1.0,vAge));
  float a=side*ends*strands*fade*0.46;
  if(a<0.005) discard;
  vec3 col=vec3(0.83,0.90,0.92)*(0.25+0.5*uAmbLum+0.14*uStorm)+uSunCol*0.07;
  col=mix(col,uFogCol,1.0-exp(-length(uCam-vWorld)*uFogD));
  o=vec4(tonemap(col)*a,a);
}`;
const pSurf=program(SURF_VS,SURF_FS,'surf'), pCoastFoam=program(COAST_FOAM_VS,COAST_FOAM_FS,'coastal foam'), pWindSpray=program(WIND_SPRAY_VS,WIND_SPRAY_FS,'wind spray');

function putSurf(list,limit,item){
  /* Recycle the oldest effect instead of letting repeated storms grow forever. */
  if(list.length>=limit) list.shift();
  list.push(item);
}
function cliffSurfSheets(x,y,z,nx,nz,power){
  const speed=7+4.8*power, life=Math.min(2.5,2*speed/Math.max(grav,4));
  const seed=Math.random(), width=(3.5+2.0*power)*(0.84+0.32*seed);
  for(let layer=0;layer<2;layer++) putSurf(surfSheets,MAX_SURF_SHEETS,
    {x,y,z,width:width*(layer?0.82:1),nx,nz,power,kind:layer?4:0,age:0,life,seed:seed+layer*0.17,layer});
  putSurf(coastFoam,MAX_COAST_FOAM,{x,y,z,width,nx,nz,power,kind:0,age:0,life:4.0+power,seed,layer:0});
}
/* Running shore wash: a wide, low sheet of white water that reaches inland
   from the waterline. The ocean shader draws the fine lace; this layer gives
   it a moving mass and a lingering foam trail on the sand. */
function spawnShoreWash(x,z,nx,nz,power,steep){
  if(!(power>0.02)) return;
  const y=surfH(x,z,simT);
  const width=(steep?1.8:2.6)+2.9*power;
  putSurf(coastFoam,MAX_COAST_FOAM,{x,y,z,width,nx,nz,power:clamp(power,0.15,1.2),kind:0,
    age:0,life:2.8+2.6*power,seed:Math.random(),layer:1});
  if(typeof vfxNightGlow!=='function') return;
  const vfx=typeof vfxLevel==='number'?vfxLevel:0;
  /* Advanced VFX: aerosol off the lip, plus cold plankton motes after dark. */
  if(vfx>0&&typeof mist==='function'&&Math.random()<0.55){
    mist(x+nx*0.7+(Math.random()-0.5)*width,y+0.30,z+nz*0.7+(Math.random()-0.5)*width,
      nx*(0.25+Math.random()*0.55),0.35+Math.random()*0.85,nz*(0.25+Math.random()*0.55),
      0.20+Math.random()*0.30,1.1+Math.random()*1.3);
  }
  const glow=vfxNightGlow();
  if(glow>0.05&&typeof emit==='function'){
    const n=vfx>=2?4:2;
    for(let i=0;i<n;i++){
      const ox=(Math.random()-0.5)*width*1.5, oz=(Math.random()-0.5)*width*1.5;
      emit(x+ox,y+0.06,z+oz,(Math.random()-0.5)*0.14,0.10+Math.random()*0.16,(Math.random()-0.5)*0.14,
        0.055+Math.random()*0.055,1.5+Math.random()*1.5,5,0.4,0.06,1);
    }
  }
}
function crownSurfSheet(x,y,z,r,power){
  const speed=2+power*0.36, life=Math.min(1.7,2*speed/Math.max(grav,4));
  putSurf(surfSheets,MAX_SURF_SHEETS,{x,y,z,width:r,nx:0,nz:0,power,kind:1,age:0,life,seed:Math.random(),layer:0});
}
function jetSurfSheet(x,y,z,r,speed){
  const life=Math.min(1.8,2*speed/Math.max(grav,4));
  putSurf(surfSheets,MAX_SURF_SHEETS,{x,y,z,width:r*0.16,nx:0,nz:0,power:speed,kind:2,age:0,life,seed:Math.random(),layer:0});
}
function fanSurfSheet(x,y,z,r,power,nx,nz){
  const speed=2.3+0.38*power, life=Math.min(1.5,2*speed*0.65/Math.max(grav,4));
  putSurf(surfSheets,MAX_SURF_SHEETS,{x,y,z,width:r,nx,nz,power,kind:3,age:0,life,seed:Math.random(),layer:0});
}
function updateSurfSheets(dt){
  if(dt<=0) return;
  for(const list of [surfSheets,coastFoam]) for(let i=list.length-1;i>=0;i--){
    list[i].age+=dt;
    if(list[i].age>=list[i].life) list.splice(i,1);
  }
}
function clearCliffSurf(){
  cliffEvents.length=0; coastFoam.length=0;
  for(let i=surfSheets.length-1;i>=0;i--) if(surfSheets[i].kind===0||surfSheets[i].kind===4) surfSheets.splice(i,1);
}
function clearSurf(){ surfSheets.length=0; coastFoam.length=0; windStreaks.length=0; windStreakAcc=0; }
/* Effects have independent bounded lifetimes and freeze with the simulation. */
function updateWindStreaks(dt){
  if(dt<=0) return;
  for(let i=windStreaks.length-1;i>=0;i--){
    windStreaks[i].age+=dt;
    if(windStreaks[i].age>=windStreaks[i].life) windStreaks.splice(i,1);
  }
  if(sea<0.62||envS.wind<12){ windStreakAcc=0; return; }
  windStreakAcc+=dt*(sea-0.6)*30*splashAmt;
  const count=Math.min(8,Math.floor(windStreakAcc)); windStreakAcc-=Math.floor(windStreakAcc);
  const nx=Math.sin(windAng),nz=Math.cos(windAng);
  for(let i=0;i<count;i++){
    const focus=typeof explore!=='undefined'&&explore.active?explore.pos:cam.target;
    const x=focus[0]+(Math.random()-0.5)*30,z=focus[2]+(Math.random()-0.5)*30;
    const h=surfH(x,z,simT);
    if((islands.active&&islandGround(x,z)>h)||h<-waveA0*0.4) continue;
    putSurf(windStreaks,MAX_WIND_STREAKS,{x,y:h,z,width:1.6+Math.random()*3.0,nx,nz,power:sea,kind:0,
      age:0,life:0.8+Math.random()*0.8,seed:Math.random(),layer:0});
  }
}
function packSurf(list,mesh){
  let o=0;
  for(const s of list){
    mesh.data[o++]=s.x; mesh.data[o++]=s.y; mesh.data[o++]=s.z; mesh.data[o++]=s.width;
    mesh.data[o++]=s.nx; mesh.data[o++]=s.nz; mesh.data[o++]=s.power; mesh.data[o++]=s.kind;
    mesh.data[o++]=s.age; mesh.data[o++]=s.life; mesh.data[o++]=s.seed; mesh.data[o++]=s.layer;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.instances); gl.bufferSubData(gl.ARRAY_BUFFER,0,mesh.data,0,o);
}
function drawSurfFoam(){
  if(!coastFoam.length) return;
  packSurf(coastFoam,foamMesh);
  gl.useProgram(pCoastFoam); setSky(pCoastFoam);
  if(typeof setQuakeUniform==='function') setQuakeUniform(pCoastFoam);
  gl.uniformMatrix4fv(L(pCoastFoam,'uVP'),false,VP); gl.uniform3fv(L(pCoastFoam,'uCam'),eye);
  gl.uniform4fv(L(pCoastFoam,'uW'),uWArr); gl.uniform1fv(L(pCoastFoam,'uQ'),uQArr);
  gl.uniform1fv(L(pCoastFoam,'uPhase'),uPhaseArr);
  gl.uniform1f(L(pCoastFoam,'uIslands'),islands.active?1:0);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,texIslandMap);
  gl.uniform1i(L(pCoastFoam,'uIslandMap'),5); gl.activeTexture(gl.TEXTURE0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.bindVertexArray(foamMesh.vao); gl.drawElementsInstanced(gl.TRIANGLES,foamMesh.count,gl.UNSIGNED_SHORT,0,coastFoam.length);
  gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
}
function drawSurfSheets(){
  if(!surfSheets.length) return;
  packSurf(surfSheets,sheetMesh);
  gl.useProgram(pSurf); setSky(pSurf);
  gl.uniformMatrix4fv(L(pSurf,'uVP'),false,VP); gl.uniform3fv(L(pSurf,'uCam'),eye);
  gl.uniform1f(L(pSurf,'uGravity'),grav);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.bindVertexArray(sheetMesh.vao); gl.drawElementsInstanced(gl.TRIANGLES,sheetMesh.count,gl.UNSIGNED_SHORT,0,surfSheets.length);
  gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
}

function drawWindSpray(){
  if(!windStreaks.length) return;
  packSurf(windStreaks,windMesh);
  gl.useProgram(pWindSpray); setSky(pWindSpray);
  if(typeof setQuakeUniform==='function') setQuakeUniform(pWindSpray);
  gl.uniformMatrix4fv(L(pWindSpray,'uVP'),false,VP); gl.uniform3fv(L(pWindSpray,'uCam'),eye);
  gl.uniform4fv(L(pWindSpray,'uW'),uWArr); gl.uniform1fv(L(pWindSpray,'uQ'),uQArr); gl.uniform1fv(L(pWindSpray,'uPhase'),uPhaseArr);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.bindVertexArray(windMesh.vao); gl.drawElementsInstanced(gl.TRIANGLES,windMesh.count,gl.UNSIGNED_SHORT,0,windStreaks.length);
  gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
}
