"""Write the review notes from the final measurements, without editing project docs."""
import json
from pathlib import Path

root = Path('.work/toy-character/city')
assets = json.loads((root / 'assets.json').read_text())
capture = json.loads((root / 'capture-report.json').read_text())
budget = assets['budget']['bundled']
rows = []
for m in capture['measurements']:
    rows.append(f"| {m['variant']} | {m['width']}×{m['height']} | {m['dpr']} | {m['cpuThrottling']}倍 | {m['raf']['medianMs']:.1f} | {m['raf']['p95Ms']:.1f} | {m['raf']['samples']} |")
table = '\n'.join(rows)
asset_rows = []
for a in assets['assets']:
    image = a['images'][0]
    asset_rows.append(f"| {a['id']} | {a['triangles']:,} | {a['materials']} | {image['width']}×{image['height']} / {image['bytes']:,} | {a['sourceGlbBytes']:,} | {a['variants']['A']['meshoptBytes']:,} | {a['variants']['B']['meshoptBytes']:,} |")
asset_table = '\n'.join(asset_rows)
text = f'''# 街角の静止見本

B を推します。生成りと暖かい灰色を土台に、屋根と木をくすんだ青緑へ落とすことで、キャラの顔と服の鮮やかさが目立ちます。A は元の緑の屋根・木と青い窓が強く、背景にも目が向きます。B のつやを抑えた材質はキャラのおもちゃのような雰囲気に合いますが、木の角張った輪郭とキャラの細かな質感の差は残っています。

## 作者に見てもらう画像

- [A：配布のままの色、3サイズ](city-A.png)
- [B：8色の塗り、3サイズ](city-B.png)
- [1440×900 の A / B 比較](compare.png)
- [独立した見本ページ](index.html?variant=B)
- [素材の測定結果](assets.json)
- [撮影・フレーム時間の生データ](capture-report.json)

横並びの画像は各撮影を CSS ピクセルの大きさへ縮めて並べています。元の DPR 2 / 3 の PNG は `shots/` に残しています。A・Bの横並び画像と比較画像を実際に開き、頭・両手・靴が切れず、歩道・家並み・木が分かることを確認しました。顔に向かう3本のレイも全6枚で遮蔽物なしでした。

## 素材とライセンス

すべて Kenney 公式の [City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban)、[City Kit (Commercial)](https://kenney.nl/assets/city-kit-commercial)、[City Kit (Roads)](https://kenney.nl/assets/city-kit-roads) から取得しました。すべて CC0-1.0 です。ZIP 原本と同梱の `License.txt`、配布ページの HTML、ZIP の SHA-256 を `vendor/` に保存しました。Quaternius からの補充はしていません。

住宅4種、店舗として使う建物2種、ひさし、道路・曲がり角・歩道、木2種、柵、街灯の14部品です。GLB 原本は外部のカラーマップ PNG を参照するため、原本 GLB のバイト数と画像のバイト数を分けています。元の形状と三角形数は保ち、配置・回転・拡大縮小と塗りだけを変えました。

| 部品 | 三角形 | 材質 | 外部画像：寸法 / bytes | 原本GLB bytes | A圧縮 bytes | B圧縮 bytes |
|---|---:|---:|---|---:|---:|---:|
{asset_table}

## 容量

単体部品を別々に配る保守的な合計は A {assets['budget']['A'] / 1048576:.3f} MiB、B {assets['budget']['B'] / 1048576:.3f} MiB です。

配置も含めてまとめた `city-A.glb` は {budget['A']['bytes']:,} bytes（{budget['A']['bytes'] / 1048576:.3f} MiB）、`city-B.glb` は {budget['B']['bytes']:,} bytes（{budget['B']['bytes'] / 1048576:.3f} MiB）でした。どちらも meshopt 圧縮済みです。{budget['B']['instances']}個の配置で形状を共有し、街は {budget['B']['sceneTriangles']:,} 三角形です。A は3材質・3画像、B は共通の1材質・8×1画像1枚です。圧縮後に読み戻し、配置を含めた三角形数の一致を確認しました。

この静止区間を8回ぶん重複して持つ保守的な見込みでも、B は地面などの予備1 KiB込みで {assets['budget']['eightSectionsBConservativeBytes'] / 1048576:.3f} MiB です。2 MiB の目標内です。ただし新しい部品を増やした将来の8区間の実測値ではありません。容量にはキャラ、JS、配布ZIP、平らな地面と影の受け面を含めていません。

## 撮影と速さ

Chrome {capture['chrome']}、{capture['shots'][0]['gpu']}。`channel: 'chrome'`、`--enable-gpu --use-angle=metal` で描画しました。各条件で読み込みとシェーダーの準備を終え、800 ms 描いてから5秒間の rAF 間隔を測っています。静止した場面を毎フレーム描き直した測定であり、歩行や区間交換の処理は含みません。CPU制限は Chrome CDP の `Emulation.setCPUThrottlingRate` です。

| 色 | CSS画面 | DPR | CPU制限 | 中央値 ms | P95 ms | 間隔の標本数 |
|---|---|---:|---:|---:|---:|---:|
{table}

実機のスマホ GPU、連続歩行、画面外での区間交換、長時間のメモリ増加は未計測です。今回の5秒計測だけでは、その負荷は判断していません。

## 描画・姿勢・仮定

- 現在の `main.ts` と同じ NeutralToneMapping、露出1、RoomEnvironment のぼかし0.04・強さ0.65、主光源・補助光源の色と位置・強さ、PCF の影・1024の影画像・bias・normalBias を使いました。キャラの AO を重ねない扱い、眼鏡と黒目の処理、足元から離れるほど薄くなる影も引き継いでいます。遠い建物は影を落としません。
- `walk.ts` を作業フォルダ内だけで JS に変換し、最初の歩の62.5%の姿勢を取り出して静止させました。膝は0° / 37.84°、太ももは17.47° / 22.33°、足首は14.70° / 17.73°で、既存の制限内です。支持足の最下点は歩道に接地し、運ぶ靴は29.68 mm上がっています。
- 架空の平坦な通りで、進行方向を +Z と仮定しました。キャラの GLB は現在の約1 mの大きさを保ち、住宅は元モデルの1.65倍、道路は3.2倍に配置しています。歩道の高さは60 mmです。
- カメラは正面から30°横・水平より8°上、画角25°です。横長は画面高の約60%、縦長は幅の余白を優先して約46%に全身を収め、進行方向側に歩道を空けています。
- B は8色のパレットを使います。Kenney のカラーマップの陰影グラデーションをそのまま8色へ丸めると面に色の縞が出るため、元の色見本の中央を採って面ごとに単色を割り当て、共通の roughness 0.95 / metalness 0 の材質にしています。黒い輪郭線は付けていません。
- 歩く動きと背景の送りは今回の範囲外です。既存のデモページ・ソースは変更していません。4410の開発サーバーを維持し、4427の別サーバーで見本を開きました。コミットはしていません。

## 再現

リポジトリ直下で実行します。依存はこの作業フォルダ内にだけ置いています。

```sh
python3 scripts/toy-character/city-download.py
pnpm --dir .work/toy-character/city/tooling install
node scripts/toy-character/city-prepare.mjs
python3 -m http.server 4427 --bind 127.0.0.1
```

別のターミナルで撮影・計測・容量の集約・レポート更新を行います。

```sh
node scripts/toy-character/city-capture.mjs
node scripts/toy-character/city-bundle.mjs
python3 scripts/toy-character/city-report.py
```
'''
(root / 'README.md').write_text(text)
print('Wrote', root / 'README.md')
