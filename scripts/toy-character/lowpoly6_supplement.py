"""Complete the historical metrics fields and preserve exact probe evidence."""
import sys,json
from pathlib import Path
import numpy as np,igl
from scipy import ndimage
out=Path(sys.argv[1]);m=json.loads((out/'metrics.json').read_text());g=np.load(out/'filled-grid.npz');a=g['solid'];origin=g['lo'];h=float(g['h'])
m['probe_reproduction']=json.loads((out/'probe-reproduction.json').read_text())
m['probe_horizontal_sections']={f'{z:.2f}':{'regions':int(ndimage.label(a[:,:,int(round((z-origin[2])/h))])[1]),'holes':int(ndimage.label(~a[:,:,int(round((z-origin[2])/h))])[1]-1)} for z in [.05,.08,.11,.15,.20,.26,.35,.45,.55,.65]}
m['probe_reproduction']['distance_rounded_matches']=all(v['rounded_matches_reference'] for v in m['grid_and_r']['probe_vertex_distances'].values() if v['reference_rounded_mm'] is not None)
m['probe_reproduction']['literal_probe_stdout']=(out/'probe-replay/stdout.log').read_text()
m['outlier_vertex_maps']={}
names={2:'neck',3:'torso',4:'sleeve_L',5:'sleeve_R',6:'hand_L',7:'hand_R',8:'backpack',9:'shoulder_straps',10:'legs_shoes',0:'face_head',1:'hair'}
for part in ['body','head']:
    source=np.load(out/f'original_{part}.npz');low=np.load(out/f'final_{part}.npz')
    sd,_,_=igl.point_mesh_squared_distance(source['V'].astype(float),low['V'].astype(float),low['F'].astype(np.int64));mm=np.sqrt(sd)*1000
    for pid in np.unique(source['labels']):
        ids=np.unique(source['F'][source['labels']==pid]);i=ids[np.argmax(mm[ids])];m['outlier_vertex_maps'][names[int(pid)]]={'max_mm':float(mm[i]),'max_xyz_m':source['V'][i].tolist(),'direction':'original vertices to processed whole body/head; reference only'}
m['outlier_method']='Rendered map: processed vertices to original triangles (green 0, yellow 1, red >=2mm). outlier_vertex_maps: original vertex maxima to processed surface, reference only. No reverse-distance acceptance.'
n=m['construction']['neck'];n['overlap_shortfall_m']=.010-n['overlap_m'];n['actual_gap_m']=max(0,-n['overlap_m']);n['after_uniform']={'body_top_m':m['topology']['uniform']['main_component_bounds_m'][1][2],'head_bottom_m':n['head_bottom_m'],'actual_vertical_overlap_m':m['topology']['uniform']['main_component_bounds_m'][1][2]-n['head_bottom_m']}
m['head_geometry_unchanged']=m['saved_verification']['head_geometry_unchanged'];m['head_geometry_unchanged_scope']='same rebuilt/cut head before and after weights; differs from lowpoly5 as requested'
m['arm_motion']={k:v['regional_motion'] for k,v in m['saved_verification']['arm_motion'].items()}
m['acceptance']['armpit_separation']=all(v[s]['arm_torso_separate'] and v[s]['closed'] for v in m['armpit_sections_after_uniform'].values() for s in ['L','R'])
m['acceptance']['probe_exact_reproduction']=m['probe_reproduction']['same_solid_grid'] and m['probe_reproduction']['same_marching_cubes_faces'] and m['probe_reproduction']['max_marching_cubes_vertex_difference_m']==0 and m['probe_reproduction']['distance_rounded_matches']
m['acceptance']['triangle_budget']=m['triangle_budget']['pass']
m['acceptance']['head_transform']=m['saved_verification']['head_transform_unchanged']
m['acceptance']['limb_isolation']=all(r['legs']['max_displacement_mm']<.001 and r['lower_torso']['max_displacement_mm']<.001 for r in m['arm_motion'].values())
m['acceptance']['neck_overlap']=n['overlap_m']>=.010
m['numeric_pose_acceptance']={}
for pose,r in m['joint_pose_metrics'].items():
    if pose.startswith(('neck_','spine_')):
        good=all(r[k]['flipped_faces']<=10 and r[k]['max_stretch']<=2 for k in ['neck','chest'])
    elif pose.startswith('arm_'):good=m['elbows'][pose]['numeric_pass']
    elif pose=='arms_toward_body10':good=r['whole_body']['flipped_faces']==0
    else:good=r['whole_body']['flipped_faces']==0
    m['numeric_pose_acceptance'][pose]=good
m['acceptance']['all_pose_numeric']=all(m['numeric_pose_acceptance'].values())
(out/'construction.json').write_text(json.dumps(m['construction'],ensure_ascii=False,indent=2)+'\n')
(out/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'probe_reproduction':{k:v for k,v in m['probe_reproduction'].items() if k!='literal_probe_stdout'},'numeric_pose_acceptance':m['numeric_pose_acceptance']},ensure_ascii=False))
