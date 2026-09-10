import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeHtmlEntities } from "../../src/lib/wordpress/normalize";
import { SOURCE_SCHEMA_VERSION, validateSourceManifest } from "./schema";

interface RawSource {
  id: number;
  type: "post" | "page" | "js_project";
  slug: string;
  status: string;
  modified_gmt: string;
  title: { rendered: string };
  content: { rendered: string };
  acf: { locale: "en" | "tr" };
}

interface RawExport {
  fetchedAt: string;
  sources: RawSource[];
}

const EXCERPTS: Record<number, Array<{ id: string; text: string }>> = {
  42: [
    { id: "pedagogically-wrong", text: "Not factually wrong. Pedagogically wrong." },
    { id: "three-layer-pattern", text: "constrained generation, evaluated generation, observed generation" },
  ],
  59: [
    { id: "current-roles-tr", text: "Sabahları bir kentsel mobilite şirketinde operasyon birimindeyim" },
    { id: "factory-1998-tr", text: "1998 yılında, gıda ambalajı sektöründe sıfırdan bir üretim tesisi kurdum." },
    { id: "iso-systems-tr", text: "üç klasör (ISO 9001, ISO 22000 ve ISO 14001)" },
  ],
  37: [
    { id: "current-roles", text: "mornings in Operations at an urban mobility company" },
    { id: "factory-1998", text: "In 1998, I built a production facility from a green site in the food packaging sector" },
    { id: "iso-systems", text: "three binders — ISO 9001, ISO 22000, and ISO 14001" },
  ],
  46: [
    { id: "correction-production", text: "seeing a correction is not the same as producing it" },
    { id: "errorless-engine", text: "Our engine is built on a behavioral science principle called Errorless Teaching." },
  ],
  45: [
    { id: "data-narration", text: "The core skill they were missing wasn't grammar — it was data narration." },
    { id: "high-fidelity-sandbox", text: "We don't need more \"chatbots.\" We need a High-Fidelity Sandbox." },
  ],
  44: [
    { id: "register-gap", text: "The problem isn't vocabulary. It's register." },
    { id: "professional-impact", text: "the narrative — the part that gets you promoted, that gets your project funded, that gets leadership to understand why your team matters" },
  ],
  32: [
    { id: "four-phases", text: "At CareerTalkLab, we've systematized it into four phases" },
    { id: "phase-receptive", text: "Phase 1 — Receptive Orientation" },
    { id: "phase-recognition", text: "Phase 2 — Guided Recognition" },
    { id: "phase-production", text: "Phase 3 — Guided Production" },
    { id: "phase-independent", text: "Phase 4 — Independent Performance" },
    { id: "guided-production-target", text: "Our target: 80%+ success rate." },
  ],
  27: [
    { id: "cross-industry-story", text: "I don't have a linear career path; I have a toolkit built across industries." },
    { id: "three-domains", text: "I've led the re-engineering of a patented manufacturing process for a national food packaging company." },
    { id: "current-mobility", text: "Today, I develop new markets and strategic partnerships in the urban mobility space." },
  ],
  54: [
    { id: "cross-industry-story-tr", text: "Doğrusal bir kariyer yolum yok; sektörler arası oluşturulmuş bir araç setim var." },
    { id: "current-mobility-tr", text: "Bugün, kentsel mobilite alanında yeni pazarlar ve stratejik ortaklıklar geliştiriyorum." },
  ],
  51: [
    { id: "ctl-solution", text: "CareerTalkLab is a standalone hybrid LMS at careertalklab.com." },
    { id: "ctl-stack", text: "CareerTalkLab is a Next.js 16.1 project with its own domain, PWA support via Serwist, and a dedicated Supabase backend." },
    { id: "ctl-curriculum-counts", text: "31-Lesson A1 Foundation: A complete sequence from Pre-A1 to A1 functional independence. 21-Lesson A2 Course" },
    { id: "ctl-exam-roadmap", text: "Exam Track (Roadmap) — IELTS/TOEFL candidates" },
  ],
  64: [
    { id: "ctl-solution-tr", text: "CareerTalkLab, careertalklab.com adresinde yer alan bağımsız bir hibrit LMS'dir." },
    { id: "ctl-stack-tr", text: "CareerTalkLab, kendi alan adına, Serwist aracılığıyla PWA desteğine ve özel bir Supabase backend'ine sahip bir Next.js 16.1 projesidir." },
  ],
  49: [
    { id: "seven-modules", text: "The suite runs as seven discrete modules" },
    { id: "odoo-dry-run", text: "All modules write to Odoo CRM as the central data hub. All modules support --dry-run ." },
    { id: "human-loop", text: "Nothing is ever sent automatically. The automation handles the research and drafting; a person handles the relationship." },
  ],
  63: [
    { id: "seven-modules-tr", text: "Paket, her biri işleme hattının (pipeline) bir aşamasından sorumlu olan yedi bağımsız modül olarak çalışır" },
    { id: "odoo-dry-run-tr", text: "Tüm modüller, merkezi veri merkezi olarak Odoo CRM'e yazar. Tüm modüller --dry-run" },
    { id: "human-loop-tr", text: "Hiçbir şey asla otomatik olarak gönderilmez. Otomasyon araştırma ve taslak hazırlama işini halleder; insan ise ilişkiyi yönetir." },
  ],
  53: [
    { id: "march-2020", text: "In March 2020, the language school where I served as Education Coordinator shut its doors overnight." },
    { id: "led-transition", text: "I led the complete transition of the school's operations from paper-based to a live online learning environment." },
  ],
  65: [
    { id: "march-2020-tr", text: "Mart 2020'de, Eğitim Koordinatörü olarak görev yaptığım dil okulu kapılarını bir gecede kapattı." },
    { id: "led-transition-tr", text: "Okul operasyonlarının kağıt tabanlı sistemden canlı çevrimiçi öğrenme ortamına tam geçişine liderlik ettim." },
  ],
};

export function normalizePublishedHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function canonicalUrl(source: RawSource): string {
  const prefix = source.acf.locale === "tr" ? "/tr" : "";
  if (source.type === "page") return `https://johnserra.com${prefix}${source.acf.locale === "tr" ? "/hakkimda" : "/about"}`;
  if (source.type === "js_project") return `https://johnserra.com${prefix}${source.acf.locale === "tr" ? "/projeler" : "/projects"}/${source.slug}`;
  return `https://johnserra.com${prefix}/blog/${source.slug}`;
}

export function buildSourceManifest(raw: RawExport) {
  if (!raw || !Array.isArray(raw.sources) || typeof raw.fetchedAt !== "string") throw new Error("Invalid public WordPress export.");
  const professionalSources = raw.sources.filter((source) => EXCERPTS[source.id]);
  if (professionalSources.length !== Object.keys(EXCERPTS).length) throw new Error("Public export is missing a required professional source.");
  const sources = professionalSources.map((source) => {
    if (source.status !== "publish" || !["en", "tr"].includes(source.acf?.locale)) {
      throw new Error(`WordPress source ${source.id} is not a valid published EN/TR record.`);
    }
    const normalized = normalizePublishedHtml(source.content.rendered);
    for (const excerpt of EXCERPTS[source.id]) {
      if (!normalized.includes(excerpt.text)) throw new Error(`Excerpt ${source.id}#${excerpt.id} is absent after normalization.`);
    }
    return {
      sourceId: `wordpress/${source.type}/${source.id}/${source.acf.locale}`,
      wordpressId: source.id,
      type: source.type,
      slug: source.slug,
      title: decodeHtmlEntities(source.title.rendered),
      locale: source.acf.locale,
      canonicalUrl: canonicalUrl(source),
      wordpressModifiedAt: `${source.modified_gmt}Z`,
      fetchedAt: raw.fetchedAt,
      contentHash: `sha256:${createHash("sha256").update(normalized).digest("hex")}`,
      excerpts: EXCERPTS[source.id],
    };
  });
  return validateSourceManifest({
    schemaVersion: SOURCE_SCHEMA_VERSION,
    generatedAt: raw.fetchedAt,
    normalization: "Indexer-compatible HTML normalization: remove script/style blocks and tags, collapse whitespace, trim, then decode supported named and numeric HTML entities.",
    scope: "Published professional biography, projects, and viewpoints only. Cooking and recipe evidence is intentionally excluded.",
    sources,
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 && args.length !== 4) throw new Error("Usage: refresh-sources.ts --input FILE [--output FILE]");
  if (args[0] !== "--input" || (args.length === 4 && args[2] !== "--output")) throw new Error("Usage: refresh-sources.ts --input FILE [--output FILE]");
  const input = path.resolve(args[1]);
  const output = path.resolve(args[3] ?? "evals/assistant/sources.json");
  const raw = JSON.parse(await readFile(input, "utf8")) as RawExport;
  const manifest = buildSourceManifest(raw);
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${manifest.sources.length} professional sources to ${output}.`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  await main();
}
