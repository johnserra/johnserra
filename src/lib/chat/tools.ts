import type { FunctionCall, FunctionDeclaration } from "@google/genai";
import type { Locale } from "@/types";
import { projectsPath } from "@/lib/routes";
import type { SiteContentItem } from "@/lib/site-content";
import type { CvDocument } from "@/lib/knowledge/cv";
import { CV_CANONICAL_URL } from "@/lib/knowledge/cv";
import type { ChatRetrievalObservation } from "./core";
import { ChatToolDeadlineError, withToolDeadline } from "./deadline";
import {
  CHAT_MAX_TOOL_CALLS,
  CHAT_TOOL_DEADLINES_MS,
  CHAT_TOOL_RESULT_BYTES,
  utf8ByteLength,
} from "./limits";

export const CHAT_TOOL_NAMES = [
  "search_knowledge",
  "get_cv_timeline",
  "get_project_details",
  "list_articles",
  "get_contact_options",
] as const;

export type ChatToolName = typeof CHAT_TOOL_NAMES[number];

export interface ToolCitation {
  title: string;
  url: string;
}

export interface SearchKnowledgeMatch {
  title: string;
  excerpt: string;
  url: string;
}

export interface SearchKnowledgeResult {
  kind: "search_knowledge";
  evidence: SearchKnowledgeMatch[];
  citations: ToolCitation[];
}

export interface CvTimelineEntry {
  category: string;
  title: string;
  organization: string | null;
  role: string | null;
  dates: string | null;
  details: string[];
  references: ToolCitation[];
}

export interface CvTimelineResult {
  kind: "get_cv_timeline";
  authority: "reviewed_public_cv";
  title: string;
  entries: CvTimelineEntry[];
  citations: ToolCitation[];
}

export interface ProjectDetailsResult {
  kind: "get_project_details";
  project: {
    title: string;
    slug: string;
    summary: string | null;
    details: string;
    citation: ToolCitation;
  };
  citations: ToolCitation[];
}

export interface ArticleSummary {
  title: string;
  slug: string;
  summary: string | null;
  date: string | null;
  citation: ToolCitation;
}

export interface ArticleListResult {
  kind: "list_articles";
  articles: ArticleSummary[];
  citations: ToolCitation[];
}

export interface ContactOption {
  label: string;
  url: string;
  description: string;
}

export interface ContactOptionsResult {
  kind: "get_contact_options";
  options: ContactOption[];
  citations: ToolCitation[];
}

export type ChatToolResult =
  | SearchKnowledgeResult
  | CvTimelineResult
  | ProjectDetailsResult
  | ArticleListResult
  | ContactOptionsResult;

export interface ChatToolDataSources {
  searchKnowledge(args: { query: string; locale: Locale }, signal: AbortSignal): Promise<readonly SearchKnowledgeMatch[]>;
  loadCv(signal: AbortSignal): Promise<CvDocument>;
  getProject(slug: string, locale: Locale, signal: AbortSignal): Promise<SiteContentItem | null>;
  listArticles(locale: Locale, signal: AbortSignal): Promise<readonly SiteContentItem[]>;
  getContactOptions(locale: Locale, signal: AbortSignal): Promise<readonly ContactOption[]>;
}

export interface ToolExecutionLogger {
  info(message: string): void;
}

export interface ToolRegistry {
  readonly declarations: readonly FunctionDeclaration[];
  readonly handlers: Readonly<Record<ChatToolName, (args: ToolArguments, signal: AbortSignal) => Promise<ChatToolResult>>>;
}

export type ToolArguments =
  | { query: string; locale: Locale }
  | { locale: Locale }
  | { slug: string; locale: Locale };

export type ToolFailureCategory =
  | "unknown_tool"
  | "invalid_arguments"
  | "call_limit"
  | "timeout"
  | "cancelled"
  | "handler_failure"
  | "result_too_large"
  | "invalid_result"
  | "all_tools_failed"
  | "unexpected_follow_on";

const SAFE_FAILURE_MESSAGES: Record<ToolFailureCategory, string> = {
  unknown_tool: "The requested tool is not available.",
  invalid_arguments: "The requested tool arguments are invalid.",
  call_limit: "Too many tool calls were requested.",
  timeout: "The requested information took too long to load.",
  cancelled: "The tool request was cancelled.",
  handler_failure: "The requested information is temporarily unavailable.",
  result_too_large: "The requested information was too large to return.",
  invalid_result: "The requested information could not be safely returned.",
  all_tools_failed: "The requested information is temporarily unavailable.",
  unexpected_follow_on: "The assistant could not complete that request.",
};

export class ToolDispatchError extends Error {
  override name = "ToolDispatchError";
  readonly code = "TOOL_ERROR" as const;

  constructor(readonly category: ToolFailureCategory) {
    super(SAFE_FAILURE_MESSAGES[category]);
  }

  get safeMessage(): string {
    return SAFE_FAILURE_MESSAGES[this.category];
  }
}

const localeSchema = { type: "string", enum: ["en", "tr"] } as const;
const exactObject = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const CITATION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 500 },
    url: { type: "string", pattern: "^https://johnserra\\.com(?:/|$)", maxLength: 2_000 },
  },
  required: ["title", "url"],
  additionalProperties: false,
};

const SEARCH_MATCH_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 500 },
    excerpt: { type: "string", maxLength: 12_000 },
    url: { type: "string", pattern: "^https://johnserra\\.com(?:/|$)", maxLength: 2_000 },
  },
  required: ["title", "excerpt", "url"],
  additionalProperties: false,
};

const CV_ENTRY_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", minLength: 1, maxLength: 100 },
    title: { type: "string", minLength: 1, maxLength: 500 },
    organization: { type: ["string", "null"], maxLength: 500 },
    role: { type: ["string", "null"], maxLength: 500 },
    dates: { type: ["string", "null"], maxLength: 200 },
    details: { type: "array", items: { type: "string", maxLength: 12_000 } },
    references: { type: "array", items: CITATION_SCHEMA },
  },
  required: ["category", "title", "organization", "role", "dates", "details", "references"],
  additionalProperties: false,
};

const PROJECT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 500 },
    slug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", minLength: 1, maxLength: 100 },
    summary: { type: ["string", "null"], maxLength: 2_000 },
    details: { type: "string", maxLength: 12_000 },
    citation: CITATION_SCHEMA,
  },
  required: ["title", "slug", "summary", "details", "citation"],
  additionalProperties: false,
};

const ARTICLE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 500 },
    slug: { type: "string", minLength: 1, maxLength: 100 },
    summary: { type: ["string", "null"], maxLength: 2_000 },
    date: { type: ["string", "null"], maxLength: 100 },
    citation: CITATION_SCHEMA,
  },
  required: ["title", "slug", "summary", "date", "citation"],
  additionalProperties: false,
};

const CONTACT_OPTION_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", minLength: 1, maxLength: 200 },
    url: { type: "string", pattern: "^(?:https://johnserra\\.com(?:/|$)|https://linkedin\\.com/in/johnserra$|mailto:john@serra\\.us$)", maxLength: 2_000 },
    description: { type: "string", minLength: 1, maxLength: 1_000 },
  },
  required: ["label", "url", "description"],
  additionalProperties: false,
};

const SEARCH_RESULT_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["search_knowledge"] },
    evidence: { type: "array", items: SEARCH_MATCH_SCHEMA },
    citations: { type: "array", items: CITATION_SCHEMA },
  },
  required: ["kind", "evidence", "citations"],
  additionalProperties: false,
};

const CV_RESULT_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["get_cv_timeline"] },
    authority: { type: "string", enum: ["reviewed_public_cv"] },
    title: { type: "string", minLength: 1, maxLength: 500 },
    entries: { type: "array", items: CV_ENTRY_SCHEMA },
    citations: { type: "array", items: CITATION_SCHEMA },
  },
  required: ["kind", "authority", "title", "entries", "citations"],
  additionalProperties: false,
};

const PROJECT_RESULT_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["get_project_details"] },
    project: PROJECT_SCHEMA,
    citations: { type: "array", items: CITATION_SCHEMA },
  },
  required: ["kind", "project", "citations"],
  additionalProperties: false,
};

const ARTICLES_RESULT_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["list_articles"] },
    articles: { type: "array", items: ARTICLE_SCHEMA },
    citations: { type: "array", items: CITATION_SCHEMA },
  },
  required: ["kind", "articles", "citations"],
  additionalProperties: false,
};

const CONTACT_RESULT_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["get_contact_options"] },
    options: { type: "array", items: CONTACT_OPTION_SCHEMA },
    citations: { type: "array", items: CITATION_SCHEMA },
  },
  required: ["kind", "options", "citations"],
  additionalProperties: false,
};

export interface SafeToolFailureResponse {
  error: {
    type: "tool_error";
    category: "timeout" | "handler_failure" | "result_too_large" | "invalid_result";
    retryable: boolean;
  };
}

export type DegradableToolFailureCategory = SafeToolFailureResponse["error"]["category"];

const DEGRADABLE_TOOL_FAILURES: readonly DegradableToolFailureCategory[] = [
  "timeout",
  "handler_failure",
  "result_too_large",
  "invalid_result",
];

export function isDegradableToolFailureCategory(category: ToolFailureCategory): category is DegradableToolFailureCategory {
  return DEGRADABLE_TOOL_FAILURES.includes(category as DegradableToolFailureCategory);
}

export function safeToolFailureResponse(category: DegradableToolFailureCategory): SafeToolFailureResponse {
  return {
    error: {
      type: "tool_error",
      category,
      retryable: category === "timeout" || category === "handler_failure",
    },
  };
}

export const CHAT_TOOL_DECLARATIONS: readonly FunctionDeclaration[] = [
  {
    name: "search_knowledge",
    description: "Search John's reviewed public knowledge for evidence needed to answer a specific question.",
    parametersJsonSchema: exactObject({ query: { type: "string", minLength: 1, maxLength: 2_000 }, locale: localeSchema }, ["query", "locale"]),
    responseJsonSchema: SEARCH_RESULT_SCHEMA,
  },
  {
    name: "get_cv_timeline",
    description: "Read the reviewed public CV timeline for documented professional history; never use private source data.",
    parametersJsonSchema: exactObject({ locale: localeSchema }, ["locale"]),
    responseJsonSchema: CV_RESULT_SCHEMA,
  },
  {
    name: "get_project_details",
    description: "Read bounded public details for one published project by its public slug.",
    parametersJsonSchema: exactObject({ slug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 100 }, locale: localeSchema }, ["slug", "locale"]),
    responseJsonSchema: PROJECT_RESULT_SCHEMA,
  },
  {
    name: "list_articles",
    description: "List bounded summaries and canonical URLs for published public articles in the selected locale.",
    parametersJsonSchema: exactObject({ locale: localeSchema }, ["locale"]),
    responseJsonSchema: ARTICLES_RESULT_SCHEMA,
  },
  {
    name: "get_contact_options",
    description: "Describe existing public ways to contact John; this tool never submits a message or sends email.",
    parametersJsonSchema: exactObject({ locale: localeSchema }, ["locale"]),
    responseJsonSchema: CONTACT_RESULT_SCHEMA,
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function locale(value: unknown): Locale | null {
  return value === "en" || value === "tr" ? value : null;
}

function nonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function nullableString(value: unknown, maxLength: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= maxLength);
}

function boundedStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => typeof item === "string" && item.length <= maxLength);
}

function isPublicUrl(value: unknown, allowExternalContactUrls = false): value is string {
  if (typeof value !== "string") return false;
  if (/^https:\/\/johnserra\.com(?:\/[^?#]*)?$/u.test(value)) return true;
  return allowExternalContactUrls && (value === "https://linkedin.com/in/johnserra" || value === "mailto:john@serra.us");
}

function projectSlugFromUrl(value: string): string | null {
  const match = value.match(/^https:\/\/johnserra\.com(?:\/tr\/projeler|\/projects)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u);
  return match?.[1] ?? null;
}

function isCitation(value: unknown, allowExternalContactUrls = false): value is ToolCitation {
  return isRecord(value)
    && exactKeys(value, ["title", "url"])
    && nonEmptyString(value.title, 500)
    && isPublicUrl(value.url, allowExternalContactUrls);
}

function isCitationArray(value: unknown, allowExternalContactUrls = false): value is ToolCitation[] {
  return Array.isArray(value) && value.length <= 50 && value.every((item) => isCitation(item, allowExternalContactUrls));
}

function isSearchMatch(value: unknown): value is SearchKnowledgeMatch {
  return isRecord(value)
    && exactKeys(value, ["title", "excerpt", "url"])
    && nonEmptyString(value.title, 500)
    && typeof value.excerpt === "string"
    && value.excerpt.length <= 12_000
    && isPublicUrl(value.url);
}

function isCvEntry(value: unknown): value is CvTimelineEntry {
  if (!isRecord(value) || !exactKeys(value, ["category", "title", "organization", "role", "dates", "details", "references"])) return false;
  return nonEmptyString(value.category, 100)
    && nonEmptyString(value.title, 500)
    && nullableString(value.organization, 500)
    && nullableString(value.role, 500)
    && nullableString(value.dates, 200)
    && boundedStringArray(value.details, 100, 12_000)
    && isCitationArray(value.references);
}

function isProject(value: unknown): value is ProjectDetailsResult["project"] {
  return isRecord(value)
    && exactKeys(value, ["title", "slug", "summary", "details", "citation"])
    && nonEmptyString(value.title, 500)
    && nonEmptyString(value.slug, 100)
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value.slug)
    && nullableString(value.summary, 2_000)
    && typeof value.details === "string"
    && value.details.length <= 12_000
    && isCitation(value.citation)
    && projectSlugFromUrl(value.citation.url) === value.slug;
}

function isArticle(value: unknown): value is ArticleSummary {
  return isRecord(value)
    && exactKeys(value, ["title", "slug", "summary", "date", "citation"])
    && nonEmptyString(value.title, 500)
    && nonEmptyString(value.slug, 100)
    && nullableString(value.summary, 2_000)
    && nullableString(value.date, 100)
    && isCitation(value.citation);
}

function isContactOption(value: unknown): value is ContactOption {
  return isRecord(value)
    && exactKeys(value, ["label", "url", "description"])
    && nonEmptyString(value.label, 200)
    && isPublicUrl(value.url, true)
    && nonEmptyString(value.description, 1_000);
}

/** Validate the public result contract again after an injected adapter returns. */
export function validateChatToolResult(name: ChatToolName, value: unknown): ChatToolResult | null {
  if (!isRecord(value)) return null;
  if (name === "search_knowledge"
    && exactKeys(value, ["kind", "evidence", "citations"])
    && value.kind === name
    && Array.isArray(value.evidence)
    && value.evidence.length <= 20
    && value.evidence.every(isSearchMatch)
    && isCitationArray(value.citations)) {
    return value as unknown as SearchKnowledgeResult;
  }
  if (name === "get_cv_timeline"
    && exactKeys(value, ["kind", "authority", "title", "entries", "citations"])
    && value.kind === name
    && value.authority === "reviewed_public_cv"
    && nonEmptyString(value.title, 500)
    && Array.isArray(value.entries)
    && value.entries.length <= 100
    && value.entries.every(isCvEntry)
    && isCitationArray(value.citations)) {
    return value as unknown as CvTimelineResult;
  }
  if (name === "get_project_details"
    && exactKeys(value, ["kind", "project", "citations"])
    && value.kind === name
    && isProject(value.project)
    && isCitationArray(value.citations)) {
    return value as unknown as ProjectDetailsResult;
  }
  if (name === "list_articles"
    && exactKeys(value, ["kind", "articles", "citations"])
    && value.kind === name
    && Array.isArray(value.articles)
    && value.articles.length <= 50
    && value.articles.every(isArticle)
    && isCitationArray(value.citations)) {
    return value as unknown as ArticleListResult;
  }
  if (name === "get_contact_options"
    && exactKeys(value, ["kind", "options", "citations"])
    && value.kind === name
    && Array.isArray(value.options)
    && value.options.length <= 20
    && value.options.every(isContactOption)
    && isCitationArray(value.citations, true)) {
    return value as unknown as ContactOptionsResult;
  }
  return null;
}

export function validateToolArguments(name: string, value: unknown): ToolArguments | null {
  if (!isRecord(value)) return null;
  if (name === "search_knowledge" && exactKeys(value, ["query", "locale"])) {
    const selectedLocale = locale(value.locale);
    return selectedLocale && nonEmptyString(value.query, 2_000)
      ? { query: value.query, locale: selectedLocale }
      : null;
  }
  if (name === "get_project_details" && exactKeys(value, ["slug", "locale"])) {
    const selectedLocale = locale(value.locale);
    return selectedLocale && nonEmptyString(value.slug, 100) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)
      ? { slug: value.slug, locale: selectedLocale }
      : null;
  }
  if ((name === "get_cv_timeline" || name === "list_articles" || name === "get_contact_options") && exactKeys(value, ["locale"])) {
    const selectedLocale = locale(value.locale);
    return selectedLocale ? { locale: selectedLocale } : null;
  }
  return null;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Stable identity for a validated call; provider IDs and object key order are excluded. */
export function canonicalToolCallIdentity(call: FunctionCall): string | null {
  const name = typeof call.name === "string" && CHAT_TOOL_NAMES.includes(call.name as ChatToolName)
    ? call.name as ChatToolName
    : null;
  if (!name) return null;
  const args = validateToolArguments(name, call.args);
  if (!args) return null;
  const normalizedArgs = "query" in args
    ? { ...args, query: args.query.trim() }
    : "slug" in args
      ? { ...args, slug: args.slug.trim() }
      : args;
  return `${name}:${stableSerialize(normalizedArgs)}`;
}

function canonicalSiteUrl(localeValue: Locale, section: "projects" | "blog" | "contact", slug?: string): string {
  const prefix = localeValue === "tr" ? "/tr" : "";
  if (section === "projects") return `https://johnserra.com${prefix}${projectsPath(localeValue, slug)}`;
  return `https://johnserra.com${prefix}/${section}${slug ? `/${slug}` : ""}`;
}

function titleFor(item: SiteContentItem): string {
  return item.frontmatter.title.trim() || "Public source";
}

function summaryFor(item: SiteContentItem): string | null {
  return typeof item.frontmatter.description === "string" && item.frontmatter.description.trim()
    ? item.frontmatter.description.trim()
    : null;
}

export function createChatToolRegistry(sources: ChatToolDataSources): ToolRegistry {
  const handlers: ToolRegistry["handlers"] = {
    async search_knowledge(args, signal) {
      if (!("query" in args)) throw new ToolDispatchError("invalid_arguments");
      const matches = await sources.searchKnowledge(args, signal);
      const evidence = matches.slice(0, 20).map((match) => ({
        title: match.title,
        excerpt: match.excerpt,
        url: match.url,
      }));
      return {
        kind: "search_knowledge",
        evidence,
        citations: evidence.map(({ title, url }) => ({ title, url })),
      };
    },
    async get_cv_timeline(_args, signal) {
      const document = await sources.loadCv(signal);
      const citations = [{ title: document.title, url: CV_CANONICAL_URL }];
      const entries = document.sections.map((section) => ({
        category: section.category,
        title: section.title,
        organization: section.organization,
        role: section.role,
        dates: formatCvDatesSafely(section.dates),
        details: [...section.paragraphs, ...section.bullets],
        references: section.references.map((reference) => ({ title: reference.label, url: reference.url })),
      }));
      return { kind: "get_cv_timeline", authority: "reviewed_public_cv", title: document.title, entries, citations };
    },
    async get_project_details(args, signal) {
      if (!("slug" in args)) throw new ToolDispatchError("invalid_arguments");
      const item = await sources.getProject(args.slug, args.locale, signal);
      if (!item) throw new ToolDispatchError("handler_failure");
      const citation = { title: titleFor(item), url: canonicalSiteUrl(args.locale, "projects", item.slug) };
      return {
        kind: "get_project_details",
        project: {
          title: citation.title,
          slug: item.slug,
          summary: summaryFor(item),
          details: item.content,
          citation,
        },
        citations: [citation],
      };
    },
    async list_articles(args, signal) {
      const items = (await sources.listArticles(args.locale, signal)).slice(0, 50);
      const articles = items.map((item) => ({
        title: titleFor(item),
        slug: item.slug,
        summary: summaryFor(item),
        date: typeof item.frontmatter.date === "string" ? item.frontmatter.date : null,
        citation: { title: titleFor(item), url: canonicalSiteUrl(args.locale, "blog", item.slug) },
      }));
      return { kind: "list_articles", articles, citations: articles.map((article) => article.citation) };
    },
    async get_contact_options(args, signal) {
      const options = await sources.getContactOptions(args.locale, signal);
      const citation = { title: "Contact John Serra", url: canonicalSiteUrl(args.locale, "contact") };
      return { kind: "get_contact_options", options: [...options], citations: [citation] };
    },
  };
  return { declarations: CHAT_TOOL_DECLARATIONS, handlers };
}

function formatCvDatesSafely(value: CvDocument["sections"][number]["dates"]): string | null {
  if (value.kind === "undated") return null;
  if (value.kind === "issued") return value.start ? `Issued ${value.start.value}` : null;
  const start = value.start?.value ?? "start date unknown";
  if (value.ongoing) return `${start}–present`;
  return `${start}–${value.end?.value ?? "end date unknown"}`;
}

function logToolExecution(
  logger: ToolExecutionLogger | undefined,
  correlationId: string,
  tool: ChatToolName | "unknown",
  outcome: string,
  durationMs: number,
  outputBytes: number,
): void {
  try {
    logger?.info(JSON.stringify({
      event: "chat_tool_execution",
      schemaVersion: 1,
      correlationId,
      tool,
      outcome,
      durationMs: Math.max(0, Math.round(durationMs)),
      outputBytes: Math.max(0, outputBytes),
    }));
  } catch {
    // Tool telemetry must never change the response path.
  }
}

export interface ToolDispatchContext {
  correlationId: string;
  signal: AbortSignal;
  completedToolCalls: number;
  logger?: ToolExecutionLogger;
}

export interface AcceptedToolExecution {
  name: ChatToolName;
  id?: string;
  result: ChatToolResult;
  outputBytes: number;
  retrieval?: ChatRetrievalObservation;
}

export function summarizeAcceptedToolResult(result: ChatToolResult): {
  kind: ChatToolResult["kind"];
  resultCount: number;
  citationCount: number;
} {
  let resultCount = 0;
  if (result.kind === "search_knowledge") resultCount = result.evidence.length;
  if (result.kind === "get_cv_timeline") resultCount = result.entries.length;
  if (result.kind === "get_project_details") resultCount = 1;
  if (result.kind === "list_articles") resultCount = result.articles.length;
  if (result.kind === "get_contact_options") resultCount = result.options.length;
  return { kind: result.kind, resultCount, citationCount: result.citations.length };
}

export async function dispatchToolCall(
  registry: ToolRegistry,
  call: FunctionCall,
  context: ToolDispatchContext,
): Promise<AcceptedToolExecution> {
  const startedAt = Date.now();
  let logged = false;
  const name = typeof call.name === "string" && CHAT_TOOL_NAMES.includes(call.name as ChatToolName)
    ? call.name as ChatToolName
    : null;
  const logFailure = (category: ToolFailureCategory, bytes = 0): never => {
    logged = true;
    logToolExecution(context.logger, context.correlationId, name ?? "unknown", category, Date.now() - startedAt, bytes);
    throw new ToolDispatchError(category);
  };

  if (!name) return logFailure("unknown_tool");
  if (context.completedToolCalls >= CHAT_MAX_TOOL_CALLS) return logFailure("call_limit");
  const args = validateToolArguments(name, call.args);
  if (!args) return logFailure("invalid_arguments");

  try {
    const result = await withToolDeadline(
      (signal) => registry.handlers[name](args, signal),
      { deadlineMs: CHAT_TOOL_DEADLINES_MS[name], signal: context.signal },
    );
    const validatedResult = validateChatToolResult(name, result);
    if (!validatedResult) return logFailure("invalid_result");
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(validatedResult);
    } catch {
      return logFailure("invalid_result");
    }
    if (typeof serialized !== "string") return logFailure("invalid_result");
    const outputBytes = utf8ByteLength(serialized);
    if (outputBytes > CHAT_TOOL_RESULT_BYTES[name]) return logFailure("result_too_large", outputBytes);
    const accepted = JSON.parse(serialized) as ChatToolResult;
    logToolExecution(context.logger, context.correlationId, name, "success", Date.now() - startedAt, outputBytes);
    const retrieval = accepted.kind === "search_knowledge"
      ? {
        resultCount: accepted.evidence.length,
        candidateCount: null,
        noContext: accepted.evidence.length === 0,
      }
      : undefined;
    return {
      name,
      ...(call.id ? { id: call.id } : {}),
      result: accepted,
      outputBytes,
      ...(retrieval ? { retrieval } : {}),
    };
  } catch (error) {
    if (error instanceof ToolDispatchError) {
      if (!logged) logToolExecution(context.logger, context.correlationId, name, error.category, Date.now() - startedAt, 0);
      throw error;
    }
    if (context.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      return logFailure("cancelled");
    }
    if (error instanceof ChatToolDeadlineError) return logFailure("timeout");
    return logFailure("handler_failure");
  }
}

export function isUnexpectedFollowOnFailure(error: unknown): error is ToolDispatchError {
  return error instanceof ToolDispatchError && error.category === "unexpected_follow_on";
}
