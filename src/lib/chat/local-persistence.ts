import {
  CHAT_MAX_INPUT_BYTES,
  CHAT_MAX_MESSAGE_BYTES,
  CHAT_MAX_MESSAGES,
  utf8ByteLength,
} from "./limits";

export const CHAT_STORAGE_KEY = "johnserra.chat.conversations.v1";
export const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const CHAT_MAX_SAVED_CONVERSATIONS = 5;
export const CHAT_MAX_SAVED_MESSAGES = 20;
export const CHAT_MAX_STORED_BYTES = 128 * 1024;

export type ChatLocale = "en" | "tr";
export type SavedMessage = { role: "user" | "assistant"; content: string };
export type SavedConversation = {
  id: string;
  locale: ChatLocale;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  messages: SavedMessage[];
};
export type SavedChatState = {
  version: 1;
  consent: { enabledAt: number; lastCompletedAt: number | null };
  activeConversationId: string | null;
  conversations: SavedConversation[];
};
export type StorageFailure = "unavailable" | "not-enabled" | "invalid";
export type StorageResult<T> = { ok: true; value: T } | { ok: false; reason: StorageFailure };
export type ChatStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_STATE = (now: number): SavedChatState => ({
  version: 1,
  consent: { enabledAt: now, lastCompletedAt: null },
  activeConversationId: null,
  conversations: [],
});

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function timestamp(value: unknown, now: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= now + 5 * 60_000;
}

function validMessages(value: unknown): value is SavedMessage[] {
  if (!Array.isArray(value) || value.length > CHAT_MAX_SAVED_MESSAGES || value.length % 2 !== 0) return false;
  return value.every((item, index) =>
    record(item) && exactKeys(item, ["role", "content"]) &&
    item.role === (index % 2 === 0 ? "user" : "assistant") &&
    typeof item.content === "string" && Boolean(item.content.trim()) &&
    utf8ByteLength(item.content) <= CHAT_MAX_MESSAGE_BYTES);
}

function parseState(value: unknown, now: number): SavedChatState | null {
  if (!record(value) || !exactKeys(value, ["version", "consent", "activeConversationId", "conversations"]) || value.version !== 1) return null;
  const consent = value.consent;
  if (!record(consent) || !exactKeys(consent, ["enabledAt", "lastCompletedAt"]) ||
      !timestamp(consent.enabledAt, now) ||
      (consent.lastCompletedAt !== null && (!timestamp(consent.lastCompletedAt, now) || consent.lastCompletedAt < consent.enabledAt))) return null;
  if (value.activeConversationId !== null && (typeof value.activeConversationId !== "string" || !UUID.test(value.activeConversationId))) return null;
  if (!Array.isArray(value.conversations) || value.conversations.length > CHAT_MAX_SAVED_CONVERSATIONS) return null;

  const ids = new Set<string>();
  for (const item of value.conversations) {
    if (!record(item) || !exactKeys(item, ["id", "locale", "createdAt", "updatedAt", "expiresAt", "messages"]) ||
        typeof item.id !== "string" || !UUID.test(item.id) || ids.has(item.id) ||
        (item.locale !== "en" && item.locale !== "tr") ||
        !timestamp(item.createdAt, now) || !timestamp(item.updatedAt, now) ||
        item.updatedAt < item.createdAt || !Number.isSafeInteger(item.expiresAt) ||
        item.expiresAt !== item.updatedAt + CHAT_RETENTION_MS || !validMessages(item.messages)) return null;
    ids.add(item.id);
  }
  return value as SavedChatState;
}

function write(storage: ChatStorage, state: SavedChatState): StorageResult<SavedChatState> {
  const serialized = JSON.stringify(state);
  if (utf8ByteLength(serialized) > CHAT_MAX_STORED_BYTES) return { ok: false, reason: "invalid" };
  try {
    storage.setItem(CHAT_STORAGE_KEY, serialized);
    if (storage.getItem(CHAT_STORAGE_KEY) !== serialized) return { ok: false, reason: "unavailable" };
    return { ok: true, value: state };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function remove(storage: ChatStorage): StorageResult<null> {
  try {
    storage.removeItem(CHAT_STORAGE_KEY);
    return storage.getItem(CHAT_STORAGE_KEY) === null
      ? { ok: true, value: null }
      : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Read only this feature's key; invalid/expired content is purged before it can be restored. */
export function readSavedChats(storage: ChatStorage | null, now = Date.now()): StorageResult<SavedChatState | null> {
  if (!storage) return { ok: false, reason: "unavailable" };
  let raw: string | null;
  try {
    raw = storage.getItem(CHAT_STORAGE_KEY);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (raw === null) return { ok: true, value: null };
  if (utf8ByteLength(raw) > CHAT_MAX_STORED_BYTES) {
    const purged = remove(storage);
    return purged.ok ? { ok: true, value: null } : purged;
  }
  let parsed: SavedChatState | null = null;
  try {
    parsed = parseState(JSON.parse(raw) as unknown, now);
  } catch {
    // Treat malformed browser data as untrusted and remove it.
  }
  if (!parsed || now >= (parsed.consent.lastCompletedAt ?? parsed.consent.enabledAt) + CHAT_RETENTION_MS) {
    const purged = remove(storage);
    return purged.ok ? { ok: true, value: null } : purged;
  }
  const conversations = parsed.conversations.filter((item) => now < item.expiresAt);
  if (conversations.length === parsed.conversations.length) return { ok: true, value: parsed };
  return write(storage, {
    ...parsed,
    activeConversationId: conversations.some((item) => item.id === parsed.activeConversationId)
      ? parsed.activeConversationId : null,
    conversations,
  });
}

export function enableChatSaving(storage: ChatStorage | null, now = Date.now()): StorageResult<SavedChatState> {
  if (!storage) return { ok: false, reason: "unavailable" };
  const current = readSavedChats(storage, now);
  if (!current.ok) return current;
  if (current.value) return { ok: true, value: current.value };
  return write(storage, EMPTY_STATE(now));
}

export function disableChatSaving(storage: ChatStorage | null): StorageResult<null> {
  return storage ? remove(storage) : { ok: false, reason: "unavailable" };
}

export function startSavedConversation(storage: ChatStorage | null, id: string, now = Date.now()): StorageResult<SavedChatState> {
  if (!UUID.test(id)) return { ok: false, reason: "invalid" };
  const current = readSavedChats(storage, now);
  if (!current.ok) return current;
  if (!current.value || !storage) return { ok: false, reason: "not-enabled" };
  return write(storage, { ...current.value, activeConversationId: id });
}

export function selectSavedConversation(storage: ChatStorage | null, id: string, locale: ChatLocale, now = Date.now()): StorageResult<SavedChatState> {
  const current = readSavedChats(storage, now);
  if (!current.ok) return current;
  if (!current.value || !storage) return { ok: false, reason: "not-enabled" };
  if (!current.value.conversations.some((item) => item.id === id && item.locale === locale)) return { ok: false, reason: "invalid" };
  return write(storage, { ...current.value, activeConversationId: id });
}

export function deleteSavedConversation(storage: ChatStorage | null, id: string, now = Date.now()): StorageResult<SavedChatState> {
  const current = readSavedChats(storage, now);
  if (!current.ok) return current;
  if (!current.value || !storage) return { ok: false, reason: "not-enabled" };
  return write(storage, {
    ...current.value,
    activeConversationId: current.value.activeConversationId === id ? null : current.value.activeConversationId,
    conversations: current.value.conversations.filter((item) => item.id !== id),
  });
}

function trimForStorage(state: SavedChatState, newestId: string): SavedChatState | null {
  const next = { ...state, conversations: state.conversations.map((item) => ({ ...item, messages: [...item.messages] })) };
  while (utf8ByteLength(JSON.stringify(next)) > CHAT_MAX_STORED_BYTES) {
    const candidate = [...next.conversations]
      .filter((item) => item.messages.length > (item.id === newestId ? 2 : 0))
      .sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!candidate) return null;
    candidate.messages.splice(0, 2);
    if (candidate.messages.length === 0) next.conversations = next.conversations.filter((item) => item.id !== candidate.id);
  }
  return next;
}

/** Save one completed exchange only after durable consent; never persist partial or failed replies. */
export function saveCompletedExchange(
  storage: ChatStorage | null,
  id: string,
  locale: ChatLocale,
  user: string,
  assistant: string,
  now = Date.now(),
): StorageResult<SavedChatState> {
  if (!UUID.test(id) || !validMessages([{ role: "user", content: user }, { role: "assistant", content: assistant }])) return { ok: false, reason: "invalid" };
  const current = readSavedChats(storage, now);
  if (!current.ok) return current;
  if (!current.value || !storage) return { ok: false, reason: "not-enabled" };
  const previous = current.value.conversations.find((item) => item.id === id);
  if (previous && previous.locale !== locale) return { ok: false, reason: "invalid" };
  const messages = [...(previous?.messages ?? []), { role: "user" as const, content: user }, { role: "assistant" as const, content: assistant }]
    .slice(-CHAT_MAX_SAVED_MESSAGES);
  const conversation: SavedConversation = {
    id, locale, createdAt: previous?.createdAt ?? now, updatedAt: now,
    expiresAt: now + CHAT_RETENTION_MS, messages,
  };
  const conversations = [...current.value.conversations.filter((item) => item.id !== id), conversation]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, CHAT_MAX_SAVED_CONVERSATIONS);
  const candidate = trimForStorage({
    version: 1,
    consent: { ...current.value.consent, lastCompletedAt: now },
    activeConversationId: id,
    conversations,
  }, id);
  return candidate ? write(storage, candidate) : { ok: false, reason: "invalid" };
}

export function localeConversations(state: SavedChatState, locale: ChatLocale): SavedConversation[] {
  return state.conversations.filter((item) => item.locale === locale).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Keep the newest complete pairs plus the pending user inside the authoritative API limits. */
export function boundedApiHistory(history: SavedMessage[]): SavedMessage[] | null {
  if (history.length % 2 !== 1 || history.at(-1)?.role !== "user") return null;
  const latest = history.at(-1)!;
  if (!latest.content.trim() || utf8ByteLength(latest.content) > CHAT_MAX_MESSAGE_BYTES) return null;
  const result = [latest];
  let bytes = utf8ByteLength(latest.content);
  for (let index = history.length - 3; index >= 0; index -= 2) {
    const user = history[index];
    const assistant = history[index + 1];
    if (user.role !== "user" || assistant.role !== "assistant" || !user.content.trim() || !assistant.content.trim()) return null;
    const pairBytes = utf8ByteLength(user.content) + utf8ByteLength(assistant.content);
    if (utf8ByteLength(user.content) > CHAT_MAX_MESSAGE_BYTES || utf8ByteLength(assistant.content) > CHAT_MAX_MESSAGE_BYTES ||
        result.length + 2 > CHAT_MAX_MESSAGES || bytes + pairBytes > CHAT_MAX_INPUT_BYTES) break;
    result.unshift(user, assistant);
    bytes += pairBytes;
  }
  return result;
}
