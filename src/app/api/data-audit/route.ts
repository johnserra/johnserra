import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase";
import {
  ASSESSMENT_VERSION,
  FLAG_IDS,
  PILLARS,
  SCORED_QUESTION_IDS,
  type ActionId,
  type RedFlagAnswers,
  type ScoredAnswers,
  isActionId,
  isBarrier,
  isBusinessContext,
  isFlagId,
  isFlagResponse,
  isMaturityBand,
  isScoredQuestionId,
  isScoredResponse,
  scoreAssessment,
} from "@/lib/data-audit";
import enMessages from "../../../../messages/en.json";
import trMessages from "../../../../messages/tr.json";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length > 0 && cleaned.length <= maxLength ? cleaned : null;
}

function cleanOptionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === "") return undefined;
  return cleanString(value, maxLength);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidWebsite(value: string | null | undefined): boolean {
  if (value === undefined) return true;
  if (value === null) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseAnswers(value: unknown): ScoredAnswers | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== SCORED_QUESTION_IDS.length || !keys.every(isScoredQuestionId)) return null;
  if (!SCORED_QUESTION_IDS.every((id) => isScoredResponse(value[id]))) return null;
  return Object.fromEntries(SCORED_QUESTION_IDS.map((id) => [id, value[id]])) as ScoredAnswers;
}

function parseRedFlags(value: unknown): RedFlagAnswers | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== FLAG_IDS.length || !keys.every(isFlagId)) return null;
  if (!FLAG_IDS.every((id) => isFlagResponse(value[id]))) return null;
  return Object.fromEntries(FLAG_IDS.map((id) => [id, value[id]])) as RedFlagAnswers;
}

function hasValidSubmittedResultShape(result: unknown): result is JsonRecord {
  if (!isRecord(result) || result.version !== ASSESSMENT_VERSION || result.complete !== true) return false;
  if (!parseAnswers(result.answers) || !parseRedFlags(result.redFlags)) return false;
  if (!isRecord(result.pillarScores) || Object.keys(result.pillarScores).length !== PILLARS.length) return false;
  if (!PILLARS.every((pillar) => typeof result.pillarScores === "object"
    && Number.isFinite((result.pillarScores as JsonRecord)[pillar])
    && Number((result.pillarScores as JsonRecord)[pillar]) >= 0
    && Number((result.pillarScores as JsonRecord)[pillar]) <= 100)) return false;
  if (!isMaturityBand(result.rawMaturity) || !isMaturityBand(result.displayedMaturity)) return false;
  if (!isBarrier(result.barrier)) return false;
  if (!Array.isArray(result.actionIds)
    || result.actionIds.length !== 3
    || !result.actionIds.every(isActionId)
    || new Set(result.actionIds).size !== 3) return false;
  if (!Array.isArray(result.triggeredFlagIds) || !result.triggeredFlagIds.every(isFlagId)) return false;
  if (result.triggeredFlagIds.length > FLAG_IDS.length
    || new Set(result.triggeredFlagIds).size !== result.triggeredFlagIds.length) return false;
  return typeof result.overallScore === "number" && Number.isFinite(result.overallScore);
}

function splitName(name: string) {
  const parts = name.split(/\s+/);
  return { fname: parts[0], lname: parts.slice(1).join(" ") };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function syncJetpackCrm(input: {
  firstName: string;
  email: string;
  company: string;
  tags: string[];
}) {
  const endpoint = process.env.JETPACK_CRM_API_URL;
  const apiKey = process.env.JETPACK_CRM_API_KEY;
  const apiSecret = process.env.JETPACK_CRM_API_SECRET;
  if (!endpoint || !apiKey || !apiSecret) return;

  const url = new URL("create_customer", endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("api_secret", apiSecret);
  const { fname, lname } = splitName(input.firstName);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      fname,
      lname,
      company: input.company,
      status: "Lead",
      tags: input.tags,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("CRM request failed");
}

function actionLines(locale: "en" | "tr", actionIds: ActionId[]): string {
  const catalog = locale === "tr" ? trMessages.DataAudit : enMessages.DataAudit;
  return actionIds.map((actionId, index) => {
    const action = catalog.actions[actionId];
    return `${index + 1}. ${action.title}\n${action.whatToDo}`;
  }).join("\n\n");
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!isRecord(body)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const firstName = cleanString(body.firstName, 80);
  const email = cleanString(body.email, 254);
  const company = cleanString(body.company, 120);
  const website = cleanOptionalString(body.website, 240);
  const locale = body.locale === "tr" ? "tr" : body.locale === "en" ? "en" : null;
  if (!firstName || !email || !company || !locale || body.consent !== true
    || !isValidEmail(email) || !isValidWebsite(website)
    || !isBusinessContext(body.context) || !hasValidSubmittedResultShape(body.result)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const answers = parseAnswers(body.result.answers);
  const redFlags = parseRedFlags(body.result.redFlags);
  if (!answers || !redFlags) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const recomputed = scoreAssessment(answers, redFlags);
  if (!recomputed.complete) return NextResponse.json({ error: "incomplete_assessment" }, { status: 400 });

  const summary = [
    "SMB Analytics Health Assessment",
    `Version: ${recomputed.version}`,
    `Company: ${company}`,
    website ? `Website: ${website}` : null,
    `Context: ${body.context.role}; ${body.context.employeeBand} employees; ${body.context.revenueBand}; outcome ${body.context.primaryOutcome}`,
    `Score: ${recomputed.overallScore}/100`,
    `Maturity: ${recomputed.displayedMaturity} (raw: ${recomputed.rawMaturity})`,
    `Barrier: ${recomputed.barrier}`,
    `Pillars: ${PILLARS.map((pillar) => `${pillar} ${Math.round(recomputed.pillarScores[pillar])}`).join(", ")}`,
    `Triggered flags: ${recomputed.triggeredFlagIds.length ? recomputed.triggeredFlagIds.join(", ") : "none"}`,
    `Actions: ${recomputed.actionIds.join(", ")}`,
  ].filter((line): line is string => Boolean(line)).join("\n");

  const supabase = createAdminClient();
  const { error: storageError } = await supabase.from("contact_messages").insert([{
    name: firstName,
    email,
    message: summary,
  }]);
  if (storageError) {
    console.error("Data audit lead storage failed");
    return NextResponse.json({ error: "submission_failed" }, { status: 500 });
  }

  const tags = [
    "data-audit-lead",
    `maturity-${slug(recomputed.displayedMaturity)}`,
    `barrier-${recomputed.barrierPillar}`,
    `cta-${recomputed.ctaRoute}`,
  ];
  const visitorCatalog = locale === "tr" ? trMessages.DataAudit : enMessages.DataAudit;
  const localizedMaturity = visitorCatalog.maturity[recomputed.displayedMaturity];
  const localizedBarrier = visitorCatalog.barriers[recomputed.barrierPillar];
  const copy = locale === "tr"
    ? {
        subject: "Veri analitiği değerlendirme sonuçlarınız",
        hello: `Merhaba ${firstName},`,
        summary: `Genel puanınız ${recomputed.overallScore}/100, olgunluk düzeyiniz ${localizedMaturity}. Öncelikli gelişim alanınız: ${localizedBarrier}.`,
        next: "Önerilen sonraki adımlar:",
        close: "Bu öz değerlendirme bir başlangıç noktasıdır; sistemlerinizin veya verilerinizin bağımsız bir denetimi değildir.",
      }
    : {
        subject: "Your analytics health assessment results",
        hello: `Hi ${firstName},`,
        summary: `Your overall score is ${recomputed.overallScore}/100 and your maturity is ${localizedMaturity}. Your priority area is ${localizedBarrier}.`,
        next: "Recommended next steps:",
        close: "This self-assessment is a starting point, not an independent audit of your systems or data.",
      };
  const resultsUrl = `https://johnserra.com${locale === "tr" ? "/tr/veri-denetimi" : "/data-audit"}`;
  const visitorText = `${copy.hello}\n\n${copy.summary}\n\n${copy.next}\n\n${actionLines(locale, recomputed.actionIds)}\n\n${copy.close}\n\n${resultsUrl}`;

  const deliveries: Promise<unknown>[] = [
    syncJetpackCrm({ firstName, email, company, tags }),
  ];
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    deliveries.push(
      resend.emails.send({
        from: "Data Audit <contact@cantactform.serra.us>",
        to: "john@serra.us",
        replyTo: email,
        subject: `Analytics assessment lead: ${company}`,
        text: `Name: ${firstName}\nEmail: ${email}\n${summary}`,
      }).then((response) => {
        if (response.error) throw new Error("Internal email request failed");
      }),
      resend.emails.send({
        from: "John Serra <contact@cantactform.serra.us>",
        to: email,
        subject: copy.subject,
        text: visitorText,
      }).then((response) => {
        if (response.error) throw new Error("Visitor email request failed");
      }),
    );
  }

  const deliveryResults = await Promise.allSettled(deliveries);
  deliveryResults.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`Data audit secondary delivery failed (${index === 0 ? "crm" : "email"})`);
    }
  });

  return NextResponse.json({ success: true });
}
