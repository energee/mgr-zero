export type InvitationRequest = { key: string; requestId: string };

/** An unchanged failed submission is the same action; changed intent starts another. */
export function invitationRequest(previous: InvitationRequest | null, breweryId: string, name: string, input: unknown): InvitationRequest {
  const key = JSON.stringify({ breweryId, name, input });
  return previous?.key === key ? previous : { key, requestId: crypto.randomUUID() };
}
