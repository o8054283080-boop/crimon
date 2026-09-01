const PANEL_SELECTOR = "[data-crimon-cloud-recovery]";
const MARKER = "data-crimon-origin-diagnostic";

function describeCurrentOrigin(): { label: string; tone: "new" | "old" | "other" } {
  const host = window.location.hostname;
  if (host.endsWith("pages.dev")) return { label: "新URL（Cloudflare Pages）", tone: "new" };
  if (host.endsWith("github.io")) return { label: "旧URL（GitHub Pages）", tone: "old" };
  return { label: "その他のURL", tone: "other" };
}

function attachDiagnostic(): void {
  document.querySelectorAll<HTMLElement>(PANEL_SELECTOR).forEach((panel) => {
    if (panel.querySelector(`[${MARKER}]`)) return;

    const info = describeCurrentOrigin();
    const box = document.createElement("div");
    box.setAttribute(MARKER, "");
    box.style.margin = "10px 0 14px";
    box.style.padding = "10px 12px";
    box.style.border = "1px solid rgba(255, 215, 120, 0.45)";
    box.style.borderRadius = "10px";
    box.style.background = "rgba(5, 14, 34, 0.72)";
    box.style.fontSize = "13px";
    box.style.lineHeight = "1.55";
    box.style.wordBreak = "break-all";

    const title = document.createElement("strong");
    title.textContent = `現在の接続先：${info.label}`;
    title.style.display = "block";
    title.style.marginBottom = "3px";

    const origin = document.createElement("span");
    origin.textContent = window.location.origin;

    box.append(title, origin);

    const header = panel.querySelector(".panel-header");
    if (header?.nextSibling) panel.insertBefore(box, header.nextSibling);
    else panel.prepend(box);
  });
}

attachDiagnostic();

const observer = new MutationObserver(() => attachDiagnostic());
observer.observe(document.body, { childList: true, subtree: true });
