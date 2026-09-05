-- ランキングは Arena と同じ匿名サインインを通った実プレイヤーだけに公開する。
-- Supabase の `authenticated` には匿名サインイン済みユーザーも含まれる。
revoke select on public.trial_tower_progress from anon;
revoke select on public.trial_tower_public_ranking from anon;

drop policy if exists trial_tower_progress_read on public.trial_tower_progress;
create policy trial_tower_progress_read on public.trial_tower_progress
  for select to authenticated using (true);

comment on function public.trial_tower_submit_progress(integer) is
  'Authenticated per-user endpoint. SECURITY DEFINER is intentional: clients have no table write grant; auth.uid(), profile ownership, floor bounds, and monotonic updates are enforced here.';
