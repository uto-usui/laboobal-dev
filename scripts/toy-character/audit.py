"""Read the saved stage files back and check their actual geometry and source identity."""
import hashlib
import json

import bpy
import numpy as np

from generated_mesh import WORK, SOURCE, PARTS, arrays, write_json


def mesh_record(obj):
    p,f=arrays(obj.data)
    uv=np.empty(len(obj.data.loops)*2,np.float32)
    obj.data.uv_layers.active.data.foreach_get('uv',uv)
    labels=np.empty(len(f),np.int32)
    obj.data.attributes['part_id'].data.foreach_get('value',labels)
    return p,f,uv,labels


def run_audit(out):
    design=json.loads((WORK/'prepare/landmarks.json').read_text())
    measured=json.loads((WORK/'face/measurements.json').read_text())
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    assert source_hash==design['sha256']==measured['source_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(WORK/'prepare/source.blend'))
    original=bpy.data.objects['generated_high_density_source']
    prep=mesh_record(original)
    assert len(prep[1])==968114
    assert abs(np.ptp(prep[0][:,2])-.888643890619278)<1e-7
    assert set(np.unique(prep[3]))==set(range(len(PARTS)))
    assert np.allclose(original.matrix_world,np.eye(4))
    assert original.data.uv_layers.active is not None
    bpy.ops.wm.open_mainfile(filepath=str(WORK/'face/face.blend'))
    source=bpy.data.objects['SOURCE_original_high_density_unchanged']
    after=bpy.data.objects['FACE_corrected_high_density']
    before=mesh_record(source);corrected=mesh_record(after)
    assert all(np.array_equal(a,b) for a,b in zip(prep,before))
    assert all(np.array_equal(before[i],corrected[i]) for i in [1,2,3])
    p,f,_,labels=before
    incident=np.bincount(f.ravel(),minlength=len(p))
    head=np.bincount(f[labels==0].ravel(),minlength=len(p))
    outside=(head!=incident)|(head==0)
    delta=corrected[0]-p
    assert np.count_nonzero(np.linalg.norm(delta[outside],axis=1))==0
    assert len(after.modifiers)==0
    assert np.isfinite(corrected[0]).all()
    assert np.allclose(after.matrix_world,np.eye(4))
    embedded=[im for im in bpy.data.images if im.type=='IMAGE' and im.source=='FILE']
    assert len(embedded)>=2 and all(im.packed_file for im in embedded)
    eye_clearance={}
    bowl_error={}
    for side in ['L','R']:
        eye=bpy.data.objects['eye_'+side]
        lid=bpy.data.objects['REVIEW_lid_'+side]
        center=np.array(measured['eyes'][side]['center'])
        r=measured['eyes'][side]['globe_radius']
        points=np.array([list(lid.matrix_world@v.co) for v in lid.data.vertices])
        dist=np.linalg.norm(points-center,axis=1)-r
        eye_clearance[side]=float(dist.min())
        assert dist.min()>.00045
        surface=corrected[0]
        radial=np.sqrt((surface[:,0]-center[0])**2+(surface[:,2]-center[2])**2)
        core=(radial<.014)&(p[:,1]<-.095)&(delta[:,1]>.025)
        error=abs(np.linalg.norm(surface[core]-center,axis=1)-r)
        bowl_error[side]={'sample_vertices':int(core.sum()),'median_m':float(np.median(error)),'p95_m':float(np.quantile(error,.95))}
    nose=(abs(p[:,0])<.021)&(p[:,2]>.664)&(p[:,2]<.692)&(p[:,1]<-.105)
    nose_before=float(p[nose,1].min());nose_after=float(corrected[0][nose,1].min())
    classification=design['topology']['classification']
    assert sum(classification.values())==7503
    result={'passed':True,'input_sha256_unchanged':source_hash,
            'prepare_and_face_source_geometry_uv_labels_identical':True,
            'corrected_topology_uv_labels_identical':True,
            'triangles':len(f),'vertices':len(p),'height_m':float(np.ptp(p[:,2])),
            'outside_head_face_vertices_moved':0,
            'nose_frontmost_y_before_m':nose_before,'nose_frontmost_y_after_m':nose_after,
            'nose_front_envelope_recession_m':nose_after-nose_before,
            'saved_mesh_maximum_displacement_m':float(np.linalg.norm(delta,axis=1).max()),
            'temporary_lid_minimum_globe_clearance_m':eye_clearance,
            'socket_core_radial_error_to_globe_m':bowl_error,
            'embedded_texture_images':len(embedded),
            'shape_sha256_after':hashlib.sha256(corrected[0].astype('<f8').tobytes()).hexdigest(),
            'source_mesh_modifiers':len(source.modifiers),'corrected_mesh_modifiers':len(after.modifiers)}
    write_json(out/'validation.json',result)
    print('AUDIT_RESULT',result,flush=True)
