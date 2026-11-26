"""Stage 4: face labels, inspectable boundaries, topology evidence and rig landmarks."""
import math
from collections import Counter

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from generated_mesh import PARTS, COLORS, arrays, import_source, texture_colors, write_json
from geometry import material, sphere, tube


def graph_data(faces):
    edges = np.sort(np.concatenate([faces[:,[0,1]], faces[:,[1,2]], faces[:,[2,0]]]), axis=1)
    face_ids = np.tile(np.arange(len(faces), dtype=np.int32), 3)
    order = np.lexsort((edges[:,1],edges[:,0]))
    edges, face_ids = edges[order], face_ids[order]
    first = np.r_[True, np.any(edges[1:] != edges[:-1],axis=1)]
    starts = np.flatnonzero(first)
    counts = np.diff(np.r_[starts,len(edges)])
    manifold = starts[counts==2]
    pairs = np.column_stack([face_ids[manifold],face_ids[manifold+1]])
    return edges[starts], starts, counts, face_ids, pairs


def classify_parts(obj, out):
    p, f = arrays(obj.data)
    c, rgb = p[f].mean(axis=1), texture_colors(obj.data)
    x,y,z = c.T
    ax = np.abs(x)
    labels = np.full(len(f),PARTS.index('torso'),np.int32)
    labels[z < .325] = PARTS.index('legs_shoes')
    # The curved axillary boundary leaves the shoulder continuous with the torso.
    sleeve = (ax > .093 + .12*(.55-z) + .6*np.maximum(y-.025,0)) & (z>.325) & (z<.577)
    labels[sleeve & (x>0)] = PARTS.index('sleeve_L')
    labels[sleeve & (x<0)] = PARTS.index('sleeve_R')
    wrist_plane = (ax-.204)*.52-(z-.385)*.854
    hand = (wrist_plane>0) & (ax>.179) & (z<.41)
    labels[hand & (x>0)] = PARTS.index('hand_L')
    labels[hand & (x<0)] = PARTS.index('hand_R')
    neck = (z>.590)&(z<.626)&(ax<.052)&(y<.047)
    labels[neck] = PARTS.index('neck')
    head = (z>.620) | ((z>.611)&(y<-.078)&(ax<.067))
    labels[head] = PARTS.index('head_face')
    # Hair seeds combine dark texture with the crown/back/side silhouette.
    hair_seed = head & (rgb.max(axis=1)<.43) & ((z>.748)|(y>.01)|(ax>.107))
    skin = head & (rgb[:,0]>.50)&(rgb[:,0]>1.25*rgb[:,1]) & (y<.045)
    # Preserve eyebrows, lashes, mouth and painted pupils inside the facial contour.
    hair = head & ~skin & ((rgb.max(axis=1)<.43)&((z>.735)|(y>.015)|(ax>.110)))
    labels[hair|hair_seed] = PARTS.index('hair')
    # Shape prior is the contact envelope, not a single back/front cutting plane.
    contact = .057 + .025*(ax/.10)**2 + .018*((z-.462)/.13)**2
    pack = (z>.357)&(z<.568)&(ax<.112)&(y>contact)
    labels[pack] = PARTS.index('backpack')
    strap_x = .065+.11*(.58-z)
    front_strap = (np.abs(ax-strap_x)<.0175)&(y<-.027)&(z>.410)&(z<.606)
    chest = (np.abs(z-.507)<.008)&(ax<.081)&(y<-.081)
    top_strap = (z>.553)&(z<.607)&(ax>.038)&(ax<.092)&(y>-.04)
    side_strap = (z>.362)&(z<.510)&(ax>.087)&(ax<.111)&(y>-.005)&(y<.082)
    labels[front_strap|chest|top_strap|side_strap] = PARTS.index('shoulder_straps')
    labels[head & (labels==PARTS.index('shoulder_straps'))] = PARTS.index('head_face')
    edges,starts,counts,face_ids,pairs=graph_data(f)
    a,b = pairs.T
    normals=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-15)
    color_jump=np.linalg.norm(rgb[a]-rgb[b],axis=1)
    bend=1-np.einsum('ij,ij->i',normals[a],normals[b]).clip(-1,1)
    weights=np.exp(-color_jump*16-bend*3)
    original=labels.copy()
    # Refine only a narrow boundary band on the face adjacency graph. High color
    # jumps/creases stop votes, so hair tips and backpack roots can follow their seams.
    band=np.zeros(len(f),bool)
    cut=labels[a]!=labels[b]
    band[a[cut]]=True;band[b[cut]]=True
    for _ in range(5):
        active=band[a]|band[b]
        band[a[active]]=True;band[b[active]]=True
    fixed=~band
    for iteration in range(10):
        score=np.zeros((len(f),len(PARTS)),np.float32)
        score[np.arange(len(f)),original]=.40
        np.add.at(score,(a,labels[b]),weights)
        np.add.at(score,(b,labels[a]),weights)
        new=score.argmax(axis=1).astype(np.int32)
        new[fixed]=original[fixed]
        labels=new
    attr=obj.data.attributes.new('part_id','INT','FACE')
    attr.data.foreach_set('value',labels)
    boundaries={}
    cut=labels[a]!=labels[b]
    # Store the full labeled graph, including every mesh edge, for stage 6 projection.
    e1=labels[face_ids[starts]]
    e2=np.where(counts==2,labels[face_ids[np.minimum(starts+1,len(face_ids)-1)]],e1)
    boundary_idx=np.flatnonzero(e1!=e2)
    for i in boundary_idx:
        pair=' / '.join(sorted([PARTS[e1[i]],PARTS[e2[i]]]))
        boundaries[pair]=boundaries.get(pair,0)+1
    np.savez_compressed(out/'surface-labels.npz',part_id=labels,face_rgb=rgb,
                        boundary_edges=edges[boundary_idx],boundary_parts=np.column_stack([e1[boundary_idx],e2[boundary_idx]]))
    report={'method':'Semantic contour priors, texture color and dihedral-weighted face-adjacency refinement; no geometric separation.',
            'parts':{name:{'id':i,'triangles':int(np.count_nonzero(labels==i)),'display_rgb':COLORS[i]} for i,name in enumerate(PARTS)},
            'boundaries':boundaries,'boundary_refinement_faces':int(np.count_nonzero(labels!=original)),
            'labels_are_projection_regions':True,
            'cuts':{'head_neck':'jaw underside to occiput; hair separately labeled, not disconnected',
                    'shoulders':'curved axillary envelope; continuous upper body',
                    'wrists':'oblique section inside cuff; subsequent hand retopology needs separate fingers',
                    'hair':'dark texture/crown silhouette; color/crease weighted adjacent faces, eyebrows and eyes excluded',
                    'backpack':'curved back-contact envelope refined on color/crease graph; upper loops belong to straps'}}
    assert sum(v['triangles'] for v in report['parts'].values())==len(f)
    return labels,report,(edges,starts,counts,face_ids,pairs)


def topology(obj, graph, out):
    p,f=arrays(obj.data)
    edges,starts,counts,face_ids,_=graph
    cross=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    areas=np.linalg.norm(cross,axis=1)/2
    normals=cross/np.maximum(areas[:,None]*2,1e-20)
    _,first,inv,multiplicity=np.unique(np.sort(f,axis=1),axis=0,return_index=True,return_inverse=True,return_counts=True)
    duplicate=(multiplicity[inv]>1)
    degenerate=areas<1e-14
    centers=p[f].mean(axis=1)
    bad_idx=np.flatnonzero(counts!=2)
    candidates=np.unique(np.concatenate([face_ids[starts[i]:starts[i]+counts[i]] for i in bad_idx[counts[bad_idx]>2]]))
    bvh=BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True,epsilon=0)
    # Conservative occlusion test: a face is an internal-sheet candidate only if
    # BOTH normal half-rays hit other surfaces within 15 mm, at 2 offset scales.
    # This is diagnostic evidence, not a proof of solid occupancy in a nonmanifold mesh.
    internal=np.zeros(len(f),bool)
    witness={}
    for i in candidates:
        if duplicate[i] or degenerate[i]:
            continue
        c,n=Vector(centers[i]),Vector(normals[i])
        hits=[]
        for epsilon in [2e-5,8e-5]:
            for sign in [-1,1]:
                direction=n*sign
                loc,_,index,distance=bvh.ray_cast(c+direction*epsilon,direction,.015)
                hits.append(distance if loc is not None and index!=i else None)
        if all(d is not None and d>1e-5 for d in hits):
            internal[i]=True
            witness[str(int(i))]=hits
    # Face adjacency omits wire edges left by collapsed source triangles. They
    # still belong to Blender's nonmanifold count and must not disappear here.
    all_edges=np.empty(len(obj.data.edges)*2,np.int32)
    obj.data.edges.foreach_get('vertices',all_edges)
    all_edges=np.sort(all_edges.reshape(-1,2),axis=1)
    edge_keys=edges[:,0].astype(np.int64)*len(p)+edges[:,1]
    all_keys=all_edges[:,0].astype(np.int64)*len(p)+all_edges[:,1]
    wire=all_edges[~np.isin(all_keys,edge_keys)]
    names=['manifold','duplicate_face','degenerate_face','internal_sheet_candidate','unintended_connection','open_boundary']
    issue=np.zeros(len(edges),np.int32)
    rows=[]
    for i in bad_idx:
        adjacent=face_ids[starts[i]:starts[i]+counts[i]]
        if counts[i]==1:
            kind=5
        elif duplicate[adjacent].any():
            kind=1
        elif degenerate[adjacent].any():
            kind=2
        elif internal[adjacent].any():
            kind=3
        else:
            kind=4
        issue[i]=kind
        rows.append({'edge_vertices':edges[i].tolist(),'incident_faces':adjacent.tolist(),
                     'class':names[kind], 'internal_witness_faces':[int(j) for j in adjacent if internal[j]]})
    for edge in wire:
        rows.append({'edge_vertices':edge.tolist(),'incident_faces':[], 'class':'unintended_connection','wire':True})
    write_json(out/'topology-edges.json',{'classes':names,'edges':rows,'ray_witness_m':witness})
    report={'edges':len(edges)+len(wire),'wire_edges':len(wire),'nonmanifold_edges':len(bad_idx)+len(wire),
            'boundary_edges_included':int(np.count_nonzero(counts==1)),
            'radial_valence':{str(int(k)):int(v) for k,v in zip(*np.unique(counts,return_counts=True))},
            'classification':{name:int(np.count_nonzero(issue==i))+(len(wire) if i==4 else 0) for i,name in enumerate(names) if i},
            'duplicate_faces_after_weld':int(duplicate.sum()),'degenerate_faces_after_weld':int(degenerate.sum()),
            'internal_candidate_faces':int(internal.sum()),
            'classification_rule':'Priority: boundary, duplicate, area<1e-14 m2, two-sided local ray occlusion, remaining radial branching.',
            'limitations':'Internal sheets and unintended bridges are diagnostic candidates, not solid-certified semantics; holes are recorded separately, never filled automatically.',
            'repairs_applied':False}
    print('TOPOLOGY_DIAGNOSTIC', report, flush=True)
    assert report['nonmanifold_edges']==7503 and report['boundary_edges_included']==683
    # bmesh's connectivity, including nonmanifold fans, is authoritative here.
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bm.verts.index_update()
    seen=set();components=0
    for v in bm.verts:
        if v.index in seen:continue
        components+=1;stack=[v]
        while stack:
            q=stack.pop()
            if q.index in seen:continue
            seen.add(q.index);stack.extend(e.other_vert(q) for e in q.link_edges)
    bm.free();report['connected_components']=components
    write_json(out/'topology.json',report)
    return report


def landmarks(obj, labels, report, import_info, topo, out):
    p,f=arrays(obj.data);c=p[f].mean(axis=1)
    joints={
        'neck_base':[0,.006,.590], 'head_pivot':[0,.009,.626],
        'spine_lower':[0,.010,.366], 'spine_mid':[0,.008,.460],
        'spine_upper':[0,.007,.552], 'pelvis':[0,.012,.308]}
    estimates={}
    for side,sign in [('L',1),('R',-1)]:
        for name,co in [('shoulder',[.096,.004,.546]),('elbow',[.156,-.006,.468]),('wrist',[.204,-.024,.385])]:
            target=np.array([sign*co[0],co[1],co[2]])
            # Estimate the central axis from the nearest 6 mm thick cross section.
            d=np.array([sign*.50,0,-.866]);section=(np.abs((c-target)@d)<.006)&(np.linalg.norm(c-target,axis=1)<(.038 if name!='shoulder' else .045))
            points=c[section]
            if len(points):
                center=(np.quantile(points,.05,axis=0)+np.quantile(points,.95,axis=0))/2
                target=target*.45+center*.55
            joints[f'{name}_{side}']=target.tolist()
        # Fingers are partly fused in this source: use surface-measured palm axes,
        # then place anatomical joint candidates, never claim extracted knuckles.
        mask=labels==PARTS.index('hand_'+side)
        hand=c[mask]
        wrist=np.array(joints['wrist_'+side])
        tip=hand[np.argmin(hand[:,2])]
        down=tip-wrist;down[1]=0;down/=np.linalg.norm(down)
        across=np.array([0.,1.,0.])
        palm=wrist+down*.033
        distal=hand[hand[:,2]<.345]
        lo,hi=np.quantile(distal[:,1],[.025,.975])
        palm[1]=(lo+hi)/2
        width=float(hi-lo)
        spread=min(.019,max(.011,(width-.009)/3))
        for k,finger in enumerate(['index','middle','ring','little']):
            y=palm[1]+(k-1.5)*spread
            column=distal[abs(distal[:,1]-y)<.007]
            if len(column):
                ztip=float(np.quantile(column[:,2],.03))
                cap=column[column[:,2]<ztip+.004]
                fingertip=np.median(cap,axis=0);fingertip[1]=y
            else:
                fingertip=palm+across*((k-1.5)*spread)+down*.035
            base=palm+across*((k-1.5)*spread)
            for joint,t in [('mcp',0),('pip',.46),('dip',.74),('tip',1)]:
                joints[f'{finger}_{joint}_{side}']=(base*(1-t)+fingertip*t).tolist()
        for name,delta in [('cmc',[0,-.010,-.012]),('mcp',[.002,-.027,-.022]),
                           ('ip',[.007,-.043,-.033]),('tip',[.008,-.049,-.042])]:
            delta=np.array([sign*delta[0],delta[1],delta[2]])
            joints[f'thumb_{name}_{side}']=(wrist+delta).tolist()
        estimates[side]={'wrist':wrist.tolist(),'palm_axis':down.tolist(),'across_axis':across.tolist(),
                         'measured_hand_bounds':[hand.min(axis=0).tolist(),hand.max(axis=0).tolist()],
                         'depth_span_p05_p95':width,'finger_joint_uncertainty_m':.008,
                         'note':'Fused finger surfaces do not expose anatomical joints. These are rig-design candidates inferred from palm/silhouette, not measured bones.'}
    eyes={}
    for side,sign in [('L',1),('R',-1)]:
        guess=np.array([sign*.048,-.112,.709])
        face=(labels==0)&(abs(c[:,0]-guess[0])<.027)&(abs(c[:,2]-guess[2])<.019)&(c[:,1]<-.075)&(c[:,1]>-.130)
        # The painted white/black eye island supplies its visible center and extents.
        rgb=texture_colors(obj.data)
        eye=face&((rgb.max(axis=1)-rgb.min(axis=1)<.17)|(rgb.max(axis=1)<.32))
        points=c[eye]
        lo,hi=np.quantile(points,.025,axis=0),np.quantile(points,.975,axis=0)
        center=(lo+hi)/2
        eyes[side]={'center':[float(center[0]),float(np.quantile(points[:,1],.1)),float(center[2])],
                    'visible_bounds_p025_p975':[lo.tolist(),hi.tolist()],
                    'width':float(hi[0]-lo[0]),'height':float(hi[2]-lo[2]),
                    'method':'Visible eye-color island in front facial contour; robust UV-sampled face-center bounds.'}
    data={**import_info,'parts':report['parts'],'boundaries':report['boundaries'],'topology':topo,
          'joints':joints,'joint_status':'Estimated internal rig centers; see uncertainty. L is character left (+X).',
          'joint_uncertainty_m':{'neck_head':.006,'spine_pelvis':.015,'shoulder_elbow_wrist':.010},
          'hands':estimates,'eye_sockets':eyes,
          'assumptions':['No original skeleton; joint centers are design estimates from surface cross sections.',
                         'Hands have fused/intersecting digits; five finger chains are anatomical candidates for stage 6, not independently segmented current fingers.',
                         'Current source back texture differs from turnaround; shape/color segmentation uses the generated mesh, no back repaint in this stage.']}
    write_json(out/'landmarks.json',data)
    return data


def part_materials(obj,labels):
    old=list(obj.data.materials)
    for i,(name,color) in enumerate(zip(PARTS,COLORS)):
        obj.data.materials.append(material('part_'+name,color,.65))
    obj.data.polygons.foreach_set('material_index',labels+len(old))
    return old


def markers(data):
    dot=material('landmark dots',(1,.12,.02),.4)
    line=material('landmark bones',(.95,.55,.025),.5)
    created=[]
    for name,co in data['joints'].items():
        r=.0015 if any(k in name for k in ['thumb','index','middle','ring','little']) else .0030
        created.append(sphere('landmark_'+name,co,(r,)*3,dot,0))
    for side in ['L','R']:
        for chain in [['shoulder','elbow','wrist'],['thumb_cmc','thumb_mcp','thumb_ip','thumb_tip']]+[[f'{finger}_{j}' for j in ['mcp','pip','dip','tip']] for finger in ['index','middle','ring','little']]:
            created.append(tube('joint_chain_'+side,[data['joints'][name+'_'+side] for name in chain],.00065,line))
    return created


def run_prepare(out,studio,render):
    obj,info=import_source()
    labels,report,graph=classify_parts(obj,out)
    topo=topology(obj,graph,out)
    data=landmarks(obj,labels,report,info,topo,out)
    write_json(out/'parts.json',report)
    camera=studio();scene=bpy.context.scene
    scene.render.resolution_x=scene.render.resolution_y=720
    scene.eevee.taa_render_samples=32
    old=part_materials(obj,labels)
    for name,angle in [('front',0),('left',90),('back',180),('right',270)]:
        a=math.radians(angle)
        render(out,camera,'parts-'+name+'.png',(2*math.sin(a),-2*math.cos(a),.444),(0,0,.444),1.00)
    obj.data.polygons.foreach_set('material_index',np.zeros(len(labels),np.int32))
    # Render bones with the body as a translucent context. Dots live at internal
    # centers; compositing a separate transparent pass makes hidden joints visible.
    scene.render.film_transparent=True
    for light in [o for o in scene.objects if o.type=='LIGHT']:
        light.data.energy*=.7
    marker_objects=markers(data)
    views=[('front',(0,-2,.444),(0,0,.444),1.00),
           ('side',(2,0,.444),(0,0,.444),1.00)]
    for side in ['L','R']:
        wrist=np.array(data['joints']['wrist_'+side]);target=wrist+np.array([.012 if side=='L' else -.012,0,-.028])
        views.append(('hand-'+side,(target[0]+(.25 if side=='L' else -.25),target[1]-.55,target[2]),target,.135))
    for name,pos,target,scale in views:
        for o in marker_objects:o.hide_render=True
        render(out,camera,'landmark-body-'+name+'.png',pos,target,scale)
        for o in marker_objects:o.hide_render=False
        obj.hide_render=True
        render(out,camera,'landmark-dots-'+name+'.png',pos,target,scale)
        obj.hide_render=False
    for o in marker_objects:
        o.hide_render=True;o.hide_set(True)
    scene.render.film_transparent=False
    for light in [o for o in scene.objects if o.type=='LIGHT']:light.data.energy/=.7
    for im in bpy.data.images:
        if im.source!='VIEWER':im.pack()
    scene['part_labels']='Mesh FACE INT attribute part_id; indices in landmarks.json. Source UVs preserved.'
    scene['topology_status']='Unrepaired high-density reference. See topology.json and topology-edges.json.'
    obj['source_sha256']=info['sha256']
    camera.location=(1.2,-1.2,.6)
    from geometry import aim
    aim(camera,(0,0,.45));camera.data.ortho_scale=1
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'source.blend'))
    print('PREPARE_RESULT',report['parts'],topo['classification'],flush=True)
