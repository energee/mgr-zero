// The SDK transports HTTP bodies and stream errorText as Error.message. Keep
// that wire value code-only: provider messages can contain request data/secrets.
export const CHAT_FAILURES = {
  not_configured: { message: "Ask MGR is not configured. Contact your administrator; ordinary MGR forms are still available.", retryable: false },
  provider_access: { message: "Ask MGR cannot access its AI provider or model. Ask your administrator to check provider access and credits; ordinary MGR forms are still available.", retryable: false },
  rate_limited: { message: "Ask MGR is rate limited. Wait a minute, then try again.", retryable: true },
  unavailable: { message: "Ask MGR is temporarily unavailable. Wait a moment, then try again.", retryable: true },
  offline: { message: "Ask MGR could not connect. Check your connection, then try again. Chat messages are not queued; saved fermentation readings remain available below.", retryable: true },
  request_rejected: { message: "Ask MGR could not accept this request. Reload the page and check that you are signed in to the correct brewery.", retryable: false },
  unknown: { message: "Ask MGR could not finish this response. Use the ordinary MGR forms, or contact your administrator if this continues.", retryable: false },
} as const;
export type ChatFailureCode = keyof typeof CHAT_FAILURES;
const PREFIX = "mgr-chat:";
export function encodeChatFailure(code: ChatFailureCode): string { return `${PREFIX}${code}`; }

// A blocked chat fails every prompt the same way until an administrator acts,
// and only the failed stream knows it. The tab remembers the code per
// conversation so a reload stays blocked; New chat or a new tab starts clean (#1520).
const BLOCKING: readonly ChatFailureCode[] = ["not_configured", "provider_access"];
type BlockStorage = Pick<Storage, "getItem" | "setItem">;
export const blockedChatKey = (actorId: string, breweryId: string, conversationId: string) => `mgr-chat-blocked:${actorId}:${breweryId}:${conversationId}`;

export function rememberBlockedChat(storage: BlockStorage, key: string, failure: { code: ChatFailureCode }) {
  if (BLOCKING.includes(failure.code)) storage.setItem(key, failure.code);
}

export function readBlockedChat(storage: BlockStorage, key: string) {
  const code = storage.getItem(key);
  if (!code || !BLOCKING.includes(code as ChatFailureCode)) return undefined;
  return readChatFailure(new Error(encodeChatFailure(code as ChatFailureCode)));
}

export function readChatFailure(error: unknown, online = true) {
  if (!online) return { code: "offline" as const, ...CHAT_FAILURES.offline };
  const wire = error instanceof Error ? error.message : "";
  const code = wire.startsWith(PREFIX) ? wire.slice(PREFIX.length) : "";
  if (Object.hasOwn(CHAT_FAILURES, code)) {
    const known = code as ChatFailureCode;
    return { code: known, ...CHAT_FAILURES[known] };
  }
  // Fetch rejects with TypeError before an HTTP/stream error is available.
  if (error instanceof TypeError) return { code: "offline" as const, ...CHAT_FAILURES.offline };
  return { code: "unknown" as const, ...CHAT_FAILURES.unknown };
}
