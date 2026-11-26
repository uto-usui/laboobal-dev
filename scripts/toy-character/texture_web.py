"""Capture the actual Vite-served demo; swap only GLB HTTP responses."""
import asyncio,json,os,hashlib
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(os.environ.get('TOY_TEXTURE_OUT','.work/toy-character/texture')).resolve()
async def instrument(route):
 r=await route.fetch();s=await r.text()
 s=s.replace('loop((dt, elapsed) => {','window.__texture = {renderer,scene,camera,character,materials,setFrame};\nloop((dt, elapsed) => {')
 s=s.replace('const target = pointerOrWander(pointer, elapsed)','const target = {x:0,y:0}')
 s=s.replace('const breath = reduced ?', 'const breath = true ?')
 s=s.replace('const sinceBlink = time - blinkAt','const sinceBlink = -1')
 await route.fulfill(response=r,body=s)
async def run():
 report=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True,args=['--enable-gpu','--use-angle=metal'])
  candidates=['installed'] if os.environ.get('TEXTURE_INSTALLED') else os.environ.get('TEXTURE_CANDIDATES','0,1,2,3').split(',')
  for candidate in candidates:
   dest=OUT/candidate;dest.mkdir(exist_ok=True)
   context=await browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=2)
   await context.route('**/src/demos/toy-figure/main.ts*',instrument)
   assetfile=dest/'character.glb' if candidate!='installed' else Path('src/demos/toy-figure/assets/character.glb')
   async def asset(route):
    if 'import' in route.request.url:await route.continue_()
    else:await route.fulfill(path=assetfile,content_type='model/gltf-binary')
   if candidate!='installed':await context.route('**/character.glb*',asset)
   page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:4410/toy-figure/');await page.wait_for_function("window.__texture && document.querySelector('.stage').getAttribute('aria-busy')==='false'",timeout=180000);await page.wait_for_timeout(800)
   state=await page.evaluate('''() => {const t=window.__texture,g=t.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {gpu:g.getParameter(e.UNMASKED_RENDERER_WEBGL),dpr:devicePixelRatio,canvas:[g.drawingBufferWidth,g.drawingBufferHeight],triangles:t.renderer.info.render.triangles,toneMapping:t.renderer.toneMapping,exposure:t.renderer.toneMappingExposure}}''')
   if 'SwiftShader' in state['gpu']:raise RuntimeError('Expected Metal GPU')
   await page.screenshot(path=dest/'web-full.png')
   await page.screenshot(path=dest/'web-face.png',clip={'x':560,'y':80,'width':320,'height':260})
   await page.evaluate('window.__texture.camera.setViewOffset(1440,900,500,300,440,275)');await page.wait_for_timeout(300)
   await page.screenshot(path=dest/'web-sleeve.png')
   await page.evaluate('window.__texture.camera.clearViewOffset();window.__texture.character.rotation.y=Math.PI');await page.wait_for_timeout(300)
   await page.screenshot(path=dest/'web-back.png')
   report.append({'candidate':candidate,'sha256':hashlib.sha256(assetfile.read_bytes()).hexdigest(),'bytes':assetfile.stat().st_size,'errors':errors,**state});print(report[-1],flush=True)
   await context.close()
  (OUT/('web-installed.json' if candidates==['installed'] else 'web.json')).write_text(json.dumps({'browser':browser.version,'runs':report},indent=2));await browser.close()
asyncio.run(run())
