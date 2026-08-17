import * as THREE from "three";
import { CreatureKit } from "./kit.js";
import { AIM_DOWN, AIM_FORWARD, CreatureRig, markAnimated, place } from "./rig.js";
import {
  CreatureBuilder,
  addBatWing,
  addBeastHead,
  addClaws,
  addEyes,
  addFaceEyes,
  addFeatherWing,
  addJoint,
  addPlating,
  addTail,
  limbFrom,
} from "./roles.js";

/**
 * モンスター種別ごとの造形。
 *
 * 役割(role)だけでシルエットを決めると、同じ役割の別モンスターが
 * 色違いにしか見えなくなる。かといって、役割の骨格が種別に対して
 * そもそも不適切なこともある(「アタッカーだからスライムが四足獣になる」)。
 *
 * そこで種別ごとに、次の2つのどちらかを選べるようにしている。
 *
 *   1. 専用骨格(TEMPLATE_BUILDERS)
 *      役割の骨格を使わず、最初から組み直す。骨格そのものが違うもの
 *      (スライム・人型の魔王・岩の巨人・豚)はこちら。
 *   2. 追加造形(TEMPLATE_TRAITS)
 *      役割の骨格はそのまま使い、翼や羽根飾りだけを足す。
 *      四足獣で正しいドラゴン・グリフォンなどはこちら。
 *
 * 座標系の約束は roles.ts と同じ。-Zが正面、+Xが右、+Yが上。
 * 実寸は finalizeRig() が体高から正規化するので、ここでは比率だけを設計する。
 */

// ---------------------------------------------------------------------------
// 共通の部品
// ---------------------------------------------------------------------------

/**
 * 大きく丸い目。素材モンスターや妖精のように「可愛さ」で見せる種別に使う。
 *
 * 以前は「暗い窪み+発光する球+ハイライト」の3層だった。これは
 * **目の全面が発光する**ため、実際には白く飛んだ楕円が2つ並ぶだけで、
 * 瞳孔も視線も生まれず、どの種別も同じ宇宙人の顔になっていた。
 *
 * いまは共通の目つき生成(addFaceEyes の round)へ委ねる。
 * 明るい眼球・大きな虹彩・大きな瞳孔・2点のハイライト・まぶたの縁で、
 * 発光面積を増やさずに「丸くて濡れた目」を作る。
 */
function addRoundEyes(
  kit: CreatureKit,
  head: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  splay = 0.26,
  brow = true,
): void {
  addFaceEyes(kit, head, {
    x,
    y,
    z,
    size: radius * 1.15,
    mood: "round",
    splay,
    brow,
    skin: kit.palette.dark,
  });
}

/** 毛の房。同じ向きの棘を少しずつずらして重ね、毛束の厚みを出す */
function addFurTuft(
  kit: CreatureKit,
  parent: THREE.Object3D,
  count: number,
  radius: number,
  length: number,
  origin: [number, number, number],
  spread: number,
  aim: [number, number, number],
): void {
  const p = kit.palette;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const tuft = kit.spike(radius * (1 - Math.abs(t) * 0.4), length * (1 - Math.abs(t) * 0.35), 0.55, "fur", p.fur);
    place(
      tuft,
      origin[0] + t * spread,
      origin[1],
      origin[2] + Math.abs(t) * spread * 0.3,
      aim[0],
      aim[1],
      aim[2] + t * 0.8,
    );
    parent.add(tuft);
  }
}

/** ふさふさした尾。節ごとに毛の房を巻き付け、爬虫類の尾と描き分ける */
function addFurTail(
  kit: CreatureKit,
  rig: CreatureRig,
  origin: [number, number, number],
  count: number,
  length: number,
  radius: number,
  baseAngle: number,
  curve: number,
): void {
  const p = kit.palette;
  const specs = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    specs.push({
      len: length * (1 - t * 0.2),
      r0: radius * (1 - t * 0.5),
      r1: radius * (1 - (t + 1 / count) * 0.5),
      rot: [i === 0 ? baseAngle : curve, 0, 0] as [number, number, number],
      radial: 6,
    });
  }
  const chain = kit.chain(specs, "fur", p.fur);
  chain.root.position.set(origin[0], origin[1], origin[2]);
  markAnimated(...chain.joints);
  for (let i = 0; i < chain.joints.length; i++) {
    rig.tail.push({ group: chain.joints[i], rest: chain.rests[i] });
    // 節ごとに毛を放射させる。円柱の輪郭が消えて「房」に見える
    const bulk = radius * (2.1 - i * 0.16);
    for (let k = 0; k < 5; k++) {
      const angle = (k / 5) * Math.PI * 2 + i * 0.7;
      const hair = kit.spike(radius * 0.5, bulk, 0.7, "fur", p.fur);
      place(
        hair,
        Math.cos(angle) * radius * 0.5,
        -length * 0.5,
        Math.sin(angle) * radius * 0.5,
        Math.PI / 2 + Math.sin(angle) * 0.5,
        0,
        Math.cos(angle) * 1.1,
      );
      chain.joints[i].add(hair);
    }
  }
  // 先端。丸を1つ足すだけだと「棒の先の玉」になるので、細く長い房で締める
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * Math.PI * 2 + 0.6;
    const tipHair = kit.spike(radius * 0.55, length * 1.15, 0.8, "fur", p.fur);
    place(tipHair, Math.cos(angle) * radius * 0.3, -length * 0.1, Math.sin(angle) * radius * 0.3, Math.PI - 0.25, 0, Math.cos(angle) * 0.5);
    chain.tip.add(tipHair);
  }
  rig.pelvis.add(chain.root);
}

/**
 * 昆虫の薄翅。前後2枚1組で、翅脈だけが硬く見える。
 * 羽毛の翼(面積の塊)と違い、輪郭が透けて中身が見えるのが妖精らしさになる。
 */
function addInsectWing(kit: CreatureKit, wing: THREE.Object3D, side: number, span: number): void {
  const p = kit.palette;
  const s = side;
  const petals: { len: number; width: number; lift: number; tilt: number }[] = [
    { len: 1.0, width: 0.56, lift: 0.20, tilt: 0.1 },
    { len: 0.62, width: 0.44, lift: -0.18, tilt: -0.55 },
  ];

  for (const petal of petals) {
    const L = span * petal.len;
    const W = span * petal.width;
    // 先を尖らせると木の葉になってしまう。先端を丸く、根元を細く絞ると翅に見える
    const blade = kit.membrane(
      (shape) => {
        shape.moveTo(0, 0);
        shape.bezierCurveTo(s * L * 0.30, W * 0.86, s * L * 0.70, W * 1.02, s * L * 0.94, W * 0.44);
        shape.bezierCurveTo(s * L * 1.06, W * 0.05, s * L * 0.92, -W * 0.42, s * L * 0.60, -W * 0.50);
        shape.bezierCurveTo(s * L * 0.32, -W * 0.55, s * L * 0.12, -W * 0.22, 0, 0);
      },
      "membrane",
      p.membrane,
      // 外へ行くほど反らせて、平らな板に見えないようにする
      -0.1 / Math.max(0.001, span),
    );
    place(blade, 0, span * petal.lift, 0, 0, 0, s * petal.tilt);
    wing.add(blade);

    // 翅脈。前縁の1本だけだと葉脈に見えるので、根元から扇状に3本走らせる。
    // 面を分割する線が入ることで、膜が骨組みに張られているように読める
    const veins: [number, number][] = [
      [0.94, 0.44],
      [0.80, -0.10],
      [0.52, -0.42],
    ];
    for (const [vx, vy] of veins) {
      // 膜の縁からはみ出すと「触角の束」に見えるので、内側で止める
      wing.add(
        place(
          kit.taperedTube(
            [
              { x: 0, y: 0, z: 0 },
              { x: s * L * vx * 0.42, y: W * (vy * 0.42 + 0.15), z: 0 },
              { x: s * L * vx * 0.80, y: W * vy * 0.78, z: 0 },
            ],
            span * 0.016,
            span * 0.003,
            "plate",
            p.plate,
            4,
            8,
          ),
          0,
          span * petal.lift,
          -span * 0.012,
          0,
          0,
          s * petal.tilt,
        ),
      );
    }
  }
  // 付け根の関節
  wing.add(place(kit.ball(span * 0.07, span * 0.07, span * 0.06, "plate", p.plate, 8), 0, 0, 0));
}

/** 豚の頭。鼻先の円盤と鼻孔、垂れ耳で「豚」と読ませる */
function addPigHead(kit: CreatureKit, head: THREE.Object3D, scale: number, earDroop: number): void {
  const p = kit.palette;
  const S = scale;
  head.add(place(kit.ball(0.30 * S, 0.27 * S, 0.28 * S, "hide", p.main), 0, 0.24 * S, 0));
  // 頬。豚は横幅で読ませる
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(0.14 * S, 0.13 * S, 0.14 * S, "hide", p.main, 10), side * 0.22 * S, 0.19 * S, -0.05 * S));
  }
  // 鼻づら → 鼻先の円盤 → 鼻孔
  head.add(place(kit.ball(0.16 * S, 0.13 * S, 0.16 * S, "hide", p.main), 0, 0.17 * S, -0.26 * S));
  head.add(place(kit.lens(0.15 * S, 0.13 * S, 0.05 * S, "hide", p.dark, 12), 0, 0.17 * S, -0.39 * S));
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(0.035 * S, 0.05 * S, 0.02 * S, "hide", p.deep, 8), side * 0.06 * S, 0.17 * S, -0.42 * S));
  }
  addRoundEyes(kit, head, 0.14 * S, 0.30 * S, -0.25 * S, 0.045 * S);
  // 垂れ耳。付け根から前へ折れる2枚重ねで、厚みのある耳にする
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    place(ear, side * 0.24 * S, 0.42 * S, -0.02 * S, earDroop, 0, -side * 0.5);
    ear.add(place(kit.lens(0.10 * S, 0.16 * S, 0.035 * S, "hide", p.main, 8), 0, 0.11 * S, 0));
    ear.add(place(kit.lens(0.07 * S, 0.11 * S, 0.025 * S, "hide", p.dark, 8), 0, 0.20 * S, -0.03 * S, 0.5, 0, 0));
    head.add(ear);
  }
}

/** くるんと巻いた尾。豚の後ろ姿を1本で決める */
function addCurlyTail(kit: CreatureKit, parent: THREE.Object3D, origin: [number, number, number], scale: number): void {
  const p = kit.palette;
  const points: THREE.Vector3Like[] = [];
  const turns = 1.8;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const angle = t * Math.PI * 2 * turns;
    const radius = 0.13 * scale * (0.35 + t * 0.65);
    points.push({
      x: Math.sin(angle) * radius,
      y: 0.10 * scale * t + (1 - Math.cos(angle)) * radius * 0.4,
      z: origin[2] * 0 + t * 0.16 * scale + Math.cos(angle) * radius * 0.35,
    });
  }
  const tail = kit.taperedTube(points, 0.045 * scale, 0.014 * scale, "hide", p.main, 5, 20);
  place(tail, origin[0], origin[1], origin[2]);
  parent.add(tail);
}

/** 豚の四肢。短くて太い、蹄の脚 */
function addPigLegs(kit: CreatureKit, rig: CreatureRig, scale: number, spread: number, hind: boolean): void {
  const p = kit.palette;
  const S = scale;
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.20 * S, r0: 0.10 * S, r1: 0.075 * S, rot: [hind ? 0.16 : -0.10, 0, side * 0.05], radial: 7 },
        { len: 0.16 * S, r0: 0.07 * S, r1: 0.055 * S, rot: [hind ? -0.24 : 0.14, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * spread * S, -0.10 * S, (hind ? 0.24 : -0.26) * S);
    // 蹄。硬い材質を先端に1つ足すだけで、脚の終わりが締まる
    leg.tip.add(place(kit.ball(0.075 * S, 0.06 * S, 0.085 * S, "plate", p.plate, 8), 0, -0.02 * S, -0.01 * S));
    leg.tip.add(place(kit.box(0.012 * S, 0.07 * S, 0.09 * S, "hide", p.deep), 0, -0.03 * S, -0.02 * S));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * (hind ? 0.9 : 1.6), !hind));
  }
}

// ---------------------------------------------------------------------------
// slime: 粘体
// ---------------------------------------------------------------------------

/**
 * スライム。
 *
 * 以前は役割(アタッカー)の四足獣の骨格をそのまま使っていて、
 * 「牙と角のある獣」になっていた。骨も四肢も持たない生き物なので、
 * 骨格ビルダーを流用せず、床に置かれた一塊の粘体として組み直す。
 *
 * 動きは関節ではなく体積の変形で作るため、anim.squash を立てて
 * MonsterAvatar 側の潰れ・伸びを有効にする。骨格の原点(y=0)を
 * 接地面に合わせてあるので、伸縮しても足元が浮かない。
 */
function buildSlime(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  // 粘体。半透明で内側の濁りが透ける
  kit.skin = "gel";
  rig.pelvis.position.y = 0;

  // 本体。裾を一度外へ張り出させてから床へ落とし、
  // 「自重で潰れて広がっている」重さを輪郭に出す。
  //
  // 単調に細くなる釣鐘だと、遠景では「かまくら」か「置き傘」にしか見えない。
  // 裾の張り出し → **くびれ** → 上の膨らみ、と段を作ることで、
  // 輪郭線だけで「重い液体が2段に溜まっている」ことが読める
  rig.pelvis.add(
    kit.lathe(
      [
        [0.001, 0.0],
        [0.56, 0.0],
        [0.74, 0.03],
        [0.86, 0.10],
        [0.85, 0.19],
        // ここが張り出しの下端。外へ庇のように出た分だけ、下に影が落ちる
        [0.72, 0.27],
        [0.69, 0.34],
        [0.75, 0.45],
        [0.73, 0.60],
        [0.58, 0.80],
        [0.34, 0.98],
        [0.11, 1.07],
        [0.001, 1.09],
      ],
      "hide",
      p.main,
      26,
    ),
  );
  // くびれに落ちる影。段の下側を一段暗い環でなぞると、
  // 半透明の体でもくびれが「へこみ」として読める
  rig.pelvis.add(place(kit.band(0.71, 0.035, Math.PI * 2, "hide", p.dark, 24), 0, 0.29, 0, Math.PI / 2, 0, 0));

  // 床に広がった溜まり。
  // 均等な粒を輪に並べると「足の指」や「石を敷いた台座」に見えたので、
  // 大きさも位置もばらばらな平たい塊を重ねて、外周を非対称に崩す
  for (const pool of [
    { x: 0.0, z: 0.0, r: 0.86, h: 0.06 },
    { x: 0.30, z: -0.22, r: 0.52, h: 0.05 },
    { x: -0.36, z: 0.16, r: 0.46, h: 0.055 },
    { x: 0.10, z: 0.42, r: 0.40, h: 0.045 },
    { x: -0.22, z: -0.40, r: 0.36, h: 0.04 },
    { x: 0.46, z: 0.28, r: 0.26, h: 0.035 },
  ]) {
    rig.pelvis.add(place(kit.lens(pool.r, pool.h, pool.r * 0.94, "hide", p.dark, 14), pool.x, pool.h * 0.55, pool.z));
  }

  // 本体の膨らみ。真円のドームは「かまくら」に見えてしまうため、
  // 大きさの違う塊を半分めり込ませて、どの角度からも輪郭が非対称になるようにする
  for (const lump of [
    { x: -0.44, y: 0.42, z: 0.26, r: 0.34 },
    { x: 0.40, y: 0.30, z: -0.34, r: 0.38 },
    { x: 0.22, y: 0.72, z: 0.34, r: 0.28 },
    { x: -0.26, y: 0.78, z: -0.30, r: 0.24 },
    { x: 0.52, y: 0.46, z: 0.22, r: 0.26 },
  ]) {
    rig.pelvis.add(place(kit.ball(lump.r, lump.r * 0.86, lump.r, "hide", p.main, 12), lump.x, lump.y, lump.z));
  }

  // 縁から垂れ落ちる雫。溜まりのすぐ上に丸い粒を並べ、
  // 「体が床へ流れ落ちている」ことを、輪郭の途中に置いた粒で伝える
  for (const drop of [
    { angle: 1.0, y: 0.30, r: 0.13 },
    { angle: 2.4, y: 0.22, r: 0.10 },
    { angle: -1.7, y: 0.26, r: 0.115 },
    { angle: -0.4, y: 0.18, r: 0.09 },
    { angle: 3.6, y: 0.34, r: 0.10 },
  ]) {
    const radius = 0.78;
    rig.pelvis.add(
      place(
        kit.ball(drop.r, drop.r * 1.3, drop.r, "hide", p.main, 10),
        Math.cos(drop.angle) * radius,
        drop.y,
        Math.sin(drop.angle) * radius,
      ),
    );
  }

  // 濡れた照り。硬い材質の薄片を上面に寝かせると、面のハイライトだけが立ち、
  // 不透明な体でも「濡れた粘体」に見える
  for (const shine of [
    { x: -0.30, y: 0.86, z: -0.26, rx: 0.20, rz: 0.13, rot: -0.5 },
    { x: -0.44, y: 0.66, z: -0.10, rx: 0.10, rz: 0.07, rot: -0.9 },
    { x: 0.30, y: 0.80, z: 0.28, rx: 0.14, rz: 0.09, rot: 0.7 },
  ]) {
    rig.pelvis.add(place(kit.lens(shine.rx, shine.rz, 0.02, "crystal", p.accent, 10), shine.x, shine.y, shine.z, 1.1, shine.rot, 0));
  }

  // 体内に浮く核と気泡。透過する結晶を内側に置くことで、
  // 外殻が不透明でも「中身が詰まったゼリー」に見える
  rig.pelvis.add(place(kit.octa(0.17, 0.22, 0.17, "crystal", p.accent), 0, 0.36, 0.06));
  rig.pelvis.add(place(kit.octa(0.07, 0.10, 0.07, "glow", p.glow), 0, 0.36, 0.06));
  for (const bubble of [
    { x: 0.22, y: 0.62, z: 0.18, r: 0.075 },
    { x: -0.28, y: 0.42, z: -0.10, r: 0.06 },
    { x: 0.10, y: 0.80, z: -0.16, r: 0.05 },
    { x: -0.14, y: 0.24, z: 0.24, r: 0.055 },
  ]) {
    rig.pelvis.add(place(kit.ball(bubble.r, bubble.r, bubble.r, "crystal", p.accent, 8), bubble.x, bubble.y, bubble.z));
  }

  // 頭頂で揺れる雫。布として登録し、本体より遅れて振らせる
  const droop = new THREE.Group();
  markAnimated(droop);
  place(droop, 0.05, 1.02, 0.06, 0.3, 0, -0.25);
  droop.add(
    kit.taperedTube(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0.03, y: 0.16, z: 0.03 },
        { x: 0.02, y: 0.28, z: 0.10 },
      ],
      0.07,
      0.02,
      "hide",
      p.main,
      6,
      6,
    ),
  );
  droop.add(place(kit.ball(0.05, 0.06, 0.05, "hide", p.main, 8), 0.02, 0.30, 0.11));
  rig.pelvis.add(droop);
  rig.cloth.push({ group: droop, rest: droop.rotation.clone(), phase: 0, amount: 1.5 });

  // 触手状の腕。体から直に生えた粘りの柱で、先へ行くほど太く垂れる。
  // 前方(-Z)寄りに付けて、正面からは手、背面からは体の膨らみとして読ませる
  const torso = rig.torso;
  place(torso, 0, 0.44, 0);
  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.26, r0: 0.17, r1: 0.12, rot: [0.3, 0, side * 1.15], radial: 8 },
        { len: 0.22, r0: 0.115, r1: 0.10, rot: [0.5, 0, -side * 0.55], radial: 8 },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.48, 0.06, -0.16);
    arm.tip.add(place(kit.ball(0.115, 0.10, 0.115, "hide", p.main, 10), 0, -0.04, -0.01));
    torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.4));
  }

  // 顔。頭の原点を体の中心に置き、目が表面をゆっくり動くようにする。
  //
  // 目と口を球面へ直に貼ると「ゼリーの中に浮いた部品」になる。
  // 先に**顔の面**を前へ張り出させ、その上に目・頬・口を並べる
  place(rig.neck, 0, 0.06, 0);
  place(rig.head, 0, 0, 0);
  const head = rig.head;
  head.add(place(kit.ball(0.42, 0.36, 0.26, "hide", p.main, 16), 0, 0.02, -0.46));
  // 眉の代わりの段。丸い目の上に細い棒を渡すと macaroni にしか見えないので、
  // 額そのものをわずかに突き出して、目の上に影が落ちるようにする
  head.add(place(kit.ball(0.34, 0.14, 0.16, "hide", p.main, 12), 0, 0.26, -0.52, 0.3, 0, 0));
  // 頬。目の下から口の横へ張り出す膨らみ。顔の幅はここで決まる
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(0.17, 0.15, 0.13, "hide", p.main, 10), side * 0.29, -0.08, -0.52, 0, side * 0.3, 0));
  }
  addRoundEyes(kit, head, 0.20, 0.09, -0.61, 0.105, 0.3, false);
  // 口。細い線1本だと針金になる。開いた口の暗がり・下唇の段・口角のえくぼの
  // 3つを重ねて、「開いている場所」として読ませる
  head.add(place(kit.lens(0.19, 0.10, 0.07, "hide", p.deep, 12), 0, -0.21, -0.60, 0.16, 0, 0));
  head.add(place(kit.lens(0.11, 0.05, 0.04, "hide", p.dark, 10), 0, -0.235, -0.63, 0.16, 0, 0));
  head.add(place(kit.lens(0.20, 0.09, 0.09, "hide", p.main, 12), 0, -0.32, -0.56, 0.34, 0, 0));
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(0.045, 0.05, 0.04, "hide", p.dark, 8), side * 0.17, -0.19, -0.56));
  }

  rig.anim = {
    idleSpeed: 1.15,
    breath: 0.25,
    bob: 0.03,
    headSway: 0.9,
    tailWave: 0,
    wingFlap: 0,
    sway: 0.55,
    lunge: 1.5,
    squash: 1,
    attack: "dash",
    accent: "shiver",
  };
}

// ---------------------------------------------------------------------------
// wolf: 狼
// ---------------------------------------------------------------------------

/**
 * 狼。四足であること自体は役割(アタッカー)と同じだが、
 * 既定の四足はドラゴン寄り(背びれ・曲がった角・棘の尾)なので、
 * 細身の胴・首まわりの毛・立った耳・ふさふさの尾に組み替えて
 * 「獣」であることを毛で読ませる。
 */
function buildWolf(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  // 獣の毛皮。鱗が出ると狼に見えなくなる
  kit.skin = "pelt";
  rig.yawBias = 0.34;
  rig.pelvis.position.y = 1.0;

  // --- 腰。狼は後ろが軽く、肩が高い ---
  rig.pelvis.add(place(kit.ball(0.24, 0.24, 0.30, "hide", p.main), 0, 0, 0.04));
  rig.pelvis.add(place(kit.ball(0.19, 0.18, 0.17, "hide", p.main), 0, -0.02, 0.20));
  for (const side of [-1, 1]) {
    rig.pelvis.add(place(kit.ball(0.13, 0.17, 0.18, "hide", p.main), side * 0.19, -0.02, 0.10));
  }

  // --- 後脚(細く、踵が高いデジティグレード) ---
  // 脚を長くすると鹿に見える。狼は「胴が長く脚が短い」比率で読ませる
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.30, r0: 0.13, r1: 0.085, rot: [0.56, 0, 0], radial: 7 },
        { len: 0.30, r0: 0.085, r1: 0.055, rot: [-1.20, 0, 0], radial: 7 },
        { len: 0.21, r0: 0.055, r1: 0.045, rot: [0.80, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.18, -0.02, 0.12);
    addJoint(kit, leg.joints[1], 0, 0.075, false);
    leg.tip.add(place(kit.ball(0.075, 0.05, 0.11, "hide", p.dark), 0, -0.02, -0.04));
    addClaws(kit, leg.tip, 3, 0.10, 0.022, 0.05);
    // 腿の毛。付け根だけ房を残すと、脚の細さが際立つ
    addFurTuft(kit, leg.joints[0], 3, 0.07, 0.26, [0, -0.16, 0.10], 0.12, [1.9, 0, 0]);
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.9));
  }

  // --- 胴(深い胸、絞れた腹。前後に長く取る) ---
  const torso = rig.torso;
  place(torso, 0, 0.06, -0.54, 0.02, 0, 0);
  // 胸郭。狼は前脚の間が深く、そこから腹へ向けて一気に絞れる
  torso.add(place(kit.ball(0.25, 0.31, 0.36, "hide", p.main), 0, 0.0, -0.14));
  torso.add(place(kit.ball(0.21, 0.23, 0.34, "hide", p.main), 0, 0.0, 0.20));
  torso.add(place(kit.ball(0.18, 0.18, 0.24, "hide", p.dark), 0, -0.14, -0.14));
  torso.add(place(kit.ball(0.15, 0.12, 0.34, "hide", p.dark), 0, -0.14, 0.14));
  // 肩甲骨の張り
  for (const side of [-1, 1]) {
    torso.add(place(kit.ball(0.11, 0.16, 0.17, "hide", p.main), side * 0.22, 0.08, -0.20));
  }
  // 背の毛並み。立てると恐竜の背びれになるので、短く寝かせて並べる
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const hair = kit.spike(0.075, 0.16 - t * 0.06, 0.85, "fur", p.fur);
    place(hair, 0, 0.22 - t * 0.03, -0.34 + t * 0.74, 1.45, Math.PI / 2, 0);
    torso.add(hair);
  }

  // --- 前脚(まっすぐで細い) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.31, r0: 0.11, r1: 0.075, rot: [0.14, 0, side * 0.04], radial: 7 },
        { len: 0.28, r0: 0.07, r1: 0.05, rot: [-0.2, 0, 0], radial: 7 },
        { len: 0.11, r0: 0.05, r1: 0.045, rot: [0.16, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.19, -0.02, -0.26);
    leg.tip.add(place(kit.ball(0.07, 0.045, 0.10, "hide", p.dark), 0, -0.02, -0.04));
    addClaws(kit, leg.tip, 3, 0.10, 0.022, 0.05);
    torso.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.5, true));
  }

  // --- 首まわりの毛(狼の見分けどころ) ---
  // 首を立てると鹿になる。前へ低く送り出して、頭が肩より前に出るようにする。
  // rotation.x は正で「のけぞる」向きなので、前へ送るには負を入れる
  // (ここが正のままだと、狼が空を見上げた姿勢で固定されて顔が見えない)
  place(rig.neck, 0, 0.16, -0.40, -0.30, 0, 0);
  rig.neck.add(
    kit.taperedTube(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0.16, z: -0.02 },
        { x: 0, y: 0.30, z: 0.02 },
      ],
      0.16,
      0.095,
      "hide",
      p.main,
      7,
      6,
    ),
  );
  // 襟巻き状のたてがみ。首の付け根を1周させる。
  // 断面を丸く(flatを大きく)して幅を持たせないと、棘が刺さって見える
  for (let i = 0; i < 13; i++) {
    const angle = (i / 13) * Math.PI * 2;
    const hair = kit.spike(0.085, 0.30 - Math.cos(angle) * 0.09, 0.9, "fur", p.fur);
    place(
      hair,
      Math.sin(angle) * 0.14,
      0.04,
      Math.cos(angle) * 0.14,
      Math.PI * 0.66 + Math.cos(angle) * 0.4,
      0,
      -Math.sin(angle) * 1.25,
    );
    rig.neck.add(hair);
  }

  // --- 頭(細長い鼻づら、立った耳) ---
  // 鼻先をわずかに下げて、獲物を見据える角度にする
  place(rig.head, 0, 0.30, 0, 0.16, 0, 0);
  addBeastHead(kit, rig, { skull: [0.21, 0.20, 0.27], snout: 0.36, jaw: true, horns: "none", crest: 0, eye: 0.058 });
  // 立った三角の耳。獣の種類を一番はっきり伝える部位
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    place(ear, side * 0.125, 0.25, 0.12, -0.24, 0, -side * 0.28);
    ear.add(place(kit.spike(0.085, 0.30, 0.45, "fur", p.fur), 0, 0, 0));
    ear.add(place(kit.spike(0.05, 0.21, 0.35, "hide", p.deep), 0, 0.02, -0.03));
    rig.head.add(ear);
  }
  // 頬の毛。顔の横幅を広げて、細い鼻づらとの対比を作る
  for (const side of [-1, 1]) {
    addFurTuft(kit, rig.head, 3, 0.055, 0.22, [side * 0.13, 0.10, 0.06], 0.10, [1.4, 0, side * 1.4]);
  }

  // 長くて太い尾。後ろへ低く流すと、胴の長さがさらに強調される
  addFurTail(kit, rig, [0, 0.08, 0.22], 5, 0.22, 0.09, -1.05, -0.10);

  rig.wingAnchor.set(0.18, 0.32, -0.02);

  rig.anim = {
    idleSpeed: 1.5,
    breath: 0.85,
    bob: 0.028,
    headSway: 1.45,
    tailWave: 1.7,
    wingFlap: 0,
    sway: 0.9,
    lunge: 1.8,
    squash: 0,
    attack: "pounce",
    accent: "headShake",
  };
}

// ---------------------------------------------------------------------------
// nemesis: 魔王
// ---------------------------------------------------------------------------

/**
 * ネメシス(魔王)。
 *
 * 役割はアタッカーだが、四足獣にしてしまうと「主(あるじ)」に見えない。
 * 直立した人型に、巨大な角・裂けたマント・長柄の大鎌を足して、
 * 「他のモンスターを従える存在」として読めるシルエットにする。
 */
function buildNemesis(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.25;

  // --- 腰。重い帯と、そこから下がる裂けた腰布 ---
  rig.pelvis.add(
    place(
      kit.hull(
        [
          { y: -0.2, r: 0.19, rz: 0.17 },
          { y: -0.04, r: 0.26, rz: 0.22, keel: 0.12 },
          { y: 0.1, r: 0.23, rz: 0.19 },
        ],
        "hide",
        p.dark,
        { sides: 8 },
      ),
      0,
      0,
      0,
    ),
  );
  rig.pelvis.add(place(kit.band(0.25, 0.045, Math.PI * 2, "metal", p.metal, 16), 0, 0.02, 0, Math.PI / 2, 0, 0));
  rig.pelvis.add(place(kit.octa(0.08, 0.12, 0.05, "crystal", p.accent), 0, 0.02, -0.25));
  rig.pelvis.add(place(kit.octa(0.04, 0.06, 0.03, "glow", p.glow), 0, 0.02, -0.26));
  for (let i = 0; i < 5; i++) {
    const angle = -1.15 + (i / 4) * 2.3;
    const strip = kit.spike(0.09, 0.46 + Math.abs(Math.sin(i * 2.1)) * 0.16, 0.3, "membrane", p.membrane);
    place(strip, Math.sin(angle) * 0.24, -0.08, -Math.cos(angle) * 0.23, Math.PI - 0.12, -angle, 0);
    rig.pelvis.add(strip);
  }

  // --- 脚(蹄を持つ3節。人型だが人間ではないことを脚で示す) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.44, r0: 0.16, r1: 0.12, rot: [0.40, 0, side * 0.07], radial: 7, facet: true },
        { len: 0.42, r0: 0.115, r1: 0.09, rot: [-0.86, 0, 0], radial: 6, facet: true },
        { len: 0.26, r0: 0.09, r1: 0.08, rot: [0.55, 0, 0], radial: 6, facet: true },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.21, -0.06, 0.02);
    leg.joints[0].add(place(kit.lens(0.15, 0.20, 0.13, "metal", p.metal), 0, -0.20, -0.04, 0.06, 0, 0));
    addJoint(kit, leg.joints[1], 0, 0.10, true);
    leg.joints[1].add(place(kit.lens(0.11, 0.18, 0.10, "metal", p.metal), 0, -0.20, -0.04));
    // 蹄
    leg.tip.add(place(kit.ball(0.11, 0.11, 0.16, "plate", p.plate), 0, -0.04, -0.05));
    leg.tip.add(place(kit.box(0.02, 0.12, 0.16, "hide", p.deep), 0, -0.06, -0.08));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.7));
  }

  // --- 胴(逆三角形。肩が広く腰が細い) ---
  const torso = rig.torso;
  place(torso, 0, 0.06, 0, -0.08, 0, 0);
  // 胴は1本の面取り角柱。腰を締めて肩へ向かって開く逆三角形を、
  // 球を積むのではなく輪切りの半径で作る。腹が細いと、背後のマントが
  // 胴の隙間から透けて「前掛け」に見えるので、そこは落としすぎない
  torso.add(
    place(
      kit.hull(
        [
          { y: 0.04, r: 0.20, rz: 0.18 },
          { y: 0.18, r: 0.23, rz: 0.2, keel: 0.16, ridge: 0.1 },
          { y: 0.32, r: 0.26, rz: 0.22, keel: 0.26, ridge: 0.18 },
          { y: 0.46, r: 0.32, rz: 0.26, keel: 0.3, ridge: 0.22 },
          { y: 0.6, r: 0.36, rz: 0.27, keel: 0.18, ridge: 0.26 },
          { y: 0.7, r: 0.3, rz: 0.22 },
          { y: 0.78, r: 0.17, rz: 0.15 },
        ],
        "hide",
        p.main,
        { sides: 8 },
      ),
      0,
      0,
      0,
    ),
  );
  // 胸腹の積層装甲。下から上へ少しずつ重なる帯。参考画像でいちばん効いている要素で、
  // 面が平らでも1枚ずつ縁が立つので情報量が出る
  torso.add(
    place(
      kit.plateStack("metal", p.metal, {
        count: 7,
        y0: 0.12,
        y1: 0.62,
        z: -0.2,
        zEnd: -0.3,
        width: 0.3,
        widthEnd: 0.46,
        height: 0.14,
        heightEnd: 0.18,
        thickness: 0.034,
        wrap: 0.24,
        wrapEnd: 0.3,
        notch: 0.45,
        tilt: 0.12,
        tiltEnd: -0.1,
      }),
      0,
      0,
      0,
    ),
  );
  torso.add(place(kit.lens(0.34, 0.20, 0.16, "metal", p.metal), 0, 0.64, -0.10, -0.12, 0, 0));
  torso.add(place(kit.octa(0.09, 0.14, 0.06, "crystal", p.accent), 0, 0.56, -0.24));
  torso.add(place(kit.octa(0.045, 0.07, 0.03, "glow", p.glow), 0, 0.56, -0.25));
  // 首を囲う棘の襟
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5;
    const collar = kit.spike(0.05, 0.30 - Math.abs(t) * 0.10, 0.6, "plate", p.plate);
    place(collar, t * 0.5, 0.72, 0.06 + Math.abs(t) * 0.10, -0.5, 0, -t * 1.4);
    torso.add(collar);
  }

  for (const side of [-1, 1]) {
    // 肩。丸い塊ではなく、縁の立った板を段違いに重ねた甲にする。
    // 外へ倒した台(pauldron)の中で、板を下へずらしながら重ねる
    const pauldron = new THREE.Group();
    place(pauldron, side * 0.42, 0.68, 0, 0, 0, -side * 0.5);
    for (let i = 0; i < 3; i++) {
      const w = 0.30 - i * 0.055;
      const pad = kit.plate(w * 1.55, w * 0.85, 0.036, "metal", p.metal, { notch: 0.26, shoulder: 0.78, wrap: 0.32 });
      place(pad, side * i * 0.022, -i * 0.125, 0, 0, (-side * Math.PI) / 2, 0);
      pauldron.add(pad);
    }
    torso.add(pauldron);
    // 肩の結晶の房。装甲の上に群れで生やして、肩の質量を稼ぐ
    const crest = kit.shardCluster("crystal", p.accent, {
      count: 5,
      length: 0.26,
      radius: 0.06,
      spread: 0.7,
      scatter: 0.07,
      minScale: 0.3,
    });
    place(crest, side * 0.44, 0.78, -0.02, 0, 0, -side * 0.75);
    torso.add(crest);
    for (let i = 0; i < 2; i++) {
      const spike = kit.spike(0.055, 0.34 - i * 0.08, 0.7, "plate", p.plate);
      place(spike, side * 0.54, 0.76, -0.12 + i * 0.22, -0.3 + i * 0.35, 0, -side * 0.85);
      torso.add(spike);
    }

    const arm = kit.chain(
      [
        { len: 0.42, r0: 0.13, r1: 0.10, rot: [0.16, 0, side * 0.22], radial: 6, facet: true },
        { len: 0.40, r0: 0.10, r1: 0.085, rot: [-0.5, 0, 0], radial: 6, facet: true },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.46, 0.58, 0);
    addJoint(kit, arm.joints[1], 0, 0.10, true);
    arm.joints[1].add(place(kit.lens(0.11, 0.19, 0.10, "metal", p.metal), 0, -0.20, -0.03));
    arm.tip.add(place(kit.ball(0.10, 0.10, 0.11, "hide", p.dark), 0, -0.05, -0.01));

    if (side < 0) {
      // 左手は素手の鉤爪。右手の得物と対にして、左右で情報を変える
      addClaws(kit, arm.tip, 4, 0.22, 0.032, 0.065);
    } else {
      // 右手の大鎌。
      // 「武器を持っている」ではなく「大鎌である」と一目で分かる必要があるので、
      // 柄は体高に近い長さ、刃は肩幅を超える大きさまで振り切る。
      // 湾曲した刃にすることで、直剣を持つバランス型とも混ざらない
      // 前腕の傾き(肩+肘で約 -0.34 rad)を打ち消して、柄をほぼ鉛直に立てる。
      // 寝かせると「棒を提げている」ようにしか見えず、刃が読めない
      const scythe = new THREE.Group();
      place(scythe, 0, -0.06, -0.02, 0.22, 0.12, 0.14);
      scythe.add(place(kit.link({ x: 0, y: -0.85, z: 0 }, { x: 0, y: 1.55, z: 0 }, 0.05, 0.038, "plate", p.plate, 6), 0, 0, 0));
      scythe.add(place(kit.band(0.07, 0.024, Math.PI * 2, "metal", p.metal, 12), 0, 0.5, 0, Math.PI / 2, 0, 0));
      scythe.add(place(kit.band(0.07, 0.024, Math.PI * 2, "metal", p.metal, 12), 0, -0.35, 0, Math.PI / 2, 0, 0));
      scythe.add(place(kit.octa(0.07, 0.14, 0.06, "crystal", p.accent), 0, -0.94, 0));
      // 刃の付け根の金具。柄と刃が「繋がっている」ように見せる
      scythe.add(place(kit.octa(0.09, 0.16, 0.08, "metal", p.metal), 0, 1.5, 0));
      // 刃(内側へ湾曲した爪を大きく使う)。峰の光は細い線に留める
      const blade = kit.claw(1.45, 0.13, 0.75, "metal", p.metal);
      place(blade, 0, 1.52, 0, 0, 0, -1.42);
      scythe.add(blade);
      const edge = kit.claw(1.36, 0.035, 0.8, "glow", p.glow);
      place(edge, 0.0, 1.55, -0.05, 0, 0, -1.48);
      scythe.add(edge);
      // 逆側の小刃。刃が一方向に伸びるだけの棒に見えないようにする
      const spur = kit.claw(0.38, 0.06, 0.5, "metal", p.metal);
      place(spur, 0, 1.46, 0.02, 0, 0, 1.85);
      scythe.add(spur);
      arm.tip.add(scythe);
    }
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 0.9));
  }

  // --- マント(裾が裂けた長い膜) ---
  const cape = new THREE.Group();
  markAnimated(cape);
  place(cape, 0, 0.72, 0.28, 0.16, 0, 0);
  cape.add(
    kit.membrane(
      (shape) => {
        shape.moveTo(-0.4, 0.06);
        shape.lineTo(0.4, 0.06);
        shape.lineTo(0.62, -1.35);
        shape.lineTo(0.42, -1.12);
        shape.lineTo(0.24, -1.42);
        shape.lineTo(0.05, -1.1);
        shape.lineTo(-0.16, -1.46);
        shape.lineTo(-0.38, -1.14);
        shape.lineTo(-0.6, -1.32);
      },
      "membrane",
      p.membrane,
      0.42,
    ),
  );
  // 肩で留める金具
  for (const side of [-1, 1]) {
    cape.add(place(kit.octa(0.07, 0.10, 0.05, "metal", p.metal), side * 0.32, 0.04, -0.04));
  }
  rig.torso.add(cape);
  rig.cloth.push({ group: cape, rest: cape.rotation.clone(), phase: 0, amount: 1 });

  // --- 頭(獣面ではなく、面を被った人型の顔) ---
  place(rig.neck, 0, 0.76, -0.02, -0.05, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.16, z: 0 }, 0.10, 0.09, "hide", p.dark));
  place(rig.head, 0, 0.18, 0, 0.08, 0, 0);
  const head = rig.head;
  head.add(place(kit.ball(0.17, 0.2, 0.18, "hide", p.deep), 0, 0.11, 0));
  // 兜。頭頂から後頭部を覆う殻と、額の中央に立つ稜。
  // 面をのっぺり1枚にすると、光る帯を貼った箱にしかならない(実際にそうなっていた)
  head.add(place(kit.lens(0.175, 0.185, 0.15, "metal", p.metal), 0, 0.16, 0.0));
  head.add(place(kit.spike(0.045, 0.26, 0.3, "metal", p.metal), 0, 0.28, 0.04, 0.4, Math.PI / 2, 0));
  // 眉庇。左右に割れた鋭い庇。魔王の冷たさは、この庇の角度で決まる
  for (const side of [-1, 1]) {
    head.add(place(kit.lens(0.105, 0.032, 0.085, "metal", p.metal), side * 0.08, 0.185, -0.115, -0.55, 0, -side * 0.62));
  }
  // 目。冷たい細い光。眉庇があるので、目そのものの眉は切る
  addFaceEyes(kit, head, {
    x: 0.075,
    y: 0.135,
    z: -0.15,
    size: 0.055,
    mood: "cold",
    splay: 0.3,
    slit: 0.4,
    skin: p.deep,
    brow: false,
  });
  // 鼻梁と頬当て。面に段差が入ると、光る目が「顔の中」に見える
  head.add(place(kit.lens(0.022, 0.06, 0.045, "metal", p.metal), 0, 0.135, -0.16));
  for (const side of [-1, 1]) {
    head.add(place(kit.lens(0.055, 0.095, 0.07, "metal", p.metal), side * 0.135, 0.08, -0.085, 0, side * 0.45, side * 0.2));
  }
  // 口を覆う面頬。歯を並べた面で、笑っているようにも噛みしめているようにも読める
  head.add(place(kit.lens(0.11, 0.065, 0.08, "metal", p.metal), 0, 0.042, -0.105, 0.24, 0, 0));
  for (let i = -2; i <= 2; i++) {
    head.add(place(kit.box(0.013, 0.042, 0.02, "hide", p.deep), i * 0.029, 0.042, -0.175, 0.24, 0, 0));
  }
  // 顎の牙
  for (const side of [-1, 1]) {
    const fang = kit.spike(0.024, 0.1, 0.7, "plate", p.plate);
    place(fang, side * 0.075, -0.012, -0.135, AIM_DOWN, 0, side * 0.14);
    head.add(fang);
  }
  head.add(place(kit.lens(0.115, 0.06, 0.08, "hide", p.dark, 8), 0, -0.03, -0.09, 0.24, 0, 0));

  // 巨大な角。外へ回り込みながら上へ立ち上がり、正面幅を稼ぐ
  for (const side of [-1, 1]) {
    const curve: THREE.Vector3Like[] = [
      { x: side * 0.11, y: 0.22, z: 0.04 },
      { x: side * 0.26, y: 0.30, z: 0.22 },
      { x: side * 0.34, y: 0.56, z: 0.24 },
      { x: side * 0.26, y: 0.80, z: 0.04 },
      { x: side * 0.20, y: 0.92, z: -0.14 },
    ];
    head.add(kit.taperedTube(curve, 0.075, 0.006, "plate", p.plate, 6, 12));
    // 年輪の節
    for (let i = 0; i < 3; i++) {
      const ring = kit.band(0.075 - i * 0.012, 0.014, Math.PI * 2, "plate", p.plate, 8);
      place(ring, side * (0.16 + i * 0.06), 0.26 + i * 0.10, 0.14 + i * 0.05, 1.0, side * 0.6, 0);
      head.add(ring);
    }
    // 小さな副角
    head.add(
      kit.taperedTube(
        [
          { x: side * 0.13, y: 0.16, z: 0.10 },
          { x: side * 0.19, y: 0.10, z: 0.24 },
          { x: side * 0.17, y: 0.14, z: 0.36 },
        ],
        0.035,
        0.005,
        "plate",
        p.plate,
        5,
        7,
      ),
    );
  }

  // 背後に漂う破片。魔力を纏っていることを、体を明るくせずに示す
  for (let i = 0; i < 4; i++) {
    const shard = kit.octa(0.05, 0.13, 0.05, "crystal", p.accent);
    rig.core.add(shard);
    rig.orbiters.push({
      object: shard,
      radius: 0.9 + (i % 2) * 0.24,
      height: 1.3 + i * 0.28,
      speed: -0.35 - i * 0.06,
      phase: (i / 4) * Math.PI * 2,
      tilt: 0.3,
      spin: 0.8,
    });
  }

  addTail(kit, rig, [0, 0.0, 0.2], 5, 0.19, 0.075, -1.4, -0.18, true);

  rig.anim = {
    idleSpeed: 0.82,
    breath: 1.1,
    bob: 0.028,
    headSway: 0.75,
    tailWave: 1.0,
    wingFlap: 0,
    sway: 0.8,
    lunge: 1.5,
    squash: 0,
    attack: "lunge",
    accent: "roar",
  };
}

// ---------------------------------------------------------------------------
// golem: 岩の巨人
// ---------------------------------------------------------------------------

/**
 * ゴーレム。
 *
 * 役割(ディフェンダー)の骨格は「装甲を着た人型」に寄っていて、
 * 岩そのものが動いている感じが出ていなかった。
 * ここでは首を無くし、肩を極端に広げ、腕を膝下まで伸ばして、
 * 「積み上がった岩塊が歩いている」比率に組み直す。
 */
function buildGolem(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 0.92;

  // --- 腰(横に広い岩の台) ---
  rig.pelvis.add(place(kit.rock(0.52, 0.26, 0.42, "hide", p.dark, 0.26), 0, -0.04, 0));
  rig.pelvis.add(place(kit.rock(0.30, 0.16, 0.26, "hide", p.dark, 0.3), 0, -0.14, 0.16));

  // --- 脚(太く短い柱) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.34, r0: 0.30, r1: 0.27, rot: [0.06, 0, side * 0.05], radial: 6, facet: true },
        { len: 0.32, r0: 0.26, r1: 0.29, rot: [-0.08, 0, 0], radial: 6, facet: true },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.34, -0.08, 0);
    leg.joints[0].add(place(kit.rock(0.30, 0.20, 0.28, "hide", p.dark, 0.24), 0, -0.18, 0));
    addJoint(kit, leg.joints[1], 0, 0.24, false);
    leg.joints[1].add(place(kit.rock(0.28, 0.20, 0.26, "hide", p.dark, 0.24), 0, -0.18, -0.02));
    leg.tip.add(place(kit.rock(0.34, 0.17, 0.44, "hide", p.dark, 0.2), 0, -0.08, -0.08));
    // 爪先の岩の指
    for (let i = -1; i <= 1; i++) {
      leg.tip.add(place(kit.rock(0.10, 0.08, 0.12, "hide", p.dark, 0.3), i * 0.17, -0.10, -0.28));
    }
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.5));
  }

  // --- 胴(下から上へ大きくなる3段の岩。段の隙間から光が漏れる) ---
  const torso = rig.torso;
  place(torso, 0, 0.02, 0, -0.05, 0, 0);
  // 段ごとに石の色を変える。1色で積むと、面積が大きいぶん属性色に染まって
  // 明るい塊になってしまい、加算エフェクトが乗った時に飛びやすい
  const stack: { y: number; size: [number, number, number]; jitter: number; tone: THREE.Color }[] = [
    { y: 0.24, size: [0.46, 0.24, 0.38], jitter: 0.26, tone: p.dark },
    { y: 0.60, size: [0.62, 0.28, 0.48], jitter: 0.24, tone: p.main },
    { y: 0.96, size: [0.84, 0.30, 0.54], jitter: 0.22, tone: p.dark },
  ];
  for (const [index, block] of stack.entries()) {
    torso.add(place(kit.rock(block.size[0], block.size[1], block.size[2], "hide", block.tone, block.jitter), 0, block.y, 0, 0, index * 0.4, 0));
    // 段の継ぎ目。細い線なので、光っても画面全体を持ち上げない
    torso.add(
      place(
        kit.box(block.size[0] * 1.2, 0.022, 0.05, "glow", p.glow),
        0,
        block.y - block.size[1] * 0.95,
        -block.size[2] * 0.72,
        0.1,
        0,
        0.04,
      ),
    );
  }
  // 胸の動力核。岩の隙間に埋まった結晶
  torso.add(place(kit.rock(0.26, 0.24, 0.16, "hide", p.dark, 0.3), 0, 0.62, -0.44));
  torso.add(place(kit.octa(0.14, 0.20, 0.12, "crystal", p.accent), 0, 0.62, -0.48));
  torso.add(place(kit.octa(0.06, 0.10, 0.05, "glow", p.glow), 0, 0.62, -0.50));
  // 背に生えた結晶。1本ずつ均等に立てると櫛になるので、
  // 大小と向きを散らした房を3か所に分けて生やす
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    const cluster = kit.shardCluster("crystal", p.accent, {
      count: 5,
      length: 0.42 - Math.abs(t - 0.5) * 0.24,
      radius: 0.1,
      spread: 0.7,
      scatter: 0.13,
      minScale: 0.3,
    });
    place(cluster, (t - 0.5) * 0.76, 1.0, 0.3, 0.5, 0, (t - 0.5) * 1.4);
    torso.add(cluster);
  }
  // 胸の石板。岩の段の合わせ目に、縁の立った板を差し込む。
  // 塊だけを積むと輪郭が丸い岩の連なりになるので、平らな面をひとつ通す
  torso.add(
    place(
      kit.plateStack("plate", p.plate, {
        count: 4,
        y0: 0.34,
        y1: 0.86,
        z: -0.34,
        zEnd: -0.44,
        width: 0.5,
        widthEnd: 0.66,
        height: 0.2,
        heightEnd: 0.24,
        thickness: 0.06,
        wrap: 0.4,
        wrapEnd: 0.5,
        notch: 0.3,
      }),
      0,
      0,
      0,
    ),
  );
  // 肩に載る大岩
  for (const side of [-1, 1]) {
    torso.add(place(kit.rock(0.34, 0.32, 0.34, "hide", p.main, 0.3), side * 0.90, 1.02, 0));
    torso.add(place(kit.rock(0.20, 0.16, 0.20, "hide", p.dark, 0.34), side * 0.98, 1.24, 0.02));
    for (let i = 0; i < 2; i++) {
      const crag = kit.rock(0.13, 0.20, 0.13, "hide", p.main, 0.32);
      place(crag, side * (0.80 + i * 0.2), 1.30 + i * 0.06, -0.14 + i * 0.24, 0, 0, -side * 0.4);
      torso.add(crag);
    }
  }

  // --- 腕(膝下まで届く。ゴリラのような重心の低さを出す) ---
  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.58, r0: 0.27, r1: 0.23, rot: [0.16, 0, side * 0.12], radial: 6, facet: true },
        { len: 0.56, r0: 0.23, r1: 0.26, rot: [-0.14, 0, 0], radial: 6, facet: true },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.90, 0.96, 0);
    arm.joints[0].add(place(kit.rock(0.28, 0.24, 0.26, "hide", p.dark, 0.24), 0, -0.28, 0));
    addJoint(kit, arm.joints[1], 0, 0.24, false);
    arm.joints[1].add(place(kit.rock(0.27, 0.26, 0.25, "hide", p.main, 0.26), 0, -0.28, -0.02));
    // 拳。前腕より一回り大きい岩にすると、重さが読める
    arm.tip.add(place(kit.rock(0.34, 0.30, 0.34, "hide", p.dark, 0.22), 0, -0.18, -0.02));
    for (let i = -1; i <= 1; i++) {
      arm.tip.add(place(kit.rock(0.11, 0.10, 0.12, "hide", p.dark, 0.3), i * 0.19, -0.20, -0.28));
    }
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 0.6));
  }

  // --- 頭(首を持たず、肩の間に沈む小さな岩) ---
  // 完全に埋めると顔が読めないので、肩の稜線からわずかに出す高さで止める
  place(rig.neck, 0, 1.20, -0.10, -0.08, 0, 0);
  place(rig.head, 0, 0.08, 0, 0.16, 0, 0);
  const head = rig.head;
  head.add(place(kit.rock(0.30, 0.24, 0.28, "hide", p.main, 0.26), 0, 0.10, 0));
  head.add(place(kit.rock(0.32, 0.11, 0.22, "hide", p.dark, 0.3), 0, 0.26, 0.02));
  // 顔。以前は横一文字に光る帯を1本渡しただけで、
  // 「石の塊に蛍光灯を貼った」ようにしか見えなかった(生きていない)。
  //
  // 岩でも顔を作れる。要るのは眼球ではなく**影の落ちる境目**で、
  // 庇 → 落ち窪んだ眼窩 → その底の光 → 鼻柱 → 割れた顎、と段を積む
  head.add(place(kit.rock(0.31, 0.14, 0.12, "hide", p.deep, 0.18), 0, 0.09, -0.23));
  // 眉庇。前へ深く突き出させ、目をその影の中へ入れる
  head.add(place(kit.rock(0.34, 0.13, 0.22, "hide", p.main, 0.24), 0, 0.22, -0.22, -0.32, 0, 0));
  head.add(place(kit.rock(0.30, 0.07, 0.11, "hide", p.dark, 0.3), 0, 0.17, -0.30, -0.5, 0, 0));
  // 眼窩。左右を別々に彫り込むと、一本の裂け目が「2つの目」に変わる
  for (const side of [-1, 1]) {
    head.add(place(kit.rock(0.10, 0.075, 0.06, "hide", p.deep, 0.2), side * 0.155, 0.085, -0.29));
  }
  addFaceEyes(kit, head, {
    x: 0.155,
    y: 0.085,
    z: -0.315,
    size: 0.072,
    mood: "blank",
    splay: 0.3,
    brow: false,
    skin: p.deep,
  });
  // 鼻柱。左右の眼窩のあいだに岩を1本立てると、顔に「正面」ができる
  head.add(place(kit.rock(0.055, 0.13, 0.075, "hide", p.main, 0.3), 0, 0.06, -0.28));
  // 顎。頭蓋から割れて分かれた下の岩。合わせ目の暗がりが口になる
  head.add(place(kit.rock(0.26, 0.045, 0.10, "hide", p.deep, 0.2), 0, -0.05, -0.24));
  head.add(place(kit.rock(0.27, 0.10, 0.20, "hide", p.dark, 0.26), 0, -0.13, -0.16, 0.22, 0, 0));
  for (let i = -1; i <= 1; i++) {
    head.add(place(kit.rock(0.055, 0.05, 0.045, "hide", p.main, 0.3), i * 0.115, -0.075, -0.26, 0.2, 0, i * 0.3));
  }
  for (const side of [-1, 1]) {
    const crag = kit.rock(0.10, 0.17, 0.10, "hide", p.main, 0.3);
    place(crag, side * 0.20, 0.24, 0.04, 0, 0, -side * 0.5);
    head.add(crag);
    // 頬骨の岩。眼窩の外側を支えて、顔の幅を作る
    head.add(place(kit.rock(0.09, 0.11, 0.09, "hide", p.main, 0.28), side * 0.245, 0.04, -0.19, 0, side * 0.4, side * 0.2));
  }

  // 周囲を漂う岩片。重い体が動かない分、周りが動いて生気を作る
  for (let i = 0; i < 4; i++) {
    const chunk = kit.rock(0.10, 0.09, 0.10, "hide", p.dark, 0.4);
    rig.core.add(chunk);
    rig.orbiters.push({
      object: chunk,
      radius: 1.05 + (i % 2) * 0.2,
      height: 0.8 + i * 0.3,
      speed: 0.3 + i * 0.05,
      phase: (i / 4) * Math.PI * 2,
      tilt: 0.4,
      spin: 0.5,
    });
  }

  rig.anim = {
    idleSpeed: 0.5,
    breath: 1.5,
    bob: 0.016,
    headSway: 0.3,
    tailWave: 0,
    wingFlap: 0,
    sway: 0.45,
    lunge: 0.7,
    squash: 0,
    attack: "slam",
    accent: "stomp",
  };
}

// ---------------------------------------------------------------------------
// fairy: 妖精
// ---------------------------------------------------------------------------

/**
 * 妖精。
 *
 * 役割(ヒーラー)の骨格は「裾の長い僧衣+杖」で、体格も他と同じ大きさだった。
 * 妖精は小柄であること自体が特徴なので、頭身を下げ、薄い翅で浮かせ、
 * 足を出して宙にぶら下げる。杖ではなく小さな花の錫杖を持たせる。
 */
function buildFairy(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.floats = true;
  rig.pelvis.position.y = 1.0;

  // --- 短い衣。裾から脚が出ているので、丈は膝上で止める ---
  rig.pelvis.add(place(kit.ball(0.18, 0.16, 0.16, "hide", p.main), 0, 0, 0));
  rig.pelvis.add(
    kit.lathe(
      [
        [0.20, -0.42],
        [0.30, -0.30],
        [0.26, -0.12],
        [0.19, 0.04],
        [0.14, 0.14],
      ],
      "cloth",
      p.cloth,
      18,
    ),
  );
  // 裾の花弁。円錐の縁を割って、布の柔らかさを出す
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.3;
    const petal = kit.spike(0.10, 0.24, 0.4, "cloth", p.cloth);
    place(petal, Math.cos(angle) * 0.26, -0.34, Math.sin(angle) * 0.26, Math.PI - 0.35, -angle, 0);
    rig.pelvis.add(petal);
  }
  rig.pelvis.add(place(kit.band(0.19, 0.022, Math.PI * 2, "metal", p.metal, 14), 0, 0.06, 0, Math.PI / 2, 0, 0));

  // --- 細い脚。浮いているので、爪先が下を向いたまま垂れる ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.30, r0: 0.055, r1: 0.042, rot: [0.22, 0, side * 0.10], radial: 6 },
        { len: 0.26, r0: 0.04, r1: 0.03, rot: [-0.2, 0, 0], radial: 6 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.11, -0.16, 0);
    leg.tip.add(place(kit.ball(0.045, 0.05, 0.09, "hide", p.dark, 8), 0, -0.02, -0.03));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.3));
  }

  // --- 胴。小柄なので細く短く ---
  const torso = rig.torso;
  place(torso, 0, 0.10, 0, -0.04, 0, 0);
  torso.add(place(kit.ball(0.15, 0.19, 0.12, "hide", p.main), 0, 0.14, 0));
  torso.add(place(kit.lathe([[0.13, 0.02], [0.19, 0.16], [0.13, 0.30]], "cloth", p.cloth, 16), 0, 0, 0));
  torso.add(place(kit.band(0.19, 0.016, Math.PI * 2, "plate", p.plate, 16), 0, 0.16, 0, Math.PI / 2, 0, 0));
  torso.add(place(kit.octa(0.05, 0.07, 0.035, "glow", p.glow), 0, 0.22, -0.13));

  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.22, r0: 0.045, r1: 0.035, rot: [0.16, 0, side * 0.62], radial: 6 },
        { len: 0.20, r0: 0.033, r1: 0.026, rot: [0.4, 0, -side * 0.3], radial: 6 },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.15, 0.26, -0.02);
    arm.tip.add(place(kit.ball(0.04, 0.038, 0.04, "hide", p.dark, 8), 0, -0.02, 0));

    if (side < 0) {
      // 花の錫杖。小さいので、輪郭が読めるよう先端だけを大きくする
      const wand = new THREE.Group();
      place(wand, 0, -0.03, -0.02, -0.5, 0, -side * 0.35);
      wand.add(place(kit.link({ x: 0, y: -0.16, z: 0 }, { x: 0, y: 0.36, z: 0 }, 0.016, 0.012, "plate", p.plate, 6), 0, 0, 0));
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const petal = kit.lens(0.055, 0.085, 0.02, "cloth", p.cloth, 8);
        place(petal, Math.cos(angle) * 0.06, 0.40, Math.sin(angle) * 0.06, 0, -angle, 0.9);
        wand.add(petal);
      }
      wand.add(place(kit.octa(0.035, 0.05, 0.035, "glow", p.glow), 0, 0.42, 0));
      arm.tip.add(wand);
    }
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.5));
  }

  // --- 頭(頭身を下げて、目を大きく) ---
  place(rig.neck, 0, 0.34, 0);
  place(rig.head, 0, 0.06, 0, 0.04, 0, 0);
  const head = rig.head;
  head.add(place(kit.ball(0.20, 0.21, 0.19, "hide", p.main), 0, 0.14, 0));
  addRoundEyes(kit, head, 0.085, 0.14, -0.18, 0.062);
  // 髪。房を後ろへ流して、丸い頭の輪郭を割る。
  // 上へ立てるとトサカになってしまうので、寝かせて後頭部から垂らす
  head.add(place(kit.ball(0.21, 0.19, 0.20, "fur", p.fur, 12), 0, 0.19, 0.03));
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5;
    const strand = kit.spike(0.07, 0.30 - Math.abs(t) * 0.10, 0.8, "fur", p.fur);
    place(strand, t * 0.28, 0.20, 0.12 + Math.abs(t) * 0.04, 2.9, 0, -t * 1.0);
    head.add(strand);
  }
  // 触角。先端の光点が視線を頭へ集める
  for (const side of [-1, 1]) {
    head.add(
      kit.taperedTube(
        [
          { x: side * 0.05, y: 0.30, z: 0.02 },
          { x: side * 0.12, y: 0.44, z: -0.04 },
          { x: side * 0.15, y: 0.54, z: -0.14 },
        ],
        0.014,
        0.004,
        "plate",
        p.plate,
        4,
        7,
      ),
    );
    head.add(place(kit.ball(0.03, 0.03, 0.03, "glow", p.glow, 8), side * 0.15, 0.55, -0.15));
  }
  // 花冠
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.4;
    const bloom = kit.lens(0.05, 0.03, 0.05, "cloth", p.cloth, 8);
    place(bloom, Math.cos(angle) * 0.19, 0.30, Math.sin(angle) * 0.19, 0.5, -angle, 0);
    head.add(bloom);
  }

  // --- 翅(前後2枚1組を左右に。薄さで妖精と分かる) ---
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    markAnimated(wing);
    place(wing, side * 0.10, 0.26, 0.10, 0.12, -side * 0.62, side * 0.30);
    addInsectWing(kit, wing, side, 0.92);
    rig.torso.add(wing);
    rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
  }

  // 鱗粉。小さな光点が周回して、浮遊感を補強する
  for (let i = 0; i < 6; i++) {
    const mote = kit.octa(0.028, 0.05, 0.028, "glow", p.glow);
    rig.core.add(mote);
    rig.orbiters.push({
      object: mote,
      radius: 0.5 + (i % 3) * 0.16,
      height: 0.5 + i * 0.16,
      speed: 0.7 + i * 0.08,
      phase: (i / 6) * Math.PI * 2,
      tilt: 0.5,
      spin: 1.4,
    });
  }

  rig.anim = {
    idleSpeed: 1.35,
    breath: 0.5,
    bob: 0.11,
    headSway: 1.15,
    tailWave: 0,
    wingFlap: 1.5,
    sway: 0.45,
    lunge: 0.6,
    squash: 0,
    attack: "cast",
    accent: "wingRuffle",
  };
}

// ---------------------------------------------------------------------------
// 豚2種
// ---------------------------------------------------------------------------

/**
 * 転生ピッグ。四足で立つ丸い豚に、小さな羽根と光輪を足す。
 * 「経験値の豚」と並べた時、翼と光輪の有無・立ち姿で見分けられるようにする。
 */
function buildReincarnationPig(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.yawBias = 0.30;
  rig.pelvis.position.y = 0.62;

  // 樽のような胴。前後に長く、腹が下に垂れる
  rig.pelvis.add(place(kit.ball(0.36, 0.33, 0.50, "hide", p.main), 0, 0.02, 0));
  rig.pelvis.add(place(kit.ball(0.32, 0.26, 0.30, "hide", p.dark), 0, -0.12, -0.04));
  rig.pelvis.add(place(kit.ball(0.30, 0.28, 0.24, "hide", p.main), 0, 0.02, 0.34));
  // 背の筋
  rig.pelvis.add(place(kit.ball(0.16, 0.10, 0.42, "hide", p.main, 10), 0, 0.28, 0.02));

  addPigLegs(kit, rig, 1.0, 0.22, true);
  addPigLegs(kit, rig, 1.0, 0.23, false);
  addCurlyTail(kit, rig.pelvis, [0, 0.18, 0.44], 1.0);

  const torso = rig.torso;
  place(torso, 0, 0.06, -0.30, 0.02, 0, 0);

  // 小さな羽根。体に対して小さいほど「おまけで飛んでいる」愛嬌が出る。
  // 枚数が少ないと1枚が大きくなって木の葉に見えるので、細かく多めに刻む
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    markAnimated(wing);
    place(wing, side * 0.14, 0.30, 0.24, 0.1, -side * 0.75, side * 0.2);
    addFeatherWing(kit, wing, side, 9, 0.46);
    torso.add(wing);
    rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
  }

  // 首。豚は首が無いに等しいので、頭を胴に食い込ませて繋ぐ。
  // 離すと「胴の上に頭が浮いている」ように見えてしまう
  place(rig.neck, 0, 0.02, -0.38, 0.30, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: -0.06, z: 0.04 }, { x: 0, y: 0.14, z: -0.02 }, 0.26, 0.24, "hide", p.main));
  place(rig.head, 0, 0.10, -0.02, 0.14, 0, 0);
  addPigHead(kit, rig.head, 0.92, 0.7);

  // 光輪。輪は細く小さく保ち、体表を明るくせずに「転生」の記号だけを置く
  const halo = kit.ring(0.20, 0.018, "glow", p.glow, 26);
  place(halo, 0, 0.62, 0.04, Math.PI / 2 - 0.2, 0, 0);
  rig.head.add(halo);
  rig.spinners.push({ object: halo, axis: "z", speed: 0.7 });

  // 巡る光の粒
  for (let i = 0; i < 4; i++) {
    const mote = kit.octa(0.035, 0.06, 0.035, "crystal", p.accent);
    rig.core.add(mote);
    rig.orbiters.push({
      object: mote,
      radius: 0.62,
      height: 0.5 + i * 0.16,
      speed: 0.6 + i * 0.06,
      phase: (i / 4) * Math.PI * 2,
      tilt: 0.35,
      spin: 1.0,
    });
  }

  rig.anim = {
    idleSpeed: 1.7,
    breath: 1.1,
    bob: 0.05,
    headSway: 1.4,
    tailWave: 1.0,
    wingFlap: 1.1,
    sway: 1.1,
    lunge: 1.2,
    squash: 0,
    attack: "dash",
    accent: "headShake",
  };
}

/**
 * 経験値ピッグ。同じ豚だが、後ろ脚で座り、背中に経験値の結晶を背負う。
 * 転生ピッグ(四足・翼・光輪)と、立ち姿からして別物に見えるようにする。
 */
function buildExpPig(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 0.66;

  // 座った下半身。床に接する尻を大きく取る
  rig.pelvis.add(place(kit.ball(0.42, 0.32, 0.40, "hide", p.main), 0, -0.06, 0.06));
  rig.pelvis.add(place(kit.ball(0.34, 0.22, 0.30, "hide", p.dark), 0, -0.18, 0.10));
  addCurlyTail(kit, rig.pelvis, [0, 0.06, 0.34], 1.05);

  // 折り畳んだ後ろ脚。座っているので前へ投げ出す
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.26, r0: 0.13, r1: 0.11, rot: [1.15, 0, side * 0.2], radial: 7 },
        { len: 0.22, r0: 0.10, r1: 0.085, rot: [-1.05, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.26, -0.14, -0.06);
    leg.tip.add(place(kit.ball(0.10, 0.075, 0.13, "plate", p.plate, 8), 0, -0.02, -0.05));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.8));
  }

  // 前に突き出た腹
  const torso = rig.torso;
  place(torso, 0, 0.12, 0, -0.04, 0, 0);
  torso.add(place(kit.ball(0.40, 0.36, 0.38, "hide", p.main), 0, 0.20, -0.04));
  torso.add(place(kit.ball(0.34, 0.26, 0.30, "hide", p.dark), 0, 0.06, -0.14));
  torso.add(place(kit.band(0.34, 0.03, Math.PI * 1.2, "metal", p.metal, 14), 0, 0.10, -0.06, Math.PI / 2, -Math.PI * 0.6, 0));

  // 背負った経験値の結晶。転生ピッグとの一番の見分けどころなので、
  // 後ろ姿だけでも「何かを背負っている」と分かる大きさまで持ち上げる
  torso.add(place(kit.ball(0.30, 0.22, 0.20, "hide", p.dark, 10), 0, 0.34, 0.28));
  torso.add(place(kit.band(0.26, 0.035, Math.PI * 2, "metal", p.metal, 14), 0, 0.36, 0.28, 0.35, 0, 0));
  for (let i = 0; i < 3; i++) {
    const t = i - 1;
    const gem = kit.octa(0.15 - Math.abs(t) * 0.04, 0.42 - Math.abs(t) * 0.14, 0.15 - Math.abs(t) * 0.04, "crystal", p.accent);
    place(gem, t * 0.24, 0.62 - Math.abs(t) * 0.14, 0.32, -0.35, 0, -t * 0.5);
    torso.add(gem);
  }
  torso.add(place(kit.octa(0.05, 0.16, 0.05, "glow", p.glow), 0, 0.64, 0.34, -0.35, 0, 0));

  // 短い前脚。座っているので胸の前に垂らす
  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.20, r0: 0.10, r1: 0.08, rot: [0.5, 0, side * 0.55], radial: 7 },
        { len: 0.16, r0: 0.075, r1: 0.06, rot: [-0.55, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.32, 0.22, -0.12);
    arm.tip.add(place(kit.ball(0.08, 0.07, 0.09, "plate", p.plate, 8), 0, -0.02, -0.02));
    torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.8));
  }

  // 首。座り姿なので頭は腹の真上。二段の球に見えないよう、
  // 顎の下に肉を足して胴と繋げる
  place(rig.neck, 0, 0.40, -0.12, 0.04, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: -0.06, z: 0.02 }, { x: 0, y: 0.10, z: -0.02 }, 0.26, 0.24, "hide", p.main));
  place(rig.head, 0, 0.06, -0.02, 0.04, 0, 0);
  rig.head.add(place(kit.ball(0.24, 0.14, 0.22, "hide", p.dark, 10), 0, 0.06, -0.04));
  addPigHead(kit, rig.head, 1.0, 0.35);

  // とんがり帽子。座り姿と合わせて、遠目のシルエットを転生ピッグから分ける
  const hat = new THREE.Group();
  place(hat, 0, 0.50, 0.04, -0.16, 0, 0.1);
  hat.add(place(kit.cone(0.24, 0.46, "cloth", p.cloth, 10), 0, 0, 0));
  hat.add(place(kit.band(0.24, 0.03, Math.PI * 2, "metal", p.metal, 14), 0, 0.03, 0, Math.PI / 2, 0, 0));
  hat.add(place(kit.octa(0.05, 0.08, 0.05, "glow", p.glow), 0, 0.50, 0));
  rig.head.add(hat);

  rig.anim = {
    idleSpeed: 1.45,
    breath: 1.5,
    bob: 0.06,
    headSway: 1.2,
    tailWave: 1.2,
    wingFlap: 0,
    sway: 1.2,
    lunge: 0.9,
    squash: 0,
    attack: "dash",
    accent: "shiver",
  };
}

// ---------------------------------------------------------------------------
// dragon: ドラゴン
// ---------------------------------------------------------------------------

/**
 * ドラゴン(SSR)。
 *
 * 四足獣の役割骨格でも一応は成立するが、それだと狼と同じ
 * 「胴が水平で、首が前へ低く出た獣」の輪郭になり、最高レアの風格が出ない。
 *
 * 見分けどころを3つに絞って作る。
 *   1. 首をS字に立ち上げ、頭を肩よりはっきり高い位置へ持ち上げる
 *   2. 胸を深く、腹をなだらかに絞る(横から見て前が重い三角形)
 *   3. 尾を胴より長く取り、先に刃を付ける
 * この3つで、横向きの構図でも狼と取り違えない輪郭になる。
 *
 * 皮膜の翼は TEMPLATE_TRAITS.dragon が wingAnchor に生やすので、ここでは作らない。
 */
function buildDragon(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  // 体表は爬虫類の鱗。この指定が無いと既定のなめらかな肌になる
  kit.skin = "scale";
  rig.yawBias = 0.3;
  // 脚を長く取ると馬やラクダに見える。ドラゴンは「胴が地面に近く、脚が短く太い」比率で読ませる
  rig.pelvis.position.y = 0.98;

  // --- 腰。後脚が太いぶん、狼より腰の塊を大きく取る ---
  // 球を並べず、輪切りを積んだ1本の角柱で作る。稜線が通るので、
  // 尻から腰へ絞る流れがそのまま輪郭に出る(球だと必ず丸の連なりになる)
  rig.pelvis.add(
    place(
      kit.hull(
        [
          { y: 0, r: 0.16, rz: 0.15 },
          { y: 0.14, r: 0.26, rz: 0.22, ridge: 0.25 },
          { y: 0.34, r: 0.31, rz: 0.28, ridge: 0.3, keel: 0.15 },
          { y: 0.56, r: 0.27, rz: 0.27, ridge: 0.25, keel: 0.2 },
          { y: 0.7, r: 0.22, rz: 0.24 },
        ],
        "hide",
        p.main,
        { sides: 8 },
      ),
      0,
      0,
      0.34,
      -Math.PI / 2,
      0,
      0,
    ),
  );
  // 腿の付け根。腰の角柱から外へ張り出す面。丸ではなく面で受ける
  for (const side of [-1, 1]) {
    rig.pelvis.add(
      place(
        kit.hull(
          [
            { y: 0, r: 0.08, rz: 0.12 },
            { y: 0.09, r: 0.17, rz: 0.23 },
            { y: 0.2, r: 0.13, rz: 0.18 },
          ],
          "hide",
          p.main,
          { sides: 6 },
        ),
        side * 0.19,
        -0.01,
        0.1,
        0,
        0,
        side * 1.35,
      ),
    );
  }

  // --- 後脚(体重を支える形。腿を太く、足先を大きく) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.29, r0: 0.19, r1: 0.125, rot: [0.66, 0, 0], radial: 8 },
        { len: 0.27, r0: 0.125, r1: 0.082, rot: [-1.32, 0, 0], radial: 8 },
        { len: 0.19, r0: 0.082, r1: 0.066, rot: [0.86, 0, 0], radial: 8 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.23, -0.01, 0.12);
    addJoint(kit, leg.joints[1], 0, 0.1, true);
    leg.tip.add(place(kit.ball(0.11, 0.06, 0.17, "hide", p.dark), 0, -0.02, -0.06));
    addClaws(kit, leg.tip, 3, 0.17, 0.033, 0.075);
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.9));
  }

  // --- 胴(前が重い三角形。胸を深く、腹を絞る) ---
  const torso = rig.torso;
  place(torso, 0, 0.08, -0.6, 0.04, 0, 0);
  // 胴は1本の面取り角柱。輪切りの半径を変えるだけで
  // 「腰で締まり、肋で深く、肩で重い」が連続した輪郭として出る。
  // 球を5つ並べていた時は、どの断面も円だったので必ず数珠になっていた。
  //   keel(前=回した後は下) 腹の合わせ目 / ridge(後=上) 背の峰
  torso.add(
    place(
      kit.hull(
        [
          { y: 0, r: 0.18, rz: 0.19 },
          { y: 0.16, r: 0.21, rz: 0.22, ridge: 0.2, keel: 0.12 },
          // くびれ。ここが細いほど、次の肋の深さが効く
          { y: 0.34, r: 0.165, rz: 0.2, ridge: 0.3, keel: 0.22 },
          { y: 0.54, r: 0.26, rz: 0.34, ridge: 0.34, keel: 0.36 },
          // 胸のいちばん深いところ
          { y: 0.72, r: 0.33, rz: 0.46, ridge: 0.28, keel: 0.46 },
          { y: 0.88, r: 0.35, rz: 0.42, ridge: 0.18, keel: 0.3 },
          { y: 1.02, r: 0.26, rz: 0.3, keel: 0.24 },
          { y: 1.12, r: 0.15, rz: 0.18 },
        ],
        "hide",
        p.main,
        { sides: 8 },
      ),
      0,
      0,
      0.46,
      -Math.PI / 2,
      0,
      0,
    ),
  );
  // 腹の積層板。1枚ずつ縁が立ち、下の板に次が被さる。
  // 水平な胴の腹に貼るので、板の厚みが上(体の中)へ向くよう
  // (X:+90度, Y:180度)で寝かせる。y0が胸側、y1が腰側
  torso.add(
    place(
      kit.plateStack("plate", p.plate, {
        count: 9,
        y0: 0,
        y1: 0.72,
        // 板の面は腹の線をなぞる。胸側が深く下がっているので、その分だけ下げる
        z: -0.38,
        zEnd: 0.02,
        width: 0.27,
        widthEnd: 0.16,
        height: 0.13,
        heightEnd: 0.09,
        thickness: 0.026,
        // 腹の合わせ目は稜線なので、板もきつく折る(緩いと板が浮いて見える)
        wrap: 0.2,
        wrapEnd: 0.15,
        notch: 0.5,
      }),
      0,
      -0.2,
      -0.24,
      Math.PI / 2,
      Math.PI,
      0,
    ),
  );

  // --- 肩。上半身に質量を寄せる。腰との差が「細い腰と重い肩」になる ---
  for (const side of [-1, 1]) {
    torso.add(
      place(
        kit.hull(
          [
            { y: 0, r: 0.09, rz: 0.14 },
            { y: 0.1, r: 0.19, rz: 0.26, keel: 0.2 },
            { y: 0.26, r: 0.15, rz: 0.2 },
          ],
          "hide",
          p.main,
          { sides: 6 },
        ),
        side * 0.22,
        0.12,
        -0.24,
        0.2,
        0,
        side * 1.3,
      ),
    );
    // 肩の結晶の房。大小と向きを散らして群れにする。均等に生やすと櫛になる。
    // 細く長いと針山になるので、太く短く、根元を寄せる
    const cluster = kit.shardCluster("crystal", p.accent, {
      count: 6,
      length: 0.26,
      radius: 0.085,
      spread: 0.8,
      scatter: 0.09,
      minScale: 0.35,
    });
    place(cluster, side * 0.3, 0.2, -0.2, -0.35, 0, side * 0.85);
    torso.add(cluster);
    // 肘の房。硬いものは末端にも結晶を持つ
    const elbow = kit.shardCluster("crystal", p.accent, {
      count: 3,
      length: 0.14,
      radius: 0.05,
      spread: 0.7,
      scatter: 0.04,
      minScale: 0.45,
    });
    place(elbow, side * 0.3, -0.12, -0.24, -0.2, 0, side * 1.5);
    torso.add(elbow);
  }

  // --- 前脚(後脚より短く、まっすぐ下ろす) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.27, r0: 0.15, r1: 0.097, rot: [0.16, 0, side * 0.05], radial: 7, facet: true },
        { len: 0.24, r0: 0.097, r1: 0.07, rot: [-0.26, 0, 0], radial: 6, facet: true },
        { len: 0.12, r0: 0.07, r1: 0.058, rot: [0.2, 0, 0], radial: 6, facet: true },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.24, -0.04, -0.3);
    addJoint(kit, leg.joints[1], 0, 0.08, true);
    leg.tip.add(place(kit.ball(0.09, 0.05, 0.14, "hide", p.dark), 0, -0.02, -0.05));
    addClaws(kit, leg.tip, 3, 0.15, 0.03, 0.065);
    torso.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.5, true));
  }

  // --- 首(S字。ここがドラゴンらしさの本体) ---
  // 狼は首を前へ低く送り出すが、ドラゴンは一度下げてから跳ね上げる。
  // 頭が肩より高く来ることで、見上げる相手という関係が生まれる
  place(rig.neck, 0, 0.28, -0.34, -0.5, 0, 0);
  // 首も角柱。断面の中心をずらして S 字を作るので、円錐を継ぐ必要がない。
  // ridge が背側(+Z)の稜線を立て、首の峰が1本通る
  rig.neck.add(
    kit.hull(
      [
        { y: 0, r: 0.22, rz: 0.23 },
        { y: 0.16, r: 0.185, rz: 0.2, z: 0.06, ridge: 0.2 },
        { y: 0.34, r: 0.15, rz: 0.16, z: 0.08, ridge: 0.26 },
        { y: 0.52, r: 0.132, rz: 0.145, z: 0.04, ridge: 0.24 },
        { y: 0.68, r: 0.125, rz: 0.14, z: -0.06, ridge: 0.18 },
        { y: 0.8, r: 0.12, rz: 0.135, z: -0.16, ridge: 0.12 },
      ],
      "hide",
      p.main,
      { sides: 8, capTop: false },
    ),
  );
  // 喉の積層板。首の前面を横帯で刻む。1枚ずつ縁が立つので、
  // 遠目でも首の太さと向きが読める
  rig.neck.add(
    place(
      kit.plateStack("plate", p.plate, {
        count: 8,
        y0: 0,
        y1: 0.6,
        z: -0.02,
        zEnd: 0.04,
        width: 0.2,
        widthEnd: 0.12,
        height: 0.11,
        heightEnd: 0.08,
        thickness: 0.022,
        wrap: 0.2,
        wrapEnd: 0.15,
        notch: 0.35,
      }),
      0,
      0.1,
      -0.16,
      -0.28,
      0,
      0,
    ),
  );

  // --- 背の峰。棒の棘を並べると櫛の歯になるので、縁の立った板を並べる ---
  // [背の稜線のz, その高さ, 板の大きさ] を胴の輪郭に合わせて拾ってある。
  // 板は (Y:90度, Z:180度) で立て、幅が背骨に沿い、尖りが上を向く
  const crestLine: [number, number, number][] = [
    [-0.42, 0.5, 0.6],
    [-0.28, 0.58, 1.0],
    [-0.14, 0.53, 0.94],
    [0.0, 0.42, 0.78],
    [0.13, 0.31, 0.6],
    [0.25, 0.27, 0.46],
    [0.37, 0.25, 0.32],
  ];
  for (const [z, y, scale] of crestLine) {
    const height = 0.09 + scale * 0.2;
    const fin = kit.plate(0.1 + scale * 0.09, height, 0.028, "plate", p.plate, { notch: 0.75, shoulder: 0.62 });
    place(fin, 0, y + height * 0.32, z, 0, Math.PI / 2, Math.PI);
    torso.add(fin);
  }
  // 背の峰の根元に結晶の房。左右に散らして、峰が一列の櫛に見えないようにする
  for (const side of [-1, 1]) {
    const cluster = kit.shardCluster("crystal", p.accent, {
      count: 4,
      length: 0.2,
      radius: 0.038,
      spread: 0.85,
      scatter: 0.08,
    });
    place(cluster, side * 0.1, 0.42, -0.06, 0.35, 0, side * 0.7);
    torso.add(cluster);
  }
  // 首の峰。胴から続く同じ形を、細くしながら頭まで送る
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const height = 0.15 - t * 0.06;
    const fin = kit.plate(0.09 - t * 0.02, height, 0.022, "plate", p.plate, { notch: 0.7, shoulder: 0.62 });
    // 首の背の稜線(zが 0.29 から 0.02 へ回り込む)に沿わせ、尖りを後ろへ倒す
    place(fin, 0, 0.16 + t * 0.58, 0.29 - t * 0.27 + height * 0.2, 0.45, Math.PI / 2, Math.PI);
    rig.neck.add(fin);
  }

  // --- 頭(長い口先、後ろへ流れる角) ---
  // 頭が小さいと、長い首と相まってリャマや馬の輪郭になる。
  // 首の太さに負けない大きさまで頭蓋を上げ、口先も長く取る
  place(rig.head, 0, 0.82, -0.16, 0.62, 0, 0);
  addBeastHead(kit, rig, { skull: [0.28, 0.26, 0.35], snout: 0.50, jaw: true, horns: "swept", crest: 4, eye: 0.072, slit: 0.34 });
  // 頬の張り出し。口先の細さと対比させて、噛む力があるように見せる
  for (const side of [-1, 1]) {
    rig.head.add(place(kit.lens(0.1, 0.13, 0.07, "plate", p.plate, 8), side * 0.19, 0.15, 0.02, 0, 0, side * 0.3));
  }
  // 後頭部から伸びる2本の大角。横から見たときの輪郭を、獣ではなく竜側へ寄せる
  for (const side of [-1, 1]) {
    rig.head.add(
      place(
        kit.taperedTube(
          [
            { x: 0, y: 0, z: 0 },
            { x: side * 0.06, y: 0.14, z: 0.16 },
            { x: side * 0.16, y: 0.2, z: 0.34 },
          ],
          0.05,
          0.01,
          "plate",
          p.plate,
          6,
          8,
        ),
        side * 0.11,
        0.22,
        0.12,
      ),
    );
  }

  // 胴より長い尾。先に刃を付けて、ただの紐に見えないようにする
  addTail(kit, rig, [0, 0.06, 0.26], 6, 0.28, 0.11, -1.0, -0.08, true, { hard: true, rings: true });

  rig.wingAnchor.set(0.26, 0.42, -0.1);

  rig.anim = {
    idleSpeed: 0.75,
    breath: 1.5,
    bob: 0.04,
    headSway: 1.1,
    tailWave: 1.3,
    wingFlap: 0.55,
    sway: 0.7,
    lunge: 1.3,
    squash: 0,
    attack: "breath",
    accent: "roar",
  };
}

// ---------------------------------------------------------------------------
// griffon: グリフォン
// ---------------------------------------------------------------------------

/**
 * 羽根を扇状に並べる。冠羽・首の蓑毛・脚の飾り羽など、
 * 「毛の房(addFurTuft)」では鳥に見えない場所に使う。
 * 針状の棘ではなく面積のある板を重ねることで、羽毛の層として読める。
 */
function addFeatherFan(
  kit: CreatureKit,
  parent: THREE.Object3D,
  count: number,
  length: number,
  origin: [number, number, number],
  spread: number,
  aim: [number, number, number],
  fan = 0.9,
): void {
  const p = kit.palette;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const len = length * (1 - Math.abs(t) * 0.3);
    const feather = kit.feather(len, len * 0.3, "fur", p.fur, 0.12);
    place(
      feather,
      origin[0] + t * spread,
      origin[1],
      origin[2] + Math.abs(t) * spread * 0.22,
      aim[0],
      aim[1],
      aim[2] + t * fan,
    );
    parent.add(feather);
  }
}

/**
 * 猛禽の足。
 *
 * 獣の足(丸い肉球+短い爪)と鳥の足を分けているのは、指の長さと配置。
 * 前3本・後ろ1本の長い指を鱗の管で作り、その先に鉤爪を付けることで、
 * 同じ四足でも前脚だけが「掴む脚」に見えるようにする。
 */
function addTalonFoot(kit: CreatureKit, foot: THREE.Object3D, scale: number): void {
  const p = kit.palette;
  const S = scale;
  // 踵(足首)の塊。指の付け根が1点に集まるのを隠す
  foot.add(place(kit.ball(0.06 * S, 0.055 * S, 0.07 * S, "plate", p.plate, 8), 0, -0.02 * S, -0.01 * S));

  // 前3本 + 後ろ1本。後ろ指(蹴爪)は短く、掴む形の要になる
  const toes: { yaw: number; len: number; claw: number }[] = [
    { yaw: -0.62, len: 0.9, claw: 0.9 },
    { yaw: 0, len: 1, claw: 1 },
    { yaw: 0.62, len: 0.9, claw: 0.9 },
    { yaw: Math.PI, len: 0.62, claw: 0.85 },
  ];
  for (const toe of toes) {
    const group = new THREE.Group();
    place(group, 0, -0.03 * S, 0, 0, toe.yaw, 0);
    group.add(
      kit.taperedTube(
        [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: -0.035 * S, z: -0.10 * S * toe.len },
          { x: 0, y: -0.065 * S, z: -0.19 * S * toe.len },
        ],
        0.042 * S,
        0.026 * S,
        "plate",
        p.plate,
        5,
        6,
      ),
    );
    // 鉤爪。前へ出しながら下へ巻き込む向きに倒す
    group.add(
      place(
        kit.claw(0.15 * S * toe.claw, 0.03 * S, 0.9, "plate", p.plate),
        0,
        -0.07 * S,
        -0.19 * S * toe.len,
        -2.15,
        0,
        0,
      ),
    );
    foot.add(group);
  }
}

/**
 * グリフォン(SR)。
 *
 * 役割はアタッカーだが、四足獣の既定骨格をそのまま使うと狼やドラゴンと
 * 同じ「胴が水平で首が前へ低く出た獣」になってしまう。
 * 鷲の上半身とライオンの下半身が継ぎ目で入れ替わることが唯一の特徴なので、
 * 次の4点で前後を描き分ける。
 *
 *   1. 前脚を長くまっすぐ、後脚を折り畳んだ獣脚にして、肩を腰よりはっきり高くする
 *   2. 前脚の先は肉球ではなく、指の長い猛禽の足にする
 *   3. 胸から前を羽毛(fur)、腰から後ろを毛皮(hide)に材質ごと切り替える
 *   4. 首を立ててくちばしの頭を高く掲げ、尾はライオンの「細い紐+先の房」にする
 *
 * 羽毛の翼と冠羽は、以前は TEMPLATE_TRAITS.griffon が役割骨格へ足していたが、
 * 肩の位置ごとこちらで決めるためビルダー側へ取り込んだ(traits 側からは削除済み)。
 */
function buildGriffon(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  // 前半身は羽毛、後半身は毛皮。鱗の材質と取り違えないよう肌質を毛に固定する
  kit.skin = "pelt";
  rig.yawBias = 0.36;
  rig.pelvis.position.y = 0.92;

  // --- 腰(ライオン。後ろは低く、腿の塊で幅を出す) ---
  rig.pelvis.add(
    place(
      kit.hull(
        [
          { y: 0, r: 0.11, rz: 0.11 },
          { y: 0.14, r: 0.19, rz: 0.19 },
          { y: 0.34, r: 0.23, rz: 0.25, ridge: 0.14 },
          { y: 0.52, r: 0.2, rz: 0.23 },
        ],
        "hide",
        p.main,
        { sides: 10 },
      ),
      0,
      0,
      0.32,
      -Math.PI / 2,
      0,
      0,
    ),
  );
  // 腿の張り。丸い塊で覆うと脚が埋もれるので、外側へ寄せて縦長に取る
  for (const side of [-1, 1]) {
    rig.pelvis.add(place(kit.ball(0.13, 0.20, 0.21, "hide", p.main), side * 0.21, -0.04, 0.08));
  }
  // 腰の毛並み。後半身が獣であることを、輪郭の毛羽立ちで伝える
  for (const side of [-1, 1]) {
    addFurTuft(kit, rig.pelvis, 3, 0.07, 0.24, [side * 0.20, 0.02, 0.18], 0.12, [2.0, 0, side * 0.6]);
  }

  // --- 後脚(獣脚。深く折り畳んで、前脚との高さの差を作る) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.36, r0: 0.18, r1: 0.115, rot: [0.62, 0, 0], radial: 7 },
        { len: 0.34, r0: 0.105, r1: 0.075, rot: [-1.26, 0, 0], radial: 7 },
        { len: 0.23, r0: 0.072, r1: 0.058, rot: [0.80, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.20, -0.02, 0.11);
    addJoint(kit, leg.joints[1], 0, 0.085, false);
    // 肉球のある獣の足。前脚(猛禽の足)との違いがここで出る
    leg.tip.add(place(kit.ball(0.095, 0.055, 0.14, "hide", p.dark), 0, -0.02, -0.05));
    addClaws(kit, leg.tip, 3, 0.12, 0.026, 0.06);
    addFurTuft(kit, leg.joints[0], 3, 0.08, 0.30, [0, -0.16, 0.09], 0.13, [1.95, 0, 0]);
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.9));
  }

  // --- 胴(前が高く、後ろへ落ちる。継ぎ目で材質が入れ替わる) ---
  const torso = rig.torso;
  // rotation.x を正に取ると前(-Z)が持ち上がる。鷲の胸を高く構える
  place(torso, 0, 0.02, -0.52, 0.20, 0, 0);
  // 胴は輪切りを積んだ1本。獣と鷲で材質が入れ替わるので2本に割るが、
  // 継ぎ目は背の飾り羽で隠れる。球を並べていた時のような
  // 「丸の連なり」にならず、腰から胸へ持ち上がる流れが輪郭に出る。
  // 面の数は多め(10)。鳥と獣なので、竜のように角張らせてはいけない
  torso.add(
    place(
      kit.hull(
        [
          { y: 0, r: 0.14, rz: 0.14 },
          { y: 0.13, r: 0.21, rz: 0.23, ridge: 0.12 },
          { y: 0.28, r: 0.23, rz: 0.24, keel: 0.16 },
          { y: 0.44, r: 0.25, rz: 0.26, keel: 0.24, ridge: 0.1 },
        ],
        "hide",
        p.main,
        { sides: 10, capTop: false },
      ),
      0,
      0,
      0.35,
      -Math.PI / 2,
      0,
      0,
    ),
  );
  // 前半身(鷲)。胸を深く前へ張り出させ、竜骨のように下へ落とす
  torso.add(
    place(
      kit.hull(
        [
          { y: 0.4, r: 0.25, rz: 0.26, keel: 0.22, ridge: 0.1 },
          { y: 0.54, r: 0.28, rz: 0.3, keel: 0.36 },
          { y: 0.66, r: 0.29, rz: 0.33, keel: 0.46 },
          { y: 0.78, r: 0.24, rz: 0.29, keel: 0.4 },
          { y: 0.88, r: 0.14, rz: 0.19, keel: 0.2 },
        ],
        "fur",
        p.fur,
        { sides: 10, capBottom: false },
      ),
      0,
      0,
      0.35,
      -Math.PI / 2,
      0,
      0,
    ),
  );
  for (const side of [-1, 1]) {
    torso.add(place(kit.ball(0.14, 0.19, 0.20, "fur", p.fur), side * 0.25, 0.10, -0.20));
  }
  // 胸の羽毛。小さな板を段違いに重ね、面ではなく層として見せる
  for (let row = 0; row < 3; row++) {
    const y = 0.10 - row * 0.14;
    for (let i = 0; i < 5; i++) {
      const t = i / 4 - 0.5;
      const feather = kit.feather(0.17, 0.055, "fur", row % 2 === 0 ? p.fur : p.main, 0.1);
      place(feather, t * 0.26, y, -0.40 + Math.abs(t) * 0.10, 3.0, -t * 0.5, t * 0.35);
      torso.add(feather);
    }
  }
  // 背の継ぎ目。羽毛と毛皮の境目に飾り羽を寝かせ、前後が入れ替わる位置を示す
  addFeatherFan(kit, torso, 5, 0.26, [0, 0.22, -0.06], 0.22, [1.5, Math.PI / 2, 0], 0.5);

  // --- 前脚(鷲。後脚より長く伸ばし、肩を腰より高く保つ) ---
  // 鳥の脚は膝が後ろへ折れる。腿を前へ、足根を後ろへ振ってZ字を作ると、
  // 同じ四足でも前だけが「鳥の脚」に見える
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.42, r0: 0.17, r1: 0.115, rot: [0.10, 0, side * 0.04], radial: 7 },
        // 足根(かかとから下)は鱗。羽毛の腿との材質差で鳥の脚に見える
        { len: 0.46, r0: 0.095, r1: 0.07, rot: [-0.42, 0, 0], radial: 7, style: "plate", color: p.plate },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.23, -0.02, -0.28);
    // 腿を覆う飾り羽。鱗の脛との段差が「鳥のズボン」になる
    addFeatherFan(kit, leg.joints[0], 5, 0.34, [0, -0.14, 0.04], 0.16, [2.75, 0, 0], 0.7);
    // 足根の鱗の節
    for (let i = 0; i < 5; i++) {
      leg.joints[1].add(place(kit.band(0.085 - i * 0.005, 0.014, Math.PI * 2, "plate", p.plate, 8), 0, -0.06 - i * 0.075, 0, Math.PI / 2, 0, 0));
    }
    addTalonFoot(kit, leg.tip, 1.1);
    torso.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.5, true));
  }

  // --- 首(立てて頭を肩より高く。付け根に蓑毛の襟) ---
  place(rig.neck, 0, 0.26, -0.40, -0.16, 0, 0);
  rig.neck.add(
    kit.taperedTube(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0.16, z: -0.04 },
        { x: 0, y: 0.30, z: -0.02 },
      ],
      0.18,
      0.115,
      "fur",
      p.fur,
      7,
      6,
    ),
  );
  // 蓑毛。首の付け根を1周する羽根の襟で、鷲の頭と胴を繋ぐ。
  // 長さと色を1枚おきに変えると、板の重なりが層として読める
  for (let i = 0; i < 13; i++) {
    const angle = (i / 13) * Math.PI * 2;
    const len = 0.34 - Math.cos(angle) * 0.08;
    const feather = kit.feather(len, len * 0.4, "fur", i % 2 === 0 ? p.fur : p.main, 0.14);
    place(
      feather,
      Math.sin(angle) * 0.14,
      0.06,
      Math.cos(angle) * 0.14,
      Math.PI * 0.74 + Math.cos(angle) * 0.35,
      0,
      -Math.sin(angle) * 1.2,
    );
    rig.neck.add(feather);
  }

  // --- 頭(くちばしのある鳥の頭) ---
  // 頭が小さいと、首の細い水鳥になってしまう。胸の塊に対して
  // 「掴めそうな大きさ」まで頭蓋を取り、くちばしもそれに見合う長さにする
  place(rig.head, 0, 0.30, -0.02, 0.1, 0, 0);
  const head = rig.head;
  head.add(place(kit.ball(0.23, 0.215, 0.24, "fur", p.fur), 0, 0.14, 0.03));
  // 後頭部。1つの球で終わらせると、真横から見た時に風船になる
  head.add(place(kit.ball(0.19, 0.18, 0.16, "fur", p.fur, 12), 0, 0.16, 0.19));
  // 眼窩の丘。猛禽は目の上の骨が前へ張り出していて、そこが「睨み」を作る。
  // 平らな庇を1枚渡すと鴨のくちばしに見えるので、左右別々の塊にする
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(0.105, 0.1, 0.11, "fur", p.fur, 10), side * 0.095, 0.185, -0.16));
    head.add(
      place(kit.lens(0.105, 0.036, 0.08, "plate", p.plate, 10), side * 0.1, 0.255, -0.185, -0.52, 0, -side * 0.46),
    );
  }
  // 猛禽の目は横ではなく**前**を向く。外へ回すと、頭の左右に目玉が乗った蛙になる
  addFaceEyes(kit, head, { x: 0.1, y: 0.19, z: -0.235, size: 0.062, mood: "fierce", splay: 0.2, skin: p.fur });
  // 蝋膜(くちばしの付け根)と鼻孔
  head.add(place(kit.ball(0.085, 0.085, 0.075, "plate", p.plate, 8), 0, 0.13, -0.19));
  for (const side of [-1, 1]) {
    head.add(place(kit.lens(0.018, 0.022, 0.014, "hide", p.deep, 6), side * 0.042, 0.15, -0.25));
  }
  // くちばし。**横に潰す**のが要。円い断面のまま伸ばすと鴨の平たい嘴になる。
  // 上嘴は根元が深く、先で下へ巻き込む
  const beak = new THREE.Group();
  place(beak, 0, 0.13, -0.21);
  beak.scale.set(0.62, 1, 1);
  beak.add(place(kit.claw(0.27, 0.125, 0.52, "plate", p.plate), 0, 0, 0, AIM_FORWARD - 0.04, 0, 0));
  head.add(beak);
  // 嘴の稜線。上面に硬い筋を1本通すと、面が割れて厚みが出る
  head.add(
    kit.taperedTube(
      [
        { x: 0, y: 0.19, z: -0.18 },
        { x: 0, y: 0.17, z: -0.3 },
        { x: 0, y: 0.11, z: -0.4 },
      ],
      0.026,
      0.008,
      "plate",
      p.plate,
      5,
      8,
    ),
  );
  // 口の合わせ目。嘴が「上下2枚」であることが分かるだけで、造形が締まる
  for (const side of [-1, 1]) {
    head.add(
      kit.taperedTube(
        [
          { x: side * 0.055, y: 0.1, z: -0.2 },
          { x: side * 0.04, y: 0.09, z: -0.29 },
          { x: side * 0.016, y: 0.06, z: -0.36 },
        ],
        0.016,
        0.005,
        "hide",
        p.deep,
        5,
        8,
      ),
    );
  }
  // 下くちばし。開閉できるよう顎として登録する
  const jaw = new THREE.Group();
  place(jaw, 0, 0.09, -0.17);
  markAnimated(jaw);
  const lower = new THREE.Group();
  lower.scale.set(0.62, 1, 1);
  lower.add(
    kit.taperedTube(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: -0.012, z: -0.11 },
        { x: 0, y: -0.045, z: -0.21 },
      ],
      0.1,
      0.028,
      "plate",
      p.plate,
      6,
      8,
    ),
  );
  jaw.add(lower);
  head.add(jaw);
  rig.jaw = jaw;
  // 冠羽。後頭部から後ろへ倒して流す
  addFeatherFan(kit, head, 5, 0.36, [0, 0.26, 0.14], 0.19, [1.5, Math.PI / 2, 0], 0.6);
  // 頬の羽毛。細いくちばしとの対比で顔幅を作る。
  // 前へ倒すと顔の前に板が渡って、目もくちばしも隠れる(実際にそうなっていた)
  for (const side of [-1, 1]) {
    addFeatherFan(kit, head, 3, 0.22, [side * 0.19, 0.1, 0.06], 0.07, [2.75, -side * 1.15, 0], 0.4);
  }

  // --- 翼(羽毛) ---
  // 水平に張ると、板を貼った標本のように見えるうえ横幅も食う。
  // 前縁を上へ起こし(Z回転)ながら後ろへ流すと、肩の上に山ができて
  // 四足の胴の輪郭を消さずに「飛べる獣」だと分かる。
  // 羽根の枚数を増やさないと、櫛の歯のように隙間が空いて面にならない
  rig.wingAnchor.set(0.22, 0.24, -0.12);
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    markAnimated(wing);
    place(wing, side * 0.24, 0.24, -0.12, 0.16, -side * 0.58, side * 0.34);
    addFeatherWing(kit, wing, side, 14, 1.2);
    torso.add(wing);
    rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
  }

  // --- 尾(ライオン。細い紐の先にだけ房を付ける) ---
  const tail = kit.chain(
    [
      { len: 0.24, r0: 0.075, r1: 0.06, rot: [-0.95, 0, 0], radial: 6 },
      { len: 0.23, r0: 0.06, r1: 0.05, rot: [-0.20, 0, 0], radial: 6 },
      { len: 0.22, r0: 0.05, r1: 0.04, rot: [0.34, 0, 0], radial: 6 },
      { len: 0.20, r0: 0.04, r1: 0.032, rot: [0.46, 0, 0], radial: 6 },
    ],
    "hide",
    p.main,
  );
  tail.root.position.set(0, 0.06, 0.26);
  markAnimated(...tail.joints);
  for (let i = 0; i < tail.joints.length; i++) {
    rig.tail.push({ group: tail.joints[i], rest: tail.rests[i] });
  }
  // 先端の房。ライオンの尾は、この一房があるかどうかで決まる
  for (let k = 0; k < 7; k++) {
    const angle = (k / 7) * Math.PI * 2 + 0.4;
    const hair = kit.spike(0.065, 0.34 - Math.abs(Math.sin(k * 1.7)) * 0.07, 0.85, "fur", p.fur);
    place(hair, Math.cos(angle) * 0.04, 0.02, Math.sin(angle) * 0.04, Math.PI - 0.18, 0, Math.cos(angle) * 0.5);
    tail.tip.add(hair);
  }
  rig.pelvis.add(tail.root);

  rig.anim = {
    idleSpeed: 1.35,
    breath: 0.9,
    bob: 0.034,
    headSway: 1.3,
    tailWave: 1.5,
    wingFlap: 0.9,
    sway: 0.9,
    lunge: 1.7,
    squash: 0,
    attack: "swipe",
    accent: "wingRuffle",
  };
}

// ---------------------------------------------------------------------------
// ancient_crystal_curse: 古代の呪晶
// ---------------------------------------------------------------------------

/**
 * 古代の呪晶。
 *
 * 名前のとおり結晶なのに、役割(デバッファー)の骨格をそのまま使っていたため
 * 「棘の生えた人型」になり、対になる「古代のクリスタル」と同じ一族に見えなかった。
 *
 * 支援側と同じ語彙(八面体・金属の締め輪・漂う小結晶)で組みつつ、
 * 次の3点で「攻める側」へ振る。
 *   1. 核を左右に割り、あいだから光を覗かせる(支援側は無傷な一本の尖塔)
 *   2. 腕のかわりに、前方へ突き出した刃の破片を並べる
 *   3. 上下を逆さにした棘の冠で、支援側の整った冠と対比させる
 * 本体を縛る拘束環は TEMPLATE_TRAITS.ancient_crystal_curse 側が足す。
 */
function buildAncientCrystalCurse(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.floats = true;
  rig.pelvis.position.y = 1.0;

  // --- 下へ垂れる尖塔。支援側と違い、途中で折れて段がずれている ---
  const stack: [number, number, number, number][] = [
    [0.24, 0.28, 0.24, 0.0],
    [0.15, 0.22, 0.15, 0.16],
    [0.09, 0.14, 0.09, -0.22],
  ];
  stack.forEach(([rx, ry, rz, lean], index) => {
    const shard = kit.octa(rx, ry, rz, "crystal", p.dark);
    place(shard, lean * 0.4, -0.16 - index * 0.28, 0, 0, index * 0.6, lean);
    rig.pelvis.add(shard);
  });

  // --- 胴。核を左右へ割り、あいだに光の筋を通す ---
  const torso = rig.torso;
  place(torso, 0, 0.22, 0);
  for (const side of [-1, 1]) {
    torso.add(place(kit.octa(0.24, 0.54, 0.26, "crystal", p.main), side * 0.19, 0.1, 0, 0, 0, side * 0.2));
  }
  // 割れ目の光。面積を小さく保ち、加算エフェクトと重なっても白飛びさせない
  torso.add(place(kit.octa(0.06, 0.38, 0.07, "glow", p.glow), 0, 0.1, 0));
  torso.add(place(kit.octa(0.19, 0.28, 0.2, "crystal", p.accent), 0, 0.02, -0.16, 0, 0.6, 0));
  // 割れた核を後ろから抱える枠。支援側の枠が「支える」のに対し、こちらは「押さえ込む」
  for (const side of [-1, 1]) {
    torso.add(
      place(
        kit.taperedTube(
          [
            { x: side * 0.08, y: 0.46, z: 0.1 },
            { x: side * 0.34, y: 0.12, z: 0.14 },
            { x: side * 0.2, y: -0.2, z: 0.06 },
          ],
          0.032,
          0.02,
          "metal",
          p.metal,
          5,
          8,
        ),
        0,
        0,
        0,
      ),
    );
  }

  // --- 前方へ突き出した刃の破片。支援側の「漂う腕」に対応する位置に置く ---
  const bladeSpecs = [
    { y: 0.4, x: 0.44, tilt: 0.5, len: 0.52 },
    { y: -0.04, x: 0.34, tilt: -0.3, len: 0.4 },
  ];
  for (const side of [-1, 1]) {
    bladeSpecs.forEach((spec, index) => {
      const blade = new THREE.Group();
      markAnimated(blade);
      place(blade, side * spec.x, spec.y, -0.04, 0, 0, -side * spec.tilt);
      blade.add(place(kit.octa(0.09, 0.13, 0.08, "crystal", p.accent), 0, 0, 0));
      // 刃は斜め前へ振り出す。まっすぐ前(-Z)へ向けると正面から見て潰れ、
      // 輪郭に出ないため「刃を構えている」ことが読めなくなる
      blade.add(
        place(
          kit.spike(0.075, spec.len, 0.3, "crystal", p.main, 4),
          side * spec.len * 0.3,
          -0.02,
          -spec.len * 0.42,
          -1.05,
          0,
          side * 1.0,
        ),
      );
      torso.add(blade);
      rig.arms.push({
        root: blade,
        rootRest: blade.rotation.clone(),
        lower: null,
        lowerRest: null,
        tip: blade,
        side,
        phase: side * (1.2 + index * 0.6),
      });
    });
  }

  // --- 頭。支援側の単眼に対し、こちらは横に裂けた三つ目 ---
  place(rig.neck, 0, 0.6, 0);
  place(rig.head, 0, 0.16, 0);
  rig.head.add(place(kit.octa(0.2, 0.18, 0.2, "crystal", p.plate), 0, 0, 0));
  rig.head.add(place(kit.band(0.21, 0.024, Math.PI * 2, "metal", p.metal, 14), 0, 0, 0, 0.35, 0, 0));
  for (let i = 0; i < 3; i++) {
    rig.head.add(place(kit.ball(0.035, 0.022, 0.02, "glow", p.glow, 8), (i - 1) * 0.09, 0.01, -0.19));
  }
  // 逆さの棘の冠。支援側は上向きに整列しているので、向きだけで敵味方の質が変わる
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const spike = kit.octa(0.035, 0.16, 0.035, "crystal", p.accent);
    place(spike, (t - 0.5) * 0.3, 0.2, 0.04, Math.PI + (t - 0.5) * 0.7, 0, (t - 0.5) * 1.1);
    rig.head.add(spike);
  }

  // --- 周囲を漂う破片。支援側より数を絞り、鋭く長い形にする ---
  for (let i = 0; i < 4; i++) {
    const shard = kit.octa(0.05, 0.2, 0.05, "crystal", p.dark);
    rig.core.add(shard);
    rig.orbiters.push({
      object: shard,
      radius: 0.95 + (i % 2) * 0.25,
      height: 0.6 + i * 0.35,
      speed: -0.45 - i * 0.06,
      phase: (i / 4) * Math.PI * 2,
      tilt: 0.4,
      spin: 1.4,
    });
  }

  rig.anim = {
    idleSpeed: 0.85,
    breath: 0.35,
    bob: 0.05,
    headSway: 0.3,
    tailWave: 0,
    wingFlap: 0,
    sway: 0.35,
    lunge: 1.0,
    squash: 0,
    attack: "bless",
    accent: "gaze",
  };
}

// ---------------------------------------------------------------------------
// ancient_demon: 古代の魔人
// ---------------------------------------------------------------------------

/**
 * 古代の魔人(装備ダンジョン9・10階の専用ボス)。
 *
 * ボスの役割骨格のままだと、角のある人型に翼という構成がネメシス(魔王)と重なり、
 * 「最終関門の主」なのに見分けが付かなかった。
 *
 * お供2体が結晶であることを手がかりに、同じ一族として次のように振り分ける。
 *   1. 脚を持たせず、下半身を崩れた石塊の尾にして浮かせる
 *      (歩く人型はネメシス側に譲る)
 *   2. 腕を4本にする。ネメシスは両手で大鎌を構えるので、腕の本数で即座に分かれる
 *   3. 胸に結晶の核を露出させ、お供のクリスタルと同じ素材でできていることを示す
 * 顔まわりの呪符と第三の目は TEMPLATE_TRAITS.ancient_demon 側が足す。
 */
function buildAncientDemon(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.floats = true;
  rig.pelvis.position.y = 1.32;

  // --- 下半身。脚ではなく、崩れながら垂れ下がる石塊 ---
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const chunk = kit.rock(0.3 - t * 0.19, 0.22 - t * 0.13, 0.28 - t * 0.18, "plate", t > 0.5 ? p.deep : p.dark, 0.3);
    place(chunk, Math.sin(t * 4.1) * 0.12, -0.1 - t * 0.86, Math.cos(t * 3.3) * 0.08, t * 0.6, t * 1.7, t * 0.5);
    rig.pelvis.add(chunk);
  }
  // 石塊のあいだに覗く光。中身が詰まっていないことを示す
  rig.pelvis.add(place(kit.octa(0.07, 0.4, 0.07, "glow", p.glow), 0, -0.42, 0));

  // --- 胴。肩を大きく張り出させ、胸に結晶の核を埋める ---
  const torso = rig.torso;
  place(torso, 0, 0.12, 0, -0.05, 0, 0);
  torso.add(place(kit.ball(0.42, 0.4, 0.32, "hide", p.main), 0, 0.24, 0));
  torso.add(place(kit.ball(0.3, 0.26, 0.26, "hide", p.dark), 0, -0.06, 0.02));
  addPlating(kit, torso, 4, 0.44, -0.02, 0.3, -0.24, "metal");
  // 胸の核。お供のクリスタルと同じ八面体で、素材の出どころを揃える
  torso.add(place(kit.octa(0.15, 0.22, 0.12, "crystal", p.accent), 0, 0.2, -0.28));
  torso.add(place(kit.octa(0.07, 0.13, 0.06, "glow", p.glow), 0, 0.2, -0.31));
  // 肩の岩塊
  for (const side of [-1, 1]) {
    torso.add(place(kit.rock(0.2, 0.17, 0.19, "plate", p.plate, 0.24), side * 0.44, 0.36, 0));
    for (let i = 0; i < 3; i++) {
      torso.add(
        place(kit.octa(0.04, 0.16, 0.04, "crystal", p.accent), side * (0.4 + i * 0.05), 0.5, (i - 1) * 0.1, 0, 0, side * 0.4),
      );
    }
  }

  // --- 腕4本。上の対を大きく、下の対を小さくして、増えた腕が飾りに見えないようにする ---
  const armSpecs = [
    { y: 0.32, x: 0.46, len: 0.42, radius: 0.115, drop: 0.5, swing: -0.5 },
    { y: -0.02, x: 0.36, len: 0.32, radius: 0.08, drop: 0.9, swing: -0.3 },
  ];
  for (const side of [-1, 1]) {
    armSpecs.forEach((spec, index) => {
      const arm = kit.chain(
        [
          { len: spec.len, r0: spec.radius, r1: spec.radius * 0.72, rot: [spec.swing, 0, side * spec.drop], radial: 7 },
          { len: spec.len * 0.9, r0: spec.radius * 0.72, r1: spec.radius * 0.56, rot: [0.75, 0, -side * 0.3], radial: 7 },
        ],
        "hide",
        p.main,
      );
      arm.root.position.set(side * spec.x, spec.y, 0);
      addJoint(kit, arm.joints[1], 0, spec.radius * 0.85, true);
      addClaws(kit, arm.tip, 3, 0.16 - index * 0.04, 0.028, 0.06);
      torso.add(arm.root);
      rig.arms.push(limbFrom(arm, side, side * (1 + index * 0.8)));
    });
  }

  // --- 首と頭。顔は面で覆い、角を上へ長く伸ばす ---
  place(rig.neck, 0, 0.5, 0);
  rig.neck.add(place(kit.link({ x: 0, y: -0.06, z: 0 }, { x: 0, y: 0.14, z: 0 }, 0.13, 0.11, "hide", p.dark, 8), 0, 0, 0));
  place(rig.head, 0, 0.2, 0);
  rig.head.add(place(kit.ball(0.23, 0.24, 0.23, "hide", p.dark), 0, 0.04, 0));
  // 面。目鼻を作らず、板で塞ぐことで「素顔が無い古い存在」に見せる。
  // 一文字の光だけを残し、発光面積を小さく保って加算エフェクトと喧嘩させない
  rig.head.add(place(kit.lens(0.2, 0.23, 0.1, "metal", p.metal, 10), 0, 0.04, -0.15));
  rig.head.add(place(kit.box(0.19, 0.03, 0.02, "glow", p.glow), 0, 0.06, -0.25));
  // 角。細く長く上へ伸ばすと、遠目には「万歳した腕」に見えてしまう。
  // 太く短く、後ろへ倒して、頭から生えていることが分かる形にする
  for (const side of [-1, 1]) {
    rig.head.add(
      place(
        kit.taperedTube(
          [
            { x: 0, y: 0, z: 0 },
            { x: side * 0.11, y: 0.15, z: 0.14 },
            { x: side * 0.13, y: 0.2, z: 0.34 },
          ],
          0.085,
          0.012,
          "plate",
          p.plate,
          6,
          8,
        ),
        side * 0.14,
        0.14,
        0.04,
      ),
    );
  }

  rig.wingAnchor.set(0.34, 0.46, 0.12);

  rig.anim = {
    idleSpeed: 0.55,
    breath: 0.7,
    bob: 0.07,
    headSway: 0.4,
    tailWave: 0,
    wingFlap: 0,
    sway: 0.4,
    lunge: 0.9,
    squash: 0,
    attack: "cast",
    accent: "gaze",
  };
}

// ---------------------------------------------------------------------------
// seraph: セラフ
// ---------------------------------------------------------------------------

/**
 * セラフ(SR)。
 *
 * 役割はバランス型で、既定の骨格は「剣とマントの人型の戦士」。
 * そこへ翼と光輪だけを足すと、装甲の厚い戦士に羽が生えた姿になり、
 * 同じ人型のネメシス(魔王)と重心も体格もほとんど同じになってしまう。
 *
 * ネメシスが「重い・広い・角がある」なら、セラフは逆側に振り切る。
 *   1. 手足を細く長く取り、肩幅を胸の幅とほぼ同じにして縦線だけの体にする
 *   2. 顔を作らない。目も口も無い一枚の面で覆い、頭の情報を光輪と冠に預ける
 *   3. 剣は刃を下へ向けて構える(魔王は大鎌を上へ、戦士は剣を横に構える)
 *   4. 二対の翼と、背から垂れる長い帯で、静止していても布と羽が動く
 *
 * 翼と光輪は以前 TEMPLATE_TRAITS.seraph が役割骨格へ足していたが、
 * 肩の位置ごとこちらで決めるためビルダー側へ取り込んだ(traits 側からは削除済み)。
 */
function buildSeraph(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.30;

  // --- 腰(細い。重い帯を巻かず、細い環と垂れ布だけで締める) ---
  rig.pelvis.add(place(kit.ball(0.16, 0.15, 0.14, "hide", p.dark), 0, -0.02, 0));
  rig.pelvis.add(place(kit.band(0.165, 0.022, Math.PI * 2, "metal", p.metal, 16), 0, 0.02, 0, Math.PI / 2, 0, 0));
  rig.pelvis.add(place(kit.octa(0.045, 0.07, 0.03, "crystal", p.accent), 0, 0.02, -0.17));
  rig.pelvis.add(place(kit.octa(0.02, 0.035, 0.015, "glow", p.glow), 0, 0.02, -0.18));

  // 前後に垂れる細い布。スカートで一周させると裾が広がって重く見えるので、
  // 板2枚だけを垂らし、その隙間から細い脚を見せる
  for (const [index, dir] of [-1, 1].entries()) {
    const panel = new THREE.Group();
    markAnimated(panel);
    place(panel, 0, -0.04, dir * 0.13, dir > 0 ? -0.12 : 0.12, 0, 0);
    panel.add(
      kit.membrane(
        (shape) => {
          shape.moveTo(-0.17, 0.04);
          shape.lineTo(0.17, 0.04);
          shape.lineTo(0.13, -0.62);
          shape.lineTo(0.0, -0.78);
          shape.lineTo(-0.13, -0.62);
        },
        "cloth",
        p.cloth,
        dir * 0.3,
      ),
    );
    panel.add(place(kit.band(0.15, 0.014, Math.PI * 0.9, "metal", p.metal, 12), 0, -0.6, 0, Math.PI / 2, 0, Math.PI * 1.05));
    rig.pelvis.add(panel);
    rig.cloth.push({ group: panel, rest: panel.rotation.clone(), phase: index * 1.6, amount: 0.7 });
  }

  // --- 脚(細く長い。装甲は膝と脛の細い板だけに留める) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.50, r0: 0.105, r1: 0.08, rot: [0.06, 0, side * 0.05] },
        { len: 0.48, r0: 0.078, r1: 0.058, rot: [-0.10, 0, 0] },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.14, -0.06, 0);
    addJoint(kit, leg.joints[1], 0, 0.075, false);
    leg.joints[1].add(place(kit.lens(0.075, 0.16, 0.07, "metal", p.metal), 0, -0.18, -0.03));
    // 足首から先。細身なので、靴も薄く小さく
    leg.tip.add(place(kit.lens(0.08, 0.05, 0.17, "metal", p.metal), 0, -0.03, -0.04));
    leg.tip.add(place(kit.band(0.075, 0.014, Math.PI * 2, "plate", p.plate, 12), 0, 0.0, 0, Math.PI / 2, 0, 0));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.8));
  }

  // --- 胴(縦に長い。肩を張らず、胸から腰まで一本の線で落とす) ---
  const torso = rig.torso;
  place(torso, 0, 0.04, 0, -0.05, 0, 0);
  torso.add(place(kit.ball(0.145, 0.20, 0.12, "hide", p.main), 0, 0.16, 0));
  torso.add(place(kit.ball(0.22, 0.22, 0.16, "hide", p.main), 0, 0.44, 0));
  // 胸当て。薄い板を3枚だけ重ね、装甲ではなく衣の留め具に見せる
  addPlating(kit, torso, 3, 0.22, 0.50, 0.18, -0.10);
  torso.add(place(kit.lens(0.21, 0.13, 0.09, "metal", p.metal), 0, 0.56, -0.06, -0.12, 0, 0));
  torso.add(place(kit.octa(0.05, 0.08, 0.035, "crystal", p.accent), 0, 0.46, -0.16));
  torso.add(place(kit.octa(0.024, 0.04, 0.018, "glow", p.glow), 0, 0.46, -0.17));
  // 首まわりの襟。細い環を2本重ねるだけに留める
  torso.add(place(kit.band(0.13, 0.018, Math.PI * 2, "metal", p.metal, 14), 0, 0.62, 0, Math.PI / 2, 0, 0));
  torso.add(place(kit.band(0.155, 0.014, Math.PI * 1.2, "plate", p.plate, 14), 0, 0.58, -0.02, Math.PI / 2, -Math.PI * 0.6, 0));

  for (const side of [-1, 1]) {
    // 肩。薄い板1枚と小さな光。魔王の段付き肩当てと面積で差を付ける
    torso.add(place(kit.lens(0.115, 0.075, 0.11, "metal", p.metal), side * 0.25, 0.56, 0, 0, 0, -side * 0.3));
    torso.add(place(kit.octa(0.03, 0.05, 0.025, "crystal", p.accent), side * 0.29, 0.60, 0, 0, 0, -side * 0.4));

    const arm = kit.chain(
      [
        { len: 0.38, r0: 0.075, r1: 0.058, rot: [0.14, 0, side * 0.16] },
        { len: 0.36, r0: 0.056, r1: 0.045, rot: [-0.40, 0, 0] },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.25, 0.50, 0);
    addJoint(kit, arm.joints[1], 0, 0.058, false);
    arm.joints[1].add(place(kit.lens(0.06, 0.12, 0.055, "metal", p.metal), 0, -0.16, -0.02));
    arm.tip.add(place(kit.ball(0.055, 0.055, 0.06, "hide", p.dark), 0, -0.03, 0));

    if (side > 0) {
      // 光の剣。刃を下へ向けて body の前に立てる。
      // 魔王(大鎌を上へ)・戦士(剣を横へ)と、同じ「得物を持つ人型」の中で
      // 構えだけで見分けが付くようにする
      const sword = new THREE.Group();
      // 肩+肘の傾き(約 -0.26 rad)を打ち消し、刃を鉛直に落とす
      place(sword, 0, -0.05, -0.03, 0.26, 0, -side * 0.16);
      sword.add(place(kit.box(0.04, 0.17, 0.04, "cloth", p.dark), 0, 0.07, 0));
      sword.add(place(kit.octa(0.045, 0.055, 0.04, "metal", p.metal), 0, 0.18, 0));
      // 鍔。左右に長く取ると、下向きの刃と十字を作って遠目にも剣と分かる
      sword.add(place(kit.box(0.30, 0.035, 0.05, "metal", p.metal), 0, -0.03, 0));
      for (const dir of [-1, 1]) {
        sword.add(place(kit.octa(0.03, 0.045, 0.025, "crystal", p.accent), dir * 0.17, -0.03, 0));
      }
      sword.add(place(kit.spike(0.065, 0.92, 0.22, "metal", p.metal), 0, -0.06, 0, AIM_DOWN, 0, 0));
      // 刃の中央の光。細い線に留め、加算で重なっても飛ばないようにする
      sword.add(place(kit.box(0.016, 0.62, 0.018, "glow", p.glow), 0, -0.40, 0));
      arm.tip.add(sword);
    }
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.0));
  }

  // --- 背から垂れる長い帯。静止していても布が動き、天使の軽さを出す ---
  for (const [index, side] of [-1, 1].entries()) {
    const ribbon = new THREE.Group();
    markAnimated(ribbon);
    place(ribbon, side * 0.14, 0.58, 0.10, 0.12, 0, side * 0.15);
    ribbon.add(
      kit.membrane(
        (shape) => {
          shape.moveTo(-0.07, 0.02);
          shape.lineTo(0.07, 0.02);
          shape.lineTo(0.10, -0.62);
          shape.lineTo(0.02, -1.02);
          shape.lineTo(-0.06, -0.66);
        },
        "cloth",
        p.cloth,
        side * 0.22,
      ),
    );
    rig.torso.add(ribbon);
    rig.cloth.push({ group: ribbon, rest: ribbon.rotation.clone(), phase: 0.8 + index * 1.4, amount: 1.3 });
  }

  // --- 頭(顔を作らない。のっぺりした面と冠だけで神性を出す) ---
  place(rig.neck, 0, 0.66, -0.01, -0.03, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.12, z: 0 }, 0.065, 0.06, "hide", p.dark));
  place(rig.head, 0, 0.14, 0, 0.04, 0, 0);
  const head = rig.head;
  head.add(place(kit.ball(0.15, 0.17, 0.155, "hide", p.deep), 0, 0.1, 0));
  // 面。頬の高さでわずかに前へ張り出す一枚の板。
  // 発光で潰すと加算演出が乗った時に頭だけ白く飛ぶので、光は縁の細い線だけ
  head.add(place(kit.lens(0.15, 0.185, 0.095, "plate", p.plate, 12), 0, 0.11, -0.06, -0.04, 0, 0));
  // 目。「顔を作らない」は無表情ではなく、ただの卵になる。
  // 伏し目がちの穏やかな目を置いて、そこに神性を宿らせる
  addFaceEyes(kit, head, {
    x: 0.056,
    y: 0.13,
    z: -0.148,
    size: 0.042,
    mood: "gentle",
    splay: 0.22,
    skin: p.plate,
    brow: false,
  });
  // 眉庇の代わりに、額を横切る細い金の帯。塊を置くと瘤に見える
  head.add(place(kit.band(0.085, 0.008, Math.PI * 0.8, "metal", p.metal, 14), 0, 0.175, -0.135, 0.1, 0, Math.PI * 0.1));
  // 鼻梁と、閉じた唇の線。線1本で「静かに黙っている」に変わる
  head.add(place(kit.lens(0.011, 0.032, 0.022, "plate", p.plate, 8), 0, 0.093, -0.152));
  head.add(place(kit.lens(0.026, 0.006, 0.012, "hide", p.dark, 8), 0, 0.055, -0.149));
  head.add(place(kit.band(0.14, 0.013, Math.PI * 1.1, "metal", p.metal, 14), 0, 0.11, -0.11, Math.PI / 2, -Math.PI * 0.55, 0));
  head.add(place(kit.octa(0.03, 0.055, 0.022, "glow", p.glow), 0, 0.215, -0.125));
  // 後頭部を覆う頭巾。面と繋げて、頭全体を一続きの殻に見せる
  head.add(place(kit.ball(0.16, 0.17, 0.165, "cloth", p.cloth), 0, 0.13, 0.03));
  // 冠。細い結晶を放射させ、顔が無いぶんの情報を頭の輪郭に置く
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5;
    const spire = kit.octa(0.018, 0.10 - Math.abs(t) * 0.05, 0.016, "crystal", p.accent);
    place(spire, t * 0.22, 0.28 - Math.abs(t) * 0.03, 0.02 + Math.abs(t) * 0.06, -0.2, 0, -t * 1.6);
    head.add(spire);
  }

  // 光輪。輪は細く保ち、面積ではなく形で「天使」を伝える
  const halo = kit.ring(0.22, 0.02, "glow", p.glow, 30);
  place(halo, 0, 0.34, 0.03, Math.PI / 2 - 0.12, 0, 0);
  head.add(halo);
  rig.spinners.push({ object: halo, axis: "z", speed: 0.5 });

  // --- 二対の翼。上対を大きく立て、下対を小さく後ろへ流す ---
  rig.wingAnchor.set(0.20, 0.60, 0.10);
  for (const side of [-1, 1]) {
    // 翼が体より大きいと、正規化で体が縮んで「羽根の塊」になる。
    // 胴の高さと同じくらいに収め、後ろへ流して胴の輪郭を隠さないようにする
    for (const [index, spec] of [
      { y: 0.60, span: 1.0, yaw: 0.62, pitch: 0.06, roll: 0.40, count: 11 },
      { y: 0.32, span: 0.74, yaw: 0.72, pitch: 0.36, roll: -0.10, count: 9 },
    ].entries()) {
      const wing = new THREE.Group();
      markAnimated(wing);
      place(wing, side * 0.16, spec.y, 0.12, spec.pitch, -side * spec.yaw, side * spec.roll);
      addFeatherWing(kit, wing, side, spec.count, spec.span);
      rig.torso.add(wing);
      rig.wings.push({
        root: wing,
        rootRest: wing.rotation.clone(),
        lower: null,
        lowerRest: null,
        tip: wing,
        side,
        // 上下の翼で位相をずらし、順に羽ばたいて見えるようにする
        phase: index * 0.9,
      });
    }
  }

  // 周囲を巡る小さな光。体表を明るくせずに「光を纏っている」ことを示す
  for (let i = 0; i < 5; i++) {
    const mote = kit.octa(0.03, 0.055, 0.03, "crystal", p.accent);
    rig.core.add(mote);
    rig.orbiters.push({
      object: mote,
      radius: 0.66 + (i % 2) * 0.18,
      height: 0.9 + i * 0.28,
      speed: 0.45 + i * 0.05,
      phase: (i / 5) * Math.PI * 2,
      tilt: 0.3,
      spin: 1.0,
    });
  }

  rig.anim = {
    idleSpeed: 0.9,
    breath: 0.7,
    bob: 0.05,
    headSway: 0.7,
    tailWave: 0,
    wingFlap: 0.45,
    sway: 0.6,
    lunge: 1.1,
    squash: 0,
    attack: "lunge",
    accent: "roar",
  };
}

// ---------------------------------------------------------------------------
// 登録
// ---------------------------------------------------------------------------

/**
 * 専用骨格を持つ種別。
 * ここに載っている種別は、役割ビルダーを一切通さずにこちらで組む。
 */
const TEMPLATE_BUILDERS: Record<string, CreatureBuilder> = {
  slime: { build: buildSlime, height: 1.72, float: 0 },
  wolf: { build: buildWolf, height: 2.05, float: 0 },
  nemesis: { build: buildNemesis, height: 2.72, float: 0 },
  golem: { build: buildGolem, height: 2.5, float: 0 },
  fairy: { build: buildFairy, height: 1.72, float: 0.62 },
  reincarnation_pig: { build: buildReincarnationPig, height: 1.42, float: 0.08 },
  exp_pig: { build: buildExpPig, height: 1.34, float: 0 },
  dragon: { build: buildDragon, height: 2.95, float: 0 },
  ancient_crystal_curse: { build: buildAncientCrystalCurse, height: 2.55, float: 0.5 },
  ancient_demon: { build: buildAncientDemon, height: 3.25, float: 0.34 },
  griffon: { build: buildGriffon, height: 2.75, float: 0 },
  seraph: { build: buildSeraph, height: 2.7, float: 0 },
};

/** 種別専用の骨格。無ければ null(役割の骨格を使う) */
export function templateBuilderFor(templateId: string): CreatureBuilder | null {
  return TEMPLATE_BUILDERS[templateId] ?? null;
}

/**
 * 役割の骨格へ足す、種別固有の造形。
 * 骨格そのものは役割のままでよく、翼や飾りだけで見分けが付く種別に使う。
 */
const TEMPLATE_TRAITS: Record<string, (kit: CreatureKit, rig: CreatureRig) => void> = {
  /**
   * ドラゴン: 大きな皮膜の翼。
   *
   * 水平に大きく広げると、翼が画面を横に占領したうえに滑空機のように見えてしまう。
   * 上へ立ち上げ(Z回転)ながら後ろへ流す(Y回転)ことで、体の横に畳みかけた
   * 「休めているが、いつでも開ける」構えになり、胴の輪郭も隠れなくなる。
   */
  dragon: (kit, rig) => {
    const a = rig.wingAnchor;
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      markAnimated(wing);
      place(wing, side * a.x, a.y, a.z, 0.2, -side * 0.62, side * 0.66);
      addBatWing(kit, wing, side, 1.02);
      rig.torso.add(wing);
      rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
    }
    rig.anim.wingFlap = 0.55;
  },

  // グリフォンの翼と冠羽は buildGriffon が肩の位置ごと組むので、ここには置かない
  // (両方に置くと翼が二重に生える)

  // セラフの翼と光輪は buildSeraph が肩と頭の位置ごと組むので、ここには置かない

  /** 古代の魔人: 顔の周りに漂う呪符状の破片で、同じボス骨格の中でも「主」に見せる */
  ancient_demon: (kit, rig) => {
    const p = kit.palette;
    for (let i = 0; i < 6; i++) {
      const shard = kit.octa(0.07, 0.18, 0.05, "crystal", p.accent);
      rig.core.add(shard);
      rig.orbiters.push({
        object: shard,
        radius: 1.15 + (i % 2) * 0.3,
        height: 1.5 + i * 0.22,
        speed: -0.28 - i * 0.04,
        phase: (i / 6) * Math.PI * 2,
        tilt: 0.35,
        spin: 0.6,
      });
    }
    // 額の第三の目
    rig.head.add(place(kit.ball(0.06, 0.09, 0.04, "glow", p.glow, 10), 0, 0.34, -0.24));
    rig.head.add(place(kit.lens(0.11, 0.14, 0.06, "plate", p.plate, 8), 0, 0.34, -0.20, 0, 0, 0));
  },

  /** 古代の呪晶: 本体を縛る拘束環。同じ結晶系のサポートと役割の差を形で出す */
  ancient_crystal_curse: (kit, rig) => {
    const p = kit.palette;
    for (let i = 0; i < 3; i++) {
      const ring = kit.ring(0.42 - i * 0.06, 0.03, "metal", p.metal, 20);
      place(ring, 0, 0.2 + i * 0.3, 0, Math.PI / 2 + (i - 1) * 0.4, i * 0.6, 0);
      rig.torso.add(ring);
      rig.spinners.push({ object: ring, axis: i % 2 === 0 ? "z" : "y", speed: (i % 2 === 0 ? 1 : -1) * (0.3 + i * 0.15) });
    }
  },
};

/** 種別固有の造形を足す。該当がなければ何もしない(役割ビルダーのままになる) */
export function applyTemplateTraits(templateId: string, kit: CreatureKit, rig: CreatureRig): void {
  TEMPLATE_TRAITS[templateId]?.(kit, rig);
}
