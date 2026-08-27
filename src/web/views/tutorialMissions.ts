import { PlayerState } from "../../game/playerState.js";
import {
  currentTutorialMission,
  TUTORIAL_MISSIONS,
  tutorialMissionProgress,
  TutorialMissionDefinition,
} from "../../game/tutorialMissions.js";
import { el } from "../dom.js";

export interface TutorialMissionProps {
  player: PlayerState;
  onClaim: () => void;
  onMove: (mission: TutorialMissionDefinition) => void;
  onBack: () => void;
}

function rewardText(mission: TutorialMissionDefinition): string {
  const rewards: string[] = [];
  if (mission.reward.crystal) rewards.push(`💎 ダイヤ ×${mission.reward.crystal}`);
  if (mission.reward.gold) rewards.push(`🪙 ゴールド ×${mission.reward.gold.toLocaleString("ja-JP")}`);
  return rewards.join(" / ");
}

export function renderTutorialMissions(props: TutorialMissionProps): HTMLElement {
  const current = currentTutorialMission(props.player);
  const currentIndex = current ? TUTORIAL_MISSIONS.indexOf(current) : TUTORIAL_MISSIONS.length;
  const cards = TUTORIAL_MISSIONS.map((mission, index) => {
    const claimed = props.player.tutorialMissions.claimedIds.includes(mission.id);
    const locked = index > currentIndex;
    const progress = Math.min(mission.target, tutorialMissionProgress(props.player, mission));
    const complete = progress >= mission.target;
    return el("article", { className: `tutorial-card ${claimed ? "tutorial-card--claimed" : ""} ${locked ? "tutorial-card--locked" : ""}` }, [
      el("div", { className: "tutorial-card__step" }, [claimed ? "達成済み" : locked ? `STEP ${index + 1}・未解放` : `STEP ${index + 1}・進行中`]),
      el("h2", {}, [mission.name]),
      el("p", { className: "tutorial-card__task" }, [locked ? "前のミッションを達成すると解放されます" : mission.task]),
      !locked ? el("div", { className: "tutorial-card__progress" }, [
        el("div", { className: "tutorial-card__progress-head" }, [el("span", {}, ["進捗"]), el("strong", {}, [`${progress} / ${mission.target} ${mission.unit}`])]),
        el("div", { className: "tutorial-card__bar" }, [el("i", { style: `width:${Math.min(100, progress / mission.target * 100)}%` }, [])]),
      ]) : null,
      !locked ? el("p", { className: "tutorial-card__reward" }, [el("span", {}, ["報酬"]), el("strong", {}, [rewardText(mission)])]) : null,
      !locked && !claimed ? el("div", { className: "tutorial-card__actions" }, [
        el("button", { type: "button", className: "btn btn--ghost", onclick: () => props.onMove(mission) }, ["移動する"]),
        el("button", { type: "button", className: `btn ${complete ? "btn--primary tutorial-card__claim--ready" : "btn--ghost"}`, disabled: !complete, onclick: props.onClaim }, [complete ? "報酬を受け取る" : "達成後に受取可能"]),
      ]) : null,
    ].filter((node) => node !== null) as HTMLElement[]);
  });

  return el("div", { className: "screen tutorial-screen" }, [
    el("header", { className: "app-header" }, [
      el("button", { type: "button", className: "back-btn", onclick: props.onBack }, ["←"]),
      el("div", {}, [
        el("h1", {}, ["初心者ミッション"]),
        el("p", { className: "app-subtitle" }, [current ? `${currentIndex + 1} / ${TUTORIAL_MISSIONS.length}` : "第一段階 COMPLETE"]),
      ]),
    ]),
    ...cards,
  ]);
}
