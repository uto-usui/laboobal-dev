from pathlib import Path
out=Path('.work/toy-character/savanna')
s=Path('.work/toy-character/city/scene.js').read_text()
s=s.replace("import { createWalker }", "import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'\nimport { createWalker }")
s=s.replace("const variant = params.get('variant') === 'A' ? 'A' : 'B'", "const variant = params.get('variant') === 'D' ? 'D' : 'S'")
s=s.replace("scene.background = new THREE.Color('#d9d8dc')", "scene.background = new THREE.Color(variant==='S'?'#dce0da':'#e3ded3')")
a=s.index('// All recolored parts');b=s.index("const gltf=await loader.loadAsync",a)
s=s[:a]+'''// Every landscape mesh uses the same matte atlas; skeleton-aware cloning keeps rigs intact.
let commonPaint
for(const model of models.values()) model.traverse(o=>{
 if(!o.isMesh)return
 o.castShadow=false;o.receiveShadow=false
 commonPaint??=o.material;o.material=commonPaint
})
const city=new THREE.Group();scene.add(city)
const placements=[]
const floor=.06
function place(id,r,depth,scale,rotation=0){
 const model=cloneSkeleton(models.get(id))
 model.scale.set(...(Array.isArray(scale)?scale:[scale,scale,scale]));model.rotation.y=rotation
 // r is across the camera; depth is away from it. The walking axis remains +Z.
 const x=r*Math.cos(Math.PI/6)-depth*.5,z=-r*.5-depth*Math.cos(Math.PI/6)
 const minY=manifest.assets.find(a=>a.id===id).bounds.min[1]
 model.position.set(x,floor-minY*model.scale.y,z)
 city.add(model)
 placements.push({id,position:model.position.toArray(),scale:model.scale.toArray(),rotationY:rotation,object:model})
 return model
}
if(variant==='S'){
 place('tree_plateau',-1.45,4.5,[3,.85,3],.4)
 place('tree_plateau',2.7,8.5,[2.6,.7,2.6],-.6)
 place('grass_large',-.72,1.9,1.1,.3)
 place('grass_large',.92,8,1.0,1.2)
 place('rock_largeA',-.95,5,.65,.2)
 place('rock_smallC',1.2,2.5,.85,.7)
 place('Zebra',2.25,24,.24,1.0)
}else{
 place('cactus_tall',-.88,5.8,1.1,.3)
 place('cactus_short',2.6,8,1.4,-.4)
 place('rock_largeA',-.65,6.3,.95,.5)
 place('rock_smallC',.85,6,.7,.7)
 place('rock_largeA',-2.5,8,.65,-.7)
 place('Elephant',2.25,24,.25,1.2)
}
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:manifest.palettes[variant][0],roughness:.95,metalness:0}))
ground.rotation.x=-Math.PI/2;ground.position.y=floor-.005;scene.add(ground)

'''+s[b:]
s=s.replace('const floor=.06\nconst groundShadow','const groundShadow')
s=s.replace('placements,pose:',"placements:placements.map(({object,...p})=>p),pose:")
pos=s.index('resize();addEventListener')
s=s[:pos]+'''window.cityReview.visibleObjects=()=>{
 city.updateMatrixWorld(true)
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse))
 return placements.filter(p=>frustum.intersectsBox(new THREE.Box3().setFromObject(p.object,true))).map(({object,...p})=>p)
}
window.cityReview.bodyOcclusions=()=>{
 const points=corners.concat(bounds.getCenter(new THREE.Vector3()))
 return points.flatMap(target=>new THREE.Raycaster(camera.position,target.clone().sub(camera.position).normalize(),0,camera.position.distanceTo(target)-.02).intersectObject(city,true).map(h=>h.object.name))
}
'''+s[pos:]
out.joinpath('scene.js').write_text(s)
h=Path('.work/toy-character/city/index.html').read_text().replace('街角の見本 A / B','乾いた野原の見本 S / D').replace('?variant=A\">A 配布の色','?variant=S\">S サバンナ').replace('?variant=B\">B 塗り直した色','?variant=D\">D 砂地')
out.joinpath('index.html').write_text(h)
