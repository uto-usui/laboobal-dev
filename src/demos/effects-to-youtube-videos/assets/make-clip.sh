#!/bin/zsh
# このデモの動画 clip.webm と clip.mp4 を ffmpeg だけで作る。使い方: zsh make-clip.sh <出力先のフォルダ>
# 光の玉 3 つが 6 秒で 1 周する。動きの周期がどれも 6 秒を割り切るので、つなぎ目なくループする。
# 音は 110Hz を元にした和音。どの周波数も 6 秒でちょうど割り切れる回数だけ揺れるので、音もつながる
set -e
out=$1
P='2*PI*T/6'
A1="exp(-(pow(X-(320+210*sin($P)),2)+pow(Y-(180+80*sin(2*$P)),2))/9000)"
A2="exp(-(pow(X-(320+170*cos($P+1)),2)+pow(Y-(180+110*sin($P+1)),2))/6500)"
A3="exp(-(pow(X-(320-230*sin(2*$P+2)),2)+pow(Y-(180+70*cos($P)),2))/4500)"
BG="(1-Y/360)"
R="min(255,18+20*$BG+255*$A1+60*$A2+240*$A3)"
G="min(255,22+30*$BG+150*$A1+220*$A2+60*$A3)"
B="min(255,48+70*$BG+40*$A1+255*$A2+200*$A3)"
VF="nullsrc=s=640x360:r=24:d=6,geq=r='$R':g='$G':b='$B',noise=alls=6:allf=t,format=yuv420p"
AF="aevalsrc='0.06*(0.6+0.4*sin(2*PI*t/3))*(sin(2*PI*110*t)+0.6*sin(2*PI*165*t)+0.4*sin(2*PI*220*t)+0.25*sin(2*PI*277*t))':s=48000:d=6"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "$VF" -f lavfi -i "$AF" \
  -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -c:a libopus -b:a 32k -shortest "$out/clip.webm"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "$VF" -f lavfi -i "$AF" \
  -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 48k -shortest "$out/clip.mp4"
ls -la "$out"/clip.*
