import "./adminPanel.css";

const ADMIN_SESSION_KEY = "crimon.admin.session.v1";
const ADMIN_ENTRY_CLASS = "crimon-admin-entry-wrap";

type AdminSummary = {
  authUsers: number;
  arenaProfiles: number;
  recoveryAccounts: number;
};

type ArenaPlayer = {
  userId: string;
  displayName: string;
  leadDexId: string | null;
  leadStar: number;
  rating: number;
  bestRating: number;
  tierId: string;
  wins: number;
  losses: number;
  defenseWins: number;
  defenseLosses: number;
  coins: number;
  lifetimeCoins: number;
  tickets: number;
  ticketsMax: number;
  createdAt: string | null;
  updatedAt: string | null;
  lastMatchAt: string | null;
};

type RecoveryAccount = {
  id: string;
  recoveryId: string;
  latestRevision: number;
  latestSavedAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  fighterName: string;
  fighterLevel: number;
  gold: number;
  crystal: number;
  monsterCount: number;
  equipmentCount: number;
};

type AdminDashboard = {
  generatedAt: string;
  activeSeason: { id: string; name: string; status: string; starts_at: string; ends_at: string } | null;
  summary: AdminSummary;
  arenaPlayers: ArenaPlayer[];
  recoveryAccounts: RecoveryAccount[];
};

type ArenaDetail = {
  profile: Record<string, unknown> | null;
  wallet: Record<string, unknown> | null;
  standings: Record<string, unknown>[];
  matches: Record<string, unknown>[];
  purchases: Record<string, unknown>[];
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readEnv(name: string): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    const value = env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    /* import.meta が無い実行環境 */
  }
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    const value = proc?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    /* process が無い実行環境 */
  }
  return "";
}

function endpoint(): { url: string; anonKey: string } | null {
  const base = readEnv("VITE_SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = readEnv("VITE_SUPABASE_ANON_KEY");
  if (!base || !anonKey || !/^https?:\/\//i.test(base)) return null;
  return { url: `${base}/functions/v1/crimon-admin`, anonKey };
}

function token(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY);
  } catch {
    return null;
  }
}

function saveToken(value: string | null): void {
  try {
    if (value) sessionStorage.setItem(ADMIN_SESSION_KEY, value);
    else sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    /* Safari private modeなどでも、この起動中の画面自体は使える */
  }
}

async function adminPost<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const target = endpoint();
  if (!target) throw new Error("管理APIの接続設定がありません");
  const response = await fetch(target.url, {
    method: "POST",
    headers: {
      apikey: target.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...data }),
  });
  let json: Record<string, unknown> = {};
  try {
    json = await response.json() as Record<string, unknown>;
  } catch {
    throw new Error("管理APIから正しい応答を受け取れませんでした");
  }
  if (!response.ok) {
    const code = typeof json.error === "string" ? json.error : "request_failed";
    if (response.status === 401 && action !== "login") saveToken(null);
    const messages: Record<string, string> = {
      invalid_password: "パスワードが違います",
      unauthorized: "管理者セッションの有効期限が切れました。もう一度ログインしてください",
      password_length: "新しいパスワードは10〜128文字で入力してください",
      admin_not_configured: "管理者設定がまだ完了していません",
    };
    throw new Error(messages[code] ?? `管理APIエラー: ${code}`);
  }
  return json as T;
}

function formatNumber(value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString("ja-JP") : "-";
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function metric(label: string, value: string): HTMLElement {
  const wrap = el("span", "crimon-admin-metric");
  wrap.append(el("small", "", label), el("strong", "", value));
  return wrap;
}

function summaryCard(label: string, value: number): HTMLElement {
  const card = el("div", "crimon-admin-summary__card");
  card.append(el("small", "", label), el("strong", "", formatNumber(value)));
  return card;
}

function setBusy(button: HTMLButtonElement, busy: boolean, normalText: string, busyText: string): void {
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

let overlay: HTMLElement | null = null;
let previousBodyOverflow = "";
let currentDashboard: AdminDashboard | null = null;
let currentTab: "RECOVERY" | "ARENA" = "RECOVERY";
let currentSearch = "";

function closeAdmin(): void {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = previousBodyOverflow;
}

function topbar(body: HTMLElement): HTMLElement {
  const bar = el("header", "crimon-admin-topbar");
  const title = el("div", "crimon-admin-topbar__title");
  title.append(el("strong", "", "CRIMON 管理者画面"), el("small", "", "登録プレイヤー / アリーナデータ"));
  const close = el("button", "crimon-admin-btn", "閉じる");
  close.type = "button";
  close.onclick = closeAdmin;
  bar.append(title, close);
  body.append(bar);
  return bar;
}

function renderLogin(root: HTMLElement, message = ""): void {
  currentDashboard = null;
  root.replaceChildren();
  topbar(root);
  const body = el("div", "crimon-admin-body");
  const card = el("form", "crimon-admin-login");
  const title = el("h2", "", "管理者ログイン");
  const desc = el("p", "", "登録プレイヤーのデータを確認するため、管理者パスワードを入力してください。パスワードは端末へ保存しません。");
  const label = el("label", "crimon-admin-field");
  label.append(el("span", "", "管理者パスワード"));
  const input = el("input") as HTMLInputElement;
  input.type = "password";
  input.autocomplete = "current-password";
  input.required = true;
  input.maxLength = 128;
  label.append(input);
  const error = el("div", "crimon-admin-error", message);
  const submit = el("button", "crimon-admin-btn crimon-admin-btn--primary", "管理者画面を開く") as HTMLButtonElement;
  submit.type = "submit";
  card.append(title, desc, label, error, submit);
  card.onsubmit = async (event) => {
    event.preventDefault();
    const password = input.value;
    if (!password) return;
    error.textContent = "";
    setBusy(submit, true, "管理者画面を開く", "確認中…");
    try {
      const result = await adminPost<{ token: string }>("login", { password });
      saveToken(result.token);
      input.value = "";
      await loadDashboard(root);
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : "ログインできませんでした";
      input.select();
    } finally {
      setBusy(submit, false, "管理者画面を開く", "確認中…");
    }
  };
  body.append(card);
  root.append(body);
  window.setTimeout(() => input.focus(), 0);
}

function renderDashboard(root: HTMLElement, dashboard: AdminDashboard): void {
  root.replaceChildren();
  const bar = topbar(root);
  const logout = el("button", "crimon-admin-btn crimon-admin-btn--danger", "ログアウト") as HTMLButtonElement;
  logout.type = "button";
  logout.onclick = () => {
    saveToken(null);
    renderLogin(root);
  };
  bar.insertBefore(logout, bar.lastElementChild);

  const body = el("div", "crimon-admin-body");
  const dash = el("main", "crimon-admin-dashboard");
  const summary = el("section", "crimon-admin-summary");
  summary.append(
    summaryCard("Supabase認証", dashboard.summary.authUsers),
    summaryCard("アリーナ登録", dashboard.summary.arenaProfiles),
    summaryCard("データ復旧登録", dashboard.summary.recoveryAccounts),
  );
  dash.append(summary);
  const season = dashboard.activeSeason;
  dash.append(el("p", "crimon-admin-season", season ? `現在のアリーナ: ${season.name} (${season.id})` : "アリーナシーズン情報なし"));

  const tabs = el("div", "crimon-admin-tabs");
  const recoveryTab = el("button", `crimon-admin-tab${currentTab === "RECOVERY" ? " is-active" : ""}`, "登録データ") as HTMLButtonElement;
  const arenaTab = el("button", `crimon-admin-tab${currentTab === "ARENA" ? " is-active" : ""}`, "アリーナ") as HTMLButtonElement;
  recoveryTab.type = arenaTab.type = "button";
  tabs.append(recoveryTab, arenaTab);

  const toolbar = el("div", "crimon-admin-toolbar");
  const search = el("input", "crimon-admin-search") as HTMLInputElement;
  search.type = "search";
  search.placeholder = "プレイヤー名 / IDで検索";
  search.value = currentSearch;
  const refresh = el("button", "crimon-admin-btn", "更新") as HTMLButtonElement;
  refresh.type = "button";
  toolbar.append(search, refresh);

  const listHost = el("section", "crimon-admin-section");
  const rerenderList = () => renderActiveList(listHost, dashboard);
  recoveryTab.onclick = () => {
    currentTab = "RECOVERY";
    recoveryTab.classList.add("is-active");
    arenaTab.classList.remove("is-active");
    rerenderList();
  };
  arenaTab.onclick = () => {
    currentTab = "ARENA";
    arenaTab.classList.add("is-active");
    recoveryTab.classList.remove("is-active");
    rerenderList();
  };
  search.oninput = () => {
    currentSearch = search.value;
    rerenderList();
  };
  refresh.onclick = async () => {
    setBusy(refresh, true, "更新", "更新中…");
    try {
      await loadDashboard(root);
    } catch {
      /* loadDashboard が画面にエラーを出す */
    } finally {
      setBusy(refresh, false, "更新", "更新中…");
    }
  };

  const settings = renderAdminSettings(root);
  dash.append(tabs, toolbar, listHost, settings);
  body.append(dash);
  root.append(body);
  rerenderList();
}

function matchesSearch(...values: unknown[]): boolean {
  const needle = currentSearch.trim().toLocaleLowerCase("ja-JP");
  if (!needle) return true;
  return values.some((value) => String(value ?? "").toLocaleLowerCase("ja-JP").includes(needle));
}

function renderActiveList(host: HTMLElement, dashboard: AdminDashboard): void {
  host.replaceChildren();
  const head = el("div", "crimon-admin-section__head");
  const list = el("div", "crimon-admin-list");
  if (currentTab === "RECOVERY") {
    const rows = dashboard.recoveryAccounts.filter((row) => matchesSearch(row.fighterName, row.recoveryId, row.id));
    head.append(el("h3", "", "データ復旧に登録されているプレイヤー"), el("span", "", `${rows.length}件`));
    for (const row of rows) {
      const item = el("div", "crimon-admin-row");
      const primary = el("span", "crimon-admin-row__primary");
      primary.append(el("strong", "", row.fighterName || "名前未設定"), el("small", "", `復旧ID: ${row.recoveryId || "-"}`));
      item.append(
        primary,
        metric("レベル", row.fighterLevel ? `Lv.${row.fighterLevel}` : "-"),
        metric("ゴールド", formatNumber(row.gold)),
        metric("ダイヤ", formatNumber(row.crystal)),
        metric("最終保存", formatDate(row.latestSavedAt)),
      );
      list.append(item);
    }
    if (rows.length === 0) list.append(el("div", "crimon-admin-empty", "該当する登録データはありません"));
  } else {
    const rows = dashboard.arenaPlayers.filter((row) => matchesSearch(row.displayName, row.userId, row.tierId));
    head.append(el("h3", "", "アリーナに登録されているプレイヤー"), el("span", "", `${rows.length}件`));
    for (const row of rows) {
      const item = el("button", "crimon-admin-row") as HTMLButtonElement;
      item.type = "button";
      const primary = el("span", "crimon-admin-row__primary");
      primary.append(el("strong", "", row.displayName || "名前未設定"), el("small", "", row.userId));
      item.append(
        primary,
        metric("レート", formatNumber(row.rating)),
        metric("ランク", row.tierId || "-"),
        metric("勝敗", `${row.wins}勝 ${row.losses}敗`),
        metric("コイン", formatNumber(row.coins)),
      );
      item.onclick = () => void loadArenaDetail(host.closest(".crimon-admin-overlay") as HTMLElement, row);
      list.append(item);
    }
    if (rows.length === 0) list.append(el("div", "crimon-admin-empty", "該当するアリーナプレイヤーはいません"));
  }
  host.append(head, list);
}

function renderAdminSettings(root: HTMLElement): HTMLElement {
  const details = el("details", "crimon-admin-settings");
  const summary = el("summary", "", "管理者パスワードを変更");
  const inner = el("form", "crimon-admin-settings__inner");
  const label = el("label", "crimon-admin-field");
  label.append(el("span", "", "新しいパスワード（10文字以上）"));
  const input = el("input") as HTMLInputElement;
  input.type = "password";
  input.autocomplete = "new-password";
  input.minLength = 10;
  input.maxLength = 128;
  input.required = true;
  label.append(input);
  const error = el("div", "crimon-admin-error");
  const submit = el("button", "crimon-admin-btn", "パスワードを変更") as HTMLButtonElement;
  submit.type = "submit";
  inner.append(label, error, submit);
  inner.onsubmit = async (event) => {
    event.preventDefault();
    const session = token();
    if (!session) {
      renderLogin(root, "管理者セッションの有効期限が切れました");
      return;
    }
    if (input.value.length < 10) {
      error.textContent = "10文字以上で入力してください";
      return;
    }
    error.textContent = "";
    setBusy(submit, true, "パスワードを変更", "変更中…");
    try {
      const result = await adminPost<{ ok: boolean; token: string }>("change_password", { token: session, newPassword: input.value });
      saveToken(result.token);
      input.value = "";
      error.textContent = "変更しました。次回から新しいパスワードを使用してください。";
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : "変更できませんでした";
    } finally {
      setBusy(submit, false, "パスワードを変更", "変更中…");
    }
  };
  details.append(summary, inner);
  return details;
}

function detailValue(parent: HTMLElement, label: string, value: string): void {
  const item = el("div");
  item.append(el("small", "", label), el("strong", "", value));
  parent.append(item);
}

async function loadArenaDetail(root: HTMLElement, player: ArenaPlayer): Promise<void> {
  const session = token();
  if (!session) {
    renderLogin(root, "管理者セッションの有効期限が切れました");
    return;
  }
  root.replaceChildren();
  topbar(root);
  const body = el("div", "crimon-admin-body");
  body.append(el("div", "crimon-admin-loading", "プレイヤーデータを読み込み中…"));
  root.append(body);
  try {
    const detail = await adminPost<ArenaDetail>("arena_detail", { token: session, userId: player.userId });
    body.replaceChildren(renderArenaDetail(root, player, detail));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "プレイヤーデータを取得できませんでした";
    if (!token()) {
      renderLogin(root, message);
      return;
    }
    body.replaceChildren(el("div", "crimon-admin-empty", message));
  }
}

function renderArenaDetail(root: HTMLElement, player: ArenaPlayer, detail: ArenaDetail): HTMLElement {
  const wrap = el("main", "crimon-admin-dashboard crimon-admin-detail");
  const back = el("button", "crimon-admin-btn crimon-admin-detail__back", "← 一覧へ戻る") as HTMLButtonElement;
  back.type = "button";
  back.onclick = () => currentDashboard ? renderDashboard(root, currentDashboard) : void loadDashboard(root);
  wrap.append(back);

  const profileCard = el("section", "crimon-admin-detail__card");
  profileCard.append(el("h3", "", player.displayName || "名前未設定"));
  const kv = el("div", "crimon-admin-kv");
  detailValue(kv, "ユーザーID", player.userId);
  detailValue(kv, "レート", formatNumber(player.rating));
  detailValue(kv, "最高レート", formatNumber(player.bestRating));
  detailValue(kv, "ランク", player.tierId || "-");
  detailValue(kv, "攻撃勝敗", `${player.wins}勝 ${player.losses}敗`);
  detailValue(kv, "防衛勝敗", `${player.defenseWins}勝 ${player.defenseLosses}敗`);
  detailValue(kv, "アリーナコイン", formatNumber(player.coins));
  detailValue(kv, "累計コイン", formatNumber(player.lifetimeCoins));
  detailValue(kv, "チケット", `${player.tickets} / ${player.ticketsMax || "-"}`);
  detailValue(kv, "最終対戦", formatDate(player.lastMatchAt));
  profileCard.append(kv);
  wrap.append(profileCard);

  const matchesCard = el("section", "crimon-admin-detail__card");
  matchesCard.append(el("h3", "", "最近の対戦"));
  const matches = el("div", "crimon-admin-history");
  for (const match of detail.matches) {
    const isAttacker = String(match.attacker_id ?? "") === player.userId;
    const won = Boolean(match.attacker_won);
    const result = isAttacker ? (won ? "勝利" : "敗北") : (won ? "防衛敗北" : "防衛勝利");
    const delta = isAttacker ? Number(match.attacker_rating_delta ?? 0) : Number(match.defender_rating_delta ?? 0);
    const opponent = String(match.opponent_kind ?? "") === "NPC"
      ? String(match.npc_name ?? "NPC")
      : isAttacker ? String(match.defender_id ?? "-") : String(match.attacker_id ?? "-");
    const item = el("div", "crimon-admin-history__item");
    const left = el("span");
    left.append(el("strong", "", `${result}　${delta >= 0 ? "+" : ""}${delta}`), el("small", "", `相手: ${opponent}`));
    item.append(left, el("small", "", formatDate(match.created_at)));
    matches.append(item);
  }
  if (detail.matches.length === 0) matches.append(el("div", "crimon-admin-empty", "対戦履歴はありません"));
  matchesCard.append(matches);
  wrap.append(matchesCard);

  const purchasesCard = el("section", "crimon-admin-detail__card");
  purchasesCard.append(el("h3", "", "最近のアリーナショップ購入"));
  const purchases = el("div", "crimon-admin-history");
  for (const purchase of detail.purchases) {
    const item = el("div", "crimon-admin-history__item");
    const left = el("span");
    left.append(
      el("strong", "", `${String(purchase.item_id ?? "不明")} ×${formatNumber(purchase.quantity)}`),
      el("small", "", `${formatNumber(purchase.total_price)} コイン${purchase.fulfilled_at ? " / 受取済" : " / 未受取"}`),
    );
    item.append(left, el("small", "", formatDate(purchase.created_at)));
    purchases.append(item);
  }
  if (detail.purchases.length === 0) purchases.append(el("div", "crimon-admin-empty", "購入履歴はありません"));
  purchasesCard.append(purchases);
  wrap.append(purchasesCard);
  return wrap;
}

async function loadDashboard(root: HTMLElement): Promise<void> {
  const session = token();
  if (!session) {
    renderLogin(root);
    return;
  }
  root.replaceChildren();
  topbar(root);
  const body = el("div", "crimon-admin-body");
  body.append(el("div", "crimon-admin-loading", "登録プレイヤーを読み込み中…"));
  root.append(body);
  try {
    const dashboard = await adminPost<AdminDashboard>("dashboard", { token: session });
    currentDashboard = dashboard;
    renderDashboard(root, dashboard);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "管理者データを取得できませんでした";
    if (!token()) {
      renderLogin(root, message);
      return;
    }
    body.replaceChildren(el("div", "crimon-admin-empty", message));
  }
}

function ensureOverlay(): HTMLElement {
  if (overlay && document.documentElement.contains(overlay)) return overlay;
  overlay = el("div", "crimon-admin-overlay");
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "CRIMON 管理者画面");
  document.body.append(overlay);
  return overlay;
}

function openAdmin(): void {
  const root = ensureOverlay();
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  root.hidden = false;
  if (token()) void loadDashboard(root);
  else renderLogin(root);
}

function attachEntry(): void {
  const homes = document.querySelectorAll<HTMLElement>(".crimon-home");
  for (const home of homes) {
    if (home.querySelector(`:scope > .${ADMIN_ENTRY_CLASS}`)) continue;
    const wrap = el("div", ADMIN_ENTRY_CLASS);
    const button = el("button", "crimon-admin-entry", "管理者") as HTMLButtonElement;
    button.type = "button";
    button.setAttribute("aria-label", "管理者画面を開く");
    button.onclick = openAdmin;
    wrap.append(button);
    home.append(wrap);
  }
}

if (typeof document !== "undefined") {
  attachEntry();
  const observer = new MutationObserver(() => attachEntry());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
