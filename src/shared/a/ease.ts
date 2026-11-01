/**
 * 旧デモの「毎フレーム、差の ease だけ近づく」（60fps で書かれていた）を、damp の lambda に直す。
 * そのまま毎フレーム lerp すると、120Hz の画面では倍の速さで追いつく
 */
export const lambdaFromEase = (ease: number) => -60 * Math.log(1 - ease)
