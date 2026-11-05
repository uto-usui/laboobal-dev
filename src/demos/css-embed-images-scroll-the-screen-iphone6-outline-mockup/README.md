# 画面をスクロールできる iPhone の線画

## 何をしているか

iPhone 6 の形を CSS の線だけで描き、画面の部分に縦に長い写真を入れて、指やホイールでスクロールできるようにする。本体は斜めに傾けた向きで、ときどき 1 回転する。

## 大事なところ

機械の形は、角丸の枠と、丸、細長い角丸、細い棒だけでできている。外枠は `border-radius: 30px` の箱、上のセンサーとスピーカーは小さな角丸、下のホームボタンは丸、横のボタンは幅 3px の棒を外枠の中心から `margin` でずらして置いたもの。線の色を 1 つ（`#666`）にそろえると、図面のような線画に見える。

画面の中をスクロールさせ、スクロールバーを隠しているのがいちばんの工夫。画面の高さは決めておき、中の写真の高さの分だけスクロールできる。スクロールバーが出ないので、本物の端末を触っている感じに近くなる。

回転は 5 秒で 1 周するが、初めと終わりの 20% は止めている。正面を見せる時間がはさまるので、ずっと回っているより落ち着いて見え、スクロールもしやすい。本体の外側の箱は `rotate3d(-1, 1, 0, 30deg)` で斜めに固定してあり、その中で本体だけが Y 軸で回る。線だけなので、裏を向いても形がそのまま見える。

## 作り方

CSS だけで、script はない。

スクロールバーは `scrollbar-width: none` と `::-webkit-scrollbar { display: none }` で隠している。画面の中で回しきったときにページまでスクロールが伝わらないよう、`overscroll-behavior: contain` を付けた。キーボードでもスクロールできるよう、画面に `tabindex="0"` を付けている。

寸法は、もとの px の値に `--u` を掛けて書いている。`--u` は `clamp(0.5px, min((100cqh - 150px) / 470, 100cqw / 330), 1.4px)` で、iframe の高さが 500px くらいでも本体と見出しが入り、大きな画面では少し大きくなる。線の太さだけは 1px のまま。

見出しの文字は、入っている Molle（筆記体）を使った。

## もとのデモから変えたこと

記事の本文には SCSS のコードが載っている。違いは次のとおり。

- SCSS の変数 `$outline-color` を CSS の変数 `--line` に、ネストをほどいて普通の CSS にした
- 寸法を px のままではなく `calc(<px の値> * var(--u))` にした。もとは画面の大きさにかかわらず同じ大きさだった
- スクロールバーの隠し方を変えた。記事では、中の箱を `calc(100% + 17px)` に広げてスクロールバーを外へ押し出していた。スクロールバーの幅は端末で違い、macOS の重ねて出るスクロールバーでは右に 17px のすき間ができるので、スクロールバーを出さない指定にした
- クラス名を中身の分かる名前にした（`spbody` → `phone`、`partsvw` → `screen`、`partsbtn` → `home` など）
- 画像は `placekitten.com`（640×6000 の子猫の画像）だった。サービスが止まって出なくなっていたので、Unsplash の猫の写真 3 枚と人物の写真 3 枚を縦につないだ 1 枚の画像（480×3600）を置いた。猫だけでは長さが足りず、iframe の大きさでスクロールできる量が画面 1 枚分ほどになるため
- 見出しは Google Fonts の Dancing Script を実行時に読んでいた。外から読まないよう、同梱の Molle にした。`text-transform: capitalize` で「Iphone6」になっていたので、文字を直接「iPhone 6 Mockup」と書いた
- Bootstrap 4 alpha の CSS と JS を読んでいたのをやめた（見出しの太さと中央寄せにだけ使っていた）
- 本体の外側の `margin: 60px` をやめ、見出しと本体を縦に並べて中央に置いた

## もと

- https://jsfiddle.net/yutousui/656k72Lf/
- 記事: https://webmanab.com/lab/css-embed-images-scroll-the-screen-iphone6-outline-mockup/
- 写真: Unsplash（https://images.unsplash.com/photo-1467011582549-93cad47c167e 、https://images.unsplash.com/photo-1547962041-6d2d7c4bdf6e 、https://images.unsplash.com/photo-1494256997604-768d1f608cac 、https://images.unsplash.com/photo-1548112129-b5cf67e9558d 、https://images.unsplash.com/photo-1516125073169-9e3ecdee83e7 、https://images.unsplash.com/photo-1548106755-5c6bf746ca84 ）。写真のページは分からない

## クレジット

- 写真 Unsplash: https://unsplash.com/license （Unsplash License。写真の出どころは上の「もと」）
