import {
  SET_BONUS_DESCRIPTION,
  SET_LABEL,
  SET_TYPES,
  type SetType,
} from "../core/equipment.js";
import { STATUS_EFFECT_JA } from "../core/skill.js";
import "./effectReference.css";

type ReferenceSection = "status" | "sets";

interface ReferenceItem {
  name: string;
  description: string;
}

const BUFF_ITEMS: readonly ReferenceItem[] = [
  { name: "攻撃力アップ", description: "攻撃力をスキルに記載された割合だけ上げます。" },
  { name: "防御力アップ", description: "防御力をスキルに記載された割合だけ上げます。" },
  { name: "速度アップ", description: "速度をスキルに記載された割合だけ上げ、行動しやすくします。" },
  { name: "クリ率アップ", description: "クリティカル率をスキルに記載された割合だけ上げます。" },
  { name: "クリダメアップ", description: "クリティカル時のダメージをスキルに記載された割合だけ上げます。" },
  { name: STATUS_EFFECT_JA.CRIT_RATE_DOWN, description: "敵からクリティカルを受ける確率を下げます。" },
  { name: STATUS_EFFECT_JA.ENDURE, description: "致死ダメージを受けてもHP1で踏みとどまります。効果が残っている間に発動します。" },
  { name: STATUS_EFFECT_JA.REFLECT, description: "受けたダメージの一部を攻撃した相手へ返します。" },
  { name: STATUS_EFFECT_JA.REVIVE, description: "戦闘不能になった時、効果に設定されたHPで復活します。" },
  { name: STATUS_EFFECT_JA.INVINCIBLE, description: "効果中はダメージを受けません。" },
  { name: STATUS_EFFECT_JA.FOCUS, description: "敵の単体攻撃の対象を自分へ集中させます。全体攻撃には影響しません。" },
  { name: "シールド", description: "一定量のダメージをHPの代わりに受けます。量と持続ターンはスキルごとに異なります。" },
  { name: "状態異常無効（免疫）", description: "効果中、弱体効果や状態異常の付与を防ぎます。" },
  { name: "継続回復", description: "自分のターン開始時にHPを回復します。" },
  { name: "被ダメージ軽減", description: "受けるダメージを一定割合減らします。" },
  { name: "保護", description: "対象が受けるダメージの一部を、保護した味方が代わりに受けます。" },
  { name: "反撃態勢", description: "効果中に攻撃を受けると、攻撃した相手へ自動で反撃します。" },
  { name: "被弾時ゲージアップ", description: "効果中に攻撃を受けるたび、自分の行動ゲージが増えます。" },
];

const DEBUFF_ITEMS: readonly ReferenceItem[] = [
  { name: "攻撃力ダウン", description: "攻撃力をスキルに記載された割合だけ下げます。" },
  { name: "防御力ダウン", description: "防御力をスキルに記載された割合だけ下げます。" },
  { name: "速度ダウン", description: "速度をスキルに記載された割合だけ下げ、行動を遅らせます。" },
  { name: "クリ率ダウン", description: "クリティカル率をスキルに記載された割合だけ下げます。" },
  { name: "クリダメダウン", description: "クリティカル時のダメージをスキルに記載された割合だけ下げます。" },
  { name: STATUS_EFFECT_JA.TAUNT, description: "単体攻撃の対象を挑発を付与した相手へ固定します。" },
  { name: STATUS_EFFECT_JA.BUFF_BLOCK, description: "新しい強化効果を受けられなくします。" },
  { name: STATUS_EFFECT_JA.SKILL_LOCK, description: "スキル1以外を使用できなくします。" },
  { name: STATUS_EFFECT_JA.CRIT_RATE_UP, description: "クリティカルを受ける確率を上げます。" },
  { name: "スタン", description: "効果中は行動できず、手番を失います。" },
  { name: "毒", description: "対象のターン開始時に最大HPを基準としたダメージを与えます。最大5スタックまで重なります。" },
  { name: "火傷", description: "対象のターン終了時に継続ダメージを与えます。" },
  { name: "暗闇", description: "攻撃時に失敗することがあり、失敗するとダメージが大きく下がり追加効果も発生しません。" },
  { name: "治癒阻害", description: "受ける回復量を減らします。減少量はスキルごとに異なります。" },
  { name: "クールタイム延長", description: "対象のスキルのクールタイムを増やし、再使用を遅らせます。" },
  { name: "呪い", description: "一定時間後に固定ダメージとスタンを発生させる特殊な弱体効果です。" },
  { name: "行動ゲージダウン", description: "行動ゲージを減らして次の手番を遅らせます。" },
];

function itemRow(item: ReferenceItem, tone: "buff" | "debuff" | "set"): HTMLElement {
  const row = document.createElement("div");
  row.className = `effect-ref__row effect-ref__row--${tone}`;
  const title = document.createElement("strong");
  title.className = "effect-ref__row-title";
  title.textContent = item.name;
  const description = document.createElement("span");
  description.className = "effect-ref__row-description";
  description.textContent = item.description;
  row.append(title, description);
  return row;
}

function statusPanel(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "effect-ref__content";

  const note = document.createElement("p");
  note.className = "effect-ref__note";
  note.textContent = "効果量・付与率・持続ターンはスキルごとに異なります。弱体効果は基本的に効果命中と効果抵抗の判定を受けます。";
  wrapper.append(note);

  for (const [heading, items, tone] of [
    ["強化効果（バフ）", BUFF_ITEMS, "buff"],
    ["弱体効果（デバフ）", DEBUFF_ITEMS, "debuff"],
  ] as const) {
    const section = document.createElement("section");
    section.className = "effect-ref__section";
    const h = document.createElement("h3");
    h.textContent = heading;
    section.append(h, ...items.map((item) => itemRow(item, tone)));
    wrapper.append(section);
  }
  return wrapper;
}

function setDescription(set: SetType): string {
  const bonus = SET_BONUS_DESCRIPTION[set];
  return `2セット：${bonus.two} / 4セット：${bonus.four}`;
}

function setsPanel(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "effect-ref__content";

  const note = document.createElement("p");
  note.className = "effect-ref__note";
  note.textContent = "同じシリーズを規定数装着すると発動します。4セット条件を満たした時は、そのシリーズの2セット効果も同時に有効です。";
  wrapper.append(note);

  const section = document.createElement("section");
  section.className = "effect-ref__section";
  const h = document.createElement("h3");
  h.textContent = "装備シリーズ・セット効果";
  section.append(h);
  for (const set of SET_TYPES) {
    section.append(itemRow({ name: `${SET_LABEL[set]}シリーズ`, description: setDescription(set) }, "set"));
  }
  wrapper.append(section);
  return wrapper;
}

let dialog: HTMLDialogElement | null = null;
let dialogBody: HTMLElement | null = null;
let currentSection: ReferenceSection | null = null;

function ensureDialog(): HTMLDialogElement {
  if (dialog?.isConnected) return dialog;

  dialog = document.createElement("dialog");
  dialog.className = "effect-ref";
  dialog.setAttribute("aria-label", "効果一覧");

  const header = document.createElement("header");
  header.className = "effect-ref__header";
  const title = document.createElement("h2");
  title.textContent = "効果一覧";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "effect-ref__close";
  close.textContent = "閉じる";
  close.onclick = () => dialog?.close();
  header.append(title, close);

  const tabs = document.createElement("div");
  tabs.className = "effect-ref__tabs";
  const statusTab = document.createElement("button");
  statusTab.type = "button";
  statusTab.textContent = "バフ・デバフ";
  statusTab.dataset.section = "status";
  statusTab.onclick = () => showSection("status");
  const setsTab = document.createElement("button");
  setsTab.type = "button";
  setsTab.textContent = "装備シリーズ";
  setsTab.dataset.section = "sets";
  setsTab.onclick = () => showSection("sets");
  tabs.append(statusTab, setsTab);

  dialogBody = document.createElement("div");
  dialogBody.className = "effect-ref__body";
  dialog.append(header, tabs, dialogBody);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog?.close();
  });
  document.body.append(dialog);
  return dialog;
}

function showSection(section: ReferenceSection): void {
  const dlg = ensureDialog();
  if (!dialogBody) return;
  currentSection = section;
  dialogBody.replaceChildren(section === "status" ? statusPanel() : setsPanel());
  for (const button of dlg.querySelectorAll<HTMLButtonElement>(".effect-ref__tabs button")) {
    button.classList.toggle("is-active", button.dataset.section === section);
  }
}

function openReference(section: ReferenceSection): void {
  const dlg = ensureDialog();
  if (currentSection !== section) showSection(section);
  if (!dlg.open) dlg.showModal();
}

function referenceButton(label: string, section: ReferenceSection, className: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.onclick = () => openReference(section);
  return button;
}

function injectBattleEntry(root: ParentNode): void {
  const controls = root.querySelector<HTMLElement>(".battle-topbar__controls");
  if (!controls || controls.querySelector("[data-effect-ref='status']")) return;
  const button = referenceButton("効果", "status", "effect-ref-entry effect-ref-entry--battle");
  button.dataset.effectRef = "status";
  button.title = "バフ・デバフの効果一覧";
  controls.prepend(button);
}

function injectEquipmentEntries(root: ParentNode): void {
  const toolbar = root.querySelector<HTMLElement>(".equipment-screen:not(.equipment-screen--detail) .equip-toolbar");
  if (toolbar && !toolbar.querySelector("[data-effect-ref='sets']")) {
    const button = referenceButton("シリーズ効果", "sets", "btn effect-ref-entry effect-ref-entry--equipment");
    button.dataset.effectRef = "sets";
    button.title = "装備シリーズの2セット・4セット効果一覧";
    toolbar.append(button);
  }

  const detail = root.querySelector<HTMLElement>(".equipment-screen--detail .equip-detail");
  if (!detail || detail.querySelector(".effect-ref-inline")) return;
  const set = detail.dataset.set as SetType | undefined;
  if (!set || !SET_BONUS_DESCRIPTION[set]) return;

  const inline = document.createElement("button");
  inline.type = "button";
  inline.className = "effect-ref-inline";
  inline.onclick = () => openReference("sets");
  const title = document.createElement("strong");
  title.textContent = `${SET_LABEL[set]}シリーズのセット効果`;
  const description = document.createElement("span");
  description.textContent = setDescription(set);
  const hint = document.createElement("small");
  hint.textContent = "タップで全シリーズを見る";
  inline.append(title, description, hint);

  const owner = detail.querySelector(".equip-detail__owner");
  if (owner) detail.insertBefore(inline, owner);
  else detail.append(inline);
}

function injectHowToEntry(root: ParentNode): void {
  const screen = root.querySelector<HTMLElement>(".how-to-play, .howto-screen, .how-to-play-screen");
  if (!screen) return;
  const headings = Array.from(screen.querySelectorAll<HTMLElement>("h2, h3, button, summary"));
  const target = headings.find((node) => node.textContent?.includes("強化と弱体"));
  if (!target) return;
  const container = target.parentElement;
  if (!container || container.querySelector("[data-effect-ref='howto-status']")) return;
  const button = referenceButton("バフ・デバフ効果一覧を開く", "status", "effect-ref-entry effect-ref-entry--guide");
  button.dataset.effectRef = "howto-status";
  container.append(button);
}

let queued = false;
function injectEntries(): void {
  queued = false;
  const app = document.getElementById("app");
  if (!app) return;
  injectBattleEntry(app);
  injectEquipmentEntries(app);
  injectHowToEntry(app);
}

function queueInject(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(injectEntries);
}

const observer = new MutationObserver(queueInject);
window.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  if (!app) return;
  observer.observe(app, { childList: true, subtree: true });
  queueInject();
});
