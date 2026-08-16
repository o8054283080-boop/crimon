import * as THREE from "three";
import { CreaturePalette, SurfaceSet, SurfaceStyle, SurfaceVariant, styleCastsShadow } from "./surface.js";

/** 骨1本分の指定。上端が原点で、-Y方向へ伸びる */
export interface SegmentSpec {
  /** 長さ */
  len: number;
  /** 根元の半径 */
  r0: number;
  /** 先端の半径 */
  r1: number;
  /** この関節の姿勢(ラジアン) */
  rot?: [number, number, number];
  /** 断面のZ方向つぶし率(1で円、0.4で平たい) */
  flat?: number;
  /** 材質を途中で変える(爪や蹄など) */
  style?: SurfaceStyle;
  color?: THREE.Color;
  radial?: number;
}

export interface ChainResult {
  /** 付け根のグループ */
  root: THREE.Group;
  /** 各関節。先頭が根元 */
  joints: THREE.Group[];
  /** 各関節の初期姿勢(アニメーションの基準) */
  rests: THREE.Euler[];
  /** 末端(手先・尾の先)に物を付けるためのグループ */
  tip: THREE.Group;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * 曲面をいくつに割るかを「そのパーツの大きさ」から決める。
 *
 * 輪郭の折れが見えるかどうかは、1分割あたりの弧の長さ、つまり
 * 半径×角度で決まる。分割数を一律に上げると、13体×数十パーツの分だけ
 * 頂点が増えるのに、増えた分のほとんどは元から折れの見えない
 * 小さな装飾に費やされる。大きな曲面(頭・胴・尻・肩)だけを細かくする。
 *
 * radius が 0.08(指・牙)で min、0.5(胴)で max になる。
 * 平方根を挟んで、中くらいの部位が早めに滑らかになるようにしている。
 *
 * 呼び出し側が分割数を明示している場合は、意図があってのことなので触らない
 * (小さい装飾をわざと粗くしている指定が既に多数ある)。
 */
function arcSegments(radius: number, min: number, max: number): number {
  const t = Math.min(1, Math.max(0, (radius - 0.08) / 0.42));
  return Math.round(min + (max - min) * Math.sqrt(t));
}

/**
 * プロシージャルなモンスターの体パーツを作る道具箱。
 * three.jsの素のジオメトリを「生き物の部位」の語彙に翻訳し、
 * 役割別ビルダーが形の設計だけに集中できるようにする。
 * 生成したジオメトリはすべて記録し、dispose時にまとめて解放する。
 */
export class CreatureKit {
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(
    readonly surfaces: SurfaceSet,
    readonly palette: CreaturePalette,
  ) {}

  private track<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  /** 外部で生成したジオメトリ(統合後のメッシュなど)の解放を引き受ける */
  adopt<T extends THREE.BufferGeometry>(geometry: T): T {
    return this.track(geometry);
  }

  mesh(
    geometry: THREE.BufferGeometry,
    style: SurfaceStyle,
    color: THREE.Color,
    variant: SurfaceVariant = "default",
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.track(geometry), this.surfaces.get(style, color, variant));
    mesh.castShadow = styleCastsShadow(style);
    return mesh;
  }

  /** なめらかな楕円体。胴・頭・筋肉のかたまりに使う */
  ball(rx: number, ry: number, rz: number, style: SurfaceStyle, color: THREE.Color, segments?: number): THREE.Mesh {
    // 胴や頭は輪郭がそのままシルエットになるので、大きいものほど細かく割る
    const seg = segments ?? arcSegments(Math.max(rx, ry, rz), 14, 30);
    const geometry = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
    geometry.scale(rx, ry, rz);
    return this.mesh(geometry, style, color);
  }

  /** 面が立った岩の塊。ゴーレムや装甲の硬さを出す */
  rock(rx: number, ry: number, rz: number, style: SurfaceStyle, color: THREE.Color, jitter = 0.18, detail = 1): THREE.Mesh {
    const geometry = new THREE.IcosahedronGeometry(1, detail);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    if (jitter > 0) {
      // 頂点をずらして、同じ立体の繰り返しに見えないようにする
      const seen = new Map<string, number>();
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
        let scale = seen.get(key);
        if (scale === undefined) {
          scale = 1 + (Math.random() - 0.5) * jitter * 2;
          seen.set(key, scale);
        }
        position.setXYZ(i, x * scale, y * scale, z * scale);
      }
    }
    geometry.scale(rx, ry, rz);
    geometry.computeVertexNormals();
    // 岩は皮膚と同じ材質指定で作られることが多いが、表面は鱗ではなく
    // 割れ目で覆われていてほしい。ここで材質の中身だけ差し替える
    return this.mesh(geometry, style, color, "rock");
  }

  box(w: number, h: number, d: number, style: SurfaceStyle, color: THREE.Color): THREE.Mesh {
    return this.mesh(new THREE.BoxGeometry(w, h, d), style, color);
  }

  /** 根元が原点、+Y方向に尖る円錐。角・牙・突起に使う */
  cone(radius: number, height: number, style: SurfaceStyle, color: THREE.Color, radial?: number): THREE.Mesh {
    // 太い角は断面の多角形が見える。細い牙は8角のままで十分
    const geometry = new THREE.ConeGeometry(radius, height, radial ?? arcSegments(radius, 8, 18), 1);
    geometry.translate(0, height / 2, 0);
    return this.mesh(geometry, style, color);
  }

  /** 平たく潰した棘。背びれ・羽根・刃に使う */
  spike(radius: number, height: number, flat: number, style: SurfaceStyle, color: THREE.Color, radial = 4): THREE.Mesh {
    const geometry = new THREE.ConeGeometry(radius, height, radial, 1);
    geometry.rotateY(Math.PI / radial);
    geometry.scale(1, 1, flat);
    geometry.translate(0, height / 2, 0);
    return this.mesh(geometry, style, color);
  }

  /** 八面体。結晶・宝石に使う */
  octa(rx: number, ry: number, rz: number, style: SurfaceStyle, color: THREE.Color): THREE.Mesh {
    const geometry = new THREE.OctahedronGeometry(1, 0);
    geometry.scale(rx, ry, rz);
    geometry.computeVertexNormals();
    return this.mesh(geometry, style, color);
  }

  /** 光輪・拘束環。XY平面に立つので、水平にするにはrotation.x = PI/2 */
  ring(radius: number, tube: number, style: SurfaceStyle, color: THREE.Color, segments = 28): THREE.Mesh {
    return this.mesh(new THREE.TorusGeometry(radius, tube, 8, segments), style, color);
  }

  /** 回転体。ローブ・スカート・襟に使う。profileは[半径, 高さ]の並び */
  lathe(profile: [number, number][], style: SurfaceStyle, color: THREE.Color, segments?: number): THREE.Mesh {
    const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
    // ローブやスカートは面積が大きく、回転方向の折れがいちばん目立つ
    const widest = profile.reduce((m, [r]) => Math.max(m, r), 0);
    return this.mesh(new THREE.LatheGeometry(points, segments ?? arcSegments(widest, 18, 32)), style, color);
  }

  /** 2点を結ぶ円錐台。首・接続部・骨組みを座標指定だけで置ける */
  link(
    from: THREE.Vector3Like,
    to: THREE.Vector3Like,
    r0: number,
    r1: number,
    style: SurfaceStyle,
    color: THREE.Color,
    radial?: number,
  ): THREE.Mesh {
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const direction = b.clone().sub(a);
    const length = direction.length();
    const geometry = new THREE.CylinderGeometry(
      r1,
      r0,
      Math.max(length, 0.001),
      radial ?? arcSegments(Math.max(r0, r1), 8, 18),
      1,
    );
    const mesh = this.mesh(geometry, style, color);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    return mesh;
  }

  /** 平たい装甲板・鱗板。閉じた立体なのでどこから見ても破綻しない */
  lens(rx: number, ry: number, thickness: number, style: SurfaceStyle, color: THREE.Color, segments?: number): THREE.Mesh {
    const seg = segments ?? arcSegments(Math.max(rx, ry), 10, 20);
    const geometry = new THREE.SphereGeometry(1, seg, Math.max(5, Math.round(seg * 0.6)));
    geometry.scale(rx, ry, thickness);
    return this.mesh(geometry, style, color);
  }

  /**
   * 部分的な輪。肋・首輪・肩の装甲リングに使う。
   * XY平面に立ち、arcの分だけ +X から反時計回りに描かれる。
   */
  band(
    radius: number,
    tube: number,
    arc: number,
    style: SurfaceStyle,
    color: THREE.Color,
    segments?: number,
  ): THREE.Mesh {
    // 肋や肩の輪は「輪の弧」の折れが目立つ。管の断面は小さいので6角で足りる
    return this.mesh(
      new THREE.TorusGeometry(radius, tube, 6, segments ?? arcSegments(radius, 14, 26), arc),
      style,
      color,
    );
  }

  /**
   * 制御点を通る、根元から先へ細くなる管。
   * 曲がった角・鉤爪・触手・肋骨など「まっすぐでない硬い部位」に使う。
   * 円柱を継ぐより関節の段差が出ず、シルエットの情報量が上がる。
   */
  taperedTube(
    points: THREE.Vector3Like[],
    r0: number,
    r1: number,
    style: SurfaceStyle,
    color: THREE.Color,
    radial?: number,
    segments?: number,
  ): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    // 6角の管は、太い角や尾だと断面の角がはっきり出る。根元の太さで決める
    const geometry = new THREE.TubeGeometry(
      curve,
      segments ?? Math.max(10, (points.length - 1) * 4),
      1,
      radial ?? arcSegments(r0, 6, 14),
      false,
    );
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const uv = geometry.attributes.uv as THREE.BufferAttribute;
    const center = new THREE.Vector3();
    const vertex = new THREE.Vector3();
    // TubeGeometryは太さが一定なので、uv.u(=長さ方向)を見て軸へ寄せ、先を細くする
    for (let i = 0; i < position.count; i++) {
      const u = uv.getX(i);
      curve.getPointAt(Math.min(1, Math.max(0, u)), center);
      vertex.fromBufferAttribute(position, i);
      vertex.sub(center).multiplyScalar(r0 + (r1 - r0) * u).add(center);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geometry.computeVertexNormals();
    return this.mesh(geometry, style, color);
  }

  /**
   * 内側へ湾曲した爪・牙。付け根が原点で、+Y方向へ伸びながら curve の分だけ -Z へ反る。
   * 直線の円錐より生き物らしく、小さくても「引っ掛ける形」だと分かる。
   */
  claw(length: number, radius: number, curve: number, style: SurfaceStyle, color: THREE.Color): THREE.Mesh {
    const points: THREE.Vector3Like[] = [];
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push({ x: 0, y: length * t, z: -curve * length * t * t });
    }
    return this.taperedTube(points, radius, radius * 0.06, style, color, 5, 6);
  }

  /**
   * 羽根1枚。XY平面に立ち、+Y方向へ伸びる木の葉形。
   * 針状の円錐を放射状に並べると「ウニ」になるため、
   * 面積を持った板を重ねて羽根に見せる。
   */
  feather(length: number, width: number, style: SurfaceStyle, color: THREE.Color, bend = 0.12): THREE.Mesh {
    const geometry = new THREE.ShapeGeometry(
      (() => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.bezierCurveTo(width * 0.9, length * 0.18, width, length * 0.62, width * 0.18, length);
        shape.bezierCurveTo(-width * 0.5, length * 0.68, -width * 0.7, length * 0.2, 0, 0);
        return shape;
      })(),
      10,
    );
    // 断面をわずかに反らせ、平板に見えないようにする
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      position.setZ(i, -Math.abs(x) * bend - y * y * bend * 0.35 / Math.max(0.01, length));
    }
    geometry.computeVertexNormals();
    return this.mesh(geometry, style, color);
  }

  /** 平面の膜。翼膜・布・ひれに使う。shapeはXY平面に描く */
  membrane(build: (shape: THREE.Shape) => void, style: SurfaceStyle, color: THREE.Color, curvature = 0): THREE.Mesh {
    const shape = new THREE.Shape();
    build(shape);
    const geometry = new THREE.ShapeGeometry(shape, 12);
    if (curvature !== 0) {
      // Xが外へ行くほどZ方向に反らせて、平板に見えないようにする
      const position = geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        position.setZ(i, position.getZ(i) + x * x * curvature);
      }
      geometry.computeVertexNormals();
    }
    return this.mesh(geometry, style, color);
  }

  /**
   * 関節でつながった骨の連なり。手足・首・尾・曲がった角に使う。
   * 各関節は-Y方向へ伸び、次の関節はその末端にぶら下がる。
   */
  chain(specs: SegmentSpec[], style: SurfaceStyle, color: THREE.Color): ChainResult {
    const root = new THREE.Group();
    const joints: THREE.Group[] = [];
    const rests: THREE.Euler[] = [];
    let parent: THREE.Object3D = root;

    for (const spec of specs) {
      const joint = new THREE.Group();
      if (spec.rot) joint.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
      parent.add(joint);

      const geometry = new THREE.CylinderGeometry(
        spec.r1,
        spec.r0,
        spec.len,
        spec.radial ?? arcSegments(Math.max(spec.r0, spec.r1), 8, 18),
        1,
      );
      if (spec.flat !== undefined && spec.flat !== 1) geometry.scale(1, 1, spec.flat);
      geometry.translate(0, -spec.len / 2, 0);
      joint.add(this.mesh(geometry, spec.style ?? style, spec.color ?? color));

      const end = new THREE.Group();
      end.position.y = -spec.len;
      joint.add(end);

      joints.push(joint);
      rests.push(joint.rotation.clone());
      parent = end;
    }

    return { root, joints, rests, tip: parent as THREE.Group };
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
    this.surfaces.dispose();
  }
}
