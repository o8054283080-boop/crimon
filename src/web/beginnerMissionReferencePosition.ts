/*
 * HOMEの初心者ミッション位置を、完成基準のレイアウトに固定する。
 *
 * 通常時の基準: プレイヤー/通貨ヘッダーの直下、CURRENT PARTYの直上。
 * クラウド復旧警告や配布バナーがある場合は、それらを先に見せた直後へ置く。
 * CSSで浮かせたり transform で持ち上げたりせず、DOM順そのものを直す。
 * これによりスクロール位置や端末幅に関係なく、ワールド下部へ落ちない。
 *
 * 80/80を達成した後は、初心者ミッションの役目は終わっているためHOMEから完全に外す。
 * compact化の前後どちらでも判定できるよう、旧完了表示とcompact完了表示の両方を見る。
 */
function placeBeginnerMission(): void {
  document.querySelectorAll<HTMLElement>(".crimon-home").forEach((home) => {
    const header = home.querySelector<HTMLElement>(":scope > .crimon-resource-header");
    const tutorial = home.querySelector<HTMLElement>(":scope > .crimon-tutorial");
    const bannerStack = home.querySelector<HTMLElement>(":scope > .reward-banner-stack");
    if (!header || !tutorial) return;

    const completed = tutorial.querySelector(
      ".crimon-tutorial__complete, .crimon-tutorial-compact__complete",
    );
    if (completed) {
      tutorial.remove();
      return;
    }

    // 通常時: ヘッダー → 初心者ミッション → CURRENT PARTY
    // 警告/配布あり: ヘッダー → 警告/配布 → 初心者ミッション → CURRENT PARTY
    const anchor = bannerStack ?? header;
    if (anchor.nextElementSibling === tutorial) return;
    anchor.insertAdjacentElement("afterend", tutorial);
  });
}

placeBeginnerMission();
new MutationObserver(placeBeginnerMission).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

export {};
