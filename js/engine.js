'use strict';
/* ============================================================
   Engine extension layer

   The showcase is built as a set of small modules (physics, ocean,
   splash, weather, render, UI). This file adds a thin extension
   layer on top so new content can plug in without touching the
   internals:

     Hooks  – named events fired from the main loop that anyone can
              listen to. Currently fired:
                'frame'  (dt, sdt)   every frame, after simulation
                'render' ()           after the frame is drawn
                'burst'  (ball, P)    when a water balloon pops
     Aqua   – a small public API on window.Aqua, handy from the
              console, bookmarks or user scripts.

   Example – make every splash glow for a night swim:
     Aqua.hooks.on('frame',(dt)=>{ ... });
   ============================================================ */
const Hooks={
  list:{frame:[],render:[],burst:[]},
  on(name,fn){ (this.list[name]=this.list[name]||[]).push(fn); return fn; },
  off(name,fn){ const l=this.list[name]; if(!l) return; const i=l.indexOf(fn); if(i>=0) l.splice(i,1); },
  run(name,a,b){ const l=this.list[name]; if(!l) return; for(let i=0;i<l.length;i++) l[i](a,b); }
};

window.Aqua={
  version:'1.4.0',
  hooks:Hooks,
  /* live view of the simulated balls */
  get balls(){ return balls; },
  /* spawn a ball: Aqua.spawn(x,y,z,type, vx,vy,vz) – type is optional */
  spawn(x,y,z,type,vx,vy,vz){ return spawnBall(x,y,z,type||0,vx||0,vy||0,vz||0); },
  /* drop n random balls over the sea */
  rain(n){ n=n||10; for(let i=0;i<n;i++) spawnBall((Math.random()-0.5)*10,4.5+Math.random()*4,(Math.random()-0.5)*10,Math.floor(Math.random()*TYPES.length)); },
  clear(){ clearAll(); },
  /* environment: Aqua.weather('storm') · Aqua.time(19.5) */
  weather(id){ setWeather(id); },
  time(h){ userSet('hour',h); },
  ship(on){ userSet('ship',on===undefined?!ship.enabled:!!on); },
  /* Aqua.shipClass() lists the fleet · Aqua.shipClass(4) picks one */
  shipClass(index){
    if(index===undefined) return SHIP_CLASSES.map((c,i)=>i+': '+c.name);
    const i=clamp(Math.round(index),0,SHIP_CLASSES.length-1);
    userSet('shipClass',i);
    return SHIP_CLASSES[i].name;
  },
  /* aqua biome helpers: Aqua.biome('moss') · Aqua.biome() lists them */
  biome(id){
    if(id===undefined) return Object.keys(ISLAND_BIOMES).concat(['mixed']);
    userSet('islandBiome',id);
    return id;
  },
  /* post effects: Aqua.post('bloom',false) */
  post(name,on){
    if(name==='bloom') userSet('bloom',on===undefined?!S.bloom:!!on);
    else if(name==='fxaa') userSet('fxaa',on===undefined?!S.fxaa:!!on);
    return {bloom:S.bloom,fxaa:S.fxaa};
  },
  /* rolling material atlas state, handy for a console check */
  get materials(){ return {balls:ballAtlas.ready,loaded:ballAtlas.loaded,tile:ballAtlas.tile}; },
  explore(on){ if(on===undefined) toggleExplore(); else if(on) enterExplore(); else exitExplore(); },
  sail(){ enterSailing(); },
  quake(kind){ return kind==='island'?triggerIslandQuake():triggerSeaQuake(); },
  /* cinema mode & video recording, same as the UI buttons */
  cinema(on){ setCinema(on===undefined?!document.body.classList.contains('cinema'):on); },
  record(){ toggleRecord(); }
};
