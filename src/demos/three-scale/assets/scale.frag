uniform vec3 uColor;

void main() {
  gl_FragColor = vec4(uColor, 1.0);
  // uColor は three が linear に直して渡すので、画面の色（sRGB）に戻す。戻さないと DOM の箱より濃く見える
  #include <colorspace_fragment>
}
