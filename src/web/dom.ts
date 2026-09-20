type ElementProps<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], "style">> & {
  className?: string;
  style?: string;
  /**
   * data-* 属性。見た目の分岐(等級・シリーズ・強化段階など)をCSS側へ渡すのに使う。
   * 状態ごとにクラス名を増やすより、値そのものを属性で持たせた方が
   * CSS変数で色を引けて、組み合わせが増えても破綻しない。
   */
  [key: `data-${string}`]: string | undefined;
  /**
   * aria-* 属性。**絵で示すボタンには文字での名前が要る。**
   * アイコンだけのボタンは、読み上げでは無名の押しものになってしまう。
   */
  [key: `aria-${string}`]: string | undefined;
};

/**
 * `**ここ**` を太字にして、それ以外はそのままの文字として返す。
 *
 * **お知らせの本文は `textContent` で流し込んでいた。**
 * 書く側は前から `**` で強調していたので、画面には
 * 「開催期間を **10月19日 → 12月19日** へ延長しました」と
 * **アスタリスクがそのまま出ていた**(実機で確認)。
 *
 * `innerHTML` は使わない。本文は運営が書くものだが、
 * ここを一度開けると後から別の経路の文字が流れ込んだ時に効いてしまう。
 * 文字は必ずテキストノードとして置く。
 *
 * **閉じていない `**` は文字として残す。**消すと本文が欠ける。
 */
export function emphasizedNodes(text: string): (Text | HTMLElement)[] {
  return splitEmphasis(text).map((part) => {
    if (!part.strong) return document.createTextNode(part.text);
    const strong = document.createElement("strong");
    strong.textContent = part.text;
    return strong;
  });
}

/** 強調の切れ目。`strong` が true のところだけ太字になる */
export interface EmphasisPart {
  text: string;
  strong: boolean;
}

/**
 * `**` で本文を切り分ける。**DOMを触らないので、そのまま試験できる。**
 *
 * 画面を作る側(`emphasizedNodes`)と分けてあるのは、
 * このリポジトリのテストにブラウザが無いため。ここが**画面に出る文字**を
 * 決めているので、見張るならこちら側で足りる。
 */
export function splitEmphasis(text: string): EmphasisPart[] {
  const parts = text.split("**");
  // 区切りが奇数個(=閉じていない)なら、太字にせず丸ごと文字として返す
  if (parts.length % 2 === 0) return [{ text, strong: false }];

  return parts
    .map((part, index) => ({ text: part, strong: index % 2 === 1 }))
    .filter((part) => part.text !== "");
}

/** 属性を割り当てつつ子要素を追加する簡易DOM生成ヘルパー */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps<K> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (key === "style") {
      node.setAttribute("style", value as string);
    } else if (key.startsWith("data-") || key.startsWith("aria-") || key === "role") {
      node.setAttribute(key, value as string);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node as any)[key] = value;
    }
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
