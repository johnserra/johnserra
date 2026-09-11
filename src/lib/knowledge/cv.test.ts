import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CV_PUBLIC_RELATIVE_PATH,
  cvApprovalDigest,
  cvChunks,
  cvMarkdownSha256,
  loadRegisteredCv,
  renderCvMarkdown,
  validateCvDocument,
} from "./cv";
import { processCvIndexingJob, type CvIndexingDependencies } from "./cv-indexer";
import { parseCvSeedArguments, prepareCvSeed } from "./cv-seed";
import { pruneGenuineLegacyRows, type LegacyPruneClient } from "./legacy-prune";

const EVENT_ID = "12345678-1234-1234-1234-123456789abc";

async function rawDocument(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile("content/knowledge/cv.en.json", "utf8")) as Record<string, unknown>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("registered structured CV and public Markdown are in deterministic parity", async () => {
  const document = await loadRegisteredCv();
  const markdown = renderCvMarkdown(document);
  assert.equal(await readFile(CV_PUBLIC_RELATIVE_PATH, "utf8"), markdown);
  assert.equal(cvApprovalDigest(document).length, 64);
  assert.equal(cvMarkdownSha256(markdown).length, 64);
  assert.equal(document.sections.length, 18);
  assert.equal(new Set(document.sections.map((section) => section.id)).size, document.sections.length);
});

test("registered CV loading is independent of the runtime working directory", async () => {
  const originalDirectory = process.cwd();
  process.chdir("/tmp");
  try {
    const document = await loadRegisteredCv();
    assert.equal(document.document_id, "john-serra");
    assert.equal(document.sections.length, 18);
  } finally {
    process.chdir(originalDirectory);
  }
});

test("strict schema rejects unknown/private fields, invalid visibility, URLs, dates, and duplicate IDs", async () => {
  const base = await rawDocument();
  for (const mutate of [
    (value: Record<string, unknown>) => { value.email = "private@example.com"; },
    (value: Record<string, unknown>) => { value.visibility = "private"; },
    (value: Record<string, unknown>) => { value.canonical_url = "https://example.com/cv.md"; },
    (value: Record<string, unknown>) => { ((value.sections as Array<Record<string, unknown>>)[0]).unexpected = true; },
    (value: Record<string, unknown>) => {
      const dates = ((value.sections as Array<Record<string, unknown>>)[1]).dates as Record<string, unknown>;
      (dates.start as Record<string, unknown>).value = "2022-99";
    },
    (value: Record<string, unknown>) => {
      const sections = value.sections as Array<Record<string, unknown>>;
      sections[1].id = sections[0].id;
    },
  ]) {
    const candidate = clone(base);
    mutate(candidate);
    assert.throws(() => validateCvDocument(candidate));
  }
});

test("every short and long semantic section becomes one complete stable chunk", async () => {
  const chunks = cvChunks(await loadRegisteredCv());
  assert.equal(chunks.length, 18);
  assert.ok(chunks.every((chunk) => chunk.chunk_index === 0));
  const short = chunks.find((chunk) => chunk.metadata.section_id === "credential-teaching-practice-certificate");
  assert.match(short?.content ?? "", /Teaching Practice Certificate/);
  assert.match(short?.content ?? "", /September 2018/);
  const long = chunks.find((chunk) => chunk.metadata.section_id === "experience-pagysa-operations-manager");
  assert.match(long?.content ?? "", /ISO 9001/);
  assert.match(long?.content ?? "", /lot-level fruit traceability/);
  assert.match(long?.content ?? "", /sun-dried tomato project/);
  assert.ok(chunks.every((chunk) => chunk.content.includes(`Section: ${chunk.metadata.title}`)));
  assert.ok(chunks.every((chunk) => {
    assert.deepEqual(chunk.metadata.section_path.slice(0, 1), ["CV"]);
    assert.equal(chunk.metadata.section_path.at(-1), chunk.metadata.title);
    assert.equal(chunk.metadata.indexing_config, "cv-indexing-v1");
    assert.equal(chunk.metadata.chunking_config, "cv-section-v1");
    return chunk.metadata.section_path.length === 3;
  }));
});

test("reviewed factual boundaries remain explicit in the canonical source", async () => {
  const markdown = renderCvMarkdown(await loadRegisteredCv());
  for (const expected of [
    "November 2022–present",
    "May 2008–October 2022",
    "technical sales support for export markets",
    "Liaised between prospective buyers and client companies",
    "Engagement: Independent contractor.",
    "INPAK's TS-800",
    "Descriptive title reflecting responsibilities in a family-owned business that did not use formal titles",
    "lot-level fruit traceability",
    "ISO 9001 quality management and HACCP food safety controls",
    "data analytics curriculum planned as an additional offering",
    "Work documented from January 2026; end date unknown",
    "Modular suite documented from February 2026.",
    "Degree designation and attendance or completion dates are omitted pending confirmation.",
    "Proficiency levels remain to be confirmed before inclusion.",
    "Individual course certificates do not establish completion of a broader professional certificate program.",
  ]) assert.ok(markdown.includes(expected), `missing reviewed boundary: ${expected}`);
  assert.doesNotMatch(markdown, /nonprofit|bachelor|master|fluent|native proficiency/i);
});

test("oversized semantic units are rejected rather than truncated", async () => {
  const document = await loadRegisteredCv();
  document.sections[0].paragraphs = ["x".repeat(4_100)];
  assert.throws(() => cvChunks(document), /oversized/);
});

test("approval parsing and hash binding reject missing or mismatched approval before live work", async () => {
  assert.throws(() => parseCvSeedArguments(["--apply"]), /requires --approved-sha256/);
  assert.throws(() => parseCvSeedArguments(["--approved-sha256", "a".repeat(64)]), /only with --apply/);
  const document = await loadRegisteredCv();
  assert.throws(
    () => prepareCvSeed(document, { apply: true, approvedSha256: "0".repeat(64) }),
    /does not match/,
  );
  const digest = cvApprovalDigest(document);
  const prepared = prepareCvSeed(document, { apply: true, approvedSha256: digest });
  assert.equal(prepared.approvalDigest, digest);
  assert.equal(prepared.job?.content_sha256, digest);
});

test("approval binds every canonical field even when the readable Markdown is unchanged", async () => {
  const base = await loadRegisteredCv();
  const approval = cvApprovalDigest(base);
  const markdownDigest = cvMarkdownSha256(renderCvMarkdown(base));
  const organizationOnly = clone(base);
  organizationOnly.sections[1].organization = "Premium Parking (reviewed variant)";
  assert.equal(cvMarkdownSha256(renderCvMarkdown(organizationOnly)), markdownDigest);
  assert.notEqual(cvApprovalDigest(organizationOnly), approval);

  const falseDigestChunks = (cvChunks as unknown as (document: typeof base, supplied: string) => ReturnType<typeof cvChunks>)(base, "0".repeat(64));
  assert.ok(falseDigestChunks.every((chunk) => chunk.metadata.content_sha256 === approval));

  const invalidInjected = clone(base) as typeof base & { unexpected?: boolean };
  invalidInjected.unexpected = true;
  assert.throws(() => cvApprovalDigest(invalidInjected), /unknown field/);
  assert.throws(() => cvChunks(invalidInjected), /unknown field/);
});

test("organization, role, section ID, date semantics, title, and paragraphs invalidate old approval before writes", async () => {
  const base = await loadRegisteredCv();
  const approval = cvApprovalDigest(base);
  const mutations: Array<(document: typeof base) => void> = [
    (document) => { document.sections[1].organization = "Premium Parking (reviewed variant)"; },
    (document) => { document.sections[1].role = "Account Manager (reviewed variant)"; },
    (document) => { document.sections[1].id = "experience-premium-parking-account-manager-reviewed"; },
    (document) => { document.sections.find((section) => section.id === "project-business-development-automation")!.dates.start!.precision = "month"; },
    (document) => { document.sections[1].title = "Account Manager — Premium Parking (reviewed variant)"; },
    (document) => { document.sections[0].paragraphs[0] += " Reviewed variant."; },
  ];

  for (const mutate of mutations) {
    const candidate = clone(base);
    mutate(candidate);
    assert.notEqual(cvApprovalDigest(candidate), approval);
    assert.throws(
      () => prepareCvSeed(candidate, { apply: true, approvedSha256: approval }),
      /does not match/,
    );
    let embeddings = 0;
    let replacements = 0;
    await assert.rejects(() => processCvIndexingJob({
      event_id: EVENT_ID,
      document_type: "cv",
      cv_id: "john-serra",
      locale: "en",
      operation: "upsert",
      content_sha256: approval,
    }, {
      async loadDocument() { return candidate; },
      async embedDocument() { embeddings += 1; return [1]; },
      async replaceCvContext() { replacements += 1; },
    }), /Stale CV indexing job/);
    assert.equal(embeddings, 0);
    assert.equal(replacements, 0);
  }
});

test("invalid and stale CV jobs are rejected before embedding or database calls", async () => {
  const document = await loadRegisteredCv();
  let embeddings = 0;
  let replacements = 0;
  const dependencies: CvIndexingDependencies = {
    async loadDocument() { return document; },
    async embedDocument() { embeddings += 1; return [1]; },
    async replaceCvContext() { replacements += 1; },
  };
  for (const invalid of [
    { document_type: "cv", private_text: "no" },
    { event_id: EVENT_ID, document_type: "cv", cv_id: "unknown", locale: "en", operation: "upsert", content_sha256: "0".repeat(64) },
    { event_id: EVENT_ID, document_type: "cv", cv_id: "john-serra", locale: "tr", operation: "upsert", content_sha256: "0".repeat(64) },
    { event_id: EVENT_ID, document_type: "cv", cv_id: "john-serra", locale: "en", operation: "refresh", content_sha256: "0".repeat(64) },
    { event_id: EVENT_ID, document_type: "cv", cv_id: "john-serra", locale: "en", operation: "upsert", content_sha256: "0".repeat(64), path: "private.md" },
    { event_id: EVENT_ID, document_type: "cv", cv_id: "john-serra", locale: "en", operation: "upsert", content_sha256: "0".repeat(64), url: "https://example.com" },
  ]) await assert.rejects(() => processCvIndexingJob(invalid, dependencies));
  await assert.rejects(() => processCvIndexingJob({
    event_id: EVENT_ID,
    document_type: "cv",
    cv_id: "john-serra",
    locale: "en",
    operation: "upsert",
    content_sha256: "0".repeat(64),
  }, dependencies), /Stale CV indexing job/);
  assert.equal(embeddings, 0);
  assert.equal(replacements, 0);
});

test("duplicate jobs produce identical replacement payloads", async () => {
  const document = await loadRegisteredCv();
  const digest = cvApprovalDigest(document);
  const payloads: string[] = [];
  const dependencies: CvIndexingDependencies = {
    async loadDocument() { return document; },
    async embedDocument(content) { return [content.length]; },
    async replaceCvContext(input) {
      payloads.push(JSON.stringify(input));
    },
  };
  const job = { event_id: EVENT_ID, document_type: "cv", cv_id: "john-serra", locale: "en", operation: "upsert", content_sha256: digest } as const;
  await processCvIndexingJob(job, dependencies);
  await processCvIndexingJob(job, dependencies);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0], payloads[1]);
});

test("replacement failures are surfaced after embedding orchestration", async () => {
  const document = await loadRegisteredCv();
  const digest = cvApprovalDigest(document);
  let replacements = 0;
  const dependencies: CvIndexingDependencies = {
    async loadDocument() { return document; },
    async embedDocument() { return [1]; },
    async replaceCvContext() {
      replacements += 1;
      throw new Error("database replacement failed");
    },
  };
  await assert.rejects(() => processCvIndexingJob({
    event_id: EVENT_ID,
    document_type: "cv",
    cv_id: "john-serra",
    locale: "en",
    operation: "upsert",
    content_sha256: digest,
  }, dependencies), /database replacement failed/);
  assert.equal(replacements, 1);
});

test("legacy pruning narrows deletion so CV rows are not selected", async () => {
  const filters: Array<[string, null]> = [];
  const query = {
    is(column: string, value: null) { filters.push([column, value]); return this; },
    then(resolve: (value: { error: null }) => unknown) { return Promise.resolve(resolve({ error: null })); },
  };
  await pruneGenuineLegacyRows({ from() { return { delete() { return query; } }; } } as unknown as LegacyPruneClient);
  assert.deepEqual(filters, [["wordpress_id", null], ["document_type", null]]);
});
