import assert from "node:assert/strict";
import test from "node:test";
import {
  browserInquiryAttribution,
  completionAnalyticsPayload,
  formatAttributionLines,
  normalizeLocalPath,
  parseInquiryAttribution,
  readOrCreateLandingAttribution,
  readOrCreateLandingPath,
  referralHostFromUrl,
  trackInquiryCompletion,
} from "./inquiry-attribution";

test("attribution accepts bounded first-party paths and strips query and hash", () => {
  assert.equal(normalizeLocalPath("/tr/services?email=private@example.com#form"), "/tr/services");
  assert.deepEqual(parseInquiryAttribution({
    landingPath: "/blog/example?campaign=secret",
    submissionPath: "/contact#form",
    source: "contact",
    referralHost: "Example.COM",
  }), { landingPath: "/blog/example", submissionPath: "/contact", source: "contact", referralHost: "example.com" });
});

test("attribution rejects external, spoofed, and oversized values", () => {
  assert.equal(normalizeLocalPath("https://evil.example/contact"), null);
  assert.equal(parseInquiryAttribution({ landingPath: "/", submissionPath: "/contact", source: "admin" }), null);
  assert.equal(parseInquiryAttribution({ landingPath: `/${"a".repeat(200)}`, submissionPath: "/contact", source: "contact" }), null);
  assert.equal(parseInquiryAttribution({ landingPath: "/", submissionPath: "/contact", source: "contact", referralHost: "https://evil.example/x" }), null);
  assert.equal(normalizeLocalPath("/contact\u0000hidden"), null);
  assert.equal(normalizeLocalPath("//evil.example/contact"), null);
  assert.equal(normalizeLocalPath("javascript:alert(1)"), null);
});

test("first external referral survives full navigation and internal referrers", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.deepEqual(readOrCreateLandingAttribution(storage, "/blog/start", "https://search.example/results?q=private"), {
    landingPath: "/blog/start", referralHost: "search.example",
  });
  assert.deepEqual(readOrCreateLandingAttribution(storage, "/contact", "https://johnserra.com/blog/start"), {
    landingPath: "/blog/start", referralHost: "search.example",
  });
});

test("first landing survives navigation and storage failures degrade safely", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(readOrCreateLandingPath(storage, "/blog/start"), "/blog/start");
  assert.equal(readOrCreateLandingPath(storage, "/contact"), "/blog/start");
  const disabled = { getItem(): string | null { throw new Error("disabled"); }, setItem(): void { throw new Error("disabled"); } };
  assert.equal(readOrCreateLandingPath(disabled, "/services"), "/services");
});

test("server formatting is marked and referral URLs retain hostname only", () => {
  const attribution = parseInquiryAttribution({ landingPath: "/", submissionPath: "/services", source: "services", referralHost: referralHostFromUrl("https://search.example/path?q=private") });
  assert.ok(attribution);
  const formatted = formatAttributionLines(attribution).join("\n");
  assert.match(formatted, /^\[Attribution\]/u);
  assert.match(formatted, /Referral host: search\.example/u);
  assert.doesNotMatch(formatted, /private|\?q=/u);
});

test("completion analytics overrides automatic URL context with sanitized canonical values", () => {
  const payload = completionAnalyticsPayload({ landingPath: "/blog/private-slug", submissionPath: "/tr/iletisim", source: "contact", referralHost: "example.com", context: "private words" });
  assert.deepEqual(payload, {
    form_kind: "contact", landing_path_class: "blog", submission_path_class: "contact",
    page_location: "https://johnserra.com/tr/iletisim", page_referrer: "",
  });
  assert.doesNotMatch(JSON.stringify(payload), /private|example\.com|@/u);
});

test("actual completion tracker sanitizes dirty browser context and analytics failures are harmless", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const calls: unknown[][] = [];
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "https://johnserra.com/contact?email=visitor@example.com#message", pathname: "/contact" },
      sessionStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } },
      gtag: (...args: unknown[]) => calls.push(args),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { referrer: "https://referrer.example/path?email=other@example.com#private" },
  });
  try {
    trackInquiryCompletion(browserInquiryAttribution("contact"));
    assert.deepEqual(calls, [["event", "inquiry_completed", {
      form_kind: "contact", landing_path_class: "contact", submission_path_class: "contact",
      page_location: "https://johnserra.com/contact", page_referrer: "",
    }]]);
    (globalThis.window as unknown as { gtag: () => never }).gtag = () => { throw new Error("analytics unavailable"); };
    assert.doesNotThrow(() => trackInquiryCompletion({ landingPath: "/", submissionPath: "/contact", source: "contact" }));
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});
