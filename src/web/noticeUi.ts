import { COMPENSATIONS, Compensation } from "../game/compensation.js";
import "./noticeUi.css";

const BUTTON_ID = "persistent-notice-button";
const SHEET_ID = "persistent-notice-sheet";

/**
 * 最後にお知らせを開いた日。**IDではなく日付で覚える。**
 *
 * IDにすると、そのお知らせが後で消えた時に何と比べればいいのか分からなくなる。
 * 日付なら「これより新しいものが何件あるか」を数えるだけで済む。
 */
const NOTICE_READ_KEY = "crimon.notice.readIds.v2";

function noticeId(notice: Compensation): string {
  // 同日追加でも別のお知らせとして扱える安定ID。
  return `${notice.fromDate}:${notice.title}`;
}

function readNoticeIds(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTICE_READ_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch { return new Set(); }
}

function today(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * まだ読んでいないお知らせの件数。
 *
 * **配り始めていないものは数えない。**先の日付で書いてあるお知らせを
 * 数えると、赤い印が出ているのに開いても何も新しくない状態になる。
 */
function unreadNoticeCount(): number {
  const read = readNoticeIds();
  const now = today();
  return COMPENSATIONS.filter((n) => n.fromDate <= now && !read.has(noticeId(n))).length;
}

function markNoticeRead(): void {
  try {
    const now = today();
    const read = readNoticeIds();
    for (const notice of COMPENSATIONS) if (notice.fromDate <= now) read.add(noticeId(notice));
    localStorage.setItem(NOTICE_READ_KEY, JSON.stringify([...read]));
  } catch { /* 書けなくても開ける */ }
}

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
  // 開いた時点で既読。閉じてから消すと、読んだのに印が残って見える
  markNoticeRead();
  document.querySelector(`#${BUTTON_ID} .world-action__badge`)?.remove();

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

  /*
   * **`strong` を先に探す。**`span` を先に取ると、中の `strong` ごと
   * 文字列で潰してしまい、お知らせの札だけ書体と大きさが変わる
   * (`.world-action strong` の 700 11px が当たらなくなるため)。
   */
  const label = button.querySelector<HTMLElement>("strong") ?? button.querySelector<HTMLElement>("span");
  if (label) label.textContent = "お知らせ";
  else button.append(document.createTextNode("お知らせ"));

  /*
   * 新しいお知らせの件数。**プレゼントと同じ見た目**(`world-action__badge`)。
   * 印が出る条件が2つの入口で違って見えるのは、並べて置く以上おかしい。
   */
  const unread = unreadNoticeCount();
  if (unread > 0) {
    /*
     * **`span` にしない。**左の縦列は絵に文字が焼き込んであるため、
     * `home-left-generated.css` が `.world-action > span` を読み上げ用に
     * 隠している(`opacity:0; height:1px` の `!important` 付き)。
     * `span` で作ると印もそれに巻き込まれ、20x1pxの透明になる(実測)。
     */
    const badge = document.createElement("i");
    badge.className = "world-action__badge";
    /*
     * **2桁で打ち止め。**初めて開いた人は過去の更新履歴が全部未読なので、
     * そのまま出すと「89」になる(実測)。左の縦列のボタンは幅72pxで、
     * 3桁は絵の上まではみ出す。数の正確さより「新しいものがある」が伝わればよい。
     */
    badge.textContent = unread > 9 ? "9+" : String(unread);
    button.append(badge);
  }

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
