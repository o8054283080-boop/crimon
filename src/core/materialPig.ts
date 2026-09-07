/**
 * 素材専用のピッグ3種を見分ける。
 *
 * **3種とも役割は「素材」で同じ。**だから役割で絞ると1つにまとまり、
 * 「経験ピッグだけ見たい」「転生ピッグはどれだけ持っているか」が分からなかった。
 * 使い道はまったく違う——星を上げる / 経験値を渡す / スキルを伸ばす——ので、
 * 絞り込みの上では**別のものとして扱う。**
 *
 * ここは絞り込みが3系統(所持モンスター・図鑑・強化素材)から使う。
 * 判定を1か所に集めておかないと、**片方だけ分かれている**状態になる。
 */

/** 素材専用モンスターの種類 */
export type MaterialPigKind = "REINCARNATION" | "EXP" | "SKILL";

/**
 * テンプレートID。
 *
 * **`src/data/monsters.ts` の定義と一致していること**を
 * `tests/materialPig.test.ts` が機械的に確かめている。
 * ここへ直接 import しないのは、`core` が `data` へ依存すると
 * 向きが逆になり、この判定だけを単体で確かめられなくなるため。
 */
export const MATERIAL_PIG_TEMPLATE_IDS: Record<MaterialPigKind, string> = {
  REINCARNATION: "reincarnation_pig",
  EXP: "exp_pig",
  SKILL: "skill_pig",
};

/** 絞り込みの札に出す名前。図鑑の名前と揃える */
export const MATERIAL_PIG_LABEL: Record<MaterialPigKind, string> = {
  REINCARNATION: "転生ピッグ",
  EXP: "経験ピッグ",
  SKILL: "スキルピッグ",
};

/** 並べる順。使う場面の多い順ではなく、**育成の流れの順**にする */
export const MATERIAL_PIG_KINDS: MaterialPigKind[] = ["EXP", "SKILL", "REINCARNATION"];

const BY_TEMPLATE_ID = new Map<string, MaterialPigKind>(
  (Object.entries(MATERIAL_PIG_TEMPLATE_IDS) as [MaterialPigKind, string][]).map(([kind, id]) => [id, kind]),
);

/** そのテンプレートが素材ピッグなら種類を返す。違えば null */
export function materialPigKindOf(templateId: string | undefined): MaterialPigKind | null {
  return templateId ? BY_TEMPLATE_ID.get(templateId) ?? null : null;
}

/**
 * 絞り込みに出す役割名。
 *
 * **素材ピッグだけは役割ではなく種類を返す。**
 * こうしておくと、役割で絞る仕組み(所持モンスター・図鑑)へ手を入れずに
 * 3種が分かれる。役割の札が「素材」1枚から3枚に増えるだけ。
 */
export function filterRoleOf(dex: { templateId: string; role: string } | undefined): string | null {
  if (!dex) return null;
  const kind = materialPigKindOf(dex.templateId);
  return kind ? MATERIAL_PIG_LABEL[kind] : dex.role;
}

const PIG_LABEL_ORDER = new Map(MATERIAL_PIG_KINDS.map((kind, i) => [MATERIAL_PIG_LABEL[kind], i]));

/**
 * 役割の札を並べる順。
 *
 * **戦う役割が先、素材は後ろにまとめる。**
 * 五十音で素直に並べると「アタッカー / スキルピッグ / ディフェンダー /
 * ヒーラー / 経験ピッグ / 転生ピッグ」と、素材が戦う役割の間へ散らばる。
 * 戦力を探している人にも素材を探している人にも読みにくい。
 *
 * 素材どうしは育成の流れの順(経験→スキル→転生)にする。
 */
export function compareFilterRoles(a: string, b: string): number {
  const pigA = PIG_LABEL_ORDER.get(a);
  const pigB = PIG_LABEL_ORDER.get(b);
  if (pigA !== undefined && pigB !== undefined) return pigA - pigB;
  if (pigA !== undefined) return 1;
  if (pigB !== undefined) return -1;
  return a.localeCompare(b, "ja");
}
