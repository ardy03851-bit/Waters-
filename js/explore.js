'use strict';
/* ============================================================
   First-person swimming and the ship's accessible open decks

   The orbit camera and ball interaction are left intact when this mode is
   off. Swimming is inertial, depth is bounded, and deck footsteps follow the
   ship's actual sampled mesh and its floating pose.
   ============================================================ */
const explore={active:false,mode:'swim',pos:[0,1,7],local:[0,1.7,0],yaw:0,pitch:-0.02,
  velocity:[0,0,0],keys:new Set(),touchKeys:new Map(),speed:1,sensitivity:1,foamClock:0,lastStatus:''};
const EXPLORE_KEYS=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','shift','e']);
function explorePressed(key){
  if(explore.keys.has(key)) return true;
  for(const value of explore.touchKeys.values()) if(value===key) return true;
  return false;
}
function onShipRelocated(dx,dz){
  if(!explore.active) return;
  if(explore.mode!=='deck'){explore.pos[0]+=dx;explore.pos[2]+=dz;}
  explore.velocity.fill(0); havePrev=false;
}
function enterExplore(){
  if(explore.active) return;
  if(typeof cinema!=='undefined'&&cinema) setCinema(false);
  if(!ship.enabled) userSet('ship',true);
  if(ship.status==='error') ensureShip();
  updateShip(0,0);
  releaseGrab(); ptrs.clear();
  explore.active=true; explore.mode='swim'; explore.yaw=0; explore.pitch=0.13;
  const x=ship.x,z=ship.z+14;
  explore.pos=[x,surfH(x,z,simT)+0.82,z];
  explore.velocity.fill(0); explore.keys.clear(); explore.touchKeys.clear(); explore.foamClock=0;
  document.body.classList.add('exploring');
  $('exploreHUD').setAttribute('aria-hidden','false');
  $('exploreTouch').setAttribute('aria-hidden','false');
  if(typeof setPanel==='function') setPanel(false);
  hideHint(); havePrev=false; canvas.focus({preventScroll:true});
  if(typeof toast==='function') toast('Swim to the ship · board from alongside');
  updateExploreHUD();
}
function exitExplore(){
  if(!explore.active) return;
  explore.active=false; explore.keys.clear(); explore.touchKeys.clear(); explore.velocity.fill(0);
  ptrs.clear(); canvas.style.cursor='grab';
  document.body.classList.remove('exploring');
  $('exploreHUD').setAttribute('aria-hidden','true');
  $('exploreTouch').setAttribute('aria-hidden','true');
  havePrev=false; resetCamera();
}
function toggleExplore(){if(explore.active) exitExplore();else enterExplore();}
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
  if(explore.mode==='deck'){
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
  explore.local=landing;explore.mode='deck';explore.yaw=landing[0]>=0?-Math.PI/2:Math.PI/2;explore.pitch=-0.08;explore.velocity.fill(0);
  explore.pos=shipPoint(landing[0],landing[1]+1.55,landing[2]);
  havePrev=false;updateExploreHUD();canvas.focus({preventScroll:true});toast('On the open deck · E to leave');return true;
}
function updateExploreHUD(){
  if(!explore.active) return;
  const h=surfH(explore.pos[0],explore.pos[2],simT),depth=Math.max(0,h-explore.pos[1]);
  const status=ship.status==='loading'?'Loading ship…':ship.status==='error'?'Ship unavailable · retry with Board':
    explore.mode==='deck'?'On deck':explore.mode==='shore'?'On shore':
    depth>0.4?'Swimming · '+depth.toFixed(1)+' m deep':'Swimming';
  if(status!==explore.lastStatus){$('exploreStatus').textContent=status;explore.lastStatus=status;}
  const b=$('bBoard'),label=explore.mode==='deck'?'Leave deck':'Board';
  if(b.textContent!==label) b.textContent=label;
  b.title=explore.mode==='deck'?'Return to the water (E)':'Board the ship when alongside (E)';
  const help=explore.mode==='deck'?'WASD · drag to look · E leave deck':'WASD · drag to look · Space rise · Shift dive · E board';
  if($('exploreHelp').textContent!==help) $('exploreHelp').textContent=help;
}
function updateExplore(dt){
  if(!explore.active) return;
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
    if(radial>120){x*=120/radial;z*=120/radial;}
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
  if(explore.mode==='deck'&&ship.poseReady) explore.pos=shipPoint(explore.local[0],explore.local[1]+1.55,explore.local[2]);
  const shake=quakeCameraOffset(explore.pos[0],explore.pos[2]);
  eye=[explore.pos[0]+shake[0],explore.pos[1]+shake[1],explore.pos[2]+shake[2]];
  const sy=Math.sin(explore.yaw),cy=Math.cos(explore.yaw),sp=Math.sin(explore.pitch),cp=Math.cos(explore.pitch);
  camF=[sy*cp,sp,-cy*cp];camR=[cy,0,sy];camU=[-sy*sp,cp,cy*sp];
  aspect=canvas.width/canvas.height;tanH=Math.tan(fovDeg*Math.PI/360)*Math.max(1,1.15/aspect);
  const target=[eye[0]+camF[0],eye[1]+camF[1],eye[2]+camF[2]];
  VP=M4.mul(M4.persp(2*Math.atan(tanH),aspect,0.1,3000),M4.look(eye,target,[0,1,0]));
}
function cameraSubmerge(){
  return explore.active&&explore.mode==='swim'?sstep(-0.08,0.38,surfH(eye[0],eye[2],simT)-eye[1]):0;
}
function isTextTarget(target){return !!(target&&target.closest&&target.closest('input,textarea,select,button,[contenteditable="true"]'));}
addEventListener('keydown',e=>{
  if(!explore.active||e.metaKey||e.ctrlKey&&e.key!=='Control'||e.altKey||isTextTarget(e.target)) return;
  const key=e.key.toLowerCase();
  if(!EXPLORE_KEYS.has(key)) return;
  e.preventDefault();
  if(key==='e'){if(!e.repeat) boardOrLeave();return;}
  explore.keys.add(key);
});
addEventListener('keyup',e=>{explore.keys.delete(e.key.toLowerCase());});
addEventListener('blur',()=>{explore.keys.clear();explore.touchKeys.clear();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){explore.keys.clear();explore.touchKeys.clear();}});
$('bBoard').addEventListener('click',boardOrLeave);
$('bExitExplore').addEventListener('click',exitExplore);
for(const button of document.querySelectorAll('[data-swim]')){
  const end=e=>{explore.touchKeys.delete(e.pointerId);button.classList.remove('held');};
  button.addEventListener('pointerdown',e=>{
    if(!explore.active) return;
    e.preventDefault();button.setPointerCapture(e.pointerId);
    explore.touchKeys.set(e.pointerId,button.dataset.swim);button.classList.add('held');
  });
  button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
}
