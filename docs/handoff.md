# 引き継ぎ

チャットを切り替えた時に、ここから続けるためのメモ。
**終わった作業は消す。**残っているものだけを置く。

---

## いま残っている課題: ホームのプレゼントが下のバーと被る

**未解決。**依頼主の実機(iPhone・PWA)で、左の縦メニューの一番下
「プレゼント」が下のタブバーに食い込んでいる。

### 確認用ブラウザでは見えない

`env(safe-area-inset-bottom)` が0で返るので、**下のバーが
ホームインジケーターぶん(34px)低く写る。**この状態の画像を
「収まっています」と見せてしまい、依頼主の実機とは別の画面を見せていた。

`docs/dev-tools.md` の「確認用ブラウザには safe-area が無い」に
書いてあることを、そのまま踏んだ。

### 再現のしかた

`tools/homeSafeArea.mjs` は**いま動かない**
(`getBoundingClientRect` が null。タイトル画面を押していないため)。
**まずこの道具を直すこと。**手で注入していては同じ見落としを繰り返す。

手で再現する場合:

```js
// 393x852 で開いてから
const st = document.createElement('style');
st.textContent = 'html:has(.crimon-home),body:has(.crimon-home){'
  + '--home-safe-top:59px !important;--home-safe-bottom:34px !important}'
  + '.bottom-nav{padding-bottom:34px !important}';
document.head.appendChild(st);
document.querySelector('[data-tour=start]').click();
```

### 測った値(393x852・safe-area あり)

| | 位置 |
|---|---|
| 世界の枠の下端 | 736px |
| 下のバーの上端 | 740px |
| プレゼントの下端 | 723px |

**枠とバーのすき間が4pxしかない。**段は枠の中には収まっているが
余裕がゼロなので、実機のわずかな差(dvhの扱い、バーの実高)で食い込む。

### 試して戻したこと

`.world-actions--left/--right` へ `bottom` と `justify-content:space-between`、
段へ `min-height:44px; flex:0 1 auto` を入れた。
**すき間が17pxのまま変わらず、効いていることを確認できなかった。**
320x568 では逆に3つが押せなくなった(元からかは未確認)。
効果を確認できない変更は残さない方がよいので戻した。

### 根本はどこか

- 世界の枠の高さ計算
  (`src/web/crimon-visual-system.css` の
  `calc(100dvh - var(--bottom-nav-h) - 72px - 82px - 48px - 5px ...)`)
- **`src/web/mobile-ux.css` が `.bottom-nav` へ `env()` を直書きしている。**
  `--home-safe-bottom` を通していないので、変数を差し替えても
  バーの高さだけが実機と合わない。CLAUDE.md が禁じている書き方が残っている

### 出す前に確かめること

実機サイズ × safe-area あり で「バーとのすき間」を測り、
**40px以上**を確保してから出す。17pxでは足りない。

---

## 直近でmainへ入れたもの(やり直し不要)

- #352 自動周回を実クリア時間に合わせ、スタミナポーションを足す
- #353 スタミナポーションを手に入れやすくする(デイリー3/ウィークリー10/ショップ)
- #354 ポーションの所持数を見えるようにし、使う数を決められるようにする
- #356 ポーションの所持数を0個でも出す

## 依頼主から出ていて、まだ相談していないこと

- **アリーナショップの週2個のポーション**が、いまの配布量
  (日次3・週次10・月次30)に対して意味が薄い。整理するか残すかは未決
