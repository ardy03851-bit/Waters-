'use strict';
/* Optional real-WebGL regressions. Start a static server first; see README. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const url=process.env.AQUA_URL||'http://127.0.0.1:8000/';
const args=(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean);
const launch={headless:true,args};
if(process.env.CHROMIUM_PATH) launch.executablePath=process.env.CHROMIUM_PATH;
const timeout=90000;

async function makePage(browser,options={},setup=()=>{}){
  const context=await browser.newContext({viewport:{width:640,height:400},...options});
  await context.addInitScript(()=>{
    window.testFrames=[];
    window.requestAnimationFrame=fn=>{testFrames.push(fn);return testFrames.length;};
    window.cancelAnimationFrame=()=>{};
  });
  await context.addInitScript(setup);
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout});
  await page.waitForFunction(()=>window.AquaBoot&&AquaBoot.state==='running',null,{polling:100,timeout});
  await page.evaluate(()=>{document.body.classList.remove('booting');userSet('quality','low');});
  return {context,page};
}
async function frame(page,count=1){
  return page.evaluate(n=>{
    for(let i=0;i<n;i++) frame(lastT+16.7);
    return {state:AquaBoot.state,error:gl.getError(),detail:document.getElementById('err').textContent};
  },count);
}
async function readyShip(page){
  await page.waitForFunction(()=>ship.status==='ready'||ship.status==='error',null,{polling:100,timeout});
  const state=await page.evaluate(()=>({status:ship.status,error:ship.error}));
  assert.equal(state.status,'ready',state.error);
}
function assertFrame(f){assert.equal(f.state,'running',f.detail);assert.equal(f.error,0);}

(async()=>{
  const browser=await chromium.launch(launch);
  try{
    {
      const {context,page}=await makePage(browser);
      let requests=0;page.on('request',r=>{if(r.url().includes('/assets/ship/')) requests++;});
      assert.equal(await page.evaluate(()=>ship.status),'idle');
      assert.equal(requests,0,'ship resources are not fetched at startup');
      await page.locator('#bExplore').click();
      await readyShip(page);assert.ok(requests>=11,'geometry and authored textures are fetched on demand');
      await page.evaluate(()=>{
        window.shipMotionPasses=0;const previous=drawShipMotion;
        drawShipMotion=function(){shipMotionPasses++;return previous();};
      });
      assertFrame(await frame(page,2));
      let state=await page.evaluate(()=>({active:explore.active,mode:explore.mode,ship:ship.enabled,
        meshes:ship.meshes.length,grid:ship.grid.triangles.length,focus:document.activeElement.id,
        motion:shipMotionPasses,error:gl.getError(),camera:cameraSubmerge(),
        sailTime:gl.getUniform(pShip,L(pShip,'uTime')),simTime:simT}));
      assert.equal(state.active,true);assert.equal(state.mode,'swim');assert.equal(state.ship,true);
      assert.equal(state.meshes,3);assert.ok(state.grid>1000);assert.equal(state.focus,'gl');
      assert.ok(state.motion>0,'the ship participates in the depth-aware motion pass');
      assert.ok(Math.abs(state.sailTime-state.simTime)<1e-5,'visible sail animation uses simulation time');
      assert.equal(state.error,0);assert.equal(state.camera,0);
      await page.evaluate(()=>setPanel(true,'camera'));
      await page.locator('#pClose').click();
      assert.deepEqual(await page.evaluate(()=>({active:explore.active,focus:document.activeElement.id})),{active:true,focus:'gl'},'closing settings restores keyboard swimming');
      const start=await page.evaluate(()=>explore.pos[2]);
      await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<30;i++)updateExplore(.05);});await page.keyboard.up('w');
      assert.ok((await page.evaluate(()=>explore.pos[2]))<start-2,'W swims toward the ship');
      await page.keyboard.down('s');await page.evaluate(()=>{for(let i=0;i<4;i++)updateExplore(.05);});await page.keyboard.up('s');
      assert.equal(await page.evaluate(()=>slowMo),false,'S swims backward instead of activating slow motion');
      const ballsBefore=await page.evaluate(()=>balls.length);
      await page.keyboard.down('Shift');await page.evaluate(()=>{for(let i=0;i<24;i++)updateExplore(.05);computeCamera();});await page.keyboard.up('Shift');
      assert.equal(await page.evaluate(()=>cameraSubmerge()),1,'diving enters the underwater rendering path');
      assertFrame(await frame(page));
      await page.keyboard.down('Space');await page.evaluate(()=>{for(let i=0;i<40;i++)updateExplore(.05);});await page.keyboard.up('Space');
      assert.equal(await page.evaluate(()=>balls.length),ballsBefore,'Space rises instead of dropping a ball');
      await page.keyboard.down('w');
      await page.evaluate(()=>{for(let i=0;i<70;i++){simT+=.05;updateShip(.05,.05);updateExplore(.05);}});
      await page.keyboard.up('w');
      const approach=await page.evaluate(()=>({local:shipLocal(...explore.pos),depth:surfH(explore.pos[0],explore.pos[2],simT)-explore.pos[1]}));
      assert.ok(Math.abs(approach.local[0])<12.5&&Math.abs(approach.local[2])<7.2&&approach.depth<1.2,'the swimmer reaches the ship naturally at the surface');
      await page.locator('#bBoard').click();
      const boarding=await page.evaluate(()=>({mode:explore.mode,local:explore.local.slice(),yaw:explore.yaw}));
      assert.equal(boarding.mode,'deck');assert.ok(Number.isFinite(boarding.local[1]));
      await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<20;i++)updateExplore(.05);});await page.keyboard.up('w');
      state=await page.evaluate(()=>({mode:explore.mode,local:explore.local.slice(),floor:shipDeckAt(explore.local[0],explore.local[2],explore.local[1])}));
      assert.equal(state.mode,'deck');assert.ok(Math.hypot(state.local[0]-boarding.local[0],state.local[2]-boarding.local[2])>0.7);
      assert.notEqual(state.floor,null,'walking remains on the source mesh');
      await page.setViewportSize({width:760,height:440});
      assertFrame(await frame(page,2));
      assert.deepEqual(await page.evaluate(()=>[canvas.width,canvas.height]),[456,264],'resizing rebuilds the render targets while aboard');
      await page.keyboard.press('e');assert.equal(await page.evaluate(()=>explore.mode),'swim');
      await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>explore.active),false);
      await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>balls.length),ballsBefore+1,'ordinary ball controls return after leaving');

      await page.keyboard.press('q');
      state=await page.evaluate(()=>{
        simT+=1.5;const e=quake.sea,x=e.x+8,z=e.z,p=seaQuakeParameters(simT),h=surfH(x,z,simT);
        quake.sea=null;const base=surfH(x,z,simT);quake.sea=e;
        return {delta:h-base,expected:seaQuakeHeight(x,z,simT),uniform:p};
      });
      assert.ok(Math.abs(state.delta)>0.01);assert.ok(Math.abs(state.delta-state.expected)<1e-9);
      assert.ok(state.uniform[3]>0);assertFrame(await frame(page));
      await page.keyboard.press('p');
      const frozen=await page.evaluate(()=>({time:simT,pose:Array.from(ship.matrix),wave:seaQuakeParameters(simT)}));
      assertFrame(await frame(page,3));
      assert.deepEqual(await page.evaluate(()=>({time:simT,pose:Array.from(ship.matrix),wave:seaQuakeParameters(simT)})),frozen,'pausing freezes the ship and quake');
      await page.keyboard.press('p');assertFrame(await frame(page,3));
      assert.ok((await page.evaluate(()=>simT))>frozen.time,'simulation time resumes');
      await page.evaluate(()=>{userSet('islands',true);triggerIslandQuake();simT+=0.8;updateQuakes(.05,.05);});
      state=await page.evaluate(()=>({active:!!quake.land,cracks:quake.crackCount,dust:quake.particles.length,
        placement:shipPlacementOK(ship.x,ship.z),terrain:islands.land.length,focus:cameraFocus,dist:cam.tDist}));
      assert.equal(state.active,true);assert.ok(state.cracks>0&&state.cracks<=1200);assert.ok(state.dust>0&&state.dust<=96);
      assert.equal(state.placement,true);assert.equal(state.terrain,5);
      assert.equal(state.focus,'islands');assert.equal(state.dist,100,'adding islands keeps the original archipelago view even with a ship');
      assertFrame(await frame(page));
      await page.evaluate(()=>setPanel(true,'camera'));
      await page.getByRole('button',{name:'Frame ship'}).click();
      assert.deepEqual(await page.evaluate(()=>[cameraFocus,cam.tDist]),['ship',48]);
      await page.getByRole('button',{name:'Frame islands'}).click();
      assert.deepEqual(await page.evaluate(()=>[cameraFocus,cam.tDist]),['islands',100]);
      await page.getByRole('button',{name:'Frame ship'}).click();
      const previousSeed=await page.evaluate(()=>islands.seed);
      await page.evaluate(()=>{setPanel(false);newIslands();});assertFrame(await frame(page));
      state=await page.evaluate(()=>({seed:islands.seed,quake:quake.land,ship:ship.status,placement:shipPlacementOK(ship.x,ship.z),focus:cameraFocus}));
      assert.notEqual(state.seed,previousSeed);assert.equal(state.quake,null);assert.equal(state.ship,'ready');assert.equal(state.placement,true);
      assert.equal(state.focus,'islands','regenerating islands restores the archipelago view');
      await page.evaluate(()=>userSet('islands',false));assert.equal(await page.evaluate(()=>quake.land),null);
      assert.deepEqual(await page.evaluate(()=>[cameraFocus,cam.tDist]),['ship',48],'removing islands returns the camera to the ship');
      await page.evaluate(()=>{userSet('swimSpeed',1.25);userSet('quakeAuto',true);});
      await page.waitForFunction(()=>{
        const saved=JSON.parse(localStorage.getItem('aqua.settings.v2')||'null');
        return saved&&saved.ship&&saved.swimSpeed===1.25&&saved.quakeAuto;
      },null,{polling:100,timeout});
      await page.reload({waitUntil:'domcontentloaded',timeout});
      await page.waitForFunction(()=>window.AquaBoot&&AquaBoot.state==='running',null,{polling:100,timeout});
      await readyShip(page);
      state=await page.evaluate(()=>({ship:ship.enabled,active:explore.active,speed:explore.speed,auto:quake.automatic,error:gl.getError()}));
      assert.deepEqual(state,{ship:true,active:false,speed:1.25,auto:true,error:0});assertFrame(await frame(page));
      await page.evaluate(()=>{window.testLoss=gl.getExtension('WEBGL_lose_context');if(!testLoss)throw new Error('WEBGL_lose_context unavailable');testLoss.loseContext();});
      await page.waitForFunction(()=>AquaBoot.state==='lost',null,{polling:100,timeout});
      await page.evaluate(()=>testLoss.restoreContext());
      await page.waitForFunction(()=>window.AquaBoot&&AquaBoot.state==='running'&&AquaBoot.safeMode,null,{polling:100,timeout});
      await readyShip(page);assertFrame(await frame(page));
      assert.equal(await page.evaluate(()=>ship.textures.length),9,'context recovery rebuilds the optional ship in low-memory mode');
      await page.evaluate(()=>userSet('ship',false));
      state=await page.evaluate(()=>({status:ship.status,textures:ship.textures.length,buffers:ship.buffers.length,meshes:ship.meshes.length}));
      assert.deepEqual(state,{status:'idle',textures:0,buffers:0,meshes:0},'hiding the ship releases GPU resources');
      console.log('PASS: ship, swimming, deck, quakes, blur, persistence, graphics recovery and resource release');
      await context.close();
    }
    {
      const {context,page}=await makePage(browser);
      let fail=true;
      await page.route('**/assets/ship/hull-normal.jpg',route=>fail?route.fulfill({status:404,body:'missing'}):route.continue());
      await page.evaluate(()=>userSet('ship',true));
      await page.waitForFunction(()=>ship.status==='error',null,{polling:100,timeout});
      let result=await page.evaluate(()=>({state:AquaBoot.state,status:ship.status,textures:ship.textures.length,buffers:ship.buffers.length,meshes:ship.meshes.length}));
      assert.deepEqual(result,{state:'running',status:'error',textures:0,buffers:0,meshes:0},'a missing optional texture cleans up without killing the ocean');
      fail=false;assert.equal(await page.evaluate(()=>ensureShip()),true);await readyShip(page);
      assertFrame(await frame(page));
      await page.evaluate(()=>userSet('ship',false));
      let releaseGate;const gate=new Promise(resolve=>{releaseGate=resolve;});
      await page.route('**/assets/ship/rigging-color.jpg',async route=>{await gate;await route.continue();});
      const pending=page.waitForRequest(r=>r.url().endsWith('/assets/ship/rigging-color.jpg'),{timeout});
      await page.evaluate(()=>userSet('ship',true));await pending;
      await page.evaluate(()=>userSet('ship',false));releaseGate();
      await page.waitForFunction(()=>ship.status==='idle'&&!ship.load,null,{polling:100,timeout});
      result=await page.evaluate(()=>({state:AquaBoot.state,enabled:ship.enabled,textures:ship.textures.length,buffers:ship.buffers.length,meshes:ship.meshes.length}));
      assert.deepEqual(result,{state:'running',enabled:false,textures:0,buffers:0,meshes:0},'hiding during loading releases the completed resources too');
      console.log('PASS: optional ship failure, retry and in-flight cleanup leave the ocean running');
      await context.close();
    }
    {
      const {context,page}=await makePage(browser,{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true},()=>{
        sessionStorage.setItem('aqua.graphics.safe','1');window.testUploads=[];
        const original=WebGL2RenderingContext.prototype.texImage2D;
        WebGL2RenderingContext.prototype.texImage2D=function(...args){
          const source=args[5];
          if(args.length===6&&source&&(source instanceof HTMLImageElement||source instanceof HTMLCanvasElement)) testUploads.push([source.width,source.height]);
          return original.apply(this,args);
        };
      });
      await page.locator('#bExplore').tap();await readyShip(page);assertFrame(await frame(page));
      let result=await page.evaluate(()=>({safe:AquaBoot.safeMode,uploads:testUploads.slice(),visible:getComputedStyle(document.getElementById('exploreTouch')).display,
        position:explore.pos.slice(),yaw:explore.yaw}));
      assert.equal(result.safe,true);assert.equal(result.visible,'flex');assert.equal(result.uploads.length,9);
      assert.ok(result.uploads.every(([w,h])=>w<=512&&h<=512),'all ship maps obey low-memory limits');
      await page.setViewportSize({width:320,height:568});
      const fits=await page.evaluate(()=>['#exploreStatus','.explore-mobile'].every(sel=>{
        const e=document.querySelector(sel);return e.scrollWidth<=e.clientWidth;
      }));
      assert.equal(fits,true,'the exploration instructions fit on a narrow phone');
      await page.setViewportSize({width:390,height:844});
      const cdp=await context.newCDPSession(page),button=await page.locator('[data-swim="w"]').boundingBox();
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:button.x+button.width/2,y:button.y+button.height/2}]});
      await page.evaluate(()=>{for(let i=0;i<20;i++)updateExplore(.05);});
      assert.ok((await page.evaluate(()=>explore.pos[2]))<result.position[2]-1);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.equal(await page.evaluate(()=>explore.touchKeys.size),0,'released touch controls cannot stick');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:390}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:240,y:410}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.ok(Math.abs((await page.evaluate(()=>explore.yaw))-result.yaw)>0.1,'dragging the scene turns the camera');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:button.x+button.width/2,y:button.y+button.height/2}]});
      await page.evaluate(()=>{for(let i=0;i<90;i++){simT+=.05;updateShip(.05,.05);updateExplore(.05);}});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const approach=await page.evaluate(()=>({local:shipLocal(...explore.pos),depth:surfH(explore.pos[0],explore.pos[2],simT)-explore.pos[1]}));
      assert.ok(Math.abs(approach.local[0])<12.5&&Math.abs(approach.local[2])<7.2&&approach.depth<1.2,'touch controls can swim all the way from the spawn to the ship');
      await page.locator('#bBoard').tap();assert.equal(await page.evaluate(()=>explore.mode),'deck');
      await page.setViewportSize({width:844,height:390});assertFrame(await frame(page));
      const layout=await page.evaluate(()=>{
        const conditions=document.querySelector('#cond').getBoundingClientRect(),stats=document.querySelector('#stats').getBoundingClientRect();
        const hud=document.querySelector('#exploreHUD').getBoundingClientRect();
        return {conditionsRight:conditions.right,hudLeft:hud.left,hudRight:hud.right,statsLeft:stats.left};
      });
      assert.ok(layout.conditionsRight<=layout.hudLeft&&layout.hudRight<=layout.statsLeft,'the landscape controls do not overlap the header');
      await page.locator('#bExitExplore').tap();
      assert.equal(await page.evaluate(()=>explore.active),false);
      assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('exploreTouch')).display),'none');
      console.log('PASS: mobile swim, drag-to-look, boarding and low-memory ship textures');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
