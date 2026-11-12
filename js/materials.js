'use strict';
/* ============================================================
   AI-generated material textures

   The ball materials used to be pure procedural colour. They are now
   photographic albedo maps generated with an image model, packed into one
   small atlas so every ball in the scene shares a single texture binding and
   a single sampler. Six 1024 px sources become 512 px atlas tiles (384 px on
   touch devices and 160 px in low-memory mode); the shader samples them
   tri-planar, so the grain
   never stretches at the poles and the seams of an equirectangular unwrap
   never appear.

   Everything here is optional: if a source is missing or the GPU runs out of
   memory the atlas stays disabled and the original procedural shading is used
   unchanged. Nothing in this file runs on a device without a canvas, so the
   CPU-only test suite can load the modules that use it.
   ============================================================ */
const BALL_MATERIALS=[
  {file:'leather-orange.jpg', label:'pebbled basketball leather'},
  {file:'felt-lime.jpg',      label:'matted tennis felt'},
  {file:'wood-walnut.jpg',    label:'polished walnut'},
  {file:'resin-cosmic.jpg',   label:'pearl bowling resin'},
  {file:'steel-brushed.jpg',  label:'brushed stainless steel'},
  {file:'latex-teal.jpg',     label:'thin latex skin'}
];
const BALL_ATLAS_COLS=3, BALL_ATLAS_ROWS=2;
const ballAtlas={tex:null,ready:false,cols:BALL_ATLAS_COLS,rows:BALL_ATLAS_ROWS,tile:0,loaded:0,failed:false};

function ballAtlasTileSize(){
  /* The whole atlas has to stay inside the low-memory upload limit, so the
     safe-mode tiles are small: 3x2 tiles of 160 px is a 480x320 upload. */
  if(window.AquaBoot&&window.AquaBoot.safeMode) return 160;
  let coarse=false;
  try{ coarse=matchMedia('(pointer: coarse)').matches||matchMedia('(any-pointer: coarse)').matches; }catch(e){}
  return coarse?384:512;
}

function uploadBallAtlas(sources,tile){
  if(typeof document==='undefined'||!document.createElement) return false;
  const cols=BALL_ATLAS_COLS, rows=BALL_ATLAS_ROWS;
  const canvas=document.createElement('canvas');
  canvas.width=cols*tile; canvas.height=rows*tile;
  const ctx=canvas.getContext('2d');
  if(!ctx) return false;
  ctx.imageSmoothingEnabled=true;
  if('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality='high';
  for(let i=0;i<sources.length;i++){
    const col=i%cols, row=Math.floor(i/cols);
    ctx.drawImage(sources[i],col*tile,row*tile,tile,tile);
  }
  if(gl.isContextLost()) return false;
  /* Errors left over from earlier start-up work must not be mistaken for a
     failed upload, so drain the queue before touching the texture. */
  for(let i=0;i<8;i++) if(gl.getError()===gl.NO_ERROR) break;
  const tex=gl.createTexture();
  if(!tex) return false;
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  try{ gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas); }
  finally{ gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); }
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const aniso=gl.getExtension('EXT_texture_filter_anisotropic');
  if(aniso) gl.texParameterf(gl.TEXTURE_2D,aniso.TEXTURE_MAX_ANISOTROPY_EXT,
    Math.min(8,gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  if(gl.getError()!==gl.NO_ERROR){
    gl.deleteTexture(tex);
    return false;
  }
  ballAtlas.tex=tex; ballAtlas.tile=tile; ballAtlas.cols=cols; ballAtlas.rows=rows;
  ballAtlas.ready=true; ballAtlas.failed=false;
  return true;
}

/* Each image is decoded once. A single failure only disables the atlas; the
   scene keeps rendering with the procedural ball materials. */
(function loadBallAtlas(){
  if(typeof Image==='undefined'||typeof document==='undefined') return;
  const sources=new Array(BALL_MATERIALS.length).fill(null);
  let pending=BALL_MATERIALS.length, aborted=false;
  const finish=()=>{
    if(aborted||ballAtlas.ready) return;
    aborted=true;
    ballAtlas.failed=true;
    for(const tex of sources) if(tex&&tex.close) try{ tex.close(); }catch(e){}
  };
  BALL_MATERIALS.forEach((material,index)=>{
    const image=new Image();
    image.decoding='async';
    image.onload=()=>{
      if(aborted) return;
      sources[index]=image;
      ballAtlas.loaded++;
      if(--pending>0) return;
      if(!ballAtlas.ready) uploadBallAtlas(sources,ballAtlasTileSize());
    };
    image.onerror=finish;
    image.src='assets/balls/'+material.file;
  });
})();

/* Names used by the after-action notes and the settings panel. */
const BALL_MATERIAL_LABELS=BALL_MATERIALS.map(material=>material.label);
