"""Measured skin seam and its weights; shared sixth-pass geometry stays untouched."""
import json,math,hashlib,subprocess
from pathlib import Path
from collections import Counter
import bpy,bmesh,numpy as np
from mathutils import Vector
from lowpoly import coords,triangles,write,WORK,recalc,bvh
from lowpoly2 import cut_and_cap,evaluated,reset_pose
from lowpoly2_measure import attr
from lowpoly_verify import visible,topology
import lowpoly3 as p3
import lowpoly4 as p4
OUT=None
LABEL_CACHE={}


def section_radii(obj,z,center,label=None,attribute='part_id'):
    p=coords(obj);f=triangles(obj);t=p[f];dz=t[:,:,2]-z
    mask=(dz.min(1)<=0)&(dz.max(1)>0)
    if label is not None:mask&=attr(obj,attribute)==label
    segments=[]
    for tri,d in zip(t[mask],dz[mask]):
        points=[]
        for a,b in [(0,1),(1,2),(2,0)]:
            if (d[a]<=0<d[b]) or (d[b]<=0<d[a]):points.append((tri[a]+(tri[b]-tri[a])*(-d[a])/(d[b]-d[a]))[:2])
        if len(points)==2:segments.append(points)
    r=[]
    if not segments:return [None]*64
    segments=np.array(segments);a=segments[:,0]-center;s=segments[:,1]-segments[:,0]
    cross=lambda x,y:x[...,0]*y[...,1]-x[...,1]*y[...,0]
    for angle in np.arange(64)*2*np.pi/64:
        d=np.array([math.cos(angle),math.sin(angle)]);den=cross(d,s);good=abs(den)>1e-12
        t=np.divide(cross(a,s),den,out=np.zeros(len(s)),where=good);u=np.divide(cross(a,d),den,out=np.zeros(len(s)),where=good)
        hits=t[good&(t>=0)&(u>=-1e-9)&(u<=1+1e-9)];r.append(float(hits.max()*1000) if len(hits) else None)
    return r


def measure(body,head,j):
    hp=coords(head);hf=triangles(head);t=hp[hf];d=t[:,:,2]-.690
    cross_section=[]
    for tri,dd in zip(t[(d.min(1)<=0)&(d.max(1)>0)],d[(d.min(1)<=0)&(d.max(1)>0)]):
        for u,v in [(0,1),(1,2),(2,0)]:
            if (dd[u]<=0<dd[v]) or (dd[v]<=0<dd[u]):cross_section.append((tri[u]+(tri[v]-tri[u])*(-dd[u])/(dd[v]-dd[u]))[:2])
    pp=np.array(cross_section);axis=(pp.min(0)+pp.max(0))/2;rows=[]
    for mm in range(660,701):
        z=mm/1000;center=axis
        br=section_radii(body,z,center,2);hr=section_radii(head,z,center,0,'part2')
        pairs=[(x if x is not None else 0)-(y if y is not None else 0) for x,y in zip(br,hr)]
        valid=any(x is not None for x in br) and any(x is not None for x in hr)
        rows.append({'height_mm':mm,'axis_xy_mm':(center*1000).tolist(),'body_radii_mm':br,'head_radii_mm':hr,'body_minus_head_mm':pairs,'body_missing_directions':sum(x is None for x in br),'head_missing_directions':sum(x is None for x in hr),'max_body_minus_head_mm':max(pairs) if pairs else None,'valid_all_64_directions':all(x is not None for x in br+hr),'candidate_both_sections_present':valid,'body_inside_head_all_directions':valid and all(x is not None for x in hr) and max(pairs)<=0})
    inside=[r for r in rows if r['body_inside_head_all_directions']];valid=[r for r in rows if r['candidate_both_sections_present']]
    write(OUT/'neck-radial-samples.json',{'heights':rows})
    if not valid:raise RuntimeError('No height with both surfaces intersecting all 64 rays; raw samples saved')
    chosen=inside[0] if inside else min(valid,key=lambda r:(r['max_body_minus_head_mm'],r['height_mm']))
    result={'heights':rows,'head_section_scope':'face/skin part2 label 0, excluding hair that cannot cover a skin seam','axis_xy_mm':(axis*1000).tolist(),'angular_directions':64,'height_step_mm':1,'axis':'vertical line through center of reduced head neck cross-section XY bounds at z=690mm; the temporary skeleton axis lies outside the actual head neck','intersection':'outermost positive segment/ray intersection. Missing skin intersection is null in raw radii and zero extent in differences. A height with no body or no head section is excluded; head must cover all 64 rays to pass containment','selection':'lowest all-direction containment' if inside else 'minimum maximum protrusion among heights where both skin sections exist; missing head rays conservatively have zero extent','contained_height_exists':bool(inside),'seam_height_mm':chosen['height_mm'],'maximum_protrusion_mm':max(0,chosen['max_body_minus_head_mm']),'signed_max_body_minus_head_mm':chosen['max_body_minus_head_mm']}
    return result


def cut_neck(body,report,ns):
    # First reduce at the original bottom; the seam is measured on this actual
    # protected-face Collapse surface, not on a proxy or the high-density head.
    high=bpy.data.objects['high3_body_original'];p=coords(high);f=triangles(high);lab=attr(high,'part_id');fc=p[f].mean(1)
    collar=(lab==3)&(fc[:,2]>.642)&(abs(fc[:,0])<.089);top=float(p[np.unique(f[collar]),2].max())
    report['neck']={'collar_top_m':top,'head_cut_m':report['head_original_bottom_m'],'body_cut_m':.700}
    import os
    if os.environ.get('LOWPOLY7_PHASE')!='seam':
        ns['rebuild_head'](report);ns['checkpoint']('head-measure-checkpoint')
    head=bpy.data.objects['low6_head'];j=json.loads((OUT/'joints.json').read_text())
    measured=measure(body,head,j);cut=measured['seam_height_mm']/1000;headcut=max(report['head_original_bottom_m'],cut-.010)
    finalcut=cut_and_cap(head,headcut);recalc(head,True)
    bm=bmesh.new();bm.from_mesh(body.data);layer=bm.faces.layers.int['part_id'];cap=bm.faces.layers.int.new('neck_cap')
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,cut),plane_no=(0,0,1),dist=1e-7)
    remove=[face for face in bm.faces if face[layer]==2 and face.calc_center_median().z>cut+1e-7]
    bmesh.ops.delete(bm,geom=remove,context='FACES');loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    rim=[e for e in bm.edges if e.is_boundary];nonplanar=max((abs(v.co.z-cut)*1000 for e in rim for v in e.verts),default=0)
    filled=bmesh.ops.holes_fill(bm,edges=rim,sides=0)['faces']
    for face in filled:
        planar=all(abs(v.co.z-cut)<2e-6 for v in face.verts)
        face[layer]=2 if planar else 3;face[cap]=1 if planar else 0
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free();body.data.update();body.name='solid6_body'
    from lowpoly import clean
    cleanup=clean(body,True,weld=False);cleanup_second=clean(body,False,weld=False)
    recalc(body,True)
    np.savez(OUT/'seam-clean-input.npz',V=coords(body),F=triangles(body))
    subprocess.run([str(WORK/'venv-geo/bin/python'),str(Path(__file__).with_name('lowpoly7_close.py')),str(OUT)],check=True)
    d=np.load(OUT/'seam-clean-output.npz')
    mesh=bpy.data.meshes.new('Closed measured neck seam');mesh.from_pydata(d['V'].tolist(),[],d['F'].tolist());mesh.update();body.data=mesh
    p3.transfer_labels(body,high,'part_id');recalc(body,True)
    pp=coords(body);ff=triangles(body);fl=attr(body,'part_id');fl[(fl==2)&(pp[ff].mean(1)[:,2]>cut+1e-6)]=3;p3.face_attr(body,'part_id',fl)
    p3.face_attr(body,'neck_cap',np.all(abs(pp[ff][:,:,2]-cut)<1e-6,axis=1).astype(int))
    skin=coords(body)[np.unique(triangles(body)[attr(body,'part_id')==2])]
    actualbottom=float(coords(head)[:,2].min())
    measured.update({'head_cut_height_mm':headcut*1000,'actual_head_bottom_mm':actualbottom*1000,'overlap_mm':(cut-actualbottom)*1000,'head_cut':finalcut})
    # The previous global "collar top" includes the tall side collar up to
    # 700.6mm. It lies above the skin seam. Use the original skin/collar lower
    # interface as the end of the exposed-skin weight transition.
    skin_original=p[np.unique(f[lab==2])];transition_bottom=float(skin_original[:,2].min())
    report['neck']={'collar_top_m':top,'skin_collar_transition_bottom_m':transition_bottom,'transition_assumption':'global collar top includes tall side collar above seam; exposed skin lower extent (original label 2 minimum z) is the height endpoint for chest weights','body_cut_m':cut,'head_bottom_m':actualbottom,'head_cut_m':headcut,'requested_head_cut_m':cut-.010,'overlap_m':cut-actualbottom,'required_overlap_m':.010,'overlap_shortfall_m':max(0,.010-(cut-actualbottom)),'overlap_pass':cut-actualbottom>=.010-1e-6,'body_cut_scope':'label 2 neck skin only; old head removed by exact nearest original face labels on occupied cells','cut_rim_nonplanarity_mm':nonplanar,'planar_cut_pass':nonplanar<.01,'head_transform_changed':False,'removed_faces':len(remove),'cap_faces':len(filled),'seam_cleanup':json.loads((OUT/'seam-cleanup.json').read_text()),'closure_cleanup':cleanup,'closure_cleanup_second':cleanup_second,'closure_note':'nonplanar preexisting old-head/skin/collar interface rims close with their existing vertices; only planar seam caps have neck label 2','radial_measurement':measured}
    report['old_head_removal']=json.loads((OUT/'old-head-removal.json').read_text());report['after_neck_cut']=topology(body)
    report['head_geometry_sha256']=hashlib.sha256(coords(head).tobytes()+triangles(head).tobytes()).hexdigest()
    if 'head_cleanup' not in report:report['head_cleanup']=json.loads((OUT/'head-cleanup.json').read_text())
    report['head_cleanup']['final_cut']=finalcut;report['head_cleanup']['triangles']=len(triangles(head));report['head_cleanup']['topology']=topology(head)
    write(OUT/'neck-measurements.json',measured);write(OUT/'construction.json',report);ns['log']('首測定 '+json.dumps({k:v for k,v in measured.items() if k!='heights'}))


def vertex_labels_with_slit_provenance(body):
    q=coords(body);key=hashlib.sha256(q.tobytes()+triangles(body).tobytes()).hexdigest()
    if key in LABEL_CACHE:return LABEL_CACHE[key].copy()
    tree=bvh(bpy.data.objects['high3_body_original']);fl=attr(bpy.data.objects['high3_body_original'],'part_id')
    labels=np.array([fl[tree.find_nearest(Vector(v))[2]] for v in q],np.int32)
    cut=json.loads((OUT/'construction.json').read_text())['neck']['body_cut_m']
    labels[(labels==2)&(q[:,2]>cut+1e-6)]=3
    # The closure belongs to neck skin even when its center is closer to collar.
    cap=attr(body,'neck_cap') if body.data.attributes.get('neck_cap') else np.zeros(len(triangles(body)),int)
    labels[np.unique(triangles(body)[cap==1])]=2
    np.savez(OUT/'weight-label-input.npz',V=q,labels=labels)
    subprocess.run([str(WORK/'venv-geo/bin/python'),str(Path(__file__).with_name('lowpoly6_weight_labels.py')),str(OUT)],check=True)
    labels=np.load(OUT/'weight-labels.npy');LABEL_CACHE[key]=labels
    return labels.copy()


def apply_neck_weights(body,rig,labels,n):
    p=coords(body);names=[b.name for b in rig.data.bones];w=p4.read_weights(body,names);skin=labels==2
    upper=n['body_cut_m']-.010;lower=min(n['skin_collar_transition_bottom_m'],upper-.001);mid=(lower+upper)/2
    smooth=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
    head=smooth((p[:,2]-mid)/(upper-mid));chest=1-smooth((p[:,2]-lower)/(mid-lower));neck=1-head-chest
    w[skin]=0
    for name,values in [('head',head),('neck',neck),('spine.chest',chest)]:w[skin,names.index(name)]=values[skin]
    p4.put_weights(body,names,w)
    return {'method':'height smoothstep head -> neck -> spine.chest on label 2 only','head_1_from_m':upper,'neck_1_at_m':mid,'chest_1_to_m':lower,'head_1_vertices':int((skin&(p[:,2]>=upper)).sum()),'skin_vertices':int(skin.sum()),'local_refinement_used':False}


def stretch_diagnostics(out,body,head,rig,cam,render,poses,set_pose):
    q=coords(body);e=np.array([x.vertices[:] for x in body.data.edges]);labels=p4.vertex_labels(body);result={}
    from geometry import material
    clay=material('Seventh pass white inspection',(.70,.70,.70),.82)
    for obj in [body,head]:
        obj.data.materials.clear();obj.data.materials.append(clay)
        for face in obj.data.polygons:face.material_index=0
    scene=bpy.context.scene;scene.render.resolution_x=scene.render.resolution_y=900;visible([body,head])
    for pose in poses:
        set_pose(rig,pose);p=evaluated(body);ratio=np.linalg.norm(p[e[:,1]]-p[e[:,0]],axis=1)/np.maximum(np.linalg.norm(q[e[:,1]]-q[e[:,0]],axis=1),1e-12);ids=np.flatnonzero(ratio>3)
        if not len(ids):continue
        order=ids[np.argsort(ratio[ids])[::-1]];rows=[]
        for i in order:
            edge=e[i];rows.append({'edge_index':int(i),'vertices':edge.tolist(),'stretch':float(ratio[i]),'parts':[p3.PARTS.get(int(k),str(k)) for k in labels[edge]],'rest_endpoints_mm':(q[edge]*1000).tolist(),'posed_endpoints_mm':(p[edge]*1000).tolist(),'height_range_mm':(q[edge,2]*1000).tolist()})
        # Group the actual bad edges spatially, retaining one close render per
        # affected anatomical side/part; all edges remain in the JSON.
        groups={}
        for r in rows:
            xyz=np.mean(r['rest_endpoints_mm'],axis=0);part='/'.join(sorted(set(r['parts'])));key=part+('_L' if xyz[0]>=0 else '_R')
            if key not in groups:groups[key]=r
        for index,(key,r) in enumerate(groups.items()):
            target=Vector(np.mean(r['posed_endpoints_mm'],axis=0)/1000);name=f'stretch-{pose}-{index}.png';render(out,cam,name,target+Vector((.9,-1.8,.20)),target,.15);r['close_render']=name
        result[pose]={'count':len(rows),'max_edge':rows[0],'group_representatives':groups,'edges':rows}
    reset_pose(rig);write(out/'stretch-over-3x.json',result);return result
