import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../supabase/migrations/20260904160957_trial_tower_ranking.sql", import.meta.url), "utf8");
const hardening = readFileSync(new URL("../supabase/migrations/20260904161043_trial_tower_ranking_hardening.sql", import.meta.url), "utf8");

describe("試練の塔ランキング migration", () => {
  it("Arenaプロフィールを唯一のプレイヤー識別元にする", () => {
    expect(schema).toMatch(/user_id\s+uuid\s+primary key references public\.arena_profiles/);
    expect(schema).toContain("profile.user_id = v_uid");
    expect(schema).toContain("auth.uid()");
  });

  it("順位は最高階降順、初回到達日時昇順で決める", () => {
    expect(schema).toContain("order by progress.best_floor desc, progress.best_floor_reached_at asc, progress.user_id asc");
  });

  it("同じ階以下の再送では行も日時も更新しない", () => {
    expect(schema).toContain("where public.trial_tower_progress.best_floor < excluded.best_floor");
    expect(schema).not.toMatch(/p_best_floor_reached_at|p_updated_at/);
  });

  it("認証済みプレイヤーは公開順位を読めるが、表を直接書けない", () => {
    expect(schema).toContain("revoke all on public.trial_tower_progress from anon, authenticated");
    expect(schema).toContain("grant execute on function public.trial_tower_submit_progress(integer) to authenticated");
    expect(hardening).toContain("revoke select on public.trial_tower_progress from anon");
    expect(hardening).toContain("for select to authenticated using (true)");
  });
});
