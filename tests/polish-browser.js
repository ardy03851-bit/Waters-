'use strict';
/* Additional WebGL/interaction regressions against a running static server.
   See README.md for the Playwright/Chromium setup. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const url=process.env.AQUA_URL||'http://127.0.0.1:8000/';
const args=(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean);
const launch={headless:true,args};
if(process.env.CHROMIUM_PATH) launch.executablePath=process.env.CHROMIUM_PATH;
const timeout=90000;

async function makePage(browser,setup=()=>{},automaticFrames=false){
  const context=await browser.newContext({viewport:{width:640,height:360},acceptDownloads:true});
  if(!automaticFrames) await context.addInitScript(()=>{
    window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};
  });
  await context.addInitScript(setup);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout});
  await page.waitForFunction(()=>window.AquaBoot&&AquaBoot.state==='running',null,{polling:100,timeout});
  await page.evaluate(()=>document.body.classList.remove('booting'));
  return {context,page,errors};
}

(async()=>{
  const browser=await chromium.launch(launch);
  try{
    {
      const {context,page,errors}=await makePage(browser);
      await page.evaluate(()=>{clearAll();$('bRain').click();$('bRain').click();});
      await page.waitForTimeout(250);
      assert.ok(await page.evaluate(()=>balls.length>=2),'both rain bursts have started');
      await page.evaluate(()=>Aqua.clear());
      await page.waitForTimeout(1150);
      assert.deepEqual(await page.evaluate(()=>({balls:balls.length,pending:rainTimers.size})),{balls:0,pending:0},'Clear cancels every pending burst');
      await page.evaluate(()=>$('bRain').click());
      await page.waitForTimeout(1150);
      assert.deepEqual(await page.evaluate(()=>({balls:balls.length,pending:rainTimers.size})),{balls:10,pending:0},'another rain works normally after Clear');
      assert.deepEqual(errors,[]);
      console.log('PASS: Clear cancels overlapping ball-rain timers without breaking subsequent rain');
      await context.close();
    }
    {
      const {context,page,errors}=await makePage(browser,()=>{
        window.testMedia={streams:[],recorders:[],blobs:[],downloads:[],support:'webm',defaultMime:'video/webm',
          failCapture:false,failConstructor:false,failPreferredOptions:false,failStart:false,failStop:false};
        HTMLCanvasElement.prototype.captureStream=function(){
          if(testMedia.failCapture) throw new Error('capture failed');
          const track={stops:0,stop(){this.stops++;}},stream={track,getTracks(){return [track];}};
          testMedia.streams.push(stream);return stream;
        };
        window.MediaRecorder=class{
          static isTypeSupported(type){return testMedia.support==='mp4'?type==='video/mp4':type==='video/webm;codecs=vp9';}
          constructor(stream,options){
            if(testMedia.failConstructor||(options&&testMedia.failPreferredOptions)) throw new Error('constructor failed');
            this.stream=stream;this.mimeType=options&&options.mimeType||testMedia.defaultMime;this.state='inactive';
            testMedia.recorders.push(this);
          }
          start(){if(testMedia.failStart) throw new Error('start failed');this.state='recording';}
          stop(){if(testMedia.failStop) throw new Error('stop failed');this.state='inactive';}
          data(text){if(this.ondataavailable) this.ondataavailable({data:new Blob([text],{type:this.mimeType})});}
          finish(text){if(text) this.data(text);if(this.onstop) this.onstop();}
          error(){if(this.onerror) this.onerror({error:new Error('encoder failed')});}
        };
        URL.createObjectURL=blob=>{testMedia.blobs.push({size:blob.size,type:blob.type});return 'blob:test';};
        URL.revokeObjectURL=()=>{};
        HTMLAnchorElement.prototype.click=function(){testMedia.downloads.push(this.download);};
      });
      let state=await page.evaluate(()=>{
        Aqua.record();Aqua.record();Aqua.record();
        return {recorders:testMedia.recorders.length,phase:$('recBtn').textContent,disabled:$('recBtn').disabled,
          cursor:getComputedStyle($('recBtn')).cursor,opacity:getComputedStyle($('recBtn')).opacity};
      });
      assert.deepEqual(state,{recorders:1,phase:'Finishing…',disabled:true,cursor:'wait',opacity:'0.7'},'a second recording cannot start before final data is delivered');
      state=await page.evaluate(()=>{
        testMedia.recorders[0].data('one');testMedia.recorders[0].finish('two');
        return {track:testMedia.streams[0].track.stops,blob:testMedia.blobs[0],download:testMedia.downloads[0],
          label:$('recBtn').textContent,pressed:$('recBtn').getAttribute('aria-pressed'),badge:document.body.classList.contains('recording')};
      });
      assert.equal(state.track,1);assert.equal(state.blob.size,6);assert.match(state.blob.type,/video\/webm/);
      assert.match(state.download,/\.webm$/);assert.equal(state.label,'Record video');assert.equal(state.pressed,'false');assert.equal(state.badge,false);
      state=await page.evaluate(()=>{
        testMedia.support='mp4';Aqua.record();const rec=testMedia.recorders[1];rec.data('mp4');Aqua.record();rec.finish('!');
        return {blob:testMedia.blobs[1],download:testMedia.downloads[1],track:testMedia.streams[1].track.stops};
      });
      assert.deepEqual(state.blob,{size:4,type:'video/mp4'});assert.match(state.download,/\.mp4$/);assert.equal(state.track,1);
      state=await page.evaluate(()=>{
        testMedia.failConstructor=true;Aqua.record();testMedia.failConstructor=false;
        testMedia.failStart=true;Aqua.record();testMedia.failStart=false;
        testMedia.failCapture=true;Aqua.record();testMedia.failCapture=false;
        return {tracks:testMedia.streams.map(s=>s.track.stops),phase:$('recBtn').textContent,boot:AquaBoot.state,active:!!recording};
      });
      assert.deepEqual(state.tracks.slice(2),[1,1],'constructor and start failures release their streams');
      assert.equal(state.phase,'Record video');assert.equal(state.boot,'running');assert.equal(state.active,false);
      state=await page.evaluate(()=>{
        delete MediaRecorder.isTypeSupported;testMedia.defaultMime='video/mp4';Aqua.record();
        const rec=testMedia.recorders[testMedia.recorders.length-1];rec.data('partial');rec.error();rec.finish('!');
        return {blob:testMedia.blobs[testMedia.blobs.length-1],download:testMedia.downloads[testMedia.downloads.length-1],
          track:testMedia.streams[testMedia.streams.length-1].track.stops,phase:$('recBtn').textContent,boot:AquaBoot.state};
      });
      assert.deepEqual(state.blob,{size:8,type:'video/mp4'});assert.match(state.download,/\.mp4$/);
      assert.ok(state.track>=1);assert.equal(state.phase,'Record video');assert.equal(state.boot,'running');
      state=await page.evaluate(()=>{
        testMedia.failPreferredOptions=true;testMedia.failStop=true;Aqua.record();
        const rec=testMedia.recorders[testMedia.recorders.length-1];rec.data('partial');Aqua.record();
        testMedia.failPreferredOptions=false;testMedia.failStop=false;
        return {track:testMedia.streams[testMedia.streams.length-1].track.stops,active:!!recording,
          blob:testMedia.blobs[testMedia.blobs.length-1],phase:$('recBtn').textContent};
      });
      assert.ok(state.track>=1);assert.equal(state.active,false);assert.deepEqual(state.blob,{size:7,type:'video/mp4'});
      assert.equal(state.phase,'Record video','stop failures also release the capture and save available data');
      await page.evaluate(()=>{Aqua.record();const rec=testMedia.recorders[testMedia.recorders.length-1];rec.data('salvage');rec.error();});
      await page.waitForTimeout(5200);
      state=await page.evaluate(()=>({active:!!recording,phase:$('recBtn').textContent,blob:testMedia.blobs[testMedia.blobs.length-1]}));
      assert.deepEqual(state,{active:false,phase:'Record video',blob:{size:7,type:'video/mp4'}},'a broken recorder that never emits stop cannot trap the UI');
      assert.deepEqual(errors,[]);
      console.log('PASS: recordings isolate chunks, serialize stop/start, release tracks and handle errors and MP4 fallback');
      await context.close();
    }
    {
      const {context,page,errors}=await makePage(browser,()=>{
        window.testRipUploads=[];
        const original=WebGL2RenderingContext.prototype.texSubImage2D;
        WebGL2RenderingContext.prototype.texSubImage2D=function(...args){
          if(args[4]===192&&args[5]===192) testRipUploads.push(Array.from(args[8]));
          return original.apply(this,args);
        };
        HTMLAnchorElement.prototype.click=function(){};
      });
      let state=await page.evaluate(()=>{
        togglePause();for(let i=0;i<3;i++) frame(lastT+16.7);
        return {uploads:testRipUploads.length,boot:AquaBoot.state,error:gl.getError()};
      });
      assert.deepEqual(state,{uploads:0,boot:'running',error:0},'paused frames reuse the already-flat texture');
      state=await page.evaluate(()=>{
        addRipple(0,0,0.8,0.1);frame(lastT+16.7);frame(lastT+16.7);
        return {uploads:testRipUploads.length,nonzero:testRipUploads[0].some(x=>x!==0),error:gl.getError()};
      });
      assert.deepEqual(state,{uploads:1,nonzero:true,error:0},'a paused disturbance uploads once');
      state=await page.evaluate(async()=>{
        addFoam(0,0,0.8,0.3);const shot=await new Promise(resolve=>screenshot(resolve));
        return {shot,uploads:testRipUploads.length,foam:testRipUploads[1].some((x,i)=>i%2===1&&x>0),error:gl.getError()};
      });
      assert.deepEqual(state,{shot:true,uploads:2,foam:true,error:0},'screenshots synchronize new paused foam before rendering');
      state=await page.evaluate(async()=>{
        const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
        URL.createObjectURL=()=>{throw new Error('blocked');};
        const blockedUrl=await new Promise(resolve=>screenshot(resolve));URL.createObjectURL=create;
        HTMLAnchorElement.prototype.click=()=>{throw new Error('blocked');};
        const blockedClick=await new Promise(resolve=>screenshot(resolve));HTMLAnchorElement.prototype.click=click;
        return {blockedUrl,blockedClick,boot:AquaBoot.state,links:document.querySelectorAll('a[download]').length,error:gl.getError()};
      });
      assert.deepEqual(state,{blockedUrl:false,blockedClick:false,boot:'running',links:0,error:0},'blocked screenshot downloads fail gracefully and remove temporary links');
      state=await page.evaluate(()=>{
        const hook=()=>addRipple(0,0,0.5,0.05);Hooks.on('frame',hook);frame(lastT+16.7);Hooks.off('frame',hook);
        return {uploads:testRipUploads.length,error:gl.getError()};
      });
      assert.deepEqual(state,{uploads:3,error:0},'frame-hook disturbances appear in the same rendered frame');
      await page.evaluate(()=>{userSet('ship',true);});
      await page.waitForFunction(()=>ship.status==='ready',null,{polling:100,timeout});
      state=await page.evaluate(()=>{
        explore.active=true;explore.mode='swim';explore.pos=[ship.x+15,-1,ship.z];explore.yaw=0;explore.pitch=0;
        const original=cameraSubmerge;let count=0;cameraSubmerge=()=>{count++;return original();};
        render();cameraSubmerge=original;
        return {count,submerge:original(),error:gl.getError()};
      });
      assert.equal(state.count,1,'one exact underwater sample is shared by all passes');
      assert.ok(state.submerge>0);assert.equal(state.error,0);assert.deepEqual(errors,[]);
      console.log('PASS: paused and hook-driven ripples stay synchronized; underwater passes share one surface sample');
      await context.close();
    }
    {
      const {context,page,errors}=await makePage(browser);
      await page.evaluate(()=>{userSet('islands',true);enterSailing();});
      await page.waitForFunction(()=>ship.status==='ready'&&explore.mode==='helm',null,{polling:100,timeout});
      let state=await page.evaluate(()=>{
        let calls=0;const original=surfH;surfH=(...args)=>{calls++;return original(...args);};
        const observer=new MutationObserver(()=>{});observer.observe($('exploreHUD'),{subtree:true,attributes:true,childList:true,characterData:true});
        for(let i=0;i<10;i++) updateExploreHUD();
        const changes=observer.takeRecords().length;observer.disconnect();surfH=original;
        openVoyageChart();window.testFirstLand=$('chartLand').firstChild;
        const paths=$('chartLand').children.length;closeVoyageChart();openVoyageChart();
        return {calls,changes,paths,reused:$('chartLand').firstChild===testFirstLand,error:gl.getError()};
      });
      assert.deepEqual(state,{calls:0,changes:0,paths:5,reused:true,error:0},'unchanged helm and chart reuse their work');
      state=await page.evaluate(()=>{
        const first=testFirstLand.getAttribute('d');generateIslands(987654,currentIslandOptions());
        const changed=$('chartLand').firstChild!==testFirstLand&&$('chartLand').firstChild.getAttribute('d')!==first;
        const count=$('chartLand').children.length;userSet('islands',false);
        return {changed,count,removed:$('chartLand').children.length,error:gl.getError()};
      });
      assert.deepEqual(state,{changed:true,count:5,removed:0,error:0},'regeneration and removal invalidate the cached coast');
      state=await page.evaluate(()=>{
        closeVoyageChart();leaveHelm();const deck={label:$('bBoard').textContent,helm:$('bHelm').textContent,aria:exploreButtons[0].getAttribute('aria-label')};
        boardOrLeave();const water={label:$('bBoard').textContent,hidden:$('bHelm').hidden,aria:exploreButtons[0].getAttribute('aria-label')};
        return {deck,water,error:gl.getError()};
      });
      assert.deepEqual(state.deck,{label:'Leave deck',helm:'Take helm',aria:'Move forward'});
      assert.deepEqual(state.water,{label:'Board',hidden:true,aria:'Move forward'});assert.equal(state.error,0);
      assert.deepEqual(errors,[]);
      console.log('PASS: chart cache invalidates on coast changes and helm/deck/swim controls remain accessible');
      await context.close();
    }
    {
      /* CaptureStream needs real compositor frames rather than the manual
         frame stub used by the deterministic checks above. */
      const {context,page,errors}=await makePage(browser,()=>{},true);
      const supported=await page.evaluate(()=>!!window.MediaRecorder&&!!canvas.captureStream);
      if(supported){
        await page.evaluate(()=>{
          userSet('quality','low');userSet('motionBlur',false);
          const capture=canvas.captureStream.bind(canvas),create=URL.createObjectURL.bind(URL);
          canvas.captureStream=(...args)=>{const stream=capture(...args);window.testNativeTrack=stream.getTracks()[0];return stream;};
          URL.createObjectURL=blob=>{window.testNativeBlob=blob;return create(blob);};
          toggleRecord();
        });
        assert.equal(await page.evaluate(()=>!!recording),true,'native recording starts');
        await page.waitForTimeout(1800);
        const downloaded=page.waitForEvent('download',{timeout:30000});
        await page.evaluate(()=>toggleRecord());
        const download=await downloaded;
        assert.match(download.suggestedFilename(),/\.(webm|mp4|mov|mkv|ogv)$/);
        const stream=await download.createReadStream();let bytes=0;
        for await(const chunk of stream) bytes+=chunk.length;
        assert.ok(bytes>100,'native recorder produced a nonempty video');
        assert.equal(await page.evaluate(()=>testNativeTrack.readyState),'ended','native capture track is stopped');
        const decoded=await page.evaluate(async()=>{
          const video=document.createElement('video'),url=URL.createObjectURL(testNativeBlob);
          video.preload='auto';video.muted=true;video.src=url;
          const result=await Promise.race([
            new Promise(resolve=>{video.onloadeddata=()=>resolve({ok:true,width:video.videoWidth,height:video.videoHeight});
              video.onerror=()=>resolve({ok:false,error:'video decode failed'});}),
            new Promise(resolve=>setTimeout(()=>resolve({ok:false,error:'video decode timed out'}),10000))
          ]);
          URL.revokeObjectURL(url);return result;
        });
        assert.equal(decoded.ok,true,decoded.error);assert.ok(decoded.width>0&&decoded.height>0,'the saved video decodes to a frame');
        assert.equal(await download.failure(),null);assert.deepEqual(errors,[]);
        console.log('PASS: native MediaRecorder saves a decodable video and releases its capture track');
      }else console.log('SKIP: native MediaRecorder is not available in this Chromium build');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
