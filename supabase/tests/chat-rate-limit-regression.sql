-- Executed by chat-rate-limit.test.ts after 00005 is installed.
do $$
declare
  first_call record;
  second_call record;
  blocked_call record;
begin
  select * into first_call from public.check_chat_rate_limit(
    repeat('1', 64), repeat('2', 64), 60, 2, 3
  );
  if not first_call.allowed or first_call.session_count <> 1 or first_call.ip_count <> 1 then
    raise exception 'first fixed-window request was not allowed';
  end if;

  select * into second_call from public.check_chat_rate_limit(
    repeat('1', 64), repeat('2', 64), 60, 2, 3
  );
  if not second_call.allowed or second_call.session_count <> 2 then
    raise exception 'exact session limit was not allowed';
  end if;

  select * into blocked_call from public.check_chat_rate_limit(
    repeat('1', 64), repeat('2', 64), 60, 2, 3
  );
  if blocked_call.allowed or blocked_call.session_count <> 3 or blocked_call.retry_after_seconds < 1 then
    raise exception 'over-limit request was not blocked';
  end if;
end;
$$;
