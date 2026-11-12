'use strict';
/* Optional end-to-end sailing checks using a real WebGL 2 Chromium context. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const url=process.env.AQUA_URL||'http://127.0.0.1:8000/';
const args=(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean);
const launch={headless:true,args};
if(process.env.CHROMIUM_PATH) launch.executablePath=process.env.CHROMIUM_PATH;
const timeout=90000;

async function makePage(browser,options={}){
  const context=await browser.newContext({viewport:{width:1000,height:700},reducedMotion:'reduce',...options});
  await context.addInitScript(()=>{
    window.testFrames=[];
    window.requestAnimationFrame=fn=>{testFrames.push(fn);return testFrames.length;};
    window.cancelAnimationFrame=()=>{};
  });
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout});
  await page.waitForFunction(()=>window.AquaBoot&&AquaBoot.state==='running',null,{polling:100,timeout});
  await page.evaluate(()=>{document.body.classList.remove('booting');userSet('quality','low');});
  return {context,page};
}
async function frame(page,count=1){
  const result=await page.evaluate(n=>{
    for(let i=0;i<n;i++)frame(lastT+16.7);
    return {state:AquaBoot.state,error:gl.getError(),detail:document.getElementById('err').textContent};
  },count);
  assert.equal(result.state,'running',result.detail);assert.equal(result.error,0);
}
async function readyHelm(page){
  await page.waitForFunction(()=>explore.mode==='helm'||ship.status==='error',null,{polling:100,timeout});
  const result=await page.evaluate(()=>({mode:explore.mode,status:ship.status,error:ship.error}));
  assert.equal(result.status,'ready',result.error);assert.equal(result.mode,'helm');
}
async function sailSteps(page,count){
  await page.evaluate(n=>{for(let i=0;i<n;i++){simT+=.05;updateShip(.05,.05);updateVoyage(.05,.05);}},count);
}
function overlaps(a,b){return a&&b&&a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;}

(async()=>{
  const browser=await chromium.launch(launch);
  try{
    {
      const {context,page}=await makePage(browser);
      assert.equal(await page.locator('.brand').count(),0,'the app title is no longer in the corner');
      await page.locator('#bSet').click();await page.locator('.p-title').waitFor({state:'visible'});
      assert.equal(await page.locator('.p-title span').textContent(),'Aqua');
      assert.equal(await page.locator('.p-title').isVisible(),true,'the title lives in settings');
      await page.locator('#pClose').click();
      assert.equal(await page.evaluate(()=>ship.status),'idle');
      await page.locator('#bSail').click();await readyHelm(page);await frame(page,2);
      let state=await page.evaluate(()=>({mode:explore.mode,anchored:ship.anchored,power:ship.throttle,
        view:explore.helmView,focus:document.activeElement.id,heading:ship.heading,position:[ship.x,ship.z]}));
      assert.deepEqual([state.mode,state.anchored,state.power,state.view,state.focus],['helm',true,0,'chase','gl']);
      await page.keyboard.down('w');await sailSteps(page,65);await page.keyboard.up('w');
      state=await page.evaluate(()=>({position:[ship.x,ship.z],speed:ship.speed,power:ship.throttle,anchored:ship.anchored,foam:coastFoam.length}));
      assert.ok(Math.hypot(...state.position)>3);assert.ok(state.speed>1);assert.ok(state.power>.9);assert.equal(state.anchored,false);
      assert.ok(state.foam>0,'the moving ship leaves foam');
      const heading=await page.evaluate(()=>ship.heading);
      await page.keyboard.down('d');await sailSteps(page,30);await page.keyboard.up('d');
      assert.ok((await page.evaluate(()=>ship.heading))>heading+.25,'D steers the actual hull');
      const oldChase=await page.evaluate(()=>explore.chaseYaw);
      await page.mouse.move(500,350);await page.mouse.down();await page.mouse.move(560,370);await page.mouse.up();
      assert.ok(Math.abs((await page.evaluate(()=>explore.chaseYaw))-oldChase)>.1,'drag orbits the chase view');
      await page.locator('#bHelmView').click();
      assert.equal(await page.evaluate(()=>explore.helmView),'deck');
      await frame(page);state=await page.evaluate(()=>({eye:eye.slice(),pos:explore.pos.slice(),error:gl.getError()}));
      assert.ok(Math.hypot(...state.eye.map((v,i)=>v-state.pos[i]))<.2,'deck view rides at the actual deck position');
      await page.keyboard.press('v');assert.equal(await page.evaluate(()=>explore.helmView),'chase');
      assert.equal(await page.evaluate(()=>cinema),false,'V changes sailing view instead of opening cinema');
      await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>ship.anchored),true);
      await sailSteps(page,80);assert.ok((await page.evaluate(()=>ship.speed))<.02,'the anchor slows the vessel');
      await page.evaluate(()=>{ship.anchored=false;ship.throttle=.7;});await sailSteps(page,40);
      await page.locator('#bHelm').click();
      const deck=await page.evaluate(()=>({mode:explore.mode,local:explore.local.slice(),x:ship.x,z:ship.z}));
      assert.equal(deck.mode,'deck');
      await page.evaluate(()=>{for(let i=0;i<40;i++){simT+=.05;updateShip(.05,.05);updateExplore(.05);}});
      state=await page.evaluate(()=>({mode:explore.mode,local:explore.local.slice(),pos:explore.pos.slice(),ship:[ship.x,ship.z],
        expected:shipPoint(explore.local[0],explore.local[1]+1.55,explore.local[2])}));
      assert.equal(state.mode,'deck');assert.ok(Math.hypot(state.ship[0]-deck.x,state.ship[1]-deck.z)>1);
      assert.ok(Math.hypot(...state.pos.map((v,i)=>v-state.expected[i]))<1e-5,'the walker stays aboard while the ship sails');
      assert.ok(Math.hypot(state.local[0]-deck.local[0],state.local[2]-deck.local[2])<.01);
      await page.keyboard.press('b');assert.equal(await page.evaluate(()=>explore.mode),'helm');
      await page.keyboard.press('b');assert.equal(await page.evaluate(()=>explore.mode),'deck');
      await page.evaluate(()=>{setPanel(true,'scene');canvas.focus({preventScroll:true});});
      await page.keyboard.down('w');
      assert.equal(await page.evaluate(()=>explore.keys.size),0,'settings cannot send movement to hidden controls');
      await page.keyboard.up('w');
      await page.locator('#panel').getByRole('button',{name:'Take the helm',exact:true}).click();
      assert.equal(await page.evaluate(()=>explore.mode),'helm');
      assert.equal(await page.evaluate(()=>document.body.classList.contains('panel-open')),false,'taking the helm from settings closes the panel');
      await page.keyboard.press('p');
      const frozen=await page.evaluate(()=>({pos:[ship.x,ship.z],pose:Array.from(ship.matrix),throttle:ship.throttle}));
      await page.keyboard.down('w');await frame(page,3);await page.keyboard.up('w');
      assert.deepEqual(await page.evaluate(()=>({pos:[ship.x,ship.z],pose:Array.from(ship.matrix),throttle:ship.throttle})),frozen);
      await page.keyboard.press('p');
      console.log('PASS: direct helm, sailing, steering, views, anchor, walking aboard and pause');

      await page.evaluate(()=>{
        clearExploreInput();setShipAnchor(true);Object.assign(ship,{x:0,z:0,heading:Math.PI/2,speed:0,poseReady:false});updateShip(0,0);
        resetVoyageTrack();
      });
      await page.locator('#bChart').click();
      assert.equal(await page.locator('#voyageChart').isVisible(),true);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'chartMap');
      for(const width of [900,1000,1200,1280]){
        await page.setViewportSize({width,height:700});
        await page.waitForFunction(w=>{
          const e=document.querySelector('#helmHUD'),visible=getComputedStyle(e).display!=='none';
          return innerWidth===w&&(w<=900?!visible:visible&&Math.abs(e.getBoundingClientRect().width-Math.min(650,w-348))<1);
        },width,{polling:100,timeout});
        const rects=await page.evaluate(()=>{
          const rect=sel=>{const e=document.querySelector(sel),s=getComputedStyle(e);if(s.display==='none')return null;
            const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
          return {helm:rect('#helmHUD'),chart:rect('#voyageChart')};
        });
        assert.ok(!overlaps(rects.helm,rects.chart),`chart and instruments do not overlap at ${width}px`);
      }
      await page.setViewportSize({width:1000,height:700});
      await page.waitForFunction(()=>innerWidth===1000&&getComputedStyle(document.querySelector('#helmHUD')).display!=='none'&&
        Math.abs(document.querySelector('#helmHUD').getBoundingClientRect().width-650)<1,null,{polling:100,timeout});
      for(let i=0;i<5;i++) await page.keyboard.press('ArrowRight');
      assert.match(await page.locator('#chartAnnouncement').textContent(),/25 metres east.*of the ship/,'keyboard chart cursor is announced');
      await page.keyboard.down('w');
      assert.equal(await page.evaluate(()=>explore.keys.size),0,'the open chart cannot steer the vessel accidentally');
      await page.keyboard.up('w');
      await page.keyboard.press('Enter');
      state=await page.evaluate(()=>({waypoint:voyage.waypoint,pilot:ship.throttle,keys:explore.keys.size}));
      assert.ok(Math.abs(state.waypoint.x-25)<.01);assert.equal(state.pilot,0);assert.equal(state.keys,0,'chart arrows do not steer the ship');
      await page.locator('#bChartZoom').click();
      assert.equal(await page.evaluate(()=>voyage.zoomed),true);
      const box=await page.locator('#chartMap').boundingBox();
      await page.locator('#chartMap').click({position:{x:box.width*.75,y:box.height*.5}});
      state=await page.evaluate(()=>({waypoint:voyage.waypoint,ship:[ship.x,ship.z],view:document.querySelector('#chartMap').getAttribute('viewBox')}));
      assert.ok(Math.abs(state.waypoint.x-state.ship[0]-45)<1&&Math.abs(state.waypoint.z-state.ship[1])<1,'zoomed chart clicks use the correct world coordinates');
      await page.locator('#bPilot').click();
      assert.equal(await page.evaluate(()=>voyage.pilot),true);
      await page.evaluate(()=>{for(let i=0;i<1800&&voyage.pilot;i++){simT+=.05;updateShip(.05,.05);}updateVoyage(.05,.05);});
      state=await page.evaluate(()=>({arrived:voyage.arrived,pilot:voyage.pilot,anchored:ship.anchored,
        distance:Math.hypot(ship.x-voyage.waypoint.x,ship.z-voyage.waypoint.z)}));
      assert.equal(state.arrived,true);assert.equal(state.pilot,false);assert.equal(state.anchored,true);assert.ok(state.distance<11);
      await page.evaluate(()=>updateVoyageChart());
      await page.waitForFunction(()=>{
        const map=document.querySelector('#chartMap').getBoundingClientRect(),m=document.querySelector('.chart-water').getScreenCTM();
        return Math.abs(m.e-(map.left+map.width/2))<1&&Math.abs(m.f-(map.top+map.height/2))<1;
      },null,{polling:100,timeout});
      const background=await page.evaluate(()=>{
        const m=document.querySelector('#chartBackground').transform.baseVal.consolidate().matrix;
        return {x:ship.x,z:ship.z,scale:m.a,tx:m.e,tz:m.f};
      });
      assert.ok(Math.abs(background.tx-background.x)<.001&&Math.abs(background.tz-background.z)<.001,
        'zoomed chart background and north marker follow a ship away from the origin');
      assert.ok(Math.abs(background.scale-90/190)<.001);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>voyage.chartOpen),false);assert.equal(await page.evaluate(()=>explore.active),true,'Escape closes the chart, not the voyage');

      await page.evaluate(()=>{userSet('islands',true);});
      const spawn=await page.evaluate(()=>{
        const framed=cameraFramesShip();dropBall();const ball=balls[balls.length-1];
        return {framed,offset:Math.hypot(ball.x-ship.x,ball.z-ship.z)};
      });
      assert.equal(spawn.framed,true);assert.ok(spawn.offset<3,'ball drops follow the helm even when islands are enabled');
      await page.locator('#bChart').click();
      state=await page.evaluate(()=>({land:document.querySelector('#chartLand').children.length,
        island:islands.land[0]&&[islands.land[0].x,islands.land[0].z],valid:shipPlacementOK(ship.x,ship.z)}));
      assert.equal(state.land,5);assert.equal(state.valid,true);
      assert.equal(await page.evaluate(([x,z])=>setVoyageWaypoint(x,z),state.island),false,'a point on land cannot be a ship destination');
      await page.locator('#bCloseChart').click();
      state=await page.evaluate(()=>{
        const island=islands.land[0];let x=island.x-55,z=island.z;
        Object.assign(ship,{x,z,heading:Math.PI/2,speed:0,throttle:1,anchored:false,poseReady:false});
        if(!shipPlacementOK(x,z)) relocateShip();
        const start=ship.x;let valid=true,stopped=false;
        for(let i=0;i<1000;i++){
          simT+=.05;updateShip(.05,.05);valid=valid&&shipPlacementOK(ship.x,ship.z);
          if(i>20&&ship.speed===0&&ship.throttle===0){stopped=true;break;}
        }
        return {valid,stopped,start,end:ship.x};
      });
      assert.equal(state.valid,true);assert.equal(state.stopped,true,'the full hull stops before a real island');assert.ok(state.end>=state.start);
      console.log('PASS: accessible chart, zoom, waypoint pilot and shallow-water protection');

      state=await page.evaluate(()=>{
        userSet('islands',false);balls.length=0;clearExploreInput();
        Object.assign(ship,{x:80,z:0,heading:Math.PI/2,speed:0,throttle:.8,anchored:false,poseReady:false});updateShip(0,0);
        const floor=shipDeckAt(-2,.8,1.75),p=shipPoint(-2,floor+.4,.8),ball=spawnBall(p[0],p[1],p[2],3);
        ball.vx=ball.vy=ball.vz=ball.wx=ball.wy=ball.wz=0;
        for(let i=0;i<400;i++){for(let j=0;j<12;j++)physicsStep();updateShip(.05,.05);}
        return {shipX:ship.x,local:shipLocal(ball.x,ball.y,ball.z),dead:ball.dead,retained:balls.includes(ball)};
      });
      assert.ok(state.shipX>120);assert.equal(state.dead,false);assert.equal(state.retained,true);
      assert.ok(state.local[0]>-5.5&&state.local[0]<1&&state.local[1]>1.5,'a resting ball can travel on the deck beyond the old sandbox bounds');
      await page.locator('#bHelm').click();await page.locator('#bBoard').click();
      state=await page.evaluate(()=>{for(let i=0;i<20;i++)updateExplore(.05);return {mode:explore.mode,pos:explore.pos.slice(),ship:[ship.x,ship.z]};});
      assert.equal(state.mode,'swim');assert.ok(Math.hypot(state.pos[0]-state.ship[0],state.pos[2]-state.ship[1])<8,'leaving a distant ship does not teleport the swimmer to the old limit');
      await page.locator('#bBoard').click();assert.equal(await page.evaluate(()=>explore.mode),'deck');
      await frame(page);
      state=await page.evaluate(()=>{
        const ball=balls[0],start=ball.x;userSet('ship',false);
        for(let i=0;i<240;i++)physicsStep();
        return {dead:ball.dead,retained:balls.includes(ball),recovery:ball.shipRecovery,start,x:ball.x};
      });
      assert.equal(state.dead,false);assert.equal(state.retained,true);assert.equal(state.recovery,true);
      assert.ok(state.x<state.start,'hiding a distant ship lets its ball drift home rather than deleting it');
      console.log('PASS: distant deck-ball transport, swimming, and recovery after hiding the ship');
      await context.close();
    }
    {
      const {context,page}=await makePage(browser,{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
      await page.locator('#bSail').tap();await readyHelm(page);await frame(page);
      const cdp=await context.newCDPSession(page),forward=await page.locator('[data-swim="w"]').boundingBox();
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:forward.x+forward.width/2,y:forward.y+forward.height/2}]});
      await sailSteps(page,70);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      let state=await page.evaluate(()=>({x:ship.x,z:ship.z,speed:ship.speed,anchored:ship.anchored,keys:explore.touchKeys.size,
        label:document.querySelector('[data-swim="w"]').getAttribute('aria-label')}));
      assert.ok(Math.hypot(state.x,state.z)>3&&state.speed>1);assert.equal(state.anchored,false);assert.equal(state.keys,0);
      assert.equal(state.label,'Raise sail');
      const right=await page.locator('[data-swim="d"]').boundingBox(),heading=await page.evaluate(()=>ship.heading);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:right.x+right.width/2,y:right.y+right.height/2}]});
      await sailSteps(page,25);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.ok((await page.evaluate(()=>ship.heading))>heading+.2);
      await page.locator('#bExploreSettings').tap();await page.locator('.p-title').waitFor({state:'visible'});
      assert.equal(await page.locator('.p-title span').textContent(),'Aqua');
      assert.equal(await page.locator('#helmHUD').isVisible(),false,'settings do not leave touch controls over the panel');
      await page.locator('#pClose').tap();assert.equal(await page.evaluate(()=>document.activeElement.id),'gl');

      for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:568,height:320},{width:480,height:320}]){
        await page.setViewportSize(size);
        await page.waitForFunction(({width,height})=>{
          if(innerWidth!==width||innerHeight!==height) return false;
          const landscape=height<=520&&width>height;
          const expected=landscape?(width<=700?width-165:Math.min(500,width-330)):
            (width<=540?width-24:Math.min(650,width-32));
          const font=width<=380?12:landscape?13:width<=540?14:16;
          return Math.abs(document.querySelector('#helmHUD').getBoundingClientRect().width-expected)<1&&
            parseFloat(getComputedStyle(document.querySelector('#helmHeading')).fontSize)===font;
        },size,{polling:100,timeout});
        const layout=await page.evaluate(()=>{
          const rect=sel=>{const e=document.querySelector(sel),s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')return null;
            const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
          return {hud:rect('#exploreHUD'),helm:rect('#helmHUD'),pad:rect('.swim-pad'),cond:rect('#cond'),stats:rect('#stats')};
        });
        for(const r of [layout.hud,layout.helm,layout.pad].filter(Boolean)){
          assert.ok(r.left>=-1&&r.top>=-1&&r.right<=size.width+1&&r.bottom<=size.height+1,`sailing controls fit ${size.width}×${size.height}`);
        }
        assert.ok(!overlaps(layout.hud,layout.helm),`header and helm do not overlap at ${size.width}×${size.height}`);
        assert.ok(!overlaps(layout.helm,layout.pad),`helm and touch pad do not overlap at ${size.width}×${size.height}: ${JSON.stringify(layout)}`);
        assert.ok(!overlaps(layout.hud,layout.cond)&&!overlaps(layout.hud,layout.stats),`header does not cover weather or stats at ${size.width}×${size.height}`);
        const clipped=await page.evaluate(()=>['#helmHeading','#helmSpeed','#helmPower','#helmStatus','#bAnchor','#bChart','#bHelmView','#bHelm','#bExitExplore','#exploreStatus','#exploreMobileHelp']
          .filter(sel=>{const e=document.querySelector(sel),s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.scrollWidth>e.clientWidth+1;}));
        assert.deepEqual(clipped,[],`sailing labels fit at ${size.width}×${size.height}`);
        await page.locator('#bChart').tap();
        const chart=await page.locator('#voyageChart').boundingBox();
        assert.ok(chart.x>=-1&&chart.y>=-1&&chart.x+chart.width<=size.width+1&&chart.y+chart.height<=size.height+1,
          `chart fits ${size.width}×${size.height}`);
        const note=await page.locator('.chart-note').boundingBox();
        assert.ok(note.y+note.height<=chart.y+chart.height+1,`pilot safety note remains visible at ${size.width}×${size.height}`);
        assert.equal(await page.locator('#exploreTouch').isVisible(),false,'chart hides the touch steering pad');
        await page.locator('#bCloseChart').tap();
      }
      await page.setViewportSize({width:320,height:568});
      await page.waitForFunction(()=>Math.abs(document.querySelector('#helmHUD').getBoundingClientRect().width-296)<1,null,{polling:100,timeout});
      await page.locator('#bChart').tap();
      assert.equal(await page.locator('#exploreTouch').isVisible(),false,'touch steering is hidden while the small chart is open');
      assert.equal(await page.locator('#helmHUD').isVisible(),false);
      const chart=await page.locator('#voyageChart').boundingBox();
      assert.ok(chart.x>=0&&chart.y>=0&&chart.x+chart.width<=320&&chart.y+chart.height<=568);
      await page.locator('#bChartZoom').tap();assert.equal(await page.evaluate(()=>voyage.zoomed),true);
      const map=await page.locator('#chartMap').boundingBox();
      await page.touchscreen.tap(map.x+map.width*.75,map.y+map.height*.5);
      assert.ok(await page.evaluate(()=>!!voyage.waypoint),'a touch sets a waypoint');
      await page.locator('#bCloseChart').tap();assert.equal(await page.locator('#exploreTouch').isVisible(),true);
      console.log('PASS: touch sailing, settings, chart and narrow/landscape layouts');
      await context.close();
    }
    {
      const {context,page}=await makePage(browser);
      let fail=true;
      await page.route('**/assets/ship/hull-normal.jpg',route=>fail?route.fulfill({status:404,body:'missing'}):route.continue());
      await page.locator('#bSail').click();
      await page.waitForFunction(()=>ship.status==='error',null,{polling:100,timeout});
      let state=await page.evaluate(()=>({boot:AquaBoot.state,active:explore.active,mode:explore.mode,textures:ship.textures.length}));
      assert.deepEqual(state,{boot:'running',active:true,mode:'swim',textures:0},'an optional ship failure leaves exploration and the ocean usable');
      fail=false;await page.keyboard.press('b');await readyHelm(page);await frame(page);
      state=await page.evaluate(()=>({boot:AquaBoot.state,mode:explore.mode}));
      assert.deepEqual(state,{boot:'running',mode:'helm'});
      console.log('PASS: direct sailing recovers after an optional ship asset fails');
      await context.close();
    }
    {
      const {context,page}=await makePage(browser);
      let release;const gate=new Promise(resolve=>{release=resolve;});
      await page.route('**/assets/ship/rigging-color.jpg',async route=>{await gate;await route.continue();});
      const pending=page.waitForRequest(r=>r.url().endsWith('/assets/ship/rigging-color.jpg'),{timeout});
      await page.locator('#bSail').click();await pending;
      await page.locator('#bExitExplore').click();release();
      await page.waitForFunction(()=>ship.status==='ready'||ship.status==='error',null,{polling:100,timeout});
      const state=await page.evaluate(()=>({active:explore.active,mode:explore.mode,status:ship.status,anchor:ship.anchored}));
      assert.equal(state.status,'ready');assert.equal(state.active,false);assert.notEqual(state.mode,'helm');assert.equal(state.anchor,true);
      console.log('PASS: leaving during the optional ship download cannot re-enter the helm later');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
