'use strict';
/* Optional end-to-end tests against a running static server and real WebGL 2.
   See README.md for the Playwright/Chromium setup. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const url=process.env.AQUA_URL||'http://127.0.0.1:8000/';
const args=(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean);
const launch={headless:true,args};
if(process.env.CHROMIUM_PATH) launch.executablePath=process.env.CHROMIUM_PATH;
const timeout=90000;

async function makePage(browser,options={},setup=()=>{}){
  const context=await browser.newContext({viewport:{width:640,height:360},acceptDownloads:true,...options});
  /* Drive frames explicitly so software WebGL remains deterministic and the
     failure tests can count exactly which work was scheduled. */
  await context.addInitScript(()=>{
    window.testFrames=[];
    window.requestAnimationFrame=fn=>{window.testFrames.push(fn);return window.testFrames.length;};
    window.cancelAnimationFrame=()=>{};
  });
  await context.addInitScript(setup);
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout});
  return {context,page};
}
async function waitState(page,state){
  await page.waitForFunction(s=>window.AquaBoot&&AquaBoot.state===s,state,{polling:100,timeout});
}
async function drawFrames(page,count=1){
  return page.evaluate(n=>{
    for(let i=0;i<n;i++) frame(lastT+16.7);
    return {state:AquaBoot.state,error:gl.getError(),detail:document.getElementById('err').textContent};
  },count);
}

(async()=>{
  const browser=await chromium.launch(launch);
  try{
    {
      const {context,page}=await makePage(browser,{},()=>{
        window.testFB=0;window.testUploads=[];
        const fb=WebGL2RenderingContext.prototype.createFramebuffer,tx=WebGL2RenderingContext.prototype.texImage2D;
        WebGL2RenderingContext.prototype.createFramebuffer=function(){window.testFB++;return fb.call(this);};
        WebGL2RenderingContext.prototype.texImage2D=function(...args){
          const source=args[5];
          if(args.length===6&&source&&(source instanceof HTMLImageElement||source instanceof HTMLCanvasElement)) testUploads.push([source.width,source.height]);
          return tx.apply(this,args);
        };
      });
      await waitState(page,'running');
      let result=await page.evaluate(()=>({fb:testFB,balls:balls.length,attrs:gl.getContextAttributes(),islands:islands.active}));
      assert.equal(result.fb,5,'startup allocates each framebuffer just once');
      assert.equal(result.balls,3);assert.equal(result.islands,false);
      assert.equal(result.attrs.depth,false);assert.equal(result.attrs.antialias,false);
      assert.equal((await page.evaluate(()=>testUploads.length)),0,'unused island textures are lazy');
      await page.evaluate(()=>{
        window.motionDraws=0;const old=drawMotionVectors;
        drawMotionVectors=function(){window.motionDraws++;return old();};
      });
      result=await drawFrames(page,2);
      assert.equal(result.state,'running',result.detail);assert.equal(result.error,0);
      assert.ok(await page.evaluate(()=>motionDraws>0),'depth-aware motion blur still renders');
      await page.evaluate(()=>{userSet('islands',true);userSet('hq',true);userSet('quality','low');Aqua.weather('storm');});
      await page.waitForFunction(()=>testUploads.length===5,null,{polling:100,timeout});
      result=await page.evaluate(()=>({seed:S.islandSeed,trees:islands.treeCount,land:islands.land.map(i=>[i.x,i.z]),refl:[rW,rH],size:[canvas.width,canvas.height],error:gl.getError()}));
      assert.ok(result.trees>10);assert.equal(result.error,0);assert.deepEqual(result.refl,result.size);
      const seed=result.seed,land=result.land;
      result=await drawFrames(page,2);assert.equal(result.state,'running',result.detail);assert.equal(result.error,0);
      assert.equal(await page.evaluate(()=>new Promise(resolve=>screenshot(resolve))),true);
      await page.waitForFunction(()=>{
        const saved=JSON.parse(localStorage.getItem('aqua.settings.v2')||'null');
        return saved&&saved.islands&&saved.hq&&saved.weather==='storm';
      },null,{polling:100,timeout});
      await page.reload({waitUntil:'domcontentloaded',timeout});await waitState(page,'running');
      result=await page.evaluate(()=>({seed:S.islandSeed,land:islands.land.map(i=>[i.x,i.z]),hq:hqMode,weather:S.weather,fb:testFB,error:gl.getError()}));
      assert.equal(result.seed,seed);assert.deepEqual(result.land,land);assert.equal(result.hq,true);
      assert.equal(result.weather,'storm');assert.equal(result.fb,5);assert.equal(result.error,0);
      result=await drawFrames(page);assert.equal(result.state,'running',result.detail);assert.equal(result.error,0);
      console.log('PASS: ocean, islands, blur, screenshots, weather and saved settings');
      await context.close();
    }
    {
      const {context,page}=await makePage(browser,{},()=>{
        const original=WebGL2RenderingContext.prototype.shaderSource;
        WebGL2RenderingContext.prototype.shaderSource=function(shader,source){
          if(source.includes('uRock,uGrass,uSand,uTalus')) source='#version 300 es\ninvalid shader';
          return original.call(this,shader,source);
        };
      });
      await waitState(page,'failed');
      const result=await page.evaluate(()=>({detail:document.getElementById('err').textContent,
        scripts:[...document.scripts].map(s=>s.src),frames:testFrames.length}));
      assert.match(result.detail,/island fragment shader/);
      assert.ok(!result.scripts.some(s=>s.endsWith('/js/render.js')));
      assert.equal(result.frames,0);
      await page.waitForTimeout(500);assert.equal(await page.locator('#err').textContent(),result.detail);
      console.log('PASS: real shader compile failure stops before rendering');
      await context.close();
    }
    {
      const {context,page}=await makePage(browser,{},()=>{
        const original=WebGL2RenderingContext.prototype.checkFramebufferStatus;
        window.testChecks=0;
        WebGL2RenderingContext.prototype.checkFramebufferStatus=function(target){
          return ++testChecks===1?this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:original.call(this,target);
        };
      });
      await waitState(page,'running');
      const result=await page.evaluate(()=>({checks:testChecks,size:[canvas.width,canvas.height],error:gl.getError()}));
      assert.equal(result.checks,6);assert.ok(result.size[0]<640);assert.equal(result.error,0);
      console.log('PASS: incomplete framebuffer retries at a smaller size');
      await context.close();
    }
    {
      const {context,page}=await makePage(browser);
      let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame()) navigations++;});
      await waitState(page,'running');
      await page.evaluate(()=>{window.testLoss=gl.getExtension('WEBGL_lose_context');if(!testLoss)throw new Error('WEBGL_lose_context is unavailable');testLoss.loseContext();});
      await waitState(page,'lost');
      const before=await page.evaluate(()=>({frames:testFrames.length,frameN}));
      await page.waitForTimeout(1000);
      assert.deepEqual(await page.evaluate(()=>({frames:testFrames.length,frameN})),before);
      await page.evaluate(()=>testLoss.restoreContext());
      await page.waitForFunction(()=>AquaBoot&&AquaBoot.state==='running'&&AquaBoot.safeMode,null,{polling:100,timeout});
      assert.equal(navigations,1,'only one automatic reload');
      await page.evaluate(()=>{window.testLoss2=gl.getExtension('WEBGL_lose_context');testLoss2.loseContext();});
      await waitState(page,'lost');await page.waitForTimeout(1000);await page.evaluate(()=>testLoss2.restoreContext());
      await page.waitForFunction(()=>document.getElementById('failTitle').textContent==='Graphics restored',null,{polling:100,timeout});
      assert.equal(navigations,1,'a second loss waits for manual recovery');
      console.log('PASS: context loss stops frames and recovery is bounded');
      await context.close();
    }
    {
      const {context,page}=await makePage(browser);
      let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame()) navigations++;});
      await waitState(page,'running');
      await page.evaluate(()=>{const ext=gl.getExtension('WEBGL_lose_context');if(!ext)throw new Error('WEBGL_lose_context is unavailable');ext.loseContext();});
      await waitState(page,'lost');
      /* Do not restore the context: the visible-tab timeout must recover. */
      await page.waitForFunction(()=>AquaBoot&&AquaBoot.state==='running'&&AquaBoot.safeMode,null,{polling:100,timeout});
      assert.equal(navigations,1);
      console.log('PASS: recovery when the browser never restores a lost context');
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
      await waitState(page,'running');
      const size=await page.evaluate(()=>({safe:AquaBoot.safeMode,w:canvas.width,h:canvas.height,limit:targetPixels}));
      assert.equal(size.safe,true);assert.ok(size.w*size.h<=size.limit);
      await page.evaluate(()=>document.body.classList.remove('booting'));
      await page.locator('#bIsland').tap();
      await page.waitForFunction(()=>islands.active&&islands.treeCount>10&&testUploads.length===5,null,{polling:100,timeout});
      assert.ok(await page.evaluate(()=>testUploads.every(([w,h])=>w<=512&&h<=512)));
      const result=await drawFrames(page);assert.equal(result.state,'running',result.detail);assert.equal(result.error,0);
      await page.locator('#bSet').tap();assert.ok(await page.locator('#panel').evaluate(el=>el.classList.contains('open')));
      await page.evaluate(()=>showTab('system'));
      assert.match(await page.locator('#pBody').innerText(),/Low-memory mode is active/);
      console.log('PASS: mobile touch, low-memory island textures and settings');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
