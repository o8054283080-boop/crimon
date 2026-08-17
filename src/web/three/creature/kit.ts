import * as THREE from "three";
import {
  CreaturePalette,
  SkinKind,
  SurfaceSet,
  SurfaceStyle,
  SurfaceVariant,
  styleCastsShadow,
} from "./surface.js";

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
  /**
   * 稜線を立てる。断面の多角形を面ごとに分離して法線を折り、
   * 円柱ではなく「面取りされた角柱」に見せる。硬い部位に使う
   */
  facet?: boolean;
}

/** hull() の輪切り1枚。-Y ではなく +Y 方向へ積み上がる */
export interface HullStation {
  /** 軸方向の位置 */
  y: number;
  /** 左右の半径 */
  r: number;
  /** 前後(Z)の半径。省略時は r */
  rz?: number;
  /** 断面の中心をずらす。曲がった胴・首・尾はこれで作る */
  x?: number;
  z?: number;
  /** 断面のひねり(ラジアン) */
  twist?: number;
  /**
   * 前(-Z)の稜線をどれだけ突き出すか。胸の竜骨・背の峰になる。
   * 1.0で半径ぶん余計に張り出す
   */
  keel?: number;
  /** 後ろ(+Z)の稜線の突き出し */
  ridge?: number;
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

  /**
   * この個体の地肌。ビルダーの先頭で1行指定する。
   *
   *   kit.skin = "scale";  // ドラゴンや蛇
   *   kit.skin = "pelt";   // 狼やグリフォンのように毛に覆われた体
   *   kit.skin = "gel";    // スライムのような粘体
   *
   * 体表の材質("hide")は1体につき数十箇所で指定されるが、
   * 鱗か毛皮かは個体まるごとの性質なので、ここで一括して切り替える。
   * 既定はなめらかな皮膚。指定を忘れた種別が鱗に覆われるより、
   * 模様が無いほうが破綻が小さい。
   */
  skin: SkinKind = "smooth";

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
    variant?: SurfaceVariant,
  ): THREE.Mesh {
    // 地肌はこの個体の肌質で決まる。それ以外の材質(骨・金属・布など)は
    // 個体によらず同じなので、肌質を掛けない
    const resolved = variant ?? (style === "hide" ? this.skin : "smooth");
    const mesh = new THREE.Mesh(this.track(geometry), this.surfaces.get(style, color, resolved));
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

  /**
   * 面取りされた角柱。輪切り(HullStation)を +Y 方向へ積んで、
   * 稜線のある1本の立体を作る。**球を並べる代わりの主役**。
   *
   * 球をいくつ繋いでも輪郭は円弧の連なりにしかならないが、これは
   *   - 断面が多角形なので、光が面ごとに切り替わって形が読める
   *   - 1本の連続した立体なので、胸を張って腰で締める、が輪郭に出る
   * 面は「周方向には割れ、長さ方向にはつながる」ように法線を作っている。
   * つまり縦の稜線だけが立ち、長さ方向は滑らかに流れる。
   *
   * 断面の k=0 は必ず前(-Z)。keel / ridge で前後の稜線だけを突き出せるので、
   * 胸の竜骨・背の峰・腹の合わせ目が1つのメッシュで出せる。
   */
  hull(
    stations: HullStation[],
    style: SurfaceStyle,
    color: THREE.Color,
    o: { sides?: number; capBottom?: boolean; capTop?: boolean; variant?: SurfaceVariant } = {},
  ): THREE.Mesh {
    const sides = Math.max(3, o.sides ?? 8);
    const n = stations.length;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const span = Math.max(0.001, stations[n - 1].y - stations[0].y);

    const put = (s: HullStation, k: number): number => {
      const a = ((k % sides) / sides) * Math.PI * 2;
      const twist = s.twist ?? 0;
      const rz = s.rz ?? s.r;
      // 稜線の張り出し。3乗して、隣の面にはほとんど効かないようにする
      const front = Math.max(0, Math.cos(a)) ** 3;
      const back = Math.max(0, -Math.cos(a)) ** 3;
      const bulge = rz * ((s.keel ?? 0) * front + (s.ridge ?? 0) * back);
      let x = Math.sin(a) * s.r;
      let z = -Math.cos(a) * rz - Math.sign(Math.cos(a) || 1) * bulge;
      if (twist !== 0) {
        const c = Math.cos(twist);
        const sn = Math.sin(twist);
        const nx = x * c + z * sn;
        z = -x * sn + z * c;
        x = nx;
      }
      const index = positions.length / 3;
      positions.push((s.x ?? 0) + x, s.y, (s.z ?? 0) + z);
      // 体表シェーダは模様をワールド座標で描くのでUVは使わないが、
      // 静的パーツの統合(mergeGeometries)は属性の並びが揃っていないと落ちる
      uvs.push(k / sides, (s.y - stations[0].y) / span);
      return index;
    };

    // 側面。1面ぶんの帯ごとに頂点を独立させることで、
    // 長さ方向は法線が平均されて滑らかに、面と面のあいだには稜線が立つ
    for (let k = 0; k < sides; k++) {
      const base = positions.length / 3;
      for (const station of stations) {
        put(station, k);
        put(station, k + 1);
      }
      for (let i = 0; i < n - 1; i++) {
        const a0 = base + i * 2;
        const b0 = a0 + 1;
        const a1 = a0 + 2;
        const b1 = a0 + 3;
        indices.push(a0, a1, b1, a0, b1, b0);
      }
    }

    // 蓋。中心へ集める扇。中に埋まる端は capBottom/capTop を false にして省く
    const capAt = (station: HullStation, up: boolean) => {
      const center = positions.length / 3;
      positions.push(station.x ?? 0, station.y, station.z ?? 0);
      uvs.push(0.5, (station.y - stations[0].y) / span);
      const ring: number[] = [];
      for (let k = 0; k < sides; k++) ring.push(put(station, k));
      for (let k = 0; k < sides; k++) {
        const a = ring[k];
        const b = ring[(k + 1) % sides];
        if (up) indices.push(center, a, b);
        else indices.push(center, b, a);
      }
    };
    if ((o.capBottom ?? true) && stations[0].r > 0.0005) capAt(stations[0], false);
    if ((o.capTop ?? true) && stations[n - 1].r > 0.0005) capAt(stations[n - 1], true);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return this.mesh(geometry, style, color, o.variant);
  }

  /**
   * 装甲板1枚。下辺がV字に尖り、縁が面取りされた板。
   *
   * 平たい `lens` との違いは**縁が立つ**こと。押し出しの側面と面取りが
   * 光を切り替えるので、板が1枚ずつ分かれて見える。積層した胸腹の装甲は、
   * これを少しずつ重ねて並べて作る(plateStack)。
   *
   * wrap を指定すると、半径 wrap の円筒に沿って曲げる。板が胴に貼り付く。
   */
  plate(
    width: number,
    height: number,
    thickness: number,
    style: SurfaceStyle,
    color: THREE.Color,
    o: { notch?: number; wrap?: number; shoulder?: number } = {},
  ): THREE.Mesh {
    const w = width / 2;
    const h = height / 2;
    const notch = o.notch ?? 0.35;
    const shoulder = o.shoulder ?? 0.86;
    const shape = new THREE.Shape();
    shape.moveTo(-w, h);
    shape.lineTo(w, h);
    shape.lineTo(w * shoulder, -h * 0.15);
    shape.lineTo(0, -h - h * notch);
    shape.lineTo(-w * shoulder, -h * 0.15);
    shape.closePath();
    const bevel = Math.min(thickness * 0.7, w * 0.28);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.5,
      bevelSize: bevel,
      bevelOffset: 0,
      bevelSegments: 1,
      curveSegments: 1,
    });
    const wrap = o.wrap ?? 0;
    if (wrap > 0) {
      const position = geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);
        const theta = x / wrap;
        const radius = wrap - z;
        position.setXYZ(i, radius * Math.sin(theta), position.getY(i), wrap - radius * Math.cos(theta));
      }
      geometry.computeVertexNormals();
    }
    return this.mesh(geometry, style, color);
  }

  /**
   * 積層した板。胸腹の装甲・尾の節・肩の重ね甲に使う。
   *
   * 1枚ずつ縁が立ち、下の板の上に次の板が少し被さる。
   * 「丸を並べた胴」に貼るだけで、面が平らでも情報量が出る。
   * 返すのはグループなので、place() で胴に貼り付ける。
   */
  plateStack(
    style: SurfaceStyle,
    color: THREE.Color,
    o: {
      count: number;
      /** 1枚目と最後の板の中心(ローカルY) */
      y0: number;
      y1: number;
      /** 板の幅。先細りさせる */
      width: number;
      widthEnd?: number;
      /** 1枚の高さ。間隔より大きくすると重なる */
      height: number;
      heightEnd?: number;
      thickness: number;
      /** 前後位置 */
      z?: number;
      zEnd?: number;
      /** 胴に沿わせる曲率半径 */
      wrap?: number;
      wrapEnd?: number;
      /** 板の傾き(X軸)。上へ行くほど寝かせる、など */
      tilt?: number;
      tiltEnd?: number;
      notch?: number;
    },
  ): THREE.Group {
    const group = new THREE.Group();
    const lerp = (a: number, b: number | undefined, t: number) => a + ((b ?? a) - a) * t;
    for (let i = 0; i < o.count; i++) {
      const t = o.count === 1 ? 0 : i / (o.count - 1);
      const plate = this.plate(
        lerp(o.width, o.widthEnd, t),
        lerp(o.height, o.heightEnd, t),
        o.thickness,
        style,
        color,
        { notch: o.notch, wrap: lerp(o.wrap ?? 0, o.wrapEnd, t) },
      );
      plate.position.set(0, o.y0 + (o.y1 - o.y0) * t, lerp(o.z ?? 0, o.zEnd, t));
      plate.rotation.x = lerp(o.tilt ?? 0, o.tiltEnd, t);
      // 板の並びは「奥から手前へ」重ねる。描画順ではなく実際の前後で重ねる
      group.add(plate);
    }
    return group;
  }

  /** 尖った結晶1本。断面が多角形なので、光が面ごとに切り替わる */
  shard(length: number, radius: number, style: SurfaceStyle, color: THREE.Color, sides = 5): THREE.Mesh {
    return this.hull(
      [
        { y: 0, r: radius * 0.72 },
        { y: length * 0.17, r: radius },
        { y: length * 0.55, r: radius * 0.52 },
        { y: length, r: radius * 0.02 },
      ],
      style,
      color,
      { sides, capTop: false },
    );
  }

  /**
   * 結晶の房。肩・背・肘・尾に生やす。
   *
   * 1本ずつ均等に生やすと櫛の歯になる。大小を混ぜ、向きを散らし、
   * 根元をひとかたまりに寄せて**群れ**にすることで初めて房に見える。
   * 大きいものを1本だけ立て、残りをその周りに従わせるのが要点。
   */
  shardCluster(
    style: SurfaceStyle,
    color: THREE.Color,
    o: {
      count: number;
      /** いちばん長い1本の長さ */
      length: number;
      radius: number;
      /** 散らばる角度(ラジアン) */
      spread?: number;
      /** 根元の散らばり */
      scatter?: number;
      sides?: number;
      /** 小さいものをどれだけ小さくするか(0.2で最小2割) */
      minScale?: number;
    },
  ): THREE.Group {
    const group = new THREE.Group();
    const spread = o.spread ?? 0.6;
    const scatter = o.scatter ?? o.radius * 1.4;
    const minScale = o.minScale ?? 0.24;
    for (let i = 0; i < o.count; i++) {
      // 0本目を主役にして、以降は従属させる。等分しないので櫛にならない
      const rank = i === 0 ? 1 : minScale + (1 - minScale) * Math.random() ** 1.7;
      const length = o.length * rank;
      const radius = o.radius * (0.45 + rank * 0.55);
      const shard = this.shard(length, radius, style, color, o.sides ?? 5);
      const azimuth = Math.random() * Math.PI * 2;
      const tilt = i === 0 ? spread * 0.18 : spread * (0.35 + Math.random() * 0.85);
      const reach = i === 0 ? 0 : scatter * (0.3 + Math.random() * 0.9);
      shard.position.set(Math.cos(azimuth) * reach, -radius * 0.4, Math.sin(azimuth) * reach);
      shard.rotation.set(Math.sin(azimuth) * tilt, Math.random() * Math.PI * 2, -Math.cos(azimuth) * tilt);
      group.add(shard);
    }
    return group;
  }

  /**
   * 骨組みの見える膜。翼・ひれ・帆に使う。
   *
   * 膜だけを張ると布に見え、骨だけを並べると傘の骨になる。
   * ここでは「指の骨」「骨と骨のあいだで垂れる膜」「膜に浮く筋」を
   * まとめて作り、**膜が骨に吊られている**関係を見せる。
   *
   * hub から fingers の各点へ骨が伸び、outline が縁を通る。
   * 縁は指と指のあいだで sag のぶん内側へ垂れる。
   */
  ribbedMembrane(
    o: {
      hub: THREE.Vector3Like;
      /** 骨の先。順に縁を作る */
      fingers: THREE.Vector3Like[];
      /** 縁の始点(肩など)。fingers の前に置かれる */
      leading: THREE.Vector3Like[];
      /** 指の間の垂れ(0で直線、0.2でよく垂れる) */
      sag?: number;
      /** 骨の太さ */
      bone?: number;
      /** 膜の反り */
      curvature?: number;
      /** 膜に浮かせる筋の本数(指1本あたり) */
      veins?: number;
    },
    boneStyle: SurfaceStyle,
    boneColor: THREE.Color,
    membraneStyle: SurfaceStyle,
    membraneColor: THREE.Color,
  ): THREE.Group {
    const group = new THREE.Group();
    const hub = new THREE.Vector3(o.hub.x, o.hub.y, o.hub.z);
    const fingers = o.fingers.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const lead = o.leading.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const sag = o.sag ?? 0.16;
    const bone = o.bone ?? 0.03;

    // 縁。指の間は内側へ垂れる
    const membrane = this.membrane(
      (shape) => {
        const edge = [...lead, ...fingers];
        shape.moveTo(edge[0].x, edge[0].y);
        for (let i = 1; i < lead.length; i++) shape.lineTo(edge[i].x, edge[i].y);
        for (let i = lead.length; i < edge.length; i++) {
          const previous = edge[i - 1];
          const current = edge[i];
          const mx = (previous.x + current.x) * 0.5;
          const my = (previous.y + current.y) * 0.5;
          // 中点を hub 側へ引き寄せる。これが指の間のたるみになる
          shape.quadraticCurveTo(
            mx + (hub.x - mx) * sag * 2,
            my + (hub.y - my) * sag * 2,
            current.x,
            current.y,
          );
        }
        const last = edge[edge.length - 1];
        shape.quadraticCurveTo(
          (last.x + hub.x) * 0.5,
          (last.y + hub.y) * 0.5,
          edge[0].x,
          edge[0].y,
        );
      },
      membraneStyle,
      membraneColor,
      o.curvature ?? 0,
    );
    group.add(membrane);

    // 指の骨。膜より手前へ少しだけ浮かせ、骨が膜を持ち上げているように見せる
    const lift = bone * 0.9;
    for (const finger of fingers) {
      const direction = finger.clone().sub(hub);
      const mid = hub.clone().addScaledVector(direction, 0.45);
      group.add(
        this.taperedTube(
          [
            { x: hub.x, y: hub.y, z: hub.z - lift },
            { x: mid.x, y: mid.y, z: mid.z - lift * 1.6 },
            { x: finger.x, y: finger.y, z: finger.z - lift },
          ],
          bone,
          bone * 0.3,
          boneStyle,
          boneColor,
          5,
          8,
        ),
      );
      // 指の関節。膜の張った骨組みが節を持って見える
      const knuckle = this.hull(
        [
          { y: -bone * 0.8, r: bone * 0.5 },
          { y: 0, r: bone * 1.25 },
          { y: bone * 0.8, r: bone * 0.5 },
        ],
        boneStyle,
        boneColor,
        { sides: 5 },
      );
      knuckle.position.set(mid.x, mid.y, mid.z - lift * 1.6);
      group.add(knuckle);
    }

    // 膜に浮く筋。指と指のあいだの膜を、要から縁へ細く走る。
    // 指そのものから枝を出すと膜の外へ飛び出すので、必ず**隣り合う指の間**へ引く
    const veins = o.veins ?? 0;
    for (let i = 0; i + 1 < fingers.length; i++) {
      for (let k = 1; k <= veins; k++) {
        const t = k / (veins + 1);
        const edge = fingers[i].clone().lerp(fingers[i + 1], t);
        // 縁は指の間で hub 側へ垂れている。筋もその垂れに従わせる
        edge.lerp(hub, sag * 2 * (1 - Math.abs(t * 2 - 1)));
        const tip = hub.clone().lerp(edge, 0.88);
        group.add(
          this.taperedTube(
            [
              { x: hub.x, y: hub.y, z: hub.z - lift * 0.6 },
              { x: (hub.x + tip.x) * 0.5, y: (hub.y + tip.y) * 0.5, z: (hub.z + tip.z) * 0.5 - lift * 0.8 },
              { x: tip.x, y: tip.y, z: tip.z - lift * 0.4 },
            ],
            bone * 0.26,
            bone * 0.05,
            membraneStyle,
            boneColor,
            4,
            6,
          ),
        );
      }
    }
    return group;
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
      if (spec.facet) {
        // 面ごとに法線を折る。円柱ではなく角柱として読める
        const faceted = geometry.toNonIndexed();
        faceted.computeVertexNormals();
        if (faceted !== geometry) geometry.dispose();
        joint.add(this.mesh(faceted, spec.style ?? style, spec.color ?? color));
      } else {
        joint.add(this.mesh(geometry, spec.style ?? style, spec.color ?? color));
      }

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
