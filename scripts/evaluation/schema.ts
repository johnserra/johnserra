import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const CASE_SCHEMA_VERSION = "1.0.0";
export const SOURCE_SCHEMA_VERSION = "1.0.0";

export interface EvidenceReference {
  sourceId: string;
  excerptId: string;
}

export interface PatternExpectation {
  id: string;
  patterns: string[];
}

export interface ProhibitedExpectation extends PatternExpectation {
  allowedNegationPatterns: string[];
}

export interface AssistantCase {
  id: string;
  locale: "en" | "tr";
  categories: string[];
  turns: Array<{ user: string }>;
  expectedSourceIds: string[];
  evidenceReferences: EvidenceReference[];
  requiredFacts: PatternExpectation[];
  prohibitedClaims: ProhibitedExpectation[];
  uncertainty: {
    required: boolean;
    patterns: string[];
  };
  citations: {
    required: boolean;
    expectedUrls: string[];
  };
  fixture?: {
    kind: "synthetic_indirect_injection";
    sourceId: string;
    text: string;
    similarity: number;
  };
}

export interface AssistantCaseFile {
  schemaVersion: string;
  corpusVersion: string;
  cases: AssistantCase[];
}

export interface SourceExcerpt {
  id: string;
  text: string;
}

export interface ProfessionalSource {
  sourceId: string;
  wordpressId: number;
  type: "post" | "page" | "js_project";
  slug: string;
  title: string;
  locale: "en" | "tr";
  canonicalUrl: string;
  wordpressModifiedAt: string;
  fetchedAt: string;
  contentHash: string;
  excerpts: SourceExcerpt[];
}

export interface SourceManifest {
  schemaVersion: string;
  generatedAt: string;
  normalization: string;
  scope: string;
  sources: ProfessionalSource[];
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return value;
}

function utcTimestamp(value: unknown, label: string): string {
  const timestamp = string(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp.`);
  }
  const parsed = new Date(timestamp);
  const normalizedInput = timestamp.includes(".") ? timestamp : timestamp.replace("Z", ".000Z");
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== normalizedInput) {
    throw new Error(`${label} must be a valid ISO-8601 UTC timestamp.`);
  }
  return timestamp;
}

function compilePatterns(patterns: string[], label: string): void {
  for (const pattern of patterns) {
    try {
      new RegExp(pattern, "iu");
    } catch {
      throw new Error(`${label} contains an invalid regular expression.`);
    }
  }
}

function patternArray(value: unknown, label: string, prohibited = false): PatternExpectation[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item, index) => {
    const entry = object(item, `${label}[${index}]`);
    const patterns = stringArray(entry.patterns, `${label}[${index}].patterns`);
    if (!patterns.length) throw new Error(`${label}[${index}].patterns cannot be empty.`);
    compilePatterns(patterns, `${label}[${index}]`);
    const base = { id: string(entry.id, `${label}[${index}].id`), patterns };
    if (!prohibited) return base;
    const allowedNegationPatterns = stringArray(
      entry.allowedNegationPatterns,
      `${label}[${index}].allowedNegationPatterns`,
    );
    compilePatterns(allowedNegationPatterns, `${label}[${index}].allowedNegationPatterns`);
    return { ...base, allowedNegationPatterns };
  });
}

export function validateSourceManifest(value: unknown): SourceManifest {
  const root = object(value, "sources");
  if (root.schemaVersion !== SOURCE_SCHEMA_VERSION) {
    throw new Error(`Unsupported source schemaVersion; expected ${SOURCE_SCHEMA_VERSION}.`);
  }
  const sources = root.sources;
  if (!Array.isArray(sources) || !sources.length) throw new Error("sources.sources must be a non-empty array.");
  const seen = new Set<string>();
  const parsed = sources.map((item, index) => {
    const entry = object(item, `sources[${index}]`);
    const sourceId = string(entry.sourceId, `sources[${index}].sourceId`);
    if (seen.has(sourceId)) throw new Error(`Duplicate sourceId: ${sourceId}.`);
    seen.add(sourceId);
    const locale = entry.locale;
    const type = entry.type;
    if (locale !== "en" && locale !== "tr") throw new Error(`${sourceId} has an invalid locale.`);
    if (type !== "post" && type !== "page" && type !== "js_project") throw new Error(`${sourceId} has an invalid type.`);
    if (!Number.isInteger(entry.wordpressId) || Number(entry.wordpressId) <= 0) {
      throw new Error(`${sourceId} has an invalid wordpressId.`);
    }
    if (sourceId !== `wordpress/${type}/${entry.wordpressId}/${locale}`) {
      throw new Error(`${sourceId} does not match the WordPress identity contract.`);
    }
    const slug = string(entry.slug, `${sourceId}.slug`);
    const canonicalUrl = string(entry.canonicalUrl, `${sourceId}.canonicalUrl`);
    const expectedPath = type === "page"
      ? (locale === "tr" ? "/tr/hakkimda" : "/about")
      : type === "js_project"
        ? `${locale === "tr" ? "/tr/projeler" : "/projects"}/${slug}`
        : `${locale === "tr" ? "/tr/blog" : "/blog"}/${slug}`;
    if (canonicalUrl !== `https://johnserra.com${expectedPath}`) {
      throw new Error(`${sourceId} has a non-canonical frontend URL.`);
    }
    const wordpressModifiedAt = utcTimestamp(entry.wordpressModifiedAt, `${sourceId}.wordpressModifiedAt`);
    const fetchedAt = utcTimestamp(entry.fetchedAt, `${sourceId}.fetchedAt`);
    const contentHash = string(entry.contentHash, `${sourceId}.contentHash`);
    if (!/^sha256:[a-f0-9]{64}$/.test(contentHash)) throw new Error(`${sourceId} has an invalid content hash.`);
    const excerptsValue = entry.excerpts;
    if (!Array.isArray(excerptsValue) || !excerptsValue.length) throw new Error(`${sourceId} must have excerpts.`);
    const excerptIds = new Set<string>();
    const excerpts = excerptsValue.map((excerpt, excerptIndex) => {
      const parsedExcerpt = object(excerpt, `${sourceId}.excerpts[${excerptIndex}]`);
      const id = string(parsedExcerpt.id, `${sourceId}.excerpts[${excerptIndex}].id`);
      if (excerptIds.has(id)) throw new Error(`${sourceId} has duplicate excerpt ${id}.`);
      excerptIds.add(id);
      return { id, text: string(parsedExcerpt.text, `${sourceId}.excerpts[${excerptIndex}].text`) };
    });
    return {
      sourceId,
      wordpressId: Number(entry.wordpressId),
      type,
      slug,
      title: string(entry.title, `${sourceId}.title`),
      locale,
      canonicalUrl,
      wordpressModifiedAt,
      fetchedAt,
      contentHash,
      excerpts,
    } satisfies ProfessionalSource;
  });
  return {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    generatedAt: utcTimestamp(root.generatedAt, "sources.generatedAt"),
    normalization: string(root.normalization, "sources.normalization"),
    scope: string(root.scope, "sources.scope"),
    sources: parsed,
  };
}

export function validateCaseFile(value: unknown, manifest: SourceManifest): AssistantCaseFile {
  const root = object(value, "cases");
  if (root.schemaVersion !== CASE_SCHEMA_VERSION) {
    throw new Error(`Unsupported case schemaVersion; expected ${CASE_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(root.cases)) throw new Error("cases.cases must be an array.");
  const sources = new Map(manifest.sources.map((source) => [source.sourceId, source]));
  const sourceUrls = new Map(manifest.sources.map((source) => [source.canonicalUrl, source]));
  const ids = new Set<string>();
  const cases = root.cases.map((item, index) => {
    const entry = object(item, `cases[${index}]`);
    const id = string(entry.id, `cases[${index}].id`);
    if (!/^[a-z0-9][a-z0-9-]+$/.test(id)) throw new Error(`Case ${id} must use a stable kebab-case ID.`);
    if (ids.has(id)) throw new Error(`Duplicate case ID: ${id}.`);
    ids.add(id);
    const locale = entry.locale;
    if (locale !== "en" && locale !== "tr") throw new Error(`Case ${id} has an invalid locale.`);
    const categories = stringArray(entry.categories, `${id}.categories`);
    if (!categories.length) throw new Error(`Case ${id} must have categories.`);
    if (!Array.isArray(entry.turns) || !entry.turns.length) throw new Error(`Case ${id} must have turns.`);
    const turns = entry.turns.map((turn, turnIndex) => {
      const parsed = object(turn, `${id}.turns[${turnIndex}]`);
      return { user: string(parsed.user, `${id}.turns[${turnIndex}].user`) };
    });
    const expectedSourceIds = stringArray(entry.expectedSourceIds, `${id}.expectedSourceIds`);
    const evidenceValue = entry.evidenceReferences;
    if (!Array.isArray(evidenceValue)) throw new Error(`${id}.evidenceReferences must be an array.`);
    const evidenceReferences = evidenceValue.map((reference, referenceIndex) => {
      const parsed = object(reference, `${id}.evidenceReferences[${referenceIndex}]`);
      const sourceId = string(parsed.sourceId, `${id}.evidenceReferences[${referenceIndex}].sourceId`);
      const excerptId = string(parsed.excerptId, `${id}.evidenceReferences[${referenceIndex}].excerptId`);
      const source = sources.get(sourceId);
      if (!source) throw new Error(`${id} references unknown evidence source ${sourceId}.`);
      if (source.locale !== locale) throw new Error(`${id} references ${sourceId} with the wrong locale.`);
      if (!source.excerpts.some((excerpt) => excerpt.id === excerptId)) {
        throw new Error(`${id} references unknown excerpt ${sourceId}#${excerptId}.`);
      }
      return { sourceId, excerptId };
    });
    for (const sourceId of expectedSourceIds) {
      const source = sources.get(sourceId);
      if (!source) throw new Error(`${id} expects unknown source ${sourceId}.`);
      if (source.locale !== locale) throw new Error(`${id} expects ${sourceId} with the wrong locale.`);
      if (!evidenceReferences.some((reference) => reference.sourceId === sourceId)) {
        throw new Error(`${id} expects ${sourceId} without an evidence reference.`);
      }
    }
    const uncertaintyValue = object(entry.uncertainty, `${id}.uncertainty`);
    if (typeof uncertaintyValue.required !== "boolean") throw new Error(`${id}.uncertainty.required must be boolean.`);
    const uncertaintyPatterns = stringArray(uncertaintyValue.patterns, `${id}.uncertainty.patterns`);
    if (uncertaintyValue.required && !uncertaintyPatterns.length) {
      throw new Error(`${id}.uncertainty.patterns cannot be empty when uncertainty is required.`);
    }
    compilePatterns(uncertaintyPatterns, `${id}.uncertainty.patterns`);
    const citationsValue = object(entry.citations, `${id}.citations`);
    if (typeof citationsValue.required !== "boolean") throw new Error(`${id}.citations.required must be boolean.`);
    const expectedUrls = stringArray(citationsValue.expectedUrls, `${id}.citations.expectedUrls`);
    if (citationsValue.required && !expectedUrls.length) {
      throw new Error(`${id}.citations.expectedUrls cannot be empty when citations are required.`);
    }
    for (const expectedUrl of expectedUrls) {
      const source = sourceUrls.get(expectedUrl);
      if (!source) throw new Error(`${id} expects citation URL ${expectedUrl} that is absent from the source manifest.`);
      if (source.locale !== locale) throw new Error(`${id} expects citation URL ${expectedUrl} with the wrong locale.`);
    }
    let fixture: AssistantCase["fixture"];
    if (entry.fixture !== undefined) {
      const fixtureValue = object(entry.fixture, `${id}.fixture`);
      if (fixtureValue.kind !== "synthetic_indirect_injection") throw new Error(`${id} has an invalid fixture kind.`);
      if (
        typeof fixtureValue.similarity !== "number" ||
        !Number.isFinite(fixtureValue.similarity) ||
        fixtureValue.similarity < 0 ||
        fixtureValue.similarity > 1
      ) {
        throw new Error(`${id}.fixture.similarity must be between zero and one.`);
      }
      fixture = {
        kind: fixtureValue.kind,
        sourceId: string(fixtureValue.sourceId, `${id}.fixture.sourceId`),
        text: string(fixtureValue.text, `${id}.fixture.text`),
        similarity: fixtureValue.similarity,
      };
    }
    return {
      id,
      locale,
      categories,
      turns,
      expectedSourceIds,
      evidenceReferences,
      requiredFacts: patternArray(entry.requiredFacts, `${id}.requiredFacts`),
      prohibitedClaims: patternArray(entry.prohibitedClaims, `${id}.prohibitedClaims`, true) as ProhibitedExpectation[],
      uncertainty: { required: uncertaintyValue.required, patterns: uncertaintyPatterns },
      citations: { required: citationsValue.required, expectedUrls },
      ...(fixture ? { fixture } : {}),
    } satisfies AssistantCase;
  });

  const counts = {
    tr: cases.filter((item) => item.locale === "tr").length,
    followup: cases.filter((item) => item.turns.length > 1).length,
    unknown: cases.filter((item) => item.categories.includes("unsupported-unknown")).length,
    direct: cases.filter((item) => item.categories.includes("prompt-injection-direct")).length,
    indirect: cases.filter((item) => item.fixture?.kind === "synthetic_indirect_injection").length,
  };
  if (cases.length < 30) throw new Error(`Case corpus has ${cases.length} cases; at least 30 are required.`);
  if (counts.tr < 7) throw new Error(`Case corpus has ${counts.tr} Turkish cases; at least 7 are required.`);
  if (counts.followup < 3) throw new Error(`Case corpus has ${counts.followup} follow-up cases; at least 3 are required.`);
  if (counts.unknown < 3) throw new Error(`Case corpus has ${counts.unknown} unknown cases; at least 3 are required.`);
  if (counts.direct < 3) throw new Error(`Case corpus has ${counts.direct} direct-injection cases; at least 3 are required.`);
  if (counts.indirect < 1) throw new Error("Case corpus must include an indirect-injection fixture.");
  return {
    schemaVersion: CASE_SCHEMA_VERSION,
    corpusVersion: string(root.corpusVersion, "cases.corpusVersion"),
    cases,
  };
}

export async function loadAndValidateCorpus(casePath: string, sourcePath: string): Promise<{
  caseFile: AssistantCaseFile;
  sourceManifest: SourceManifest;
  casesHash: string;
  sourcesHash: string;
}> {
  const [caseBytes, sourceBytes] = await Promise.all([readFile(casePath), readFile(sourcePath)]);
  let rawCases: unknown;
  let rawSources: unknown;
  try {
    rawCases = JSON.parse(caseBytes.toString("utf8"));
  } catch {
    throw new Error("Case file is not valid JSON.");
  }
  try {
    rawSources = JSON.parse(sourceBytes.toString("utf8"));
  } catch {
    throw new Error("Source manifest is not valid JSON.");
  }
  const sourceManifest = validateSourceManifest(rawSources);
  const caseFile = validateCaseFile(rawCases, sourceManifest);
  return {
    caseFile,
    sourceManifest,
    casesHash: createHash("sha256").update(caseBytes).digest("hex"),
    sourcesHash: createHash("sha256").update(sourceBytes).digest("hex"),
  };
}
