import { Element } from "../core/element.js";
import { BEAST_DUNGEON_SET_TYPES, DEMON_DUNGEON_SET_TYPES, DUNGEON_FLOOR_COUNT, Equipment, SetType, generateDungeonEquipment } from "../core/equipment.js";
import { BossTraits } from "../core/monster.js";
import { Star, STAR_MAX_LEVEL } from "../core/rarity.js";
import { Skill } from "../core/skill.js";
import { Stats } from "../core/stats.js";
import {
  ANCIENT_CRYSTAL,
  ANCIENT_CRYSTAL_CURSE,
  ANCIENT_DEMON,
  ANCIENT_BEAST,
  ANCIENT_FANG_BEAST,
  ANCIENT_GUARD_BEAST,
  MONSTER_TEMPLATES,
  REINCARNATION_PIG_DEX,
} from "./monsters.js";

export interface DungeonEnemy {
  templateId: string;
  element: Element;
  star: Star;
  level: number;
  /** 階層専用ボス(お供2体を連れて登場する)かどうか */
  isBoss?: boolean;
  victoryTarget?: boolean;
  primaryTarget?: boolean;
  /**
   * この個体だけに掛かる最大HP倍率。powerScale とは別枠で、階層全体ではなく
   * 1体だけを分厚くしたい時に使う(ボスや最終階のお供だけ殴り合いの時間を伸ばす、など)
   */
  hpMultiplier?: number;
  /**
   * この個体だけに掛かる素早さ倍率。powerScale は素早さに掛からないため、
   * 手番の回り方を変えたい場合はこちらを使う
   */
  spdMultiplier?: number;
  /**
   * 階層設計で確定させた実効値。指定時は通常の倍率計算(powerScale / speedScale /
   * hpMultiplier / spdMultiplier)より優先する。
   *
   * 書いた項目だけが差し替わる。会心率・会心ダメージ・命中・抵抗まで指定できるのは、
   * **専用ボスを「図鑑の値の倍率」ではなく実数で置きたい**場面があるため
   * (試練の塔60階は Battle Lab で実測した実数をそのまま持ち込んでいる)。
   */
  fixedStats?: Partial<Stats>;
  /**
   * この個体だけのスキル差し替え。図鑑の3つをまるごと置き換える。
   *
   * 専用ボスは「同じ図鑑の個体だが技だけが違う」形になることがある
   * (試練の塔60階の豪魔人・呪晶)。属性違いの新テンプレートを増やすと
   * 図鑑・召喚・覚醒候補まで波及するので、階の側で差し替える。
   */
  skills?: [Skill, Skill, Skill];
  /** この個体だけのボス特性。指定すると図鑑テンプレートの `bossTraits` を置き換える */
  bossTraits?: BossTraits;
  /** 画面に出す名前。省略時は「図鑑名★星 Lv」 */
  displayName?: string;
  initialCooldowns?: [number, number, number];
}

export type EquipmentDungeonKind = "DEMON" | "BEAST";

export interface DungeonFloor {
  kind: EquipmentDungeonKind;
  floor: number;
  name: string;
  enemies: DungeonEnemy[];
  /** 敵の実効ステータスに掛かる倍率。装備を整えた強いパーティ向けなので通常ステージより高めに設定 */
  powerScale: number;
  /** 敵の速度に掛かる倍率。powerScale とは別にする(速度は手番の数に直結するため) */
  speedScale: number;
  goldReward: number;
  setPool: readonly SetType[];
}

const NORMAL_ELEMENTS: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS"];

/** お供(通常モンスター2体)は星5・Lv50(星5の最大値)で固定。難易度はpowerScaleのみで表現する */
const DUNGEON_ENEMY_STAR: Star = 5;
const DUNGEON_ENEMY_LEVEL = 50;

/** 階層専用ボスは、お供よりさらに一段階強い星6・Lv60(星6の最大値)で登場する */
const DUNGEON_BOSS_STAR: Star = 6;
const DUNGEON_BOSS_LEVEL = STAR_MAX_LEVEL[DUNGEON_BOSS_STAR];

/**
 * ボスは全10階すべて「古代の魔人」で固定する。
 *
 * 以前は1〜8階にガチャ限定の高レア(グリフォン/セラフ/ドラゴン/ネメシス)を巡回で置いていたが、
 * 召喚で手に入る顔ぶれがそのままボス席に座っているため、ダンジョン専用の関門に見えなかった。
 * 古代の魔人は召喚に一切出てこない専用の存在なので、全階をこれで通すと
 * 「装備ダンジョンの主」として一貫する。階層ごとに属性は変わるので、色と弱点は巡回する。
 */
const BOSS_TEMPLATE = ANCIENT_DEMON;

/**
 * ボスだけに掛かる最大HP倍率。
 *
 * ボスがお供と大差ない速さで溶けてしまい、階層の関門として印象に残らなかった。
 * powerScale を上げて厚くすると攻撃力も一緒に上がって事故死が増えるので、
 * **HPだけ**を別枠で伸ばし、殴り合いの時間そのものを長くしている。
 */
const BOSS_HP_MULTIPLIER = 5;

/**
 * ボスだけに掛かる素早さ倍率。
 *
 * HPを5倍にすると戦闘が長引くぶん、手番が回ってこないボスは「ただの分厚い的」になる。
 * powerScale は素早さに掛からない設計なので、ここで別枠で上げて手数を確保している。
 */
const BOSS_SPD_MULTIPLIER = 1.3;

/**
 * 10階のお供だけに掛かる最大HP倍率。最終階の支援・妨害役が仕事をする時間を確保する。
 *
 * 以前は3倍だったが、これだけで10階が9階から一段どころか二段跳ねてしまい、
 * powerScale をいくら下げても10階が勝率0%から動かなくなっていた。
 * 難易度の出どころを倍率(powerScale・speedScale)側へ寄せ、この値は控えめにしてある。
 */
const FINAL_FLOOR_COMPANION_HP_MULTIPLIER = 4;

/**
 * 9・10階(ダンジョン最終盤の最終関門)だけは、お供2体も専用の
 * 「古代のクリスタル」「古代の呪晶」の組み合わせで固定になる
 * (ボス自体は全階で古代の魔人。BOSS_TEMPLATE を参照)。
 * 古代のクリスタルは自ら攻めるよりも古代の魔人へのバフ・回復を優先するサポート役、
 * 古代の呪晶は逆に支援より全体攻撃・デバフでプレイヤー側を弱らせにくる攻撃寄りのお供で、
 * 支援と攻撃で役割がはっきり分かれた2体構成になっている。
 */
const FINAL_BOSS_FLOOR_START = 9;
const FINAL_BOSS_COMPANION_TEMPLATES = [ANCIENT_CRYSTAL, ANCIENT_CRYSTAL_CURSE];

/*
 * 8階にも呪晶を1体混ぜてみたが、**弱い編成の方が強く殴られる**ので取りやめた。
 * バフ剥がしと回復阻害は、強化と回復を積み重ねて戦う編成(=通常モンスターの本命の勝ち筋)に
 * だけ刺さり、火力で押し切る高レア編成にはほとんど効かない。実測でも高レア編成は
 * 100%のまま、通常バランス編成だけが8%→2%へ落ちた。
 * 「上の編成を締めるつもりで下の編成だけを締める」調整になっていないか、必ず両方測ること。
 */

/**
 * 1階/10階の必要パワースケール(END は10階の「ボーナス適用前」の値)。
 *
 * ボスのHPを5倍にした時点で、この値は全面的に置き直してある。
 * ボスが5倍長く生き残るということは、ボスが与える総ダメージも5倍近く伸びるということで、
 * 据え置きにすると難易度が跳ね上がる(実測で1階の勝率が0%になった)。
 * 新しい値は `npx tsx tools/dungeonProbe.ts` で候補を振って実測し、
 * テストが要求する水準を満たす範囲から選んでいる。勘で置かないこと。
 *
 * 1階は「星3モンスターに星1装備」くらいの、まだ育成途中のパーティでも挑めるくらいまで下げてあり、
 * 装備ダンジョンの入り口として無理なく足を踏み入れられるようにしてある。
 * そこから階層を上がるごとになだらかに強くなっていく。
 * ランクアップの複利倍率引き上げ(星5/Lv50の実効ステータス底上げ)や、
 * モンスターごとのスキル2/3が属性ごとに異なる組み合わせになったことによる
 * 戦闘バランスの変化に合わせて、この値は都度調整してある。
 */
const POWER_SCALE_START = 0.28;
const POWER_SCALE_END = 1.215;

/**
 * 9・10階はダンジョン最終盤の最終関門として、8階までの線形カーブに対してさらに
 * 大きく難易度を引き上げる。
 *
 * ここで難易度を上げる目的は「高レアを持っていない人を締め出すこと」ではない。
 * 通常モンスターでも育成と装備を突き詰めれば手が届く余地は必ず残す
 * (docs/design-concept.md を参照)。この数値を触る時は、通常編成の勝率が
 * 0になっていないかを必ず確かめること。
 * 装備ダンジョンは通常パーティ(4体)より1体多い専用パーティ(最大5体)で挑めるうえ、
 * ガチャ限定の高レア(SR/SSR)モンスターは通常モンスターよりベースステータス・専用スキルとも
 * 明確に強力なため、SR/SSRを軸にした編成だと通常モンスターだけの編成基準の数値では
 * あっさり突破されてしまう。また9・10階のお供は、回復・防御バフで古代の魔人を支え続ける
 * 「古代のクリスタル」と、全体攻撃・デバフでプレイヤー側を弱らせにくる「古代の呪晶」の
 * 組み合わせで、古代の魔人自身も5ターンCTの全体攻撃を持つため、他の階層より同じpowerScale
 * でも体感の厳しさが増す。これらを踏まえ、9・10階は「星5のSR/SSRを複数体、星6装備込みで
 * 編成した終盤パーティ」を基準に、
 * サブステータスまでしっかり詰めてようやく安定して勝てる水準まで引き上げてある。
 * なおスキル調整で通常モンスターの連携(全体デバフ・毒・継続回復)が強くなったため、
 * 装備を極めた通常モンスターだけの編成でも突破できる場合はあるが、
 * SR/SSR軸の編成と比べれば依然としてはっきり不利になるよう調整してある。
 */
const LATE_FLOOR_POWER_BONUS: Partial<Record<number, number>> = { 7: 1.72, 8: 2.18, 9: 2.18, 10: 1.86 };

/*
 * 3度目の引き上げ(「毒と耐久などいくらでも突破方法がある。もっと強くしても大丈夫」との指摘)。
 * 数値だけでなく、巨人ダンジョン式の仕掛け(反撃・バフ剥がし・回復阻害)を
 * 入れたうえで再調整してある。`npx tsx tools/dungeonPressure.ts 7 8 9 10` で実測できる。
 *
 * 引き上げ後の勝率(★6Lv60 + ★6装備サブ4、5体編成):
 *
 *   階  高レア速度詰め  高レア素装備  通常バランス  毒重ね  耐久
 *    7      100%         100%        62%       92%   100%
 *    8       84%           70%         0%        2%    12%
 *    9       50%           36%         0%        0%     0%
 *   10       24%           14%         0%        6%     2%
 *
 * (装備の速度を半分に見直し、敵の速度カーブを1.85→1.28へ合わせ直した後の値)
 *
 * **速度を詰めることの支配力が大きく下がった。**以前は8階で
 * 速度詰め94% / 素装備36% と3倍近い差があったが、84% / 70% まで縮んでいる。
 * 装備の副効果を速度に全振りするだけで勝てる、という状態ではなくなった。
 *
 * 触るときに気を付けること:
 *
 * - **勝率だけで階層を比べないこと。** 上げすぎると全編成そろって0%に張り付き、
 *   9階と10階のどちらが難しいかすら読めなくなる。決着時点の敵残HP割合で見ること
 *   (tools/dungeonPressure.ts の enemyHpLeft)
 * - **その戦術を実行できる顔ぶれを選べているか、先に確かめること。**
 *   毒編成として毒を1つも持たない3体を並べて測り、「毒は8階以降まったく通用しない」という
 *   まるごと嘘の結論を出したことがある。毒を持つのは属性違いのごく一部だけ
 *   (tools/dungeonPressure.ts は毒スタックが0のまま終わったら警告を出す)
 * - **戦術そのものを潰さないこと。** 毒で削るのも耐久で待つのもちゃんとした戦い方で、
 *   塞ぐべき抜け道ではない。一度ボスに毒・火傷への耐性を持たせたが、
 *   それはその戦術を選んだこと自体への罰なので取りやめた(tests/continuousDamage.test.ts)
 * - **powerScale は10階だけ9階より低い。** 10階のお供はHPが2倍で速度倍率も最速なので、
 *   同じ倍率だと9階より二段階難しくなる。倍率まで単調増加にすると10階に合わせて
 *   9階を緩めるほかなくなり、9階が締まらない。守るのは倍率の並びではなく実測の並び
 * - **勝率は倍率2.2〜2.5のあたりで急に落ちる。** 刻みは0.05〜0.1で取ること
 * - **強い編成を締めるつもりで弱い編成だけを締めていないか、必ず両方測ること。**
 *   バフ剥がしと回復阻害は、強化と回復を積み重ねる編成(=通常モンスターの本命の勝ち筋)に
 *   刺さり、火力で押し切る高レア編成にはほとんど効かなかった
 * - 通常モンスターだけでも**毒を軸にすれば10階に手が届く**(12%)。
 *   高レアの素装備編成(0%)より上で、docs/design-concept.md の方針は保てている
 */

/**
 * 階層ごとの敵の速度倍率。
 *
 * **速度だけが階層に関係なく据え置きだった。**powerScale はHP・攻撃・防御に
 * 掛かるが速度には掛からないため、1階の敵も10階の敵も同じ速さだった。
 * 一方でプレイヤー側は★6装備の副効果を詰めると **300を超える**
 * (素120のドラゴンが310)。結果、終盤では**こちらが敵の2〜3倍動く**状態になり、
 * 実測でも速度を詰めるだけで10階の勝率が28%→83%へ跳ね上がっていた。
 *
 * 速度は「何回動けるか」に直結するので、HPや攻撃力と同じ勢いで上げると
 * 手も足も出なくなる。**powerScaleよりずっと緩やかに**伸ばす。
 *
 * **この値はプレイヤー側の速度上限と対で決まる。**
 * 装備の速度を半分に見直して上限が327→216へ下がった時、
 * 末端を1.85のまま据え置いたら8階44%・9階4%・10階0%まで崩れた。
 * 実測して1.28へ下げ、元の並び(100/94/64/24)へ戻してある。
 * **装備側の速度を触ったら、必ずここも測り直すこと。**
 */
const SPEED_SCALE_START = 1;
const SPEED_SCALE_END = 1.28;

/*
 * 終盤だけ速度カーブを追加で立ち上げる案も試したが、効きが鋭すぎて使えなかった。
 * 10階の速度を1.85→1.96(わずか6%)に上げただけで、powerScaleをどれだけ下げても
 * 最強編成の勝率が0%から動かなくなる。速度は手番の数に直結するので、
 * 数%の変更が難易度では数十%の差になる。ここは線形のまま触らないこと。
 */
function speedScaleForFloor(floor: number): number {
  return SPEED_SCALE_START + ((floor - 1) * (SPEED_SCALE_END - SPEED_SCALE_START)) / (DUNGEON_FLOOR_COUNT - 1);
}

function powerScaleForFloor(floor: number): number {
  const base = POWER_SCALE_START + ((floor - 1) * (POWER_SCALE_END - POWER_SCALE_START)) / (DUNGEON_FLOOR_COUNT - 1);
  return base * (LATE_FLOOR_POWER_BONUS[floor] ?? 1);
}

function buildFloor(floor: number): DungeonFloor {
  // 各階層の敵は単一属性で統一する。弱点を突く属性のパーティを組めば有利に戦えるようになる
  const floorElement = NORMAL_ELEMENTS[(floor - 1) % NORMAL_ELEMENTS.length];
  const isFinalBossFloor = floor >= FINAL_BOSS_FLOOR_START;

  const bossTemplateId = BOSS_TEMPLATE.templateId;
  const companionTemplateIds = isFinalBossFloor
    ? FINAL_BOSS_COMPANION_TEMPLATES.map((t) => t.templateId)
    : [MONSTER_TEMPLATES[(floor - 1) % MONSTER_TEMPLATES.length].templateId, MONSTER_TEMPLATES[floor % MONSTER_TEMPLATES.length].templateId];
  const companionHpMultiplier = floor === DUNGEON_FLOOR_COUNT ? FINAL_FLOOR_COMPANION_HP_MULTIPLIER : undefined;

  // ボス1体+お供2体の3体編成。ボスを先頭に置く
  const enemies: DungeonEnemy[] = [
    {
      templateId: bossTemplateId,
      element: floorElement,
      star: DUNGEON_BOSS_STAR,
      level: DUNGEON_BOSS_LEVEL,
      isBoss: true,
      victoryTarget: floor === DUNGEON_FLOOR_COUNT,
      primaryTarget: true,
      // 10階は魔人撃破で即勝利になるため、速攻が一択にならない約30万HPへ調整する
      hpMultiplier: floor === DUNGEON_FLOOR_COUNT ? 8.5 : BOSS_HP_MULTIPLIER,
      spdMultiplier: BOSS_SPD_MULTIPLIER,
    },
    ...companionTemplateIds.map((templateId) => ({
      templateId,
      element: floorElement,
      star: DUNGEON_ENEMY_STAR,
      level: DUNGEON_ENEMY_LEVEL,
      hpMultiplier: companionHpMultiplier,
    })),
  ];

  return {
    kind: "DEMON",
    floor,
    name: `魔人のダンジョン ${floor}階`,
    enemies,
    powerScale: powerScaleForFloor(floor),
    speedScale: speedScaleForFloor(floor),
    goldReward: 60 * floor,
    setPool: DEMON_DUNGEON_SET_TYPES,
  };
}

export const EQUIPMENT_DUNGEON_FLOORS: DungeonFloor[] = Array.from({ length: DUNGEON_FLOOR_COUNT }, (_, i) => buildFloor(i + 1));

const BEAST_ELEMENTS: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS", "LIGHT", "DARK", "FIRE", "WATER", "ELECTRIC", "DARK"];
const BEAST_STATS = [
  { boss: [112000, 1460, 1170, 136], support: [64000, 500, 1250, 111], attacker: [38400, 1040, 640, 111] },
  { boss: [136500, 1770, 1420, 143], support: [78000, 600, 1520, 118], attacker: [46800, 1270, 780, 118] },
  { boss: [164500, 2140, 1720, 150], support: [94000, 730, 1830, 125], attacker: [56400, 1530, 940, 125] },
  { boss: [196000, 2550, 2040, 157], support: [112000, 870, 2180, 132], attacker: [67200, 1820, 1110, 132] },
  { boss: [217000, 2820, 2260, 164], support: [124000, 960, 2420, 139], attacker: [74400, 2020, 1230, 139] },
  { boss: [238000, 3090, 2480, 171], support: [136000, 1050, 2650, 146], attacker: [81600, 2210, 1350, 146] },
  { boss: [252000, 3280, 2630, 178], support: [144000, 1120, 2810, 153], attacker: [86400, 2340, 1430, 153] },
  { boss: [273000, 3550, 2850, 185], support: [156000, 1210, 3040, 160], attacker: [93600, 2540, 1550, 159] },
  { boss: [294000, 3820, 3070, 192], support: [168000, 1300, 3280, 167], attacker: [100800, 2730, 1670, 166] },
  { boss: [350000, 4550, 3650, 205], support: [200000, 1550, 3900, 175], attacker: [120000, 3250, 1990, 173] },
] as const;

function fixedStats(values: readonly [number, number, number, number]) {
  return { hp: values[0], atk: values[1], def: values[2], spd: values[3] };
}

function buildBeastFloor(floor: number): DungeonFloor {
  const element = BEAST_ELEMENTS[floor - 1];
  const stats = BEAST_STATS[floor - 1];
  return {
    kind: "BEAST",
    floor,
    name: `魔獣のダンジョン ${floor}階`,
    powerScale: 1,
    speedScale: 1,
    goldReward: 60 * floor,
    setPool: BEAST_DUNGEON_SET_TYPES,
    enemies: [
      { templateId: ANCIENT_BEAST.templateId, element, star: 6, level: 60, isBoss: true, victoryTarget: true, primaryTarget: true, fixedStats: fixedStats(stats.boss), initialCooldowns: [0, 3, 5] },
      { templateId: ANCIENT_GUARD_BEAST.templateId, element, star: 6, level: 60, victoryTarget: false, fixedStats: fixedStats(stats.support) },
      { templateId: ANCIENT_FANG_BEAST.templateId, element, star: 6, level: 60, victoryTarget: false, fixedStats: fixedStats(stats.attacker) },
    ],
  };
}

export const BEAST_DUNGEON_FLOORS: DungeonFloor[] = Array.from({ length: DUNGEON_FLOOR_COUNT }, (_, i) => buildBeastFloor(i + 1));
export const ALL_EQUIPMENT_DUNGEON_FLOORS = [...EQUIPMENT_DUNGEON_FLOORS, ...BEAST_DUNGEON_FLOORS];

export function findDungeonFloor(floor: number, kind: EquipmentDungeonKind = "DEMON"): DungeonFloor | undefined {
  return (kind === "BEAST" ? BEAST_DUNGEON_FLOORS : EQUIPMENT_DUNGEON_FLOORS).find((f) => f.floor === floor);
}

export function dungeonFloorKey(floor: DungeonFloor): string {
  return `${floor.kind}:${floor.floor}`;
}

export function findDungeonFloorByKey(key: string): DungeonFloor | undefined {
  if (!key.includes(":")) return findDungeonFloor(Number(key), "DEMON");
  const [kind, rawFloor] = key.split(":");
  return findDungeonFloor(Number(rawFloor), kind === "BEAST" ? "BEAST" : "DEMON");
}

/** 装備ダンジョンは挑戦するたびに必ず1個装備がドロップする(階層のドロップ率テーブルに従って星が決まる) */
export function rollDungeonEquipment(floor: DungeonFloor, rng: () => number = Math.random): Equipment {
  return generateDungeonEquipment(floor.floor, rng, floor.setPool ?? DEMON_DUNGEON_SET_TYPES);
}

/** 召喚の書の階層共通ドロップ率 */
export const SUMMON_SCROLL_DROP_RATE = 0.05;
/** 転生ピッグのドロップ率(全階層共通) */
export const REINCARNATION_PIG_DROP_RATE = 0.1;
/** この階層まで(1〜6階)は星2ピッグ、それより上(7〜10階)は星3ピッグがドロップする */
export const REINCARNATION_PIG_LOW_TIER_MAX_FLOOR = 6;

export interface DungeonPigDrop {
  dexId: string;
  star: Star;
}

/** 装備ドロップとは独立して、低確率で召喚の書もドロップする(全階層共通) */
export function rollDungeonSummonScroll(rng: () => number = Math.random): boolean {
  return rng() < SUMMON_SCROLL_DROP_RATE;
}

function reincarnationPigStarForFloor(floor: number): Star {
  return floor <= REINCARNATION_PIG_LOW_TIER_MAX_FLOOR ? 2 : 3;
}

/**
 * 低確率で転生ピッグがドロップする(全階層共通10%)。
 * 1〜6階は星2、7〜10階は星3のピッグがドロップする。ドロップしなければnull
 */
export function rollDungeonReincarnationPig(floor: DungeonFloor, rng: () => number = Math.random): DungeonPigDrop | null {
  if (rng() >= REINCARNATION_PIG_DROP_RATE) return null;
  const variant = REINCARNATION_PIG_DEX[Math.floor(rng() * REINCARNATION_PIG_DEX.length)];
  return { dexId: variant.id, star: reincarnationPigStarForFloor(floor.floor) };
}
