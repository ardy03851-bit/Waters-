'use strict';
/* ============================================================
   Environment: season, time of day, weather, sky & light

   The scene sits at 45° N.  The sun follows the real path for the chosen
   season (solar declination) and hour, so summer days are long with a high
   sun, winter days short with a low one.  When the sun is down a full moon
   takes over as the light source.  Weather is described by a handful of
   physical quantities (cloud cover, precipitation, fog, wind, lightning)
   that are eased towards their targets so every change is a transition.
   ============================================================ */
const DEG=Math.PI/180, LAT=45*DEG;
const SEASONS=[
  {name:'Spring',dec:  0.0,  air:13, water:11, deep:[0.006,0.046,0.062], turq:[0.050,0.400,0.270], tint:[0.96,1.00,1.00]},
  {name:'Summer',dec: 23.44, air:24, water:20, deep:[0.004,0.042,0.088], turq:[0.030,0.400,0.360], tint:[0.92,0.98,1.06]},
  {name:'Autumn',dec:  0.0,  air:14, water:15, deep:[0.006,0.036,0.066], turq:[0.045,0.300,0.270], tint:[1.04,0.99,0.94]},
  {name:'Winter',dec:-23.44, air: 3, water: 6, deep:[0.007,0.030,0.050], turq:[0.050,0.240,0.240], tint:[1.00,1.02,1.04]}
];
/* targets, written by the UI */
const env={season:1,hour:14.5,dayCycle:0,cloud:0.4,precip:0,fog:0.04,wind:8,windFrom:117,waves:1,lightning:0,forceSnow:false};
/* eased state actually used for rendering */
const envS={cloud:0.4,precip:0,fog:0.04,wind:8,dx:Math.sin(1.1),dz:Math.cos(1.1),lightning:0,
  dec:23.44,air:24,water:20,deep:SEASONS[1].deep.slice(),turq:SEASONS[1].turq.slice(),tint:SEASONS[1].tint.slice(),snow:false,airT:24};
const sky={sun:[0,1,0],moon:[0,-1,0],light:[0,1,0],sunCol:[1,1,1],zenith:[0,0,0],horizon:[0,0,0],glow:[0,0,0],fogCol:[0,0,0],
  sunDisc:[0,0,0],moonDisc:[0,0,0],ambLum:1,sunLum:3,cloudLo:0.6,storm:0,fogD:0.0002,night:0,exp:0.88,rough:0.4,rain:0,
  cloudOff:[0,0],bolt:[0,0,0,0.6],elev:1};
let sea=0.38, seaT=0.38;
const bolt={t:9,az:0,seed:0,top:0.6};
let onLightning=null;   /* hook for the audio module */

function sunElevation(hour,decDeg){
  const d=decDeg*DEG, H=(hour-12)*15*DEG;
  return Math.asin(clamp(Math.sin(LAT)*Math.sin(d)+Math.cos(LAT)*Math.cos(d)*Math.cos(H),-1,1));
}
/* sunrise / sunset in hours for a season */
function sunTimes(season){
  const d=SEASONS[season].dec*DEG, c=clamp(-Math.tan(LAT)*Math.tan(d),-1,1), H0=Math.acos(c)/DEG/15;
  return {rise:12-H0,set:12+H0};
}
function airTemperature(){
  let t=envS.air+4.5*Math.cos((env.hour-15)/24*2*Math.PI)*(1-0.6*envS.cloud)-2.5*envS.precip-0.06*Math.max(0,envS.wind-6);
  if(env.forceSnow) t=Math.min(t,-1);
  return t;
}
function strikeLightning(){
  bolt.t=0; bolt.az=Math.random()*Math.PI*2; bolt.seed=Math.random(); bolt.top=0.45+Math.random()*0.3;
  if(onLightning) onLightning();
}

function updateEnv(dt,sdt){
  const k=1-Math.exp(-dt*1.5), S=SEASONS[env.season];
  envS.cloud+=(env.cloud-envS.cloud)*k; envS.precip+=(env.precip-envS.precip)*k; envS.fog+=(env.fog-envS.fog)*k;
  envS.wind+=(env.wind-envS.wind)*k; envS.lightning+=(env.lightning-envS.lightning)*k;
  envS.dec+=(S.dec-envS.dec)*k; envS.air+=(S.air-envS.air)*k; envS.water+=(S.water-envS.water)*k;
  for(let i=0;i<3;i++){ envS.deep[i]+=(S.deep[i]-envS.deep[i])*k; envS.turq[i]+=(S.turq[i]-envS.turq[i])*k; envS.tint[i]+=(S.tint[i]-envS.tint[i])*k; }
  /* wind: meteorological "from" bearing -> direction of travel in world space (south = -z, west = +x) */
  const th=(180-env.windFrom)*DEG, tx=Math.sin(th), tz=Math.cos(th), kd=1-Math.exp(-dt*0.9);
  envS.dx+=(tx-envS.dx)*kd; envS.dz+=(tz-envS.dz)*kd;
  if(Math.hypot(envS.dx,envS.dz)<0.05){ envS.dx+=tz*0.06; envS.dz-=tx*0.06; }   /* turning through 180°: don't stall at zero */
  windAng=Math.atan2(envS.dx,envS.dz);
  windX=Math.sin(windAng)*envS.wind*0.75; windZ=Math.cos(windAng)*envS.wind*0.75;
  seaT=clamp(Math.pow(envS.wind/24,0.85)*env.waves,0,1);
  sea+=(seaT-sea)*Math.min(1,dt*1.6);

  if(env.dayCycle>0&&sdt>0){ env.hour=(env.hour+sdt*24/env.dayCycle)%24; }
  envS.airT=airTemperature();
  envS.snow=env.forceSnow||(envS.airT<=0.5);

  const cs=0.0008+0.00036*envS.wind;
  sky.cloudOff[0]=(sky.cloudOff[0]-Math.sin(windAng)*cs*sdt+10)%10;
  sky.cloudOff[1]=(sky.cloudOff[1]-Math.cos(windAng)*cs*sdt+10)%10;

  /* lightning */
  bolt.t+=dt;
  if(envS.lightning>0.05&&bolt.t>1.2&&Math.random()<envS.lightning*0.17*dt) strikeLightning();
  const ft=bolt.t, flash=ft<1.0?Math.exp(-ft*6.5)*(0.55+0.45*(Math.sin(ft*58)>0?1:-0.4)):0;
  sky.bolt[0]=bolt.az; sky.bolt[1]=bolt.seed; sky.bolt[2]=ft<0.28?Math.max(0,flash):0; sky.bolt[3]=bolt.top;

  /* sun & moon */
  const d=envS.dec*DEG, H=(env.hour-12)*15*DEG;
  const el=sunElevation(env.hour,envS.dec), ce=Math.cos(el);
  const az=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(LAT)-Math.tan(d)*Math.cos(LAT));   /* from south, west positive */
  sky.elev=el;
  sky.sun=[Math.sin(az)*ce,Math.sin(el),-Math.cos(az)*ce];
  { const mx=-sky.sun[0], my=-sky.sun[1]*0.8+0.18, mz=-sky.sun[2], l=Math.hypot(mx,my,mz); sky.moon=[mx/l,my/l,mz/l]; }

  const day=sstep(0.02,0.6,el), tw=sstep(-0.24,0.03,el);
  const ov=sstep(0.45,0.95,envS.cloud);            /* how overcast it is */
  const dark=ov*(0.6+0.4*envS.precip);              /* how dark the cloud deck is */
  const direct=1-0.96*ov;                           /* direct sun / moon light getting through */
  let z=lerp3([0.05,0.08,0.26],[0.09,0.24,0.62],day);
  const lowSun=lerp3([0.26,0.20,0.34],[0.85,0.38,0.20],sstep(-0.13,0.03,el));
  let h=lerp3(lowSun,[0.62,0.77,0.92],Math.pow(day,0.7));
  z=z.map((v,i)=>v*envS.tint[i]);
  z=lerp3([0.006,0.010,0.028],z,tw); h=lerp3([0.016,0.024,0.050],h,tw);
  const gl_=lerp(0.07,1,tw), pd=1-0.45*envS.precip*ov,
        gz=[0.12,0.14,0.17].map(v=>v*(0.4+day)*gl_*pd), gh=[0.33,0.36,0.40].map(v=>v*(0.5+0.5*day)*gl_*pd);
  z=lerp3(z,gz,dark*0.85).map(v=>v*(1-0.35*dark));
  h=lerp3(h,gh,dark*0.75);
  const gk=(1-day*0.8)*0.9*sstep(-0.32,-0.02,el)*(1-0.9*ov);
  sky.glow=[1.0*gk,0.5*gk,0.22*gk];

  const sunC=lerp3([1,0.42,0.16],[1,0.94,0.84],sstep(0.05,0.5,el));
  const sunRaw=2.9*(0.4+0.6*sstep(0,0.3,el))*sstep(-0.035,0.03,el);
  const sunI=sunRaw*direct;
  const moonUp=sstep(-0.06,-0.2,el)*sstep(0,0.12,sky.moon[1]);
  const moonI=0.17*moonUp*direct;
  if(sunI>=moonI){ sky.light=sky.sun; sky.sunCol=sunC.map(v=>v*sunI); sky.sunLum=sunI; }
  else { sky.light=sky.moon; sky.sunCol=[0.62*moonI,0.74*moonI,1.0*moonI]; sky.sunLum=moonI; }
  sky.sunDisc=sunC.map(v=>v*sunRaw*(1-ov));
  sky.moonDisc=[0.90,0.95,1.0].map(v=>v*1.5*moonUp*(1-ov));
  sky.ambLum=(lerp(0.035,0.3,tw)+0.7*day)*(1-0.42*ov-0.25*dark*envS.precip)+0.02*moonUp*(1-ov);
  sky.night=sstep(-0.08,-0.3,el)*(1-sstep(0.3,0.9,envS.cloud));
  sky.exp=lerp(1.9,0.88,sstep(-0.3,0.08,el));

  /* lightning lights up the whole sky for an instant */
  if(flash>0.001){
    const f=flash/sky.exp*0.88;
    sky.ambLum+=1.5*f; z=[z[0]+0.20*f,z[1]+0.22*f,z[2]+0.30*f]; h=[h[0]+0.30*f,h[1]+0.32*f,h[2]+0.42*f];
  }
  sky.zenith=z; sky.horizon=h;

  /* fog: 0 = 20 km visibility … 1 = 40 m */
  const fogE=clamp(envS.fog+0.28*envS.precip,0,1), vis=20000*Math.pow(40/20000,fogE);
  sky.fogD=3/vis;
  const ga=Math.min(1,sky.ambLum);
  sky.fogCol=lerp3(h,[0.70*ga,0.73*ga,0.76*ga],0.8*fogE);
  sky.cloudLo=lerp(0.86,0.22,envS.cloud); sky.storm=dark;
  sky.rough=clamp(sea+0.3*envS.precip,0,1);
  sky.rain=envS.snow?0:envS.precip;
}

function setSky(p){
  gl.uniform1f(L(p,'uTime'),simT); gl.uniform1f(L(p,'uStorm'),sky.storm);
  gl.uniform1f(L(p,'uAmbLum'),sky.ambLum); gl.uniform1f(L(p,'uSunLum'),sky.sunLum);
  gl.uniform1f(L(p,'uCloudLo'),sky.cloudLo); gl.uniform1f(L(p,'uExp'),sky.exp);
  gl.uniform1f(L(p,'uFogD'),sky.fogD); gl.uniform1f(L(p,'uNight'),sky.night);
  gl.uniform1f(L(p,'uRough'),sky.rough); gl.uniform1f(L(p,'uRain'),sky.rain);
  gl.uniform3fv(L(p,'uSun'),sky.sun); gl.uniform3fv(L(p,'uMoon'),sky.moon); gl.uniform3fv(L(p,'uLight'),sky.light);
  gl.uniform3fv(L(p,'uSunCol'),sky.sunCol);
  gl.uniform3fv(L(p,'uZenith'),sky.zenith); gl.uniform3fv(L(p,'uHorizon'),sky.horizon); gl.uniform3fv(L(p,'uGlow'),sky.glow);
  gl.uniform3fv(L(p,'uFogCol'),sky.fogCol); gl.uniform3fv(L(p,'uSunDisc'),sky.sunDisc); gl.uniform3fv(L(p,'uMoonDisc'),sky.moonDisc);
  gl.uniform3fv(L(p,'uDeep'),envS.deep); gl.uniform3fv(L(p,'uTurq'),envS.turq);
  gl.uniform2fv(L(p,'uCloudOff'),sky.cloudOff); gl.uniform4fv(L(p,'uBolt'),sky.bolt);
}

/* ---- human-readable conditions for the UI ---- */
const BEAUFORT=[[0.5,'Calm'],[1.6,'Light air'],[3.4,'Light breeze'],[5.5,'Gentle breeze'],[8,'Moderate breeze'],[10.8,'Fresh breeze'],
  [13.9,'Strong breeze'],[17.2,'Near gale'],[20.8,'Gale'],[24.5,'Strong gale'],[28.5,'Storm'],[1e9,'Violent storm']];
function beaufort(ms){ for(let i=0;i<BEAUFORT.length;i++) if(ms<BEAUFORT[i][0]) return {n:i,name:BEAUFORT[i][1]}; return {n:12,name:'Hurricane'}; }
const COMPASS=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function compass(deg){ return COMPASS[Math.round(((deg%360)+360)%360/22.5)%16]; }
function fmtHour(h){ h=((h%24)+24)%24; let m=Math.round(h*60)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function skyDescription(){
  const c=envS.cloud, p=envS.precip, night=sky.elev<-0.1;
  if(envS.lightning>0.4&&p>0.4) return 'Thunderstorm';
  if(p>0.08) return envS.snow?(p>0.6?'Heavy snow':'Snow'):(p>0.7?'Heavy rain':p>0.3?'Rain':'Drizzle');
  if(envS.fog>0.55) return 'Fog';
  if(c>0.8) return 'Overcast';
  if(c>0.3) return night?'Partly cloudy night':'Partly cloudy';
  return night?'Clear night':'Clear';
}
/* icon id for the conditions pill */
function skyIcon(){
  const p=envS.precip;
  if(envS.lightning>0.4&&p>0.4) return 'storm';
  if(p>0.08) return envS.snow?'snow':'rain';
  if(envS.fog>0.55) return 'fog';
  if(envS.cloud>0.8) return 'cloud';
  if(sky.elev<-0.1) return 'moon';
  return envS.cloud>0.3?'partly':'sun';
}
