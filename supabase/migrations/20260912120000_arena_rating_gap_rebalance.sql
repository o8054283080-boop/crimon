-- Arena rating gap rebalance + defense 60%
--
-- Existing ratings are intentionally NOT reset or compressed.
-- This migration only changes future match deltas.

create or replace function public.arena__rating_curve_value(
  p_diff integer,
  p_won boolean
)
returns integer
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_low_diff integer;
  v_low_value numeric;
  v_high_diff integer;
  v_high_value numeric;
begin
  if p_won then
    select p.diff, p.value into v_low_diff, v_low_value
      from (values
        (-300,1),(-250,2),(-200,3),(-150,4),(-100,6),(-50,9),(0,12),
        (50,15),(100,18),(150,22),(200,26),(250,30),(300,34),(400,38),(500,40)
      ) as p(diff,value)
     where p.diff <= p_diff order by p.diff desc limit 1;
    select p.diff, p.value into v_high_diff, v_high_value
      from (values
        (-300,1),(-250,2),(-200,3),(-150,4),(-100,6),(-50,9),(0,12),
        (50,15),(100,18),(150,22),(200,26),(250,30),(300,34),(400,38),(500,40)
      ) as p(diff,value)
     where p.diff >= p_diff order by p.diff asc limit 1;
    if v_low_diff is null then return 1; end if;
    if v_high_diff is null then return 40; end if;
  else
    select p.diff, p.value into v_low_diff, v_low_value
      from (values
        (-400,32),(-300,30),(-250,27),(-200,24),(-150,21),(-100,18),(-50,15),
        (0,13),(50,11),(100,9),(150,7),(200,5),(250,4),(300,3),(400,2),(500,1)
      ) as p(diff,value)
     where p.diff <= p_diff order by p.diff desc limit 1;
    select p.diff, p.value into v_high_diff, v_high_value
      from (values
        (-400,32),(-300,30),(-250,27),(-200,24),(-150,21),(-100,18),(-50,15),
        (0,13),(50,11),(100,9),(150,7),(200,5),(250,4),(300,3),(400,2),(500,1)
      ) as p(diff,value)
     where p.diff >= p_diff order by p.diff asc limit 1;
    if v_low_diff is null then return 32; end if;
    if v_high_diff is null then return 1; end if;
  end if;

  if v_low_diff = v_high_diff then
    return v_low_value::integer;
  end if;

  return round(
    v_low_value
    + (v_high_value - v_low_value)
      * (p_diff - v_low_diff)::numeric / (v_high_diff - v_low_diff)::numeric
  )::integer;
end;
$$;

revoke execute on function public.arena__rating_curve_value(integer, boolean) from public;

create or replace function public.arena_rating_delta(
  p_my integer, p_opponent integer, p_won boolean
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_amount integer;
begin
  v_amount := public.arena__rating_curve_value(p_opponent - p_my, p_won);
  return case when p_won then v_amount else -v_amount end;
end;
$$;

revoke execute on function public.arena_rating_delta(integer, integer, boolean) from public;
grant execute on function public.arena_rating_delta(integer, integer, boolean) to authenticated;

-- Keep server-side defense settlement in sync with the client: 60% of attack delta.
insert into public.arena_config (key, value, note)
values (
  'defense',
  '{"scale":0.6,"daily_loss_cap":60}'::jsonb,
  'ARENA_DEFENSE_RATING_SCALE / ARENA_DEFENSE_DAILY_LOSS_CAP と同じ値'
)
on conflict (key) do update
set value = excluded.value,
    note = excluded.note,
    updated_at = now();

-- The old scalar rating config is no longer used by arena_rating_delta.
-- Keep a readable copy of the curve for operations/debugging.
insert into public.arena_config (key, value, note)
values (
  'rating',
  '{"floor":0,"curve_version":2}'::jsonb,
  'レート差カーブv2。実値は arena__rating_curve_value と src/data/arena/rating.ts が正'
)
on conflict (key) do update
set value = excluded.value,
    note = excluded.note,
    updated_at = now();
