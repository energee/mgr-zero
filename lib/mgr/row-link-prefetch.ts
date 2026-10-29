// lib/mgr/row-link-prefetch.ts — whether a row link prefetches (#1606).
// Next.js prefetches every link in view. For a record page that runs its
// generateMetadata, which loads the record so a missing one is a real 404.
// So a list of record rows ran one record read per row before any click.
// Owner decision (2026-10-29): row links to record pages do not prefetch.

/** A record id (UUID) anywhere in an href. Not `isUuid` (lib/commands/context,
 *  server-only) or `isImportUuid` (lib/import-csv): both match a whole string,
 *  and neither module belongs in the client bundle of every screen. */
const RECORD_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The `prefetch` prop for a row link: `false` when the href names a record,
 *  so an unclicked row costs no database read; otherwise Next's default. */
export const rowLinkPrefetch = (href: string): false | undefined => (RECORD_ID.test(href) ? false : undefined);
