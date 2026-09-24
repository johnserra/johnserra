import type { Locale } from "@/types";

export interface FaqCopy {
  prompt: string;
  answer: string;
  citations: readonly string[];
}

export interface FaqShortcut {
  id: string;
  reviewedOn: string;
  expiresOn: string;
  locales: Record<Locale, FaqCopy>;
}

const REVIEWED_ON = "2026-09-24";
const EXPIRES_ON = "2026-12-23";
const MAX_ANSWER_LENGTH = 1200;
const LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/g;

/** John approved this initial EN/TR set and exact wording for issue #41. */
export const FAQ_SHORTCUTS: readonly FaqShortcut[] = [
  {
    id: "supabase-use", reviewedOn: REVIEWED_ON, expiresOn: EXPIRES_ON,
    locales: {
      en: {
        prompt: "How does John use Supabase?",
        answer: "John uses Supabase as the dedicated backend for CareerTalkLab, including PostgreSQL, authentication, row-level security, and Edge Functions. The published project page describes the platform and its architecture. [CareerTalkLab project](https://johnserra.com/projects/careertalklab)",
        citations: ["https://johnserra.com/projects/careertalklab"],
      },
      tr: {
        prompt: "John Supabase'i nasıl kullanıyor?",
        answer: "John, CareerTalkLab'in özel backend'i olarak Supabase kullanıyor; buna PostgreSQL, kimlik doğrulama, satır düzeyinde güvenlik ve Edge Functions dahildir. Yayımlanan proje sayfası platformun mimarisini açıklıyor. [CareerTalkLab projesi](https://johnserra.com/tr/projeler/careertalklab)",
        citations: ["https://johnserra.com/tr/projeler/careertalklab"],
      },
    },
  },
  {
    id: "ai-projects", reviewedOn: REVIEWED_ON, expiresOn: EXPIRES_ON,
    locales: {
      en: {
        prompt: "What AI projects has John built?",
        answer: "John's published projects include CareerTalkLab, which uses AI for lesson generation and writing-feedback drafts; a business-development automation suite that drafts outreach for human review; and this source-cited Digital Twin assistant. These are documented projects, not a claim that every feature is currently available. [CareerTalkLab](https://johnserra.com/projects/careertalklab) · [BD Automation Suite](https://johnserra.com/projects/bd-automation-suite) · [Digital Twin](https://johnserra.com/projects/digital-twin-assistant)",
        citations: ["https://johnserra.com/projects/careertalklab", "https://johnserra.com/projects/bd-automation-suite", "https://johnserra.com/projects/digital-twin-assistant"],
      },
      tr: {
        prompt: "John hangi yapay zekâ projelerini geliştirdi?",
        answer: "John'un yayımlanmış projeleri arasında ders üretimi ve yazılı çalışmalara geri bildirim taslakları için yapay zekâ kullanan CareerTalkLab, insan incelemesine sunulan iletişim taslakları hazırlayan iş geliştirme otomasyon paketi ve kaynak gösteren bu Digital Twin asistanı bulunuyor. Bu, tüm özelliklerin şu anda kullanıma açık olduğu anlamına gelmez. [CareerTalkLab](https://johnserra.com/tr/projeler/careertalklab) · [BD Otomasyon Paketi (İngilizce)](https://johnserra.com/projects/bd-automation-suite) · [Digital Twin (İngilizce)](https://johnserra.com/projects/digital-twin-assistant)",
        citations: ["https://johnserra.com/tr/projeler/careertalklab", "https://johnserra.com/projects/bd-automation-suite", "https://johnserra.com/projects/digital-twin-assistant"],
      },
    },
  },
  {
    id: "services", reviewedOn: REVIEWED_ON, expiresOn: EXPIRES_ON,
    locales: {
      en: {
        prompt: "What services does John offer?",
        answer: "John's published services focus on practical data analytics for small businesses and growing teams: dashboards and KPI reporting, business and operational analysis, reporting automation, and data cleanup or foundations. The services page has an inquiry form if you want to discuss a specific need; current availability is not stated here. [Services](https://johnserra.com/services)",
        citations: ["https://johnserra.com/services"],
      },
      tr: {
        prompt: "John hangi hizmetleri sunuyor?",
        answer: "John'un yayımlanan hizmetleri küçük işletmeler ve büyüyen ekipler için pratik veri analitiğine odaklanıyor: gösterge panoları ve KPI raporlaması, iş ve operasyon analizi, raporlama otomasyonu ve veri temizliği veya veri altyapısı. Belirli bir ihtiyacı görüşmek için hizmetler sayfasındaki formu kullanabilirsiniz; güncel müsaitlik burada doğrulanmıyor. [Hizmetler](https://johnserra.com/tr/hizmetler)",
        citations: ["https://johnserra.com/tr/hizmetler"],
      },
    },
  },
  {
    id: "documented-experience", reviewedOn: REVIEWED_ON, expiresOn: EXPIRES_ON,
    locales: {
      en: {
        prompt: "What documented experience does John have?",
        answer: "John's published CV documents experience in business development, operations, manufacturing, international sales, account management, and language education. He has taught and has led curriculum and teacher development. The CV does not establish whether he is teaching now; if that matters, ask him directly. [Professional CV](https://johnserra.com/cv/john-serra.en.md) · [Contact John](https://johnserra.com/contact)",
        citations: ["https://johnserra.com/cv/john-serra.en.md", "https://johnserra.com/contact"],
      },
      tr: {
        prompt: "John'un belgelenmiş deneyimi nedir?",
        answer: "John'un yayımlanan özgeçmişi iş geliştirme, operasyon, üretim, uluslararası satış, müşteri yönetimi ve dil eğitimi alanlarındaki deneyimini belgeliyor. Daha önce ders verdi; ayrıca müfredat ve öğretmen gelişimi çalışmalarını yönetti. Özgeçmişi şu anda ders verip vermediğini doğrulamıyor; bunu öğrenmek için kendisine doğrudan sorabilirsiniz. [Profesyonel özgeçmiş (İngilizce)](https://johnserra.com/cv/john-serra.en.md) · [John'a ulaşın](https://johnserra.com/tr/contact)",
        citations: ["https://johnserra.com/cv/john-serra.en.md", "https://johnserra.com/tr/contact"],
      },
    },
  },
  {
    id: "contact", reviewedOn: REVIEWED_ON, expiresOn: EXPIRES_ON,
    locales: {
      en: {
        prompt: "How can I contact John?",
        answer: "You can use the contact form, email John at john@serra.us, or connect on LinkedIn. These are public contact options; this assistant cannot send a message for you. [Contact John](https://johnserra.com/contact)",
        citations: ["https://johnserra.com/contact"],
      },
      tr: {
        prompt: "John'a nasıl ulaşabilirim?",
        answer: "İletişim formunu kullanabilir, John'a john@serra.us adresinden e-posta gönderebilir veya LinkedIn üzerinden bağlantı kurabilirsiniz. Bunlar herkese açık iletişim seçenekleridir; bu asistan sizin adınıza mesaj gönderemez. [John'a ulaşın](https://johnserra.com/tr/contact)",
        citations: ["https://johnserra.com/tr/contact"],
      },
    },
  },
];

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function canonicalCitation(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === "https://johnserra.com"
      && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.startsWith("/") && !url.pathname.includes("//")
      && url.href === value;
  } catch {
    return false;
  }
}

export function validateFaqShortcuts(entries: readonly unknown[], today = new Date()): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const day = today.toISOString().slice(0, 10);
  for (const [index, raw] of entries.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`entry ${index}: malformed`);
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const id = entry.id;
    if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      errors.push(`entry ${index}: invalid id`);
    } else if (seen.has(id)) {
      errors.push(`entry ${index}: duplicate id ${id}`);
    } else {
      seen.add(id);
    }
    if (!validDate(entry.reviewedOn) || !validDate(entry.expiresOn)
      || (validDate(entry.reviewedOn) && entry.reviewedOn > day)
      || (validDate(entry.expiresOn) && entry.expiresOn < day)
      || (validDate(entry.reviewedOn) && validDate(entry.expiresOn) && (
        entry.expiresOn < entry.reviewedOn
        || Date.parse(`${entry.expiresOn}T00:00:00Z`) - Date.parse(`${entry.reviewedOn}T00:00:00Z`) > 90 * 86_400_000
      ))) {
      errors.push(`entry ${index}: stale or invalid review dates`);
    }
    const locales = entry.locales;
    if (!locales || typeof locales !== "object" || Array.isArray(locales)) {
      errors.push(`entry ${index}: missing locales`);
      continue;
    }
    for (const locale of ["en", "tr"] as const) {
      const copy = (locales as Record<string, unknown>)[locale];
      if (!copy || typeof copy !== "object" || Array.isArray(copy)) {
        errors.push(`entry ${index}: missing ${locale} locale`);
        continue;
      }
      const fields = copy as Record<string, unknown>;
      if (typeof fields.prompt !== "string" || !fields.prompt.trim() || fields.prompt.length > 160) {
        errors.push(`entry ${index}: invalid ${locale} prompt`);
      }
      if (typeof fields.answer !== "string" || !fields.answer.trim() || fields.answer.length > MAX_ANSWER_LENGTH) {
        errors.push(`entry ${index}: invalid ${locale} answer`);
        continue;
      }
      const citations = fields.citations;
      const links = [...fields.answer.matchAll(LINK_PATTERN)].map((match) => match[1]);
      if (!Array.isArray(citations) || citations.length === 0
        || citations.some((citation) => !canonicalCitation(citation))
        || links.length !== citations.length
        || links.some((link, linkIndex) => link !== citations[linkIndex])) {
        errors.push(`entry ${index}: invalid ${locale} citations`);
      }
    }
  }
  return errors;
}

export function getFaqShortcuts(locale: string, today = new Date()): Array<{ id: string; prompt: string; answer: string }> {
  if (locale !== "en" && locale !== "tr") return [];
  if (validateFaqShortcuts(FAQ_SHORTCUTS, today).length) return [];
  return FAQ_SHORTCUTS.map(({ id, locales }) => ({ id, ...locales[locale] }));
}

export function createFaqExchange(
  shortcut: { prompt: string; answer: string },
  userId: string,
  assistantId: string,
): [{ id: string; role: "user"; content: string }, { id: string; role: "assistant"; content: string }] {
  return [
    { id: userId, role: "user", content: shortcut.prompt },
    { id: assistantId, role: "assistant", content: shortcut.answer },
  ];
}
