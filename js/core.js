'use strict';
const $ = id => document.getElementById(id);

const canvas = $('gl');
/* Geometry is rendered into our own depth targets; the canvas only receives
   the final fullscreen post pass. Its default depth and MSAA buffers therefore
   add no visual quality, but can consume a great deal of GPU memory. */
const contextOptions={antialias:false,depth:false,stencil:false,alpha:false};
const gl = canvas.getContext('webgl2',Object.assign({powerPreference:'high-performance'},contextOptions)) ||
           canvas.getContext('webgl2',contextOptions);
if(!gl){ const error=new Error('The browser could not create a WebGL 2 context.'); error.code='WEBGL_UNAVAILABLE'; throw error; }
window.AquaBoot.attachContext(gl);
if(gl.isContextLost()) window.AquaBoot.contextLost();

/* ============================================================
   Constants & small math helpers
   ============================================================ */
/* Advanced VFX level (0/1/2). Declared with the shared constants so modules
   that run without vfx.js — tests, embedded builds — still read a number. */
var VFX_LEVELS=['off','enhanced','cinematic'];
var vfxLevel=0;
const G=9.81, RHO_W=1000, RHO_A=1.2;
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const lerp3=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];

const M4={
  persp(fovy,asp,n,f){const o=new Float32Array(16),t=1/Math.tan(fovy/2);o[0]=t/asp;o[5]=t;o[10]=(f+n)/(n-f);o[11]=-1;o[14]=2*f*n/(n-f);return o;},
  look(e,c,u){
    let zx=e[0]-c[0],zy=e[1]-c[1],zz=e[2]-c[2];let l=Math.hypot(zx,zy,zz);zx/=l;zy/=l;zz/=l;
    let xx=u[1]*zz-u[2]*zy,xy=u[2]*zx-u[0]*zz,xz=u[0]*zy-u[1]*zx;l=Math.hypot(xx,xy,xz);xx/=l;xy/=l;xz/=l;
    const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
    return new Float32Array([xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-(xx*e[0]+xy*e[1]+xz*e[2]),-(yx*e[0]+yy*e[1]+yz*e[2]),-(zx*e[0]+zy*e[1]+zz*e[2]),1]);
  },
  mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
};

