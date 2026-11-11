'use strict';
/* ============================================================
   Seeded island life and detail

   Rocks and grass are real instanced geometry, not ball-shaped particles.
   All placements are rooted in the same heightfield used by collision. The
   independent random streams keep rocks, grass and birds stable when another
   layer is changed. These decorative details do not alter ball collisions.
   ============================================================ */
function islandDetailPoint(I,random){
  const u=(random()*2-1)*0.98,v=(random()*2-1)*0.98;
  if(u*u+v*v>0.98) return null;
  const lx=u*I.rx,lz=v*I.rz;
  return [I.x+I.cs*lx-I.sn*lz,I.z+I.sn*lx+I.cs*lz];
}
function detailInstanceBuffer(data,geometry){
  const vao=gl.createVertexArray(), instances=gl.createBuffer();
  gl.bindVertexArray(vao);
  let vb=null, ib=null;
  if(geometry){
    vb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,geometry.vertices,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,geometry.indices,gl.STATIC_DRAW);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,instances); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  const first=geometry?1:0;
  gl.enableVertexAttribArray(first); gl.vertexAttribPointer(first,4,gl.FLOAT,false,32,0); gl.vertexAttribDivisor(first,1);
  gl.enableVertexAttribArray(first+1); gl.vertexAttribPointer(first+1,4,gl.FLOAT,false,32,16); gl.vertexAttribDivisor(first+1,1);
  gl.bindVertexArray(null);
  return {vao,instances,vb,ib,count:data.length/8,indexCount:geometry?geometry.indices.length:0};
}
function rockGeometry(){
  const lat=6,lon=10,vertices=[],indices=[];
  for(let y=0;y<=lat;y++) for(let x=0;x<=lon;x++){
    const a=y*Math.PI/lat,b=x*Math.PI*2/lon;
    vertices.push(Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b));
  }
  for(let y=0;y<lat;y++) for(let x=0;x<lon;x++){
    const a=y*(lon+1)+x,b=a+1,c=a+lon+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  return {vertices:new Float32Array(vertices),indices:new Uint16Array(indices)};
}
function makeIslandDetails(random,options){
  /* Dedicated streams mean a grass slider does not shuffle the boulders. */
  const rockRnd=islandRandom((random()*4294967296)>>>0);
  const grassRnd=islandRandom((random()*4294967296)>>>0);
  const birdRnd=islandRandom((random()*4294967296)>>>0);
  const rocks=[],grass=[],birds=[],normal={nx:0,ny:1,nz:0};
  for(const I of islands.land){
    const rockTarget=Math.round((I.rx+I.rz)*1.55*options.rocks);
    let added=0;
    for(let attempt=0;attempt<rockTarget*12&&added<rockTarget;attempt++){
      const p=islandDetailPoint(I,rockRnd); if(!p) continue;
      const y=islandGround(p[0],p[1],normal);
      if(y<0.22||normal.ny<0.52) continue;
      /* Rock clusters are denser near the shore and on stony high ground. */
      const patch=islandNoise(p[0]*0.16,p[1]*0.16,I.seed+707);
      if(rockRnd()>0.24+0.63*patch) continue;
      const size=(0.20+0.86*Math.pow(rockRnd(),2.0))*(0.82+0.36*rockRnd());
      rocks.push(p[0],y-size*0.42,p[1],size,0.65+0.7*rockRnd(),0.48+0.48*rockRnd(),rockRnd()*Math.PI*2,rockRnd());
      added++;
    }
    const grassTarget=Math.round(I.rx*I.rz*2.5*options.grass);
    added=0;
    for(let attempt=0;attempt<grassTarget*10&&added<grassTarget;attempt++){
      const p=islandDetailPoint(I,grassRnd); if(!p) continue;
      const y=islandGround(p[0],p[1],normal);
      if(y<1.3||normal.ny<0.76) continue;
      const patch=islandNoise(p[0]*0.18+8,p[1]*0.18-5,I.seed+117);
      if(grassRnd()>0.2+0.8*sstep(0.31,0.65,patch)) continue;
      grass.push(p[0],y-0.035,p[1],0.30+0.42*grassRnd(),grassRnd(),grassRnd(),grassRnd(),grassRnd());
      added++;
    }
    /* Small flocks circle individual islands instead of attaching to the camera. */
    const count=2+Math.floor(birdRnd()*3);
    for(let i=0;i<count;i++){
      const radius=Math.max(I.rx,I.rz)*(0.65+birdRnd()*0.8);
      const y=Math.max(7,islandGround(I.x,I.z)+4)+birdRnd()*6;
      birds.push(I.x,y,I.z,radius,birdRnd()*Math.PI*2,birdRnd(),birdRnd(),0.45+birdRnd()*0.35);
    }
  }
  islands.details={rocks:detailInstanceBuffer(rocks,rockGeometry()),grass:detailInstanceBuffer(grass,null),birds:detailInstanceBuffer(birds,null)};
}
function disposeIslandDetails(){
  if(!islands.details) return;
  for(const item of Object.values(islands.details)){
    gl.deleteVertexArray(item.vao); gl.deleteBuffer(item.instances);
    if(item.vb) gl.deleteBuffer(item.vb); if(item.ib) gl.deleteBuffer(item.ib);
  }
  islands.details=null;
}

function rebuildIslandDetails(options){
  if(!islands.active) return;
  disposeIslandDetails();
  makeIslandDetails(islandRandom(islands.seed^0x19b6af42),options);
}

const ROCK_VS=HDR+`
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aRock; layout(location=2) in vec4 aInfo;
uniform mat4 uVP; uniform float uMirror;
out vec3 vWorld; out vec3 vN; out float vSeed;
void main(){
  float rough=1.0+0.18*sin(dot(aPos,vec3(8.1,5.7,9.4))+aInfo.w*19.0)
                 +0.11*sin(dot(aPos,vec3(13.0,-8.0,4.0))+aInfo.w*37.0);
  vec3 scale=vec3(aRock.w*aInfo.x,aRock.w*aInfo.y,aRock.w);
  vec3 p=aPos*scale*rough;
  float c=cos(aInfo.z),s=sin(aInfo.z);
  vec3 q=vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);
  vec3 n=normalize(aPos/scale);
  vN=normalize(vec3(c*n.x-s*n.z,n.y,s*n.x+c*n.z));
  vWorld=aRock.xyz+q; vSeed=aInfo.w;
  if(uMirror>0.5) q.y=-vWorld.y; else q.y=vWorld.y;
  q.xz=vWorld.xz;
  gl_Position=uVP*vec4(q,1.0);
}`;
const ROCK_FS=HDR+COMMON+`
in vec3 vWorld; in vec3 vN; in float vSeed; out vec4 o;
uniform sampler2D uRock; uniform vec3 uCamEff; uniform float uMode,uMirror,uSnowCover;
void main(){
  /* Derivatives must be evaluated before the reflection clip/discard. */
  vec3 faceCross=cross(dFdx(vWorld),dFdy(vWorld));
  vec3 smoothN=normalize(vN), faceN=faceCross/max(length(faceCross),0.00001);
  if(uMirror>0.5&&vWorld.y<0.0) discard;
  if(dot(faceN,smoothN)<0.0) faceN=-faceN;
  vec3 N=normalize(mix(smoothN,faceN,0.70)), V=normalize(uCamEff-vWorld);
  vec3 weights=pow(abs(N),vec3(3.0)); weights/=max(weights.x+weights.y+weights.z,0.001);
  vec3 p=vWorld*0.35+vSeed*3.0;
  vec3 tex=texture(uRock,p.zy).rgb*weights.x+texture(uRock,p.xz).rgb*weights.y+texture(uRock,p.xy).rgb*weights.z;
  vec3 alb=pow(tex,vec3(1.8))*(0.68+0.22*vSeed);
  float wet=max(1.0-smoothstep(0.3,1.5,vWorld.y),uRain*0.38);
  alb*=1.0-0.38*wet;
  float snow=uSnowCover*smoothstep(3.0,9.0,vWorld.y)*smoothstep(0.4,0.85,N.y)*0.65;
  alb=mix(alb,vec3(0.64,0.70,0.72),snow);
  float nl=max(dot(N,uLight),0.0);
  vec3 col=alb*(uZenith*0.38+uHorizon*0.20+vec3(0.24*uAmbLum)+uSunCol*nl*0.5);
  col+=uSunCol*pow(max(dot(N,normalize(uLight+V)),0.0),60.0)*wet*0.07*nl;
  col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  if(uMode>0.5) o=vec4(enc(col),1.0); else o=vec4(tonemap(col),1.0);
}`;

const GRASS_VS=HDR+`
layout(location=0) in vec4 aPlant; layout(location=1) in vec4 aInfo;
uniform mat4 uVP; uniform float uMirror,uTime,uWindStrength; uniform vec2 uWindDir;
out vec3 vWorld; out float vHeight; out float vTint;
void main(){
  int blade=gl_VertexID/3, corner=gl_VertexID%3;
  float angle=aInfo.x*6.2831853+float(blade)*2.0943951;
  vec2 side=vec2(cos(angle),sin(angle));
  float h=aPlant.w*(0.74+0.26*fract(aInfo.y+float(blade)*0.37));
  float top=corner==2?1.0:0.0;
  float edge=corner==0?-1.0:(corner==1?1.0:0.0);
  float gust=0.75+0.25*sin(uTime*1.1-dot(aPlant.xz,uWindDir)*0.25+aInfo.z*8.0);
  vec2 bend=uWindDir*top*h*(0.10+0.45*gust)*clamp(uWindStrength,0.0,1.5);
  vec3 p=aPlant.xyz+vec3(side.x*edge*h*0.16+bend.x,top*h,side.y*edge*h*0.16+bend.y);
  vWorld=p; vHeight=top; vTint=aInfo.w;
  if(uMirror>0.5) p.y=-p.y;
  gl_Position=uVP*vec4(p,1.0);
}`;
const GRASS_FS=HDR+COMMON+`
in vec3 vWorld; in float vHeight; in float vTint; out vec4 o;
uniform vec3 uCamEff; uniform float uMode,uMirror,uSnowCover;
void main(){
  if(uMirror>0.5&&vWorld.y<0.0) discard;
  vec3 alb=mix(vec3(0.055,0.105,0.025),vec3(0.18,0.26,0.075),vHeight);
  alb*=0.82+0.38*vTint; alb*=1.0-uRain*0.17;
  alb=mix(alb,vec3(0.56,0.62,0.60),uSnowCover*0.45*smoothstep(2.0,8.0,vWorld.y));
  vec3 col=alb*(vec3(0.32+0.52*uAmbLum)+uHorizon*0.20+uSunCol*0.12);
  col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  if(uMode>0.5) o=vec4(enc(col),1.0); else o=vec4(tonemap(col),1.0);
}`;

const BIRD_VS=HDR+`
layout(location=0) in vec4 aBird; layout(location=1) in vec4 aInfo;
uniform mat4 uVP; uniform float uTime;
out vec3 vWorld; out float vShade;
void main(){
  /* Two tapered wings and a slender body. Wing tips flap independently. */
  const vec3 shape[12]=vec3[12](
    vec3(0.0,0.0,0.25),vec3(-1.0,0.0,-0.12),vec3(-0.22,0.0,-0.30),
    vec3(0.0,0.0,0.25),vec3(0.22,0.0,-0.30),vec3(1.0,0.0,-0.12),
    vec3(-0.11,0.0,-0.35),vec3(0.11,0.0,-0.35),vec3(0.0,0.0,0.55),
    vec3(-0.11,0.0,-0.35),vec3(0.0,0.0,-0.56),vec3(0.11,0.0,-0.35));
  vec3 q=shape[gl_VertexID];
  float phase=aInfo.x+uTime*(0.09+0.05*aInfo.y);
  vec3 forward=vec3(-sin(phase),0.0,cos(phase));
  vec3 right=vec3(forward.z,0.0,-forward.x);
  float flap=sin(uTime*(2.4+aInfo.y)+aInfo.z*18.0)*0.24;
  q.y+=abs(q.x)*flap;
  vec3 centre=aBird.xyz+vec3(cos(phase)*aBird.w,sin(uTime*0.7+aInfo.z*9.0)*0.45,sin(phase)*aBird.w);
  vWorld=centre+(right*q.x+vec3(0.0,q.y,0.0)+forward*q.z)*aInfo.w;
  vShade=0.4+0.6*(1.0-abs(q.x));
  gl_Position=uVP*vec4(vWorld,1.0);
}`;
const BIRD_FS=HDR+COMMON+`
in vec3 vWorld; in float vShade; out vec4 o; uniform vec3 uCamEff;
void main(){
  vec3 col=mix(vec3(0.12,0.15,0.16),vec3(0.58,0.61,0.58),vShade)*(0.25+0.65*uAmbLum);
  col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  o=vec4(tonemap(col),1.0);
}`;
const pIslandRock=program(ROCK_VS,ROCK_FS),pIslandGrass=program(GRASS_VS,GRASS_FS),pIslandBird=program(BIRD_VS,BIRD_FS);

function drawIslandDetails(mode,mirror,ce){
  const d=islands.details; if(!d) return;
  const snow=env.season===3?1:0;
  if(d.rocks.count){
    gl.useProgram(pIslandRock); setSky(pIslandRock);
    gl.uniformMatrix4fv(L(pIslandRock,'uVP'),false,VP); gl.uniform3fv(L(pIslandRock,'uCamEff'),ce);
    gl.uniform1f(L(pIslandRock,'uMode'),mode); gl.uniform1f(L(pIslandRock,'uMirror'),mirror); gl.uniform1f(L(pIslandRock,'uSnowCover'),snow);
    bindIslandTexture(6,islandTextures.rock,pIslandRock,'uRock');
    gl.bindVertexArray(d.rocks.vao); gl.drawElementsInstanced(gl.TRIANGLES,d.rocks.indexCount,gl.UNSIGNED_SHORT,0,d.rocks.count);
  }
  if(d.grass.count){
    gl.useProgram(pIslandGrass); setSky(pIslandGrass);
    gl.uniformMatrix4fv(L(pIslandGrass,'uVP'),false,VP); gl.uniform3fv(L(pIslandGrass,'uCamEff'),ce);
    gl.uniform1f(L(pIslandGrass,'uMode'),mode); gl.uniform1f(L(pIslandGrass,'uMirror'),mirror); gl.uniform1f(L(pIslandGrass,'uSnowCover'),snow);
    gl.uniform1f(L(pIslandGrass,'uWindStrength'),clamp(envS.wind/28,0,1)*islands.options.wind);
    gl.uniform2f(L(pIslandGrass,'uWindDir'),Math.sin(windAng),Math.cos(windAng));
    gl.bindVertexArray(d.grass.vao); gl.drawArraysInstanced(gl.TRIANGLES,0,9,d.grass.count);
  }
  /* Flocks shelter in the worst weather and after dark. They are drawn only
     in the visible pass, not into the submerged scene or reflection buffers. */
  const birdCount=Math.floor(d.birds.count*(1-sstep(0.55,0.95,envS.precip))*(1-sstep(0.45,0.9,sky.night)));
  if(!mode&&!mirror&&islands.options.birds&&birdCount>0){
    gl.useProgram(pIslandBird); setSky(pIslandBird);
    gl.uniformMatrix4fv(L(pIslandBird,'uVP'),false,VP); gl.uniform3fv(L(pIslandBird,'uCamEff'),ce);
    gl.bindVertexArray(d.birds.vao); gl.drawArraysInstanced(gl.TRIANGLES,0,12,birdCount);
  }
}
