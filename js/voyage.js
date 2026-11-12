'use strict';
/* ============================================================
   Voyage instruments and a small, deliberately simple chart

   The pilot steers directly to one waypoint; it is not a path planner. The
   ship's own sampled-footprint check remains authoritative for shallow water.
   Waypoints and the bounded track are session state, not saved settings.
   ============================================================ */
const voyage={waypoint:null,pilot:false,arrived:false,cruise:0.65,track:[],cursor:[0,0],chartOpen:false,zoomed:false,uiClock:0};
const CHART_EXTENT=190,CHART_LOCAL_EXTENT=90,CHART_WAYPOINT_LIMIT=SHIP_LIMIT-8,MAX_VOYAGE_TRACK=160;
function voyageBearing(dx,dz){return Math.atan2(dx,-dz);}
function voyageAngleDelta(target,current){return Math.atan2(Math.sin(target-current),Math.cos(target-current));}
function headingDegrees(angle){return ((Math.round(angle/DEG)%360)+360)%360;}
function setText(id,text){const node=$(id);if(node.textContent!==text) node.textContent=text;}
function announceVoyage(text){setText('chartAnnouncement',text);}

function stopVoyagePilot(){
  if(!voyage.pilot) return;
  voyage.pilot=false;
  if(voyage.chartOpen) updateVoyageChart();
}
function voyageSteering(){
  if(!voyage.pilot||!voyage.waypoint||!ship.enabled) return 0;
  const dx=voyage.waypoint.x-ship.x,dz=voyage.waypoint.z-ship.z,distance=Math.hypot(dx,dz);
  if(distance<8+ship.speed){
    voyage.arrived=true;setShipAnchor(true);
    announceVoyage('Waypoint reached. The ship is anchoring.');
    if(typeof toast==='function') toast('Waypoint reached · dropping anchor');
    return 0;
  }
  const difference=voyageAngleDelta(voyageBearing(dx,dz),ship.heading);
  /* Slow for a large turn and on approach, rather than racing past a marker. */
  ship.throttle=Math.min(voyage.cruise,Math.abs(difference)>1.0?0.30:distance<25?0.38:voyage.cruise);
  return clamp(difference*1.6,-1,1);
}
function setVoyageWaypoint(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.hypot(x,z)>CHART_WAYPOINT_LIMIT){
    if(typeof toast==='function') toast('Choose a point inside the sailing area');return false;
  }
  if(Math.hypot(x-ship.x,z-ship.z)<14){
    if(typeof toast==='function') toast('Choose a waypoint a little farther away');return false;
  }
  const heading=voyageBearing(x-ship.x,z-ship.z);
  if(!shipPlacementOK(x,z,heading)){
    if(typeof toast==='function') toast('Choose deeper water for the waypoint');return false;
  }
  stopVoyagePilot();voyage.waypoint={x,z};voyage.arrived=false;voyage.cursor=[x,z];
  announceVoyage('Waypoint set. Start the pilot or steer there yourself.');
  updateVoyageChart();return true;
}
function clearVoyageWaypoint(){
  stopVoyagePilot();voyage.waypoint=null;voyage.arrived=false;
  announceVoyage('Waypoint cleared.');updateVoyageChart();
}
function toggleVoyagePilot(){
  if(voyage.pilot){
    stopVoyagePilot();
    announceVoyage('Pilot off. The ship keeps its present course.');
    toast('Pilot off · steering is yours');
  }else if(voyage.waypoint&&!voyage.arrived){
    voyage.cruise=Math.max(0.55,ship.throttle);setShipAnchor(false);voyage.pilot=true;
    announceVoyage('Pilot on. It follows a direct course and does not avoid islands.');
    toast('Pilot on · watch for land');
  }
  updateVoyageChart();updateHelmHUD();
}
function toggleShipAnchor(){
  if(!ship.enabled) return;
  setShipAnchor(!ship.anchored);
  if(typeof toast==='function') toast(ship.anchored?'Anchor down · slowing the ship':'Anchor up · raise sail to get underway');
  updateHelmHUD();
}
function resetVoyageTrack(){
  voyage.track=ship.enabled?[{x:ship.x,z:ship.z}]:[];
  if(voyage.chartOpen) updateVoyageChart();
}
function onShipDisabled(){
  stopVoyagePilot();voyage.waypoint=null;voyage.arrived=false;voyage.track=[];
  closeVoyageChart(false);
}
function onVoyageIslandsChanged(){
  /* A regenerated coast can invalidate both a destination and its route. */
  const hadCourse=!!voyage.waypoint,wasPiloting=voyage.pilot;
  if(wasPiloting) setShipAnchor(true);else stopVoyagePilot();
  voyage.waypoint=null;voyage.arrived=false;
  buildVoyageLand();
  if(hadCourse&&explore.active&&typeof toast==='function') toast('Coast changed · choose a new waypoint');
  if(voyage.chartOpen) updateVoyageChart();
}
function buildVoyageLand(){
  const group=$('chartLand');group.replaceChildren();
  if(!islands.active) return;
  const ns='http://www.w3.org/2000/svg';
  for(const island of islands.land){
    const points=[];
    for(let j=0;j<72;j++){
      const a=j*Math.PI*2/72,ca=Math.cos(a),sa=Math.sin(a);
      const point=r=>{
        const lx=ca*island.rx*r,lz=sa*island.rz*r;
        return [island.x+island.cs*lx-island.sn*lz,island.z+island.sn*lx+island.cs*lz];
      };
      let lo=0.35,hi=1.4;
      for(let k=0;k<12;k++){
        const mid=(lo+hi)*0.5,p=point(mid);
        if(islandGround(p[0],p[1])>0) lo=mid;else hi=mid;
      }
      const p=point((lo+hi)*0.5);points.push(p[0].toFixed(1)+','+p[1].toFixed(1));
    }
    const path=document.createElementNS(ns,'path');
    path.setAttribute('d','M'+points.join('L')+'Z');group.appendChild(path);
  }
}
function chartViewport(){
  return voyage.zoomed?{x:ship.x,z:ship.z,half:CHART_LOCAL_EXTENT}:{x:0,z:0,half:CHART_EXTENT};
}
function updateVoyageChart(){
  const view=chartViewport();
  $('chartMap').setAttribute('viewBox',[view.x-view.half,view.z-view.half,view.half*2,view.half*2].join(' '));
  $('chartBackground').setAttribute('transform','translate('+view.x+' '+view.z+') scale('+(view.half/CHART_EXTENT)+')');
  $('bChartZoom').textContent=voyage.zoomed?'Zoom out':'Zoom in';
  $('bChartZoom').setAttribute('aria-pressed',voyage.zoomed?'true':'false');
  const marker=$('chartMarker'),route=$('chartRoute'),cursor=$('chartCursor'),vessel=$('chartVessel');
  vessel.setAttribute('transform','translate('+ship.x.toFixed(2)+' '+ship.z.toFixed(2)+') rotate('+headingDegrees(ship.heading)+')');
  $('chartTrack').setAttribute('points',voyage.track.map(p=>p.x.toFixed(1)+','+p.z.toFixed(1)).join(' '));
  cursor.setAttribute('cx',voyage.cursor[0].toFixed(1));cursor.setAttribute('cy',voyage.cursor[1].toFixed(1));
  cursor.setAttribute('visibility',document.activeElement===$('chartMap')?'visible':'hidden');
  if(voyage.waypoint){
    const w=voyage.waypoint,dx=w.x-ship.x,dz=w.z-ship.z,distance=Math.hypot(dx,dz);
    marker.setAttribute('visibility','visible');marker.setAttribute('transform','translate('+w.x.toFixed(1)+' '+w.z.toFixed(1)+')');
    route.setAttribute('visibility','visible');route.setAttribute('x1',ship.x.toFixed(1));route.setAttribute('y1',ship.z.toFixed(1));
    route.setAttribute('x2',w.x.toFixed(1));route.setAttribute('y2',w.z.toFixed(1));
    const bearing=headingDegrees(voyageBearing(dx,dz));
    setText('chartDestination',voyage.arrived?'Waypoint reached':'Waypoint · '+Math.round(distance)+' m · '+String(bearing).padStart(3,'0')+'°');
  }else{
    marker.setAttribute('visibility','hidden');route.setAttribute('visibility','hidden');setText('chartDestination','No waypoint set');
  }
  const pilot=$('bPilot');pilot.disabled=!voyage.waypoint||voyage.arrived;
  pilot.textContent=voyage.pilot?'Stop pilot':'Start pilot';pilot.setAttribute('aria-pressed',voyage.pilot?'true':'false');
  $('bClearWaypoint').disabled=!voyage.waypoint;
}
function openVoyageChart(){
  if(!explore.active||explore.mode!=='helm') return;
  clearExploreInput();$('toasts').replaceChildren();voyage.chartOpen=true;voyage.cursor=[ship.x,ship.z];
  const panel=$('voyageChart');panel.hidden=false;panel.setAttribute('aria-hidden','false');
  document.body.classList.add('chart-open');$('bChart').setAttribute('aria-expanded','true');
  buildVoyageLand();updateVoyageChart();
  $('chartMap').focus({preventScroll:true});updateVoyageChart();
}
function closeVoyageChart(restoreFocus=true){
  if(!voyage.chartOpen) return;
  voyage.chartOpen=false;
  const panel=$('voyageChart');panel.hidden=true;panel.setAttribute('aria-hidden','true');
  document.body.classList.remove('chart-open');$('bChart').setAttribute('aria-expanded','false');
  if(restoreFocus&&explore.active) canvas.focus({preventScroll:true});
}
function updateHelmHUD(){
  if(!explore.active||explore.mode!=='helm') return;
  const heading=headingDegrees(ship.heading),power=Math.round(ship.throttle*100);
  setText('helmHeading',String(heading).padStart(3,'0')+'° '+compass(heading));
  setText('helmSpeed',(ship.speed*1.944).toFixed(1)+' kn');setText('helmPower',power+'%');
  setText('helmStatus',paused?'Paused':ship.anchored?'Anchored':envS.wind<0.2&&ship.throttle>0.05&&ship.speed<0.1?'No wind':
    voyage.pilot?'Pilot on':ship.speed<0.1&&ship.throttle<0.01?'Drifting':'Under sail');
  const slider=$('helmThrottle');if(Number(slider.value)!==power) slider.value=power;
  slider.style.setProperty('--p',power+'%');slider.setAttribute('aria-valuetext',power+' percent sail power');
  const anchor=$('bAnchor');anchor.textContent=ship.anchored?'Lift anchor':'Drop anchor';
  anchor.setAttribute('aria-pressed',ship.anchored?'true':'false');
  $('bHelmView').textContent=explore.helmView==='chase'?'Deck view':'Chase view';
}
function updateVoyage(dt,sdt){
  if(!ship.enabled) return;
  if(ship.status==='ready'){
    const last=voyage.track[voyage.track.length-1];
    if(!last||Math.hypot(ship.x-last.x,ship.z-last.z)>=2.5){
      voyage.track.push({x:ship.x,z:ship.z});
      if(voyage.track.length>MAX_VOYAGE_TRACK) voyage.track.shift();
    }
  }
  voyage.uiClock-=dt;
  if(voyage.uiClock<=0){
    voyage.uiClock=0.1;
    if(explore.active&&explore.mode==='helm') updateHelmHUD();
    if(voyage.chartOpen) updateVoyageChart();
  }
}
Hooks.on('frame',updateVoyage);

$('bAnchor').addEventListener('click',()=>{toggleShipAnchor();canvas.focus({preventScroll:true});});
$('bHelmView').addEventListener('click',toggleHelmView);
$('bChart').addEventListener('click',()=>{if(voyage.chartOpen) closeVoyageChart();else openVoyageChart();});
$('bCloseChart').addEventListener('click',()=>closeVoyageChart());
$('bChartZoom').addEventListener('click',()=>{voyage.zoomed=!voyage.zoomed;updateVoyageChart();});
$('bPilot').addEventListener('click',toggleVoyagePilot);
$('bClearWaypoint').addEventListener('click',clearVoyageWaypoint);
$('helmThrottle').addEventListener('input',event=>{
  stopVoyagePilot();ship.throttle=clamp(Number(event.target.value)/100,0,1);
  if(ship.throttle>0) setShipAnchor(false);
  updateHelmHUD();
});
$('chartMap').addEventListener('click',event=>{
  const rect=event.currentTarget.getBoundingClientRect(),view=chartViewport();
  const x=view.x+((event.clientX-rect.left)/rect.width*2-1)*view.half;
  const z=view.z+((event.clientY-rect.top)/rect.height*2-1)*view.half;
  setVoyageWaypoint(x,z);
});
$('chartMap').addEventListener('keydown',event=>{
  const key=event.key;
  if(key==='Escape'){event.preventDefault();event.stopPropagation();closeVoyageChart();return;}
  if(key==='Enter'||key===' '){event.preventDefault();event.stopPropagation();setVoyageWaypoint(voyage.cursor[0],voyage.cursor[1]);return;}
  const step=event.shiftKey?20:5;
  const move={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[key];
  if(!move) return;
  event.preventDefault();event.stopPropagation();
  let x=voyage.cursor[0]+move[0],z=voyage.cursor[1]+move[1],length=Math.hypot(x,z);
  if(length>CHART_WAYPOINT_LIMIT){x*=CHART_WAYPOINT_LIMIT/length;z*=CHART_WAYPOINT_LIMIT/length;}
  voyage.cursor=[x,z];updateVoyageChart();
  const dx=Math.round(x-ship.x),dz=Math.round(z-ship.z);
  const east=dx===0?'0 metres east or west':Math.abs(dx)+' metres '+(dx>0?'east':'west');
  const north=dz===0?'0 metres north or south':Math.abs(dz)+' metres '+(dz>0?'south':'north');
  announceVoyage('Chart cursor: '+east+' and '+north+' of the ship. Press Enter to set a waypoint.');
});
$('chartMap').addEventListener('focus',updateVoyageChart);
$('chartMap').addEventListener('blur',()=>{if(voyage.chartOpen) updateVoyageChart();});
