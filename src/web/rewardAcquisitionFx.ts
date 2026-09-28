import "./ui/rewardAcquisition.css";

export interface RewardAcquisitionFxOptions {
  title?: string;
  items: string[];
}

let activeFx: HTMLElement | null = null;
let removeTimer: number | null = null;

/**
 * 報酬付与処理とは完全に分離した表示専用の共通演出。
 * ここから所持数を変更しないため、二重受取の原因にならない。
 */
export function showRewardAcquisitionFx(options: RewardAcquisitionFxOptions): void {
  const items = options.items.map((item) => item.trim()).filter(Boolean).slice(0, 5);
  if (items.length === 0) return;

  if (removeTimer !== null) window.clearTimeout(removeTimer);
  activeFx?.remove();

  const root = document.createElement("div");
  root.className = "reward-acquisition-fx";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");

  const burst = document.createElement("div");
  burst.className = "reward-acquisition-fx__burst";

  const panel = document.createElement("div");
  panel.className = "reward-acquisition-fx__panel";
  const kicker = document.createElement("span");
  kicker.className = "reward-acquisition-fx__kicker";
  kicker.textContent = "REWARD GET";
  const title = document.createElement("strong");
  title.className = "reward-acquisition-fx__title";
  title.textContent = options.title ?? "獲得！";

  const list = document.createElement("div");
  list.className = "reward-acquisition-fx__items";
  for (const text of items) {
    const row = document.createElement("div");
    row.className = "reward-acquisition-fx__item";
    const spark = document.createElement("span");
    spark.className = "reward-acquisition-fx__spark";
    spark.textContent = "✦";
    const label = document.createElement("span");
    label.textContent = text.replace(/^🎁\s*/, "");
    row.append(spark, label);
    list.append(row);
  }

  panel.append(kicker, title, list);
  root.append(burst, panel);
  document.body.append(root);
  activeFx = root;
  removeTimer = window.setTimeout(() => {
    root.remove();
    if (activeFx === root) activeFx = null;
    removeTimer = null;
  }, 1600);
}

/*
 * **ミッションの受け取りでは、もうこの演出を出さない。**
 *
 * 以前は受け取りボタンの押下を拾って、1.6秒だけこの札を出していた。
 * 消えるのが早く、一括受取は5件までしか載らず、しかも受け取るたびに一覧が一番上へ
 * 巻き戻っていたので、「何を受け取ったか分からない」と言われた(依頼主の指摘)。
 * いまは `missionUi.ts` が「OK」を押すまで消えない受け取り結果のダイアログを出すので、
 * ここで重ねて出すと2枚が重なる。演出そのもの(`showRewardAcquisitionFx`)は他の場面で使えるよう残す。
 */
