# Staff invoice navigation verification (#650)

The staff invoice destination is supported by an official Intuit sample and was verified read-only in an existing QuickBooks sandbox on 2026-09-28.

## Provider contract

Intuit's [Projects and Invoicing Java sample](https://github.com/IntuitDeveloper/SampleApp-Projects-Java/blob/94c2f16e29aa23448197d0cee797234999f2a874/README.md#L264-L273) documents this staff deep-link template:

```text
https://app.qbo.intuit.com/app/invoice?txnId=%s&companyId=%s
```

The [sample URL builder](https://github.com/IntuitDeveloper/SampleApp-Projects-Java/blob/94c2f16e29aa23448197d0cee797234999f2a874/src/main/java/com/quickbooks/demo/config/QuickBooksConfig.java#L88-L94) fills `txnId` with the created invoice ID and `companyId` with the OAuth realm ID. It does not branch on sandbox versus production.

The official [Invoice API reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/invoice) documents `InvoiceLink` for external customers. That payment/share link is a different destination and must not be used for staff navigation.

## Sandbox proof

The user authorized their signed-in developer session and read-only browser verification. From My Hub → Sandboxes, the existing Test Company entry supplied its company ID and sandbox login link. Opening it established the QuickBooks sandbox session without changing any provider record.

In Sales → Invoices, selecting 2023 exposed the existing sample invoices. View/Edit for invoice 1010 opened remote transaction 34 on `sandbox.qbo.intuit.com`. Its visible company was Test Company and total was $375.00.

Opening the exact documented `app.qbo.intuit.com` template in a new tab, with that transaction ID and the company ID from the developer portal, redirected to `qbo.intuit.com`. The destination visibly showed the same Test Company, invoice 1010, and $375.00 total. No invoice field was edited or saved, and no payment or email action was taken. Verification tabs were closed afterward.

Only one sandbox company was available. Starting from a different active company and signing in from a wholly fresh browser session were not exercised. No new company was provisioned. Deleted-invoice and disconnected/reconnected MGR states belong in automated boundary tests; this check did not delete provider records or alter connections.

## MGR boundary

Invoice detail and list queries derive navigation from the stored remote invoice ID and a successful Invoice push that matches the current connection ID and OAuth realm. A reconnect creates a different connection identity, so historical push provenance cannot authorize its link. Keep existing Admin/Sales and tenant restrictions. Refuse unpushed or missing identities, deleted invoices, disconnected connections, and mismatched company identities. Never place provider tokens or customer payment links in a staff URL. The provider remains responsible for checking the signed-in staff member's access to the target company and invoice.

Credit memo navigation remains unavailable because this verified contract covers invoices only. Local browser checks exercised the shared live list/detail links and the unavailable state after changing the local connection realm. Automated tests cover Sales access, unauthorized roles, selected-tenant isolation, missing or mismatched identities, unsuccessful and non-Invoice push records, disconnection, reconnection, deletion, and credit memos.
