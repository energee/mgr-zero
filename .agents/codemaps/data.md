<!-- Generated: 2026-10-31 | Commit: b8cb91afd | Tracked files scanned: 1878 -->
# Data

Supabase Postgres. Table design: `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md`;
reasons: `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`. Types: `lib/supabase/database.generated.ts`.

## Shape
- Generated public API types: 104 tables, 50 views, 30 enum types, 326 functions. Private helpers and ledgers are outside these generated types.
- App roles: SELECT only under RLS. Writes: idempotent `security definer` RPCs,
  `search_path=''`, actor/tenant/role derived in DB, canonical request hash.
- Ledger: `private.command_requests`; budget: `private.command_admissions`.

## Tables by domain
```
tenancy     breweries brewery_users customer_users brewery_counters
            private.{invite_requests,command_requests,command_admissions}
catalog     brands styles formats format_components format_bom skus catalog_categories
            brand_approvals cola_label_images price_groups price_group_barcodes sale_channels channel_prices
customers   customers ship_tos qbo_customer_decisions qbo_customer_snapshots
stock       locations bins inventory_movements lots transfers stock_transfers stock_transfer_lines
orders      orders order_lines order_deposit_lines order_events allocations shipments deliveries routes
            invoices invoice_lines invoice_questions invoice_payments invoice_payment_voids
            private.order_email_deliveries
purchasing  vendors materials material_lots material_movements material_contracts
            material_counts material_count_lines purchase_orders purchase_order_lines
            receipts receipt_lines
production  recipes recipe_versions recipe_ingredients recipe_water_additions water_profiles
            batches batch_additions brew_records brew_pulls vessels vessel_occupancies
            fermentation_readings volume_adjustments volume_adjustment_reclassifications
packaging   packaging_runs packaging_run_outputs packaging_run_consumptions
            packaging_material_actuals packaging_material_records
kegs/tap    keg_pools keg_events tap_intervals taproom_counts taproom_count_lines taproom_pars
pos         pos_connections pos_locations pos_location_mapping_history pos_item_mappings pos_sales
            pos_sale_expectations pos_sales_coverage pos_menus pos_menu_lines
            pos_catalog_items pos_catalog_variations pos_catalog_ownership
compliance  report_filings report_basis_amendments reporting_basis_corrections
            brewery_state_licenses state_registrations
integration qbo_connections qbo_pushes private.{integration_tokens,qbo_receipt_bills}
chat        chat_installations chat_user_links chat_action_intents chat_callback_receipts chat_sdk
            notification_{occurrences,deliveries,destinations,preferences}
```

## Key relationships
```
breweries 1─* every tenant table; FKs are composite (x_id, brewery_id) → no cross-tenant joins
brands 1─* formats 1─* skus ; formats *─* materials via format_bom
recipes 1─* recipe_versions 1─* batches 1─* vessel_occupancies *─1 vessels
vessel_occupancies 1─* packaging_runs 1─* packaging_run_outputs → lots
orders 1─* order_lines 1─* allocations ; orders 1─* shipments 1─1 invoices
inventory_movements: bin-grain ledger (sku × location × bin × lot × sale_channel), self-FKs for compensation/correction
material_movements:  material ledger (material × lot × bin)
```

## Views (read models)
on_hand, bin_on_hand, lot_on_hand, atp · material_{on_hand,on_order,requirements,last_cost}
keg_{customer_balances,deposit_balances,fleet_totals,loss_rates} · invoice_totals
occupancy_volumes, vessel_contents · po_open_balances, vendor_lead_times · route_loads
portal_* (customer-scoped projections) · staff_brewery, portal_brewery

## Migration history (233)
```
00001_baseline.sql                 original schema (closed to edits since #285)
2026-09   90 files                 hosted catch-up, slices, chat, POS, compliance
2026-10  142 files                 latest 2026-10-30: integrity and workflow fixes
                                   (ledger, QBO push, Square mapping, receipts)
```
Rules: never edit a committed file; `bun run migrations:lock` after adding;
timestamp later than every file on main (`scripts/check-migration-order.ts`).
Local stacks: dev `:54342`, test `:54352`.
