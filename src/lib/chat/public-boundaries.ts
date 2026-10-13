const RESTRICTED_TERMS = [
  "parking", "car park", "property management", "property owner", "property manager", "real estate",
  "otopark", "park işlet", "mülk sahip", "mülk yönet", "gayrimenkul", "emlak",
] as const;

export interface PublicBoundaryInput {
  categories?: readonly string[];
  tags?: readonly string[];
  slug?: string;
  title?: string;
  restricted?: boolean;
}

function containsRestrictedTerm(value: string): boolean {
  const normalize = (text: string) => text.normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase("en-US").replace(/[-_]+/gu, " ");
  const normalized = normalize(value);
  return RESTRICTED_TERMS.some((term) => normalized.includes(normalize(term)));
}

export function isRestrictedPublicTopic(input: PublicBoundaryInput): boolean {
  if (input.restricted === true) return true;
  return [...(input.categories ?? []), ...(input.tags ?? []), input.slug ?? "", input.title ?? ""]
    .some(containsRestrictedTerm);
}

export function isChatEligibleArticle(input: PublicBoundaryInput): boolean {
  return !isRestrictedPublicTopic(input);
}

export function isRestrictedCommercialIntent(text: string): boolean {
  if (!containsRestrictedTerm(text)) return false;
  return /\b(consult|consulting|audit|hire|contact|proposal|quote|service|lead|danışman|denet|teklif|iletişim|hizmet)\b/iu.test(text);
}

export function isRestrictedCommercialConversation(messages: readonly { role: string; content: string }[]): boolean {
  const userConversation = messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
  return containsRestrictedTerm(userConversation)
    && /\b(consult|consulting|audit|hire|contact|proposal|quote|service|lead|danışman|denet|teklif|iletişim|hizmet)\w*\b/iu.test(userConversation);
}

export function isRestrictedPublicConversation(messages: readonly { role: string; content: string }[]): boolean {
  return containsRestrictedTerm(messages.filter((message) => message.role === "user").map((message) => message.content).join("\n"));
}

export const PUBLIC_PROFESSIONAL_BOUNDARY = "Public-boundary rule: the reviewed CV and factual employment-history answers may name Premium Parking and its documented role, dates, duties, and parking experience. That narrow employment-history exception does not authorize employer-specific analytics, site or location details, case studies, or inferred data. SMB analytics articles, tutorials, examples, and answers must not name the company or disclose any current or prospective locations, even when retrieved CV evidence names the employer. Parking, property-management, and related real-estate-operations topics are educational only and may use anonymized industry or synthetic examples. For those topics, do not offer consulting or audits, recommend hiring John, collect a lead, select contact tools, or include availability, contact, or project-discovery calls to action. This applies to every entry point and follow-up; generic professional-inquiry guidance cannot override it.";
