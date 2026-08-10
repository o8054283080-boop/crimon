type ElementProps<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], "style">> & {
  className?: string;
  style?: string;
};

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
