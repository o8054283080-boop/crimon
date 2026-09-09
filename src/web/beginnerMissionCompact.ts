const TOTAL_BEGINNER_MISSIONS = 80;
const MISSIONS_PER_CHAPTER = 8;
const STYLE_ID = "crimon-beginner-mission-compact-style";

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* HOMEの初心者ミッションは固定レイヤーにしない。ヘッダー直下の通常フローで表示する。 */
    .crimon-home > .crimon-resource-header {
      margin-bottom: 6px !important;
    }

    html body .crimon-home > .crimon-tutorial.crimon-tutorial--compact {
      position: static !important;
      z-index: auto !important;
      top: auto !important;
      left: auto !important;
      right: auto !important;
      width: auto !important;
      max-height: none !important;
      overflow: visible !important;
      margin: 4px 8px 8px !important;
      padding: 0 !important;
      border: 1px solid rgba(221, 178, 80, .72) !important;
      border-radius: 13px !important;
      background: linear-gradient(180deg, rgba(8, 35, 68, .97), rgba(5, 27, 54, .97)) !important;
      box-shadow: 0 4px 12px rgba(0, 8, 22, .34), inset 0 1px rgba(255,255,255,.08) !important;
      overscroll-behavior: auto !important;
    }

    .crimon-tutorial-compact {
      display: grid;
      gap: 0;
      min-width: 0;
    }

    .crimon-tutorial-compact__top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      min-height: 38px;
      padding: 6px 10px;
      border-bottom: 1px solid rgba(221, 178, 80, .24);
    }

    .crimon-tutorial-compact__heading {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }

    .crimon-tutorial-compact__title {
      flex: 0 1 auto;
      color: #fff5d6;
      font-size: .78rem;
      font-weight: 900;
      white-space: nowrap;
    }

    .crimon-tutorial-compact__chapter {
      flex: 0 0 auto;
      color: #8ee7aa;
      font-size: .68rem;
      font-weight: 900;
      white-space: nowrap;
    }

    .crimon-tutorial-compact__chapter-track {
      flex: 1 1 72px;
      max-width: 110px;
      min-width: 42px;
      height: 5px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(255,255,255,.12);
    }

    .crimon-tutorial-compact__chapter-track > i {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #38c978, #86eda7);
    }

    .crimon-tutorial-compact__overall {
      padding-left: 9px;
      border-left: 1px solid rgba(221, 178, 80, .48);
      color: #e9eef8;
      font-size: .76rem;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .crimon-tutorial-compact__body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      min-height: 48px;
      padding: 7px 9px 8px 11px;
    }

    .crimon-tutorial-compact__mission {
      min-width: 0;
    }

    .crimon-tutorial-compact__mission strong {
      display: block;
      overflow: hidden;
      color: #fff;
      font-size: .76rem;
      font-weight: 900;
      line-height: 1.35;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .crimon-tutorial-compact__mission small {
      display: block;
      margin-top: 2px;
      color: #aebdd0;
      font-size: .62rem;
      line-height: 1.25;
    }

    .crimon-tutorial-compact--ready .crimon-tutorial-compact__mission small {
      color: #91e7ad;
      font-weight: 900;
    }

    .crimon-tutorial-compact__actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }

    .crimon-tutorial-compact__actions .btn {
      min-width: 56px;
      min-height: 38px;
      padding: 6px 9px;
      border-radius: 9px;
      font-size: .69rem;
      font-weight: 900;
      white-space: nowrap;
    }

    .crimon-tutorial-compact__claim {
      border-color: rgba(255, 218, 119, .9) !important;
      color: #162039 !important;
      background: linear-gradient(180deg, #ffe7a6, #d7a846) !important;
      box-shadow: 0 0 14px rgba(255, 201, 80, .18);
    }

    .crimon-tutorial-compact__complete {
      padding: 10px 12px;
      color: #ffe39a;
      font-size: .78rem;
      font-weight: 900;
      text-align: center;
    }

    @media (max-width: 400px) {
      .crimon-home > .crimon-resource-header {
        margin-bottom: 4px !important;
      }

      html body .crimon-home > .crimon-tutorial.crimon-tutorial--compact {
        margin: 3px 6px 7px !important;
      }

      .crimon-tutorial-compact__top {
        padding-inline: 8px;
      }

      .crimon-tutorial-compact__heading {
        gap: 5px;
      }

      .crimon-tutorial-compact__title {
        font-size: .73rem;
      }

      .crimon-tutorial-compact__chapter {
        font-size: .63rem;
      }

      .crimon-tutorial-compact__chapter-track {
        max-width: 72px;
      }

      .crimon-tutorial-compact__body {
        gap: 6px;
        padding-inline: 9px 7px;
      }

      .crimon-tutorial-compact__mission strong {
        font-size: .71rem;
      }

      .crimon-tutorial-compact__actions {
        gap: 4px;
      }

      .crimon-tutorial-compact__actions .btn {
        min-width: 48px;
        min-height: 36px;
        padding: 5px 7px;
        font-size: .64rem;
      }
    }
  `;
  document.head.append(style);
}

function parseClaimedCount(section: HTMLElement): number {
  const text = section.querySelector<HTMLElement>(".crimon-tutorial__count")?.textContent ?? "";
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return 0;
  return Math.max(0, Math.min(TOTAL_BEGINNER_MISSIONS, Number(match[1]) || 0));
}

function actionButton(details: HTMLElement, needle: string): HTMLButtonElement | null {
  return Array.from(details.querySelectorAll<HTMLButtonElement>(".crimon-tutorial__actions button"))
    .find((button) => button.textContent?.includes(needle)) ?? null;
}

function enhanceBeginnerMission(section: HTMLElement): void {
  if (section.dataset.compactBeginnerMission === "1") return;

  const current = section.querySelector<HTMLElement>(".crimon-tutorial__current");
  const complete = section.querySelector<HTMLElement>(".crimon-tutorial__complete");
  const claimed = complete ? TOTAL_BEGINNER_MISSIONS : parseClaimedCount(section);
  const chapter = claimed >= TOTAL_BEGINNER_MISSIONS ? 10 : Math.floor(claimed / MISSIONS_PER_CHAPTER) + 1;
  const chapterDone = claimed >= TOTAL_BEGINNER_MISSIONS ? MISSIONS_PER_CHAPTER : claimed % MISSIONS_PER_CHAPTER;
  const chapterPercent = Math.round((chapterDone / MISSIONS_PER_CHAPTER) * 100);

  section.dataset.compactBeginnerMission = "1";
  section.classList.add("crimon-tutorial--compact");

  if (!current) {
    const done = document.createElement("div");
    done.className = "crimon-tutorial-compact__complete";
    done.textContent = "🏆 初心者ミッション 80 / 80　完全制覇！";
    section.replaceChildren(done);
    return;
  }

  const condition = Array.from(current.children)
    .find((child) => child.tagName === "P" && !child.classList.contains("crimon-tutorial__rewards"))
    ?.textContent?.trim() || current.querySelector("summary")?.textContent?.trim() || "次のミッションへ進もう";
  const go = actionButton(current, "移動");
  const claim = actionButton(current, "報酬");
  const ready = Boolean(claim);

  const wrapper = document.createElement("div");
  wrapper.className = `crimon-tutorial-compact${ready ? " crimon-tutorial-compact--ready" : ""}`;

  const top = document.createElement("div");
  top.className = "crimon-tutorial-compact__top";

  const heading = document.createElement("div");
  heading.className = "crimon-tutorial-compact__heading";

  const title = document.createElement("span");
  title.className = "crimon-tutorial-compact__title";
  title.textContent = "✦ 初心者ミッション";

  const chapterText = document.createElement("span");
  chapterText.className = "crimon-tutorial-compact__chapter";
  chapterText.textContent = `第${chapter}章 ${chapterDone}/${MISSIONS_PER_CHAPTER}`;

  const track = document.createElement("span");
  track.className = "crimon-tutorial-compact__chapter-track";
  const fill = document.createElement("i");
  fill.style.width = `${chapterPercent}%`;
  track.append(fill);
  heading.append(title, chapterText, track);

  const overall = document.createElement("span");
  overall.className = "crimon-tutorial-compact__overall";
  overall.textContent = `${claimed} / ${TOTAL_BEGINNER_MISSIONS}`;
  top.append(heading, overall);

  const body = document.createElement("div");
  body.className = "crimon-tutorial-compact__body";

  const mission = document.createElement("div");
  mission.className = "crimon-tutorial-compact__mission";
  const missionText = document.createElement("strong");
  missionText.textContent = condition;
  const state = document.createElement("small");
  state.textContent = ready ? "達成！ 報酬を受け取れます" : "達成条件を満たそう";
  mission.append(missionText, state);

  const actions = document.createElement("div");
  actions.className = "crimon-tutorial-compact__actions";
  if (go) {
    go.textContent = "移動";
    go.classList.add("crimon-tutorial-compact__go");
    actions.append(go);
  }
  if (claim) {
    claim.textContent = "🎁 受け取る";
    claim.classList.add("crimon-tutorial-compact__claim");
    actions.append(claim);
  }
  body.append(mission, actions);
  wrapper.append(top, body);
  section.replaceChildren(wrapper);
}

function scan(): void {
  document.querySelectorAll<HTMLElement>(".crimon-home > .crimon-tutorial").forEach(enhanceBeginnerMission);
}

installStyles();
scan();
new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
