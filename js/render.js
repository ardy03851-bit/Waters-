'use strict';
/* ============================================================
   Rendering
   ============================================================ */
const safeGraphics=window.AquaBoot.safeMode;
const maxPR=Math.min(window.devicePixelRatio||1,safeGraphics?0.75:2);
let pr=Math.min(maxPR,1.5), prCeil=maxPR, curW=0, curH=0, actualPR=pr;
/* 'auto' adapts the resolution to hold 60 fps; the other modes pin it */
let quality='auto', paused=false;
/* realism effects (set from the UI): camera + object motion blur, lens effects */
let motionBlurOn=true, blurStrength=1, lensFxOn=true;
/* enhanced graphics mode: full-res reflections, denser VFX, extra shader detail */
let hqMode=false;
/* camera-grade post effects: physically motivated highlight bloom, FXAA and a
   whisper of film grain. All three degrade gracefully to a pass-through. */
let bloomOn=!safeGraphics, bloomAmt=0.62, grainAmt=0.016, fxaaOn=true;
const BLOOM_THRESHOLD=0.68;
/* previous frame's view-projection, for the motion-blur reprojection */
const prevVPm=new Float32Array(16);
let havePrev=false, frameInterval=1/60, rendererStarted=false;
const QUALITY_PR={low:0.6,medium:0.85,high:1.0,ultra:Math.max(1,maxPR)};
/* Several full-size colour/depth/motion buffers are needed. Keep their total
   size reasonable on high-DPI devices, and never exceed hardware dimensions. */
const coarsePointer=matchMedia('(pointer: coarse)').matches||matchMedia('(any-pointer: coarse)').matches;
const targetPixels=safeGraphics?650000:(coarsePointer?1800000:4200000);
const texLimit=gl.getParameter(gl.MAX_TEXTURE_SIZE)||2048;
const rbLimit=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||2048;
const viewportLimit=gl.getParameter(gl.MAX_VIEWPORT_DIMS)||[2048,2048];
const targetMaxW=Math.min(texLimit,rbLimit,viewportLimit[0]);
const targetMaxH=Math.min(texLimit,rbLimit,viewportLimit[1]);
let allocationPixelLimit=Infinity;
function setQuality(q){
  quality=QUALITY_PR[q]?q:'auto';
  /* Bloom is subtle by design; on the low preset it also gets quieter so the
     glow never turns into a haze over a small, low-resolution frame. */
  bloomAmt=quality==='low'?0.42:(quality==='ultra'?0.70:0.62);
  if(quality!=='auto') pr=Math.min(QUALITY_PR[quality],safeGraphics?maxPR:Math.max(1,maxPR));
  else { prCeil=maxPR; pr=Math.min(maxPR,1.25); }
  resize();
}
function resize(force=false){
  if(!rendererStarted||(window.AquaBoot.state!=='loading'&&window.AquaBoot.state!=='running')) return;
  if(gl.isContextLost()){ window.AquaBoot.contextLost(); return; }
  const vw=Math.max(1,innerWidth), vh=Math.max(1,innerHeight);
  const scale=Math.min(pr,targetMaxW/vw,targetMaxH/vh,Math.sqrt(Math.min(targetPixels,allocationPixelLimit)/(vw*vh)));
  let w=Math.max(2,Math.floor(vw*scale)), h=Math.max(2,Math.floor(vh*scale));
  if(!force&&w===curW&&h===curH) return;
  /* Release existing FBOs before changing the drawing buffer to keep peak
     memory down. A failed allocation is retried, not rendered into. */
  disposeTargets(); curW=curH=0; havePrev=false;
  let reduced=false;
  for(let attempt=0;attempt<4;attempt++){
    try{
      if(canvas.width!==w) canvas.width=w;
      if(canvas.height!==h) canvas.height=h;
      if(gl.isContextLost()){ window.AquaBoot.contextLost(); return; }
      const dw=gl.drawingBufferWidth, dh=gl.drawingBufferHeight;
      if(dw<w||dh<h){
        const ratio=Math.min(dw/w,dh/h);
        if(!(ratio>0)){
          const error=new Error('The browser could not allocate the graphics drawing buffer.');
          error.code='FRAMEBUFFER_INCOMPLETE'; throw error;
        }
        w=Math.max(2,Math.floor(w*ratio)); h=Math.max(2,Math.floor(h*ratio)); reduced=true;
        if(attempt<3) continue;
        throw new Error('The browser could not allocate the requested graphics drawing buffer.');
      }
      makeTargets(w,h);
      if(gl.isContextLost()){ window.AquaBoot.contextLost(); return; }
      curW=w; curH=h; actualPR=Math.min(w/vw,h/vh);
      if(reduced){
        allocationPixelLimit=Math.min(allocationPixelLimit,w*h);
        console.warn('Aqua: graphics allocation was reduced to '+w+' × '+h+'.');
      }
      return;
    }catch(error){
      if(gl.isContextLost()){ window.AquaBoot.contextLost(); return; }
      if(error.code!=='FRAMEBUFFER_INCOMPLETE'||attempt===3||(w<=2&&h<=2)) throw error;
      w=Math.max(2,Math.floor(w*0.7)); h=Math.max(2,Math.floor(h*0.7)); reduced=true;
    }
  }
}
addEventListener('resize',()=>resize()); addEventListener('orientationchange',()=>setTimeout(()=>resize(),200));

/* Cheap sphere-vs-viewport rejection. Balls can travel far outside the view
   while the orbit camera stays put, and each one is its own draw call. A wide
   margin keeps partially visible silhouettes and their motion blur intact. */
function ballOnScreen(b,mirror){
  const y=mirror?2*b.wh-b.y:b.y, m=VP;
  const cx=m[0]*b.x+m[4]*y+m[8]*b.z+m[12];
  const cy=m[1]*b.x+m[5]*y+m[9]*b.z+m[13];
  const cw=m[3]*b.x+m[7]*y+m[11]*b.z+m[15];
  if(cw<=0.0001) return false;
  return Math.abs(cx)<cw*1.9&&Math.abs(cy)<cw*1.9;
}

function drawBalls(mode,mirror){
  if(balls.length===0) return;
  gl.useProgram(pBall); setSky(pBall);
  gl.uniformMatrix4fv(L(pBall,'uVP'),false,VP);
  gl.uniform1f(L(pBall,'uMode'),mode); gl.uniform1f(L(pBall,'uMirror'),mirror);
  /* One atlas for every ball: one binding, one sampler, no per-ball upload. */
  if(ballAtlas.ready){
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,ballAtlas.tex);
    gl.uniform1i(L(pBall,'uBallTex'),5);
    gl.uniform3f(L(pBall,'uAtlasInfo'),ballAtlas.cols,ballAtlas.rows,1);
  }else gl.uniform3f(L(pBall,'uAtlasInfo'),ballAtlas.cols,ballAtlas.rows,0);
  gl.bindVertexArray(sphereVAO);
  for(const b of balls){
    if(!ballOnScreen(b,mirror)) continue;
    const q=b.q,x=q[0],y=q[1],z=q[2],w=q[3],m=b.rot;
    m[0]=1-2*(y*y+z*z);m[1]=2*(x*y+w*z);m[2]=2*(x*z-w*y);
    m[3]=2*(x*y-w*z);m[4]=1-2*(x*x+z*z);m[5]=2*(y*z+w*x);
    m[6]=2*(x*z+w*y);m[7]=2*(y*z-w*x);m[8]=1-2*(x*x+y*y);
    gl.uniform3f(L(pBall,'uPos'),b.x,b.y,b.z); gl.uniform1f(L(pBall,'uR'),b.r);
    gl.uniformMatrix3fv(L(pBall,'uRot'),false,m);
    gl.uniform1f(L(pBall,'uType'),b.type); gl.uniform1f(L(pBall,'uPlane'),b.wh);
    gl.uniform1f(L(pBall,'uWet'),clamp(Math.max(b.wet,b.frac*2),0,1));
    gl.uniform3f(L(pBall,'uCamEff'),eye[0],mirror?2*b.wh-eye[1]:eye[1],eye[2]);
    gl.drawElements(gl.TRIANGLES,sphereIdxCount,gl.UNSIGNED_SHORT,0);
  }
  gl.bindVertexArray(null);
  gl.activeTexture(gl.TEXTURE0);
}

function render(){
  const W=canvas.width,Hh=canvas.height;
  computeCamera();
  /* The camera and simulated time do not change within a render, so all
     passes can share the same exact surface sample. */
  const submerge=cameraSubmerge();
  /* Include disturbances from frame hooks and from screenshots taken while
     paused, while avoiding unchanged CPU packing and GPU uploads. */
  uploadRipple();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texDetail);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND); gl.depthMask(true);

  /* reflection pass (mirrored islands and balls) */
  gl.bindFramebuffer(gl.FRAMEBUFFER,refl.fb); gl.viewport(0,0,rW,rH);
  gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  drawIslands(1,1); drawShip(1,1,submerge); drawBoats(1,1,eye); drawBalls(1,1);
  /* scene pass (colour+depth for underwater refraction) */
  gl.bindFramebuffer(gl.FRAMEBUFFER,scene.fb); gl.viewport(0,0,W,Hh);
  gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  drawIslands(1,0); drawShip(1,0,submerge); drawBoats(1,0,eye); drawBalls(1,0);

  /* main pass (into the post target – resolved to the canvas afterwards) */
  gl.bindFramebuffer(gl.FRAMEBUFFER,post.fb); gl.viewport(0,0,W,Hh);
  gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(pSky); setSky(pSky);
  gl.uniform3fv(L(pSky,'uCamF'),camF); gl.uniform3fv(L(pSky,'uCamR'),camR); gl.uniform3fv(L(pSky,'uCamU'),camU);
  gl.uniform2f(L(pSky,'uTanAsp'),tanH,aspect);gl.uniform1f(L(pSky,'uUnderwater'),submerge);
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.DEPTH_TEST);

  /* Opaque terrain writes depth first, so waves naturally meet the coast. */
  drawIslands(0,0); drawShip(0,0,submerge); drawBoats(0,0,eye);
  gl.useProgram(pWater); setSky(pWater); setQuakeUniform(pWater);
  gl.uniformMatrix4fv(L(pWater,'uVP'),false,VP);
  gl.uniform3fv(L(pWater,'uCam'),eye); gl.uniform3fv(L(pWater,'uCamR'),camR); gl.uniform3fv(L(pWater,'uCamF'),camF);
  gl.uniform4fv(L(pWater,'uW'),uWArr); gl.uniform1fv(L(pWater,'uQ'),uQArr); gl.uniform1fv(L(pWater,'uPhase'),uPhaseArr);
  gl.uniform1f(L(pWater,'uRipR'),RR); gl.uniform1f(L(pWater,'uRipN'),RN); gl.uniform1f(L(pWater,'uA0'),waveA0);
  gl.uniform1f(L(pWater,'uIslands'),islands.active?1:0); gl.uniform1f(L(pWater,'uSeaState'),sea);
  /* The coast settings feed the same shoreline field the terrain is built
     from, so breakers and the waterline foam stay in step with the land. */
  gl.uniform1f(L(pWater,'uShoreBreak'),islands.active?islands.options.surf:0);
  gl.uniform1f(L(pWater,'uMist'),islands.active?islands.options.mist:0);
  gl.uniform1f(L(pWater,'uUnderwater'),submerge>0.5?1:0);
  gl.uniform2f(L(pWater,'uWind'),Math.sin(windAng),Math.cos(windAng));
  gl.uniform2f(L(pWater,'uRes'),W,Hh); gl.uniform2f(L(pWater,'uNF'),0.1,3000);
  gl.uniform1i(L(pWater,'uRip'),1); gl.uniform1i(L(pWater,'uScene'),2); gl.uniform1i(L(pWater,'uSceneD'),3); gl.uniform1i(L(pWater,'uRefl'),4); gl.uniform1i(L(pWater,'uIslandMap'),5);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,texRip);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,scene.color);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D,scene.depth);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,refl.color);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,texIslandMap);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(waterVAO); gl.drawElements(gl.TRIANGLES,waterIdxCount,gl.UNSIGNED_INT,0);
  gl.bindVertexArray(null);

  /* Impact foam follows the same waves even beyond the local ripple grid. */
  drawSurfFoam();
  drawWindSpray();

  /* Island dust and fissures use their own bounded, non-spherical effects. */
  drawQuakeEffects();
  /* balls above the surface */
  drawBalls(0,0);

  /* Thin breaking sheets sit behind the fine droplets and mist. */
  drawSurfSheets();
  /* splash particles (premultiplied alpha so sun glints can add on top) */
  if(pCount>0){
    const nf=packParticles();
    gl.bindBuffer(gl.ARRAY_BUFFER,partBuf); gl.bufferSubData(gl.ARRAY_BUFFER,0,partData,0,nf);
    gl.useProgram(pPart); setSky(pPart);
    gl.uniformMatrix4fv(L(pPart,'uVP'),false,VP);
    gl.uniform3fv(L(pPart,'uCam'),eye); gl.uniform3fv(L(pPart,'uCamR'),camR); gl.uniform3fv(L(pPart,'uCamU'),camU);
    gl.uniform1f(L(pPart,'uShutter'),motionBlurOn?Math.min(shutter*blurStrength,0.035):0);
    gl.uniform1f(L(pPart,'uPxW'),2*tanH/Hh);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.bindVertexArray(partVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,pCount); gl.bindVertexArray(null);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  if(submerge<0.5) drawPrecip(Hh);
  /* Night fireflies: additive glow points over the islands, skipped by day. */
  if(typeof drawVFX==='function') drawVFX();
  postPass(submerge);
  Hooks.run('render');
}

/* Draw rigid object motion against the main depth, then reduce it to 8x8
   tiles. Both passes are skipped when blur is off or history is invalid. */
function drawMotionVectors(){
  const W=canvas.width,Hh=canvas.height;
  gl.bindFramebuffer(gl.FRAMEBUFFER,motion.fb); gl.viewport(0,0,W,Hh);
  gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
  /* These RGBA8 bytes are packed data, not colours: dithering can corrupt
     a high nibble and turn a tiny velocity into a large one. */
  gl.disable(gl.DITHER);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.disable(gl.BLEND);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1,-1);
  gl.useProgram(pMotion);
  gl.uniformMatrix4fv(L(pMotion,'uVP'),false,VP); gl.uniformMatrix4fv(L(pMotion,'uPrevVP'),false,prevVPm);
  gl.uniform2f(L(pMotion,'uRes'),W,Hh);
  gl.bindVertexArray(sphereVAO);
  for(const b of balls){
    if(!ballOnScreen(b,false)) continue;
    const prev=b.motionPrev;
    gl.uniform3f(L(pMotion,'uPos'),b.x,b.y,b.z); gl.uniform1f(L(pMotion,'uR'),b.r);
    gl.uniformMatrix3fv(L(pMotion,'uRot'),false,b.rot);
    gl.uniform3f(L(pMotion,'uPrevPos'),prev?prev.pos[0]:b.x,prev?prev.pos[1]:b.y,prev?prev.pos[2]:b.z);
    gl.uniformMatrix3fv(L(pMotion,'uPrevRot'),false,prev?prev.rot:b.rot);
    gl.drawElements(gl.TRIANGLES,sphereIdxCount,gl.UNSIGNED_SHORT,0);
  }
  gl.bindVertexArray(null);
  drawShipMotion();
  gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true);

  gl.bindFramebuffer(gl.FRAMEBUFFER,motion.tileFb); gl.viewport(0,0,motion.tileW,motion.tileH);
  gl.disable(gl.DEPTH_TEST); gl.useProgram(pMotionTile);
  gl.uniform2i(L(pMotionTile,'uSize'),W,Hh); gl.uniform1i(L(pMotionTile,'uVelocity'),0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,motion.color);
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES,0,3); gl.bindVertexArray(null);
  gl.enable(gl.DITHER);
}
function rememberMotion(){
  prevVPm.set(VP);
  for(const b of balls){
    if(!b.motionPrev) b.motionPrev={pos:new Float32Array(3),rot:new Float32Array(9)};
    b.motionPrev.pos[0]=b.x; b.motionPrev.pos[1]=b.y; b.motionPrev.pos[2]=b.z;
    b.motionPrev.rot.set(b.rot);
  }
  rememberShipMotion();
  havePrev=true;
}

/* Skip the extra passes altogether when the camera and rigid bodies are
   still (particularly useful while paused). Water and droplets keep their
   own independently animated shading and exposure. */
function hasFrameMotion(){
  if(shipHasMotion()) return true;
  for(let i=0;i<16;i++) if(Math.abs(VP[i]-prevVPm[i])>1e-6) return true;
  for(const b of balls){
    const p=b.motionPrev;
    if(!p||Math.abs(b.x-p.pos[0])+Math.abs(b.y-p.pos[1])+Math.abs(b.z-p.pos[2])>1e-5) return true;
    for(let i=0;i<9;i++) if(Math.abs(b.rot[i]-p.rot[i])>1e-5) return true;
  }
  return false;
}
/* Bright pass + separable blur into the quarter-resolution ping-pong pair.
   Runs before the post pass samples it, and is skipped entirely when off. */
function drawBloom(){
  if(!bloomOn||!bloom) return;
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.useProgram(pBloom);
  gl.uniform1i(L(pBloom,'uSrc'),0);
  gl.uniform2f(L(pBloom,'uTexel'),1/bloom.w,1/bloom.h);
  gl.uniform1f(L(pBloom,'uSpread'),1);
  gl.bindVertexArray(emptyVAO);
  /* 1: bright pass from the resolved frame into a. Moonlight sits below the
     daytime threshold, so advanced VFX lowers it after dark. */
  const threshold=(vfxLevel>0&&sky.night>0.35)?0.46:BLOOM_THRESHOLD;
  gl.bindFramebuffer(gl.FRAMEBUFFER,bloom.a.fb); gl.viewport(0,0,bloom.w,bloom.h);
  gl.uniform1f(L(pBloom,'uMode'),0); gl.uniform1f(L(pBloom,'uThreshold'),threshold);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,post.color);
  gl.drawArrays(gl.TRIANGLES,0,3);
  /* 2: horizontal blur a -> b */
  gl.bindFramebuffer(gl.FRAMEBUFFER,bloom.b.fb);
  gl.uniform1f(L(pBloom,'uMode'),1); gl.uniform2f(L(pBloom,'uDir'),1,0);
  gl.bindTexture(gl.TEXTURE_2D,bloom.a.color);
  gl.drawArrays(gl.TRIANGLES,0,3);
  /* 3: vertical blur b -> a */
  gl.bindFramebuffer(gl.FRAMEBUFFER,bloom.a.fb);
  gl.uniform2f(L(pBloom,'uDir'),0,1);
  gl.bindTexture(gl.TEXTURE_2D,bloom.b.color);
  gl.drawArrays(gl.TRIANGLES,0,3);
  /* 4-5: a second, wider pyramid step for cinematic VFX. */
  if(vfxLevel>=2){
    gl.uniform1f(L(pBloom,'uSpread'),2.2);
    gl.bindFramebuffer(gl.FRAMEBUFFER,bloom.b.fb);
    gl.uniform2f(L(pBloom,'uDir'),1,0); gl.bindTexture(gl.TEXTURE_2D,bloom.a.color);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindFramebuffer(gl.FRAMEBUFFER,bloom.a.fb);
    gl.uniform2f(L(pBloom,'uDir'),0,1); gl.bindTexture(gl.TEXTURE_2D,bloom.b.color);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  gl.bindVertexArray(null);
}

/* Depth-aware, bounded camera + object blur. Exposure is normalized by real
   frame time, rather than making a low-FPS frame smear much farther. */
function postPass(submerge=cameraSubmerge()){
  const W=canvas.width,Hh=canvas.height;
  const mb=motionBlurOn&&havePrev&&frameInterval<=0.2&&hasFrameMotion()?
    clamp(blurStrength*(1/90)/Math.max(frameInterval,1/240),0,2):0;
  const hasVelocity=mb>0.001&&(balls.length>0||(ship.enabled&&ship.status==='ready'));
  if(hasVelocity) drawMotionVectors();
  drawBloom();
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,W,Hh);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.useProgram(pPost);
  gl.uniform2f(L(pPost,'uRes'),W,Hh); gl.uniform2f(L(pPost,'uTileRes'),motion.tileW,motion.tileH);
  gl.uniform2f(L(pPost,'uNF'),0.1,3000); gl.uniform2f(L(pPost,'uTanAsp'),tanH,aspect);
  gl.uniform3fv(L(pPost,'uCam'),eye);
  gl.uniform3fv(L(pPost,'uCamF'),camF); gl.uniform3fv(L(pPost,'uCamR'),camR); gl.uniform3fv(L(pPost,'uCamU'),camU);
  gl.uniformMatrix4fv(L(pPost,'uPrevVP'),false,prevVPm);
  gl.uniform1f(L(pPost,'uMB'),mb); gl.uniform1f(L(pPost,'uHasVelocity'),hasVelocity?1:0);
  /* Advanced VFX leans a little further into the lens: a touch more
     aberration and vignette, and a fine grain even without improved mode. */
  const lensBoost=1+0.30*vfxLevel;
  gl.uniform1f(L(pPost,'uCA'),lensFxOn?0.0024*lensBoost:0);
  gl.uniform1f(L(pPost,'uVig'),lensFxOn?Math.min(0.30,0.18*lensBoost):0);
  gl.uniform1f(L(pPost,'uSubmerge'),submerge);gl.uniform1f(L(pPost,'uWaterTime'),simT);
  gl.uniform1f(L(pPost,'uBloomAmt'),bloomOn&&bloom?bloomAmt*(1+0.12*vfxLevel):0);
  gl.uniform1f(L(pPost,'uFXAA'),fxaaOn?1:0);
  gl.uniform1f(L(pPost,'uGrain'),(hqMode?grainAmt:0)+(vfxLevel>=2?0.007:0));
  gl.uniform1f(L(pPost,'uNight'),sky.night); gl.uniform1f(L(pPost,'uVFX'),vfxLevel);
  gl.uniform3fv(L(pPost,'uSun'),sky.sun); gl.uniform3fv(L(pPost,'uMoon'),sky.moon);
  gl.uniform3fv(L(pPost,'uSunCol'),sky.sunCol);
  gl.uniform1i(L(pPost,'uScene'),0); gl.uniform1i(L(pPost,'uDepth'),1);
  gl.uniform1i(L(pPost,'uVelocity'),2); gl.uniform1i(L(pPost,'uMotionTile'),3);
  gl.uniform1i(L(pPost,'uBloom'),4); gl.uniform1i(L(pPost,'uDirt'),5);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,bloom?bloom.a.color:post.color);
  const dirtTex=(typeof vfxTex!=='undefined'&&vfxTex.dirt)?vfxTex.dirt:post.color;
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,dirtTex);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,post.color);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,post.depth);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,motion.color);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D,motion.tile);
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
  rememberMotion();
}

/* save the current frame as a PNG (rendered and read back in the same task, so no preserveDrawingBuffer needed) */
function screenshot(done){
  try{
    render();
    canvas.toBlob(b=>{
      if(!b){ done&&done(false); return; }
      let a=null,u=null,ok=false;
      try{
        a=document.createElement('a');u=URL.createObjectURL(b);
        a.href=u;a.download='aqua-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.png';
        document.body.appendChild(a);a.click();ok=true;
      }catch(e){}
      finally{if(a) a.remove();if(u) setTimeout(()=>URL.revokeObjectURL(u),4000);}
      done&&done(ok);
    },'image/png');
  }catch(e){ done&&done(false); }
}

/* ============================================================
   Main loop with adaptive resolution
   ============================================================ */
let lastT=performance.now(), acc=0, ema=16.7, frameN=0, lastStat=0, cool=0, ceilTimer=0, fpsShown=60;
function frame(now){
  if(!window.AquaBoot.canRender()) return;
  try{
    if(gl.isContextLost()){ window.AquaBoot.contextLost(); return; }
    const rdtMs=now-lastT; lastT=now;
    if(!(rdtMs>0)){ requestAnimationFrame(frame); return; }
    frameInterval=rdtMs/1000;
    if(frameInterval>0.2) havePrev=false;
    const dt=Math.min(frameInterval,0.05);
    ema=ema*0.94+Math.min(rdtMs,100)*0.06; frameN++; cool--; ceilTimer+=dt;
    if(quality==='auto'){
      /* enhanced graphics keeps a much higher resolution floor before scaling down */
      const floorPR=hqMode?0.9:0.65;
      if(cool<=0&&frameN>40){
        if(ema>20.5&&pr>floorPR+0.001){ prCeil=Math.max(floorPR+0.05,pr-0.05); pr=Math.max(floorPR,pr-0.12); cool=60; }
        else if(ema<17.6&&pr<prCeil-0.001){ pr=Math.min(prCeil,pr+0.06); cool=120; }
      }
      if(ceilTimer>25){ ceilTimer=0; prCeil=Math.min(maxPR,prCeil+0.1); }
    }
    resize();
    if(!window.AquaBoot.canRender()) return;

    const sdt=paused?0:dt*timeScale;      /* simulated time this frame */
    updateEnv(dt,sdt);
    updateWaves(sea);
    updateCamera(dt);

    acc+=sdt; let steps=0;
    while(acc>=H&&steps<12){ physicsStep(); acc-=H; steps++; }
    if(steps>=12) acc=0;
    updateIslandSurf(sdt);
    updateWindStreaks(sdt);
    particlesStep(sdt);
    updatePrecip(sdt);
    Hooks.run('frame',dt,sdt);
    render();
    if(gl.isContextLost()){ window.AquaBoot.contextLost(); return; }
    if(frameN===1) window.AquaBoot.firstFrame();
    if(typeof audioFrame==='function') audioFrame(dt);

    if(now-lastStat>500){
      lastStat=now; fpsShown=Math.round(1000/ema);
      updateStats(Math.min(fpsShown,120),balls.length,actualPR,sigWaveHeight());
      if(frameN>3) uiReady();
    }
    /* Schedule only after a successful frame; a persistent exception must not
       enqueue an infinite stream of errors. */
    if(window.AquaBoot.canRender()) requestAnimationFrame(frame);
  }catch(error){ window.AquaBoot.fail(error); }
}
document.addEventListener('visibilitychange',()=>{ if(document.hidden) havePrev=false; });

/* All scripts and saved settings are ready before we allocate the targets or
   schedule the first frame. This also avoids repeated startup allocations. */
window.AquaStart=function(){
  if(rendererStarted) return;
  rendererStarted=true;
  updateEnv(0.016,0); updateWaves(sea);
  resize();
  if(window.AquaBoot.state==='lost') return;
  spawnBall(-2.2,3.6,1.0,0,0,0,0);
  spawnBall(0.6,5.2,-0.4,1,0,0,0);
  spawnBall(2.6,6.4,0.8,5,0,0,0);
  if(safeGraphics) setTimeout(()=>{ if(window.AquaBoot.canRender()) toast('Low-memory graphics mode is active for this visit'); },1400);
  lastT=performance.now();
  requestAnimationFrame(frame);
};
