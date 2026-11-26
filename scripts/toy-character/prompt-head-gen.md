# 依頼: 頭を別に生成し、デザイン画に合わせる（fidelity-method.md の手順 1〜4）

`docs/toy-character/fidelity-method.md` に決めた手順の 1〜4 を実行してください。方法は決めてあるので、ほかの方法を試して比べる必要はありません。設定値もそこに書いたものを使います。前提が曖昧なところは妥当な仮定を置いて最後まで進め、置いた仮定は最終回答に書いてください。

書き込むのは `scripts/toy-character/` と `.work/toy-character/` の中だけ。コミットはしないでください。Blender の処理は `scripts/toy-character/build.py` の段として足し（今ある段は残す）、生成のコマンドもスクリプトにして、同じ手順で作り直せるようにしてください。

## やること

1. 比べる土台（手順 1）
   - 全高 1m・靴底 Z=0・正面 -Y にそろえた体の作業用コピーを作る（元の GLB は変えない）
   - デザイン画 `docs/toy-character/design/v4.png` に対応点を付けて `.work/toy-character/fidelity/design-landmarks.json` に固定する。少なくとも、頭頂、あご先、左右のこめかみと頬の輪郭、左右の目（開口の左右端と上下端、虹彩の中心と径）、鼻先、左右の鼻翼、口の左右端と中央、左右の耳。点を重ねた画像 `design-landmarks.png` も作り、自分で開いて位置が正しいか確かめる
   - 比べる用のカメラ（正面の平行投影、デザイン画の座標と対応するもの）を決める
2. 頭の入力（手順 2）: 眼鏡なし版から頭を切り出し、`.work/toy-character/img3d/fidelity/input/head-front-rgba.png` を作る。アルファの欠け（髪先、耳、あご）と床の影がないかを画像で確かめる
3. 生成（手順 3）: seed 42、43、44、45 の 4 本。設定は fidelity-method.md の表のとおり
4. 選ぶ（手順 3 の終わり）: 穴・二重の耳・髪の欠けで外し、残りを輪郭の誤差、目・鼻・口の位置と大きさ、斜めからの形の順で比べる。数値を `.work/toy-character/fidelity/seed-scores.json` に書く
5. 合わせる（手順 4）: 選んだ頭をデザイン画の頭の高さと顔の幅で等方スケールし、あご・耳・顔の中心に置く。残ったずれは Laplacian Deform（制御用のメッシュを介して）で対応点に寄せる。首・後頭部・動かさない髪際は固定する。大きく違うところは無理に直さず、不合格として残す。この段ではまだ首を体とつながない（並べて置くだけでよい）

## 出力（レンダは自分で開いて見ること）

- `.work/toy-character/fidelity/seeds.png`: 4 本の頭を、正面と斜め 45 度で並べたもの。同じ光
- `.work/toy-character/fidelity/compare-head.png`: 左から「デザイン画 v4 の頭」「全身から生成した頭（Before）」「頭だけを生成したもの（選んだ seed、合わせる前）」「合わせた後」。正面と斜め 45 度の 2 段。同じ光、同じ縮尺
- `.work/toy-character/fidelity/overlay-front.png`: 合わせた後の正面を、デザイン画に 50% で重ね、対応点の誤差を矢印か点で示したもの
- `.work/toy-character/fidelity/body-with-head.png`: 体（全身から生成したもの）に、合わせた頭を首の位置で置いた全身。正面と斜め 45 度
- 対応点の誤差の表（fidelity-method.md の「近い」の基準の目・鼻・口・輪郭の項目）を `.work/toy-character/fidelity/metrics.json` に

手順と、見て気づいたことは `.work/toy-character/fidelity/log.md` に書く。

## 最終回答

日本語で、結論から。選んだ seed とその理由、基準の各項目の値と合否、デザイン画とまだ違うところ、生成にかかった時間、置いた仮定。前置きと繰り返しは削る。
