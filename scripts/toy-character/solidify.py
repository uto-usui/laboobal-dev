"""External geometry steps for lowpoly5; all coordinates derive from input surfaces."""
import argparse, json, time, importlib.metadata, hashlib
from pathlib import Path
import numpy as np
import igl
from scipy import ndimage, sparse
from scipy.sparse.csgraph import connected_components
from skimage.measure import marching_cubes


def note(out, message):
    print(message, flush=True)
    with (out/'log.md').open('a') as stream:
        stream.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+message+'\n')


def main_component(v, f):
    edges=np.concatenate([f[:,[0,1]], f[:,[1,2]], f[:,[2,0]]])
    graph=sparse.coo_matrix((np.ones(len(edges),np.uint8),(edges[:,0],edges[:,1])),shape=(len(v),len(v)))
    n, labels=connected_components(graph,directed=False)
    counts=np.bincount(labels);keep=labels==counts.argmax();ids=np.full(len(v),-1);ids[keep]=np.arange(keep.sum())
    return v[keep],ids[f[np.all(keep[f],1)]].astype(np.int32),{'components_before':n,'vertices_by_component':sorted(counts.tolist(),reverse=True)}


def fill_lowpoly5(out, r):
    h=.002
    source=np.load(out/'source.npz');v=source['V'].astype(np.float64);f=source['F'].astype(np.int64)
    cache=out/'winding.npz'
    digest=hashlib.sha256(v.tobytes()+f.tobytes()).hexdigest()
    cached=np.load(cache) if cache.exists() else None
    if cached is not None and 'source_sha256' in cached and str(cached['source_sha256'])==digest:
        shell=cached['shell'];lo=cached['lo']
    else:
        # Padding exceeds the maximum dilation, keeping the corner in exterior air.
        lo=v.min(0)-h*14;hi=v.max(0)+h*14
        shape=np.ceil((hi-lo)/h).astype(int)+1;shell=np.empty(tuple(shape),bool)
        yz=np.stack(np.meshgrid(np.arange(shape[1]),np.arange(shape[2]),indexing='ij'),-1).reshape(-1,2)
        for i in range(0,shape[0],8):
            xs=np.arange(i,min(i+8,shape[0]));q=np.empty((len(xs),len(yz),3))
            q[:,:,0]=lo[0]+xs[:,None]*h;q[:,:,1:]=lo[1:]+yz[None,:,:]*h
            w=igl.fast_winding_number(v,f,q.reshape(-1,3))
            shell[i:i+len(xs)]=(np.abs(w)>.5).reshape(len(xs),shape[1],shape[2])
            if i%40==0:note(out,f'winding x={i}/{shape[0]}')
        np.savez_compressed(cache,shell=shell,lo=lo,h=h,source_sha256=digest)
    structure=ndimage.generate_binary_structure(3,1)
    thick=ndimage.binary_dilation(shell,structure,iterations=r)
    labels,n=ndimage.label(~thick,structure)
    outside=labels==labels[0,0,0];del labels,thick
    solid=ndimage.binary_erosion(~outside,structure,iterations=r);del outside
    np.savez_compressed(out/'filled-grid.npz',solid=solid,lo=lo,h=h,r=r)
    v,f,_,_=marching_cubes(solid.astype(np.float32),.5,spacing=(h,h,h),allow_degenerate=False,gradient_direction='descent')
    v+=lo;v,f,components=main_component(v,f)
    np.savez(out/'filled.npz',V=v,F=f)
    report={'grid_m':h,'r':r,'dilation_m':h*r,'erosion_m':h*r,'structure':'6-connected Manhattan ball; scipy generate_binary_structure(3,1)','shell_threshold':'abs(fast_winding_number)>0.5','grid_shape':list(solid.shape),'shell_points':int(shell.sum()),'solid_points':int(solid.sum()),'components':components,'vertices':len(v),'triangles':len(f)}
    (out/'solidification.json').write_text(json.dumps(report,indent=2)+'\n')
    note(out,'充填 '+json.dumps(report))


def escape_counts(wall):
    """Exact straight-line recurrence, scanning each ray once instead of relaxing it."""
    import itertools
    free=~wall; counts=np.zeros(wall.shape,np.int8)
    for direction in [d for d in itertools.product([-1,0,1],repeat=3) if any(d)]:
        axis=next(i for i,d in enumerate(direction) if d)
        a=np.moveaxis(free,axis,0); result=np.moveaxis(np.empty_like(free),axis,0)
        other=[direction[k] for k in range(3) if k!=axis]
        previous=np.ones(a.shape[1:],bool)
        indices=range(len(a)-1,-1,-1) if direction[axis]>0 else range(len(a))
        src=tuple(slice(max(d,0),previous.shape[k]+min(d,0)) for k,d in enumerate(other))
        dst=tuple(slice(max(-d,0),previous.shape[k]-max(d,0)) for k,d in enumerate(other))
        for i in indices:
            visible=np.ones_like(previous);visible[dst]=previous[src]
            result[i]=a[i]&visible;previous=result[i]
        counts+=np.moveaxis(result,0,axis)
    return counts


def largest(solid):
    labels,_=ndimage.label(solid)
    return labels==np.argmax(np.bincount(labels.ravel())[1:])+1


def fill(out):
    from scipy.spatial import cKDTree
    h=.002; source=np.load(out/'source.npz');v=source['V'].astype(np.float64);f=source['F'].astype(np.int64);labels=source['labels']
    digest=hashlib.sha256(v.tobytes()+f.tobytes()).hexdigest();cache=out/'winding.npz'
    if cache.exists() and str(np.load(cache)['source_sha256'])==digest:
        data=np.load(cache);shell=data['shell'];lo=data['lo']
    else:
        # Match carve.py's r=7 padding and np.arange grid, including its origin.
        lo=v.min(0)-10*h;hi=v.max(0)+10*h
        axes=[np.arange(lo[i],hi[i]+h,h) for i in range(3)];shape=[len(a) for a in axes]
        shell=np.empty(shape,bool);yz=np.stack(np.meshgrid(axes[1],axes[2],indexing='ij'),-1).reshape(-1,2)
        for i in range(0,shape[0],8):
            xs=axes[0][i:i+8];q=np.empty((len(xs),len(yz),3));q[:,:,0]=xs[:,None];q[:,:,1:]=yz[None]
            shell[i:i+len(xs)]=(np.abs(igl.fast_winding_number(v,f,q.reshape(-1,3)))>.5).reshape(len(xs),shape[1],shape[2])
            if i%40==0:note(out,f'winding x={i}/{shape[0]}')
        np.savez_compressed(cache,shell=shell,lo=lo,h=h,source_sha256=digest)
    st=ndimage.generate_binary_structure(3,1)
    wall=ndimage.binary_dilation(shell,st,iterations=1)
    countfile=out/'escape-counts.npy';countmeta=out/'escape-cache.json'
    signature={'source_sha256':digest,'grid_shape':list(wall.shape),'grid_origin':lo.tolist(),'h':h}
    if countfile.exists() and countmeta.exists() and json.loads(countmeta.read_text())==signature:counts=np.load(countfile)
    else:
        note(out,'26方向の見通しを計算');counts=escape_counts(wall);np.save(countfile,counts);countmeta.write_text(json.dumps(signature,indent=2)+'\n')
    def idx(value,axis):return int(round((value-lo[axis])/h))
    solid=counts<3;iz=idx(.186,2);solid[:,:,:iz]=counts[:,:,:iz]<5
    solid=ndimage.binary_erosion(largest(ndimage.binary_fill_holes(solid)),st,iterations=1)
    slit=np.zeros(solid.shape,bool);tree=cKDTree(v[f].mean(1))
    for sid,hid,xr in [(5,7,(-.26,-.05)),(4,6,(.05,.26))]:
        xs=slice(idx(xr[0],0),idx(xr[1],0));zs=slice(idx(.40,2),idx(.567,2));sub=solid[xs,:,zs];ii=np.argwhere(sub)
        _,nn=tree.query(lo+(ii+[xs.start,0,zs.start])*h);isarm=np.isin(labels[nn],[sid,hid])
        arm=np.zeros(sub.shape,bool);other=np.zeros(sub.shape,bool);arm[tuple(ii[isarm].T)]=True;other[tuple(ii[~isarm].T)]=True
        cut=ndimage.binary_dilation(arm&ndimage.binary_dilation(other,st),st)&sub
        sub[cut]=False;solid[xs,:,zs]=sub;slit[xs,:,zs]|=cut
    solid=largest(solid)
    np.savez_compressed(out/'filled-grid.npz',solid=solid,lo=lo,h=h,slit=slit)
    vv,ff,_,_=marching_cubes(solid.astype(np.float32),.5,spacing=(h,h,h));vv+=lo
    # Preserve the probe's vertex sampling so its rounded P95 can be reproduced.
    sd,fi,_=igl.point_mesh_squared_distance(vv,v,f);lab=labels[fi];dist=np.sqrt(sd)*1000
    near=ndimage.binary_dilation(slit,st,iterations=2);vi=np.floor((vv-lo)/h+.5).astype(int);excluded=near[tuple(vi.T)]
    names={2:'neck',3:'torso',4:'sleeve_L',5:'sleeve_R',6:'hand_L',7:'hand_R',8:'backpack',9:'shoulder_straps',10:'legs_shoes',0:'face_head',1:'hair'}
    reference={3:1.3,4:.8,5:.8,6:.8,7:.8,8:1.1,9:2.1,10:1.0}
    distances={names[k]:{'p95_mm':float(np.percentile(dist[(lab==k)&~excluded],95)),'reference_rounded_mm':reference.get(k),'rounded_matches_reference':round(float(np.percentile(dist[(lab==k)&~excluded],95)),1)==reference.get(k)} for k in np.unique(lab)}
    sections={side:{f'{z:.2f}':{'regions':int(ndimage.label(solid[xs,:,idx(z,2)])[1]),'holes':int(ndimage.label(~solid[xs,:,idx(z,2)])[1]-1)} for z in np.arange(.46,.561,.02)} for side,xs in [('R',slice(0,idx(0,0))),('L',slice(idx(0,0),None))]}
    np.savez(out/'filled.npz',V=vv,F=ff,slit_vertices=excluded)
    report={'method':'26 straight escape directions and semantic armpit slit; final.py','grid_m':h,'grid_shape':list(solid.shape),'grid_origin':lo.tolist(),'shell_threshold':'abs(fast_winding_number)>0.5','wall_dilation_cells':1,'escape_threshold':3,'lower_leg_threshold':5,'knee_z_m':.186,'erosion_cells':1,'armpit_z_m':.567,'slit_z_range_m':[.40,.567],'slit_x_ranges_m':[[-.26,-.05],[.05,.26]],'slit_cells_removed':int(slit.sum()),'slit_distance_exclusion_dilation_cells':2,'probe_vertex_distances':distances,'armpit_sections':sections,'vertices':len(vv),'triangles':len(ff),'source_sha256':digest}
    (out/'solidification.json').write_text(json.dumps(report,indent=2)+'\n');note(out,'充填 '+json.dumps(report))


def remesh(out):
    import pymeshlab as ml
    d=np.load(out/'remesh-input.npz');v=d['V'];f=d['F']
    area=np.linalg.norm(np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]),axis=1).sum()/2
    target=np.sqrt(4*area/(np.sqrt(3)*30000))
    ms=ml.MeshSet();ms.add_mesh(ml.Mesh(v,f))
    ms.apply_filter('meshing_isotropic_explicit_remeshing',iterations=8,adaptive=False,selectedonly=False,targetlen=ml.PureValue(float(target)),featuredeg=180,checksurfdist=True,maxsurfdist=ml.PureValue(.002),splitflag=True,collapseflag=True,swapflag=True,smoothflag=True,reprojectflag=True)
    m=ms.current_mesh();np.savez(out/'isotropic.npz',V=m.vertex_matrix(),F=m.face_matrix())
    note(out,'isotropic '+json.dumps({'target_edge_m':float(target),'surface_area_m2':float(area),'triangle_budget':30000,'triangles':m.face_number(),'vertices':m.vertex_number(),'iterations':8}))
    (out/'isotropic.json').write_text(json.dumps({'target_edge_m':float(target),'surface_area_m2':float(area),'triangle_budget':30000,'triangles':m.face_number(),'vertices':m.vertex_number(),'iterations':8},indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('out',type=Path);parser.add_argument('--r',type=int,default=6);parser.add_argument('--remesh',action='store_true');parser.add_argument('--legacy',action='store_true');args=parser.parse_args()
    allowed=Path(__file__).resolve().parents[2]/'.work/toy-character'
    if not args.out.resolve().is_relative_to(allowed.resolve()):parser.error('output outside work area')
    versions={name:importlib.metadata.version(name) for name in ['libigl','scikit-image','scipy','numpy','pymeshlab']}
    note(args.out,'依存 '+json.dumps(versions));(args.out/'versions.json').write_text(json.dumps(versions,indent=2))
    if args.remesh:remesh(args.out)
    elif args.legacy:fill_lowpoly5(args.out,args.r)
    else:fill(args.out)
