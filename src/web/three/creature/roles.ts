import * as THREE from "three";
import { ChainResult, CreatureKit } from "./kit.js";
import {
  AIM_BACK,
  AIM_DOWN,
  AIM_FORWARD,
  CreatureRig,
  RigLimb,
  markAnimated,
  place,
} from "./rig.js";

/**
 * 役割別のシルエット設計。
 *
 * 座標系の約束:
 *   -Z が正面(敵の方向) / +X が右 / +Y が上
 *   chain() の骨は -Y へ伸び、rot.x が正なら先端が前(-Z)へ振れる
 *   胴(torso)は +Y が背骨方向なので、rotation.x が負で前傾する
 *
 * 実寸は finalizeRig() が体高から正規化するため、ここでは比率だけを設計する。
 */

/** 連鎖から手足を登録する。関節はアニメーション対象としてマークする */
export function limbFrom(chain: ChainResult, side: number, phase: number, front = false): RigLimb {
  markAnimated(...chain.joints);
  return {
    root: chain.joints[0],
    rootRest: chain.rests[0],
    lower: chain.joints[1] ?? null,
    lowerRest: chain.rests[1] ?? null,
    tip: chain.tip,
    side,
    phase,
    front,
  };
}

/**
 * 指と爪を扇状に付ける。
 * 指の節(短い骨)を挟んでから鉤爪を付けることで、
 * 「手先に棘が生えている」ではなく「指の先の爪」に見える。
 */
export function addClaws(kit: CreatureKit, hand: THREE.Object3D, count: number, length: number, radius: number, spread: number): void {
  const p = kit.palette;
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spread;
    const finger = new THREE.Group();
    place(finger, offset, -0.02, -0.02, AIM_FORWARD + 0.55, offset * 1.6, 0);
    // 指の節。爪の根元が肉に埋まっているように見せる
    finger.add(place(kit.ball(radius * 1.5, length * 0.3, radius * 1.5, "hide", p.dark, 6), 0, length * 0.18, 0));
    finger.add(kit.claw(length, radius * 1.35, 0.55, "plate", p.plate));
    hand.add(finger);
  }
}

/** 関節。骨の継ぎ目に球と輪を入れて、円柱の直結を隠す */
export function addJoint(kit: CreatureKit, joint: THREE.Object3D, y: number, radius: number, armored: boolean): void {
  const p = kit.palette;
  joint.add(place(kit.ball(radius, radius * 0.9, radius, "hide", p.dark, 8), 0, y, 0));
  if (armored) {
    // 膝・肘の当て金。外側だけを覆う板で、装甲の重なりを作る
    joint.add(place(kit.lens(radius * 1.15, radius * 1.0, radius * 0.5, "metal", p.metal), 0, y, -radius * 0.75, 0.2, 0, 0));
  }
}

/**
 * 肋・腹の節。胴の側面に細い帯を並べて、一枚の塊に「節」を刻む。
 * 遠目でも胴の丸みと向きが読めるようになる。
 */
export function addRibs(kit: CreatureKit, torso: THREE.Object3D, count: number, y0: number, y1: number, radius: number, tube: number): void {
  const p = kit.palette;
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const y = y0 + (y1 - y0) * t;
    const r = radius * (0.82 + Math.sin((1 - t) * Math.PI * 0.6) * 0.22);
    const rib = kit.band(r, tube, Math.PI * 1.05, "plate", p.plate, 12);
    // 前(-Z)を向く半円にして、腹側にだけ節が出るようにする
    place(rib, 0, y, 0, Math.PI / 2, -Math.PI * 0.52, 0);
    torso.add(rib);
  }
}

/** 装甲板を重ねて貼る。段差の影が「積み木」感を消す主役 */
export function addPlating(
  kit: CreatureKit,
  parent: THREE.Object3D,
  count: number,
  y0: number,
  y1: number,
  width: number,
  z: number,
  style: "metal" | "plate" = "metal",
): void {
  const p = kit.palette;
  const color = style === "metal" ? p.metal : p.plate;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const y = y0 + (y1 - y0) * t;
    const w = width * (1 - t * 0.18);
    const plate = kit.lens(w, w * 0.30, w * 0.24, style, color, 10);
    place(plate, 0, y, z, -0.25 + t * 0.1, 0, 0);
    parent.add(plate);
  }
}

/**
 * 目つき。
 *
 * 同じ骨格でも、目の「形」と「傾き」だけで性格が変わる。
 * 光る球を2つ置くと、どの種別も同じ顔になり、生き物ではなく
 * 電飾を付けた人形に見えてしまう。ここでは
 *   1. 丸ではなくアーモンド形の強膜(白目)
 *   2. その上に被さる上まぶた
 *   3. 目尻の上がり下がり
 * の3つで表情を作る。この3つは画面上で目が10pxしかなくても効く。
 */
export type EyeMood =
  /** 吊り目・厚いまぶた。獣・竜 */
  | "fierce"
  /** 細く冷たい。魔王・不死者 */
  | "cold"
  /** 大きく丸い。小動物・妖精・粘体 */
  | "round"
  /** やや垂れ目。癒し手・天使 */
  | "gentle"
  /** 白目を持たない発光体。ゴーレム・結晶などの無機物 */
  | "blank";

interface MoodSpec {
  /** 目の縦横比。小さいほど細い */
  aspect: number;
  /** 目尻の上がり(ラジアン)。正で吊り目、負で垂れ目 */
  tilt: number;
  /** 虹彩の大きさ(強膜の縦半径に対する比) */
  iris: number;
  /** 上まぶたの被さり。0.5で目の半分が隠れる */
  lid: number;
  /** 眉庇の傾き。目尻の傾きに足される */
  brow: number;
  /**
   * 眼球の作り。**明色の面積をどれだけ許すか**の指定でもある。
   *   "none"  眼球を持たない。暗い眼窩に虹彩だけが灯る(無機物・不死者)
   *   "dark"  暗い眼球。獣・竜。虹彩だけが光り、そのまわりは沈む。
   *           ここを生成り色にすると、目が「白い塊」になって顔が消える
   *           (実際にそうなった。獣に人間の白目を付けてはいけない)
   *   "wet"   つやのある明るい白目。可愛さ・神聖さを出す種別に使う
   */
  sclera: "none" | "dark" | "wet";
}

const EYE_MOODS: Record<EyeMood, MoodSpec> = {
  fierce: { aspect: 0.50, tilt: 0.40, iris: 0.78, lid: 0.32, brow: 0.36, sclera: "dark" },
  cold: { aspect: 0.42, tilt: 0.34, iris: 0.72, lid: 0.30, brow: 0.26, sclera: "none" },
  // 可愛さは「虹彩が眼球をほとんど埋めていること」で決まる。
  // 白目を広く残すと、大人びた・あるいは不気味な顔になる。
  // まぶたは持たせない。丸い目に厚いまぶたを乗せると、目の上に肉の瘤が付く
  round: { aspect: 1.00, tilt: -0.05, iris: 0.94, lid: 0, brow: -0.10, sclera: "wet" },
  gentle: { aspect: 0.70, tilt: -0.18, iris: 0.60, lid: 0.28, brow: -0.24, sclera: "wet" },
  blank: { aspect: 0.60, tilt: 0.14, iris: 0.90, lid: 0.00, brow: 0.20, sclera: "none" },
};

export interface EyeOptions {
  /** 中心からの左右のずれ */
  x: number;
  y: number;
  z: number;
  /** 目の横半径 */
  size: number;
  mood?: EyeMood;
  /** 顔の丸みに沿って外へ向ける角度 */
  splay?: number;
  /** 眉庇を出す。頭に別の庇や兜がある場合は切る */
  brow?: boolean;
  /** まぶたの色。既定は地肌の陰色 */
  skin?: THREE.Color;
  /** 瞳孔の細さ。1で丸、0.3で縦の裂け目(爬虫類) */
  slit?: number;
}

/**
 * 表情を持つ目。左右1対を組んで head に足す。
 *
 * 部品はすべて小さいので分割数を低く固定してある(顔まわりで頂点を
 * 使い切ると、体のシルエットに回す余地が無くなる)。
 */
export function addFaceEyes(kit: CreatureKit, head: THREE.Object3D, o: EyeOptions): void {
  const p = kit.palette;
  const m = EYE_MOODS[o.mood ?? "fierce"];
  const s = o.size;
  const h = s * m.aspect;
  const skin = o.skin ?? p.dark;
  const slit = o.slit ?? 1;
  // 虹彩は縦半径で決まるが、細い目では横にはみ出すので横幅でも頭打ちにする。
  // 明るい眼球の種別だけは、虹彩が白目を押しのけて大きく取れるようにする
  // (白目の面積が広いと、可愛い目つきにはならない)
  const iris = Math.min(s * (m.sclera === "wet" ? 0.74 : 0.66), h * m.iris);

  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    place(eye, side * o.x, o.y, o.z, 0, -side * (o.splay ?? 0), side * m.tilt);

    // 眼窩。目のまわりを一段暗く落として、目玉が顔に埋まって見えるようにする。
    // 目より奥に置き、縁だけがはみ出して見えるようにするのが要
    eye.add(place(kit.lens(s * 1.34, h * 1.5 + s * 0.16, s * 0.4, "hide", p.deep, 10), 0, 0, s * 0.2));

    if (m.sclera === "none") {
      // 眼球を持たない種別。窪みの底をもう一段落として、そこに虹彩だけを灯す
      eye.add(place(kit.lens(s * 0.96, h * 1.06, s * 0.34, "hide", p.deep, 10), 0, 0, s * 0.02));
    } else {
      // 眼球。丸ではなくアーモンド形にすることで、初めて「目つき」が生まれる。
      // 明色にしてよいのは "wet" の種別だけ。獣を明色にすると顔が白い塊になる
      eye.add(
        place(
          kit.lens(s, h, s * 0.42, m.sclera === "wet" ? "plate" : "hide", m.sclera === "wet" ? p.plate : p.deep, 12),
          0,
          0,
          0,
        ),
      );
    }

    // 虹彩・瞳孔・ハイライトは、必ず眼球の前面より手前へ順に重ねる。
    // 眼球と同じ深さに置くと球に飲まれて、遠景では目が消える。
    if (m.sclera === "wet") {
      // 明るい眼球の上では、**虹彩を暗くする**。
      // 白い眼球に発光する円を乗せると白飛びした一枚の板になり、
      // 瞳の色も視線も消える(実際にそうなっていた)。
      // 大きな暗い虹彩・その中心の小さな光・白い眼球の三段で、
      // 発光面積を増やさずに「丸くて濡れた目」を作る
      eye.add(place(kit.lens(iris, iris * (h / s), s * 0.2, "hide", p.deep, 12), 0, 0, -s * 0.34));
      eye.add(place(kit.lens(iris * 0.46 * slit, iris * 0.46 * (h / s), s * 0.12, "glow", p.glow, 10), 0, 0, -s * 0.46));
    } else {
      eye.add(place(kit.lens(iris, iris, s * 0.14, "glow", p.glow, 10), 0, 0, -s * 0.4));
      // 瞳孔。ここが無いと、どんなに形を整えても視線が生まれない
      eye.add(place(kit.lens(iris * 0.52 * slit, iris * 0.84, s * 0.09, "hide", p.deep, 7), 0, 0, -s * 0.5));
    }
    // ハイライト。1点入るだけで目が濡れた球として読める
    eye.add(place(kit.lens(iris * 0.30, iris * 0.30, s * 0.06, "plate", p.plate, 6), iris * 0.40, iris * 0.42, -s * 0.56));
    if (m.sclera === "wet") {
      // 反対の隅にもう1点。2点入ると目が「濡れて丸い」ことが決定的になる
      eye.add(place(kit.lens(iris * 0.17, iris * 0.17, s * 0.05, "plate", p.plate, 6), -iris * 0.44, -iris * 0.48, -s * 0.54));
    }

    // まぶたの縁。目の輪郭を暗い線で1周なぞると、10画素の大きさでも
    // 「点」ではなく「目の形」として読める。上を太く、下を細くする
    const rimTop = kit.band(s * 1.02, s * 0.09, Math.PI, "hide", skin, 16);
    rimTop.scale.set(1, h / s, 1);
    place(rimTop, 0, 0, -s * 0.26);
    eye.add(rimTop);
    const rimLow = kit.band(s * 1.0, s * 0.055, Math.PI, "hide", skin, 14);
    rimLow.scale.set(1, h / s, 1);
    place(rimLow, 0, 0, -s * 0.24, 0, 0, Math.PI);
    eye.add(rimLow);

    if (m.lid > 0.001) {
      // 上まぶた。目の上を覆う量が、そのまま「据わった目つき」の強さになる
      const lidH = h * 1.0;
      eye.add(
        place(
          kit.lens(s * 1.14, lidH, s * 0.62, "hide", skin, 10),
          0,
          h * (1 - 2 * m.lid) + lidH * 0.94,
          -s * 0.04,
          -0.26,
          0,
          0,
        ),
      );
    }
    // 下まぶた(涙袋)。目の下に段差が出ると、頬との境目が生まれる
    eye.add(place(kit.lens(s * 0.98, h * 0.52, s * 0.56, "hide", skin, 8), 0, -h * 1.16, s * 0.02, 0.26, 0, 0));

    if (o.brow !== false) {
      // 眉庇。目の上に張り出して影を落とす。遠景で表情が読める最大の要因
      const brow = new THREE.Group();
      place(brow, 0, h * 1.1 + s * 0.2, -s * 0.06, -0.4, 0, side * m.brow);
      brow.add(kit.lens(s * 1.14, s * 0.2, s * 0.5, "hide", skin, 10));
      // 眉頭の盛り上がり。左右2本の庇が眉間で寄るとしかめ面になる
      brow.add(place(kit.lens(s * 0.42, s * 0.24, s * 0.4, "hide", skin, 8), -side * s * 0.72, -s * 0.06, s * 0.02));
      eye.add(brow);
    }

    head.add(eye);
  }
}

/** 旧来の呼び出し口。獣の目つきを既定にして、全種別の顔を底上げする */
export function addEyes(kit: CreatureKit, head: THREE.Object3D, x: number, y: number, z: number, radius: number): void {
  addFaceEyes(kit, head, { x, y, z, size: radius * 1.25, mood: "fierce" });
}

export interface BeastHeadOptions {
  /** 頭蓋の半径(X, Y, Z) */
  skull: [number, number, number];
  /** 口先の長さ。0で無し */
  snout: number;
  /** 顎を開閉できるようにする */
  jaw: boolean;
  /** 角の生やし方 */
  horns: "none" | "swept" | "crown";
  /** 頭頂のトゲの数 */
  crest: number;
  eye: number;
  color?: THREE.Color;
  /** 目つき。種別の性格を一番安く出せる場所 */
  mood?: EyeMood;
  /** 瞳孔の細さ。竜や蛇は縦の裂け目にする */
  slit?: number;
}

/**
 * 獣型の頭。アタッカー/ボス/デバッファーで比率を変えて使い回し、
 * 「同じ世界のモンスター」としての統一感を出す。
 *
 * 顔は「頭蓋の球+光る目」では絶対に生き物にならない。
 * 鼻梁・眉間・頬骨・口の合わせ目・鼻孔という、影が落ちる境目を
 * ひととおり刻んでおくことで、遠景でも顔として読める。
 */
export function addBeastHead(kit: CreatureKit, rig: CreatureRig, o: BeastHeadOptions): void {
  const p = kit.palette;
  const head = rig.head;
  const [sx, sy, sz] = o.skull;
  const skin = o.color ?? p.main;

  // 頭蓋の中心。以降の部位はすべてここを基準に組む。
  // 「頭蓋の原点」を持たずに書くと、口先と目の上下関係が崩れて
  // 口が目を飲み込む(実際にそうなっていた)
  const cy = sy * 0.9;
  const cz = -sz * 0.1;
  // 口先。口角(頬の前)から先端まで
  const mouthBack = cz - sz * 0.30;
  const tipZ = cz - sz * 0.62 - o.snout;
  const mLen = mouthBack - tipZ;
  const at = (t: number) => mouthBack - mLen * t;
  // 上顎の中心。**目より必ず下**に置く
  const mY = cy - sy * 0.3;
  // 目。眼窩の丘の上、口先の稜線より上に乗せる
  const eyeX = sx * 0.6;
  const eyeY = cy + sy * 0.34;
  const eyeZ = cz - sz * 0.82;

  head.add(place(kit.ball(sx, sy, sz, "hide", skin), 0, cy, cz));
  // 後頭部。頭蓋を1つの球で終わらせると、真横から見た時に風船になる
  head.add(place(kit.ball(sx * 0.84, sy * 0.8, sz * 0.62, "hide", skin, 12), 0, cy + sy * 0.08, cz + sz * 0.58));
  // 側頭の窪みを挟んだ頬。頭蓋の球と口先のあいだに段を作る
  for (const side of [-1, 1]) {
    head.add(
      place(kit.ball(sx * 0.42, sy * 0.34, sz * 0.34, "hide", skin, 10), side * sx * 0.7, cy - sy * 0.18, cz - sz * 0.24, 0, side * 0.3, side * 0.28),
    );
  }
  // 眼窩の丘。目を乗せる土台。これが無いと、目が頭蓋の球面に貼った札に見える
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(sx * 0.46, sy * 0.42, sz * 0.38, "hide", skin, 12), side * sx * 0.5, cy + sy * 0.28, cz - sz * 0.54));
  }
  // 眉間。左右の丘のあいだを一段低く残すため、細く高い稜線だけを通す
  head.add(place(kit.ball(sx * 0.24, sy * 0.34, sz * 0.42, "hide", skin, 10), 0, cy + sy * 0.36, cz - sz * 0.5));

  if (o.snout > 0) {
    // 鼻づら。付け根から先へ3段で絞る。1つの楕円で伸ばすと管に見える。
    // **上端(mY + ry)が目の下端を超えないこと**が唯一の制約
    for (const seg of [
      { t: 0.0, rx: 0.62, ry: 0.44, rz: 0.38, lift: 0.06 },
      { t: 0.46, rx: 0.42, ry: 0.3, rz: 0.3, lift: 0.0 },
      { t: 0.84, rx: 0.32, ry: 0.23, rz: 0.22, lift: -0.04 },
    ]) {
      head.add(
        place(kit.ball(sx * seg.rx, sy * seg.ry, mLen * seg.rz, "hide", skin, 12), 0, mY + sy * seg.lift, at(seg.t)),
      );
    }
    // 鼻梁。眉間から鼻先へ稜線を1本通すと、顔に「正面」ができる
    head.add(
      kit.taperedTube(
        [
          { x: 0, y: cy + sy * 0.42, z: cz - sz * 0.56 },
          { x: 0, y: mY + sy * 0.26, z: at(0.3) },
          { x: 0, y: mY + sy * 0.16, z: at(0.86) },
        ],
        sx * 0.2,
        sx * 0.12,
        "hide",
        skin,
        6,
        8,
      ),
    );
    // 鼻先の硬い部分と鼻孔。鼻鏡は口先の幅を超えないこと(超えると牛になる)
    head.add(place(kit.lens(sx * 0.2, sy * 0.13, sx * 0.1, "plate", p.deep, 10), 0, mY + sy * 0.1, tipZ + sx * 0.04));
    for (const side of [-1, 1]) {
      head.add(
        place(kit.lens(sx * 0.055, sy * 0.05, sx * 0.05, "hide", p.deep, 6), side * sx * 0.1, mY + sy * 0.08, tipZ - sx * 0.02),
      );
    }
    // 上唇の合わせ目。口の線が1本入るだけで、鼻づらが「筒」から「口」になる。
    // 口角(奥)を厚く、先端を薄くして、開いた口の暗がりに見せる。
    // 太くすると輪郭を割る黒い帯になるので、内側へ沈めた細い線に留める
    for (const side of [-1, 1]) {
      head.add(
        kit.taperedTube(
          [
            { x: side * sx * 0.44, y: mY - sy * 0.28, z: at(-0.02) },
            { x: side * sx * 0.34, y: mY - sy * 0.24, z: at(0.48) },
            { x: side * sx * 0.18, y: mY - sy * 0.17, z: at(0.94) },
          ],
          sx * 0.075,
          sx * 0.025,
          "hide",
          p.deep,
          5,
          8,
        ),
      );
      // 口角の膨らみ。ここに段が出ると、口が「線」ではなく「開く場所」になる
      head.add(
        place(kit.lens(sx * 0.16, sy * 0.2, sz * 0.2, "hide", skin, 8), side * sx * 0.48, mY + sy * 0.02, at(-0.02), 0, side * 0.3, side * 0.3),
      );
    }
    // 上顎の牙。口の合わせ目の線から下へ抜けるように出す
    for (const side of [-1, 1]) {
      for (const spec of [
        { t: 0.24, len: 0.4, r: 0.1 },
        { t: 0.58, len: 0.26, r: 0.07 },
      ]) {
        const fang = kit.spike(sx * spec.r, sy * spec.len, 0.8, "plate", p.plate);
        place(fang, side * sx * 0.34, mY - sy * 0.22, at(spec.t), AIM_DOWN, 0, side * 0.12);
        head.add(fang);
      }
    }
  }

  // 頬骨。目の下から口角へ張り出す面。顔の幅がここで決まる
  for (const side of [-1, 1]) {
    head.add(
      place(
        kit.lens(sx * 0.4, sy * 0.34, sz * 0.36, "hide", skin, 9),
        side * sx * 0.62,
        cy - sy * 0.06,
        cz - sz * 0.46,
        0.1,
        side * 0.5,
        side * 0.34,
      ),
    );
  }

  // 目は眼窩の丘の面へ乗せる。少しでも内側に入ると、遠景では目が消える
  addFaceEyes(kit, head, {
    x: eyeX,
    y: eyeY,
    z: eyeZ,
    size: o.eye * 1.05,
    mood: o.mood ?? "fierce",
    splay: 0.42,
    slit: o.slit,
    skin,
  });

  if (o.jaw) {
    const jaw = new THREE.Group();
    // 顎の回転軸は耳の下。ここを前へ出しすぎると、開いた時に顎が宙を切る
    place(jaw, 0, mY - sy * 0.06, cz - sz * 0.2);
    markAnimated(jaw);
    // 下顎。上顎より細く、先へ向かって薄くなる
    jaw.add(place(kit.ball(sx * 0.5, sy * 0.24, mLen * 0.42, "hide", p.dark, 12), 0, -sy * 0.14, -mLen * 0.34));
    jaw.add(place(kit.ball(sx * 0.36, sy * 0.18, mLen * 0.26, "hide", p.dark, 10), 0, -sy * 0.16, -mLen * 0.74));
    // 咬筋。顎の付け根を太らせると、噛む力があるように見える
    for (const side of [-1, 1]) {
      jaw.add(place(kit.lens(sx * 0.2, sy * 0.24, sz * 0.22, "hide", skin, 8), side * sx * 0.44, sy * 0.02, sz * 0.02, 0, 0, side * 0.24));
      for (const spec of [
        { t: 0.34, len: 0.3 },
        { t: 0.66, len: 0.2 },
      ]) {
        const tooth = kit.spike(sx * 0.09, sy * spec.len, 0.8, "plate", p.plate);
        place(tooth, side * sx * 0.32, -sy * 0.16, -mLen * spec.t);
        jaw.add(tooth);
      }
    }
    head.add(jaw);
    rig.jaw = jaw;
  }

  if (o.horns === "swept") {
    // 後ろへ流れる曲がった角。根元に輪を重ねて年輪の節を作り、
    // 途中から小さな枝を出して「1本の棒」に見えないようにする
    for (const side of [-1, 1]) {
      const curve: THREE.Vector3Like[] = [
        { x: side * sx * 0.66, y: sy * 1.2, z: sz * 0.1 },
        { x: side * sx * 1.1, y: sy * 1.66, z: sz * 0.7 },
        { x: side * sx * 1.42, y: sy * 1.76, z: sz * 1.5 },
        { x: side * sx * 1.5, y: sy * 1.6, z: sz * 2.3 },
      ];
      head.add(kit.taperedTube(curve, sx * 0.28, sx * 0.02, "plate", p.plate, 6, 10));
      for (let i = 0; i < 3; i++) {
        const t = 0.1 + i * 0.16;
        const ring = kit.band(sx * (0.3 - i * 0.045), sx * 0.05, Math.PI * 2, "plate", p.plate, 8);
        const at = new THREE.Vector3().lerpVectors(
          new THREE.Vector3(curve[0].x, curve[0].y, curve[0].z),
          new THREE.Vector3(curve[1].x, curve[1].y, curve[1].z),
          t * 2.2,
        );
        place(ring, at.x, at.y, at.z, 0.9, side * 0.9, 0);
        head.add(ring);
      }
      // 枝分かれした副角
      head.add(
        kit.taperedTube(
          [
            { x: side * sx * 1.05, y: sy * 1.6, z: sz * 0.66 },
            { x: side * sx * 1.15, y: sy * 1.95, z: sz * 0.9 },
            { x: side * sx * 1.05, y: sy * 2.2, z: sz * 1.3 },
          ],
          sx * 0.1,
          sx * 0.012,
          "plate",
          p.plate,
          5,
          6,
        ),
      );
    }
  } else if (o.horns === "crown") {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1) - 0.5;
      const horn = kit.spike(sx * 0.2, sy * (1.5 - Math.abs(t) * 1.2), 0.85, "plate", p.plate);
      place(horn, t * sx * 1.7, sy * 1.35, sz * (0.1 + Math.abs(t) * 0.5), 0.5, 0, -t * 1.5);
      head.add(horn);
      // 冠の根元をつなぐ台座。棘が「刺さっている」のではなく生えて見える
      if (i < count - 1) {
        head.add(
          place(
            kit.lens(sx * 0.2, sy * 0.12, sz * 0.12, "plate", p.plate, 7),
            (t + 0.5 / (count - 1)) * sx * 1.7,
            sy * 1.3,
            sz * (0.1 + Math.abs(t) * 0.5),
            0.3,
            0,
            -t,
          ),
        );
      }
    }
  }

  // 頬の甲板と耳。頭蓋がただの球にならないようにする
  for (const side of [-1, 1]) {
    head.add(place(kit.lens(sx * 0.44, sy * 0.5, sx * 0.3, "plate", p.plate, 8), side * sx * 0.82, sy * 0.86, -sz * 0.2, 0, side * 0.4, side * 0.25));
    const ear = kit.spike(sx * 0.22, sy * 0.9, 0.35, "hide", skin);
    place(ear, side * sx * 0.8, sy * 1.15, sz * 0.4, 0.5, 0, -side * 1.15);
    head.add(ear);
  }

  for (let i = 0; i < o.crest; i++) {
    const t = i / Math.max(1, o.crest);
    const fin = kit.spike(sx * 0.16, sy * (0.7 - t * 0.35), 0.3, "plate", p.plate);
    place(fin, 0, sy * 1.35, sz * (0.2 + t * 0.55), 0.7, Math.PI / 2, 0);
    head.add(fin);
  }
}

/** 尾。節ごとにアニメーションできるよう連鎖として登録する */
export function addTail(
  kit: CreatureKit,
  rig: CreatureRig,
  origin: [number, number, number],
  count: number,
  length: number,
  radius: number,
  baseAngle: number,
  curve: number,
  blade: boolean,
): void {
  const p = kit.palette;
  const specs = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    specs.push({
      len: length * (1 - t * 0.35),
      r0: radius * (1 - t * 0.85),
      r1: radius * (1 - (t + 1 / count) * 0.85),
      rot: [i === 0 ? baseAngle : curve, 0, 0] as [number, number, number],
    });
  }
  const chain = kit.chain(specs, "hide", p.main);
  chain.root.position.set(origin[0], origin[1], origin[2]);
  markAnimated(...chain.joints);
  for (let i = 0; i < chain.joints.length; i++) {
    rig.tail.push({ group: chain.joints[i], rest: chain.rests[i] });
    // 背びれ状のトゲを尾の上面に立てる
    if (i > 0 && i < chain.joints.length - 1) {
      const fin = kit.spike(radius * 0.28, length * 0.9 * (1 - i / count), 0.3, "plate", p.plate);
      place(fin, 0, -length * 0.3, 0, Math.PI, Math.PI / 2, 0);
      chain.joints[i].add(fin);
    }
  }
  if (blade) {
    const tip = kit.spike(radius * 0.5, length * 1.6, 0.35, "plate", p.plate);
    place(tip, 0, 0, 0, Math.PI, 0, 0);
    chain.tip.add(tip);
  }
  rig.pelvis.add(chain.root);
}

/**
 * 羽毛の翼。
 *
 * 針状の羽根を1点から放射させると、扇ではなく「ウニ」に見える。
 * 実際にそうなっていたので、次の3つで作り直した。
 *   1. 前縁に腕の骨を通し、羽根の付け根をその骨に沿って散らす
 *   2. 羽根は円錐ではなく、面積を持った木の葉形の板にする
 *   3. 角度は「外向き〜真下」の範囲に収め、上には向けない
 * さらに雨覆い(短い羽根)を手前に重ね、層の段差で厚みを出す。
 */
export function addFeatherWing(kit: CreatureKit, wing: THREE.Object3D, side: number, count: number, length: number): void {
  const p = kit.palette;
  const s = side;
  const L = length;

  // 前縁の骨。肩→肘→手首→翼端と、斜め上へ弓なりに反りながら外へ伸びる。
  // 水平に張り出すと横幅を食うだけなので、持ち上げて縦の情報量に変える
  const bone: THREE.Vector3[] = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(s * 0.30 * L, 0.26 * L, 0.04 * L),
    new THREE.Vector3(s * 0.60 * L, 0.42 * L, 0.0),
    new THREE.Vector3(s * 0.82 * L, 0.48 * L, -0.05 * L),
  ];
  const spine = new THREE.CatmullRomCurve3(bone);
  wing.add(kit.taperedTube(bone, 0.05 * L, 0.014 * L, "fur", p.fur, 5, 8));
  // 肩の羽毛のかたまり
  wing.add(place(kit.ball(0.11 * L, 0.13 * L, 0.1 * L, "fur", p.fur, 10), s * 0.04 * L, 0.02 * L, 0.01 * L));

  const point = new THREE.Vector3();
  const rows: { u0: number; u1: number; len: number; color: THREE.Color; z: number; scale: number; width: number }[] = [
    // 風切羽: 前縁の外側半分から、外向き〜下向きに長く伸びる。
    // **幅が足りないと羽根同士に隙間が空き、翼ではなく櫛の歯に見える**。
    // 実際にそうなっていたので、1枚の幅を広げて必ず隣と重ねる
    { u0: 0.2, u1: 0.99, len: 1, color: p.fur, z: -0.02, scale: 1, width: 0.34 },
    // 雨覆い: 手前に重ねる短い羽根。段差の影で層に見せる
    { u0: 0.08, u1: 0.82, len: 0.46, color: p.main, z: -0.06, scale: 0.9, width: 0.44 },
    // 小雨覆い: さらに手前の短い層。前縁の骨を隠して、肩から羽根が生えて見せる
    { u0: 0.02, u1: 0.6, len: 0.24, color: p.fur, z: -0.1, scale: 0.6, width: 0.56 },
  ];

  for (const row of rows) {
    const n = Math.max(3, Math.round(count * row.scale));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      spine.getPointAt(row.u0 + (row.u1 - row.u0) * t, point);
      const len = L * (0.30 + t * 0.26) * row.len;
      const feather = kit.feather(len, len * row.width, "fur", row.color, 0.1);
      // 内側は真下へ、外側ほど外向きへ倒す(扇の要は肩ではなく前縁全体)
      const angle = 2.6 - t * 0.9;
      place(
        feather,
        point.x,
        point.y,
        point.z + row.z * L,
        0.12 - t * 0.2,
        -s * t * 0.28,
        -s * angle,
      );
      wing.add(feather);
    }
  }
}

/** 指の骨と膜で作るコウモリ翼(ボス用) */
export function addBatWing(kit: CreatureKit, wing: THREE.Object3D, side: number, span: number): void {
  const p = kit.palette;
  const s = side;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x * s * span, y * span, z * span);

  const shoulder = v(0, 0, 0);
  const elbow = v(0.5, 0.34, 0.1);
  const wrist = v(1.02, 0.5, 0.02);
  const fingers = [v(1.72, 0.42, 0.12), v(1.5, -0.16, 0.2), v(1.05, -0.6, 0.22), v(0.5, -0.72, 0.18)];

  // 腕の骨。付け根に筋肉の膨らみ、関節に球を入れて棒の直結を隠す
  wing.add(kit.link(shoulder, elbow, 0.075 * span, 0.06 * span, "plate", p.plate, 6));
  wing.add(kit.link(elbow, wrist, 0.06 * span, 0.045 * span, "plate", p.plate, 6));
  wing.add(place(kit.ball(0.1 * span, 0.09 * span, 0.09 * span, "hide", p.main, 8), shoulder.x, shoulder.y, shoulder.z));
  wing.add(place(kit.ball(0.065 * span, 0.06 * span, 0.06 * span, "hide", p.dark, 7), elbow.x, elbow.y, elbow.z));
  wing.add(place(kit.ball(0.055 * span, 0.05 * span, 0.05 * span, "plate", p.plate, 7), wrist.x, wrist.y, wrist.z));
  for (const finger of fingers) {
    wing.add(kit.link(wrist, finger, 0.04 * span, 0.012 * span, "plate", p.plate, 5));
    // 指の関節。膜の張った骨組みが節を持って見える
    const mid = wrist.clone().lerp(finger, 0.42);
    wing.add(place(kit.ball(0.028 * span, 0.028 * span, 0.022 * span, "plate", p.plate, 6), mid.x, mid.y, mid.z));
  }
  // 指の先の鉤爪
  const hook = kit.spike(0.04 * span, 0.2 * span, 0.6, "plate", p.plate);
  place(hook, fingers[0].x, fingers[0].y, fingers[0].z, 0, 0, -s * 1.2);
  wing.add(hook);

  const points = [shoulder, elbow, wrist, ...fingers, shoulder];
  const membrane = kit.membrane(
    (shape) => {
      shape.moveTo(points[0].x, points[0].y);
      shape.lineTo(points[1].x, points[1].y);
      shape.lineTo(points[2].x, points[2].y);
      for (let i = 3; i < points.length; i++) {
        const previous = points[i - 1];
        const current = points[i];
        // 指の間を内側へえぐって、コウモリ翼らしい scalloped な縁にする
        const mx = (previous.x + current.x) * 0.5 * 0.82;
        const my = (previous.y + current.y) * 0.5 * 0.82;
        shape.quadraticCurveTo(mx, my, current.x, current.y);
      }
    },
    "membrane",
    p.membrane,
    -0.08 / span,
  );
  wing.add(membrane);
}

/**
 * アタッカー: 四足の獣。
 *
 * 以前は「前傾した二足」に小さな腕を付けただけで、他の役割と骨格が同じだった。
 * ここでは背骨を水平に寝かせ、前脚も接地させた本物の四足に組み替えている。
 * 前脚は rig.arms ではなく rig.legs に登録し、攻撃は腕を振るのではなく
 * 体ごと跳びかかる型(pounce)にすることで、二足の役割と動きから別物にする。
 */
function buildAttacker(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  // 前後に長い骨格は正面からだと潰れる。斜に構えて全長を見せる。
  // ただし味方は敵の方(奥)を向くので、深く回すと尻しか見えなくなる
  rig.yawBias = 0.32;
  rig.pelvis.position.y = 1.0;

  // --- 腰 ---
  rig.pelvis.add(place(kit.ball(0.30, 0.28, 0.34, "hide", p.main), 0, 0, 0.04));
  rig.pelvis.add(place(kit.ball(0.22, 0.21, 0.20, "hide", p.main), 0, -0.02, 0.22));
  for (const side of [-1, 1]) {
    // 腿の付け根の筋肉。四足は後脚の張り出しが速さの印象を作る
    rig.pelvis.add(place(kit.ball(0.16, 0.19, 0.20, "hide", p.main), side * 0.24, -0.02, 0.10));
  }

  // --- 後脚(3節のデジティグレード) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.40, r0: 0.17, r1: 0.11, rot: [0.48, 0, 0] },
        { len: 0.38, r0: 0.11, r1: 0.075, rot: [-1.06, 0, 0] },
        { len: 0.26, r0: 0.075, r1: 0.06, rot: [0.72, 0, 0] },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.23, -0.02, 0.12);
    addJoint(kit, leg.joints[1], 0, 0.10, false);
    addJoint(kit, leg.joints[2], 0, 0.075, false);
    leg.tip.add(place(kit.ball(0.10, 0.055, 0.14, "hide", p.dark), 0, -0.02, -0.05));
    addClaws(kit, leg.tip, 3, 0.15, 0.032, 0.07);
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.9));
  }

  // --- 胴(水平な背骨。腰から前へ伸ばす) ---
  const torso = rig.torso;
  place(torso, 0, 0.06, -0.40, 0.05, 0, 0);
  torso.add(place(kit.ball(0.31, 0.30, 0.40, "hide", p.main), 0, 0.02, 0.10));
  torso.add(place(kit.ball(0.34, 0.33, 0.34, "hide", p.main), 0, 0.02, -0.14));
  // 腹。下側を暗い色にして、胴の丸みと接地側を分ける
  torso.add(place(kit.ball(0.27, 0.20, 0.42, "hide", p.dark), 0, -0.14, 0.02));
  addRibs(kit, torso, 4, -0.12, 0.14, 0.30, 0.016);
  for (const side of [-1, 1]) {
    torso.add(place(kit.ball(0.14, 0.17, 0.17, "hide", p.main), side * 0.26, 0.02, -0.18));
  }

  // 背骨の棘。真横・真後ろから見た時のシルエットを作る主役
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const height = 0.12 + Math.sin(t * Math.PI) * 0.20;
    const fin = kit.spike(0.045, height, 0.3, "plate", p.plate);
    place(fin, 0, 0.26 - t * 0.02, -0.24 + t * 0.62, 0.35 - t * 0.5, Math.PI / 2, 0);
    torso.add(fin);
  }

  // --- 前脚 ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.36, r0: 0.15, r1: 0.105, rot: [0.26, 0, side * 0.05] },
        { len: 0.34, r0: 0.10, r1: 0.075, rot: [-0.36, 0, 0] },
        { len: 0.16, r0: 0.075, r1: 0.065, rot: [0.22, 0, 0] },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.24, -0.02, -0.24);
    addJoint(kit, leg.joints[1], 0, 0.095, false);
    leg.tip.add(place(kit.ball(0.095, 0.05, 0.13, "hide", p.dark), 0, -0.02, -0.05));
    addClaws(kit, leg.tip, 3, 0.16, 0.032, 0.07);
    torso.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.5, true));
  }

  // --- 首と頭(低く前へ突き出す) ---
  // 首は立ち上げてから前へ送る。味方は背面から見えるので、
  // 頭が背中の稜線より上に出ていないと顔がまったく読めない
  place(rig.neck, 0, 0.22, -0.34, -0.18, 0, 0);
  rig.neck.add(
    kit.taperedTube(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0.18, z: -0.05 },
        { x: 0, y: 0.36, z: -0.02 },
      ],
      0.16,
      0.10,
      "hide",
      p.main,
      7,
      6,
    ),
  );
  // 首筋のたてがみ状の棘
  for (let i = 0; i < 3; i++) {
    const fin = kit.spike(0.04, 0.18 - i * 0.03, 0.3, "plate", p.plate);
    place(fin, 0, 0.06 + i * 0.10, 0.08, 0.9, Math.PI / 2, 0);
    rig.neck.add(fin);
  }
  place(rig.head, 0, 0.36, 0, 0.62, 0, 0);
  addBeastHead(kit, rig, { skull: [0.22, 0.21, 0.26], snout: 0.30, jaw: true, horns: "swept", crest: 2, eye: 0.062 });

  addTail(kit, rig, [0, 0.10, 0.28], 6, 0.20, 0.10, -1.55, -0.12, true);

  // 翼は背中の中ほど、前脚の付け根より少し後ろに生やす
  rig.wingAnchor.set(0.20, 0.34, -0.04);

  rig.anim = {
    idleSpeed: 1.3,
    breath: 1,
    bob: 0.026,
    headSway: 1.25,
    tailWave: 1.5,
    wingFlap: 0,
    sway: 0.85,
    lunge: 1.5,
    squash: 0,
    attack: "pounce",
    accent: "headShake",
  };
}

/** ディフェンダー: 岩の巨人。低い頭と巨大な肩・腕で「硬くて重い」を伝える */
function buildDefender(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.0;
  rig.pelvis.add(place(kit.rock(0.46, 0.28, 0.38, "hide", p.main, 0.22), 0, -0.02, 0));

  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.4, r0: 0.26, r1: 0.22, rot: [0.12, 0, side * 0.06], radial: 7 },
        { len: 0.42, r0: 0.22, r1: 0.24, rot: [-0.14, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.32, -0.06, 0);
    // 膝の当て金と、脛を覆う板。硬い役割ほど装甲の重なりで見せる
    addJoint(kit, leg.joints[1], 0, 0.2, true);
    leg.joints[1].add(place(kit.lens(0.2, 0.26, 0.14, "metal", p.metal), 0, -0.24, -0.16, 0.06, 0, 0));
    leg.tip.add(place(kit.rock(0.26, 0.13, 0.32, "hide", p.dark, 0.2), 0, -0.06, -0.06));
    leg.tip.add(place(kit.lens(0.22, 0.07, 0.2, "metal", p.metal), 0, -0.02, -0.16, -0.3, 0, 0));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.6));
  }

  const torso = rig.torso;
  place(torso, 0, 0.06, 0, -0.1, 0, 0);
  torso.add(place(kit.rock(0.58, 0.5, 0.46, "hide", p.main, 0.2), 0, 0.5, 0));
  torso.add(place(kit.rock(0.44, 0.26, 0.3, "hide", p.main, 0.25), 0, 0.88, 0.14));
  // 胸の装甲。重ねた板の段差が、岩の塊に「作られたもの」の情報を足す
  addPlating(kit, torso, 3, 0.30, 0.66, 0.34, -0.34);
  torso.add(place(kit.band(0.46, 0.035, Math.PI * 1.1, "metal", p.metal, 14), 0, 0.24, 0, Math.PI / 2, -Math.PI * 0.55, 0));
  // 胸の動力コア
  torso.add(place(kit.octa(0.15, 0.22, 0.15, "crystal", p.accent), 0, 0.52, -0.44));
  torso.add(place(kit.octa(0.07, 0.12, 0.07, "glow", p.glow), 0, 0.52, -0.46));
  // 背中に生えた岩の柱
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const shard = kit.octa(0.09, 0.3 - t * 0.1, 0.09, "crystal", p.accent);
    place(shard, (t - 0.5) * 0.62, 0.82 + Math.sin(t * Math.PI) * 0.12, 0.3, 0.5, 0, (t - 0.5) * 1.3);
    torso.add(shard);
  }

  for (const side of [-1, 1]) {
    // 肩の岩塊と、そこから突き出す棘
    torso.add(place(kit.rock(0.32, 0.3, 0.32, "plate", p.plate, 0.24), side * 0.64, 0.76, 0));
    for (let i = 0; i < 3; i++) {
      const spike = kit.spike(0.07, 0.26 - i * 0.04, 0.8, "plate", p.plate);
      place(spike, side * 0.68, 0.92, -0.16 + i * 0.18, -0.3 + i * 0.25, 0, -side * 0.7);
      torso.add(spike);
    }

    const arm = kit.chain(
      [
        { len: 0.48, r0: 0.23, r1: 0.19, rot: [0.14, 0, side * 0.14], radial: 7 },
        { len: 0.46, r0: 0.19, r1: 0.2, rot: [-0.2, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.64, 0.7, 0);
    addJoint(kit, arm.joints[1], 0, 0.19, true);
    // 前腕を覆う装甲板
    arm.joints[1].add(place(kit.lens(0.2, 0.24, 0.13, "metal", p.metal), 0, -0.24, -0.16, 0.1, 0, 0));
    arm.tip.add(place(kit.rock(0.26, 0.24, 0.26, "hide", p.main, 0.22), 0, -0.16, -0.02));
    for (let i = -1; i <= 1; i++) {
      const knuckle = kit.spike(0.06, 0.14, 0.9, "metal", p.metal);
      place(knuckle, i * 0.11, -0.16, -0.2, AIM_FORWARD, 0, 0);
      arm.tip.add(knuckle);
    }
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 0.8));
  }

  place(rig.neck, 0, 0.86, -0.08, -0.12, 0, 0);
  place(rig.head, 0, 0.06, 0, 0.22, 0, 0);
  rig.head.add(place(kit.rock(0.24, 0.21, 0.24, "hide", p.main, 0.2), 0, 0.12, 0));
  rig.head.add(place(kit.box(0.3, 0.06, 0.05, "glow", p.glow), 0, 0.12, -0.2));
  rig.head.add(place(kit.box(0.36, 0.12, 0.2, "plate", p.plate), 0, 0.24, -0.1, -0.2, 0, 0));
  for (const side of [-1, 1]) {
    const horn = kit.spike(0.07, 0.28, 0.85, "plate", p.plate);
    place(horn, side * 0.18, 0.22, 0.06, 0.3, 0, -side * 0.8);
    rig.head.add(horn);
  }

  rig.anim = {
    idleSpeed: 0.62,
    breath: 1.35,
    bob: 0.02,
    headSway: 0.45,
    tailWave: 0,
    wingFlap: 0,
    sway: 0.6,
    lunge: 0.8,
    squash: 0,
    attack: "slam",
    accent: "stomp",
  };
}

/** ヒーラー: 脚を持たず浮遊する衣の存在。翼と光輪で優美さを出す */
function buildHealer(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.floats = true;
  rig.pelvis.position.y = 1.05;

  // ローブ(下端は開いたまま=足が無いことを強調する)。
  // 一枚の円錐だと「緑の三角コーン」にしか見えないので、
  // 布の材質・縦の折り目・裾と腰の縁取りで、衣として読める情報を足す
  rig.pelvis.add(
    kit.lathe(
      [
        [0.22, 0.14],
        [0.27, -0.08],
        [0.31, -0.36],
        [0.40, -0.68],
        [0.50, -0.94],
        [0.54, -1.02],
      ],
      "cloth",
      p.cloth,
      22,
    ),
  );
  // 縦の折り目。布の表面をわずかに膨らませて、平らな面を割る
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    rig.pelvis.add(
      kit.taperedTube(
        [
          { x: cos * 0.23, y: 0.1, z: sin * 0.23 },
          { x: cos * 0.32, y: -0.42, z: sin * 0.32 },
          { x: cos * 0.53, y: -1.0, z: sin * 0.53 },
        ],
        0.026,
        0.05,
        "cloth",
        p.cloth,
        4,
        6,
      ),
    );
  }
  // 裾の飾り
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.35;
    const petal = kit.spike(0.075, 0.22, 0.35, "cloth", p.dark);
    place(petal, Math.cos(angle) * 0.5, -0.98, Math.sin(angle) * 0.5, 0, -angle, 0);
    petal.rotation.x = Math.PI - 0.25;
    rig.pelvis.add(petal);
  }
  // 裾と腰の縁取り。硬い materialを1本挟むと布の柔らかさが引き立つ
  rig.pelvis.add(place(kit.band(0.52, 0.024, Math.PI * 2, "plate", p.plate, 22), 0, -0.96, 0, Math.PI / 2, 0, 0));
  rig.pelvis.add(place(kit.band(0.26, 0.034, Math.PI * 2, "metal", p.metal, 18), 0, 0.04, 0, Math.PI / 2, 0, 0));
  rig.pelvis.add(place(kit.octa(0.05, 0.08, 0.04, "glow", p.glow), 0, 0.04, -0.27));

  const torso = rig.torso;
  place(torso, 0, 0.06, 0, -0.05, 0, 0);
  torso.add(place(kit.ball(0.2, 0.26, 0.16, "hide", p.main), 0, 0.2, 0));
  torso.add(place(kit.ball(0.22, 0.16, 0.18, "hide", p.dark), 0, 0.34, -0.05));
  // 肩を覆う衣(ケープ)と、その縁
  torso.add(
    place(
      kit.lathe(
        [
          [0.15, 0.52],
          [0.30, 0.38],
          [0.44, 0.14],
          [0.46, 0.06],
        ],
        "cloth",
        p.cloth,
        20,
      ),
      0,
      0,
      0,
    ),
  );
  torso.add(place(kit.band(0.45, 0.02, Math.PI * 2, "plate", p.plate, 20), 0, 0.08, 0, Math.PI / 2, 0, 0));
  // 襟。首の後ろを立てて、背面から見た時の情報にする
  torso.add(place(kit.lathe([[0.13, 0.44], [0.2, 0.62], [0.22, 0.7]], "cloth", p.dark, 16), 0, 0, 0.02));
  torso.add(place(kit.octa(0.07, 0.1, 0.05, "glow", p.glow), 0, 0.36, -0.16));

  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.28, r0: 0.07, r1: 0.055, rot: [0.2, 0, side * 0.75] },
        { len: 0.26, r0: 0.055, r1: 0.045, rot: [0.35, 0, -side * 0.35] },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.2, 0.38, -0.02);
    arm.tip.add(place(kit.ball(0.055, 0.05, 0.055, "hide", p.dark), 0, -0.03, 0));

    if (side < 0) {
      // 杖。役割が一目で分かるシルエットの要になる縦線を1本立てる
      const staff = new THREE.Group();
      // 手の向き(腕の回転の積)を打ち消して、杖が鉛直に立つようにする
      place(staff, 0, -0.04, -0.02, -0.55, 0, -side * 0.4);
      staff.add(place(kit.link({ x: 0, y: -0.45, z: 0 }, { x: 0, y: 0.72, z: 0 }, 0.022, 0.018, "plate", p.plate, 6), 0, 0, 0));
      staff.add(place(kit.band(0.1, 0.018, Math.PI * 2, "metal", p.metal, 14), 0, 0.7, 0, Math.PI / 2, 0, 0));
      staff.add(place(kit.octa(0.07, 0.13, 0.07, "crystal", p.accent), 0, 0.78, 0));
      staff.add(place(kit.octa(0.035, 0.07, 0.035, "glow", p.glow), 0, 0.78, 0));
      for (const dir of [-1, 1]) {
        staff.add(place(kit.octa(0.02, 0.05, 0.02, "crystal", p.accent), dir * 0.09, 0.66, 0, 0, 0, dir * 0.4));
      }
      arm.tip.add(staff);
    }

    // 長い袖。受動的に揺れる布として登録する
    const sleeve = new THREE.Group();
    markAnimated(sleeve);
    sleeve.add(
      kit.lathe(
        [
          [0.08, 0],
          [0.14, -0.2],
          [0.2, -0.46],
        ],
        "cloth",
        p.cloth,
        14,
      ),
    );
    sleeve.add(place(kit.band(0.19, 0.016, Math.PI * 2, "plate", p.plate, 16), 0, -0.44, 0, Math.PI / 2, 0, 0));
    arm.joints[1].add(sleeve);
    rig.cloth.push({ group: sleeve, rest: sleeve.rotation.clone(), phase: side, amount: 1 });
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.2));
  }

  place(rig.neck, 0, 0.5, -0.02, -0.02, 0, 0);
  place(rig.head, 0, 0.1, 0, 0.06, 0, 0);
  rig.head.add(place(kit.ball(0.15, 0.17, 0.15, "hide", p.dark), 0, 0.1, 0));
  // フード。後頭部を尖らせ、縁に硬い輪を回して開口部を作る
  rig.head.add(place(kit.ball(0.19, 0.2, 0.21, "cloth", p.cloth), 0, 0.14, 0.05));
  rig.head.add(place(kit.spike(0.11, 0.34, 0.6, "cloth", p.cloth), 0, 0.2, 0.14, 0.9, 0, 0));
  rig.head.add(place(kit.band(0.16, 0.02, Math.PI * 1.3, "plate", p.plate, 14), 0, 0.12, -0.13, 0.25, 0, Math.PI * 0.85));
  addEyes(kit, rig.head, 0.06, 0.1, -0.13, 0.028);
  // 頭飾り。味方は背面から見えるので、後ろ姿にも情報を置く
  for (let i = 0; i < 3; i++) {
    const crown = kit.octa(0.022, 0.09 - i * 0.015, 0.022, "crystal", p.accent);
    place(crown, (i - 1) * 0.09, 0.3, 0.06, -0.3, 0, (i - 1) * -0.5);
    rig.head.add(crown);
  }
  // 光輪。頭の上へ持ち上げ、どの角度からも輪として見えるようにする
  const halo = kit.ring(0.21, 0.022, "glow", p.glow, 28);
  place(halo, 0, 0.42, 0.02, Math.PI / 2 - 0.28, 0, 0);
  rig.head.add(halo);
  rig.spinners.push({ object: halo, axis: "z", speed: 0.6 });

  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    markAnimated(wing);
    place(wing, side * 0.18, 0.34, 0.12, 0.2, -side * 0.35, 0);
    addFeatherWing(kit, wing, side, 6, 0.95);
    rig.torso.add(wing);
    rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
  }

  rig.anim = {
    idleSpeed: 0.85,
    breath: 0.8,
    bob: 0.075,
    headSway: 0.8,
    tailWave: 0,
    wingFlap: 0.5,
    sway: 0.5,
    lunge: 0.55,
    squash: 0,
    attack: "cast",
    accent: "gaze",
  };
}

/** サポート: 幾何学的な結晶体。左右対称の菱形スタックと回転する環 */
function buildSupport(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.floats = true;
  rig.pelvis.position.y = 0.95;

  // 下へ細くなる結晶のスタック。逆さに吊り下がった尖塔で、足がないことを示す
  const stack: [number, number, number][] = [
    [0.22, 0.30, 0.22],
    [0.14, 0.24, 0.14],
    [0.08, 0.16, 0.08],
  ];
  stack.forEach((size, index) => {
    const shard = kit.octa(size[0], size[1], size[2], "crystal", p.main);
    place(shard, 0, -0.18 - index * 0.3, 0, 0, index * 0.5, 0);
    rig.pelvis.add(shard);
    // 節ごとの締めの輪。段が付いて「浮いている一本の柱」に見える
    rig.pelvis.add(
      place(kit.band(size[0] * 1.15, 0.018, Math.PI * 2, "metal", p.metal, 12), 0, -0.18 - index * 0.3, 0, Math.PI / 2, 0, 0),
    );
  });

  const torso = rig.torso;
  place(torso, 0, 0.2, 0);
  torso.add(place(kit.octa(0.34, 0.56, 0.34, "crystal", p.main), 0, 0.1, 0));
  torso.add(place(kit.octa(0.15, 0.3, 0.15, "glow", p.glow), 0, 0.1, 0));
  torso.add(place(kit.octa(0.2, 0.34, 0.2, "crystal", p.accent), 0, 0.1, -0.14, 0, 0.6, 0));
  // 本体を抱える金属の枠。結晶だけだと透けて構造が読めない
  for (const side of [-1, 1]) {
    torso.add(
      place(kit.taperedTube(
        [
          { x: side * 0.06, y: 0.44, z: 0 },
          { x: side * 0.30, y: 0.16, z: 0.02 },
          { x: side * 0.22, y: -0.16, z: 0 },
        ],
        0.028,
        0.018,
        "metal",
        p.metal,
        5,
        8,
      ), 0, 0, 0),
    );
  }

  // 浮遊する4本の腕。胴と繋がっていない結晶の節を並べ、
  // 「多腕の構造物」として、四肢を持つ他の役割と骨格から分ける
  const armSpecs = [
    { y: 0.34, x: 0.44, tilt: 0.30, len: 0.36 },
    { y: 0.00, x: 0.36, tilt: -0.45, len: 0.28 },
  ];
  for (const side of [-1, 1]) {
    armSpecs.forEach((spec, index) => {
      const arm = new THREE.Group();
      markAnimated(arm);
      place(arm, side * spec.x, spec.y, 0.02, 0, 0, -side * spec.tilt);
      // 肩(浮いた小片)→ 前腕 → 先端の光点、と離して並べる
      arm.add(place(kit.octa(0.09, 0.15, 0.07, "crystal", p.accent), 0, 0, 0));
      arm.add(place(kit.octa(0.06, spec.len, 0.05, "crystal", p.main), side * 0.1, -spec.len * 0.85, 0.02, 0, 0, -side * 0.3));
      arm.add(place(kit.octa(0.035, 0.07, 0.035, "glow", p.glow), side * 0.17, -spec.len * 1.55, 0.04));
      torso.add(arm);
      rig.arms.push({
        root: arm,
        rootRest: arm.rotation.clone(),
        lower: null,
        lowerRest: null,
        tip: arm,
        side,
        phase: side * (1 + index * 0.7),
      });
    });
  }

  // 水平の環と斜めの環
  const ring1 = kit.ring(0.66, 0.022, "glow", p.glow, 32);
  place(ring1, 0, 0.1, 0, Math.PI / 2, 0, 0);
  torso.add(ring1);
  rig.spinners.push({ object: ring1, axis: "z", speed: 0.5 });

  const ring2 = kit.ring(0.5, 0.018, "crystal", p.accent, 28);
  place(ring2, 0, 0.16, 0, 0.5, 0.4, 0);
  torso.add(ring2);
  rig.spinners.push({ object: ring2, axis: "y", speed: -0.8 });

  place(rig.neck, 0, 0.62, 0);
  place(rig.head, 0, 0.14, 0);
  rig.head.add(place(kit.octa(0.19, 0.2, 0.19, "crystal", p.plate), 0, 0, 0));
  // 頭を締める金属の輪と、単眼。顔の情報を1点に集めて視線を作る
  rig.head.add(place(kit.band(0.2, 0.022, Math.PI * 2, "metal", p.metal, 14), 0, 0, 0, 0.35, 0, 0));
  rig.head.add(place(kit.ball(0.07, 0.05, 0.03, "hide", p.deep, 8), 0, 0.0, -0.17));
  rig.head.add(place(kit.box(0.22, 0.035, 0.03, "glow", p.glow), 0, 0.0, -0.185));
  for (let i = 0; i < 3; i++) {
    const crown = kit.octa(0.045, 0.18, 0.045, "crystal", p.accent);
    place(crown, (i - 1) * 0.14, 0.24, 0.02, 0, 0, (i - 1) * -0.45);
    rig.head.add(crown);
  }

  // 周囲を漂う小結晶
  for (let i = 0; i < 5; i++) {
    const shard = kit.octa(0.06, 0.14, 0.06, "crystal", p.accent);
    rig.core.add(shard);
    rig.orbiters.push({
      object: shard,
      radius: 0.85 + Math.random() * 0.3,
      height: 0.7 + Math.random() * 1.1,
      speed: 0.5 + Math.random() * 0.35,
      phase: (i / 5) * Math.PI * 2,
      tilt: (Math.random() - 0.5) * 0.5,
      spin: 1.2,
    });
  }

  rig.anim = {
    idleSpeed: 0.7,
    breath: 0.4,
    bob: 0.06,
    headSway: 0.35,
    tailWave: 0,
    wingFlap: 0,
    sway: 0.3,
    lunge: 0.7,
    squash: 0,
    attack: "cast",
    accent: "shiver",
  };
}

/** デバッファー: 左右非対称に歪んだ、棘だらけの不吉な影 */
function buildDebuffer(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.05;
  rig.pelvis.add(place(kit.ball(0.22, 0.2, 0.26, "hide", p.dark), 0, 0, 0.06));

  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.42, r0: 0.11, r1: 0.08, rot: [0.45, 0, side * 0.12], radial: 6 },
        { len: 0.4, r0: 0.08, r1: 0.055, rot: [-1.0, 0, 0], radial: 6 },
        { len: 0.24, r0: 0.055, r1: 0.04, rot: [0.72, 0, 0], radial: 6 },
      ],
      "hide",
      p.dark,
    );
    leg.root.position.set(side * 0.19, -0.02, 0.06);
    addClaws(kit, leg.tip, 3, 0.15, 0.028, 0.06);
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.1));
  }

  const torso = rig.torso;
  place(torso, 0, 0.02, -0.02, -0.6, 0, 0.05);
  torso.add(place(kit.ball(0.24, 0.26, 0.24, "hide", p.main), 0, 0.16, 0));
  // 背中の瘤(最高点)
  torso.add(place(kit.ball(0.32, 0.3, 0.3, "hide", p.main), 0, 0.5, 0.08));
  torso.add(place(kit.ball(0.24, 0.2, 0.2, "hide", p.dark), 0, 0.34, -0.16));
  // 不規則に突き出す棘
  const spikes = 11;
  for (let i = 0; i < spikes; i++) {
    const t = i / (spikes - 1);
    const angle = -1.1 + t * 2.2;
    const length = 0.26 + Math.abs(Math.sin(i * 2.7)) * 0.34;
    const spike = kit.spike(0.045, length, 0.55, "plate", p.plate);
    place(
      spike,
      Math.sin(angle) * 0.24,
      0.34 + Math.cos(i * 1.9) * 0.2,
      0.16 + Math.abs(Math.cos(angle)) * 0.1,
      0.5 + Math.sin(i * 3.1) * 0.4,
      0,
      -angle,
    );
    torso.add(spike);
  }
  // ぼろ布
  for (const side of [-1, 1]) {
    const rag = new THREE.Group();
    markAnimated(rag);
    place(rag, side * 0.24, 0.42, 0.12, 0.25, 0, side * 0.2);
    for (let i = 0; i < 3; i++) {
      const strip = kit.spike(0.08 - i * 0.015, 0.5 + i * 0.12, 0.25, "membrane", p.membrane);
      place(strip, side * i * 0.05, 0, i * 0.04, 0, 0, Math.PI + side * 0.2 * i);
      rag.add(strip);
    }
    rig.torso.add(rag);
    rig.cloth.push({ group: rag, rest: rag.rotation.clone(), phase: side * 1.3, amount: 0.8 });
  }

  place(rig.neck, 0, 0.6, -0.18, -0.95, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.26, z: 0 }, 0.1, 0.08, "hide", p.dark));
  place(rig.head, 0, 0.26, 0, 1.42, 0, 0);
  addBeastHead(kit, rig, {
    skull: [0.17, 0.16, 0.24],
    snout: 0.20,
    jaw: true,
    horns: "crown",
    crest: 0,
    eye: 0.048,
    mood: "cold",
    color: p.dark,
  });
  // 中央の大きな一つ目
  rig.head.add(place(kit.ball(0.07, 0.06, 0.05, "glow", p.glow, 10), 0, 0.16, -0.19));

  // 腕は大小2対の計4本。左右でも長さを変え、人型の左右対称から崩す
  for (const side of [-1, 1]) {
    const long = side > 0;
    const arm = kit.chain(
      [
        { len: long ? 0.42 : 0.26, r0: 0.085, r1: 0.065, rot: [long ? 0.85 : 0.4, 0, side * 0.5], radial: 6 },
        { len: long ? 0.46 : 0.24, r0: 0.065, r1: 0.045, rot: [long ? -0.5 : -0.9, 0, 0], radial: 6 },
      ],
      "hide",
      p.dark,
    );
    arm.root.position.set(side * 0.25, 0.44, -0.04);
    addJoint(kit, arm.joints[1], 0, 0.07, false);
    // 骨ばった肘の棘
    const elbowSpike = kit.spike(0.035, 0.16, 0.6, "plate", p.plate);
    place(elbowSpike, 0, 0, 0.05, 2.5, 0, 0);
    arm.joints[1].add(elbowSpike);
    addClaws(kit, arm.tip, 3, long ? 0.3 : 0.14, 0.03, long ? 0.075 : 0.05);
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.7));

    // 胸の前で畳んだ小さな第2の腕。多腕であることを近くで見た時に効かせる
    const small = kit.chain(
      [
        { len: 0.20, r0: 0.052, r1: 0.04, rot: [1.15, 0, side * 0.9], radial: 5 },
        { len: 0.19, r0: 0.04, r1: 0.028, rot: [-1.6, 0, 0], radial: 5 },
      ],
      "hide",
      p.dark,
    );
    small.root.position.set(side * 0.17, 0.24, -0.12);
    addClaws(kit, small.tip, 3, 0.1, 0.018, 0.038);
    rig.torso.add(small.root);
    rig.arms.push(limbFrom(small, side, side * 2.4));
  }

  addTail(kit, rig, [0, 0.04, 0.2], 6, 0.18, 0.07, -1.35, -0.22, true);

  rig.anim = {
    idleSpeed: 1.05,
    breath: 0.9,
    bob: 0.045,
    headSway: 1.5,
    tailWave: 1.6,
    wingFlap: 0,
    sway: 1.3,
    lunge: 1.1,
    squash: 0,
    attack: "cast",
    accent: "gaze",
  };
}

/** バランス型: 剣とマントを持つ人型の戦士。読みやすい直立シルエット */
function buildBalanced(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.1;
  rig.pelvis.add(place(kit.lens(0.2, 0.14, 0.17, "metal", p.metal), 0, -0.02, 0));
  rig.pelvis.add(place(kit.band(0.2, 0.032, Math.PI * 2, "metal", p.metal, 16), 0, 0.04, 0, Math.PI / 2, 0, 0));
  rig.pelvis.add(place(kit.octa(0.05, 0.07, 0.035, "glow", p.glow), 0, 0.04, -0.19));
  // 腰から下がる草摺(くさずり)。歩く時に脚と別に揺れる面を作る
  for (let i = 0; i < 5; i++) {
    const angle = -1.0 + (i / 4) * 2.0;
    const tasset = kit.lens(0.075, 0.15, 0.05, "metal", p.metal, 8);
    place(tasset, Math.sin(angle) * 0.21, -0.14, -Math.cos(angle) * 0.2, 0.12, -angle, 0);
    rig.pelvis.add(tasset);
  }

  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.46, r0: 0.14, r1: 0.11, rot: [0.1, 0, side * 0.05] },
        { len: 0.44, r0: 0.11, r1: 0.09, rot: [-0.16, 0, 0] },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.17, -0.06, 0);
    // 太腿・膝・脛の3枚に分けて装甲を重ねる
    leg.joints[0].add(place(kit.lens(0.13, 0.18, 0.12, "metal", p.metal), 0, -0.22, -0.04, 0.05, 0, 0));
    addJoint(kit, leg.joints[1], 0, 0.11, true);
    leg.joints[1].add(place(kit.lens(0.12, 0.2, 0.11, "metal", p.metal), 0, -0.2, -0.03));
    leg.tip.add(place(kit.box(0.15, 0.08, 0.3, "metal", p.metal), 0, -0.04, -0.06));
    leg.tip.add(place(kit.lens(0.08, 0.06, 0.06, "metal", p.metal), 0, 0.0, -0.18, 0.4, 0, 0));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.7));
  }

  const torso = rig.torso;
  place(torso, 0, 0.08, 0, -0.06, 0, 0);
  torso.add(place(kit.ball(0.3, 0.34, 0.22, "hide", p.main), 0, 0.28, 0));
  // 胸甲を3枚重ね。板の縁が影を作り、平らな胴に厚みが出る
  addPlating(kit, torso, 3, 0.2, 0.46, 0.29, -0.16);
  torso.add(place(kit.lens(0.31, 0.2, 0.14, "metal", p.metal), 0, 0.5, -0.1, -0.1, 0, 0));
  torso.add(place(kit.octa(0.07, 0.1, 0.05, "glow", p.glow), 0, 0.42, -0.22));
  // 喉当てと鎖骨のライン
  torso.add(place(kit.band(0.19, 0.028, Math.PI * 1.2, "metal", p.metal, 14), 0, 0.6, -0.02, Math.PI / 2, -Math.PI * 0.6, 0));
  torso.add(place(kit.box(0.5, 0.1, 0.22, "metal", p.metal), 0, 0.56, 0));

  for (const side of [-1, 1]) {
    // 肩当ては薄い板を3枚重ねる。1個の岩より「装備」に見える
    for (let i = 0; i < 3; i++) {
      const w = 0.2 - i * 0.035;
      const pauldron = kit.lens(w, w * 0.62, w * 0.9, "metal", p.metal, 10);
      place(pauldron, side * (0.38 + i * 0.02), 0.6 - i * 0.09, 0.0, 0, 0, -side * (0.2 + i * 0.18));
      torso.add(pauldron);
    }
    const pauldronSpike = kit.spike(0.05, 0.24, 0.7, "plate", p.plate);
    place(pauldronSpike, side * 0.44, 0.64, 0.02, 0.2, 0, -side * 0.9);
    torso.add(pauldronSpike);

    const arm = kit.chain(
      [
        { len: 0.36, r0: 0.1, r1: 0.08, rot: [0.12, 0, side * 0.2] },
        { len: 0.34, r0: 0.08, r1: 0.07, rot: [-0.45, 0, 0] },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.38, 0.5, 0);
    addJoint(kit, arm.joints[1], 0, 0.085, true);
    arm.joints[1].add(place(kit.lens(0.09, 0.16, 0.09, "metal", p.metal), 0, -0.18, -0.02));
    arm.tip.add(place(kit.box(0.1, 0.1, 0.12, "metal", p.metal), 0, -0.04, -0.01));
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 0.9));

    if (side > 0) {
      // 右手の剣。役割が一目で分かるシルエットの要。
      // 刃を金属、柄を布と骨に分けて、1本の中でも材質を描き分ける
      const sword = new THREE.Group();
      place(sword, 0, -0.05, -0.02, -0.5, 0, 0);
      sword.add(place(kit.box(0.26, 0.05, 0.07, "metal", p.metal), 0, 0.04, 0));
      sword.add(place(kit.lens(0.05, 0.03, 0.05, "metal", p.metal), 0, -0.16, 0));
      sword.add(place(kit.box(0.045, 0.16, 0.045, "cloth", p.dark), 0, -0.06, 0));
      sword.add(place(kit.spike(0.075, 0.94, 0.26, "metal", p.metal), 0, 0.06, 0, 0, Math.PI / 2, 0));
      // 刃の中央の樋。細い光の筋が入って板の平面が割れる
      sword.add(place(kit.box(0.018, 0.62, 0.02, "glow", p.glow), 0, 0.4, 0));
      sword.add(place(kit.octa(0.04, 0.05, 0.03, "glow", p.glow), 0, 0.06, 0));
      arm.tip.add(sword);
    }
  }

  // マント
  const cape = new THREE.Group();
  markAnimated(cape);
  place(cape, 0, 0.58, 0.14, 0.12, 0, 0);
  cape.add(
    kit.membrane(
      (shape) => {
        shape.moveTo(-0.3, 0);
        shape.lineTo(0.3, 0);
        shape.lineTo(0.42, -1.05);
        shape.quadraticCurveTo(0.0, -0.92, -0.42, -1.05);
      },
      "membrane",
      p.membrane,
      0.5,
    ),
  );
  rig.torso.add(cape);
  rig.cloth.push({ group: cape, rest: cape.rotation.clone(), phase: 0, amount: 1 });

  place(rig.neck, 0, 0.66, -0.02, -0.04, 0, 0);
  place(rig.head, 0, 0.12, 0, 0.1, 0, 0);
  rig.head.add(place(kit.ball(0.15, 0.16, 0.15, "hide", p.dark), 0, 0.08, 0));
  rig.head.add(place(kit.ball(0.17, 0.15, 0.17, "plate", p.plate), 0, 0.14, 0.02));
  rig.head.add(place(kit.box(0.22, 0.14, 0.1, "plate", p.plate), 0, 0.04, -0.1, 0.1, 0, 0));
  rig.head.add(place(kit.box(0.17, 0.035, 0.04, "glow", p.glow), 0, 0.09, -0.16));
  for (let i = 0; i < 3; i++) {
    const crest = kit.spike(0.05, 0.26 - i * 0.06, 0.28, "plate", p.plate);
    place(crest, 0, 0.24, 0.02 + i * 0.1, 0.35 + i * 0.2, Math.PI / 2, 0);
    rig.head.add(crest);
  }
  for (const side of [-1, 1]) {
    const horn = kit.spike(0.04, 0.2, 0.7, "plate", p.plate);
    place(horn, side * 0.15, 0.16, 0.02, 0.2, 0, -side * 1.0);
    rig.head.add(horn);
  }

  rig.anim = {
    idleSpeed: 1,
    breath: 1,
    bob: 0.03,
    headSway: 0.9,
    tailWave: 0,
    wingFlap: 0,
    sway: 1,
    lunge: 1.2,
    squash: 0,
    attack: "lunge",
    accent: "headShake",
  };
}

/** ボス: 角の王冠とコウモリ翼を持つ巨躯。他より一回り大きく威圧する */
function buildBoss(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.35;
  rig.pelvis.add(place(kit.ball(0.46, 0.34, 0.42, "hide", p.main), 0, -0.04, 0.04));
  rig.pelvis.add(place(kit.box(0.62, 0.16, 0.4, "plate", p.plate), 0, 0.02, -0.04));

  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.5, r0: 0.24, r1: 0.18, rot: [0.4, 0, side * 0.1] },
        { len: 0.48, r0: 0.17, r1: 0.13, rot: [-0.85, 0, 0] },
        { len: 0.3, r0: 0.13, r1: 0.11, rot: [0.62, 0, 0] },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.34, -0.06, 0.04);
    // 蹄
    leg.tip.add(place(kit.ball(0.16, 0.12, 0.22, "plate", p.plate), 0, -0.06, -0.06));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.8));
  }

  const torso = rig.torso;
  place(torso, 0, 0.06, -0.02, -0.16, 0, 0);
  torso.add(place(kit.ball(0.46, 0.38, 0.42, "hide", p.main), 0, 0.2, 0));
  torso.add(place(kit.ball(0.6, 0.5, 0.46, "hide", p.main), 0, 0.66, -0.02));
  torso.add(place(kit.ball(0.46, 0.3, 0.26, "plate", p.plate), 0, 0.72, -0.3));
  torso.add(place(kit.octa(0.14, 0.2, 0.12, "crystal", p.accent), 0, 0.68, -0.46));
  torso.add(place(kit.octa(0.07, 0.11, 0.06, "glow", p.glow), 0, 0.68, -0.48));
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const fin = kit.spike(0.07, 0.2 + Math.sin(t * Math.PI) * 0.24, 0.3, "plate", p.plate);
    place(fin, 0, 0.16 + i * 0.18, 0.32 - t * 0.02, 0.5, Math.PI / 2, 0);
    torso.add(fin);
  }

  for (const side of [-1, 1]) {
    torso.add(place(kit.rock(0.32, 0.28, 0.3, "plate", p.plate, 0.16), side * 0.68, 0.86, 0));
    for (let i = 0; i < 3; i++) {
      const spike = kit.spike(0.075, 0.34 - i * 0.06, 0.8, "plate", p.plate);
      place(spike, side * 0.72, 1.0, -0.18 + i * 0.2, -0.4 + i * 0.3, 0, -side * 0.6);
      torso.add(spike);
    }

    const arm = kit.chain(
      [
        { len: 0.5, r0: 0.2, r1: 0.16, rot: [0.35, 0, side * 0.3] },
        { len: 0.5, r0: 0.16, r1: 0.12, rot: [-0.7, 0, 0] },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.68, 0.8, 0);
    arm.tip.add(place(kit.ball(0.16, 0.14, 0.16, "hide", p.main), 0, -0.08, -0.02));
    addClaws(kit, arm.tip, 3, 0.3, 0.05, 0.12);
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.1));

    const wing = new THREE.Group();
    markAnimated(wing);
    place(wing, side * 0.42, 0.9, 0.26, 0.25, -side * 0.5, side * 0.15);
    addBatWing(kit, wing, side, 1.15);
    rig.torso.add(wing);
    rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
  }

  place(rig.neck, 0, 1.0, -0.14, -0.35, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.24, z: 0 }, 0.22, 0.17, "hide", p.main));
  place(rig.head, 0, 0.24, 0, 0.5, 0, 0);
  addBeastHead(kit, rig, { skull: [0.30, 0.28, 0.34], snout: 0.32, jaw: true, horns: "crown", crest: 3, eye: 0.078, mood: "cold", slit: 0.5 });
  // 王冠のように後光を背負わせる
  const halo = kit.ring(0.52, 0.03, "crystal", p.accent, 26);
  place(halo, 0, 0.4, 0.34, -0.35, 0, 0);
  rig.head.add(halo);
  rig.spinners.push({ object: halo, axis: "z", speed: -0.35 });

  addTail(kit, rig, [0, 0.06, 0.34], 7, 0.26, 0.16, -1.5, -0.05, true);

  rig.anim = {
    idleSpeed: 0.65,
    breath: 1.4,
    bob: 0.035,
    headSway: 0.7,
    tailWave: 1.1,
    wingFlap: 0.28,
    sway: 0.7,
    lunge: 1.0,
    squash: 0,
    attack: "slam",
    accent: "roar",
  };
}

/** 素材: 小さくコミカルな二頭身。頭と目が大きく、脅威に見えない */
function buildCritter(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 0.46;
  rig.pelvis.add(place(kit.ball(0.34, 0.3, 0.32, "hide", p.main), 0, 0, 0));
  rig.pelvis.add(place(kit.ball(0.24, 0.2, 0.16, "hide", p.dark), 0, -0.06, -0.22));

  for (const side of [-1, 1]) {
    const leg = kit.chain([{ len: 0.28, r0: 0.1, r1: 0.09, rot: [0.06, 0, side * 0.16], radial: 7 }], "hide", p.main);
    leg.root.position.set(side * 0.17, -0.16, 0);
    leg.tip.add(place(kit.ball(0.11, 0.06, 0.15, "hide", p.dark), 0, -0.02, -0.05));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.5));
  }

  const torso = rig.torso;
  place(torso, 0, 0.1, 0);
  for (const side of [-1, 1]) {
    const arm = kit.chain([{ len: 0.22, r0: 0.075, r1: 0.06, rot: [0.2, 0, side * 0.55], radial: 7 }], "hide", p.main);
    arm.root.position.set(side * 0.28, 0.06, -0.02);
    arm.tip.add(place(kit.ball(0.075, 0.07, 0.075, "hide", p.dark), 0, -0.02, 0));
    torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 2.1));
  }

  place(rig.neck, 0, 0.14, 0);
  place(rig.head, 0, 0.06, 0);
  const head = rig.head;
  head.add(place(kit.ball(0.36, 0.33, 0.34, "hide", p.main), 0, 0.28, 0));
  // 大きな目とハイライト
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(0.11, 0.13, 0.06, "hide", p.dark), side * 0.14, 0.3, -0.3));
    head.add(place(kit.ball(0.075, 0.09, 0.04, "glow", p.glow, 10), side * 0.14, 0.3, -0.32));
  }
  head.add(place(kit.ball(0.06, 0.04, 0.04, "hide", p.dark), 0, 0.18, -0.33));
  // 触角
  const antenna = kit.link({ x: 0, y: 0.55, z: 0.04 }, { x: 0.06, y: 0.86, z: 0.14 }, 0.025, 0.012, "hide", p.dark, 6);
  head.add(antenna);
  head.add(place(kit.ball(0.06, 0.06, 0.06, "glow", p.glow, 10), 0.07, 0.88, 0.15));
  for (const side of [-1, 1]) {
    const ear = kit.spike(0.09, 0.26, 0.5, "hide", p.main);
    place(ear, side * 0.24, 0.46, 0.06, 0.2, 0, -side * 0.7);
    head.add(ear);
  }

  addTail(kit, rig, [0, 0.04, 0.24], 4, 0.13, 0.05, -1.1, -0.35, false);

  rig.anim = {
    idleSpeed: 1.8,
    breath: 1.2,
    bob: 0.07,
    headSway: 1.6,
    tailWave: 1.8,
    wingFlap: 0,
    sway: 1.5,
    lunge: 1.3,
    squash: 0,
    attack: "dash",
    accent: "shiver",
  };
}

/**
 * 1体分の骨格を組む手順。
 * 役割(role)から引く既定の骨格と、種別(templateId)専用の骨格の
 * どちらもこの形で表され、MonsterAvatarからは区別なく扱える。
 */
export interface CreatureBuilder {
  build: (kit: CreatureKit, rig: CreatureRig) => void;
  /** 正規化後の体高 */
  height: number;
  /** 地面から浮かせる高さ */
  float: number;
}

const BUILDERS: Record<string, CreatureBuilder> = {
  アタッカー: { build: buildAttacker, height: 2.2, float: 0 },
  ディフェンダー: { build: buildDefender, height: 2.45, float: 0 },
  ヒーラー: { build: buildHealer, height: 2.25, float: 0.32 },
  サポート: { build: buildSupport, height: 2.05, float: 0.42 },
  デバッファー: { build: buildDebuffer, height: 2.25, float: 0 },
  バランス型: { build: buildBalanced, height: 2.35, float: 0 },
  ボス: { build: buildBoss, height: 2.95, float: 0 },
  素材: { build: buildCritter, height: 1.35, float: 0.05 },
};

/** 役割から既定の骨格を引く。種別専用の骨格は creature/templates.ts 側で上書きされる */
export function builderFor(role: string): CreatureBuilder {
  return BUILDERS[role] ?? BUILDERS["バランス型"];
}
