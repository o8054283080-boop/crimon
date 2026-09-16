-- Paid arena ticket refill. Crystal inventory remains client-owned today, so this RPC
-- atomically protects the server ticket side. The client only spends crystal after this succeeds.
create or replace function public.arena_refill_tickets_paid()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_wallet public.arena_wallets%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public.arena__refill_tickets(v_uid);
  select * into v_wallet from public.arena_wallets w where w.user_id=v_uid for update;
  if not found then raise exception 'NO_WALLET'; end if;
  if v_wallet.tickets >= v_wallet.tickets_max then
    return jsonb_build_object('ok',false,'code','TICKETS_FULL','tickets',v_wallet.tickets,'ticketsMax',v_wallet.tickets_max);
  end if;
  update public.arena_wallets w
     set tickets=w.tickets_max, tickets_refilled_at=now(), updated_at=now()
   where w.user_id=v_uid
   returning * into v_wallet;
  return jsonb_build_object('ok',true,'tickets',v_wallet.tickets,'ticketsMax',v_wallet.tickets_max);
end;
$$;
revoke execute on function public.arena_refill_tickets_paid() from public, anon;
grant execute on function public.arena_refill_tickets_paid() to authenticated;
