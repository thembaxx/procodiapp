-- Run only against an isolated PostgreSQL database after supabase/schema.sql.
-- All fixture changes roll back. Roles anon/authenticated/service_role must exist.
begin;
do $$
declare
  key text := repeat('a', 64);
  result integer;
begin
  assert not has_table_privilege('anon', 'public.promotion_cache', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.promotion_reports', 'INSERT');
  assert not has_function_privilege('anon', 'public.take_refresh_slot(text,integer)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.cleanup_expired_data()', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.save_promotion_report(text,text)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.save_promotion_report(text,text)', 'EXECUTE');
  assert (select bool_and(relrowsecurity) from pg_class where oid in ('public.promotion_cache'::regclass, 'public.promotion_reports'::regclass, 'public.refresh_limits'::regclass));
  delete from public.refresh_limits where client_key = key;
  result := public.take_refresh_slot(key, 600);
  assert result = 0;
  result := public.take_refresh_slot(key, 600);
  assert result between 599 and 600;
  begin
    perform public.take_refresh_slot(key, 601);
    raise exception 'Oversized window was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.take_refresh_slot('raw-address', 60);
    raise exception 'Raw identifier was accepted';
  exception when invalid_parameter_value then null; end;
  insert into public.promotion_reports (offer_id, reason, created_at) values
    ('audit-expired', 'The offer has ended', now() - interval '31 days'),
    ('audit-current', 'The terms are different', now());
  insert into public.refresh_limits (client_key, next_allowed_at) values (repeat('b', 64), now() - interval '1 minute');
  perform public.save_promotion_report('audit-new', 'The code didn''t work');
  assert not exists(select 1 from public.promotion_reports where offer_id = 'audit-expired');
  assert exists(select 1 from public.promotion_reports where offer_id = 'audit-current');
  assert exists(select 1 from public.promotion_reports where offer_id = 'audit-new');
  assert not exists(select 1 from public.refresh_limits where client_key = repeat('b', 64));
  begin
    perform public.save_promotion_report('audit-invalid', 'Unexpected personal free text');
    raise exception 'Unknown reason was accepted';
  exception when invalid_parameter_value then null; end;
end;
$$;
set local role service_role;
select public.take_refresh_slot(repeat('c', 64), 60);
select public.save_promotion_report('audit-service-role', 'The offer has ended');
reset role;
rollback;
