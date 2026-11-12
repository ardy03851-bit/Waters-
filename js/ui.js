'use strict';
/* ============================================================
   UI – liquid-glass controls, settings panel, persistence
   ============================================================ */
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function replay(el,cls){ el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function el(tag,cls,html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!==undefined) e.innerHTML=html; return e; }

/* ---- toasts ---- */
function toast(msg){
  const box=$('toasts'), t=el('div','toast glass','<span class="dot"></span>');
  t.appendChild(document.createTextNode(msg));
  box.appendChild(t);
  while(box.children.length>2) box.firstChild.remove();
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),450); },1900);
}

/* ============================================================
   Settings model
   ============================================================ */
const STORE_KEY='aqua.settings.v2';
const DEFAULTS={
  type:0, size:1, maxBalls:40, launch:'drop', throwSpeed:14, islands:false, ship:false, boats:false, shipClass:0, islandSeed:0,
  islandStyle:'wild', islandBiome:'mixed', islandCount:5, islandRelief:1, islandCoast:1, islandBeach:1, islandFeatures:1,
  islandTrees:1, islandTreeScale:1, islandGrass:1, islandRocks:1, islandFlowers:1, islandLandmarks:1, islandCascades:1,
  islandBirds:true, islandWind:1, islandSurf:1,
  season:1, weather:'partly', hour:14.5, dayCycle:0, cloud:0.4, precip:0, fog:0.04, lightning:0, wind:8, windFrom:117, waves:1,
  gravity:9.81, speed:1, bounce:1, water:1,
  quakeStrength:1, quakeMotion:reduceMotion?0:1, quakeAuto:false, quakeInterval:90,
  fov:50, orbit:false, follow:false, swimSpeed:1, lookSensitivity:1,
  quality:'auto', hq:false, splash:1, motionBlur:!reduceMotion, blur:1, lensFx:true,
  bloom:true, fxaa:true, stats:true, sound:false, volume:0.7
};
/* weather = a consistent set of physical quantities */
const WEATHERS={
  clear:   {label:'Clear',        cloud:0.08,precip:0,   fog:0.03,lightning:0,wind:4},
  partly:  {label:'Partly cloudy',short:'Partly',cloud:0.40,precip:0,   fog:0.04,lightning:0,wind:8},
  overcast:{label:'Overcast',     cloud:0.92,precip:0,   fog:0.10,lightning:0,wind:9},
  drizzle: {label:'Drizzle',      cloud:0.95,precip:0.22,fog:0.20,lightning:0,wind:7},
  rain:    {label:'Rain',         cloud:1.00,precip:0.60,fog:0.24,lightning:0,wind:12},
  storm:   {label:'Thunderstorm',short:'Storm', cloud:1.00,precip:1.00,fog:0.26,lightning:1,wind:22},
  fog:     {label:'Fog',          cloud:0.75,precip:0,   fog:0.85,lightning:0,wind:2},
  snow:    {label:'Snow',         cloud:0.95,precip:0.55,fog:0.30,lightning:0,wind:5,snow:true}
};
const WEATHER_KEYS=['cloud','precip','fog','lightning'];
/* one-tap scenes */
const SCENES=[
  {name:'Summer noon',   grad:'linear-gradient(160deg,#4aa8ff,#bfe9ff 55%,#1a6fb0)', set:{season:1,weather:'clear',hour:12.5,dayCycle:0}},
  {name:'Golden sunset', grad:'linear-gradient(160deg,#3b4a8a,#ff9d5c 55%,#7a3b2e)', set:{season:2,weather:'partly',hour:'sunset',dayCycle:0}},
  {name:'Foggy dawn',    grad:'linear-gradient(160deg,#9aa7b5,#d9cfc4 55%,#6f8191)', set:{season:0,weather:'fog',hour:'sunrise',dayCycle:0}},
  {name:'Thunderstorm',  grad:'linear-gradient(160deg,#20262f,#4d5866 55%,#11202b)', set:{season:1,weather:'storm',hour:17,dayCycle:0}},
  {name:'Winter snow',   grad:'linear-gradient(160deg,#aebccb,#eef3f8 55%,#5f7386)', set:{season:3,weather:'snow',hour:11,dayCycle:0}},
  {name:'Starry night',  grad:'linear-gradient(160deg,#050a1e,#16224d 55%,#04101c)', set:{season:1,weather:'clear',hour:0.5,dayCycle:0}},
  {name:'Rainbow shower',grad:'linear-gradient(160deg,#5b7fb5,#c9d6e4 55%,#e0a86b)', set:{season:1,weather:'partly',hour:5.2,dayCycle:0,cloud:0.34,precip:0.55,fog:0.08}},
  {name:'Blue-water voyage',grad:'linear-gradient(160deg,#64b9da,#b5e4e4 50%,#134b75)',set:{season:1,weather:'clear',hour:10.5,dayCycle:0,ship:true,shipClass:5}},
  {name:'Storm voyage',grad:'linear-gradient(160deg,#1c3449,#78878a 55%,#102937)',set:{season:2,weather:'storm',hour:16.5,dayCycle:0,ship:true,shipClass:4}}
];
const pct=v=>Math.round(v*100)+'%';
function fogLabel(v){ const m=20000*Math.pow(40/20000,clamp(v,0,1)); return m>=1000?(m/1000).toFixed(m>=10000?0:1)+' km':Math.round(m/5)*5+' m'; }
function precipLabel(v){ return v<0.03?'Dry':v<0.3?'Light':v<0.65?'Moderate':v<0.9?'Heavy':'Downpour'; }
function dayPhase(h){
  const e=sunElevation(h,SEASONS[S.season].dec);
  if(e<-0.21) return 'Night';
  if(e<-0.01) return h<12?'Dawn':'Dusk';
  if(e<0.17)  return h<12?'Sunrise':'Golden hour';
  if(Math.abs(h-12)<1.5) return 'Midday';
  return h<12?'Morning':'Afternoon';
}
/* every control in the app is described here; the DOM is generated from it */
const CONTROLS=[
  {tab:'scene',t:'scenes'},
  {tab:'scene',t:'toggle',k:'islands',label:'Island archipelago',sub:'Rocky cliffs, beaches and coastal forests'},
  {tab:'scene',t:'buttons',items:[['New islands',()=>newIslands()],['Storm coast',()=>islandStorm()]]},
  {tab:'scene',t:'toggle',k:'ship',label:'Sailing ship',sub:'A detailed ship to sail or explore'},
  {tab:'scene',t:'toggle',k:'boats',label:'Harbour traffic',sub:'Modern motor boats, a tug, a coaster and buoys around the bay'},
  {tab:'scene',t:'seg',k:'shipClass',label:'Ship',cols:4,opts:SHIP_CLASSES.map((c,i)=>[i,c.short])},
  {tab:'scene',t:'note',id:'shipNote',text:'Each class re-proportions the same CC0 hull and rig, with its own timber, canvas and handling. Hull, deck and ball contacts stay exact for every class.'},
  {tab:'scene',t:'buttons',items:[['Take the helm',()=>enterSailing()],['Swim & explore',()=>enterExplore()],['Seaquake',()=>triggerSeaQuake()],['Island quake',()=>triggerIslandQuake()]]},
  {tab:'scene',t:'note',text:'Board the open main deck from alongside or go straight to the helm. The model has no explorable enclosed cabins. Quake controls are in Physics; coast controls are in Islands.'},
  {tab:'scene',t:'seg',k:'launch',label:'Tapping the sea',opts:[['drop','Drops a ball'],['throw','Throws a ball']]},
  {tab:'scene',t:'range',k:'throwSpeed',label:'Throw speed',min:4,max:32,step:1,fmt:v=>v+' m/s'},
  {tab:'scene',t:'range',k:'size',label:'Ball size',min:0.5,max:2.2,step:0.01,fmt:v=>v.toFixed(1)+'×',dock:true},
  {tab:'scene',t:'range',k:'maxBalls',label:'Ball limit',min:5,max:80,step:1,fmt:v=>String(v)},

  {tab:'islands',t:'toggle',k:'islands',label:'Island archipelago',sub:'Generate a coast to explore'},
  {tab:'islands',t:'buttons',items:[['New islands',()=>newIslands()],['Storm coast',()=>islandStorm()]]},
  {tab:'islands',t:'seg',k:'islandBiome',label:'Biome',cols:4,opts:[['temperate','Temperate'],['tropical','Tropical'],['volcanic','Volcanic'],['alpine','Alpine'],['desert','Desert'],['moss','Mossland'],['mixed','Mixed']]},
  {tab:'islands',t:'seg',k:'islandStyle',label:'Coast type',opts:[['wild','Wild'],['coves','Coves'],['highlands','Highlands']]},
  {tab:'islands',t:'seg',k:'islandCount',label:'Island count',opts:[[3,'3'],[4,'4'],[5,'5']]},
  {tab:'islands',t:'range',k:'islandRelief',label:'Mountain height',min:0.6,max:1.45,step:0.05,fmt:v=>v.toFixed(2)+'×'},
  {tab:'islands',t:'range',k:'islandCoast',label:'Coastline detail',min:0.5,max:1.2,step:0.05,fmt:v=>v.toFixed(2)+'×'},
  {tab:'islands',t:'range',k:'islandBeach',label:'Coves and beaches',min:0.5,max:1.5,step:0.05,fmt:v=>v.toFixed(2)+'×'},
  {tab:'islands',t:'range',k:'islandFeatures',label:'Landform detail',min:0,max:1.5,step:0.05,fmt:pct},
  {tab:'islands',t:'range',k:'islandTrees',label:'Trees and tall plants',min:0,max:1.7,step:0.05,fmt:pct},
  {tab:'islands',t:'range',k:'islandTreeScale',label:'Tree height',min:0.7,max:1.4,step:0.05,fmt:v=>v.toFixed(2)+'×'},
  {tab:'islands',t:'range',k:'islandGrass',label:'Coastal grasses',min:0,max:1.5,step:0.05,fmt:pct},
  {tab:'islands',t:'range',k:'islandRocks',label:'Boulders',min:0,max:1.5,step:0.05,fmt:pct},
  {tab:'islands',t:'range',k:'islandFlowers',label:'Ferns and wildflowers',min:0,max:1.5,step:0.05,fmt:pct},
  {tab:'islands',t:'range',k:'islandLandmarks',label:'Rock formations',min:0,max:1.5,step:0.05,fmt:pct},
  {tab:'islands',t:'range',k:'islandCascades',label:'Cascades',min:0,max:1.5,step:0.05,fmt:pct},
  {tab:'islands',t:'toggle',k:'islandBirds',label:'Seabirds',sub:'Flocks shelter during storms and at night'},
  {tab:'islands',t:'range',k:'islandWind',label:'Vegetation wind response',min:0,max:1.5,step:0.05,fmt:pct},
  {tab:'islands',t:'range',k:'islandSurf',label:'Cliff surf',min:0,max:1.5,step:0.05,fmt:pct},
  {tab:'islands',t:'note',text:'The coast and its wildlife are seeded. Terrain controls rebuild the coast; planting controls update its details. New islands choose a new seed.'},

  {tab:'sky',t:'info'},
  {tab:'sky',t:'seg',k:'season',label:'Season',opts:[[0,'Spring'],[1,'Summer'],[2,'Autumn'],[3,'Winter']]},
  {tab:'sky',t:'seg',k:'weather',label:'Weather',cols:4,opts:Object.keys(WEATHERS).map(k=>[k,WEATHERS[k].short||WEATHERS[k].label])},
  {tab:'sky',t:'range',k:'hour',label:'Time of day',min:0,max:23.95,step:0.05,fmt:v=>fmtHour(v)+' · '+dayPhase(v),dock:true},
  {tab:'sky',t:'seg',k:'dayCycle',label:'Day–night cycle',opts:[[0,'Off'],[600,'10 min'],[120,'2 min'],[30,'30 s']]},
  {tab:'sky',t:'range',k:'cloud',label:'Cloud cover',min:0,max:1,step:0.01,fmt:pct},
  {tab:'sky',t:'range',k:'precip',label:'Precipitation',min:0,max:1,step:0.01,fmt:precipLabel},
  {tab:'sky',t:'range',k:'fog',label:'Visibility',min:0,max:1,step:0.01,fmt:fogLabel},
  {tab:'sky',t:'range',k:'lightning',label:'Lightning',min:0,max:1,step:0.01,fmt:v=>v<0.03?'None':v<0.4?'Occasional':v<0.8?'Frequent':'Intense'},
  {tab:'sky',t:'range',k:'wind',label:'Wind',min:0,max:28,step:0.5,fmt:v=>Math.round(v*1.944)+' kn · '+beaufort(v).name,dockFmt:v=>Math.round(v*1.944)+' kn · F'+beaufort(v).n,dock:true},
  {tab:'sky',t:'range',k:'windFrom',label:'Wind direction',min:0,max:359,step:1,fmt:v=>'from '+compass(v)+' · '+Math.round(v)+'°'},
  {tab:'sky',t:'range',k:'waves',label:'Swell',min:0.3,max:1.8,step:0.05,fmt:v=>v.toFixed(2)+'×'},

  {tab:'physics',t:'seg',k:'gravity',label:'Gravity',opts:[[1.62,'Moon'],[3.71,'Mars'],[9.81,'Earth'],[24.79,'Jupiter']]},
  {tab:'physics',t:'range',k:'speed',label:'Simulation speed',min:0.1,max:2,step:0.05,fmt:v=>v.toFixed(2)+'×'},
  {tab:'physics',t:'range',k:'bounce',label:'Bounciness',min:0.3,max:1.3,step:0.05,fmt:v=>v.toFixed(2)+'×'},
  {tab:'physics',t:'seg',k:'water',label:'Water',opts:[[0.975,'Fresh'],[1,'Sea'],[1.21,'Dead Sea']]},
  {tab:'physics',t:'note',text:'Gravity changes how balls and spray fall. Denser water makes everything float higher.'},
  {tab:'physics',t:'buttons',items:[['Seaquake',()=>triggerSeaQuake()],['Island quake',()=>triggerIslandQuake()]]},
  {tab:'physics',t:'range',k:'quakeStrength',label:'Quake strength',min:0.3,max:1.5,step:0.05,fmt:v=>v.toFixed(2)+'×'},
  {tab:'physics',t:'range',k:'quakeMotion',label:'Quake camera movement',min:0,max:1,step:0.05,fmt:pct},
  {tab:'physics',t:'toggle',k:'quakeAuto',label:'Occasional quakes',sub:'Seaquakes and, when islands are present, island quakes'},
  {tab:'physics',t:'seg',k:'quakeInterval',label:'Average interval',opts:[[40,'40 sec'],[90,'90 sec'],[180,'3 min']]},
  {tab:'physics',t:'note',text:'Quakes are temporary effects: they do not permanently deform terrain or destroy the ship.'},

  {tab:'camera',t:'range',k:'fov',label:'Field of view',min:30,max:95,step:1,fmt:v=>v+'°'},
  {tab:'camera',t:'toggle',k:'orbit',label:'Auto-orbit',sub:'Slowly circle the scene'},
  {tab:'camera',t:'toggle',k:'follow',label:'Follow ball',sub:'Keep the newest ball in the centre'},
  {tab:'camera',t:'range',k:'swimSpeed',label:'Exploration speed',min:0.6,max:1.5,step:0.05,fmt:v=>v.toFixed(2)+'×'},
  {tab:'camera',t:'range',k:'lookSensitivity',label:'Exploration look sensitivity',min:0.4,max:1.8,step:0.05,fmt:v=>v.toFixed(2)+'×'},
  {tab:'camera',t:'buttons',items:[['Reset view',()=>{resetCamera();toast('View reset');}],['Frame ship',()=>focusScene('ship')],['Frame islands',()=>focusScene('islands')]]},

  ...(safeGraphics?[{tab:'system',t:'note',text:'Low-memory mode is active for this visit. Resolution and enhanced graphics are limited; your saved preferences are retained.'}]:[]),
  {tab:'system',t:'seg',k:'quality',label:'Render quality',cols:5,opts:[['auto','Auto'],['low','Low'],['medium','Med'],['high','High'],['ultra','Ultra']]},
  {tab:'system',t:'toggle',k:'hq',label:'Improved graphics mode',sub:'Full-resolution reflections, denser spray and rain, finer water detail'},
  {tab:'system',t:'range',k:'splash',label:'Splash detail',min:0.3,max:1.5,step:0.05,fmt:pct},
  {tab:'system',t:'toggle',k:'motionBlur',label:'Motion blur',sub:'Depth-aware camera and object motion'},
  {tab:'system',t:'range',k:'blur',label:'Blur strength',min:0.2,max:2,step:0.05,fmt:v=>v.toFixed(2)+'×'},
  {tab:'system',t:'toggle',k:'lensFx',label:'Lens effects',sub:'Chromatic aberration and vignette'},
  {tab:'system',t:'toggle',k:'bloom',label:'Bloom',sub:'Sun glints, lightning and glowing mushrooms bleed light'},
  {tab:'system',t:'toggle',k:'fxaa',label:'Edge smoothing',sub:'FXAA for rigging, rails and distant coastlines'},
  {tab:'system',t:'toggle',k:'stats',label:'Performance stats',sub:'Frame rate, balls, resolution'},
  {tab:'system',t:'toggle',k:'sound',label:'Sound',sub:'Sea, wind, rain, thunder and splashes'},
  {tab:'system',t:'range',k:'volume',label:'Volume',min:0,max:1,step:0.01,fmt:pct},
  {tab:'system',t:'buttons',items:[['Cinema mode',()=>setCinema(true)],['Record video',()=>toggleRecord(),'recBtn'],['Pause',()=>togglePause(),'pauseBtn'],['Screenshot',()=>takeShot()],['Fullscreen',()=>toggleFullscreen()],['Reset all',()=>resetAll()]]},
  {tab:'system',t:'note',text:'Shortcuts: Space drop · B sail · N harbour traffic · I islands · U explore · Q seaquake · J island quake · R ball rain · S slow-mo · C clear · G settings · H hide dock · V cinema · O orbit · P pause · M sound · F fullscreen · K screenshot · 1–8 ball type'}
];
const TABS=[['scene','Scene'],['islands','Islands'],['sky','Weather'],['physics','Physics'],['camera','Camera'],['system','System']];
const CTL={}; CONTROLS.forEach(c=>{ if(c.k) CTL[c.k]=c; });

function validValue(k,v){
  const d=DEFAULTS[k], c=CTL[k];
  if(typeof v!==typeof d) return false;
  if(typeof v==='number'&&!isFinite(v)) return false;
  if(k==='type') return Number.isInteger(v)&&v>=0&&v<TYPES.length;
  if(k==='islandSeed') return Number.isInteger(v)&&v>=0&&v<=0xffffffff;
  if(!c) return false;
  if(c.t==='range') return v>=c.min&&v<=c.max;
  if(c.t==='seg') return c.opts.some(o=>o[0]===v)||(k==='weather'&&v==='custom');
  return c.t==='toggle';
}
function loadSettings(){
  const s=Object.assign({},DEFAULTS);
  try{
    const raw=JSON.parse(localStorage.getItem(STORE_KEY)||'null');
    if(raw&&typeof raw==='object'){
      /* Pre-biome saves represented temperate coasts. New installs start in
         Mixed, while existing players keep their familiar saved ecology. */
      if(!Object.prototype.hasOwnProperty.call(raw,'islandBiome')) s.islandBiome='temperate';
      for(const k in DEFAULTS) if(k in raw&&validValue(k,raw[k])) s[k]=raw[k];
    }
  }catch(e){}
  return s;
}
const S=loadSettings();
let saveTimer=0, islandBuildTimer=0, islandRebuildMask=0, settingsBooting=true;
function currentIslandOptions(){
  return {style:S.islandStyle,biome:S.islandBiome,count:S.islandCount,relief:S.islandRelief,coast:S.islandCoast,beach:S.islandBeach,features:S.islandFeatures,
    trees:S.islandTrees,treeScale:S.islandTreeScale,grass:S.islandGrass,rocks:S.islandRocks,
    flowers:S.islandFlowers,landmarks:S.islandLandmarks,cascades:S.islandCascades,
    birds:S.islandBirds,wind:S.islandWind,surf:S.islandSurf};
}
/* Slider drags are coalesced; planting-only changes do not rebuild the
   heightfield, clear surf or disturb the camera and balls. */
function cancelIslandRebuild(){ clearTimeout(islandBuildTimer); islandBuildTimer=0; islandRebuildMask=0; }
function queueIslandRebuild(mask){
  if(settingsBooting||!S.islands) return;
  islandRebuildMask|=mask; clearTimeout(islandBuildTimer);
  islandBuildTimer=setTimeout(()=>{
    const pending=islandRebuildMask; islandBuildTimer=0; islandRebuildMask=0;
    if(!S.islands) return;
    const options=islandConfig(currentIslandOptions());
    if(pending&1) generateIslands(S.islandSeed,options);
    else {
      islands.options=options;
      if(pending&2) rebuildIslandTrees(options,true);
      if(pending&4) rebuildIslandDetails(options,true);
      if(pending&(2|8)) rebuildIslandScenery(options);
    }
  },220);
}
function saveSoon(){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>{ try{ localStorage.setItem(STORE_KEY,JSON.stringify(S)); }catch(e){} },400); }

/* ---- push a setting into the engine ---- */
let slowMo=false;
function applySpeed(){
  timeScale=slowMo?Math.min(0.2,S.speed):S.speed;
  shutter=timeScale<0.5?0.006:0.02;                 /* high-speed camera: crisp drops */
  $('slowVal').textContent=timeScale.toFixed(timeScale<0.2?2:1)+'×';
}
function apply(k){
  const v=S[k];
  switch(k){
    case 'type': selType=v; break;
    case 'size': sizeMul=v; break;
    case 'maxBalls': MAXBALLS=v; while(balls.length>MAXBALLS){ const o=balls.shift(); if(grab&&grab.ball===o) grab=null; } break;
    case 'launch': launchMode=v; break;
    case 'throwSpeed': throwSpeed=v; break;
    case 'ship': setShipEnabled(v); resetCamera(v?'ship':'islands'); break;
    case 'boats': setBoatsEnabled(v); break;
    case 'shipClass': setShipClass(v); break;
    case 'islands':
      cancelIslandRebuild();
      if(v) generateIslands(S.islandSeed,currentIslandOptions()); else {
        if(islands.active) for(const b of balls) if(Math.hypot(b.x,b.z)>28) b.islandRecovery=true;
        removeIslands(); cliffEvents.length=0;
      }
      resetCamera(v?'islands':'ship'); break;
    case 'islandBiome': case 'islandStyle': case 'islandCount': case 'islandRelief': case 'islandCoast': case 'islandBeach': case 'islandFeatures': queueIslandRebuild(1); break;
    case 'islandTrees': case 'islandTreeScale': queueIslandRebuild(2); break;
    case 'islandGrass': case 'islandRocks': queueIslandRebuild(4); break;
    case 'islandFlowers': case 'islandLandmarks': case 'islandCascades': queueIslandRebuild(8); break;
    case 'islandBirds': if(islands.active) islands.options.birds=v; break;
    case 'islandWind': if(islands.active) islands.options.wind=v; break;
    case 'islandSurf': if(islands.active) islands.options.surf=v; break;
    case 'season': env.season=v; break;
    case 'weather': env.forceSnow=!!(WEATHERS[v]&&WEATHERS[v].snow); break;
    case 'hour': env.hour=v; break;
    case 'dayCycle': env.dayCycle=v; break;
    case 'cloud': case 'precip': case 'fog': case 'lightning': case 'wind': case 'windFrom': case 'waves': env[k]=v; break;
    case 'gravity': grav=v; break;
    case 'speed': applySpeed(); break;
    case 'bounce': bounceMul=v; break;
    case 'water': waterRho=v; break;
    case 'quakeStrength': quake.strength=v; break;
    case 'quakeMotion': quake.motion=v; break;
    case 'quakeAuto': quake.automatic=v; quake.next=quake.interval; break;
    case 'quakeInterval': quake.interval=v; quake.next=v; break;
    case 'swimSpeed': explore.speed=v; break;
    case 'lookSensitivity': explore.sensitivity=v; break;
    case 'fov': fovDeg=v; break;
    case 'orbit': autoOrbit=v; break;
    case 'follow': followBall=v; break;
    case 'quality': setQuality(v); break;
    case 'hq':
      hqMode=v&&!safeGraphics;
      if(rendererStarted) resize(true);
      if(v&&safeGraphics&&!settingsBooting) toast('Enhanced graphics are limited in low-memory mode');
      havePrev=false; break;
    case 'splash': splashAmt=v; break;
    case 'motionBlur': motionBlurOn=v; break;
    case 'blur': blurStrength=v; break;
    case 'lensFx': lensFxOn=v; break;
    case 'bloom': bloomOn=!!v&&!safeGraphics; break;
    case 'fxaa': fxaaOn=!!v; break;
    case 'stats': $('stats').classList.toggle('off',!v); break;
    case 'sound': if(!audioSet(v,S.volume)&&v){ S.sound=false; toast('Sound is not available in this browser'); } break;
    case 'volume': audioSet(undefined,v); break;
  }
}
const binders={};                       /* key -> [fn(value)] that refresh the widgets */
function refresh(k){ (binders[k]||[]).forEach(f=>f(S[k])); }
function setVal(k,v){ if(S[k]===v) return; S[k]=v; apply(k); refresh(k); saveSoon(); }

/* choosing a weather type sets all of its ingredients */
function setWeather(id,quiet){
  const W=WEATHERS[id]; if(!W) return;
  if(W.snow&&S.season!==3){ setVal('season',3); if(!quiet) toast('Snow needs freezing air – season set to winter'); }
  S.weather=id; apply('weather'); refresh('weather');
  ['cloud','precip','fog','lightning','wind'].forEach(k=>setVal(k,W[k]));
  saveSoon();
}
/* a change made by the user (as opposed to one made by the app) */
function userSet(k,v){
  if(k==='weather'){ setWeather(v); return; }
  if(k==='islands'&&v&&!S.islands){
    if(S.follow) setVal('follow',false);
    setVal('islandSeed',nextIslandSeed());
  }
  if(k==='ship'&&v&&!S.ship&&S.follow) setVal('follow',false);
  if(k==='season'&&S.weather==='snow'&&v!==3){ setVal('season',v); setWeather('rain',true); toast('Too warm for snow – it turned to rain'); return; }
  setVal(k,v);
  if(WEATHER_KEYS.indexOf(k)>=0&&S.weather!=='custom'){ S.weather='custom'; apply('weather'); refresh('weather'); saveSoon(); }
  if(k==='sound'&&S.sound) toast('Sound on');
}
function applyScene(sc){
  const o=sc.set, st=sunTimes(o.season);
  if(o.ship!==undefined){ setVal('ship',o.ship); if(o.ship){if(S.follow)setVal('follow',false);resetCamera('ship');} }
  if(o.shipClass!==undefined) setVal('shipClass',o.shipClass);
  setVal('season',o.season); setWeather(o.weather,true);
  /* scenes may override individual weather ingredients (e.g. the rainbow
     shower needs broken cloud + rain, which no preset provides) */
  const ov=['cloud','precip','fog','lightning','wind'].filter(k=>o[k]!==undefined);
  ov.forEach(k=>setVal(k,o[k]));
  if(ov.length&&S.weather!=='custom'){ S.weather='custom'; apply('weather'); refresh('weather'); }
  setVal('hour',Math.round((o.hour==='sunset'?st.set-0.35:o.hour==='sunrise'?st.rise+0.3:o.hour)*20)/20);
  setVal('dayCycle',o.dayCycle);
  toast(sc.name);
}
function focusScene(subject){
  if(subject==='ship'&&!ship.enabled){toast('Enable the ship first');return;}
  if(subject==='islands'&&!islands.active){toast('Create islands first');return;}
  if(explore.active) exitExplore();
  if(S.follow) setVal('follow',false);
  resetCamera(subject);toast(subject==='ship'?'Ship view':'Island view');
}
function resetAll(){
  for(const k in DEFAULTS){ if(k==='weather') continue; setVal(k,DEFAULTS[k]); }
  setWeather(DEFAULTS.weather,true);
  if(slowMo) toggleSlow();
  if(paused) togglePause();
  resetCamera(); selectType(S.type,true);
  toast('Settings reset');
}

/* ============================================================
   Widgets
   ============================================================ */
function shipClassNote(index){
  const i=clamp(Math.round(+index||0),0,SHIP_CLASSES.length-1), c=SHIP_CLASSES[i];
  return c.name+' · '+c.tag+' · speed ×'+c.speed.toFixed(2)+' · agility ×'+c.agility.toFixed(2)+
    ' · mast ×'+c.mast.toFixed(2)+'. Hull, deck and ball contacts stay exact for every class.';
}
function setFill(inp){ inp.style.setProperty('--p',((inp.value-inp.min)/(inp.max-inp.min)*100)+'%'); }
function buildRange(c,dock){
  const fmt=dock&&c.dockFmt?c.dockFmt:c.fmt;
  const w=el('label','ctl'), lab=el('span','lab'), val=el('b'), inp=el('input');
  lab.appendChild(document.createTextNode(c.label+' ')); lab.appendChild(val); w.appendChild(lab); w.appendChild(inp);
  inp.type='range'; inp.min=c.min; inp.max=c.max; inp.step=c.step;
  const show=v=>{ const t=fmt(v); if(val.textContent!==t){ val.textContent=t; if(document.activeElement===inp) replay(val,'pop'); } };
  (binders[c.k]=binders[c.k]||[]).push(v=>{ if(+inp.value!==v) inp.value=v; setFill(inp); show(v); });
  inp.addEventListener('input',()=>{ const v=+inp.value; if(isFinite(v)) userSet(c.k,v); });
  return w;
}
function buildSeg(c){
  const w=el('div','field'), lab=el('span','lab'), seg=el('div','seg'+(c.cols?' grid':''));
  lab.textContent=c.label; if(c.k==='weather'){ const b=el('b'); b.id='wxCustom'; lab.appendChild(document.createTextNode(' ')); lab.appendChild(b); }
  if(c.cols) seg.style.setProperty('--cols',c.cols);
  const btns=c.opts.map(o=>{ const b=el('button','seg-b'); b.type='button'; b.textContent=o[1]; b.onclick=()=>userSet(c.k,o[0]); seg.appendChild(b); return b; });
  (binders[c.k]=binders[c.k]||[]).push(v=>{
    c.opts.forEach((o,i)=>{btns[i].classList.toggle('on',o[0]===v);btns[i].setAttribute('aria-pressed',o[0]===v?'true':'false');});
    if(c.k==='weather') $('wxCustom').textContent=v==='custom'?'Custom':'';
    /* The fleet note names the selected class and its sea-keeping, so the
       numbers behind the choice are visible without sailing first. */
    if(c.k==='shipClass'){ const note=$('shipNote'); if(note) note.textContent=shipClassNote(v); }
  });
  w.appendChild(lab); w.appendChild(seg); return w;
}
function buildToggle(c){
  const b=el('button','toggle'); b.type='button'; b.setAttribute('role','switch');
  b.innerHTML='<span class="t-txt"><b></b><small></small></span><span class="t-sw"><i></i></span>';
  b.querySelector('b').textContent=c.label; b.querySelector('small').textContent=c.sub||'';
  b.onclick=()=>userSet(c.k,!S[c.k]);
  (binders[c.k]=binders[c.k]||[]).push(v=>{ b.classList.toggle('on',!!v); b.setAttribute('aria-checked',v?'true':'false'); });
  return b;
}
function buildButtons(c){
  const w=el('div','p-btns');
  c.items.forEach(it=>{ const b=el('button','btn'); b.type='button'; if(it[2]) b.id=it[2]; b.innerHTML='<span></span>'; b.firstChild.textContent=it[0]; b.onclick=it[1]; w.appendChild(b); });
  return w;
}
function buildScenes(){
  const w=el('div','field'), lab=el('span','lab'), g=el('div','scenes'); lab.textContent='Scenes';
  SCENES.forEach(sc=>{ const b=el('button','scene'); b.type='button'; b.innerHTML='<i></i><span></span>'; b.firstChild.style.background=sc.grad; b.lastChild.textContent=sc.name; b.onclick=()=>applyScene(sc); g.appendChild(b); });
  w.appendChild(lab); w.appendChild(g); return w;
}
function buildInfo(){
  return el('div','info','<div class="info-top"><svg class="ic info-ic" id="infoIc" viewBox="0 0 24 24"></svg><div><b id="infoTitle"></b><small id="infoSub"></small></div><strong id="infoTemp"></strong></div>'+
    '<div class="info-grid"><div><i>Sea</i><b id="infoSea"></b></div><div><i>Wind</i><b id="infoWind"></b></div><div><i>Waves</i><b id="infoWaves"></b></div>'+
    '<div><i>Sunrise</i><b id="infoRise"></b></div><div><i>Sunset</i><b id="infoSet"></b></div><div><i>Visibility</i><b id="infoVis"></b></div></div>');
}

/* ---- settings panel ---- */
const pBody=$('pBody'), tabsEl=$('tabs'), tabInd=$('tabInd');
const tabSecs={}, tabBtns={};
let curTab='scene';
TABS.forEach(t=>{
  const b=el('button','tab'); b.type='button'; b.textContent=t[1]; b.onclick=()=>showTab(t[0]); tabsEl.appendChild(b); tabBtns[t[0]]=b;
  const sec=el('div','p-sec'); pBody.appendChild(sec); tabSecs[t[0]]=sec;
});
CONTROLS.forEach(c=>{
  const sec=tabSecs[c.tab]; let node=null;
  if(c.t==='range') node=buildRange(c,false);
  else if(c.t==='seg') node=buildSeg(c);
  else if(c.t==='toggle') node=buildToggle(c);
  else if(c.t==='buttons') node=buildButtons(c);
  else if(c.t==='scenes') node=buildScenes();
  else if(c.t==='info') node=buildInfo();
  else if(c.t==='note'){ node=el('p','note'); node.textContent=c.text; if(c.id) node.id=c.id; }
  if(node) sec.appendChild(node);
  if(c.dock) $('dockRow').appendChild(buildRange(c,true));
});
function moveTabInd(){
  const b=tabBtns[curTab]; if(!b) return;
  tabInd.style.width=b.offsetWidth+'px'; tabInd.style.transform='translateX('+b.offsetLeft+'px)'; tabInd.classList.add('ready');
}
function showTab(id){
  curTab=id;
  $('cond').setAttribute('aria-expanded',$('panel').classList.contains('open')&&id==='sky'?'true':'false');
  for(const k in tabSecs){ tabSecs[k].classList.toggle('on',k===id); tabBtns[k].classList.toggle('on',k===id); }
  pBody.scrollTop=0; moveTabInd();
  tabBtns[id].scrollIntoView({behavior:reduceMotion?'auto':'smooth',inline:'nearest',block:'nearest'});
}
function setPanel(open,tab){
  if(open&&typeof closeVoyageChart==='function') closeVoyageChart(false);
  if(open&&explore.active) clearExploreInput();
  const p=$('panel'); p.classList.toggle('open',open); p.setAttribute('aria-hidden',open?'false':'true');
  document.body.classList.toggle('panel-open',open); $('bSet').classList.toggle('on',open);
  $('bSet').setAttribute('aria-expanded',open?'true':'false');
  $('bExploreSettings').setAttribute('aria-expanded',open?'true':'false');
  $('cond').setAttribute('aria-expanded',open&&(!tab||tab==='sky')&&curTab==='sky'?'true':'false');
  if(open){ if($('dock').classList.contains('hidden')&&innerWidth>=900) setDock(true); showTab(tab||curTab); setTimeout(moveTabInd,80); hideHint(); }
  else if(explore.active) canvas.focus({preventScroll:true});
  setTimeout(moveChipInd,700);
}
$('bSet').onclick=()=>setPanel(!$('panel').classList.contains('open'));
$('bExploreSettings').onclick=()=>setPanel(true);
$('pClose').onclick=()=>setPanel(false);
$('cond').onclick=()=>setPanel(!($('panel').classList.contains('open')&&curTab==='sky'),'sky');

/* ---- ball type chips with a sliding glass highlight ---- */
const chipsEl=$('chips'), chipInd=$('chipInd');
function moveChipInd(){
  const c=chipsEl.querySelector('.chip.on'); if(!c) return;
  chipInd.style.width=c.offsetWidth+'px'; chipInd.style.height=c.offsetHeight+'px';
  chipInd.style.transform='translateX('+c.offsetLeft+'px)'; chipInd.classList.add('ready');
}
function selectType(i,quiet){
  setVal('type',i); selType=i;
  const chips=chipsEl.querySelectorAll('.chip');
  chips.forEach((c,k)=>{c.classList.toggle('on',k===i);c.setAttribute('aria-pressed',k===i?'true':'false');});
  moveChipInd();
  if(!quiet) chips[i].scrollIntoView({behavior:reduceMotion?'auto':'smooth',inline:'nearest',block:'nearest'});
}
TYPES.forEach((T,i)=>{
  const b=el('button','chip'); b.type='button'; b.style.setProperty('--i',i);
  b.innerHTML='<span class="sw" style="background:'+T.sw+'"></span><span>'+T.name+'<small>'+T.sub+'</small></span>';
  b.onclick=()=>selectType(i);
  chipsEl.appendChild(b);
});
addEventListener('resize',()=>{ moveChipInd(); moveTabInd(); });
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>{ moveChipInd(); moveTabInd(); });

/* ---- actions ---- */
function nextIslandSeed(){
  let seed=Math.floor(Math.random()*4294967296);
  if(seed===S.islandSeed) seed=(seed+1)>>>0;
  return seed;
}
function toggleIslands(){
  hideHint(); userSet('islands',!S.islands);
  toast(S.islands?'Archipelago created · try Storm coast in settings':'Islands removed');
}
function newIslands(){
  hideHint();
  if(!S.islands) userSet('islands',true);
  else { cancelIslandRebuild(); setVal('islandSeed',nextIslandSeed()); generateIslands(S.islandSeed,currentIslandOptions()); cliffEvents.length=0; resetCamera('islands'); }
  toast('A new archipelago');
}
function islandStorm(){
  if(!S.islands) userSet('islands',true);
  setWeather('storm',true); setPanel(false); hideHint();
  toast('Storm coast · watch the cliffs');
}
(binders.islands=binders.islands||[]).push(v=>{
  $('bIsland').classList.toggle('on',v);
  $('bIsland').setAttribute('aria-pressed',v?'true':'false');
  $('bIsland').title=v?'Remove islands (I)':'Generate islands (I)';
});
function dropBall(){
  hideHint(); replay($('bDrop'),'fired');
  if(launchMode==='throw') spawnAtPointer(innerWidth/2,innerHeight*0.42);
  else {
    const x=(cameraFramesShip()?ship.x:0)+(Math.random()-0.5)*3,z=(cameraFramesShip()?ship.z:0)+(Math.random()-0.5)*3;
    spawnBall(x,surfH(x,z,simT)+4.5,z,selType);
  }
}
const rainTimers=new Set();
function ballRain(){
  hideHint(); toast('Ball rain incoming');
  const cx=cameraFramesShip()?ship.x:0,cz=cameraFramesShip()?ship.z:0;
  for(let i=0;i<10;i++){
    const timer=setTimeout(()=>{
      rainTimers.delete(timer);
      const x=cx+(Math.random()-0.5)*11,z=cz+(Math.random()-0.5)*11;
      spawnBall(x,surfH(x,z,simT)+5+Math.random()*5,z,Math.floor(Math.random()*TYPES.length));
    },i*110);
    rainTimers.add(timer);
  }
}
function clearAll(){
  const n=balls.length,pending=rainTimers.size;
  const hadEffects=pCount>0||splashEvents.length||cliffEvents.length||surfSheets.length||coastFoam.length||windStreaks.length;
  for(const timer of rainTimers) clearTimeout(timer);
  rainTimers.clear();balls.length=0;grab=null;clearSplashes();replay($('bClear'),'fired');
  const message=n?'Cleared '+n+' ball'+(n===1?'':'s')+(pending?' · rain cancelled':''):
    pending?'Ball rain cancelled':hadEffects?'Cleared splashes':'Nothing to clear';
  toast(message);
}
function toggleSlow(){
  slowMo=!slowMo; applySpeed();
  $('bSlow').classList.toggle('on',slowMo); $('bSlow').setAttribute('aria-pressed',slowMo?'true':'false'); document.body.classList.toggle('slow',slowMo);
}
function togglePause(){
  paused=!paused; document.body.classList.toggle('paused',paused);
  const b=$('pauseBtn'); if(b){ b.firstChild.textContent=paused?'Resume':'Pause'; b.classList.toggle('on',paused); }
}
function takeShot(){ screenshot(ok=>toast(ok?'Screenshot saved':'Could not save a screenshot')); }
function toggleFullscreen(){
  const d=document, e=d.documentElement;
  const cur=d.fullscreenElement||d.webkitFullscreenElement;
  const req=e.requestFullscreen||e.webkitRequestFullscreen, exit=d.exitFullscreen||d.webkitExitFullscreen;
  if(cur){ if(exit) exit.call(d); return; }
  if(!req){ toast('Fullscreen is not supported on this device'); return; }
  try{ const r=req.call(e); if(r&&r.catch) r.catch(()=>toast('Fullscreen was blocked')); }catch(err){ toast('Fullscreen was blocked'); }
}

/* ---- cinema mode: the UI fades away and the scene takes the whole screen ---- */
let cinema=false, cineHintT=0;
function setCinema(on){
  if(on&&explore.active) exitExplore();
  cinema=on;
  document.body.classList.toggle('cinema',on);
  setPanel(false); hideHint();
  clearTimeout(cineHintT);
  const d=document, e=d.documentElement,
        req=e.requestFullscreen||e.webkitRequestFullscreen, exit=d.exitFullscreen||d.webkitExitFullscreen,
        fsEl=()=>d.fullscreenElement||d.webkitFullscreenElement;
  if(on){
    document.body.classList.add('cine-hint');
    cineHintT=setTimeout(()=>document.body.classList.remove('cine-hint'),4500);
    if(req&&!fsEl()){ try{ const r=req.call(e); if(r&&r.catch) r.catch(()=>{}); }catch(err){} }
  } else {
    document.body.classList.remove('cine-hint');
    if(exit&&fsEl()){ try{ exit.call(d); }catch(err){} }
  }
}
/* leaving fullscreen (Esc) also ends cinema mode */
['fullscreenchange','webkitfullscreenchange'].forEach(ev=>
  document.addEventListener(ev,()=>{ if(cinema&&!(document.fullscreenElement||document.webkitFullscreenElement)) setCinema(false); }));

/* ---- video recording: keep each capture and its chunks together until stop ---- */
let recording=null;
function setRecordingUI(phase){
  document.body.classList.toggle('recording',phase==='recording');
  const btn=$('recBtn');
  if(btn){
    btn.firstChild.textContent=phase==='recording'?'Stop recording':phase==='stopping'?'Finishing…':'Record video';
    btn.disabled=phase==='stopping';btn.setAttribute('aria-pressed',phase==='recording'?'true':'false');
  }
}
function stopCaptureTracks(stream){
  let tracks=[];
  try{tracks=stream.getTracks();}catch(e){}
  for(const track of tracks) try{track.stop();}catch(e){}
}
function finishRecording(session){
  if(session.finished) return;
  session.finished=true;clearTimeout(session.errorTimer);stopCaptureTracks(session.stream);
  if(recording===session){recording=null;setRecordingUI('idle');}
  if(!session.chunks.length){toast(session.failed?'Recording failed':'No video was recorded');return;}
  try{
    /* The browser may choose MP4 instead of WebM, especially on Safari. */
    const mime=session.rec.mimeType||session.chunks[0].type||session.mime||'video/webm';
    const format=mime.split(';')[0].trim().toLowerCase();
    const ext=({'video/mp4':'mp4','video/quicktime':'mov','video/x-matroska':'mkv','video/ogg':'ogv','video/webm':'webm'})[format]||'video';
    const blob=new Blob(session.chunks,{type:mime}),a=document.createElement('a'),url=URL.createObjectURL(blob);
    try{
      a.href=url;a.download='aqua-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.'+ext;
      document.body.appendChild(a);a.click();
    }finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);}
    toast(session.failed?'Recording stopped · partial video saved':'Recording saved');
  }catch(e){toast('Could not save the recording');}
}
function toggleRecord(){
  if(recording){
    if(recording.stopping) return;
    const session=recording;session.stopping=true;setRecordingUI('stopping');
    /* stop() changes state to inactive before its final data/stop events. */
    if(session.rec.state!=='inactive'){
      try{session.rec.stop();}catch(e){session.failed=true;finishRecording(session);}
    }
    return;
  }
  if(!window.MediaRecorder||!canvas.captureStream){toast('Recording is not supported in this browser');return;}
  let mime='';
  try{
    if(typeof MediaRecorder.isTypeSupported==='function')
      mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type))||'';
  }catch(e){}
  let stream,rec;
  try{stream=canvas.captureStream(60);}catch(e){toast('Recording failed to start');return;}
  try{
    const options={videoBitsPerSecond:8000000};if(mime) options.mimeType=mime;
    try{rec=new MediaRecorder(stream,options);}catch(e){rec=new MediaRecorder(stream);}
  }catch(e){stopCaptureTracks(stream);toast('Recording failed to start');return;}
  const session={rec,stream,mime,chunks:[],stopping:false,finished:false,failed:false,errorTimer:0};
  recording=session;
  rec.ondataavailable=ev=>{if(!session.finished&&ev.data&&ev.data.size) session.chunks.push(ev.data);};
  rec.onstop=()=>finishRecording(session);
  rec.onerror=()=>{
    if(session.finished) return;
    session.failed=true;
    if(!session.stopping){
      session.stopping=true;setRecordingUI('stopping');
      if(rec.state!=='inactive') try{rec.stop();}catch(e){finishRecording(session);}
    }
    stopCaptureTracks(stream);
    /* A conforming recorder sends its final data and stop events after an
       error; recover the UI even if a broken implementation never does. */
    if(!session.finished&&!session.errorTimer) session.errorTimer=setTimeout(()=>finishRecording(session),5000);
  };
  try{rec.start(250);}catch(e){
    session.finished=true;clearTimeout(session.errorTimer);recording=null;stopCaptureTracks(stream);setRecordingUI('idle');toast('Recording failed to start');return;
  }
  if(!session.stopping&&!session.finished){setRecordingUI('recording');toast('Recording…');}
}
setRecordingUI('idle');
function setDock(show){
  $('dock').classList.toggle('hidden',!show); $('fab').classList.toggle('show',!show);
  if(show) setTimeout(moveChipInd,50);
}
$('bDrop').onclick=dropBall;
$('bIsland').onclick=toggleIslands;
$('bExplore').onclick=toggleExplore;
$('bSail').onclick=enterSailing;
$('bRain').onclick=ballRain;
$('bClear').onclick=clearAll;
$('bSlow').onclick=toggleSlow;
$('bHide').onclick=()=>setDock(false);
$('fab').onclick=()=>setDock(true);
setTimeout(hideHint,14000);

addEventListener('keydown',e=>{
  if(e.repeat||e.metaKey||e.ctrlKey||e.altKey) return;
  if(e.target&&e.target.closest&&e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  const k=e.key.toLowerCase();
  if(explore.active){
    if(k==='escape'&&voyage.chartOpen){closeVoyageChart();return;}
    if(k==='v'&&explore.mode==='helm') return;
    if(k==='escape'){if($('panel').classList.contains('open')) setPanel(false);else exitExplore();return;}
    if(EXPLORE_KEYS.has(k)) return;
  }
  if(k===' '){ if(e.target&&e.target.closest&&e.target.closest('button,input')) return; e.preventDefault(); dropBall(); }
  else if(k==='escape') setPanel(false);
  else if(k==='b') enterSailing();
  else if(k==='i') toggleIslands();
  else if(k==='u') toggleExplore();
  else if(k==='q') triggerSeaQuake();
  else if(k==='j') triggerIslandQuake();
  else if(k==='r') ballRain();
  else if(k==='s') toggleSlow();
  else if(k==='c') clearAll();
  else if(k==='h') setDock($('dock').classList.contains('hidden'));
  else if(k==='n'){ userSet('boats',!S.boats); toast(S.boats?'Harbour traffic on':'Harbour traffic off'); }
  else if(k==='g') setPanel(!$('panel').classList.contains('open'));
  else if(k==='p') togglePause();
  else if(k==='m') userSet('sound',!S.sound);
  else if(k==='f') toggleFullscreen();
  else if(k==='v') setCinema(!cinema);
  else if(k==='k') takeShot();
  else if(k==='t'){ userSet('launch',S.launch==='drop'?'throw':'drop'); toast(S.launch==='throw'?'Tap to throw':'Tap to drop'); }
  else if(k==='o'){ userSet('orbit',!S.orbit); toast(S.orbit?'Auto-orbit on':'Auto-orbit off'); }
  else if(k>='1'&&k<=String(TYPES.length)) selectType(+k-1);
  if(cinema&&['r','c','h','g'].indexOf(k)>=0) setCinema(false);   /* actions that need the UI leave cinema */
});

/* ---- live stats + conditions (called twice a second from the main loop) ---- */
const ICONS={
  sun:'<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/>',
  moon:'<path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z"/>',
  partly:'<circle cx="8.5" cy="8.5" r="3.2"/><path d="M8.5 2.6v1.6M2.6 8.5h1.6M4.3 4.3l1.2 1.2M12.7 4.3l-1.2 1.2"/><path d="M9.5 19.5a3.6 3.6 0 0 1 .4-7.2 5 5 0 0 1 9.4 1.6 2.9 2.9 0 0 1-.8 5.6z"/>',
  cloud:'<path d="M7 18.5a4.5 4.5 0 0 1 .6-9A6 6 0 0 1 19 11.7a3.5 3.5 0 0 1-1 6.8z"/>',
  rain:'<path d="M7 15a4.5 4.5 0 0 1 .6-9A6 6 0 0 1 19 8.2 3.5 3.5 0 0 1 18 15z"/><path d="M8.5 18v2.5M12.5 18v2.5M16.5 18v2.5"/>',
  storm:'<path d="M7 15a4.5 4.5 0 0 1 .6-9A6 6 0 0 1 19 8.2 3.5 3.5 0 0 1 18 15z"/><path d="M13 13l-3 4.5h3.2L11.5 22"/>',
  snow:'<path d="M7 14a4.5 4.5 0 0 1 .6-9A6 6 0 0 1 19 7.2 3.5 3.5 0 0 1 18 14z"/><path d="M8.5 18h.01M12.5 17.5h.01M16.5 18h.01M10.5 21h.01M14.5 21h.01"/>',
  fog:'<path d="M4 8h16M4 12h12M8 16h12M5 20h10"/>'
};
const shown={};
function put(id,txt){ if(shown[id]!==txt){ shown[id]=txt; const e=$(id); if(e) e.textContent=txt; return true; } return false; }
function putIcon(id,name){ if(shown[id]!==name){ shown[id]=name; $(id).innerHTML=ICONS[name]||ICONS.sun; } }
function updateStats(fps,nBalls,res,hs){
  if(put('stFps',String(fps))) $('stats').querySelector('.live').classList.toggle('warn',fps<45);
  if(put('stBalls',String(nBalls))) replay($('stBalls'),'pop');
  put('stRes',res.toFixed(2)+'×'); put('stSea',hs.toFixed(1)+' m');

  /* the clock keeps the time slider in sync while the day–night cycle runs */
  if(env.dayCycle>0&&!paused){ S.hour=Math.min(23.95,Math.round(env.hour*20)/20); refresh('hour'); saveSoon(); }
  const desc=skyDescription(), icon=skyIcon(), temp=Math.round(envS.airT)+'°', st=sunTimes(S.season);
  putIcon('condIc',icon); put('condTemp',temp); put('condTxt',desc); put('condTime',fmtHour(env.hour));
  $('cond').setAttribute('aria-label',desc+', '+temp+', '+fmtHour(env.hour)+'. Open weather settings');
  putIcon('infoIc',icon); put('infoTitle',desc); put('infoSub',SEASONS[S.season].name+' · '+fmtHour(env.hour)+' · '+dayPhase(env.hour));
  put('infoTemp',temp+'C'); put('infoSea',Math.round(envS.water)+'°C');
  put('infoWind',Math.round(envS.wind*1.944)+' kn '+compass(S.windFrom));
  put('infoWaves',hs.toFixed(1)+' m'); put('infoRise',fmtHour(st.rise)); put('infoSet',fmtHour(st.set));
  put('infoVis',fogLabel(clamp(envS.fog+0.28*envS.precip,0,1)));
}

/* ---- start-up: push every stored setting into the engine and the widgets ---- */
for(const k in DEFAULTS){ apply(k); refresh(k); }
settingsBooting=false;
selectType(S.type,true);
showTab('scene');
/* start with the eased environment already at its targets (no fade-in from defaults) */
(function(){
  const s=SEASONS[S.season];
  envS.cloud=env.cloud; envS.precip=env.precip; envS.fog=env.fog; envS.wind=env.wind; envS.lightning=env.lightning;
  envS.dec=s.dec; envS.air=s.air; envS.water=s.water; envS.deep=s.deep.slice(); envS.turq=s.turq.slice(); envS.tint=s.tint.slice();
  const th=(180-env.windFrom)*DEG; envS.dx=Math.sin(th); envS.dz=Math.cos(th);
  sea=seaT=clamp(Math.pow(env.wind/24,0.85)*env.waves,0,1);
  updateEnv(0.016,0); updateWaves(sea);
})();
requestAnimationFrame(()=>{ moveChipInd(); moveTabInd(); });

/* ---- intro: lift the curtain once the first frames are on screen ---- */
let bootT=performance.now(), booted=false;
function uiReady(){
  if(booted) return; booted=true;
  setTimeout(()=>{ document.body.classList.remove('booting'); setTimeout(()=>{ moveChipInd(); moveTabInd(); },60); },Math.max(0,(reduceMotion?0:1100)-(performance.now()-bootT)));
}
