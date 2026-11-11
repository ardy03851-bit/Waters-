'use strict';
/* ============================================================
   Rendering
   ============================================================ */
const maxPR=Math.min(window.devicePixelRatio||1,2);
let pr=Math.min(maxPR,1.5), prCeil=maxPR, curW=0, curH=0;
function resize(){
  const w=Math.max(2,Math.floor(innerWidth*pr)), h=Math.max(2,Math.floor(innerHeight*pr));
  if(w!==curW||h!==curH){ curW=w;curH=h;canvas.width=w;canvas.height=h; makeTargets(w,h); }
}
addEventListener('resize',resize); addEventListener('orientationchange',()=>setTimeout(resize,200));

function drawBalls(mode,mirror){
  if(balls.length===0) return;
  gl.useProgram(pBall); setSky(pBall);
  gl.uniformMatrix4fv(L(pBall,'uVP'),false,VP);
  gl.uniform1f(L(pBall,'uMode'),mode); gl.uniform1f(L(pBall,'uMirror'),mirror);
  gl.bindVertexArray(sphereVAO);
  for(const b of balls){
    const q=b.q,x=q[0],y=q[1],z=q[2],w=q[3],m=b.rot;
    m[0]=1-2*(y*y+z*z);m[1]=2*(x*y+w*z);m[2]=2*(x*z-w*y);
    m[3]=2*(x*y-w*z);m[4]=1-2*(x*x+z*z);m[5]=2*(y*z+w*x);
    m[6]=2*(x*z+w*y);m[7]=2*(y*z-w*x);m[8]=1-2*(x*x+y*y);
    gl.uniform3f(L(pBall,'uPos'),b.x,b.y,b.z); gl.uniform1f(L(pBall,'uR'),b.r);
    gl.uniformMatrix3fv(L(pBall,'uRot'),false,m);
    gl.uniform1f(L(pBall,'uType'),b.type); gl.uniform1f(L(pBall,'uPlane'),b.wh);
    gl.uniform3f(L(pBall,'uCamEff'),eye[0],mirror?2*b.wh-eye[1]:eye[1],eye[2]);
    gl.drawElements(gl.TRIANGLES,sphereIdxCount,gl.UNSIGNED_SHORT,0);
  }
  gl.bindVertexArray(null);
}

function render(){
  const W=canvas.width,Hh=canvas.height;
  computeCamera();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texDetail);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND); gl.depthMask(true);

  /* reflection pass (mirrored balls) */
  gl.bindFramebuffer(gl.FRAMEBUFFER,refl.fb); gl.viewport(0,0,rW,rH);
  gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  drawBalls(1,1);
  /* scene pass (colour+depth for refraction) */
  gl.bindFramebuffer(gl.FRAMEBUFFER,scene.fb); gl.viewport(0,0,W,Hh);
  gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  drawBalls(1,0);

  /* main pass */
  gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,W,Hh);
  gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(pSky); setSky(pSky);
  gl.uniform3fv(L(pSky,'uCamF'),camF); gl.uniform3fv(L(pSky,'uCamR'),camR); gl.uniform3fv(L(pSky,'uCamU'),camU);
  gl.uniform2f(L(pSky,'uTanAsp'),tanH,aspect);
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.DEPTH_TEST);

  gl.useProgram(pWater); setSky(pWater);
  gl.uniformMatrix4fv(L(pWater,'uVP'),false,VP);
  gl.uniform3fv(L(pWater,'uCam'),eye); gl.uniform3fv(L(pWater,'uCamR'),camR); gl.uniform3fv(L(pWater,'uCamF'),camF);
  gl.uniform4fv(L(pWater,'uW'),uWArr); gl.uniform1fv(L(pWater,'uQ'),uQArr);
  gl.uniform1f(L(pWater,'uRipR'),RR); gl.uniform1f(L(pWater,'uRipN'),RN); gl.uniform1f(L(pWater,'uA0'),waveA0);
  gl.uniform2f(L(pWater,'uRes'),W,Hh); gl.uniform2f(L(pWater,'uNF'),0.1,3000);
  gl.uniform1i(L(pWater,'uRip'),1); gl.uniform1i(L(pWater,'uScene'),2); gl.uniform1i(L(pWater,'uSceneD'),3); gl.uniform1i(L(pWater,'uRefl'),4);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,texRip);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,scene.color);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D,scene.depth);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,refl.color);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(waterVAO); gl.drawElements(gl.TRIANGLES,waterIdxCount,gl.UNSIGNED_INT,0);
  gl.bindVertexArray(null);

  /* balls above the surface */
  drawBalls(0,0);

  /* splash particles (premultiplied alpha so sun glints can add on top) */
  if(pCount>0){
    const nf=packParticles();
    gl.bindBuffer(gl.ARRAY_BUFFER,partBuf); gl.bufferSubData(gl.ARRAY_BUFFER,0,partData,0,nf);
    gl.useProgram(pPart); setSky(pPart);
    gl.uniformMatrix4fv(L(pPart,'uVP'),false,VP);
    gl.uniform3fv(L(pPart,'uCam'),eye); gl.uniform3fv(L(pPart,'uCamR'),camR); gl.uniform3fv(L(pPart,'uCamU'),camU);
    gl.uniform1f(L(pPart,'uShutter'),shutter);
    gl.uniform1f(L(pPart,'uPxW'),2*tanH/Hh);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.bindVertexArray(partVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,pCount); gl.bindVertexArray(null);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
}

/* ============================================================
   Main loop with adaptive resolution
   ============================================================ */
let lastT=performance.now(), acc=0, ema=16.7, frameN=0, lastStat=0, cool=0, ceilTimer=0, fpsShown=60;
function frame(now){
  requestAnimationFrame(frame);
  const rdtMs=now-lastT; lastT=now; if(!(rdtMs>0)) return;
  const dt=Math.min(rdtMs/1000,0.05);
  ema=ema*0.94+Math.min(rdtMs,100)*0.06; frameN++; cool--; ceilTimer+=dt;
  if(cool<=0&&frameN>40){
    if(ema>20.5&&pr>0.65){ prCeil=Math.max(0.7,pr-0.05); pr=Math.max(0.65,pr-0.12); cool=60; resize(); }
    else if(ema<17.6&&pr<prCeil-0.001){ pr=Math.min(prCeil,pr+0.06); cool=120; resize(); }
  }
  if(ceilTimer>25){ ceilTimer=0; prCeil=Math.min(maxPR,prCeil+0.1); }
  resize();

  sea+=(seaT-sea)*Math.min(1,dt*1.6);
  updateWaves(sea); updateSky();
  const ws=2.5+11*sea; windX=Math.sin(WIND_ANG)*ws; windZ=Math.cos(WIND_ANG)*ws;

  cam.yaw+=(cam.tYaw-cam.yaw)*Math.min(1,dt*10);
  cam.pitch+=(cam.tPitch-cam.pitch)*Math.min(1,dt*10);
  cam.dist+=(cam.tDist-cam.dist)*Math.min(1,dt*8);

  acc+=dt*timeScale; let steps=0;
  while(acc>=H&&steps<12){ physicsStep(); acc-=H; steps++; }
  if(steps>=12) acc=0;
  particlesStep(dt*timeScale);
  uploadRipple();
  render();

  if(now-lastStat>500){
    lastStat=now; fpsShown=Math.round(1000/ema);
    updateStats(Math.min(fpsShown,120),balls.length,pr,Math.round(sea*100));
    if(frameN>3) uiReady();
  }
}
resize();
requestAnimationFrame(t=>{ lastT=t; frame(t); });

/* a couple of balls to start with */
spawnBall(-2.2,3.6,1.0,0,0,0,0);
spawnBall(0.6,5.2,-0.4,1,0,0,0);
spawnBall(2.6,6.4,0.8,5,0,0,0);
