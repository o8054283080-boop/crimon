# CRIMON HOME current implementation audit — Task C

## 0. Scope and conclusion

- Audit baseline: `main` at `6d2e96d7850ebb5d4625190773727140156cd3c8` (merge of PR #140).
- This document is an implementation handoff, not a request to polish PR #140 in place. The recommended path is to retain behavior and accessibility contracts while rebuilding the HOME information architecture and visual surfaces.
- The reference-image hierarchy should be **BRAND strongest → CURRENT PARTY second → PRIMARY strong → MANAGEMENT medium → SECONDARY quiet**. PR #140 instead puts a 248 px minimum-height Trial Tower hero immediately below an 84 px brand strip. The tower becomes the visual owner of the page, while most destinations share the same generic button treatment.
- Production code is intentionally unchanged by Task C.

## 1. What PR #140 introduced

The merge range `4167104..6d2e96d` adds the CRIMON logo, emblem, divider, corner ornament and tower SVG; introduces `crimon-visual-system.css` and `mobile-ux.css`; rewrites the HOME DOM; restores the title/START transition; adds real tower summary data; exposes Monster, Equipment and Dex callbacks; preserves tutorial and utility actions; and strengthens bottom-navigation ARIA. The title and callback restoration in `1eaf80e` is part of the audited result, not disposable follow-up work.

The current HOME order is: notices → resource header → 84 px brand → giant Trial Tower hero → party → PRIMARY → MANAGEMENT → SECONDARY → tutorial → vitals. This puts progression/status content ahead of the user's party and pushes the reference-image anchors out of the first viewport.

## 2. Reference-gap classification

| Area | Verdict | Audit and final direction |
|---|---|---|
| HEADER | **MODIFY** | Keep identity, currencies, edit/settings callbacks and truncation. Compress into a quiet 88–96 px utility/header surface; do not let the rounded resource panel compete with brand art. Keep safe-area padding. |
| BRAND | **REBUILD** | Keep both SVG assets, fallback and alt semantics. The current 84 px logo strip is too small and has no authored world scene. Make this the largest top-of-HOME visual surface (about 180–200 px) with logo substantially larger than the emblem. |
| CURRENT PARTY | **MODIFY** | Keep four slots and all tap routing. Retain existing portraits, elemental styling, stars and levels, but tune the frame into a premium portrait-led row and keep it directly below BRAND. |
| PRIMARY CONTENT | **REBUILD** | Adventure, Dungeon and Arena should be three visual cards with distinct art. The current generic `crimon-content-card` looks like a button; PR #140 also places Summon in PRIMARY and Arena in SECONDARY, which does not match the requested target grouping. |
| MANAGEMENT | **REBUILD** | The four target cards are Monster, Equipment, Summon and Shop, each with an individual visual identity. Move Dex, Tower and farming dungeons to quiet/secondary access instead of extending a homogeneous six-button grid. |
| SECONDARY | **MODIFY** | Keep every callback and destination, but use compact rows/chips or a disclosure group for Dex, Trial Tower, training/gold dungeons and How to Play. It must not repeat the same bordered surface as primary cards. |
| TRIAL TOWER | **REMOVE** (hero), **MODIFY** (entry) | Remove `crimon-hero` from the top stack. Retain `homeTowerSummary`, progress semantics and CTA routing in a smaller secondary/progression card below management. The tower must always be smaller and quieter than BRAND. |
| TUTORIAL | **MODIFY** | Preserve current/claimable/complete states, destination/claim callbacks and accessible actions. Move below core navigation, collapsed by default where appropriate; it is guidance, not a top-level visual hero. |
| BOTTOM NAV | **KEEP** | Keep five destinations, labels, `aria-current="page"`, nav label, 44 px targets and safe-area inset. Only retune muted/active gold to match the rebuilt system. |

## 3. Explicit KEEP / MODIFY / REMOVE / REBUILD lists

### KEEP — from PR #140

1. `homeTowerSummary`, including old/malformed-save normalization and the 0–100 bounds.
2. `hasStartedHome`, `startHome`, `HOME_STARTED_KEY`, the title-to-menu transition, scroll reset and session-storage compatibility.
3. `homeUtilityActions` and all Arena, Shop and How-to callbacks.
4. `tutorialMissionActions`, current/claimable/completed rendering, reward claiming and destination routing.
5. `partyCardAction` behavior from the PR #135-compatible path: occupied slot → monster detail; empty slot → party editor.
6. Four party slots, existing `withPortrait` pipeline, level/rarity/element metadata, and pointer-event protection on decorative layers.
7. `crimon-logo.svg`, `crimon-emblem.svg`, divider/corner SVGs where visually useful, image-error fallback and meaningful/empty alt treatment.
8. Title screen semantics, START helpers, save export/import/backup UI and persisted game-state compatibility.
9. Mobile primitives: 44 px targets, top/bottom safe areas, focus-visible outline, reduced-motion override, tabular numerals, truncation, decoration pointer protection and bottom-nav ARIA/current state.
10. All route callbacks added to `HomeProps`; restructuring markup must not narrow the reachable feature set.

### MODIFY

- Header density; party framing/crop; tutorial disclosure; vitals placement; secondary grouping; active/muted navigation styling.
- Gold usage: reserve bright gold for logo highlights, selected state, primary CTA and rewards; use muted bronze at roughly 20–35% opacity for structural rules. Do not give every card the same bright border.
- Purple usage: it is currently a mostly uniform radial glow plus dark surfaces—too flat, rather than simply too little or too much. Concentrate saturated violet, lightning and magic haze in BRAND and selected PRIMARY art; keep management backgrounds darker and secondary almost neutral.
- Typography: use a no-download stack such as `Georgia, "Times New Roman", "Hiragino Mincho ProN", "Yu Mincho", serif` for display headings, modest uppercase tracking, and the existing system sans stack for Japanese UI/body copy. Use weight, small caps/uppercase, shadows and gold gradient sparingly; do not fake luxury with excessive letter spacing at tiny sizes.

### REMOVE / demote

- Remove the giant `crimon-hero` DOM and its top-level placement; demote Trial Tower to a compact secondary/progression entry.
- Remove the one-size-fits-all `card()`/`crimon-content-card` presentation from visual destinations.
- Remove the six-item generic management grid and the duplicated visual surfaces produced by identical gradient, radius and border recipes.
- Remove obsolete HOME-only CSS after the new DOM lands (see section 9), rather than layering another override on top.

### REBUILD

- Brand world region, including responsive background crop, logo scale and atmospheric overlays.
- Primary visual-card component and its Adventure/Dungeon/Arena variants.
- Management visual-card component and Monster/Equipment/Summon/Shop variants.
- Section order, vertical rhythm and visual weight; use purpose-built class names/data variants rather than `nth-child` layout assumptions.
- HOME-specific CSS into one authoritative layer, with legacy title rules separated from HOME menu rules.

## 4. Brand and title visual strategy

`home-bg.jpg` is a lightweight 620×1344 general purple backdrop; the current CSS gradients and 82 px translucent emblem cannot supply the reference's purple sky, castle, lightning/magic, fog and giant logo. `home-hero.jpg` (720×1560) does contain a purple sky, misty ridges and simple tower silhouettes and is a useful temporary fallback, but it lacks the detail, lightning and world density required for the final brand region. Generate a dedicated **brand-world-bg**.

Keep logo and emblem as SVG. Place the HTML/SVG logo over image art; never bake lettering into the bitmap. The brand crop should contain a safe central silhouette/lightning zone, with peripheral fog and architecture allowed to crop. The title screen should share the same violet-black, antique-gold, mist and magic vocabulary, but retain its existing START logic and reduced-motion behavior. A brand background may be reused in a darker/wider crop on title only if its composition remains intentional; do not couple title DOM lifecycle to HOME layout.

## 5. Party art decision

No new monster-image production run is required for this redesign. `homePartyCard` already obtains portraits through `withPortrait`, and existing cards carry element, rarity and level metadata. Put those portraits into a richer frame and preserve `contain`/face-safe positioning rather than replacing user/game monster art. New generated monsters would introduce inconsistent identities and risk violating the existing asset/data relationship. Use CSS/SVG frames, masks, glints and elemental backplates; provide a deliberate empty-slot state. Validate long/short silhouettes at all three widths.

## 6. Card art source and generated-asset plan

### Existing asset reuse table

| Asset | Size / format | Reuse decision |
|---|---:|---|
| `crimon-logo.svg` | vector | **KEEP** for HOME/title; scalable foreground brand. |
| `crimon-emblem.svg` | vector | **KEEP** as subdued seal/overlay, never as the only brand background. |
| `crimon-divider.svg`, `crimon-corner-ornament.svg` | vector | **MODIFY usage**; appropriate for selected headings/corners, not every surface. |
| `crimon-tower-hero.svg` | vector | **DEMOTE**; optional thumbnail in the compact Tower entry. Do not retain hero sizing. |
| `home-bg.jpg` | 620×1344, 39,052 B | **KEEP as page fallback/base**, insufficient as authored brand art. |
| `home-hero.jpg` | 720×1560, 57,624 B | **TEMPORARY/secondary reuse**; has castle silhouettes and purple mist, but not final-reference density. |
| `world-bg.jpg` | 620×1344, 41,218 B | **KEEP global-only**; do not duplicate-download/use as a dedicated card focal image. |
| `adventure-bg.jpg` | 1000×420, 28,888 B | **KEEP** for Adventure; its wide ratio already supports a feature-card crop. |
| `summon-bg.jpg` | 620×420, 19,669 B | **KEEP** for Summon if final crop shows a readable summon focal point; add gradient overlay in CSS. |
| `shop-bg.jpg` | 620×420, 17,738 B | **KEEP** for Shop if chest/commerce identity survives narrow crop. |

### Generation priority

All generated raster images must contain **no text, no logo, no UI frame, no people**, and should leave a low-detail HTML-text zone.

- **P1 — required:**
  - `brand-world-bg.webp`: violet storm sky, distant gothic castle, magical lightning, layered fog; 1200×720 or equivalent 5:3 master, focal content in central 58%.
  - `dungeon-card.webp`: blue-violet luminous portal in underground ruins, strong doorway silhouette, no lettering.
  - `arena-card.webp`: dark empty arena, gold crest/floor sigil, concentrated violet magic, no crowd/character.
- **P2 — recommended:**
  - `monster-card.webp`: prefer an abstract bestiary seal/silhouette and elemental smoke, not a specific generated monster that could be mistaken for owned content.
  - `equipment-card.webp`: weapon, armor and ring still life on a dark altar; metal highlights clustered away from text.
- **P3 — only if crop review fails:**
  - Regenerate Summon as crystal/summoning stone over a magic circle.
  - Regenerate Shop as chest, coins and dim merchant still life. Existing `summon-bg.jpg` and `shop-bg.jpg` should be tried first.

Use WebP for photographic/painted backgrounds and cards, SVG for logos, frames and geometric ornaments, and transparent PNG only for a genuinely raster alpha overlay that cannot be expressed efficiently in CSS/SVG. Do not convert the existing vector brand marks to raster.

## 7. Image performance and responsive crops

### Initial-load budget

- Additional compressed image bytes attributable to the rebuilt HOME: **target ≤ 300 KB, hard ceiling 450 KB** on first visit, excluding already cached monster portraits and existing global assets.
- Suggested allocation: brand 100–140 KB; three PRIMARY cards 35–55 KB each; P2 management art 20–35 KB each. Lazy-load below-fold management/secondary imagery (`loading="lazy"`, dimensions/aspect ratio reserved); eager-load only the brand and first visible party portraits/primary preview.
- Ship responsive variants only where they save meaningful bytes; avoid loading both mobile and desktop crops. Prefer one 2× mobile master with `image-set`/`srcset` if build support is confirmed.

### Crop contract for 375 / 390 / 430 px

- Design card/brand focal content inside the central **58% horizontally** and middle **65% vertically**; outer 21% on either side is expendable bleed.
- At 375 px, no logo, castle crown, portal center, arena crest, equipment focal item or monster silhouette may be clipped. At 430 px, newly revealed sides must contain usable atmosphere—not hard composition edges.
- Reserve one side or the lower third as low-contrast text-safe space, selected consistently per component. Text and labels remain HTML; generated images contain no words.
- Use explicit `object-position`/`background-position` per variant rather than relying on `center` for every asset. Test both filled party slots and empty slots.

## 8. Proposed DOM architecture

Reusable without semantic rewrite: `renderIdentity`, `currencyChip`, `homePartyCard`, `renderVitals`, save/settings helpers, notices, tutorial data/actions, tower helper, title helpers and `sectionMark` (after styling cleanup).

Faster and safer to rebuild: the anonymous `card()` factory; current PRIMARY/MANAGEMENT/SECONDARY grids; tower hero markup; and section ordering. Recommended HOME tree:

1. notices (overlay/compact so baseline layout remains measurable),
2. utility header,
3. brand world (`section` with labelled logo),
4. current party (`section`, four buttons),
5. primary visual grid: Adventure / Dungeon / Arena,
6. management visual grid: Monster / Equipment / Summon / Shop,
7. compact secondary/progression: Tower summary / Dex / training / gold / guide,
8. tutorial and vitals,
9. settings sheet.

Each visual card should be a real `button` with one accessible name, art marked decorative, stable data/class variant and a 44 px minimum target. Avoid positional selectors such as `.crimon-primary-grid > :first-child`; variant names must own layout and art.

## 9. CSS conflict audit and ownership

### Current cascade

`index.html` loads `home-theme.css`; `main.ts` imports `style.css`, then `crimon-visual-system.css`, then `mobile-ux.css`. Consequently HOME is currently governed by four layers. `home-theme.css` defines legacy title and old HOME menu/card surfaces; late sections of `style.css` override many of those selectors; PR #140's minified visual-system sheet overrides the active `.crimon-*` DOM; mobile UX then supplies last-mile minimum sizes and accessibility. Examples of collision include differing `.home-menu`, `.home-id`, `.home-wallet__chip`, `.home-party`, `.hp-card` and bottom-nav recipes. Comments in `style.css` explicitly acknowledge prior duplication with `home-theme.css`. Continuing by adding more selectors will make specificity/order—not component intent—decide the design.

### Recommended ownership

| File | Sole responsibility after rebuild |
|---|---|
| `style.css` | Global tokens/base, shared panels/buttons/icons, non-HOME screens, shared bottom-nav geometry. No HOME composition or card art. |
| `mobile-ux.css` | Cross-screen mobile primitives only: tap target, safe area, focus visibility, reduced motion, numeric stability, truncation and decorative pointer safety. Keep it small and last. |
| `crimon-visual-system.css` | Authoritative rebuilt HOME menu: brand, hierarchy, party frame adjustments, primary/management/secondary variants and HOME responsive crops. Format it readably rather than as 14 minified lines. |
| `home-theme.css` | Title-screen visuals only during migration. Rename/split later if practical; it must stop styling `.home-menu`, party/cards and bottom nav. |

### Legacy CSS disposition

- **Delete after the replacement DOM is merged:** old HOME menu blocks in `home-theme.css` from `.home-menu` onward that style identity/wallet/party/adventure/tiles/sheet where equivalent authoritative rules exist; dead `.home-crown`, `.home-adventure*`, `.home-feature-grid`, `.home-minor-grid`, old `.home-tile` and duplicate HOME background sections in `style.css`; unused `renderMenuTile`/`MenuTile` and obsolete arcane-ring HOME use after confirming title still calls the shared ring helper.
- **Retain/migrate:** title screen, forge/rings/motes/ridge, START/leaving states, settings sheet, identity/wallet/party/vitals styles that remain referenced—move their final version to the owning file rather than deleting blindly.
- **Do not touch in the HOME task:** global `body::before`, shared panel/button/icon rules and non-HOME bottom-nav layout unless regression testing proves a conflict. The suspicious `.home-screen--menu-only ~ * body::before` selector should be separately corrected or removed only after verifying global screen backgrounds; it cannot select an ancestor `body` and therefore does not accomplish its comment's intent.

## 10. 390×844 height budget and first view

Baseline excludes transient compensation/login banners and uses a 64 px fixed bottom navigation, leaving about 780 px visible content. Safe-area values are additive on devices that report them.

| Segment | Height | Running bottom |
|---|---:|---:|
| top safe/padding | 12 px | 12 px |
| utility header (identity + compact currency row) | 94 px | 106 px |
| gap | 8 px | 114 px |
| brand world | 190 px | 304 px |
| gap + party heading | 34 px | 338 px |
| party portrait row | 132 px | 470 px |
| party bottom/gap | 14 px | **484 px** |
| beginning of PRIMARY | 150–180 px | 634–664 px |
| breathing room before fixed nav | 20 px | 654–684 px |

Thus header + brand + full CURRENT PARTY fit well above the 780 px navigation boundary at 390×844, and part or all of the first primary card can preview. If art review prefers taller party portraits, party bottom may reach at most **620 px**; it must never be pushed below the first viewport by Tower. At 375 px preserve these heights or reduce horizontal gaps, not tap targets. At 430×932 allow the same brand height (up to 204 px), using extra viewport for primary preview rather than inflating every section.

## 11. Screenshot strategy

Capture deterministic, full-page and first-viewport pairs at **390×844** and **430×932**, with device scale factor fixed, safe-area simulation documented, animations/reduced motion stabilized, identical seeded save/player/party data, four filled party slots, no transient login/compensation banner and HOME scrolled to 0. Add a second state only for one empty party slot and a running tower. Compare against the reference at 100% and as a blurred thumbnail: the latter quickly exposes hierarchy errors.

For each size record: first-viewport PNG, full-page PNG, brand crop close-up, party crop close-up, and browser accessibility snapshot for button order/names. Reject screenshots with missing fonts/assets, focus accidentally active, or a different title-start session state. The title screen gets a separate screenshot and must not substitute for HOME evidence.

## 12. Visual acceptance criteria

1. BRAND is the largest and strongest visual surface in the top stack; logo is immediately legible and the scene visibly contains purple sky, castle, magic/lightning and fog.
2. CURRENT PARTY is directly below BRAND and is fully identifiable in the first 390×844 viewport (party bottom target 484 px, absolute maximum 620 px in the baseline state).
3. Trial Tower is absent from the HOME top hero position and its retained entry is smaller/quieter than BRAND and PRIMARY.
4. Adventure, Dungeon and Arena all have dedicated, unmistakably different art; none reads as an icon-only generic button.
5. Monster, Equipment, Summon and Shop each have an individual visual identity; generated Monster art never impersonates an owned/in-game monster.
6. Secondary content is visually quieter than management and all existing destinations remain reachable.
7. Bright gold is selective; muted borders visibly differ from active/CTA gold. Purple energy is concentrated in brand/primary, not spread as an equal glow around every section.
8. Four party slots retain occupied-detail and empty-edit behavior, with readable levels/stars/elements and protected decorative pointer layers.
9. Every interactive target is at least 44×44 CSS px; focus-visible, safe areas, reduced motion, tabular numerals, truncation, bottom-nav ARIA/current state and save/title compatibility remain intact.
10. At 375, 390 and 430 px, focal art is not cropped, HTML text does not collide with focal content, horizontal scrolling is absent and fixed navigation covers no action/content.
11. Added initial HOME image transfer meets the 300 KB target and never exceeds 450 KB; below-fold art is lazy with reserved geometry.

## 13. Concrete instructions for the final implementation task

1. Start by locking the behavioral regression tests from PR #140/#135; change DOM snapshots/contracts that explicitly require `crimon-hero`, but replace them with a test for the compact tower entry and retained callback/summary semantics.
2. Generate and approve P1 art before tuning layout. First try existing Adventure/Summon/Shop assets; do not regenerate P3 by default.
3. Reorder the DOM to header → brand → party → primary → management → quiet secondary; do not first restyle the existing grids.
4. Implement explicit visual-card variants and responsive focal positions. Keep labels as HTML and images decorative.
5. Consolidate HOME menu CSS into `crimon-visual-system.css`, remove competing legacy selectors in the same change, and leave title ownership coherent.
6. Validate accessibility/behavior, image transfer budget and the screenshot matrix. Test old/malformed tower saves, started/not-started session state, empty/filled party slots and tutorial states.
7. Do not ship if the tower remains above party, generic cards remain for primary/management, or the first viewport cannot identify CURRENT PARTY.

---

# TASK C HANDOFF

- **Starting main SHA:** `6d2e96d7850ebb5d4625190773727140156cd3c8`
- **Final SHA:** the Task C branch HEAD reported in the final handoff message (a commit cannot embed its own SHA); no production file is changed by this audit.
- **KEEP:** tower data helper; title/START/session helpers; utility and tutorial callbacks; save compatibility; four party slots and PR #135-compatible detail/edit routing; portrait pipeline; logo/emblem assets; 44 px/safe-area/focus/reduced-motion/tabular-number/pointer protection; bottom-nav ARIA.
- **MODIFY:** header, party frame, vitals/tutorial placement, secondary grouping, gold/purple distribution, typography and active nav styling.
- **REMOVE:** giant top Trial Tower hero, homogeneous anonymous-card presentation, six-item generic management grid and duplicated HOME visual surfaces.
- **REBUILD:** brand world, PRIMARY art cards, MANAGEMENT art cards, section order/spacing, explicit responsive variants and authoritative HOME CSS.
- **Trial Tower:** retain `homeTowerSummary`, progress accessibility and CTA; demote to compact secondary/progression entry below management.
- **Brand:** reuse logo/emblem SVG; generate P1 brand-world WebP; 190 px target height at 390, central-safe crop, HTML logo/text.
- **PRIMARY art:** Adventure existing image; P1 new Dungeon portal and Arena sigil/arena. Dedicated variant for all three.
- **MANAGEMENT art:** P2 abstract Monster identity and equipment still life; first test existing Summon/Shop assets. No generated monster presented as roster content.
- **Existing reuse:** see section 6 table; keep background JPGs only in the roles listed there.
- **Generated assets:** P1 brand/Dungeon/Arena; P2 Monster/Equipment; P3 Summon/Shop only after crop failure.
- **Image budget:** target ≤300 KB additional initial transfer, hard ceiling 450 KB; lazy-load below-fold art.
- **CSS ownership:** `style.css` global/non-HOME; `mobile-ux.css` primitives; `crimon-visual-system.css` HOME; `home-theme.css` title only.
- **Deletable legacy CSS:** old HOME menu/adventure/feature/minor/card/background duplicates after replacement; preserve/migrate title, settings and still-used primitives; do not broadly delete global rules.
- **390×844 budget:** header 94, brand 190, party heading/row/bottom 180 plus 20 px padding/gaps; party bottom target 484 px and must remain ≤620 px.
- **375/430 crop:** central 58% horizontal focal-safe zone, outer 21% bleed each side, middle 65% vertical safety, low-detail text zone, per-card positions, no text in images.
- **Acceptance:** all 11 criteria in section 12 are release gates.
- **Final task directive:** preserve the contracts, replace—not polish—the current top-stack and card DOM, generate P1 assets first, consolidate the cascade, then prove the result with the two-size screenshot matrix and performance/accessibility tests.
