const BACKGROUND_FARM_PANEL = '[data-floating-panel="background-farm"]';
const STORAGE_KEY = 'crimon.floating-panel.v1.background-farm';

interface FloatingPanelUiState {
  x?: number;
  y?: number;
  displayState?: 'expanded' | 'compact' | 'docked';
  dockSide?: 'left' | 'right';
}

function readUiState(): FloatingPanelUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as FloatingPanelUiState : {};
  } catch {
    return {};
  }
}

function writeUiState(state: FloatingPanelUiState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* UI state must never block play. */ }
}

function panelTop(panel: HTMLElement): number {
  const rect = panel.getBoundingClientRect();
  const max = Math.max(8, window.innerHeight - rect.height - 80);
  return Math.min(max, Math.max(8, rect.top || Math.round(window.innerHeight * 0.28)));
}

function showState(panel: HTMLElement, state: 'expanded' | 'compact' | 'docked'): void {
  const body = panel.querySelector<HTMLElement>('.floating-panel__body');
  const compact = panel.querySelector<HTMLElement>('.floating-panel__compact');
  const docked = panel.querySelector<HTMLElement>('.floating-panel__docked');
  panel.dataset.displayState = state;
  panel.classList.toggle('floating-panel--minimized', state === 'compact');
  panel.classList.toggle('floating-panel--docked', state === 'docked');
  if (body) body.hidden = state !== 'expanded';
  if (compact) compact.hidden = state !== 'compact';
  if (docked) docked.hidden = state !== 'docked';
}

function dockLeft(panel: HTMLElement): void {
  const y = panelTop(panel);
  showState(panel, 'docked');
  panel.dataset.dockSide = 'left';
  panel.dataset.normalY = String(y);
  panel.style.left = '0px';
  panel.style.right = 'auto';
  panel.style.top = `${y}px`;
  panel.style.bottom = 'auto';
  writeUiState({ x: 0, y, displayState: 'docked', dockSide: 'left' });
}

function restoreFromDock(panel: HTMLElement): void {
  const y = panelTop(panel);
  const x = Math.max(8, Number(panel.dataset.normalX) || 8);
  showState(panel, 'expanded');
  panel.dataset.dockSide = 'left';
  panel.dataset.normalX = String(x);
  panel.dataset.normalY = String(y);
  panel.style.left = `${x}px`;
  panel.style.right = 'auto';
  panel.style.top = `${y}px`;
  panel.style.bottom = 'auto';
  writeUiState({ x, y, displayState: 'expanded', dockSide: 'left' });
}

function enhanceBackgroundFarmPanel(panel: HTMLElement): void {
  if (panel.dataset.homeFloatingUx === '1') return;
  panel.dataset.homeFloatingUx = '1';

  const body = panel.querySelector<HTMLElement>('.floating-panel__body');
  if (body && !body.querySelector('.floating-panel__quick-dock')) {
    const dockButton = document.createElement('button');
    dockButton.type = 'button';
    dockButton.className = 'floating-panel__quick-dock';
    dockButton.setAttribute('aria-label', 'オフライン周回を左に収納');
    dockButton.title = '左に収納';
    dockButton.textContent = '‹';
    dockButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dockLeft(panel);
    });
    body.prepend(dockButton);
  }

  const dockedButton = panel.querySelector<HTMLButtonElement>('.floating-panel__docked');
  if (dockedButton && dockedButton.dataset.homeFloatingUx !== '1') {
    dockedButton.dataset.homeFloatingUx = '1';
    dockedButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      restoreFromDock(panel);
    }, true);
  }

  const saved = readUiState();
  if (saved.x === undefined && saved.y === undefined && panel.dataset.displayState !== 'docked') {
    requestAnimationFrame(() => {
      if (!panel.isConnected || panel.dataset.displayState === 'docked') return;
      const y = Math.max(8, Math.round(window.innerHeight * 0.29));
      panel.dataset.normalX = '8';
      panel.dataset.normalY = String(y);
      panel.dataset.dockSide = 'left';
      panel.style.left = '8px';
      panel.style.right = 'auto';
      panel.style.top = `${y}px`;
      panel.style.bottom = 'auto';
      writeUiState({ x: 8, y, displayState: panel.dataset.displayState as FloatingPanelUiState['displayState'] ?? 'expanded', dockSide: 'left' });
    });
  }
}

function scan(): void {
  document.querySelectorAll<HTMLElement>(BACKGROUND_FARM_PANEL).forEach(enhanceBackgroundFarmPanel);
}

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();
