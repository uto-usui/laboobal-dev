# マウスで照らす

## 何をしているか

暗くした写真の上を、マウスについてくる光が照らす。光の当たったところだけ、写真が元の明るさに近づいて見える。

## 大事なところ

光は、ぼかした白い円を 2 つ、`mix-blend-mode: soft-light` で写真に重ねたもの。soft-light は、上に重ねた色が明るいほど下の色を明るくする（暗いところより、中くらいの明るさのところがよく持ち上がる）。写真を `brightness(30%)` で暗くしておき、白い円の下だけを持ち上げると、懐中電灯で照らしたように見える。円は `blur` でふちをぼかしているので、光の境目がやわらかい。

円は 2 つで、大きさも追いかける割合も違う（大きい円が 1 フレームで差の 10%、小さい円が 8%）。止まっているときは 2 つが重なって 1 つの丸い光になるが、動かすと小さい円が少し遅れて、光が動く向きに尾を引いたような形になる。1 つの円を動かすより、光にやわらかさと奥行きが出る。

追いかけ方は follow-mouse と同じで、毎フレーム、マウスとの差の一部だけ近づく。光が少し遅れてついてくるので、手に持ったライトを振っているような重さが出る。

## 作り方

follow-mouse と同じく、requestAnimationFrame と `damp` で書いている。マウスの位置は `src/shared/a/pointer.ts` で取る。

写真は `object-fit: cover` で入れ物いっぱいに敷き、顔が入るよう `object-position` で少し上に寄せている。光の円は写真の上に絶対配置で置き、`pointer-events: none` でマウスの邪魔をしないようにしている。

## もとのデモから変えたこと

- 写真を `images.unsplash.com` からの直リンクから、落としてリポジトリに置いたものにした
- 写真を元の大きさで置いていたのを、`object-fit: cover` で入れ物いっぱいに敷くようにした
- 1 フレームあたりの割合を、経過時間を使う `damp` に直した
- 開いたときに光を真ん中に置くようにした。旧デモは左上から出てきた

## もと

- laboobal/docs/basic/follow.md の「mouse spot light」
- laboobal の部品 `basic/FollowMouseSpotLight.vue`、`basic/FollowMouseScript.js`
- 写真（Unsplash）: https://images.unsplash.com/photo-1547962041-6d2d7c4bdf6e
