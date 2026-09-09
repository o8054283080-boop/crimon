/*
 * HOMEの初心者ミッション位置を、完成基準のレイアウトに固定する。
 *
 * 通常時の基準: プレイヤー/通貨ヘッダーの直下、CURRENT PARTYの直上。
 * クラウド復旧警告や配布バナーがある場合は、それらを先に見せた直後へ置く。
 * CSSで浮かせたり transform で持ち上げたりせず、DOM順そのものを直す。
 * これによりスクロール位置や端末幅に関係なく、ワールド下部へ落ちない。
 */
function placeBeginnerMission(): void {
  document.querySelectorAll<HTMLElement>(".crimon-home").forEach((home) => {
    const header = home.querySelector<HTMLElement>(":scope > .crimon-resource-header");
    const tutorial = home.querySelector<HTMLElement>(":scope > .crimon-tutorial");
    const bannerStack = home.querySelector<HTMLElement>(":scope > .reward-banner-stack");
    if (!header || !tutorial) return;

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
