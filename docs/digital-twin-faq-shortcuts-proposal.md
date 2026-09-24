# Issue #41: approved bilingual FAQ shortcuts

Approved by John on 2026-09-24 for implementation. These are the approved visitor-facing prompts and exact answer copy. Links are the citations to render with each answer. The English CV is cited in Turkish where no reviewed Turkish CV is published. The Digital Twin project currently has only a published English page.

## 1. `supabase-use`

EN prompt: How does John use Supabase?

EN answer: John uses Supabase as the dedicated backend for CareerTalkLab, including PostgreSQL, authentication, row-level security, and Edge Functions. The published project page describes the platform and its architecture. [CareerTalkLab project](https://johnserra.com/projects/careertalklab)

TR prompt: John Supabase'i nasıl kullanıyor?

TR answer: John, CareerTalkLab'in özel backend'i olarak Supabase kullanıyor; buna PostgreSQL, kimlik doğrulama, satır düzeyinde güvenlik ve Edge Functions dahildir. Yayımlanan proje sayfası platformun mimarisini açıklıyor. [CareerTalkLab projesi](https://johnserra.com/tr/projeler/careertalklab)

## 2. `ai-projects`

EN prompt: What AI projects has John built?

EN answer: John's published projects include CareerTalkLab, which uses AI for lesson generation and writing-feedback drafts; a business-development automation suite that drafts outreach for human review; and this source-cited Digital Twin assistant. These are documented projects, not a claim that every feature is currently available. [CareerTalkLab](https://johnserra.com/projects/careertalklab) · [BD Automation Suite](https://johnserra.com/projects/bd-automation-suite) · [Digital Twin](https://johnserra.com/projects/digital-twin-assistant)

TR prompt: John hangi yapay zekâ projelerini geliştirdi?

TR answer: John'un yayımlanmış projeleri arasında ders üretimi ve yazılı çalışmalara geri bildirim taslakları için yapay zekâ kullanan CareerTalkLab, insan incelemesine sunulan iletişim taslakları hazırlayan iş geliştirme otomasyon paketi ve kaynak gösteren bu Digital Twin asistanı bulunuyor. Bu, tüm özelliklerin şu anda kullanıma açık olduğu anlamına gelmez. [CareerTalkLab](https://johnserra.com/tr/projeler/careertalklab) · [BD Otomasyon Paketi (İngilizce)](https://johnserra.com/projects/bd-automation-suite) · [Digital Twin (İngilizce)](https://johnserra.com/projects/digital-twin-assistant)

## 3. `services`

EN prompt: What services does John offer?

EN answer: John's published services focus on practical data analytics for small businesses and growing teams: dashboards and KPI reporting, business and operational analysis, reporting automation, and data cleanup or foundations. The services page has an inquiry form if you want to discuss a specific need; current availability is not stated here. [Services](https://johnserra.com/services)

TR prompt: John hangi hizmetleri sunuyor?

TR answer: John'un yayımlanan hizmetleri küçük işletmeler ve büyüyen ekipler için pratik veri analitiğine odaklanıyor: gösterge panoları ve KPI raporlaması, iş ve operasyon analizi, raporlama otomasyonu ve veri temizliği veya veri altyapısı. Belirli bir ihtiyacı görüşmek için hizmetler sayfasındaki formu kullanabilirsiniz; güncel müsaitlik burada doğrulanmıyor. [Hizmetler](https://johnserra.com/tr/hizmetler)

## 4. `documented-experience`

EN prompt: What documented experience does John have?

EN answer: John's published CV documents experience in business development, operations, manufacturing, international sales, account management, and language education. He has taught and has led curriculum and teacher development. The CV does not establish whether he is teaching now; if that matters, ask him directly. [Professional CV](https://johnserra.com/cv/john-serra.en.md) · [Contact John](https://johnserra.com/contact)

TR prompt: John'un belgelenmiş deneyimi nedir?

TR answer: John'un yayımlanan özgeçmişi iş geliştirme, operasyon, üretim, uluslararası satış, müşteri yönetimi ve dil eğitimi alanlarındaki deneyimini belgeliyor. Daha önce ders verdi; ayrıca müfredat ve öğretmen gelişimi çalışmalarını yönetti. Özgeçmişi şu anda ders verip vermediğini doğrulamıyor; bunu öğrenmek için kendisine doğrudan sorabilirsiniz. [Profesyonel özgeçmiş (İngilizce)](https://johnserra.com/cv/john-serra.en.md) · [John'a ulaşın](https://johnserra.com/tr/contact)

## 5. `contact`

EN prompt: How can I contact John?

EN answer: You can use the contact form, email John at john@serra.us, or connect on LinkedIn. These are public contact options; this assistant cannot send a message for you. [Contact John](https://johnserra.com/contact)

TR prompt: John'a nasıl ulaşabilirim?

TR answer: İletişim formunu kullanabilir, John'a john@serra.us adresinden e-posta gönderebilir veya LinkedIn üzerinden bağlantı kurabilirsiniz. Bunlar herkese açık iletişim seçenekleridir; bu asistan sizin adınıza mesaj gönderemez. [John'a ulaşın](https://johnserra.com/tr/contact)

## Guardrails for implementation

- Selection should append the prompt and exact approved answer to chat history without calling `/api/chat`; a later free-text follow-up should take the existing evidence-only agent route.
- Registry validation should reject missing locales, duplicate IDs, oversized answers, expired review dates, and unsafe or noncanonical links. If an item is invalid, omit it rather than serve questionable copy.
- Record only shortcut ID, locale, and outcome in analytics, never prompt or answer text.
- Re-review the copy and source links by 2026-12-23 or disable stale shortcuts until re-approved.
