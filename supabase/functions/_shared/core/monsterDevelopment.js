import { balanceFlags } from "./balanceFlags.js";
import { createDefaultTalentState } from "./talents.js";
/**
 * 確定した能力ポイントを振り直す費用。
 *
 * **初回の配分は無料。** ここで取るのは「一度決めたものを変える」代金で、
 * 決めること自体に金を取ると、触るのが怖くて誰も配らなくなる。
 */
export const ABILITY_POINT_RESET_COST = 300_000;
/** タイプ転生。能力ポイントも一緒に戻るので、リセットと同額に揃えてある */
export const TYPE_REINCARNATION_GOLD_COST = 300_000;
/** 星ごとの配分上限。能力ポイントは星4で解放される。 */
export const ABILITY_POINT_BUDGETS = { 1: 0, 2: 0, 3: 0, 4: 20, 5: 50, 6: 100 };
/** @deprecated 星別上限には abilityPointBudget を使用する。 */
export const ABILITY_POINT_BUDGET = ABILITY_POINT_BUDGETS[6];
export function abilityPointBudget(star) {
    return ABILITY_POINT_BUDGETS[star];
}
/**
 * 能力付与の正式換算値。必ずこの一か所から参照する。
 *
 * **DEFは3から5へ上げてある。**防御計算が `1000/(1000+1.2×DEF)` に変わり、
 * 軽減が攻撃力との比ではなく**DEFの値だけ**で決まるようになったため、
 * 3のままだと1pt振っても軽減率がほとんど動かず、選ぶ意味が無くなっていた。
 *
 * ポイントの振り分けは個体に**pt数だけ**を保存しているので、この値を変えると
 * 既に振ってある個体にもそのまま効く(控えの移行は要らない)。
 */
export const ABILITY_POINT_VALUES = {
    hp: 20,
    atk: 2,
    def: 5,
    spd: 0.1,
};
/**
 * 検証用の上書きを乗せた、実際に使われるタイプ倍率。
 *
 * **本番の経路もここを通る。**上書きが無ければ `MONSTER_TYPE_STAT_MULTIPLIERS`
 * をそのまま返すので、既定では1つも変わらない。
 * バランス検証で「体力タイプのHP倍率だけ変えたら何が起きるか」を
 * 本番データを書き換えずに測るために置いた。
 */
export function effectiveTypeMultipliers(type) {
    const override = balanceFlags.typeMultiplierOverride?.[type];
    if (!override)
        return MONSTER_TYPE_STAT_MULTIPLIERS[type];
    return { ...MONSTER_TYPE_STAT_MULTIPLIERS[type], ...override };
}
/** 同上。能力付与の1ptあたりの値 */
export function effectiveAbilityPointValues() {
    const override = balanceFlags.abilityPointOverride;
    if (!override)
        return ABILITY_POINT_VALUES;
    return { ...ABILITY_POINT_VALUES, ...override };
}
/**
 * タイプ転生の正式倍率。
 *
 * ## 体力型と防御型は、**場面で入れ替わる**ように置いてある
 *
 * 防御計算が `1000/(1000+1.2×DEF)` になり、DEFの値だけで軽減率が決まるようになった。
 * そのままだと防御型が一方的に硬くなるので、**DEFが効かない場面**を対にして置いた。
 *
 *   ・通常       防御型が上(体力型は同じ耐久を出すのに約88.5点ぶんしか稼げない)
 *   ・防御低下中  体力型が上(防御型は78.4点まで落ちる)
 *   ・防御無視    体力型が**約3倍**強い
 *
 * 体力型の `def: 0.90` と防御型の `hp: 0.85` は、この入れ替えを作るための短所。
 * どちらか片方だけ動かすと3段階が崩れるので、**必ず162個体で測り直すこと**
 * (`npx tsx tools/playerTypeAbilityAudit.ts --runs 200`)。
 */
export const MONSTER_TYPE_STAT_MULTIPLIERS = {
    ATTACK: { hp: 0.85, atk: 1.20, def: 0.90, spd: 1, criRate: 0.10, criDmg: 0, accuracy: 0, resistance: -0.10 },
    HP: { hp: 1.10, atk: 0.85, def: 0.90, spd: 1, criRate: -0.05, criDmg: -0.10, accuracy: 0, resistance: 0.10 },
    DEFENSE: { hp: 0.85, atk: 0.90, def: 1.40, spd: 1, criRate: -0.10, criDmg: -0.10, accuracy: 0, resistance: 0.10 },
    SUPPORT: { hp: 1.10, atk: 0.85, def: 1, spd: 1.10, criRate: 0, criDmg: -0.15, accuracy: 0, resistance: 0.05 },
    DISRUPT: { hp: 1, atk: 0.85, def: 1, spd: 1.08, criRate: 0, criDmg: -0.15, accuracy: 0.15, resistance: -0.05 },
    BALANCE: { hp: 1, atk: 1, def: 1, spd: 1, criRate: 0, criDmg: 0, accuracy: 0, resistance: 0 },
};
export const MONSTER_TYPE_DESCRIPTIONS = {
    ATTACK: "長所: ATK +20%・クリ率 +10pt / 短所: HP -15%・DEF -10%・抵抗 -10pt",
    HP: "長所: HP +10%・抵抗 +10pt / 短所: ATK -15%・DEF -10%・クリ率 -5pt・クリダメ -10pt",
    DEFENSE: "長所: DEF +40%・抵抗 +10pt / 短所: HP -15%・ATK -10%・クリ率 -10pt・クリダメ -10pt",
    SUPPORT: "長所: SPD +10%・HP +10%・抵抗 +5pt / 短所: ATK -15%・クリダメ -15pt",
    DISRUPT: "長所: SPD +8%・的中 +15pt / 短所: ATK -15%・クリダメ -15pt・抵抗 -5pt",
    BALANCE: "すべての能力補正なし。長所も短所もない標準型",
};
export const MONSTER_TYPE_LABELS = {
    ATTACK: "攻撃", HP: "体力", DEFENSE: "防御", SUPPORT: "補助", DISRUPT: "妨害", BALANCE: "バランス",
};
export function createDefaultMonsterDevelopment() {
    return {
        schemaVersion: 1,
        type: null,
        abilityPoints: { hp: 0, atk: 0, def: 0, spd: 0 },
        latentAbilityId: null,
        latentReselectPending: false,
        /*
         * **新しい個体は必ず「未確定」から始める。**
         * ここを省くと、印が無い＝配分済みかどうかを配分量から推し量ることになり、
         * 1点振った瞬間に確定扱いになって残りが振れなくなる(実際にそうなった)。
         * 推し量るのは**印を知らない旧セーブだけ**の仕事。
         */
        abilityPointsConfirmed: false,
        talents: createDefaultTalentState(),
    };
}
