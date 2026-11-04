import { hsb, paint, sketch } from '../../shared/processing'
import type { Mount, Params } from '../../shared/variants'

const w = 320
const h = 320

export const params = {
  num: { label: '1 列の数', value: 6, min: 2, max: 10, step: 1 },
  circleW: { label: '円の直径', value: 30, min: 10, max: 50, step: 1 },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { num, circleW }) =>
  sketch(stage.querySelector('canvas')!, w, h, (ctx) => {
    // background(180, 35, 80, 20)。半透明なので、後ろのグラデーションが透ける
    ctx.fillStyle = hsb(180, 35, 80, 20)
    ctx.fillRect(0, 0, w, h)

    // 真ん中に、幅と高さの 0.65 倍の正方形（rectMode(CENTER)）
    ctx.beginPath()
    ctx.rect(w / 2 - (w * 0.65) / 2, h / 2 - (h * 0.65) / 2, w * 0.65, h * 0.65)
    paint(ctx, null, '#000')

    // 円の大きさと数から、すき間の幅を決める。もとは int なので小数を切り捨てる
    const gutter = Math.trunc((w - circleW * num) / (num + 1))
    for (let j = 0; j < num; j++) {
      for (let i = 0; i < num; i++) {
        // 色相を列ごとに 30 ずつずらす
        ctx.beginPath()
        ctx.arc(
          gutter + circleW / 2 + (gutter + circleW) * i,
          gutter + circleW / 2 + (gutter + circleW) * j,
          circleW / 2,
          0,
          Math.PI * 2,
        )
        paint(ctx, hsb(160 + 30 * i, 60, 70, 60), null)
      }
    }
  }).dispose
