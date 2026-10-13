import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { FLAG_IDS, SCORED_QUESTION_IDS, scoreAssessment, type RedFlagAnswers, type ScoredAnswers } from "./data-audit";

const savedEnv = { ...process.env };
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://local-verification.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-verification-placeholder";
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-verification-placeholder";
process.env.RESEND_API_KEY = "re_local_verification";
delete process.env.JETPACK_CRM_API_URL;
delete process.env.JETPACK_CRM_API_KEY;
delete process.env.JETPACK_CRM_API_SECRET;

const requests: Array<{ url: string; body: string }> = [];
let failSupabaseWrites = false;
const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
globalThis.WebSocket = class LocalWebSocket {} as unknown as typeof WebSocket;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("https://local-verification.invalid/rest/v1/contact_messages") && url !== "https://api.resend.com/emails") {
    throw new Error(`Unexpected network target: ${url}`);
  }
  requests.push({ url, body: typeof init?.body === "string" ? init.body : "" });
  if (failSupabaseWrites && url.startsWith("https://local-verification.invalid/rest/v1/contact_messages")) {
    return new Response(JSON.stringify({ message: "simulated storage failure" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(url.includes("resend") ? { id: "local" } : null), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

const { POST: contactPost } = await import("../app/api/contact/route");
const { POST: dataAuditPost } = await import("../app/api/data-audit/route");

function request(path: string, body: unknown) {
  return new NextRequest(`https://johnserra.com${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function validAuditBody() {
  const answers = Object.fromEntries(SCORED_QUESTION_IDS.map((id) => [id, "yes"])) as ScoredAnswers;
  const redFlags = Object.fromEntries(FLAG_IDS.map((id) => [id, "no"])) as RedFlagAnswers;
  const result = scoreAssessment(answers, redFlags);
  assert.equal(result.complete, true);
  return {
    firstName: "Audit Visitor", email: "audit@example.com", company: "Example Co", consent: true, locale: "en",
    context: { role: "owner", employeeBand: "1-9", revenueBand: "under-1m", primaryOutcome: "growth" },
    result: { ...result, answers, redFlags },
    attribution: { landingPath: "/blog/start", submissionPath: "/data-audit", source: "data-audit", context: result.complete ? result.ctaRoute : undefined },
  };
}

test.after(() => {
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});

test("actual contact route sanitizes attribution and binds it to the form kind", async () => {
  requests.length = 0;
  const response = await contactPost(request("/api/contact", {
    name: "Visitor", email: "visitor@example.com", message: "Hello", source: "contact",
    attribution: { landingPath: "/blog/start?secret=yes", submissionPath: "/contact#form", source: "contact", referralHost: "Search.Example" },
  }));
  assert.equal(response.status, 200);
  const bodies = requests.map((entry) => entry.body).join("\n");
  assert.match(bodies, /Landing path: \/blog\/start/u);
  assert.match(bodies, /Referral host: search\.example/u);
  assert.doesNotMatch(bodies, /secret=yes|#form|gtag|analytics/u);

  const before = requests.length;
  const spoofed = await contactPost(request("/api/contact", {
    name: "Visitor", email: "visitor@example.com", message: "Hello", source: "services",
    attribution: { landingPath: "/", submissionPath: "/services", source: "contact" },
  }));
  assert.equal(spoofed.status, 400);
  assert.equal(requests.length, before);
});

test("actual services and data-audit submissions persist sanitized attribution without analytics", async () => {
  requests.length = 0;
  const services = await contactPost(request("/api/contact", {
    name: "Service Visitor", email: "service@example.com", message: "Help", source: "services", service: "analytics",
    attribution: { landingPath: "/services", submissionPath: "/services", source: "services" },
  }));
  assert.equal(services.status, 200);

  const audit = await dataAuditPost(request("/api/data-audit", validAuditBody()));
  assert.equal(audit.status, 200);
  const bodies = requests.map((entry) => entry.body).join("\n");
  assert.match(bodies, /Form kind: services/u);
  assert.match(bodies, /Form kind: data-audit/u);
  assert.doesNotMatch(bodies, /inquiry_completed|landing_path_class|submission_path_class/u);
});

test("data-audit rejects malformed attribution before writes", async () => {
  requests.length = 0;
  const body = validAuditBody();
  body.attribution = { landingPath: "https://evil.example/start", submissionPath: "/data-audit", source: "data-audit", context: body.attribution.context };
  const response = await dataAuditPost(request("/api/data-audit", body));
  assert.equal(response.status, 400);
  assert.equal(requests.length, 0);
});

test("data-audit storage failure returns 500 without sending email", async () => {
  requests.length = 0;
  failSupabaseWrites = true;
  try {
    const response = await dataAuditPost(request("/api/data-audit", validAuditBody()));
    assert.equal(response.status, 500);
    assert.equal(requests.filter((entry) => entry.url.startsWith("https://local-verification.invalid/")).length, 1);
    assert.equal(requests.some((entry) => entry.url === "https://api.resend.com/emails"), false);
  } finally {
    failSupabaseWrites = false;
  }
});
