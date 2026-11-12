'use strict';
/* ============================================================
   Modern craft and harbour traffic

   A fleet of small motor boats, a fishing boat, a harbour tug, a sailing
   dinghy, a houseboat, a cargo coaster and a ghost ship drawn from Kenney's
   CC0 "Watercraft" kit, plus a handful of buoys. They are mesh models
   rather than re-proportioned sailing hulls, so each has a real silhouette.

   Each boat floats on the same Gerstner waves as everything else: its
   footprint drives four buoyancy probes, which give heave, pitch and roll.
   Motor boats also motor: they keep a course inside the harbour, turn away
   from shallow water, and leave a wake. Only visible craft are drawn, and
   the whole fleet can be switched off.
   ============================================================ */
/* Each craft keeps the kit's authored proportions, rescaled to a believable
   length in metres. `scale` is the only size knob, so the drawn mesh, the
   buoyancy probes, the wake and the spawn footprint all share one frame. */
const BOAT_CLASSES={
  'boat-speed-a':     {label:'Runabout',       scale:1.70, draft:0.50, power:1.00, turn:1.35},
  'boat-speed-d':     {label:'Sport boat',     scale:1.80, draft:0.46, power:1.25, turn:1.15},
  'boat-speed-f':     {label:'Rib tender',     scale:1.85, draft:0.42, power:1.15, turn:1.55},
  'boat-speed-j':     {label:'Day cruiser',    scale:1.75, draft:0.52, power:1.35, turn:1.00},
  'boat-tug-a':       {label:'Harbour tug',    scale:1.80, draft:0.95, power:0.85, turn:1.20},
  'boat-fishing-small':{label:'Fishing boat',  scale:1.80, draft:0.80, power:0.70, turn:0.90},
  'boat-sail-a':      {label:'Sailing dinghy', scale:1.65, draft:0.50, power:0.55, turn:1.10, sail:true},
  'boat-house-a':     {label:'Houseboat',      scale:1.70, draft:0.70, power:0.30, turn:0.55, anchor:true},
  'ship-cargo-a':     {label:'Cargo coaster',  scale:1.75, draft:1.90, power:0.90, turn:0.55, liner:true, berth:true},
  'ship-small-ghost': {label:'Ghost ship',     scale:1.00, draft:2.20, power:0.75, turn:0.60, liner:true, ghost:true, berth:true},
  'ship-large':       {label:'Tall galleon',   scale:1.00, draft:2.60, power:0.80, turn:0.50, liner:true, berth:true},
  'buoy':             {label:'Mooring buoy',   scale:1.00, draft:0.55, buoy:true},
  'buoy-flag':        {label:'Marker buoy',    scale:1.00, draft:0.55, buoy:true}
};
/* Which craft make up the fleet, in the order their moorings are claimed.
   Buoys and the big hulls come last, so a small fleet still shows the little
   boats that read best at a glance. */
const BOAT_FLEET=[
  'boat-speed-a','boat-speed-d','boat-speed-f','boat-speed-j',
  'boat-tug-a','boat-fishing-small','boat-sail-a','boat-house-a',
  'buoy','buoy-flag','ship-cargo-a','ship-small-ghost'
];
const boats={
  enabled:false,status:'idle',error:'',list:[],texture:null,
  load:null,spawned:false,seed:1,count:0,limit:7,nextBuoyFoam:0,gen:0
};

/* ---------------------------------------------------------------
   Spawning and placement
   --------------------------------------------------------------- */
function boatInWater(x,z,length,beam){
  if(!islands.active) return true;
  const half=length*0.5;
  for(const along of [-half*0.8,0,half*0.8]) for(const side of [-beam*0.5,0,beam*0.5])
    if(islandGround(x+side,z+along)>-2.6) return false;
  return true;
}
/* Anchorage routes: one seeded pass builds a pool of open-water moorings,
   spread around the archipelago and clear of the sailing ship. Class n uses
   every n-th mooring, so a fleet of mixed sizes stays well separated instead
   of piling up in one corner of the bay. */
function boatRoutes(count,seed,length,beam){
  let state=(seed^0x9e3779b9)>>>0;
  const random=()=>{ state=(state*1664525+1013904223)>>>0; return state/4294967296; };
  const spots=[];
  for(let i=0;i<count*10&&spots.length<count*3;i++){
    const angle=random()*Math.PI*2, radius=20+random()*74;
    const x=Math.sin(angle)*radius, z=Math.cos(angle)*radius;
    if(Math.hypot(x-ship.x,z-ship.z)<18) continue;
    if(!boatInWater(x,z,length+3,beam+3)) continue;
    if(spots.some(s=>Math.hypot(s.x-x,s.z-z)<length*1.1+6)) continue;
    spots.push({x,z,heading:random()*Math.PI*2});
  }
  /* Deep water is always available beyond the shoreline map, so a seeded
     fallback ring keeps the fleet visible even on a crowded coast. */
  while(spots.length<count*3) spots.push({x:0,z:96+spots.length*11,heading:Math.PI*0.5});
  return spots;
}
function boatSize(name,box){
  const cls=BOAT_CLASSES[name]||{};
  const scale=cls.scale||1;
  return {scale,length:(box.max[2]-box.min[2])*scale,beam:(box.max[0]-box.min[0])*scale,height:(box.max[1]-box.min[1])*scale};
}
function makeBoat(model,index,route){
  const cls=BOAT_CLASSES[model.name]||{label:'Boat',draft:0.6,power:1,turn:1};
  const size=boatSize(model.name,model.box);
  return {
    model,kind:model.name,cls,index,
    x:route.x,z:route.z,y:0,heading:route.heading,
    speed:0,throttle:0,rudder:0,pitch:0,roll:0,
    scale:size.scale,length:size.length,beam:size.beam,height:size.height,
    draft:cls.draft||0.6,homeX:route.x,homeZ:route.z,homeHeading:route.heading,acc:0,bob:index*1.7,
    /* Big hulls swing on their mooring; the rest of the fleet gets underway
       until a wake or the coast pushes them into a berth. */
    anchor:!!cls.anchor||!!cls.buoy||!!cls.berth,
    buoy:!!cls.buoy,ghost:!!cls.ghost,sail:!!cls.sail,
    wake:0,frustum:true,alive:true
  };
}

/* ---------------------------------------------------------------
   Loading

   Only the craft the user asked for are fetched. The shared Watercraft
   colour atlas is fetched once and released with the fleet.
   --------------------------------------------------------------- */
async function loadBoats(){
  boats.status='loading'; boats.error='';
  /* A fleet switched off while it was still downloading must not upload its
     buffers into a scene that no longer wants them. */
  const gen=++boats.gen;
  try{
    const wanted=BOAT_FLEET.slice(0,Math.max(2,Math.min(BOAT_FLEET.length,boats.limit)));
    const [texture,models]=await Promise.all([loadKitTexture('watercraft'),loadKits(wanted.map(n=>['watercraft',n]))]);
    boats.texture=texture;
    const ready=models.filter(Boolean);
    if(!ready.length) throw new Error('No boat models could be loaded');
    if(gen!==boats.gen||!boats.enabled){
      releaseKitTexture('watercraft');
      releaseKits('watercraft/');
      boats.status='idle';
      return false;
    }
    /* The longest craft claims the widest moorings, so routes are sized from
       the fleet's own hulls rather than a global guess. */
    let longest=4, widest=2;
    for(const m of ready){
      const size=boatSize(m.name,m.box);
      longest=Math.max(longest,size.length);
      widest=Math.max(widest,size.beam);
    }
    const routes=boatRoutes(ready.length,boats.seed||1,longest,widest);
    const stride=Math.max(1,Math.floor(routes.length/ready.length));
    boats.list=ready.map((model,index)=>makeBoat(model,index,routes[(index*stride)%routes.length]));
    boats.count=boats.list.length;
    boats.spawned=true; boats.status='ready';
    if(typeof boatsChanged==='function') boatsChanged(true);
    return true;
  }catch(error){
    if(gen!==boats.gen) return false;
    boats.status='error'; boats.error=error&&error.message||'Boats could not load';
    boats.list=[]; boats.count=0;
    if(boats.enabled&&typeof toast==='function') toast('Boats could not load · the ocean still works');
    if(typeof console!=='undefined'&&console.warn) console.warn('Aqua boats:',error);
    return false;
  }finally{ boats.load=null; }
}
function ensureBoats(){
  if(boats.status==='ready') return Promise.resolve(true);
  if(boats.load) return boats.load;
  boats.load=loadBoats(); return boats.load;
}
function releaseBoats(){
  boats.gen++;
  boats.list=[]; boats.count=0; boats.spawned=false;
  if(boats.texture){ releaseKitTexture('watercraft'); boats.texture=null; }
  releaseKits('watercraft/');
  boats.status='idle';
}
function setBoatsEnabled(on){
  boats.enabled=!!on;
  if(!on){ releaseBoats(); }
  else ensureBoats();
  if(typeof boatsChanged==='function') boatsChanged(boats.enabled);
}

/* ---------------------------------------------------------------
   Physics

   Four probes on the footprint and one at the centre give heave, pitch and
   roll from the same Gerstner sample the ocean shader draws. Powered craft
   then steer along their berth heading, turn away from shoaling water, and
   keep inside the bay. Only the size of the step changes when a boat is far
   away; the rules never do, so nothing ever teleports.
   --------------------------------------------------------------- */
const boatWave={h:0,vx:0,vy:0,vz:0,ax:0,az:0};
function boatHeight(x,z){ waveSample(x,z,simT,false,boatWave); return boatWave.h; }
/* Open water reads as deep; islandGround() reports −1000 for "nowhere near
   land", which must not be mistaken for a metre scale. */
function boatDepth(x,z){
  if(!islands.active) return -8;
  const ground=islandGround(x,z);
  return ground<-60?-8:ground;
}
/* Heading whose forward vector (sin h, −cos h) points along (dx, dz). */
function headingOf(dx,dz){ return Math.atan2(dx,-dz); }
/* Positive while a candidate position is comfortably clear: deep water, off
   the sailing ship, inside the bay. Used both to veto a step and to score a
   bearing when the direct course is closed. */
function boatClearance(b,x,z){
  /* Depth in metres below the keel relative to a 2 m safety band: negative
     wherever a hull would touch bottom or leave the bay. */
  /* Ground elevation is positive ashore, so clearance is how far the seabed
     lies below the 2 m safety band. */
  const water=Math.min(-boatDepth(x,z)-2.0,10);
  const shipDist=(typeof ship!=='undefined'&&ship.enabled)?Math.hypot(x-ship.x,z-ship.z)-(9+b.length*0.45):99;
  const edge=100-Math.hypot(x,z);
  return Math.min(water,shipDist,edge);
}
function boatClearAt(b,x,z){ return boatClearance(b,x,z)>0; }
/* Distance at which this craft must already be turning to clear the shore. */
function boatShoal(b,x,z,dirX,dirZ){ return boatDepth(x+dirX*b.length*0.9,z+dirZ*b.length*0.9); }
function updateBoat(b,dt,sdt){
  if(!b.alive) return;
  const fx=Math.sin(b.heading),fz=-Math.cos(b.heading);
  const rx=Math.cos(b.heading),rz=Math.sin(b.heading);
  const halfL=b.length*0.42,halfW=b.beam*0.34;
  const bow=boatHeight(b.x+fx*halfL,b.z+fz*halfL),stern=boatHeight(b.x-fx*halfL,b.z-fz*halfL);
  const port=boatHeight(b.x+rx*halfW,b.z+rz*halfW),star=boatHeight(b.x-rx*halfW,b.z-rz*halfW);
  const targetY=(bow+stern+port+star)*0.25;
  const targetPitch=Math.atan2(bow-stern,b.length*0.84);
  const targetRoll=-Math.atan2(port-star,b.beam*0.68);
  /* Heavy hulls answer the swell more slowly than a dinghy. */
  const inertia=(b.cls.berth||b.buoy)?1.1:3.0, rollInertia=(b.cls.berth||b.buoy)?1.4:2.2;
  b.y+=(targetY-b.y)*(1-Math.exp(-sdt*inertia));
  b.pitch+=(targetPitch-b.pitch)*(1-Math.exp(-sdt*rollInertia));
  b.roll+=(targetRoll-b.roll)*(1-Math.exp(-sdt*rollInertia));
  if(sdt<=0) return;

  if(b.buoy){
    /* Moored to the seabed: the buoy leans on the swell and is pulled back
       when a wake nudges it off station. */
    b.x+=(b.homeX-b.x)*Math.min(1,sdt*0.7);
    b.z+=(b.homeZ-b.z)*Math.min(1,sdt*0.7);
    if(boats.nextBuoyFoam<simT&&sea>0.5){
      boats.nextBuoyFoam=simT+1.4+Math.random()*2;
      addFoam(b.x,b.z,1.1,0.05); addRipple(b.x,b.z,0.7,0.02);
    }
    return;
  }
  const power=b.cls.power||1,turn=b.cls.turn||1,cruise=(b.cls.berth?3.4:b.sail?2.8:5.0)*power;
  if(b.anchor){
    b.throttle+=(0-b.throttle)*Math.min(1,sdt*0.6);
    b.speed*=1-Math.min(1,sdt*1.8);
  }else{
    /* Course keeping. The berth heading is tried first; only when the water
       ahead is too thin, or the sailing ship is in the way, does the helm
       scan for a clearer bearing. Eight probes, and only on the awkward
       frames, so a whole fleet costs a fraction of one wave sample. */
    const look=b.length*0.9+2.5;
    /* On the berth heading in the middle of the bay; nudged back inside when
       she has wandered out, so the fleet keeps station instead of drifting
       into a ring at the edge. */
    const radius=Math.hypot(b.x,b.z);
    let want=b.homeHeading;
    if(radius>58) want=headingOf(-b.x,-b.z)+Math.sin(b.bob+simT*0.03)*0.7;
    if(boatClearance(b,b.x+Math.sin(want)*look,b.z-Math.cos(want)*look)<0.8){
      let best=-1e9,bestA=want;
      for(let i=0;i<8;i++){
        const a=want+i*(Math.PI/4);
        const score=boatClearance(b,b.x+Math.sin(a)*look,b.z-Math.cos(a)*look)+0.45*Math.cos(a-want);
        if(score>best){ best=score; bestA=a; }
      }
      want=bestA;
    }
    let err=want-b.heading; err=Math.atan2(Math.sin(err),Math.cos(err));
    const authority=clamp(Math.abs(b.speed)/1.2+0.35,0.35,1.2);
    const desired=clamp(err/(0.5/authority),-1,1);
    b.rudder+=(desired-b.rudder)*Math.min(1,sdt*2.4);
    /* Ease the throttle in a tight turn, as a helmsman would. */
    const easing=Math.abs(err)>1.0?0.42:Math.abs(err)>0.5?0.72:1;
    b.throttle+=(1-b.throttle)*Math.min(1,sdt*0.5);
    const target=cruise*easing*b.throttle;
    b.speed+=(target-b.speed)*(1-Math.exp(-sdt*(target>b.speed?0.65:1.0)));
    b.heading+=Math.sign(err)*Math.min(Math.abs(err),Math.abs(b.rudder)*turn*0.62*sdt*authority);
  }
  const nx=b.x+fx*b.speed*sdt,nz=b.z+fz*b.speed*sdt;
  if(boatClearAt(b,nx,nz)){
    /* Remember the best water this hull has seen: when the direct course is
       blocked, the helm backs down that corridor instead of nosing into a
       cove and sitting there. */
    const clearance=boatClearance(b,nx,nz);
    b.x=nx; b.z=nz;
    if(clearance>3.5){ b.lastClear=simT; b.clearX=nx; b.clearZ=nz; }
  }else{
    /* Blocked. Never creep into the shallows: a hull that has run out of
       water reverses along its track and turns away. */
    b.speed=Math.min(b.speed,0.8);
    if(b.clearX!==undefined&&simT-b.lastClear<12){
      const back=headingOf(b.clearX-b.x,b.clearZ-b.z);
      let err=back-b.heading; err=Math.atan2(Math.sin(err),Math.cos(err));
      b.heading+=clamp(err,-1.6*sdt,1.6*sdt);
    }else{
      b.heading+=1.4*sdt;
    }
    b.rudder=0;
  }
  /* Hard outer limit: no craft ever leaves the bay, however hard it is
     pushed by a wake or a storm. Projecting the position keeps the hull
     moving along the arc instead of stalling against an invisible wall. */
  const radius=Math.hypot(b.x,b.z);
  if(radius>98){
    b.x*=98/radius; b.z*=98/radius;
    b.heading=headingOf(-b.x,-b.z);
    b.speed=Math.min(b.speed,2.2);
  }

  /* Wake: two fine foam sheets off the quarters, kept inside the shared
     particle budget so a wide fleet can never starve the coast surf. */
  if(b.speed>1.0){
    b.wake-=sdt;
    if(b.wake<=0){
      b.wake=clamp(1.0-b.speed*0.1,0.35,0.9);
      const bx=b.x-fx*b.length*0.45,bz=b.z-fz*b.length*0.45;
      for(const side of [-1,1]) putSurf(coastFoam,MAX_COAST_FOAM,{
        x:bx+rx*side*b.beam*0.22,y:surfH(bx,bz,simT),z:bz+rz*side*b.beam*0.22,
        width:0.7+b.beam*0.12,nx:-fx*0.7+rx*side*0.7,nz:-fz*0.7+rz*side*0.7,
        power:clamp(b.speed/6,0.12,0.8),kind:0,age:0,life:2.4,seed:Math.random(),layer:0});
    }
  }
}
function updateBoats(dt,sdt){
  if(!boats.enabled||boats.status!=='ready'||!boats.list.length) return;
  if(sdt<=0) return;
  for(const b of boats.list){
    /* A boat far outside the view still moves, just on a coarser step. The
       step is never longer than 0.1 s, so nothing can skip through a coast. */
    const dist=Math.hypot(b.x-eye[0],b.z-eye[2]);
    b.frustum=dist<360;
    let step=sdt;
    if(!b.frustum){ b.acc+=sdt; if(b.acc<0.1) continue; step=b.acc; b.acc=0; }
    updateBoat(b,dt,step);
  }
  separateBoats(sdt);
}
/* Craft never sail through each other: one cheap pass pushes overlapping
   hulls apart and trims the speed of the one that has to give way. Seven
   boats make this 21 comparisons, far cheaper than any spatial index. */
function separateBoats(sdt){
  const list=boats.list;
  for(let i=0;i<list.length;i++){
    const a=list[i];
    if(a.buoy) continue;
    for(let j=i+1;j<list.length;j++){
      const b=list[j];
      const dx=b.x-a.x,dz=b.z-a.z;
      const gap=Math.hypot(dx,dz),need=(a.length+b.length)*0.46+Math.max(a.beam,b.beam)*0.28;
      if(gap>=need||gap<0.0001) continue;
      const push=(need-gap)*0.5,ux=dx/gap,uz=dz/gap;
      const wa=a.buoy||a.anchor?0:1, wb=b.buoy||b.anchor?0:1, w=wa+wb;
      if(!w) continue;
      a.x-=ux*push*(wa?1:0)*(2*wa/w); a.z-=uz*push*(wa?1:0)*(2*wa/w);
      b.x+=ux*push*(wb?1:0)*(2*wb/w); b.z+=uz*push*(wb?1:0)*(2*wb/w);
      const slow=Math.min(1,sdt*3);
      a.speed*=1-slow; b.speed*=1-slow;
    }
  }
}

/* ---------------------------------------------------------------
   Drawing
   --------------------------------------------------------------- */
const BOAT_VS=HDR+`layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uVP;
uniform vec3 uOrigin;
uniform float uHeading,uPitch,uRoll,uScale,uMirror;
out vec3 vWorld; out vec3 vN; out vec2 vUV;
void main(){
  /* Hulls are modelled with +Z as the bow. Heading is clockwise from north,
     so +Z maps to (sin,−cos) exactly as the sailing ship's frame does. */
  float ch=cos(uHeading),sh=sin(uHeading),cp=cos(uPitch),sp=sin(uPitch),cr=cos(uRoll),sr=sin(uRoll);
  vec3 p=aPos*uScale;
  vec3 r=vec3(p.x*cr-p.y*sr,p.x*sr+p.y*cr,p.z);
  vec3 q=vec3(r.x,r.y*cp-r.z*sp,r.y*sp+r.z*cp);
  /* Fore-and-aft aligns with the heading; athwartships aligns with its beam. */
  vec3 w=vec3(uOrigin.x+q.x*ch+q.z*sh,uOrigin.y+q.y,uOrigin.z+q.x*sh-q.z*ch);
  vec3 n=vec3(aNormal.x*cr-aNormal.y*sr,aNormal.x*sr+aNormal.y*cr,aNormal.z);
  n=vec3(n.x,n.y*cp-n.z*sp,n.y*sp+n.z*cp);
  vN=vec3(n.x*ch+n.z*sh,n.y,n.x*sh-n.z*ch);
  vWorld=w; vUV=aUV;
  if(uMirror>0.5) w.y=-w.y;
  gl_Position=uVP*vec4(w,1.0);
}`;
const BOAT_FS=HDR+COMMON+`in vec3 vWorld; in vec3 vN; in vec2 vUV; out vec4 o;
uniform sampler2D uAtlas;
uniform vec3 uCamEff,uTint;
uniform float uMode,uMirror,uGhost,uWet;
void main(){
  if(uMirror>0.5&&vWorld.y<0.0) discard;
  /* Kenney's atlas is authored in sRGB with soft voronoi blends between
     palette cells, so a light decode plus a touch of contrast is enough. */
  vec3 albedo=pow(texture(uAtlas,vUV).rgb,vec3(1.9))*1.22*uTint;
  vec3 N=normalize(vN);
  if(!gl_FrontFacing) N=-N;
  vec3 V=normalize(uCamEff-vWorld), Hv=normalize(uLight+V);
  float nl=max(dot(N,uLight),0.0);
  vec3 hemi=mix(uHorizon*0.36+vec3(0.03),uZenith*0.46+vec3(0.09),N.y*0.5+0.5);
  vec3 col=albedo*(hemi+vec3(0.20*uAmbLum)+uSunCol*nl*0.54);
  float spec=pow(max(dot(N,Hv),0.0),38.0)*(0.10+0.30*uWet)*nl;
  col+=uSunCol*spec;
  /* Spray darkens the topsides a little, as GRP and varnish do. */
  col*=1.0-0.07*uWet;
  if(uGhost>0.5) col=col*vec3(0.56,0.90,0.86)+vec3(0.015,0.05,0.045)*uAmbLum;
  col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  if(uMode>0.5) o=vec4(enc(col),1.0); else o=vec4(tonemap(col),1.0);
}`;
const pBoat=program(BOAT_VS,BOAT_FS,'boats');

function drawBoats(mode,mirror,ce){
  if(!boats.enabled||boats.status!=='ready'||!boats.texture||!boats.list.length) return;
  gl.useProgram(pBoat); setSky(pBoat);
  gl.uniformMatrix4fv(L(pBoat,'uVP'),false,VP);
  gl.uniform1f(L(pBoat,'uMode'),mode);
  gl.uniform1f(L(pBoat,'uMirror'),mirror);
  gl.uniform3fv(L(pBoat,'uCamEff'),ce);
  gl.uniform1f(L(pBoat,'uWet'),clamp(sea,0,1));
  gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D,boats.texture);
  gl.uniform1i(L(pBoat,'uAtlas'),13);
  for(const b of boats.list){
    if(!b.frustum&&mode===0) continue;
    gl.uniform3f(L(pBoat,'uOrigin'),b.x,b.y,b.z);
    gl.uniform1f(L(pBoat,'uHeading'),b.heading);
    gl.uniform1f(L(pBoat,'uPitch'),-b.pitch);
    gl.uniform1f(L(pBoat,'uRoll'),b.roll);
    gl.uniform1f(L(pBoat,'uScale'),b.scale);
    gl.uniform1f(L(pBoat,'uGhost'),b.ghost?1:0);
    gl.uniform3f(L(pBoat,'uTint'),b.ghost?0.82:1,b.ghost?0.94:1,b.ghost?0.92:1);
    gl.bindVertexArray(b.model.vao);
    gl.drawElements(gl.TRIANGLES,b.model.count,b.model.indexType,0);
  }
  gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
}
Hooks.on('frame',(dt,sdt)=>{ if(boats.enabled&&boats.status==='ready') updateBoats(dt,sdt); });
