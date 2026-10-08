create table if not exists public.promotion_cache (
  id text primary key,
  data jsonb not null
);

create table if not exists public.promotion_reports (
  id bigint generated always as identity primary key,
  offer_id text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.refresh_limits (
  client_key text primary key,
  next_allowed_at timestamptz not null
);

alter table public.promotion_cache enable row level security;
alter table public.promotion_reports enable row level security;
alter table public.refresh_limits enable row level security;

-- Service-role-only; one atomic attempt per client per minute across instances.
create or replace function public.take_refresh_slot(client_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  wait_seconds integer;
begin
  insert into public.refresh_limits as limits (client_key, next_allowed_at)
  values (take_refresh_slot.client_key, now() + interval '1 minute')
  on conflict (client_key) do update
    set next_allowed_at = excluded.next_allowed_at
    where limits.next_allowed_at <= now()
  returning true into allowed;
  if allowed then
    delete from public.refresh_limits where next_allowed_at < now() - interval '1 day';
    return 0;
  end if;
  select greatest(1, ceil(extract(epoch from (limits.next_allowed_at - now())))::integer)
    into wait_seconds
    from public.refresh_limits as limits
    where limits.client_key = take_refresh_slot.client_key;
  return coalesce(wait_seconds, 60);
end;
$$;

revoke all on function public.take_refresh_slot(text) from public, anon, authenticated;
grant execute on function public.take_refresh_slot(text) to service_role;
revoke all on public.promotion_cache, public.promotion_reports, public.refresh_limits from anon, authenticated;
