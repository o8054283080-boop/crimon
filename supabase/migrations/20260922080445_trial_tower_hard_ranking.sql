-- 試練の塔HARDはNORMALと別順位にする。
create table if not exists public.trial_tower_hard_progress (
  user_id               uuid primary key references public.arena_profiles (user_id) on delete cascade,
  player_name           text not null check (char_length(player_name) between 1 and 24),
  best_floor            integer not null check (best_floor between 1 and 100),
  best_floor_reached_at timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.trial_tower_hard_progress enable row level security;

create index if not exists trial_tower_hard_progress_rank_idx
  on public.trial_tower_hard_progress (best_floor desc, best_floor_reached_at asc, user_id asc);

revoke all on public.trial_tower_hard_progress from anon, authenticated;
grant select on public.trial_tower_hard_progress to authenticated;

drop policy if exists trial_tower_hard_progress_read on public.trial_tower_hard_progress;
create policy trial_tower_hard_progress_read on public.trial_tower_hard_progress
  for select to authenticated using (true);

create or replace view public.trial_tower_hard_public_ranking
with (security_invoker = true)
as
select
  row_number() over (
    order by progress.best_floor desc, progress.best_floor_reached_at asc, progress.user_id asc
  )::integer as rank,
  progress.user_id,
  progress.player_name as display_name,
  progress.best_floor,
  progress.best_floor_reached_at,
  progress.updated_at
from public.trial_tower_hard_progress progress;

revoke all on public.trial_tower_hard_public_ranking from anon, authenticated;
grant select on public.trial_tower_hard_public_ranking to authenticated;

create or replace function public.trial_tower_hard_submit_progress(p_best_floor integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_name    text;
  v_changed boolean := false;
  v_row     public.trial_tower_hard_progress%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_best_floor is null or p_best_floor < 1 or p_best_floor > 100 then
    raise exception 'INVALID_FLOOR';
  end if;

  select profile.display_name into v_name
    from public.arena_profiles profile
   where profile.user_id = v_uid;
  if v_name is null then raise exception 'PROFILE_REQUIRED'; end if;

  insert into public.trial_tower_hard_progress
    (user_id, player_name, best_floor, best_floor_reached_at, updated_at)
  values
    (v_uid, v_name, p_best_floor, clock_timestamp(), clock_timestamp())
  on conflict (user_id) do update
    set player_name = excluded.player_name,
        best_floor = excluded.best_floor,
        best_floor_reached_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where public.trial_tower_hard_progress.best_floor < excluded.best_floor
  returning * into v_row;

  if found then
    v_changed := true;
  else
    select * into v_row
      from public.trial_tower_hard_progress progress
     where progress.user_id = v_uid;
  end if;

  return jsonb_build_object(
    'ok', true,
    'updated', v_changed,
    'bestFloor', v_row.best_floor,
    'bestFloorReachedAt', v_row.best_floor_reached_at,
    'updatedAt', v_row.updated_at
  );
end;
$$;

revoke execute on function public.trial_tower_hard_submit_progress(integer) from public, anon;
grant execute on function public.trial_tower_hard_submit_progress(integer) to authenticated;
