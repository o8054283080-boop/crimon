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

    html body .crimon-home .crimon-tutorial.crimon-tutorial--compact {
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

    /*
     * **この札は世界の中(左右の縦列の間)にいるので、使える幅は約198px。**
     * 内側の余白を引くと170pxしか無い。横に3つも4つも並べると、
     * 実測で「✦ 初心者ミッション」と「0 / 80」が49pxぶん重なり、
     * ミッション名は幅38pxまで潰れて「モン…」になっていた。
     *
     * そこで**横に並べるのは2つまで**と決めている。
     *   1段目: ✦ 初心者ミッション  第1章 0/8
     *   2段目: ミッション名(1行・省略あり)
     *   3段目: 0 / 80          [移動] [🎁 受け取る]
     * 章の帯と「達成条件を満たそう」の一文は落とした。前者は「第1章 0/8」と
     * 同じことしか言わず、後者はボタンを見れば分かる。
     */
    .crimon-tutorial-compact__top {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 32px;
      padding: 5px 10px;
      border-bottom: 1px solid rgba(221, 178, 80, .24);
    }

    .crimon-tutorial-compact__title {
      flex: 0 1 auto;
      overflow: hidden;
      color: #fff5d6;
      font-size: .72rem;
      font-weight: 900;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .crimon-tutorial-compact__chapter {
      flex: 0 0 auto;
      margin-left: auto;
      color: #8ee7aa;
      font-size: .66rem;
      font-weight: 900;
      white-space: nowrap;
    }

    .crimon-tutorial-compact__body {
      display: grid;
      gap: 5px;
      padding: 7px 10px 8px;
    }

    .crimon-tutorial-compact__mission {
      overflow: hidden;
      color: #fff;
      font-size: .74rem;
      font-weight: 900;
      line-height: 1.3;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .crimon-tutorial-compact__foot {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .crimon-tutorial-compact__overall {
      flex: 0 0 auto;
      color: #b9c6da;
      font-size: .66rem;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .crimon-tutorial-compact--ready .crimon-tutorial-compact__overall {
      color: #91e7ad;
    }

    .crimon-tutorial-compact__actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
      margin-left: auto;
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

      html body .crimon-home .crimon-tutorial.crimon-tutorial--compact {
        margin: 3px 6px 7px !important;
      }

      .crimon-tutorial-compact__top {
        gap: 5px;
        padding-inline: 8px;
      }

      /* 9pxを割らない(巡回が落とす)。.70rem = 11.2px */
      .crimon-tutorial-compact__title {
        font-size: .70rem;
      }

      .crimon-tutorial-compact__chapter {
        font-size: .63rem;
      }

      .crimon-tutorial-compact__body {
        padding-inline: 8px;
      }

      .crimon-tutorial-compact__mission {
        font-size: .71rem;
      }

      .crimon-tutorial-compact__overall {
        font-size: .63rem;
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

  const title = document.createElement("span");
  title.className = "crimon-tutorial-compact__title";
  title.textContent = "✦ 初心者ミッション";

  const chapterText = document.createElement("span");
  chapterText.className = "crimon-tutorial-compact__chapter";
  chapterText.textContent = `第${chapter}章 ${chapterDone}/${MISSIONS_PER_CHAPTER}`;
  top.append(title, chapterText);

  const body = document.createElement("div");
  body.className = "crimon-tutorial-compact__body";

  const mission = document.createElement("strong");
  mission.className = "crimon-tutorial-compact__mission";
  mission.textContent = condition;

  const foot = document.createElement("div");
  foot.className = "crimon-tutorial-compact__foot";

  /*
   * 全体の進みは**ボタンと同じ段へ**。1段目へ足すと「✦ 初心者ミッション」
   * 「第1章 0/8」と3つ並び、幅170pxに205px入れることになって重なる。
   */
  const overall = document.createElement("span");
  overall.className = "crimon-tutorial-compact__overall";
  overall.textContent = `${claimed} / ${TOTAL_BEGINNER_MISSIONS}`;

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
  foot.append(overall, actions);
  body.append(mission, foot);
  wrapper.append(top, body);
  section.replaceChildren(wrapper);
}

/*
 * **直下ではなく子孫で探す。**初心者ミッションは世界の中(左右の縦列の間)へ
 * 移してあり、`.crimon-home > .crimon-tutorial` では1つも拾えない。
 * 拾えないと2段カードへの作り替えが走らず、旧48pxの札のまま出る。
 */
function scan(): void {
  document.querySelectorAll<HTMLElement>(".crimon-home .crimon-tutorial").forEach(enhanceBeginnerMission);
}

installStyles();
scan();
new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
