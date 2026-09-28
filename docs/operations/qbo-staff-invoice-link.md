# Staff invoice navigation verification (#650)

Status: an official Intuit sample supplies a candidate destination; sandbox company-routing verification remains pending. The shared invoice detail and accountant-review list show an unavailable action. This change does not complete the verified-link acceptance criteria.

The official [Intuit Invoice API reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/invoice) documents InvoiceLink as an external-customer sharing link. It requires online payments and a customer email. It is not a documented staff invoice-editor destination.

On 2026-09-27, searches of the Intuit developer documentation for staff invoice deep links, realmId and txnId did not establish a supported company-bound staff URL. This is a verification gap, not a claim that Intuit offers no such facility. Do not synthesize an app/invoice URL from stored identifiers or substitute InvoiceLink.

Before enabling Open in QuickBooks, obtain a supported destination contract and verify it in the intended sandbox company. The proof must cover the exact invoice and connected company, company switching, missing/deleted invoices, and reconnect behavior. Preserve existing Admin/Sales permissions and do not expose tokens or buyer payment links. No sandbox link verification was performed in this change.

Until then, staff open QuickBooks separately, choose the company shown in Accounting, and find the invoice using its visible document details.

## Verification handoff (2026-09-28)

A second official-documentation search did not establish a supported staff invoice URL contract. Intuit's Invoice API reference documents `InvoiceLink` for external customers. Its REST read and PDF endpoints return provider data; they are not authenticated staff editor destinations. Intuit help pages contain generic login/navigation links, but those do not establish how an exact invoice is bound to an exact company. An observed browser URL alone is insufficient evidence of a supported integration contract.

To unblock implementation, provide either an Intuit-supported staff navigation contract or an Intuit support response identifying the supported URL fields and company-switch behavior. The contract must distinguish sandbox from production and identify the canonical destination host. Do not paste access tokens, refresh tokens, or customer `InvoiceLink` values.

Then authorize read-only verification in an already-created sandbox. Required non-secret context is the intended realm/company ID, a pushed invoice's remote ID and visible invoice number, and a second company available to the same test login. The user signs in; no production credentials or new hosted resources are needed. Verify the target invoice from the correct company, from a different active company, and after a fresh sign-in. Verify unavailable/deleted invoices, disconnected or reconnected company context, and lack of access to the target company. Record the actual destination company and invoice for each case.

MGR's existing QBO boundary already separates the connection realm and pushed remote invoice identity. The buyer-payment resolver reads `InvoiceLink` and rechecks its claim before redirecting; that resolver must not be reused as a staff destination. Once a staff contract is verified, staff navigation must use the existing Admin/Sales invoice query and recheck the current connection and pushed company identity. Test mismatched realm, stale reconnect, missing remote invoice, tenant isolation, and role refusal before exposing a live link.

This handoff does not enable navigation or mark #650 complete.

## Official sample found (2026-09-28)

Intuit's [Projects and Invoicing Java sample](https://github.com/IntuitDeveloper/SampleApp-Projects-Java/blob/94c2f16e29aa23448197d0cee797234999f2a874/README.md#L264-L273) documents this default staff deep-link template:

```text
https://app.qbo.intuit.com/app/invoice?txnId=%s&companyId=%s
```

The [sample URL builder](https://github.com/IntuitDeveloper/SampleApp-Projects-Java/blob/94c2f16e29aa23448197d0cee797234999f2a874/src/main/java/com/quickbooks/demo/config/QuickBooksConfig.java#L88-L94) fills `txnId` with the created invoice ID and `companyId` with the OAuth realm ID. It does not branch on sandbox versus production.

The sample's README explicitly describes opening created invoices in QuickBooks Online. This supersedes the earlier search gap: there is now an official provider sample to inspect. It does not establish how the browser handles a different active company, fresh authentication, sandbox routing, or a missing invoice. Those behaviors still require the authorized sandbox check before MGR exposes the action.

The user authorized read-only use of their signed-in sandbox and the built-in browser connection. The connected browser inventory and active Chrome profile’s tab search contained no QuickBooks or Intuit tab when checked. Verification is waiting for the user to open that sandbox session. No provider record was changed.
