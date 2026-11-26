# 目・まばたき・眼鏡の作り方

2026-11-19 に Codex に調べさせた結果です（依頼文は `scripts/toy-character/prompt-eyes-research.md`）。調査だけで、手元ではまだ試していません。工程 9 はこの方式で作ります。

おすすめは、目を画像として残し、「白目とまぶたの画像」「UV で動かす黒目」を分ける方式です。まばたきは開眼・半閉じ・閉眼の画像を順に切り替えます。眼鏡は厚みのある別メッシュにして、頭の骨に固定します。

この制作では、球を作ることより、現在の顔につながるまぶたを作ることが難所です。画像方式なら、生成済みの顔の形を保ち、有機的な形を数値で新造せずに必要な動きを付けられます。ただし、v4 のような眼球の立体感と、照明に応じて動く目の映り込みは弱くなります。これは今回の制約を優先した判断です。

| 方式 | three.js での動かし方 | 形を作る作業と、この制作での適性 |
|---|---|---|
| ① 別の眼球＋まぶたのシェイプキー | 眼球または眼球の骨を回転させて視線を向け、まぶたの morph weight を動かす | 球は簡単。難しいのは目の開口、目頭・目尻、球を覆って閉じるまぶた。途中で球を突き抜けない形も必要。既製のまぶたを合わせる方法はあるが、現在の顔に機械的に取り付けられるとは確認できていない。次点 |
| ② 画像の目＋黒目の別層＋画像のまばたき | 黒目のテクスチャの `offset` を連続更新。まぶたは画像をまとめたアトラスのコマを切り替える | 顔の形と頂点位置を変えずに作れる。画像の分離、位置合わせ、肌との境目の処理が中心。今回の第一候補 |
| ③ 顔の目周辺だけをシェイプキーで変形 | 顔メッシュの目周辺の morph weight を動かす。黒目の追従には別途、画像または眼球の仕組みが要る | 減面済みの三角形を動かすだけでは、描かれた白目・黒目がつぶれる。まぶたとして折れる面の流れと閉眼形の制作、色の貼り分けが必要。今回の顔には最も不向き |

①と③は完全に別系統ではありません。①の眼球を覆うまぶたを、③のように顔メッシュの一部として作ることもあります。glTF の morph target は頂点属性の差分と重みを保存する仕組みで、適切なまぶたの形を自動で作るものではありません。Blender も、シェイプキーを作る前に面の構成を確定することを勧めています。[glTF 仕様](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#meshes-morph-targets)、[Blender の制作手順](https://docs.blender.org/manual/en/5.2/animation/shape_keys/workflow.html)

実例として、①は Poole のキャラ制作講座で、虹彩とまぶたのシェイプキーを分けて作っています。③に相当する顔メッシュの表情制作は、Blender Studio の Rain／Snow の工程で、内側のまぶたを作った頭に表情を付けています。どちらも、まぶたの造形や調整を制作工程として持っています。[Poole：21:35 からまぶたの制作](https://www.youtube.com/watch?v=6M4bkaavT6c&t=1295s)、[Blender Studio：頭の内側とまぶたの制作](https://studio.blender.org/training/stylized-character-workflow/5da058f0e2e7bac4cc81bd56/)

②の実例には、制作者自身が公開した Boxxo のファン制作講座があり、画像のコマ切り替えで顔を動かしています。商業作品では Animal Logic が『LEGO Batman Movie』で顔をテクスチャとして生成する仕組みを公開しています。後者は単純な画像切り替えではなく、2D の輪郭を変形して画像を作る方式ですが、「立体の頭に描かれた顔で演技させる」という選択の実例です。[Boxxo 制作講座](https://www.youtube.com/watch?v=6yAoHZSTg0I)、[Animal Logic・SIGGRAPH 2017 資料](https://animallogic.com/wp-content/uploads/2023/06/Scalable-Blendshape-System-for-Texture-Based-Facial-Animation.pdf)

次点は①です。目の接写や横顔まで v4 の立体感を求める場合に適しています。ただし、その場合は既製の眼球・まぶたの面と閉眼形を流用し、顔への適合を検証する工程が必要です。画像生成で開眼・閉眼の絵を作っても、頂点の対応がそろった morph target には変換できません。

制作手順の骨子は次のとおりです。

1. **画像生成では目の見た目だけを作る。**  
   v4 と現在の顔の正面画像を参照に、黒目を除いた開眼・半閉じ・閉眼と、虹彩・瞳孔を含む黒目の素材を作ります。閉眼は白目を消すだけでなく、肌と閉じたまぶたの線を描きます。生成画像全体を顔へ貼り直さず、目の内側だけを採り、周囲の肌・眉・鼻は現在の画像から保ちます。生成結果の位置ずれは画像の位置合わせで補います。

2. **Blender では現在の目周辺の面を再利用する。**  
   目周辺を専用のマテリアルと UV に分け、元の黒目を画像から除きます。同じ面を複製して黒目用の層にし、形を描き直しません。開眼時の陰が AO や法線にも焼かれているなら、閉眼画像だけでは消えないため、目の範囲の焼き込みも整理します。

3. **黒目の移動と、見える範囲を分ける。**  
   黒目の画像だけ UV を動かし、まぶたの開口マスクは顔に固定します。半閉じではマスクも対応するコマに替え、完全に閉じたときは黒目を隠します。これで、黒目が目尻や閉じたまぶたの上へはみ出すのを防ぎます。

4. **眼鏡は幾何形状として作る。**  
   左右の円、鼻のブリッジ、つるをカーブで作り、丸い断面の Bevel を付けてメッシュに変換します。これは顔や手の造形とは違い、円と管で表せる部品です。Blender のカーブはこの用途に使えます。[Blender：カーブの厚みと断面](https://docs.blender.org/manual/zh-hant/5.2/modeling/curves/properties/geometry.html)

眼鏡は、フレームと左右のレンズを別部品にし、それぞれ頭の骨の子にします。自動ウェイトは不要です。glTF 上でも頭の joint node の子として持たせれば剛体として追従します。代わりに全頂点を頭の骨へ重み 1.0 にする方法もありますが、今回は親子関係で十分です。[Blender：骨への親子付け](https://docs.blender.org/manual/en/5.2/scene_layout/object/editing/parent.html)

面数の初期配分案は、円周 64 分割・断面 8 分割です。左右の円だけで約 2,048 三角形になり、ブリッジ・つる・レンズを含めて眼鏡に約 3,000 三角形を見込みます。これは提案値で、現在の本体との合計が 65,000 以内かは実装時に数えます。

three.js では、次の点に注意します。

- **UV の動きは Web 側で制御する。**  
  `Texture.offset` と `repeat` で視線とコマを変えられます。ただし、`KHR_texture_transform` が保存する UV 変換と、その値のアニメーションは別です。glTF 本体のアニメーション対象は骨などの変換と morph weight で、r187 の `KHR_animation_pointer` 対応には別プラグインが必要です。今回は追加せず、JavaScript で制御します。[Texture](https://threejs.org/docs/pages/Texture.html)、[glTF の UV 変換仕様](https://raw.githubusercontent.com/KhronosGroup/glTF/main/extensions/2.0/Khronos/KHR_texture_transform/README.md)、[r187 GLTFLoader](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/jsm/loaders/GLTFLoader.js)

- **黒目の層は通常の半透明描画を避ける。**  
  `map` に透明背景の黒目、`alphaMap` にまぶたの開口マスクを使い、`alphaTest` で切り抜きます。r187 は両テクスチャの UV 変換を別々に扱えます。`alphaMap` は緑チャンネルを読むので、白黒画像にします。重なった面のちらつきには小さな `polygonOffset` を使い、深度判定は残します。[r187 の UV 処理](https://raw.githubusercontent.com/mrdoob/three.js/r187/src/renderers/shaders/ShaderChunk/uv_vertex.glsl.js)、[alphaMap の仕様](https://threejs.org/docs/pages/MeshStandardMaterial.html#alphaMap)

- **細いフレームは線ではなく管にする。**  
  `LineBasicMaterial.linewidth` は WebGL／WebGPU では無視され、線は 1 ピクセル幅になります。管でも投影幅が 1 ピクセル未満ならちらつくため、MSAA と実際の表示サイズで確かめます。金属の roughness は少し持たせ、鋭すぎる反射を避けるのが初期案です。[線幅の仕様](https://threejs.org/docs/pages/LineBasicMaterial.html#linewidth)

- **レンズは薄い透過材にする。**  
  初期案は `MeshPhysicalMaterial` の `transmission=1`、`opacity=1`、`thickness=0` です。通常の `transparent=true` と低い opacity だけでガラスを表す方法は、描画順の問題と反射の弱さがあります。three.js の半透明ソートは面単位ではなくオブジェクト単位です。また r187 の透過処理との整合を取るため、レンズの背後にある黒目は前述の切り抜き描画にします。[透過材の仕様](https://threejs.org/docs/pages/MeshPhysicalMaterial.html#transmission)、[透明描画の制約](https://threejs.org/manual/pages/transparency.html)、[r187 の透過描画処理](https://raw.githubusercontent.com/mrdoob/three.js/r187/src/renderers/WebGLRenderer.js)

将来の口も、笑顔・閉じた口・開いた口などの画像アトラスにすれば、今回の目と同じ制御にそろえられます。現在の口の浅い立体形状は残せます。ただし、あごや頬が動く、大きく口が開いて奥が見える表現には、口腔と顔の morph が別途必要です。

置いた仮定は、README にある「全身を画面高の約 8 割、頭は左右 ±25°・上下 ±10°」を評価範囲とし、目の接写や自由な周回は求めないことです。また、GLB の読み込み後に専用の目の制御を設定し、補助画像を Web 側で読み込めるものとしました。汎用ビューアで GLB だけを開いても同じ目の動きが再生される、という条件は置いていません。

README の工程 9 にある「開口・眼球・まぶた」は、この推薦では「目の画像の分離と制御」に変わります。今回は調査のみで、文書の変更、画像生成、インストール、動作試験は行っていません。

