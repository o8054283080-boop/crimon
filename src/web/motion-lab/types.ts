export type MotionType = "idle" | "attack" | "heal" | "hit" | "buff" | "debuff" | "defend" | "victory" | "defeat" | "skill";
export type CharacterType = "slime" | "humanoid" | "quadruped" | "floating" | "heavy" | "dragon";
export type FrameCount = 12 | 24 | 36;
export type MotionFps = 8 | 12 | 16 | 20 | 24;
export type OutputSize = 256 | 384 | 512;

export interface MotionGenerationRequest {
  image: Blob;
  fileName: string;
  motion: MotionType;
  characterType: CharacterType;
  frameCount: FrameCount;
  fps: MotionFps;
  size: OutputSize;
  extraInstruction: string;
  signal?: AbortSignal;
}

export interface MotionFrame { blob: Blob; url: string; index: number }
export interface MotionGenerationResult {
  frames: MotionFrame[];
  loop: boolean;
  width: number;
  height: number;
  provider: string;
}

export interface MotionGeneratorProvider {
  readonly name: string;
  generate(request: MotionGenerationRequest): Promise<MotionGenerationResult>;
}
