import { COMPENSATIONS, Compensation } from "../game/compensation.js";
import "./noticeUi.css";

const BUTTON_ID = "persistent-notice-button";
const SHEET_ID = "persistent-notice-sheet";

function kindLabel(notice: Compensation): string {
  if (notice.kind === "UPDATE") return "アップデート";
  if (notice.kind === "CELEBRATION") return "記念・配布";
  return "重要なお知らせ";
}

function rewardText(notice: Compensation): string {
  const rewards: string[] = [];
  if (notice.crystal > 0) rewards.push(`ダイヤ ×${notice.crystal.toLocaleString("ja-JP")}`);
  if (notice.gold > 0) rewards.push(`ゴールド ×${notice.gold.toLocaleString("ja-JP")}`);
  if (notice.summonScrolls > 0) rewards.push(`召喚の書 ×${notice.summonScrolls}`);
  if ((notice.fourStarSummonScrolls ?? 0) > 0) rewards.push(`★4以上召喚書 ×${notice.fourStarSummonScrolls}`);
  return rewards.join(" / ");
}

function closeSheet(): void {
  document.getElementById(SHEET_ID)?.remove();
  document.body.classList.remove("notice-sheet-open");
}

function openSheet(): void {
  if (document.getElementById(SHEET_ID)) return;

  const root = document.createElement("div");
  root.id = SHEET_ID;
  root.className = "notice-sheet";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "お知らせ");

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "notice-sheet__backdrop";
  backdrop.setAttribute("aria-label", "お知らせを閉じる");
  backdrop.addEventListener("click", closeSheet);

  const panel = document.createElement("section");
  panel.className = "notice-sheet__panel";

  const header = document.createElement("header");
  header.className = "notice-sheet__header";
  const title = document.createElement("h2");
  title.textContent = "お知らせ";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "notice-sheet__close";
  close.textContent = "閉じる";
  close.addEventListener("click", closeSheet);
  header.append(title, close);

  const list = document.createElement("div");
  list.className = "notice-sheet__list";

  const notices = [...COMPENSATIONS].sort((a, b) => b.fromDate.localeCompare(a.fromDate));
  for (const notice of notices) {
    const article = document.createElement("article");
    article.className = `notice-card notice-card--${(notice.kind ?? "APOLOGY").toLowerCase()}`;

    const meta = document.createElement("div");
    meta.className = "notice-card__meta";
    const category = document.createElement("span");
    category.className = "notice-card__category";
    category.textContent = kindLabel(notice);
    const date = document.createElement("time");
    date.dateTime = notice.fromDate;
    date.textContent = notice.fromDate.replaceAll("-", "/");
    meta.append(category, date);

    const heading = document.createElement("h3");
    heading.textContent = notice.title;
    const message = document.createElement("p");
    message.textContent = notice.message;
    article.append(meta, heading, message);

    const reward = rewardText(notice);
    if (reward) {
      const rewardLine = document.createElement("p");
      rewardLine.className = "notice-card__reward";
      rewardLine.textContent = `配布内容：${reward}`;
      article.append(rewardLine);
    }
    list.append(article);
  }

  panel.append(header, list);
  root.append(backdrop, panel);
  document.body.append(root);
  document.body.classList.add("notice-sheet-open");
  close.focus();
}

function installNoticeButton(): void {
  const leftActions = document.querySelector<HTMLElement>(".world-actions--left");
  if (!leftActions || leftActions.querySelector(`#${BUTTON_ID}`)) return;

  const playButton = [...leftActions.querySelectorAll<HTMLButtonElement>(".world-action")]
    .find((button) => button.textContent?.includes("遊び方"));
  if (!playButton) return;

  const button = playButton.cloneNode(true) as HTMLButtonElement;
  button.id = BUTTON_ID;
  button.dataset.uiTarget = "notice";
  button.setAttribute("aria-label", "お知らせ");
  button.onclick = null;

  const image = button.querySelector<HTMLImageElement>("img");
  if (image) image.src = new URL("./assets/home/menu-notice.svg", import.meta.url).href;

  const label = button.querySelector<HTMLElement>("span") ?? button.querySelector<HTMLElement>("strong");
  if (label) label.textContent = "お知らせ";
  else button.append(document.createTextNode("お知らせ"));

  button.addEventListener("click", openSheet);
  playButton.insertAdjacentElement("afterend", button);
}

let scheduled = false;
function scheduleInstall(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    installNoticeButton();
  });
}

scheduleInstall();
new MutationObserver(scheduleInstall).observe(document.body, { childList: true, subtree: true });
