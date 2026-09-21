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
  /** サーバが直接持つ塔の到達階。控えの古さに引きずられない */
  towerBestFloor?: number | null;
  towerReachedAt?: string | null;
};

/**
 * 控えの中身から数えた、**進め具合と持ち物の内訳**(サーバ側で集計)。
 *
 * レベルと所持金だけでは、その人がどこで止まっているのかが分からない。
 * **詰まっている場所は、クリア済みの並びにしか出ない。**
 * 星ごとの所持数も同じで、合計だけ見ていると
 * 「300体持っているが★6が0体」と「30体で★6が10体」が同じ顔で並ぶ。
 */
type SaveProgress = {
  stageChapter: number;
  stageLabel: string;
  stageCleared: number;
  stageHardCleared: number;
  /**
   * **`null` は「この控えに項目が無い」。0 とは違う。**
   *
   * 試練の塔が入ったのは 9/5 で、それより前の控えには塔の項目が無い。
   * 0 と同じ顔で扱うと、**69階まで登った人を「未挑戦」と言い切る**(実際に言い切った)。
   */
  towerBestFloor: number | null;
  towerLifetimeFloor: number | null;
  equipFloor: number | null;
  beastFloor: number | null;
  goldFloor: number | null;
  levelTiers: number | null;
  arenaPoints: number | null;
  fighterName: string | null;
  fighterLevel: number | null;
  gold: number | null;
  crystal: number | null;
  monsterCount: number | null;
  equipmentCount: number | null;
  monsterStars: Record<string, number>;
  monsterMaxStar: number;
  monsterMaxLevel: number;
  monsterMaxed: number;
  equipStars: Record<string, number>;
  equipMaxed: number;
  equipLocked: number;
};

/** 全体の進み具合。1人ずつ行を読まなくても、どこで止まっているかが分かる */
type AdminOverview = {
  players: number;
  activePlayers: number;
  towerReached: number;
  towerBest: number;
  sixStarOwners: number;
  monsters: number;
  equipment: number;
  chapters: Record<string, number>;
  towerFloors: Record<string, number>;
};

/**
 * 塔の到達階。**サーバの `trial_tower_progress` から直接来る。**
 *
 * 控えから読むと、塔より古い保存の人がまとめて「未挑戦」に化ける。
 * この表はアリーナの `user_id` で引いてあり、復旧IDとは身元の体系が違うので、
 * 登録データの行へは結び付けられない。**独立した並びとして出す。**
 */
type AdminTowerRow = {
  rank: number;
  userId: string;
  name: string;
  bestFloor: number;
  reachedAt: string | null;
};

/** 日別の動き。**0の日も行として返る**(止まっている日が消えると読めない) */
type AdminDailyRow = {
  date: string;
  newAccounts: number;
  saves: number;
  matches: number;
  newArena: number;
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
  /** 控えの中で、本人の値と進め具合が食い違っていた(控えそのものが壊れている合図) */
  sourceMismatch?: boolean;
  /** 古いサーバ(取り出して置き直す前)は返さないので、無い場合がある */
  progress?: SaveProgress | null;
};

type AdminDashboard = {
  generatedAt: string;
  activeSeason: { id: string; name: string; status: string; starts_at: string; ends_at: string } | null;
  summary: AdminSummary;
  overview?: AdminOverview | null;
  towerRanking?: AdminTowerRow[] | null;
  daily?: AdminDailyRow[] | null;
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

/**
 * 星ごとの所持数を1行にする。**多い星から並べ、0は書かない。**
 *
 * `★6 3 / ★5 12 / ★4 40` のような形。合計だけでは、
 * 「300体持っているが★6が0体」と「30体で★6が10体」の区別が付かない。
 */
function starBreakdown(table: Record<string, number> | undefined): string {
  if (!table) return "-";
  const parts = Object.entries(table)
    .map(([star, count]) => [Number(star), Number(count)] as const)
    .filter(([star, count]) => Number.isFinite(star) && count > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([star, count]) => `★${star} ${count}`);
  return parts.length > 0 ? parts.join(" / ") : "-";
}

/**
 * 内訳の棒。**数字だけ並べても、偏りは読めない。**
 *
 * 章ごとの人数や塔の到達帯は、「どこで止まっているか」を見るための形なので、
 * 長さで比べられるようにする。いちばん多い所を満幅にした相対の長さ。
 */
function distribution(table: Record<string, number> | undefined, label: (key: string) => string): HTMLElement {
  const wrap = el("div", "crimon-admin-dist");
  const rows = Object.entries(table ?? {})
    .map(([key, count]) => [key, Number(count)] as const)
    .filter(([, count]) => count > 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  if (rows.length === 0) {
    wrap.append(el("div", "crimon-admin-empty", "まだデータがありません"));
    return wrap;
  }
  const most = rows.reduce((max, [, count]) => Math.max(max, count), 1);
  for (const [key, count] of rows) {
    const row = el("div", "crimon-admin-dist__row");
    const bar = el("span", "crimon-admin-dist__bar");
    const fill = el("i");
    fill.style.width = `${Math.max(4, Math.round((count / most) * 100))}%`;
    bar.append(fill);
    row.append(el("small", "", label(key)), bar, el("strong", "", `${count}人`));
    wrap.append(row);
  }
  return wrap;
}

/**
 * 日別の動き。**1日も飛ばさずに並べる。**
 *
 * 動きのあった日だけを出すと、**止まっている日が一覧から消える**ので、
 * 「4日連続で誰も遊んでいない」が見えなくなる。0の日も行として出す。
 */
function renderDaily(rows: readonly AdminDailyRow[]): HTMLElement {
  const wrap = el("div", "crimon-admin-daily");
  const most = rows.reduce((max, row) => Math.max(max, row.saves, row.matches, row.newAccounts), 1);
  const head = el("div", "crimon-admin-daily__legend");
  head.append(
    el("span", "is-saves", "保存(遊んだ人)"),
    el("span", "is-matches", "アリーナ対戦"),
    el("span", "is-new", "新規登録"),
  );
  wrap.append(head);
  for (const row of rows) {
    const line = el("div", "crimon-admin-daily__row");
    const date = row.date.slice(5).replace("-", "/");
    const bars = el("span", "crimon-admin-daily__bars");
    for (const [kind, value] of [["is-saves", row.saves], ["is-matches", row.matches], ["is-new", row.newAccounts + row.newArena]] as const) {
      const bar = el("i", kind);
      /*
       * **0 の日は、点も残さない。**
       * 最低幅を一律に与えていたら、`0 / 0 / 0` の日に3本の点が並び、
       * 「少しは動いた日」に見えた。1以上の時だけ、消えない太さを保証する。
       */
      bar.style.width = value > 0 ? `max(2px, ${Math.round((value / most) * 100)}%)` : "0";
      bar.title = String(value);
      bars.append(bar);
    }
    line.append(
      el("small", "", date),
      bars,
      el("strong", "", `${row.saves} / ${row.matches} / ${row.newAccounts + row.newArena}`),
    );
    wrap.append(line);
  }
  return wrap;
}

/**
 * 控えに無い項目を、**0 と同じ顔で出さない。**
 *
 * 試練の塔が入ったのは 9/5。9/3 の控えには塔の項目がそもそも無いので、
 * 0 として出すと「未挑戦」と断定してしまう——**実際に、69階まで登った人を
 * 「未挑戦」と表示した。**古い控えに無いものは「記録なし」と言うべきで、
 * 「していない」と言ってはいけない。
 */
function savedValue(value: number | null | undefined, format: (n: number) => string, zero = "なし"): { text: string; missing: boolean } {
  if (value === null || value === undefined) return { text: "記録なし", missing: true };
  return { text: value > 0 ? format(value) : zero, missing: false };
}

/** 控えから読んだ値。無ければ「記録なし」と出し、**古い控えなら印を付ける** */
function savedMetricOf(label: string, value: number | null | undefined, format: (n: number) => string, stale: boolean, zero = "なし"): HTMLElement {
  const shown = savedValue(value, format, zero);
  return metric(label, shown.text, stale || shown.missing);
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

  /*
   * **全体の進み具合と、日別の動き。**
   *
   * これまでは「登録数」しか無く、その人たちがどこまで進んでいるのか、
   * いま遊んでいるのか止まっているのかが、一覧を全部読むまで分からなかった。
   *
   * **開いた状態を既定にしない。**まず見たいのは個々のプレイヤーで、
   * ここを常に開いていると一覧が画面の外へ押し出される。
   */
  const overview = dashboard.overview;
  if (overview) {
    const box = el("details", "crimon-admin-fold");
    box.append(el("summary", "", `全体の進み具合（直近7日で遊んだ人 ${formatNumber(overview.activePlayers)} / ${formatNumber(overview.players)}人）`));
    const inner = el("div", "crimon-admin-fold__inner");
    const cards = el("div", "crimon-admin-summary");
    cards.append(
      summaryCard("直近7日で遊んだ", overview.activePlayers),
      summaryCard("塔に挑んだ", overview.towerReached),
      summaryCard("★6を持つ", overview.sixStarOwners),
      summaryCard("塔の最高到達", overview.towerBest),
    );
    inner.append(cards);
    inner.append(el("h4", "crimon-admin-fold__head", "どの章まで進んでいるか"));
    inner.append(distribution(overview.chapters, (key) => (key === "0" ? "未クリア" : `${key}章`)));
    inner.append(el("h4", "crimon-admin-fold__head", "試練の塔の到達階"));
    inner.append(distribution(overview.towerFloors, (key) => (key === "0" ? "未挑戦" : `${key}〜${Number(key) + 9}階`)));
    inner.append(
      el("p", "crimon-admin-fold__note", `合計 モンスター${formatNumber(overview.monsters)}体 / 装備${formatNumber(overview.equipment)}個`),
    );
    box.append(inner);
    dash.append(box);
  }

  /*
   * **塔の到達階は、ここが本当の値。**
   *
   * 登録データの行に出る塔の階は「最後にクラウド保存した時点」のもので、
   * 試練の塔が入ったのは 9/5——**それより前の保存には塔の項目が無い。**
   * 実際、9/3 が最終保存の人が69階まで登っているのに「未挑戦」と出した。
   *
   * こちらはサーバの表を直接読んでいて、塔の画面を開くたびに更新される。
   * ただしアリーナの身元で引いてあるので、復旧IDの行へは結び付かない。
   */
  const towerRanking = dashboard.towerRanking;
  if (towerRanking && towerRanking.length > 0) {
    const box = el("details", "crimon-admin-fold");
    box.append(el("summary", "", `試練の塔の到達階（最高 ${towerRanking[0].bestFloor}階 / ${towerRanking.length}人）`));
    const inner = el("div", "crimon-admin-fold__inner");
    const list = el("div", "crimon-admin-tower");
    for (const row of towerRanking) {
      const line = el("div", "crimon-admin-tower__row");
      line.append(
        el("small", "", `${row.rank}位`),
        el("strong", "", row.name || "名前未設定"),
        el("b", "", `${row.bestFloor}階`),
        el("small", "", formatDate(row.reachedAt)),
      );
      list.append(line);
    }
    inner.append(list);
    inner.append(el("p", "crimon-admin-fold__note", "サーバが直接持っている値です（塔の画面を開くたびに更新されます）。登録データの行に出る「試練の塔」は、最後にクラウド保存した時点のものなので別の数字になります"));
    box.append(inner);
    dash.append(box);
  }

  const daily = dashboard.daily;
  if (daily && daily.length > 0) {
    const box = el("details", "crimon-admin-fold");
    const today = daily[daily.length - 1];
    box.append(el("summary", "", `日別の動き（今日 保存${today.saves} / 対戦${today.matches} / 新規${today.newAccounts + today.newArena}）`));
    const inner = el("div", "crimon-admin-fold__inner");
    inner.append(renderDaily(daily));
    // 日本時間で切っている。UTCのままだと朝9時が境目になり、山が1日ずれる
    inner.append(el("p", "crimon-admin-fold__note", "日本時間で1日を区切っています。「保存」はクラウド保存が届いた回数で、遊んだ人の数の目安です"));
    box.append(inner);
    dash.append(box);
  }

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
       * **この行は丸ごと「最後にクラウド保存した時点」のもの。**
       *
       * 保存が古ければ、ここに並ぶ値も全部そのぶん古い。それを言わずに
       * 数字だけ並べると、**17日前の姿を今の姿として読ませる**ことになる
       * ——実際、9/3 が最終保存の人の塔を「未挑戦」と出して、
       * 依頼主に「データがおかしい」と指摘された。
       */
      const savedHours = sinceText(row.latestSavedAt).hours;
      const stale = savedHours >= 24;
      if (stale) primary.append(el("small", "crimon-admin-row__stale", `${sinceText(row.latestSavedAt).text}の保存時点`));
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
      /*
       * **進め具合と、持ち物の中身。**
       *
       * レベルと所持金だけでは、その人がどこで止まっているのかが分からない。
       * 「モンスター300体」も、★6が0体なのか10体なのかで話がまるで違う。
       */
      const progress = row.progress;
      if (progress) {
        item.append(
          metric("ステージ", progress.stageLabel || "未クリア", stale),
          /*
           * **「未挑戦」と言い切らない。**
           *
           * 試練の塔が入ったのは 9/5 で、それより前の控えには塔の項目が無い。
           * 無いものを 0 として出すと「挑んでいない」と断定することになり、
           * **69階まで登った人を「未挑戦」と表示した。**
           * サーバが直接持っている値は上の「試練の塔の到達階」に出る。
           */
          savedMetricOf("試練の塔(保存時点)", progress.towerLifetimeFloor, (n) => `${n}階`, stale, "未挑戦"),
          savedMetricOf("装備ダンジョン", progress.equipFloor, (n) => `${n}階`, stale, "未クリア"),
          metric("モンスター内訳", starBreakdown(progress.monsterStars), stale),
          metric("最大Lv", progress.monsterMaxLevel > 0 ? `★${progress.monsterMaxStar} Lv.${progress.monsterMaxLevel}` : "-", stale),
          metric("育て切った", `${formatNumber(progress.monsterMaxed)}体`, stale),
          metric("装備内訳", starBreakdown(progress.equipStars), stale),
          metric("+15の装備", `${formatNumber(progress.equipMaxed)}個`, stale),
        );
      }
      /*
       * 控えの中で、本人の値と進め具合が食い違っていた時だけ出す。
       * 「Lv.1 なのに★6が12体」のような組み合わせは、控えそのものが
       * 壊れている合図なので、黙って片方を表示しない。
       */
      if (row.sourceMismatch) {
        item.append(metric("⚠ 控えの食い違い", "レベルと中身の出どころがずれています", true));
      }
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
        // 塔だけは別の表から。**アリーナの user_id で引けるのはこちらの一覧だけ**
        metric("試練の塔", row.towerBestFloor ? `${row.towerBestFloor}階` : "未挑戦"),
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
