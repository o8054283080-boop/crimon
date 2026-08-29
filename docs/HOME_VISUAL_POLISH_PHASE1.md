# CRIMON HOME Visual Polish — Phase 1

## Goal
Keep the merged HOME structure and functionality intact while pushing the presentation toward a premium commercial dark-fantasy mobile lobby.

## Visual reference direction
Use the user-provided CRIMON reference image as a strong visual target for atmosphere and finish, not as a literal layout/content copy.

Prioritize:
- deep violet moonlit gothic castle/world background with depth and atmospheric lighting
- blackened metal + antique gold ornamental frames
- jewel-like purple highlights and restrained glow
- circular/medallion-style activity buttons for Adventure, Dungeon, Arena, Tower and secondary actions
- premium framed CURRENT PARTY panel
- compact ornamental mission/reward banners that do not overpower the world stage
- stronger integration between background, UI frames, monsters and lighting

## Preserve CRIMON identity
Reuse existing CRIMON assets wherever practical, especially monster portraits/party imagery, icons and previously generated HOME assets. Do not replace actual party data with decorative mock monsters.

The center party remains the visual hero. Do not restore a giant CRIMON title/logo over the party/world stage.

## Structure to preserve
HUD → WORLD STAGE → CURRENT PARTY → BEGINNER MISSION → BOTTOM NAV.

World stage:
- actual party centered and visually dominant
- left: ミッション / 図鑑 / ランキング / 遊び方
- right: 冒険 / ダンジョン / 闘技場 / 試練の塔

Bottom nav:
ホーム / モンスター / 装備 / 召喚 / ショップ

## Phase 1 implementation priorities
1. Upgrade world/background art treatment and depth.
2. Upgrade action frames from flat UI buttons into dark-fantasy ornamental medallions/plaques.
3. Upgrade CURRENT PARTY frame, power display and portrait framing.
4. Restyle beginner mission/reward presentation to be compact and premium; avoid the oversized reward banner seen in the current preview.
5. Add coherent shadows, rim-light, metallic highlights, subtle purple glow and layered borders without harming readability.
6. Reuse existing generated HOME SVGs where they help; improve/replace only when necessary.

## Hard constraints
- Preserve existing callbacks/navigation and real player/party data.
- Preserve save compatibility and existing game behavior.
- No invented features.
- No giant HOME logo.
- No legacy floating tutorial panel on HOME.
- No vertical scrolling, blank bottom area or clipped controls at 390×844 and 430×932.
- Keep touch targets usable on iPhone.
- Generated decorative assets must actually be referenced by the HOME UI.

## Acceptance
Capture and inspect HOME at 390×844 and 430×932. The result should clearly read as the same CRIMON HOME structure, but substantially closer to a finished premium dark-fantasy game lobby in material quality, depth, framing and visual cohesion.