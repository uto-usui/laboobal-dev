# 面の落とし方と焼き込みの方法

> 2026-11-19 に改めました。下の本文のうち「変形部だけスクリプトでリトポロジーする」部分（関節をまたぐリング、指の仕様、首の筒、目の開口）は使いません。1 回目で、リングを張った胴・袖は形が崩れ、数値で作った手は熊手のような形になりました。体は、元の薄い殻から 26 方向の見通しで中身を詰め（`.work/toy-character/solidify-probe/final.py`、`scripts/toy-character/solidify.py`）、脇より下で腕と胴を切り離し、QuadriFlow で均一な面にしました。頭は元の面を Collapse で減らします。手順と経緯は `scripts/toy-character/prompt-lowpoly2.md`〜`prompt-lowpoly10.md` と README の決めたことの表にあります。UV と焼き込みの章はそのまま使います。

2026-11-18 に Codex に調べさせた結果です（依頼文は `scripts/toy-character/prompt-retopo-research.md`）。この方法で作ります。数値は制作の仕様として決めたもので、このメッシュで測った値ではありません。

採用するのは「BlenderのCollapseで固定部を減面し、変形部だけスクリプトでリトポロジーして元の形へ投影し、新しいUVに色と法線を焼く」工程です。全身を一括でQuadriFlowやAIに通す方法は採りません。

このキャラクターでは、生成結果の価値が高い顔・髪を残しながら、首・肩・肘・指の面配置を確実に管理できます。Blenderの現行マニュアルも、自動リメッシュを変形用の最終トポロジーには推奨せず、元の形に合わせて新しい面を作る工程を案内しています。その面の定義を、今回は人の操作ではなくPythonで行います。[Blender：Remeshing / Retopology](https://docs.blender.org/manual/nl/5.2/modeling/meshes/retopology.html)

2026-11-18時点の公式一覧では、5.2 LTSの更新版は5.2.4です。手元の実行ファイルは`blender --version`で5.2.2 LTSと確認しました。制作開始時には5.2.4へそろえる提案です。今回は更新していません。[Blender公式リリース一覧](https://www.blender.org/releases/)

以下の面数・距離・合格値は、この用途向けに定める制作仕様です。このメッシュで実測済みの性能値ではありません。

1. 元データを保管し、部位と投影先を決める

元のGLBは変更せず、ベイク用の高密度メッシュと、加工する複製を作ります。読み取り確認では、元GLBは約37.9 MBで、ベースカラーとmetallic–roughnessの2画像を持ち、法線マップはありませんでした。法線は形状から新しく焼きます。

実行の入口は制作ルールどおりです。

```sh
blender -b --factory-startup -P scripts/toy-character/build.py
```

読み込みは`bpy.ops.import_scene.gltf(filepath=...)`。読み込んだ座標をBlenderのZ上向きにそろえ、全高を`H=0.89`として扱い、スケールを適用します。以降の距離はこの座標系で決めます。

減面前に、次の単位で面を分類します。「別オブジェクトにすること」と「ベイクの投影領域を分けること」は区別します。

| 部位 | 扱いと切り方 |
|---|---|
| 頭・顔・髪 | 頭ボーンへの固定領域にする。髪と顔は面のラベルを分けるが、同じボーンで動くため、無理に完全分離しない |
| 頭と首 | 顎の下から後頭部へ回る境界を定める。最終メッシュでは、頭の境界と新しい首のリングを接続する |
| 上半身・袖 | 首・背骨・肩・肘が曲がる連続した領域として作り直す。肩を単純な平面で切り離さない |
| 手 | 袖口に隠れる位置で切り離し、指が分かれた低密度メッシュを作る |
| リュック本体 | 背中との接合部で分離し、胸側のボーンへ固定する |
| 肩ベルト | 本体とは別領域にする。胴体に沿って変形させ、腕のウェイトは与えない |
| 下半身・靴 | 今回はほぼ固定なので、形を保つ減面の対象にする |

首・袖口のような単純な断面には`bmesh.ops.bisect_plane()`を使えます。髪際やリュックの接合部は、位置だけで切らず、テクスチャの色境界・曲率・画像から決めた輪郭を面の隣接関係上につないで分類します。`Separate by Loose Parts`では、つながった塊を意味のある部品には分けられません。[BMesh API](https://docs.blender.org/api/5.2/bmesh.ops.html)

塊のままでも、正確なウェイトを明示すれば動かせます。ただし、自動ウェイトや距離だけの転送では、近接した腕と胴体、髪と首、リュックと背中が混ざります。分離は、その誤対応とベイクの誤投影を防ぐために行います。

また、7,503本の非多様体辺は、減面で直るものとして扱いません。重複面・退化面・内部面・本来ない接続を分類し、低密度メッシュに残る不正領域は局所パッチで置き換えます。683本の境界辺は非多様体辺の内数で、全部が「塞ぐべき穴」とは限りません。高密度のベイク元を完全な閉じたメッシュに直す必要はありません。

2. 鼻などの形を、高密度側で先に直す

鼻を小さくする変更は、減面・ベイク前に、高密度メッシュの複製へ行います。鼻周辺だけを位置と面ラベルで限定し、滑らかに減衰する変位かLatticeで変形させます。顔全体を平滑化したり、Voxel Remeshで作り直したりしません。

以降は、この「修正した高密度メッシュ」を形状比較とベイクの正にします。低密度側だけ鼻を縮めると、元の大きな鼻を法線へ焼き戻したり、投影が頬へ飛んだりするためです。

3. 固定部をCollapseで減面する

対象は、頭・顔・髪、下半身・靴、リュック本体です。比率は全身共通の値ではなく、部位ごとの目標三角形数から計算します。

```python
dec = obj.modifiers.new("Reduce", "DECIMATE")
dec.decimate_type = 'COLLAPSE'
dec.ratio = min(1.0, target_triangles / source_triangles)
dec.use_collapse_triangulate = True
dec.use_symmetry = False
dec.vertex_group = "ReduceAllowed"
dec.invert_vertex_group = False
dec.vertex_group_factor = 1.0
```

`ReduceAllowed`は、減面してよい頂点を1、接続境界など動かさない頂点を0にします。5.2.2の実装では、ウェイト0の頂点を含む辺はCollapseの候補から除外されます。元の服や髪にある非対称性を残すため、強制対称化はしません。[5.2.2のCollapse実装](https://raw.githubusercontent.com/blender/blender/v5.2.2/source/blender/bmesh/tools/bmesh_decimate_collapse.cc)、[Decimate API](https://docs.blender.org/api/5.2/bpy.types.DecimateModifier.html)

目標は、最終的に全部合わせて約50,000三角形です。

| 部位 | 三角形数の配分 |
|---|---:|
| 顔・頭・耳。眼球などは除く | 10,000 |
| 髪 | 8,000 |
| 首・胴体・両袖 | 14,000 |
| 下半身・靴 | 6,000 |
| 両手 | 4,000 |
| リュック・ベルト | 3,000 |
| 眼球・まぶた・眼鏡 | 5,000 |
| 合計 | 50,000 |

配分の理由は、顔の輪郭、髪の毛束、ピース時の手へ面を残し、動かさない脚を抑えるためです。法線マップでは輪郭を戻せないので、髪先・鼻・頬・指先の形は実際の面で残します。

Collapseの`delimit={'UV'}`を「UV境界を守る設定」として使う案は採りません。5.2.2では`delimit`を使う処理はPlanar側にあり、Collapseへの設定にはなりません。[5.2.2のDecimate Modifier実装](https://raw.githubusercontent.com/blender/blender/v5.2.2/source/blender/modifiers/intern/MOD_decimate.cc)

4. 首・上半身・腕・手に、変形用の面を作る

ここはCollapseの結果に任せません。既存の形を参照面として、断面リングと肩の接続パッチを`mesh.from_pydata()`で定義します。隣接するリングを四角形でつなぎ、部位を限定した高密度メッシュへ投影します。

初期仕様は次のとおりです。

| 部位 | 面の配置 |
|---|---|
| 首 | 周方向24–32頂点、長さ方向5–7リング。顎側は頭に固定し、下へ向かって首・胸へ配分 |
| 胴体 | 周方向32–48頂点、長さ方向12–18リング。背骨の曲がる範囲へ均等に配置 |
| 肩 | 胸・背中・脇から袖へ回る連続した流れ。肩の付け根だけに細いリングを集中させない |
| 肘 | 曲がる中心と前後に計5–7リング、袖の周方向24–32頂点 |
| 手首 | 前後に計3–5リング。袖口の下で手と重なる部分を確保 |
| 指 | 周方向10–12頂点。曲げる各関節の前・中心・後ろに最低3リング |

投影の基本呼び出しは次です。

```python
sw = low.modifiers.new("FitSource", "SHRINKWRAP")
sw.target = source_part
sw.wrap_method = 'NEAREST_SURFACEPOINT'
sw.wrap_mode = 'ON_SURFACE'
sw.offset = 0.0
sw.vertex_group = "ProjectAllowed"
```

ただし、最も近い面が正しい部位とは限りません。左袖は左袖、指はその指だけを投影先にします。指間・脇・ベルト周辺を全身へのNearestで処理しません。接続リングと関節を支えるリングは投影対象から外し、服の細かいしわは主に法線へ移します。[Shrinkwrap API](https://docs.blender.org/api/5.2/bpy.types.ShrinkwrapModifier.html)

四角形の面そのものは、three.jsでのスキニングの必要条件ではありません。必要なのは、曲げる場所を横切る十分な頂点列と、その配置です。今回、四角形で設計するのは首・背骨・肩・肘・手首・指・まぶた周辺です。固定する顔中央・髪・リュック・脚は三角形のままで構いません。

書き出し用には三角形化を確定します。四角形を使うのは制作時に流れを管理するためで、描画時には三角形になります。関節の対角線も、書き出し任せにせず確定します。[Epic：Skeletal Meshの三角形化](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-skeletal-mesh-pipeline-in-unreal-engine)

5. 低密度側に目の開口部を作り、眼球とまぶたを入れる

順番は「顔の減面 → 鼻の修正を反映 → 眼窩周辺の作り直し → UV → ベイク → まぶたのシェイプキー」です。

今回の画像では目が浅いくぼみになっています。眼球を上から載せるだけにせず、低密度側のくぼみの底を取り除き、眼球が見える開口部を作ります。非多様体の高密度メッシュへBooleanをかける方法は採りません。

- 片目32頂点を基本に、開口部を囲む3–4周のリングを作る。
- 開口部から奥へ短い壁を作り、眼球の裏側や頭の内側が見えないようにする。
- 周囲の頬・鼻との接続を残し、リングの外側を既存の顔へつなぐ。
- 眼球は32分割・16リング程度から作り、正面・横・斜めで、白目とまぶたの接触位置を合わせる。
- 元の目の黒い描画や反射は、新しい眼球・まぶたへ焼かない。新設した眼窩の壁も、周囲の肌色から作る。

まぶたは眼球表面に沿った別メッシュにします。単純な上下移動ではなく、眼球を覆う形へ変形させます。

注意点は、シェイプキーの頂点補間が直線になることです。球面上の「開」と「閉」だけを用意すると、途中で眼球へ食い込む場合があります。今回は`Blink25 / Blink50 / Blink75 / Blink100`の中間形を作り、隣り合う形だけを混ぜる仕様にします。25%刻みの途中も含め、眼球との距離を検査します。

まぶたは頭ボーンに固定し、形状だけをシェイプキーで変えます。眼球は左右別の目ボーンで回します。シェイプキーは、頂点数と頂点順を変える処理を終えてから追加します。[Blender：Shape Keys](https://docs.blender.org/manual/en/5.2/animation/shape_keys/introduction.html)

6. UVを作り直し、色・法線・粗さを焼く

UVは今回は全面的に作り直します。顔の変更、眼窩の開口、変形部の新設があるため、元UVを維持する利点が小さいからです。

縫い目は後頭部、腕の内側、指の側面、服の脇・背面などへ置きます。顔の正面や肘の目立つ側へ細かい島を並べません。

```python
bpy.ops.uv.unwrap(method='ANGLE_BASED')
bpy.ops.uv.average_islands_scale()
# 顔の島だけ、ここで線形寸法を1.5倍にする
bpy.ops.uv.pack_islands(
    rotate=True,
    scale=True,
    margin_method='FRACTION',
    margin=80 / 4096,
)
```

全島を0–1内へ、重複させずに収めます。4096pxで島間80pxを確保すると、2048pxへ縮小した後に約40px残ります。ベイクの余白を片側32px、縮小後16pxにして、島どうしの余白が重ならない設計です。顔は線形1.5倍、面積で約2.25倍のテクセル密度を与えます。[UV API](https://docs.blender.org/api/5.2/bpy.ops.uv.html)

法線を焼く前に、書き出す三角形の分割とスムーズ法線を確定します。まぶたも三角形化を済ませてからシェイプキーを追加します。

ベイクはCyclesのSelected to Activeを使い、対応する高密度部品だけを選択し、低密度部品をactiveにします。低密度側の全マテリアルで、出力画像を持つImage Textureノードをactiveにしておく必要があります。[Blender：Render Baking](https://docs.blender.org/manual/en/latest/render/cycles/baking.html?highlight=bake)

cageは、最終の低密度メッシュを複製して作ります。頂点数・面・面順を同じにし、外側へ調整します。

- 顔・髪：外側への変位0.5–1 mm程度を見込む。
- 服：1–3 mm程度を見込む。
- 指：0.25–0.75 mm程度を見込む。

これは固定の正解値ではありません。部位ごとに、高密度面が低密度面から外へ出る最大量を測り、約0.2 mmの余裕を加えて決めます。必要量が近接部品との隙間の半分を超える場合は、距離を増やさず投影領域を分けます。

明示したcageを使うとき、`max_ray_distance`を誤投影の防止策にはできません。マニュアルでは、この距離設定はcageを使わない場合の設定です。[Selected to ActiveとCage](https://docs.blender.org/manual/en/latest/render/cycles/baking.html?highlight=bake)

主要な呼び出しは次です。選択の設定と出力ノードの準備は省略しています。

```python
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32

bpy.ops.object.bake(
    type='EMIT',
    use_selected_to_active=True,
    use_cage=True,
    cage_object=cage.name,
    margin=32,
    margin_type='EXTEND',
    use_clear=False,
)

bpy.ops.object.bake(
    type='NORMAL',
    normal_space='TANGENT',
    normal_r='POS_X',
    normal_g='POS_Y',
    normal_b='POS_Z',
    use_selected_to_active=True,
    use_cage=True,
    cage_object=cage.name,
    margin=32,
    margin_type='EXTEND',
    use_clear=False,
)
```

ベースカラーは、高密度側のベースカラーを一時的にEmissionへ接続して`EMIT`で焼きます。照明や影は焼きません。粗さ・金属感も、それぞれの値をEmissionへ接続して転写します。共有アトラスは最初に一度だけ初期化し、部品ごとのベイクで消さないようにします。[5.2.2のBake実装](https://raw.githubusercontent.com/blender/blender/v5.2.2/source/blender/editors/object/object_bake_api.cc)

最終テクスチャは次に決めます。

| 画像 | 最終サイズ・扱い |
|---|---|
| キャラクターのベースカラー | 2048²、sRGB |
| キャラクターの接線空間法線 | 2048²、Non-Color、OpenGL形式の+Y |
| metallic–roughness | 1024²、Non-Color。G=roughness、B=metallic |
| 眼球 | 512²、sRGB |

4096²で焼いてから縮小します。法線は縮小後にベクトルを再正規化します。眼鏡の金属感などは別マテリアルの定数で持たせます。

UV保持でベイクを省けるのは、同じUVを保って減面し、色の見え方が許容できる場合です。ただし、減面で失った凹凸は元テクスチャだけでは戻りません。今回は形状・UV・部品を変えるので、色も法線も焼き直すほうを選びます。

7. ウェイトを明示し、GLBへ書き出す

全身への自動ウェイトを仕上げの正にはしません。

- 頭・顔・髪・眼鏡：頭へ100%。
- リュック本体：胸側へ100%。
- 首・背骨・腕・指：設計したリング番号と位置から滑らかに配分。
- 各部位で影響してよいボーンを限定し、最大4影響へ正規化。
- BlenderのArmature Modifierは`use_deform_preserve_volume=False`にして、Web側の通常の線形スキニングで検査。

頭と首の接続頂点は同じ位置・ウェイトにそろえます。オブジェクトを分けただけでは、ウェイトや法線の継ぎ目は解決しません。

書き出しの主要設定は次です。

```python
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=True,
    export_skins=True,
    export_influence_nb=4,
    export_all_influences=False,
    export_morph=True,
    export_morph_normal=True,
    export_tangents=True,
    export_apply=False,
)
```

`export_apply=False`が重要です。手元の5.2.2エクスポーターにも、Apply Modifiersはシェイプキーの書き出しを妨げると明記されています。形を変えるモディファイアは事前に適用し、Armatureとシェイプキーを残して書き出します。[Blender 5.2：glTF](https://docs.blender.org/manual/en/5.2/addons/scene_gltf2.html)

8. MeshoptとKTX2で配信用に圧縮する

減面・ベイク・ウェイトを終えたGLBに、追加の自動簡略化はかけません。Meshoptは形状・モーフ・アニメーションの圧縮に、KTX2はテクスチャのGPU圧縮に使います。[glTF Transform CLI](https://gltf-transform.dev/cli)

今回は色の滑らかさと法線の品質を優先し、全テクスチャをUASTCにします。法線はRDOを無効にします。

```sh
gltf-transform uastc raw.glb textures.glb --level 3 --rdo false --zstd 18
gltf-transform meshopt textures.glb character.glb \
  --level high \
  --quantize-position 14 \
  --quantize-normal 12 \
  --quantize-texcoord 14
gltf-transform inspect character.glb
gltf-transform validate character.glb
```

glTF Transformの現行実装は、Khronosの`ktx` CLIを呼びます。旧記事の`toktx`前提で環境を組まないようにします。[現行のKTX処理](https://raw.githubusercontent.com/donmccurdy/glTF-Transform/main/packages/cli/src/transforms/toktx.ts)

three.js 0.187では、読み込む前に両方のデコーダーを設定します。

```js
const ktx2 = new KTX2Loader()
  .setTranscoderPath('/basis/')
  .detectSupport(renderer);

const loader = new GLTFLoader()
  .setKTX2Loader(ktx2)
  .setMeshoptDecoder(MeshoptDecoder);
```

BasisのJS/WASMは使用するthree.js版にそろえます。[r187のGLTFLoader](https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/jsm/loaders/GLTFLoader.js)、[KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)

配信予算は、50,000三角形を目標、60,000を上限、UV分割後の頂点数40,000以内、描画呼び出しは影を除いて4–8回を目標にします。GLBは5–8 MiBを目標、10 MiBを上限にします。圧縮後の実容量は未確認です。

候補の比較は次のとおりです。「100万入力」は方式として扱えるかで、このキャラクターでの実行時間・成功率は未測定です。

| 候補 | 関節・顔への適性 | 100万三角形の入力 | スクリプト・Mac | ライセンスと不採用理由 |
|---|---|---|---|---|
| Blender Collapse | 固定部の形を残すのに適する。関節ループは作らない | 対象にできる。不正接続の修復は別 | `bpy`、Apple Silicon版あり | GPL。固定部に採用。全身への単独適用は不採用 |
| QuadriFlow | 四角形になるが、関節用の流れは保証しない | 規模より入力の接続が問題。Blender版は多様体・法線整合性を検査する | `bpy.ops.object.quadriflow_remesh(...)`、Mac対応 | Blender内はGPL。今回の不正接続を先に直し、さらに関節を直す工程になる |
| Voxel → QuadriFlow | 接続の清掃には使えるが、細部や隙間を変える | 扱えるが、細い指・毛束を守る解像度は重くなる | `obj.data.remesh_voxel_size`、`bpy.ops.object.voxel_remesh()` | Blender内はGPL。顔、髪際、指間を変えるリスクに対し、最終関節の保証がない |
| Instant Meshes | 曲率に沿う面を作れるが、関節の意味は分からない | 大規模入力の実績あり | CLIあり。macOS対応、M5でのビルド・実行は未確認 | BSD系。肩・指の修正が残るため不採用 |
| PyMeshLab UV付きQuadric Collapse | UV保持で色を再利用しやすい。関節ループは作らない | 大規模三角形メッシュ向け | Python、macOS ARM64 wheelあり | GPL-3.0。今回は新UVと新しい変形面が必要なので利点が小さい |
| PyMeshLab Isotropic Remeshing | 三角形の大きさ・形を整える。関節用の流れは作らない | 対象にできる。反復処理 | Python、Mac対応 | GPL-3.0。UV再転写が必要で、関節設計も残る |
| Quad Remesher | 材質境界などで誘導できる四角形化 | 高密度メッシュ向け | Mac版あり。Blender 5.2との接続は未確認 | 有料・独自ライセンス。条件外 |
| ZRemesher | ガイド・密度・部分リトポを使える | 高密度スカルプト向け | Mac版あり。今回必要な無人処理の成立は未確認 | 有料・独自ライセンス。条件外 |

QuadriFlowの入力条件は5.2.2の実装で確認できます。境界辺は許容しますが、3面以上が共有する辺などを含む不整合な入力は、そのまま通りません。[5.2.2のQuadriFlow実装](https://raw.githubusercontent.com/blender/blender/v5.2.2/source/blender/editors/object/object_remesh.cc)

Instant Meshesには`Instant Meshes -o low.obj -f 25000 -r 4 -p 4 -d input.obj`というCLI経路があり、大規模入力が弱点という理由で外したわけではありません。[公式CLI実装](https://raw.githubusercontent.com/wjakob/instant-meshes/master/src/main.cpp)、[論文・大規模処理例](https://rgl.epfl.ch/publications/Jakob2015Instant)、[ライセンス](https://github.com/wjakob/instant-meshes/blob/master/LICENSE.txt)

PyMeshLabの該当APIは`meshing_decimation_quadric_edge_collapse_with_texture()`と`meshing_isotropic_explicit_remeshing()`です。前者はUVパラメータ化の保持、後者は辺の分割・Collapse・反転・平滑化・再投影を行います。現行PyPIにはmacOS ARM64版があります。[フィルター仕様](https://pymeshlab.readthedocs.io/en/latest/filter_list.html)、[配布とライセンス](https://pypi.org/project/pymeshlab/)

有料ツールから取り入れるべき定石は、「部位の境界と密度を指定し、必要なら部分的に作り直す」考え方です。自動四角形化だけで完成させる前提にはしません。[Quad Remesherのガイド](https://www.exoside.com/quadremesherdata/QuadRemesher_1.3_UserDoc.pdf)、[ZRemesherの部分リトポ](https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/topology/zremesher/partial-mesh/partial-mesh.html)

AI系は、入力を点群などへ変換して新しいメッシュを生成する方式と、元の面を簡略化する方式を混同しないことが重要です。

| 候補 | 現在確認できた状態 | 今回選ばない理由 |
|---|---|---|
| MeshAnything V2 | コード・重み・CLIあり。公式環境はCUDA。出力上限1,600面 | これは入力面数の上限ではない。ただし、全身の顔・指・毛束を残す今回の出力には少なすぎる。Mac公式経路も確認できない。[公式実装](https://github.com/buaacyw/MeshAnythingV2) |
| DeepMesh | コード・重みあり。CUDA環境とCUDAを使う推論実装 | 元の顔の形を所定誤差内に保ち、指定関節へループを置く保証がない。Mac対応は未確認。[公式実装](https://github.com/zhaorw02/DeepMesh) |
| FastMesh／3DV 2026 | 推論コード・V1K/V4Kの重み公開済み。推論に`.cuda()`を使用 | 公開済みという点は古い情報から更新が必要。ただし、Macの公式経路と今回の変形品質は確認できない。[README](https://github.com/jhkim0759/FastMesh)、[推論実装](https://github.com/jhkim0759/FastMesh/blob/main/inference.py) |
| QuadGPT／ICLR 2026 | 四角形を直接生成する論文・公式ページを確認。コード・重みの公開は未確認 | ローカルで使える無料の工程を確定できない。論文の四角形品質と、このキャラクターの関節変形品質は別。[公式ページ](https://hitcslj.github.io/QuadGPT/) |
| Meshy T2／2026 | 公式リポジトリは公開準備中の案内で、コード・重みは未確認 | 今使える制作経路にできない。[公式リポジトリ](https://github.com/meshy-dev/meshy-t2) |

MeshAnything V2とFastMeshはS-Labの非商用ライセンスです。DeepMeshはREADMEのMITバッジと`LICENSE`が食い違い、実際の`LICENSE`本文はApache-2.0です。重みを含めた条件は別途確認が必要です。QuadGPTはローカル配布物のライセンスも未確認です。[MeshAnything V2 LICENSE](https://github.com/buaacyw/MeshAnythingV2/blob/main/LICENSE.txt)、[FastMesh LICENSE](https://github.com/jhkim0759/FastMesh/blob/main/LICENSE)、[DeepMesh LICENSE](https://github.com/zhaorw02/DeepMesh/blob/main/LICENSE)

無料の従来型ツールでは、AutoRemesherにも現在CLIとmacOSの経路があります。MITですが、学習型AIではなく幾何処理の組み合わせです。これも関節配置をこちらで設計する必要が残るため、採用工程には足しません。[AutoRemesher公式](https://github.com/huxingyi/autoremesher)

合格判定は、次の数値と画像を一緒に使います。距離だけ良くても、顔の見え方や曲げた姿勢が悪ければ不合格です。

| 検査 | 合格基準 |
|---|---|
| 保持した形状の距離 | 顔・髪：P95 ≤0.5 mm、標本最大≤1.5 mm。服・脚・リュック：P95 ≤1 mm、標本最大≤3 mm |
| 輪郭 | 全身1024px・8方向でシルエットIoU ≥0.995、輪郭距離P95 ≤1px。顔は別途1024pxの拡大画像で比較 |
| 接続 | 意図した開口部以外の境界なし。3面以上で共有する辺・退化面・重複面なし |
| UV | 0–1内、意図しない重複0、ゼロ面積の島0。2048px相当で島間約40px |
| ベイク | 可視面の投影未対応0。目の黒色が肌へ移るなど、異なる部位の色混入0 |
| 法線 | 同じ照明で高密度版と比較し、滑らかな可視領域の法線角度差P95 ≤10°を目標。継ぎ目・黒い斑点・凹凸反転なし |
| ウェイト | 未割当0、最大4影響、合計と1の差≤10⁻⁴。頭・髪への首や腕の混入0 |
| 曲げた形 | 関節付近の新しい自己交差0。潰れた三角形、袖の裂け、指の接着なし |
| GLB | glTF Validatorのエラー0。圧縮前後でボーン名・モーフ名・動きが一致 |
| Web | 想定する最低性能の端末で計測し、描画開始後のフレーム時間P95 ≤16.7 msを目標 |

距離は部品ごとに、高→低と低→高の両方向で測ります。PyMeshLabの`get_hausdorff_distance()`で、面の面積に応じた標本50万点／方向に加え、頂点も検査します。`savesample=True`で得た距離からP95を計算します。これは標本による近似で、厳密なHausdorff距離とは呼びません。Blender内で完結させる場合は`mathutils.bvhtree.BVHTree.find_nearest()`でも同じ検査を組めます。[PyMeshLabの距離測定](https://pymeshlab.readthedocs.io/en/latest/filter_list.html#get-hausdorff-distance)、[BVH API](https://docs.blender.org/api/5.2/mathutils.bvhtree.html)

鼻の縮小、眼窩の開口、新設した指間など、意図して変えた領域は元メッシュとの一致検査から明示して分けます。鼻は修正済みの高密度版、目とまぶたはデザイン画と接触検査を正にします。

必要な画像は、次に固定します。

- Aポーズの8方向：白い材質、色だけ、法線表示、ワイヤーフレーム。
- 顔の正面・左右斜め・横：高密度版、低密度版、デザイン画を同じ画角で並べる。
- 首：左右30°、上下20°。背骨：左右・前後15°。
- 肩：挙上90°。肘：90°と120°。手首：前後45°。指：各関節の最大曲げ。
- まばたき：0、12.5、25、37.5、50、62.5、75、87.5、100%。
- 法線：大きな光を正面・横・斜めへ移した比較。圧縮前後も同じ画像で比べる。

大きなつまずきは、すべて同じ工程内で防ぎます。全身への最近傍投影は部位限定で防ぎ、髪際の色混入は投影ラベルで防ぎます。UV・三角形化・法線をベイク後に変えず、まぶたへApply Modifiersをかけません。ベースカラーに最初から描かれた影やハイライトは、Emissionで焼いても消えないため、元画像の見え方を確認して塗り直します。

置いた仮定と未確認事項は次のとおりです。

- 表示は全身高さ600–900px程度、顔だけ極端に接写しないWebデモを想定しました。50,000三角形・2048pxはこの前提の予算です。
- 口や頬の表情変形はなく、顔・髪は頭へ固定する前提です。
- 「ピース」は指定された人差し指・中指の可動範囲として扱いました。ただし、開いた手から一般的なピースを作るには、親指・薬指・小指を握る動きも必要です。指定の2本だけではその動きはできません。
- 正確な切断輪郭、眼球半径、cageの変位量、部位別の元面数は未確認です。画像と全高だけから数値を捏造せず、工程1で計測して確定する項目です。
- このメッシュでの減面、リトポロジー、ベイク、リグ、Web実測は未実行です。読み取り専用環境ではBlenderの背景起動が終了コード139で停止したため、APIは公式資料・5.2.2ソース・手元のエクスポーター定義で確認しました。5.2.4での実行確認も未確認です。
- AI各方式のM5上の非公式移植、QuadGPTのローカル用コード・重み、各候補のこのモデルでの処理時間は未確認です。

制作で最初に行うのは、元の顔と髪を保ったまま、部位ラベル・接続境界・関節リングの設計図を確定することです。採用する減面方式は上記で固定し、候補ツールを順番に試す工程にはしません。ファイルは変更していません。

