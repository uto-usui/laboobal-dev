# 差し替える手の候補とつなぎ方

2026-11-19 に Codex に調べさせた結果です（依頼文は `scripts/toy-character/prompt-hand-research.md`）。調査だけで、Blender 5.2.2 での動作はまだ確かめていません。工程 6b では MPFB 2.0.18 の子ども体型の手を `game_engine` リグとウェイトごと切り出し、袖口の内側で重ねてつなぎます。

おすすめは、MPFB 2.0.18 の子ども体型から、`game_engine` リグとウェイトを残して手を切り出す方法です。コア素材は CC0、全指に骨があり、Python の生成入口も公開されています。Blender 5.2 向けの修正も公式に確認できました。次点は、VRoid Studio の標準素材だけで作ったモデルです。

今回は資料とソースの調査だけです。ファイルの作成・変更、インストール、Blender での動作確認はしていません。以下の「対応」は公式情報によるもので、5.2.2 での実機確認とは区別しています。

MPFB について確認できたことは次のとおりです。

| 項目 | 確認結果 |
|---|---|
| 最新版 | 2026-11-19 時点で **2.0.18**。2026-10-10 公開 |
| Blender 5.x／5.2 | 拡張の対応範囲は「4.2 LTS 以降」。2.0.18 のリリースノートには、5.2 の API 変更への対応と、5.x の EEVEE 対応が明記されている |
| ベースメッシュ・リグ | どちらも CC0。付属のターゲット、テクスチャ、ポーズ、メッシュ情報も同じ |
| 手だけの公開 GLB | 切り出し・改変・再配布が可能。著作権表示・作者表記の義務なし |
| 拡張のコード | GPL-3.0-or-later。生成した GLB に GPL を適用する必要はない |
| 追加アセット | 外部作者の素材は個別ライセンス。今回ならコアのメッシュ・リグだけを使えばよい |

出典は、[拡張のバージョン履歴](https://extensions.blender.org/add-ons/mpfb/versions/)、[2.0.18 リリースノート](https://static.makehumancommunity.org/mpfb/releases/release_2018.html)、素材と出力を明確に区別した[リポジトリの LICENSE](https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md)、[公式のライセンス説明](https://static.makehumancommunity.org/about/license.html)です。5.2 対応の根拠はありますが、今回必要な「人体生成→手の抽出→GLB 出力」の一連の成功までは未検証です。

指の構成は、公式のリグ定義を読みました。

| リグ | 手の構成 | 今回の向き不向き |
|---|---|---|
| `game_engine` | 手の骨＋親指・人差し指・中指・薬指・小指に各3本。全身53骨 | 第一候補。ピースに必要な曲げ・指の開きを直接操作でき、構成も小さい |
| `default` | 各指3本に加え、4本の中手骨。全身163骨 | 手のひらの丸まりまで調整したい場合に有利。手だけ残せば全身の骨数は問題にならない |
| Rigify | `rigify.human` に各指3本と4本の palm 骨がある。生成後は制御骨などが加わる | Blender 内でポーズを付けるには便利。ただし GLB 用には変形骨と焼き込んだ動きに整理する手間が増える |

定義は [game_engine](https://github.com/makehumancommunity/mpfb2/blob/master/src/mpfb/data/rigs/standard/rig.game_engine.json)、[default](https://github.com/makehumancommunity/mpfb2/blob/master/src/mpfb/data/rigs/standard/rig.default.json)、[Rigify](https://github.com/makehumancommunity/mpfb2/blob/master/src/mpfb/data/rigs/rigify/rig.human.json)で確認できます。`game_engine` では `thumb_01_l`〜`thumb_03_l`、`index_01_l`〜`index_03_l` などが独立しています。

手の面数は、公式の [`base.obj`](https://github.com/makehumancommunity/mpfb2/blob/master/src/mpfb/data/3dobjs/base.obj) と [`weights.game_engine.json`](https://github.com/makehumancommunity/mpfb2/blob/master/src/mpfb/data/rigs/standard/weights.game_engine.json)から集計しました。補助形状を除き、「手＋全指のウェイト合計が0.5を超える頂点だけでできた面」を数えると、左右とも片手 **1,581四角面＝3,162三角形**でした。これは切断前の領域集計であり、納品時の確定面数ではありません。前腕をどれだけ袖へ差し込むかでも変わります。

子ども体型は、`age` を使います。公式定義は `baby=0.0`、`child=0.1875`、`young=0.5`、`old=1.0` です。まず `age=0.1875` を出発点にし、`weight`・`muscle`・`proportions`・`height` を既存のターゲットで調整できます。ただし、子ども体型にすればデザイン画のおもちゃ風の手になるとは限りません。丸さの適合は白い材質での比較が必要です。[age の定義](https://github.com/makehumancommunity/mpfb2/blob/master/src/mpfb/entities/objectproperties/humanproperties/age.json)

ほかの候補は、次の評価になりました。

| 候補 | 公開 GLB の条件 | 指・見た目と Blender 5.2 の確かさ |
|---|---|---|
| **VRoid Studio の標準モデル** | CC0ではない。特別な条件のない標準素材なら、書き出したモデルの改変・販売が許可されており、手を組み込んだ固定 GLB の配布にも使えると判断する。外部素材・サンプルモデルの個別条件は別途適用 | 公式ヘルプに握り拳・開いた手・ピースがある。VRM Add-on は公式に Blender 2.93〜5.3 対応。今回の書き出しデータ自体は未検査。次点 |
| **Quaternius Universal Base Characters** | 作者の配布ページで CC0。改変・再配布・表記省略が可能。無料 Standard 版があり、`.blend` を含む Source 版は有料 | Humanoid リグ・glTF 配布は公式確認済み。ただし全指の骨は今回一次資料で確認できず、要件充足を断定できない。5.2 での読み込みは標準 glTF 経由で可能と推定 |
| **Kenney Animated Characters** | 対象パックは CC0。改変・再配布・表記省略が可能 | デフォルメ候補だが、全5指の骨を公式資料で確認できなかった。今回の手の供給元としては保留。5.2 動作も未確認 |
| **Mixamo の既製キャラクター** | 商用作品での使用は可能だが、キャラクター・アニメーションを素材として再配布することは禁止。今回のダウンロード用 GLB の供給元には採らない。クレジットは任意 | Blender への取り込み可否より、配布条件で外れる |
| **Ready Player Me** | 作者名義の公開モデルの一例は CC BY-NC-SA。表示・ライセンスリンク・改変の明示・非商用・継承条件が付く。今回の素材を無条件で再利用可能にはできない | 現行の公式規約サイトを取得できず、生成モデル全般の現在の条件と5.2動作は確定できなかった。採用候補から外す |

根拠は、[VRoid のガイドライン](https://vroid.com/en/studio/guidelines)、[手のポーズの公式説明](https://vroid.pixiv.help/hc/en-us/articles/21044295117721-How-to-use-the-posing-feature)、[VRM Add-on の対応範囲](https://vrm-addon-for-blender.info/en-us/)、[Quaternius の公式配布ページ](https://quaternius.itch.io/universal-base-characters)、[Kenney の対象パック](https://kenney.nl/assets/animated-characters-protagonists)、[Adobe の配布条件FAQ](https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400)、[Ready Player Me 名義のモデル](https://sketchfab.com/3d-models/ready-player-me-male-avatar-ca294f737d0b4293bb29bfcd8a0a27dd)です。丸い見た目と全指の骨の両方を確認できた、より有力な CC0 素材は今回見つかりませんでした。

MPFB を headless で使う骨子は、次の形です。

1. **Blender のユーザー領域を専用フォルダに分ける。** `BLENDER_USER_RESOURCES` は設定・拡張などの保存先を置き換えます。既存の `BLENDER_USER_CONFIG`・`BLENDER_USER_SCRIPTS`・`BLENDER_USER_EXTENSIONS` などが設定されている場合は、そちらが優先されるため外します。
2. **公式拡張 ZIP を専用領域の `user_default` に入れる。** 下は後の実装用の例で、今回は実行していません。

```sh
toy_blender_resources="$PWD/.work/toy-character/blender-user"

BLENDER_USER_RESOURCES="$toy_blender_resources" \
  blender --command extension install-file \
  --repo user_default --enable /path/to/mpfb-2.0.18.zip

BLENDER_USER_RESOURCES="$toy_blender_resources" \
  blender -b --factory-startup \
  --addons bl_ext.user_default.mpfb \
  -P extract_hands.py
```

`--no-prefs` は設定ファイルの更新を抑える指定であり、インストール自体を無書き込みにする指定ではありません。保存先の隔離には環境変数を使います。[ディレクトリの公式説明](https://docs.blender.org/manual/id/5.2/advanced/blender_directory_layout.html)、[拡張CLIの公式説明](https://docs.blender.org/manual/en/5.2/advanced/command_line/extension_arguments.html)

3. **Python では UI 演算子よりサービス関数を使う。** 入口は `HumanService.create_human(macro_detail_dict=...)` と `HumanService.add_builtin_rig(basemesh, "game_engine", import_weights=True)` です。UI 演算子は `bpy.ops.mpfb.create_human()`。拡張は `bl_ext.<repository>.mpfb` 配下になるため、公式サンプルもモジュール名の末尾からサービスを探す方式を使っています。[人体生成サンプル](https://github.com/makehumancommunity/mpfb2/blob/master/script_samples/01_create_a_basic_human.py)、[リグ追加サンプル](https://github.com/makehumancommunity/mpfb2/blob/master/script_samples/03_adding_a_default_rig.py)
4. **子ども体型の確定→リグと付属ウェイトの読み込み→形状の確定→補助形状の削除→手と短い前腕の抽出、の順にする。** 補助形状は骨の配置に使われるため、リグ追加より先に消しません。公式には `mpfb.bake_shapekeys` と `mpfb.delete_helpers` があります。
5. **メッシュと骨を同じ変換で位置合わせし、開いた手・握り拳・ピースを確認する。** 親指は曲げるだけでなく、付け根で掌側へ回して薬指・小指を押さえる形にします。最終的には変形骨を残して GLB に出し、three.js 側でも同じポーズになることを確認します。

Robust Weight Transfer は、今回の最初の手の差し替えには必須ではありません。既製の手の形とウェイトをそのまま残せば、指のウェイトを移す必要がないためです。

- 論文の[著者実装](https://github.com/rin-23/RobustSkinWeightsTransferCode)は **MIT**。コードを再配布するなら著作権表示と許諾文を残します。サンプル実行の依存は libigl の Python bindings と Polyscope です。
- [Blender 版](https://github.com/sentfromspacevr/robust-weight-transfer)のルート `LICENSE` は **GPLv3**。一方、Python ファイルのヘッダーは GPLv2-or-later で、表記が一致していません。拡張のコードを再配布する場合は、この差を解消せず単一の版と断定すべきではありません。処理した GLB にコードを含める必要はありません。
- 最新リリースは **v1.1.9**。公式に示されているのは最低 Blender 3.1 と、5.1 用の `robust-weight-transfer-libigl26.zip` です。**5.2 対応は確定できませんでした**。5.2 で依存のインストールに失敗した報告もあります。[リリース](https://github.com/sentfromspacevr/robust-weight-transfer/releases/tag/v1.1.9)、[5.2 の報告](https://github.com/sentfromspacevr/robust-weight-transfer/issues/26)
- Blender 側で追加する主な依存は **SciPy、libigl、robust-laplacian**。NumPy は Blender 同梱分を使います。main は `libigl==2.5.1`、`libigl26` ブランチは `libigl==2.6.1`。v1.1.9 はクラッシュ対策として `robust_laplacian==1.0.0` に制限しています。将来導入する際は、同梱 Python と macOS のCPUに対応する wheel があることを確認する必要があります。[main の依存](https://github.com/sentfromspacevr/robust-weight-transfer/blob/main/requirements.txt)、[libigl26 の依存](https://github.com/sentfromspacevr/robust-weight-transfer/blob/libigl26/requirements.txt)

論文の方式は、信頼できる対応点だけ先に転送し、残りを補間するものです。既製の手を新たなトポロジーへ作り替える場合には候補になりますが、生成した癒着指に足りない形や骨を作るものではありません。[論文の著者ページ](https://www.dgp.toronto.edu/~rinat/projects/RobustSkinWeightsTransfer/index.html)

つなぎ方は、今回なら袖口の内側で重ねる方法を勧めます。以下は公式の編集・転送機能を踏まえた、このキャラ向けの判断です。

1. **位置と大きさを合わせる。** 全高1mのキャラ上で、手首中心・中指方向・掌の表裏・親指側を基準に合わせます。手のメッシュと指の骨を一緒に動かし、まず等方スケールで手長を合わせます。左右は左右それぞれの既製の手を使います。
2. **袖の中に短い前腕を差し込む。** 手と服の面を同じ位置に置かず、手首を曲げても切り口が見えない深さまで重ねます。見えない元の手は除去します。異なる頂点数の境界を無理につなぐ必要がありません。
3. **骨を既存の腕につなぐ。** 指のウェイトは保持し、手首骨をキャラの前腕骨へ接続します。差し込み部分だけ前腕／手首のウェイトを調整し、正規化します。全身の Automatic Weights を手にかけ直す必要はありません。
4. **露出した肌同士をつなぐ場合だけ溶接する。** 境界の分割数と輪郭を合わせ、Bridge Edge Loops などでつなぎます。`Ctrl+J` だけでは頂点は溶接されません。接続帯のウェイト・法線・UVも整える必要があり、今回は追加の形状編集を避けられる重ね方が適しています。[Bridge Edge Loops](https://docs.blender.org/manual/en/5.2/modeling/meshes/editing/edge/bridge_edge_loops.html)
5. **転送が必要なら範囲を絞る。** 標準の Data Transfer の Vertex Groups／Nearest Face Interpolated を使い、接続帯だけへ転送します。開いた手の状態で行い、隣の指のウェイトを拾わないよう距離と対象を制限します。[Data Transfer](https://docs.blender.org/manual/en/5.2/modeling/modifiers/modify/data_transfer.html)
6. **肌色は最終材質で合わせる。** MPFB の写実的な皮膚材質を持ち込まず、キャラと同じ Principled BSDF の肌色・粗さ・法線の強さにそろえます。最初は単色で比較し、必要なら同じ肌テクスチャへ焼き込みます。GLB が読み取るのは Principled BSDF の Base Color などです。[glTF の公式説明](https://docs.blender.org/manual/en/5.2/addons/scene_gltf2.html)

置いた仮定は、袖口が不透明で接合部を隠せること、配布物が固定のキャラ GLB であること、素材は無料で入手できる範囲を使うこと、全高1mは最終モデルの縮尺であって人体素材の実年齢を指定しないことです。手の形は既製メッシュと既存の体型パラメータを使い、頂点座標から作りません。