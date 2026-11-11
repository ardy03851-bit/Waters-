'use strict';
/* ============================================================
   Splash VFX

   Every water entry is built from the pieces a real splash has:
     1. ejecta   – a thin, very fast, low-angle spray thrown out at first contact
     2. crown    – a rising sheet that breaks into fingers; each finger is a
                   ligament: thick aerated water at the base, clear drops at the tip
     3. mist     – fine aerosol that hangs in the air and drifts with the wind
     4. cavity   – a crater in the surface with a raised rim (ripple simulation)
     5. jet      – the Worthington jet: when the cavity collapses a column of
                   water shoots up from the centre and pinches off into drops
     6. fizz     – entrained air bubbling back up as a lingering foam patch
     7. rain-back– every drop that falls back makes its own ring, a speck of
                   foam and sometimes a tiny secondary splash
   Balls bursting back out of the water (breach), dripping while wet and
   ploughing through the surface (bow spray) are handled here too.
   ============================================================ */
const MAXP=16000, P_MIST=2;
const PX=new Float32Array(MAXP),PY=new Float32Array(MAXP),PZ=new Float32Array(MAXP);
const PVX=new Float32Array(MAXP),PVY=new Float32Array(MAXP),PVZ=new Float32Array(MAXP);
const PLife=new Float32Array(MAXP),PSize=new Float32Array(MAXP),PMax=new Float32Array(MAXP);
const PKind=new Float32Array(MAXP),PDrag=new Float32Array(MAXP),PGrav=new Float32Array(MAXP),PSeed=new Float32Array(MAXP);
const PGen=new Uint8Array(MAXP);
let pCount=0, shutter=0.02;   /* exposure time used for motion-blurred drops */
const PSTRIDE=10;
const partData=new Float32Array(MAXP*PSTRIDE);
const partVAO=gl.createVertexArray(), partBuf=gl.createBuffer();
gl.bindVertexArray(partVAO); gl.bindBuffer(gl.ARRAY_BUFFER,partBuf); gl.bufferData(gl.ARRAY_BUFFER,partData.byteLength,gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,PSTRIDE*4,0);  gl.vertexAttribDivisor(0,1);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,PSTRIDE*4,12); gl.vertexAttribDivisor(1,1);
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,PSTRIDE*4,24); gl.vertexAttribDivisor(2,1);
gl.bindVertexArray(null);

const rnd=Math.random;
/* kind: 0 clear drop … 1 white water, 2 mist · drag: 1/s · grav: gravity scale · gen: 0 may spawn secondaries */
function emit(x,y,z,vx,vy,vz,size,life,kind,drag,grav,gen){
  if(pCount>=MAXP) return; const i=pCount++;
  PX[i]=x;PY[i]=y;PZ[i]=z;PVX[i]=vx;PVY[i]=vy;PVZ[i]=vz;PSize[i]=size;PLife[i]=life;PMax[i]=life;
  PKind[i]=kind;PDrag[i]=drag;PGrav[i]=grav;PGen[i]=gen;PSeed[i]=rnd();
}
function mist(x,y,z,vx,vy,vz,size,life){ emit(x,y,z,vx,vy,vz,size,life,P_MIST,2.6,0.10,1); }
/* thin out new effects smoothly when the particle pool is filling up */
let splashAmt=1;   /* user setting: splash detail */
function budget(){ return clamp(1.35-1.3*pCount/MAXP,0.12,1)*splashAmt*(hqMode?1.35:1); }

const splashEvents=[], cliffEvents=[];

/* A breaker climbing a cliff: a wide sheet of aerated water, fast clear
   droplets and a wind-blown mist cloud. A short secondary event below lets
   the white water fall back down the rock instead of vanishing at the crest. */
function cliffSplash(x,y,z,nx,nz,power){
  const q=budget(), tx=-nz,tz=nx, width=3.4+2.2*power;
  y=clamp(y,-0.3,2.0);
  const n=Math.floor((650+450*power)*q);
  for(let i=0;i<n;i++){
    const along=(rnd()-0.5)*width, f=rnd(), core=1-Math.min(1,Math.abs(along)/(width*0.56));
    const out=0.6+2.8*rnd(), up=(5.0+12.5*Math.pow(f,0.6))*(0.65+0.35*core)*(0.75+0.25*power);
    emit(x+tx*along+nx*(rnd()-0.5)*0.35,y+0.12+rnd()*0.5,z+tz*along+nz*(rnd()-0.5)*0.35,
      nx*out+tx*(rnd()-0.5)*2.2,up,nz*out+tz*(rnd()-0.5)*2.2,
      (0.13+0.20*(1-f))*(0.8+0.4*rnd()),1.3+rnd()*1.2,0.82+0.18*rnd(),0.14+0.28*rnd(),1,1);
  }
  /* Fine spray fans outward and catches the light above the white water. */
  for(let i=0;i<Math.floor(300*power*q);i++){
    const along=(rnd()-0.5)*width, out=1.0+rnd()*4.0;
    emit(x+tx*along,y+0.2+rnd()*0.6,z+tz*along,
      nx*out+tx*(rnd()-0.5)*3,7.0+rnd()*12.0*power,nz*out+tz*(rnd()-0.5)*3,
      0.04+0.075*rnd(),1.5+rnd()*1.2,0.2+0.65*rnd(),0.18+0.4*rnd(),1,1);
  }
  for(let i=0;i<Math.floor(36*power*q);i++){
    const along=(rnd()-0.5)*width;
    mist(x+tx*along+nx*rnd(),y+0.5+rnd()*2,z+tz*along+nz*rnd(),
      nx*(0.5+rnd())+windX*0.15,1+rnd()*2.8,nz*(0.5+rnd())+windZ*0.15,
      0.55+rnd()*0.8,1.8+rnd()*1.5);
  }
  addFoam(x+nx*0.7,z+nz*0.7,2.4,0.85);
  addRing(x+nx*0.5,z+nz*0.5,2.1,0.6,0.08);
  cliffEvents.push({x,y,z,nx,nz,tx,tz,width,power,start:simT+0.32,end:simT+1.5,acc:0});
}
function runCliffEvents(dt){
  for(let i=cliffEvents.length-1;i>=0;i--){
    const e=cliffEvents[i];
    if(!islands.active||simT>e.end){cliffEvents.splice(i,1);continue;}
    if(simT<e.start) continue;
    e.acc+=dt*350*e.power*budget();
    while(e.acc>=1){
      e.acc--;
      const along=(rnd()-0.5)*e.width, h=1.0+rnd()*(3.3+2.3*e.power), off=0.12+rnd()*0.6;
      emit(e.x+e.tx*along+e.nx*off,e.y+h,e.z+e.tz*along+e.nz*off,
        e.nx*(0.1+rnd()*0.7),-0.5-rnd()*2.5,e.nz*(0.1+rnd()*0.7),
        0.10+rnd()*0.14,0.7+rnd()*0.8,0.9+0.1*rnd(),0.4,1,1);
    }
  }
}

/* ---- 1–4: water entry ---- */
function splash(b,vImp,hx,hz){
  const r=b.r, rho=b.m/(RHO_W*b.V);
  /* light hollow balls stop dead at the surface, dense ones punch a deep cavity */
  const dens=0.5+0.5*Math.min(1,Math.pow(rho,0.4));
  const P=Math.min(vImp,26)*dens;
  if(P<0.45) return;
  if(typeof audioSplash==='function') audioSplash(P,r);
  const x=b.x,z=b.z,y=b.wh, sc=0.55+0.45*r/0.4, q=budget();
  const hs=Math.hypot(hx,hz), fx=hs>1e-3?hx/hs:0, fz=hs>1e-3?hz/hs:0, obl=Math.min(1,hs/(vImp+1e-3));

  /* crown */
  const nDir=Math.floor(clamp(26+P*r*46,36,260)*q);
  const lobes=7+Math.floor(rnd()*7), ph=rnd()*6.2832, elev0=0.98+0.22*rnd(), vC=P*0.44;
  const nSeg=Math.min(8,4+Math.floor(P*0.3));
  for(let i=0;i<nDir;i++){
    const a=(i+rnd())/nDir*6.2832, ca=Math.cos(a), sa=Math.sin(a), al=ca*fx+sa*fz;
    const lobe=(0.70+0.30*Math.sin(a*lobes+ph))*(0.78+0.44*rnd());
    const vmax=vC*lobe*Math.max(0.25,1+0.9*obl*al);
    const el=elev0+(rnd()-0.5)*0.22-0.32*obl*al, ce=Math.cos(el), se=Math.sin(el);
    const rr=r*(0.86+0.12*rnd());
    for(let k=0;k<nSeg;k++){
      const f=(k+rnd())/nSeg, sp=vmax*(0.28+0.72*f);
      emit(x+ca*rr,y+0.02+0.05*f,z+sa*rr, ca*ce*sp+hx*0.22,se*sp,sa*ce*sp+hz*0.22,
           (0.070-0.056*f)*sc*(0.7+0.6*rnd()), 1.0+rnd()*1.2, clamp(1.3-1.35*f+0.25*(rnd()-0.5),0,1), 0.22+0.55*f, 1, 0);
    }
  }
  /* ejecta */
  const nE=Math.floor(Math.min(160,P*6*sc)*q);
  for(let i=0;i<nE;i++){
    const a=rnd()*6.2832, ca=Math.cos(a), sa=Math.sin(a), el=0.14+0.5*rnd(), sp=P*(0.55+0.75*rnd())*Math.max(0.3,1+0.8*obl*(ca*fx+sa*fz));
    emit(x+ca*r*0.9,y+0.03,z+sa*r*0.9, ca*Math.cos(el)*sp,Math.sin(el)*sp,sa*Math.cos(el)*sp, (0.008+0.012*rnd())*sc, 0.45+0.5*rnd(), 0.3*rnd(), 1.6+1.6*rnd(), 1, 1);
  }
  /* mist */
  const nM=Math.floor(clamp(P*2.4*sc,3,34)*q);
  for(let i=0;i<nM;i++){
    const a=rnd()*6.2832, rr=r*(0.4+0.9*rnd()), vo=P*0.14*rnd();
    mist(x+Math.cos(a)*rr,y+0.05+0.2*rnd()*r,z+Math.sin(a)*rr, Math.cos(a)*vo+hx*0.15,P*(0.05+0.17*rnd()),Math.sin(a)*vo+hz*0.15, r*(0.32+0.5*rnd())*(0.7+0.04*P), 1.3+1.7*rnd());
  }
  /* cavity + rim, foam */
  addRipple(x,z,r*1.35,-Math.min(0.16,0.016*P));
  addRing(x,z,r*1.7,r*0.5,Math.min(0.11,0.011*P));
  addFoam(x,z,r*1.9,Math.min(0.75,P*0.10));
  /* delayed parts */
  if(P>2.0) splashEvents.push({type:0,t:simT+0.15+0.26*Math.sqrt(r),x:x+hx*0.05,z:z+hz*0.05,r,P,ball:b,on:false,acc:0,V:0,D:0});
  splashEvents.push({type:1,t:simT+0.12,end:simT+1.0+0.12*P,x,z,r,P,acc:0});
}

/* ---- water balloon popping: a shell of water released at once ---- */
function waterBalloonBurst(b,vImp){
  const q=budget(), P=Math.min(vImp,24);
  const n=Math.floor(clamp(30+P*11,40,170)*q);
  for(let i=0;i<n;i++){
    /* roughly even sphere of droplets, biased slightly upwards */
    const a=rnd()*6.2832, u=rnd()*2-1, s=Math.sqrt(Math.max(0,1-u*u)), sp=P*(0.30+0.55*rnd());
    emit(b.x,b.y,b.z, Math.cos(a)*s*sp, u*sp*0.8+P*0.10, Math.sin(a)*s*sp,
         0.011+0.020*rnd(), 0.6+rnd()*0.9, 0.15+0.75*rnd(), 0.35+0.5*rnd(), 1, 1);
  }
  /* the balloon's own momentum leaves a streak of spray behind it */
  for(let k=0;k<Math.floor(14*q);k++){
    const f=rnd();
    emit(b.x-b.vx*0.02*f,b.y-b.vy*0.02*f,b.z-b.vz*0.02*f, b.vx*(0.2+0.5*f),Math.abs(b.vy)*(0.15+0.3*f)+1.2,b.vz*(0.2+0.5*f),
         0.014+0.02*rnd(), 0.5+rnd()*0.7, 0.2+0.6*rnd(), 0.5, 1, 1);
  }
  for(let k=0;k<Math.floor(9*q);k++){
    const a=rnd()*6.2832, rr=b.r*1.3*Math.sqrt(rnd());
    mist(b.x+Math.cos(a)*rr,b.y+0.1,b.z+Math.sin(a)*rr, b.vx*0.25,P*0.08*rnd(),b.vz*0.25, b.r*(0.4+0.5*rnd()),0.8+rnd()*1.2);
  }
  if(typeof audioSplash==='function') audioSplash(P*1.2,b.r);
  /* popped at the surface: leave a crater, rim and foam like any splash */
  if(b.y-b.r<b.wh+0.4){
    addRipple(b.x,b.z,b.r*1.5,-Math.min(0.15,0.014*P));
    addRing(b.x,b.z,b.r*1.9,b.r*0.5,Math.min(0.10,0.010*P));
    addFoam(b.x,b.z,b.r*2.1,Math.min(0.7,P*0.09));
  }
  Hooks.run('burst',b,P);
}

/* ---- ball bursting out of the water ---- */
function breach(b,vUp){
  const r=b.r, q=budget(), n=Math.floor(Math.min(90,10+vUp*r*40)*q), y=b.wh;
  for(let i=0;i<n;i++){
    const a=rnd()*6.2832, ca=Math.cos(a), sa=Math.sin(a), f=rnd(), sp=vUp*(0.25+0.5*f);
    emit(b.x+ca*r*0.9,y+0.02,b.z+sa*r*0.9, ca*sp*0.45+b.vx*0.5,sp,sa*sp*0.45+b.vz*0.5, (0.055-0.04*f)*(0.6+r), 0.7+rnd()*0.8, clamp(1-f+0.2*rnd(),0,1), 0.3+0.5*f, 1, 0);
  }
  for(let i=0;i<Math.floor(6*q);i++){ const a=rnd()*6.2832; mist(b.x+Math.cos(a)*r,y+0.1,b.z+Math.sin(a)*r,b.vx*0.3,vUp*0.2*rnd(),b.vz*0.3,r*(0.3+0.4*rnd()),1+rnd()); }
  addRing(b.x,b.z,r*1.3,r*0.5,Math.min(0.10,0.016*vUp));
  addFoam(b.x,b.z,r*1.6,Math.min(0.6,vUp*0.15));
}

/* ---- water running off a wet ball ---- */
function drip(b,dt){
  if(rnd()>b.wet*(30+50*b.r)*dt) return;
  const a=rnd()*6.2832, u=0.15+0.8*rnd(), s=Math.sqrt(1-u*u)*b.r;
  emit(b.x+Math.cos(a)*s,b.y-u*b.r,b.z+Math.sin(a)*s, b.vx+(rnd()-0.5)*0.3,b.vy-0.2,b.vz+(rnd()-0.5)*0.3, 0.009+0.012*rnd(), 1.5, 0.05, 0.3, 1, 1);
}

/* ---- bow spray thrown ahead of a ball ploughing through the surface ---- */
function wakeSpray(b,h,rho,ux,uz,sp,dt){
  let n=sp*dt*22*budget(); n=Math.floor(n)+(rnd()<n%1?1:0);
  const dx=ux/sp, dz=uz/sp;
  for(let i=0;i<n;i++){
    const a=Math.atan2(dz,dx)+(rnd()-0.5)*2.6, ca=Math.cos(a), sa=Math.sin(a), f=rnd();
    emit(b.x+ca*rho,h+0.02,b.z+sa*rho, b.vx*0.35+ca*sp*(0.2+0.3*f),0.6+sp*(0.12+0.3*f),b.vz*0.35+sa*sp*(0.2+0.3*f),
         0.018+0.035*(1-f), 0.6+rnd()*0.6, clamp(0.9-f,0,1), 0.5+f, 1, 1);
  }
  if(rnd()<sp*dt*1.5) mist(b.x+dx*rho,h+0.1,b.z+dz*rho,b.vx*0.3,0.4+rnd()*0.6,b.vz*0.3,0.15+0.2*rnd(),0.9+rnd());
}

/* ---- 5–6: Worthington jet and bubbling foam ---- */
function runSplashEvents(dt){
  for(let i=splashEvents.length-1;i>=0;i--){
    const e=splashEvents[i];
    if(simT<e.t) continue;
    if(e.type===1){
      /* air dragged under by the ball fizzes back to the surface */
      if(simT>e.end){ splashEvents.splice(i,1); continue; }
      e.acc+=dt*(10+2*e.P);
      while(e.acc>=1){ e.acc-=1; const a=rnd()*6.2832, rr=e.r*1.5*Math.sqrt(rnd()); addFoam(e.x+Math.cos(a)*rr,e.z+Math.sin(a)*rr,0.16+0.2*rnd(),0.14); }
      continue;
    }
    if(!e.on){
      e.on=true;
      const b=e.ball, h=surfH(e.x,e.z,simT);
      /* a floating ball sitting in its own cavity blocks the jet – it only sloshes */
      const blocked=b&&!b.dead&&balls.indexOf(b)>=0&&Math.hypot(b.x-e.x,b.z-e.z)<b.r*0.85&&b.y>h-b.r*0.45;
      if(blocked){
        const n=Math.floor(Math.min(60,e.P*5)*budget());
        for(let k=0;k<n;k++){
          const a=rnd()*6.2832, ca=Math.cos(a), sa=Math.sin(a), f=rnd(), sp=e.P*(0.08+0.14*f);
          emit(b.x+ca*b.r,h+0.02,b.z+sa*b.r, ca*sp*0.8,sp*1.4,sa*sp*0.8, 0.02+0.04*(1-f), 0.6+0.6*rnd(), clamp(1-f,0,1), 0.4+0.6*f, 1, 1);
        }
        addRing(e.x,e.z,b.r*1.3,b.r*0.5,Math.min(0.08,0.008*e.P));
        addFoam(e.x,e.z,b.r*1.5,0.3);
        splashEvents.splice(i,1); continue;
      }
      e.V=Math.min(10.5,0.62*e.P)*(0.85+0.3*rnd()); e.D=0.13+0.016*e.P;
      addRipple(e.x,e.z,e.r*0.9,Math.min(0.14,0.014*e.P));
      addFoam(e.x,e.z,e.r*1.2,0.35);
      const sc=0.55+0.45*e.r/0.4;
      /* the pinched-off drop that leads the jet */
      emit(e.x,h+0.05,e.z,(rnd()-0.5)*0.3,e.V*1.12,(rnd()-0.5)*0.3,0.034*sc,2.2,0.05,0.12,1,0);
      for(let k=0;k<Math.floor(5*budget());k++) mist(e.x,h+0.1,e.z,(rnd()-0.5),e.V*0.15*rnd(),(rnd()-0.5),e.r*(0.3+0.3*rnd()),1+rnd());
    }
    const tau=(simT-e.t)/e.D;
    if(tau>=1){ splashEvents.splice(i,1); continue; }
    const h=surfH(e.x,e.z,simT), sc=0.55+0.45*e.r/0.4, w=e.r*(0.07+0.12*tau);
    e.acc+=dt*(900+90*e.P)*budget();
    while(e.acc>=1){
      e.acc-=1;
      const a=rnd()*6.2832, rr=w*Math.sqrt(rnd()), V=e.V*(1-0.72*tau)*(0.9+0.2*rnd()), sw=0.25+1.3*tau;
      emit(e.x+Math.cos(a)*rr,h+0.02,e.z+Math.sin(a)*rr, Math.cos(a)*rr*sw*4+(rnd()-0.5)*0.25,V,Math.sin(a)*rr*sw*4+(rnd()-0.5)*0.25,
           (0.020+0.040*tau)*sc*(0.7+0.6*rnd()), 1.2+0.8*rnd(), clamp(0.45+0.7*tau+0.3*(rnd()-0.5),0,1), 0.18, 1, 0);
    }
  }
}

/* ---- integration + 7: rain-back ---- */
function particlesStep(dt){
  if(dt<=0) return;
  runSplashEvents(dt);
  runCliffEvents(dt);
  const wx=windX*0.3, wz=windZ*0.3, top=wv.reduce((s,w)=>s+w.A,0)+0.75;
  let sec=90;
  for(let i=pCount-1;i>=0;i--){
    const kind=PKind[i], dr=Math.max(0,1-PDrag[i]*dt);
    PLife[i]-=dt; PVY[i]-=grav*PGrav[i]*dt;
    PVX[i]=wx+(PVX[i]-wx)*dr; PVZ[i]=wz+(PVZ[i]-wz)*dr; PVY[i]*=dr;
    PX[i]+=PVX[i]*dt;PY[i]+=PVY[i]*dt;PZ[i]+=PVZ[i]*dt;
    let dead=PLife[i]<=0;
    if(!dead&&PVY[i]<0&&PY[i]<top&&PY[i]<surfH(PX[i],PZ[i],simT)){
      dead=true;
      if(kind<1.5){
        const sz=PSize[i], v=-PVY[i], x=PX[i], z=PZ[i];
        addRipple(x,z,0.17,-Math.min(0.012,0.0015*v*sz/0.03));
        if(sz>0.016) addFoam(x,z,0.17,0.03+0.07*kind);
        if(PGen[i]===0&&sz>0.026&&v>2.4&&sec>0&&rnd()<0.6){
          const n=1+(rnd()<0.5?1:0); sec-=n;
          for(let k=0;k<n;k++){ const a=rnd()*6.2832, o=0.3+rnd()*0.9; emit(x,PY[i]+0.03,z,Math.cos(a)*o,v*(0.22+0.25*rnd()),Math.sin(a)*o,sz*(0.3+0.2*rnd()),0.5+0.4*rnd(),0.1,0.8,1,1); }
        }
      }
    }
    if(dead){
      const l=--pCount;
      if(i!==l){PX[i]=PX[l];PY[i]=PY[l];PZ[i]=PZ[l];PVX[i]=PVX[l];PVY[i]=PVY[l];PVZ[i]=PVZ[l];PLife[i]=PLife[l];PSize[i]=PSize[l];PMax[i]=PMax[l];
        PKind[i]=PKind[l];PDrag[i]=PDrag[l];PGrav[i]=PGrav[l];PGen[i]=PGen[l];PSeed[i]=PSeed[l];}
    }
  }
}

/* pack the instance buffer: mist first so the drops are composited over it */
function packParticles(){
  let o=0;
  for(let pass=0;pass<2;pass++){
    for(let i=0;i<pCount;i++){
      const kind=PKind[i], isMist=kind>1.5; if(isMist!==(pass===0)) continue;
      const age=1-PLife[i]/PMax[i]; let size=PSize[i], alpha;
      if(isMist){ size*=1+2.4*age; alpha=0.26*Math.min(1,age*9)*Math.pow(1-age,1.3); }
      else { size*=1+0.55*age*kind; alpha=Math.min(1,PLife[i]/0.3)*(1-0.55*age*kind); }
      partData[o]=PX[i];partData[o+1]=PY[i];partData[o+2]=PZ[i];
      partData[o+3]=PVX[i];partData[o+4]=PVY[i];partData[o+5]=PVZ[i];
      partData[o+6]=size;partData[o+7]=alpha;partData[o+8]=kind;partData[o+9]=PSeed[i];
      o+=PSTRIDE;
    }
  }
  return o;
}
function clearSplashes(){ pCount=0; splashEvents.length=0; cliffEvents.length=0; }
