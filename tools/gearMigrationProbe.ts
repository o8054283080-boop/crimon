/**
 * 装備メインの新しい値が、実ブラウザの画面にそのまま出ているかを見る。
 *
 * **型チェックもテストも、画面に出る数字を見てくれない。**
 * 移行そのもの(一度だけ・他の項目を触らない・序列を保つ)は
 * `tests/equipmentMainRebalance.test.ts` が見ているので、ここが受け持つのは
 *
 *   1. 装備の画面に出ている HP% と クリダメ% が、新しい値域に収まっていること
 *   2. 画面を開き直しても同じ値が出ること(古い値がどこかに残らないこと)
 *
 * の2つだけ。
 *
 * **控えを直接書き換える形にはしない。**保存は `saveCodec` が詰めた形で入っていて、
 * アプリは起動のたびに自前の経路で読み直す。外から差し込んだ控えは
 * その経路に載らず、実際には確かめたいことを確かめられない(一度そう書いて、
 * 開き直した瞬間にアプリ側の控えへ戻るのを見た)。
 *
 * 常駐サーバ(harness.mjs)が要る。HARNESS_PORT で待ち受け先を変えられる。
 *
 *   HARNESS_PORT=7753 npx tsx tools/gearMigrationProbe.ts
 */
const PORT = Number(process.env.HARNESS_PORT ?? 5311);

async function call(command: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; value?: unknown; error?: string }> {
  const res = await fetch(`http://127.0.0.1:${PORT}/${command}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** ページの中で1つの式を評価する。harness は `{ ok, value }` を返す */
async function evaluate<T>(body: string): Promise<T> {
  const res = await call("eval", { expression: `(() => {${body}})()` });
  if (res.ok === false) throw new Error(`ページ側で失敗: ${res.error}`);
  return res.value as T;
}

/**
 * 新しい★6・**強化なし**のメインの値域。
 *
 * 開発用の引き出しが配るのは +0 の装備なので、ここは +15 の値域ではない。
 *   HP%    … 0.09 × 6 × 0.85 × [0.85〜1.15] = 39.0〜52.9%
 *   クリダメ … 0.08 × 6 × 1.35 × [0.85〜1.15] = 55.1〜74.6%
 * 生成側の倍率を変えたらここも変えること。
 */
const RANGE = {
  "HP%": { min: 38, max: 54 },
  クリダメ: { min: 54, max: 76 },
};

interface Shown {
  hp: number[];
  crit: number[];
  sample: string;
}

/*
 * 一覧の札から、メインの名前と数値を**要素ごと**に拾う。
 *
 * 画面まるごとの文字列を正規表現で切ると、**サブOPまで混ざる。**
 * 実際にそう書いて「HP% 9.3%」というサブの値を拾い、メインが値域を外れていると
 * 誤って報告した。見たいのはメインだけなので、札の作りに合わせて素直に読む。
 */
const COLLECT = `
  const cards = [...document.querySelectorAll(".equip-card")];
  const hp = [];
  const crit = [];
  for (const card of cards) {
    const label = card.querySelector(".equip-card__main-label");
    const value = card.querySelector(".equip-card__main-value");
    const name = label && label.textContent ? label.textContent.trim() : "";
    const shown = value && value.textContent ? value.textContent.trim() : "";
    if (!name || !shown.endsWith("%")) continue;
    const num = Number(shown.replace("%", ""));
    if (!Number.isFinite(num)) continue;
    if (name.indexOf("HP%") >= 0) hp.push(num);
    if (name.indexOf("クリダメ") >= 0) crit.push(num);
  }
  return { hp: hp, crit: crit, sample: String(cards.length) };
`;

async function openEquipment(): Promise<void> {
  await evaluate(`
    const start = document.querySelector('[data-tour="start"]');
    if (start instanceof HTMLElement) start.click();
    return true;
  `);
  await call("wait", { ms: 700 });
  /*
   * **まっさらな控えには装備が1つも無い。**開発用の引き出しから★6装備を配って、
   * 初めて一覧に札が並ぶ。ここを飛ばすと「0件」を「問題なし」と読んでしまう。
   */
  /*
   * **何度か押して数を増やす。**4枠のメインは5種から引くので、
   * 1回ぶん(48枚)だとクリダメの札が1枚も出ない回がある(実際に0件になった)。
   */
  for (let i = 0; i < 4; i += 1) {
    await evaluate(`
      const button = [...document.querySelectorAll(".dev-menu button")]
        .find((b) => b.textContent && b.textContent.includes("全員に★6装備"));
      if (button instanceof HTMLElement) button.click();
      return Boolean(button);
    `);
    await call("wait", { ms: 500 });
  }
  await call("wait", { ms: 600 });
  await evaluate(`
    const tab = document.querySelector('[data-tour="tab:EQUIPMENT"]');
    if (tab instanceof HTMLElement) tab.click();
    return true;
  `);
  await call("wait", { ms: 900 });
  await showAll();
}

/**
 * 一覧は最初の48枚しか描かない。**残りを出さないと母数が足りない。**
 * 4枠のメインは5種から引くので、48枚では狙ったメインが1枚も出ない回がある。
 */
async function showAll(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    const pressed = await evaluate<boolean>(`
      const button = [...document.querySelectorAll("button")]
        .find((b) => b.textContent && b.textContent.indexOf("装備をさらに表示") >= 0);
      if (button instanceof HTMLElement) { button.click(); return true; }
      return false;
    `);
    if (!pressed) break;
    await call("wait", { ms: 400 });
  }
}

async function main() {
  await call("goto", { path: "/", fresh: true, width: 390, height: 844 });
  await call("wait", { ms: 1200 });
  await openEquipment();
  const first = await evaluate<Shown>(COLLECT);

  // 一度ホームへ戻ってから開き直す。古い値がどこかに残っていれば、ここで食い違う
  await evaluate(`
    const tab = document.querySelector('[data-tour="tab:HOME"]');
    if (tab instanceof HTMLElement) tab.click();
    return true;
  `);
  await call("wait", { ms: 700 });
  await evaluate(`
    const tab = document.querySelector('[data-tour="tab:EQUIPMENT"]');
    if (tab instanceof HTMLElement) tab.click();
    return true;
  `);
  await call("wait", { ms: 900 });
  await showAll();
  const second = await evaluate<Shown>(COLLECT);

  const report = (label: keyof typeof RANGE, values: number[]) => {
    if (values.length === 0) return `${label}: 画面に出ていない`;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = RANGE[label];
    const ok = min >= range.min && max <= range.max;
    return `${label}: ${values.length}件 ${min}%〜${max}% (期待 ${range.min}〜${range.max}%) ${ok ? "収まっている" : "**外れている**"}`;
  };

  console.log(report("HP%", first.hp));
  console.log(report("クリダメ", first.crit));
  console.log(`札の数: ${first.sample}枚`);
  console.log(`開き直した後: HP% ${second.hp.length}件 / クリダメ ${second.crit.length}件 `
    + `${JSON.stringify(first.hp) === JSON.stringify(second.hp) && JSON.stringify(first.crit) === JSON.stringify(second.crit) ? "同じ値" : "**食い違う**"}`);

  const inRange = (label: keyof typeof RANGE, values: number[]) =>
    values.length > 0 && Math.min(...values) >= RANGE[label].min && Math.max(...values) <= RANGE[label].max;
  const ok = inRange("HP%", first.hp) && inRange("クリダメ", first.crit)
    && JSON.stringify(first.hp) === JSON.stringify(second.hp)
    && JSON.stringify(first.crit) === JSON.stringify(second.crit);
  console.log(ok ? "\n問題なし" : "\n**食い違いあり**");
  process.exit(ok ? 0 : 1);
}

main();
