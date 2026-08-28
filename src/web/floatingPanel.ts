import { el } from "./dom.js";

export type FloatingPanelPlacement = "top" | "bottom";

interface FloatingPanelState {
  x?: number;
  y?: number;
  minimized: boolean;
}

export interface FloatingPanelOptions {
  id: string;
  label: string;
  placement: FloatingPanelPlacement;
  compact: HTMLElement;
  content: HTMLElement[];
  forceCompact?: boolean;
}

const STORAGE_PREFIX = "crimon.floating-panel.v1.";
const DRAG_THRESHOLD = 6;

export interface FloatingBounds { x: number; y: number }

/** DOMに依存しないクランプ計算。端末回転とSafe Areaの境界条件も単体試験できる。 */
export function constrainFloatingPosition(input: {
  x: number; y: number; width: number; height: number; viewportWidth: number; viewportHeight: number;
  safe: { top: number; right: number; bottom: number; left: number }; margin?: number;
}): FloatingBounds {
  const margin = input.margin ?? 8;
  const minX = input.safe.left + margin;
  const minY = input.safe.top + margin;
  const maxX = Math.max(minX, input.viewportWidth - input.safe.right - margin - input.width);
  const maxY = Math.max(minY, input.viewportHeight - input.safe.bottom - margin - input.height);
  return { x: Math.min(maxX, Math.max(minX, input.x)), y: Math.min(maxY, Math.max(minY, input.y)) };
}

function readState(id: string): FloatingPanelState {
  try {
    const value = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${id}`) ?? "null") as Partial<FloatingPanelState> | null;
    return { x: value?.x, y: value?.y, minimized: value?.minimized === true };
  } catch {
    return { minimized: false };
  }
}

function writeState(id: string, value: FloatingPanelState): void {
  try { localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(value)); } catch { /* UI設定の保存失敗はゲームを止めない。 */ }
}

function safeInsets(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement("div");
  probe.className = "floating-panel-safe-probe";
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const result = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return result;
}

/** パネルを現在のviewportとSafe Areaの内側へ収め、保存位置も補正する。 */
export function clampFloatingPanel(panel: HTMLElement): void {
  if (!panel.isConnected) return;
  const safe = safeInsets();
  const rect = panel.getBoundingClientRect();
  const { x, y } = constrainFloatingPosition({ x: rect.left, y: rect.top, width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, safe });
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  const id = panel.dataset.floatingPanel;
  if (id) writeState(id, { x, y, minimized: panel.dataset.minimized === "true" });
}

let resizeInstalled = false;
function installResizeClamp(): void {
  if (resizeInstalled) return;
  resizeInstalled = true;
  window.addEventListener("resize", () => {
    document.querySelectorAll<HTMLElement>("[data-floating-panel]").forEach(clampFloatingPanel);
  }, { passive: true });
}

/** ドラッグ、クランプ、表示設定永続化を全パネルで共有するDOMファクトリ。 */
export function createFloatingPanel(options: FloatingPanelOptions): HTMLElement {
  installResizeClamp();
  const saved = readState(options.id);
  const minimized = options.forceCompact || saved.minimized;
  const panel = el("aside", {
    className: `floating-panel floating-panel--${options.placement}${minimized ? " floating-panel--minimized" : ""}`,
    "data-floating-panel": options.id,
    "data-minimized": String(saved.minimized),
    "aria-label": options.label,
  }, []);
  if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    panel.style.left = `${saved.x}px`;
    panel.style.top = `${saved.y}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  const setMinimized = (next: boolean): void => {
    panel.dataset.minimized = String(next);
    panel.classList.toggle("floating-panel--minimized", next);
    panel.querySelector<HTMLElement>(".floating-panel__body")!.hidden = next;
    panel.querySelector<HTMLElement>(".floating-panel__compact")!.hidden = !next;
    const rect = panel.getBoundingClientRect();
    writeState(options.id, { x: rect.left, y: rect.top, minimized: next });
    requestAnimationFrame(() => clampFloatingPanel(panel));
  };

  const handle = el("button", { type: "button", className: "floating-panel__handle", "aria-label": `${options.label}を移動（タップで最小化）` }, ["━━"]);
  let pointerId: number | null = null;
  let startX = 0; let startY = 0; let originX = 0; let originY = 0; let dragged = false;
  handle.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) return;
    pointerId = event.pointerId; startX = event.clientX; startY = event.clientY;
    const rect = panel.getBoundingClientRect(); originX = rect.left; originY = rect.top; dragged = false;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startX; const dy = event.clientY - startY;
    if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    dragged = true;
    panel.classList.add("floating-panel--dragging");
    panel.style.left = `${originX + dx}px`; panel.style.top = `${originY + dy}px`;
    panel.style.right = "auto"; panel.style.bottom = "auto";
    clampFloatingPanel(panel);
  });
  const finishPointer = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return;
    pointerId = null; panel.classList.remove("floating-panel--dragging");
    if (dragged) clampFloatingPanel(panel);
  };
  handle.addEventListener("pointerup", finishPointer);
  handle.addEventListener("pointercancel", finishPointer);
  handle.addEventListener("click", () => { if (!dragged && !options.forceCompact) setMinimized(panel.dataset.minimized !== "true"); });

  const compact = el("button", { type: "button", className: "floating-panel__compact", hidden: !minimized, onclick: () => {
    if (!options.forceCompact) setMinimized(false);
  } }, [options.compact]);
  const collapse = el("button", { type: "button", className: "floating-panel__collapse", "aria-label": `${options.label}を最小化`, onclick: () => setMinimized(true) }, ["−"]);
  const body = el("div", { className: "floating-panel__body", hidden: minimized }, [collapse, ...options.content]);
  panel.append(handle, compact, body);
  requestAnimationFrame(() => clampFloatingPanel(panel));
  return panel;
}
