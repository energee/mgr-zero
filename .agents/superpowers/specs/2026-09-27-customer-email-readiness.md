# Customer portal-email readiness (#651)

The buyer's current portal login email is the email source. This is the user's explicit decision for this issue. Customer accounts do not gain a separate billing-email field.

A customer is missing an email when no current customer_users membership joins an auth.users row with a nonblank email. Invitations that have not created membership do not count. Multiple memberships count as ready when any current membership has an email.

One stable read RPC returns the missing customer rows for the requested brewery. It checks the authenticated user's Admin or Sales membership and request scope before reading Auth data. It returns customer rows, never Auth credentials or email values. The registered list_customers query adds an optional missingPortalEmail filter. The count query counts the same RPC result. PostgREST applies ordering, embedded channel/ship-to selection and paging at the query boundary.

Accounting shows the exact count and Review opens the filtered Customers shared view. The same shared view explains that presence is readiness, not deliverability or sending. A zero-result review says all customers have a portal login email. Normal customer listing stays unchanged.

Staff correct access through the existing Invite and Remove access controls on Customer detail. MGR does not change an Auth user's email globally. This feature does not alter QuickBooks push eligibility or copy a login email into a provider invoice.

Proof covers missing memberships, blank email, corrected presence, revoked membership, zero results, Admin/Sales authorization, other staff and buyer denial, foreign tenant denial, identical count/list predicate, paging, and inventory/live composition.
