# Staff invoice navigation verification (#650)

Status: blocked for a supported provider destination. The shared invoice detail and accountant-review list show an unavailable action. This change does not complete the verified-link acceptance criteria.

The official [Intuit Invoice API reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/invoice) documents InvoiceLink as an external-customer sharing link. It requires online payments and a customer email. It is not a documented staff invoice-editor destination.

On 2026-09-27, searches of the Intuit developer documentation for staff invoice deep links, realmId and txnId did not establish a supported company-bound staff URL. This is a verification gap, not a claim that Intuit offers no such facility. Do not synthesize an app/invoice URL from stored identifiers or substitute InvoiceLink.

Before enabling Open in QuickBooks, obtain a supported destination contract and verify it in the intended sandbox company. The proof must cover the exact invoice and connected company, company switching, missing/deleted invoices, and reconnect behavior. Preserve existing Admin/Sales permissions and do not expose tokens or buyer payment links. No sandbox link verification was performed in this change.

Until then, staff open QuickBooks separately, choose the company shown in Accounting, and find the invoice using its visible document details.
