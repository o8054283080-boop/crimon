# CRIMON home redesign audit (Task E)

## Information architecture

The production home follows: player/resources, CRIMON brand, Trial Tower hero, current party, primary content, management content, and persistent bottom navigation. Existing login compensation and tutorial entry points remain available without displacing the primary hierarchy.

## Integration decisions

- Trial Tower uses persisted `trialTowerBestFloor` and `trialTowerRun`; missing or malformed legacy values are normalized to 0–100.
- Party portraits retain the established one-tap `partyCardAction`, including empty-slot navigation.
- Existing game destinations only are exposed. Arena was intentionally omitted from the redesigned home hierarchy because Task E prohibits introducing it from the reference concept; its existing screen remains untouched.
- SVG decoration is limited to the brand, hero, and section dividers. Decorative layers never receive pointer events.
- The bottom navigation is the only fixed navigation and owns the device bottom safe area. Home content reserves one corresponding navigation height rather than adding it twice.

## Visual system

Dark navy/black backgrounds provide contrast for raised surfaces. Bright gold is reserved for the wordmark, hero, primary action, and section marks; muted gold frames ordinary cards. Purple glow is restricted to the emblem, hero, focus ring, and active navigation.

## Resilience and performance

The logo has an HTML text fallback behind the image, hero artwork is decorative, and portrait rendering retains its existing unknown-monster fallback. The page uses static SVG/CSS only: no video, canvas particles, animation loops, or continuous blur animation. Reduced-motion rules collapse animations and transitions.
