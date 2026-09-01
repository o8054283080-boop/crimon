import "./ui/missions.css";
import {
  CumulativeMissionView,
  MissionPeriod,
  PeriodMissionGroupView,
  claimAllAvailableMissionRewards,
  claimCumulativeMission,
  claimPeriodClear,
  claimPeriodMission,
  getCumulativeMissionViews,
  getPeriodMissionView,
  getRegisteredMissionPlayer,
  missionRewardText,
  startMissionObserver,
} from "../game/missions.js";
import { PlayerState } from "../game/playerState.js";

const PERIOD_LABELS: Record<MissionPeriod, string> = {
  DAILY: "デイリー",
  WEEKLY: "ウィークリー",
  MONTHLY: "マンスリー",
};

let root: HTMLElement | null = null;
let activeTab: MissionPeriod | "CUMULATIVE" = "DAILY";

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
      claimPeriodClear(player, period);
      renderModal(player);
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
        claimPeriodMission(player, period, mission.id);
        renderModal(player);
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
      claimCumulativeMission(player, mission.key);
      renderModal(player);
    },
    !mission.complete,
  ));
  return card;
}

function closeModal(): void {
  root?.remove();
  root = null;
  document.body.classList.remove("regular-missions-open");
}

function renderModal(player: PlayerState): void {
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
  const header = document.createElement("header");
  header.className = "regular-missions__header";
  const headerCopy = document.createElement("div");
  const eyebrow = document.createElement("small");
  eyebrow.textContent = "MISSIONS";
  const heading = document.createElement("h2");
  heading.textContent = "ミッション";
  const note = document.createElement("p");
  note.textContent = "全部やらなくてもOK。好きな遊び方で報酬を獲得しよう。";
  headerCopy.append(eyebrow, heading, note);
  header.append(headerCopy, button("閉じる", "regular-missions__close", closeModal));

  const tabs = document.createElement("nav");
  tabs.className = "regular-missions__tabs";
  for (const [tab, label] of [["DAILY", "デイリー"], ["WEEKLY", "ウィークリー"], ["MONTHLY", "マンスリー"], ["CUMULATIVE", "累計"]] as const) {
    const tabButton = button(label, `regular-missions__tab${activeTab === tab ? " is-active" : ""}`, () => {
      activeTab = tab;
      renderModal(player);
    });
    tabs.append(tabButton);
  }

  const actions = document.createElement("div");
  actions.className = "regular-missions__actions";
  actions.append(button("受け取れる報酬を一括受取", "regular-missions__claim-all", () => {
    claimAllAvailableMissionRewards(player);
    renderModal(player);
  }));

  const body = document.createElement("main");
  body.className = "regular-missions__body";
  if (activeTab === "CUMULATIVE") {
    const intro = document.createElement("p");
    intro.className = "regular-missions__infinite-note";
    intro.textContent = "累計ミッションに終わりはありません。達成後は次の目標と報酬が自動で続きます。";
    body.append(intro);
    for (const mission of getCumulativeMissionViews(player)) body.append(renderCumulativeCard(player, mission));
  } else {
    body.append(renderPeriodCard(player, activeTab, getPeriodMissionView(player, activeTab)));
  }

  panel.append(header, tabs, actions, body);
  root.append(scrim, panel);
  document.body.append(root);
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
    activeTab = "DAILY";
    renderModal(player);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root) closeModal();
  });
}

startMissionObserver();
installMissionButtonOverride();
