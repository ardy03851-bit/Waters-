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
const WIND_ANG=1.1;
const WL=[26,17,11.5,7.2,4.6,3.0,2.0,1.3];
const WOFF=[0,0.35,-0.4,0.8,-0.9,1.3,-1.5,2.0];
const wv=WL.map((Lw,i)=>{const k=2*Math.PI/Lw,a=WIND_ANG+WOFF[i];return{L:Lw,k,om:Math.sqrt(G*k),dx:Math.sin(a),dz:Math.cos(a),ph:i*2.399,A:0,q:0,qk:0};});
const uWArr=new Float32Array(32), uQArr=new Float32Array(8);
let waveA0=0.3;
function updateWaves(s){
  for(let i=0;i<8;i++){
    const w=wv[i];
    w.A=w.L*0.016*(0.25+1.25*s);
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
function rippleStep(){
  for(let y=1;y<RN-1;y++){
    let i=y*RN+1;
    for(let x=1;x<RN-1;x++,i++){
      const c=cur[i];
      const lap=cur[i-1]+cur[i+1]+cur[i-RN]+cur[i+RN]-4*c;
      prv[i]=(2*c-prv[i]+RC2*lap)*dampArr[i];
      foamArr[i]*=0.9972;
    }
  }
  const t=cur;cur=prv;prv=t;
}
function addRipple(wx,wz,rad,amt){
  const gx=(wx/(2*RR)+0.5)*RN-0.5,gz=(wz/(2*RR)+0.5)*RN-0.5,rc=rad/cellSz;
  const x0=Math.max(1,Math.floor(gx-rc)),x1=Math.min(RN-2,Math.ceil(gx+rc));
  const z0=Math.max(1,Math.floor(gz-rc)),z1=Math.min(RN-2,Math.ceil(gz+rc));
  const r2=rc*rc;
  for(let zi=z0;zi<=z1;zi++)for(let xi=x0;xi<=x1;xi++){
    const dx=xi-gx,dz=zi-gz,d2=(dx*dx+dz*dz)/r2; if(d2>=1)continue;
    let w=1-d2;w*=w; const i=zi*RN+xi; let v=cur[i]+amt*w; cur[i]=v>0.7?0.7:v<-0.7?-0.7:v;
  }
}
function addFoam(wx,wz,rad,amt){
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
  const gx=(wx/(2*RR)+0.5)*RN-0.5,gz=(wz/(2*RR)+0.5)*RN-0.5,rc=rad/cellSz,wc=Math.max(wid/cellSz,0.8),ro=rc+2*wc;
  const x0=Math.max(1,Math.floor(gx-ro)),x1=Math.min(RN-2,Math.ceil(gx+ro));
  const z0=Math.max(1,Math.floor(gz-ro)),z1=Math.min(RN-2,Math.ceil(gz+ro));
  for(let zi=z0;zi<=z1;zi++)for(let xi=x0;xi<=x1;xi++){
    const dx=xi-gx,dz=zi-gz,q=(Math.sqrt(dx*dx+dz*dz)-rc)/wc; if(q>2||q<-2)continue;
    const i=zi*RN+xi; const v=cur[i]+amt*Math.exp(-q*q*1.4); cur[i]=v>0.7?0.7:v<-0.7?-0.7:v;
  }
}
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
let scene=null, refl=null, rW=0, rH=0;
function makeTargets(w,h){
  if(scene){ gl.deleteFramebuffer(scene.fb); gl.deleteTexture(scene.color); gl.deleteTexture(scene.depth); }
  if(refl){ gl.deleteFramebuffer(refl.fb); gl.deleteTexture(refl.color); gl.deleteRenderbuffer(refl.depth); }
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
  rW=Math.max(2,w>>1); rH=Math.max(2,h>>1);
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
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}

/* ============================================================
   Sky / time of day
   ============================================================ */
let sea=0.38, seaT=0.38, sunV=0.58;
const sky={sun:[0,1,0],sunCol:[1,1,1],zenith:[0,0,0],horizon:[0,0,0],glow:[0,0,0],ambLum:1,sunLum:3,cloudLo:0.6,storm:0};
function updateSky(){
  const eps=0.03+sunV*1.22, day=sstep(0.02,0.6,eps), s=sea;
  const az=-0.5, ce=Math.cos(eps);
  sky.sun=[Math.sin(az)*ce,Math.sin(eps),-Math.cos(az)*ce];
  let z=lerp3([0.05,0.08,0.26],[0.09,0.24,0.62],day);
  let h=lerp3([0.85,0.38,0.2],[0.62,0.77,0.92],Math.pow(day,0.7));
  const gz=[0.12,0.14,0.17], gh=[0.33,0.36,0.40];
  z=lerp3(z,gz.map(v=>v*(0.4+day)),s*0.65); z=z.map(v=>v*(1-0.3*s));
  h=lerp3(h,gh.map(v=>v*(0.5+0.5*day)),s*0.5);
  sky.zenith=z; sky.horizon=h;
  const gk=(1-day*0.8)*0.9; sky.glow=[1.0*gk,0.5*gk,0.22*gk].map(v=>v*(1-0.6*s));
  const inten=2.9*(0.4+0.6*sstep(0,0.3,eps))*(1-0.72*s);
  const c=lerp3([1,0.42,0.16],[1,0.94,0.84],sstep(0.05,0.5,eps));
  sky.sunCol=c.map(v=>v*inten); sky.sunLum=inten;
  sky.ambLum=(0.3+0.7*day)*(1-0.35*s);
  sky.cloudLo=0.64-0.26*s; sky.storm=s;
}
function setSky(p){
  gl.uniform1f(L(p,'uTime'),simT); gl.uniform1f(L(p,'uStorm'),sky.storm);
  gl.uniform1f(L(p,'uAmbLum'),sky.ambLum); gl.uniform1f(L(p,'uSunLum'),sky.sunLum);
  gl.uniform1f(L(p,'uCloudLo'),sky.cloudLo); gl.uniform1f(L(p,'uExp'),0.88);
  gl.uniform3fv(L(p,'uSun'),sky.sun); gl.uniform3fv(L(p,'uSunCol'),sky.sunCol);
  gl.uniform3fv(L(p,'uZenith'),sky.zenith); gl.uniform3fv(L(p,'uHorizon'),sky.horizon); gl.uniform3fv(L(p,'uGlow'),sky.glow);
}

