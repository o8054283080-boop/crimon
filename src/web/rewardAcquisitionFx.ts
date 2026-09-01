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

function rewardTextFromClaimButton(button: HTMLButtonElement): string[] {
  if (button.classList.contains("regular-missions__claim-all")) {
    const modal = button.closest(".regular-missions");
    if (!modal) return ["受取可能なミッション報酬"];
    const ready = Array.from(modal.querySelectorAll<HTMLElement>(
      ".regular-missions__card.is-complete:not(.is-claimed) .regular-missions__reward, .regular-missions__clear.is-ready .regular-missions__reward",
    ));
    const texts = ready.map((node) => node.textContent ?? "").filter(Boolean);
    return texts.length > 0 ? texts : ["受取可能なミッション報酬"];
  }

  const card = button.closest(".regular-missions__card, .regular-missions__clear");
  const reward = card?.querySelector<HTMLElement>(".regular-missions__reward")?.textContent ?? "";
  return reward ? [reward] : ["ミッション報酬"];
}

/**
 * ミッションUIの付与ロジックに手を入れず、受取ボタンが正常に押された時だけ演出する。
 * 将来ショップやログイン報酬などからは showRewardAcquisitionFx() を直接再利用できる。
 */
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>(
    ".regular-missions__claim:not(:disabled), .regular-missions__claim-all:not(:disabled)",
  );
  if (!button) return;
  const items = rewardTextFromClaimButton(button);
  window.setTimeout(() => showRewardAcquisitionFx({ items }), 0);
}, true);
