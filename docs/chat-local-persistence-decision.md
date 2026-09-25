# Issue #39 — browser-local conversation retention decision

Status: **approved by John on 2026-09-24 for issue #39 implementation.**
Prepared: 2026-09-24. Applies to the English and Turkish Digital Assistant on johnserra.com.

## Decision and purpose

Offer an optional **“Save conversations on this browser”** control, off by default. Its only purpose is to let a visitor resume recent assistant conversations after a reload in the same browser profile on the same origin/device. Choosing it records consent first, then saves the conversation already visible and subsequent completed exchanges. A visitor can continue using the assistant without opting in. This is not an account, cross-device sync, an owner inbox, or a server transcript archive.

This is an approved product/privacy design decision, not a legal conclusion about lawful basis in every visitor's jurisdiction. The public notice will explain the choice before it is offered. We will not claim the local copy is encrypted, inaccessible to scripts on this origin, or guaranteed to survive browser cleanup/private-browsing exit. Browser-local storage is origin-scoped and normally survives browser sessions, but can be unavailable or cleared by browser policy or the visitor. [MDN: localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

## Exact data stored

One versioned `localStorage` record on the site's HTTPS origin:

- Schema version and consent: enabled timestamp and last completed-message timestamp.
- Up to **five** conversations: random conversation UUID (not a person/account ID), locale (`en` or `tr`), created/updated/expiry timestamps, and at most **20 completed user/assistant messages** per conversation. Message fields are only role and text content; the text includes any citation Markdown already visible in an answer.
- Active conversation UUID so the same conversation can reopen after reload.
- Maximum serialized record size: **128 KiB**. Each message is limited to the chat API's existing 8 KiB UTF-8 cap; persisted input for follow-ups must still obey the API's 21-message and 32 KiB aggregate input limits. Older completed pairs are removed as needed to stay within the limits; if a safe bounded write still fails, the UI says the conversation was not saved rather than claiming success.

No welcome message, partial/failed answer, IP address, browser fingerprint, rate-limit session UUID, name/email, provider/tool trace, retrieval packet, contact-form data, or arbitrary analytics ID is added to this record. No transcript text is sent to analytics. The existing `sessionStorage` rate-limit UUID remains separate and is not a conversation identifier.

## Retention and visitor deletion

- Conversations expire **30 days after their most recent completed exchange** (rolling from activity, not from page opens). Expired, malformed, oversized, or unsupported-version records are removed on the next visit/read; browser storage does not provide a background deletion timer while the site is closed.
- The consent setting also expires after 30 days without a completed exchange; after that, saving returns to off until the visitor opts in again.
- **New conversation:** opens a blank chat while retaining older saved conversations within the five-conversation cap. When a sixth is saved, remove the oldest by last activity.
- **Delete this conversation:** remove the active saved conversation and clear the visible chat. Other saved conversations and opt-in remain.
- **Delete all saved conversations / turn off saving:** remove every locally saved chat and the consent setting, clear the visible chat, and keep saving off.
- Clearing this site's browser data or using the browser's storage controls also deletes the local copy. These controls cannot delete a request already sent to Gemini or platform logs governed by their own terms.

## Access, auditability, and failures

The local transcript can be read by someone with access to that browser profile/device and by scripts executing on johnserra.com; it is not end-to-end encrypted. John has no owner/admin view of the local copy, and no server-side transcript table or export is created. There is no server audit trail for local reads/deletes. The application can test its storage operations, but should not log transcript text or message contents. Existing privacy-safe request logs and shortcut metrics remain metadata-only.

If storage is blocked (including some private modes), quota is exceeded, or a read/write/delete throws, chat remains usable in memory only. The UI must say saving is unavailable or failed, must not claim content was saved/deleted if that cannot be confirmed, and must not silently enable persistence. Defensive parsing rejects unknown versions, bad IDs/locales/roles, overlong text, invalid timestamps, unpaired history, and excess counts/bytes before rendering or sending a follow-up.

## Processor and data flow inventory

| Boundary | Data flow under this decision |
| --- | --- |
| Browser `localStorage` | Only after explicit opt-in, the bounded transcript and consent metadata stay on the site's origin/browser profile. No application server receives a passive copy merely because saving is on. |
| `POST /api/chat` on Vercel | On a visitor's free-text send, the selected conversation history goes to the existing API to answer. This happens whether or not local saving is enabled. The API validates limits and records privacy-safe metadata, not transcript text. Vercel runtime log retention is platform-governed. [Vercel logs](https://vercel.com/docs/functions/logs) |
| Google Gemini API | The bounded assistant sends prompts/context for generation and query embeddings to Google. Provider handling and retention follow the applicable [Gemini API terms](https://ai.google.dev/gemini-api/terms) and [abuse-monitoring policy](https://ai.google.dev/gemini-api/docs/usage-policies); account-specific paid/free treatment must be checked before making a stronger retention claim. Browser-local deletion cannot erase provider-held data. |
| Supabase | The existing private rate-limit table receives HMAC session/IP digests; public knowledge retrieval receives search parameters and returns public records. This issue adds no transcript table or write to Supabase. |
| WordPress | Supplies published public evidence. The frontend privacy pages now use versioned repository content rather than WordPress content; the published WordPress policy records are maintained as matching copies. This issue adds no transcript write to WordPress. |
| Google Analytics, if configured | Existing site analytics may record only allowed event name, locale, and bounded status/choice values. No chat text, citation URLs, conversation UUID, or consent timestamp is included. |

## Public notice and release gate

Before deployment, update **both** versioned EN/TR repository privacy-policy files that serve the frontend and the **published EN/TR WordPress copies**. The current public pages already identify Google Gemini correctly; this release must add the new storage notice only when the opt-in feature is ready to ship. The visible chat disclosure must state that saving is off unless chosen, applies only to this browser/device, expires after 30 days of inactivity, and can be deleted. The consent control must give a clear short version before it can be activated.

Suggested English public wording:

> The AI assistant uses Google's Gemini API to process messages you send. Do not include sensitive information. Conversation saving is off by default. If you choose “Save conversations on this browser,” recent completed chat messages are stored in this browser's local storage for up to 30 days after your last completed exchange, subject to a five-conversation and size limit. You can delete one or all saved conversations and turn saving off in the chat. Others with access to this browser profile, or scripts on this site, may be able to read local storage. Saving does not create an account or a server-side transcript archive. Sent messages are still processed by the chat API and Google under their applicable terms; deleting a browser copy does not delete data already processed by them.

Suggested Turkish public wording:

> Yapay zekâ asistanı, gönderdiğiniz mesajları işlemek için Google Gemini API'sini kullanır. Hassas bilgiler paylaşmayın. Sohbet kaydetme varsayılan olarak kapalıdır. “Sohbetleri bu tarayıcıda kaydet” seçeneğini açarsanız, tamamlanmış son sohbet mesajları, son tamamlanan konuşmadan itibaren en fazla 30 gün boyunca bu tarayıcının yerel depolamasında; beş konuşma ve boyut sınırlarıyla saklanır. Sohbet içinde tek bir kayıtlı konuşmayı veya tümünü silebilir ve kaydetmeyi kapatabilirsiniz. Bu tarayıcı profiline erişen kişiler veya bu sitede çalışan betikler yerel depolamayı okuyabilir. Bu özellik hesap ya da sunucu tarafında konuşma arşivi oluşturmaz. Gönderilen mesajlar yine sohbet API'si ve Google tarafından ilgili şartlara göre işlenir; tarayıcıdaki kopyayı silmek, daha önce işlenen verileri bu sistemlerden silmez.

Release checklist: John approves this decision and wording; EN/TR panel controls and notices match it; versioned frontend privacy pages and WordPress copies are updated and the public URLs checked; tests cover consent/restore/expiry/deletion/locale/quota/private-browsing; no transcript appears in logs or analytics; deployment is verified before #39 is closed.
