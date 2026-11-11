'use strict';
/* ============================================================
   Bounded sea and island quakes

   A seaquake is a travelling, fading surface wave shared by the CPU and GPU.
   Island quakes use temporary ground fissures, irregular dust and rock chips,
   a few bounded impulses, and a gentle optional camera response. They never
   modify the saved heightfield or masquerade as destructive simulation.
   ============================================================ */
const quake={sea:null,land:null,strength:1,motion:1,automatic:false,interval:90,next:90,particles:[],crackCount:0};
const QUAKE_SEA_DURATION=12, QUAKE_LAND_DURATION=22, MAX_QUAKE_PARTICLES=96, MAX_CRACK_VERTS=1200;
const QUAKE_SEA_SPEED=5;
function seaQuakeParameters(t){
  const e=quake.sea;
  if(!e) return [0,0,0,0];
  const age=t-e.start;
  if(age<0||age>=QUAKE_SEA_DURATION) return [0,0,0,0];
  const envelope=sstep(0,0.8,age)*(1-sstep(7,QUAKE_SEA_DURATION,age));
  return [e.x,e.z,age*QUAKE_SEA_SPEED,0.55*e.strength*envelope];
}
function seaQuakeHeight(x,z,t){
  if(!quake.sea) return 0;
  const p=seaQuakeParameters(t),d=Math.hypot(x-p[0],z-p[1])-p[2];
  return p[3]*Math.exp(-d*d*0.12)*Math.sin(d*1.7);
}
function seaQuakeVelocity(x,z,t){return (seaQuakeHeight(x,z,t+0.02)-seaQuakeHeight(x,z,t-0.02))/0.04;}
function setQuakeUniform(p){
  const v=seaQuakeParameters(simT);
  gl.uniform4f(L(p,'uSeaQuake'),v[0],v[1],v[2],v[3]);
}
function triggerSeaQuake(quiet=false){
  let x=ship.enabled?ship.x:0,z=ship.enabled?ship.z:0;
  if(!ship.enabled&&islands.active&&islandGround(x,z)>-2.3){
    let found=false;
    for(let r=6;r<=60&&!found;r+=6) for(let i=0;i<16;i++){
      const a=i*Math.PI/8,px=Math.sin(a)*r,pz=Math.cos(a)*r;
      if(islandGround(px,pz)<-2.3){x=px;z=pz;found=true;break;}
    }
  }
  quake.sea={x,z,start:simT,strength:clamp(quake.strength,0.3,1.5)};
  if(typeof audioQuake==='function') audioQuake(false,quake.sea.strength,x,z);
  if(!quiet&&typeof toast==='function') toast('Seaquake · a pressure wave crosses the ocean');
  return true;
}

const CRACK_VS=HDR+`
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
void main(){gl_Position=uVP*vec4(aPos,1.0);}`;
const CRACK_FS=HDR+`
out vec4 o; uniform float uFade;
void main(){float a=0.68*uFade; o=vec4(vec3(0.035,0.026,0.022)*a,a);}`;
const DUST_VS=HDR+`
layout(location=0) in vec4 aPosSize;
layout(location=1) in vec4 aLifeKind;
uniform mat4 uVP; uniform vec3 uCamR,uCamU;
out vec2 vUV; out float vAge,vKind,vSeed; out vec3 vWorld;
void main(){
  vec2 q=vec2((gl_VertexID==1||gl_VertexID==3)?1.0:-1.0,gl_VertexID>=2?1.0:-1.0);
  float size=aPosSize.w*(aLifeKind.y<0.5?mix(0.65,1.5,aLifeKind.x):1.0);
  vec3 p=aPosSize.xyz+(uCamR*q.x+uCamU*q.y)*size;
  vUV=q;vAge=aLifeKind.x;vKind=aLifeKind.y;vSeed=aLifeKind.z;vWorld=p;
  gl_Position=uVP*vec4(p,1.0);
}`;
const DUST_FS=HDR+COMMON+`
in vec2 vUV; in float vAge,vKind,vSeed; in vec3 vWorld; out vec4 o;
uniform vec3 uCam,uDustColor;
void main(){
  vec2 p=vUV;
  float a; vec3 col;
  if(vKind<0.5){
    /* Frayed, turbulent dust wisps instead of opaque spherical particles. */
    float n=texture(uDetail,p*1.4+vec2(vSeed*13.0,vAge*0.6)).a;
    float fine=texture(uDetail,p*3.8+vec2(vSeed*5.0,-vAge)).a;
    float edge=1.0-smoothstep(0.25,1.05,length(p*vec2(0.8,1.15))+(n-0.5)*0.48);
    a=edge*smoothstep(0.25,0.70,n*0.62+fine*0.38)*0.60;
    a*=smoothstep(0.0,0.12,vAge)*(1.0-smoothstep(0.45,1.0,vAge));
    col=uDustColor*(0.45+uAmbLum*0.75)+uSunCol*0.035;
  }else{
    /* Angular, very small rock chips. */
    float facet=max(abs(p.x*0.8+p.y*0.22),abs(p.y*1.2-p.x*0.28));
    a=(1.0-smoothstep(0.68,0.80,facet))*(1.0-smoothstep(0.65,1.0,vAge));
    col=vec3(0.25,0.22,0.19)*(0.35+uAmbLum)+uSunCol*0.025;
  }
  if(a<0.005) discard;
  col=mix(col,uFogCol,1.0-exp(-length(uCam-vWorld)*uFogD));
  o=vec4(tonemap(col)*a,a);
}`;
const pCrack=program(CRACK_VS,CRACK_FS,'island fissures'),pQuakeDust=program(DUST_VS,DUST_FS,'quake dust');
const crackVAO=gl.createVertexArray(),crackBuffer=gl.createBuffer();
gl.bindVertexArray(crackVAO); gl.bindBuffer(gl.ARRAY_BUFFER,crackBuffer);
gl.bufferData(gl.ARRAY_BUFFER,MAX_CRACK_VERTS*3*4,gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0); gl.bindVertexArray(null);
const quakeVAO=gl.createVertexArray(),quakeBuffer=gl.createBuffer(),quakeData=new Float32Array(MAX_QUAKE_PARTICLES*8);
gl.bindVertexArray(quakeVAO); gl.bindBuffer(gl.ARRAY_BUFFER,quakeBuffer);
gl.bufferData(gl.ARRAY_BUFFER,quakeData.byteLength,gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,4,gl.FLOAT,false,32,0); gl.vertexAttribDivisor(0,1);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,4,gl.FLOAT,false,32,16); gl.vertexAttribDivisor(1,1); gl.bindVertexArray(null);

function buildIslandFissures(e){
  const vertices=[];
  function segment(x0,z0,x1,z1,width){
    const y0=islandGround(x0,z0),y1=islandGround(x1,z1),d=Math.hypot(x1-x0,z1-z0);
    if(d<0.01||y0<0.4||y1<0.4||Math.abs(y1-y0)>1.3||vertices.length/3+6>MAX_CRACK_VERTS) return;
    const nx=-(z1-z0)/d*width,nz=(x1-x0)/d*width;
    const corners=[[x0+nx,z0+nz],[x0-nx,z0-nz],[x1+nx,z1+nz],[x1-nx,z1-nz]];
    const h=corners.map(q=>islandGround(q[0],q[1])+0.045);
    for(const i of [0,1,2,2,1,3]) vertices.push(corners[i][0],h[i],corners[i][1]);
  }
  let x=e.x,z=e.z,heading=e.angle;
  for(let i=0;i<26;i++){
    const prevX=x,prevZ=z;
    heading+=(Math.random()-0.5)*0.52;
    const len=0.42+Math.random()*0.38; x+=Math.cos(heading)*len; z+=Math.sin(heading)*len;
    segment(prevX,prevZ,x,z,0.035+Math.random()*0.035);
    if(i%5===2){
      let bx=x,bz=z,ba=heading+(Math.random()<0.5?-1:1)*(0.55+Math.random()*0.55);
      for(let j=0;j<5;j++){
        const px=bx,pz=bz;ba+=(Math.random()-0.5)*0.35;bx+=Math.cos(ba)*0.42;bz+=Math.sin(ba)*0.42;
        segment(px,pz,bx,bz,0.014+0.012*Math.random());
      }
    }
  }
  quake.crackCount=vertices.length/3;
  gl.bindBuffer(gl.ARRAY_BUFFER,crackBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(vertices));
}
function triggerIslandQuake(quiet=false){
  if(!islands.active||!islands.land.length){
    if(!quiet&&typeof toast==='function') toast('Create islands first to trigger an island quake');
    return false;
  }
  const ref=typeof explore!=='undefined'&&explore.active?explore.pos:cam.target;
  let I=islands.land[0],best=Infinity;
  for(const candidate of islands.land){
    const d=Math.hypot(candidate.x-ref[0],candidate.z-ref[2]);
    if(d<best){best=d;I=candidate;}
  }
  /* Put the rupture on the camera-facing slope, with a varied offset, so
     dust is not consistently hidden behind the island's central peak. */
  const view=typeof eye!=='undefined'?eye:ref,dx=view[0]-I.x,dz=view[2]-I.z,d=Math.hypot(dx,dz)||1;
  const x=I.x+dx/d*I.rx*0.24+(Math.random()-0.5)*I.rx*0.14;
  const z=I.z+dz/d*I.rz*0.24+(Math.random()-0.5)*I.rz*0.14;
  const e=quake.land={x,z,start:simT,strength:clamp(quake.strength,0.3,1.5),angle:Math.random()*Math.PI*2,
    biome:I.biome||'temperate',seed:islands.seed,emitted:0,pulses:0};
  quake.particles.length=0; buildIslandFissures(e);
  if(typeof audioQuake==='function') audioQuake(true,e.strength,x,z);
  if(!quiet&&typeof toast==='function') toast('Island quake · dust and fractures on the coast');
  return true;
}
function clearIslandQuake(){quake.land=null;quake.particles.length=0;quake.crackCount=0;}
function quakeParticle(x,y,z,kind,power){
  if(quake.particles.length>=MAX_QUAKE_PARTICLES) return;
  const a=Math.random()*Math.PI*2,s=(kind?1.2:0.35)+Math.random()*(kind?2.0:0.65);
  quake.particles.push({x,y,z,vx:Math.cos(a)*s,vy:kind?1.8+Math.random()*2.6:0.45+Math.random()*0.8,
    vz:Math.sin(a)*s,size:kind?0.035+Math.random()*0.07:0.65+Math.random()*0.55,
    life:kind?1.0+Math.random()*0.8:2.4+Math.random()*1.8,age:0,kind,seed:Math.random(),power});
}
function quakeDustBurst(e){
  const along=(Math.random()-0.2)*7,side=(Math.random()-0.5)*2.5;
  const x=e.x+Math.cos(e.angle)*along-Math.sin(e.angle)*side,z=e.z+Math.sin(e.angle)*along+Math.cos(e.angle)*side;
  const y=islandGround(x,z);
  if(y<0.4) return;
  for(let i=0;i<5;i++) quakeParticle(x+(Math.random()-0.5),y+0.1+Math.random()*0.4,z+(Math.random()-0.5),0,e.strength);
  for(let i=0;i<4;i++) quakeParticle(x,y+0.15,z,1,e.strength);
}
function quakeBallImpulse(e){
  for(const b of balls){
    const dx=b.x-e.x,dz=b.z-e.z,d=Math.hypot(dx,dz),ground=islandGround(b.x,b.z);
    if(d>18||ground<0||b.y-b.r>ground+0.6) continue;
    const f=e.strength*(1-d/18);
    b.vx+=clamp((Math.random()-0.5)*1.5*f,-0.8,0.8);
    b.vz+=clamp((Math.random()-0.5)*1.5*f,-0.8,0.8);
    b.vy+=0.3*f;
  }
}
function updateQuakes(dt,sdt){
  if(sdt<=0) return;
  if(quake.sea&&simT-quake.sea.start>=QUAKE_SEA_DURATION) quake.sea=null;
  const e=quake.land;
  if(e){
    if(!islands.active||islands.seed!==e.seed) clearIslandQuake();
    else {
      const age=simT-e.start;
      while(e.emitted<12&&age>=e.emitted*0.36){quakeDustBurst(e);e.emitted++;}
      while(e.pulses<3&&age>=0.5+e.pulses*0.8){quakeBallImpulse(e);e.pulses++;}
      if(age>=QUAKE_LAND_DURATION) clearIslandQuake();
    }
  }
  for(let i=quake.particles.length-1;i>=0;i--){
    const p=quake.particles[i]; p.age+=sdt;
    if(p.age>=p.life){quake.particles.splice(i,1);continue;}
    if(p.kind){p.vy-=grav*sdt;}
    else {p.vx+=(windX*0.03-p.vx)*sdt*0.7;p.vz+=(windZ*0.03-p.vz)*sdt*0.7;p.vy*=Math.exp(-sdt*0.25);}
    p.x+=p.vx*sdt;p.y+=p.vy*sdt;p.z+=p.vz*sdt;
    if(p.kind&&p.y<islandGround(p.x,p.z)+0.03) quake.particles.splice(i,1);
  }
  if(quake.automatic){
    quake.next-=sdt;
    if(quake.next<=0){
      if(islands.active&&Math.random()<0.5) triggerIslandQuake(true);else triggerSeaQuake(true);
      quake.next=quake.interval*(0.75+Math.random()*0.5);
    }
  }
}
Hooks.on('frame',updateQuakes);
function quakeCameraOffset(x,z){
  if(quake.motion<=0) return [0,0,0];
  let amount=0;
  for(const e of [quake.sea,quake.land]){
    if(!e) continue;
    const age=simT-e.start,d=Math.hypot(x-e.x,z-e.z);
    if(age<0||age>6) continue;
    amount=Math.max(amount,e.strength*(1-sstep(3.5,6,age))/(1+d*0.025));
  }
  const a=clamp(amount*quake.motion,0,1.5)*0.045;
  return [a*Math.sin(simT*17.3),a*0.55*Math.sin(simT*22.1+1.4),a*Math.sin(simT*13.7+0.8)];
}
function drawQuakeEffects(){
  if(quake.land&&quake.crackCount&&islands.active){
    const age=simT-quake.land.start,fade=1-sstep(14,QUAKE_LAND_DURATION,age);
    gl.useProgram(pCrack); gl.uniformMatrix4fv(L(pCrack,'uVP'),false,VP);gl.uniform1f(L(pCrack,'uFade'),fade);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-1,-1);
    gl.bindVertexArray(crackVAO);gl.drawArrays(gl.TRIANGLES,0,quake.crackCount);gl.bindVertexArray(null);
    gl.disable(gl.POLYGON_OFFSET_FILL);gl.depthMask(true);gl.disable(gl.BLEND);
  }
  if(!quake.particles.length) return;
  let k=0;
  for(const p of quake.particles){
    quakeData[k++]=p.x;quakeData[k++]=p.y;quakeData[k++]=p.z;quakeData[k++]=p.size;
    quakeData[k++]=clamp(p.age/p.life,0,1);quakeData[k++]=p.kind;quakeData[k++]=p.seed;quakeData[k++]=p.power;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,quakeBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,quakeData,0,k);
  gl.useProgram(pQuakeDust);setSky(pQuakeDust);
  gl.uniformMatrix4fv(L(pQuakeDust,'uVP'),false,VP);gl.uniform3fv(L(pQuakeDust,'uCam'),eye);
  const biome=quake.land&&quake.land.biome;
  const dust=biome==='volcanic'?[0.29,0.28,0.27]:biome==='desert'?[0.68,0.52,0.35]:biome==='alpine'?[0.62,0.62,0.60]:[0.49,0.43,0.35];
  gl.uniform3fv(L(pQuakeDust,'uDustColor'),dust);
  gl.uniform3fv(L(pQuakeDust,'uCamR'),camR);gl.uniform3fv(L(pQuakeDust,'uCamU'),camU);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  gl.bindVertexArray(quakeVAO);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,quake.particles.length);gl.bindVertexArray(null);
  gl.depthMask(true);gl.disable(gl.BLEND);
}
