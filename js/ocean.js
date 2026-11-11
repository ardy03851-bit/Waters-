'use strict';
/* ============================================================
   Procedural tileable detail texture (ridged normals + fbm alpha)
   ============================================================ */
function hash2(x,y,seed){
  let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(seed,1274126177);
  h=Math.imul(h^(h>>>13),1274126177); h^=h>>>16; return (h>>>0)/4294967295;
}
function vnoise(x,y,per,seed){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const x0=((xi%per)+per)%per,x1=(x0+1)%per,y0=((yi%per)+per)%per,y1=(y0+1)%per;
  const a=hash2(x0,y0,seed),b=hash2(x1,y0,seed),c=hash2(x0,y1,seed),d=hash2(x1,y1,seed);
  return lerp(lerp(a,b,u),lerp(c,d,u),v);
}
function makeDetailTexture(){
  const S=256, rid=new Float32Array(S*S), fb=new Float32Array(S*S);
  for(let j=0;j<S;j++)for(let i=0;i<S;i++){
    let a=0,b=0,amp=0.5,tot=0;
    for(let o=0;o<5;o++){
      const per=4<<o, x=i/S*per, y=j/S*per;
      const n=vnoise(x,y,per,11+o*7);
      a+=amp*(1-Math.abs(2*n-1)); b+=amp*vnoise(x,y,per,101+o*13); tot+=amp; amp*=0.5;
    }
    rid[j*S+i]=a/tot; fb[j*S+i]=b/tot;
  }
  const gx=new Float32Array(S*S), gy=new Float32Array(S*S); let ss=0;
  for(let j=0;j<S;j++)for(let i=0;i<S;i++){
    const ip=(i+1)%S,im=(i+S-1)%S,jp=(j+1)%S,jm=(j+S-1)%S;
    const dx=rid[j*S+ip]-rid[j*S+im], dy=rid[jp*S+i]-rid[jm*S+i];
    gx[j*S+i]=dx; gy[j*S+i]=dy; ss+=dx*dx+dy*dy;
  }
  const sc=0.35/Math.sqrt(ss/(2*S*S));
  let mean=0; for(let i=0;i<S*S;i++) mean+=fb[i]; mean/=S*S;
  let sd=0; for(let i=0;i<S*S;i++) sd+=(fb[i]-mean)*(fb[i]-mean); sd=Math.sqrt(sd/(S*S));
  const data=new Uint8Array(S*S*4);
  for(let i=0;i<S*S;i++){
    let nx=-gx[i]*sc, ny=1, nz=-gy[i]*sc; const l=Math.hypot(nx,ny,nz); nx/=l;ny/=l;nz/=l;
    data[i*4]=(nx*0.5+0.5)*255; data[i*4+1]=(ny*0.5+0.5)*255; data[i*4+2]=(nz*0.5+0.5)*255;
    data[i*4+3]=clamp((fb[i]-mean)/(3.2*sd)+0.5,0,1)*255;
  }
  const t=gl.createTexture(); gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,S,S,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
  return t;
}
const texDetail=makeDetailTexture();

/* ============================================================
   Geometry: water grid, sphere, empty VAO
   ============================================================ */
const GN=288;
const waterVAO=gl.createVertexArray(); let waterIdxCount=0;
(function(){
  const n1=GN+1, pos=new Float32Array(n1*n1*2);
  for(let j=0;j<n1;j++)for(let i=0;i<n1;i++){ pos[(j*n1+i)*2]=-1+2*i/GN; pos[(j*n1+i)*2+1]=-1+2*j/GN; }
  const idx=new Uint32Array(GN*GN*6); let k=0;
  for(let j=0;j<GN;j++)for(let i=0;i<GN;i++){
    const a=j*n1+i,b=a+1,c=a+n1,d=c+1;
    idx[k++]=a;idx[k++]=c;idx[k++]=b; idx[k++]=b;idx[k++]=c;idx[k++]=d;
  }
  waterIdxCount=idx.length;
  gl.bindVertexArray(waterVAO);
  const vb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,pos,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
  gl.bindVertexArray(null);
})();

const sphereVAO=gl.createVertexArray(); let sphereIdxCount=0;
(function(){
  const LA=36,LO=56, v=[], idx=[];
  for(let a=0;a<=LA;a++){ const th=a/LA*Math.PI; for(let o=0;o<=LO;o++){ const ph=o/LO*Math.PI*2; v.push(Math.sin(th)*Math.cos(ph),Math.cos(th),Math.sin(th)*Math.sin(ph)); } }
  for(let a=0;a<LA;a++)for(let o=0;o<LO;o++){ const i=a*(LO+1)+o,j=i+LO+1; idx.push(i,j,i+1,i+1,j,j+1); }
  sphereIdxCount=idx.length;
  gl.bindVertexArray(sphereVAO);
  const vb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
  const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.STATIC_DRAW);
  gl.bindVertexArray(null);
})();
const emptyVAO=gl.createVertexArray();


/* ============================================================
   Ocean wave model (shared by GPU shader and CPU physics)
   ============================================================ */
let windAng=1.1;   /* direction the wind (and the waves) travel towards, radians */
const WL=[31,22.5,15,9.8,6.4,4.1,2.5,1.4];
const WOFF=[0,0.9,-0.75,0.45,-1.1,1.3,-1.5,2.0];
const wv=WL.map((Lw,i)=>{const k=2*Math.PI/Lw,a=windAng+WOFF[i];return{L:Lw,k,om:Math.sqrt(G*k),dx:Math.sin(a),dz:Math.cos(a),ph:i*2.399,A:0,q:0,qk:0};});
const uWArr=new Float32Array(32), uQArr=new Float32Array(8), uPhaseArr=new Float32Array(8);
/* One phase set is shared by CPU physics, water vertices and coastal foam.
   Different sessions do not all begin on the same repeating swell. The
   phases are not reset during island regeneration, avoiding a surface jump. */
function setWaveSeed(seed){
  for(let i=0;i<8;i++){
    wv[i].ph=hash2(i,seed|0,871)*Math.PI*2;
    uPhaseArr[i]=wv[i].ph;
  }
}
setWaveSeed(Math.floor(Math.random()*4294967296));
let waveA0=0.3;
function updateWaves(s){
  for(let i=0;i<8;i++){
    const w=wv[i], a=windAng+WOFF[i];
    w.dx=Math.sin(a); w.dz=Math.cos(a);
    w.A=w.L*0.014*(0.25+1.25*s);
    w.q=0.085*(0.35+0.65*s); w.qk=w.q/w.k;
    uWArr[i*4]=w.dx;uWArr[i*4+1]=w.dz;uWArr[i*4+2]=w.k;uWArr[i*4+3]=w.A; uQArr[i]=w.q;
  }
  waveA0=wv[0].A;
}
function waveSample(x,z,t,full,out){
  let px=x,pz=z; const its=full?3:2;
  for(let it=0;it<its;it++){
    let sx=0,sz=0;
    for(let i=0;i<8;i++){const w=wv[i];const c=Math.cos(w.k*(w.dx*px+w.dz*pz)-w.om*t+w.ph);sx+=w.dx*w.qk*c;sz+=w.dz*w.qk*c;}
    px=x-sx;pz=z-sz;
  }
  let h=0,vx=0,vy=0,vz=0,ax=0,az=0;
  for(let i=0;i<8;i++){
    const w=wv[i]; const th=w.k*(w.dx*px+w.dz*pz)-w.om*t+w.ph;
    const sn=Math.sin(th); h+=w.A*sn;
    if(full){
      const c=Math.cos(th); const vh=w.qk*w.om*sn; vx+=w.dx*vh;vz+=w.dz*vh; vy-=w.A*w.om*c;
      const ah=-w.qk*w.om*w.om*c; ax+=w.dx*ah; az+=w.dz*ah;
    }
  }
  out.h=h;out.vx=vx;out.vy=vy;out.vz=vz;out.ax=ax;out.az=az;
}
/* significant wave height of the current sea (4·σ of the surface elevation) */
function sigWaveHeight(){ let v=0; for(let i=0;i<8;i++) v+=wv[i].A*wv[i].A*0.5; return 4*Math.sqrt(v); }
function surfH(x,z,t){
  let h=0; for(let i=0;i<8;i++){const w=wv[i];h+=w.A*Math.sin(w.k*(w.dx*x+w.dz*z)-w.om*t+w.ph);} return h;
}
function approxH(x,z,t){
  let h=0; for(let i=0;i<3;i++){const w=wv[i];h+=w.A*Math.sin(w.k*(w.dx*x+w.dz*z)-w.om*t+w.ph);} return h;
}

/* ============================================================
   Interactive ripple + foam simulation (2D wave equation)
   ============================================================ */
const RN=192, RR=14;
const rA=new Float32Array(RN*RN), rB=new Float32Array(RN*RN);
let cur=rA, prv=rB;
const foamArr=new Float32Array(RN*RN), ripData=new Float32Array(RN*RN*2), dampArr=new Float32Array(RN*RN);
(function(){
  for(let y=0;y<RN;y++)for(let x=0;x<RN;x++){
    const d=Math.min(x,y,RN-1-x,RN-1-y); const e=d>=14?1:0.84+0.16*(d/14);
    dampArr[y*RN+x]=0.9968*e;
  }
})();
const cellSz=2*RR/RN, RC2=Math.pow(1.8/120/cellSz,2);
/* Hard limits. Whatever is thrown at the water, the interactive layer can never
   rise above RIP_MAX, and anything non-finite is flushed to flat water.        */
const RIP_MAX=0.5, RIP_SOFT=0.34;
function rippleStep(){
  for(let y=1;y<RN-1;y++){
    let i=y*RN+1;
    for(let x=1;x<RN-1;x++,i++){
      const c=cur[i];
      const lap=cur[i-1]+cur[i+1]+cur[i-RN]+cur[i+RN]-4*c;
      let v=(2*c-prv[i]+RC2*lap)*dampArr[i];
      if(v>RIP_SOFT) v=RIP_SOFT+(v-RIP_SOFT)*0.5; else if(v<-RIP_SOFT) v=-RIP_SOFT+(v+RIP_SOFT)*0.5;
      if(!(v<=RIP_MAX)) v=v>RIP_MAX?RIP_MAX:0;
      if(v<-RIP_MAX) v=-RIP_MAX;
      prv[i]=v;
      foamArr[i]*=0.9972;
    }
  }
  const t=cur;cur=prv;prv=t;
}
/* Disturbances are injected as *displacement* of the surface: the same amount is
   written to the current and the previous state, so no velocity is added.
   (Writing only the current state – as the first version did – turned every
   injection into a velocity kick; pushing a ball through the surface added one
   each physics step and the water kept accelerating upwards until it broke.)   */
function ripAdd(i,d){
  if(!(d===d)) return;
  let v=cur[i]+d; v=v>RIP_MAX?RIP_MAX:v<-RIP_MAX?-RIP_MAX:v;
  const applied=v-cur[i]; cur[i]=v;
  let pv=prv[i]+applied; prv[i]=pv>RIP_MAX?RIP_MAX:pv<-RIP_MAX?-RIP_MAX:pv;
}
function addRipple(wx,wz,rad,amt){
  if(!isFinite(wx+wz+rad+amt)) return;
  const gx=(wx/(2*RR)+0.5)*RN-0.5,gz=(wz/(2*RR)+0.5)*RN-0.5,rc=rad/cellSz;
  const x0=Math.max(1,Math.floor(gx-rc)),x1=Math.min(RN-2,Math.ceil(gx+rc));
  const z0=Math.max(1,Math.floor(gz-rc)),z1=Math.min(RN-2,Math.ceil(gz+rc));
  const r2=rc*rc;
  for(let zi=z0;zi<=z1;zi++)for(let xi=x0;xi<=x1;xi++){
    const dx=xi-gx,dz=zi-gz,d2=(dx*dx+dz*dz)/r2; if(d2>=1)continue;
    let w=1-d2;w*=w; ripAdd(zi*RN+xi,amt*w);
  }
}
function addFoam(wx,wz,rad,amt){
  if(!isFinite(wx+wz+rad+amt)) return;
  const gx=(wx/(2*RR)+0.5)*RN-0.5,gz=(wz/(2*RR)+0.5)*RN-0.5,rc=rad/cellSz;
  const x0=Math.max(1,Math.floor(gx-rc)),x1=Math.min(RN-2,Math.ceil(gx+rc));
  const z0=Math.max(1,Math.floor(gz-rc)),z1=Math.min(RN-2,Math.ceil(gz+rc));
  const r2=rc*rc;
  for(let zi=z0;zi<=z1;zi++)for(let xi=x0;xi<=x1;xi++){
    const dx=xi-gx,dz=zi-gz,d2=(dx*dx+dz*dz)/r2; if(d2>=1)continue;
    const i=zi*RN+xi; const v=foamArr[i]+amt*(1-d2); foamArr[i]=v>1.2?1.2:v;
  }
}
/* annular bump: the raised rim that surrounds an impact cavity */
function addRing(wx,wz,rad,wid,amt){
  if(!isFinite(wx+wz+rad+wid+amt)) return;
  const gx=(wx/(2*RR)+0.5)*RN-0.5,gz=(wz/(2*RR)+0.5)*RN-0.5,rc=rad/cellSz,wc=Math.max(wid/cellSz,0.8),ro=rc+2*wc;
  const x0=Math.max(1,Math.floor(gx-ro)),x1=Math.min(RN-2,Math.ceil(gx+ro));
  const z0=Math.max(1,Math.floor(gz-ro)),z1=Math.min(RN-2,Math.ceil(gz+ro));
  for(let zi=z0;zi<=z1;zi++)for(let xi=x0;xi<=x1;xi++){
    const dx=xi-gx,dz=zi-gz,q=(Math.sqrt(dx*dx+dz*dz)-rc)/wc; if(q>2||q<-2)continue;
    ripAdd(zi*RN+xi,amt*Math.exp(-q*q*1.4));
  }
}
function resetRipples(){ rA.fill(0); rB.fill(0); foamArr.fill(0); }
const texRip=gl.createTexture();
gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,texRip);
gl.texImage2D(gl.TEXTURE_2D,0,gl.RG16F,RN,RN,0,gl.RG,gl.FLOAT,ripData);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
function uploadRipple(){
  for(let i=0;i<RN*RN;i++){ ripData[i*2]=cur[i]; ripData[i*2+1]=foamArr[i]; }
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,texRip);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,RN,RN,gl.RG,gl.FLOAT,ripData);
}

/* ============================================================
   Render targets (scene colour/depth for refraction, reflection)
   ============================================================ */
let scene=null, refl=null, post=null, motion=null, rW=0, rH=0;
function makeTargets(w,h){
  if(scene){ gl.deleteFramebuffer(scene.fb); gl.deleteTexture(scene.color); gl.deleteTexture(scene.depth); }
  if(refl){ gl.deleteFramebuffer(refl.fb); gl.deleteTexture(refl.color); gl.deleteRenderbuffer(refl.depth); }
  if(motion){ gl.deleteFramebuffer(motion.fb); gl.deleteTexture(motion.color); gl.deleteFramebuffer(motion.tileFb); gl.deleteTexture(motion.tile); }
  if(post){ gl.deleteFramebuffer(post.fb); gl.deleteTexture(post.color); gl.deleteTexture(post.depth); }
  gl.activeTexture(gl.TEXTURE7);
  scene={fb:gl.createFramebuffer(),color:gl.createTexture(),depth:gl.createTexture()};
  gl.bindTexture(gl.TEXTURE_2D,scene.color);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D,scene.depth);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,scene.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,scene.color,0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,scene.depth,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) showErr('Scene FBO incomplete');
  /* enhanced graphics: render ball reflections at full resolution instead of half */
  if(hqMode){ rW=Math.max(2,w); rH=Math.max(2,h); } else { rW=Math.max(2,w>>1); rH=Math.max(2,h>>1); }
  refl={fb:gl.createFramebuffer(),color:gl.createTexture(),depth:gl.createRenderbuffer()};
  gl.bindTexture(gl.TEXTURE_2D,refl.color);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,rW,rH,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindRenderbuffer(gl.RENDERBUFFER,refl.depth); gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,rW,rH);
  gl.bindFramebuffer(gl.FRAMEBUFFER,refl.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,refl.color,0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,refl.depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) showErr('Reflection FBO incomplete');
  /* full-res target the whole frame is drawn into before the post pass
     (camera motion blur + lens effects) resolves it onto the canvas */
  post={fb:gl.createFramebuffer(),color:gl.createTexture(),depth:gl.createTexture()};
  gl.bindTexture(gl.TEXTURE_2D,post.color);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D,post.depth);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,post.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,post.color,0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,post.depth,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) showErr('Post FBO incomplete');

  /* A separate colour target shares the main depth, so only visible ball
     fragments write motion. RGBA8 packing avoids requiring float render targets. */
  motion={fb:gl.createFramebuffer(),color:gl.createTexture(),tileFb:gl.createFramebuffer(),tile:gl.createTexture(),
    tileW:Math.ceil(w/8),tileH:Math.ceil(h/8)};
  gl.bindTexture(gl.TEXTURE_2D,motion.color);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,motion.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,motion.color,0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,post.depth,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) showErr('Motion FBO incomplete');
  gl.bindTexture(gl.TEXTURE_2D,motion.tile);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,motion.tileW,motion.tileH,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,motion.tileFb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,motion.tile,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) showErr('Motion tile FBO incomplete');
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}

