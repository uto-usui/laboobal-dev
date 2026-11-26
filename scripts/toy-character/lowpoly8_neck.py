"""Measured neck skeleton and pose geometry; missing ray intersections stay null."""
import math,json
from collections import defaultdict
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lowpoly import coords,triangles,write,activate
from lowpoly2 import evaluated,reset_pose
from lowpoly2_measure import attr


def section_segments(p,f,z):
    t=p[f];d=t[:,:,2]-z;mask=(d.min(1)<=0)&(d.max(1)>0);segments=[]
    for tri,dd in zip(t[mask],d[mask]):
        points=[]
        for a,b in [(0,1),(1,2),(2,0)]:
            if (dd[a]<=0<dd[b]) or (dd[b]<=0<dd[a]):points.append((tri[a]+(tri[b]-tri[a])*(-dd[a])/(dd[b]-dd[a]))[:2])
        if len(points)==2:segments.append(points)
    return np.asarray(segments).reshape(-1,2,2)


def align_bones(out,head,rig):
    p=coords(head);f=triangles(head);rows=[]
    for mm in range(670,701,5):
        seg=section_segments(p,f,mm/1000);q=seg.reshape(-1,2)
        if not len(q):raise RuntimeError(f'Missing original neck cross-section at {mm}')
        center=(q.min(0)+q.max(0))/2
        rows.append({'height_mm':mm,'center_mm':(np.r_[center,mm/1000]*1000).tolist(),'xy_bounds_mm':(np.array([q.min(0),q.max(0)])*1000).tolist(),'segment_count':len(seg)})
    centers=np.array([r['center_mm'] for r in rows])/1000
    z=centers[:,2];fit=np.linalg.lstsq(np.c_[z,np.ones(len(z))],centers[:,:2],rcond=None)[0]
    old={name:{'head':list(rig.data.bones[name].head_local),'tail':list(rig.data.bones[name].tail_local)} for name in ['neck','head']}
    def point(z):return np.r_[np.array([z,1])@fit,z]
    activate(rig);bpy.ops.object.mode_set(mode='EDIT');neck=rig.data.edit_bones['neck'];h=rig.data.edit_bones['head'];length=h.length
    neck.head=point(old['neck']['head'][2]);neck.tail=point(old['neck']['tail'][2]);h.head=neck.tail;h.tail=h.head+(neck.tail-neck.head).normalized()*length;h.use_connect=True
    bpy.ops.object.mode_set(mode='OBJECT');reset_pose(rig)
    new={name:{'head':list(rig.data.bones[name].head_local),'tail':list(rig.data.bones[name].tail_local)} for name in ['neck','head']}
    fitted=np.c_[z,np.ones(len(z))]@fit
    report={'original_head_cross_sections':rows,'center_definition':'XY bounds midpoint of the entire fitted original head cross-section','axis_fit':'least squares x(z), y(z) through seven measured centers; keep original neck endpoint heights and head bone length','fit_coefficients_xy':fit.tolist(),'max_center_residual_mm':float(np.linalg.norm(fitted-centers[:,:2],axis=1).max()*1000),'old_bones_m':old,'new_bones_m':new}
    write(out/'neck-bones.json',report)
    j=json.loads((out/'joints.json').read_text());j['neck_base']=new['neck']['head'];j['head_pivot']=new['neck']['tail'];write(out/'joints.json',j)


def radii(segments,center,count=128):
    if not len(segments):return np.full(count,np.nan)
    a=segments[:,0]-center;s=segments[:,1]-segments[:,0];result=np.full(count,np.nan)
    def cross(x,y):return x[...,0]*y[...,1]-x[...,1]*y[...,0]
    for k,angle in enumerate(np.arange(count)*2*np.pi/count):
        direction=np.array([math.cos(angle),math.sin(angle)]);den=cross(direction,s);good=abs(den)>1e-12
        t=np.divide(cross(a,s),den,out=np.zeros(len(s)),where=good);u=np.divide(cross(a,direction),den,out=np.zeros(len(s)),where=good)
        hits=t[good&(t>=0)&(u>=-1e-8)&(u<=1+1e-8)]
        if len(hits):result[k]=hits.max()
    return result


def measure_range(out,body,head,rig,cam,render,set_pose,pose_regions,j):
    import subprocess
    from lowpoly3_measure import deformation
    from lowpoly import WORK
    from lowpoly_verify import visible
    from geometry import material
    from pathlib import Path
    hp=coords(head);hf=triangles(head);hl=attr(head,'part2');bp=coords(body);bf=triangles(body);bl=attr(body,'part_id')
    bones=json.loads((out/'neck-bones.json').read_text());fit=np.array(bones['fit_coefficients_xy']);n=128
    # Exclude the hidden head closure and the upper face from the neck contour.
    neckfaces=(hl==0)&(hp[hf].mean(1)[:,2]<.720)&~np.all(abs(hp[hf][:,:,2]-hp[:,2].min())<1e-6,axis=1)
    neck_points,neck_triangles=clip_below(hp,hf[hl==0],.700)
    bodyfaces=(bl==2)&~np.all(abs(bp[bf][:,:,2]-json.loads((out/'construction.json').read_text())['neck']['body_cut_m'])<1e-6,axis=1)
    heights=np.arange(.640,.731,.001);angles=np.arange(n)*2*np.pi/n;directions=np.c_[np.cos(angles),np.sin(angles)]
    rows=[];raw={};poses=['rest']+[f'neck_{direction}{angle}' for direction,limit in [('left',30),('right',30),('up',20),('down',20)] for angle in range(5,limit+1,5)]
    clothmask=np.isin(bl,[3,4,5,9])&(bp[bf].mean(1)[:,2]>.57)
    # Same source surface and barycentric samples are used in every pose.
    rng=np.random.default_rng(8);tri=hp[hf];area=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)
    ids=rng.choice(len(hf),40000,p=area/area.sum());bary=rng.dirichlet([1,1,1],len(ids));samples=(tri[ids]*bary[:,:,None]).sum(1)
    samplekind=hl[ids];keep=(samplekind==1)|((samplekind==0)&(samples[:,2]>=.705))
    samples=np.r_[samples[keep],hp[(hp[:,2]>=.705)|np.isin(np.arange(len(hp)),np.unique(hf[hl==1]))]]
    mat=material('Eighth pass neck white',(.70,.70,.70),.82)
    for obj in [body,head]:
        obj.data.materials.clear();obj.data.materials.append(mat)
        for face in obj.data.polygons:face.material_index=0
    bpy.context.scene.render.resolution_x=bpy.context.scene.render.resolution_y=540;bpy.context.scene.render.film_transparent=True;visible([body,head])
    for pose in poses:
        set_pose(rig,pose);pp=evaluated(body);hh=evaluated(head);cloth=BVHTree.FromPolygons(pp.tolist(),bf[clothmask].tolist(),all_triangles=True)
        head_visibility=BVHTree.FromPolygons(hh.tolist(),hf.tolist(),all_triangles=True)
        body_visibility=BVHTree.FromPolygons(pp.tolist(),bf.tolist(),all_triangles=True)
        transform=np.asarray(rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted())
        posed_neck=(np.c_[neck_points,np.ones(len(neck_points))]@transform.T)[:,:3]
        br=[];hr=[];protrusions=[];visible_protrusions=[];heightrows=[]
        for z in heights:
            center=np.array([z,1])@fit;b=radii(section_segments(pp,bf[bodyfaces],z),center,n);h=radii(section_segments(posed_neck,neck_triangles,z),center,n);valid=np.isfinite(b)&np.isfinite(h)
            br.append(b);hr.append(h)
            row={'height_mm':round(z*1000,3),'valid_common_directions':int(valid.sum()),'body_radii_mm':[float(x*1000) if np.isfinite(x) else None for x in b],'head_radii_mm':[float(x*1000) if np.isfinite(x) else None for x in h]}
            difference=np.maximum(h[valid]-b[valid],0);row['max_head_minus_body_mm']=float(difference.max(initial=0)*1000) if valid.any() else None;heightrows.append(row)
            for k in np.flatnonzero(valid&(h>b)):
                amount=(h[k]-b[k])*1000;point=Vector((*list(center+directions[k]*h[k]),z));direction=Vector((*directions[k],0));hit=cloth.ray_cast(point+direction*.00005,direction,1)[0]
                protrusions.append(amount)
                if hit is None and head_visibility.ray_cast(point+direction*.00005,direction,1)[0] is None:visible_protrusions.append(amount)
        br=np.array(br);hr=np.array(hr);gaps=[];visible_gaps=[];unknown=0;angle_rows=[]
        for k in range(n):
            bi=np.flatnonzero(np.isfinite(br[:,k]));hi=np.flatnonzero(np.isfinite(hr[:,k]));row={'direction_deg':float(angles[k]*180/np.pi)}
            if not len(bi) or not len(hi):unknown+=1;row['gap_mm']=None;angle_rows.append(row);continue
            bodytop=heights[bi[-1]]+.0005;headbottom=heights[hi[0]]-.0005;gap=max(0,headbottom-bodytop);gaps.append(gap*1000)
            if gap>0:
                z=(headbottom+bodytop)/2;center=np.array([z,1])@fit;r=max(br[bi[-1],k],hr[hi[0],k]);point=Vector((*list(center+directions[k]*r),z));direction=Vector((*directions[k],0));blocked=body_visibility.ray_cast(point+direction*.00005,direction,1)[0] is not None or head_visibility.ray_cast(point+direction*.00005,direction,1)[0] is not None
                if not blocked:visible_gaps.append(gap*1000)
            else:blocked=False
            row.update({'body_top_mm':float(bodytop*1000),'head_bottom_mm':float(headbottom*1000),'gap_mm':float(gap*1000),'cloth_occluded':blocked});angle_rows.append(row)
        transform=np.asarray(rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted());sampleposed=(np.c_[samples,np.ones(len(samples))]@transform.T)[:,:3]
        np.savez(out/f'neck-contact-{pose}.npz',V=pp,F=bf,labels=bl,points=sampleposed,clothmask=clothmask)
        r={'pose':pose,'angle_deg':0 if pose=='rest' else int(''.join(filter(str.isdigit,pose))),'gap_mm':max(visible_gaps,default=0),'gap_is_angular_profile_estimate':True,'unoccluded_vertical_gap_mm':max(gaps,default=0),'protrusion_mm':max(protrusions,default=0),'visible_protrusion_mm':max(visible_protrusions,default=0),'missing_angular_sections':unknown,'common_radial_pairs':int((np.isfinite(br)&np.isfinite(hr)).sum()),'joint_pose_metrics':pose_regions(body,rig,j),'assembly_deformation':deformation([body,head],{body.name:bp,head.name:hp})}
        action=bpy.data.actions.get('lowpoly8_range_'+pose) or bpy.data.actions.new('lowpoly8_range_'+pose);action.use_fake_user=True
        rig.animation_data_create();rig.animation_data.action=action
        for bone in rig.pose.bones:bone.keyframe_insert(data_path='rotation_quaternion',frame=1,group=bone.name)
        rig.animation_data.action=None
        rows.append(r);raw[pose]={'heights':heightrows,'angular_gaps':angle_rows}
        for a in [0,25,90]:
            angle=math.radians(a);target=Vector((.009,-.020,.690));render(out,cam,f'range-{pose}-{a}.png',target+Vector((2*math.sin(angle),-2*math.cos(angle),0)),target,.18)
        print('NECK8',pose,json.dumps({k:v for k,v in r.items() if k not in ['joint_pose_metrics','assembly_deformation']}),flush=True)
    reset_pose(rig);write(out/'neck-range-raw.json',raw);write(out/'neck-range-initial.json',rows)
    subprocess.run([str(WORK/'venv-geo/bin/python'),str(Path(__file__).with_name('lowpoly8_contacts.py')),str(out)],check=True)
    result=json.loads((out/'neck-range-metrics.json').read_text())
    return result


def front_blend_field(out,body,head,labels):
    import heapq
    review=out/'front-opening-review.json'
    if not review.exists():
        from pathlib import Path
        recorded=json.loads(Path(__file__).with_name('lowpoly8_front_review.json').read_text())
        source=json.loads((out/'construction.json').read_text())['input_sha256']
        if recorded['source_blend_sha256']!=source:raise RuntimeError('Recorded front-opening review belongs to a different input')
        write(review,recorded)
    if not json.loads(review.read_text())['use_head_blend']:return
    p=coords(body);f=triangles(body);edges=np.array([e.vertices[:] for e in body.data.edges]);skin=labels==2;collar=(labels==3)&(p[:,2]>.642)&(abs(p[:,0])<.089)
    # Dijkstra traverses only the skin surface. All vertices adjacent to the
    # collar are zero; the field is independent of world height.
    boundary=edges[(skin[edges[:,0]]&collar[edges[:,1]])|(skin[edges[:,1]]&collar[edges[:,0]])]
    seeds=np.unique(boundary[skin[boundary]])
    if not len(seeds):raise RuntimeError('No actual skin/collar graph boundary')
    graph=defaultdict(list)
    for a,b in edges[skin[edges].all(1)]:
        distance=float(np.linalg.norm(p[a]-p[b]));graph[int(a)].append((int(b),distance));graph[int(b)].append((int(a),distance))
    dist=np.full(len(p),np.inf);queue=[]
    for i in seeds:dist[i]=0;heapq.heappush(queue,(0,int(i)))
    while queue:
        value,i=heapq.heappop(queue)
        if value!=dist[i]:continue
        for k,length in graph[i]:
            alt=value+length
            if alt<dist[k]:dist[k]=alt;heapq.heappush(queue,(alt,k))
    ht=BVHTree.FromPolygons(coords(head).tolist(),triangles(head).tolist(),all_triangles=True);bt=BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True)
    fit=np.array(json.loads((out/'neck-bones.json').read_text())['fit_coefficients_xy']);front=np.zeros(len(p),bool);direction=Vector((0,-1,0))
    for i in np.flatnonzero(skin&np.isfinite(dist)):
        center=np.array([p[i,2],1])@fit
        if p[i,1]>=center[1]:continue
        point=Vector(p[i])+direction*.0001
        front[i]=ht.ray_cast(point,direction,2)[0] is None and bt.ray_cast(point,direction,2)[0] is None
    t=np.clip(dist/.010,0,1);alpha=np.zeros(len(p));alpha[front]=t[front]**2*(3-2*t[front]);alpha[seeds]=0
    np.savez(out/'front-blend-field.npz',head_weight=alpha,distance_to_collar_m=dist,visible_front=front,seeds=seeds)
    report={'trigger':json.loads(review.read_text()),'method':'visible front neck skin only; graph geodesic to actual skin/collar boundary, smoothstep(distance/10mm); 0 at collar, up to 1 beyond 10mm; no height ramp','boundary_vertices':len(seeds),'visible_front_vertices':int(front.sum()),'mixed_vertices':int((alpha>0).sum()),'maximum_head_weight':float(alpha.max()),'maximum_selected_distance_mm':float(dist[front].max(initial=0)*1000),'collar_head_weight_max':float(alpha[collar].max(initial=0)),'vertex_positions_changed':False}
    write(out/'front-blend.json',report)
    print('FRONT8',json.dumps({k:v for k,v in report.items() if k!='trigger'}),flush=True)


def clip_below(p,f,z):
    """Clip a measurement surface only; never write these vertices to the model."""
    points=[];faces=[]
    for tri in p[f]:
        polygon=[]
        for a,b in zip(tri,np.roll(tri,-1,axis=0)):
            ain=a[2]<=z;bin=b[2]<=z
            if ain:polygon.append(a)
            if ain!=bin:polygon.append(a+(b-a)*(z-a[2])/(b[2]-a[2]))
        for k in range(1,len(polygon)-1):
            start=len(points);points.extend([polygon[0],polygon[k],polygon[k+1]]);faces.append([start,start+1,start+2])
    return np.array(points),np.array(faces,np.int32)
