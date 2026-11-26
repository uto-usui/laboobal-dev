"""Capture unmodified demo lighting/camera, replacing models only in this context."""
import asyncio, hashlib, json, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.work/toy-character'
OUT = Path(os.environ.get('TOY_EDGES_OUT', WORK / 'edges')).resolve()
CASES = {
    'a': WORK / 'img3d/out/v4-noglasses.glb',
    'b': WORK / 'display/400000/character.glb',
    'c': WORK / 'display2/character.glb',
    'd': WORK / 'texture/2/character.glb',
    'e': WORK / 'texture/3/character.glb',
}

async def instrument(route):
    response = await route.fetch()
    source = await response.text()
    source = source.replace('loop((dt, elapsed) => {', '''window.__edges = {renderer,scene,camera,character,loader,THREE,paused:false};
loop((dt, elapsed) => {
if(window.__edges.paused) return;''')
    source = source.replace('const target = pointerOrWander(pointer, elapsed)', 'const target = {x:0,y:0}')
    source = source.replace('const breath = reduced ?', 'const breath = true ?')
    source = source.replace('const sinceBlink = time - blinkAt', 'const sinceBlink = -1')
    await route.fulfill(response=response, body=source)

async def run():
    OUT.mkdir(parents=True, exist_ok=True)
    labels = os.environ.get('EDGES_CANDIDATES', 'a,b,c,d,e').split(',')
    report = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless=True, args=['--enable-gpu', '--use-angle=metal'])
        context = await browser.new_context(viewport={'width':1440,'height':900}, device_scale_factor=2)
        await context.route('**/src/demos/toy-figure/main.ts*', instrument)
        page = await context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.goto('http://localhost:4410/toy-figure/')
        await page.wait_for_function("window.__edges && document.querySelector('.stage').getAttribute('aria-busy')==='false'", timeout=180000)
        await page.evaluate('window.__edges.paused=true;window.__edges.character.visible=false')
        camera = await page.evaluate('''() => {const c=window.__edges.camera;return {position:c.position.toArray(),quaternion:c.quaternion.toArray(),fov:c.fov,near:c.near,far:c.far,aspect:c.aspect}}''')
        for label in labels:
            file = CASES.get(label, OUT / f'character-{label}.glb')
            dest = OUT / label
            dest.mkdir(exist_ok=True)
            url = f'http://localhost:4410/__edges_model_{label}.glb'
            async def asset(route):
                await route.fulfill(path=file, content_type='model/gltf-binary')
            await context.route(url, asset)
            state = await page.evaluate('''async ({url,original}) => {
                const t=window.__edges,T=t.THREE;
                if(t.current) {t.scene.remove(t.current);t.current.traverse(o=>{if(o.isMesh)o.geometry.dispose()});}
                t.current=(await t.loader.loadAsync(url)).scene;
                if(original) {
                    const b=new T.Box3().setFromObject(t.current),s=1/(b.max.y-b.min.y),c=b.getCenter(new T.Vector3());
                    t.current.scale.setScalar(s);t.current.position.set(-c.x*s,-b.min.y*s,-c.z*s);
                }
                t.current.traverse(o=>{if(!o.isMesh)return;o.castShadow=!o.name.startsWith('eye_')&&o.name!=='glasses_lens';o.receiveShadow=true;
                    for(const m of Array.isArray(o.material)?o.material:[o.material])if(!m.name.startsWith('eye_'))m.aoMapIntensity=0;
                });
                // Eye rendering is copied from the demo's material setup.
                const mats=new Map();t.current.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])mats.set(m.name,m)});
                const iris=mats.get('eye_iris'),lens=mats.get('glasses_lens');
                if(lens){lens.transmission=1;lens.opacity=1;lens.thickness=0;lens.transparent=false;}
                if(iris){iris.transparent=false;iris.alphaTest=.5;iris.polygonOffset=true;iris.polygonOffsetFactor=-1;iris.polygonOffsetUnits=-1;iris.alphaMap=iris.aoMap.clone();
                    iris.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <alphamap_fragment>','#ifdef USE_ALPHAMAP\\n diffuseColor.a *= texture2D(alphaMap, vAlphaMapUv).r;\\n#endif')};iris.customProgramCacheKey=()=> 'toy-figure-aperture-r';iris.needsUpdate=true;}
                t.scene.add(t.current);t.current.updateMatrixWorld(true);t.camera.clearViewOffset();t.renderer.render(t.scene,t.camera);
                const gl=t.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');
                return {gpu:gl.getParameter(e.UNMASKED_RENDERER_WEBGL),canvas:[gl.drawingBufferWidth,gl.drawingBufferHeight],triangles:t.renderer.info.render.triangles,toneMapping:t.renderer.toneMapping,exposure:t.renderer.toneMappingExposure};
            }''', {'url':url,'original':label=='a'})
            if 'SwiftShader' in state['gpu']:
                raise RuntimeError('Hardware GPU required')
            await page.screenshot(path=dest/'full.png')
            await page.screenshot(path=dest/'face.png', clip={'x':560,'y':80,'width':320,'height':260})
            await page.evaluate('''() => {const t=window.__edges;t.camera.setViewOffset(1440,900,500,365,440,275);t.renderer.render(t.scene,t.camera)}''')
            await page.screenshot(path=dest/'body.png')
            # Keep an unlit control, without changing the requested lit capture.
            await page.evaluate('''() => {const t=window.__edges,T=t.THREE;t.restore=[];t.current.traverse(o=>{if(!o.isMesh)return;t.restore.push([o,o.material]);o.material=(Array.isArray(o.material)?o.material:[o.material]).map(m=>new T.MeshBasicMaterial({map:m.map,color:m.color,side:m.side}));if(o.material.length===1)o.material=o.material[0]});t.renderer.render(t.scene,t.camera)}''')
            await page.screenshot(path=dest/'body-unlit.png')
            await page.evaluate('''() => {for(const [o,m] of window.__edges.restore)o.material=m}''')
            row = {'case':label,'source':str(file.relative_to(ROOT)), 'sha256':hashlib.sha256(file.read_bytes()).hexdigest(), 'bytes':file.stat().st_size, 'errors':errors.copy(), **state}
            report.append(row)
            print(json.dumps(row), flush=True)
        record={'browser':browser.version,'camera':camera,'viewport':[1440,900],'dpr':2,'zoom':[1440,900,500,365,440,275],'runs':report}
        (OUT/('web-'+ '-'.join(labels)+'.json')).write_text(json.dumps(record,indent=2)+'\n')
        await browser.close()

if __name__=='__main__':asyncio.run(run())
