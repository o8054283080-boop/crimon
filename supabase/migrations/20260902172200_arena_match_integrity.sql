--
-- アリーナ: 編成の検分と、勝敗のサーバ確定
--
-- ## ここで塞ぐ2つの穴
--
-- ### 1. 送った通りの編成が並ぶ
--
-- 防衛編成はクライアントが焼いたJSONをそのまま保存していた。
-- **★6・Lv60・強化15・能力ポイント満点を名乗るのは1行の書き換えで済む。**
-- `arena__validate_snapshot` が、図鑑ID・属性・★・Lv・能力ポイント・
-- スキル・潜在覚醒・装備6枠・レアリティ・強化値・メインOP・サブOPを
-- 生成された定義表(`arena_catalog_*`)と突き合わせる。
--
-- ### 2. 勝敗が自己申告だった
--
-- `arena_report_match(p_won)` は「勝った」と言えば勝ちだった。
-- nonce を足しても**「正しい手続きで嘘をつく」ようになるだけ**で何も変わらない。
--
-- 直し方は「戦闘をサーバでもう一度やる」。戦闘エンジンは種を渡せば
-- 完全に決定的(同じ種で同じ経過。実測で確認済み)なので、
--
--   1. `arena_begin_match` が、対戦ID・**サーバが決めた種**・
--      **サーバが持っている防衛編成**を発行する(挑戦券もここで引く)
--   2. クライアントは、その種とその編成で戦闘を再生する(見せるためだけ)
--   3. Edge Function `arena-settle` が、同じ種と同じ編成で戦闘を回し直し、
--      **サーバ側で出た勝敗**で `arena_settle_match` を呼ぶ
--
-- クライアントが送るのは「この対戦を精算してくれ」だけになる。
-- 勝敗を送る道がそもそも無い。
--
-- ## 残っている限界(隠さずに書く)
--
-- 攻撃編成の**所有**までは確かめられない。手持ちをサーバへ同期していないので、
-- 「作れるはずの編成」であることまでしか見られない。
-- 検分は通るが持っていない編成で挑むことは、いまの作りでは止まらない。
-- 止めるには手持ちの同期が要る。**それは別の仕事**として残す。
--

-- =====================================================================
-- 検分
-- =====================================================================

create or replace function public.arena__validate_snapshot(p_snapshot jsonb)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_units    jsonb;
  v_count    integer;
  v_unit     jsonb;
  v_inst     jsonb;
  v_dev      jsonb;
  v_equip    jsonb;
  v_item     jsonb;
  v_dex      text;
  v_star     integer;
  v_level    integer;
  v_rule     public.arena_catalog_star_rules%rowtype;
  v_points   numeric;
  v_stat     text;
  v_slot     integer;
  v_slots    integer[];
  v_types    text[];
  v_cap      public.arena_catalog_stat_caps%rowtype;
  v_max_skill integer;
  v_skills   integer;
  v_equip_max integer;
  v_max_subs integer;
  v_team     integer;
  v_i        integer;
  v_j        integer;
  v_k        integer;
  v_num      numeric;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'INVALID_SNAPSHOT';
  end if;

  -- 上限は定義表から引く。**ここに数字を書かない**
  select value::integer into v_max_skill  from public.arena_catalog_limits where key = 'max_skill_level';
  select value::integer into v_skills     from public.arena_catalog_limits where key = 'skill_count';
  select value::integer into v_equip_max  from public.arena_catalog_limits where key = 'equip_max_level';
  select value::integer into v_max_subs   from public.arena_catalog_limits where key = 'max_sub_stats';
  select value::integer into v_team       from public.arena_catalog_limits where key = 'team_size';
  if v_max_skill is null or v_skills is null or v_equip_max is null
     or v_max_subs is null or v_team is null then
    -- 定義表が入っていない。**通してはいけない**(何も検分できていない)
    raise exception 'CATALOG_MISSING';
  end if;

  v_units := p_snapshot -> 'units';
  if v_units is null or jsonb_typeof(v_units) <> 'array' then
    raise exception 'INVALID_SNAPSHOT';
  end if;
  v_count := jsonb_array_length(v_units);
  if v_count < 1 or v_count > v_team then
    raise exception 'INVALID_UNIT_COUNT';
  end if;
  if pg_column_size(p_snapshot) > 262144 then
    raise exception 'SNAPSHOT_TOO_LARGE';
  end if;

  for v_i in 0 .. v_count - 1 loop
    v_unit := v_units -> v_i;
    if jsonb_typeof(v_unit) <> 'object' then
      raise exception 'INVALID_UNIT';
    end if;

    ---------------------------------------------------------------- 個体
    v_inst := v_unit -> 'instance';
    if jsonb_typeof(v_inst) <> 'object' then
      raise exception 'INVALID_INSTANCE';
    end if;

    /*
     * 図鑑ID。**属性の検分もこれで済む。**
     * IDは「テンプレート_属性」で、表に載っている組み合わせしか存在しない。
     * 「slime_FIRE の見た目で slime_LIGHT の性能」は、そもそも名乗れない。
     */
    v_dex := v_inst ->> 'dexId';
    if v_dex is null or not exists (
      select 1 from public.arena_catalog_monsters m where m.dex_id = v_dex
    ) then
      raise exception 'UNKNOWN_DEX_ID: %', coalesce(v_dex, '(null)');
    end if;

    -- ★とレベル。星ごとにレベル上限が違う
    if jsonb_typeof(v_inst -> 'star') <> 'number' then
      raise exception 'INVALID_STAR';
    end if;
    v_star := (v_inst ->> 'star')::integer;
    select * into v_rule from public.arena_catalog_star_rules r where r.star = v_star;
    if not found then
      raise exception 'INVALID_STAR: %', v_star;
    end if;
    if jsonb_typeof(v_inst -> 'level') <> 'number' then
      raise exception 'INVALID_LEVEL';
    end if;
    v_level := (v_inst ->> 'level')::integer;
    if v_level < 1 or v_level > v_rule.max_level then
      raise exception 'INVALID_LEVEL: 星% で Lv%', v_star, v_level;
    end if;

    -- スキルレベル。本数も見る(4本目を生やされないように)
    if jsonb_typeof(v_inst -> 'skillLevels') <> 'array'
       or jsonb_array_length(v_inst -> 'skillLevels') <> v_skills then
      raise exception 'INVALID_SKILL_LEVELS';
    end if;
    for v_j in 0 .. v_skills - 1 loop
      if jsonb_typeof(v_inst -> 'skillLevels' -> v_j) <> 'number' then
        raise exception 'INVALID_SKILL_LEVELS';
      end if;
      v_num := (v_inst -> 'skillLevels' ->> v_j)::numeric;
      if v_num < 1 or v_num > v_max_skill or v_num <> floor(v_num) then
        raise exception 'INVALID_SKILL_LEVEL: %', v_num;
      end if;
    end loop;

    ---------------------------------------------------------------- 育成
    v_dev := v_inst -> 'development';
    if jsonb_typeof(v_dev) = 'object' then
      -- タイプ転生。決まった6つ以外は受け取らない
      if jsonb_typeof(v_dev -> 'type') = 'string'
         and (v_dev ->> 'type') not in ('ATTACK','HP','DEFENSE','SUPPORT','DISRUPT','BALANCE') then
        raise exception 'INVALID_MONSTER_TYPE: %', v_dev ->> 'type';
      end if;

      -- 能力ポイント。**星ごとの予算を1点も超えさせない**
      v_points := 0;
      if jsonb_typeof(v_dev -> 'abilityPoints') = 'object' then
        foreach v_stat in array array['hp','atk','def','spd'] loop
          if jsonb_typeof(v_dev -> 'abilityPoints' -> v_stat) = 'number' then
            v_num := (v_dev -> 'abilityPoints' ->> v_stat)::numeric;
            if v_num < 0 or v_num <> floor(v_num) then
              raise exception 'INVALID_ABILITY_POINTS';
            end if;
            v_points := v_points + v_num;
          elsif v_dev -> 'abilityPoints' ? v_stat then
            raise exception 'INVALID_ABILITY_POINTS';
          end if;
        end loop;
      end if;
      if v_points > v_rule.ability_points then
        raise exception 'ABILITY_POINTS_OVER_BUDGET: 星% は % 点まで(% 点)',
          v_star, v_rule.ability_points, v_points;
      end if;

      -- 潜在覚醒。**その図鑑IDの候補にあるものだけ**
      if jsonb_typeof(v_dev -> 'latentAbilityId') = 'string' then
        if not exists (
          select 1 from public.arena_catalog_latents l
           where l.dex_id = v_dex and l.latent_id = v_dev ->> 'latentAbilityId'
        ) then
          raise exception 'UNKNOWN_LATENT: %', v_dev ->> 'latentAbilityId';
        end if;
      end if;
    end if;

    ---------------------------------------------------------------- 装備
    v_equip := v_unit -> 'equipment';
    if jsonb_typeof(v_equip) <> 'array' then
      raise exception 'INVALID_EQUIPMENT';
    end if;
    if jsonb_array_length(v_equip) > 6 then
      raise exception 'TOO_MANY_EQUIPMENT';
    end if;

    v_slots := array[]::integer[];
    for v_j in 0 .. jsonb_array_length(v_equip) - 1 loop
      v_item := v_equip -> v_j;
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'INVALID_EQUIPMENT';
      end if;

      -- 枠。**同じ枠を2つ着せない**
      if jsonb_typeof(v_item -> 'slot') <> 'number' then
        raise exception 'INVALID_EQUIP_SLOT';
      end if;
      v_slot := (v_item ->> 'slot')::integer;
      if v_slot < 1 or v_slot > 6 then
        raise exception 'INVALID_EQUIP_SLOT: %', v_slot;
      end if;
      if v_slot = any (v_slots) then
        raise exception 'DUPLICATE_EQUIP_SLOT: %', v_slot;
      end if;
      v_slots := v_slots || v_slot;

      -- レアリティと強化値
      if jsonb_typeof(v_item -> 'star') <> 'number' then
        raise exception 'INVALID_EQUIP_STAR';
      end if;
      v_star := (v_item ->> 'star')::integer;
      if v_star < 1 or v_star > 6 then
        raise exception 'INVALID_EQUIP_STAR: %', v_star;
      end if;
      if jsonb_typeof(v_item -> 'level') <> 'number' then
        raise exception 'INVALID_EQUIP_LEVEL';
      end if;
      v_level := (v_item ->> 'level')::integer;
      if v_level < 0 or v_level > v_equip_max then
        raise exception 'INVALID_EQUIP_LEVEL: %', v_level;
      end if;

      -- シリーズ
      if not exists (
        select 1 from public.arena_catalog_sets s where s.set_type = v_item ->> 'set'
      ) then
        raise exception 'UNKNOWN_SET: %', coalesce(v_item ->> 'set', '(null)');
      end if;

      -- メインOP。**その枠に付きうる型か**、**値が上限内か**
      if jsonb_typeof(v_item -> 'mainStat') <> 'object'
         or jsonb_typeof(v_item -> 'mainStat' -> 'value') <> 'number' then
        raise exception 'INVALID_MAIN_STAT';
      end if;
      v_stat := v_item -> 'mainStat' ->> 'type';
      if not exists (
        select 1 from public.arena_catalog_slot_mains sm
         where sm.slot = v_slot and sm.stat_type = v_stat
      ) then
        raise exception 'INVALID_MAIN_STAT_FOR_SLOT: 枠% に %', v_slot, coalesce(v_stat, '(null)');
      end if;
      select * into v_cap from public.arena_catalog_stat_caps c
       where c.stat_type = v_stat and c.star = v_star and c.level = v_level;
      if not found then
        raise exception 'NO_STAT_CAP: % 星% 強化%', v_stat, v_star, v_level;
      end if;
      v_num := (v_item -> 'mainStat' ->> 'value')::numeric;
      if v_num <= 0 or v_num > v_cap.main_max then
        raise exception 'MAIN_STAT_OVER_CAP: % = %(上限 %)', v_stat, v_num, v_cap.main_max;
      end if;

      -- サブOP。個数・重複・メインとの重なり・値の上限
      if v_item ? 'subStats' then
        if jsonb_typeof(v_item -> 'subStats') <> 'array' then
          raise exception 'INVALID_SUB_STATS';
        end if;
        if jsonb_array_length(v_item -> 'subStats') > v_max_subs then
          raise exception 'TOO_MANY_SUB_STATS';
        end if;
        -- メインOPと同じ型は付かない。だから先に入れておく
        v_types := array[v_stat];
        -- **外側と別の変数を使う。** 3重ループで同じ名前を使うと、
        -- 読む側が「本当に別物か」を毎回確かめる羽目になる
        for v_k in 0 .. jsonb_array_length(v_item -> 'subStats') - 1 loop
          if jsonb_typeof(v_item -> 'subStats' -> v_k) <> 'object'
             or jsonb_typeof(v_item -> 'subStats' -> v_k -> 'value') <> 'number' then
            raise exception 'INVALID_SUB_STATS';
          end if;
          v_stat := v_item -> 'subStats' -> v_k ->> 'type';
          if v_stat is null or v_stat = any (v_types) then
            raise exception 'DUPLICATE_SUB_STAT: %', coalesce(v_stat, '(null)');
          end if;
          v_types := v_types || v_stat;
          select * into v_cap from public.arena_catalog_stat_caps c
           where c.stat_type = v_stat and c.star = v_star and c.level = v_level;
          if not found then
            raise exception 'UNKNOWN_SUB_STAT: %', v_stat;
          end if;
          v_num := (v_item -> 'subStats' -> v_k ->> 'value')::numeric;
          if v_num <= 0 or v_num > v_cap.sub_max then
            raise exception 'SUB_STAT_OVER_CAP: % = %(上限 %)', v_stat, v_num, v_cap.sub_max;
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

comment on function public.arena__validate_snapshot(jsonb) is
  '防衛・攻撃編成を arena_catalog_* と突き合わせる。通らなければ例外。';

-- =====================================================================
-- 防衛編成の登録を、検分つきに差し替える
-- =====================================================================

create or replace function public.arena_set_defense(p_snapshot jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_count       integer;
  v_version     integer;
  v_max_version integer;
  v_at          timestamptz;
  v_lead        jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- **ここが本体。** 通らなければ1行も書かない
  v_count := public.arena__validate_snapshot(p_snapshot);

  if jsonb_typeof(p_snapshot -> 'version') <> 'number' then
    raise exception 'INVALID_SNAPSHOT_VERSION';
  end if;
  v_version := (p_snapshot ->> 'version')::integer;
  /*
   * **未来から来た編成を受け取らない。**
   *
   * 焼き付けの形を変えた時、配信の途中では新旧のクライアントが同時に動く。
   * 読み方が変わっているのに古いサーバが受け取ると、
   * それを引いた**相手の画面で編成が崩れる**(本人には見えない事故)。
   * 古い版は受け取る——読めるし、読めなくなった1体は閲覧側が黙って落とす。
   */
  v_max_version := (public.arena__config('snapshot', '{"max_version":1}'::jsonb)
                    ->> 'max_version')::integer;
  if v_version < 1 or v_version > v_max_version then
    raise exception 'UNSUPPORTED_SNAPSHOT_VERSION: % (受け取れるのは % まで)',
      v_version, v_max_version;
  end if;

  -- capturedAt はクライアント時刻なので、未来には置かせない
  if jsonb_typeof(p_snapshot -> 'capturedAt') = 'number' then
    v_at := least(now(), to_timestamp((p_snapshot ->> 'capturedAt')::numeric / 1000.0));
  else
    v_at := now();
  end if;
  if v_at is null or v_at < to_timestamp(0) then
    v_at := now();
  end if;

  v_lead := p_snapshot -> 'units' -> 0 -> 'instance';

  insert into public.arena_defenses as d
    (user_id, snapshot, snapshot_version, unit_count, captured_at, updated_at)
  values
    (v_uid, p_snapshot, v_version, v_count, v_at, now())
  on conflict (user_id) do update
    set snapshot = excluded.snapshot,
        snapshot_version = excluded.snapshot_version,
        unit_count = excluded.unit_count,
        captured_at = excluded.captured_at,
        updated_at = now();

  update public.arena_profiles pr
     set lead_dex_id = left(v_lead ->> 'dexId', 64),
         lead_star = least(6, greatest(1, (v_lead ->> 'star')::integer)),
         updated_at = now()
   where pr.user_id = v_uid;

  return jsonb_build_object('ok', true, 'unitCount', v_count);
end;
$$;

revoke execute on function public.arena_set_defense(jsonb) from public;
grant execute on function public.arena_set_defense(jsonb) to authenticated;

-- =====================================================================
-- 対戦の発行と確定
-- =====================================================================

create table if not exists public.arena_match_sessions (
  id                     uuid        primary key default gen_random_uuid(),
  attacker_id            uuid        not null references auth.users (id) on delete cascade,
  season_id              text        not null references public.arena_seasons (id),
  opponent_kind          text        not null check (opponent_kind in ('PLAYER', 'NPC')),
  defender_id            uuid        references auth.users (id) on delete set null,
  npc_seed               text,
  npc_name               text,
  -- **NPCは編成そのものを持たない。** 種・並び位置・件数から組み直せる。
  -- 保存すると「送られてきた弱いNPC」を保存してしまう
  npc_index              integer,
  npc_count              integer,
  -- **戦闘に使う編成は、発行した時点のものを固定する。**
  -- 後から相手が防衛を替えても、この対戦の相手は替わらない
  attacker_snapshot      jsonb       not null,
  defender_snapshot      jsonb,
  attacker_rating_before integer     not null,
  defender_rating_before integer     not null,
  -- **乱数の種はサーバが決める。** クライアントに選ばせると引き直せる
  battle_seed            bigint      not null,
  nonce                  text        not null,
  status                 text        not null default 'OPEN'
                                     check (status in ('OPEN', 'SETTLED', 'EXPIRED')),
  created_at             timestamptz not null default now(),
  expires_at             timestamptz not null,
  settled_at             timestamptz
);

create index if not exists arena_match_sessions_open_idx
  on public.arena_match_sessions (attacker_id, status, created_at desc);

alter table public.arena_match_sessions enable row level security;
-- **誰にも直接は触らせない。** 出入りはRPCとEdge Functionだけ
revoke all on public.arena_match_sessions from anon, authenticated;

-- ---------------------------------------------------------------------
-- 挑む。挑戦券はここで引く。
--
-- **勝敗はここでは決めない。** 決めるのは Edge Function が戦闘を回した後。
-- ---------------------------------------------------------------------
create or replace function public.arena_begin_match(
  p_opponent_kind text,
  p_attacker_snapshot jsonb,
  p_opponent_id uuid default null,
  p_opponent_seed text default null,
  p_opponent_name text default null,
  p_opponent_index integer default null,
  p_opponent_count integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_season    public.arena_seasons%rowtype;
  v_wallet    public.arena_wallets%rowtype;
  v_me        public.arena_standings%rowtype;
  v_them      public.arena_standings%rowtype;
  v_defense   public.arena_defenses%rowtype;
  v_npc       jsonb;
  v_band      integer;
  v_rating    integer;
  v_limit     jsonb;
  v_id        uuid;
  v_nonce     text;
  v_seed      bigint;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_opponent_kind not in ('PLAYER', 'NPC') then
    raise exception 'INVALID_OPPONENT_KIND';
  end if;
  if p_opponent_kind = 'PLAYER' and p_opponent_id = v_uid then
    raise exception 'SELF_MATCH';
  end if;

  -- 攻撃編成も**同じ検分**を通す。片方だけ緩いと、そこから抜ける
  perform public.arena__validate_snapshot(p_attacker_snapshot);

  select * into v_season from public.arena_seasons s where s.status = 'ACTIVE';
  if not found then
    raise exception 'NO_ACTIVE_SEASON';
  end if;

  -- 連打よけ
  v_limit := public.arena__config('match_limit', '{"min_seconds":3}'::jsonb);
  if exists (
    select 1 from public.arena_match_sessions ms
     where ms.attacker_id = v_uid
       and ms.created_at > now() - make_interval(secs => (v_limit ->> 'min_seconds')::numeric)
  ) then
    raise exception 'TOO_FAST';
  end if;

  -- 挑戦券。**発行の時点で引く**(引いてから逃げても券は戻らない)
  perform public.arena__refill_tickets(v_uid);
  select * into v_wallet from public.arena_wallets w where w.user_id = v_uid for update;
  if not found or v_wallet.tickets < 1 then
    raise exception 'NO_TICKET';
  end if;
  update public.arena_wallets w
     set tickets = w.tickets - 1, updated_at = now()
   where w.user_id = v_uid;

  select * into v_me from public.arena_standings s
   where s.user_id = v_uid and s.season_id = v_season.id;
  if not found then
    raise exception 'NO_STANDING';
  end if;

  if p_opponent_kind = 'PLAYER' then
    select * into v_them from public.arena_standings s
     where s.user_id = p_opponent_id and s.season_id = v_season.id;
    if not found then
      raise exception 'UNKNOWN_OPPONENT';
    end if;
    select * into v_defense from public.arena_defenses d where d.user_id = p_opponent_id;
    if not found then
      raise exception 'OPPONENT_HAS_NO_DEFENSE';
    end if;
    -- **相手のレートはDBの値。** 申告は受け取らない
    v_rating := v_them.rating;
    v_npc := v_defense.snapshot;
  else
    if p_opponent_seed is null or btrim(p_opponent_seed) = '' then
      raise exception 'MISSING_NPC_SEED';
    end if;
    if p_opponent_index is null or p_opponent_index < 0 or p_opponent_index > 63
       or p_opponent_count is null or p_opponent_count < 1 or p_opponent_count > 64
       or p_opponent_index >= p_opponent_count then
      raise exception 'INVALID_NPC_POSITION';
    end if;
    /*
     * **NPCのレートを申告させない。**
     *
     * 以前は申告を受けて自分の帯へ丸めていたが、丸めた値と
     * クライアントが見ていたNPCがずれる。ずれると「画面に出ていた相手」と
     * 「サーバが戦わせる相手」が別物になる。
     *
     * 生成の基準は**サーバが持っている自分のレート**だけにする。
     * 並び位置ごとの格下・互角・格上の差は生成器が付ける。
     * 実際に何レートの相手だったかは、組み直した Edge Function が
     * 精算時に持ってくる(service_role しか呼べないので信用できる)。
     */
    v_rating := v_me.rating;
    v_npc := null;
  end if;

  /*
   * nonce と種。**`gen_random_uuid()` だけで作る。**
   *
   * `gen_random_bytes` は pgcrypto の関数で、Supabase では `extensions`
   * スキーマに入っている——**が、それは環境によって違う。**
   * `set search_path = ''` にしてあるので置き場所を書く必要があり、
   * 書いた場所と違えばこの関数はその場で落ちる。
   * `gen_random_uuid()` は PG13 以降の組み込みなので、どこにも依存しない。
   */
  v_nonce := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');
  -- 種もサーバが作る。**クライアントに選ばせると、勝つまで引き直せる**
  v_seed := (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint);

  insert into public.arena_match_sessions
    (attacker_id, season_id, opponent_kind, defender_id, npc_seed, npc_name,
     npc_index, npc_count,
     attacker_snapshot, defender_snapshot,
     attacker_rating_before, defender_rating_before,
     battle_seed, nonce, expires_at)
  values
    (v_uid, v_season.id, p_opponent_kind,
     case when p_opponent_kind = 'PLAYER' then p_opponent_id end,
     left(p_opponent_seed, 64), left(p_opponent_name, 32),
     p_opponent_index, p_opponent_count,
     p_attacker_snapshot, v_npc,
     v_me.rating, v_rating,
     v_seed, v_nonce, now() + interval '20 minutes')
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'matchId', v_id,
    'nonce', v_nonce,
    'battleSeed', v_seed,
    'defenderSnapshot', v_npc,
    'defenderRating', v_rating,
    'npcSeed', left(p_opponent_seed, 64),
    'npcIndex', p_opponent_index,
    'npcCount', p_opponent_count,
    'attackerRating', v_me.rating,
    'tickets', v_wallet.tickets - 1
  );
end;
$$;

revoke execute on function
  public.arena_begin_match(text, jsonb, uuid, text, text, integer, integer) from public, anon;
grant execute on function
  public.arena_begin_match(text, jsonb, uuid, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 記録と増減の一本道。
--
-- もとは `arena_report_match` の中にあった。**取り出したのは、
-- 呼ぶ人が変わったから。** いまこれを呼ぶのは精算だけで、
-- 挑戦券も連打よけも `arena_begin_match`(発行の側)へ移った。
-- ここに残すと、発行で引いた券を精算でもう一度引いてしまう。
--
-- 内部専用。**誰にも grant しない。**
-- ---------------------------------------------------------------------
create or replace function public.arena__record_match(
  p_attacker uuid,
  p_opponent_kind text,
  p_defender uuid,
  p_npc_seed text,
  p_npc_name text,
  p_opponent_rating integer,
  p_attacker_won boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_season    text := public.arena_current_season();
  v_me        public.arena_standings%rowtype;
  v_foe       public.arena_standings%rowtype;
  v_npc       jsonb;
  v_defense   jsonb;
  v_delta     integer;
  v_new       integer;
  v_coins     integer;
  v_balance   bigint;
  v_def_delta integer;
  v_def_new   integer;
  v_def_cap   integer;
  v_def_room  integer;
  v_match_id  uuid;
  v_tickets   integer;
begin
  if v_season is null then
    raise exception 'NO_ACTIVE_SEASON';
  end if;

  v_npc     := public.arena__config('npc', '{"rating_band":300,"rating_scale":1.0,"coin_scale":1.0}'::jsonb);
  v_defense := public.arena__config('defense', '{"scale":0.5,"daily_loss_cap":60}'::jsonb);

  -- 2人ぶんの行を user_id 順に1文で押さえる。
  -- 別々に押さえると、同時に殴り合った2人でデッドロックになる
  perform 1 from public.arena_standings s
   where s.season_id = v_season
     and s.user_id in (p_attacker, p_defender)
   order by s.user_id
     for update;

  select * into v_me from public.arena_standings s
   where s.user_id = p_attacker and s.season_id = v_season;
  if not found then
    raise exception 'NO_STANDING';
  end if;

  if p_opponent_kind = 'PLAYER' then
    select * into v_foe from public.arena_standings s
     where s.user_id = p_defender and s.season_id = v_season;
    if not found then
      raise exception 'NO_OPPONENT_STANDING';
    end if;
  end if;

  v_delta := public.arena_rating_delta(v_me.rating, p_opponent_rating, p_attacker_won);
  if p_opponent_kind = 'NPC' then
    v_delta := round(v_delta * (v_npc ->> 'rating_scale')::numeric);
  end if;
  v_new := greatest(0, v_me.rating + v_delta);
  v_delta := v_new - v_me.rating;

  v_coins := public.arena_match_coins(p_attacker_won, v_me.rating, p_opponent_rating, p_opponent_kind);

  update public.arena_standings s
     set rating = v_new,
         best_rating = greatest(s.best_rating, v_new),
         tier_id = public.arena_tier_for_rating(v_new),
         wins = s.wins + case when p_attacker_won then 1 else 0 end,
         losses = s.losses + case when p_attacker_won then 0 else 1 end,
         last_match_at = now(),
         updated_at = now()
   where s.user_id = p_attacker and s.season_id = v_season;

  v_balance := public.arena__grant_coins(p_attacker, v_coins);

  -- 防衛側。**寝ている間に溶けないように、幅を半分にして1日の上限を置く**
  if p_opponent_kind = 'PLAYER' then
    v_def_delta := public.arena_rating_delta(v_foe.rating, v_me.rating, not p_attacker_won);
    if v_def_delta <> 0 then
      v_def_delta := sign(v_def_delta)::integer
        * greatest(1, round(abs(v_def_delta) * (v_defense ->> 'scale')::numeric))::integer;
    end if;

    if v_foe.defense_loss_date <> current_date then
      v_foe.defense_loss_today := 0;
    end if;
    v_def_cap := greatest(0, (v_defense ->> 'daily_loss_cap')::integer);
    if v_def_delta < 0 then
      v_def_room := greatest(0, v_def_cap - v_foe.defense_loss_today);
      v_def_delta := -least(abs(v_def_delta), v_def_room);
    end if;

    v_def_new := greatest(0, v_foe.rating + v_def_delta);
    v_def_delta := v_def_new - v_foe.rating;

    update public.arena_standings s
       set rating = v_def_new,
           best_rating = greatest(s.best_rating, v_def_new),
           tier_id = public.arena_tier_for_rating(v_def_new),
           defense_wins = s.defense_wins + case when p_attacker_won then 0 else 1 end,
           defense_losses = s.defense_losses + case when p_attacker_won then 1 else 0 end,
           defense_loss_date = current_date,
           defense_loss_today = case when v_foe.defense_loss_date <> current_date then 0
                                     else s.defense_loss_today end
                                + greatest(0, -v_def_delta),
           updated_at = now()
     where s.user_id = p_defender and s.season_id = v_season;
  end if;

  insert into public.arena_matches (
    season_id, attacker_id, defender_id, opponent_kind, npc_seed, npc_name,
    attacker_won, attacker_rating_before, attacker_rating_delta, attacker_rating_after,
    defender_rating_before, defender_rating_delta, defender_rating_after, coins_awarded)
  values (
    v_season, p_attacker,
    case when p_opponent_kind = 'PLAYER' then p_defender else null end,
    p_opponent_kind,
    case when p_opponent_kind = 'NPC' then left(p_npc_seed, 64) else null end,
    case when p_opponent_kind = 'NPC' then left(p_npc_name, 24) else null end,
    p_attacker_won, v_me.rating, v_delta, v_new,
    case when p_opponent_kind = 'PLAYER' then v_foe.rating else null end,
    case when p_opponent_kind = 'PLAYER' then v_def_delta else null end,
    case when p_opponent_kind = 'PLAYER' then v_def_new else null end,
    v_coins)
  returning id into v_match_id;

  select w.tickets into v_tickets from public.arena_wallets w where w.user_id = p_attacker;

  return jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'won', p_attacker_won,
    'ratingBefore', v_me.rating,
    'ratingDelta', v_delta,
    'rating', v_new,
    'tierId', public.arena_tier_for_rating(v_new),
    'coins', v_coins,
    'coinBalance', v_balance,
    'tickets', coalesce(v_tickets, 0),
    'opponentRating', p_opponent_rating);
end;
$$;

-- **内部専用。** 直接呼べると、発行を通さずに戦績を作れる
revoke execute on function
  public.arena__record_match(uuid, text, uuid, text, text, integer, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 精算。**service_role だけが呼べる。**
--
-- 呼ぶのは Edge Function `arena-settle` で、
-- そこで戦闘を回し直した結果だけが `p_attacker_won` に入る。
-- authenticated から実行できないので、**勝敗を送る道が存在しない。**
-- ---------------------------------------------------------------------
create or replace function public.arena_settle_match(
  p_match_id uuid,
  p_attacker_won boolean,
  -- NPC戦で、組み直した相手が実際に何レートだったか。
  -- **service_role しか呼べないので、この値は信用してよい**
  p_opponent_rating integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.arena_match_sessions%rowtype;
  v_result  jsonb;
begin
  select * into v_session from public.arena_match_sessions ms
   where ms.id = p_match_id for update;
  if not found then
    raise exception 'UNKNOWN_MATCH';
  end if;
  -- **二度は精算しない。** 通信のやり直しで2回入るのを物理的に止める
  if v_session.status <> 'OPEN' then
    raise exception 'ALREADY_SETTLED';
  end if;
  if v_session.expires_at < now() then
    update public.arena_match_sessions ms set status = 'EXPIRED' where ms.id = p_match_id;
    raise exception 'MATCH_EXPIRED';
  end if;

  update public.arena_match_sessions ms
     set status = 'SETTLED', settled_at = now()
   where ms.id = p_match_id;

  -- 記録と増減は既存の一本道へ渡す(挑戦券は発行時に引いてあるので消費しない)
  v_result := public.arena__record_match(
    p_attacker      => v_session.attacker_id,
    p_opponent_kind => v_session.opponent_kind,
    p_defender      => v_session.defender_id,
    p_npc_seed      => v_session.npc_seed,
    p_npc_name      => v_session.npc_name,
    p_opponent_rating => case
      when v_session.opponent_kind = 'NPC' and p_opponent_rating is not null
        then p_opponent_rating
      else v_session.defender_rating_before
    end,
    p_attacker_won  => p_attacker_won
  );

  -- 実際に戦った相手のレートを記録へも残す(あとで検算できるように)
  if v_session.opponent_kind = 'NPC' and p_opponent_rating is not null then
    update public.arena_match_sessions ms
       set defender_rating_before = p_opponent_rating
     where ms.id = p_match_id;
  end if;
  return v_result || jsonb_build_object('matchId', v_session.id);
end;
$$;

revoke execute on function public.arena_settle_match(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.arena_settle_match(uuid, boolean, integer) to service_role;

-- Edge Function が対戦を読むための最低限。**書き込みはRPC越しだけ**
grant select on public.arena_match_sessions to service_role;

-- ---------------------------------------------------------------------
-- 自己申告の入口を閉じる
--
-- `arena_report_match` は「勝った」と言えば勝ちだった。
-- **消さずに、呼べなくする。** 消すと、古いクライアントが
-- 「関数が無い」で静かに失敗し、原因が分からなくなる。
-- 呼べば必ず理由の分かる例外が返るようにしておく。
-- ---------------------------------------------------------------------
create or replace function public.arena_report_match(
  p_opponent_kind text,
  p_won boolean,
  p_opponent_id uuid default null,
  p_opponent_seed text default null,
  p_opponent_name text default null,
  p_opponent_rating integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  raise exception
    'SELF_REPORT_DISABLED: 勝敗はサーバが戦闘を回して決めます。arena_begin_match → arena-settle を使ってください';
end;
$$;

revoke execute on function
  public.arena_report_match(text, boolean, uuid, text, text, integer)
  from public, anon, authenticated;

-- =====================================================================
-- 自分は自分の相手にならない(申告ではなく auth.uid() で外す)
-- =====================================================================

create or replace view public.arena_opponent_pool
with (security_invoker = on) as
select
  s.season_id,
  s.user_id,
  p.display_name,
  p.icon_key,
  s.rating,
  s.tier_id,
  p.lead_dex_id,
  p.lead_star,
  d.snapshot,
  d.snapshot_version,
  d.unit_count,
  d.captured_at,
  d.updated_at
from public.arena_standings s
join public.arena_profiles p on p.user_id = s.user_id
join public.arena_defenses d on d.user_id = s.user_id
where s.season_id = (select x.id from public.arena_seasons x where x.status = 'ACTIVE')
  -- **ここが要。** クライアントの `user_id=neq.<申告>` は、申告を変えれば外れる
  and s.user_id <> auth.uid();

grant select on public.arena_opponent_pool to authenticated;

-- =====================================================================
-- 照合表の権限
--
-- 中身はゲームの定義そのもので、**クライアントの中にも同じものが入っている。**
-- 隠す意味は無いので読みは開ける。ただし**書き込みは誰にも渡さない**——
-- ここを書き換えられると、検分そのものを緩められる。
-- =====================================================================
revoke all on public.arena_catalog_monsters   from anon, authenticated;
revoke all on public.arena_catalog_latents    from anon, authenticated;
revoke all on public.arena_catalog_slot_mains from anon, authenticated;
revoke all on public.arena_catalog_stat_caps  from anon, authenticated;
revoke all on public.arena_catalog_star_rules from anon, authenticated;
revoke all on public.arena_catalog_sets       from anon, authenticated;
revoke all on public.arena_catalog_limits     from anon, authenticated;

grant select on public.arena_catalog_monsters   to anon, authenticated;
grant select on public.arena_catalog_latents    to anon, authenticated;
grant select on public.arena_catalog_slot_mains to anon, authenticated;
grant select on public.arena_catalog_stat_caps  to anon, authenticated;
grant select on public.arena_catalog_star_rules to anon, authenticated;
grant select on public.arena_catalog_sets       to anon, authenticated;
grant select on public.arena_catalog_limits     to anon, authenticated;
