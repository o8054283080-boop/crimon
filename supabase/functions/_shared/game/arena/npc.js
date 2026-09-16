/**
 * アリーナのNPC対戦相手を組み立てる。
 *
 * ## NPCは「疑似プレイヤー」であって、強化された敵ではない
 *
 * ここで作るのは **プレイヤーが自分の手で作れる編成**だけ。最終ステータスは
 * `toBattleDefinition(instance, dex, equipment)` の1本でしか決まらず、
 * このファイルはそこへ渡す `MonsterInstance` と `Equipment[]` を組むだけで終わる。
 * **ステータスへ倍率を掛ける処理を、ここに足してはいけない。**
 * 足した瞬間、NPCは「どう育てても再現できない相手」になり、
 * 負けた理由が育成の差ではなく仕様の差になる。
 *
 * ## 例外は1つだけ。レート3000より上
 *
 * 3000あたりで、育成の範囲内で作れる強さの天井に届く。星もレベルも装備の強化も
 * 能力ポイントも上限に張り付き、最後に残っていた装備の厳選も22本でほぼ最適へ
 * 届くので、そこから先は何を積んでも差が出ない。依頼主の判断で、
 * **3000より上の帯だけ**HP・攻撃・防御へ倍率を掛けている
 * (`ArenaNpcBand.statMultiplier`)。
 *
 * **それでも、掛ける場所はここではない。**このファイルがやるのは
 * 「帯が持っている倍率を控えへ書き写す」ことだけで、実際に掛かるのは
 * `snapshot.ts` の `snapshotToDefinitions` の中。アリーナの戦闘は3か所で
 * 組まれるが、どこも必ずそこを通るので、1か所に置けば全部そろう。
 *
 * 上限は既存の定数をそのまま守る。
 *   - 強化レベル …… `EQUIP_MAX_LEVEL`(15)
 *   - 能力ポイント … `ABILITY_POINT_BUDGETS`(星4:20 / 星5:50 / 星6:100)
 *   - レベル ……… `STAR_MAX_LEVEL`
 *   - スキルレベル … `MAX_SKILL_LEVEL`
 *   - 装備スロット … `EQUIP_SLOTS`(プレイヤーと同じ6枠)
 *   - 潜在覚醒 …… `LATENT_ABILITY_CANDIDATES[dexId]` に実在するIDだけ
 *
 * ## 数字はこのファイルに書かない
 *
 * レート帯ごとの育ち具合は `data/arena/npcConfig.ts`、顔ぶれは
 * `data/arena/npcTeams.ts`、名前は `data/arena/npcNames.ts`。
 * ここにあるのは「表をどう読むか」だけにしてある。
 *
 * ## 保存せず、種から毎回組み直す
 *
 * 相手を焼いて保存すると、装備や育成の仕様を変えたときに
 * **セーブの中の相手だけが古い規則のまま残る。**
 * 種(seed)だけを持てば、規則の変更が常に全員へ行き渡る。
 */
import { EQUIP_MAX_LEVEL, EQUIP_SLOTS, SET_TYPES, SLOT_MAIN_STAT_OPTIONS, enhanceEquipment, generateEquipment, } from "../../core/equipment.js";
import { ABILITY_POINT_BUDGETS, } from "../../core/monsterDevelopment.js";
import { STAR_MAX_LEVEL } from "../../core/rarity.js";
import { MAX_SKILL_LEVEL } from "../../core/skill.js";
import { LATENT_ABILITY_CANDIDATES } from "../../data/latentAbilities.js";
import { arenaTierForRating } from "../../data/arena/ranks.js";
import { ARENA_NPC_DEFAULT_COUNT, ARENA_NPC_MAX_RATING, ARENA_NPC_RATING_JITTER, ARENA_NPC_RATING_OFFSETS, ARENA_NPC_ROLE_PLANS, VARIABLE_SLOTS, arenaNpcBandForRating, } from "../../data/arena/npcConfig.js";
import { ARENA_NPC_NAME_CLANS, ARENA_NPC_NAME_CORES, ARENA_NPC_NAME_DECORATIONS } from "../../data/arena/npcNames.js";
import { ARENA_NPC_TEAMS, arenaNpcTeamsForTiers } from "../../data/arena/npcTeams.js";
import { ARENA_SNAPSHOT_VERSION } from "./types.js";
/* ==========================================================================
 * 乱数
 *
 * 既存アリーナ(`game/pvpArena.ts`)と同じ実装を、こちらの中に持つ。
 * あちらを参照すると、旧アリーナを畳む時にこちらが道連れになる。
 * ========================================================================== */
/** 種から決まる乱数。**同じ種なら必ず同じNPCが組み上がる** */
export function arenaNpcRng(seed) {
    let a = seed | 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function pick(items, rng) {
    return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
/** 下限・上限を含む整数の抽選 */
function pickInt(range, rng) {
    const [lo, hi] = range;
    if (hi <= lo)
        return lo;
    return lo + Math.floor(rng() * (hi - lo + 1));
}
function pickRatio(range, rng) {
    const [lo, hi] = range;
    return hi <= lo ? lo : lo + rng() * (hi - lo);
}
function pickStar(band, rng) {
    const total = band.starWeights.reduce((sum, w) => sum + w.weight, 0);
    let roll = rng() * total;
    for (const option of band.starWeights) {
        if (roll < option.weight)
            return option.star;
        roll -= option.weight;
    }
    return band.starWeights[band.starWeights.length - 1].star;
}
/* ==========================================================================
 * 装備
 * ========================================================================== */
/**
 * 可変スロット(2/4/6)で、役割に合うメインOPを引くまで振り直す。
 *
 * 生成をそのまま使うと、速攻の型でも速度のメインが1つも出ないことがある。
 * それでは「速攻の相手」と名乗れない。ただし**振り直し回数は帯ごとの設定**で、
 * 下の帯はわざと少なくしてある。役割に合っていない装備を着ている相手が
 * 混じることが、そのまま「まだ育て切っていない人」の姿になる。
 *
 * 引けなかった場合は最後に振ったものをそのまま使う。**狙ったOPを後から
 * 書き換えることはしない**(生成規則の外の装備が生まれてしまう)。
 */
function generateRoleEquipment(slot, star, subStatCount, set, wanted, rerolls, rng) {
    const options = SLOT_MAIN_STAT_OPTIONS[slot];
    const targets = wanted.filter((stat) => options.includes(stat));
    let equipment = generateEquipment({ slot, star, subStatCount, set, rng });
    if (targets.length === 0)
        return equipment;
    for (let i = 0; i < rerolls && !targets.includes(equipment.mainStat.type); i += 1) {
        equipment = generateEquipment({ slot, star, subStatCount, set, rng });
    }
    return equipment;
}
/**
 * サブOPが役割にどれだけ噛み合っているか。**大きいほど良い装備。**
 *
 * 見るのはサブOPだけ。メインは `generateRoleEquipment` が先に合わせているので、
 * ここで一緒に数えると「メインが当たった装備」ばかりが選ばれ、
 * サブの厳選という軸が消える。
 *
 * ## 種類の重みと、値の大きさを両方見る
 *
 * 役割の希望一覧(`subStats`)の**前にあるものほど重く**数える。攻撃型にとって
 * クリダメと攻撃実数では値打ちが違うので、本数だけ数えると
 * 「当たりでないOPが4つ乗った装備」を選んでしまう。
 *
 * 値の方は**その項目の中での相対値**にする。HP実数(2,000前後)と
 * クリダメ(0.3前後)を素の数字で足すと、実数系のOPだけで順位が決まる。
 */
function gearRoleScore(equipment, wantedSubs) {
    let score = 0;
    for (const sub of equipment.subStats) {
        const rank = wantedSubs.indexOf(sub.type);
        if (rank < 0)
            continue;
        // 1位が1.0、以降なだらかに下がる。希望の外は0点
        const weight = 1 / (1 + rank * 0.45);
        /*
         * 同じ項目どうしで比べるための目安。★6のサブは
         * 「初期値の2割 × 星6倍率」あたりから始まり、強化で増える。
         * 厳密な上限ではなく**桁を合わせるための割り算**なので、多少粗くてよい。
         */
        const scale = SUB_STAT_REFERENCE[sub.type];
        score += weight * (sub.value / scale);
    }
    return score;
}
/**
 * サブOP1つぶんの「だいたいこのくらい」の値。**桁合わせにだけ使う。**
 * ★6のサブOPが強化を経て落ち着くあたりを置いてある。
 */
const SUB_STAT_REFERENCE = {
    ATK_FLAT: 60,
    DEF_FLAT: 54,
    HP_FLAT: 660,
    ATK_PERCENT: 0.16,
    DEF_PERCENT: 0.16,
    HP_PERCENT: 0.16,
    SPD: 21,
    CRIT_RATE: 0.09,
    CRIT_DMG: 0.14,
    ACCURACY: 0.14,
    RESISTANCE: 0.14,
};
/**
 * 装備1個を `rolls` 本引いて、**役割にいちばん噛み合う1本を残す。**
 *
 * 引いた装備は毎回**最後まで強化してから**見比べる。強化の節目(+3/+6/+9/+12/+15)で
 * サブOPが増えたり伸びたりするので、鍛える前に比べると本当の当たりが分からない。
 * 実際のプレイヤーも、鍛えてみて初めて当たりかどうかが決まる。
 *
 * `rolls` が 1 以下なら今までどおり1本引いて終わり。**下の帯の挙動は変わらない。**
 */
function pickBestRoleEquipment(slot, star, subStatCount, set, wantedMains, wantedSubs, mainRerolls, enhanceTo, rolls, rng) {
    const attempts = Math.max(1, Math.floor(rolls));
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < attempts; i += 1) {
        const candidate = generateRoleEquipment(slot, star, subStatCount, set, wantedMains, mainRerolls, rng);
        for (let level = 0; level < enhanceTo; level += 1)
            enhanceEquipment(candidate, rng);
        const score = gearRoleScore(candidate, wantedSubs);
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }
    return best;
}
/**
 * 6スロットぶんの装備を組む。
 *
 * シリーズは 4個 + 2個 でそろえる。ただし `setCoherence` を下回った時は
 * バラバラのまま着せる——**下の帯で「セットが揃っていない相手」を再現するため。**
 * 揃えられるかどうかは装備の集まり具合そのもので、育成の進み具合の一部になる。
 */
function buildUnitEquipment(member, team, band, unitId, rng) {
    const plan = ARENA_NPC_ROLE_PLANS[member.role];
    const primary = team.set ?? plan.sets.primary;
    const secondary = plan.sets.secondary === primary ? plan.sets.primary : plan.sets.secondary;
    const coherent = rng() < band.setCoherence;
    // 4個セットに使う枠を決める。決定的に選びたいので、乱数で並べ替えず先頭4枠を使う
    const fourPieceSlots = new Set(EQUIP_SLOTS.slice(0, 4));
    const gear = [];
    for (const slot of EQUIP_SLOTS) {
        const set = coherent
            ? (fourPieceSlots.has(slot) ? primary : secondary)
            : pick(SET_TYPES, rng);
        const star = pickInt(band.equipStar, rng);
        const subStatCount = pickInt(band.equipSubStats, rng);
        const wanted = VARIABLE_SLOTS.includes(slot)
            ? plan.mainStats[slot]
            : [];
        const enhance = Math.min(EQUIP_MAX_LEVEL, pickInt(band.equipEnhance, rng));
        /*
         * **強化はここではなく選ぶ側の中でやる。**
         * 鍛えた後の姿を見比べないと、サブOPの当たり外れが判定できない
         * (節目でサブが増えるので、鍛える前は本数すら違う)。
         * `gearRolls` が無い帯は1本引いて終わりなので、今までと同じ挙動になる。
         */
        const equipment = pickBestRoleEquipment(slot, star, subStatCount, set, wanted, plan.subStats, band.mainStatRerolls, enhance, band.gearRolls ?? 1, rng);
        // 生成側のIDは時刻とカウンタを含むので、同じ種でも一致しない。
        // **決定的であることが契約**なので、種から決まるIDへ置き換える
        equipment.id = `${unitId}_eq${slot}`;
        gear.push(equipment);
    }
    return gear;
}
/* ==========================================================================
 * 育成
 * ========================================================================== */
const ALLOCATABLE_STATS = ["hp", "atk", "def", "spd"];
/**
 * 能力ポイントを役割に沿って配る。
 *
 * **星別上限(`ABILITY_POINT_BUDGETS`)を1点も超えない。** 端数は
 * いちばん重い枠へ寄せる(切り捨てで合計が予算より減るのは構わないが、
 * 増えるのは絶対にいけない)。
 */
function allocateAbilityPoints(role, star, ratio) {
    const budget = ABILITY_POINT_BUDGETS[star];
    const total = Math.max(0, Math.min(budget, Math.floor(budget * ratio)));
    const weights = ARENA_NPC_ROLE_PLANS[role].abilityWeights;
    const points = { hp: 0, atk: 0, def: 0, spd: 0 };
    if (total <= 0)
        return points;
    let assigned = 0;
    for (const stat of ALLOCATABLE_STATS) {
        const amount = Math.floor(total * weights[stat]);
        points[stat] = amount;
        assigned += amount;
    }
    // 端数は最も重い枠へ。重みが同じなら並び順の先頭が取る(決定的にする)
    let heaviest = "hp";
    for (const stat of ALLOCATABLE_STATS) {
        if (weights[stat] > weights[heaviest])
            heaviest = stat;
    }
    points[heaviest] += total - assigned;
    return points;
}
/**
 * 潜在覚醒を1つ選ぶ。
 *
 * **候補は必ず `LATENT_ABILITY_CANDIDATES[dexId]` の中から取る。**
 * それらしいIDを組み立てて書くと、`toBattleDefinition` の解決が黙って
 * undefined を返し、「覚醒しているのに何も起きない相手」になる。
 * 候補が無い個体(あり得ないはずだが)は素直に未覚醒にする。
 */
function pickLatentAbilityId(dexId, role, rng) {
    const candidates = LATENT_ABILITY_CANDIDATES[dexId];
    if (!candidates || candidates.length === 0)
        return null;
    for (const category of ARENA_NPC_ROLE_PLANS[role].latentCategories) {
        const matched = candidates.filter((candidate) => candidate.category === category);
        if (matched.length > 0)
            return pick(matched, rng).id;
    }
    return pick(candidates, rng).id;
}
/** NPC1体分。プレイヤーの手持ちと同じ形にする */
function buildUnit(member, team, band, unitId, rng) {
    const star = pickStar(band, rng);
    const maxLevel = STAR_MAX_LEVEL[star];
    const level = Math.max(1, Math.min(maxLevel, Math.round(maxLevel * pickRatio(band.levelRatio, rng))));
    const skillLevels = [0, 1, 2].map(() => Math.max(1, Math.min(MAX_SKILL_LEVEL, pickInt(band.skillLevel, rng))));
    const hasType = rng() < band.typeChance;
    const hasLatent = rng() < band.latentChance;
    const development = {
        schemaVersion: 1,
        type: hasType ? member.role : null,
        // タイプ転生していない個体にも能力ポイントは振れる(別の育成要素なので)
        abilityPoints: allocateAbilityPoints(member.role, star, pickRatio(band.abilityPointRatio, rng)),
        latentAbilityId: hasLatent ? pickLatentAbilityId(member.dexId, member.role, rng) : null,
        latentReselectPending: false,
    };
    const equipment = buildUnitEquipment(member, team, band, unitId, rng);
    const equipMap = {};
    for (const item of equipment)
        equipMap[item.slot] = item.id;
    const instance = {
        id: unitId,
        dexId: member.dexId,
        star,
        level,
        exp: 0,
        equipment: equipMap,
        skillLevels,
        development,
    };
    return { instance, equipment };
}
/* ==========================================================================
 * 名前
 * ========================================================================== */
function buildNpcName(rng) {
    return `${pick(ARENA_NPC_NAME_CLANS, rng)}${pick(ARENA_NPC_NAME_CORES, rng)}${pick(ARENA_NPC_NAME_DECORATIONS, rng)}`;
}
/* ==========================================================================
 * NPC1人
 * ========================================================================== */
/** 種と並び位置から、その相手専用の種を作る(隣同士が似ないように混ぜる) */
function unitSeed(seed, index) {
    return (Math.imul(seed | 0, 1000003) + Math.imul(index + 1, 7919) + 0x5f3a) | 0;
}
/**
 * NPCを1人組み立てる。
 *
 * `rating` は**並べる基準のレート**で、そこから並び位置ごとの差と揺らぎを乗せた値が
 * その相手のレートになる。勝てそうな相手・互角・格上が必ず混ざるようにするため
 * (`ARENA_NPC_RATING_OFFSETS`)。育ち具合は**乗せたあとのレート**の帯で決まるので、
 * 帯をまたいだ相手が並ぶこともある。それは実際のプレイヤーの一覧でも起きること。
 */
export function buildArenaNpc(rating, seed, index, 
/**
 * すでに並んでいる編成。**同じ顔ぶれを続けて出さないため**に避ける。
 * 候補を使い切ったら重複を許す——「同じ相手を避ける」ために枠が空くのは、
 * 避けるより悪い(候補一覧の混ぜ方と同じ考え方)。
 */
excludeTeamIds) {
    const rng = arenaNpcRng(unitSeed(seed, index));
    const offset = ARENA_NPC_RATING_OFFSETS[index % ARENA_NPC_RATING_OFFSETS.length];
    const jitter = Math.round((rng() * 2 - 1) * ARENA_NPC_RATING_JITTER);
    const opponentRating = Math.min(ARENA_NPC_MAX_RATING, Math.max(0, Math.round(rating + offset + jitter)));
    const band = arenaNpcBandForRating(opponentRating);
    const pool = arenaNpcTeamsForTiers(band.teamTiers);
    const fresh = excludeTeamIds ? pool.filter((entry) => !excludeTeamIds.has(entry.id)) : pool;
    const team = pick(fresh.length > 0 ? fresh : pool, rng);
    const name = buildNpcName(rng);
    const id = `npc_${seed >>> 0}_${index}`;
    const units = team.members.map((member, memberIndex) => buildUnit(member, team, band, `${id}_u${memberIndex}`, rng));
    const defense = {
        version: ARENA_SNAPSHOT_VERSION,
        // NPCは焼いた瞬間というものが無い。**0で固定する**——
        // Date.now() を入れると同じ種でも中身が変わり、決定性が壊れる
        capturedAt: 0,
        units,
        /*
         * レート3000より上の帯だけが倍率を持つ。**持たない帯では項目ごと付けない**——
         * 1 を入れて回ると、控えを見た時に「倍率のあるNPC」と区別が付かなくなる。
         * 掛けるのは `snapshotToDefinitions` の中だけ(3か所ある戦闘の組み立てが
         * どこも必ずそこを通るので、1か所に置けば全部そろう)。
         */
        ...(band.statMultiplier ? { statMultiplier: band.statMultiplier } : {}),
    };
    return {
        index,
        npcGenerationIndex: index,
        kind: "NPC",
        id,
        name,
        rating: opponentRating,
        tierId: arenaTierForRating(opponentRating).id,
        archetypeName: team.name,
        archetypeNote: team.note,
        defense,
    };
}
/** NPCを並べる。種が同じなら必ず同じ顔ぶれになる */
export function buildArenaNpcs(rating, seed, count = ARENA_NPC_DEFAULT_COUNT) {
    /*
     * **編成が重ならないように配る。**
     *
     * 1人ずつ独立に抽選すると、候補が3つしかない帯では5人中3人が
     * 同じ編成になる(実機でそうなった)。並んだ相手がどれも同じ顔ぶれだと、
     * 「どれに挑むか」を選ぶ意味そのものが消える。
     *
     * すでに出した編成を避けながら順に配る。同じ種なら同じ結果になる
     * (避ける集合も順番も決まっているので、決定性は崩れない)。
     */
    const used = new Set();
    const list = [];
    for (let index = 0; index < count; index += 1) {
        const entry = buildArenaNpc(rating, seed, index, used);
        const id = entry.archetypeName ? (teamIdByName(entry.archetypeName) ?? entry.archetypeName) : "";
        /*
         * **使い切ったら数え直す。** 避ける集合を持ち越したままだと、
         * 候補が尽きた後は毎回同じ1つを引き続ける(実機で 石垣 が3回並んだ)。
         * ここで空にすると2周目が始まり、同じ編成は多くても2回までになる。
         */
        if (id && used.has(id))
            used.clear();
        if (id)
            used.add(id);
        list.push(entry);
    }
    return list;
}
/** 表示名から編成IDを引く。名前は編成ごとに一意(テストが見張っている) */
function teamIdByName(name) {
    return ARENA_NPC_TEAMS.find((team) => team.name === name)?.id ?? null;
}
