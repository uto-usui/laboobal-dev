import sys,json,os
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lowpoly import coords,triangles,write
from build import studio,render
OUT=Path(os.environ.get('TOY_DISPLAY2_OUT','.work/toy-character/display2'))
bpy.ops.wm.open_mainfile(filepath=str(Path('.work/toy-character/display/400000/character-display.blend').resolve()))
for name in ['body','head_face','hair']:
 o=bpy.data.objects[name];p=coords(o);f=triangles(o);uv=np.array([q.uv[:] for q in o.data.uv_layers[0].data]).reshape(-1,3,2)
 np.savez_compressed(OUT/(name+'-inspect.npz'),p=p,f=f,uv=uv)
 print(name,len(p),len(f),p.min(0),p.max(0),flush=True)
cam=studio();s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=16;s.cycles.use_denoising=True
for n,c in [('body',(1,.05,.02,1)),('head_face',(.02,.2,1,1)),('hair',(.02,1,.1,1))]:
 o=bpy.data.objects[n];m=bpy.data.materials.new(n+' diagnostic');m.diffuse_color=c;m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=c;o.data.materials.clear();o.data.materials.append(m)
 for q in o.data.polygons:q.material_index=0
for n in ['eye_lids','eye_iris','glasses_frame','glasses_lens']:bpy.data.objects[n].hide_render=True
render(OUT,cam,'neck-parts.png',(0,-2,.8),(0,-.01,.705),.22)
for n in ['body','head_face']:
 for key in ['body','head_face','hair']:bpy.data.objects[key].hide_render=key!=n
 render(OUT,cam,'neck-'+n+'.png',(0,-2,.8),(0,-.01,.705),.22)
