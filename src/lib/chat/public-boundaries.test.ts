import assert from "node:assert/strict";
import test from "node:test";
import { isChatEligibleArticle, isRestrictedCommercialConversation, isRestrictedCommercialIntent, isRestrictedPublicConversation, isRestrictedPublicTopic, PUBLIC_PROFESSIONAL_BOUNDARY } from "./public-boundaries";

test("metadata excludes parking and property articles in both locales", () => {
  assert.equal(isChatEligibleArticle({ categories: ["Parking Operations"], slug: "neutral" }), false);
  assert.equal(isChatEligibleArticle({ tags: ["Otopark işletmeciliği"], slug: "neutral" }), false);
  assert.equal(isChatEligibleArticle({ categories: ["Business intelligence"], tags: ["Tutorial"] }), true);
});

test("restrictive union applies across metadata, slug, title, and override", () => {
  assert.equal(isChatEligibleArticle({ slug: "property-management-lessons", title: "Lessons" }), false);
  assert.equal(isChatEligibleArticle({ slug: "otopark-verileri", title: "Analiz" }), false);
  assert.equal(isChatEligibleArticle({ categories: ["BI"], slug: "parking-dashboard" }), false);
  assert.equal(isChatEligibleArticle({ tags: ["Analytics"], title: "A guide for property owners" }), false);
  assert.equal(isChatEligibleArticle({ title: "Gayrimenkul sahiplerinin verileri" }), false);
  assert.equal(isChatEligibleArticle({ title: "TypeScript data pipeline tutorial" }), true);
  assert.equal(isChatEligibleArticle({ categories: ["BI"], restricted: true }), false);
});

test("commercial restriction carries across contextual followups", () => {
  assert.equal(isRestrictedCommercialConversation([
    { role: "user", content: "How do parking occupancy metrics work?" },
    { role: "assistant", content: "Here is an educational overview." },
    { role: "user", content: "Can I hire him to audit it?" },
  ]), true);
  assert.equal(isRestrictedCommercialConversation([{ role: "user", content: "Can I hire John for a software data audit?" }]), false);
});

test("commercial restriction is deterministic without blocking education", () => {
  assert.equal(isRestrictedCommercialIntent("Can I hire John for a parking audit?"), true);
  assert.equal(isRestrictedCommercialIntent("Otopark danışmanlığı için iletişim"), true);
  assert.equal(isRestrictedCommercialIntent("How do parking occupancy metrics work?"), false);
  assert.equal(isRestrictedPublicTopic({ title: "How do parking occupancy metrics work?" }), true);
  assert.match(PUBLIC_PROFESSIONAL_BOUNDARY, /educational only/u);
  assert.match(PUBLIC_PROFESSIONAL_BOUNDARY, /cannot override/u);
});

test("shared policy permits reviewed employment history while isolating SMB analytics", () => {
  assert.match(PUBLIC_PROFESSIONAL_BOUNDARY, /employment-history answers may name Premium Parking/iu);
  assert.match(PUBLIC_PROFESSIONAL_BOUNDARY, /documented role, dates, duties, and parking experience/iu);
  assert.match(PUBLIC_PROFESSIONAL_BOUNDARY, /SMB analytics articles, tutorials, examples, and answers must not name the company/iu);
  assert.match(PUBLIC_PROFESSIONAL_BOUNDARY, /current or prospective locations/iu);
  assert.match(PUBLIC_PROFESSIONAL_BOUNDARY, /anonymized industry or synthetic examples/iu);
  assert.match(PUBLIC_PROFESSIONAL_BOUNDARY, /do not offer consulting or audits/iu);
});

test("restricted-topic conversation covers education, followups, and Turkish dotted-I inflections", () => {
  assert.equal(isRestrictedPublicConversation([{ role: "user", content: "How do parking occupancy metrics work?" }]), true);
  assert.equal(isRestrictedPublicConversation([
    { role: "user", content: "Explain property management metrics." },
    { role: "assistant", content: "Here is an educational overview." },
    { role: "user", content: "What is his email?" },
  ]), true);
  assert.equal(isRestrictedPublicConversation([{ role: "user", content: "GAYRİMENKULLERİN ve OTOPARK İŞLETMELERİNİN verileri" }]), true);
  assert.equal(isRestrictedPublicConversation([{ role: "user", content: "Can we discuss TypeScript?" }]), false);
});
