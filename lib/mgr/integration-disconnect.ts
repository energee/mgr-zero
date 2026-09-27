// What the Square and QuickBooks disconnect pages may offer, read from the redacted connection health (#620).
// "Connection exists" and "connection healthy" are separate facts: a recovery_required connection
// still holds a credential that only the disconnect command purges.

/** available: disconnect can purge a credential · pending: a disconnect started and never recorded its
 *  revocation outcome · unresolved: the credential is purged but the provider never confirmed revocation ·
 *  disconnected: nothing is left to disconnect. */
export type DisconnectStatus = "available" | "pending" | "unresolved" | "disconnected";

/** The health fields both providers' reads return that decide the disconnect. */
export type DisconnectHealth = { connectionId?: string; state: string; remoteRevocationState?: string };

export function disconnectStatus(health: DisconnectHealth): DisconnectStatus {
  if (!health.connectionId) return "disconnected";
  if (health.state === "connected") return "available";
  if (health.remoteRevocationState === "pending") return "pending";
  if (health.remoteRevocationState === "unresolved") return "unresolved";
  return health.state === "recovery_required" ? "available" : "disconnected";
}

/** True only when the disconnect command's result says the provider confirmed revocation. */
export function revocationConfirmed(result: unknown) {
  return (result as { remoteRevocationState?: unknown } | null)?.remoteRevocationState === "confirmed";
}
