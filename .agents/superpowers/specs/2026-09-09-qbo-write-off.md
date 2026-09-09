# QuickBooks local invoice write-off contract

Accepted implementation clarification for Program 13 Q3.

- `write_off_invoice` is an Admin-only MGR status change. It never calls QuickBooks, records payment, creates credit, or changes inventory.
- An invoice is eligible only after the current, original-realm QuickBooks read established `voided` or `deleted`. Credit memos, live invoices, and an invoice already written off are refused.
- The transaction records the authenticated actor, database time, and a required 1–500 character reason. The command uses the existing canonical request ledger; an exact request replay returns the first result and a changed payload conflicts.
- `paid_at` is retained as history. Current paid, portal Pay, and collected-revenue predicates exclude voided, deleted, and written-off invoices.
