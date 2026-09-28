import "./ui/missions.css";
import {
  CumulativeMissionView,
  MissionPeriod,
  PeriodMissionGroupView,
  ReleaseCampaignView,
  claimAllAvailableMissionRewards,
  countClaimableMissionRewards,
  claimCumulativeMission,
  claimPeriodClear,
  claimPeriodMission,
  claimReleaseCampaignMilestone,
  claimReleaseCampaignMission,
  getCumulativeMissionViews,
  getPeriodMissionView,
  getRegisteredMissionPlayer,
  getCollabCampaignView,
  type CollabCampaignView,
  claimCollabMission,
  claimCollabMilestone,
  getReleaseCampaignView,
  missionRewardText,
  startMissionObserver,
  type MissionReward,
} from "../game/missions.js";
import { PlayerState } from "../game/playerState.js";

const PERIOD_LABELS: Record<MissionPeriod, string> = {
  DAILY: "デイリー",
  WEEKLY: "ウィークリー",
  MONTHLY: "マンスリー",
};

let root: HTMLElement | null = null;
type MissionTab = MissionPeriod | "CAMPAIGN" | "COLLAB" | "CUMULATIVE";
let activeTab: MissionTab = "DAILY";

/**
 * 直前に受け取った報酬。**受け取るたびに、何が入ったかをダイアログで見せる。**
 *
 * 以前は一括受取の時だけボタンの下に1行出していて、1件ずつ「受け取る」を押した時は
 * 何も出さなかった。しかも受け取るたびに画面を作り直して一覧が一番上へ巻き戻るので、
 * 「押したら何かが減った/増えた気がするが、何を受け取ったか分からない」状態だった(依頼主の指摘)。
 *
 * 出すのは `aria-modal` 付きのダイアログで、「OK」で閉じる。**裏の一覧を覆うのは閉じるまでの間だけ**で、
 * 閉じれば元の位置のまま一覧に戻る(巡回もこの印で「いま裏が押せないのは正しい」と見分ける)。
 */
let lastClaim: { title: string; items: string[] } | null = null;
/** 作り直す前の一覧の位置。受け取った後も同じ場所に戻す */
let lastRenderedTab: MissionTab | null = null;

function rewardItems(reward: MissionReward): string[] {
  return missionRewardText(reward).split(" / ").filter((text) => text && text !== "報酬なし");
}

function afterClaim(player: PlayerState, title: string, reward: MissionReward | null): void {
  if (reward) {
    refreshMissionRewardResourceDisplay(player);
    lastClaim = { title, items: rewardItems(reward) };
  }
  renderModal(player);
}

function renderClaimResult(): HTMLElement | null {
  if (!lastClaim) return null;
  const popup = document.createElement("div");
  popup.className = "regular-missions__claimed";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-modal", "true");
  popup.setAttribute("aria-label", "受け取った報酬");
  popup.dataset.tour = "mission-claim-result";
  const close = () => { lastClaim = null; popup.remove(); };
  const scrim = document.createElement("button");
  scrim.type = "button";
  scrim.className = "regular-missions__claimed-scrim";
  scrim.setAttribute("aria-label", "閉じる");
  scrim.addEventListener("click", close);
  const card = document.createElement("section");
  card.className = "regular-missions__claimed-card";
  const heading = document.createElement("h3");
  heading.textContent = "受け取りました";
  const title = document.createElement("p");
  title.className = "regular-missions__claimed-title";
  title.textContent = lastClaim.title;
  const list = document.createElement("ul");
  list.className = "regular-missions__claimed-list";
  for (const item of lastClaim.items.length ? lastClaim.items : ["(報酬はありませんでした)"]) {
    const row = document.createElement("li");
    row.textContent = item;
    list.append(row);
  }
  card.append(heading, title, list, button("OK", "regular-missions__claimed-ok", close));
  popup.append(scrim, card);
  return popup;
}

function button(label: string, className: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.disabled = disabled;
  element.addEventListener("click", onClick);
  return element;
}

function rewardLine(text: string): HTMLElement {
  const line = document.createElement("p");
  line.className = "regular-missions__reward";
  line.textContent = `🎁 ${text}`;
  return line;
}

function progressBar(current: number, target: number): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "regular-missions__progress";
  const bar = document.createElement("span");
  const ratio = target > 0 ? Math.min(1, current / target) : 0;
  bar.style.width = `${Math.round(ratio * 100)}%`;
  wrap.append(bar);
  return wrap;
}

/**
 * ミッション画面はHOMEの上へ重なるモーダルなので、報酬受取で player を更新しても
 * 背後のHOMEは自動では再描画されない。保存値だけ増えて見た目が古いままだと
 * 「報酬が付与されなかった」と見えるため、画面に存在する資源表示だけを同じ
 * PlayerState の最新値へ同期する。
 */
export function refreshMissionRewardResourceDisplay(player: PlayerState, scope: ParentNode = document): void {
  const setNumber = (selector: string, value: number): void => {
    scope.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      node.textContent = value.toLocaleString("ja-JP");
    });
  };

  setNumber(".home-wallet__chip--crystal > strong", player.crystal);
  setNumber(".home-wallet__chip--gold > strong", player.gold);
  setNumber(".home-wallet__chip--stamina > strong", player.stamina);
  setNumber(".home-stamina__num > strong", player.stamina);

  scope.querySelectorAll<HTMLElement>(".home-vitals__stats .home-stat").forEach((card) => {
    const label = card.querySelector("small")?.textContent;
    const value = card.querySelector<HTMLElement>("strong");
    if (!value) return;
    if (label === "所持ダイヤ") value.textContent = player.crystal.toLocaleString("ja-JP");
    if (label === "所持ゴールド") value.textContent = player.gold.toLocaleString("ja-JP");
  });

  const staminaRatio = Math.max(0, Math.min(1, player.stamina / Math.max(1, player.maxStamina)));
  scope.querySelectorAll<HTMLElement>(".home-stamina__track > i").forEach((track) => {
    track.style.width = `${(staminaRatio * 100).toFixed(1)}%`;
  });
}

function renderPeriodCard(player: PlayerState, period: MissionPeriod, group: PeriodMissionGroupView): HTMLElement {
  const section = document.createElement("section");
  section.className = "regular-missions__list";

  const summary = document.createElement("article");
  summary.className = `regular-missions__clear${group.canClaimClear ? " is-ready" : ""}`;
  const title = document.createElement("div");
  title.className = "regular-missions__clear-head";
  const heading = document.createElement("strong");
  heading.textContent = `${PERIOD_LABELS[period]} クリア報酬`;
  const count = document.createElement("span");
  count.textContent = `${Math.min(group.completedCount, group.requiredCount)} / ${group.requiredCount}`;
  title.append(heading, count);
  summary.append(title, progressBar(Math.min(group.completedCount, group.requiredCount), group.requiredCount), rewardLine(missionRewardText(group.clearReward)));
  const clearButton = button(
    group.clearClaimed ? "受取済み" : group.canClaimClear ? "クリア報酬を受け取る" : `あと${Math.max(0, group.requiredCount - group.completedCount)}個達成`,
    "regular-missions__claim regular-missions__claim--clear",
    () => {
      afterClaim(player, `${PERIOD_LABELS[period]} クリア報酬`, claimPeriodClear(player, period));
    },
    group.clearClaimed || !group.canClaimClear,
  );
  summary.append(clearButton);
  section.append(summary);

  for (const mission of group.missions) {
    const card = document.createElement("article");
    card.className = `regular-missions__card${mission.complete ? " is-complete" : ""}${mission.claimed ? " is-claimed" : ""}`;
    const head = document.createElement("div");
    head.className = "regular-missions__card-head";
    const name = document.createElement("strong");
    name.textContent = mission.title;
    const progress = document.createElement("span");
    progress.textContent = `${mission.current.toLocaleString("ja-JP")} / ${mission.target.toLocaleString("ja-JP")}`;
    head.append(name, progress);
    const condition = document.createElement("p");
    condition.className = "regular-missions__condition";
    condition.textContent = mission.condition;
    card.append(head, condition, progressBar(mission.current, mission.target), rewardLine(missionRewardText(mission.reward)));
    card.append(button(
      mission.claimed ? "受取済み" : mission.complete ? "受け取る" : "未達成",
      "regular-missions__claim",
      () => {
        afterClaim(player, mission.title, claimPeriodMission(player, period, mission.id));
      },
      mission.claimed || !mission.complete,
    ));
    section.append(card);
  }
  return section;
}

function renderCumulativeCard(player: PlayerState, mission: CumulativeMissionView): HTMLElement {
  const card = document.createElement("article");
  card.className = `regular-missions__card regular-missions__card--cumulative${mission.complete ? " is-complete" : ""}`;
  const head = document.createElement("div");
  head.className = "regular-missions__card-head";
  const name = document.createElement("strong");
  name.textContent = mission.title;
  const progress = document.createElement("span");
  progress.textContent = `${Math.min(mission.current, mission.target).toLocaleString("ja-JP")} / ${mission.target.toLocaleString("ja-JP")}`;
  head.append(name, progress);
  const next = document.createElement("p");
  next.className = "regular-missions__condition";
  next.textContent = `次の目標：${mission.target.toLocaleString("ja-JP")}　※上限なし`;
  card.append(head, next, progressBar(Math.min(mission.current, mission.target), mission.target), rewardLine(missionRewardText(mission.reward)));
  card.append(button(
    mission.complete ? "受け取る" : "未達成",
    "regular-missions__claim",
    () => {
      afterClaim(player, mission.title, claimCumulativeMission(player, mission.key));
    },
    !mission.complete,
  ));
  return card;
}

function renderCampaign(player: PlayerState, campaign: ReleaseCampaignView): HTMLElement {
  const section = document.createElement("section");
  section.className = "regular-missions__list regular-missions__list--campaign";

  const hero = document.createElement("article");
  hero.className = "regular-missions__campaign-hero";
  const heading = document.createElement("strong");
  heading.textContent = "🎊 CRIMON X公開記念キャンペーン";
  const deadline = document.createElement("p");
  deadline.textContent = campaign.remainingDays === 0
    ? "10月3日 23:59まで・本日終了"
    : `10月3日 23:59まで・あと${campaign.remainingDays}日`;
  const count = document.createElement("b");
  count.textContent = `達成数 ${campaign.completedCount} / ${campaign.missions.length}`;
  hero.append(heading, deadline, count, progressBar(campaign.completedCount, campaign.missions.length));
  section.append(hero);

  const milestoneList = document.createElement("div");
  milestoneList.className = "regular-missions__milestones";
  for (const milestone of campaign.milestones) {
    const card = document.createElement("article");
    card.className = `regular-missions__milestone${milestone.complete ? " is-complete" : ""}${milestone.claimed ? " is-claimed" : ""}`;
    const title = document.createElement("strong");
    title.textContent = `${milestone.target}個達成報酬`;
    card.append(title, rewardLine(missionRewardText(milestone.reward)), button(
      milestone.claimed ? "受取済み" : milestone.complete ? "受け取る" : `${Math.min(campaign.completedCount, milestone.target)} / ${milestone.target}`,
      "regular-missions__claim regular-missions__claim--milestone",
      () => {
        afterClaim(player, `${milestone.target}個達成報酬`, claimReleaseCampaignMilestone(player, milestone.target));
      },
      milestone.claimed || !milestone.complete,
    ));
    milestoneList.append(card);
  }
  section.append(milestoneList);

  for (const [index, mission] of campaign.missions.entries()) {
    const card = document.createElement("article");
    card.className = `regular-missions__card${mission.complete ? " is-complete" : ""}${mission.claimed ? " is-claimed" : ""}`;
    const head = document.createElement("div");
    head.className = "regular-missions__card-head";
    const name = document.createElement("strong");
    name.textContent = `${index + 1}. ${mission.title}`;
    const progress = document.createElement("span");
    progress.textContent = `${mission.current.toLocaleString("ja-JP")} / ${mission.target.toLocaleString("ja-JP")}`;
    head.append(name, progress);
    const condition = document.createElement("p");
    condition.className = "regular-missions__condition";
    condition.textContent = mission.condition;
    card.append(head, condition, progressBar(mission.current, mission.target), rewardLine(missionRewardText(mission.reward)), button(
      mission.claimed ? "受取済み" : mission.complete ? "受け取る" : "未達成",
      "regular-missions__claim",
      () => {
        afterClaim(player, mission.title, claimReleaseCampaignMission(player, mission.id));
      },
      mission.claimed || !mission.complete,
    ));
    section.append(card);
  }
  return section;
}

/**
 * コラボ限定ミッション。
 *
 * **公開記念キャンペーンと同じ作りにしてある。**同じ形の画面が2つあるより、
 * 見出しと色だけが違う方が、どちらを見ているか迷わない。
 *
 * スマホの縦で見るものなので、上から
 * 「あと何日」→「達成数 n/30」→「累計報酬」→「30個の一覧」の順に置く。
 * **最終報酬は累計の最後に来る**ので、下まで送れば必ず目に入る。
 */
function renderCollabCampaign(player: PlayerState, campaign: CollabCampaignView): HTMLElement {
  const section = document.createElement("section");
  section.className = "regular-missions__list regular-missions__list--campaign regular-missions__list--collab";

  const hero = document.createElement("article");
  hero.className = "regular-missions__campaign-hero regular-missions__campaign-hero--collab";
  const heading = document.createElement("strong");
  heading.textContent = "🌸 コラボ限定ミッション";
  const deadline = document.createElement("p");
  deadline.textContent = campaign.remainingDays === 0
    ? "本日終了"
    : `あと${campaign.remainingDays}日`;
  const count = document.createElement("b");
  count.textContent = `達成数 ${campaign.completedCount} / ${campaign.totalCount}`;
  const finalNote = document.createElement("p");
  finalNote.className = "regular-missions__collab-final";
  finalNote.textContent = "30個達成でコラボ限定★5召喚書";
  hero.append(heading, deadline, count, progressBar(campaign.completedCount, campaign.totalCount), finalNote);
  section.append(hero);

  const milestoneList = document.createElement("div");
  milestoneList.className = "regular-missions__milestones";
  for (const milestone of campaign.milestones) {
    const card = document.createElement("article");
    card.className = `regular-missions__milestone${milestone.complete ? " is-complete" : ""}${milestone.claimed ? " is-claimed" : ""}`;
    const title = document.createElement("strong");
    title.textContent = `${milestone.target}個達成報酬`;
    card.append(title, rewardLine(missionRewardText(milestone.reward)), button(
      milestone.claimed ? "受取済み" : milestone.complete ? "受け取る" : `${Math.min(campaign.completedCount, milestone.target)} / ${milestone.target}`,
      "regular-missions__claim regular-missions__claim--milestone",
      () => {
        afterClaim(player, `${milestone.target}個達成報酬`, claimCollabMilestone(player, milestone.target));
      },
      milestone.claimed || !milestone.complete,
    ));
    milestoneList.append(card);
  }
  section.append(milestoneList);

  for (const [index, mission] of campaign.missions.entries()) {
    const card = document.createElement("article");
    card.className = `regular-missions__card${mission.complete ? " is-complete" : ""}${mission.claimed ? " is-claimed" : ""}`;
    const head = document.createElement("div");
    head.className = "regular-missions__card-head";
    const name = document.createElement("strong");
    name.textContent = `${index + 1}. ${mission.title}`;
    const progress = document.createElement("span");
    progress.textContent = `${mission.current.toLocaleString("ja-JP")} / ${mission.target.toLocaleString("ja-JP")}`;
    head.append(name, progress);
    const condition = document.createElement("p");
    condition.className = "regular-missions__condition";
    condition.textContent = mission.condition;
    card.append(head, condition, progressBar(mission.current, mission.target), rewardLine(missionRewardText(mission.reward)), button(
      mission.claimed ? "受取済み" : mission.complete ? "受け取る" : "未達成",
      "regular-missions__claim",
      () => {
        afterClaim(player, mission.title, claimCollabMission(player, mission.id));
      },
      mission.claimed || !mission.complete,
    ));
    section.append(card);
  }
  return section;
}

function closeModal(): void {
  root?.remove();
  root = null;
  document.body.classList.remove("regular-missions-open");
}

function renderModal(player: PlayerState): void {
  // 同じタブを作り直す時は、一覧の位置を保つ(受け取るたびに一番上へ戻っていた)
  const keepScroll = lastRenderedTab === activeTab ? root?.querySelector<HTMLElement>(".regular-missions__body")?.scrollTop ?? 0 : 0;
  root?.remove();
  root = document.createElement("div");
  root.className = "regular-missions";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "ミッション");

  const scrim = document.createElement("button");
  scrim.type = "button";
  scrim.className = "regular-missions__scrim";
  scrim.setAttribute("aria-label", "ミッションを閉じる");
  scrim.addEventListener("click", closeModal);

  const panel = document.createElement("div");
  panel.className = "regular-missions__panel";
  const campaign = getReleaseCampaignView(player);
  if (!campaign && activeTab === "CAMPAIGN") activeTab = "DAILY";
  // **開催中だけタブが出る。**終わった後に開くと、そのままデイリーへ落ちる
  const collab = getCollabCampaignView(player);
  if (!collab && activeTab === "COLLAB") activeTab = "DAILY";
  const header = document.createElement("header");
  header.className = "regular-missions__header";
  const headerCopy = document.createElement("div");
  const eyebrow = document.createElement("small");
  eyebrow.textContent = "MISSIONS";
  const heading = document.createElement("h2");
  heading.textContent = "ミッション";
  const note = document.createElement("p");
  note.textContent = activeTab === "CAMPAIGN"
    ? "1か月限定。30個達成で★5召喚書も獲得できます。"
    : activeTab === "COLLAB"
      ? "期間限定。30個達成でコラボ限定★5召喚書を獲得できます。"
      : "全部やらなくてもOK。好きな遊び方で報酬を獲得しよう。";
  headerCopy.append(eyebrow, heading, note);
  header.append(headerCopy, button("閉じる", "regular-missions__close", closeModal));

  const tabs = document.createElement("nav");
  tabs.className = "regular-missions__tabs";
  const tabEntries: readonly (readonly [MissionTab, string])[] = [
    // コラボは期間限定なので**いちばん左**。期限のあるものから目に入れる
    ...(collab ? [["COLLAB", "コラボ"]] as const : []),
    ...(campaign ? [["CAMPAIGN", "公開記念"]] as const : []),
    ["DAILY", "デイリー"],
    ["WEEKLY", "ウィークリー"],
    ["MONTHLY", "マンスリー"],
    ["CUMULATIVE", "累計"],
  ];
  if (campaign) tabs.classList.add("regular-missions__tabs--campaign");
  for (const [tab, label] of tabEntries) {
    const tabButton = button(label, `regular-missions__tab${activeTab === tab ? " is-active" : ""}`, () => {
      activeTab = tab;
      lastClaim = null;
      renderModal(player);
    });
    tabs.append(tabButton);
  }

  const actions = document.createElement("div");
  actions.className = "regular-missions__actions";
  /*
   * **受け取れるものが無い時は押せなくする。**
   *
   * 前は常に押せて、何も起きないのに押した手応えだけが返っていた
   * (依頼主の指摘「何回も押せてしまう」)。件数を出して、
   * 0なら文言ごと変えて止める。
   */
  const claimable = countClaimableMissionRewards(player);
  actions.append(button(
    claimable > 0 ? `受け取れる報酬を一括受取（${claimable}件）` : "受け取れる報酬はありません",
    "regular-missions__claim-all",
    () => {
      // **何が入ったかを言う。**数字だけ動いても、何を受け取ったかは分からない
      afterClaim(player, `${claimable}件をまとめて受け取り`, claimAllAvailableMissionRewards(player));
    },
    claimable === 0,
  ));

  const body = document.createElement("main");
  body.className = "regular-missions__body";
  if (activeTab === "CAMPAIGN" && campaign) {
    body.append(renderCampaign(player, campaign));
  } else if (activeTab === "COLLAB" && collab) {
    body.append(renderCollabCampaign(player, collab));
  } else if (activeTab === "CUMULATIVE") {
    const intro = document.createElement("p");
    intro.className = "regular-missions__infinite-note";
    intro.textContent = "累計ミッションに終わりはありません。達成後は次の目標と報酬が自動で続きます。";
    body.append(intro);
    for (const mission of getCumulativeMissionViews(player)) body.append(renderCumulativeCard(player, mission));
  } else if (activeTab !== "CAMPAIGN" && activeTab !== "COLLAB") {
    body.append(renderPeriodCard(player, activeTab, getPeriodMissionView(player, activeTab)));
  }

  panel.append(header, tabs, actions, body);
  root.append(scrim, panel);
  const claimResult = renderClaimResult();
  if (claimResult) root.append(claimResult);
  document.body.append(root);
  body.scrollTop = keepScroll;
  lastRenderedTab = activeTab;
  document.body.classList.add("regular-missions-open");
}

function isHomeMissionButton(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof Element)) return false;
  const element = target.closest("button");
  if (!(element instanceof HTMLElement)) return false;
  if (!element.closest(".world-actions--left")) return false;
  return (element.textContent ?? "").includes("ミッション");
}

function installMissionButtonOverride(): void {
  document.addEventListener("click", (event) => {
    if (!isHomeMissionButton(event.target)) return;
    const player = getRegisteredMissionPlayer();
    if (!player) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // 期限のあるものを先に見せる。コラボ → 公開記念 → デイリーの順
    activeTab = getCollabCampaignView(player) ? "COLLAB" : getReleaseCampaignView(player) ? "CAMPAIGN" : "DAILY";
    // 前に開いた時の受け取り結果は持ち越さない
    lastClaim = null;
    lastRenderedTab = null;
    renderModal(player);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root) closeModal();
  });
}

startMissionObserver();
installMissionButtonOverride();
