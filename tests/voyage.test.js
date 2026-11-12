'use strict';
/* Deterministic sailing and pilot checks without a graphics or DOM dependency.
   The companion browser test exercises the actual controls and renderer. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function fixture(){
  const gl=new Proxy({deleteBuffer(){},deleteVertexArray(){},deleteTexture(){}},{
    get(target,key){if(key in target)return target[key];if(typeof key==='string'&&key.toUpperCase()===key)return 0;return ()=>{};}
  });
  const elements=new Map();
  function element(id){
    if(!elements.has(id)) elements.set(id,{id,textContent:'',value:'0',hidden:false,disabled:false,
      attributes:{},style:{setProperty(){}},classList:{add(){},remove(){}},
      addEventListener(){},setAttribute(k,v){this.attributes[k]=String(v);},replaceChildren(){},appendChild(){},focus(){}});
    return elements.get(id);
  }
  const document={activeElement:null,body:{classList:{add(){},remove(){}}},createElementNS:()=>element('path')};
  const ctx=vm.createContext({gl,console,Math,Float32Array,Uint8Array,Uint16Array,ArrayBuffer,Number,document,$:element,canvas:element('canvas'),setTimeout,HDR:'',COMMON:'',program:()=>({}),L:()=>null});
  vm.runInContext(`
    const clamp=(x,a,b)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t,DEG=Math.PI/180;
    let simT=0,sea=0.35,windAng=0,havePrev=false,bounceMul=1,paused=false,blocked=false;
    const envS={wind:8},islands={active:false,land:[]},balls=[],coastFoam=[],MAX_COAST_FOAM=200;
    const explore={active:true,mode:'helm',keys:new Set(),touchKeys:new Map(),helmView:'chase'};
    const Hooks={on(){}};let notices=[];
    function toast(s){notices.push(s);} function compass(){return 'N';}
    function islandGround(x,z){return blocked&&x>=-5&&x<=20&&Math.abs(z)<12?3:-30;}
    function waveSample(x,z,t,full,out){out.h=0.12*Math.sin(x*.12+t*.7)+0.05*Math.cos(z*.1+t*.4);}
    function surfH(x,z,t){return 0.12*Math.sin(x*.12+t*.7)+0.05*Math.cos(z*.1+t*.4);}
    function putSurf(array,max,item){array.push(item);if(array.length>max)array.shift();}
    function addFoam(){} function crownSurfSheet(){} function waterBalloonBurst(){} function audioKnock(){}
    function explorePressed(key){return explore.keys.has(key);} function toggleHelmView(){}
    function onShipTurned(delta){globalThis.totalTurn=(globalThis.totalTurn||0)+delta;}
    ${read('js/ship.js')}
    ${read('js/voyage.js')}
    globalThis.api={ship,voyage,islands,explore,coastFoam,notices,shipPoint,shipLocal,shipMatrix,
      shipPlacementOK,setShipAnchor,setVoyageWaypoint,toggleVoyagePilot,updateVoyage,onVoyageIslandsChanged,
      updateShip,headingDegrees,voyageBearing,voyageAngleDelta,collideShip,
      init(){ship.enabled=true;ship.status='ready';ship.poseReady=false;updateShip(0,0);},
      tick(count,dt=.05){for(let i=0;i<count;i++){simT+=dt;updateShip(dt,dt);updateVoyage(dt,dt);}},
      freeze(count){for(let i=0;i<count;i++)updateShip(.05,0);},
      block(v){blocked=v;islands.active=v;},wind(v){envS.wind=v;},time(){return simT;}
    };
  `,ctx,{timeout:20000});
  return {api:ctx.api,elements,ctx};
}

test('sail power, helm, anchor and pause move the same rigid ship pose',()=>{
  const {api,ctx}=fixture();api.init();
  const initial=[api.ship.x,api.ship.z];
  assert.equal(api.ship.anchored,true);
  api.explore.keys.add('w');api.tick(45);
  assert.equal(api.ship.anchored,false);assert.ok(api.ship.throttle>.9);assert.ok(api.ship.speed>1);
  assert.ok(Math.hypot(api.ship.x-initial[0],api.ship.z-initial[1])>1,'raising sail moves the hull');
  assert.ok(api.coastFoam.length>0,'a moving hull leaves bounded foam');
  api.explore.keys.clear();const heading=api.ship.heading;
  api.explore.keys.add('d');api.tick(25);api.explore.keys.clear();
  assert.ok(api.ship.heading>heading+.2);assert.ok(ctx.totalTurn>0,'the deck camera turns with the hull');
  const local=[1.2,2.1,-.8],world=api.shipPoint(...local),roundtrip=api.shipLocal(...world);
  roundtrip.forEach((n,i)=>assert.ok(Math.abs(n-local[i])<1e-5,'render and deck transforms remain inverse'));
  const frozen=[api.ship.x,api.ship.z,api.ship.heading,api.ship.throttle];
  api.explore.keys.add('w');api.freeze(10);api.explore.keys.clear();
  assert.deepEqual([api.ship.x,api.ship.z,api.ship.heading,api.ship.throttle],frozen,'paused simulation cannot sail or change power');
  api.setShipAnchor(true);api.tick(100);
  assert.equal(api.ship.throttle,0);assert.equal(api.ship.anchored,true);assert.ok(api.ship.speed<.01);
});

test('sailing responds to wind instead of travelling at full speed in a calm',()=>{
  const {api}=fixture();api.init();api.wind(0);api.ship.anchored=false;api.ship.throttle=1;
  api.tick(80);assert.equal(api.ship.speed,0);assert.equal(api.ship.x,0);
  api.wind(8);api.tick(80);assert.ok(api.ship.speed>1);assert.ok(api.ship.x>2);
  api.wind(0);api.tick(200);assert.ok(api.ship.speed<.01,'the vessel coasts to a stop as the wind dies');
});

test('rotated ship footprints stop in shallow water and at the sailing boundary',()=>{
  const {api}=fixture();api.init();api.block(true);
  Object.assign(api.ship,{x:-35,z:0,heading:Math.PI/2,anchored:false,throttle:1,speed:0,poseReady:false});
  assert.equal(api.shipPlacementOK(api.ship.x,api.ship.z),true);
  let stopped=false;
  for(let i=0;i<300;i++){
    api.tick(1);assert.equal(api.shipPlacementOK(api.ship.x,api.ship.z),true,'the whole footprint stays in deep water');
    if(i>10&&api.ship.throttle===0){stopped=true;break;}
  }
  assert.equal(stopped,true);assert.equal(api.ship.speed,0);assert.ok(api.ship.x<-14);
  api.block(false);Object.assign(api.ship,{x:179.7,z:0,heading:Math.PI/2,anchored:false,throttle:1,speed:3});
  api.tick(10);assert.ok(Math.hypot(api.ship.x,api.ship.z)<=180);assert.equal(api.ship.speed,0);
});

test('the direct pilot reaches open-water waypoints, yields to manual input, and resets on coast changes',()=>{
  const {api}=fixture();api.init();
  assert.equal(api.setVoyageWaypoint(2,0),false,'a waypoint must be meaningfully ahead');
  assert.equal(api.setVoyageWaypoint(200,0),false,'a waypoint must be inside the sailing area');
  assert.equal(api.setVoyageWaypoint(50,-60),true);api.toggleVoyagePilot();
  assert.equal(api.voyage.pilot,true);assert.equal(api.ship.anchored,false);
  for(let i=0;i<2000&&api.voyage.pilot;i++) api.tick(1);
  assert.equal(api.voyage.arrived,true);assert.equal(api.voyage.pilot,false);assert.equal(api.ship.anchored,true);
  assert.ok(Math.hypot(api.ship.x-50,api.ship.z+60)<11,'the pilot slows and anchors near its marker');
  assert.equal(api.setVoyageWaypoint(0,50),true);api.toggleVoyagePilot();
  api.explore.keys.add('a');api.tick(1);api.explore.keys.clear();
  assert.equal(api.voyage.pilot,false,'manual steering immediately takes control');
  api.toggleVoyagePilot();assert.equal(api.voyage.pilot,true);
  api.onVoyageIslandsChanged();
  assert.equal(api.voyage.pilot,false);assert.equal(api.voyage.waypoint,null);assert.equal(api.ship.anchored,true);
});

test('heading and track instruments remain bounded and use north-up bearings',()=>{
  const {api}=fixture();api.init();
  assert.equal(api.headingDegrees(0),0);assert.equal(api.headingDegrees(Math.PI/2),90);
  assert.equal(api.headingDegrees(-Math.PI/2),270);
  assert.ok(Math.abs(api.voyageBearing(0,-10))<1e-10);
  assert.ok(Math.abs(api.voyageBearing(10,0)-Math.PI/2)<1e-10);
  assert.ok(Math.abs(api.voyageAngleDelta(.01,Math.PI*2-.01)-.02)<1e-10);
  for(let i=0;i<220;i++){api.ship.x=i*3;api.updateVoyage(.1,.1);}
  assert.equal(api.voyage.track.length,160);
  assert.ok(api.voyage.track[0].x>0,'old trail points are discarded');
});
