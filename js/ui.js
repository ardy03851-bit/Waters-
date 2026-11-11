'use strict';
/* ============================================================
   UI – liquid-glass controls
   ============================================================ */
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* restart a one-shot CSS animation class */
function replay(el,cls){ el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

/* ---- toasts ---- */
function toast(msg){
  const box=$('toasts'), t=document.createElement('div');
  t.className='toast glass'; t.innerHTML='<span class="dot"></span>'; t.appendChild(document.createTextNode(msg));
  box.appendChild(t);
  while(box.children.length>2) box.firstChild.remove();
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),450); },1500);
}

/* ---- ball type chips with a sliding glass highlight ---- */
const chipsEl=$('chips'), chipInd=$('chipInd');
function moveChipInd(){
  const c=chipsEl.querySelector('.chip.on'); if(!c) return;
  chipInd.style.width=c.offsetWidth+'px';
  chipInd.style.height=c.offsetHeight+'px';
  chipInd.style.transform='translateX('+c.offsetLeft+'px)';
  chipInd.classList.add('ready');
}
function selectType(i,quiet){
  selType=i;
  const chips=chipsEl.querySelectorAll('.chip');
  chips.forEach((c,k)=>c.classList.toggle('on',k===i));
  moveChipInd();
  if(!quiet) chips[i].scrollIntoView({behavior:reduceMotion?'auto':'smooth',inline:'nearest',block:'nearest'});
}
TYPES.forEach((T,i)=>{
  const b=document.createElement('button'); b.className='chip'+(i===0?' on':''); b.style.setProperty('--i',i);
  b.innerHTML='<span class="sw" style="background:'+T.sw+'"></span><span>'+T.name+'<small>'+T.sub+'</small></span>';
  b.onclick=()=>selectType(i);
  chipsEl.appendChild(b);
});
addEventListener('resize',moveChipInd);
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(moveChipInd);
requestAnimationFrame(moveChipInd);

/* ---- sliders ---- */
function setFill(el){ el.style.setProperty('--p',((el.value-el.min)/(el.max-el.min)*100)+'%'); }
function setVal(id,txt){ const el=$(id); if(el.textContent!==txt){ el.textContent=txt; replay(el,'pop'); } }
const sSize=$('sSize'),sSea=$('sSea'),sSun=$('sSun');
function seaName(v){return v<12?'Glassy':v<30?'Calm':v<50?'Moderate':v<72?'Rough':v<90?'Very rough':'Storm';}
function sunName(v){return v<12?'Sunset':v<30?'Golden hour':v<62?'Afternoon':'Midday';}
sSize.oninput=()=>{sizeMul=sSize.value/100;setVal('vSize',sizeMul.toFixed(1)+'×');setFill(sSize);};
sSea.oninput=()=>{seaT=sSea.value/100;setVal('vSea',seaName(+sSea.value));setFill(sSea);};
sSun.oninput=()=>{sunV=sSun.value/100;setVal('vSun',sunName(+sSun.value));setFill(sSun);};
[sSize,sSea,sSun].forEach(s=>{s.oninput();});

/* ---- actions ---- */
function dropBall(){ hideHint(); spawnBall((Math.random()-0.5)*3,4.5,(Math.random()-0.5)*3,selType); replay($('bDrop'),'fired'); }
function ballRain(){
  hideHint(); toast('Ball rain incoming');
  for(let i=0;i<10;i++) setTimeout(()=>spawnBall((Math.random()-0.5)*11,5+Math.random()*5,(Math.random()-0.5)*11,Math.floor(Math.random()*TYPES.length)),i*110);
}
function clearAll(){ const n=balls.length; balls.length=0; grab=null; clearSplashes(); replay($('bClear'),'fired'); toast(n?'Cleared '+n+' ball'+(n>1?'s':''):'Nothing to clear'); }
function toggleSlow(){
  timeScale=timeScale===1?0.2:1; const on=timeScale!==1;
  shutter=on?0.006:0.02;   /* high-speed camera: crisp drops */
  $('bSlow').classList.toggle('on',on); document.body.classList.toggle('slow',on);
}
function setDock(show){
  $('dock').classList.toggle('hidden',!show); $('fab').classList.toggle('show',!show);
  if(show) setTimeout(moveChipInd,50);
}
$('bDrop').onclick=dropBall;
$('bRain').onclick=ballRain;
$('bClear').onclick=clearAll;
$('bSlow').onclick=toggleSlow;
$('bHide').onclick=()=>setDock(false);
$('fab').onclick=()=>setDock(true);
setTimeout(hideHint,14000);

addEventListener('keydown',e=>{
  if(e.repeat||e.metaKey||e.ctrlKey||e.altKey) return;
  const k=e.key.toLowerCase();
  if(k===' '){ e.preventDefault(); dropBall(); }
  else if(k==='r') ballRain();
  else if(k==='s') toggleSlow();
  else if(k==='c') clearAll();
  else if(k==='h') setDock($('dock').classList.contains('hidden'));
  else if(k>='1'&&k<=String(TYPES.length)) selectType(+k-1);
});

/* ---- click ripples on buttons and chips ---- */
document.addEventListener('pointerdown',e=>{
  const b=e.target.closest&&e.target.closest('.btn,.chip,#fab'); if(!b||reduceMotion) return;
  const r=b.getBoundingClientRect(), d=Math.max(r.width,r.height)*2.2, s=document.createElement('span');
  s.className='rip'; s.style.width=s.style.height=d+'px';
  s.style.left=(e.clientX-r.left-d/2)+'px'; s.style.top=(e.clientY-r.top-d/2)+'px';
  if(b.classList.contains('chip')||b.id==='fab') b.style.overflow='hidden';
  b.appendChild(s); setTimeout(()=>s.remove(),720);
});

/* ---- glare that follows the mouse across every glass panel ---- */
(function(){
  let px=0,py=0,queued=false;
  function apply(){
    queued=false;
    document.querySelectorAll('.glass').forEach(g=>{
      const r=g.getBoundingClientRect();
      const near=px>r.left-90&&px<r.right+90&&py>r.top-90&&py<r.bottom+90;
      g.style.setProperty('--glare',near?1:0);
      if(near){ g.style.setProperty('--mx',(px-r.left)+'px'); g.style.setProperty('--my',(py-r.top)+'px'); }
    });
  }
  addEventListener('pointermove',e=>{ if(e.pointerType!=='mouse')return; px=e.clientX;py=e.clientY; if(!queued){queued=true;requestAnimationFrame(apply);} },{passive:true});
  document.addEventListener('pointerleave',()=>{ px=py=-9999; apply(); });
})();

/* ---- live stats ---- */
const stat={fps:'',balls:'',res:'',sea:''};
function updateStats(fps,nBalls,res,seaPct){
  const f=String(fps), b=String(nBalls), r=res.toFixed(2)+'×', s=seaPct+'%';
  if(f!==stat.fps){ stat.fps=f; $('stFps').textContent=f; $('stats').querySelector('.live').classList.toggle('warn',fps<45); }
  if(b!==stat.balls){ stat.balls=b; const el=$('stBalls'); el.textContent=b; replay(el,'pop'); }
  if(r!==stat.res){ stat.res=r; $('stRes').textContent=r; }
  if(s!==stat.sea){ stat.sea=s; $('stSea').textContent=s; }
}

/* ---- intro: lift the curtain once the first frames are on screen ---- */
let bootT=performance.now(), booted=false;
function uiReady(){
  if(booted) return; booted=true;
  setTimeout(()=>{ document.body.classList.remove('booting'); setTimeout(moveChipInd,60); },Math.max(0,(reduceMotion?0:1100)-(performance.now()-bootT)));
}
