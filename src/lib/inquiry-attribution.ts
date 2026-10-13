export const INQUIRY_ATTRIBUTION_STORAGE_KEY = "johnserra.inquiry-attribution.v2";
const LEGACY_INQUIRY_ATTRIBUTION_STORAGE_KEY = "johnserra.inquiry-attribution.v1";

export type InquirySource = "contact" | "services" | "data-audit";

export interface InquiryAttribution {
  landingPath: string;
  submissionPath: string;
  source: InquirySource;
  referralHost?: string;
  context?: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface LandingAttribution {
  landingPath: string;
  referralHost?: string;
}

const SOURCES = new Set<InquirySource>(["contact", "services", "data-audit"]);
const MAX_PATH = 160;
const MAX_HOST = 120;
const MAX_CONTEXT = 80;

export function normalizeLocalPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  if (!value.startsWith("/") || value.startsWith("//") || /^(?:javascript|data|vbscript):/iu.test(value)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value, "https://johnserra.com");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://johnserra.com" || parsed.username || parsed.password) return null;
  const path = parsed.pathname.replace(/\/{2,}/g, "/");
  return path.length <= MAX_PATH && /^\/(?:[\p{L}\p{N}._~!$&'()*+,;=:@%-]+\/?)*$/u.test(path) ? path : null;
}

export function normalizeReferralHost(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_HOST) return undefined;
  const host = value.toLowerCase().replace(/\.$/u, "");
  return /^(?=.{1,120}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(host)
    ? host
    : undefined;
}

export function referralHostFromUrl(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return normalizeReferralHost(url.hostname);
  } catch {
    return undefined;
  }
}

function normalizeContext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const context = value.trim();
  return context.length > 0 && context.length <= MAX_CONTEXT && /^[a-z0-9 _.-]+$/iu.test(context)
    ? context
    : undefined;
}

export function parseInquiryAttribution(value: unknown): InquiryAttribution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const landingPath = normalizeLocalPath(record.landingPath);
  const submissionPath = normalizeLocalPath(record.submissionPath);
  if (!landingPath || !submissionPath || typeof record.source !== "string" || !SOURCES.has(record.source as InquirySource)) return null;
  const referralHost = normalizeReferralHost(record.referralHost);
  const context = normalizeContext(record.context);
  if (record.referralHost !== undefined && !referralHost) return null;
  if (record.context !== undefined && !context) return null;
  return { landingPath, submissionPath, source: record.source as InquirySource, ...(referralHost ? { referralHost } : {}), ...(context ? { context } : {}) };
}

function parseLandingAttribution(value: string | null): LandingAttribution | null {
  if (!value) return null;
  try {
    const record = JSON.parse(value) as Record<string, unknown>;
    const landingPath = normalizeLocalPath(record.landingPath);
    const referralHost = normalizeReferralHost(record.referralHost);
    if (!landingPath || (record.referralHost !== undefined && !referralHost)) return null;
    return { landingPath, ...(referralHost ? { referralHost } : {}) };
  } catch {
    const landingPath = normalizeLocalPath(value);
    return landingPath ? { landingPath } : null;
  }
}

export function readOrCreateLandingAttribution(storage: StorageLike | null, currentPath: string, referrer = ""): LandingAttribution {
  const fallback = normalizeLocalPath(currentPath) ?? "/";
  const referralHost = referralHostFromUrl(referrer);
  const created = { landingPath: fallback, ...(referralHost && referralHost !== "johnserra.com" ? { referralHost } : {}) };
  if (!storage) return created;
  try {
    const existing = parseLandingAttribution(storage.getItem(INQUIRY_ATTRIBUTION_STORAGE_KEY));
    if (existing) return existing;
    const legacy = parseLandingAttribution(storage.getItem(LEGACY_INQUIRY_ATTRIBUTION_STORAGE_KEY));
    const value = legacy ?? created;
    storage.setItem(INQUIRY_ATTRIBUTION_STORAGE_KEY, JSON.stringify(value));
    return value;
  } catch {
    return created;
  }
}

export function readOrCreateLandingPath(storage: StorageLike | null, currentPath: string): string {
  return readOrCreateLandingAttribution(storage, currentPath).landingPath;
}

export function browserInquiryAttribution(source: InquirySource, context?: string): InquiryAttribution {
  const submissionPath = normalizeLocalPath(window.location.pathname) ?? "/";
  let storage: StorageLike | null = null;
  try { storage = window.sessionStorage; } catch { /* privacy mode */ }
  const landing = readOrCreateLandingAttribution(storage, submissionPath, document.referrer);
  return parseInquiryAttribution({ ...landing, submissionPath, source, context })
    ?? { landingPath: landing.landingPath, submissionPath, source };
}

export function formatAttributionLines(attribution: InquiryAttribution): string[] {
  return [
    "[Attribution]",
    `Landing path: ${attribution.landingPath}`,
    `Submission path: ${attribution.submissionPath}`,
    `Form kind: ${attribution.source}`,
    attribution.referralHost ? `Referral host: ${attribution.referralHost}` : "Referral host: direct/unknown",
    attribution.context ? `Referral context: ${attribution.context}` : null,
    "[/Attribution]",
  ].filter((line): line is string => Boolean(line));
}

export function pathClass(path: string): string {
  const normalized = normalizeLocalPath(path) ?? "/";
  const parts = normalized.split("/").filter(Boolean);
  const first = parts[0] === "tr" ? parts[1] : parts[0];
  if (!first) return "home";
  if (["contact", "iletisim"].includes(first)) return "contact";
  if (["services", "hizmetler"].includes(first)) return "services";
  if (["data-audit", "veri-denetimi"].includes(first)) return "data-audit";
  if (["blog"].includes(first)) return "blog";
  if (["projects", "projeler"].includes(first)) return "projects";
  return "other";
}

export function completionAnalyticsPayload(attribution: InquiryAttribution) {
  const canonicalPath = normalizeLocalPath(attribution.submissionPath) ?? "/";
  return {
    form_kind: attribution.source,
    landing_path_class: pathClass(attribution.landingPath),
    submission_path_class: pathClass(attribution.submissionPath),
    page_location: `https://johnserra.com${canonicalPath}`,
    page_referrer: "",
  };
}

export function trackInquiryCompletion(attribution: InquiryAttribution): void {
  try {
    const analyticsWindow = window as Window & { gtag?: (command: "event", name: string, values: Record<string, string>) => void };
    analyticsWindow.gtag?.("event", "inquiry_completed", completionAnalyticsPayload(attribution));
  } catch {
    // Analytics is best-effort and must never affect a successful submission.
  }
}
