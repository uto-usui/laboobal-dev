"""Reproduce display's real Web capture, adding exact neck poses and comparisons."""
import asyncio,json,sys,os,time,hashlib
from pathlib import Path
from playwright.async_api import async_playwright
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
BASE=os.environ.get('TOY_WEB_URL','http://localhost:4410/toy-figure/')
OUT=Path('.work/toy-character/display2').resolve()
async def instrument(route):
 r=await route.fetch();s=await r.text()
 s=s.replace('loop((dt, elapsed) => {','window.__toy = { renderer, scene, camera, character, materials, irisMesh, head, neck, upper, chest, setFrame, blink: null, still: false, pose: null, state: () => ({ gazeX,gazeY,headX,headY,bodyX,time,lastFrame }) };\nloop((dt, elapsed) => {')
 s=s.replace('const sinceBlink = time - blinkAt','const sinceBlink = window.__toy.blink ?? time - blinkAt')
 s=s.replace('const breath = reduced ?', 'const breath = (reduced || window.__toy.still) ?')
 s=s.replace('renderer.render(scene, camera)', '''if(window.__toy.pose){const [y,p,b]=window.__toy.pose, rad=Math.PI/180;turn(neck,y*rad*.35,p*rad*.35);turn(head,y*rad*.65,p*rad*.65);turn(upper,b*rad/2);turn(chest,b*rad/2);}
renderer.render(scene, camera)''')
 await route.fulfill(response=r,body=s)
async def run():
 candidates=sys.argv[1:] or ['baseline','2048','3072']
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=CHROME,headless=True,args=['--enable-gpu','--use-angle=metal'])
  cdp=await browser.new_browser_cdp_session();gpu=await cdp.send('SystemInfo.getInfo');reports={'browser':browser.version,'gpu':gpu['gpu'],'conditions':{'desktop':'1440x900 DPR2','mobile':'390x844 DPR3 CPU4x, same Mac GPU, local HTTP, no network throttling','sample_ms':5000},'runs':[]}
  for candidate in candidates:
   dest=OUT/candidate;dest.mkdir(exist_ok=True)
   assetfile=OUT/candidate/'character.glb' if candidate!='baseline' else OUT.parent/'display/400000/character.glb'
   if candidate=='installed':assetfile=Path('src/demos/toy-figure/assets/character.glb').resolve()
   for name,w,h,dpr,rate in [('desktop',1440,900,2,1),('mobile',390,844,3,4)]:
    context=await browser.new_context(viewport={'width':w,'height':h},device_scale_factor=dpr)
    await context.route('**/src/demos/toy-figure/main.ts*',instrument)
    async def asset(route):
     if 'import' in route.request.url:await route.continue_()
     else:await route.fulfill(path=assetfile,content_type='model/gltf-binary')
    if candidate!='installed':await context.route('**/character.glb*',asset)
    page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    cd=await context.new_cdp_session(page);await cd.send('Emulation.setCPUThrottlingRate',{'rate':rate})
    await page.goto(BASE);await page.wait_for_function("window.__toy && document.querySelector('.stage').getAttribute('aria-busy')==='false'",timeout=180000)
    await page.mouse.move(w/2,h/2);await page.wait_for_timeout(1500)
    measured=await page.evaluate('''() => new Promise(resolve => {
     const t=window.__toy, render=t.renderer.render.bind(t.renderer), a=[];let last=performance.now();t.renderer.render=(...args)=>{let now=performance.now();a.push(now-last);last=now;return render(...args)};
     setTimeout(()=>{t.renderer.render=render;a.shift();a.sort((a,b)=>a-b);const gl=t.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');resolve({frames:a.length,medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],loadMs:performance.getEntriesByName('toy-figure-load')[0].duration,navigationToFirstFrameMs:performance.getEntriesByName('toy-figure-first-frame')[0].startTime,gpu:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):null,canvas:[gl.drawingBufferWidth,gl.drawingBufferHeight],renderInfo:t.renderer.info.render});},5000)})''')
    if not measured['gpu'] or 'SwiftShader' in measured['gpu']:raise RuntimeError('Hardware GPU not confirmed')
    reports['runs'].append({'candidate':candidate,'device':name,'asset_sha256':hashlib.sha256(assetfile.read_bytes()).hexdigest(),'asset_bytes':assetfile.stat().st_size,**measured,'errors':errors})
    await page.evaluate('window.__toy.still=true;window.__toy.blink=-1;window.__toy.pose=[0,0,0]');await page.wait_for_timeout(500)
    if name=='desktop':
     await page.screenshot(path=dest/'web-desktop.png')
     for part,clip in [('face',{'x':560,'y':80,'width':320,'height':260}),('body',{'x':520,'y':320,'width':400,'height':380}),('neck',{'x':580,'y':235,'width':280,'height':190})]:await page.screenshot(path=dest/f'web-{part}.png',clip=clip)
     poses={}
     for label,yaw,pitch,torso in [('rest',0,0,0),('left',-25,0,0),('right',25,0,0),('up',0,-10,0),('down',0,10,0),('left-up',-25,-10,-8),('right-up',25,-10,8),('left-down',-25,10,-8),('right-down',25,10,8)]:
      await page.evaluate('(pose)=>window.__toy.pose=pose',[yaw,pitch,torso]);await page.wait_for_timeout(150)
      await page.screenshot(path=dest/f'web-neck-{label}.png',clip={'x':560,'y':225,'width':320,'height':200})
      await page.screenshot(path=dest/f'web-pose-{label}.png')
      poses[label]=[yaw,pitch,torso]
     await page.evaluate('window.__toy.pose=null')
     for corner,x,y in [('left-up',1,1),('right-up',w-1,1),('left-down',1,h-1),('right-down',w-1,h-1)]:
      await page.mouse.move(x,y);await page.wait_for_timeout(2000);await page.screenshot(path=dest/f'web-follow-{corner}.png')
     (dest/'poses.json').write_text(json.dumps(poses,indent=2))
    else:await page.screenshot(path=dest/'web-mobile.png')
    await context.close();(OUT/'web-metrics.json').write_text(json.dumps(reports,indent=2));(dest/'web-metrics.json').write_text(json.dumps({**reports,'runs':[r for r in reports['runs'] if r['candidate']==candidate]},indent=2));print(reports['runs'][-1],flush=True)
  await browser.close()
asyncio.run(run())
