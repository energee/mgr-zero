# Explorer remainder — Programs 10–16

> **For agentic workers:** Do not start these until Programs 0–9 for a given screen's data are merged, except Program 10's parity test which can go red immediately and stay red until each program ungates its screens. REQUIRED SUB-SKILL after confirmation: superpowers:subagent-driven-development or executing-plans.

**Goal:** After 0–9 the live app still would not match `/docs/screens-explore`. These programs close that gap for **MGR frames only**. Slack / QuickBooks / Square **venue** frames stay in the explorer and `/docs/integrations`; they are not MGR routes.

**How to read “match”:** a live route exists, uses `E.*` + `CommandForm`, and has the same job, fields, verbs, and states as the screen record. Fixture names (Ridgeline, ORD-0231) are demo data in the explorer only.

## Screen coverage

Every `SCREENS` name is in exactly one bucket.

### A. Programs 1–9 (already planned)

Today, Today empty, Sales, Brewer, Driver, Taproom (role filter of Today), Location detail, Short pick, Pick, Put back, Ship and invoice, Shipment done, Ship on delivery, Complete transfer, Return and credit, Confirm delivery, Pars and allocation (commands), Account, Pay invoice (no Intuit), Payment unavailable, Paid invoice, Invoice history, Locations, Location bins, Bin, Catalog, Product, SKU, SKU list, Package BOM, Formats, Format, Price lists, Price tiers, Override, Sale channels, Channel, Cellar map, Vessel detail, Fermentation reading, Cellar addition, Batches, Schedule batch, Brew day, Cellar transfer, Close packaging run, Run closed, Packaging runs, Schedule packaging run, Recipes, Recipe, Repack, Purchase orders, New PO, Receive PO, Receipt, Materials on hand, Cycle count, Vendors, Materials, Material, Vendor, Contracts, Contract, Planning, Keg fleet, Customer keg balance, Keg event history, Keg report, Routes, Route, Return route, Driver route, Compliance months, Monthly compliance (file path), Compliance registry, Brand approval, State registration, License, Lot trace.

Those programs already say: rewrite the live page when the command ships.

### B. Program 10 — parity, no new iron-rule gate

Beer, Work, More, Search, Me, Settings, Permission denied, No membership, Session expired, Sign in, Reset password, Set new password, Portal sign in, Portal forgot password, Portal set password, Portal Me, Team, Team member (role + revoke only), First-run checklist (skip invite/import), Finished goods, SKU detail (no reverse), Record movement, Movement recorded, Entity picker, Orders, Confirm order, Order, New order, Pick sheet, Customers, Customer detail, Ship-to form, Invoices, Invoice, Shop, Review order, Order history, Order detail, Accounting (health stub), Question invoice + raise/list/resolve.

### C. Program 11 — access gates (ARCHITECTURE)

Create brewery, Accept invite, Expired invite, Expired reset, Invite portal user, Import, Team invite button, First-run invite/import steps.

### D. Program 12 — taproom truth (SCHEMA-GATE)

Weekly count, Variance by brand, Tap board, Kick keg, Swap keg, SKU detail reverse, complete_batch (Cellar map verb), Monthly compliance loss queue.

### E. Program 13 — QuickBooks

Connect QuickBooks, Mapping conflict, Disconnect QuickBooks, Fix mapping, Accounting push, Pay invoice Intuit link. Venue frames stay venue.

### F. Program 14 — Square / menu

Point of sale, Connect Square, Square locations, Disconnect Square, Square → QuickBooks connector, Menu, POS item, POS mapping, POS sale detail.

### G. Program 15 — composer

Composer proposal, Composer question, Composer answer, Offline outbox.

### H. Program 16 — chat settings (existing plan Tasks 11–14)

Chat disconnected, Chat settings, Linked people, Link your Slack, Disconnect Slack, Reauthorization. Slack **venue** frames (App Home, DM, digest, preferences modal, gated domain forms) stay venue; Task 11 implements the real Slack actions those frames describe.

### I. Never a live MGR route

Pushed invoice, Payment, Credit memo, Push rejected, Square sales receipt, Taproom sale, Refund, Item library, Published item, Retired item, Link identity, Personal queue, Personal DM, Team digest, Notification preferences, Fermentation reading form (Slack), Order confirmation form (Slack).

## Program 12 open questions — decided 2026-09-07

Recorded in the schema design spec §16.16. Poured formats are brand-owned
(name + ounces); the `taproom` role ships **with** per-role RLS, which needs
its own spec before Program 12 (TODO.md lists it); fill is three chips; guest
kegs carry `label` + `nominal_bbl`, new guest swaps gated until then.

## Execution order after 0–9

10 (parity test goes red early, finishes after 9) → 11 and 16 can parallel → 12 (needs 2 + 7) → 13 and 15 can parallel after 1 → 14 after 12 (counts) and q2.

Do not start 11–16 before the named gate in each plan is closed in tests.
