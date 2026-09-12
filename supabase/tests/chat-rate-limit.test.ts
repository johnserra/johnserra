import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("chat limiter migration enforces RLS, permissions, exact limits, reset, and atomic increments", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(await readFile("supabase/migrations/00005_chat_api_hardening.sql", "utf8"));
    await db.exec(await readFile("supabase/tests/chat-rate-limit-regression.sql", "utf8"));

    const tableSecurity = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where oid = 'public.chat_rate_limits'::regclass",
    );
    assert.equal(tableSecurity.rows[0]?.relrowsecurity, true);
    const privileges = await db.query<{ anon_select: boolean; service_write: boolean }>(
      "select has_table_privilege('anon', 'public.chat_rate_limits', 'select') as anon_select, has_table_privilege('service_role', 'public.chat_rate_limits', 'update') as service_write",
    );
    assert.equal(privileges.rows[0]?.anon_select, false);
    assert.equal(privileges.rows[0]?.service_write, true);
    const functionPrivileges = await db.query<{ anon_execute: boolean; service_execute: boolean }>(
      "select has_function_privilege('anon', 'public.check_chat_rate_limit(text,text,integer,integer,integer)', 'execute') as anon_execute, has_function_privilege('service_role', 'public.check_chat_rate_limit(text,text,integer,integer,integer)', 'execute') as service_execute",
    );
    assert.equal(functionPrivileges.rows[0]?.anon_execute, false);
    assert.equal(functionPrivileges.rows[0]?.service_execute, true);

    const resetHash = "a".repeat(64);
    const resetIp = "b".repeat(64);
    await db.query("select * from public.check_chat_rate_limit($1,$2,60,1,10)", [resetHash, resetIp]);
    await db.query("update public.chat_rate_limits set window_started_at = clock_timestamp() - interval '2 minutes' where identity_hash in ($1,$2)", [resetHash, resetIp]);
    const reset = await db.query<{ allowed: boolean; session_count: number }>(
      "select * from public.check_chat_rate_limit($1,$2,60,1,10)", [resetHash, resetIp],
    );
    assert.equal(reset.rows[0]?.allowed, true);
    assert.equal(reset.rows[0]?.session_count, 1);

    const concurrentSession = "c".repeat(64);
    const concurrentIp = "d".repeat(64);
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      db.query<{ allowed: boolean }>("select * from public.check_chat_rate_limit($1,$2,60,10,100)", [concurrentSession, concurrentIp]),
    ));
    assert.equal(results.filter((result) => result.rows[0]?.allowed).length, 10);
    const counts = await db.query<{ request_count: number }>(
      "select request_count from public.chat_rate_limits where identity_type = 'session' and identity_hash = $1",
      [concurrentSession],
    );
    assert.equal(counts.rows[0]?.request_count, 20);
  } finally {
    await db.close();
  }
});
