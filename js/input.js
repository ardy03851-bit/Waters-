'use strict';
/* ============================================================
   Camera & input
   ============================================================ */
const cam={yaw:0.0,pitch:0.24,dist:13,tYaw:0.0,tPitch:0.24,tDist:13,target:[0,0.3,0]};
let eye=[0,3,13], camF=[0,0,-1], camR=[1,0,0], camU=[0,1,0], VP=null, tanH=0.466, aspect=1;
/* camera options (set from the UI) */
let fovDeg=50, autoOrbit=false, followBall=false, launchMode='drop', throwSpeed=14;
const HOME_TARGET=[0,0.3,0], ISLAND_TARGET=[0,1,-16];
function computeCamera(){
  const cp=Math.cos(cam.pitch);
  eye=[cam.target[0]+cam.dist*Math.sin(cam.yaw)*cp, cam.target[1]+cam.dist*Math.sin(cam.pitch), cam.target[2]+cam.dist*Math.cos(cam.yaw)*cp];
  waveSample(eye[0],eye[2],simT,false,S1);
  const minY=Math.max(S1.h+0.5,islands.active?islandGround(eye[0],eye[2])+1.0:-1000);
  if(eye[1]<minY) eye[1]=minY;
  let fx=cam.target[0]-eye[0],fy=cam.target[1]-eye[1],fz=cam.target[2]-eye[2]; const fl=Math.hypot(fx,fy,fz); fx/=fl;fy/=fl;fz/=fl;
  camF=[fx,fy,fz];
  let rx=fy*0-fz*1, ry=fz*0-fx*0, rz=fx*1-fy*0; // cross(f, up=(0,1,0))
  rx=-fz; ry=0; rz=fx; const rl=Math.hypot(rx,rz); rx/=rl;rz/=rl; camR=[rx,0,rz];
  camU=[ry*fz-rz*fy, rz*fx-rx*fz, rx*fy-ry*fx];
  aspect=canvas.width/canvas.height;
  tanH=Math.tan(fovDeg*Math.PI/360)*Math.max(1,1.15/aspect);
  const proj=M4.persp(2*Math.atan(tanH),aspect,0.1,3000);
  VP=M4.mul(proj,M4.look(eye,cam.target,[0,1,0]));
}
function rayFrom(px,py){
  const nx=(px/innerWidth)*2-1, ny=1-(py/innerHeight)*2;
  const d=[camF[0]+nx*tanH*aspect*camR[0]+ny*tanH*camU[0], camF[1]+ny*tanH*camU[1], camF[2]+nx*tanH*aspect*camR[2]+ny*tanH*camU[2]];
  const l=Math.hypot(d[0],d[1],d[2]); return [d[0]/l,d[1]/l,d[2]/l];
}
function pickBall(px,py){
  const d=rayFrom(px,py); let best=null,bt=1e9;
  for(const b of balls){
    const ox=eye[0]-b.x,oy=eye[1]-b.y,oz=eye[2]-b.z, R=b.r*1.2+0.06;
    const bb=ox*d[0]+oy*d[1]+oz*d[2], c=ox*ox+oy*oy+oz*oz-R*R, disc=bb*bb-c;
    if(disc<0)continue; let t=-bb-Math.sqrt(disc); if(t<0)t=-bb+Math.sqrt(disc); if(t>0&&t<bt){bt=t;best=b;}
  }
  return best?{ball:best,t:bt}:null;
}
function spawnAtPointer(px,py){
  const d=rayFrom(px,py);
  if(launchMode==='throw'){
    /* throw from the camera along the tap direction (start inside the play area if the camera is far out) */
    const far=Math.hypot(eye[0],eye[2]), t0=islands.active?1.2:Math.max(1.2,far-18);
    const b=spawnBall(eye[0]+d[0]*t0,Math.max(eye[1]+d[1]*t0-0.25,0.6),eye[2]+d[2]*t0,selType,d[0]*throwSpeed,d[1]*throwSpeed+2.2,d[2]*throwSpeed);
    b.wx=d[2]*6; b.wz=-d[0]*6;
    return;
  }
  let x,z;
  if(islands.active&&d[1]<-0.002){
    /* Find the first visible surface, including high ground, not just y=0. */
    const seaT=Math.max(0,-eye[1]/d[1]), end=Math.min(220,seaT+4);
    let prev=0, hit=-1;
    for(let t=1;t<=end;t+=1.5){
      const px=eye[0]+d[0]*t,pz=eye[2]+d[2]*t, py=eye[1]+d[1]*t;
      if(py<=Math.max(islandGround(px,pz),surfH(px,pz,simT))){
        let lo=prev,hi=t;
        for(let i=0;i<8;i++){
          const m=(lo+hi)*0.5,mx=eye[0]+d[0]*m,mz=eye[2]+d[2]*m;
          if(eye[1]+d[1]*m<=Math.max(islandGround(mx,mz),surfH(mx,mz,simT))) hi=m; else lo=m;
        }
        hit=hi; break;
      }
      prev=t;
    }
    const t=hit>=0?hit:Math.min(seaT,200);
    x=eye[0]+d[0]*t; z=eye[2]+d[2]*t;
  } else if(d[1]<-0.002){ const t=-eye[1]/d[1]; x=eye[0]+d[0]*t; z=eye[2]+d[2]*t; }
  else { x=eye[0]+d[0]*10; z=eye[2]+d[2]*10; }
  const rr=Math.hypot(x,z), limit=islands.active?75:10;
  if(rr>limit){x*=limit/rr;z*=limit/rr;}
  const surface=islands.active?Math.max(islandGround(x,z),surfH(x,z,simT)):0;
  spawnBall(x+(Math.random()-0.5)*0.2,surface+4.2+Math.random()*0.6,z+(Math.random()-0.5)*0.2,selType,0,0,0);
}
/* per-frame camera behaviour: easing, auto-orbit, follow the newest ball */
function updateCamera(dt){
  if(autoOrbit&&ptrs.size===0) cam.tYaw+=dt*0.07;
  cam.yaw+=(cam.tYaw-cam.yaw)*Math.min(1,dt*10);
  cam.pitch+=(cam.tPitch-cam.pitch)*Math.min(1,dt*10);
  cam.dist+=(cam.tDist-cam.dist)*Math.min(1,dt*8);
  const home=islands.active?ISLAND_TARGET:HOME_TARGET;
  let tx=home[0],ty=home[1],tz=home[2];
  if(followBall&&balls.length){ const b=balls[balls.length-1]; tx=b.x; ty=clamp(b.y,-1.5,islands.active?20:6)*0.6+0.2; tz=b.z; }
  const k=Math.min(1,dt*3.5);
  cam.target[0]+=(tx-cam.target[0])*k; cam.target[1]+=(ty-cam.target[1])*k; cam.target[2]+=(tz-cam.target[2])*k;
}
function resetCamera(){
  cam.tYaw=Math.round(cam.yaw/(2*Math.PI))*2*Math.PI;
  cam.tPitch=islands.active?0.43:0.24; cam.tDist=islands.active?100:13;
}
const ptrs=new Map(); let pinch0=0, pinchDist0=13, downT=0, tapStart=null, lastHintHide=false;
function hideHint(){ if(lastHintHide)return; lastHintHide=true; $('hint').classList.add('gone'); }
function setGrabTarget(x,y){
  if(!grab)return; const d=rayFrom(x,y);
  grab.ball.grab={x:eye[0]+d[0]*grab.depth,y:eye[1]+d[1]*grab.depth,z:eye[2]+d[2]*grab.depth};
}
function releaseGrab(){ if(grab){ grab.ball.grab=null; const b=grab.ball; b.wx+=(b.vz)*0.4/b.r*0.3; b.wz-=(b.vx)*0.4/b.r*0.3; grab=null; } }
canvas.addEventListener('pointerdown',e=>{
  e.preventDefault(); canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now(),moved:false});
  hideHint(); canvas.style.cursor='grabbing';
  if(ptrs.size===1){
    const hit=pickBall(e.clientX,e.clientY);
    if(hit){ grab={ball:hit.ball,pid:e.pointerId,depth:hit.t}; setGrabTarget(e.clientX,e.clientY); }
  } else {
    releaseGrab();
    const [a,b]=[...ptrs.values()]; pinch0=Math.hypot(a.x-b.x,a.y-b.y); pinchDist0=cam.tDist;
  }
});
canvas.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId); if(!p)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y; p.x=e.clientX;p.y=e.clientY;
  if(Math.hypot(p.x-p.sx,p.y-p.sy)>7) p.moved=true;
  if(grab&&grab.pid===e.pointerId){ setGrabTarget(e.clientX,e.clientY); return; }
  if(ptrs.size===1&&p.moved){
    cam.tYaw-=dx*0.0055; cam.tPitch=clamp(cam.tPitch+dy*0.0045,0.02,1.45);
  } else if(ptrs.size===2){
    const [a,b]=[...ptrs.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y);
    if(pinch0>10) cam.tDist=clamp(pinchDist0*pinch0/Math.max(d,10),3.5,islands.active?160:45);
  }
});
function endPtr(e){
  const p=ptrs.get(e.pointerId); if(!p)return;
  const wasGrab=grab&&grab.pid===e.pointerId;
  if(wasGrab) releaseGrab();
  else if(ptrs.size===1&&!p.moved&&performance.now()-p.t<400&&e.type==='pointerup') spawnAtPointer(p.x,p.y);
  ptrs.delete(e.pointerId);
  if(ptrs.size<2) pinch0=0;
  if(ptrs.size===0) canvas.style.cursor='grab';
}
canvas.addEventListener('pointerup',endPtr);
canvas.addEventListener('pointercancel',endPtr);
canvas.addEventListener('wheel',e=>{e.preventDefault();cam.tDist=clamp(cam.tDist*Math.exp(e.deltaY*0.0012),3.5,islands.active?160:45);},{passive:false});
['gesturestart','gesturechange','gestureend'].forEach(n=>document.addEventListener(n,e=>e.preventDefault()));
document.addEventListener('touchmove',e=>{ if(e.target===canvas) e.preventDefault(); },{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

