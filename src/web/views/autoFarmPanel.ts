/**
 * オート周回の設定。
 *
 * これまでは数字入力欄が1つ置いてあるだけだった。実機は指で押すので、
 * 回数を変えるたびにソフトキーボードが立ち上がり、画面が半分隠れ、
 * 打ち直して閉じる――**周回の設定だけで5手以上**かかっていた。
 *
 * よく使う回数は札で1手にする。「最大」は手持ちのスタミナ(と1日の上限)から
 * 実際に回せる回数を計算して入れるので、自分で割り算しなくてよい。
 *
 * 併せて、**足りない時に何が起きるか**を先に見せる。
 * 「30回と入れたのに8回で止まった」の理由が、始める前に分かるようにする。
 *
 * **ここは「戦闘を飛ばす場所」ではない。**以前は押した瞬間に集計画面が出ていて、
 * 10回まとめて挑むと戦闘画面を一度も見ないまま終わっていた。
 * 今は1戦ずつ実際に戦う。まとめているのは**押す手数**であって、戦闘そのものではない。
 */
import { el } from "../dom.js";
import {
  PlayerState,
  STAMINA_POTION_AMOUNT,
  STAMINA_POTION_BUDGET_CHOICES,
  STAMINA_POTION_UNLIMITED_BUDGET,
  staminaPotionBudgetLabel,
  staminaPotionFarmBudgetOf,
  staminaPotionsOwned,
} from "../../game/playerState.js";

export interface AutoFarmPanelProps {
  count: number;
  onChangeCount: (count: number) => void;
  /** 1回あたりの消費スタミナ */
  staminaCost: number;
  /** いま持っているスタミナ */
  stamina: number;
  /** 日次の実行可能数。希望回数の入力上限ではない。 */
  hardLimit?: number;
  /** 上限がある時、その説明(「本日の残り3回」など) */
  hardLimitNote?: string;
  disabled: boolean;
  referenceRunSeconds: number;
  referenceFromManual: boolean;
  recentManualClearTimes?: number[];
  /** いま持っているスタミナポーションの数 */
  staminaPotions: number;
  /** 1個あたりの回復量 */
  staminaPotionAmount: number;
  /**
   * この周回で使ってよいポーションの数。**0なら使わない(既定)。**
   * `STAMINA_POTION_UNLIMITED_BUDGET` なら持っている分は全部。
   */
  staminaPotionBudget: number;
  onChangeStaminaPotionBudget: (next: number) => void;
  onStart: () => void;
}

/**
 * ポーション欄の4つを控えから組み立てる。
 *
 * 5つの画面が同じ4行を書き写すと、**片方だけ直す事故**が起きる。
 * 所持数も設定も控えの中にあるので、渡すのは切り替えの手だけでよい。
 */
export function autoFarmPotionProps(
  player: PlayerState,
  onChangeStaminaPotionBudget: (next: number) => void,
): Pick<AutoFarmPanelProps, "staminaPotions" | "staminaPotionAmount" | "staminaPotionBudget" | "onChangeStaminaPotionBudget"> {
  return {
    staminaPotions: staminaPotionsOwned(player),
    staminaPotionAmount: STAMINA_POTION_AMOUNT,
    staminaPotionBudget: staminaPotionFarmBudgetOf(player),
    onChangeStaminaPotionBudget,
  };
}

/** よく使う回数。1回・軽く・しっかり・まとめて、の4段 */
const PRESETS = [1, 5, 10, 20];

/** スタミナと上限から、実際に回しきれる回数を出す */
export function affordableCount(stamina: number, staminaCost: number, hardLimit?: number): number {
  const byStamina = staminaCost > 0 ? Math.floor(stamina / staminaCost) : Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.min(byStamina, hardLimit ?? Number.MAX_SAFE_INTEGER));
}

/**
 * 「最大」の札に使う、実際に回せるスタミナ。
 *
 * **自動使用がONの時だけ、ポーションぶんを足す。**
 * OFFのまま手持ちのポーションを数えると、押した先で使われずに
 * スタミナ切れで止まり、表示が嘘になる。
 */
export function usableStaminaForFarm(
  stamina: number,
  staminaPotions: number,
  potionAmount: number,
  /** この周回で使ってよい数。0なら1個も足さない */
  budget: number,
): number {
  if (!(budget > 0)) return stamina;
  // **決めた数と手持ち、少ないほうまで。**5個までと決めて2個しか無ければ2個ぶん
  const usablePotions = Math.min(Math.max(0, staminaPotions), Math.floor(budget));
  return stamina + usablePotions * Math.max(0, potionAmount);
}

export function formatApproxDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return minutes > 0 ? `${minutes}分${rest ? `${rest}秒` : ""}` : `${rest}秒`;
}

function countChip(label: string, active: boolean, onClick: () => void): HTMLElement {
  return el(
    "button",
    {
      type: "button",
      className: `slot-filter-chip autofarm__chip${active ? " slot-filter-chip--active" : ""}`,
      onclick: onClick,
    },
    [label],
  );
}

export function renderAutoFarmPanel(props: AutoFarmPanelProps): HTMLElement {
  const usable = usableStaminaForFarm(props.stamina, props.staminaPotions, props.staminaPotionAmount, props.staminaPotionBudget);
  const max = affordableCount(usable, props.staminaCost, props.hardLimit);
  const totalCost = props.staminaCost * props.count;
  const willStopEarly = props.count > max;

  const chips = [
    ...PRESETS.map((value) => countChip(`×${value}`, props.count === value, () => props.onChangeCount(value))),
    countChip(`最大 ×${max}`, props.count === max && !PRESETS.includes(props.count), () => props.onChangeCount(max)),
  ];

  const notes: HTMLElement[] = [];
  if (willStopEarly) {
    const lent = Math.min(props.staminaPotions, props.staminaPotionBudget > 0 ? props.staminaPotionBudget : 0);
    const owned = lent > 0 ? ` + 🧪${lent}` : "";
    notes.push(
      el("p", { className: "autofarm__warn" }, [
        `⚠ いまのスタミナでは${max}回で止まります(⚡${totalCost}必要 / 手持ち⚡${props.stamina}${owned})`,
      ]),
    );
  }
  if (props.hardLimitNote) notes.push(el("p", { className: "app-subtitle" }, [props.hardLimitNote]));

  return el("section", { className: "panel auto-farm-panel autofarm" }, [
    el("div", { className: "autofarm__head" }, [
      el("h2", {}, ["🔁 オート周回"]),
      el("span", { className: "autofarm__cost" }, [`⚡${totalCost}`]),
    ]),
    el("div", { className: "autofarm__chips" }, chips),
    el("div", { className: "autofarm__timing" }, [
      el("strong", {}, [props.referenceFromManual ? "実戦記録から算出" : "標準時間を使用"]),
      el("span", {}, [`1周 約${formatApproxDuration(props.referenceRunSeconds)}`]),
      el("span", {}, [`予想完了時間 約${formatApproxDuration(props.referenceRunSeconds * props.count)}`]),
      ...(props.recentManualClearTimes?.length ? [el("small", {}, [`最近のクリア ${props.recentManualClearTimes.map(formatApproxDuration).join(" / ")}`])] : []),
    ]),
    el("label", { className: "autofarm__input-label" }, [
      "希望する周回回数",
      el("input", {
        className: "auto-farm-count-input", type: "number", inputMode: "numeric", min: "1", step: "1",
        value: String(props.count),
        oninput: (event: Event) => {
          const input = event.currentTarget as HTMLInputElement;
          if (/^[1-9]\d*$/.test(input.value)) props.onChangeCount(Number(input.value));
        },
      }),
    ]),
    el("div", { className: "autofarm__potion" }, [
      el("div", { className: "autofarm__potion-head" }, [
        el("strong", {}, ["スタミナポーションを使う"]),
        el("span", { className: "autofarm__potion-owned" }, [`所持 🧪${props.staminaPotions}`]),
      ]),
      el(
        "div",
        { className: "autofarm__chips autofarm__potion-chips" },
        STAMINA_POTION_BUDGET_CHOICES.map((value) =>
          countChip(
            staminaPotionBudgetLabel(value),
            props.staminaPotionBudget === value
              // 「全部」は印の値そのものなので、手持ちより大きい指定もここへ寄せる
              || (value === STAMINA_POTION_UNLIMITED_BUDGET && props.staminaPotionBudget >= STAMINA_POTION_UNLIMITED_BUDGET),
            () => props.onChangeStaminaPotionBudget(value),
          ),
        ),
      ),
      el("small", { className: "autofarm__potion-note" }, [
        `1個で⚡${props.staminaPotionAmount}回復。足りない時に、決めた数まで使います`,
      ]),
    ]),
    ...notes,
    el(
      "button",
      {
        type: "button",
        className: "btn btn--primary btn--large autofarm__go",
        disabled: props.disabled,
        onclick: props.onStart,
      },
      [`▶ ${props.count}回まとめて挑戦`],
    ),
    el("p", { className: "app-subtitle" }, [
      "クリア済みの場所を、戦闘画面を表示せず1戦ずつ安全に処理します。別画面を見ても進行します。",
    ]),
    el("p", { className: "app-subtitle" }, ["敗北・スタミナ切れ・日次上限で終了します。ダイヤによる自動回復は行いません。"]),
  ]);
}
