# CRIMON Home Visual System — Task B handoff

## Brand concept

CRIMON の視覚的な核は **古代の金属装飾 × 紫の結晶／覚醒魔力**。黒、濃紺、深紫を地にし、アンティークゴールドは輪郭と重要箇所だけに使う。紫は魔力、金は価値と格を表し、既存の danger / success / warning / 属性色の意味を変更しない。

## Existing asset audit

- `home-bg.jpg` / `home-hero.jpg`: 紫の空、塔、霧、下部フェードがあり再利用可能。ホーム背景は `home-bg.jpg` を token 化し、現行ホームは互換性のため `home-hero.jpg` のまま。
- `adventure-bg.jpg`, `shop-bg.jpg`, `summon-bg.jpg`, `world-bg.jpg`: 各導線・共通世界背景として再利用可能。
- monster visuals: Three.js の `monsterAvatar.ts`, `portrait.ts`, `textures.ts` による生成。新規 raster monster は不要。
- icons: `icons.ts` の安全な inline SVG と PWA icons が利用可能。装備・属性は既存 semantic 表現を維持する。
- 既存色: `style.css` に `--bg`, `--surface`, `--gold-*`, rarity / element / status 系 token、既存 gradient がある。新 token は破壊的置換をせず opt-in とする。
- font: Hiragino Sans / Yu Gothic / Noto Sans JP / system-ui。巨大 Web Font は追加しない。ロゴのみ Georgia 系 display serif を SVG 内で利用し、文字列は常に `CRIMON`。

## Final palette and tokens

| Token | Value | Use |
|---|---:|---|
| `--crimon-bg` | `#0d0b18` | base background |
| `--crimon-bg-deep` | `#080812` | deepest background |
| `--crimon-surface` | `rgba(20,17,38,.82)` | panel |
| `--crimon-surface-raised` | `rgba(27,23,48,.92)` | raised panel |
| `--crimon-gold` | `#c6a457` | key gold |
| `--crimon-gold-bright` | `#e1c16e` | important edge/title |
| `--crimon-gold-muted` | `rgba(185,150,77,.42)` | quiet ornament |
| `--crimon-purple` | `#7138d5` | magic |
| `--crimon-purple-bright` | `#9c63ff` | crystal highlight |
| `--crimon-purple-glow` | `rgba(132,73,235,.28)` | ambient glow |
| `--crimon-text` | `#f5f2ff` | primary text |
| `--crimon-text-muted` | `#aaa4ba` | secondary text |
| `--crimon-border` | `rgba(185,150,77,.28)` | default hairline |
| `--crimon-border-strong` | `rgba(225,193,110,.62)` | hero edge |
| `--crimon-shadow` | subtle black shadow | default depth |
| `--crimon-shadow-raised` | black + one purple tint | hero depth |
| `--crimon-radius-sm/md/lg` | `6/12/18px` | radii |

Asset tokens are `--crimon-home-background`, `--crimon-tower-hero`, and `--crimon-ornament`.

## Assets and usage

### Logo and emblem

`crimon-logo.svg` keeps the exact `CRIMON` string as selectable SVG text and combines it with an original crystal/magic-circle emblem. It has `<title>`, `<desc>`, no script, and no external dependency. Recommended:

```html
<img src="/src/web/assets/crimon-logo.svg" width="280" alt="CRIMON">
```

Use `crimon-emblem.svg` when only the mark is required. If either image fails, render an HTML heading containing `CRIMON`; never use a generated raster wordmark.

### Home background

Use the asset token above a dark fallback:

```css
.home-host { background: linear-gradient(180deg, rgba(8,8,18,.15), #080812 80%), var(--crimon-home-background, none), #080812; background-size: cover; }
```

### HERO

`crimon-tower-hero.svg` is 1280 × 600 (32:15), text-free, with dark negative space on the left and the tower/lightning on the right. The safe primitive `.crimon-panel.crimon-panel--hero` supplies a gradient fallback and copy-scrim. Copy and CTA should occupy the left 52%.

### Ornament and magic

- `crimon-corner-ornament.svg`: 64 × 64 reusable corner piece.
- `crimon-divider.svg`: 640 × 24 section divider.
- `.crimon-gold-frame`: important cards only; never every card.
- `.crimon-glow`: one radial-gradient pseudo-element, no DOM particles or stacked glow shadows.

## Safe primitives for Task C

`crimon-panel`, `crimon-panel--hero`, `crimon-gold-frame`, `crimon-section-title`, `crimon-chip`, `crimon-glow`, and `crimon-number` are opt-in and prefixed. Example:

```html
<article class="crimon-panel crimon-panel--hero crimon-gold-frame">
  <h2 class="crimon-section-title">試練の塔</h2>
  <span class="crimon-chip crimon-number">32 / 100</span>
</article>
```

## Accessibility, motion, fallback, performance

- Primary text `#f5f2ff` on deep backgrounds has high contrast; muted text is for secondary text, not tiny critical copy. Gold is reserved for headings/edges, not paragraphs. Purple is not a small-body text colour.
- Logo has accessible SVG metadata; `<img>` consumers still provide `alt="CRIMON"`.
- The visual primitives add no continuous animation. Reduced-motion explicitly disables any future glow animation.
- SVGs contain no scripts, foreign objects, embedded base64, text-like decoration, people, monsters, UI, or watermarks.
- CSS gradients remain usable when an asset fails. The logo must always receive an HTML text fallback at integration time.
- No video, canvas particles, JavaScript animation, web font, large blur, or runtime image processing. SVG assets stay resolution-independent for Retina.

## Generated asset review

No generative-image tool was available in this environment, so all new assets are deterministic, hand-authored static SVG. Visual inspection confirmed the exact word `CRIMON`, clean composition, no unknown text, watermark, borrowed logo, person, monster, foreign UI, or compression artifact. Existing optimized JPG backgrounds are retained rather than creating unreviewed raster replacements.

## Integration decisions for Task E

Integrate `crimon-visual-system.css` (already loaded after `home-theme.css`) and choose whether the existing title-screen inline emblem should be replaced by `crimon-logo.svg`. Task E should decide whether `--crimon-home-background` should point to `home-bg.jpg` or the taller `home-hero.jpg` after Task C’s crop is known. Do not alter current party state, HERO data wiring, menu routing, information architecture, battle semantics, element colours, rarity colours, save flow, or audio.

## TASK B HANDOFF

- **Starting main SHA:** `41671048d23e9b16797f87317857498db58db8d4`
- **Task B final SHA:** see Task B final report (filled by the commit produced after this document).
- **Added assets:** `crimon-logo.svg`, `crimon-emblem.svg`, `crimon-corner-ornament.svg`, `crimon-divider.svg`, `crimon-tower-hero.svg`.
- **CSS/token list:** all palette, shadow, radius and asset tokens in `crimon-visual-system.css`; safe classes listed above.
- **Logo:** `<img>` at 200–300 px with `alt="CRIMON"`; retain HTML `CRIMON` fallback.
- **Background:** layer a dark vertical gradient above `var(--crimon-home-background)`.
- **HERO:** apply `.crimon-panel--hero`; place copy left and keep tower right.
- **Task C safe classes:** `.crimon-panel`, `.crimon-panel--hero`, `.crimon-gold-frame`, `.crimon-section-title`, `.crimon-chip`, `.crimon-glow`, `.crimon-number`.
- **Task E integrate:** keep the stylesheet link, select title logo integration and final home crop.
- **Task E adoption decisions:** existing `home-bg.jpg` versus `home-hero.jpg`; inline title emblem versus new standalone logo.
- **Do not change:** party placement/state, real HERO data, menu routing, home IA, battle/game logic, semantic/status/element colours, save and audio behaviour.
