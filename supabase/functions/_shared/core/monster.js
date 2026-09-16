import { ELEMENT_COLOR, ELEMENT_JA, ELEMENTS } from "./element.js";
import { applySeptemberSkillBalance } from "./skillRebalance.js";
import { cloneStats } from "./stats.js";
const scale = (value, ratio) => Math.round(value * ratio);
const ELEMENT_STAT_FLAVORS = {
    // 火は攻め。重い一撃で押すか、会心で通すか
    FIRE: [
        { note: "攻撃+12% / 防御-12%", apply: (s) => ({ ...s, atk: scale(s.atk, 1.12), def: scale(s.def, 0.88) }) },
        { note: "クリダメ+5% / 防御-6%", apply: (s) => ({ ...s, criDmg: s.criDmg + 0.05, def: scale(s.def, 0.94) }) },
    ],
    // 水は守り。防御で弾くか、HPで受けるか
    WATER: [
        { note: "防御+14% / 攻撃-10%", apply: (s) => ({ ...s, def: scale(s.def, 1.14), atk: scale(s.atk, 0.90) }) },
        { note: "HP+12% / 速度-4%", apply: (s) => ({ ...s, hp: scale(s.hp, 1.12), spd: scale(s.spd, 0.96) }) },
    ],
    // 電気は手数。速く動くか、外さなくなるか
    ELECTRIC: [
        { note: "速度+6% / HP-10%", apply: (s) => ({ ...s, spd: scale(s.spd, 1.06), hp: scale(s.hp, 0.90) }) },
        { note: "命中+8% / 防御-10%", apply: (s) => ({ ...s, accuracy: Math.min(1, s.accuracy + 0.08), def: scale(s.def, 0.90) }) },
    ],
    // 木は粘り。HPで受けるか、防御で受けるか
    GRASS: [
        { note: "HP+14% / 攻撃-10%", apply: (s) => ({ ...s, hp: scale(s.hp, 1.14), atk: scale(s.atk, 0.90) }) },
        { note: "防御+12% / 攻撃-8%", apply: (s) => ({ ...s, def: scale(s.def, 1.12), atk: scale(s.atk, 0.92) }) },
    ],
    /*
     * 光と闇は会心のまま。**依頼は「火水木電気で上がるものが決まっているのがつまらない」**で、
     * ここは名指しされていない。加えて会心は `tests/secondaryStatsFinal.test.ts` が
     * CR15〜23% / CD150〜170% に平準化しており、素の上限(CR20% / CD165%)から
     * 動かせる幅が +3% / +5% しかない。大きく振ると範囲を割る。
     */
    LIGHT: [
        { note: "クリ率+3% / 防御-6%", apply: (s) => ({ ...s, criRate: Math.min(1, s.criRate + 0.03), def: scale(s.def, 0.94) }) },
        { note: "命中+7% / HP-6%", apply: (s) => ({ ...s, accuracy: Math.min(1, s.accuracy + 0.07), hp: scale(s.hp, 0.94) }) },
    ],
    DARK: [
        { note: "クリダメ+5% / HP-5%", apply: (s) => ({ ...s, criDmg: s.criDmg + 0.05, hp: scale(s.hp, 0.95) }) },
        { note: "攻撃+10% / 防御-12%", apply: (s) => ({ ...s, atk: scale(s.atk, 1.10), def: scale(s.def, 0.88) }) },
    ],
};
/**
 * どの型を使うかを、テンプレートIDと属性から決める。
 *
 * **乱数は使わない。**同じモンスターを何度見ても同じ型になること、
 * セーブに何も持たなくてよいことの両方が要る。
 */
export function elementFlavorIndexOf(templateId, element, count) {
    /*
     * **最後にビットを混ぜてから剰余を取る。**
     *
     * ここは2回間違えた。`hash * 31 + code` も FNV-1a も、掛ける数が奇数なので
     * **最下位ビットが全文字コードの最下位ビットのXORのまま**になる。
     * 型が2つだと剰余2、つまり最下位ビットしか見ないので、
     * 「FIREとGRASSは必ず同じ型、WATERとELECTRICは必ず同じ型」という並びになり、
     * 表を出すと全モンスターが2グループに分かれるだけだった
     * (属性ごとに変える、という狙いがまるごと外れていた)。
     *
     * 剰余を取る前に上位ビットを下位へ折り返す(murmur3 の仕上げと同じ形)。
     * `tests/elementFlavor.test.ts` が、実際に属性ごとに割れているかを見張る。
     */
    const key = `${templateId}_${element}`;
    let hash = 2166136261;
    for (let i = 0; i < key.length; i += 1) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507) >>> 0;
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3266489909) >>> 0;
    hash ^= hash >>> 16;
    return (hash >>> 0) % count;
}
/** そのモンスターに掛かる属性補正。図鑑やテストから中身を説明できるよう note も返す */
export function elementStatFlavorOf(templateId, element) {
    const flavors = ELEMENT_STAT_FLAVORS[element];
    return flavors[elementFlavorIndexOf(templateId, element, flavors.length)];
}
/**
 * 既存の弱いスキルだけを対象にした2026-09-01の底上げ。
 *
 * 原型配列の並び順は属性ごとのスキル割り当てに使われているため、データ本体を並べ替えず
 * 実体化の直前にIDで差し替える。光/闇固有技や新規高レアには一切波及しない。
 */
function applyLegacySkillBalance(skill) {
    skill = applySeptemberSkillBalance(skill);
    switch (skill.id) {
        case "slime_s3_a":
            return {
                ...skill,
                description: "限界を超えた力で敵全体に攻撃力1.8倍のダメージを与える。この攻撃で敵を倒していた場合、自身の行動ゲージを20%進める。",
                effects: [
                    { kind: "DAMAGE", multiplier: 1.8 },
                    { kind: "GAUGE", amount: 0.2, applyTo: "SELF", requires: "KILLED_TARGET" },
                ],
            };
        case "slime_s3_c":
            return {
                ...skill,
                description: "眩い粘液を弾けさせ、敵全体に攻撃力1.5倍のダメージを与え、75%で2ターン暗闇を付与する。",
                effects: [
                    { kind: "DAMAGE", multiplier: 1.5 },
                    { kind: "BLIND", durationTurns: 2, chance: 0.75 },
                ],
            };
        case "wolf_s3_a":
            return {
                ...skill,
                description: "渾身の一撃(2.8倍)を叩き込み、50%で相手をスタンさせる。",
                effects: [
                    { kind: "DAMAGE", multiplier: 2.8 },
                    { kind: "STUN", durationTurns: 1, chance: 0.5 },
                ],
            };
        case "wolf_s3_b":
            return {
                ...skill,
                description: "敵単体に攻撃力0.85倍のダメージを3回与え、1撃ごとに防御力を25%低下させる。",
                effects: skill.effects.map((effect) => effect.kind === "DAMAGE" ? { ...effect, multiplier: 0.85 } : effect),
            };
        case "imp_s3_a":
            return {
                ...skill,
                description: "敵全体に攻撃力1.1倍のダメージを与え、75%で2ターン攻撃力を大きく低下させ、行動ゲージを15%減少させる。",
                effects: [
                    { kind: "DAMAGE", multiplier: 1.1 },
                    { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.75 },
                    { kind: "GAUGE", amount: -0.15 },
                ],
            };
        case "imp_s3_b":
            return {
                ...skill,
                description: "敵全体に攻撃力1.1倍のダメージを与え、75%で全員のスキルのクールタイムを1ターン延長する。",
                cooldownTurns: 4,
                effects: [
                    { kind: "DAMAGE", multiplier: 1.1 },
                    { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.75 },
                ],
            };
        case "wisp_s2_b":
            return {
                ...skill,
                description: "味方全体の素早さを2ターン上昇させ、行動ゲージを25%進める。",
                effects: skill.effects.map((effect) => effect.kind === "GAUGE" ? { ...effect, amount: 0.25 } : effect),
            };
        case "fairy_s3_c":
            return {
                ...skill,
                description: "味方全体のHPを最大HPの25%回復し、防御力を2ターン上昇させる。",
                cooldownTurns: 4,
                effects: [
                    { kind: "HEAL", healRate: 0.25 },
                    { kind: "BUFF", stat: "def", amount: 0.3, durationTurns: 2 },
                ],
            };
        case "knight_s3_b":
            return {
                ...skill,
                description: "敵全体に攻撃力1.5倍のダメージを与え、60%で1ターン行動不能にする。",
                effects: [
                    { kind: "DAMAGE", multiplier: 1.5 },
                    { kind: "STUN", durationTurns: 1, chance: 0.6 },
                ],
            };
        case "chronos_s3_b": {
            /*
             * **素直に2つ並べる。**
             *
             * 以前は「GAUGEに発動率が無い」という理由で、0ターンのスタンを
             * 発動判定の印として使い、外れた時だけ +100% を足して打ち消す、
             * という組み方をしていた。**GAUGEに `chance` が入った後もそのまま
             * 残っていて**、画面には
             *   「70%でスタン(0ターン) / 行動ゲージ-100%(スタンが失敗したらさらに100%)」
             * と出ていた。何が起きるのか誰にも読めない(依頼主の指摘)。
             *
             * 発動率はそれぞれの効果が自分で持てるので、書いたままが起きる形にする。
             */
            return {
                ...skill,
                description: "時空が軋み、敵全体に攻撃力1.0倍のダメージを与える。"
                    + "70%で行動ゲージを100%減少させ、20%で1ターン行動不能にする。",
                effects: [
                    { kind: "DAMAGE", multiplier: 1.0 },
                    { kind: "GAUGE", amount: -1, chance: 0.7 },
                    { kind: "STUN", durationTurns: 1, chance: 0.2 },
                ],
            };
        }
        default:
            return skill;
    }
}
/**
 * 属性(ELEMENTS配列中の並び順)に応じて、スキル候補の中から1つを決定的に選ぶ。
 * candidateCountより属性数が多い場合、単純な剰余だけだと複数の属性が同じ添字に
 * 揃ってしまう(例: 候補3種×属性6なら2属性ずつ完全に同じ組み合わせになる)。
 * groupOffsetを1にすると、2周目以降の属性ではさらに1つずらした添字を使うため、
 * skill2とskill3を異なるgroupOffsetで選べば、6属性すべてで(skill2, skill3)の
 * 組み合わせが重複しなくなる。
 */
function pickSkillVariant(variants, element, groupOffset) {
    const elementIndex = ELEMENTS.indexOf(element);
    const group = Math.floor(elementIndex / variants.length);
    const index = (elementIndex + group * groupOffset) % variants.length;
    return variants[index];
}
export function createMonsterVariant(template, element) {
    const flavoredStats = template.noElementFlavor
        ? cloneStats(template.baseStats)
        : elementStatFlavorOf(template.templateId, element).apply(cloneStats(template.baseStats));
    const assignment = template.skillAssignment?.[element];
    const skill2 = applyLegacySkillBalance(template.skill2Variants[assignment?.skill2 ?? -1] ?? pickSkillVariant(template.skill2Variants, element, 0));
    // 光/闇に固有のスキル3があれば、候補からの抽選より優先する
    const uniqueSkill3 = element === "LIGHT" ? template.lightSkill3 : element === "DARK" ? template.darkSkill3 : undefined;
    const skill3 = applyLegacySkillBalance(uniqueSkill3
        ?? template.skill3Variants[assignment?.skill3 ?? -1]
        ?? pickSkillVariant(template.skill3Variants, element, 1));
    return {
        id: `${template.templateId}_${element}`,
        templateId: template.templateId,
        name: `${template.baseName}[${ELEMENT_JA[element]}]`,
        element,
        color: ELEMENT_COLOR[element],
        role: template.role,
        emoji: template.emoji,
        stats: template.templateId === "phoenix" && element === "DARK" ? { ...flavoredStats, atk: 160, def: 65 } : flavoredStats,
        skills: [applyLegacySkillBalance(template.skill1), skill2, skill3],
        bossTraits: template.bossTraits,
        dexNote: template.dexNote,
    };
}
/** テンプレートから(elements指定があればその範囲、なければ全6属性の)色違いバリエーションを生成する */
export function createAllVariants(template) {
    return (template.elements ?? ELEMENTS).map((element) => createMonsterVariant(template, element));
}
