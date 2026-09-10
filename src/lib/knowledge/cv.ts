import { createHash } from "node:crypto";
import registeredCvSource from "../../../content/knowledge/cv.en.json";

export const CV_SCHEMA_VERSION = "1.0.0";
export const CV_DOCUMENT_ID = "john-serra";
export const CV_LOCALE = "en";
export const CV_VISIBILITY = "public";
export const CV_DOCUMENT_TYPE = "cv";
export const CV_AUTHORITY = "reviewed_public_cv";
export const CV_CANONICAL_URL = "https://johnserra.com/cv/john-serra.en.md";
export const CV_SOURCE_ID_PREFIX = "cv/john-serra/en";
export const CV_SOURCE_RELATIVE_PATH = "content/knowledge/cv.en.json";
export const CV_PUBLIC_RELATIVE_PATH = "public/cv/john-serra.en.md";
export const MAX_CV_SECTION_CHARACTERS = 4_000;

const DOCUMENT_KEYS = new Set([
  "schema_version", "document_id", "title", "locale", "visibility",
  "document_type", "authority", "canonical_url", "sections",
]);
const SECTION_KEYS = new Set([
  "id", "category", "title", "organization", "role", "dates", "locale",
  "visibility", "document_type", "authority", "canonical_url", "paragraphs",
  "bullets", "references",
]);
const DATE_KEYS = new Set(["kind", "start", "end", "ongoing", "start_unknown", "end_unknown"]);
const DATE_POINT_KEYS = new Set(["value", "precision"]);
const REFERENCE_KEYS = new Set(["label", "url"]);
const CATEGORIES = new Set(["summary", "experience", "project", "education", "credential", "languages", "skills"]);
const REGISTERED_REFERENCE_URLS = new Set([
  "https://johnserra.com/projects/careertalklab",
  "https://johnserra.com/projects/bd-automation-suite",
]);
const PRIVATE_FIELD = /^(?:address|contact|date_of_birth|dob|email|phone|salary|ssn|tax_id)$/i;
const EMAIL_TEXT = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_TEXT = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/;

export type CvCategory = "summary" | "experience" | "project" | "education" | "credential" | "languages" | "skills";
export type CvDatePrecision = "month" | "documented_from";

export interface CvDatePoint {
  value: string;
  precision: CvDatePrecision;
}

export interface CvDates {
  kind: "interval" | "issued" | "undated";
  start: CvDatePoint | null;
  end: CvDatePoint | null;
  ongoing: boolean;
  start_unknown: boolean;
  end_unknown: boolean;
}

export interface CvReference {
  label: string;
  url: string;
}

export interface CvSection {
  id: string;
  category: CvCategory;
  title: string;
  organization: string | null;
  role: string | null;
  dates: CvDates;
  locale: "en";
  visibility: "public";
  document_type: "cv";
  authority: "reviewed_public_cv";
  canonical_url: typeof CV_CANONICAL_URL;
  paragraphs: string[];
  bullets: string[];
  references: CvReference[];
}

export interface CvDocument {
  schema_version: typeof CV_SCHEMA_VERSION;
  document_id: typeof CV_DOCUMENT_ID;
  title: string;
  locale: "en";
  visibility: "public";
  document_type: "cv";
  authority: "reviewed_public_cv";
  canonical_url: typeof CV_CANONICAL_URL;
  sections: CvSection[];
}

export interface CvChunk {
  source: string;
  chunk_index: 0;
  content: string;
  metadata: {
    document_id: typeof CV_DOCUMENT_ID;
    section_id: string;
    title: string;
    organization: string | null;
    role: string | null;
    dates: CvDates;
    locale: "en";
    source_locale: "en";
    visibility: "public";
    document_type: "cv";
    authority: "reviewed_public_cv";
    canonical_url: typeof CV_CANONICAL_URL;
    content_sha256: string;
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} contains unknown field(s): ${unknown.join(", ")}.`);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  if (EMAIL_TEXT.test(value) || PHONE_TEXT.test(value)) throw new Error(`${label} contains obvious contact information.`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : requiredString(value, label);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item, index) => requiredString(item, `${label}[${index}]`));
}

function rejectPrivateFields(value: unknown, label = "CV"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectPrivateFields(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PRIVATE_FIELD.test(key)) throw new Error(`${label} contains prohibited private/contact field ${key}.`);
    rejectPrivateFields(child, `${label}.${key}`);
  }
}

function datePoint(value: unknown, label: string): CvDatePoint | null {
  if (value === null) return null;
  const parsed = object(value, label);
  assertAllowedKeys(parsed, DATE_POINT_KEYS, label);
  const date = requiredString(parsed.value, `${label}.value`);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(date)) throw new Error(`${label}.value must be a YYYY-MM date.`);
  if (parsed.precision !== "month" && parsed.precision !== "documented_from") {
    throw new Error(`${label}.precision is invalid.`);
  }
  return { value: date, precision: parsed.precision };
}

function dates(value: unknown, label: string): CvDates {
  const parsed = object(value, label);
  assertAllowedKeys(parsed, DATE_KEYS, label);
  if (parsed.kind !== "interval" && parsed.kind !== "issued" && parsed.kind !== "undated") {
    throw new Error(`${label}.kind is invalid.`);
  }
  for (const key of ["ongoing", "start_unknown", "end_unknown"] as const) {
    if (typeof parsed[key] !== "boolean") throw new Error(`${label}.${key} must be boolean.`);
  }
  const result: CvDates = {
    kind: parsed.kind,
    start: datePoint(parsed.start, `${label}.start`),
    end: datePoint(parsed.end, `${label}.end`),
    ongoing: parsed.ongoing as boolean,
    start_unknown: parsed.start_unknown as boolean,
    end_unknown: parsed.end_unknown as boolean,
  };
  if (result.kind === "undated" && (result.start || result.end || result.ongoing || !result.start_unknown || !result.end_unknown)) {
    throw new Error(`${label} has inconsistent undated values.`);
  }
  if (result.kind === "issued" && (!result.start || result.end || result.ongoing || result.start_unknown || result.end_unknown)) {
    throw new Error(`${label} has inconsistent issued-date values.`);
  }
  if (result.kind === "interval") {
    if (result.start_unknown === Boolean(result.start)) throw new Error(`${label} must state whether its start is unknown.`);
    if (result.ongoing && (result.end || result.end_unknown)) throw new Error(`${label} ongoing interval cannot have an end.`);
    if (!result.ongoing && result.end_unknown === Boolean(result.end)) {
      throw new Error(`${label} must state whether its end is unknown.`);
    }
    if (result.start && result.end && result.end.value < result.start.value) throw new Error(`${label} ends before it starts.`);
  }
  return result;
}

function references(value: unknown, label: string): CvReference[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item, index) => {
    const parsed = object(item, `${label}[${index}]`);
    assertAllowedKeys(parsed, REFERENCE_KEYS, `${label}[${index}]`);
    const url = requiredString(parsed.url, `${label}[${index}].url`);
    if (!REGISTERED_REFERENCE_URLS.has(url)) throw new Error(`${label}[${index}] has an unregistered URL.`);
    return { label: requiredString(parsed.label, `${label}[${index}].label`), url };
  });
}

export function validateCvDocument(value: unknown): CvDocument {
  rejectPrivateFields(value);
  const root = object(value, "CV");
  assertAllowedKeys(root, DOCUMENT_KEYS, "CV");
  if (root.schema_version !== CV_SCHEMA_VERSION) throw new Error(`CV schema_version must be ${CV_SCHEMA_VERSION}.`);
  if (root.document_id !== CV_DOCUMENT_ID) throw new Error("CV document_id is not registered.");
  if (root.locale !== CV_LOCALE) throw new Error("CV locale is not registered.");
  if (root.visibility !== CV_VISIBILITY) throw new Error("CV visibility must be public.");
  if (root.document_type !== CV_DOCUMENT_TYPE) throw new Error("CV document_type must be cv.");
  if (root.authority !== CV_AUTHORITY) throw new Error("CV authority is invalid.");
  if (root.canonical_url !== CV_CANONICAL_URL) throw new Error("CV canonical_url is not registered.");
  if (!Array.isArray(root.sections) || !root.sections.length) throw new Error("CV sections must be a non-empty array.");
  const ids = new Set<string>();
  const sections = root.sections.map((item, index) => {
    const label = `CV.sections[${index}]`;
    const parsed = object(item, label);
    assertAllowedKeys(parsed, SECTION_KEYS, label);
    const id = requiredString(parsed.id, `${label}.id`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 100) throw new Error(`${label}.id is not a stable kebab-case ID.`);
    if (ids.has(id)) throw new Error(`Duplicate CV section ID: ${id}.`);
    ids.add(id);
    if (!CATEGORIES.has(String(parsed.category))) throw new Error(`${label}.category is invalid.`);
    if (parsed.locale !== CV_LOCALE || parsed.visibility !== CV_VISIBILITY || parsed.document_type !== CV_DOCUMENT_TYPE || parsed.authority !== CV_AUTHORITY || parsed.canonical_url !== CV_CANONICAL_URL) {
      throw new Error(`${label} metadata does not match the registered public CV.`);
    }
    const section: CvSection = {
      id,
      category: parsed.category as CvCategory,
      title: requiredString(parsed.title, `${label}.title`),
      organization: nullableString(parsed.organization, `${label}.organization`),
      role: nullableString(parsed.role, `${label}.role`),
      dates: dates(parsed.dates, `${label}.dates`),
      locale: "en",
      visibility: "public",
      document_type: "cv",
      authority: "reviewed_public_cv",
      canonical_url: CV_CANONICAL_URL,
      paragraphs: stringArray(parsed.paragraphs, `${label}.paragraphs`),
      bullets: stringArray(parsed.bullets, `${label}.bullets`),
      references: references(parsed.references, `${label}.references`),
    };
    if (!section.paragraphs.length && !section.bullets.length) throw new Error(`${label} has no public content.`);
    return section;
  });
  return {
    schema_version: CV_SCHEMA_VERSION,
    document_id: CV_DOCUMENT_ID,
    title: requiredString(root.title, "CV.title"),
    locale: "en",
    visibility: "public",
    document_type: "cv",
    authority: "reviewed_public_cv",
    canonical_url: CV_CANONICAL_URL,
    sections,
  };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function friendlyDate(point: CvDatePoint): string {
  const [year, month] = point.value.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

export function formatCvDates(value: CvDates): string | null {
  if (value.kind === "undated") return null;
  if (value.kind === "issued") return `Issued ${friendlyDate(value.start!)}`;
  const start = value.start ? friendlyDate(value.start) : "Start date unknown";
  if (value.start?.precision === "documented_from") {
    return `Work documented from ${start}; ${value.ongoing ? "present" : "end date unknown"}`;
  }
  if (value.ongoing) return `${start}–present`;
  return `${start}–${value.end ? friendlyDate(value.end) : "end date unknown"}`;
}

const GROUPS: Array<{ category: CvCategory; heading: string }> = [
  { category: "summary", heading: "Professional summary" },
  { category: "experience", heading: "Professional experience" },
  { category: "project", heading: "Selected projects" },
  { category: "education", heading: "Education" },
  { category: "credential", heading: "Certifications and coursework" },
  { category: "languages", heading: "Languages" },
  { category: "skills", heading: "Skills" },
];

function renderSectionBody(section: CvSection): string[] {
  const lines: string[] = [];
  const date = formatCvDates(section.dates);
  if (date) lines.push(date, "");
  for (const paragraph of section.paragraphs) lines.push(paragraph, "");
  for (const bullet of section.bullets) lines.push(`- ${bullet}`);
  if (section.bullets.length) lines.push("");
  for (const reference of section.references) lines.push(`Reference: [${reference.label}](${reference.url}).`, "");
  while (lines.at(-1) === "") lines.pop();
  return lines;
}

function renderValidatedCvMarkdown(document: CvDocument): string {
  const lines = [`# ${document.title}`, ""];
  for (const group of GROUPS) {
    const sections = document.sections.filter((section) => section.category === group.category);
    if (!sections.length) continue;
    lines.push(`## ${group.heading}`, "");
    if (group.category === "credential") {
      lines.push("The following credentials are listed on LinkedIn. Issuers and dates are transcribed from the profile; credentials have not been independently verified.", "");
    }
    for (const section of sections) {
      const useSubheading = sections.length > 1 || !["summary", "languages", "skills"].includes(group.category);
      if (useSubheading) lines.push(`### ${section.title}`, "");
      lines.push(...renderSectionBody(section), "");
    }
    if (group.category === "credential") {
      lines.push("Employer ISO certifications are not personal credentials. Individual course certificates do not establish completion of a broader professional certificate program.", "");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

export function renderCvMarkdown(document: CvDocument): string {
  return renderValidatedCvMarkdown(validateCvDocument(document));
}

export function cvMarkdownSha256(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

/**
 * Approval identity for the complete validated canonical document and its
 * readable artifact. The domain tag prevents confusing this with a digest of
 * Markdown bytes alone.
 */
export function cvApprovalDigest(document: CvDocument): string {
  const validated = validateCvDocument(document);
  const markdown = renderValidatedCvMarkdown(validated);
  const payload = JSON.stringify({
    format: "johnserra-public-cv-approval-v1",
    document: validated,
    markdown,
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export async function loadRegisteredCv(): Promise<CvDocument> {
  return validateCvDocument(registeredCvSource);
}

export function cvChunks(document: CvDocument): CvChunk[] {
  const validated = validateCvDocument(document);
  const approvalDigest = cvApprovalDigest(validated);
  return validated.sections.map((section) => {
    const datesText = formatCvDates(section.dates) ?? "unknown or not applicable";
    const content = [
      `Section: ${section.title}`,
      `Organization: ${section.organization ?? "not specified"}`,
      `Role: ${section.role ?? "not specified"}`,
      `Dates: ${datesText}`,
      ...section.paragraphs,
      ...section.bullets.map((bullet) => `- ${bullet}`),
      ...section.references.map((reference) => `Reference: ${reference.label} — ${reference.url}`),
    ].join("\n");
    if (content.length > MAX_CV_SECTION_CHARACTERS) {
      throw new Error(`CV section ${section.id} is oversized; split it into reviewed semantic subunits.`);
    }
    return {
      source: `${CV_SOURCE_ID_PREFIX}/${section.id}`,
      chunk_index: 0,
      content,
      metadata: {
        document_id: CV_DOCUMENT_ID,
        section_id: section.id,
        title: section.title,
        organization: section.organization,
        role: section.role,
        dates: section.dates,
        locale: "en",
        source_locale: "en",
        visibility: "public",
        document_type: "cv",
        authority: "reviewed_public_cv",
        canonical_url: CV_CANONICAL_URL,
        content_sha256: approvalDigest,
      },
    };
  });
}
