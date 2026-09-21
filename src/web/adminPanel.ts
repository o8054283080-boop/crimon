import "./adminPanel.css";

const ADMIN_SESSION_KEY = "crimon.admin.session.v1";
/**
 * 管理者入口のボタンにつける印。
 *
 * 以前は「外枠 + 中のボタン」の2枚だったが、**押せる的の大きさを測るのは
 * ボタン自身**(巡回も `button` を見る)。外枠を大きくしてもボタンが小さいままだと
 * 「指で押すには小さい (34x13)」で落ちる——実際に落ちた。1枚にして、
 * そのボタン自体を44×44にしてある。
 */
const ADMIN_ENTRY_CLASS = "crimon-admin-entry";

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

function metric(label: string, value: string, stale = false): HTMLElement {
  const wrap = el("span", `crimon-admin-metric${stale ? " is-stale" : ""}`);
  wrap.append(el("small", "", label), el("strong", "", value));
  return wrap;
}

/**
 * **いつ時点の値かを、必ず添える。**
 *
 * 管理者画面が見ているものには2種類ある:
 *
 *   - **サーバが直接持っている値**(レート・勝敗・コイン)。対戦の瞬間に更新される
 *   - **プレイヤーの端末から上がってくる値**(Lv・ゴールド・所持数)。
 *     クラウド保存のたびに更新されるので、**その間隔ぶんだけ古い**
 *
 * 後者を「遅れている」と感じるのは当然で、実際に遅れている。
 * 直す道は2つあって、どちらもやる——**間隔を詰める**(`cloudRecoveryBootstrap.ts`)のと、
 * **いつ時点かを画面に出す**(ここ)。
 */
function sinceText(value: unknown): { text: string; hours: number } {
  if (typeof value !== "string" || !value) return { text: "-", hours: Number.POSITIVE_INFINITY };
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return { text: "-", hours: Number.POSITIVE_INFINITY };
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  const hours = minutes / 60;
  if (minutes < 1) return { text: "たった今", hours };
  if (minutes < 60) return { text: `${minutes}分前`, hours };
  if (hours < 24) return { text: `${Math.floor(hours)}時間前`, hours };
  return { text: `${Math.floor(hours / 24)}日前`, hours };
}

/** 保存時刻と「◯時間前」を1つの値に。**古ければ印が付く** */
function savedMetric(label: string, value: unknown, staleHours = 3): HTMLElement {
  const since = sinceText(value);
  const when = formatDate(value);
  return metric(label, when === "-" ? "-" : `${when}（${since.text}）`, since.hours >= staleHours);
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
/** 一覧の並び。**既定は「動きが新しい順」**——いま遊んでいる人から見たい */
let currentSort: "RECENT" | "RATING" | "LEVEL" | "NAME" = "RECENT";
/** 自動で読み直す時計。画面を閉じたら止める */
let autoTimer: ReturnType<typeof setInterval> | null = null;

/** 自動更新の間隔。**開いたまま古くならない**ための最低限 */
const AUTO_RELOAD_MS = 60_000;

/**
 * 開いている間だけ、黙って読み直す。
 *
 * これまでは開いた時に1回読むだけで、**「更新」を押すまで数字が止まっていた。**
 * 見ている側からは、止まっているのか本当に動きが無いのか分からない。
 *
 * 読み直しは**画面が見えている時だけ**(裏に回ったタブが叩き続けない)。
 */
function stopAutoReload(): void {
  if (autoTimer === null) return;
  clearInterval(autoTimer);
  autoTimer = null;
}

function startAutoReload(root: HTMLElement): void {
  stopAutoReload();
  autoTimer = setInterval(() => {
    if (!overlay || overlay.hidden || document.hidden) return;
    if (!token()) { stopAutoReload(); return; }
    void loadDashboard(root, true);
  }, AUTO_RELOAD_MS);
}

function closeAdmin(): void {
  if (!overlay) return;
  stopAutoReload();
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

  /*
   * **いつ時点の値かを、いちばん上に出す。**
   *
   * サーバは `generatedAt` を返していたのに、画面は受け取って捨てていた。
   * そのため「古いのか新しいのか、そもそも判断できない」という状態だった
   * (依頼主の指摘)。あわせて、遅れの出どころも1行で書く——
   * **レートは即時・所持品はクラウド保存のたび**、と分かれば読み方が変わる。
   */
  const since = sinceText(dashboard.generatedAt);
  const stamp = el("p", `crimon-admin-generated${since.hours >= 1 ? " is-stale" : ""}`);
  stamp.append(
    el("strong", "", `${formatDate(dashboard.generatedAt)} 時点（${since.text}）`),
    el("small", "", "レート・勝敗・コインは対戦の瞬間に更新されます。レベル・所持金・所持数は、プレイヤーの端末がクラウド保存した時点のものです"),
  );
  dash.append(stamp);

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
  const sort = el("select", "crimon-admin-sort") as HTMLSelectElement;
  for (const [value, label] of [
    ["RECENT", "動きが新しい順"],
    ["RATING", "レートの高い順"],
    ["LEVEL", "レベルの高い順"],
    ["NAME", "名前順"],
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    sort.append(option);
  }
  sort.value = currentSort;
  const refresh = el("button", "crimon-admin-btn", "更新") as HTMLButtonElement;
  refresh.type = "button";
  toolbar.append(search, sort, refresh);

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
  sort.onchange = () => {
    currentSort = sort.value as typeof currentSort;
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

/** 時刻の文字列を比較できる数にする。無いものは必ず後ろへ */
function timeOf(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : 0;
}

/*
 * 並べ替え。**既定は「動きが新しい順」。**
 *
 * 登録順に並んでいると、いま遊んでいる人を探すのに全部見ることになる。
 * 問い合わせを受けて開く時も、まず見たいのは直近で動いた人。
 */
function sortRecovery(a: RecoveryAccount, b: RecoveryAccount): number {
  if (currentSort === "NAME") return (a.fighterName || "").localeCompare(b.fighterName || "", "ja");
  if (currentSort === "LEVEL" || currentSort === "RATING") return b.fighterLevel - a.fighterLevel;
  return timeOf(b.latestSavedAt) - timeOf(a.latestSavedAt);
}

function sortArena(a: ArenaPlayer, b: ArenaPlayer): number {
  if (currentSort === "NAME") return (a.displayName || "").localeCompare(b.displayName || "", "ja");
  if (currentSort === "RATING" || currentSort === "LEVEL") return b.rating - a.rating;
  return timeOf(b.lastMatchAt) - timeOf(a.lastMatchAt);
}

function renderActiveList(host: HTMLElement, dashboard: AdminDashboard): void {
  host.replaceChildren();
  const head = el("div", "crimon-admin-section__head");
  const list = el("div", "crimon-admin-list");
  if (currentTab === "RECOVERY") {
    const rows = dashboard.recoveryAccounts
      .filter((row) => matchesSearch(row.fighterName, row.recoveryId, row.id))
      .sort(sortRecovery);
    head.append(el("h3", "", "データ復旧に登録されているプレイヤー"), el("span", "", `${rows.length}件`));
    for (const row of rows) {
      const item = el("div", "crimon-admin-row");
      const primary = el("span", "crimon-admin-row__primary");
      primary.append(el("strong", "", row.fighterName || "名前未設定"), el("small", "", `復旧ID: ${row.recoveryId || "-"}`));
      /*
       * **サーバが返しているものは、全部出す。**
       * これまで出していたのは5つだけで、モンスター数も装備数も
       * 登録日もロック状態も、受け取っておきながら捨てていた。
       */
      item.append(
        primary,
        metric("レベル", row.fighterLevel ? `Lv.${row.fighterLevel}` : "-"),
        metric("ゴールド", formatNumber(row.gold)),
        metric("ダイヤ", formatNumber(row.crystal)),
        metric("モンスター", `${formatNumber(row.monsterCount)}体`),
        metric("装備", `${formatNumber(row.equipmentCount)}個`),
        savedMetric("最終保存", row.latestSavedAt),
        metric("世代", formatNumber(row.latestRevision)),
        metric("登録", formatDate(row.createdAt)),
        // ロックと失敗回数は、問い合わせを受けた時にまっ先に見る場所
        row.lockedUntil
          ? metric("ロック", `${formatDate(row.lockedUntil)}まで`, true)
          : metric("失敗回数", row.failedAttempts > 0 ? `${row.failedAttempts}回` : "なし", row.failedAttempts > 0),
      );
      list.append(item);
    }
    if (rows.length === 0) list.append(el("div", "crimon-admin-empty", "該当する登録データはありません"));
  } else {
    const rows = dashboard.arenaPlayers
      .filter((row) => matchesSearch(row.displayName, row.userId, row.tierId))
      .sort(sortArena);
    head.append(el("h3", "", "アリーナに登録されているプレイヤー"), el("span", "", `${rows.length}件`));
    for (const row of rows) {
      const item = el("button", "crimon-admin-row") as HTMLButtonElement;
      item.type = "button";
      const primary = el("span", "crimon-admin-row__primary");
      primary.append(el("strong", "", row.displayName || "名前未設定"), el("small", "", row.userId));
      /*
       * **こちらはサーバが直接持っている値。**対戦の瞬間に更新されるので遅れない。
       * 遅れるのは復旧データの側(プレイヤーの端末から上がってくる)。
       * 同じ画面に並ぶと区別が付かないので、最終対戦の時刻を添える。
       */
      item.append(
        primary,
        metric("レート", `${formatNumber(row.rating)}（最高 ${formatNumber(row.bestRating)}）`),
        metric("ランク", row.tierId || "-"),
        metric("攻撃", `${row.wins}勝 ${row.losses}敗`),
        metric("防衛", `${row.defenseWins}勝 ${row.defenseLosses}敗`),
        metric("コイン", `${formatNumber(row.coins)}（累計 ${formatNumber(row.lifetimeCoins)}）`),
        metric("挑戦券", `${formatNumber(row.tickets)} / ${formatNumber(row.ticketsMax)}`),
        savedMetric("最終対戦", row.lastMatchAt, 24),
        metric("登録", formatDate(row.createdAt)),
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

/**
 * 一覧を読む。`quiet` なら**読み込み中の表示に差し替えない。**
 *
 * 自動更新でここを毎分すり替えると、押そうとした札が
 * 「読み込み中…」に化けて操作を取りこぼす。検索の途中の文字も消える。
 */
async function loadDashboard(root: HTMLElement, quiet = false): Promise<void> {
  const session = token();
  if (!session) {
    renderLogin(root);
    return;
  }
  if (!quiet) {
    root.replaceChildren();
    topbar(root);
    const body = el("div", "crimon-admin-body");
    body.append(el("div", "crimon-admin-loading", "登録プレイヤーを読み込み中…"));
    root.append(body);
  }
  try {
    const dashboard = await adminPost<AdminDashboard>("dashboard", { token: session });
    currentDashboard = dashboard;
    renderDashboard(root, dashboard);
    startAutoReload(root);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "管理者データを取得できませんでした";
    if (!token()) {
      renderLogin(root, message);
      return;
    }
    /*
     * **黙って読み直している時は、出ている一覧を消さない。**
     * 一度の失敗で画面が空になると、見ていた数字ごと消える
     * (次の1分後に戻ってくるだけなので、消す価値が無い)。
     */
    if (quiet) return;
    const host = root.querySelector(".crimon-admin-body") ?? root;
    host.replaceChildren(el("div", "crimon-admin-empty", message));
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

/**
 * 管理者入口を置く先を決める。
 *
 * **ホームの上帯(プレイヤー情報バー)の中へ入れる。** 帯は
 * `position: relative` なので、その中で `left:50%` を使えば
 * 画面幅が変わっても中央からずれない。`top: 123px` のような
 * 端末依存の座標は使わない。
 *
 * 帯が見つからない時だけホーム本体へ戻す。**入口が消えるより、
 * 位置がずれる方がまし**——製作者が入れなくなると直す手段が無くなる。
 */
function entryHost(home: HTMLElement): HTMLElement {
  return home.querySelector<HTMLElement>(":scope > .crimon-resource-header") ?? home;
}

function attachEntry(): void {
  const homes = document.querySelectorAll<HTMLElement>(".crimon-home");
  for (const home of homes) {
    const host = entryHost(home);
    if (host.querySelector(`:scope > .${ADMIN_ENTRY_CLASS}`)) continue;
    // 置き場所が変わったら、前の場所に残っているものを片付ける
    for (const stale of home.querySelectorAll(`.${ADMIN_ENTRY_CLASS}`)) stale.remove();
    /*
     * **文字を入れない。** 見せるのは CSS の小さな点だけ。
     * 文字にすると「9px未満は落とす」検査(`tests/cssReadability.test.ts`)と
     * 「薄く小さくしたい」が正面からぶつかる。意味は `aria-label` が運ぶ。
     */
    const button = el("button", ADMIN_ENTRY_CLASS) as HTMLButtonElement;
    button.type = "button";
    button.setAttribute("aria-label", "管理者画面を開く");
    button.onclick = openAdmin;
    host.append(button);
  }
}

if (typeof document !== "undefined") {
  attachEntry();
  const observer = new MutationObserver(() => attachEntry());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
