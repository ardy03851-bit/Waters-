'use strict';
/* ============================================================
   Procedural audio (Web Audio, no sound files)
   sea wash · wind · rain · thunder · splashes · ball knocks
   Everything is synthesised from filtered noise.  The context is only
   created after the user switches sound on (browsers require a gesture).
   ============================================================ */
const audio={ctx:null,on:false,vol:0.7,master:null,noise:null,brown:null,sea:null,wind:null,rain:null,lastSplash:0,lastKnock:0,t:0};

function audioNoiseBuffer(ctx,brown){
  const n=ctx.sampleRate*4, buf=ctx.createBuffer(1,n,ctx.sampleRate), d=buf.getChannelData(0);
  let last=0;
  for(let i=0;i<n;i++){
    const w=Math.random()*2-1;
    if(brown){ last=(last+0.02*w)/1.02; d[i]=last*3.5; } else d[i]=w;
  }
  /* cross-fade the ends so the loop is seamless */
  const f=Math.floor(ctx.sampleRate*0.05);
  for(let i=0;i<f;i++){ const k=i/f; d[i]=d[i]*k+d[n-f+i]*(1-k); }
  return buf;
}
function audioLoop(buf,type,freq,q){
  const c=audio.ctx, src=c.createBufferSource(), flt=c.createBiquadFilter(), g=c.createGain();
  src.buffer=buf; src.loop=true; src.loopEnd=buf.duration-0.05;
  flt.type=type; flt.frequency.value=freq; if(q) flt.Q.value=q;
  g.gain.value=0;
  src.connect(flt); flt.connect(g); g.connect(audio.master); src.start();
  return {src,flt,g};
}
function audioInit(){
  if(audio.ctx) return true;
  const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return false;
  try{
    const c=audio.ctx=new AC();
    audio.master=c.createGain(); audio.master.gain.value=0; audio.master.connect(c.destination);
    audio.noise=audioNoiseBuffer(c,false); audio.brown=audioNoiseBuffer(c,true);
    audio.sea=audioLoop(audio.brown,'lowpass',500,0);
    audio.wind=audioLoop(audio.noise,'bandpass',420,0.7);
    audio.rain=audioLoop(audio.noise,'highpass',2200,0);
    return true;
  }catch(e){ audio.ctx=null; return false; }
}
function audioSet(on,vol){
  if(vol!==undefined) audio.vol=clamp(vol,0,1);
  if(on!==undefined) audio.on=!!on;
  if(audio.on&&!audioInit()){ audio.on=false; return false; }
  if(!audio.ctx) return true;
  if(audio.on&&audio.ctx.state==='suspended') audio.ctx.resume().catch(()=>{});
  audio.master.gain.setTargetAtTime(audio.on?audio.vol:0,audio.ctx.currentTime,0.15);
  return true;
}
/* a browser may only let the context start after a gesture */
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{ if(audio.on&&audio.ctx&&audio.ctx.state==='suspended') audio.ctx.resume().catch(()=>{}); },{passive:true}));
document.addEventListener('visibilitychange',()=>{
  if(!audio.ctx) return;
  if(document.hidden) audio.ctx.suspend().catch(()=>{}); else if(audio.on) audio.ctx.resume().catch(()=>{});
});

/* ambience follows the weather – called every frame, updates ~8×/s */
function audioFrame(dt){
  if(!audio.on||!audio.ctx) return;
  audio.t+=dt; if(audio.t<0.12) return; audio.t=0;
  const c=audio.ctx, now=c.currentTime, live=paused?0:1;
  const wash=0.5+0.5*Math.sin(now*0.9)*Math.sin(now*0.37+1.3);
  audio.sea.g.gain.setTargetAtTime(live*(0.05+0.42*sea)*(0.65+0.35*wash),now,0.25);
  audio.sea.flt.frequency.setTargetAtTime(320+900*sea+250*wash,now,0.3);
  const w=clamp(envS.wind/24,0,1), gust=0.75+0.25*Math.sin(now*0.53+Math.sin(now*0.21)*2);
  audio.wind.g.gain.setTargetAtTime(live*0.30*w*w*gust,now,0.3);
  audio.wind.flt.frequency.setTargetAtTime(280+520*w*gust,now,0.4);
  audio.rain.g.gain.setTargetAtTime(live*(envS.snow?0:0.16*Math.pow(envS.precip,0.8)),now,0.3);
}
function audioBurst(buf,type,f0,f1,q,gain,attack,decay,delay){
  const c=audio.ctx, t=c.currentTime+(delay||0), src=c.createBufferSource(), flt=c.createBiquadFilter(), g=c.createGain();
  src.buffer=buf; src.loop=true;
  flt.type=type; flt.Q.value=q; flt.frequency.setValueAtTime(f0,t); flt.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+attack+decay);
  g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(gain,t+attack); g.gain.exponentialRampToValueAtTime(0.0001,t+attack+decay);
  src.connect(flt); flt.connect(g); g.connect(audio.master);
  src.start(t,Math.random()*3); src.stop(t+attack+decay+0.05);
}
function audioSplash(P,r){
  if(!audio.on||!audio.ctx||P<0.8) return;
  const now=performance.now(); if(now-audio.lastSplash<45) return; audio.lastSplash=now;
  const k=clamp(P/12,0.08,1), size=clamp(r/0.4,0.5,2);
  audioBurst(audio.noise,'bandpass',2600/size,700/size,0.8,0.55*k,0.006,0.35+0.5*k,0);          /* the slap and the spray */
  audioBurst(audio.brown,'lowpass',420/size,90,0.5,0.9*k,0.012,0.30+0.4*k,0.02);                 /* the deep "ploomp" of the cavity */
  if(P>2.5) audioBurst(audio.noise,'highpass',3500,5000,0.3,0.10*k,0.25,0.9,0.35);              /* drops raining back */
}
function audioKnock(strength){
  if(!audio.on||!audio.ctx) return;
  const now=performance.now(); if(now-audio.lastKnock<60) return; audio.lastKnock=now;
  const c=audio.ctx, t=c.currentTime, o=c.createOscillator(), g=c.createGain(), k=clamp(strength/6,0.05,1);
  o.type='sine'; o.frequency.setValueAtTime(260+180*Math.random(),t); o.frequency.exponentialRampToValueAtTime(110,t+0.09);
  g.gain.setValueAtTime(0.35*k,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.12);
  o.connect(g); g.connect(audio.master); o.start(t); o.stop(t+0.14);
}
/* thunder arrives after the flash: a crack, then a long low rumble */
function audioThunder(){
  if(!audio.on||!audio.ctx) return;
  const delay=0.3+Math.random()*2.2, near=1-delay/3;
  audioBurst(audio.noise,'lowpass',1800,200,0.4,0.5*near,0.01,0.5,delay);
  audioBurst(audio.brown,'lowpass',260,50,0.6,1.0,0.08,2.5+Math.random()*2,delay+0.05);
  audioBurst(audio.brown,'lowpass',140,40,0.8,0.7,0.6,3.5,delay+0.8);
}
onLightning=audioThunder;
