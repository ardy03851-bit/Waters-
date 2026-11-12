'use strict';
/* ============================================================
   First-person swimming and the ship's accessible open decks

   The orbit camera and ball interaction are left intact when this mode is
   off. Swimming is inertial, depth is bounded, and deck footsteps follow the
   ship's actual sampled mesh and its floating pose.
   ============================================================ */
const explore={active:false,mode:'swim',pos:[0,1,7],local:[0,1.7,0],yaw:0,pitch:-0.02,
  helmView:'chase',chaseYaw:-0.45,chasePitch:0.30,
  /* Smoothed chase camera, so the view carries its own momentum instead of
     being welded to the hull. */
  chaseCam:{ready:false,eye:[0,0,0],target:[0,0,0]},
  velocity:[0,0,0],keys:new Set(),touchKeys:new Map(),speed:1,sensitivity:1,foamClock:0,lastStatus:'',lastControls:''};
const EXPLORE_KEYS=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','shift','e','b']);
const exploreButtons=document.querySelectorAll('[data-swim]');
const EXPLORE_LABELS={w:'Move forward',s:'Move backward',a:'Move left',d:'Move right'};
const HELM_LABELS={w:'Raise sail',s:'Ease sail',a:'Steer left',d:'Steer right'};
let helmRequest=0;
function clearExploreInput(){
  explore.keys.clear();explore.touchKeys.clear();
  document.querySelectorAll('[data-swim].held').forEach(button=>button.classList.remove('held'));
}
function explorePressed(key){
  if(explore.keys.has(key)) return true;
  for(const value of explore.touchKeys.values()) if(value===key) return true;
  return false;
}
function onShipRelocated(dx,dz){
  if(typeof resetVoyageTrack==='function') resetVoyageTrack();
  if(!explore.active) return;
  if(explore.mode!=='deck'&&explore.mode!=='helm'){explore.pos[0]+=dx;explore.pos[2]+=dz;}
  explore.velocity.fill(0); havePrev=false;
}
function onShipTurned(delta){
  if(explore.active&&(explore.mode==='deck'||explore.mode==='helm')) explore.yaw+=delta;
}
function enterExplore(quiet=false){
  if(explore.active) return;
  if(typeof cinema!=='undefined'&&cinema) setCinema(false);
  if(!ship.enabled) userSet('ship',true);
  if(ship.status==='error') ensureShip();
  updateShip(0,0);
  releaseGrab(); ptrs.clear();
  explore.active=true; explore.mode='swim'; explore.pitch=0.13;
  /* Begin alongside the current side of the vessel, even after it has turned. */
  const rx=Math.cos(ship.heading),rz=Math.sin(ship.heading),x=ship.x+rx*14,z=ship.z+rz*14;
  explore.yaw=Math.atan2(-rx,rz);
  explore.pos=[x,surfH(x,z,simT)+0.82,z];
  explore.velocity.fill(0); clearExploreInput(); explore.foamClock=0;
  document.body.classList.add('exploring');
  $('exploreHUD').setAttribute('aria-hidden','false');
  $('exploreTouch').setAttribute('aria-hidden','false');
  if(typeof setPanel==='function') setPanel(false);
  hideHint(); havePrev=false; canvas.focus({preventScroll:true});
  if(!quiet&&typeof toast==='function') toast('Swim to the ship · board from alongside');
  updateExploreHUD();
}
function exitExplore(){
  if(!explore.active) return;
  ++helmRequest;
  explore.active=false;clearExploreInput();explore.velocity.fill(0);explore.chaseCam.ready=false;
  setShipAnchor(true);
  if(typeof closeVoyageChart==='function') closeVoyageChart(false);
  ptrs.clear(); canvas.style.cursor='grab';
  document.body.classList.remove('exploring','helming');
  $('helmHUD').setAttribute('aria-hidden','true');
  $('exploreHUD').setAttribute('aria-hidden','true');
  $('exploreTouch').setAttribute('aria-hidden','true');
  havePrev=false; resetCamera();
}
function toggleExplore(){if(explore.active) exitExplore();else enterExplore();}
/* Direct access makes sailing discoverable; boarding from the water and
   walking the actual open deck remain available as a separate experience. */
function enterSailing(){
  if(!explore.active) enterExplore(true);
  else if(typeof setPanel==='function'&&document.body.classList.contains('panel-open')) setPanel(false);
  const request=++helmRequest;
  if(ship.status==='ready'){takeHelm();return;}
  updateExploreHUD();
  ensureShip().then(ok=>{
    if(request!==helmRequest||!explore.active||!ship.enabled) return;
    if(ok) takeHelm();
    else updateExploreHUD();
  });
}
function takeHelm(){
  if(!explore.active||!ship.enabled||ship.status!=='ready') return false;
  let landing=null,best=-Infinity;
  /* Prefer a clear viewpoint if the user's balls happen to be on the deck. */
  for(const x of [-4,-3,-2,-1,1,2]) for(const z of [0.8,-0.8,1.25,-1.25]){
    const h=shipDeckAt(x,z,1.75);if(h===null) continue;
    const p=shipPoint(x,h+1.55,z);
    let clearance=100;
    for(const b of balls) clearance=Math.min(clearance,Math.hypot(p[0]-b.x,p[1]-b.y,p[2]-b.z)-b.r);
    if(clearance>best){best=clearance;landing=[x,h,z];}
  }
  if(!landing){toast('No clear place to take the helm');return false;}
  explore.local=landing;explore.mode='helm';explore.yaw=ship.heading;explore.pitch=0.04;
  explore.helmView='chase';explore.chaseYaw=-0.45;explore.chasePitch=0.30;
  explore.chaseCam.ready=false;
  explore.velocity.fill(0);clearExploreInput();updateShip(0,0);
  explore.pos=shipPoint(landing[0],landing[1]+1.55,landing[2]);
  document.body.classList.add('helming');$('helmHUD').setAttribute('aria-hidden','false');
  havePrev=false;updateExploreHUD();
  if(typeof updateHelmHUD==='function') updateHelmHUD();
  canvas.focus({preventScroll:true});
  toast(ship.anchored?'Raise sail to get underway':'At the helm');
  return true;
}
function leaveHelm(){
  if(!explore.active||explore.mode!=='helm') return;
  explore.mode='deck';explore.velocity.fill(0);clearExploreInput();
  document.body.classList.remove('helming');$('helmHUD').setAttribute('aria-hidden','true');
  if(typeof closeVoyageChart==='function') closeVoyageChart(false);
  havePrev=false;updateExploreHUD();canvas.focus({preventScroll:true});
  toast(ship.speed>0.15?'On deck · the ship keeps its course':'On the open deck');
}
function toggleHelm(){
  if(explore.mode==='helm') leaveHelm();
  else if(explore.mode==='deck') takeHelm();
  else enterSailing();
}
function toggleHelmView(){
  if(!explore.active||explore.mode!=='helm') return;
  explore.helmView=explore.helmView==='chase'?'deck':'chase';
  explore.chaseCam.ready=false;
  havePrev=false;
  if(typeof updateHelmHUD==='function') updateHelmHUD();
  canvas.focus({preventScroll:true});
}
function findBoardingPoint(x,side){
  /* Board onto the open main deck, then use the mesh to climb its small steps.
     Choose a genuine floor instead of teleporting into an imagined interior. */
  const xs=[clamp(x+(x>=0?1.2:-1.2),-3.6,3.1),1.5,-1.5,2,-2,0,3,-3];
  const zs=[side*0.8,side*0.45,-side*0.65];
  for(const lx of xs) for(const lz of zs){
    const h=shipDeckAt(lx,lz,1.75);
    if(h!==null) return [lx,h,lz];
  }
  return null;
}
function boardOrLeave(){
  if(!explore.active) return false;
  if(explore.mode==='helm'){leaveHelm();return true;}
  if(explore.mode==='deck'){
    setShipAnchor(true);
    const side=explore.local[2]>=0?1:-1, p=shipPoint(clamp(explore.local[0],-8,8),0,side*4.0);
    explore.pos=[p[0],surfH(p[0],p[2],simT)+0.75,p[2]];
    explore.mode='swim';explore.velocity.fill(0);havePrev=false;updateExploreHUD();
    canvas.focus({preventScroll:true});toast('Back in the water'); return true;
  }
  if(ship.status!=='ready'||!ship.poseReady){
    if(ship.status==='error'){ensureShip();toast('Retrying the ship download');}
    else toast('The ship is still loading');
    return false;
  }
  const p=shipLocal(explore.pos[0],explore.pos[1],explore.pos[2]);
  const surface=surfH(explore.pos[0],explore.pos[2],simT);
  if(Math.abs(p[0])>12.5||Math.abs(p[2])>7.2||explore.pos[1]<surface-1.2){
    toast('Swim closer to the ship and surface to board');return false;
  }
  const landing=findBoardingPoint(p[0],p[2]>=0?1:-1);
  if(!landing){toast('No clear boarding point found');return false;}
  explore.local=landing;explore.mode='deck';explore.yaw=ship.heading+(landing[0]>=0?Math.PI:0);explore.pitch=-0.08;explore.velocity.fill(0);
  explore.pos=shipPoint(landing[0],landing[1]+1.55,landing[2]);
  havePrev=false;updateExploreHUD();canvas.focus({preventScroll:true});toast('On the open deck · E to leave');return true;
}
function updateExploreHUD(){
  if(!explore.active) return;
  /* Depth is only displayed while swimming; do not resample the sea at the
     helm or on shore/deck. The controls themselves change only with mode. */
  const depth=explore.mode==='swim'&&ship.status!=='loading'&&ship.status!=='error'?
    Math.max(0,surfH(explore.pos[0],explore.pos[2],simT)-explore.pos[1]):0;
  const status=ship.status==='loading'?'Loading ship…':ship.status==='error'?'Ship unavailable · retry with Board':
    explore.mode==='helm'?'At the helm':explore.mode==='deck'?'On deck':explore.mode==='shore'?'On shore':
    depth>0.4?'Swimming · '+depth.toFixed(1)+' m deep':'Swimming';
  if(status!==explore.lastStatus){$('exploreStatus').textContent=status;explore.lastStatus=status;}
  const atHelm=explore.mode==='helm',onDeck=explore.mode==='deck',controls=atHelm?'helm':onDeck?'deck':'water';
  if(controls===explore.lastControls) return;
  explore.lastControls=controls;
  const b=$('bBoard'),helm=$('bHelm');
  b.hidden=atHelm;b.textContent=onDeck?'Leave deck':'Board';
  b.title=onDeck?'Return to the water (E)':'Board the ship when alongside (E)';
  helm.hidden=!atHelm&&!onDeck;helm.textContent=atHelm?'Leave helm':'Take helm';
  helm.title=atHelm?'Step onto the open deck (E or B)':'Take the helm (B)';
  $('exploreHelp').textContent=atHelm?'W/S sail · A/D steer · Space anchor':onDeck?'WASD · drag to look · B helm · E leave':'WASD · drag to look · Space rise · Shift dive · E board';
  $('exploreMobileHelp').textContent=atHelm||onDeck?'Drag to look':'Drag to look · arrows move';
  const names=atHelm?HELM_LABELS:EXPLORE_LABELS;
  for(const button of exploreButtons) if(names[button.dataset.swim]) button.setAttribute('aria-label',names[button.dataset.swim]);
}
function updateExplore(dt){
  if(!explore.active) return;
  if(explore.mode==='helm'){
    if(ship.poseReady) explore.pos=shipPoint(explore.local[0],explore.local[1]+1.55,explore.local[2]);
    updateExploreHUD();return;
  }
  const forward=(explorePressed('w')||explorePressed('arrowup')?1:0)-(explorePressed('s')||explorePressed('arrowdown')?1:0);
  const right=(explorePressed('d')||explorePressed('arrowright')?1:0)-(explorePressed('a')||explorePressed('arrowleft')?1:0);
  const up=(explorePressed(' ')?1:0)-(explorePressed('shift')?1:0);
  const norm=Math.max(1,Math.hypot(forward,right)),sy=Math.sin(explore.yaw),cy=Math.cos(explore.yaw);
  const speed=(explore.mode==='swim'?2.35:2.55)*explore.speed;
  const tx=(sy*forward+cy*right)/norm*speed,tz=(-cy*forward+sy*right)/norm*speed;
  const blend=1-Math.exp(-dt*6.0),v=explore.velocity;
  v[0]+=(tx-v[0])*blend;v[2]+=(tz-v[2])*blend;
  v[1]+=((explore.mode==='swim'?up*1.8*explore.speed:0)-v[1])*blend;
  if(explore.mode==='deck'&&ship.enabled&&ship.status==='ready'){
    /* Convert world-space walking direction to the rigid deck frame. */
    const m=ship.matrix,dx=(m[0]*v[0]+m[2]*v[2])*dt,dz=(m[8]*v[0]+m[10]*v[2])*dt;
    const x=explore.local[0]+dx,z=explore.local[2]+dz,old=explore.local[1];
    const h=shipDeckAt(x,z,old);
    if(h!==null&&Math.abs(z)<2.35&&x>-9.1&&x<8.5){
      explore.local[0]=x;explore.local[2]=z;
      explore.local[1]+=(h-old)*(1-Math.exp(-dt*12));
    }else{
      /* Try each axis separately so walking against a rail slides naturally. */
      const hx=shipDeckAt(x,explore.local[2],old),hz=shipDeckAt(explore.local[0],z,old);
      if(hx!==null&&x>-9.1&&x<8.5){explore.local[0]=x;explore.local[1]+=(hx-old)*(1-Math.exp(-dt*12));}
      else if(hz!==null&&Math.abs(z)<2.35){explore.local[2]=z;explore.local[1]+=(hz-old)*(1-Math.exp(-dt*12));}
      else {v[0]*=0.7;v[2]*=0.7;}
    }
    explore.pos=shipPoint(explore.local[0],explore.local[1]+1.55,explore.local[2]);
  }else{
    let x=explore.pos[0]+v[0]*dt,z=explore.pos[2]+v[2]*dt,y=explore.pos[1]+v[1]*dt;
    const radial=Math.hypot(x,z);
    /* A swimmer who leaves the moving ship can still reach it at the edge
       of the sailing area; do not teleport them back to the old 120 m limit. */
    const limit=SHIP_LIMIT+20;
    if(radial>limit){x*=limit/radial;z*=limit/radial;}
    /* A tapered hull keeps swimmers outside the visible sides; diving under
       the keel remains possible. Decorative ropes are not colliders. */
    if(ship.enabled&&ship.poseReady){
      let p=shipLocal(x,y,z);
      const width=2.35*Math.sqrt(Math.max(0,1-Math.pow(p[0]/10.4,2)))+0.34;
      if(Math.abs(p[0])<10.4&&Math.abs(p[2])<width&&p[1]>-2.1&&p[1]<2.5){
        const old=shipLocal(explore.pos[0],explore.pos[1],explore.pos[2]);
        p[2]=(old[2]>=0?1:-1)*width;
        const w=shipPoint(p[0],p[1],p[2]);x=w[0];y=w[1];z=w[2];
      }
    }
    const surface=surfH(x,z,simT),ground=islands.active?islandGround(x,z):-1000;
    if(ground>surface+0.1){
      explore.mode='shore';
      y+=(ground+1.55-y)*(1-Math.exp(-dt*8));
      y=Math.max(y,ground+1.15);
    }else{
      if(explore.mode==='shore') explore.mode='swim';
      if(up===0&&y>surface-0.9){
        /* Gentle buoyancy near the surface, but no forced ascent from a dive. */
        y+=(surface+0.78-y)*(1-Math.exp(-dt*2.4));
      }
      y=clamp(y,Math.max(surface-10,ground+0.55),surface+1.0);
    }
    explore.pos=[x,y,z];
    if(!paused&&explore.mode==='swim'&&Math.abs(y-surface)<1.3&&Math.hypot(v[0],v[2])>0.55){
      explore.foamClock-=dt*timeScale;
      if(explore.foamClock<=0){
        explore.foamClock=0.48;
        addRipple(x,z,0.28,0.016);addFoam(x,z,0.45,0.08);
        const len=Math.hypot(v[0],v[2])||1;
        putSurf(coastFoam,MAX_COAST_FOAM,{x,y:surface,z,width:0.75,nx:-v[0]/len,nz:-v[2]/len,power:0.2,kind:0,
          age:0,life:1.2,seed:Math.random(),layer:0});
      }
    }
  }
  updateExploreHUD();
}
function computeExploreCamera(){
  if((explore.mode==='deck'||explore.mode==='helm')&&ship.poseReady)
    explore.pos=shipPoint(explore.local[0],explore.local[1]+1.55,explore.local[2]);
  let target;
  if(explore.mode==='helm'&&explore.helmView==='chase'){
    /* A follow camera stays attached to the sailing ship but can be orbited
       independently with a drag. The deck view remains truly first person.
       The mount is damped: it trails the hull, widens with speed and lets the
       masthead lead the horizon, which is what makes a fast reach feel fast. */
    const centre=shipPoint(0,5.2,0),a=ship.heading+explore.chaseYaw,cp=Math.cos(explore.chasePitch);
    const distance=45+clamp(ship.speed,0,7)*1.5;
    const wantEye=[centre[0]-Math.sin(a)*cp*distance,centre[1]+Math.sin(explore.chasePitch)*distance,
      centre[2]+Math.cos(a)*cp*distance];
    wantEye[1]=Math.max(wantEye[1],surfH(wantEye[0],wantEye[2],simT)+0.8,islands.active?islandGround(wantEye[0],wantEye[2])+1.2:-1000);
    const wantTarget=[centre[0],centre[1],centre[2]];
    const cam=explore.chaseCam,dt=clamp(frameInterval||0.016,0.001,0.1);
    if(!cam.ready){cam.eye=wantEye.slice();cam.target=wantTarget.slice();cam.ready=true;}
    else{
      const ke=1-Math.exp(-dt*4.6),kt=1-Math.exp(-dt*7.5);
      for(let i=0;i<3;i++){cam.eye[i]+=(wantEye[i]-cam.eye[i])*ke;cam.target[i]+=(wantTarget[i]-cam.target[i])*kt;}
    }
    const shake=quakeCameraOffset(centre[0],centre[2]);
    eye=[cam.eye[0]+shake[0],cam.eye[1]+shake[1],cam.eye[2]+shake[2]];
    target=[cam.target[0]+shake[0],cam.target[1]+shake[1],cam.target[2]+shake[2]];
    let fx=target[0]-eye[0],fy=target[1]-eye[1],fz=target[2]-eye[2],len=Math.hypot(fx,fy,fz)||1;
    fx/=len;fy/=len;fz/=len;camF=[fx,fy,fz];
    len=Math.hypot(fx,fz)||1;camR=[-fz/len,0,fx/len];
    camU=[-camR[2]*fy,camR[2]*fx-camR[0]*fz,camR[0]*fy];
    /* Follow the heel of the deck a little, but never so much that the
       horizon tips over. */
    const rollAmount=clamp(ship.roll*0.55,-0.10,0.10),cr=Math.cos(rollAmount),sr=Math.sin(rollAmount);
    const r0=camR,u0=camU;
    camR=[r0[0]*cr+u0[0]*sr,r0[1]*cr+u0[1]*sr,r0[2]*cr+u0[2]*sr];
    camU=[u0[0]*cr-r0[0]*sr,u0[1]*cr-r0[1]*sr,u0[2]*cr-r0[2]*sr];
  }else{
    const shake=quakeCameraOffset(explore.pos[0],explore.pos[2]);
    eye=[explore.pos[0]+shake[0],explore.pos[1]+shake[1],explore.pos[2]+shake[2]];
    const sy=Math.sin(explore.yaw),cy=Math.cos(explore.yaw),sp=Math.sin(explore.pitch),cp=Math.cos(explore.pitch);
    camF=[sy*cp,sp,-cy*cp];camR=[cy,0,sy];camU=[-sy*sp,cp,cy*sp];
    target=[eye[0]+camF[0],eye[1]+camF[1],eye[2]+camF[2]];
  }
  /* A slightly wider lens under sail: speed reads in the edges of the frame. */
  const speedFov=explore.active&&explore.mode==='helm'?clamp((ship.speed-1)*0.85,0,7):0;
  aspect=canvas.width/canvas.height;
  tanH=Math.tan((fovDeg+speedFov)*Math.PI/360)*Math.max(1,1.15/aspect);
  /* The camera's own up vector carries the heel roll computed above; using a
     world up here would silently discard it. */
  VP=M4.mul(M4.persp(2*Math.atan(tanH),aspect,0.1,3000),M4.look(eye,target,camU));
}
function cameraSubmerge(){
  return explore.active&&explore.mode==='swim'?sstep(-0.08,0.38,surfH(eye[0],eye[2],simT)-eye[1]):0;
}
function isTextTarget(target){return !!(target&&target.closest&&target.closest('input,textarea,select,button,[contenteditable="true"]'));}
addEventListener('keydown',e=>{
  if(!explore.active||e.metaKey||e.ctrlKey||e.altKey||isTextTarget(e.target)||
    document.body.classList.contains('panel-open')||(typeof voyage!=='undefined'&&voyage.chartOpen)) return;
  const key=e.key.toLowerCase();
  if(explore.mode==='helm'&&key==='v'){
    e.preventDefault();if(!e.repeat) toggleHelmView();return;
  }
  if(!EXPLORE_KEYS.has(key)) return;
  e.preventDefault();
  if(key==='e'){if(!e.repeat) boardOrLeave();return;}
  if(key==='b'){if(!e.repeat) toggleHelm();return;}
  if(key===' '&&explore.mode==='helm'){
    if(!e.repeat&&typeof toggleShipAnchor==='function') toggleShipAnchor();
    return;
  }
  explore.keys.add(key);
});
addEventListener('keyup',e=>{explore.keys.delete(e.key.toLowerCase());});
addEventListener('blur',clearExploreInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden) clearExploreInput();});
$('bBoard').addEventListener('click',boardOrLeave);
$('bHelm').addEventListener('click',toggleHelm);
$('bExitExplore').addEventListener('click',exitExplore);
for(const button of exploreButtons){
  const end=e=>{explore.touchKeys.delete(e.pointerId);button.classList.remove('held');};
  button.addEventListener('pointerdown',e=>{
    if(!explore.active) return;
    e.preventDefault();button.setPointerCapture(e.pointerId);
    explore.touchKeys.set(e.pointerId,button.dataset.swim);button.classList.add('held');
  });
  button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
}
