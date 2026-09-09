/*
 * HOMEの初心者ミッション位置を、完成基準のレイアウトに固定する。
 *
 * 基準: プレイヤー/通貨ヘッダーの直下、CURRENT PARTYの直上。
 * CSSで浮かせたり transform で持ち上げたりせず、DOM順そのものを直す。
 * これによりスクロール位置や端末幅に関係なく、ワールド下部へ落ちない。
 */
function placeBeginnerMission(): void {
  document.querySelectorAll<HTMLElement>(".crimon-home").forEach((home) => {
    const header = home.querySelector<HTMLElement>(":scope > .crimon-resource-header");
    const tutorial = home.querySelector<HTMLElement>(":scope > .crimon-tutorial");
    if (!header || !tutorial) return;

    // 完成基準は「ヘッダー → 初心者ミッション → それ以外」。
    // すでに正しい場合はDOMを触らない。
    if (header.nextElementSibling === tutorial) return;
    header.insertAdjacentElement("afterend", tutorial);
  });
}

placeBeginnerMission();
new MutationObserver(placeBeginnerMission).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

export {};
