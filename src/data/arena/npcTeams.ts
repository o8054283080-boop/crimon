/**
 * NPCの編成テンプレート。
 *
 * ## なぜ顔ぶれを名指しで固定するのか
 *
 * 4体をランダムに引くと、どの帯でも「なんとなく強い4体」になる。
 * そうなるとこちらが編成を変える理由が消え、アリーナが
 * **ステータスの大小を比べるだけの場所**になってしまう。
 *
 * さらに、この案件では過去に**毒を1体も持たない3体を「毒編成」として測り、
 * まるごと嘘の結論を出した**事故がある(CLAUDE.md)。
 * 「速攻」「耐久」と名乗るなら、その戦い方を実際にできる顔ぶれでなければならない。
 * だから型ごとに実在する図鑑IDを名指しで持つ。
 * `tests/arenaNpc.test.ts` が、ここに書いたIDが全部実在することを見張っている。
 *
 * ## 段(tier)は「編成の質」であって強さの倍率ではない
 *
 * 上の帯ほど戦術がはっきりした編成に当たる。段が上がると変わるのは
 * **役割の噛み合い**(先手を取る係・耐える係・解除する係が揃っているか)で、
 * ステータスへの上乗せは一切していない。強さは `npcConfig.ts` の育成度だけで動く。
 *
 * ## 最上段にも通常モンスターだけの編成を必ず残す
 *
 * `docs/design-concept.md` の芯は「ふつうのモンスターでも、育てて装備を整えれば
 * 奥まで行ける」。最上段を高レアだけで埋めると、**相手編成そのものが
 * 「ここから先は引き次第だ」と言ってしまう。** 段3に「研ぎ澄ました常連」を
 * 置いてあるのはそのため。素の能力では劣るが、育成が満点なので同じ場所に居る。
 */
import { SetType } from "../../core/equipment.js";
import { ArenaNpcRole } from "./npcConfig.js";

export interface ArenaNpcTeamMember {
  /** 図鑑ID(`ALL_DISPLAYABLE_MONSTERS_DEX` に実在するもの) */
  dexId: string;
  role: ArenaNpcRole;
}

/**
 * その編成が**実際にできると名乗っていること**。
 *
 * 名前と説明は飾りにできてしまう。「毒編成」と名乗る4体が毒を1つも
 * 持っていなくても、型もテストも何も言わない——この案件では実際に
 * **毒を1体も持たない3体を「毒編成」として測り、まるごと嘘の結論を出した**
 * (CLAUDE.md)。名乗りをデータとして書き、`tests/arenaNpcTeams.test.ts` が
 * 全員のスキルを実際にたどって裏を取る。
 */
export type ArenaTeamClaim =
  | "POISON"    // 毒を撒ける
  | "STRIP"     // 強化を剥がせる
  | "HEAL"      // 回復できる
  | "CONTROL"   // 手番を奪える(スタン・ゲージ減少・クールタイム延長)
  | "GUARD"     // 守りを固められる(盾・免疫・解除・庇う・軽減)
  | "DEBUFF"    // 弱体を入れられる
  | "SPEED"     // 先に動ける(素早さ上昇・ゲージ増加)
  | "BURST";    // 一撃が重い(倍率2.0以上の攻撃を持つ)

export interface ArenaNpcTeam {
  id: string;
  /** 相手カードに出す編成名 */
  name: string;
  /** 一言の説明。「何をしてくる相手か」を先に伝える */
  note: string;
  /** 編成の段。大きいほど戦術がはっきりしている(強さの倍率ではない) */
  tier: number;
  /** 4体。順番は隊列の並びとして意味を持たせない */
  members: readonly ArenaNpcTeamMember[];
  /**
   * この編成が名乗っていること。**説明文と必ず揃えること。**
   * 空でよいのは「特に名乗っていない」編成だけ。
   */
  claims: readonly ArenaTeamClaim[];
  /**
   * 編成としてそろえるシリーズ。指定するとその型の全員が
   * 4個セットをこれで組む(役割ごとの既定より優先)。
   */
  set?: SetType;
}

/**
 * 編成テンプレート。**段ごとに複数用意して、毎回同じ顔ぶれにならないようにする。**
 * 1つの段に1つしか無いと、その帯の相手が全員同じになる。
 */
export const ARENA_NPC_TEAMS: readonly ArenaNpcTeam[] = [
  /* ---------------- 段0: 覚えたての編成。役割は揃っているが噛み合いは浅い ---------------- */
  {
    id: "starter_pack",
    claims: [],
    name: "手探りの4体",
    note: "殴る係と守る係を1体ずつ置いただけの編成",
    tier: 0,
    members: [
      { dexId: "wolf_FIRE", role: "ATTACK" },
      { dexId: "slime_ELECTRIC", role: "ATTACK" },
      { dexId: "knight_WATER", role: "DEFENSE" },
      { dexId: "fairy_GRASS", role: "SUPPORT" },
    ],
  },
  {
    id: "stone_wall",
    claims: ["HEAL", "GUARD"],
    name: "石垣",
    note: "硬い前衛で受けて、回復でしのぐ",
    tier: 0,
    members: [
      { dexId: "golem_WATER", role: "DEFENSE" },
      { dexId: "treant_GRASS", role: "HP" },
      { dexId: "fairy_WATER", role: "SUPPORT" },
      { dexId: "knight_FIRE", role: "ATTACK" },
    ],
  },
  {
    id: "swamp_start",
    claims: ["POISON", "DEBUFF"],
    name: "沼地の使い",
    note: "毒と弱体を重ねて削り切る",
    tier: 0,
    members: [
      { dexId: "imp_DARK", role: "DISRUPT" },
      { dexId: "slime_DARK", role: "DISRUPT" },
      { dexId: "mushroon_GRASS", role: "DISRUPT" },
      { dexId: "shellturtle_WATER", role: "DEFENSE" },
    ],
  },

  /* ---------------- 段1: 戦い方が1つに決まっている編成 ---------------- */
  {
    id: "gale_hunt",
    /*
     * **「動く前に落とす」とは名乗れない。** この4体は最大倍率が1.65で、
     * スタンもゲージ減少も持っていない。できるのは「全員が先に動く」ことと
     * 「弱らせること」だけなので、名乗りも説明もそこへ合わせてある
     * (`tests/arenaNpcTeams.test.ts` が実際のスキルをたどって拾った)。
     */
    claims: ["SPEED", "DEBUFF"],
    name: "疾風の狩り",
    note: "電気で固めて全員が先に動き、弱らせてから削る",
    tier: 1,
    set: "SWIFT",
    members: [
      { dexId: "wolf_ELECTRIC", role: "ATTACK" },
      { dexId: "thunderbeast_ELECTRIC", role: "ATTACK" },
      { dexId: "wisp_ELECTRIC", role: "SUPPORT" },
      { dexId: "knight_ELECTRIC", role: "DEFENSE" },
    ],
  },
  {
    id: "bulwark",
    claims: ["HEAL", "GUARD"],
    name: "城壁",
    note: "落ちない前衛と回復で、時間を味方にする",
    tier: 1,
    set: "GUARD",
    members: [
      { dexId: "shellturtle_WATER", role: "DEFENSE" },
      { dexId: "mimic_WATER", role: "HP" },
      { dexId: "fairy_WATER", role: "SUPPORT" },
      { dexId: "knight_WATER", role: "ATTACK" },
    ],
  },
  {
    id: "chain_venom",
    claims: ["POISON", "CONTROL"],
    name: "鎖と毒",
    note: "手番を奪いながら毒を積む",
    tier: 1,
    set: "ACCURACY_SET",
    members: [
      { dexId: "basilisk_DARK", role: "DISRUPT" },
      { dexId: "mushroon_DARK", role: "DISRUPT" },
      { dexId: "imp_DARK", role: "DISRUPT" },
      { dexId: "treant_DARK", role: "HP" },
    ],
  },

  /* ---------------- 段2: 役割が噛み合い始める編成 ---------------- */
  {
    id: "sky_raid",
    claims: ["BURST", "SPEED"],
    name: "翼の急襲",
    note: "高い攻撃力を先手で押し付ける",
    tier: 2,
    set: "CRIT",
    members: [
      { dexId: "griffon_ELECTRIC", role: "ATTACK" },
      { dexId: "griffon_FIRE", role: "ATTACK" },
      { dexId: "wisp_ELECTRIC", role: "SUPPORT" },
      { dexId: "knight_ELECTRIC", role: "DEFENSE" },
    ],
  },
  {
    id: "sanctuary",
    claims: ["HEAL", "GUARD"],
    name: "聖域",
    note: "回復と防壁を切らさず、削り負けない",
    tier: 2,
    members: [
      { dexId: "seraph_LIGHT", role: "SUPPORT" },
      { dexId: "valkyria_LIGHT", role: "SUPPORT" },
      { dexId: "behemoth_GRASS", role: "HP" },
      { dexId: "knight_LIGHT", role: "DEFENSE" },
    ],
  },
  {
    id: "hex_breaker",
    claims: ["STRIP"],
    name: "解呪の刃",
    note: "強化を剥がしてから殴る",
    tier: 2,
    members: [
      { dexId: "abyssreaper_DARK", role: "DISRUPT" },
      { dexId: "mimic_DARK", role: "HP" },
      { dexId: "valkyria_WATER", role: "SUPPORT" },
      { dexId: "fenrir_FIRE", role: "ATTACK" },
    ],
  },

  /* ---------------- 段3: 戦術が完成している編成 ---------------- */
  {
    id: "dragonfire_verdict",
    claims: ["BURST"],
    name: "竜火の断罪",
    note: "支えを固めた上での、一撃必殺",
    tier: 3,
    set: "CRIT",
    members: [
      { dexId: "dragon_FIRE", role: "ATTACK" },
      { dexId: "nemesis_ELECTRIC", role: "ATTACK" },
      { dexId: "seraph_WATER", role: "SUPPORT" },
      { dexId: "behemoth_WATER", role: "DEFENSE" },
    ],
  },
  {
    id: "time_thief",
    claims: ["CONTROL", "STRIP"],
    name: "時を止める者",
    note: "手番を奪い、強化を剥がし、返す手を残さない",
    tier: 3,
    members: [
      { dexId: "chronos_LIGHT", role: "SUPPORT" },
      { dexId: "abyssreaper_DARK", role: "DISRUPT" },
      { dexId: "nemesis_DARK", role: "ATTACK" },
      { dexId: "mimic_LIGHT", role: "HP" },
    ],
  },
  {
    id: "fang_sprint",
    claims: ["SPEED"],
    name: "狼牙の疾走",
    note: "全員が先に動く。返す手番を作らせない",
    tier: 3,
    set: "SWIFT",
    members: [
      { dexId: "fenrir_ELECTRIC", role: "ATTACK" },
      { dexId: "thunderbeast_ELECTRIC", role: "ATTACK" },
      { dexId: "chronos_ELECTRIC", role: "SUPPORT" },
      { dexId: "valkyria_ELECTRIC", role: "SUPPORT" },
    ],
  },
  {
    id: "honed_regular",
    claims: [],
    name: "研ぎ澄ました常連",
    note: "通常モンスターだけ。育成と装備で最上位に居座る",
    tier: 3,
    members: [
      { dexId: "knight_WATER", role: "DEFENSE" },
      { dexId: "wolf_FIRE", role: "ATTACK" },
      { dexId: "fairy_LIGHT", role: "SUPPORT" },
      { dexId: "imp_DARK", role: "DISRUPT" },
    ],
  },
];

/** その段で使える編成テンプレート。1つも無ければ全体から返す(空を返さない) */
export function arenaNpcTeamsForTiers(tiers: readonly number[]): readonly ArenaNpcTeam[] {
  const matched = ARENA_NPC_TEAMS.filter((team) => tiers.includes(team.tier));
  return matched.length > 0 ? matched : ARENA_NPC_TEAMS;
}
