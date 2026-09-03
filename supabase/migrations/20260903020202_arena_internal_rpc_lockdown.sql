-- 内部関数をData APIから直接呼べないよう閉じる。
-- どちらも公開RPCの中からだけ使い、クライアントが直接実行する理由はない。
revoke execute on function public.arena__validate_snapshot(jsonb)
  from public, anon, authenticated;
revoke execute on function public.arena_current_season()
  from public, anon, authenticated;

-- シーズン終了時の未精算試合検索と、相手削除時の外部キー確認を支える。
create index if not exists arena_match_sessions_season_idx
  on public.arena_match_sessions (season_id, status, expires_at);
create index if not exists arena_match_sessions_defender_idx
  on public.arena_match_sessions (defender_id)
  where defender_id is not null;

-- 最新の本人分シーズン報酬を探す向きに合わせる。
create index if not exists arena_season_results_user_idx
  on public.arena_season_results (user_id, season_id);
