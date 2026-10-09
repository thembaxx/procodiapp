begin;

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
create index if not exists promotion_reports_created_at on public.promotion_reports (created_at);
create index if not exists refresh_limits_next_allowed_at on public.refresh_limits (next_allowed_at);

alter table public.promotion_cache enable row level security;
alter table public.promotion_reports enable row level security;
alter table public.refresh_limits enable row level security;
revoke all on public.promotion_cache, public.promotion_reports, public.refresh_limits from public, anon, authenticated;
grant select, insert, update, delete on public.promotion_cache, public.promotion_reports, public.refresh_limits to service_role;
grant usage, select on sequence public.promotion_reports_id_seq to service_role;

-- Replace the old one-argument RPC; callers now supply the bounded window.
drop function if exists public.take_refresh_slot(text);
create or replace function public.take_refresh_slot(client_key text, window_seconds integer default 60)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  allowed boolean;
  wait_seconds integer;
begin
  if client_key is null or client_key !~ '^[a-f0-9]{64}$' or window_seconds is null or window_seconds < 1 or window_seconds > 600 then
    raise exception 'Invalid rate-limit input' using errcode = '22023';
  end if;
  delete from public.refresh_limits where next_allowed_at <= now();
  insert into public.refresh_limits as limits (client_key, next_allowed_at)
  values (take_refresh_slot.client_key, now() + make_interval(secs => window_seconds))
  on conflict on constraint refresh_limits_pkey do update
    set next_allowed_at = excluded.next_allowed_at
    where limits.next_allowed_at <= now()
  returning true into allowed;
  if allowed then return 0; end if;
  select greatest(1, ceil(extract(epoch from (limits.next_allowed_at - now())))::integer)
    into wait_seconds
    from public.refresh_limits as limits
    where limits.client_key = take_refresh_slot.client_key;
  return coalesce(wait_seconds, window_seconds);
end;
$$;

create or replace function public.cleanup_expired_data()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  delete from public.promotion_reports where created_at <= now() - interval '30 days';
  delete from public.refresh_limits where next_allowed_at <= now();
end;
$$;

create or replace function public.save_promotion_report(reported_offer_id text, reported_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if reported_offer_id is null or length(reported_offer_id) not between 1 and 180 or reported_reason is null
    or reported_reason not in ('The code didn''t work', 'The offer has ended', 'The terms are different') then
    raise exception 'Invalid report' using errcode = '22023';
  end if;
  perform public.cleanup_expired_data();
  insert into public.promotion_reports (offer_id, reason) values (reported_offer_id, reported_reason);
end;
$$;

revoke all on function public.take_refresh_slot(text, integer), public.cleanup_expired_data(), public.save_promotion_report(text, text) from public, anon, authenticated;
grant execute on function public.take_refresh_slot(text, integer), public.cleanup_expired_data(), public.save_promotion_report(text, text) to service_role;

-- Also remove pre-migration expired identifiers and reports.
select public.cleanup_expired_data();
commit;
