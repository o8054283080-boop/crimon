import * as THREE from "three";
import { CreaturePalette, SurfaceSet, SurfaceStyle, styleCastsShadow } from "./surface.js";

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

  mesh(geometry: THREE.BufferGeometry, style: SurfaceStyle, color: THREE.Color): THREE.Mesh {
    const mesh = new THREE.Mesh(this.track(geometry), this.surfaces.get(style, color));
    mesh.castShadow = styleCastsShadow(style);
    return mesh;
  }

  /** なめらかな楕円体。胴・頭・筋肉のかたまりに使う */
  ball(rx: number, ry: number, rz: number, style: SurfaceStyle, color: THREE.Color, segments = 14): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(1, segments, Math.max(6, Math.round(segments * 0.7)));
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
    return this.mesh(geometry, style, color);
  }

  box(w: number, h: number, d: number, style: SurfaceStyle, color: THREE.Color): THREE.Mesh {
    return this.mesh(new THREE.BoxGeometry(w, h, d), style, color);
  }

  /** 根元が原点、+Y方向に尖る円錐。角・牙・突起に使う */
  cone(radius: number, height: number, style: SurfaceStyle, color: THREE.Color, radial = 8): THREE.Mesh {
    const geometry = new THREE.ConeGeometry(radius, height, radial, 1);
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
  ring(radius: number, tube: number, style: SurfaceStyle, color: THREE.Color, segments = 24): THREE.Mesh {
    return this.mesh(new THREE.TorusGeometry(radius, tube, 6, segments), style, color);
  }

  /** 回転体。ローブ・スカート・襟に使う。profileは[半径, 高さ]の並び */
  lathe(profile: [number, number][], style: SurfaceStyle, color: THREE.Color, segments = 18): THREE.Mesh {
    const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
    return this.mesh(new THREE.LatheGeometry(points, segments), style, color);
  }

  /** 2点を結ぶ円錐台。首・接続部・骨組みを座標指定だけで置ける */
  link(
    from: THREE.Vector3Like,
    to: THREE.Vector3Like,
    r0: number,
    r1: number,
    style: SurfaceStyle,
    color: THREE.Color,
    radial = 8,
  ): THREE.Mesh {
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const direction = b.clone().sub(a);
    const length = direction.length();
    const geometry = new THREE.CylinderGeometry(r1, r0, Math.max(length, 0.001), radial, 1);
    const mesh = this.mesh(geometry, style, color);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    return mesh;
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

      const geometry = new THREE.CylinderGeometry(spec.r1, spec.r0, spec.len, spec.radial ?? 8, 1);
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
