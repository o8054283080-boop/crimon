import { el } from "./dom.js";

export type FloatingPanelPlacement = "top" | "bottom";
export type FloatingPanelDisplayState = "expanded" | "compact" | "docked";
export type FloatingPanelDockSide = "left" | "right";

export interface FloatingPanelState {
  x?: number;
  y?: number;
  displayState: FloatingPanelDisplayState;
  dockSide: FloatingPanelDockSide;
}

export interface FloatingPanelOptions {
  id: string;
  label: string;
  placement: FloatingPanelPlacement;
  compact: HTMLElement;
  /** 旧呼び出し元は未指定でも動作する。指定時は従来どおりその内容を優先する。 */
  docked?: HTMLElement;
  content: HTMLElement[];
  forceCompact?: boolean;
}

const STORAGE_PREFIX = "crimon.floating-panel.v1.";
export const DRAG_THRESHOLD = 6;
export const EDGE_DOCK_THRESHOLD = 40;
const PANEL_MARGIN = 8;
const DOCK_COLLISION_GAP = 8;

export interface FloatingBounds { x: number; y: number }

/** DOMに依存しないクランプ計算。端末回転とSafe Areaの境界条件も単体試験できる。 */
export function constrainFloatingPosition(input: {
  x: number; y: number; width: number; height: number; viewportWidth: number; viewportHeight: number;
  safe: { top: number; right: number; bottom: number; left: number }; margin?: number; bottomObstruction?: number;
}): FloatingBounds {
  const margin = input.margin ?? PANEL_MARGIN;
  const bottomObstruction = Math.max(0, input.bottomObstruction ?? 0);
  const minX = input.safe.left + margin;
  const minY = input.safe.top + margin;
  const maxX = Math.max(minX, input.viewportWidth - input.safe.right - margin - input.width);
  const maxY = Math.max(minY, input.viewportHeight - input.safe.bottom - bottomObstruction - margin - input.height);
  return { x: Math.min(maxX, Math.max(minX, input.x)), y: Math.min(maxY, Math.max(minY, input.y)) };
}

export function normalizeFloatingPanelState(value: unknown): FloatingPanelState {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const legacy = candidate.minimized === true ? "compact" : "expanded";
  const displayState = candidate.displayState === "compact" || candidate.displayState === "docked" || candidate.displayState === "expanded"
    ? candidate.displayState : legacy;
  return {
    x: typeof candidate.x === "number" && Number.isFinite(candidate.x) ? candidate.x : undefined,
    y: typeof candidate.y === "number" && Number.isFinite(candidate.y) ? candidate.y : undefined,
    displayState,
    dockSide: candidate.dockSide === "left" ? "left" : "right",
  };
}

export function edgeDockSide(pointerX: number, viewportWidth: number, safe: { left: number; right: number }): FloatingPanelDockSide | null {
  if (pointerX <= safe.left + EDGE_DOCK_THRESHOLD) return "left";
  if (pointerX >= viewportWidth - safe.right - EDGE_DOCK_THRESHOLD) return "right";
  return null;
}

function readState(id: string): FloatingPanelState {
  try { return normalizeFloatingPanelState(JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${id}`) ?? "null")); }
  catch { return normalizeFloatingPanelState(null); }
}

function writeState(id: string, value: FloatingPanelState): void {
  try { localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(value)); } catch { /* UI設定の保存失敗はゲームを止めない。 */ }
}

function safeInsets(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement("div");
  probe.className = "floating-panel-safe-probe";
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const result = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  probe.remove();
  return result;
}

/** 実DOMを優先し、未生成時も共通CSS変数ぶんの下部ナビ領域を予約する。 */
function bottomNavigationHeight(): number {
  const nav = document.querySelector<HTMLElement>(".bottom-nav");
  const measured = nav?.getBoundingClientRect().height ?? 0;
  if (measured > 0) return measured;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-h")) || 0;
}

function panelState(panel: HTMLElement): FloatingPanelState {
  return {
    x: Number.isFinite(Number(panel.dataset.normalX)) ? Number(panel.dataset.normalX) : undefined,
    y: Number.isFinite(Number(panel.dataset.normalY)) ? Number(panel.dataset.normalY) : undefined,
    displayState: panel.dataset.displayState as FloatingPanelDisplayState,
    dockSide: panel.dataset.dockSide as FloatingPanelDockSide,
  };
}

/** パネルを現在のviewportとSafe Areaの内側へ収め、DOCK中は同じ辺のタブとの完全重複も避ける。 */
export function clampFloatingPanel(panel: HTMLElement): void {
  if (!panel.isConnected) return;
  const safe = safeInsets();
  const bottomObstruction = bottomNavigationHeight();
  const rect = panel.getBoundingClientRect();
  const state = panelState(panel);
  let x = rect.left;
  let y = Number.isFinite(state.y) ? state.y! : rect.top;
  if (state.displayState === "docked") {
    x = state.dockSide === "left" ? safe.left : window.innerWidth - safe.right - rect.width;
    const bounds = constrainFloatingPosition({ x, y, width: rect.width, height: rect.height, viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight, safe, margin: 0, bottomObstruction: bottomObstruction + PANEL_MARGIN });
    x = state.dockSide === "left" ? safe.left : window.innerWidth - safe.right - rect.width;
    y = bounds.y;
    const occupied = [...document.querySelectorAll<HTMLElement>(`[data-floating-panel][data-display-state="docked"][data-dock-side="${state.dockSide}"]`)]
      .filter(other => other !== panel && other.isConnected && (other.dataset.floatingPanel ?? "") < (panel.dataset.floatingPanel ?? ""))
      .map(other => other.getBoundingClientRect());
    for (const other of occupied) {
      if (y < other.bottom + DOCK_COLLISION_GAP && y + rect.height > other.top - DOCK_COLLISION_GAP) {
        const below = other.bottom + DOCK_COLLISION_GAP;
        const maxY = window.innerHeight - safe.bottom - bottomObstruction - PANEL_MARGIN - rect.height;
        y = below <= maxY ? below : Math.max(safe.top, other.top - rect.height - DOCK_COLLISION_GAP);
      }
    }
  } else {
    const bounds = constrainFloatingPosition({ x: rect.left, y: rect.top, width: rect.width, height: rect.height,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, safe, bottomObstruction });
    x = bounds.x; y = bounds.y;
    panel.dataset.normalX = String(x); panel.dataset.normalY = String(y);
  }
  panel.style.left = `${x}px`; panel.style.top = `${y}px`; panel.style.right = "auto"; panel.style.bottom = "auto";
  if (state.displayState === "docked") panel.dataset.normalY = String(y);
  const id = panel.dataset.floatingPanel;
  if (id) writeState(id, panelState(panel));
}

let resizeInstalled = false;
function installResizeClamp(): void {
  if (resizeInstalled) return;
  resizeInstalled = true;
  window.addEventListener("resize", () => {
    document.querySelectorAll<HTMLElement>("[data-floating-panel]").forEach(clampFloatingPanel);
  }, { passive: true });
}

/**
 * #119より前の呼び出し元にもドック表示を提供する後方互換。
 * 明示された`docked`がある場合は一切使われない。
 */
function fallbackDockedContent(options: FloatingPanelOptions): HTMLElement {
  const text = options.compact.textContent ?? "";
  if (options.id === "background-farm") {
    const progress = text.match(/(\d+\/\d+)\s*$/)?.[1];
    return el("span", {}, [progress ? `🔄 ${progress}` : "🔄"]);
  }
  if (options.id === "tutorial-mission") {
    return el("span", {}, [text.includes("達成") ? "🎯！" : "🎯"]);
  }
  return options.compact.cloneNode(true) as HTMLElement;
}

/** ドラッグ、クランプ、三状態の表示設定永続化を全パネルで共有するDOMファクトリ。 */
export function createFloatingPanel(options: FloatingPanelOptions): HTMLElement {
  installResizeClamp();
  const saved = readState(options.id);
  const panel = el("aside", {
    className: `floating-panel floating-panel--${options.placement}`,
    "data-floating-panel": options.id, "data-display-state": saved.displayState, "data-dock-side": saved.dockSide,
    "data-normal-x": saved.x === undefined ? undefined : String(saved.x), "data-normal-y": saved.y === undefined ? undefined : String(saved.y),
    "aria-label": options.label,
  }, []);
  if (saved.x !== undefined && saved.y !== undefined) {
    panel.style.left = `${saved.x}px`; panel.style.top = `${saved.y}px`; panel.style.right = "auto"; panel.style.bottom = "auto";
  }

  const renderDisplayState = (): void => {
    const state = panelState(panel);
    const visibleState = options.forceCompact && state.displayState === "expanded" ? "compact" : state.displayState;
    panel.classList.toggle("floating-panel--minimized", visibleState === "compact");
    panel.classList.toggle("floating-panel--docked", visibleState === "docked");
    panel.querySelector<HTMLElement>(".floating-panel__body")!.hidden = visibleState !== "expanded";
    panel.querySelector<HTMLElement>(".floating-panel__compact")!.hidden = visibleState !== "compact";
    panel.querySelector<HTMLElement>(".floating-panel__docked")!.hidden = visibleState !== "docked";
  };
  const setDisplayState = (next: FloatingPanelDisplayState, dockSide?: FloatingPanelDockSide): void => {
    panel.dataset.displayState = next;
    if (dockSide) panel.dataset.dockSide = dockSide;
    renderDisplayState();
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
    dragged = true; panel.classList.add("floating-panel--dragging");
    panel.style.left = `${originX + dx}px`; panel.style.top = `${originY + dy}px`; panel.style.right = "auto"; panel.style.bottom = "auto";
    const rect = panel.getBoundingClientRect();
    const position = constrainFloatingPosition({ x: rect.left, y: rect.top, width: rect.width, height: rect.height,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, safe: safeInsets(), bottomObstruction: bottomNavigationHeight() });
    panel.style.left = `${position.x}px`; panel.style.top = `${position.y}px`;
  });
  const finishPointer = (event: PointerEvent, allowDock: boolean): void => {
    if (pointerId !== event.pointerId) return;
    pointerId = null; panel.classList.remove("floating-panel--dragging");
    if (!dragged) return;
    const rect = panel.getBoundingClientRect(); panel.dataset.normalX = String(rect.left); panel.dataset.normalY = String(rect.top);
    const side = allowDock ? edgeDockSide(event.clientX, window.innerWidth, safeInsets()) : null;
    if (side) setDisplayState("docked", side); else clampFloatingPanel(panel);
  };
  handle.addEventListener("pointerup", event => finishPointer(event, true));
  handle.addEventListener("pointercancel", event => finishPointer(event, false));
  handle.addEventListener("click", () => {
    if (!dragged && !options.forceCompact) setDisplayState(panel.dataset.displayState === "compact" ? "expanded" : "compact");
  });

  const compact = el("button", { type: "button", className: "floating-panel__compact", onclick: () => {
    if (!options.forceCompact) setDisplayState("expanded");
  } }, [options.compact]);
  const dockedContent = options.docked ?? fallbackDockedContent(options);
  const docked = el("button", { type: "button", className: "floating-panel__docked", "aria-label": `${options.label}を開く`, onclick: () => setDisplayState("compact") }, [dockedContent]);
  const collapse = el("button", { type: "button", className: "floating-panel__collapse", "aria-label": `${options.label}を最小化`, onclick: () => setDisplayState("compact") }, ["−"]);
  const body = el("div", { className: "floating-panel__body" }, [collapse, ...options.content]);
  panel.append(handle, compact, docked, body);
  renderDisplayState();
  requestAnimationFrame(() => clampFloatingPanel(panel));
  return panel;
}
