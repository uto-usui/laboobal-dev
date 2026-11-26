"""Run in venv-geo: real Chrome/Metal, local demo, per-candidate 5s samples."""
import asyncio,json,time,sys,os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('.work/toy-character/display').resolve()
BASE=os.environ.get('TOY_WEB_URL','http://localhost:4410/toy-figure/')
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

def log(s):
    with (OUT/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')

async def instrument(route):
    r=await route.fetch();s=await r.text()
    s=s.replace('loop((dt, elapsed) => {','window.__toy = { renderer, scene, camera, character, materials, irisMesh, head, neck, upper, chest, setFrame, blink: null, still: false, state: () => ({ gazeX,gazeY,headX,headY,bodyX,time,lastFrame }) };\nloop((dt, elapsed) => {')
    s=s.replace('const sinceBlink = time - blinkAt','const sinceBlink = window.__toy.blink ?? time - blinkAt')
    s=s.replace('const breath = reduced ?', 'const breath = (reduced || window.__toy.still) ?')
    await route.fulfill(response=r,body=s)

async def run():
    levels=[int(x) for x in sys.argv[1:] if x.isdigit()] or [100000,200000,400000]
    capture='--capture' in sys.argv
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=CHROME,headless=True,args=['--enable-gpu','--use-angle=metal'])
        browser_cdp=await browser.new_browser_cdp_session();gpu=await browser_cdp.send('SystemInfo.getInfo')
        reports={'browser':browser.version,'gpu':gpu['gpu'],'conditions':{'duration_ms':5000,'mobile':'390x844 DPR3, CDP CPU rate4; same Mac GPU, no GPU/network throttling','desktop':'1440x900 DPR2','load':'fresh context, local HTTP; no network throttling'},'runs':[]}
        for level in levels:
            dest=OUT/str(level)
            for name,w,h,dpr,rate in [('desktop',1440,900,2,1),('mobile',390,844,3,4)]:
                context=await browser.new_context(viewport={'width':w,'height':h},device_scale_factor=dpr)
                await context.route('**/src/demos/toy-figure/main.ts*',instrument)
                async def asset(route):
                    if 'import' in route.request.url:await route.continue_()
                    else:await route.fulfill(path=dest/'character.glb',content_type='model/gltf-binary')
                if '--installed' not in sys.argv:await context.route('**/character.glb*',asset)
                page=await context.new_page();errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGEERROR',e,flush=True)))
                cdp=await context.new_cdp_session(page);await cdp.send('Emulation.setCPUThrottlingRate',{'rate':rate})
                await page.goto(BASE);await page.wait_for_function("window.__toy && document.querySelector('.stage').getAttribute('aria-busy')==='false'",timeout=180000)
                await page.mouse.move(w/2,h/2);await page.wait_for_timeout(1500)
                measured=await page.evaluate('''() => new Promise(resolve => {
                    const t=window.__toy, render=t.renderer.render.bind(t.renderer), deltas=[];
                    let last=performance.now(),start=last;
                    t.renderer.render=(...args)=>{const now=performance.now();deltas.push(now-last);last=now;return render(...args)};
                    setTimeout(()=>{t.renderer.render=render;deltas.shift();deltas.sort((a,b)=>a-b);
                        const gl=t.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
                        resolve({frames:deltas.length,medianMs:deltas[Math.floor(deltas.length*.5)],p95Ms:deltas[Math.floor(deltas.length*.95)],elapsedMs:performance.now()-start,
                        loadMs:performance.getEntriesByName('toy-figure-load')[0].duration,navigationToFirstFrameMs:performance.getEntriesByName('toy-figure-first-frame')[0].startTime,
                        dpr:devicePixelRatio,canvas:[gl.drawingBufferWidth,gl.drawingBufferHeight],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,
                        renderInfo:t.renderer.info.render,state:t.state()});},5000);
                })''')
                if not measured['gpu'] or 'SwiftShader' in measured['gpu']:raise RuntimeError('Hardware GPU not confirmed')
                reports['runs'].append({'level':level,'device':name,**measured,'errors':errors})
                if name=='desktop':
                    await page.evaluate('window.__toy.blink=-1;window.__toy.still=true')
                    await page.mouse.move(w/2,h/2);await page.wait_for_timeout(1500)
                    await page.screenshot(path=dest/'web-desktop.png')
                    for part,clip in [('face',{'x':560,'y':80,'width':320,'height':260}),('body',{'x':520,'y':320,'width':400,'height':380})]:
                        await page.screenshot(path=dest/f'web-{part}.png',clip=clip)
                    if capture:
                        poses={}
                        for corner,x,y in [('left-up',1,1),('right-up',w-1,1),('left-down',1,h-1),('right-down',w-1,h-1)]:
                            await page.mouse.move(x,y);await page.wait_for_timeout(2000)
                            await page.screenshot(path=OUT/f'web-follow-{corner}.png')
                            await page.screenshot(path=OUT/f'web-neck-{corner}.png',clip={'x':580,'y':235,'width':280,'height':190})
                            poses[corner]=await page.evaluate('window.__toy.state()')
                        await page.mouse.move(w/2,h/2);await page.wait_for_timeout(1600)
                        await page.evaluate('window.__toy.blink=0.02');await page.wait_for_timeout(100)
                        await page.screenshot(path=OUT/'web-blink.png')
                        await page.screenshot(path=OUT/'web-blink-face.png',clip={'x':560,'y':80,'width':320,'height':260})
                        (OUT/'web-poses.json').write_text(json.dumps(poses,indent=2))
                        # Natural blink sequence: each state must occur without a capture override.
                        await page.evaluate('window.__toy.blink=null;window.__toy.still=false')
                        sequence=await page.evaluate('''() => new Promise(resolve=>{const a=[],t=performance.now();let last=-1;const tick=()=>{let f=window.__toy.state().lastFrame;if(f!==last){a.push({frame:f,ms:performance.now()-t});last=f}if(performance.now()-t>7000)resolve(a);else requestAnimationFrame(tick)};tick()})''')
                        (OUT/'web-blink-sequence.json').write_text(json.dumps(sequence,indent=2))
                else:await page.screenshot(path=dest/'web-mobile.png')
                await context.close()
                (OUT/('web-selected.json' if capture else 'web-metrics.json')).write_text(json.dumps(reports,indent=2))
                log(f'Web {level} {name}: 中央 {measured["medianMs"]:.2f}ms / P95 {measured["p95Ms"]:.2f}ms / 読込開始から初描画 {measured["loadMs"]:.1f}ms / {measured["gpu"]}')
                print(reports['runs'][-1],flush=True)
        await browser.close()

asyncio.run(run())
