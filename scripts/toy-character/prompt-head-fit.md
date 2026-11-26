# 依頼: seed 42 の頭だけで、合わせる工程まで進める（prompt-head-gen.md の続き）

`scripts/toy-character/prompt-head-gen.md` の作業の続きです。マシンが重くなったので、頭の生成は seed 42 の 1 本で止めました（1 本に約 1 時間半かかった。トークンが全身のときの約 4 倍になったため）。seed 43〜45 は生成しません。`.work/toy-character/img3d/fidelity/seed-43.log` があれば、途中で止めたものなので消してかまいません。

前提が曖昧なところは妥当な仮定を置いて最後まで進め、置いた仮定は最終回答に書いてください。書き込むのは `scripts/toy-character/` と `.work/toy-character/` の中だけ。コミットはしないでください。

## やること

1. `scripts/toy-character/fidelity_run.zsh` と、そこから呼ぶスクリプトを、生成する seed の一覧を引数か設定で渡せる形に直す（既定は 42 だけ）。生成済みの seed は作り直さない。生成のコマンドは走らせない
2. seed 42 の頭について、prompt-head-gen.md の「選ぶ」の検査（穴・二重の耳・髪の欠け）を行い、`seed-scores.json` に書く。比べる相手がないので順位は付けない。外す条件に当たったら、その先へ進まずに報告する
3. prompt-head-gen.md の「合わせる」と「出力」をそのとおりに行う。`seeds.png` は seed 42 の 1 本だけでよい
4. `fidelity-method.md` の「近い」の基準で、目・鼻・口・輪郭の値と合否を `metrics.json` に書く

レンダは自分で開いて見ること。手順と気づいたことは `.work/toy-character/fidelity/log.md` に足す。

## 最終回答

日本語で、結論から。seed 42 の検査の結果、基準の各項目の値と合否、デザイン画とまだ違うところ、置いた仮定。前置きと繰り返しは削る。
