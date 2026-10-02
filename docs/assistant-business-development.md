# Professional inquiries in the Digital Assistant

For a question such as “Does John teach?”, the assistant should retrieve published experience and public contact options. John's reviewed CV now records his confirmed past teaching experience without attaching an undocumented subject, date, or current role. A grounded answer can cite the CV, state that current teaching availability is unconfirmed, and invite the visitor to ask John through the public contact page. The invitation is a visitor choice; the chat has not contacted or booked John.

The same distinction applies to other professional service and availability questions. An unknown current status does not erase documented historical experience. The assistant still needs fresh evidence and normal answer verification; unsupported experience receives no invented positive answer. English and Turkish share the rule and use their respective public contact routes.

The registered CV and its generated Markdown have been updated locally. A deployed application must include the new source before `get_cv_timeline` can expose it. Refreshing indexed CV knowledge requires the separate reviewed digest and live indexing workflow in [cv-knowledge.md](cv-knowledge.md). The offline tests exercise the registered CV, tools, and agent stages with controlled provider output; they do not prove a live model will always phrase the answer correctly.

## Guided project discovery

The chat welcome offers two explicit entry points while preserving ordinary free-text questions and the existing FAQ shortcuts:

- English: “Hi, I’m John’s AI Assistant. Would you like to discuss a project, or ask about his work, projects, and documented experience?” with “Discuss a project” and “Ask about John.”
- Turkish: “Merhaba, ben John’un yapay zekâ asistanıyım. Bir proje hakkında konuşmak mı, yoksa çalışmaları, projeleri ve belgelenmiş deneyimi hakkında soru sormak mı istersiniz?” with “Projenizi konuşalım” and “John hakkında soru sorun.”

“Ask about John” focuses the normal chat input and leaves the FAQ choices available. “Discuss a project” opens a separate three-step flow with this notice: “Let’s outline your project. This helps prepare an inquiry; nothing is sent to John.” / “Projenizin ana hatlarını belirleyelim. Bu adımlar bir görüşme talebi hazırlamanıza yardımcı olur; John’a hiçbir şey gönderilmez.” The questions are:

1. Required goal: “What would you like to improve or accomplish?” / “Neyi iyileştirmek veya başarmak istiyorsunuz?”
2. Required current context: “What data, reports, or tools do you use today?” / “Şu anda hangi verileri, raporları veya araçları kullanıyorsunuz?” Visitors can explicitly choose “Not sure yet” / “Henüz emin değilim.”
3. Optional constraints: “What timing or constraints should we consider?” / “Hangi zaman hedefini veya kısıtları dikkate almalıyız?” Visitors can skip it.

Goal and current-context values are trimmed, required, and limited to 600 characters each. Constraints are limited to 400 characters. Validation is visible, and Back, Edit, Restart, Skip, and Return to chat are native keyboard-operable controls with English and Turkish labels and focus states.

### Privacy and lifecycle boundary

The discovery draft, lookup request, result, and edited summary live only in the `ProjectDiscoveryFlow` component. They are not chat messages, do not enter normal chat history, and are never written to chat local storage even when browser chat saving is enabled. The saving controls are hidden during discovery so they do not imply that the draft is saved; the AI and sensitive-information disclosure remains visible.

Returning to chat, restarting, closing the panel, changing locale, starting a new chat, or selecting a saved chat discards the applicable draft and aborts an active lookup. Aborted or stale responses cannot update a later flow. There is no automatic transcript persistence, inquiry handoff, CRM/email/booking action, or transfer into the contact form.

Only the trimmed goal and current-context values plus `en` or `tr` are sent to `/api/project-discovery` for a fresh lookup after the visitor explicitly chooses Review. Constraints and the editable summary never leave the browser through this endpoint. The contact link opens the existing `/contact` or `/tr/contact` page without a query string, prefill, automatic submission, or other payload.

### Summary and published-source boundary

Review produces a deterministic, editable “Your project summary” / “Proje özetiniz” from visitor-provided text. Editing this textarea does not rewrite or relabel retrieved evidence. Choosing Edit clears prior lookup results; another lookup occurs only after the visitor explicitly reviews the inputs again. Copy success is shown only after the clipboard write resolves. If browser clipboard access fails, the summary remains selectable and the UI tells the visitor to copy it manually.

“Related published work” is a separate area. Its excerpts are quoted source data and must never be treated as instructions. Sources are possible related reading, not a qualification, recommendation, fit assessment, acceptance decision, or statement about pricing, availability, delivery, or timeline. An empty result says that no matching published work was found and suggests asking John directly. Lookup failures never remove Copy summary or Open contact form.

The endpoint uses the existing `search_knowledge` handler directly; it does not invoke a generative model or a new tool. It returns at most three unique canonical HTTPS sources from the English/Turkish service and project URL families on `johnserra.com`. External hosts, query strings, fragments, unsafe schemes, other content types, duplicates, and invalid tool results are rejected or filtered. Titles are limited to 200 characters and plain-text snippets to 350 characters. React renders titles and snippets as escaped text rather than raw HTML.

### Endpoint protections and limitations

`POST /api/project-discovery` requires `application/json`, a valid `X-Chat-Session` UUID, and Vercel’s trusted `x-vercel-forwarded-for` header. It accepts exactly `{goal,current,locale}`, supports only English and Turkish, caps the UTF-8 request body at 8,192 bytes, consumes the shared server-side chat rate limit before retrieval, and applies linked cancellation with a 3-second rate-limit deadline and a separate 10-second retrieval deadline. A safe timeout handoff remains available if either bounded preparation step does not finish. Responses use `Cache-Control: no-store`; errors are generic and do not log or expose request text, IP addresses, transcripts, or provider details.

Offline tests use injected fake retrieval and rate limiting. They cover malformed requests, locale and field strictness, byte and character limits, validation order, rate limiting, timeout, cancellation, fresh lookup behavior, canonical source sanitization, malicious/duplicate candidates, English/Turkish controls, summary/evidence separation, and clipboard resolution/failure. They make no real model, provider, contact, or outbound request. Live end-to-end retrieval, responsive behavior, copy permissions, and navigation remain parent verification work; this document does not mark issue #40 production-complete.

### Rollback

Remove the two entry buttons and `ProjectDiscoveryFlow` integration from `AIChatPanel`, remove the `/api/project-discovery` route and its dedicated discovery modules/tests, and remove the `Chat.projectDiscovery` translations. The existing `/api/chat` request/pipeline, FAQ shortcuts, persistence behavior, and contact form require no rollback because this feature does not change them.
