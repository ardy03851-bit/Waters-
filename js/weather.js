'use strict';
/* ============================================================
   Precipitation: rain & snow
   Drawn as GPU-instanced streaks / flakes in a box that travels with the
   camera.  Rain also pits the nearby water with rings and tiny splashes.
   ============================================================ */
const PRECIP_MAX=9000;
const precip={off:[0,0,0],vel:[0,-8.5,0],box:[18,10,18],t:0,acc:0};
function updatePrecip(sdt){
  const p=envS.precip, snow=envS.snow;
  if(snow){ const hs=Math.hypot(windX,windZ), k=hs>4?4/hs:1; precip.vel=[windX*k*0.8,-1.15,windZ*k*0.8]; precip.box=[14,8,14]; }
  else { precip.vel=[windX*0.85,-8.5,windZ*0.85]; precip.box=[18,10,18]; }
  if(p<0.004||sdt<=0) return;
  precip.t+=sdt;
  for(let i=0;i<3;i++){ const b=precip.box[i]; precip.off[i]=(((precip.off[i]+precip.vel[i]*sdt)%b)+b)%b; }
  if(snow) return;
  /* raindrops hitting the sea inside the interactive area */
  precip.acc+=p*sdt*1500;
  let n=Math.min(Math.floor(precip.acc),80); precip.acc-=Math.floor(precip.acc);
  for(let i=0;i<n;i++){
    const x=(Math.random()*2-1)*(RR-0.6), z=(Math.random()*2-1)*(RR-0.6);
    addRipple(x,z,0.16,-0.011);
    if(Math.random()<0.10*(1+0.25*(typeof vfxLevel==='number'?vfxLevel:0))&&pCount<MAXP*0.8){
      const a=Math.random()*6.2832, o=0.2+Math.random()*0.5;
      emit(x,surfH(x,z,simT)+0.02,z,Math.cos(a)*o,0.9+Math.random()*0.9,Math.sin(a)*o,0.006+0.006*Math.random(),0.28,0.2,1.2,1,1);
    }
  }
}
function drawPrecip(Hh){
  const p=envS.precip; if(p<0.004) return;
  const snow=envS.snow, dens=(hqMode?1.4:1)*(1+0.10*(typeof vfxLevel==='number'?vfxLevel:0));
  const n=Math.min(PRECIP_MAX*1.5,Math.floor(PRECIP_MAX*Math.pow(Math.min(1,p),1.15)*(snow?0.65:1)*dens)); if(n<1) return;
  gl.useProgram(pPrecip); setSky(pPrecip);
  gl.uniformMatrix4fv(L(pPrecip,'uVP'),false,VP);
  gl.uniform3fv(L(pPrecip,'uCam'),eye); gl.uniform3fv(L(pPrecip,'uCamR'),camR); gl.uniform3fv(L(pPrecip,'uCamU'),camU);
  gl.uniform3fv(L(pPrecip,'uBox'),precip.box); gl.uniform3fv(L(pPrecip,'uOff'),precip.off); gl.uniform3fv(L(pPrecip,'uVel'),precip.vel);
  gl.uniform1f(L(pPrecip,'uSnow'),snow?1:0); gl.uniform1f(L(pPrecip,'uPxW'),2*tanH/Hh);
  gl.uniform1f(L(pPrecip,'uLen'),Math.hypot(precip.vel[0],precip.vel[1],precip.vel[2])*shutter*1.5);
  gl.uniform1f(L(pPrecip,'uT'),precip.t%6283.185);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.bindVertexArray(emptyVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,n); gl.bindVertexArray(null);
  gl.depthMask(true); gl.disable(gl.BLEND);
}
