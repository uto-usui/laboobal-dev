uniform float uProgress;
// 0: 左から、1: 左上の角から、2: 真ん中から
uniform float uMode;
uniform vec2 uMeshScale;
uniform vec2 uMeshPosition;
uniform vec2 uViewSize;

void main() {
  vec3 pos = position;
  vec2 st = uv;

  // 頂点ごとの「動き出す順番」。0 の頂点がいちばん先に動く
  float left = st.x;
  float corner = (st.x - st.y + 1.0) / 2.0;
  float center = smoothstep(0.0, distance(vec2(0.0), vec2(0.5)), distance(vec2(0.5), st));
  float activation = uMode < 0.5 ? left : uMode < 1.5 ? corner : center;

  // 最後の頂点も、全体の半分の時点では動き出す。終わりはそろえる
  float latestStart = 0.5;
  float startAt = activation * latestStart;
  float vertexProgress = smoothstep(startAt, 1.0, uProgress);

  // 画面の大きさになるまで広げ、画面の真ん中へ寄せる
  vec2 scaleToViewSize = uViewSize / uMeshScale - 1.0;
  pos.xy *= 1.0 + scaleToViewSize * vertexProgress;
  pos.xy -= uMeshPosition * vertexProgress;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
