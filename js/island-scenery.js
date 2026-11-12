'use strict';
/* ============================================================
   Biome scenery. Meshes are small, instanced and deterministic. They are
   decorative: the sampled terrain remains the only collision surface.
   Separate random streams keep unrelated layers stable when sliders move.
   ============================================================ */
function sceneryGeometry(){
  const v=[],ind=[];
  function vertex(p,n,kind,flex){ v.push(p[0],p[1],p[2],n[0],n[1],n[2],kind,flex); return v.length/8-1; }
  function tri(a,b,c){ ind.push(a,b,c); }
  function tube(points,radii,kind,flex){
    const sides=8, base=v.length/8;
    for(let j=0;j<points.length;j++) for(let k=0;k<=sides;k++){
      const a=k*Math.PI*2/sides, c=Math.cos(a),s=Math.sin(a),p=points[j];
      vertex([p[0]+c*radii[j],p[1],p[2]+s*radii[j]],[c,0.16,s],kind,flex*j/(points.length-1));
    }
    for(let j=0;j<points.length-1;j++) for(let k=0;k<sides;k++){
      const a=base+j*(sides+1)+k,b=a+1,c=a+sides+1,d=c+1;
      tri(a,c,b);tri(b,c,d);
    }
  }
  function leaf(a,b,c,kind,flex){
    const n=[0,0.92,0.38], i=vertex(a,n,kind,flex),j=vertex(b,n,kind,flex),k=vertex(c,n,kind,flex);
    tri(i,j,k);
  }
  function cactus(){
    tube([[0,0,0],[0,0.25,0],[0.01,0.5,0],[0.01,0.75,0],[0.01,0.96,0]],
         [0.12,0.12,0.11,0.10,0.055],2,0.03);
    tube([[0.03,0.34,0],[0.18,0.39,0],[0.26,0.50,0],[0.26,0.71,0],[0.26,0.79,0]],
         [0.075,0.075,0.07,0.065,0.035],2,0.03);
    tube([[-0.03,0.48,0],[-0.16,0.52,0],[-0.22,0.61,0],[-0.22,0.79,0],[-0.22,0.86,0]],
         [0.065,0.065,0.06,0.055,0.03],2,0.03);
  }
  function blossoms(){
    for(let j=0;j<4;j++){
      const a=j*2.4, x=Math.cos(a)*0.16,z=Math.sin(a)*0.16,h=0.52+(j%3)*0.13;
      /* Two thin crossed stem/leaf blades and a small five-petal flower. */
      leaf([x-0.012,0,z],[x+0.012,0,z],[x,h,z],3,0.45);
      leaf([x,0,z-0.012],[x,0,z+0.012],[x,h,z],3,0.45);
      for(let k=0;k<5;k++){
        const angle=k*Math.PI*2/5, ca=Math.cos(angle),sa=Math.sin(angle),cb=Math.cos(angle+0.65),sb=Math.sin(angle+0.65);
        leaf([x,h,z],[x+ca*0.105,h+0.025,z+sa*0.105],[x+cb*0.105,h+0.025,z+sb*0.105],4,0.7);
      }
    }
  }
  function spire(){
    const sides=7,rings=6,base=v.length/8;
    const radii=[0.31,0.30,0.25,0.23,0.15,0.025];
    for(let j=0;j<rings;j++) for(let k=0;k<=sides;k++){
      const t=j/(rings-1), a=k*Math.PI*2/sides, corner=k%sides;
      const r=radii[j]*(0.78+0.22*Math.sin(corner*5.3+j*1.7+0.8));
      vertex([Math.cos(a)*r+0.07*t*t,t+0.035*t*Math.sin(corner*3.1),Math.sin(a)*r],
             [Math.cos(a),0.24,Math.sin(a)],5,0);
    }
    for(let j=0;j<rings-1;j++) for(let k=0;k<sides;k++){
      const a=base+j*(sides+1)+k,b=a+1,c=a+sides+1,d=c+1;
      tri(a,c,b);tri(b,c,d);
    }
    const top=vertex([0.04,1.04,0],[0,1,0],5,0);
    for(let k=0;k<sides;k++) tri(base+(rings-1)*(sides+1)+k,top,base+(rings-1)*(sides+1)+k+1);
  }
  /* A fern is a rosette of arching fronds. Each frond is a tapered ribbon, so
     the generated frond texture can be sampled per fragment without any UV
     attribute or extra buffer layout. */
  function fern(){
    const fronds=6, segments=5;
    for(let f=0;f<fronds;f++){
      const a=f*Math.PI*2/fronds+0.35, ca=Math.cos(a), sa=Math.sin(a);
      const base=v.length/8;
      for(let j=0;j<=segments;j++){
        const t=j/segments, reach=(0.12+0.78*t)*0.52, rise=(0.18+0.60*t)-0.30*t*t;
        const half=0.135*Math.sin(Math.PI*Math.min(1,t*1.1+0.12))*(1-0.35*t)+0.012;
        const cx=ca*reach, cz=sa*reach, nx=-sa*half, nz=ca*half;
        vertex([cx-nx,rise,cz-nz],[0,0.88,0],6,0.55*t*t);
        vertex([cx+nx,rise,cz+nz],[0,0.88,0],6,0.55*t*t);
      }
      for(let j=0;j<segments;j++){
        const a0=base+j*2;
        tri(a0,a0+2,a0+1); tri(a0+1,a0+2,a0+3);
      }
    }
  }
  /* Reeds and bamboo: several slim stalks leaning on the breeze. */
  function reeds(){
    for(let i=0;i<5;i++){
      const a=i*2.399+0.4, lean=0.09+0.045*i, top=0.74+0.16*Math.sin(i*3.1);
      const dx=Math.cos(a), dz=Math.sin(a);
      tube([[0,0,0],[dx*lean*0.3,top*0.42,dz*lean*0.3],
            [dx*lean,top*0.76,dz*lean],[dx*lean*1.6,top,dz*lean*1.6]],
           [0.030,0.026,0.020,0.011],7,0.85);
    }
  }
  /* Mushrooms: a slim stem under a domed cap. */
  function mushroom(){
    tube([[0,0,0],[0,0.17,0],[0,0.31,0]],[0.036,0.032,0.041],8,0.25);
    const sides=10,rings=3,base=v.length/8;
    const profile=[[0.40,0.260],[0.33,0.318],[0.17,0.348]];
    for(let j=0;j<rings;j++) for(let k=0;k<=sides;k++){
      const a=k*Math.PI*2/sides, r=profile[j][0];
      vertex([Math.cos(a)*r,profile[j][1],Math.sin(a)*r],[Math.cos(a)*0.42,0.90,Math.sin(a)*0.42],8,0);
    }
    for(let j=0;j<rings-1;j++) for(let k=0;k<sides;k++){
      const a0=base+j*(sides+1)+k;
      tri(a0,a0+sides+1,a0+1); tri(a0+1,a0+sides+1,a0+sides+2);
    }
    const top=vertex([0,0.358,0],[0,1,0],8,0);
    for(let k=0;k<sides;k++) tri(base+(rings-1)*(sides+1)+k,top,base+(rings-1)*(sides+1)+k+1);
  }
  /* A moss cushion is a low, lumpy dome that rounds off ledges. */
  function cushion(){
    const sides=9,rings=4,base=v.length/8;
    for(let j=0;j<rings;j++){
      const t=j/(rings-1), r=0.36*(1-t)*(1-t*0.55)+0.02, y=0.015+0.155*Math.sin(t*Math.PI*0.5);
      for(let k=0;k<=sides;k++){
        const a=k*Math.PI*2/sides, bump=1.0+0.13*Math.sin(k*2.3+j*1.7);
        vertex([Math.cos(a)*r*bump,y,Math.sin(a)*r*bump],[Math.cos(a)*0.55,0.85,Math.sin(a)*0.55],9,0);
      }
    }
    for(let j=0;j<rings-1;j++) for(let k=0;k<sides;k++){
      const a0=base+j*(sides+1)+k;
      tri(a0,a0+sides+1,a0+1); tri(a0+1,a0+sides+1,a0+sides+2);
    }
  }
  function result(build){ v.length=0;ind.length=0;build();return {vertices:new Float32Array(v),indices:new Uint16Array(ind)}; }
  /* The palm draw uses gl_VertexID; provide a small valid vertex buffer even
     on drivers that validate enabled but inactive attributes in the VAO. */
  return {palm:{vertices:new Float32Array(18*8),indices:new Uint16Array(0)},
    cactus:result(cactus),flower:result(blossoms),spire:result(spire),
    fern:result(fern),reeds:result(reeds),mushroom:result(mushroom),cushion:result(cushion)};
}

function sceneryInstances(data,geometry){
  const vao=gl.createVertexArray(),vb=gl.createBuffer(),ib=gl.createBuffer(),instances=gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,geometry.vertices,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,32,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,32,12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,2,gl.FLOAT,false,32,24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,geometry.indices,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,instances); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,4,gl.FLOAT,false,32,0); gl.vertexAttribDivisor(3,1);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,4,gl.FLOAT,false,32,16); gl.vertexAttribDivisor(4,1);
  gl.bindVertexArray(null);
  return {vao,vb,ib,instances,count:data.length/8,indexCount:geometry.indices.length};
}

/* Find short downhill courses on actual sampled terrain. The strip conforms to
   the mesh on both sides and fades at its ends; it is not a separate collider. */
function makeIslandCascades(random,options){
  const vertices=[],indices=[],paths=[];
  for(const I of islands.land){
    if(I.biome==='desert'||I.biome==='volcanic'||options.cascades<=0) continue;
    const wanted=Math.floor(options.cascades)+(random()<options.cascades%1?1:0), used=[];
    for(let f=0;f<wanted;f++){
      let best=null;
      for(let candidate=0;candidate<32;candidate++){
        const a=random()*Math.PI*2,phase=random()*Math.PI*2,curve=0.13+random()*0.12,samples=[];
        let rises=0;
        for(let j=0;j<=20;j++){
          const r=0.40+j*0.029,angle=a+curve*(r-0.4)*Math.sin((r-0.4)*8+phase);
          const lx=Math.cos(angle)*I.rx*r,lz=Math.sin(angle)*I.rz*r;
          const x=I.x+I.cs*lx-I.sn*lz,z=I.z+I.sn*lx+I.cs*lz,y=islandGround(x,z);
          if(y<0.25){
            /* Finish near the waterline rather than abruptly high on a cliff. */
            if(samples.length){
              const p=samples[samples.length-1];let lo=0,hi=1;
              for(let k=0;k<8;k++){
                const t=(lo+hi)*0.5,h=islandGround(lerp(p[0],x,t),lerp(p[1],z,t));
                if(h>0.25) lo=t; else hi=t;
              }
              const xx=lerp(p[0],x,lo),zz=lerp(p[1],z,lo);
              samples.push([xx,zz,islandGround(xx,zz)]);
            }
            break;
          }
          if(samples.length&&y>samples[samples.length-1][2]) rises+=y-samples[samples.length-1][2];
          samples.push([x,z,y]);
        }
        if(samples.length<8||used.some(p=>Math.hypot(p[0]-samples[0][0],p[1]-samples[0][1])<2.2)) continue;
        const drop=samples[0][2]-samples[samples.length-1][2];
        const score=drop-rises*2.5;
        if(drop>2.2&&score>2.0&&(!best||score>best.score)) best={samples,score};
      }
      if(!best) continue;
      const samples=best.samples,base=vertices.length/6,width=0.32+random()*0.18,seed=random();
      used.push(samples[0]);
      for(let j=0;j<samples.length;j++){
        const p=samples[j],prev=samples[Math.max(0,j-1)],next=samples[Math.min(samples.length-1,j+1)];
        let dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz)||1; dx/=len;dz/=len;
        const t=j/(samples.length-1),w=width*(0.72+0.50*t)*(0.94+0.06*Math.sin(t*15+seed*7));
        for(const side of [-1,1]){
          const x=p[0]-dz*w*side,z=p[1]+dx*w*side,y=islandGround(x,z)+0.12;
          vertices.push(x,y,z,(side+1)*0.5,t,seed);
        }
        if(j){const a=base+(j-1)*2,b=a+1,c=a+2,d=a+3;indices.push(a,c,b,b,c,d);}
      }
      paths.push(samples);
    }
  }
  const vao=gl.createVertexArray(),vb=gl.createBuffer(),ib=gl.createBuffer();
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return {vao,vb,ib,count:indices.length,paths};
}

function makeIslandScenery(options){
  const palmRandom=islandRandom(islands.seed^0x4f9bd231), cactusRandom=islandRandom(islands.seed^0x6c8f1173);
  const flowerRandom=islandRandom(islands.seed^0x7128bc25), spireRandom=islandRandom(islands.seed^0x9a127d5b);
  const fernRandom=islandRandom(islands.seed^0x21c4e7a9), reedRandom=islandRandom(islands.seed^0x5be10d37);
  const mushroomRandom=islandRandom(islands.seed^0x83f61cc5), cushionRandom=islandRandom(islands.seed^0xa7d3092b);
  const palms=[],cacti=[],flowers=[],spires=[],ferns=[],reeds=[],mushrooms=[],cushions=[],normal={nx:0,ny:1,nz:0};
  for(const I of islands.land){
    const biome=ISLAND_BIOMES[I.biome].id, eco=ISLAND_BIOMES[I.biome];
    function place(random,target,minY,minNormal,data,height,accept,spacing){
      const occupied=[]; let added=0;
      if(target<=0) return;
      for(let tries=0;tries<target*18&&added<target;tries++){
        const p=islandDetailPoint(I,random); if(!p) continue;
        const y=islandGround(p[0],p[1],normal);
        if(y<minY||normal.ny<minNormal||(accept&&!accept(p,y))) continue;
        const h=height(random),space=spacing!==undefined?spacing:
          (data===flowers?0.22:data===spires?1.8:data===cushions?0.30:0.9);
        let crowded=false; for(const q of occupied) if((q[0]-p[0])**2+(q[1]-p[1])**2<space*space){crowded=true;break;}
        if(crowded) continue;
        occupied.push(p);data.push(p[0],y-0.04,p[1],h,random()*Math.PI*2,biome,random(),random());added++;
      }
    }
    if(I.biome==='tropical'){
      place(palmRandom,Math.round(I.rx*I.rz*0.19*options.trees),1.1,0.72,palms,
        r=>(3.2+3.0*r())*options.treeScale,p=>islandNoise(p[0]*0.13,p[1]*0.13,I.seed+135)>0.34);
    }
    if(I.biome==='desert'){
      place(cactusRandom,Math.round(I.rx*I.rz*0.10*options.trees),1.3,0.76,cacti,
        r=>(1.4+1.8*r())*options.treeScale);
    }
    const bloom=I.biome==='volcanic'?0.03:I.biome==='desert'?0.12:I.biome==='alpine'?0.48:1;
    place(flowerRandom,Math.round(I.rx*I.rz*0.55*options.flowers*bloom),1.4,0.77,flowers,
      r=>0.55+0.45*r(),p=>islandNoise(p[0]*0.22+5,p[1]*0.22,I.seed+411)>0.38);
    place(spireRandom,Math.round((0.6+I.rx*0.10)*options.landmarks),1.2,0.62,spires,
      r=>(I.biome==='volcanic'?2.4:1.5)+2.5*r());
    /* Ferns prefer sheltered, damp ground away from the windward cliff. */
    place(fernRandom,Math.round(I.rx*I.rz*0.40*options.flowers*(eco.ferns||0)),1.6,0.70,ferns,
      r=>0.80+0.62*r(),p=>islandNoise(p[0]*0.19+2,p[1]*0.19-9,I.seed+512)>0.40,0.55);
    /* Reeds fill the wet margins just above the tide line. */
    place(reedRandom,Math.round((I.rx+I.rz)*0.46*options.grass*(eco.reeds||0)),0.34,0.80,reeds,
      r=>0.85+0.70*r(),(p,y)=>y<3.4,0.42);
    /* Mushrooms grow in seeded rings in the shade; mossland ones glow. */
    place(mushroomRandom,Math.round((I.rx+I.rz)*0.34*options.rocks*(eco.mushrooms||0)),1.2,0.72,mushrooms,
      r=>0.62+0.85*r(),p=>islandNoise(p[0]*0.33+7,p[1]*0.33+3,I.seed+707)>0.54,0.34);
    /* Moss cushions round off every ledge they can reach. */
    place(cushionRandom,Math.round(I.rx*I.rz*1.10*options.grass*(eco.cushions||0)),0.9,0.66,cushions,
      r=>0.85+1.25*r(),null,0.30);
  }
  const geom=sceneryGeometry();
  islands.scenery={palms:sceneryInstances(palms,geom.palm),cacti:sceneryInstances(cacti,geom.cactus),
    flowers:sceneryInstances(flowers,geom.flower),spires:sceneryInstances(spires,geom.spire),
    ferns:sceneryInstances(ferns,geom.fern),reeds:sceneryInstances(reeds,geom.reeds),
    mushrooms:sceneryInstances(mushrooms,geom.mushroom),cushions:sceneryInstances(cushions,geom.cushion),
    cascades:makeIslandCascades(islandRandom(islands.seed^0x6419bcf3),options)};
}
function disposeIslandScenery(){
  if(!islands.scenery) return;
  for(const item of Object.values(islands.scenery)){
    gl.deleteVertexArray(item.vao);gl.deleteBuffer(item.vb);gl.deleteBuffer(item.ib);
    if(item.instances) gl.deleteBuffer(item.instances);
  }
  islands.scenery=null;
}
function rebuildIslandScenery(options){
  if(!islands.active) return;
  disposeIslandScenery();makeIslandScenery(options);
}

/* Like the original photographic pines, palms are depth-writing cutouts. A
   subdivided card keeps the trunk rooted while the crown responds to gusts. */
const PALM_VS=HDR+`
layout(location=3) in vec4 aInstance; layout(location=4) in vec4 aInfo;
uniform mat4 uVP; uniform vec3 uCamEff; uniform float uMirror,uTime,uWindStrength; uniform vec2 uWindDir;
out vec2 vUV; out vec3 vWorld; out float vTint; flat out float vVariant;
void main(){
  vec2 c=vec2(float(gl_VertexID&1),float(gl_VertexID>>1)/8.0);
  vec2 view=uCamEff.xz-aInstance.xz;view/=max(length(view),0.001);
  vec3 right=vec3(view.y,0.0,-view.x);vec2 side=vec2(-uWindDir.y,uWindDir.x);
  float gust=0.75+0.25*sin(uTime*0.85-dot(aInstance.xz,uWindDir)*0.16+aInfo.z*8.0);
  vec2 bend=(uWindDir*(0.04+0.13*gust)+side*0.024*sin(uTime*2.0+aInfo.z*17.0+c.y*5.0))
             *clamp(uWindStrength,0.0,1.5)*c.y*c.y*aInstance.w;
  bool flipped=aInfo.z>0.5;vVariant=step(0.5,aInfo.w);
  /* The second cutout leans; keep its off-centre trunk anchored to the soil. */
  float offset=vVariant*0.391*(flipped?-1.0:1.0);
  vec3 p=aInstance.xyz+right*((c.x-0.5+offset)*aInstance.w*0.68)+vec3(bend.x,c.y*aInstance.w,bend.y);
  vWorld=p;vUV=vec2(flipped?1.0-c.x:c.x,c.y);vTint=aInfo.z;
  if(uMirror>0.5)p.y=-p.y;gl_Position=uVP*vec4(p,1.0);
}`;
const PALM_FS=HDR+COMMON+`
in vec2 vUV; in vec3 vWorld; in float vTint; flat in float vVariant; out vec4 o;
uniform sampler2D uPalm,uPalm2; uniform vec3 uCamEff; uniform float uMode,uMirror,uSnowCover;
void main(){
  if(uMirror>0.5&&vWorld.y<0.0)discard;
  vec4 tex=vVariant>0.5?texture(uPalm2,vUV):texture(uPalm,vUV);if(tex.a<0.16)discard;
  vec3 alb=pow(tex.rgb,vec3(1.75))*(0.85+0.25*vTint)*(1.0-0.18*uRain);
  alb=mix(alb,vec3(0.57,0.63,0.60),uSnowCover*0.16*smoothstep(0.55,0.85,vUV.y));
  vec3 col=alb*(vec3(0.30+0.52*uAmbLum)+uHorizon*0.22+uSunCol*0.17);
  col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  if(uMode>0.5)o=vec4(enc(col),1.0);else o=vec4(tonemap(col),1.0);
}`;
const SCENERY_VS=HDR+`
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in vec2 aMaterial;
layout(location=3) in vec4 aInstance; layout(location=4) in vec4 aInfo;
uniform mat4 uVP; uniform float uMirror,uTime,uWindStrength; uniform vec2 uWindDir;
out vec3 vWorld; out vec3 vN; out vec3 vLocal; out float vSeed; flat out float vKind; flat out float vBiome;
void main(){
  float c=cos(aInfo.x),s=sin(aInfo.x);
  vec3 q=vec3(c*aPos.x-s*aPos.z,aPos.y,s*aPos.x+c*aPos.z)*aInstance.w;
  vec2 side=vec2(-uWindDir.y,uWindDir.x);
  float gust=0.75+0.25*sin(uTime*0.9-dot(aInstance.xz,uWindDir)*0.16+aInfo.z*12.0);
  vec2 bend=(uWindDir*(0.035+0.10*gust)+side*0.018*sin(uTime*2.0+aInfo.z*15.0+aPos.y*4.0))
             *aMaterial.y*aMaterial.y*clamp(uWindStrength,0.0,1.5)*aInstance.w;
  q.xz+=bend;
  vWorld=aInstance.xyz+q;
  vN=normalize(vec3(c*aNormal.x-s*aNormal.z,aNormal.y,s*aNormal.x+c*aNormal.z));
  vKind=aMaterial.x;vBiome=aInfo.y;vSeed=aInfo.z;vLocal=aPos;
  vec3 p=vWorld;if(uMirror>0.5)p.y=-p.y;
  gl_Position=uVP*vec4(p,1.0);
}`;
const SCENERY_FS=HDR+COMMON+`
in vec3 vWorld; in vec3 vN; in vec3 vLocal; in float vSeed; flat in float vKind; flat in float vBiome; out vec4 o;
uniform sampler2D uRock,uBasalt,uSandstone,uCactus,uMoss,uFern,uReed;
uniform vec3 uCamEff; uniform float uMode,uMirror,uSnowCover;
/* Tri-planar sampling of a seamless generated surface. It keeps leaf, skin
   and bark detail at a constant scale on every face of a plant, with no UV
   attribute and no seam where a procedural tube closes. */
vec3 triplant(sampler2D map,vec3 p,vec3 n,float scale){
  vec3 w=pow(abs(n),vec3(4.0)); w/=max(w.x+w.y+w.z,0.001);
  return texture(map,p.zy*scale).rgb*w.x+texture(map,p.xz*scale).rgb*w.y+texture(map,p.xy*scale).rgb*w.z;
}
void main(){
  if(uMirror>0.5&&vWorld.y<0.0) discard;
  vec3 N=normalize(vN),alb;
  vec3 emit=vec3(0.0);
  float grain=texture(uDetail,vWorld.xz*0.8+vWorld.y*0.11).a;
  if(vKind<2.5){
    /* Cactus: the generated ribbed skin, wrapped around the column axis so
       the ridges and areoles run up the plant the way real ribs do. */
    vec2 cuv=vec2(atan(vLocal.z,vLocal.x)*0.15915494+0.5,vLocal.y*1.30+0.08);
    vec3 skin=texture(uCactus,cuv).rgb;
    alb=mix(skin*0.62,vec3(0.048,0.112,0.056),0.25)*(0.86+0.26*vSeed);
    alb*=0.88+0.12*sin(cuv.x*50.265);
    alb*=0.80+0.24*grain;
  }else if(vKind<3.5){
    alb=vec3(0.07,0.16,0.035)*(0.88+0.20*vSeed);
  }else if(vKind<4.5){
    vec3 a=vBiome>0.5&&vBiome<1.5?vec3(0.68,0.13,0.20):vec3(0.75,0.55,0.16);
    vec3 b=vBiome>2.5&&vBiome<3.5?vec3(0.43,0.27,0.62):vec3(0.75,0.75,0.62);
    if(vBiome>4.5) b=vec3(0.60,0.71,0.88);
    alb=mix(a,b,vSeed);
  }else if(vKind<5.5){
    vec3 w=pow(abs(N),vec3(3.0));w/=max(w.x+w.y+w.z,0.001);vec3 p=vWorld*0.25+vSeed*3.0;vec3 tex;
    if(vBiome>1.5&&vBiome<2.5) tex=texture(uBasalt,p.zy).rgb*w.x+texture(uBasalt,p.xz).rgb*w.y+texture(uBasalt,p.xy).rgb*w.z;
    else if(vBiome>3.5&&vBiome<4.5) tex=texture(uSandstone,p.zy).rgb*w.x+texture(uSandstone,p.xz).rgb*w.y+texture(uSandstone,p.xy).rgb*w.z;
    else tex=texture(uRock,p.zy).rgb*w.x+texture(uRock,p.xz).rgb*w.y+texture(uRock,p.xy).rgb*w.z;
    alb=pow(tex,vec3(1.7))*0.90;
    if(vBiome>1.5&&vBiome<2.5) alb+=vec3(0.012);
    if(vBiome>4.5){
      float cap=smoothstep(0.36,0.86,N.y);
      alb=mix(alb,alb*vec3(0.68,1.14,0.64)+vec3(0.010,0.028,0.008),cap*0.55);
    }
  }else if(vKind<6.5){
    /* Fern: generated fronds sampled tri-planar, tinted per plant. */
    vec3 frond=triplant(uFern,vLocal*3.6+vec3(vSeed*2.3,vSeed*1.1,0.0),N,1.0);
    alb=pow(frond,vec3(1.15))*vec3(0.78,1.18,0.70)*(0.82+0.30*vSeed);
    alb*=0.88+0.18*grain;
    if(vBiome>4.5) alb=mix(alb,alb*vec3(0.86,1.10,1.02),0.35);
  }else if(vKind<7.5){
    /* Reeds and bamboo: vertical stalks from the generated reed sheet. */
    vec2 ruv=vec2(atan(vLocal.z,vLocal.x)*0.15915494+0.5,vLocal.y*1.9+vSeed);
    vec3 stalk=texture(uReed,ruv).rgb;
    alb=pow(stalk,vec3(1.18))*vec3(0.96,1.10,0.74)*(0.86+0.22*grain);
  }else if(vKind<8.5){
    /* Mushrooms: cap fibres and creamy speckles. Mossland ones are luminous
       after dark, which reads as bioluminescence rather than lampshades. */
    float spots=smoothstep(0.60,0.78,texture(uDetail,vLocal.xz*6.5+vSeed*4.0).a);
    alb=mix(vec3(0.34,0.15,0.09),vec3(0.74,0.46,0.22),vSeed);
    alb=mix(alb,vec3(0.88,0.86,0.72),spots*0.8);
    alb*=0.86+0.26*grain;
    if(vBiome>4.5) emit=vec3(0.10,0.46,0.36)*uNight*(1.3+0.9*vSeed);
  }else{
    /* Moss cushion: the generated carpet wrapped over a low dome. */
    vec3 carpet=triplant(uMoss,vLocal*3.1+vec3(vSeed*3.0),N,1.0);
    alb=pow(carpet,vec3(1.22))*vec3(0.80,1.14,0.74)*(0.86+0.30*vSeed);
    alb*=0.84+0.22*grain;
  }
  alb*=1.0-uRain*0.20;
  float snow=max(uSnowCover,(vBiome>2.5&&vBiome<3.5)?0.75:0.0)*smoothstep(5.0,11.0,vWorld.y)*smoothstep(0.35,0.85,N.y);
  alb=mix(alb,vec3(0.61,0.68,0.70),snow*0.65);
  float nl=max(dot(N,uLight),0.0);
  vec3 col=alb*(uZenith*0.38+uHorizon*0.20+vec3(0.28*uAmbLum)+uSunCol*(0.15+0.35*nl));
  col+=emit;
  col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  if(uMode>0.5) o=vec4(enc(col),1.0); else o=vec4(tonemap(col),1.0);
}`;
const CASCADE_VS=HDR+`
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aFlow;
uniform mat4 uVP; uniform float uMirror;
out vec3 vWorld; out vec3 vFlow;
void main(){vWorld=aPos;vFlow=aFlow;vec3 p=aPos;if(uMirror>0.5)p.y=-p.y;gl_Position=uVP*vec4(p,1.0);}`;
const CASCADE_FS=HDR+COMMON+`
in vec3 vWorld; in vec3 vFlow; out vec4 o;
uniform vec3 uCamEff; uniform float uMode,uMirror;
void main(){
  if(uMirror>0.5&&vWorld.y<0.0) discard;
  float flow=texture(uDetail,vec2(vFlow.x*2.1+vFlow.z,vFlow.y*5.0-uTime*0.50)).a;
  float fine=texture(uDetail,vec2(vFlow.x*4.7-vFlow.z,vFlow.y*10.0-uTime*0.85)).a;
  float thread=0.5+0.5*sin(vFlow.x*42.0+flow*4.0+vFlow.z*8.0);
  float froth=smoothstep(0.32,0.72,flow*0.48+fine*0.27+thread*0.25);
  float bank=(flow-0.5)*0.09;
  float edge=smoothstep(0.02,0.20,vFlow.x+bank)*(1.0-smoothstep(0.80,0.98,vFlow.x-bank));
  float end=smoothstep(0.0,0.08,vFlow.y)*(1.0-smoothstep(0.94,1.0,vFlow.y));
  vec3 col=mix(vec3(0.27,0.34,0.33),vec3(0.83,0.88,0.84),froth);
  col*=0.48+0.48*uAmbLum;col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  float alpha=edge*end*(0.27+0.40*froth);
  if(uMode>0.5) o=vec4(enc(col),alpha);else o=vec4(tonemap(col),alpha);
}`;
const pScenery=program(SCENERY_VS,SCENERY_FS,'island scenery'),pCascade=program(CASCADE_VS,CASCADE_FS,'island cascade'),
  pPalm=program(PALM_VS,PALM_FS,'island palm');

function drawIslandScenery(mode,mirror,ce){
  const d=islands.scenery;if(!d)return;
  if(d.palms.count&&islandTextures.palm){
    gl.useProgram(pPalm);setSky(pPalm);
    gl.uniformMatrix4fv(L(pPalm,'uVP'),false,VP);gl.uniform3fv(L(pPalm,'uCamEff'),ce);
    gl.uniform1f(L(pPalm,'uMode'),mode);gl.uniform1f(L(pPalm,'uMirror'),mirror);
    gl.uniform1f(L(pPalm,'uSnowCover'),env.season===3?1:0);
    gl.uniform1f(L(pPalm,'uWindStrength'),clamp(envS.wind/28,0,1)*islands.options.wind);
    gl.uniform2f(L(pPalm,'uWindDir'),Math.sin(windAng),Math.cos(windAng));
    bindIslandTexture(10,islandTextures.palm,pPalm,'uPalm');
    bindIslandTexture(14,islandTextures.palm2||islandTextures.palm,pPalm,'uPalm2');
    gl.bindVertexArray(d.palms.vao);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,18,d.palms.count);
  }
  gl.useProgram(pScenery);setSky(pScenery);
  gl.uniformMatrix4fv(L(pScenery,'uVP'),false,VP);gl.uniform3fv(L(pScenery,'uCamEff'),ce);
  gl.uniform1f(L(pScenery,'uMode'),mode);gl.uniform1f(L(pScenery,'uMirror'),mirror);
  gl.uniform1f(L(pScenery,'uSnowCover'),env.season===3?1:0);
  gl.uniform1f(L(pScenery,'uWindStrength'),clamp(envS.wind/28,0,1)*islands.options.wind);
  gl.uniform2f(L(pScenery,'uWindDir'),Math.sin(windAng),Math.cos(windAng));
  bindIslandTexture(6,islandTextures.rock,pScenery,'uRock');
  bindIslandTexture(7,islandTextures.basalt||islandTextures.rock,pScenery,'uBasalt');
  bindIslandTexture(8,islandTextures.sandstone||islandTextures.talus,pScenery,'uSandstone');
  bindIslandTexture(9,islandTextures.cactus||islandTextures.grass,pScenery,'uCactus');
  bindIslandTexture(10,islandTextures.moss||islandTextures.grass,pScenery,'uMoss');
  bindIslandTexture(11,islandTextures.fern||islandTextures.grass,pScenery,'uFern');
  bindIslandTexture(12,islandTextures.reed||islandTextures.talus,pScenery,'uReed');
  for(const item of [d.cacti,d.flowers,d.spires,d.ferns,d.reeds,d.mushrooms,d.cushions]) if(item.count){
    gl.bindVertexArray(item.vao);gl.drawElementsInstanced(gl.TRIANGLES,item.indexCount,gl.UNSIGNED_SHORT,0,item.count);
  }
  if(d.cascades.count){
    gl.useProgram(pCascade);setSky(pCascade);
    gl.uniformMatrix4fv(L(pCascade,'uVP'),false,VP);gl.uniform3fv(L(pCascade,'uCamEff'),ce);
    gl.uniform1f(L(pCascade,'uMode'),mode);gl.uniform1f(L(pCascade,'uMirror'),mirror);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    gl.bindVertexArray(d.cascades.vao);gl.drawElements(gl.TRIANGLES,d.cascades.count,gl.UNSIGNED_SHORT,0);
    gl.depthMask(true);gl.disable(gl.BLEND);
  }
}
