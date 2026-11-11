'use strict';
/* ============================================================
   Shaders
   ============================================================ */
const HDR = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

const COMMON = `
uniform sampler2D uDetail;
uniform float uTime,uStorm,uAmbLum,uSunLum,uCloudLo,uExp,uFogD,uNight,uRough,uRain;
uniform vec3 uSun,uMoon,uLight,uSunCol,uZenith,uHorizon,uGlow,uFogCol,uSunDisc,uMoonDisc,uDeep,uTurq;
uniform vec2 uCloudOff;
uniform vec4 uBolt;
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
/* uSun / uMoon are where the bodies are in the sky; uLight is whichever of them
   is currently lighting the scene and uSunCol its colour.                       */
vec3 skyCol(vec3 rd,float sunOn){
  float h=max(rd.y,0.0);
  vec3 c=mix(uHorizon,uZenith,pow(h,0.42));
  float sd=max(dot(rd,uSun),0.0);
  float md=max(dot(rd,uMoon),0.0);
  c+=uGlow*(pow(sd,5.0)*0.30+pow(sd,48.0)*0.8);
  c+=uMoonDisc*(pow(md,40.0)*0.010+pow(md,600.0)*0.05);
  if(sunOn>0.5&&uNight>0.01){
    /* stars */
    vec2 sp=rd.xz/(rd.y+0.35)*46.0; vec2 ci=floor(sp); vec2 cf=fract(sp)-0.5;
    float hs=hash12(ci);
    vec2 so=(vec2(hash12(ci+7.3),hash12(ci+19.1))-0.5)*0.7;
    float st=step(0.88,hs)*(1.0-smoothstep(0.02,0.07+0.08*hs,length(cf-so)));
    float tw=0.72+0.28*sin(uTime*2.6+hs*50.0);
    c+=mix(vec3(1.0,0.9,0.8),vec3(0.8,0.9,1.0),fract(hs*13.7))*st*tw*uNight*(0.25+(hs-0.88)*7.0)*smoothstep(0.0,0.22,rd.y);
  }
  {
    vec2 cuv=rd.xz/(h+0.10)*0.20+uCloudOff;
    float n=texture(uDetail,cuv).a*0.65+texture(uDetail,cuv*2.7+vec2(3.1,1.7)+uCloudOff*0.7).a*0.35;
    float cov=smoothstep(uCloudLo,uCloudLo+0.24,n)*smoothstep(0.0,0.16,rd.y);
    float al=min(uAmbLum*1.5,1.0);
    vec3 cc=mix(uHorizon,vec3(al),0.65)*(0.25+0.75*al);
    cc*=mix(1.0,0.42,uStorm)*mix(1.0,0.70+0.5*n,uStorm);
    cc+=uGlow*pow(sd,3.0)*0.45+uMoonDisc*pow(md,6.0)*0.006;
    cc+=vec3(0.70,0.78,1.0)*uBolt.z*0.55;
    c=mix(c,cc,cov*0.92);
    float vis=(1.0-cov)*step(0.5,sunOn)*step(0.0,rd.y);
    c+=uSunDisc*smoothstep(0.99965,0.99985,sd)*vis;
    c+=uMoonDisc*smoothstep(0.99972,0.99986,md)*vis;
    /* rainbow: rain in the air with the sun low but up – two bows around the
       point opposite the sun (primary ~42°, secondary ~51°, fainter and reversed).
       Only in the gaps between clouds – a rainbow needs direct sunlight. */
    float rbm=uRain*(1.0-cov*0.92)*smoothstep(0.02,0.09,uSun.y)*(1.0-smoothstep(0.38,0.65,uSun.y));
    if(rbm>0.004&&rd.y>-0.04){
      vec3 anti=normalize(vec3(-uSun.x,-uSun.y,-uSun.z));
      float ca=dot(rd,anti);
      float t1=(ca-0.740)/(0.768-0.740);
      if(t1>0.0&&t1<1.0){
        vec3 rc=mix(vec3(0.95,0.28,0.08),vec3(0.20,0.30,0.85),t1);
        c+=rc*rbm*0.55*smoothstep(0.0,0.25,t1)*smoothstep(1.0,0.75,t1);
      }
      float t2=(ca-0.600)/(0.655-0.600);
      if(t2>0.0&&t2<1.0){
        vec3 rc=mix(vec3(0.20,0.30,0.85),vec3(0.95,0.28,0.08),t2);
        c+=rc*rbm*0.18*smoothstep(0.0,0.3,t2)*smoothstep(1.0,0.7,t2);
      }
    }
  }
  /* aerial perspective / fog: optical depth through a 150 m thick haze layer */
  float fl=min(150.0/max(rd.y,0.004),40000.0);
  c=mix(c,uFogCol,1.0-exp(-uFogD*fl));
  if(sunOn>0.5&&uBolt.z>0.002&&rd.y>0.0){
    /* lightning bolt: a jagged vertical channel at azimuth uBolt.x */
    float da=atan(rd.x,-rd.z)-uBolt.x; da=mod(da+3.14159265,6.2831853)-3.14159265;
    float jag=(texture(uDetail,vec2(rd.y*0.9,uBolt.y)).a-0.5)*0.24
             +(texture(uDetail,vec2(rd.y*5.0,uBolt.y+0.37)).a-0.5)*0.05;
    float dx=abs(da-jag);
    float top=1.0-smoothstep(uBolt.w-0.06,uBolt.w,rd.y);
    c+=exp(-uFogD*260.0)*vec3(0.85,0.90,1.0)*uBolt.z*top*((1.0-smoothstep(0.0012,0.0055,dx))*7.0+exp(-dx*26.0)*0.6);
  }
  return c;
}
vec3 tonemap(vec3 x){
  x*=uExp;
  vec3 c=clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);
  return pow(c,vec3(1.0/2.2));
}
vec3 enc(vec3 c){return c/(1.0+c);}
vec3 dec(vec3 c){c=min(c,vec3(0.995));return c/(1.0-c);}
`;

/* ---- Water vertex: Gerstner waves + ripple height ---- */
const WATER_VS = HDR + `
layout(location=0) in vec2 aUV;
uniform mat4 uVP;
uniform float uTime;
uniform vec4 uW[8];
uniform float uQ[8];
uniform sampler2D uRip;
uniform float uRipR;
out vec3 vWorld;
out vec3 vN;
out float vFoam;
void main(){
  vec2 s=sign(aUV); vec2 au=abs(aUV);
  vec2 p0=s*600.0*(exp(6.0*au)-1.0)/(exp(6.0)-1.0);
  float sp=0.0417*(max(abs(p0.x),abs(p0.y))+1.5);
  vec3 disp=vec3(0.0);
  float nx=0.0,nz=0.0,ny=0.0,jxx=0.0,jzz=0.0,jxz=0.0;
  for(int i=0;i<8;i++){
    vec4 w=uW[i]; float k=w.z; float L=6.2831853/k;
    float f=smoothstep(1.5*sp,4.5*sp,L);
    float om=sqrt(9.81*k);
    float th=k*dot(w.xy,p0)-om*uTime+float(i)*2.399;
    float sn=sin(th),cs=cos(th);
    float q=uQ[i]*f; float A=w.w*f;
    disp.xz+=w.xy*(q/k)*cs;
    disp.y+=A*sn;
    nx-=w.x*k*A*cs; nz-=w.y*k*A*cs; ny+=q*sn;
    jxx+=q*w.x*w.x*sn; jzz+=q*w.y*w.y*sn; jxz+=q*w.x*w.y*sn;
  }
  vec3 pos=vec3(p0.x+disp.x,disp.y,p0.y+disp.z);
  vN=vec3(nx,1.0-ny,nz);
  float J=(1.0-jxx)*(1.0-jzz)-jxz*jxz;
  vFoam=1.0-smoothstep(0.40,0.72,J);
  vec2 ruv=pos.xz/(2.0*uRipR)+0.5;
  float ef=smoothstep(0.0,0.08,min(min(ruv.x,1.0-ruv.x),min(ruv.y,1.0-ruv.y)));
  float ro=clamp(sp*0.5,0.0,1.2)/(2.0*uRipR);
  float rh=textureLod(uRip,ruv,0.0).r*2.0
          +textureLod(uRip,ruv+vec2(ro,0.0),0.0).r+textureLod(uRip,ruv-vec2(ro,0.0),0.0).r
          +textureLod(uRip,ruv+vec2(0.0,ro),0.0).r+textureLod(uRip,ruv-vec2(0.0,ro),0.0).r;
  pos.y+=rh/6.0*ef;
  vWorld=pos;
  gl_Position=uVP*vec4(pos,1.0);
}`;

/* ---- Water fragment: fresnel, reflection, refraction, SSS, foam, glitter ---- */
const WATER_FS = HDR + COMMON + `
in vec3 vWorld; in vec3 vN; in float vFoam;
out vec4 o;
uniform vec3 uCam,uCamR,uCamF;
uniform float uRipR,uRipN,uA0;
uniform vec2 uRes,uNF;
uniform float uHQ;
uniform sampler2D uRip,uScene,uSceneD,uRefl;
float linZ(float d){float z=2.0*d-1.0;return 2.0*uNF.x*uNF.y/(uNF.y+uNF.x-z*(uNF.y-uNF.x));}
void main(){
  vec3 toCam=uCam-vWorld; float dist=length(toCam); vec3 V=toCam/dist;
  vec3 Nw=normalize(vN);
  vec2 s=Nw.xz/max(Nw.y,0.2);
  /* interactive ripples */
  vec2 ruv=vWorld.xz/(2.0*uRipR)+0.5;
  float ef=smoothstep(0.0,0.08,min(min(ruv.x,1.0-ruv.x),min(ruv.y,1.0-ruv.y)));
  float e=1.0/uRipN;
  float hl=texture(uRip,ruv-vec2(e,0.0)).r, hr=texture(uRip,ruv+vec2(e,0.0)).r;
  float hd=texture(uRip,ruv-vec2(0.0,e)).r, hu=texture(uRip,ruv+vec2(0.0,e)).r;
  vec2 grad=vec2(hr-hl,hu-hd)*(uRipN/(4.0*uRipR));
  s-=grad*ef*1.3;
  float foamSim=texture(uRip,ruv).g*ef;
  /* capillary detail */
  float df=1.0/(1.0+dist*0.035);
  vec2 t1=vWorld.xz*0.23+vec2(uTime*0.031,uTime*0.017);
  vec2 t2=vWorld.xz*0.61+vec2(-uTime*0.047,uTime*0.029);
  vec2 t3=vWorld.xz*1.7+vec2(uTime*0.071,-uTime*0.05);
  vec3 d1=texture(uDetail,t1).xyz*2.0-1.0;
  vec3 d2=texture(uDetail,t2).xyz*2.0-1.0;
  vec3 d3=texture(uDetail,t3).xyz*2.0-1.0;
  float dw=(0.40+0.55*uRough)*df;
  s+=(d1.xz*0.8+d2.xz*0.6+d3.xz*0.35)*dw;
  /* enhanced graphics: two more capillary octaves close to the camera */
  if(uHQ>0.5){
    vec2 t4=vWorld.xz*4.1+vec2(-uTime*0.06,uTime*0.09);
    vec2 t5=vWorld.xz*7.9+vec2(uTime*0.13,-uTime*0.04);
    s+=(texture(uDetail,t4).xz*0.22+texture(uDetail,t5).xz*0.12)*dw;
  }
  if(uRain>0.01){
    /* rain-pitted surface: fast, fine normal noise (the nearby rings come from the ripple sim) */
    vec2 rn=texture(uDetail,vWorld.xz*2.9+vec2(uTime*0.83,-uTime*0.61)).xz
           +texture(uDetail,vWorld.xz*4.7-vec2(uTime*0.57,uTime*0.91)).xz-1.0;
    s+=rn*uRain*0.55*df;
  }
  s*=mix(1.0,0.5,smoothstep(60.0,400.0,dist));
  vec3 N=normalize(vec3(s.x,1.0,s.y));
  float nv=max(dot(N,V),0.0);
  float F=0.02+0.98*pow(1.0-nv,5.0);

  /* reflection */
  vec3 R=reflect(-V,N); R.y=abs(R.y);
  vec3 refl=skyCol(R,0.0);
  vec2 uv=gl_FragCoord.xy/uRes;
  vec2 off=vec2(dot(s,uCamR.xz),dot(s,normalize(uCamF.xz))*0.6);
  vec4 rb=texture(uRefl,clamp(uv+off*0.05,0.001,0.999));
  refl=mix(refl,dec(rb.rgb),rb.a);

  /* body colour with sub-surface scattering at crests */
  vec3 L=uLight;
  float hh=clamp(vWorld.y/(uA0*2.0+0.35)*0.5+0.5,0.0,1.0);
  float back=pow(clamp(dot(L,-V)*0.5+0.5,0.0,1.0),3.0);
  vec3 deep=uDeep;
  vec3 tq=uTurq;
  vec3 body=deep*(0.25+0.9*uAmbLum)
           +tq*uSunCol*back*hh*hh*0.16*clamp(L.y*2.5,0.0,1.0)
           +tq*0.05*uAmbLum*pow(1.0-nv,2.0)*(0.4+hh)
           +vec3(0.0,0.05,0.06)*uAmbLum*hh;
  body*=mix(vec3(1.0),uHorizon*1.4,0.25);

  /* refraction of submerged objects */
  float zW=linZ(gl_FragCoord.z);
  vec3 refr=body;
  vec2 uvq=clamp(uv+off*0.03,0.001,0.999);
  vec4 sc=vec4(0.0); float zS=0.0;
  vec4 c2=textureLod(uScene,uvq,0.0); float z2=linZ(textureLod(uSceneD,uvq,0.0).r);
  vec4 c1=textureLod(uScene,uv,0.0); float z1=linZ(textureLod(uSceneD,uv,0.0).r);
  if(c2.a>0.5&&z2>zW){sc=c2;zS=z2;}
  else if(c1.a>0.5&&z1>zW){sc=c1;zS=z1;}
  if(sc.a>0.5){
    float thick=max(zS-zW,0.0)*dist/zW;
    vec3 tr=exp(-thick*vec3(0.45,0.11,0.065)*(0.8+0.5*uRough));
    refr=dec(sc.rgb)*tr+body*(1.0-tr);
  }

  vec3 col=mix(refr,refl,F);

  /* sun glitter (GGX) */
  vec3 H=normalize(L+V);
  float nh=max(dot(N,H),0.0);
  float a=0.035+0.07*uRough+0.05*uRain+dist*0.00025; float a2=a*a;
  float dd=nh*nh*(a2-1.0)+1.0;
  float D=a2/(3.14159265*dd*dd);
  float vh=max(dot(V,H),0.0);
  float Fs=0.02+0.98*pow(1.0-vh,5.0);
  float nl=max(dot(N,L),0.0);
  vec3 spec=uSunCol*min(D*Fs/(4.0*max(nv,0.08)),22.0)*smoothstep(0.0,0.12,nl)*step(0.0,L.y);

  /* foam */
  float foamAmt=clamp(vFoam+min(foamSim,0.62),0.0,1.0);
  float fn=texture(uDetail,vWorld.xz*0.55+vec2(uTime*0.01,-uTime*0.013)).a*0.6
          +texture(uDetail,vWorld.xz*1.9-vec2(uTime*0.02,0.0)).a*0.4;
  float fm=smoothstep(1.0-foamAmt*1.15,1.0-foamAmt*1.15+0.18,fn);
  float foamLight=0.42*uAmbLum+0.22*uSunLum*max(dot(N,L),0.0);
  vec3 foamCol=vec3(0.94,0.97,1.0)*foamLight*(0.78+0.44*fn);
  col=mix(col+spec*(1.0-fm),foamCol,fm*0.92);

  /* horizon haze */
  float fog=max(smoothstep(100.0,580.0,dist),1.0-exp(-dist*uFogD));
  vec3 hd2=normalize(vec3(vWorld.x-uCam.x,0.02,vWorld.z-uCam.z));
  col=mix(col,skyCol(hd2,0.0),fog);

  vec3 outc=tonemap(col)+(hash12(gl_FragCoord.xy)-0.5)/255.0;
  o=vec4(outc,1.0);
}`;

/* ---- Sky ---- */
const SKY_VS = HDR + `
out vec2 vNdc;
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  vNdc=p*2.0-1.0;
  gl_Position=vec4(vNdc,1.0,1.0);
}`;
const SKY_FS = HDR + COMMON + `
in vec2 vNdc; out vec4 o;
uniform vec3 uCamF,uCamR,uCamU; uniform vec2 uTanAsp;
void main(){
  vec3 rd=normalize(uCamF+vNdc.x*uTanAsp.x*uTanAsp.y*uCamR+vNdc.y*uTanAsp.x*uCamU);
  vec3 c=skyCol(rd,1.0);
  o=vec4(tonemap(c)+(hash12(gl_FragCoord.xy)-0.5)/255.0,1.0);
}`;

/* ---- Balls ---- */
const BALL_VS = HDR + `
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform vec3 uPos; uniform float uR; uniform mat3 uRot;
uniform float uMirror,uPlane;
uniform vec3 uVel; uniform float uShutterB;
out vec3 vWorld; out vec3 vWN; out vec3 vLocal;
void main(){
  vec3 wl=uRot*aPos;
  /* object blur: smear the sphere along its velocity like a finite exposure.
     The swept path over the shutter becomes an ellipsoid: leading edge stays
     at the true leading edge, the trail stretches behind by the same amount. */
  if(uShutterB>0.0){
    float sp=length(uVel);
    if(sp>0.4){
      float path=min(sp*uShutterB,uR*4.0);
      vec3 dirW=uVel/sp;
      vec3 dl=transpose(uRot)*dirW;
      wl+=dirW*(dot(aPos,dl)*path*0.5/uR);
      vec3 w=uPos+wl*uR-dirW*path*0.5;
      vLocal=aPos; vWN=wl; vWorld=w;
      if(uMirror>0.5) w.y=2.0*uPlane-w.y;
      gl_Position=uVP*vec4(w,1.0);
      return;
    }
  }
  vec3 w=uPos+wl*uR;
  vLocal=aPos; vWN=wl; vWorld=w;
  if(uMirror>0.5) w.y=2.0*uPlane-w.y;
  gl_Position=uVP*vec4(w,1.0);
}`;
const BALL_FS = HDR + COMMON + `
in vec3 vWorld; in vec3 vWN; in vec3 vLocal;
out vec4 o;
uniform vec3 uCamEff; uniform float uType,uMode,uMirror,uPlane;
const vec3 BC[6]=vec3[6](vec3(0.85,0.07,0.08),vec3(0.96,0.96,0.94),vec3(0.06,0.25,0.85),vec3(0.98,0.80,0.10),vec3(0.96,0.96,0.94),vec3(0.07,0.62,0.22));
vec2 dn(vec2 uv){vec3 d=texture(uDetail,uv).xyz*2.0-1.0;return d.xz;}
void main(){
  if(uMirror>0.5&&vWorld.y<uPlane) discard;
  vec3 l=normalize(vLocal);
  vec3 N=normalize(vWN);
  vec3 alb=vec3(0.8); float rough=0.4,metal=0.0,f0=0.04; vec2 bn=vec2(0.0);
  int t=int(uType+0.5);
  if(t==0){
    float a=atan(l.z,l.x); float seg=(a+3.14159265)/6.2831853*6.0;
    float id=floor(seg); float fr=fract(seg);
    alb=BC[int(mod(id,6.0))];
    float seam=smoothstep(0.0,0.035,fr)*(1.0-smoothstep(0.965,1.0,fr));
    alb*=mix(0.5,1.0,seam);
    float cap=smoothstep(0.86,0.9,abs(l.y)); alb=mix(alb,vec3(0.95),cap);
    float ring=smoothstep(0.972,0.978,abs(l.y))*(1.0-smoothstep(0.99,0.996,abs(l.y)));
    alb=mix(alb,vec3(0.15),ring*0.6);
    rough=0.28;
  } else if(t==1){
    float pb=(texture(uDetail,l.xy*6.0).a+texture(uDetail,l.zy*6.0).a)*0.5;
    alb=vec3(0.86,0.37,0.07)*(0.82+0.34*pb);
    bn=(dn(l.xy*7.0)+dn(l.zy*7.0))*0.18;
    float w=0.020;
    float d=min(min(abs(l.y),abs(l.x)),abs(abs(l.z)-0.62)*1.1);
    alb=mix(alb,vec3(0.02),1.0-smoothstep(w,w+0.012,d));
    rough=0.62;
  } else if(t==2){
    float fz=texture(uDetail,l.xy*14.0).a*0.5+texture(uDetail,l.zy*14.0).a*0.5;
    alb=vec3(0.76,0.90,0.16)*(0.78+0.4*fz);
    bn=(dn(l.xy*16.0)+dn(l.zy*16.0))*0.3;
    float d=abs(l.y-0.62*sin(2.0*atan(l.z,l.x)))*0.85;
    alb=mix(alb,vec3(0.93,0.95,0.88),(1.0-smoothstep(0.035,0.06,d))*0.92);
    rough=0.95;
  } else if(t==3){
    float n=texture(uDetail,l.xz*1.3+0.3).a;
    float r=length(l.xz)+0.06*n;
    float rings=0.5+0.5*sin(r*34.0+n*4.0);
    alb=mix(vec3(0.40,0.22,0.08),vec3(0.66,0.43,0.20),rings);
    alb*=0.9+0.2*texture(uDetail,l.xy*9.0).a;
    rough=0.42;
  } else if(t==4){
    float n=texture(uDetail,l.xy*1.4+vec2(0.3)).a+texture(uDetail,l.zy*1.1).a;
    alb=mix(vec3(0.01,0.02,0.12),vec3(0.28,0.04,0.46),smoothstep(0.5,1.3,n));
    alb+=vec3(0.0,0.0,0.15)*smoothstep(0.9,1.1,n);
    vec3 d0=normalize(vec3(0.0,0.9,0.43)); vec3 d1=normalize(vec3(0.17,0.82,0.55)); vec3 d2=normalize(vec3(-0.17,0.82,0.55));
    float hole=max(max(smoothstep(0.9935,0.9945,dot(l,d0)),smoothstep(0.9965,0.9975,dot(l,d1))),smoothstep(0.9965,0.9975,dot(l,d2)));
    alb=mix(alb,vec3(0.0),hole);
    rough=0.09;
  } else if(t==6){
    /* water balloon: thin rubber skin, water sloshing inside */
    float inner=smoothstep(0.30,0.95,length(l-vec3(0.0,-0.15,0.0)));
    alb=mix(vec3(0.05,0.32,0.40),vec3(0.02,0.10,0.16),inner);
    alb*=0.85+0.3*texture(uDetail,l.xy*3.0).a;
    rough=0.16; f0=0.06;
  } else if(t==7){
    /* glow orb: faint shell, mostly emissive (see below) */
    alb=vec3(0.01,0.05,0.06);
    rough=0.25; f0=0.05;
  } else {
    alb=vec3(0.86,0.89,0.94); metal=1.0; rough=0.05; f0=0.9;
  }
  if(bn!=vec2(0.0)){
    vec3 T=normalize(cross(N,vec3(0.31,0.93,0.17))); vec3 B=cross(N,T);
    N=normalize(N+T*bn.x+B*bn.y);
  }
  vec3 V=normalize(uCamEff-vWorld);
  float nv=max(dot(N,V),0.0);
  float ndl=max(dot(N,uLight),0.0);
  vec3 hemi=mix(uHorizon*0.45+vec3(0.02,0.05,0.07),uZenith*1.3+vec3(0.05),N.y*0.5+0.5);
  vec3 diff=alb*(uSunCol*ndl*0.5+hemi*1.25);
  float shin=clamp(2.0/(rough*rough)-2.0,4.0,3000.0);
  vec3 H=normalize(uLight+V); float nh=max(dot(N,H),0.0);
  float vh=max(dot(V,H),0.0);
  vec3 F0v=mix(vec3(f0),alb,metal);
  vec3 Fh=F0v+(1.0-F0v)*pow(1.0-vh,5.0);
  vec3 spec=pow(nh,shin)*(shin+8.0)/(8.0*3.14159)*Fh*ndl*uSunCol*0.45;
  vec3 R=reflect(-V,N);
  vec3 env;
  if(R.y>=0.0) env=skyCol(R,1.0);
  else env=mix(vec3(0.02,0.07,0.10)*uAmbLum+uHorizon*0.08,uHorizon*0.5,smoothstep(-0.25,0.0,R.y));
  vec3 Fr=F0v+(1.0-F0v)*pow(1.0-nv,5.0);
  float gloss=(1.0-rough); gloss*=gloss;
  vec3 col=diff*(1.0-metal)*(1.0-Fr*gloss*0.5)+env*Fr*gloss+spec*mix(vec3(1.0),alb,metal);
  /* glow orb: its own light, strongest when the surroundings are dark */
  if(t==7){
    float pulse=0.75+0.25*sin(uTime*2.2+l.x*2.0+l.z*1.5);
    vec3 gc=mix(vec3(0.00,0.85,1.00),vec3(0.15,0.30,1.00),0.5+0.5*l.y);
    col+=gc*(0.5+2.6*(1.0-uAmbLum))*pulse;
  }
  col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  if(uMode>0.5) o=vec4(enc(col),1.0);
  else o=vec4(tonemap(col),1.0);
}`;

/* ---- Splash particles: instanced, velocity-stretched billboards ----
   aInfo = (radius, alpha, kind, seed)
   kind 0..1 : water droplet, 0 = clear lens-like drop, 1 = aerated white water
   kind 2    : soft volumetric mist puff                                        */
const PART_VS = HDR + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aVel;
layout(location=2) in vec4 aInfo;
uniform mat4 uVP; uniform vec3 uCam,uCamR,uCamU; uniform float uShutter,uPxW;
out vec2 vQ; out float vAsp; out float vA; out float vKind; out float vSeed;
out vec3 vSide; out vec3 vAxis; out vec3 vFwd;
void main(){
  vec2 c=vec2(float(gl_VertexID&1),float(gl_VertexID>>1))*2.0-1.0;
  vec3 tc=uCam-aPos; float dist=length(tc); tc/=dist;
  float size=aInfo.x, alpha=aInfo.y;
  vec3 w;
  vFwd=tc; vKind=aInfo.z; vSeed=aInfo.w;
  if(aInfo.z>1.5){
    float an=aInfo.w*6.2831853; float cs=cos(an),sn=sin(an);
    vSide=uCamR; vAxis=uCamU; vAsp=1.0;
    w=aPos+(uCamR*(c.x*cs-c.y*sn)+uCamU*(c.x*sn+c.y*cs))*size;
  } else {
    /* never let a drop get thinner than ~1px: widen it and dim it instead */
    float minS=dist*uPxW*0.85;
    if(size<minS){ alpha*=max(size/minS,0.25); size=minS; }
    float sp=length(aVel);
    vec3 dir=sp>1e-3?aVel/sp:uCamU;
    vec3 side=cross(dir,tc); float sl=length(side);
    side=sl>1e-3?side/sl:uCamR;
    vec3 ax=cross(tc,side);
    float halfLen=size+min(sp*uShutter*sl*0.5,size*7.0);
    vSide=side; vAxis=ax; vAsp=halfLen/size;
    w=aPos+side*(c.x*size)+ax*(c.y*halfLen);
  }
  vQ=c; vA=alpha;
  gl_Position=uVP*vec4(w,1.0);
}`;
const PART_FS = HDR + COMMON + `
in vec2 vQ; in float vAsp; in float vA; in float vKind; in float vSeed;
in vec3 vSide; in vec3 vAxis; in vec3 vFwd;
out vec4 o;
uniform float uHQ;
vec3 envC(vec3 d){
  vec3 s=mix(uHorizon,uZenith,pow(max(d.y,0.0),0.42));
  s+=uGlow*pow(max(dot(d,uSun),0.0),8.0)*0.4;
  vec3 w=vec3(0.010,0.060,0.100)*(0.3+0.9*uAmbLum)+uHorizon*0.10;
  return mix(w,s,smoothstep(-0.08,0.04,d.y));
}
void main(){
  vec3 V=normalize(vFwd);
  if(vKind>1.5){
    /* mist: noisy soft puff with forward scattering towards the sun */
    float d=dot(vQ,vQ); if(d>1.0) discard;
    float n=texture(uDetail,vQ*0.21+vec2(vSeed*7.31,vSeed*3.17)).a;
    float a=pow(1.0-d,1.6)*smoothstep(0.08,0.70,n+0.38*(1.0-d))*vA;
    float fs=pow(max(dot(-V,uLight),0.0),6.0);
    vec3 c=vec3(0.93,0.96,1.0)*(0.40*uAmbLum+uSunLum*(0.15+0.45*fs));
    c=mix(c,c*uHorizon*1.4,0.18);
    o=vec4(tonemap(c)*a,a);
    return;
  }
  /* capsule-shaped drop: a sphere smeared along its motion (shutter blur).
     The silhouette is then broken up with noise – surface tension keeps a
     small clear drop round, but aerated water tears into ragged blobs that
     wobble and reform as they fly. */
  vec2 p=vec2(vQ.x,vQ.y*vAsp);
  float ty=max(abs(p.y)-(vAsp-1.0),0.0)*sign(p.y);
  vec2 n2=vec2(p.x,ty); float d=dot(n2,n2);
  float wh=clamp(vKind,0.0,1.0);
  float wob=texture(uDetail,n2*0.19+vec2(vSeed*13.1,vSeed*4.7)+vec2(uTime*0.45,-uTime*0.32)).a-0.5;
  float wob2=texture(uDetail,n2*0.53+vec2(vSeed*7.7,vSeed*17.3)+vec2(-uTime*0.7,uTime*0.5)).a-0.5;
  float de=d+wob*(0.10+0.30*wh)+wob2*0.10*wh;
  if(de>1.0) discard;
  float nz=sqrt(1.0-d);
  vec3 N=normalize(vSide*n2.x+vAxis*n2.y+V*nz);
  /* clear water: inverted refracted image of the surroundings + fresnel reflection */
  float F=0.03+0.97*pow(1.0-nz,4.0);
  vec3 R=reflect(-V,N);
  vec3 T=normalize(-V-(vSide*n2.x+vAxis*n2.y)*1.35);
  vec3 clear=envC(T)*0.92*(1.0-F)+envC(R)*F;
  float glint=pow(max(dot(R,uLight),0.0),160.0)*7.0+pow(max(dot(T,uLight),0.0),48.0)*2.2;
  glint*=step(0.0,uLight.y);
  /* aerated water: diffuse white with soft volume shading */
  float ndl=max(dot(N,uLight),0.0);
  vec3 white=vec3(0.94,0.97,1.0)*(0.42*uAmbLum+0.25*uSunLum*(0.30+0.70*ndl));
  white=mix(white,white*uHorizon*1.4,0.12);
  vec3 col=mix(clear,white,wh);
  float aClear=mix(0.42,0.95,pow(1.0-nz,1.5));
  float fr=texture(uDetail,n2*0.16+vec2(vSeed*5.7,vSeed*9.1)+vec2(0.0,p.y*0.05)).a;
  if(uHQ>0.5) fr=fr*0.6+texture(uDetail,n2*0.55+vec2(vSeed*3.3,vSeed*8.8)).a*0.4;
  float aWhite=(1.0-smoothstep(0.25,1.0,de))*smoothstep(0.12,0.62,fr+0.55*(1.0-de))*0.95;
  float edge=1.0-smoothstep(0.80,1.0,de);
  float a=mix(aClear,aWhite,wh)*edge*vA/mix(1.0,vAsp,0.45);
  vec3 g=min(tonemap(uSunCol*glint),vec3(1.0))*edge*vA*(1.0-0.75*wh);
  o=vec4(tonemap(col)*a+g,a);
}`;

/* ---- Rain & snow: instanced, entirely procedural (no CPU work per drop).
   Every instance gets a fixed random slot in a box that wraps around the camera. */
const PRECIP_VS = HDR + `
uniform mat4 uVP; uniform vec3 uCam,uCamR,uCamU,uBox,uOff,uVel;
uniform float uSnow,uPxW,uLen,uT;
out vec2 vQ; out float vA;
void main(){
  vec2 c=vec2(float(gl_VertexID&1),float(gl_VertexID>>1))*2.0-1.0;
  float id=float(gl_InstanceID);
  vec3 h=fract(sin(vec3(id*12.9898+1.0,id*78.233+2.0,id*37.719+3.0))*43758.5453);
  vec3 p=h*uBox+uOff;
  if(uSnow>0.5){ p.x+=sin(uT*(0.7+h.z*1.3)+id)*0.22; p.z+=cos(uT*(0.6+h.x*1.1)+id*1.7)*0.22; }
  vec3 ctr=uCam+vec3(0.0,uBox.y*0.22,0.0);
  p=ctr+mod(p-ctr,uBox)-uBox*0.5;
  vec3 tc=uCam-p; float dist=length(tc); tc/=max(dist,1e-4);
  float fade=smoothstep(0.25,1.2,dist)*(1.0-smoothstep(uBox.x*0.36,uBox.x*0.5,dist));
  vec3 w;
  if(uSnow>0.5){
    float size=0.009+0.013*h.y, minS=dist*uPxW*0.9, a=0.9;
    if(size<minS){ a*=max(size/minS,0.3); size=minS; }
    w=p+(uCamR*c.x+uCamU*c.y)*size; vA=a*fade;
  } else {
    vec3 ax=normalize(uVel);
    vec3 side=cross(ax,tc); float sl=length(side); side=sl>1e-3?side/sl:uCamR;
    float wid=0.0028+0.002*h.y, minW=dist*uPxW*0.6, a=0.42+0.3*h.z;
    if(wid<minW){ a*=max(wid/minW,0.2); wid=minW; }
    w=p+side*(c.x*wid)+ax*(c.y*uLen*(0.7+0.6*h.y)*0.5); vA=a*fade;
  }
  vQ=c;
  gl_Position=uVP*vec4(w,1.0);
}`;
const PRECIP_FS = HDR + COMMON + `
in vec2 vQ; in float vA; out vec4 o;
uniform float uSnow;
void main(){
  float a;
  vec3 c;
  if(uSnow>0.5){
    float d=dot(vQ,vQ); if(d>1.0) discard;
    a=(1.0-d*d)*vA;
    c=vec3(0.95,0.97,1.0)*(0.62*uAmbLum+0.16*uSunLum);
  } else {
    a=(1.0-vQ.x*vQ.x)*(1.0-vQ.y*vQ.y*vQ.y*vQ.y)*vA;
    c=mix(uHorizon,vec3(1.0),0.45)*(0.75*uAmbLum+0.12*uSunLum)+vec3(0.6,0.7,1.0)*uBolt.z;
  }
  o=vec4(tonemap(c)*a,a);
}`;

/* ---- Post-process: camera motion blur + lens effects ----
   True motion blur: each pixel's world point is rebuilt from its depth and
   reprojected with the previous frame's view-projection, giving the exact
   screen-space motion vector (rotation *and* translation of the camera).
   Sky has no depth, so its distance is clamped – there, rotation dominates. */
const POST_VS = HDR + `
out vec2 vNdc;
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  vNdc=p*2.0-1.0;
  gl_Position=vec4(vNdc,1.0,1.0);
}`;
const POST_FS = HDR + `
in vec2 vNdc; out vec4 o;
uniform sampler2D uScene,uDepth;
uniform vec2 uRes,uNF,uTanAsp;
uniform vec3 uCam,uCamF,uCamR,uCamU;
uniform mat4 uPrevVP;
uniform float uMB,uCA,uVig;
float linZ(float d){float z=2.0*d-1.0;return 2.0*uNF.x*uNF.y/(uNF.y+uNF.x-z*(uNF.y-uNF.x));}
vec3 tap(vec2 p,vec2 ca){return vec3(texture(uScene,p-ca).r,texture(uScene,p).g,texture(uScene,p+ca).b);}
void main(){
  vec2 uv=vNdc*0.5+0.5;
  vec2 ca=(uv-0.5)*uCA;                    /* chromatic aberration grows to the edges */
  vec3 c;
  if(uMB>0.001){
    vec3 rd=normalize(uCamF+vNdc.x*uTanAsp.x*uTanAsp.y*uCamR+vNdc.y*uTanAsp.x*uCamU);
    float d=texture(uDepth,uv).r;
    float vw=min(linZ(d),600.0);            /* sky clamped to 600 m – rotation only */
    vec3 wp=uCam+rd*(vw/max(dot(rd,uCamF),0.2));
    vec4 pc=uPrevVP*vec4(wp,1.0);
    vec2 duv=vec2(0.0);
    if(pc.w>0.01){
      vec2 pN=pc.xy/pc.w;
      duv=clamp((uv-(pN*0.5+0.5))*uMB,vec2(-0.035),vec2(0.035));
    }
    c=vec3(0.0);
    for(int i=0;i<8;i++) c+=tap(uv-duv*float(i)/7.0,ca);
    c/=8.0;
  } else {
    c=tap(uv,ca);
  }
  c*=1.0-uVig*smoothstep(0.38,0.92,length(uv-0.5));   /* gentle lens vignette */
  o=vec4(c,1.0);
}`;

function compile(type,src){
  const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ const m=gl.getShaderInfoLog(s); showErr('Shader error: '+m); throw new Error(m); }
  return s;
}
function program(vs,fs){
  const p=gl.createProgram();
  gl.attachShader(p,compile(gl.VERTEX_SHADER,vs)); gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){ const m=gl.getProgramInfoLog(p); showErr('Link error: '+m); throw new Error(m); }
  p.u={}; return p;
}
function L(p,n){ let v=p.u[n]; if(v===undefined){ v=gl.getUniformLocation(p,n); p.u[n]=v; } return v; }

const pWater=program(WATER_VS,WATER_FS);
const pSky=program(SKY_VS,SKY_FS);
const pBall=program(BALL_VS,BALL_FS);
const pPart=program(PART_VS,PART_FS);
const pPrecip=program(PRECIP_VS,PRECIP_FS);
const pPost=program(POST_VS,POST_FS);

