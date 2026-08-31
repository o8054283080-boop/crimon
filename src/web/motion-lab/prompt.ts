import type { CharacterType, MotionType } from "./types.js";

const MOTIONS: Record<MotionType, string> = {
  idle: "loopable idle, gentle breathing and a clean return to the first pose",
  attack: "anticipation, decisive attack action, follow-through and recovery",
  heal: "warm healing gesture, calm lift, release and recovery",
  hit: "short impact recoil, readable hit reaction and brief recovery",
  buff: "confident empowering gesture, energy rising through the character",
  debuff: "weakened stagger, uneasy reaction and controlled recovery",
  defend: "brace into a defensive pose, absorb force, then settle",
  victory: "clear celebratory gesture and proud finishing pose",
  defeat: "lose balance and fall naturally without gore",
  skill: "anticipation, expressive skill activation, release and recovery",
};

const CHARACTERS: Record<CharacterType, string> = {
  slime: "elastic soft body motion, subtle squash and stretch, delayed jelly wobble",
  humanoid: "natural center-of-gravity shift with coordinated head, torso and limbs",
  quadruped: "coordinated neck, torso, front legs and hind legs with believable weight transfer",
  floating: "gentle multidirectional hover with delayed motion in floating parts",
  heavy: "small weighty movement, strong center-of-gravity shift and convincing inertia",
  dragon: "coordinated chest, head, wings and tail with anatomically natural timing",
};

export function buildMotionPrompt(motion: MotionType, characterType: CharacterType, index: number, total: number, extra = ""): string {
  const phase = total <= 1 ? 0 : index / (total - 1);
  return [
    "Create exactly one animation frame from the supplied transparent character image.",
    "Preserve the original character design, face, colors, costume, proportions and recognizable silhouette.",
    `Motion: ${MOTIONS[motion]}. Character mechanics: ${CHARACTERS[characterType]}.`,
    `This is frame ${index + 1} of ${total}; normalized timeline position ${phase.toFixed(3)}. Keep temporal continuity with a game animation sequence.`,
    "Keep the same camera, scale, canvas alignment and lighting. Transparent background, isolated character only, no text, no floor, no props, no extra objects, no additional characters.",
    "Return a production-ready RGBA game sprite with clean alpha edges.",
    extra.trim(),
  ].filter(Boolean).join(" ");
}

export function isLoopingMotion(motion: MotionType): boolean {
  return motion === "idle" || motion === "buff" || motion === "debuff";
}
