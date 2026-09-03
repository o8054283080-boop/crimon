/**
 * モンスターの検診。
 *
 * モンスターを1体足すのに、スキル7本(スキル1 + 変種3 + 変種3)と
 * その説明文を手で書くことになる。116行の入れ子で、**型チェックは通るのに
 * 中身が嘘になっている**という壊れ方をする。実際にこの検診を作った時点で、
 * バフ剥がしと回復封じが説明文に一言も書かれていないのが見つかった。
 *
 * ここが見るのは「型では分からないこと」だけ:
 *
 *   1. 説明文と効果の食い違い(書いてある数字が実際と違う)
 *   2. 説明文に出てこない効果(実際には起きるのに書いていない)
 *   3. idの規約と重複
 *   4. 属性ごとに3つのスキルが揃うか
 *   5. ステータスが同じ役割の帯から外れていないか
 *
 * 使い方:
 *   npx tsx tools/monsterDoctor.mts                # 全部を検診
 *   npx tsx tools/monsterDoctor.mts --id slime     # 1体だけ
 *   npx tsx tools/monsterDoctor.mts --table wolf   # 属性ごとに何が選ばれるかの表
 *   npx tsx tools/monsterDoctor.mts --new phoenix  # 雛形を書き出す
 */
import { ELEMENTS, ELEMENT_JA } from "../src/core/element.js";
import { MonsterTemplate, createMonsterVariant } from "../src/core/monster.js";
import type { Skill, SkillEffect } from "../src/core/skill.js";
import { ALL_MONSTER_TEMPLATES, MONSTER_TEMPLATES } from "../src/data/monsters.js";

/* ============================================================
 * 説明文に現れるべき言葉
 *
 * **実データから拾った語彙で組んである。**思い付きで決めると、
 * 正しい説明文まで叩き始めて誰も検診を信じなくなる。
 * 候補のどれか1つが入っていれば通す。
 * ============================================================ */
const REQUIRED_WORDS: Record<SkillEffect["kind"], string[]> = {
  DAMAGE: ["ダメージ", "一撃"],
  DEBUFF: ["低下"],
  BUFF: ["上昇", "高める"],
  POISON: ["毒"],
  BURN: ["火傷", "やけど"],
  BLIND: ["暗闇"],
  STUN: ["スタン", "気絶", "行動不能"],
  GAUGE: ["ゲージ"],
  SHIELD: ["シールド", "盾"],
  REGEN: ["毎ターン", "継続回復"],
  CLEANSE: ["解除"],
  HEAL: ["回復"],
  IMMUNITY: ["無効", "免疫"],
  LIFESTEAL: ["回復", "吸収"],
  COOLDOWN_EXTEND: ["クールタイム", "待ち時間"],
  /*
   * **この案件で実際に使っている言葉を全部入れること。**
   *
   * 「解除」と「回復阻害」が抜けていて、10件を「説明文に書かれていない」と
   * 報告し続けていた(CIが赤のままだった)。実際には全部書いてある——
   * `abyssreaper_s1` は「60%で有利な効果を1個解除する」、
   * `fenrir_s3_b` は「80%で2ターン回復阻害を付与し」と書いてある。
   *
   * 検査の語彙が実装の言葉より狭いと、**正しいものを間違いだと言い続ける。**
   * CLAUDE.md も「解除と回復阻害」と書いており、そちらが本来の言い方。
   */
  STRIP: ["剥が", "はが", "打ち消", "取り除", "解除"],
  HEAL_BLOCK: ["回復封じ", "回復不能", "回復を封", "回復阻害"],
};

interface Finding {
  level: "だめ" | "気になる";
  where: string;
  what: string;
}

const findings: Finding[] = [];
const note = (level: Finding["level"], where: string, what: string) => findings.push({ level, where, what });

function allSkills(t: MonsterTemplate): { slot: string; skill: Skill }[] {
  const out = [{ slot: "スキル1", skill: t.skill1 }];
  const label = (i: number) => "abcdefgh"[i] ?? String(i + 1);
  t.skill2Variants.forEach((s, i) => out.push({ slot: `スキル2-${label(i)}`, skill: s }));
  t.skill3Variants.forEach((s, i) => out.push({ slot: `スキル3-${label(i)}`, skill: s }));
  /*
   * 光/闇の固有スキルは、**変種の一覧にも同じものが入っていることがある**
   * (ドラゴンがそう)。同じ実体を二度数えると「idが重複している」と嘘の指摘が出る。
   */
  if (t.lightSkill3 && !t.skill3Variants.includes(t.lightSkill3)) out.push({ slot: "スキル3[光]", skill: t.lightSkill3 });
  if (t.darkSkill3 && !t.skill3Variants.includes(t.darkSkill3)) out.push({ slot: "スキル3[闇]", skill: t.darkSkill3 });
  return out;
}

/** 1. 説明文に書いてある数字が、実際の効果と合っているか */
function checkNumbers(where: string, skill: Skill): void {
  const d = skill.description ?? "";
  const effects = skill.effects as (SkillEffect & Record<string, unknown>)[];

  const declared = (re: RegExp, scale = 1) => [...d.matchAll(re)].map((m) => Number(m[1]) * scale);
  const actual = (key: string) => effects.map((e) => e[key]).filter((v): v is number => typeof v === "number");

  const pairs: { label: string; want: number[]; have: number[] }[] = [
    { label: "倍率", want: declared(/攻撃力([0-9.]+)倍/g), have: actual("multiplier") },
    { label: "発動率", want: declared(/([0-9]+)%で/g, 0.01), have: actual("chance") },
    { label: "ターン数", want: declared(/([0-9]+)ターン/g), have: [...actual("durationTurns"), ...actual("turns")] },
    { label: "回数", want: declared(/([0-9]+)回/g), have: actual("hits") },
  ];

  for (const { label, want, have } of pairs) {
    if (have.length === 0) continue;
    for (const w of want) {
      if (!have.some((h) => Math.abs(h - w) < 1e-6)) {
        note("だめ", where, `説明文の${label} ${w} が効果に無い(実際: ${have.join(", ")})`);
      }
    }
  }
}

/** 2. 実際には起きるのに、説明文に一言も書かれていない効果 */
function checkUndescribed(where: string, skill: Skill): void {
  const d = skill.description ?? "";
  for (const effect of skill.effects) {
    const words = REQUIRED_WORDS[effect.kind];
    if (!words || words.length === 0) continue;
    if (!words.some((w) => d.includes(w))) {
      note("だめ", where, `${effect.kind} が起きるのに説明文に書かれていない(「${words[0]}」など)`);
    }
  }
}

/** 3. idの規約と重複 */
function checkIds(t: MonsterTemplate, seen: Map<string, string>): void {
  for (const { slot, skill } of allSkills(t)) {
    const where = `${t.templateId} ${slot}`;
    if (!skill.id.startsWith(`${t.templateId}_`)) {
      note("気になる", where, `idが種族名で始まっていない: ${skill.id}`);
    }
    const already = seen.get(skill.id);
    if (already) note("だめ", where, `idが重複している: ${skill.id}(${already} と同じ)`);
    else seen.set(skill.id, where);
  }
}

/**
 * 4. 属性ごとに3つのスキルが揃うか。
 *
 * **どの属性がどの変種を引くかはハッシュで決まる。**「この種族は盾を張る」と
 * 思っていても、属性によっては盾を持たない変種が選ばれる。
 * 実際にこれで、試練の塔の「守りの階」の半数に盾を張れる敵が1体もいなかった。
 */
function checkVariants(t: MonsterTemplate): void {
  for (const element of t.elements ?? ELEMENTS) {
    const def = createMonsterVariant(t, element);
    if (def.skills.length !== 3 || def.skills.some((s) => !s)) {
      note("だめ", `${t.templateId}[${ELEMENT_JA[element]}]`, "スキルが3つ揃っていない");
    }
  }
}

/**
 * 5. ステータスが、同じ役割の既存から外れていないか。
 *
 * 外れ値そのものは悪ではない(尖った1体は要る)ので「気になる」に留める。
 * **数字を添えて出す。**「外れています」だけ言われても直しようがない。
 */
function checkStats(t: MonsterTemplate, peers: MonsterTemplate[]): void {
  /*
   * **比べる相手を間違えない。**召喚限定の高レアは通常モンスターより明確に強く、
   * それは設計どおり。同じ土俵(通常なら通常、高レアなら高レア)の中だけで見る。
   */
  const sameTier = peers.includes(t)
    ? peers
    : ALL_MONSTER_TEMPLATES.filter((p) => !peers.includes(p));
  const others = sameTier.filter((p) => p.role === t.role && p.templateId !== t.templateId);
  /*
   * **3体未満とは比べない。**2体しかいない所で「帯」を作ると、
   * 上と下の2体が互いを外れ値として指し合うだけになる(高レアのアタッカーが
   * 3体しかおらず、実際にそうなった)。仲間が増えてから効き始める検査。
   */
  if (others.length < 3) return;
  for (const key of ["hp", "atk", "def", "spd"] as const) {
    const values = others.map((p) => p.baseStats[key]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const mine = t.baseStats[key];
    // 帯の3割ぶんまではみ出しを許す。役割の中で尖ることまでは咎めない
    const margin = (hi - lo) * 0.3 || hi * 0.1;
    if (mine < lo - margin || mine > hi + margin) {
      note("気になる", `${t.templateId} ${key}`, `${mine} は「${t.role}」の帯(${lo}〜${hi})から外れている`);
    }
  }
}

/* ============================================================
 * 属性ごとの表(--table)
 * ============================================================ */
function printTable(t: MonsterTemplate): void {
  console.log(`\n=== ${t.baseName}(${t.templateId})が属性ごとに引くスキル ===\n`);
  console.log("属性   スキル2                スキル3                 効果");
  for (const element of t.elements ?? ELEMENTS) {
    const def = createMonsterVariant(t, element);
    const kinds = [...new Set(def.skills.flatMap((s) => s.effects.map((e) => e.kind)))];
    console.log(
      `${ELEMENT_JA[element].padEnd(4)} ${def.skills[1].name.padEnd(20)} ${def.skills[2].name.padEnd(22)} ${kinds.join(",")}`,
    );
  }
  console.log("\n※ どの属性がどの変種を引くかはハッシュで決まる。狙った効果を持たせたい時はこの表で確かめること。");
}

/* ============================================================
 * 雛形(--new)
 * ============================================================ */
function printScaffold(templateId: string): void {
  const name = templateId.toUpperCase();
  console.log(`
// src/data/monsters.ts へ貼り、MONSTER_TEMPLATES と ALL_MONSTER_TEMPLATES に足すこと。
// 貼ったら必ず: npx tsx tools/monsterDoctor.mts --id ${templateId}

const ${name}: MonsterTemplate = {
  templateId: "${templateId}",
  baseName: "なまえ",
  emoji: "❓",
  // アタッカー / ディフェンダー / ヒーラー / サポート / デバッファー / バランス型
  role: "バランス型",
  baseStats: { hp: 1300, atk: 120, def: 90, spd: 96, criRate: 0.15, criDmg: 1.5, resistance: 0.15, accuracy: 0.15 },
  skill1: {
    id: "${templateId}_s1",
    name: "つうじょうこうげき",
    description: "敵単体に攻撃力1.0倍のダメージを与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.0 }],
  },
  // 変種は3つ。**どの属性がどれを引くかはハッシュで決まる**ので、
  // 「この種族は必ず◯◯できる」を狙うなら3つ全部にその効果を入れること
  skill2Variants: [
    { id: "${templateId}_s2_a", name: "", description: "", target: "SINGLE_ENEMY", cooldownTurns: 3, effects: [] },
    { id: "${templateId}_s2_b", name: "", description: "", target: "SINGLE_ENEMY", cooldownTurns: 3, effects: [] },
    { id: "${templateId}_s2_c", name: "", description: "", target: "SINGLE_ENEMY", cooldownTurns: 3, effects: [] },
  ],
  skill3Variants: [
    { id: "${templateId}_s3_a", name: "", description: "", target: "ALL_ENEMIES", cooldownTurns: 4, effects: [] },
    { id: "${templateId}_s3_b", name: "", description: "", target: "ALL_ENEMIES", cooldownTurns: 4, effects: [] },
    { id: "${templateId}_s3_c", name: "", description: "", target: "ALL_ENEMIES", cooldownTurns: 4, effects: [] },
  ],
};
`);
}

/* ============================================================ */
function main(): void {
  const args = process.argv.slice(2);
  const valueOf = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const newId = valueOf("--new");
  if (newId) return printScaffold(newId);

  const tableId = valueOf("--table");
  if (tableId) {
    const t = ALL_MONSTER_TEMPLATES.find((x) => x.templateId === tableId);
    if (!t) return console.error(`そんな種族はいません: ${tableId}`);
    return printTable(t);
  }

  const onlyId = valueOf("--id");
  const targets = onlyId ? ALL_MONSTER_TEMPLATES.filter((t) => t.templateId === onlyId) : ALL_MONSTER_TEMPLATES;
  if (targets.length === 0) return console.error(`そんな種族はいません: ${onlyId}`);

  const seenIds = new Map<string, string>();
  for (const t of targets) {
    for (const { slot, skill } of allSkills(t)) {
      const where = `${t.templateId} ${slot}`;
      checkNumbers(where, skill);
      checkUndescribed(where, skill);
    }
    checkIds(t, seenIds);
    checkVariants(t);
    checkStats(t, MONSTER_TEMPLATES);
  }

  console.log(`\n=== モンスターの検診(${targets.length}種) ===\n`);
  const bad = findings.filter((f) => f.level === "だめ");
  const warn = findings.filter((f) => f.level === "気になる");

  for (const [label, list] of [
    ["直すべき", bad],
    ["気になる", warn],
  ] as const) {
    if (list.length === 0) continue;
    console.log(`--- ${label}(${list.length}件) ---`);
    for (const f of list) console.log(`  ${f.where}\n      ${f.what}`);
    console.log("");
  }

  if (findings.length === 0) console.log("  問題なし\n");
  // 直すべきものが残っていたら、CIや手元で気付けるように終了コードを立てる
  if (bad.length > 0) process.exitCode = 1;
}

main();
