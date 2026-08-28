# CRIMON Home Redesign — Task D Mobile UX Handoff

## Scope and baseline

- Baseline: `41671048d23e9b16797f87317857498db58db8d4` (PR #135 merged).
- Priority: iPhone portrait at 375×812, 390×844, 393×852, 402×874, and 430×932.
- Audited routes: home, bottom navigation, monster/detail flow, party, equipment, summon, dungeon variants, and trial tower.
- Task D deliberately avoids restructuring the home DOM or replacing Task B/C visual work. The production patch is a reusable mobile UX layer plus narrowly scoped semantics.

## Production specification

### Safe area and scrolling

1. `viewport-fit=cover` remains required.
2. `.screen` and `.home-menu` reserve the fixed navigation height, 24px breathing room, and `safe-area-inset-bottom`; left/right padding also includes their safe-area insets.
3. The bottom navigation owns its Home Indicator padding. Page content must not add a second fixed footer.
4. Use `100vh` as fallback followed by `100dvh`; do not lock ordinary content screens to one viewport. Sheets may scroll internally, but ordinary screens retain one vertical document scroller.
5. Decorative overlays must use `pointer-events:none`. Horizontal document overflow is a P1 regression.

### Tap and motion

- Primary target: 44×44 CSS px. This applies to bottom tabs, icon controls, party edit, resource actions, and primary home actions.
- Tap feedback: 110ms, `scale(.98)` plus slight opacity. No hover dependency or bounce.
- Optional entry: 220ms, opacity plus at most 4–8px translate. Do not stagger every card.
- Optional ambient motion: 3–6s, opacity/transform only, on one focal element. Do not animate blur, layout properties, or large background positions.
- Reduced motion: stop ambient/entry animation, reduce transitions to effectively instant, disable tap transforms, and restore automatic scrolling.

### Layout stability

- Resource, player level, EXP, monster level, and tower values use tabular numerals.
- Player name owns remaining flex width and truncates with ellipsis; icon buttons never shrink.
- CURRENT PARTY remains a four-column grid. Every card uses the same aspect ratio and stretched grid track; portrait art is absolutely positioned inside the reserved card box.
- Missing monster data retains the card background and fallback glyph. Portrait/decorative layers do not receive pointer events.
- Changing values and long Japanese/English strings must not expand the viewport. Nonessential values truncate rather than push controls away.

### Accessibility

- Bottom navigation is a named `nav`; the active tab exposes `aria-current="page"`; visible labels remain present.
- Icon-only name/settings controls and empty/current party cards have explicit accessible names.
- Keyboard focus uses a high-contrast 3px gold outline and is not removed for pointer styling.
- State is never represented by color alone: active navigation retains label, surface, and marker; party element retains text/title; disabled controls retain native semantics.
- Decorative art remains hidden from assistive technology where appropriate. Meaningful CRIMON identity retains a text alternative.

## Audit findings and priority

| Priority | Area | Finding / iPhone impact | Resolution or Task E action |
|---|---|---|---|
| P0 | All routes | No static P0 crash or permanently inoperable route found. | Preserve navigation callbacks and existing tests. |
| P1 | Tap targets | Several home icon/action controls used a 36px project minimum, below the iPhone 44px target. | Task D raises home/nav actions and the inspector threshold to 44px. Task E must keep it after C integration. |
| P1 | Safe area | Home used bottom inset but did not consistently reserve fixed nav height; side insets were inconsistent. | Shared safe-bottom token and screen/home padding added. Apply to any Task C root replacement. |
| P1 | Semantics | Bottom nav did not announce its landmark/current page; home icon buttons relied on `title`. | Named nav, `aria-current`, and explicit labels added. |
| P1 | Automation | The viewport tour covered only 390×844 portrait. | Five requested portrait sizes are now enumerated. Browser execution remains required in Task E. |
| P2 | Resource stability | Most home numerals were tabular, but this was distributed across view CSS and long values could compete for width. | Shared tabular/ellipsis rules added. Verify realistic maximum values in merged UI. |
| P2 | Player name | Existing ellipsis was correct, but the name lacked explicit flexible ownership against two fixed controls. | Name now flexes; controls are fixed 44px targets. |
| P2 | CURRENT PARTY | Aspect ratio and fixed four-column grid were already sound. Missing data had a fallback, but portrait overlay hit testing was implicit. | Preserve existing geometry; containment and pointer behavior hardened. |
| P2 | Readability | Some secondary home labels are approximately 9–10px and inactive nav labels are 10.4px. They are dense for long sessions. | Task E should target 11–12px where C's layout permits, without increasing scroll solely for decoration. |
| P2 | Scroll | Home is intentionally long because tutorial and content coexist. Above-the-fold priority can be diluted by the tutorial panel. | Task E should collapse completed tutorial detail and keep primary next action visible; do not introduce nested carousels. |
| P3 | Hierarchy | Existing home has multiple ornate/high-brightness surfaces competing with Adventure and CURRENT PARTY. | In merged B/C visual system, reserve bright gold for CTA/reward/rarity and purple glow for one magical focal point. |
| P3 | Performance | Fixed backdrop blur and several shadows are static but costly on long-running iPhones; title ambient animations are already reduced-motion aware. | Prefer opaque/translucent gradient fallback; avoid adding continuous GPU effects. Profile merged build on device. |

## Route review notes

- **Home → monster detail → return:** keep `partyCardAction` single callback behavior and return context; no overlay may intercept a party card.
- **Party / equipment:** fixed bottom navigation clearance is shared; preserve selection and equipment return context.
- **Summon:** its intentional `100dvh` single-screen layout already accounts for top/bottom safe areas; recheck 375×812 and landscape, especially browser chrome resize.
- **Dungeon variants / tower:** screen roots already use the shared screen/nav model or specialized safe-area CSS. Long floor/resource values need tabular numerals and truncation rather than card growth.
- **Home return:** rerendered DOM uses property handlers rather than accumulated listeners; no listener accumulation was found in the reviewed home/nav code.

## Performance budget

- No new font, image, particle node, canvas loop, blur animation, or background-position animation.
- The shared feedback animates only transform/opacity/color and lasts 110ms.
- Card containment limits paint/layout propagation. Keep portrait dimensions reserved before asynchronous rendering.
- Task E should inspect DOM count, static `backdrop-filter`, and shadow count after B/C merge and test a several-minute idle period on iPhone.

## Validation contract for Task E

1. Run `npm run typecheck`, focused mobile/UX tests, full `npm test`, `npm run build`, and `git diff --check`.
2. Run the tour at all five portrait sizes and landscape. Require `scrollWidth <= clientWidth` on every route.
3. Capture at minimum home at 390×844 and 430×932, plus party, monster detail, equipment, summon, one dungeon, and tower at 390×844.
4. Test long player/monster names, maximum resource digits, missing portrait data, image-before/image-after bounds, one-tap/one-navigation, reduced motion, keyboard focus, and VoiceOver-style accessible names.
5. Preserve PR #135 conditions: CURRENT PARTY opens exactly one selected detail, empty slot opens party, equipment return context remains intact, and dungeon/tower return selection survives.

## Task E must adopt

- Import and retain `mobile-ux.css` after base CSS, or port every token/rule equivalently into the merged CSS.
- Retain the named navigation, active `aria-current`, icon button labels, 44px targets, safe-bottom formula, fixed party geometry, and reduced-motion override.
- Re-run the expanded viewport tour after Task B/C integration; never infer success from this independent branch's static review.

## Optional polish

- Apply one subtle 180–250ms home entry to the primary content group only.
- Lower nonessential borders/glows, enlarge secondary text where space allows, and reduce static backdrop blur on low-power devices.
- Collapse completed tutorial chapters to improve above-the-fold focus and reduce daily scroll fatigue.
