"""Fixed stage-8 Marigold inference; all caches and outputs stay in the work area."""
import os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'.work/toy-character'
os.environ['HF_HOME']=str(WORK/'color-cache/huggingface')
os.environ['TORCH_HOME']=str(WORK/'color-cache/torch')
os.environ['PYTORCH_ENABLE_MPS_FALLBACK']='1'
import time,json,platform,importlib.metadata
import numpy as np
from PIL import Image
import torch
from diffusers import MarigoldIntrinsicsPipeline
OUT=WORK/'color'

def log(s):
    print(s,flush=True)
    with (OUT/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')

def main():
    OUT.mkdir(exist_ok=True)
    versions={p:importlib.metadata.version(p) for p in ['torch','diffusers','transformers','accelerate','numpy','pillow','scipy','scikit-image','opencv-python-headless','huggingface-hub']}
    versions.update(python=platform.python_version(),macos=platform.mac_ver()[0],device='mps',dtype='float32')
    log('環境: uv venv .work/toy-character/venv-color; '+json.dumps(versions))
    (OUT/'versions.json').write_text(json.dumps(versions,indent=2))
    log('方針: hair4 の形・UV・ウェイトを保持し、ベースカラー画像だけを変更する。リュックは再生成・数値造形せず生成形状のまま色だけを直す。')
    revision=(WORK/'color-cache/huggingface/hub/models--prs-eth--marigold-iid-appearance-v1-1/refs/main')
    if revision.exists():log('Marigold モデルrevision: '+revision.read_text().strip())
    pipe=MarigoldIntrinsicsPipeline.from_pretrained('prs-eth/marigold-iid-appearance-v1-1',torch_dtype=torch.float32).to('mps')
    pipe.enable_attention_slicing()
    log('Marigold 固定条件: processing_resolution=768, num_inference_steps=4, ensemble_size=3, seed=0, match_input_resolution=True。推定albedoはsRGB。')
    for name,path in [('front',ROOT/'docs/toy-character/design/v4.png'),('back',ROOT/'docs/toy-character/design/turnaround-back.png'),('side',ROOT/'docs/toy-character/design/turnaround-side.png'),('noglasses',WORK/'img3d/input/v4-noglasses.png')]:
        target=OUT/(name+'-iid.npz')
        if target.exists():
            log(name+' 推定済みを再利用')
            for k,arr in enumerate(np.load(target)['prediction']):Image.fromarray(np.uint8(np.clip(arr,0,1)*255+.5)).save(OUT/f'{name}-estimate-{k}.png')
            continue
        start=time.time()
        result=pipe(Image.open(path).convert('RGB'),processing_resolution=768,num_inference_steps=4,ensemble_size=3,generator=torch.Generator('cpu').manual_seed(0),match_input_resolution=True,output_type='np',output_uncertainty=True)
        pred=result.prediction
        np.savez_compressed(target,prediction=pred,uncertainty=result.uncertainty)
        log(name+' 推定完了 '+str(pred.shape)+' '+str(round(time.time()-start,1))+'秒')
        # Pipeline arranges modalities along axis 1, in model.config order.
        for k,arr in enumerate(pred):Image.fromarray(np.uint8(np.clip(arr,0,1)*255+.5)).save(OUT/f'{name}-estimate-{k}.png')
        (OUT/'iid-config.json').write_text(json.dumps(dict(pipe.config),default=str,indent=2))
        torch.mps.empty_cache()
if __name__=='__main__':main()
