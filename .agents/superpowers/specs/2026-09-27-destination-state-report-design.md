# Destination-state totals and supporting export (#626)

Extend the existing generated compliance report, retaining its TTB figures.
One SQL fact projection feeds both new state totals and the supporting rows
stored in the report figures. Filed snapshots retain their own facts; never
regenerate an export under an older saved total. Older filings without these
facts say that supporting state export was not captured.

Each fact carries immutable source ID, source kind, event date, original source
ID where applicable, destination state, signed BBL and signed beer-sales cents.
Volume and money are separate facts with separate event dates. Positive volume
means outward movement; a physical return is negative. Positive money means
invoiced beer sales; a credit memo is negative. Keg deposits are excluded from
beer sales. A physical return does not invent a refund, and an invoice does not
count physical shipment volume a second time.

Physical facts use frozen inventory movement BBL and destination. A source-linked
return inherits its original shipment destination; compensation and correction
entries retain their original classification. Generic stock adjustments have no
state by schema and remain Unassigned; no destination is invented. Include all destination states
and treatments, including samples and exports. Include typed cellar removals
with a recorded destination once. Material receipts/consumption are not beer
distribution and have no destination-state assignment.

Money facts use invoice SKU line amounts and credited invoice-line provenance.
Resolve each original shipment's destination from its frozen sale movements,
not today's ship-to address. Joining multiple bin/lot shipment movements must
never multiply an invoice amount. If an old invoice has no frozen destination,
show an Unassigned row and a warning instead of guessing a state. Voided
invoices contribute zero money; include their status in the supporting export.
An unfiled report reflects current invoice status. Filed figures stay frozen.

State totals sum the exact supporting facts before display rounding. Show
outward volume, physical returns, signed adjustments, net BBL, invoiced sales,
credits and net beer-sales dollars. CSV exports carry exact BBL precision and
integer cents, with period and source identities for reconciliation. Escape
CSV cells and spreadsheet formula prefixes. The monthly shared view owns the
same totals and export action for inventory and live data. Retain tanks now.

Proof covers NY/NJ in addition to existing PA/OH, returns in later periods,
multiple source bins without duplicated sales, credits without physical return,
refused goods without invoice, metadata edits, signed corrections, tenant/role
scope and filed export immutability. Existing return-source identities support
the query independently; revalidate against #618 and correction branches after
those reach main before declaring the issue complete.
