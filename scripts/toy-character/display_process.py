"""Geometry/image operations outside Blender, exclusively in venv-geo."""
import sys,json,time,os,importlib.metadata as md
from pathlib import Path
import numpy as np
from PIL import Image
OUT=Path(sys.argv[1]).resolve();PHASE=sys.argv[2]
# MeshLab writes its dummy image in the process directory. Keep that artifact
# with all other private intermediate files.
os.chdir(OUT)
def log(s):
    print(s,flush=True)
    with (OUT/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')
def simplify():
    import pymeshlab as ml
    versions={n:md.version(n) for n in ['pymeshlab','numpy','pillow','scipy','opencv-python','libigl']}
    log('2 依存（追加なし、既存venv-geo）: '+json.dumps(versions))
    src={k:np.load(OUT/(k+'-source.npz')) for k in ['body','head','cap']}
    counts={k:len(v['f']) for k,v in src.items()};total=sum(counts.values());reportpath=OUT/('decimation-native.json' if os.environ.get('DISPLAY_NATIVE')=='1' else 'decimation.json');report=json.loads(reportpath.read_text()) if reportpath.exists() else {}
    for budget in ([int(os.environ['DISPLAY_BUDGET'])] if 'DISPLAY_BUDGET' in os.environ else [100000,200000,400000]):
        dest=OUT/str(budget);dest.mkdir(exist_ok=True);report[budget]={}
        targets={k:round(budget*v/total) for k,v in counts.items()};targets['head']+=budget-sum(targets.values())
        for key,d in src.items():
            if os.environ.get('DISPLAY_ONLY_HEAD') and key!='head':continue
            start=time.monotonic();p=d['p'];faces=d['f'];uv=d['uv'];materials=d['mat'];chunks=[]
            for mat in np.unique(materials)[::-1]:
                use=materials==mat;f=faces[use];wuv=uv[use].reshape(-1,2)
                # Join coincident positions only as geometry indices. UV remains on
                # face corners and participates in the textured collapse metric.
                unique,inv=np.unique(p[f].reshape(-1,3),axis=0,return_inverse=True);f=inv.reshape(-1,3).astype(np.int32)
                nonzero=np.all(np.diff(np.sort(f,axis=1),axis=1)!=0,axis=1);wuv=wuv.reshape(-1,3,2)[nonzero].reshape(-1,2);f=f[nonzero]
                import igl
                native=os.environ.get('DISPLAY_NATIVE')=='1'
                if not native:
                    split_p,split_f,ids=igl.split_nonmanifold(unique,f.astype(np.int64))
                    assert np.array_equal(split_p[split_f],unique[f]), 'Split displaced source geometry'
                    unique,f=split_p,split_f
                obj=OUT/(f'{key}-'+('native' if native else 'manifold')+f'-{mat}.obj')
                if not obj.exists():
                    mtl=obj.with_suffix('.mtl');mtl.write_text('newmtl tex\nmap_Kd source-body-0.png\n')
                    with obj.open('w') as stream:
                        stream.write(f'mtllib {mtl.name}\n')
                        np.savetxt(stream,unique,fmt='v %.12g %.12g %.12g')
                        np.savetxt(stream,wuv,fmt='vt %.12g %.12g')
                        stream.write('usemtl tex\n')
                        indices=np.empty((len(f),6),int);indices[:,::2]=f+1;indices[:,1::2]=np.arange(1,len(f)*3+1).reshape(-1,3)
                        np.savetxt(stream,indices,fmt='f %d/%d %d/%d %d/%d')
                ms=ml.MeshSet();ms.load_new_mesh(str(obj))
                # QEM uses UV distances, not image pixels. OBJ binds all wedges
                # to texture 0; the actual original images stay in Blender.
                ms.apply_filter('set_texture_per_mesh',use_dummy_texture=True)
                target=max(16,targets[key]-sum(len(chunk[1]) for chunk in chunks) if mat==np.unique(materials)[0] else round(targets[key]*use.sum()/len(materials)))
                ms.apply_filter('meshing_decimation_quadric_edge_collapse_with_texture',targetfacenum=target,qualitythr=.3,extratcoordw=1.0,preserveboundary=native,boundaryweight=1.0,optimalplacement=True,preservenormal=True,planarquadric=True)
                m=ms.current_mesh();chunks.append((m.vertex_matrix(),m.face_matrix(),m.wedge_tex_coord_matrix().reshape(-1,3,2),int(mat)))
            ps=[];fs=[];us=[];mats=[];offset=0
            for p,f,u,m in chunks:ps.append(p);fs.append(f+offset);us.append(u);mats.extend([m]*len(f));offset+=len(p)
            np.savez_compressed(dest/(key+'.npz'),p=np.concatenate(ps),f=np.concatenate(fs),uv=np.concatenate(us),mat=np.array(mats,np.int32))
            report[budget][key]={'target':targets[key],'triangles':sum(len(f) for f in fs),'vertices':offset,'seconds':time.monotonic()-start}
            reportpath.write_text(json.dumps(report,indent=2));log(f'2 {budget} {key}: '+json.dumps(report[budget][key]))
    log('2 UV付きQEM完了。元画像の焼き直しなし。根拠: https://pymeshlab.readthedocs.io/en/latest/filter_list.html#meshing-decimation-quadric-edge-collapse-with-texture')
def assets():
    old=OUT.parent/'eyes'
    atlas=np.array(Image.open(old/'eyelid-atlas.png').convert('RGB'),float)/255
    clean=np.array(Image.open(old/'skin-without-old-eyes.png').convert('RGB'),float)/255
    ref=np.array(Image.open(OUT/'eye-source.png').convert('RGB'),float)/255
    patch=np.array(Image.open(old/'eye-patch-mask.png').convert('L'),float)/255
    yy,xx=np.indices(patch.shape);skin=ref.copy()
    for cx in [360,656]:
        r=np.sqrt(((xx-cx)/88)**2+((yy-410)/64)**2)
        ring=(r>1.28)&(r<1.65)&(yy>325)&(yy<510)&(ref[:,:,0]>.4)&(ref[:,:,1]>.2)
        x=(xx-cx)/100;y=(yy-410)/100;basis=np.stack([np.ones_like(x),x,y,x*x,x*y,y*y],-1)
        fit=np.linalg.lstsq(basis[ring],ref[ring],rcond=None)[0];local=np.clip(basis@fit,0,1)
        use=(r<1.28);skin[use]=local[use]
    frames=[]
    for frame in np.split(atlas,3,axis=1):
        feature=np.clip(np.linalg.norm(frame-clean,axis=2)/.055,0,1)
        composite=skin*(1-feature[:,:,None])+frame*feature[:,:,None]
        composite=ref*(1-patch[:,:,None])+composite*patch[:,:,None]
        frames.append(np.uint8(np.clip(composite,0,1)*255+.5))
    Image.fromarray(np.concatenate(frames,axis=1)).save(OUT/'eye-lids-display.png')
    Image.fromarray(np.uint8(np.clip(skin,0,1)*255+.5)).save(OUT/'eye-skin.png')
    outside=patch==0
    stats={'old_pupils_removed_from_visible_eye_faces':True,'original_texture_images_modified':False,'projection_resolution':[1024,1024],'atlas_resolution':[3072,1024],'outside_eye_patch_max_pixel_difference':max(int(abs(frame.astype(int)-np.uint8(ref*255+.5).astype(int))[outside].max()) for frame in frames),'eyes_camera':'eyes/projection-camera.json','iris':'export/eye-iris.png','aperture':'export/eye-aperture-orm.png'}
    (OUT/'eye-images.json').write_text(json.dumps(stats,indent=2))
    log('5 目範囲の元の面をeye_lidsで置き換えて古い黒目を除く。元画像の変更なし。工程9の3コマの白目・まぶたと元頭の肌色を合成し、目範囲外の画素差0。工程11の黒目・開口を同じカメラで再投影。'+json.dumps(stats))
if PHASE=='simplify':simplify()
elif PHASE=='assets':assets()
