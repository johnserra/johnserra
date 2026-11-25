import os from "node:os";
import path from "node:path";
import {
  CV_AUTHORITY,
  CV_CANONICAL_URL,
  CV_DOCUMENT_ID,
  CV_DOCUMENT_TYPE,
  CV_LOCALE,
  CV_SCHEMA_VERSION,
  CV_VISIBILITY,
  validateCvDocument,
  type CvCategory,
  type CvDates,
  type CvDocument,
  type CvReference,
  type CvSection,
} from "./cv";

export const CV_SUPPLEMENTS_RELATIVE_PATH = "content/knowledge/cv.supplements.en.json";
export const DEFAULT_CAREER_OPS_CV_PATH = path.join(os.homedir(), "Projects", "career-ops", "cv.md");

const RESTRICTED_CURRENT_EMPLOYER_LOCATION = /\b(?:Rochester|Syracuse|Central New York|CNY)\b/i;

const MONTH_INDEX: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

const FULL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export interface CvExperienceOverride {
  match_organization: string;
  id: string;
  organization?: string;
  omit_location?: boolean;
  location_paragraph?: string;
  extra_paragraphs?: string[];
  references?: CvReference[];
}

export interface CvProjectOverride {
  match_title: string;
  id: string;
  title?: string;
  organization?: string | null;
  dates?: CvDates;
  extra_paragraphs?: string[];
  references?: CvReference[];
}

export interface CvEducationOverride {
  match_institution: string;
  id: string;
  title?: string;
  organization?: string;
  location_paragraph?: string;
  extra_paragraphs?: string[];
}

export interface CvCredentialOverride {
  match_title: string;
  id: string;
  title?: string;
}

export interface CvPublicSupplements {
  schema_version: "1.0.0";
  experience_overrides: CvExperienceOverride[];
  project_overrides: CvProjectOverride[];
  education_overrides: CvEducationOverride[];
  credential_overrides: CvCredentialOverride[];
  append_sections: CvSection[];
}

export interface CvSyncArguments {
  sourcePath: string;
  check: boolean;
  dryRun: boolean;
}

export function parseCvSyncArguments(
  argv: string[],
  defaultSourcePath = process.env.CAREER_OPS_CV_PATH || DEFAULT_CAREER_OPS_CV_PATH,
): CvSyncArguments {
  let sourcePath = defaultSourcePath;
  let check = false;
  let dryRun = false;
  const seen = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--source" && arg !== "--check" && arg !== "--dry-run") {
      throw new Error(`Unknown argument: ${arg}.`);
    }
    if (seen.has(arg)) throw new Error(`Duplicate argument: ${arg}.`);
    seen.add(arg);
    if (arg === "--check") {
      check = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--source requires a file path.");
      sourcePath = value;
      index += 1;
    }
  }

  if (check && dryRun) throw new Error("--check and --dry-run cannot be combined.");
  return { sourcePath, check, dryRun };
}

function normalizeMatchKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/\.+$/u, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function slugifyId(prefix: string, ...parts: string[]): string {
  const joined = parts
    .map((part) => part
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, ""))
    .filter(Boolean)
    .join("-");
  return `${prefix}-${joined}`.slice(0, 100).replace(/-+$/u, "");
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/\*([^*]+)\*/gu, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gu, "$1")
    .trim();
}

function formatMonthYear(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return `${FULL_MONTH_NAMES[Number(month) - 1]} ${year}`;
}

function parseMonthYearToken(raw: string): string {
  const match = raw.trim().match(/^([A-Za-z]+)\.?\s+(\d{4})$/u);
  if (!match) throw new Error(`Unsupported month/year date token: "${raw}".`);
  const month = MONTH_INDEX[match[1].toLowerCase()];
  if (!month) throw new Error(`Unknown month name in date token: "${raw}".`);
  return `${match[2]}-${month}`;
}

function parseDateInterval(line: string): CvDates {
  const parts = line.split(/\s*[–—-]\s*/u).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) throw new Error(`Unsupported experience date range: "${line}".`);
  const startValue = parseMonthYearToken(parts[0]);
  if (/^present$/i.test(parts[1])) {
    return {
      kind: "interval",
      start: { value: startValue, precision: "month" },
      end: null,
      ongoing: true,
      start_unknown: false,
      end_unknown: false,
    };
  }
  const endValue = parseMonthYearToken(parts[1]);
  return {
    kind: "interval",
    start: { value: startValue, precision: "month" },
    end: { value: endValue, precision: "month" },
    ongoing: false,
    start_unknown: false,
    end_unknown: false,
  };
}

const UNDATED: CvDates = {
  kind: "undated",
  start: null,
  end: null,
  ongoing: false,
  start_unknown: true,
  end_unknown: true,
};

function baseSection(input: {
  id: string;
  category: CvCategory;
  title: string;
  organization: string | null;
  role: string | null;
  dates: CvDates;
  paragraphs: string[];
  bullets: string[];
  references?: CvReference[];
}): CvSection {
  return {
    id: input.id,
    category: input.category,
    title: input.title,
    organization: input.organization,
    role: input.role,
    dates: input.dates,
    locale: CV_LOCALE,
    visibility: CV_VISIBILITY,
    document_type: CV_DOCUMENT_TYPE,
    authority: CV_AUTHORITY,
    canonical_url: CV_CANONICAL_URL,
    paragraphs: input.paragraphs,
    bullets: input.bullets,
    references: input.references ?? [],
  };
}

function splitTopLevelSections(markdown: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  const lines = markdown.replace(/\r\n/gu, "\n").split("\n");
  let currentHeading: string | null = null;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/u);
    if (h2) {
      currentHeading = h2[1].trim().toLowerCase();
      if (sections.has(currentHeading)) {
        throw new Error(`Duplicate top-level CV section heading: "${h2[1].trim()}".`);
      }
      sections.set(currentHeading, []);
      continue;
    }
    if (currentHeading !== null) {
      sections.get(currentHeading)!.push(line);
    }
  }

  return sections;
}

function splitSubsections(lines: string[]): Array<{ heading: string; lines: string[] }> {
  const result: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    const h3 = line.match(/^###\s+(.+?)\s*$/u);
    if (h3) {
      current = { heading: h3[1].trim(), lines: [] };
      result.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }

  return result;
}

function parseBulletAndParagraphLines(lines: string[]): { paragraphs: string[]; bullets: string[] } {
  const paragraphs: string[] = [];
  const bullets: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^\[https?:\/\/[^\]]+\]\(https?:\/\/[^)]+\)$/u.test(trimmed)) continue;
    if (trimmed.startsWith("- ")) {
      bullets.push(stripInlineMarkdown(trimmed.slice(2)));
    } else {
      paragraphs.push(stripInlineMarkdown(trimmed));
    }
  }

  return { paragraphs, bullets };
}

function parseSummarySection(lines: string[]): CvSection {
  const { paragraphs, bullets } = parseBulletAndParagraphLines(lines);
  if (!paragraphs.length && !bullets.length) {
    throw new Error("career-ops cv.md is missing Summary content.");
  }
  return baseSection({
    id: "summary",
    category: "summary",
    title: "Professional summary",
    organization: null,
    role: null,
    dates: UNDATED,
    paragraphs,
    bullets,
  });
}

function parseExperienceSections(
  lines: string[],
  overrides: readonly CvExperienceOverride[],
): CvSection[] {
  const subsections = splitSubsections(lines);
  if (!subsections.length) throw new Error("career-ops cv.md is missing Experience subsections.");

  return subsections.map(({ heading, lines: bodyLines }) => {
    const [rawOrg, rawLocation] = heading.split(/\s+[—–]\s+/u).map((part) => part.trim());
    if (!rawOrg) throw new Error(`Invalid experience heading: "${heading}".`);

    const nonEmpty = bodyLines.map((line) => line.trim()).filter(Boolean);
    const roleMatch = nonEmpty[0]?.match(/^\*\*(.+?)\*\*$/u);
    if (!roleMatch) throw new Error(`Missing bold role line under experience "${heading}".`);
    const role = roleMatch[1].trim();
    const dateLine = nonEmpty[1];
    if (!dateLine) throw new Error(`Missing date range line under experience "${heading}".`);
    const parsedDates = parseDateInterval(dateLine);

    const { paragraphs: bodyParagraphs, bullets } = parseBulletAndParagraphLines(nonEmpty.slice(2));
    const override = overrides.find(
      (candidate) => normalizeMatchKey(candidate.match_organization) === normalizeMatchKey(rawOrg),
    );
    const organization = override?.organization ?? rawOrg;
    const id = override?.id ?? slugifyId("experience", organization, role);

    const paragraphs: string[] = [];
    if (!override?.omit_location) {
      if (override?.location_paragraph) {
        paragraphs.push(override.location_paragraph);
      } else if (rawLocation) {
        paragraphs.push(`Location: ${rawLocation}.`);
      }
    }
    if (override?.extra_paragraphs?.length) paragraphs.push(...override.extra_paragraphs);
    paragraphs.push(...bodyParagraphs);

    if (override?.omit_location) {
      for (const text of [...paragraphs, ...bullets]) {
        if (RESTRICTED_CURRENT_EMPLOYER_LOCATION.test(text)) {
          throw new Error(
            `Public boundary violation: "${organization}" cannot disclose current regional location in public CV text.`,
          );
        }
      }
    }

    return baseSection({
      id,
      category: "experience",
      title: `${role} — ${organization}`,
      organization,
      role,
      dates: parsedDates,
      paragraphs,
      bullets,
      references: override?.references ?? [],
    });
  });
}

function parseProjectSections(
  lines: string[],
  overrides: readonly CvProjectOverride[],
): CvSection[] {
  const subsections = splitSubsections(lines);
  if (!subsections.length) throw new Error("career-ops cv.md is missing Projects subsections.");

  return subsections.map(({ heading, lines: bodyLines }) => {
    const override = overrides.find((candidate) =>
      normalizeMatchKey(heading).startsWith(normalizeMatchKey(candidate.match_title)),
    );
    const title = override?.title ?? heading;
    const id = override?.id ?? slugifyId("project", heading.split(/\s+[—–]\s+/u)[0] ?? heading);
    const organization = override && "organization" in override
      ? (override.organization ?? null)
      : (heading.split(/\s+[—–]\s+/u)[0]?.trim() || null);
    const { paragraphs: bodyParagraphs, bullets } = parseBulletAndParagraphLines(bodyLines);
    const paragraphs = [...(override?.extra_paragraphs ?? []), ...bodyParagraphs];

    return baseSection({
      id,
      category: "project",
      title,
      organization,
      role: null,
      dates: override?.dates ?? UNDATED,
      paragraphs,
      bullets,
      references: override?.references ?? [],
    });
  });
}

function parseEducationSections(
  lines: string[],
  overrides: readonly CvEducationOverride[],
): CvSection[] {
  const { bullets } = parseBulletAndParagraphLines(lines);
  if (!bullets.length) throw new Error("career-ops cv.md is missing Education entries.");

  return bullets.map((entry) => {
    const parts = entry.split(/\s+[—–]\s+/u).map((part) => part.trim());
    if (parts.length < 2) throw new Error(`Unsupported education line: "${entry}".`);
    const degree = parts[0].replace(/\.+$/u, "");
    const institutionAndLocation = parts.slice(1).join(" — ");
    const commaIndex = institutionAndLocation.indexOf(",");
    const rawInstitution = (commaIndex === -1
      ? institutionAndLocation
      : institutionAndLocation.slice(0, commaIndex)).trim();
    const rawLocation = commaIndex === -1 ? "" : institutionAndLocation.slice(commaIndex + 1).trim();

    const override = overrides.find((candidate) =>
      normalizeMatchKey(rawInstitution).includes(normalizeMatchKey(candidate.match_institution)),
    );
    const title = override?.title ?? rawInstitution;
    const organization = override?.organization ?? title;
    const id = override?.id ?? slugifyId("education", title);

    const paragraphs = [`${degree}.`];
    if (override?.location_paragraph) {
      paragraphs.push(override.location_paragraph);
    } else if (rawLocation) {
      paragraphs.push(`Location: ${rawLocation}.`);
    }
    if (override?.extra_paragraphs?.length) paragraphs.push(...override.extra_paragraphs);

    return baseSection({
      id,
      category: "education",
      title,
      organization,
      role: null,
      dates: UNDATED,
      paragraphs,
      bullets: [],
    });
  });
}

function parseCertificationSections(
  lines: string[],
  overrides: readonly CvCredentialOverride[],
): CvSection[] {
  const { bullets } = parseBulletAndParagraphLines(lines);
  if (!bullets.length) throw new Error("career-ops cv.md is missing Certifications entries.");

  return bullets.map((entry) => {
    const match = entry.match(/^(.+?)\s+[—–]\s+(.+?)\s*\(([^)]+)\)\s*$/u);
    if (!match) throw new Error(`Unsupported certification line: "${entry}".`);
    const rawTitle = match[1].trim();
    const issuer = match[2].trim();
    const issuedMonthYear = parseMonthYearToken(match[3].trim());
    const override = overrides.find((candidate) =>
      normalizeMatchKey(rawTitle).startsWith(normalizeMatchKey(candidate.match_title)),
    );
    const title = override?.title ?? rawTitle;
    const id = override?.id ?? slugifyId("credential", title);

    const issuerSentence = issuer.endsWith(".") ? issuer : `${issuer}.`;

    return baseSection({
      id,
      category: "credential",
      title,
      organization: issuer,
      role: null,
      dates: {
        kind: "issued",
        start: { value: issuedMonthYear, precision: "month" },
        end: null,
        ongoing: false,
        start_unknown: false,
        end_unknown: false,
      },
      paragraphs: [
        `Listed issuer: ${issuerSentence} Issued ${formatMonthYear(issuedMonthYear)}. Listed on LinkedIn; not independently verified.`,
      ],
      bullets: [],
    });
  });
}

function parseLanguagesSection(lines: string[]): CvSection {
  const { paragraphs, bullets } = parseBulletAndParagraphLines(lines);
  if (!paragraphs.length && !bullets.length) {
    throw new Error("career-ops cv.md is missing Languages content.");
  }
  return baseSection({
    id: "languages",
    category: "languages",
    title: "Languages",
    organization: null,
    role: null,
    dates: UNDATED,
    paragraphs,
    bullets,
  });
}

function parseSkillsSection(lines: string[]): CvSection {
  const { paragraphs, bullets } = parseBulletAndParagraphLines(lines);
  if (!paragraphs.length && !bullets.length) {
    throw new Error("career-ops cv.md is missing Skills content.");
  }
  return baseSection({
    id: "skills",
    category: "skills",
    title: "Skills",
    organization: null,
    role: null,
    dates: UNDATED,
    paragraphs,
    bullets,
  });
}

const CATEGORY_ORDER: readonly CvCategory[] = [
  "summary",
  "experience",
  "project",
  "education",
  "credential",
  "languages",
  "skills",
];

function mergeWithSupplements(
  primarySections: readonly CvSection[],
  appendSections: readonly CvSection[],
): CvSection[] {
  const primaryIds = new Set(primarySections.map((section) => section.id));
  const extras = appendSections.filter((section) => !primaryIds.has(section.id));
  const combined = [...primarySections, ...extras];
  return CATEGORY_ORDER.flatMap((category) => combined.filter((section) => section.category === category));
}

export function validateCvPublicSupplements(value: unknown): CvPublicSupplements {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CV supplements must be a JSON object.");
  }
  const root = value as Record<string, unknown>;
  if (root.schema_version !== "1.0.0") {
    throw new Error("CV supplements schema_version must be 1.0.0.");
  }
  for (const key of [
    "experience_overrides",
    "project_overrides",
    "education_overrides",
    "credential_overrides",
    "append_sections",
  ]) {
    if (!Array.isArray(root[key])) throw new Error(`CV supplements.${key} must be an array.`);
  }
  return root as unknown as CvPublicSupplements;
}

export function syncCvFromCareerOpsMarkdown(
  markdown: string,
  supplements: CvPublicSupplements,
): CvDocument {
  const validatedSupplements = validateCvPublicSupplements(supplements);
  const sectionsByHeading = splitTopLevelSections(markdown);

  const requiredHeadings = [
    "summary",
    "experience",
    "projects",
    "education",
    "certifications",
    "skills",
    "languages",
  ];
  for (const heading of requiredHeadings) {
    if (!sectionsByHeading.has(heading)) {
      throw new Error(`career-ops cv.md is missing required "## ${heading}" section.`);
    }
  }

  const primarySections: CvSection[] = [
    parseSummarySection(sectionsByHeading.get("summary")!),
    ...parseExperienceSections(sectionsByHeading.get("experience")!, validatedSupplements.experience_overrides),
    ...parseProjectSections(sectionsByHeading.get("projects")!, validatedSupplements.project_overrides),
    ...parseEducationSections(sectionsByHeading.get("education")!, validatedSupplements.education_overrides),
    ...parseCertificationSections(sectionsByHeading.get("certifications")!, validatedSupplements.credential_overrides),
    parseLanguagesSection(sectionsByHeading.get("languages")!),
    parseSkillsSection(sectionsByHeading.get("skills")!),
  ];

  const mergedSections = mergeWithSupplements(primarySections, validatedSupplements.append_sections);

  const document: CvDocument = {
    schema_version: CV_SCHEMA_VERSION,
    document_id: CV_DOCUMENT_ID,
    title: "John Serra — Professional CV",
    locale: CV_LOCALE,
    visibility: CV_VISIBILITY,
    document_type: CV_DOCUMENT_TYPE,
    authority: CV_AUTHORITY,
    canonical_url: CV_CANONICAL_URL,
    sections: mergedSections,
  };

  return validateCvDocument(document);
}
