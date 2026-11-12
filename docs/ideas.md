# デモをまたいだ考え方

各デモのメモ（`src/demos/<slug>/README.md`）と [下げたデモの記録](history/dropped/) から、1 つのデモに閉じない考え方を集めたものです。見返すときの入り口にします。くわしい数字や式は、リンク先のメモにあります。デモを足したら、ほかのデモにも通じる考え方をここに書き足します。

## 毎フレーム、差の一部だけ近づく

いちばん多くのデモで使っている式です。

```
位置 += (行き先 - 位置) × 割合
```

差が大きいうちは速く、近づくほど遅くなるので、イージングの関数を選ばなくても自然なイーズアウトになります。行き先が動き続けている間は追いつかず、一定の距離を空けてついてきます。マウスについてくる動きも、スクロールに遅れて追いつく動きも、指を離したら戻る動きも、同じ式です。

- 行き先を切り替えるだけで、戻る動きも同じ手ざわりになる。drag は押している間は「指の移動量」、離したら 0 を行き先にするだけ（[drag-pinch-simple](../src/demos/drag-pinch-simple/README.md)）
- スクロールにぴったり合わせず、この式で遅らせると、スクロールを止めても少し動き続けて重さが出る。CSS の scroll-driven animations ではこの遅れは出せない（[scroll-reveal-transform](../src/demos/scroll-reveal-transform/README.md)、[scrollmanager](../src/demos/scrollmanager/README.md)、[tweenmax-visual-range-animation-class](../src/demos/tweenmax-visual-range-animation-class/README.md)）
- 速さに使えば、弾かれたものが元の漂いにすっと戻る（[nodeballs](../src/demos/nodeballs/README.md)）。回る速さに使えば、向きを変えるときにいったん緩んでから逆に回る（[rotate3d-xyz](../src/demos/rotate3d-xyz/README.md)）
- のぞき込む動きや色のにじみも、すぐ追わせず遅らせると、重さのある物を見ている感じが出る（[canvas-fake3d](../src/demos/canvas-fake3d/README.md)、[canvas-shift-image](../src/demos/canvas-shift-image/README.md)）

旧デモはこの割合を「1 フレームあたり」で書いていました。そのままだと 120Hz の画面では 60Hz の倍の速さで追いつきます。作り直しでは `src/shared/math.ts` の `damp` を使い、`lambda = -60 × ln(1 - 割合)` に直して、60Hz で旧デモと同じ速さになるようにしています。「1 フレームに 1px」は「1 秒に 60px」に直します。

GSAP で同じことをするなら、マウスが動くたびに「n 秒かけて新しい値へ向かう」tween を作り直します（[mouse-tilt](../src/demos/mouse-tilt/README.md)、[mouse-skew](../src/demos/mouse-skew/README.md)、[parallax-distorts-by-following-mouse](../src/demos/parallax-distorts-by-following-mouse/README.md)）。毎回 `gsap.to` を作ると GSAP 3 では tween が積もって動きが濁るので、`gsap.quickTo` か `overwrite: 'auto'` を使います。

## 速さを持たせると、行き過ぎる

位置ではなく速さを差で変え、速さで位置を動かすと、行き先に来ても止まりきれずに行き過ぎて、ばねの揺れになります。[follow-mouse-spring](../src/demos/follow-mouse-spring/README.md) は 1 つの数 `power` で「引っぱる強さ」と「残る速さ」の両方を決めていて、1 つの数で軽く揺れるものから重く鈍いものまで作れます。

速さを持つものは、速さを 0 に近づける処理を忘れると止まりません。下げた [virtual-scroll](history/dropped/B2.md#virtual-scroll) はここが抜けていて、一度ホイールを回すと回り続けていました。

行き先の向こうに床があるものは、ばねが床を越えたら、速さを逆向きにして一部だけ返します。行き過ぎる揺れが、床に当たって跳ねる動きになります。返す速さに上限を付けると、勢いよく戻したときも跳ねすぎません（[html-sticker](../src/demos/html-sticker/README.md) の、貼り戻ったシールの角）。

## 同じ式で、係数だけ変えて重ねる

1 つの動きを作ったら、係数だけ違うものを並べると、前後の順や奥行きが生まれます。

- 追いかける割合を変えた 2 つを重ねると、尾を引く（[follow-mouse](../src/demos/follow-mouse/README.md)、[follow-mouse-spotlight](../src/demos/follow-mouse-spotlight/README.md)）。割合を大きく変えると、片方だけが反応して違いの理由が見える（[follow-mouse-transform](../src/demos/follow-mouse-transform/README.md)）
- 引っぱりへの倍率を要素ごとにランダムにすると、同じ操作から風が吹いたような動きが出る（[drag-pinch-lines](../src/demos/drag-pinch-lines/README.md)、[drag-pinch-word](../src/demos/drag-pinch-word/README.md)）
- ずらす量を手前ほど大きくすると、平らな要素の間に奥行きが出る（[parallax-distorts-by-following-mouse](../src/demos/parallax-distorts-by-following-mouse/README.md) の 0.05 と 0.1、[scrollmanager](../src/demos/scrollmanager/README.md) の列ごとの速さ 1 と 3）
- 隣どうしを逆向きに動かすと、同じ量でも切れ目が倍に開いて見える（[parallax-shifting-divided-background-by-mouse](../src/demos/parallax-shifting-divided-background-by-mouse/README.md)、[scrollmanager](../src/demos/scrollmanager/README.md) のタイルの列）
- 強さだけで「溶ける」と「ゆらぐ」に分かれ、ずらす向きを 1 つに絞るだけで「横に流れる」「縦に垂れる」になる（[distortion-slider-a](../src/demos/distortion-slider-a/README.md)〜[d](../src/demos/distortion-slider-d/README.md)）

## 時間差は「全部で何秒」で決める

順に動かすときは、1 個あたりの遅れではなく、最初から最後までの合計の時間で決めます。GSAP の `stagger` なら `each` ではなく `amount` です。要素の数が変わっても、端から端まで流れる時間が変わりません（[splitting](../src/demos/splitting/README.md)、[gsap-stagger](../src/demos/gsap-stagger/README.md)）。

- 並び順ではなく、真ん中からの距離の順に遅らせると、輪のように広がる（[gsap-stagger](../src/demos/gsap-stagger/README.md) の `grid` と `from: 'center'`）
- `repeat` と `yoyo` を `stagger` の外に書くと、くり返すのは波全体になり、戻りは最後に動いたものから返ってくる（[splitting](../src/demos/splitting/README.md)、[gsap-stagger](../src/demos/gsap-stagger/README.md)）
- 1 文字ずつ追いつく割合を変えると、文字の並びがしなって揃う（[scrollmanager](../src/demos/scrollmanager/README.md) の「Back To Page Top」）
- 頂点ごとに動き出す時刻をずらし、終わる時刻をそろえると、遅れた側ほど速く動いて板が曲がって伸びる。順番の決め方（左から、角から、真ん中から）を変えるだけで別の広がり方になる（[three-scale](../src/demos/three-scale/README.md)）

## 0〜1 の進み具合にしてから写す

スクロールや切り替えで何かを動かすときは、まず「どのあたりにいるか」を 0〜1 の数にします。数にしてしまえば、色でも位置でも回転でも、0〜1 を好きな範囲に写すだけです（[scroll-reveal](../src/demos/scroll-reveal/README.md)）。

- 0 をどこに置くか（画面に入ってから少し見えたところか、入る前からか）で、動き出しの見え方が変わる（[scroll-reveal](../src/demos/scroll-reveal/README.md) の offset 100px、[scroll-reveal-transform](../src/demos/scroll-reveal-transform/README.md) の -150px）
- 遅れが要らないなら、CSS の `animation-timeline: view()` と `animation-range` でブラウザに進み具合を計算させ、`@property` で登録した数 1 つだけを動かす（[scroll-reveal-color](../src/demos/scroll-reveal-color/README.md)）
- 進み具合を 1 つの値にまとめておくと、子は CSS だけでずらせる。locomotive-scroll 5 の `--progress` は子に受け継がれる（[scrollmanager](../src/demos/scrollmanager/README.md)）
- 崩れ方の強さを 1 つの値にまとめ、すべてのノイズがそれを見るようにすると、緩急を 1 か所で決められる（[canvas-glitch-image](../src/demos/canvas-glitch-image/README.md)）
- スクロールを縦の移動ではなく時間として使う。画面は止め、進み具合で場面を選び、場面の中の動き（カメラの寄りなど）に写す。写真を縦に並べて流すだけだと、下へ進む理由が生まれない（[vhs-rewind](../src/demos/vhs-rewind/README.md)）

## 乱数は行き先にする

乱数を毎フレームそのまま値に入れると、続きのない絵が並ぶだけで、動きではなく点滅になります。乱数は「次の行き先」にして、その間を ease でつなぐと、でたらめでも目で追えます（[gsap-random-repeat](../src/demos/gsap-random-repeat/README.md) と、下げた [random-transform](history/dropped/B1.md#random-transform)、[random-color](history/dropped/B1.md#random-color)）。

- 乱数の範囲を色ごとに狭く決めると、でたらめでも色がまとまる（[random-color](history/dropped/B1.md#random-color)）
- 速さの比がきれいな整数にならないようにすると、軌道が閉じず同じ道を二度となぞらない（[trigonometry-random-floating](../src/demos/trigonometry-random-floating/README.md)）
- 升目に沿って置き、升ごとにくじで置くかを決めると、重ならず並びも目立たない（[nodeballs](../src/demos/nodeballs/README.md)）

## つなぎ目を消す

くり返す動きは、くり返しの瞬間に見た目が同じになるように作ります。

- 同じものを並べ、ちょうど 1 つ分だけ動かしたところで初めに戻す。動かす量は px ではなく全体の割合で書く（[marquee](../src/demos/marquee/README.md)）
- くり返すたびに「いまの姿から次の姿へ」tween する（[gsap-random-repeat](../src/demos/gsap-random-repeat/README.md) の `repeatRefresh`）
- `alternate` で行って戻り、周期の違う動きを重ねると、区切りが分からなくなる（[blobradius](../src/demos/blobradius/README.md)）
- 画面を出たものを反対の端へ回して中身を入れ替えると、件数によらず DOM の数が一定のまま回り続ける（[virtual-scroll](history/dropped/B2.md#virtual-scroll)）

## 奥行きの出し方

- 要素ではなく座標を回すと、要素は正面を向いたまま、大きさだけで奥行きが読める（[rotate3d-xyz](../src/demos/rotate3d-xyz/README.md)、[rotate3d-x](history/dropped/B1.md#rotate3d-x)、[rotate3d-y](history/dropped/B1.md#rotate3d-y)）
- `perspective` を親に付けるか要素に付けるかで、どこから見た傾きになるかが変わる（[mouse-tilt](../src/demos/mouse-tilt/README.md)、[parallax-shifting-divided-background-by-mouse](../src/demos/parallax-shifting-divided-background-by-mouse/README.md)）。視点を画面の真ん中に合わせ直すと、画面の中を通り過ぎていく感じが出る（[scroll-reveal-transform](../src/demos/scroll-reveal-transform/README.md)）
- 奥行きと遠近の強さを別々に揺らすと、近づき方が毎回変わる（[trigonometry-random-floating](../src/demos/trigonometry-random-floating/README.md)、[trigonometry-sine](history/dropped/B1.md#trigonometry-sine)）
- 3D を使わず、横のずれを `skewX` と `skewY` の両方に入れるだけで、板が回り込んだように見える（[parallax-distorts-by-following-mouse](../src/demos/parallax-distorts-by-following-mouse/README.md)、[mouse-skew](../src/demos/mouse-skew/README.md)）
- 層に分け、ぶつかるのも結ぶのも同じ層の中だけにすると、奥行きのある網になる（[nodeballs](../src/demos/nodeballs/README.md)）
- 深度の画像で画素をずらすときは「深度 − 0.5」に比例させ、手前と奥を逆に動かす。深度の画像はぼかしておかないと輪郭で裂ける（[canvas-fake3d](../src/demos/canvas-fake3d/README.md)）
- `mix-blend-mode: multiply` で重ねると、重なりが暗くなって前後が分かり、描く順番も気にしなくてよい（[rotate3d-xyz](../src/demos/rotate3d-xyz/README.md)）
- 紙のような曲がり方は、物理演算をせず式で形を決めてもよい。そのときは、指が動いた距離から式の数（折り目の位置など）を逆に求めると、つまんだ所が指についてくる。折り目が進むほど角の動く距離も増えるだけなら、二分法で求められる（[html-sticker](../src/demos/html-sticker/README.md)）

## 中身を枠より大きくしておく

中を動かすデモは、動かす分だけ中身を枠より大きくしておき、ずれても隙間が見えないようにします（[scrollmanager](../src/demos/scrollmanager/README.md) の上下 20%、[tweenmax-visual-range-animation-class](../src/demos/tweenmax-visual-range-animation-class/README.md) の 300px の箱に 400px の写真、[parallax-shifting-divided-background-by-mouse](../src/demos/parallax-shifting-divided-background-by-mouse/README.md) の 10%）。

逆に、写真そのものは動かさず、見えている範囲や覆いだけを動かすと、見る人の目は写真の中身に向きます（[reveal-clip](../src/demos/reveal-clip/README.md)、[reveal-curtain](../src/demos/reveal-curtain/README.md)、[scrollmanager](../src/demos/scrollmanager/README.md) の貼り付く写真、[three-scale](../src/demos/three-scale/README.md) の DOM と WebGL の入れ替え）。

## 強い瞬間は短く

ずっと強いと目が慣れます。強い動きは一瞬にして、ほとんどの時間は落ち着かせます。

- 崩れる強さは周期の 5% だけ跳ねさせる（[canvas-glitch-image](../src/demos/canvas-glitch-image/README.md)）
- `expo.inOut` で、崩れている時間を短くする（[distortion-slider-a](../src/demos/distortion-slider-a/README.md)）
- 崩れる場所をしぼる。ノイズを 8 乗すると山のところだけが残り、文字の大部分は動かない（[three-typo](../src/demos/three-typo/README.md)）
- 覆いきってから 0.5 秒止めると、「何かが隠れている」と思わせてから見せられる（[reveal-curtain](../src/demos/reveal-curtain/README.md)）
- 入るときと出るときで ease と長さを変える（[hover-control](../src/demos/hover-control/README.md)、[hover-control-css](../src/demos/hover-control-css/README.md)、[reveal-curtain](../src/demos/reveal-curtain/README.md)）
- 速さだけでなく、続けて動かした量にもしきい値を置く。ちょっと払っただけでは起きず、わざと大きく動かしたときだけ起きる。量は向きが変わったときと止まったときに数え直す（[vhs-rewind](../src/demos/vhs-rewind/README.md)）
- なめらかなノイズを段に切り、半分の段を「動かない」にすると、なめらかに波打つのではなく、止まった帯と大きくずれた帯がはっきり分かれる（[vhs-rewind](../src/demos/vhs-rewind/README.md)）

## イベントではなく、動き終わったときに今の状態を見る

hover で動かすとき、出入りのたびに動かすと、速くなでたときにちらつきます。動いている間の出入りは印を書き換えるだけにし、動き終わったときに「今マウスが乗っているか」を見て次を決めると、塗りきってから戻り、マウスの通った道が尾のように残ります（[hover-control](../src/demos/hover-control/README.md)、[hover-rect](../src/demos/hover-rect/README.md)、比べる相手は [hover-control-css](../src/demos/hover-control-css/README.md)）。

## 色

- 2 色を混ぜずに色相を回すと、途中の色もくすまない。CSS では色そのものではなく数 1 つを動かして、色の式に入れる（[scroll-reveal-color](../src/demos/scroll-reveal-color/README.md)）
- 光は白いぼかした円を `soft-light` で重ね、写真を暗くしておく（[follow-mouse-spotlight](../src/demos/follow-mouse-spotlight/README.md)）
- 赤、緑、青を 1 倍、2 倍、4 倍とずらすと、にじみに向きと流れが出る（[canvas-shift-image](../src/demos/canvas-shift-image/README.md)）
- three の今の色の扱いでは、動画や画像に `SRGBColorSpace` を伝え、旧コードの光の色は見直す（[three-video](../src/demos/three-video/README.md)、[blob](../src/demos/blob/README.md)）

## 大きさが変わっても同じに見せる

デモは iframe（幅 100%、高さ 400〜500px）の中でも、画面いっぱいでも見られるようにします。

- 寸法は vw や vh ではなく、入れ物を基準にする（`cqw`、`cqh`、%、入れ物から計算した倍率）。vw は iframe の中でもスクロールバーの分だけはみ出す（[marquee](../src/demos/marquee/README.md)、[css-embed-images-scroll-the-screen-iphone6-outline-mockup](../src/demos/css-embed-images-scroll-the-screen-iphone6-outline-mockup/README.md)）
- マウスの移動量は、入れ物の大きさで割った割合にしてから使う（[drag-pinch-word](../src/demos/drag-pinch-word/README.md) は真ん中から角までの長さ、[mouse-tilt](../src/demos/mouse-tilt/README.md) は短い辺の半分）
- シェーダーのずれは px で考えて、最後に画面の幅で割って uv にする（[canvas-glitch-image](../src/demos/canvas-glitch-image/README.md)）
- canvas は描画の解像度を `devicePixelRatio` 倍にし、座標は CSS の px のまま書く（`src/shared/dom.ts` の `fitCanvas`、[canvas-draw-line](history/dropped/B2.md#canvas-draw-line)）

## 書くときにつまずくところ

- GSAP 3 は `Power1.inOut` や `Power1.Out` のような古い ease の名前を知らず、エラーも出さずに既定の `power1.out` で動く（[gsap-timeline](history/dropped/B1.md#gsap-timeline)）。`yoyoEase` を書くと `yoyo: true` も付き、行きの逆の ease を渡しても戻りは行きの逆再生と同じになる（[gsap-basic](history/dropped/B1.md#gsap-basic)）
- `overflow: hidden` の中では `position: sticky` が効かない。`overflow: clip` にする。transform ではみ出した要素はページを伸ばす（[scrollmanager](../src/demos/scrollmanager/README.md)）
- three の `IcosahedronGeometry` は面ごとに頂点が分かれているので、頂点を動かす前に `mergeVertices` でまとめる（[blob](../src/demos/blob/README.md)）
- 画素を読むデモは、画像に `crossOrigin` を `src` より先に付ける。付けないと `getImageData` で初めて例外になる（[canvas-cross-origin](history/dropped/B2.md#canvas-cross-origin)）
- Canvas 2D の `shadowBlur`、`globalAlpha`、`globalCompositeOperation` は context に残るので、一部だけに使うときは `save()` と `restore()` で挟む（[canvas-draw-shadow](history/dropped/B2.md#canvas-draw-shadow)、[canvas-alpha-blending](history/dropped/B2.md#canvas-alpha-blending)）
- `touch-action: none` を付けると、iframe に埋めたときにそこを触っても記事のページがスクロールしない。指で引っぱるデモ（drag）には要るが、マウスを追うだけのデモでは記事を読む人の邪魔になる
