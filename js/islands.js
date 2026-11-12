'use strict';
/* ============================================================
   Island archipelago

   Each island is an independently seeded heightfield, with a submerged
   shelf, headlands, cliffs, sheltered beaches and eroded high ground. The
   same sampled surface drives the mesh, ball collision and shoreline map.
   ============================================================ */
const ISLAND_MAP_SIZE=512, ISLAND_MAP_HALF=80, ISLAND_MAP_DEPTH=12;
const ISLAND_STYLES={
  wild:      {cliff:1,    peak:1,    beach:1},
  coves:     {cliff:0.76, peak:0.76, beach:1.45},
  highlands: {cliff:1.12, peak:1.38, beach:0.76}
};
/* Biomes change terrain, materials and ecology independently of coast style.
   The numeric IDs are shared by the instanced detail and terrain shaders. */
const ISLAND_BIOMES={
  temperate:{id:0,pines:1.00,grass:1.00,rocks:1.00,ferns:0.55,reeds:0.20,mushrooms:0.18,cushions:0.35},
  tropical: {id:1,pines:0.00,grass:1.15,rocks:0.75,ferns:0.95,reeds:0.30,mushrooms:0.10,cushions:0.30},
  volcanic: {id:2,pines:0.00,grass:0.18,rocks:1.35,ferns:0.05,reeds:0.00,mushrooms:0.04,cushions:0.08},
  alpine:   {id:3,pines:0.72,grass:0.55,rocks:1.30,ferns:0.28,reeds:0.10,mushrooms:0.22,cushions:0.55},
  desert:   {id:4,pines:0.00,grass:0.22,rocks:1.05,ferns:0.02,reeds:0.00,mushrooms:0.00,cushions:0.05},
  /* Mossland: wet, terraced karst with hanging ferns, reed hollows, moss
     cushions and luminous mushrooms. Its dense heightfield resolves shelves
     and towers that the other biomes do not have. */
  moss:     {id:5,pines:0.42,grass:1.50,rocks:1.12,ferns:1.70,reeds:0.85,mushrooms:1.25,cushions:1.90},
  /* Atoll: a continuous ring of low coral motu around a pale lagoon. The
     heightfield stays single-valued, so the lagoon is real shoaling water
     rather than a painted colour and the ring remains one walkable shore. */
  atoll:    {id:6,pines:0.00,grass:0.40,rocks:0.34,ferns:0.35,reeds:0.30,mushrooms:0.00,cushions:0.14},
  /* Fjord: one drowned channel cutting into a steep massif, with hanging
     shoulders, wet black rock, moss ledges and snow-bright summits. */
  fjord:    {id:7,pines:0.86,grass:0.90,rocks:1.32,ferns:0.80,reeds:0.18,mushrooms:0.34,cushions:0.80}
};
const ISLAND_BIOME_KEYS=Object.keys(ISLAND_BIOMES);
/* Layouts only move the same seeded islands; they never change the safe
   channel guarantees, so collision, surf and the chart keep working. */
const ISLAND_LAYOUTS={
  scattered:{label:'Scattered'},
  lagoon:{label:'Lagoon'},
  chain:{label:'Chain'}
};
const ISLAND_PRESETS={
  natural:{drama:0,terraces:0,shelf:1,stacks:0.25,mist:0.12,spread:1},
  cinematic:{drama:1.05,terraces:0.45,shelf:1.3,stacks:0.9,mist:0.62,spread:1.06},
  storybook:{drama:0.55,terraces:0.75,shelf:1.15,stacks:0.5,mist:0.48,spread:0.94},
  epic:{drama:1.5,terraces:0.15,shelf:0.85,stacks:1.5,mist:0.32,spread:1.16}
};
const ISLAND_DEFAULTS={style:'wild',biome:'temperate',count:5,relief:1,coast:1,beach:1,features:1,
  layout:'scattered',spread:1,drama:0,terraces:0,shelf:1,stacks:0.25,mist:0.12,
  trees:1,treeScale:1,grass:1,rocks:1,flowers:1,landmarks:1,cascades:1,birds:true,wind:1,surf:1};
/* Keep the public generator safe even when invoked outside the settings UI. */
function islandConfig(input){
  const o=Object.assign({},ISLAND_DEFAULTS,input||{}), number=(v,lo,hi,d)=>Number.isFinite(v)?clamp(v,lo,hi):d;
  return {
    style:Object.prototype.hasOwnProperty.call(ISLAND_STYLES,o.style)?o.style:'wild',
    biome:o.biome==='mixed'||Object.prototype.hasOwnProperty.call(ISLAND_BIOMES,o.biome)?o.biome:'temperate',
    layout:Object.prototype.hasOwnProperty.call(ISLAND_LAYOUTS,o.layout)?o.layout:'scattered',
    count:Math.round(number(o.count,3,5,5)),relief:number(o.relief,0.6,1.45,1),
    coast:number(o.coast,0.5,1.2,1),beach:number(o.beach,0.5,1.5,1),features:number(o.features,0,1.5,1),
    spread:number(o.spread,0.75,1.5,1),drama:number(o.drama,0,1.5,0),terraces:number(o.terraces,0,1.5,0),
    shelf:number(o.shelf,0.6,1.6,1),stacks:number(o.stacks,0,1.5,0.25),mist:number(o.mist,0,1.5,0.12),
    trees:number(o.trees,0,1.7,1),treeScale:number(o.treeScale,0.7,1.4,1),
    grass:number(o.grass,0,1.5,1),rocks:number(o.rocks,0,1.5,1),
    flowers:number(o.flowers,0,1.5,1),landmarks:number(o.landmarks,0,1.5,1),cascades:number(o.cascades,0,1.5,1),
    birds:typeof o.birds==='boolean'?o.birds:true,wind:number(o.wind,0,1.5,1),surf:number(o.surf,0,1.5,1)
  };
}
const islands={active:false,seed:0,options:islandConfig(),land:[],coast:[],trees:null,treeCount:0,details:null,nextCrash:0,shoreClock:0};

function islandRandom(seed){
  let a=seed>>>0;
  return ()=>{ a=(a+0x6d2b79f5)>>>0; let t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
}
function islandNoise(x,z,seed){
  return vnoise(x,z,4096,seed)*0.57+vnoise(x*2.13+17,z*2.13-9,4096,seed+17)*0.28+
    vnoise(x*4.37-3,z*4.37+21,4096,seed+43)*0.15;
}
/* Ridged multifractal: |noise| folded about its midpoint gives sharp crests
   and rounded troughs, which is what makes eroded spurs, karst flutes and
   terrace risers read as landform rather than as rolling hills. */
function islandRidged(x,z,seed,octaves){
  let sum=0,weight=0,amplitude=0.62,frequency=1,norm=0;
  for(let i=0;i<octaves;i++){
    const n=islandNoise(x*frequency+seed*0.013,z*frequency-seed*0.021,seed+i*137);
    const ridge=1-Math.abs(n*2-1);
    sum+=ridge*ridge*amplitude*weight;
    norm+=amplitude*weight;
    weight=0.55+0.45*ridge;
    amplitude*=0.52; frequency*=2.07;
  }
  return clamp(sum/Math.max(norm,1e-4),0,1);
}

/* The profile is steep at exposed headlands and rolls gently into two coves. */
function islandProfile(I,x,z){
  const dx=x-I.x,dz=z-I.z, lx=I.cs*dx+I.sn*dz, lz=-I.sn*dx+I.cs*dz;
  const u=lx/I.rx,v=lz/I.rz,a=Math.atan2(v,u);
  const edge=1+I.coast*(0.13*Math.sin(3*a+I.phase)+0.075*Math.sin(5*a-I.phase*1.7)+0.035*Math.sin(9*a+I.phase*2.2));
  const broad=islandNoise(x*0.105+I.phase*5,z*0.105,I.seed);
  const fine=islandNoise(x*0.39,z*0.39+I.phase*3,I.seed+91);
  const r=Math.hypot(u,v)/edge+(broad-0.5)*0.10;
  const beach=Math.pow(Math.max(0,Math.cos(a-I.beach)),8)*0.95+
              Math.pow(Math.max(0,Math.cos(a-I.beach-2.5)),14)*0.65;
  const b=clamp(beach*I.beachWidth,0,1);
  /* A wider shelf keeps more of the sea shallow, which is what turns a coast
     into the turquoise reef-flat and surf zone of a cinematic shot. */
  const shelfOuter=1.36+0.20*(I.shelf-1);
  /* Fade the outer shelf deep into the sea, rather than ending at a visible
     flat underwater edge. */
  const shelf=-22+22.75*sstep(shelfOuter,0.985,r);
  /* Vertical drama narrows and steepens the coastal escarpment. Beaches push
     it inland; gullies and headlands break the silhouette into natural ridges. */
  const cliff=sstep(1.01-0.10*b-0.035*I.drama,Math.max(0.42,0.76-0.19*b-0.09*I.drama),r);
  const inland=sstep(1.0,0.62,r);
  const d1=Math.hypot((u-I.peakX)*0.9,(v-I.peakZ)*1.1);
  const d2=Math.hypot(u+0.30+I.peakX*0.3,v-0.25+I.peakZ*0.3);
  const ridge1=Math.exp(-I.peakFalloff*d1*d1), ridge2=Math.exp(-4.5*d2*d2);
  const headland=0.82+0.22*Math.sin(a*2.0+I.phase)+0.10*Math.sin(a*5.0-I.phase*0.7);
  const rock=I.cliff*(0.72+0.50*broad)*headland*(1-0.34*b)*cliff;
  let hills=I.peak*(ridge1+0.5*ridge2)*inland+inland*(broad-0.38)*3.2+(fine-0.5)*1.5*cliff;
  const inner=sstep(0.99,0.70,r), amount=I.features*inner;
  /* Fine erosion detail everywhere: spurs, little benches and gullies cut
     into the broad slope. It is built from noise the profile already samples
     plus one extra octave, so the extra cost stays small while the coastline
     stops looking like a smooth extrusion. */
  if(amount>0.001){
    const micro=islandNoise(x*1.63-7,z*1.63+11,I.seed+517);
    const ridgedDetail=(1-Math.abs(broad*2-1))*0.52+(1-Math.abs(fine*2-1))*0.29+
                       (1-Math.abs(micro*2-1))*0.19;
    /* Drama sharpens the crests instead of merely scaling them: the folded
       noise is raised to a higher power, which deepens the gullies between
       neighbouring ridges and leaves the summits as thin blades. */
    const sharpened=I.drama>0.001?Math.pow(ridgedDetail,1+0.85*I.drama):ridgedDetail;
    hills+=(sharpened-0.55)*2.35*amount*cliff*(1+0.32*I.drama);
  }
  /* Biome landforms live inside the existing coastal envelope, so channels,
     surf and the shoreline map still use exactly the rendered heightfield. */
  let formation=0;
  if(I.biome==='tropical'){
    formation=I.peak*0.30*Math.sin(u*5.0+I.phase)*Math.sin(v*4.0-I.phase*0.6)*inland;
  }else if(I.biome==='volcanic'){
    const crater=Math.hypot(u-I.peakX*0.45,v-I.peakZ*0.45);
    const rim=Math.exp(-Math.pow((crater-0.25)/0.16,2));
    const bowl=Math.exp(-Math.pow(crater/0.17,2));
    const cone=I.peak*(1.22*sstep(0.95,0.10,crater)-0.58*bowl)*inland;
    hills=lerp(hills,cone+(broad-0.5)*1.3*inland,clamp(I.features,0,1));
    formation=I.peak*0.22*rim;
  }else if(I.biome==='alpine'){
    const serration=Math.pow(Math.abs(Math.sin(u*7.0+v*3.0+I.phase)),1.5);
    formation=I.peak*(0.35+0.65*serration)*Math.exp(-2.4*(u*u+v*v));
  }else if(I.biome==='desert'){
    const mesa=sstep(0.75,0.49,r)*(0.48+0.52*sstep(0.46,0.34,r));
    formation=I.peak*0.78*mesa+0.35*Math.sin((shelf+rock)*2.3+I.phase)*cliff;
  }else if(I.biome==='atoll'){
    /* A continuous ring of motu forms after assembly, where it can also dig
       the lagoon below sea level. Nothing is added here. */
    formation=0;
  }else if(I.biome==='fjord'){
    /* The drowned channel enters from the western shore and dead-ends before
       the summit, so water reaches deep inland without severing the island.
       It is carved below sea level after assembly. */
    formation=0;
  }else if(I.biome==='moss'){
    /* Mossland is the most detailed landform: a domain-warped ridge field
       raises fluted karst towers and buttresses, broad shelves are terraced
       into moss-lined steps, and two seeded sinkholes cut hollows with raised
       rims. Everything is still a single-valued heightfield, so ball
       collision, the shoreline map and the surf line keep using the exact
       surface that is drawn. */
    /* The warp reuses the two low-frequency samples every profile already
       takes, so the most intricate coast in the game still costs only a
       couple of extra noise octaves per vertex. */
    if(inner<=0.001){
      /* Deep water and the outer shelf: the terracing and towers contribute
         nothing once the inland mask is zero, so skip the whole field. */
      formation=0;
    }else{
    const warpX=(broad-0.5)*10.0, warpZ=(fine-0.5)*10.0;
    const field=islandRidged((x+warpX)*0.30,(z+warpZ)*0.30,I.seed+617,2);
    /* Flutes and fins come from the samples the profile already takes, so the
       extra detail costs one ridged field rather than four noise fields. */
    const flute=1-Math.abs(fine*2-1);
    const fin=Math.sin(x*1.7+z*2.3+I.phase)*0.55+Math.sin(x*0.9-z*3.1+I.phase*1.7)*0.45;
    const towers=I.peak*1.20*Math.pow(Math.max(0,field-0.42)/0.58,1.45);
    const fluting=(flute-0.62)*2.3*(0.55+0.19*Math.min(4.0,I.cliff))+fin*0.95+(broad-0.5)*1.6;
    const sx=Math.cos(I.phase*2.3)*0.33, sz=Math.sin(I.phase*1.7)*0.29;
    const hole=Math.exp(-Math.pow(Math.hypot(u-sx,v-sz)/0.155,2.0));
    const rim=Math.exp(-Math.pow((Math.hypot(u-sx,v-sz)-0.215)/0.055,2.0));
    formation=towers+fluting+I.peak*(0.25*rim-0.55*hole*inner);
    }
  }else{
    formation=I.peak*0.18*Math.sin(u*5.5+v*3.0+I.phase)*inland;
  }
  /* Water-cut radial gullies, broken ledges and uneven ridges interrupt the
     escarpment without changing its conservative outer bound. */
  const gully=Math.pow(Math.max(0,Math.cos(a*6.0+I.phase*1.7+(broad-0.5)*1.4)),18);
  const erosion=gully*cliff*(1-inland*0.65)*(0.5+1.1*sstep(0.45,0.9,r));
  const ledge=Math.sin((shelf+rock)*2.4+fine*5.0)*0.16*cliff*(1-inland*0.65);
  let height=shelf+rock+hills+ledge-erosion+formation*amount;
  /* Vertical drama also lifts everything above the beach, which is what turns
     a hilly silhouette into a horizon of towers and knife-edge crests. */
  if(I.drama>0.001&&height>1.2) height=1.2+(height-1.2)*(1+0.22*I.drama);
  if(I.biome==='atoll'){
    /* Ring of low coral motu around a real lagoon. The ring is smooth enough
       to stay unbroken under any noise the seed produces, so the atoll is one
       connected shore, while the centre lies several metres below the sea. */
    const wobble=0.055*Math.sin(a*3.0+I.phase)+0.028*Math.sin(a*5.0-I.phase*1.6)+
                 (broad-0.5)*0.10;
    const ring=Math.exp(-Math.pow((r+wobble-0.70)/0.19,2.0));
    const motu=(2.7+4.4*broad+1.4*fine)*ring-4.6*(1-ring);
    const blend=sstep(1.10,0.74,r)*clamp(0.55+0.45*I.features,0,1);
    height=lerp(height,motu,blend);
  }else if(I.biome==='fjord'){
    /* Cut the drowned channel and raise the shoulders and walls either side.
       The carve only reaches inland from the western coast, so the massif
       around it remains one continuous collidable island. */
    const channel=Math.exp(-Math.pow((v+0.10-0.09*Math.sin(u*3.1+I.phase*2.0))/0.135,2.0));
    /* The channel dead-ends at about a third of the way in, well before the
       summit, so the massif above it is never cut through. */
    const reach=sstep(-0.22,-0.48,u)*sstep(1.06,0.55,r);
    const wall=Math.exp(-Math.pow((Math.abs(v+0.10)-0.25-0.05*Math.sin(u*3.4))/0.13,2.0))*reach;
    height+=wall*I.peak*0.38+I.peak*0.16*reach*(1-channel);
    height=lerp(height,-3.4-1.1*broad,clamp(channel*reach*0.94,0,0.94));
  }
  /* Terracing is a generation setting for every biome, and the mossland
     landform keeps its own stronger default. Step the settled surface, not
     one component: shelves, shoulders and towers become stacked benches with
     steep risers while beach and summit stay smooth, so the surf line and the
     ball grid still agree with what is drawn. */
  const terrace=I.biome==='moss'?Math.max(0.82,I.terraces):I.terraces;
  if(I.biome==='moss'||I.terraces>0.001){
    const st=1.55, q=height/st, qi=Math.floor(q), qf=q-qi;
    const stepped=(qi+Math.pow(sstep(0.22,0.78,qf),1.6))*st;
    const blend=Math.min(1,terrace*sstep(0.5,2.2,height)*(1-0.40*sstep(19,25,height)));
    height=lerp(height,stepped,blend);
  }
  if(I.biome==='desert'){
    /* Wind-cut mesas have a broad, weathered cap rather than a pointed hill. */
    const cap=I.cliff+I.peak*0.73+0.8+(broad-0.5)*0.45;
    height=lerp(height,Math.min(height,cap),clamp(I.features,0,1));
  }
  /* Compress only extreme peaks smoothly into the shoreline map's 28 m
     range. This avoids clipped height data at maximum relief without a flat
     artificial ceiling or a discontinuous collision surface. */
  if(height>20) height=20+8*(1-Math.exp(-(height-20)/8));
  return height;
}

function makeIslandMesh(I){
  const n=I.n, side=n+1, count=side*side;
  const span=2*I.extent, step=span/n;
  const h=new Float32Array(count), verts=new Float32Array(count*6);
  for(let j=0;j<=n;j++) for(let i=0;i<=n;i++){
    const x=I.x-I.extent+i*step,z=I.z-I.extent+j*step,k=j*side+i;
    h[k]=islandProfile(I,x,z);
    verts[k*6]=x; verts[k*6+1]=h[k]; verts[k*6+2]=z;
  }
  for(let j=0;j<=n;j++) for(let i=0;i<=n;i++){
    const k=j*side+i, il=Math.max(i-1,0),ir=Math.min(i+1,n),jd=Math.max(j-1,0),ju=Math.min(j+1,n);
    const sx=(h[j*side+ir]-h[j*side+il])/((ir-il)*step||1);
    const sz=(h[ju*side+i]-h[jd*side+i])/((ju-jd)*step||1);
    const l=Math.hypot(sx,1,sz);
    verts[k*6+3]=-sx/l; verts[k*6+4]=1/l; verts[k*6+5]=-sz/l;
  }
  const inds=[];
  for(let j=0;j<n;j++) for(let i=0;i<n;i++){
    const a=j*side+i,b=a+1,c=a+side,d=c+1;
    /* no need to draw the flat, deep corners of the bounding square */
    if(Math.max(h[a],h[b],h[c],h[d])<-21.98) continue;
    inds.push(a,c,b,b,c,d);
  }
  I.h=h; I.step=step; I.side=side;
  I.vao=gl.createVertexArray(); I.vb=gl.createBuffer(); I.ib=gl.createBuffer(); I.indexCount=inds.length;
  gl.bindVertexArray(I.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,I.vb); gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,I.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(inds),gl.STATIC_DRAW);
  gl.bindVertexArray(null);
}

/* Bilinear height and gradient from the actual mesh samples. Returns -1000
   outside the islands so it never affects the original open-ocean scene. */
function islandGround(x,z,out){
  if(!islands.active){ if(out){out.nx=0;out.ny=1;out.nz=0;} return -1000; }
  let best=-1000, bx=0, bz=0;
  for(const I of islands.land){
    const gx=(x-(I.x-I.extent))/I.step, gz=(z-(I.z-I.extent))/I.step;
    if(gx<0||gz<0||gx>=I.n||gz>=I.n) continue;
    const i=Math.floor(gx),j=Math.floor(gz),fx=gx-i,fz=gz-j,k=j*I.side+i;
    const h00=I.h[k],h10=I.h[k+1],h01=I.h[k+I.side],h11=I.h[k+I.side+1];
    const y=lerp(lerp(h00,h10,fx),lerp(h01,h11,fx),fz);
    if(y>best){
      best=y;
      if(out){ bx=lerp(h10-h00,h11-h01,fz)/I.step; bz=lerp(h01-h00,h11-h10,fx)/I.step; }
    }
  }
  if(out){ const l=Math.hypot(bx,1,bz); out.nx=-bx/l;out.ny=1/l;out.nz=-bz/l; }
  return best;
}

/* RGBA8 shoreline field, sampled by the water shader:
     R  terrain height (-12..28 m), so shoals and lagoons know their depth
     G  distance to dry land (0..12 m), which drives the surf line
     B,A  seaward shoreline normal (encoded 0..1), so breakers can face the
          real coast instead of an invented circle around each island.
   The distance transform lets the ocean draw a thin, animated surf line even
   where a near-vertical cliff gives almost no shallow-water pixels. */
const texIslandMap=gl.createTexture();
gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,texIslandMap);
gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,255,128,128]));
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
function makeIslandMap(){
  const n=ISLAND_MAP_SIZE, step=2*ISLAND_MAP_HALF/n, data=new Uint8Array(n*n*4), dist=new Float32Array(n*n);
  for(let j=0;j<n;j++) for(let i=0;i<n;i++){
    const x=(i+0.5)*step-ISLAND_MAP_HALF,z=(j+0.5)*step-ISLAND_MAP_HALF,k=j*n+i;
    const h=islandGround(x,z);
    data[k*4]=Math.round(clamp((h+ISLAND_MAP_DEPTH)/40,0,1)*255);
    dist[k]=h>=0?0:1e5;
  }
  const diag=Math.SQRT2;
  for(let y=0;y<n;y++) for(let x=0;x<n;x++){
    const k=y*n+x; let d=dist[k];
    if(x>0) d=Math.min(d,dist[k-1]+1);
    if(y>0){ d=Math.min(d,dist[k-n]+1); if(x>0)d=Math.min(d,dist[k-n-1]+diag); if(x<n-1)d=Math.min(d,dist[k-n+1]+diag); }
    dist[k]=d;
  }
  for(let y=n-1;y>=0;y--) for(let x=n-1;x>=0;x--){
    const k=y*n+x; let d=dist[k];
    if(x<n-1) d=Math.min(d,dist[k+1]+1);
    if(y<n-1){ d=Math.min(d,dist[k+n]+1); if(x>0)d=Math.min(d,dist[k+n-1]+diag); if(x<n-1)d=Math.min(d,dist[k+n+1]+diag); }
    dist[k]=d; data[k*4+1]=Math.round(clamp(d*step/12,0,1)*255);
  }
  /* The distance field grows offshore, so its gradient already points to
     sea. Store that seaward direction: the water shader compares it with the
     wind to decide which shores are windward. Sampling two cells out smooths
     the chamfer metric into a stable normal on headlands and in coves. */
  for(let y=0;y<n;y++) for(let x=0;x<n;x++){
    const k=y*n+x, x0=Math.max(0,x-2),x1=Math.min(n-1,x+2),y0=Math.max(0,y-2),y1=Math.min(n-1,y+2);
    let nx=dist[y*n+x1]-dist[y*n+x0], nz=dist[y1*n+x]-dist[y0*n+x];
    let l=Math.hypot(nx,nz);
    if(l<1e-4){ nx=0; nz=1; l=1; }
    data[k*4+2]=Math.round(clamp(nx/l*0.5+0.5,0,1)*255);
    data[k*4+3]=Math.round(clamp(nz/l*0.5+0.5,0,1)*255);
  }
  gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,texIslandMap);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,n,n,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
}

/* Textures start with sensible fallback colours and load on first use. Keeping
   unused island textures out of the initial GPU allocation helps small devices.
   All albedos are local, seamless, and mipmapped; no external service needed. */
function islandTexture(rgb,file,repeat){
  const tex=gl.createTexture(); gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgb));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
  const image=new Image();
  image.onload=()=>{
    if(gl.isContextLost()) return;
    let source=image;
    /* Low-memory mode caps every upload at 512 px; a touch device that is not
       in safe mode still gets a smaller texture than a desktop. */
    let cap=0;
    if(typeof window!=='undefined'&&window.AquaBoot&&window.AquaBoot.safeMode) cap=512;
    else{ try{ if(matchMedia('(pointer: coarse)').matches||matchMedia('(any-pointer: coarse)').matches) cap=640; }catch(e){} }
    if(cap&&Math.max(image.width,image.height)>cap){
      const ratio=cap/Math.max(image.width,image.height), smaller=document.createElement('canvas');
      smaller.width=Math.max(1,Math.round(image.width*ratio)); smaller.height=Math.max(1,Math.round(image.height*ratio));
      const ctx=smaller.getContext('2d');
      if(ctx){ ctx.drawImage(image,0,0,smaller.width,smaller.height); source=smaller; }
    }
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    try{ gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source); }
    finally{ gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); }
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    const aniso=gl.getExtension('EXT_texture_filter_anisotropic');
    if(aniso) gl.texParameterf(gl.TEXTURE_2D,aniso.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  };
  image.src='assets/'+file;
  return tex;
}
/* ---- plant cutouts -------------------------------------------------------
   The new species are photographic billboards packed into one texture array,
   so the whole understorey is a single instanced draw. Layers are fixed by
   PLANT_KINDS order; an image that has not arrived yet is simply a transparent
   layer, which the shader discards, so nothing pops or disappears. */
const plantAtlas={tex:null,size:0,layers:0,loaded:0};
function plantAtlasSize(){
  try{
    if(typeof window!=='undefined'&&window.AquaBoot&&window.AquaBoot.safeMode) return 256;
    if(matchMedia('(pointer: coarse)').matches||matchMedia('(any-pointer: coarse)').matches) return 320;
  }catch(e){}
  return 512;
}
function makePlantAtlas(){
  if(plantAtlas.tex) return plantAtlas;
  const kinds=typeof PLANT_KINDS!=='undefined'?PLANT_KINDS:[], size=plantAtlasSize(), layers=Math.max(1,kinds.length);
  const tex=gl.createTexture();
  gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D_ARRAY,tex);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,size,size,layers,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  plantAtlas.tex=tex; plantAtlas.size=size; plantAtlas.layers=layers; plantAtlas.loaded=0;
  kinds.forEach((kind,layer)=>{
    const image=new Image();
    image.onload=()=>{
      if(gl.isContextLost()) return;
      /* Array layers upload through texSubImage3D: texSubImage2D only has the
         2D overload and rejects a layer index plus DOM source. Keeping the
         image itself whenever it already fills the layer also avoids a
         premultiplied-alpha round trip through a canvas. */
      const square=()=>{
        const canvas=document.createElement('canvas');
        canvas.width=size; canvas.height=size;
        const ctx=canvas.getContext('2d');
        if(!ctx) return null;
        ctx.clearRect(0,0,size,size);
        /* Stretch to the square layer; the billboard restores the species'
           true proportions from the aspect table. The shader flips V, so no
           driver-dependent UNPACK_FLIP_Y_WEBGL is involved. */
        ctx.drawImage(image,0,0,size,size);
        return canvas;
      };
      let source=image;
      if(image.width!==size||image.height!==size){
        source=square(); if(!source) return;
      }
      gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D_ARRAY,tex);
      try{
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,layer,size,size,1,gl.RGBA,gl.UNSIGNED_BYTE,source);
      }catch(err){
        /* A driver that refuses DOM sources for array layers still accepts a
           pixel buffer, so retry from canvas pixels instead of losing the
           layer to a console error. */
        if(source===image){ source=square(); if(!source) return; }
        const ctx=source.getContext('2d');
        if(!ctx) return;
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,layer,size,size,1,gl.RGBA,gl.UNSIGNED_BYTE,
          ctx.getImageData(0,0,size,size).data);
      }
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      plantAtlas.loaded++;
    };
    image.onerror=()=>{ /* a transparent layer is a safe, invisible fallback */ };
    image.src='assets/'+kind.file;
  });
  return plantAtlas;
}

let islandTextures=null;
function loadIslandTextures(biome){
  if(!islandTextures){
    islandTextures={
      rock:islandTexture([90,85,78,255],'rock.jpg',true),
      grass:islandTexture([74,100,50,255],'grass.jpg',true),
      sand:islandTexture([190,172,130,255],'sand.jpg',true),
      talus:islandTexture([105,94,77,255],'talus.jpg',true),
      pine:islandTexture([0,0,0,0],'pine.png',false)
    };
  }
  /* Biome materials are fetched only when needed and use the same
     low-memory upload limit as the original island textures. */
  if(biome==='tropical'||biome==='mixed'){
    if(!islandTextures.palm) islandTextures.palm=islandTexture([0,0,0,0],'palm.png',false);
    if(!islandTextures.palm2) islandTextures.palm2=islandTexture([0,0,0,0],'palm2.png',false);
  }
  if((biome==='volcanic'||biome==='mixed')&&!islandTextures.basalt)
    islandTextures.basalt=islandTexture([48,48,46,255],'basalt.jpg',true);
  if((biome==='desert'||biome==='mixed')&&!islandTextures.sandstone)
    islandTextures.sandstone=islandTexture([165,116,72,255],'sandstone.jpg',true);
  /* Generated plant surfaces, loaded on the same lazy path: cactus skin where
     cacti are planted, ferns and reeds for the wetter ecologies, and the moss
     carpet only where moss actually grows. */
  if((biome==='desert'||biome==='mixed')&&!islandTextures.cactus)
    islandTextures.cactus=islandTexture([74,104,70,255],'plants/cactus-skin.jpg',true);
  if(biome!=='desert'&&biome!=='volcanic'){
    if(!islandTextures.fern) islandTextures.fern=islandTexture([38,76,32,255],'plants/fern-fronds.jpg',true);
    if(!islandTextures.reed) islandTextures.reed=islandTexture([82,98,52,255],'plants/reed-blades.jpg',true);
  }
  if((biome==='moss'||biome==='mixed')&&!islandTextures.moss)
    islandTextures.moss=islandTexture([44,72,34,255],'plants/moss-carpet.jpg',true);
  /* Every biome now has billboard species from the generated cutout set. */
  islandTextures.plants=makePlantAtlas();
}

const ISLAND_VS=HDR+`
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal;
uniform mat4 uVP; uniform float uMirror;
out vec3 vWorld; out vec3 vN;
void main(){
  vWorld=aPos; vN=aNormal;
  vec3 p=aPos; if(uMirror>0.5) p.y=-p.y;
  gl_Position=uVP*vec4(p,1.0);
}`;
const ISLAND_FS=HDR+COMMON+`
in vec3 vWorld; in vec3 vN; out vec4 o;
uniform sampler2D uRock,uGrass,uSand,uTalus;
uniform sampler2D uBasalt,uSandstone,uMoss;
uniform vec3 uCamEff; uniform float uMode,uMirror,uSea,uSnowCover,uBiome,uMist;
uniform vec4 uIsland; uniform vec4 uIslandForm;
vec3 triRock(vec3 p,vec3 n){
  vec3 w=pow(abs(n),vec3(4.0)); w/=max(w.x+w.y+w.z,0.001);
  return texture(uRock,p.zy).rgb*w.x+texture(uRock,p.xz).rgb*w.y+texture(uRock,p.xy).rgb*w.z;
}
void main(){
  if(uMirror>0.5&&vWorld.y<0.0) discard;
  vec3 N=normalize(vN), V=normalize(uCamEff-vWorld);
  float n=texture(uDetail,vWorld.xz*0.055+0.73).a;
  float n2=texture(uDetail,vWorld.xz*0.19-1.3).a;
  vec3 rock=triRock(vWorld*0.16+vec3(n*0.08,n2*0.04,n*0.08),N);
  vec2 faceUV=abs(N.x)>abs(N.z)?vWorld.zy*0.22:vWorld.xy*0.22;
  rock=mix(rock,texture(uTalus,faceUV).rgb,0.16+0.10*n);
  vec3 grass=texture(uGrass,vWorld.xz*0.30).rgb;
  vec3 sand=texture(uSand,vWorld.xz*0.42).rgb;
  vec3 grit=texture(uTalus,vWorld.xz*0.34).rgb;
  /* Colour textures are sRGB. A gentle lift keeps the very dark sea rock
     readable under an overcast sky, while retaining the photographic grain. */
  rock=pow(rock,vec3(1.65))*1.35*(0.84+0.32*n);
  grass=pow(grass,vec3(1.55))*1.22;
  sand=pow(sand,vec3(1.8))*1.12;
  grit=pow(grit,vec3(1.7))*1.2;
  float level=smoothstep(0.18,0.62,N.y);
  float vegetated=level*smoothstep(1.2,3.6,vWorld.y)*smoothstep(0.25,0.65,n*0.65+n2*0.35+0.18);
  float bare=level*smoothstep(3.0,6.0,vWorld.y)*(1.0-vegetated);
  vec3 albedo=mix(rock,grit,bare*0.55);
  albedo=mix(albedo,grass,vegetated*0.94);
  /* Sand belongs in the seeded coves, not as a bright ring around every
     vertical headland. The same angular mask also shapes the heightfield. */
  vec2 d=vWorld.xz-uIsland.xy;
  vec2 local=vec2(uIsland.z*d.x+uIsland.w*d.y,-uIsland.w*d.x+uIsland.z*d.y)/uIslandForm.xy;
  float angle=atan(local.y+0.00001,local.x+0.00001), beachAngle=uIslandForm.z;
  float cove=clamp(pow(max(0.0,cos(angle-beachAngle)),8.0)*0.95+
                   pow(max(0.0,cos(angle-beachAngle-2.5)),14.0)*0.65,0.0,1.0)*uIslandForm.w;
  cove=clamp(cove,0.0,1.0);
  float beach=level*(0.10+0.90*cove)*(1.0-smoothstep(0.40,2.5,vWorld.y))*(0.7+0.3*n);
  albedo=mix(albedo,sand,beach*0.88);
  /* Each ecology has a distinct ground palette and material. The same masks
     still follow the real slope and cove geometry, rather than painted rings. */
  if(uBiome>0.5&&uBiome<1.5){
    vec3 tropicalGrass=grass*vec3(0.73,1.30,0.72);
    albedo=mix(albedo,tropicalGrass,vegetated*0.65);
    albedo=mix(albedo,sand*vec3(1.10,1.06,0.91),beach*0.32);
  }else if(uBiome>1.5&&uBiome<2.5){
    vec3 w=pow(abs(N),vec3(4.0)); w/=max(w.x+w.y+w.z,0.001);
    vec3 p=vWorld*0.21;
    vec3 basalt=texture(uBasalt,p.zy).rgb*w.x+texture(uBasalt,p.xz).rgb*w.y+texture(uBasalt,p.xy).rgb*w.z;
    basalt=pow(basalt,vec3(1.55))*(0.72+0.35*n)+vec3(0.012,0.012,0.011);
    vec3 ash=basalt*vec3(1.35,1.12,0.96)+grit*vec3(0.08,0.055,0.035);
    albedo=mix(basalt,ash,level*(0.3+0.4*n2));
    albedo=mix(albedo,basalt*0.75,beach*0.7);
  }else if(uBiome>2.5&&uBiome<3.5){
    albedo=mix(rock*vec3(0.88,0.96,1.04),grass*vec3(0.70,0.89,0.76),vegetated*0.55);
    albedo=mix(albedo,sand*0.75,beach*0.65);
  }else if(uBiome>3.5&&uBiome<4.5){
    vec3 w=pow(abs(N),vec3(4.0)); w/=max(w.x+w.y+w.z,0.001);
    vec3 p=vWorld*0.20;
    vec3 stone=texture(uSandstone,p.zy).rgb*w.x+texture(uSandstone,p.xz).rgb*w.y+texture(uSandstone,p.xy).rgb*w.z;
    stone=pow(stone,vec3(1.65))*vec3(0.95,0.77,0.60)*(0.95+0.22*n);
    float strata=0.88+0.12*sin(vWorld.y*3.0+n*2.5);
    albedo=mix(stone*strata,sand*vec3(0.98,0.74,0.52),level*0.30+beach*0.32);
  }else if(uBiome>5.5&&uBiome<6.5){
    /* Atoll: coral sand and rubble, a pale lagoon floor and low green motu
       vegetation. The lagoon reads pale turquoise because the water shader
       sees the same shallow heightfield. */
    vec3 coral=pow(texture(uSand,vWorld.xz*0.55).rgb,vec3(1.55))*vec3(1.14,1.07,0.92);
    vec3 rubble=pow(texture(uTalus,vWorld.xz*0.70).rgb,vec3(1.60))*vec3(0.94,1.02,0.97);
    float lagoon=1.0-smoothstep(-1.6,1.4,vWorld.y);
    albedo=mix(coral,rubble,level*0.26);
    albedo=mix(albedo,albedo*vec3(0.74,0.99,0.96)*(0.86+0.20*n),lagoon*0.55);
    albedo=mix(albedo,grass*vec3(0.86,1.12,0.72),vegetated*0.58);
    albedo=mix(albedo,sand*1.06,beach*0.72);
  }else if(uBiome>6.5&&uBiome<7.5){
    /* Fjord: wet black rock, moss ledges and snow-bright shoulders. */
    vec3 wetRock=pow(rock,vec3(1.35))*vec3(0.66,0.72,0.76)*(0.86+0.26*n);
    vec3 ledgeMoss=pow(texture(uMoss,vWorld.xz*0.42).rgb,vec3(1.30))*vec3(0.76,1.06,0.74)*(0.90+0.20*n2);
    float shelfMask=smoothstep(0.40,0.84,N.y)*smoothstep(1.0,3.0,vWorld.y);
    albedo=mix(wetRock,ledgeMoss,shelfMask*(0.34+0.30*n));
    albedo=mix(albedo,grass*vec3(0.72,0.94,0.72),vegetated*0.30);
    albedo=mix(albedo,sand*0.62,beach*0.42);
    float fjordSnow=smoothstep(7.0,13.0,vWorld.y)*level*(0.72+0.28*n);
    albedo=mix(albedo,vec3(0.72,0.77,0.80),fjordSnow*0.85);
  }else{
    /* Mossland: generated moss carpet on the shelves, wet dark rock on the
       risers, pale lichen crusts and damp seeps in the hollows. */
    vec3 carpet=texture(uMoss,vWorld.xz*0.28).rgb;
    vec3 mossy=pow(carpet,vec3(1.32))*vec3(0.88,1.24,0.82)*(0.90+0.24*n);
    vec3 damp=pow(texture(uGrass,vWorld.xz*0.92).rgb,vec3(1.7))*vec3(0.52,0.86,0.62);
    float ledge=smoothstep(0.42,0.86,N.y);
    vec3 m=mix(rock*vec3(0.66,0.82,0.68),mossy*1.22,ledge*(0.56+0.42*n));
    m=mix(m,damp,ledge*0.34*smoothstep(0.34,0.78,n2));
    m=mix(m,vec3(0.66,0.65,0.48)*(0.78+0.42*n),smoothstep(0.58,0.86,n)*0.16);
    albedo=mix(m,sand*0.70,beach*0.46);
    albedo*=mix(1.0,0.84,ledge*smoothstep(0.15,0.55,n));
  }
  float snow=uSnowCover*level*smoothstep(4.0,12.0,vWorld.y)*(0.7+0.3*n);
  if(uBiome>2.5&&uBiome<3.5) snow=max(snow,level*smoothstep(6.5,12.5,vWorld.y)*(0.70+0.30*n));
  albedo=mix(albedo,vec3(0.68,0.73,0.75),snow*0.85);
  /* Running waterline: a bright, broken lace of foam where the sea actually
     reaches the shore, and a darker wet glaze just above it. This is what
     makes the water look like it is racing up the sand rather than stopping
     at a painted line. */
  float reach=0.04+0.30*uSea+0.10*sin(uTime*0.9+vWorld.x*0.31+vWorld.z*0.23);
  float runUp=uSea*0.55+reach*0.30;
  float shoreBand=1.0-smoothstep(0.05,0.26+0.24*uSea,abs(vWorld.y-runUp));
  float laceA=texture(uDetail,vWorld.xz*1.35+vec2(uTime*0.07,-uTime*0.05)).a;
  float laceB=texture(uDetail,vWorld.xz*2.9-vec2(uTime*0.10,uTime*0.045)).a;
  float foamLine=shoreBand*smoothstep(0.40,0.70,laceA*0.62+laceB*0.38);
  /* Waterline and rain leave the lower cliff dark and glossy. */
  float wet=1.0-smoothstep(0.15+uSea*0.4,1.9+uSea*1.4,vWorld.y);
  wet=max(wet,uRain*0.18);
  albedo*=mix(1.0,0.53,wet);
  /* Foam goes on after the wet glaze: otherwise the dark, soaked sand would
     swallow the very lace that marks where the swash has just withdrawn. */
  albedo=mix(albedo,vec3(0.84,0.89,0.88),foamLine*0.72);
  float nl=max(dot(N,uLight),0.0);
  vec3 hemi=mix(uHorizon*0.37+vec3(0.025,0.035,0.04),uZenith*0.45+vec3(0.10),N.y*0.5+0.5);
  vec3 col=albedo*(hemi+vec3(0.22*uAmbLum)+uSunCol*nl*0.48);
  vec3 H=normalize(uLight+V);
  float spec=pow(max(dot(N,H),0.0),mix(22.0,110.0,wet))*(0.015+0.17*wet)*nl;
  col+=uSunCol*spec;
  float dist=length(uCamEff-vWorld);
  col=mix(col,uFogCol,1.0-exp(-dist*uFogD));
  /* Coastal mist: a low, distance-weighted veil that pools over the shore.
     It is strongest near sea level, which is what gives long shots their
     layered, cinematic depth without hiding the terrain. */
  float mist=uMist*(1.0-exp(-dist*0.006))*exp(-max(vWorld.y-0.15,0.0)*0.115);
  col=mix(col,uFogCol*1.03,clamp(mist,0.0,0.72));
  if(uMode>0.5) o=vec4(enc(col),1.0); else o=vec4(tonemap(col),1.0);
}`;

/* The photographic pine remains a depth-writing cutout. Subdividing the
   cards vertically lets the trunk stay planted while the crown leans, bends
   and flutters in passing, spatially coherent gusts. */
const TREE_VS=HDR+`
layout(location=0) in vec4 aTree; layout(location=1) in vec4 aInfo;
uniform mat4 uVP; uniform vec3 uCamEff; uniform float uMirror,uTime,uWindStrength;
uniform vec2 uWindDir;
out vec2 vUV; out vec3 vWorld; out float vTint;
void main(){
  vec2 c=vec2(float(gl_VertexID&1),float(gl_VertexID>>1)/8.0);
  vec2 view=uCamEff.xz-aTree.xz; float d=max(length(view),0.001); view/=d;
  vec3 right=vec3(view.y,0.0,-view.x);
  vec2 side=vec2(-uWindDir.y,uWindDir.x);
  float gust=0.72+0.22*sin(uTime*0.82-dot(aTree.xz,uWindDir)*0.16)+
             0.10*sin(uTime*2.1+aInfo.w*12.0+dot(aTree.xz,side)*0.19);
  float flutter=sin(uTime*(2.2+aInfo.z)+aInfo.w*19.0+c.y*5.0);
  vec2 bend=(uWindDir*(0.035+0.13*gust)+side*flutter*0.018)*
            clamp(uWindStrength,0.0,1.5)*c.y*c.y*aTree.w;
  vec3 p=aTree.xyz+right*((c.x-0.5)*aTree.w*(0.43+0.14*aInfo.z))+
         vec3(bend.x,c.y*aTree.w,bend.y);
  vWorld=p; vUV=vec2(aInfo.x>0.5?1.0-c.x:c.x,mix(0.08,0.92,c.y)); vTint=aInfo.y;
  if(uMirror>0.5) p.y=-p.y;
  gl_Position=uVP*vec4(p,1.0);
}`;
const TREE_FS=HDR+COMMON+`
in vec2 vUV; in vec3 vWorld; in float vTint; out vec4 o;
uniform sampler2D uPine; uniform vec3 uCamEff; uniform float uMode,uMirror,uSnowCover;
void main(){
  if(uMirror>0.5&&vWorld.y<0.0) discard;
  vec4 tex=texture(uPine,vUV);
  /* PNGs are uploaded with straight alpha: dividing RGB by alpha creates
     pale halos and bleaches the needles at their mipmapped edges. */
  if(tex.a<0.20) discard;
  vec3 alb=pow(tex.rgb,vec3(1.9))*(0.78+0.38*vTint);
  alb*=mix(0.68,1.12,smoothstep(0.08,0.76,vUV.y));
  alb*=1.0-0.16*uRain;
  float snow=uSnowCover*smoothstep(0.44,0.78,vUV.y)*smoothstep(0.28,0.65,tex.rgb.g)*0.32;
  alb=mix(alb,vec3(0.58,0.65,0.67),snow);
  vec3 col=alb*(vec3(0.28+0.50*uAmbLum)+uHorizon*0.22+uSunCol*0.17);
  col=mix(col,uFogCol,1.0-exp(-length(uCamEff-vWorld)*uFogD));
  if(uMode>0.5) o=vec4(enc(col),1.0); else o=vec4(tonemap(col),1.0);
}`;
const pIsland=program(ISLAND_VS,ISLAND_FS,'island'), pTree=program(TREE_VS,TREE_FS,'tree');

function makeIslandTrees(random,options){
  const data=[], normal={nx:0,ny:1,nz:0};
  for(const I of islands.land){
    const target=Math.round(I.rx*I.rz*0.64*options.trees*ISLAND_BIOMES[I.biome].pines), planted=[];
    let added=0;
    for(let tries=0;tries<target*24&&added<target;tries++){
      const u=(random()*2-1)*0.91,v=(random()*2-1)*0.91;
      if(u*u+v*v>0.76) continue;
      const lx=u*I.rx,lz=v*I.rz,x=I.x+I.cs*lx-I.sn*lz,z=I.z+I.sn*lx+I.cs*lz;
      const y=islandGround(x,z,normal);
      if(y<3.0||normal.ny<0.66||(I.biome==='alpine'&&y>12+I.cliff*0.2)) continue;
      /* Seeded, multi-scale forest patches preserve open grass and rock;
         a small exclusion radius keeps trunks from occupying the same spot. */
      const cover=islandNoise(x*0.115,z*0.115,I.seed+222)*0.7+
                  islandNoise(x*0.28+13,z*0.28-7,I.seed+333)*0.3;
      if(random()>0.10+0.85*sstep(0.37,0.60,cover)) continue;
      const height=(1.8+3.4*Math.pow(random(),0.85))*options.treeScale, spacing=0.62+height*0.08;
      let crowded=false;
      for(const t of planted) if((x-t.x)*(x-t.x)+(z-t.z)*(z-t.z)<spacing*spacing){crowded=true;break;}
      if(crowded) continue;
      planted.push({x,z});
      data.push(x,y-height*0.025,z,height,random(),random(),random(),random()); added++;
    }
  }
  islands.treeCount=data.length/8;
  islands.trees={vao:gl.createVertexArray(),buffer:gl.createBuffer()};
  gl.bindVertexArray(islands.trees.vao); gl.bindBuffer(gl.ARRAY_BUFFER,islands.trees.buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,4,gl.FLOAT,false,32,0); gl.vertexAttribDivisor(0,1);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,4,gl.FLOAT,false,32,16); gl.vertexAttribDivisor(1,1);
  gl.bindVertexArray(null);
}

function makeIslandCoast(){
  islands.coast.length=0;
  for(const I of islands.land){
    /* More samples than before: the surf line is now continuous, so beaches
       and headlands need even coverage rather than only steep cliff gates. */
    const count=Math.round(46+I.rx*2.6);
    for(let j=0;j<count;j++){
      const a=(j+0.5)*Math.PI*2/count,ca=Math.cos(a),sa=Math.sin(a);
      function point(r){ const lx=ca*I.rx*r,lz=sa*I.rz*r; return [I.x+I.cs*lx-I.sn*lz,I.z+I.sn*lx+I.cs*lz]; }
      let lo=0.65,hi=1.35;
      for(let k=0;k<14;k++){
        const mid=(lo+hi)*0.5,p=point(mid);
        if(islandGround(p[0],p[1])>0) lo=mid; else hi=mid;
      }
      const shore=point((lo+hi)*0.5),inside=point(Math.max(0.1,lo-0.15));
      /* Use the sampled surface for the seaward normal, so a breaker faces the
         real beach or headland rather than an ellipse approximating it. */
      const e=0.65;
      let nx=islandGround(shore[0]-e,shore[1])-islandGround(shore[0]+e,shore[1]);
      let nz=islandGround(shore[0],shore[1]-e)-islandGround(shore[0],shore[1]+e);
      let l=Math.hypot(nx,nz);
      if(l<1e-5){
        nx=I.cs*ca/I.rx-I.sn*sa/I.rz; nz=I.sn*ca/I.rx+I.cs*sa/I.rz; l=Math.hypot(nx,nz)||1;
      }
      nx/=l;nz/=l;
      const insideH=islandGround(inside[0],inside[1]);
      islands.coast.push({x:shore[0]+nx*0.35,z:shore[1]+nz*0.35,nx,nz,
        /* Steep shores throw plumes; gentle ones receive running wash. */
        steep:insideH>=2.2,last:0,cool:0,wash:0});
    }
  }
  refreshStackCoast();
}
/* Sea stacks are land in the surf zone, so waves race and break around them
   as well. Their instance layout is (x, baseY, z, width, ...). Refreshing
   only these entries keeps the coast array identity stable, which lets a
   detail-only rebuild update the stacks without clearing the cliff surf. */
function refreshStackCoast(){
  for(let i=islands.coast.length-1;i>=0;i--) if(islands.coast[i].stack) islands.coast.splice(i,1);
  const stacks=islands.details&&islands.details.stacks;
  const data=stacks&&(stacks.data||(stacks.instances&&stacks.instances.data));
  if(!data) return;
  for(let i=0;i<data.length;i+=8){
    const x=data[i],z=data[i+2];
    let nx=0,nz=1;
    for(const I of islands.land){
      const ox=x-I.x,oz=z-I.z,dist=Math.hypot(ox,oz);
      if(dist<Math.max(I.rx,I.rz)*1.6&&dist>0.001){ nx=ox/dist; nz=oz/dist; break; }
    }
    islands.coast.push({x,z,nx,nz,steep:true,last:0,cool:0,wash:0,stack:true});
  }
}

/* Planting changes do not need to rebuild the terrain or clear its surf. */
function rebuildIslandTrees(options,skipScenery=false){
  if(!islands.active) return;
  if(islands.trees){ gl.deleteVertexArray(islands.trees.vao); gl.deleteBuffer(islands.trees.buffer); }
  makeIslandTrees(islandRandom(islands.seed^0xa5c39e21),options);
  if(!skipScenery&&typeof rebuildIslandScenery==='function') rebuildIslandScenery(options);
}

function disposeIslands(){
  if(typeof clearCliffSurf==='function') clearCliffSurf();
  if(typeof disposeIslandDetails==='function') disposeIslandDetails();
  for(const I of islands.land){ gl.deleteVertexArray(I.vao);gl.deleteBuffer(I.vb);gl.deleteBuffer(I.ib); }
  if(islands.trees){ gl.deleteVertexArray(islands.trees.vao); gl.deleteBuffer(islands.trees.buffer); }
  if(typeof disposeIslandScenery==='function') disposeIslandScenery();
  islands.land=[]; islands.coast=[]; islands.trees=null; islands.treeCount=0;
}
function generateIslands(seed,options){
  disposeIslands();
  islands.seed=seed===undefined?Math.floor(Math.random()*4294967296):seed>>>0;
  islands.options=islandConfig(options);
  const config=islands.options, style=ISLAND_STYLES[config.style], random=islandRandom(islands.seed);
  /* A common seeded rotation and reflection changes the whole silhouette,
     without sacrificing the water channels between the islands. */
  const layoutAngle=(random()-0.5)*1.9, lc=Math.cos(layoutAngle),ls=Math.sin(layoutAngle),flip=random()<0.5?-1:1;
  /* Well-spaced centres keep a navigable channel between every island even
     after the seeded rotations, coastline variations and small position jitter. */
  const layouts=[
    [-18,-16,14.8,11.7,6.6,5.8,168,2.2],
    [ 18,-25,10.8, 9.1,5.7,5.7,140,3.3],
    [ -3,-48, 8.0, 6.5,5.0,3.2,112,1.9],
    [-37,  7, 7.6, 6.0,4.6,2.5,112,1.6],
    [ 31,  7, 8.7, 7.0,5.2,4.7,120,2.8]
  ];
  /* Mixed archipelagos use each biome at most once, in a seed-dependent order.
     This separate random stream never changes the saved island layout. */
  const biomeOrder=ISLAND_BIOME_KEYS.slice(), biomeRandom=islandRandom(islands.seed^0x743ad921);
  for(let i=biomeOrder.length-1;i>0;i--){
    const j=Math.floor(biomeRandom()*(i+1)); [biomeOrder[i],biomeOrder[j]]=[biomeOrder[j],biomeOrder[i]];
  }
  /* A mixed archipelago always contains one volcanic island: it is the most
     distinctive silhouette and it keeps the coast readable at a glance. The
     remaining islands still draw their biomes from a seeded shuffle. */
  biomeOrder.splice(biomeOrder.indexOf('volcanic'),1); biomeOrder.unshift('volcanic');
  /* Layout presets move the same five seeded islands. A lagoon puts them in a
     ring around a sheltered bay; a chain turns them into smaller barrier
     islands along one seeded bearing. Every position still goes through the
     channel guarantee below, so no layout can close the navigable water. */
  const count=Math.min(config.count,layouts.length), positions=[];
  if(config.layout==='lagoon'){
    const ring=(31+random()*3.4)*config.spread;
    for(let i=0;i<count;i++){
      const angle=layoutAngle+i*Math.PI*2/count+(random()-0.5)*0.16;
      positions.push([Math.sin(angle)*ring,Math.cos(angle)*ring+7,1]);
    }
  }else if(config.layout==='chain'){
    /* Smaller barrier islands, spaced by their own radii. The chain limits
       its spread so even the outermost island stays inside the shoreline
       map and every pair keeps a navigable channel. */
    const sizeScale=0.62, spread=Math.min(config.spread,1.2);
    const radii=layouts.map(p=>(p[2]+p[3])*0.5*sizeScale);
    const offsets=[0];
    for(let i=1;i<count;i++) offsets.push(offsets[i-1]+1.42*(radii[i-1]+radii[i])+2.2);
    const mid=offsets[count-1]/2, bearing=layoutAngle+0.7;
    for(let i=0;i<count;i++){
      const t=(offsets[i]-mid)*spread;
      positions.push([Math.cos(bearing)*t,Math.sin(bearing)*t+7,sizeScale]);
    }
  }else{
    for(let i=0;i<count;i++){
      const p=layouts[i];
      positions.push([p[0]*flip*config.spread,(p[1]+19)*config.spread,1]);
    }
  }
  islands.active=true; loadIslandTextures(config.biome);
  for(let i=0;i<count;i++){
    const p=layouts[i],pos=positions[i],ang=(random()-0.5)*1.3+layoutAngle;
    const px=pos[0],pz=pos[1],sizeScale=pos[2];
    const biome=config.biome==='mixed'?biomeOrder[i]:config.biome;
    const I={x:lc*px-ls*pz+(random()-0.5)*2.5,z:ls*px+lc*pz-19+(random()-0.5)*2.5,
      rx:p[2]*sizeScale*(0.94+random()*0.12),rz:p[3]*sizeScale*(0.94+random()*0.12),
      cliff:p[4]*(0.9+random()*0.2)*style.cliff*config.relief,
      peak:p[5]*(0.85+random()*0.3)*style.peak*config.relief,
      /* Karst terraces and the drowned fjord channel need a denser grid to be
         resolved rather than averaged away; still well inside the 16-bit
         index limit. */
      n:(biome==='moss'||biome==='fjord')?Math.min(184,p[6]+20):p[6],peakFalloff:p[7],cs:Math.cos(ang),sn:Math.sin(ang),
      coast:config.coast,beachWidth:config.beach*style.beach,features:config.features,
      biome,drama:config.drama,terraces:config.terraces,shelf:config.shelf,
      phase:random()*Math.PI*2,beach:i===0?Math.atan2(Math.cos(ang)/p[3],Math.sin(ang)/p[2])+(random()-0.5)*0.5:random()*Math.PI*2,
      peakX:(random()-0.5)*0.4,peakZ:(random()-0.5)*0.4,seed:(islands.seed+i*131)|0};
    /* Conservative dry-land bounds include the maximum coastline distortion.
       Push neighbours apart before meshing so every seed leaves open water. */
    for(let pass=0;pass<3;pass++) for(const other of islands.land){
      const dx=I.x-other.x,dz=I.z-other.z,d=Math.hypot(dx,dz)||1;
      const min=1.36*(Math.max(I.rx,I.rz)+Math.max(other.rx,other.rz))+1.5;
      if(d<min){ I.x+=dx/d*(min-d); I.z+=dz/d*(min-d); }
    }
    I.extent=Math.max(I.rx,I.rz)*1.8;
    makeIslandMesh(I); islands.land.push(I);
  }
  makeIslandMap();
  makeIslandTrees(islandRandom(islands.seed^0xa5c39e21),config);
  if(typeof makeIslandDetails==='function') makeIslandDetails(islandRandom(islands.seed^0x19b6af42),config);
  if(typeof makeIslandScenery==='function') makeIslandScenery(config);
  makeIslandCoast();
  islands.nextCrash=simT+0.3;
  if(typeof onIslandsChanged==='function') onIslandsChanged();
  return islands.seed;
}
function removeIslands(){ islands.active=false; disposeIslands(); if(typeof onIslandsChanged==='function') onIslandsChanged(); }

function bindIslandTexture(unit,tex,p,name){
  gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,tex); gl.uniform1i(L(p,name),unit);
}
function drawIslands(mode,mirror){
  if(!islands.active||!islandTextures) return;
  const ce=[eye[0],mirror?-eye[1]:eye[1],eye[2]];
  gl.useProgram(pIsland); setSky(pIsland);
  gl.uniformMatrix4fv(L(pIsland,'uVP'),false,VP); gl.uniform3fv(L(pIsland,'uCamEff'),ce);
  gl.uniform1f(L(pIsland,'uMode'),mode); gl.uniform1f(L(pIsland,'uMirror'),mirror);
  gl.uniform1f(L(pIsland,'uSea'),sea); gl.uniform1f(L(pIsland,'uSnowCover'),env.season===3?1:0);
  gl.uniform1f(L(pIsland,'uMist'),islands.options.mist);
  bindIslandTexture(6,islandTextures.rock,pIsland,'uRock'); bindIslandTexture(7,islandTextures.grass,pIsland,'uGrass');
  bindIslandTexture(8,islandTextures.sand,pIsland,'uSand'); bindIslandTexture(9,islandTextures.talus,pIsland,'uTalus');
  bindIslandTexture(12,islandTextures.basalt||islandTextures.rock,pIsland,'uBasalt');
  bindIslandTexture(13,islandTextures.sandstone||islandTextures.talus,pIsland,'uSandstone');
  bindIslandTexture(15,islandTextures.moss||islandTextures.grass,pIsland,'uMoss');
  for(const I of islands.land){
    gl.uniform1f(L(pIsland,'uBiome'),ISLAND_BIOMES[I.biome].id);
    gl.uniform4f(L(pIsland,'uIsland'),I.x,I.z,I.cs,I.sn);
    gl.uniform4f(L(pIsland,'uIslandForm'),I.rx,I.rz,I.beach,I.beachWidth);
    gl.bindVertexArray(I.vao); gl.drawElements(gl.TRIANGLES,I.indexCount,gl.UNSIGNED_SHORT,0);
  }
  if(islands.treeCount){
    gl.useProgram(pTree); setSky(pTree);
    gl.uniformMatrix4fv(L(pTree,'uVP'),false,VP); gl.uniform3fv(L(pTree,'uCamEff'),ce);
    gl.uniform1f(L(pTree,'uMode'),mode); gl.uniform1f(L(pTree,'uMirror'),mirror);
    gl.uniform1f(L(pTree,'uSnowCover'),env.season===3?1:0);
    gl.uniform1f(L(pTree,'uWindStrength'),clamp(envS.wind/28,0,1)*islands.options.wind); gl.uniform2f(L(pTree,'uWindDir'),Math.sin(windAng),Math.cos(windAng));
    bindIslandTexture(10,islandTextures.pine,pTree,'uPine');
    gl.bindVertexArray(islands.trees.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,18,islands.treeCount);
  }
  if(typeof drawIslandDetails==='function') drawIslandDetails(mode,mirror,ce);
  if(typeof drawIslandScenery==='function') drawIslandScenery(mode,mirror,ce);
  gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
}

/* Wave-crest crossings, not a random timer: only a rising swell at an
   exposed coast can launch a plume. The cooldown spreads impacts along the
   coastline and prevents a single crest overwhelming the particle budget. */
function updateIslandSurf(dt){
  if(!islands.active||dt<=0) return;
  const strength=islands.options.surf;
  const rough=strength>0.01&&sea>0.58&&(sky.storm>0.32||sea>0.82);
  const dx=Math.sin(windAng),dz=Math.cos(windAng),threshold=0.06+0.26*sea;
  let hit=null,best=-1;
  for(const p of islands.coast){
    const h=surfH(p.x,p.z,simT), rising=h>threshold&&p.last<=threshold;
    p.last=h;
    if(!rough||!rising||simT<p.cool||simT<islands.nextCrash) continue;
    /* Swell wraps around headlands, but the windward face is hit hardest. */
    const facing=Math.max(0,-(p.nx*dx+p.nz*dz));
    const vx=eye[0]-p.x,vz=eye[2]-p.z, viewLen=Math.hypot(vx,vz)||1;
    const visible=Math.max(0,(p.nx*vx+p.nz*vz)/viewLen);
    /* Gentle beaches get a running wash instead of a vertical plume, so a
       rising crest always ends somewhere rather than only at a cliff gate. */
    const score=(p.steep?0.55:0.32+facing*0.6)*(0.25+1.75*visible)*(0.6+Math.random()*0.8);
    if(score>best){best=score;hit=p;}
  }
  if(hit&&hit.steep){
    hit.cool=simT+3.0+Math.random()*2;
    islands.nextCrash=simT+(0.32+Math.random()*0.38)/Math.max(0.35,strength);
    const power=clamp(((sea-0.42)*1.4+sky.storm*0.3)*strength,0.35,1.25);
    cliffSplash(hit.x,surfH(hit.x,hit.z,simT),hit.z,hit.nx,hit.nz,power);
    if(typeof audioCliff==='function') audioCliff(power,hit.x,hit.z);
  }
  /* Continuous swash: a run of white water reaches a visible shore every few
     tenths of a second, independent of the plume budget. This is what makes
     the sea read as racing toward land rather than pulsing at a few points. */
  if(strength>0.01&&sea>0.30&&simT>=islands.shoreClock){
    islands.shoreClock=simT+(0.62-0.26*clamp(sea,0,1))/Math.max(0.35,strength);
    let shore=null,shoreBest=-1;
    for(const p of islands.coast){
      if(p.steep) continue;
      const vx=eye[0]-p.x,vz=eye[2]-p.z, viewLen=Math.hypot(vx,vz)||1;
      const visible=Math.max(0,(p.nx*vx+p.nz*vz)/viewLen);
      const facing=0.45+0.55*Math.max(0,-(p.nx*dx+p.nz*dz));
      const score=(0.12+visible)*(0.25+facing)*(0.55+Math.random()*0.75);
      if(score>shoreBest){shoreBest=score;shore=p;}
    }
    if(shore&&typeof spawnShoreWash==='function'){
      const power=clamp((0.26+0.58*clamp(sea,0,1)+0.22*sky.storm)*strength,0.2,1.2);
      spawnShoreWash(shore.x,shore.z,shore.nx,shore.nz,power,shore.steep);
    }
  }
}
