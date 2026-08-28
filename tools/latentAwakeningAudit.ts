import { pathToFileURL } from "node:url";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import type { LatentAbilityCandidate } from "../src/core/monsterDevelopment.js";

export type AuditCategory =
  | "aoe" | "healBlock" | "gaugeDown" | "strip" | "spdDown" | "poison" | "stun"
  | "ignoreDefense" | "buffBlock" | "allyGauge" | "debuffExtend" | "debuffBonusDamage"
  | "healSupport" | "durability" | "otherSpecial";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  aoe: "全体攻撃化", healBlock: "回復阻害", gaugeDown: "行動ゲージ減少", strip: "バフ解除",
  spdDown: "速度低下", poison: "毒", stun: "スタン", ignoreDefense: "防御無視",
  buffBlock: "バフ阻害", allyGauge: "味方ゲージ増加", debuffExtend: "デバフ延長",
  debuffBonusDamage: "弱体効果数追加ダメージ", healSupport: "回復/補助系",
  durability: "耐久系", otherSpecial: "その他特殊系",
};

export interface LatentAuditResult {
  monsterCount: number;
  candidateCount: number;
  duplicateIdCount: number;
  candidatesPerMonster: Record<number, number>;
  categories: Record<AuditCategory, string[]>;
  effectTypes: Record<string, number>;
}

const includes = (candidate: LatentAbilityCandidate, ...words: string[]) =>
  words.includes(candidate.status ?? "") || words.includes(candidate.effectType);

export function auditLatentCandidates(): LatentAuditResult {
  const candidates = ALL_DISPLAYABLE_MONSTERS_DEX.flatMap((monster) =>
    (LATENT_ABILITY_CANDIDATES[monster.id] ?? []).map((candidate) => ({ monster, candidate })),
  );
  const categories = (Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).reduce<Record<AuditCategory, string[]>>(
    (result, key) => ({ ...result, [key]: [] }),
    {} as Record<AuditCategory, string[]>,
  );
  const effectTypes: Record<string, number> = {};
  const candidatesPerMonster: Record<number, number> = {};
  for (const monster of ALL_DISPLAYABLE_MONSTERS_DEX) {
    const count = LATENT_ABILITY_CANDIDATES[monster.id]?.length ?? 0;
    candidatesPerMonster[count] = (candidatesPerMonster[count] ?? 0) + 1;
  }
  for (const { monster, candidate } of candidates) {
    const id = `${candidate.id} (${monster.name})`;
    effectTypes[candidate.effectType] = (effectTypes[candidate.effectType] ?? 0) + 1;
    // 現行スキーマと説明の両方を見る。将来 effectType が追加された時も監査から漏らさない。
    if (includes(candidate, "AOE", "MAKE_AOE")) categories.aoe.push(id);
    if (includes(candidate, "HEAL_BLOCK")) categories.healBlock.push(id);
    if (includes(candidate, "TURN_METER_DOWN", "GAUGE_DOWN")) categories.gaugeDown.push(id);
    if (includes(candidate, "STRIP")) categories.strip.push(id);
    if (includes(candidate, "SPD_DOWN")) categories.spdDown.push(id);
    if (includes(candidate, "POISON")) categories.poison.push(id);
    if (includes(candidate, "STUN")) categories.stun.push(id);
    if (includes(candidate, "IGNORE_DEFENSE")) categories.ignoreDefense.push(id);
    if (includes(candidate, "BUFF_BLOCK")) categories.buffBlock.push(id);
    if (candidate.effectType === "ALLY_SUPPORT" && candidate.value > 0 && candidate.resolution === "ON_CRIT") categories.allyGauge.push(id);
    if (includes(candidate, "DEBUFF_EXTEND")) categories.debuffExtend.push(id);
    if (includes(candidate, "DEBUFF_BONUS_DAMAGE")) categories.debuffBonusDamage.push(id);
    if (candidate.category === "SUPPORT" || includes(candidate, "SELF_HEAL", "ALLY_SUPPORT")) categories.healSupport.push(id);
    if (candidate.category === "DURABILITY" || includes(candidate, "SHIELD", "ENDURE", "REFLECT")) categories.durability.push(id);
    if (candidate.category === "SPECIAL") categories.otherSpecial.push(id);
  }
  return {
    monsterCount: ALL_DISPLAYABLE_MONSTERS_DEX.length,
    candidateCount: candidates.length,
    duplicateIdCount: candidates.length - new Set(candidates.map(({ candidate }) => candidate.id)).size,
    candidatesPerMonster,
    categories,
    effectTypes,
  };
}

export function formatAudit(result = auditLatentCandidates()): string {
  const counts = Object.fromEntries(Object.entries(result.categories).map(([key, ids]) => [key, ids.length]));
  return JSON.stringify({ ...result, categories: counts }, null, 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(formatAudit());
