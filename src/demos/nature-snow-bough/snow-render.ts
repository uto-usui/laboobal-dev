// 描画の凹凸は衝突用の包絡形から独立させ、枝と破断の計算を変えない。
export const SNOW_RENDER_WGSL = /* wgsl */ `
struct SnowQuad {
  @builtin(position) position: vec4f,
  @location(0) rayPlane: vec3f,
  @location(1) @interpolate(flat) id: u32,
}
struct SnowHit { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 }
fn snowBasis(s: Snow) -> mat3x3f {
  let x=normalize(mix(s.oldX.xyz,s.axisX.xyz,u.interpolation));
  let y0=mix(s.oldY.xyz,s.axisY.xyz,u.interpolation);
  let y=normalize(y0-x*dot(x,y0));
  return mat3x3f(x,y,normalize(cross(x,y)));
}
fn snowOrigin(s: Snow) -> vec3f { return mix(s.oldOrigin.xyz,s.origin.xyz,u.interpolation); }
fn smoothJoin(a: f32, b: f32, k: f32) -> f32 {
  let h=clamp(0.5+0.5*(b-a)/k,0.0,1.0);
  return mix(b,a,h)-k*h*(1.0-h);
}
fn ellipsoid(p: vec3f, radii: vec3f) -> f32 {
  let k0=length(p/radii); let k1=length(p/(radii*radii));
  return k0*(k0-1.0)/max(k1,0.00001);
}
fn powderFbm(p: vec3f) -> f32 {
  return (noise(p)*0.58+noise(p*2.07+vec3f(7,13,2))*0.28
    +noise(p*4.31+vec3f(21,3,17))*0.14)-0.5;
}
fn snowField(localPoint: vec3f, s: Snow) -> f32 {
  let growth=mix(s.spare.x,s.state.w,u.interpolation);
  let erosion=mix(s.spare.w,s.state.y,u.interpolation);
  let band=u32(s.origin.w)/4u; let part=u32(s.origin.w)%4u;
  let footprint=max(0.015,sqrt(growth));
  let shrink=1.0-erosion*0.38;
  let scale=vec3f(footprint*shrink,max(0.015,growth)*shrink,footprint*shrink);
  let p=localPoint/scale;
  let offset=(f32(part)*2.0-3.0)*s.size.x;
  let bandPoint=p+vec3f(offset,0,0);
  // 一帯で同じ楕円体群を読み、物理の四分割を表面の節として出さない。
  var distanceField=10.0;
  for (var j=0u; j<7u; j++) {
    let r=rand3(j+band*79u+631u);
    let along=(-2.7+f32(j)*0.90+(r.x-0.5)*0.44)*s.size.x;
    let center=vec3f(along,(0.40+(r.y-0.5)*0.50)*s.size.y,(r.z-0.5)*0.30*s.size.z);
    let radii=vec3f((1.19+r.z*0.38)*s.size.x,(0.50+r.x*0.40)*s.size.y,(0.73+r.y*0.24)*s.size.z);
    distanceField=smoothJoin(distanceField,ellipsoid(bandPoint-center,radii),0.12);
  }
  let grainPoint=bandPoint+vec3f(0,f32(band)*7.19,0);
  distanceField+=powderFbm(grainPoint*5.1)*0.042+powderFbm(grainPoint*16.7)*0.004;
  // 支持面に接する底を残し、横へ垂れた縁だけを丸く回り込ませる。
  let bed=0.025-smoothstep(0.13,0.80,abs(p.z))*0.12+powderFbm(grainPoint*7.0)*0.035;
  distanceField=-smoothJoin(-distanceField,p.y-bed,0.07);
  // 隣接面は少し重ねる。外れた塊の切り口はノイズで角から欠ける。
  let capNoise=powderFbm(vec3f(p.yz*11.0,f32(part+band*9u)));
  let capLeft=select(-p.x-s.size.x-0.022,-10.0,part==0u);
  let capRight=select(p.x-s.size.x-0.022,-10.0,part==3u);
  let cap=max(capLeft,capRight)+capNoise*(0.020+erosion*0.08);
  let capRounding=select(0.10+erosion*0.08,0.035,s.state.x>0.5);
  distanceField=-smoothJoin(-distanceField,-cap,capRounding);
  let edgeWear=erosion*0.085*(0.7+powderFbm(grainPoint*12.0));
  return (distanceField+edgeWear)*min(scale.x,min(scale.y,scale.z));
}
fn snowNormal(p: vec3f, s: Snow) -> vec3f {
  let e=0.0025;
  return normalize(vec3f(
    snowField(p+vec3f(e,0,0),s)-snowField(p-vec3f(e,0,0),s),
    snowField(p+vec3f(0,e,0),s)-snowField(p-vec3f(0,e,0),s),
    snowField(p+vec3f(0,0,e),s)-snowField(p-vec3f(0,0,e),s)));
}
@vertex fn vsSnow(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> SnowQuad {
  let s=snows[i]; let basis=snowBasis(s); let center=snowOrigin(s)+basis[1]*s.size.y*0.58;
  // 投影の z によるずれも含め、回転中の塊を囲む四角を一枚だけ出す。
  let extents=vec3f(s.size.x+0.16,s.size.y*0.9+0.12,s.size.z*1.25+0.12);
  let ex=basis[0]*extents.x; let ey=basis[1]*extents.y; let ez=basis[2]*extents.z;
  let radius=abs(vec2f(ex.x+ex.z*0.1,ex.y+ex.z*0.06))
    +abs(vec2f(ey.x+ey.z*0.1,ey.y+ey.z*0.06))+abs(vec2f(ez.x+ez.z*0.1,ez.y+ez.z*0.06));
  let xy=vec2f(center.x+center.z*0.1,center.y+center.z*0.06)+(corner(v)*2.0-1.0)*radius;
  var o: SnowQuad;
  o.position=project(vec3f(xy,0)); o.rayPlane=vec3f(xy,0); o.id=i;
  if (s.state.z>0.5 || s.state.w<0.00001) { o.position=vec4f(2,2,0,1); }
  return o;
}
@fragment fn fsSnow(in: SnowQuad) -> SnowHit {
  let s=snows[in.id]; let basis=snowBasis(s); let inverseBasis=transpose(basis);
  let origin=snowOrigin(s);
  let rayDirection=normalize(vec3f(0.1,0.06,-1.0));
  let rayOrigin=in.rayPlane+vec3f(-2.0,-1.2,20.0);
  let ro=inverseBasis*(rayOrigin-origin); let rd=inverseBasis*rayDirection;
  let low=vec3f(-s.size.x-0.18,-0.15,-s.size.z*1.4);
  let high=vec3f(s.size.x+0.18,s.size.y*1.65+0.14,s.size.z*1.4);
  // 平行な光線でもゼロ割りせず、空の画素は距離計算の前に捨てる。
  let inv=sign(rd+vec3f(0.0000001))/max(abs(rd),vec3f(0.0000001));
  let t0=(low-ro)*inv; let t1=(high-ro)*inv;
  let near3=min(t0,t1); let far3=max(t0,t1);
  var travel=max(near3.x,max(near3.y,near3.z));
  let limit=min(far3.x,min(far3.y,far3.z));
  if (travel>limit) { discard; }
  var hit=false; var p=ro+rd*travel;
  for (var march=0u; march<72u; march++) {
    p=ro+rd*travel;
    let d=snowField(p,s);
    if (d<0.0012) { hit=true; break; }
    travel+=max(d*0.72,0.0008);
    if (travel>limit) { break; }
  }
  if (!hit) { discard; }
  let normalLocal=snowNormal(p,s);
  let band=floor(s.origin.w/4.0); let part=s.origin.w-band*4.0;
  let grain=p+vec3f((part*2.0-3.0)*s.size.x,band*7.19,0);
  let e=0.13; let g=grain*78.0;
  let grit=vec3f(noise(g+vec3f(e,0,0))-noise(g-vec3f(e,0,0)),
    noise(g+vec3f(0,e,0))-noise(g-vec3f(0,e,0)),
    noise(g+vec3f(0,0,e))-noise(g-vec3f(0,0,e)))*0.035;
  let n=basis*normalize(normalLocal-grit+normalLocal*dot(normalLocal,grit));
  let world=origin+basis*p;
  let up=clamp(n.y*0.5+0.5,0.0,1.0);
  var color=mix(vec3f(0.77,0.835,0.88),vec3f(0.984,0.989,0.99),smoothstep(0.02,0.92,up));
  let diffuse=max(0.0,dot(n,LIGHT));
  color*=0.96+diffuse*0.04;
  // 凹みの陰は二距離だけ調べ、固い陶器に見える黒い筋を作らない。
  let ao=clamp((0.055-snowField(p+normalLocal*0.055,s))/0.055,0.0,1.0);
  color*=1.0-ao*0.04;
  let tangentA=at(u32(s.spare.y)); let tangentB=at(u32(s.spare.z)); let ab=tangentB-tangentA;
  let nearest=tangentA+ab*clamp(dot(world-tangentA,ab)/max(dot(ab,ab),0.00001),0.0,1.0);
  color=mix(color,vec3f(0.70,0.79,0.84),(1.0-smoothstep(0.07,0.27,distance(world,nearest)))*0.11);
  let rim=pow(1.0-abs(dot(n,-rayDirection)),3.0);
  color=mix(color,vec3f(0.98,0.99,1.0),rim*0.24);
  color+=vec3f((noise(grain*117.0)-0.5)*0.012);
  let sparkle=smoothstep(0.975,0.999,noise(grain*159.0+vec3f(5,9,2)));
  color+=vec3f(sparkle*0.012);
  var o: SnowHit; o.color=vec4f(clamp(color*u.brightness,vec3f(0),vec3f(1)),1);
  o.depth=project(world).z;
  return o;
}
// 影にも同じ距離場を使う。枝の影用メッシュへ雪の近似形を混ぜない。
struct SnowShadowQuad {
  @builtin(position) position: vec4f,
  @location(0) plane: vec3f,
  @location(1) @interpolate(flat) id: u32,
}
@vertex fn vsSnowShadow(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> SnowShadowQuad {
  let s=snows[i]; let center=snowOrigin(s)+snowBasis(s)[1]*s.size.y*0.6;
  let radius=length(vec3f(s.size.x+0.15,s.size.y,s.size.z*1.3));
  let p=center+(RIGHT*(corner(v).x*2.0-1.0)+UP*(corner(v).y*2.0-1.0))*radius;
  var o: SnowShadowQuad; o.position=lightProject(p); o.plane=p; o.id=i;
  if (s.state.z>0.5 || s.state.w<0.00001) { o.position=vec4f(2,2,0,1); }
  return o;
}
@fragment fn fsSnowShadow(in: SnowShadowQuad) -> @builtin(frag_depth) f32 {
  let s=snows[in.id]; let basis=snowBasis(s); let origin=snowOrigin(s);
  let ro=transpose(basis)*(in.plane+LIGHT*2.0-origin); let rd=transpose(basis)*(-LIGHT);
  var travel=0.0;
  for (var march=0u; march<64u; march++) {
    let p=ro+rd*travel; let d=snowField(p,s);
    if (d<0.002) { return lightProject(origin+basis*p).z; }
    travel+=max(d*0.72,0.001);
    if (travel>4.0) { break; }
  }
  discard;
  return 1.0;
}
// 放出した場所からゆっくり漂わせ、核の消滅とは独立して薄くする。
@vertex fn vsPowder(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> SnowQuad {
  let cloud=powders[i]; let age=cloud.center.w;
  let radius=cloud.spread.yz+vec2f(age*0.52,age*0.40);
  let uv=corner(v)*2.0-1.0;
  let p=cloud.center.xyz+vec3f(uv*radius,0);
  var o: SnowQuad; o.position=project(p); o.rayPlane=vec3f(uv,age); o.id=i;
  if (age<0.0) { o.position=vec4f(2,2,0,1); }
  return o;
}
@fragment fn fsPowder(in: SnowQuad) -> @location(0) vec4f {
  let age=in.rayPlane.z; let uv=in.rayPlane.xy;
  let soft=exp(-dot(uv,uv)*3.2)*pow(max(0.0,1.0-dot(uv,uv)*0.5),2.0);
  let fade=smoothstep(0.0,0.16,age)*(1.0-smoothstep(0.28,2.1,age));
  let wisps=0.72+noise(vec3f(uv*2.4,f32(in.id)*3.7))*0.28;
  return vec4f(vec3f(0.965,0.978,0.987)*u.brightness,soft*fade*wisps*0.38);
}
`
