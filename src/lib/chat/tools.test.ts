import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_TOOL_DECLARATIONS,
  CHAT_TOOL_NAMES,
  createChatToolRegistry,
  dispatchToolCall,
  ToolDispatchError,
  validateToolArguments,
  type ChatToolDataSources,
} from "./tools";
import { CHAT_MAX_TOOL_CALLS, CHAT_TOOL_RESULT_BYTES, utf8ByteLength } from "./limits";
import { withToolDeadline, ChatToolDeadlineError } from "./deadline";

const sources: ChatToolDataSources = {
  async searchKnowledge() {
    return [{ title: "Public project", excerpt: "Published evidence.", url: "https://johnserra.com/projects/demo" }];
  },
  async loadCv() {
    return {
      schema_version: "1.0.0",
      document_id: "john-serra",
      title: "John Serra — Curriculum Vitae",
      locale: "en",
      visibility: "public",
      document_type: "cv",
      authority: "reviewed_public_cv",
      canonical_url: "https://johnserra.com/cv/john-serra.en.md",
      sections: [{
        id: "experience-demo",
        category: "experience",
        title: "Demo role",
        organization: "Demo organization",
        role: "Demo role",
        dates: {
          kind: "interval",
          start: { value: "2020-01", precision: "month" },
          end: null,
          ongoing: true,
          start_unknown: false,
          end_unknown: false,
        },
        locale: "en",
        visibility: "public",
        document_type: "cv",
        authority: "reviewed_public_cv",
        canonical_url: "https://johnserra.com/cv/john-serra.en.md",
        paragraphs: ["Public role details."],
        bullets: ["Public achievement."],
        references: [],
      }],
    };
  },
  async getProject() {
    return {
      slug: "demo",
      format: "mdx" as const,
      content: "Public project details.",
      frontmatter: { title: "Demo project", description: "A public project." },
    };
  },
  async listArticles() {
    return [{
      slug: "article",
      format: "mdx" as const,
      content: "Not returned by list_articles.",
      frontmatter: { title: "Public article", description: "A public article.", date: "2026-01-01" },
    }];
  },
  async getContactOptions() {
    return [{ label: "Contact form", url: "https://johnserra.com/contact", description: "Public form." }];
  },
};

function context(overrides: Partial<Parameters<typeof dispatchToolCall>[2]> = {}) {
  return {
    correlationId: "123e4567-e89b-42d3-a456-426614174000",
    signal: new AbortController().signal,
    completedToolCalls: 0,
    ...overrides,
  };
}

test("the registry exposes exactly the five narrow read-only declarations", () => {
  const registry = createChatToolRegistry(sources);
  assert.deepEqual(CHAT_TOOL_NAMES, [
    "search_knowledge", "get_cv_timeline", "get_project_details", "list_articles", "get_contact_options",
  ]);
  assert.deepEqual(registry.declarations.map((declaration) => declaration.name), [...CHAT_TOOL_NAMES]);
  for (const declaration of CHAT_TOOL_DECLARATIONS) {
    const schema = declaration.parametersJsonSchema as Record<string, unknown>;
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    assert.ok(Array.isArray(schema.required) && schema.required.length > 0);
    assert.ok(declaration.description);
    assert.ok(declaration.responseJsonSchema);
  }
});

test("each tool is dependency-injected, typed, and citation-bearing", async () => {
  const registry = createChatToolRegistry(sources);
  const cases = [
    { name: "search_knowledge", args: { query: "demo", locale: "en" } },
    { name: "get_cv_timeline", args: { locale: "en" } },
    { name: "get_project_details", args: { slug: "demo", locale: "en" } },
    { name: "list_articles", args: { locale: "tr" } },
    { name: "get_contact_options", args: { locale: "en" } },
  ] as const;
  for (const [index, request] of cases.entries()) {
    const result = await dispatchToolCall(registry, request, context({ completedToolCalls: index }));
    assert.equal(result.name, request.name);
    assert.ok(result.outputBytes > 0);
    assert.ok(Array.isArray((result.result as { citations: unknown[] }).citations));
  }
});

test("project citations use the localized public project route", async () => {
  const result = await dispatchToolCall(createChatToolRegistry(sources), {
    name: "get_project_details",
    args: { slug: "demo", locale: "tr" },
  }, context());
  const project = (result.result as { project: { citation: { url: string } } }).project;
  assert.equal(project.citation.url, "https://johnserra.com/tr/projeler/demo");
});

test("accepted search results expose only bounded retrieval metadata to the trace path", async () => {
  const accepted = await dispatchToolCall(createChatToolRegistry(sources), {
    name: "search_knowledge",
    args: { query: "demo", locale: "en" },
  }, context());
  assert.deepEqual(accepted.retrieval, {
    resultCount: 1,
    candidateCount: null,
    noContext: false,
  });
});

test("unknown, missing, extra, and wrong-type arguments reject without dispatch", async () => {
  let calls = 0;
  const registry = createChatToolRegistry({
    ...sources,
    async searchKnowledge() { calls += 1; return []; },
  });
  assert.equal(validateToolArguments("search_knowledge", { query: "x", locale: "en", hostile: "marker" }), null);
  assert.equal(validateToolArguments("search_knowledge", { locale: "en" }), null);
  assert.equal(validateToolArguments("search_knowledge", { query: 42, locale: "en" }), null);
  for (const call of [
    { name: "not_allowed", args: { query: "x", locale: "en" } },
    { name: "search_knowledge", args: { locale: "en" } },
    { name: "search_knowledge", args: { query: 42, locale: "en" } },
    { name: "search_knowledge", args: { query: "x", locale: "en", extra: true } },
  ]) {
    await assert.rejects(
      dispatchToolCall(registry, call, context()),
      (error: unknown) => error instanceof ToolDispatchError && ["unknown_tool", "invalid_arguments"].includes(error.category),
    );
  }
  assert.equal(calls, 0);
});

test("list_articles validates legacy and bounded pagination arguments", () => {
  assert.deepEqual(validateToolArguments("list_articles", { locale: "en" }), { locale: "en" });
  assert.deepEqual(validateToolArguments("list_articles", { locale: "tr", limit: 7, offset: 2 }), { locale: "tr", limit: 7, offset: 2 });
  assert.deepEqual(validateToolArguments("list_articles", { locale: "en", limit: 3, cursor: "v1.YXJ0aWNsZS0wMDk" }), { locale: "en", limit: 3, cursor: "v1.YXJ0aWNsZS0wMDk" });
  for (const args of [
    { locale: "en", limit: 0 },
    { locale: "en", limit: 51 },
    { locale: "en", offset: -1 },
    { locale: "en", offset: 10_001 },
    { locale: "en", cursor: "bad cursor" },
    { locale: "en", cursor: "article", offset: 0 },
    { locale: "en", extra: true },
  ]) assert.equal(validateToolArguments("list_articles", args), null);
});

test("list_articles traverses a large catalog without omissions or duplicates", async () => {
  const catalog = Array.from({ length: 123 }, (_, index) => ({
    slug: `article-${String(index).padStart(3, "0")}`,
    format: "mdx" as const,
    content: "Private body is not returned.",
    frontmatter: { title: `Article ${index}`, description: `Summary ${index}`, date: "2026-01-01" },
  })).reverse();
  const registry = createChatToolRegistry({ ...sources, async listArticles() { return catalog; } });
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const accepted = await dispatchToolCall(registry, {
      name: "list_articles",
      args: { locale: "en", limit: 17, ...(cursor ? { cursor } : {}) },
    }, context());
    const page = accepted.result;
    assert.equal(page.kind, "list_articles");
    if (page.kind !== "list_articles") throw new Error("unexpected result");
    assert.equal(page.total, catalog.length);
    assert.deepEqual(page.citations, page.articles.map((article) => article.citation));
    seen.push(...page.articles.map((article) => article.slug));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(new Set(seen).size, catalog.length);
  assert.deepEqual(seen, [...catalog].sort((a, b) => a.slug.localeCompare(b.slug)).map((item) => item.slug));
});

test("list_articles returns empty/final pages and update-stable keyset continuation", async () => {
  let catalog = ["bravo", "delta", "foxtrot"].map((slug) => ({
    slug, format: "mdx" as const, content: "", frontmatter: { title: slug },
  }));
  const registry = createChatToolRegistry({ ...sources, async listArticles() { return catalog; } });
  const first = await dispatchToolCall(registry, { name: "list_articles", args: { locale: "en", limit: 2 } }, context());
  assert.equal(first.result.kind, "list_articles");
  if (first.result.kind !== "list_articles") throw new Error("unexpected result");
  assert.equal(first.result.nextCursor, "v1.ZGVsdGE");
  catalog = [{ slug: "alpha", format: "mdx" as const, content: "", frontmatter: { title: "alpha" } }, ...catalog];
  const final = await dispatchToolCall(registry, { name: "list_articles", args: { locale: "en", cursor: "v1.ZGVsdGE" } }, context());
  assert.equal(final.result.kind, "list_articles");
  if (final.result.kind !== "list_articles") throw new Error("unexpected result");
  assert.deepEqual(final.result.articles.map((article) => article.slug), ["foxtrot"]);
  assert.equal(final.result.nextCursor, null);
  const empty = await dispatchToolCall(registry, { name: "list_articles", args: { locale: "en", offset: 99 } }, context());
  assert.equal(empty.result.kind, "list_articles");
  if (empty.result.kind !== "list_articles") throw new Error("unexpected result");
  assert.deepEqual(empty.result.articles, []);
  assert.equal(empty.result.nextCursor, null);
});

test("list_articles cursors round-trip Unicode and percent-encoded slugs", async () => {
  const catalog = ["alpha", "makine-öğrenmesi", "percent%2Fencoded", "中文-文章"].map((slug) => ({
    slug, format: "mdx" as const, content: "", frontmatter: { title: slug },
  }));
  const registry = createChatToolRegistry({ ...sources, async listArticles() { return catalog; } });
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await dispatchToolCall(registry, { name: "list_articles", args: { locale: "en", limit: 1, ...(cursor ? { cursor } : {}) } }, context());
    assert.equal(page.result.kind, "list_articles");
    if (page.result.kind !== "list_articles") throw new Error("unexpected result");
    seen.push(...page.result.articles.map((article) => article.slug));
    cursor = page.result.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, [...catalog].sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0).map((item) => item.slug));
  assert.equal(validateToolArguments("list_articles", { locale: "en", cursor: "v1.not canonical!" }), null);
});

test("list_articles compacts multibyte metadata and paginates within the dispatch budget", async () => {
  const catalog = Array.from({ length: 60 }, (_, index) => ({
    slug: `long-${String(index).padStart(3, "0")}`,
    format: "mdx" as const,
    content: "",
    frontmatter: { title: `🙂${"界".repeat(800)}`, description: `ö${"🙂".repeat(2_000)}` },
  }));
  const registry = createChatToolRegistry({ ...sources, async listArticles() { return catalog; } });
  const accepted = await dispatchToolCall(registry, { name: "list_articles", args: { locale: "en", limit: 50 } }, context());
  assert.equal(accepted.result.kind, "list_articles");
  if (accepted.result.kind !== "list_articles") throw new Error("unexpected result");
  assert.ok(accepted.result.articles.length > 0 && accepted.result.articles.length < 50);
  assert.ok(accepted.result.nextCursor);
  assert.ok(accepted.outputBytes <= CHAT_TOOL_RESULT_BYTES.list_articles);
  assert.ok(accepted.result.articles.every((article) => !article.title.includes("\uFFFD") && !article.summary?.includes("\uFFFD")));
});

test("tool execution logs contain stable metadata only", async () => {
  const marker = "HOSTILE_ARGUMENT_RESULT_ERROR_MARKER";
  const lines: string[] = [];
  const registry = createChatToolRegistry({
    ...sources,
    async searchKnowledge() {
      throw new Error(marker);
    },
  });
  await assert.rejects(dispatchToolCall(registry, {
    name: "search_knowledge",
    args: { query: marker, locale: "en" },
  }, context({ logger: { info(line) { lines.push(line); } } })));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes(marker), false);
  const event = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.deepEqual(Object.keys(event).sort(), ["correlationId", "durationMs", "event", "outcome", "outputBytes", "schemaVersion", "tool"]);
  assert.equal(event.tool, "search_knowledge");
  assert.equal(event.outputBytes, 0);
});

test("ignored aborts settle at the tool deadline and caller cancellation propagates", async () => {
  await assert.rejects(
    withToolDeadline(() => new Promise<never>(() => {}), { deadlineMs: 10 }),
    (error: unknown) => error instanceof ChatToolDeadlineError,
  );
  const controller = new AbortController();
  const pending = withToolDeadline((signal) => new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }), { deadlineMs: 1_000, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /aborted/i);
});

test("UTF-8 response caps and total call caps fail closed", async () => {
  const registry = createChatToolRegistry({
    ...sources,
    async getContactOptions() {
      return Array.from({ length: 3 }, () => ({
        label: "Contact form",
        url: "https://johnserra.com/contact",
        description: "public ".repeat(140),
      }));
    },
  });
  assert.ok(utf8ByteLength("é") > 1);
  await assert.rejects(
    dispatchToolCall(registry, { name: "get_contact_options", args: { locale: "en" } }, context()),
    (error: unknown) => error instanceof ToolDispatchError && error.category === "result_too_large",
  );
  await assert.rejects(
    dispatchToolCall(createChatToolRegistry(sources), { name: "get_contact_options", args: { locale: "en" } }, context({ completedToolCalls: CHAT_MAX_TOOL_CALLS })),
    (error: unknown) => error instanceof ToolDispatchError && error.category === "call_limit",
  );
});
