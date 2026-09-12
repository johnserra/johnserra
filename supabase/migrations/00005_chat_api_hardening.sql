-- Chat API hardening: HMAC identity counters in a private, fixed-window table.
-- The application sends only HMAC-SHA-256 hex digests; raw session/IP values
-- never reach this table.

create table if not exists public.chat_rate_limits (
  identity_type text not null check (identity_type in ('session', 'ip')),
  identity_hash text not null check (
    char_length(identity_hash) = 64 and identity_hash ~ '^[0-9a-f]{64}$'
  ),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0 and request_count <= 100000),
  primary key (identity_type, identity_hash)
);

alter table public.chat_rate_limits enable row level security;
revoke all on table public.chat_rate_limits from public, anon, authenticated;
grant all on table public.chat_rate_limits to service_role;

create or replace function public.check_chat_rate_limit(
  p_session_hash text,
  p_ip_hash text,
  p_window_seconds integer,
  p_session_limit integer,
  p_ip_limit integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  session_count integer,
  ip_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  session_started timestamptz;
  ip_started timestamptz;
  session_total integer;
  ip_total integer;
  retry_at timestamptz;
begin
  -- Hashes, limits, and windows are deliberately bounded at the SQL boundary.
  if p_session_hash is null or char_length(p_session_hash) <> 64 or p_session_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null or char_length(p_ip_hash) <> 64 or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid chat rate-limit identity.' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600
     or p_session_limit is null or p_session_limit < 1 or p_session_limit > 1000
     or p_ip_limit is null or p_ip_limit < 1 or p_ip_limit > 1000 then
    raise exception 'Invalid chat rate-limit bounds.' using errcode = '22023';
  end if;

  -- Keep this maintenance bounded so an abusive stream of new HMACs cannot
  -- turn one request into an unbounded cleanup transaction.
  delete from public.chat_rate_limits
  where ctid in (
    select ctid
    from public.chat_rate_limits
    where window_started_at < v_now - interval '1 day'
    limit 1000
  );

  -- Always lock/update the session row before the IP row. This order keeps
  -- concurrent requests from taking the two identity locks in reverse order.
  insert into public.chat_rate_limits (identity_type, identity_hash, window_started_at, request_count)
  values ('session', p_session_hash, v_now, 1)
  on conflict (identity_type, identity_hash) do update
  set window_started_at = case
        when public.chat_rate_limits.window_started_at <= v_now - (p_window_seconds * interval '1 second')
          then excluded.window_started_at
        else public.chat_rate_limits.window_started_at
      end,
      request_count = case
        when public.chat_rate_limits.window_started_at <= v_now - (p_window_seconds * interval '1 second')
          then 1
        else least(100000, public.chat_rate_limits.request_count + 1)
      end
  returning window_started_at, request_count into session_started, session_total;

  insert into public.chat_rate_limits (identity_type, identity_hash, window_started_at, request_count)
  values ('ip', p_ip_hash, v_now, 1)
  on conflict (identity_type, identity_hash) do update
  set window_started_at = case
        when public.chat_rate_limits.window_started_at <= v_now - (p_window_seconds * interval '1 second')
          then excluded.window_started_at
        else public.chat_rate_limits.window_started_at
      end,
      request_count = case
        when public.chat_rate_limits.window_started_at <= v_now - (p_window_seconds * interval '1 second')
          then 1
        else least(100000, public.chat_rate_limits.request_count + 1)
      end
  returning window_started_at, request_count into ip_started, ip_total;

  retry_at := greatest(
    session_started + (p_window_seconds * interval '1 second'),
    ip_started + (p_window_seconds * interval '1 second')
  );

  return query select
    session_total <= p_session_limit and ip_total <= p_ip_limit,
    greatest(0, ceil(extract(epoch from (retry_at - v_now)))::integer),
    session_total,
    ip_total;
end;
$$;

revoke all on function public.check_chat_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.check_chat_rate_limit(text, text, integer, integer, integer) to service_role;
