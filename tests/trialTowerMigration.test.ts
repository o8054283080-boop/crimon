import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../supabase/migrations/20260904160957_trial_tower_ranking.sql", import.meta.url), "utf8");
const hardening = readFileSync(new URL("../supabase/migrations/20260904161043_trial_tower_ranking_hardening.sql", import.meta.url), "utf8");
const hard = readFileSync(new URL("../supabase/migrations/20260922080445_trial_tower_hard_ranking.sql", import.meta.url), "utf8");

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

describe("試練の塔HARDランキング migration", () => {
  it("NORMALと別テーブル・別view・別RPCで順位を持つ", () => {
    expect(hard).toContain("create table if not exists public.trial_tower_hard_progress");
    expect(hard).toContain("view public.trial_tower_hard_public_ranking");
    expect(hard).toContain("function public.trial_tower_hard_submit_progress");
    expect(hard).not.toMatch(/insert into public\.trial_tower_progress\b/);
  });

  it("認証済み利用者は順位だけを読み、進捗更新は認証RPCに限定する", () => {
    expect(hard).toContain("enable row level security");
    expect(hard).toContain("with (security_invoker = true)");
    expect(hard).toContain("revoke all on public.trial_tower_hard_progress from anon, authenticated");
    expect(hard).toContain("for select to authenticated using (true)");
    expect(hard).toContain("security definer");
    expect(hard).toContain("auth.uid()");
    expect(hard).toContain("grant execute on function public.trial_tower_hard_submit_progress(integer) to authenticated");
  });

  it("同じ階以下の再送では最高到達日時を更新しない", () => {
    expect(hard).toContain("where public.trial_tower_hard_progress.best_floor < excluded.best_floor");
  });
});
