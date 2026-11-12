'use strict';
/* ============================================================
   Balls: rigid body physics
   ============================================================ */
const TYPES=[
  {name:'Beach ball', sub:'hollow · floats high', r:0.62, rho:0.012, e:0.72, ic:0.667, sw:'conic-gradient(#d91420,#f5f5f0,#1040d9,#f9cc1a,#f5f5f0,#12a037,#d91420)'},
  {name:'Basketball', sub:'light · bouncy',       r:0.46, rho:0.085, e:0.80, ic:0.667, sw:'radial-gradient(circle at 35% 30%,#fbb066,#d9600f 55%,#6e2c04)'},
  {name:'Tennis ball',sub:'floats · fuzzy',       r:0.30, rho:0.37,  e:0.72, ic:0.667, sw:'radial-gradient(circle at 35% 30%,#e8f56a,#b5d11c 55%,#5e7108)'},
  {name:'Wood',       sub:'half-submerged',       r:0.40, rho:0.62,  e:0.45, ic:0.4,   sw:'radial-gradient(circle at 35% 30%,#d9a45f,#9a6428 55%,#4a2a0c)'},
  {name:'Bowling',    sub:'sinks slowly',         r:0.32, rho:1.35,  e:0.22, ic:0.4,   sw:'radial-gradient(circle at 35% 30%,#7c4bd0,#2a0f78 55%,#05031c)'},
  {name:'Steel',      sub:'sinks fast',           r:0.28, rho:7.8,   e:0.30, ic:0.4,   sw:'linear-gradient(135deg,#f4f7fb,#8f9aab 40%,#e9eef6 55%,#4c5666)'},
  {name:'Water balloon',sub:'bursts on impact',   r:0.34, rho:0.36,  e:0.35, ic:0.5,   sw:'radial-gradient(circle at 35% 30%,#a5eef7,#2aa8c4 55%,#0a4a5e)'},
  {name:'Glow orb',   sub:'shines at night',      r:0.30, rho:0.55,  e:0.50, ic:0.45,   sw:'radial-gradient(circle at 35% 30%,#cffcff,#1fd3e8 45%,#0b6f8a)'}
];
let selType=0, sizeMul=1, timeScale=1;
let grav=G, bounceMul=1, waterRho=1;   /* tweakable physics: gravity, restitution scale, water density (1 = sea water) */
const balls=[]; let MAXBALLS=40;
function qNorm(q){const l=Math.hypot(q[0],q[1],q[2],q[3])||1;q[0]/=l;q[1]/=l;q[2]/=l;q[3]/=l;}
function spawnBall(x,y,z,ti,vx=0,vy=0,vz=0){
  const T=TYPES[ti], r=T.r*sizeMul, V=4/3*Math.PI*r*r*r, m=T.rho*RHO_W*V;
  const q=[Math.random()-0.5,Math.random()-0.5,Math.random()-0.5,Math.random()-0.5]; qNorm(q);
  const b={x,y,z,vx,vy,vz,wx:(Math.random()-0.5)*5,wy:(Math.random()-0.5)*5,wz:(Math.random()-0.5)*5,q,r,V,m,im:1/m,I:T.ic*m*r*r,
    type:ti,e:T.e,pf:0,wh:0,wet:0,grab:null,dead:false,frac:0,rot:new Float32Array(9)};
  balls.push(b);
  while(balls.length>MAXBALLS){ const o=balls.shift(); if(grab&&grab.ball===o) grab=null; }
  return b;
}

const S0={h:0,vx:0,vy:0,vz:0,ax:0,az:0}, S1={h:0,vx:0,vy:0,vz:0,ax:0,az:0};
let simT=0, stepCount=0, windX=0, windZ=0;
function capV(h,b){ let d=h-(b.y-b.r); if(d<=0)return 0; if(d>2*b.r)d=2*b.r; return Math.PI*d*d*(3*b.r-d)/3; }
let grab=null;

const groundNormal={nx:0,ny:1,nz:0};
function collideIsland(b,dt){
  const ground=islandGround(b.x,b.z,groundNormal);
  if(ground<=-21.98) return;
  const nx=groundNormal.nx,ny=groundNormal.ny,nz=groundNormal.nz;
  /* Signed distance to the local tangent plane gives a stable contact on
     sloping ground, rather than snapping the ball vertically into a cliff. */
  const distance=(b.y-ground)*ny, pen=b.r-distance;
  if(pen<=0) return;
  const correction=Math.min(pen,b.r*2);
  b.x+=nx*correction; b.y+=ny*correction; b.z+=nz*correction;
  const vn=b.vx*nx+b.vy*ny+b.vz*nz;
  if(vn<0){
    if(b.type===6&&vn<-4.2){ waterBalloonBurst(b,-vn); b.dead=true; return; }
    const restitution=Math.min(0.65,b.e*bounceMul*0.6);
    const impulse=-(1+restitution)*vn;
    b.vx+=nx*impulse; b.vy+=ny*impulse; b.vz+=nz*impulse;
    if(vn<-2&&typeof audioKnock==='function') audioKnock(-vn*0.6);
  }
  const normalV=b.vx*nx+b.vy*ny+b.vz*nz;
  const vx=b.vx-normalV*nx,vy=b.vy-normalV*ny,vz=b.vz-normalV*nz;
  const friction=Math.min(1,dt*3.5);
  b.vx-=vx*friction; b.vy-=vy*friction; b.vz-=vz*friction;
  const roll=Math.min(1,dt*8)/b.r;
  b.wx+=(ny*vz-nz*vy-b.wx*b.r)*roll;
  b.wy+=(nz*vx-nx*vz-b.wy*b.r)*roll;
  b.wz+=(nx*vy-ny*vx-b.wz*b.r)*roll;
}

function stepBall(b,dt){
  const r=b.r,t=simT;
  waveSample(b.x,b.z,t,true,S0);b.wh=S0.h;
  /* Each swell is bounded by its amplitude; a quake is bounded separately.
     If the whole sphere is above that conservative maximum, all five caps
     are exactly zero. Keep the centre sample for rendering and impacts, and
     retain the full five-sample calculation everywhere near the water. */
  const bottom=b.y-r;
  let dry=false;
  if(bottom>0&&typeof waveHeightBound==='number'&&bottom>waveHeightBound+1e-8){
    const quakeBound=typeof seaQuakeHeightBound==='function'?seaQuakeHeightBound():
      typeof seaQuakeHeight==='function'?Infinity:0;
    dry=bottom>waveHeightBound+quakeBound+1e-8;
  }
  let Vs=0,dAvg=0;
  if(!dry){
    const o=0.65*r;
    waveSample(b.x+o,b.z,t,false,S1);const h1=S1.h;
    waveSample(b.x-o,b.z,t,false,S1);const h2=S1.h;
    waveSample(b.x,b.z+o,t,false,S1);const h3=S1.h;
    waveSample(b.x,b.z-o,t,false,S1);const h4=S1.h;
    Vs=(capV(S0.h,b)+capV(h1,b)+capV(h2,b)+capV(h3,b)+capV(h4,b))/5;
    dAvg=clamp((S0.h+h1+h2+h3+h4)/5-bottom,0,2*r);
  }
  const frac=Vs/b.V; b.frac=frac;
  const meff=b.m+0.5*RHO_W*Vs;

  let ay=(-b.m*grav+RHO_W*waterRho*grav*Vs)/meff;
  let ax=RHO_W*Vs*S0.ax/meff, az=RHO_W*Vs*S0.az/meff;
  const dist=Math.hypot(b.x,b.z), playRadius=islands.active?80:10;
  /* Keep the original sandbox tether, but give a sailing ship its own moving
     neighbourhood. A ball on the deck must not be pulled to the origin or
     deleted merely because the vessel has travelled beyond the old bounds. */
  const withShip=typeof ship!=='undefined'&&ship.enabled&&ship.status==='ready';
  const sx=withShip?b.x-ship.x:0,sz=withShip?b.z-ship.z:0,shipDist=withShip?Math.hypot(sx,sz):Infinity;
  if(dist>playRadius&&shipDist>18){
    const homeExcess=dist-playRadius,shipExcess=shipDist-18;
    if(homeExcess<=shipExcess){const k=homeExcess*0.9;ax-=b.x/dist*k;az-=b.z/dist*k;}
    else {const k=shipExcess*0.9;ax-=sx/shipDist*k;az-=sz/shipDist*k;}
  }
  if(b.grab){ const g=b.grab; ax+=150*(g.x-b.x)-20*b.vx; ay+=150*(g.y-b.y)-20*b.vy; az+=150*(g.z-b.z)-20*b.vz; }
  b.vx+=ax*dt;b.vy+=ay*dt;b.vz+=az*dt;

  /* hydrodynamic drag + torque */
  if(frac>0.0005){
    const ux=b.vx-S0.vx,uy=b.vy-S0.vy,uz=b.vz-S0.vz,sp=Math.hypot(ux,uy,uz);
    const As=Math.PI*r*r*Math.sqrt(frac);
    const f=Math.min(0.85,0.5*RHO_W*0.47*As*sp*dt/meff);
    b.vx-=ux*f;b.vy-=uy*f;b.vz-=uz*f;
    const rcy=-r+dAvg*0.5, Jx=-b.m*ux*f, Jz=-b.m*uz*f;
    b.wx+=0.6*(rcy*Jz)/b.I; b.wz+=0.6*(-rcy*Jx)/b.I;
    const wm=Math.hypot(b.wx,b.wy,b.wz);
    const fr=Math.min(0.5,0.5*RHO_W*0.12*Math.pow(r,5)*wm*frac*dt/b.I)+0.5*frac*dt;
    b.wx*=1-fr;b.wy*=1-fr;b.wz*=1-fr;
  }
  /* air drag, wind & Magnus effect */
  {
    const ux=b.vx-windX,uy=b.vy,uz=b.vz-windZ,sp=Math.hypot(ux,uy,uz), airF=1-Math.sqrt(frac);
    const A=Math.PI*r*r*airF;
    const f=Math.min(0.5,0.5*RHO_A*0.47*A*sp*dt/meff);
    b.vx-=ux*f;b.vy-=uy*f;b.vz-=uz*f;
    if(airF>0.01){
      const k=0.5*RHO_A*Math.PI*r*r*r*airF/b.m;
      let mx=k*(b.wy*uz-b.wz*uy),my=k*(b.wz*ux-b.wx*uz),mz=k*(b.wx*uy-b.wy*ux);
      const ml=Math.hypot(mx,my,mz); if(ml>25){const s=25/ml;mx*=s;my*=s;mz*=s;}
      b.vx+=mx*dt;b.vy+=my*dt;b.vz+=mz*dt;
    }
  }
  if(b.grab){ const d=1-3*dt; b.wx*=d;b.wy*=d;b.wz*=d; }
  const vm=Math.hypot(b.vx,b.vy,b.vz); if(vm>40){const s=40/vm;b.vx*=s;b.vy*=s;b.vz*=s;}

  /* splash on entry */
  {
    const rvy=b.vy-S0.vy, rvx=b.vx-S0.vx, rvz=b.vz-S0.vz;
    /* a water balloon hitting the surface fast pops instead of splashing */
    if(b.type===6&&b.pf<0.003&&frac>=0.003&&rvy<-2.0){ waterBalloonBurst(b,-rvy); b.dead=true; return; }
    if(b.pf<0.003&&frac>=0.003&&rvy<-0.7) splash(b,-rvy+0.35*Math.hypot(rvx,rvz),rvx,rvz);
    /* breaching: a buoyant ball bursting back out drags a skirt of water with it */
    if(b.pf>=0.55&&frac<0.55&&rvy>1.3) breach(b,rvy);
    if(b.pf>=0.25&&frac<0.25) b.wet=1;
    if(b.wet>0){
      if(frac<0.25) drip(b,dt); else if(frac>=0.25) b.wet=1;
      if(frac<0.25) b.wet-=dt*0.8;
    }
  }
  b.pf=frac;

  /* push water: ripples, wake and foam */
  const dpen=S0.h-(b.y-r);
  if(dpen>0&&dpen<2*r){
    const dy=b.y-S0.h, rho=Math.max(Math.sqrt(Math.max(r*r-dy*dy,0)),0.06);
    addRipple(b.x,b.z,rho*1.25+0.12,clamp(b.vy,-14,14)*dt*0.55);
    const ux=b.vx-S0.vx,uz=b.vz-S0.vz,sp=Math.hypot(ux,uz);
    if(sp>0.4){
      const dx=ux/sp,dz=uz/sp;
      const push=Math.min(sp,14)*dt*0.5;
      addRipple(b.x+dx*rho*0.9,b.z+dz*rho*0.9,rho*0.8+0.1,push);
      addRipple(b.x-dx*rho*0.9,b.z-dz*rho*0.9,rho*0.8+0.1,-push);
    }
    if(sp>1.4||Math.abs(b.vy)>2) addFoam(b.x,b.z,rho*1.4+0.1,Math.min(1,(sp+Math.abs(b.vy))*0.45)*dt*10);
    if(sp>2.6&&frac<0.95) wakeSpray(b,S0.h,rho,ux,uz,sp,dt);
  }

  b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
  if(islands.active) collideIsland(b,dt);
  if(typeof collideShip==='function') collideShip(b,dt);
  /* orientation */
  const q=b.q,hx=0.5*dt;
  const dqx=b.wx*q[3]+b.wy*q[2]-b.wz*q[1], dqy=-b.wx*q[2]+b.wy*q[3]+b.wz*q[0],
        dqz=b.wx*q[1]-b.wy*q[0]+b.wz*q[3], dqw=-b.wx*q[0]-b.wy*q[1]-b.wz*q[2];
  q[0]+=dqx*hx;q[1]+=dqy*hx;q[2]+=dqz*hx;q[3]+=dqw*hx; qNorm(q);
  /* Balls left on a distant island get time to drift back to the normal
     play area when the archipelago is removed, rather than disappearing. */
  if(!islands.active&&b.islandRecovery&&dist<28) b.islandRecovery=false;
  if(b.shipRecovery&&dist<(islands.active?140:28)) b.shipRecovery=false;
  const maxDistance=b.shipRecovery?SHIP_LIMIT+64:(islands.active||b.islandRecovery?140:28);
  if(!isFinite(b.x+b.y+b.z+b.vx+b.vy+b.vz)||(dist>maxDistance&&shipDist>32)||b.y<-24) b.dead=true;
}

function collide(){
  const n=balls.length;
  for(let i=0;i<n;i++){const a=balls[i];if(!a||a.dead) continue;for(let j=i+1;j<n;j++){const b=balls[j];
    if(!b||b.dead) continue;
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,rs=a.r+b.r,d2=dx*dx+dy*dy+dz*dz;
    if(d2>=rs*rs||d2<1e-8)continue;
    const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,nz=dz/d,pen=rs-d,tot=a.im+b.im;
    a.x-=nx*pen*a.im/tot;a.y-=ny*pen*a.im/tot;a.z-=nz*pen*a.im/tot;
    b.x+=nx*pen*b.im/tot;b.y+=ny*pen*b.im/tot;b.z+=nz*pen*b.im/tot;
    const ra=a.r,rb=b.r;
    const vax=a.vx+(a.wy*nz-a.wz*ny)*ra,vay=a.vy+(a.wz*nx-a.wx*nz)*ra,vaz=a.vz+(a.wx*ny-a.wy*nx)*ra;
    const vbx=b.vx-(b.wy*nz-b.wz*ny)*rb,vby=b.vy-(b.wz*nx-b.wx*nz)*rb,vbz=b.vz-(b.wx*ny-b.wy*nx)*rb;
    const rx=vbx-vax,ry=vby-vay,rz=vbz-vaz,rn=rx*nx+ry*ny+rz*nz;
    if(rn<0){
      let e=Math.min(0.97,Math.min(a.e,b.e)*bounceMul); if(a.frac>0.5||b.frac>0.5) e*=0.35;
      const jn=-(1+e)*rn/tot;
      if(-rn>0.6&&typeof audioKnock==='function') audioKnock(-rn);
      /* a water balloon popped by a hard collision with another ball */
      if(-rn>4.2){
        const wb=a.type===6?a:(b.type===6?b:null);
        if(wb){
          waterBalloonBurst(wb,-rn+1.5); wb.dead=true; if(grab&&grab.ball===wb) grab=null;
          /* A burst ends only this contact, not every other pair this step. */
          if(wb===a) break;
          continue;
        }
      }
      a.vx-=jn*nx*a.im;a.vy-=jn*ny*a.im;a.vz-=jn*nz*a.im;
      b.vx+=jn*nx*b.im;b.vy+=jn*ny*b.im;b.vz+=jn*nz*b.im;
      const tx=rx-rn*nx,ty=ry-rn*ny,tz=rz-rn*nz,tm=Math.hypot(tx,ty,tz);
      if(tm>1e-5){
        const dx2=tx/tm,dy2=ty/tm,dz2=tz/tm;
        const den=tot+ra*ra/a.I+rb*rb/b.I, jt=Math.min(0.3*jn,tm/den);
        a.vx+=jt*dx2*a.im;a.vy+=jt*dy2*a.im;a.vz+=jt*dz2*a.im;
        b.vx-=jt*dx2*b.im;b.vy-=jt*dy2*b.im;b.vz-=jt*dz2*b.im;
        const fx=jt*dx2,fy=jt*dy2,fz=jt*dz2;
        a.wx+=(ny*ra*fz-nz*ra*fy)/a.I;a.wy+=(nz*ra*fx-nx*ra*fz)/a.I;a.wz+=(nx*ra*fy-ny*ra*fx)/a.I;
        b.wx+=(ny*rb*fz-nz*rb*fy)/b.I;b.wy+=(nz*rb*fx-nx*rb*fz)/b.I;b.wz+=(nx*rb*fy-ny*rb*fx)/b.I;
      }
      if(jn*Math.min(a.im,b.im)>0.8){ const hy=(a.wh+b.wh)*0.5; if(Math.abs(a.y-hy)<a.r*1.5) addFoam((a.x+b.x)/2,(a.z+b.z)/2,0.5,0.4); }
    }
  }}
}

const H=1/240;
function physicsStep(){
  simT+=H; stepCount++;
  for(let i=0;i<balls.length;i++) if(!balls[i].dead) stepBall(balls[i],H);
  collide();
  /* Contacts can pop balloons too; remove them before the next step. */
  for(let i=balls.length-1;i>=0;i--) if(balls[i].dead){ if(grab&&grab.ball===balls[i])grab=null; balls.splice(i,1); }
  if((stepCount&1)===0) rippleStep();
}

