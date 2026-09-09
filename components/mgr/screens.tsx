import { InventoryDetailView } from "@/components/mgr/views/inventory-detail";
import { INVENTORY_DETAIL } from "@/lib/mgr/fixtures/inventory-detail";
// components/mgr/screens.tsx — the screen inventory and the source of truth
// for what each MGR screen shows (plan §4, §7); /docs/screens renders it. Every
// record is typed; `states` is annotation the gallery captions under the
// frame, never markup inside it. Bodies use only the E vocabulary. Edit the
// records here directly — the HTML wireframe is retired for MGR-venue frames
// and kept only for the Slack/QuickBooks/Square venue drawings.
//
// Two things this file deliberately does not draw. A create surface is the
// edit surface with empty values (Create brewery is the pattern), so Add
// customer, Add location, New PO, Add keg pool and Create price group open the
// records already here rather than earning frames of their own. And the
// composer strip is shell chrome — screen-frame.tsx passes E.comp() to both
// shells — so it is present under every staff and portal frame without any
// body naming it.
//
// Option casing follows the word, never the control that draws it. A proper
// noun or a named record (Warehouse, Taproom, Wholesale, Admin, Citra) is
// Title case in a chip, a tab and a picker alike; a generic domain term
// (depletion, dry hop, taxable, packaged) stays lowercase, as do units (lb,
// oz, bbl); an option that is a phrase rather than a term takes sentence case
// (Empty, About ¼ left, Customer remits). A lowercase list here is the rule,
// not an oversight.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { AdjustLinesView } from "@/components/mgr/views/adjust-lines";
import { BatchesView } from "@/components/mgr/views/batches";
import { BeerView } from "@/components/mgr/views/beer";
import { BinView } from "@/components/mgr/views/bin";
import { BrewDayView } from "@/components/mgr/views/brew-day";
import { BrandView } from "@/components/mgr/views/brand";
import { CatalogView } from "@/components/mgr/views/catalog";
import { ChannelView } from "@/components/mgr/views/channel";
import { ClosePackagingRunView } from "@/components/mgr/views/close-packaging-run";
import { CompleteTransferView } from "@/components/mgr/views/complete-transfer";
import { ConfirmOrderView } from "@/components/mgr/views/confirm-order";
import { ContractView } from "@/components/mgr/views/contract";
import { ContractsView } from "@/components/mgr/views/contracts";
import { CycleCountView } from "@/components/mgr/views/cycle-count";
import { CustomerView } from "@/components/mgr/views/customer";
import { CustomersView } from "@/components/mgr/views/customers";
import { DeniedView } from "@/components/mgr/views/denied";
import { EntryView } from "@/components/mgr/views/entry";
import { FinishedGoodsView } from "@/components/mgr/views/finished-goods";
import { FirstRunView } from "@/components/mgr/views/first-run";
import { FormatView } from "@/components/mgr/views/format";
import { FormatsView } from "@/components/mgr/views/formats";
import { InvoiceView } from "@/components/mgr/views/invoice";
import { KegBalanceView } from "@/components/mgr/views/keg-balance";
import { KegFleetView } from "@/components/mgr/views/keg-fleet";
import { KegHistoryView } from "@/components/mgr/views/keg-history";
import { LocationBinsView } from "@/components/mgr/views/location-bins";
import { LocationView } from "@/components/mgr/views/location";
import { MaterialView } from "@/components/mgr/views/material";
import { MaterialsView } from "@/components/mgr/views/materials";
import { MaterialsOnHandView } from "@/components/mgr/views/materials-on-hand";
import { LocationsView } from "@/components/mgr/views/locations";
import { MeView } from "@/components/mgr/views/me";
import { MoreView } from "@/components/mgr/views/more";
import { MovementRecordedView } from "@/components/mgr/views/movement-recorded";
import { NewOrderView } from "@/components/mgr/views/new-order";
import { NewPoView } from "@/components/mgr/views/new-po";
import { NewTransferView } from "@/components/mgr/views/new-transfer";
import { OrderView } from "@/components/mgr/views/order";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { PackageBomView } from "@/components/mgr/views/package-bom";
import { ParsView } from "@/components/mgr/views/pars";
import { PickView } from "@/components/mgr/views/pick";
import { PickSheetView } from "@/components/mgr/views/pick-sheet";
import { PortalAccountView } from "@/components/mgr/views/portal-account";
import { PortalInvoiceView } from "@/components/mgr/views/portal-invoice";
import { PortalInvoicesView } from "@/components/mgr/views/portal-invoices";
import { PortalMeView } from "@/components/mgr/views/portal-me";
import { PortalOrderView } from "@/components/mgr/views/portal-order";
import { PortalOrdersView } from "@/components/mgr/views/portal-orders";
import { PriceGroupView } from "@/components/mgr/views/price-group";
import { PriceGroupsView } from "@/components/mgr/views/price-groups";
import { PurchaseOrdersView } from "@/components/mgr/views/purchase-orders";
import { PutBackView } from "@/components/mgr/views/put-back";
import { ReceiptView } from "@/components/mgr/views/receipt";
import { ReceivePoView } from "@/components/mgr/views/receive-po";
import { QuestionInvoiceView } from "@/components/mgr/views/question-invoice";
import { RecipeView } from "@/components/mgr/views/recipe";
import { RecipesView } from "@/components/mgr/views/recipes";
import { RecordMovementView } from "@/components/mgr/views/record-movement";
import { RunClosedView } from "@/components/mgr/views/run-closed";
import { ReverseMovementView } from "@/components/mgr/views/reverse-movement";
import { ReturnCreditView } from "@/components/mgr/views/return-credit";
import { ReviewOrderView } from "@/components/mgr/views/review-order";
import { SaleChannelsView } from "@/components/mgr/views/sale-channels";
import { ScheduleBatchView } from "@/components/mgr/views/schedule-batch";
import { SearchView } from "@/components/mgr/views/search";
import { SessionExpiredView } from "@/components/mgr/views/session-expired";
import { SettingsView } from "@/components/mgr/views/settings";
import { ShipToView } from "@/components/mgr/views/ship-to";
import { ShipView } from "@/components/mgr/views/ship";
import { ShipmentDoneView } from "@/components/mgr/views/shipment-done";
import { ShopView } from "@/components/mgr/views/shop";
import { ShortPickView } from "@/components/mgr/views/short-pick";
import { SkuListView } from "@/components/mgr/views/sku-list";
import { SkuView } from "@/components/mgr/views/sku";
import { TeamView } from "@/components/mgr/views/team";
import { TodayView } from "@/components/mgr/views/today";
import { WorkView } from "@/components/mgr/views/work";
import { TransferDetailView } from "@/components/mgr/views/transfer-detail";
import { TransfersView } from "@/components/mgr/views/transfers";
import { UnitsView } from "@/components/mgr/views/units";
import { VendorView } from "@/components/mgr/views/vendor";
import { VendorsView } from "@/components/mgr/views/vendors";
import { VesselDetailView } from "@/components/mgr/views/vessel-detail";
import { OHIO_STOUT_NOTE, LOC_TAPROOM, LOC_WAREHOUSE } from "@/lib/mgr/fixtures/demo";
import { beerOverview } from "@/lib/mgr/fixtures/beer";
import { brandHazy, catalogBrands, formatCan, formatsInventory, packageBomCase, skuHazyHalf, skuListHazy } from "@/lib/mgr/fixtures/catalog";
import { customerRidgeline, customersList, shipToMain } from "@/lib/mgr/fixtures/customers";
import { deniedInvoices } from "@/lib/mgr/fixtures/denied";
import { expiredReset, noMembership, portalForgotPassword, portalSetPassword, portalSignIn, resetPassword, setPassword, signIn } from "@/lib/mgr/fixtures/entry";
import { firstRunDemo } from "@/lib/mgr/fixtures/first-run";
import { meMaria } from "@/lib/mgr/fixtures/me";
import { moreNavs } from "@/lib/mgr/fixtures/more";
import { entityPickerPalette, searchPalette } from "@/lib/mgr/fixtures/search";
import { sessionExpiredQueued } from "@/lib/mgr/fixtures/session-expired";
import { settingsDemo } from "@/lib/mgr/fixtures/settings";
import { teamRoster } from "@/lib/mgr/fixtures/team";
import { todayBrewer, todayDriver, todayEmpty, todaySales, todayTaproom, todayWarehouse } from "@/lib/mgr/fixtures/today";
import { workWarehouse } from "@/lib/mgr/fixtures/work";
import { invoiceFailedAls } from "@/lib/mgr/fixtures/invoice";
import { finishedGoodsList, movementRecordedFestival, recordMovementFestival, reverseMovementAdjustment } from "@/lib/mgr/fixtures/inventory";
import { binCold, locationBinsTaproom, locationTaproom, locationsList } from "@/lib/mgr/fixtures/locations";
import { completeTransferTape, newOrderDraft, orderPickedRestock, orderPickedRestockPutBack, orderSubmittedRidgeline, orderTransferComplete, ordersWorkList } from "@/lib/mgr/fixtures/orders";
import { orderAdjustLines, orderPick, orderReturnCredit, orderShipInvoice, orderShipOnDelivery, orderShipmentDone, orderShortPick } from "@/lib/mgr/fixtures/order-sheets";
import { parsPils } from "@/lib/mgr/fixtures/pars";
import {
  batchesBrewer, brewDayHazy, closePackagingRunHazy, recipeHazyV4, recipesList,
  runClosedHazy, scheduleBatchHazy, vesselFv3,
} from "@/lib/mgr/fixtures/production";
import { PICK_SHEET_DATE_CHIPS, pickSheet } from "@/lib/mgr/fixtures/pick-sheet";
import { ridgelineReviewOrder, ridgelineShop } from "@/lib/mgr/fixtures/portal";
import { portalAccountRidgeline, portalMeRidgeline } from "@/lib/mgr/fixtures/portal-account";
import { portalInvoicePaid, portalInvoiceUnpaid, portalInvoicesRidgeline } from "@/lib/mgr/fixtures/portal-invoices";
import { portalOrderShipped, portalOrdersList } from "@/lib/mgr/fixtures/portal-orders";
import { priceGroupTwo, pricingGrid } from "@/lib/mgr/fixtures/pricing";
import { channelExport, saleChannelsList, unitsPlato } from "@/lib/mgr/fixtures/settings-catalog";
import { newTransferDraft, transferDetailSubmitted, transfersList } from "@/lib/mgr/fixtures/transfers";
import {
  contractYchCitra, contractsList, cycleCountCans, materialCitra, materialsList, materialsOnHandList,
  newPoCountryMalt, purchaseOrdersWarehouse, receiptPoCountryMalt, receivePoCountryMalt, vendorYch, vendorsList,
} from "@/lib/mgr/fixtures/purchasing";
import { kegBalanceRidgeline, kegFleetMicrostar, kegHistoryLedger } from "@/lib/mgr/fixtures/kegs";
import { toAdjustLinesViewProps } from "@/lib/mgr/adjust-lines-view";
import { toBatchesViewProps } from "@/lib/mgr/batches-view";
import { toBeerViewProps } from "@/lib/mgr/beer-view";
import { toBrewDayViewProps } from "@/lib/mgr/brew-day-view";
import { toBinViewProps } from "@/lib/mgr/bin-view";
import { toBrandViewProps } from "@/lib/mgr/brand-view";
import { toCatalogViewProps } from "@/lib/mgr/catalog-view";
import { toChannelViewProps } from "@/lib/mgr/channel-view";
import { toClosePackagingRunViewProps } from "@/lib/mgr/close-packaging-run-view";
import { toCompleteTransferViewProps } from "@/lib/mgr/complete-transfer-view";
import { toContractViewProps } from "@/lib/mgr/contract-view";
import { toContractsViewProps } from "@/lib/mgr/contracts-view";
import { toCycleCountViewProps } from "@/lib/mgr/cycle-count-view";
import { toConfirmOrderViewProps } from "@/lib/mgr/confirm-order-view";
import { toCustomerViewProps } from "@/lib/mgr/customer-view";
import { toCustomersViewProps } from "@/lib/mgr/customers-view";
import { toDeniedViewProps } from "@/lib/mgr/denied-view";
import { toEntryViewProps } from "@/lib/mgr/entry-view";
import { toFinishedGoodsViewProps } from "@/lib/mgr/finished-goods-view";
import { toFirstRunViewProps } from "@/lib/mgr/first-run-view";
import { toFormatViewProps } from "@/lib/mgr/format-view";
import { toFormatsViewProps } from "@/lib/mgr/formats-view";
import { toInvoiceViewProps } from "@/lib/mgr/invoice-view";
import { toKegBalanceViewProps } from "@/lib/mgr/keg-balance-view";
import { toKegFleetViewProps } from "@/lib/mgr/keg-fleet-view";
import { toKegHistoryViewProps } from "@/lib/mgr/keg-history-view";
import { toLocationBinsViewProps } from "@/lib/mgr/location-bins-view";
import { toLocationViewProps } from "@/lib/mgr/location-view";
import { toLocationsViewProps } from "@/lib/mgr/locations-view";
import { toMaterialViewProps } from "@/lib/mgr/material-view";
import { toMaterialsViewProps } from "@/lib/mgr/materials-view";
import { toMaterialsOnHandViewProps } from "@/lib/mgr/materials-on-hand-view";
import { toMeViewProps } from "@/lib/mgr/me-view";
import { toNewPoViewProps } from "@/lib/mgr/new-po-view";
import { toMoreViewProps } from "@/lib/mgr/more-view";
import { toMovementRecordedViewProps } from "@/lib/mgr/movement-recorded-view";
import { toNewOrderViewProps } from "@/lib/mgr/new-order-view";
import { toNewTransferViewProps } from "@/lib/mgr/new-transfer-view";
import { toOrderViewProps } from "@/lib/mgr/order-view";
import { toOrdersListViewProps } from "@/lib/mgr/orders-list-view";
import { toPackageBomViewProps } from "@/lib/mgr/package-bom-view";
import { toParsViewProps } from "@/lib/mgr/pars-view";
import { toPickViewProps } from "@/lib/mgr/pick-view";
import { toPickSheetViewProps } from "@/lib/mgr/pick-sheet-view";
import { toPortalAccountViewProps } from "@/lib/mgr/portal-account-view";
import { toPortalInvoiceViewProps } from "@/lib/mgr/portal-invoice-view";
import { toPortalInvoicesViewProps } from "@/lib/mgr/portal-invoices-view";
import { toPortalMeViewProps } from "@/lib/mgr/portal-me-view";
import { toPortalOrderViewProps } from "@/lib/mgr/portal-order-view";
import { toPortalOrdersViewProps } from "@/lib/mgr/portal-orders-view";
import { toPriceGroupViewProps } from "@/lib/mgr/price-group-view";
import { toPriceGroupsViewProps } from "@/lib/mgr/price-groups-view";
import { toPurchaseOrdersViewProps } from "@/lib/mgr/purchase-orders-view";
import { toPutBackViewProps } from "@/lib/mgr/put-back-view";
import { toReceiptViewProps } from "@/lib/mgr/receipt-view";
import { toReceivePoViewProps } from "@/lib/mgr/receive-po-view";
import { toQuestionInvoiceViewProps } from "@/lib/mgr/question-invoice-view";
import { toRecipeViewProps } from "@/lib/mgr/recipe-view";
import { toRecipesViewProps } from "@/lib/mgr/recipes-view";
import { toRecordMovementViewProps } from "@/lib/mgr/record-movement-view";
import { toRunClosedViewProps } from "@/lib/mgr/run-closed-view";
import { toScheduleBatchViewProps } from "@/lib/mgr/schedule-batch-view";
import { toReverseMovementViewProps } from "@/lib/mgr/reverse-movement-view";
import { toReviewOrderViewProps } from "@/lib/mgr/review-order-view";
import { toReturnCreditViewProps } from "@/lib/mgr/return-credit-view";
import { toSaleChannelsViewProps } from "@/lib/mgr/sale-channels-view";
import { toSearchViewProps } from "@/lib/mgr/search-view";
import { toSessionExpiredViewProps } from "@/lib/mgr/session-expired-view";
import { toSettingsViewProps } from "@/lib/mgr/settings-view";
import { toShipToViewProps } from "@/lib/mgr/ship-to-view";
import { toShipViewProps } from "@/lib/mgr/ship-view";
import { toShipmentDoneViewProps } from "@/lib/mgr/shipment-done-view";
import { toShopViewProps } from "@/lib/mgr/shop-view";
import { toShortPickViewProps } from "@/lib/mgr/short-pick-view";
import { toSkuListViewProps } from "@/lib/mgr/sku-list-view";
import { toSkuViewProps } from "@/lib/mgr/sku-view";
import { toTeamViewProps } from "@/lib/mgr/team-view";
import { toTodayViewProps } from "@/lib/mgr/today-view";
import { toTransferDetailViewProps } from "@/lib/mgr/transfer-detail-view";
import { toTransfersViewProps } from "@/lib/mgr/transfers-view";
import { toUnitsViewProps } from "@/lib/mgr/units-view";
import { toVendorViewProps } from "@/lib/mgr/vendor-view";
import { toVendorsViewProps } from "@/lib/mgr/vendors-view";
import { toVesselDetailViewProps } from "@/lib/mgr/vessel-detail-view";
import { toWorkViewProps } from "@/lib/mgr/work-view";
import { QuickBooksMark, SlackMark, SquareMark } from "@/components/mgr/brand-icons";
import { S, sqItemFilters, sqTxnHead, X, type Venue } from "@/components/mgr/venue";
import { MgrIcon } from "@/components/mgr-icon";
import { formatVolume } from "@/lib/volume";
import { saccharificationRest, type Step, totalDuration } from "@/lib/mgr/recipe-schedule";
import { WifiDisconnected01Icon } from "@hugeicons/core-free-icons";

/** The drawn mash schedule. Rows and footer both read it, so the total and the
 *  conversion rest can never disagree with the steps above them. */
const MASH_STEPS: Step[] = [
  { name: "Mash-in", kind: "infusion", tempF: 104, duration: 15 },
  { name: "Saccharification", kind: "infusion", tempF: 152, duration: 60 },
  { name: "Mash-out", kind: "direct heat", tempF: 168, duration: 10 },
];

/** The drawn fermentation schedule; `duration` is days. Same rule as MASH_STEPS. */
const FERM_STAGES: Step[] = [
  { name: "Primary", kind: "primary", tempF: 68, duration: 4 },
  { name: "Diacetyl rest", kind: "diacetyl rest", tempF: 72, duration: 2 },
  { name: "Cold crash", kind: "cold crash", tempF: 34, duration: 2 },
  { name: "Conditioning", kind: "conditioning", tempF: 34, duration: 10 },
];

export const PORTAL_BUYER = { name: "Jordan Lee", account: "Ridgeline Tap Room", email: "jordan@ridgelinetap.com" };

export type Tab = "Today" | "Beer" | "Work" | "More";
export type Screen = {
  step: number;
  slice: "all" | "chat" | number;
  /** Staff tab the frame lives under; a Global sheet sets `group` instead. */
  tab?: Tab;
  group?: "Global" | "Entry" | "Portal" | "Desk" | "Chat" | "POS" | "QuickBooks Online";
  /** Portal tab, for PortalShell frames. */
  portal?: "Order" | "Orders" | "Invoices" | "Account";
  /** Default page; `sheet` and `entry` frames render as a panel over the shell. */
  surface?: "page" | "sheet" | "entry";
  name: string;
  job: ReactNode;
  reads: ReactNode;
  writes: ReactNode;
  states?: [string, string, (0 | 1)?][];
  spec?: ReactNode;
  /** The program that still owns shipping this screen, when no reads/writes tag
   *  can say so — the record names no command, or another program owns the whole
   *  surface. lib/mgr/screen-routes.ts keeps these out of the parity set. */
  gatedBy?: string;
  /** The drawing replaced an earlier one and `spec` explains why; the docs fold it. */
  redrawn?: true;
  /** Drawn inside another product (QuickBooks, Square, Slack) in that product's
   * own chrome; the body then speaks `X`/`S`, not `E`. See ./venue.tsx. */
  venue?: Venue;
  /** Where a tap goes when its label means something else on this screen
   * (`Adjust` on Order opens Short pick); the global rules in
   * lib/mgr/screen-links.ts cover labels that always mean the same screen. */
  to?: Record<string, string>;
  /** Entry-screen header (mark + product name); sheets take their title from `name`. */
  hd?: ReactNode;
  body: ReactNode;
};

/** The section a screen files under: a venue frame under its product, a
 * portal screen under Portal, otherwise its group or tab. */
export const area = (s: Screen) => s.venue?.name ?? s.group ?? (s.portal ? "Portal" : (s.tab ?? "Other"));



// One invoice threaded through the AR list, the portal and the QuickBooks
// venue frames, plus its named siblings. Every invoice number in this file
// comes from here, so one order cannot end up with two of them.
export const INV = {
  no: "INV-1042",
  /** The Standard group's case code: the SKU frame reads what the group owns,
   *  so both frames must show one number or the feature contradicts itself. */
  upc: "00810123450127",
  order: "ORD-0231",
  paid: "INV-1037",
  failed: "INV-1039",
  edited: "INV-1041",
  voided: "INV-1040",
  unsent: "INV-1038",
  deleted: "INV-1036",
  memo: "CM-0012",
  customer: "Ridgeline Tap Room",
  invoiceDate: "9/03/2026",
  due: "10/03/2026",
  dueShort: "10/03",
  total: "$948.00",
  major: "948",
  cents: "00",
  hazyPrice: "$150.00",
  hazyAmount: "$600.00",
  pilsPrice: "$38.00",
  pilsAmount: "$228.00",
  depositAmount: "$120.00",
  credit: "$106.00",
  creditMajor: "106",
  fee: "$9.48",
} as const;

// The sale channels, in the order every picker offers them.
const CHANNELS = ["Wholesale", "Taproom", "DTC", "Export"];

// Hours before a fermentation reading counts as overdue. Settings owns it;
// Chat settings shows the same number back.
const OVERDUE_HOURS = "24";

// A rough remaining fill, wherever a keg comes off a tap.
const FILL_CHIPS = ["Empty", "About ¼ left", "About ½ left"];

// The Work list chips, in the order every Work list draws them.
const WORK_CHIPS = ["all", "orders", "transfers", "batches", "runs", "POs", "routes"];
/** The screen each Work chip opens: the chips are one bar drawn on the Work lists. */
export const WORK_TABS: Record<string, string> = { all: "Work", orders: "Orders", transfers: "Transfers", batches: "Batches", runs: "Packaging runs", POs: "Purchase orders", routes: "Routes" };

// The states every screen can reach; a record with designed states lists its own instead.
const DEFAULT_STATES: NonNullable<Screen["states"]> = [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]];
/** DEFAULT_STATES with the permission note swapped for who may open the screen. */
const permitted = (who: string): NonNullable<Screen["states"]> => [["permission", who, 1], ...DEFAULT_STATES.filter(([st]) => st !== "permission")];

export const SCREENS: Screen[] = [
  // step 1 — foundations and both authenticated shells
  {
    step: 1, slice: "all", tab: "Today", name: "Today",
    to: { Pick: "Pick sheet", "Put back": "Put back", "3 orders ready": "Pick sheet", "Staged · ORD-0229": "Order" , "Next delivery \u00b7 Ridgeline": "Driver route" },
    job: "Role-filtered work that opens ready to finish · full-size exemplar at ship scale",
    reads: "get_today [delivery rows require assigned warehouse member or admin]", writes: "none",
    states: [["empty", "one button: the role's first verb"], ["loading", "row-shaped skeletons"], ["error", "Today did not load · Retry", 1], ["offline", "cached rows · writes queue"], ["role hidden", "only relevant permitted work · no blank gaps"]],
    spec: "Drawn as the warehouse persona at honest 16px density. Rows are role-filtered per plan §3; the row verb is the action. A row standing for one order opens that order's Pick. This row stands for three, so Pick lands on the day's Pick sheet and each order opens its own Pick from there; the verb never becomes a noun to explain itself. The restock row appears while the order's restock flag is set and opens the order. Weekly count is gated: disabled with human copy, never a gate name.",
    body: <TodayView model={toTodayViewProps(todayWarehouse)} footer={E.gated("Weekly count")} />,
  },
  {
    step: 4, slice: "all", tab: "Today", name: "Today empty",
    job: "Nothing waiting; the role's first verb is the only button",
    reads: "get_today", writes: "none",
    states: [["empty", "one button: the role's first verb"]],
    spec: "Empty Today. When work exists the row is where you act; with nothing waiting the first verb stands alone.",
    body: <TodayView model={toTodayViewProps(todayEmpty)} />,
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Sales",
    to: { "Pils · 16 oz case": "Pars and allocation", Open: "Invoice", "Al\u2019s Bar \u00b7 OH": "State registration" },
    job: "Sales landing: submitted orders to confirm and beer that is short",
    reads: "get_today [sales role filter] · get_shortfalls · list_invoice_questions", writes: "none",
    states: [["empty", "one button: the role's first verb"], ["role hidden", "no Pick/Receive; no blank gaps"], ["buyer question", "a portal question lands here, because nothing else in MGR would show it"]],
    spec: "The same Today read as the exemplar, filtered for sales. Confirm is the row verb (2 taps); shortfall rows open Shortfall, pars and standing allocation. A question raised from the portal's Question invoice sheet appears as a row here and opens that invoice, where Mark answered clears it: the note has a destination a person opens and a way to leave the list again. New order is the last row because the top button is gone.",
    body: <TodayView model={toTodayViewProps(todaySales)} footer={E.nav("New order")} />,
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Brewer",
    to: { "Close": "Close packaging run" },
    job: "Brewer landing: readings due, brew day due, packaging to close",
    reads: "get_today [brewer role filter]", writes: "none",
    states: [["empty", "one button: the role's first verb"], ["role hidden", "no picks or receipts"]],
    spec: "Reading opens the Fermentation reading sheet defaulted to the overdue vessel. Brew day and packaging rows open their Work frames. Warehouse picks never appear here. The row verb is the action.",
    body: <TodayView model={toTodayViewProps(todayBrewer)} />,
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Driver",
    to: { "Route A": "Driver route" },
    job: "Driver landing: the next stop and nothing else",
    reads: "get_today [delivery rows require route.driver_user_id = caller or admin]", writes: "none",
    states: [["empty", "No route today"], ["offline", "stop list cached · Delivered waits", 1], ["permission", "warehouse membership + assigned route", 1]],
    spec: "Resume opens Confirm delivery for the next incomplete stop. Route A opens Driver route (all stops, the load, Return). No Pick/Receive rows.",
    body: <TodayView model={toTodayViewProps(todayDriver)} lead={E.btn("Resume · Stop 1 of 3")} footer={E.nav("Route A", "departed 8:10 · return open")} />,
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Taproom",
    to: { Open: "Tap board", Count: "Weekly count", Review: "Variance by brand", "Variance \u00b7 4 weeks": "Variance by brand" },
    job: "Bartender landing: open the board, count, or review completed variance",
    reads: "list_locations · list_open_taps · list_taproom_counts · get_taproom_variance", writes: "none",
    states: [["no location", "no observed taproom facts; Taproom stock remains available"], ["role hidden", "no Work, Search, orders, invoices, or brewery quiet settings", 1], ["narrow surface", "three permitted exits with last observed facts"]],
    spec: "Taproom Today uses only permitted taproom reads. It links the board, weekly count and four-week variance with last-opened, last-counted and report as-of facts. It does not invent an overdue count, shift schedule, or POS mapping action. Work, Search, business records and brewery quiet settings stay hidden.",
    body: <TodayView model={toTodayViewProps(todayTaproom)} footer={E.note("Observed facts only. No fabricated overdue or shift policy; no Work, Search, orders or invoices.")} />,
  },
  {
    step: 1, slice: "all", tab: "Beer", name: "Beer", job: "Inventory, cellar, materials and kegs",
    to: { Taproom: "Weekly count", Materials: "Materials on hand" },
    reads: "get_beer_overview", writes: "none",
    states: DEFAULT_STATES,
    body: <BeerView model={toBeerViewProps(beerOverview)} />,
  },
  {
    step: 1, slice: "all", tab: "Work", name: "Work", job: "Everything currently in motion, ordered by next due action",
    reads: "list_work", writes: "none",
    states: DEFAULT_STATES,
    spec: "Warehouse default rows shown; the chips are the kinds the role may open (a brewer has no POs or routes) and an explicit chip choice is remembered. Rows sort by urgency/due time, not newest activity.",
    body: <WorkView model={toWorkViewProps(workWarehouse)} />,
  },
  {
    step: 1, slice: "all", tab: "More", name: "More", job: "Setup and desk review, never standing work",
    reads: "none [role navigation manifest]", writes: "none",
    states: DEFAULT_STATES,
    spec: "Role-filtered; hidden entries leave no gaps. Standing work remains in Today, Beer or Work.",
    body: <MoreView model={toMoreViewProps(moreNavs)} />,
  },
  {
    step: 1, slice: "all", group: "Global", surface: "sheet", name: "Search", job: "Search every permitted entity kind",
    reads: "search_entities", writes: "none",
    states: [["empty", "No matches · change the term"], ["loading", "row-shaped skeletons"], ["offline", "cached matches only", 1], ["permission", "Results honor row access"], ["document number", "ORD-0231 matches exactly and sorts first"]],
    spec: "One registered search across the entity kinds the caller's role can read; results are grouped by kind and arrow keys move between matches; filtering never widens what is permitted, and RLS decides the rows either way, so a term matching a customer the caller cannot see returns nothing rather than a redacted row. A document number (ORD-0231, INV-1042, L-240831-HZ) matches exactly and sorts above name matches, because someone typing one is holding it in their hand; names match on prefix. This is also where history lives: a run closed months ago leaves the Work list and is found here.",
    body: <SearchView model={toSearchViewProps(searchPalette)} />,
  },
  {
    step: 1, slice: "all", group: "Global", surface: "sheet", name: "Me", job: "Who I am, which brewery, leave",
    to: { "Maria Alvarez": "Me" },
    reads: "supabase_auth_get_session [platform] · get_first_run_state", writes: "supabase_auth_sign_out [platform]",
    states: [["dedicated mode", "switcher hidden · one brewery"], ["single membership", "switcher hidden"]],
    spec: "Opened from the header Me control. Brewery switcher renders only in SaaS mode with more than one membership. Change password opens Set new password, as portal Me opens Portal set password: a signed-in person should not have to sign out and use the recovery flow. No notification history, no settings; those live under More.",
    body: <MeView model={toMeViewProps(meMaria)} />,
  },
  {
    step: 1, slice: "all", tab: "More", name: "Settings", job: "Edit brewery/location basics and route to rare setup",
    to: { "Source water · Municipal · Denver": "Water profiles" },
    reads: "get_brewery · list_locations · list_team_members", writes: "update_brewery · update_location · set_portal_fulfillment_source",
    states: permitted("admin only"),
    spec: "Invoices remains a first-class More and desk-rail destination. TTB registry number and PA license are brewery columns and feed the compliance report header. The customer-facing phone is the number the portal prints when online payment is unavailable, so it is collected here rather than assumed. Deployment mode is read-only. Team opens the Team frame.",
    body: <SettingsView model={toSettingsViewProps(settingsDemo)} />,
  },
  {
    step: 8,
    slice: "all",
    tab: "More",
    name: "Locations",
    to: { Taproom: "Location detail", Warehouse: "Location detail", Edit: "Location detail" },
    job: "List brewery locations and create the next one",
    reads: "list_locations",
    writes: "create_location",
    states: [["permission", "admin edits · sales, warehouse and brewer read", 1], ["active", "inventory and work may use it"], ["empty", "Add location is the only action"]],
    spec: "Settings links here instead of editing whichever location happened to be selected. Admin edits; other staff review locations and return to Beer. All finished goods inventory is the global ledger, not a location filter.",
    body: <LocationsView model={toLocationsViewProps(locationsList)} />,
  },
  {
    step: 8,
    slice: "all",
    tab: "More",
    name: "Location detail",
    to: { "Save location": "Locations", "Location bins": "Location bins" },
    job: "Edit one location and open its physical bins",
    reads: "list_locations",
    writes: "update_location",
    states: [["permission", "admin only", 1], ["warehouse", "fulfillment source"], ["taproom", "POS and taps may map here"], ["in use", "type changes preserve history"]],
    spec: "Location facts stay separate from bins, which are their own list.",
    body: <LocationView model={toLocationViewProps(locationTaproom)} />,
  },
  {
    step: 1, slice: "all", group: "Global", name: "Permission denied",
    job: "A forbidden route says what was refused and offers one way back",
    reads: "none [the denied query never runs]", writes: "none",
    states: [["bookmarked", "direct URL · denied, not empty rows", 1], ["revoked mid-session", "the next command is refused; the shell stays usable", 1]],
    spec: "Plan §3: navigation and Today hide inapplicable actions while the registry and RLS still deny direct URLs and commands, so this frame exists for the URL, not for a link. It names the refusal and the role that would satisfy it, never a blank table, a spinner, or the shape of data the caller may not read.",
    body: <DeniedView model={toDeniedViewProps(deniedInvoices)} />,
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "No membership",
    job: "Signed in, but this account is not on any brewery or customer",
    reads: "none", writes: "none",
    states: [["no brewery", "create a brewery on hosted MGR"], ["dedicated", "creation is hidden"], ["no customer", "contact the brewery"]],
    spec: "After sign-in with no brewery and no customer account. The queue is empty because nothing was writable.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={toEntryViewProps(noMembership)} />,
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "Expired invite",
    job: "The invite link is no longer valid",
    reads: "none", writes: "none",
    states: [["expired", "sign in or recover your password"], ["wrong audience", "a customer link used on staff, or the reverse", 1], ["already a member", "sign in instead"]],
    spec: "Plan §5b. A used or timed-out token never opens Accept invite.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Invite expired")}
      {E.note("This invite is no longer valid.")}
      {E.info("Sign in or reset your password. Contact the brewery if access is still missing.")}
      {E.btn("Reset password")}
      {E.btn("Back to sign in")}
      {E.sp()}
    </>),
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "Expired reset",
    job: "The password reset link is no longer valid",
    reads: "none", writes: "none",
    states: [["expired", "request a new reset link"]],
    spec: "A timed-out recovery token never opens Set new password.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={toEntryViewProps(expiredReset)} />,
  },
  {
    step: 4, slice: 1, group: "Global", surface: "sheet", name: "Session expired",
    to: { "Sign in to retry": "Sign in", "Record movement · Hazy": "Offline outbox" },
    job: "Sign in again; queued writes stay in the outbox",
    reads: "local_outbox [client state]", writes: "none",
    states: [["queue kept", "3 writes waiting"], ["signed in", "Retry 1 waiting on the outbox"]],
    spec: "Mid-write expiry does not drop the outbox. Sign in, then Offline outbox still has the queued envelopes.",
    body: <SessionExpiredView model={toSessionExpiredViewProps(sessionExpiredQueued)} />,
  },
  // steps 2–8
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Sign in",
    job: "Enter through the Supabase Auth platform boundary",
    reads: "none",
    writes: "supabase_auth_sign_in_with_password · supabase_auth_sign_in_with_otp [platform]",
    states: DEFAULT_STATES,
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={toEntryViewProps(signIn)} />,
  },
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Accept invite",
    job: "Set a password and land in the correct shell",
    reads: "supabase_auth_get_session [platform]",
    writes: "supabase_auth_update_user [platform; membership already exists]",
    states: DEFAULT_STATES,
    spec: "Staff lands on Today; a customer lands on portal Order. The verified membership decides; the person never chooses a shell. Name is collected here. Expired, wrong-audience and already-a-member are their own landings.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Join Demo Brewing")}
      {E.row("Role", "", "warehouse")}
      {E.inp("Your name")}
      {E.inp("Choose a password")}
      {E.btn("Join Demo Brewing")}
      {E.sp()}
    </>),
  },
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Reset password",
    job: "Recover access without account enumeration",
    reads: "none",
    writes: "supabase_auth_reset_password_for_email [platform]",
    states: [["sent", "Check your email"], ["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["error", "Did not load · Retry", 1]],
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={toEntryViewProps(resetPassword)} />,
  },
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Set new password",
    job: "Recovery-token landing; distinct from joining a brewery",
    reads: "supabase_auth_get_session [platform; recovery token]",
    writes: "supabase_auth_update_user [platform; membership unchanged]",
    states: [["expired link", "Request a new reset link", 1], ["wrong audience", "portal user lands in the portal shell"]],
    spec: "The recovery token opens this, never Accept invite: no role row, no “Join” copy. After Save the existing membership decides the shell.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={toEntryViewProps(setPassword)} />,
  },
  {
    step: 6,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Portal sign in",
    to: { "Sign in": "Shop" },
    job: "A wholesale buyer enters through the same Auth boundary",
    reads: "none",
    writes: "supabase_auth_sign_in_with_password [platform]",
    states: DEFAULT_STATES,
    spec: "Customer-only accounts land on Order. Forgot password is a text link, not a second primary.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={toEntryViewProps(portalSignIn)} />,
  },
  {
    step: 6,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Portal forgot password",
    to: { "Send reset link": "Portal set password" },
    job: "Recover a buyer login without saying whether the email exists",
    reads: "none",
    writes: "supabase_auth_reset_password_for_email [platform]",
    states: DEFAULT_STATES,
    spec: "The sent state is this same screen with the info. Enumeration is never confirmed.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={toEntryViewProps(portalForgotPassword)} />,
  },
  {
    step: 6,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Portal set password",
    to: { "Save password": "Shop" },
    job: "Recovery-token landing for a buyer; lands in the portal",
    reads: "supabase_auth_get_session [platform; recovery token]",
    writes: "supabase_auth_update_user [platform]",
    states: DEFAULT_STATES,
    spec: "After Save, a customer membership opens Order, not Today.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={toEntryViewProps(portalSetPassword)} />,
  },
  {
    step: 2,
    slice: 1,
    tab: "More",
    name: "Team",
    job: "Roster, single staff role, invitations and membership removal",
    reads: "list_team_members",
    writes: "invite_staff [existing] · the taproom role [SCHEMA-GATE: revision 2 §16.13/§16.16 q3: staff_role gains taproom, but P-staff is role-agnostic, so the narrow per-role policies are undesigned] · update_staff_role · revoke_staff",
    states: [["last admin", "role change refused · keep one admin", 1], ["permission", "admin only", 1]],
    spec: "A person shows as @handle, derived from their email. Admin invites one staff role and changes or removes other memberships. The roster does not distinguish pending acceptance. Existing accounts cannot be attached or reinvited; removing membership leaves the Auth account.",
    body: <TeamView model={toTeamViewProps(teamRoster)} />,
  },
  {
    step: 2, slice: 1, tab: "More", surface: "sheet", name: "Invite staff",
    to: { "Send invite": "Team" },
    job: "Invite one new staff account with one role",
    reads: "none", writes: "invite_staff",
    states: [["permission", "admin only", 1], ["retry", "unchanged input keeps request identity"], ["existing account", "cannot attach existing accounts", 1]],
    body: (<>
      {E.edit("Email", "", "email")}
      {E.pick("Role", "Warehouse", ["Warehouse", "Sales", "Brewer", "Admin"])}
      {E.note("Sending an invite emails the recipient. Keep this page open to retry after an error.")}
      {E.btn("Send invite")}
    </>),
  },
  {
    step: 2,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Team member",
    to: { "Save role": "Team", "Remove Dave": "Team" },
    job: "Change one member's role or remove that membership",
    reads: "list_team_members",
    writes: "update_staff_role · revoke_staff",
    states: [["permission", "admin only", 1], ["last admin", "keep at least one admin", 1], ["self", "remove refused", 1]],
    spec: "Membership holds one role. Multiple simultaneous staff roles are unsupported. The live form opens only for another member; removing membership leaves their sign-in account.",
    body: (<>
      {E.row("Dave Chen", "dave@demobrewing.com", "", "", E.face({ className: "size-10", src: "/mock/dave.jpg" }))}
      {E.pick("Role", "Brewer", ["Warehouse", "Sales", "Brewer", "Admin"])}
      {E.btn("Save role")}
      {E.note("Removing Dave ends this brewery membership. Their sign-in account remains.")}
      {E.btn("Remove Dave", "del")}
    </>),
  },
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Create brewery",
    to: { "Create brewery": "First-run checklist" },
    job: "Provision tenant and first owner atomically",
    reads: "none [deployment mode gate]",
    writes: "provision_brewery [existing; authenticated pre-tenant; one RPC: brewery + first admin membership]",
    states: DEFAULT_STATES,
    spec: "Hidden in dedicated mode; this is the pre-brewery provisioning boundary.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.ttl("New brewery")}
      {E.edit("Brewery name", "")}
      {E.pick("Timezone", "America/New_York", ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"])}
      {E.edit("TTB registry number", "")}
      {E.btn("Create brewery")}
    </>),
  },
  {
    step: 2,
    slice: 1,
    tab: "Today",
    name: "First-run checklist",
    to: { "Add location": "First-run checklist", "2 \u00b7 Import CSV": "Import", "3 \u00b7 Add a brand": "Brand", Add: "Brand", "5 \u00b7 Opening inventory": "Record movement" },
    job: "Turn an empty brewery into usable truth",
    reads: "get_first_run_state",
    writes: "invite_staff [existing] · create_location",
    states: permitted("admin only"),
    spec: "Admin sees this only while neither a location nor a brand exists; adding either ends the checklist. Import and staff invitation are optional and do not block onboarding. Team and first-run use the same staff invitation form with one role.",
    body: <FirstRunView model={toFirstRunViewProps(firstRunDemo)} />,
  },
  {
    step: 3,
    slice: 1,
    group: "Desk",
    name: "Import",
    job: "Upload, map, preview and independently commit valid rows",
    reads: "list_skus · list_locations · list_bins · list_customers · list_formats · list_price_groups · list_sale_channels",
    writes: "import_csv",
    states: [["upload error", "the file did not parse · nothing staged", 1], ["all invalid", "Commit disabled · fix mapping", 1], ["mixed", "2 ready · 1 blocked"], ["rerun target", "same requestId returns original committed and blocked results"], ["permission", "Import requires admin", 1]],
    spec: "One logical row is atomic; siblings commit independently. Preview is editable on phone and desk. All-invalid batches cannot commit. Same-batch retry returns original results; correction starts only blocked rows with a new identity. Keep the page open for retry recovery; reopening has no automatic batch recovery.",
    body: (<>
      {E.back("Settings", "Import")}
      {E.stp(["upload", "map", "preview", "commit"], 2)}
      {E.chips(["customers", "ship-tos", "products", "channel prices", "opening balances"], 0)}
      {E.tbl(["row", "record", "match", "state"], [["1", "Ridgeline + Main", "new", "ready"], ["2", "Al’s Bar", "sale channel missing", <><span className="text-warning-foreground">blocked</span></>], ["3", "Teresa’s", "new", "ready"]])}
      {E.btn("Import 2 customer rows")}
      {E.note("Retry returns original results. Correct only blocked rows in a new batch.")}
    </>),
  },
  {
    step: 3,
    slice: 1,
    tab: "Beer",
    name: "Finished goods",
    job: "See sellable beer by SKU and act on shortages",
    reads: "get_on_hand · get_atp",
    writes: "none [SKU creation happens on its own surface]",
    states: [["short", "ATP below zero links to the competing orders"], ["empty", "no finished goods yet: Add SKU is the only action"]],
    spec: "The Beer landing's Finished goods row opens this list. On-hand, allocated and ATP stay together on each SKU; Review opens SKU detail and a shortage opens the shortfall. Add SKU opens the existing product and SKU flow.",
    body: <FinishedGoodsView model={toFinishedGoodsViewProps(finishedGoodsList)} />,
  },
  {
    step: 3,
    slice: 1,
    tab: "Beer",
    name: "SKU detail",
    to: { Warehouse: "SKU detail", Taproom: "SKU detail", "Reverse movement": "Reverse movement", "+1 · adjustment": "Reverse movement" },
    job: "See on-hand, ATP and immutable tape together",
    reads: "get_inventory_sku · get_on_hand · get_atp · list_movements",
    writes: "reverse_inventory_movement [standalone adjustment/loss only; admin or warehouse]",
    states: permitted("sales reads; admin or warehouse reverses eligible standalone adjustments/losses"),
    spec: "Review opens inventory SKU detail with complete on-hand by location, ATP and paginated immutable history. Admin and Warehouse reverse only standalone adjustments and losses with a required note; the exact linked opposite retains frozen volume, class, bin and lot. Sales reads only. Count corrections live on the eligible latest saved weekly count; shipment rows retain Return shipment. This is distinct from the catalog SKU editor.",
    body: <InventoryDetailView model={INVENTORY_DETAIL} movementAction={() => E.btn("Reverse movement")} />,
  },
  {
    step: 3, slice: 1, tab: "Beer", surface: "sheet", name: "Reverse movement",
    to: { "Confirm reversal": "SKU detail" },
    job: "Correct one selected standalone adjustment or loss",
    reads: "list_movements", writes: "reverse_inventory_movement",
    states: [["permission", "Admin or Warehouse only; Sales reads history"], ["insufficient", "Original bin/lot cannot cover the exact removal"], ["already reversed", "Open the linked correction"], ["unsupported", "Count and compound corrections retain their owner"]],
    spec: "The selected movement and exact opposite quantity, frozen BBL, bin and lot are read-only. A correction note is required. Confirm reversal appends one linked row; unchanged failed submissions keep their request ID.",
    body: <ReverseMovementView model={toReverseMovementViewProps(reverseMovementAdjustment)} />,
  },
  {
    step: 3,
    slice: 1,
    group: "Global",
    surface: "sheet",
    name: "Record movement",
    to: { "Record movement": "Movement recorded" },
    job: "Enter a positive amount; the form derives direction and the server calculates barrels",
    reads: "list_skus · list_locations · list_bins · get_atp",
    writes: "record_movement [existing; one append-only inventory movement]",
    states: [["offline", "Queue with requestId"], ["stale", "ATP changed · preview again", 1], ["permission", "admin or warehouse required · sales reads Beer only", 1], ["echo", "Committed row · eligible standalone adjustment/loss correction opens inventory SKU detail"], ["unregistered destination", "Stout to OH warns and links to the registry · never blocks", 1]],
    spec: "The form derives the signed API quantity from the movement kind (adjustments ask Add or Remove); the server derives 0.50000000 bbl and never accepts client-supplied barrels. Drawn with festival removal selected: sample and festival removal leave the premises and require a destination state (the schema enforces it); destruction, loss and depletion never carry one. An unregistered brand and destination warn here with the same copy the order screens use, because a festival removal leaves the premises exactly as a shipment does and was the one path that crossed a state line without saying so. This frame carries Hazy IPA into PA, which is registered, so the warning is a state rather than drawn copy. Channel stays.",
    body: (<>
      <RecordMovementView model={toRecordMovementViewProps(recordMovementFestival)} footer={null} />
      {E.pin(<>{E.btn("Record movement", "irr")}</>)}
    </>),
  },
  {
    step: 3,
    slice: 1,
    tab: "Beer",
    name: "Movement recorded",
    job: "Echo the immutable row and name the correction",
    reads: "list_movements",
    writes: "none",
    states: [["echo", "the tape is the record"], ["correction gated", "Record inventory correction waits on its schema"]],
    spec: "Post-commit of Record movement. A tape means recorded: show the committed movement reference, bin, frozen barrel volume, destination state/channel and timestamp from the RPC result. An uncertain response never shows this receipt. The ledger has Older/Newer paging. The named correction is Record inventory correction, not Undo.",
    body: <MovementRecordedView model={toMovementRecordedViewProps(movementRecordedFestival)} />,
  },
  {
    step: 3,
    slice: 1,
    group: "Global",
    surface: "sheet",
    name: "Entity picker",
    job: "Recents first, then one registered search",
    reads: "search_entities · list_skus",
    writes: "none",
    states: DEFAULT_STATES,
    spec: "48px rows; visible keyboard focus; one registered search behind the field.",
    body: <SearchView model={toSearchViewProps(entityPickerPalette)} />,
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer proposal",
    to: { "\u201cBlew a half of Hazy at the taproom\u201d": "Composer question" },
    job: "Candidate language becomes canonical server preview; signed effect leads",
    reads: "preview_command [view; internal query, not an AI tool]",
    writes: "record_movement [Commit; same requestId + previewToken; server revalidates]",
    states: [["ambiguous", "One question · choice chips · no Commit button", 1], ["stale", "Reject and preview current data", 1], ["permission", "No proposal beyond allowed role", 1], ["offline", "Save candidate; no fake preview"]],
    spec: "Ambiguity (“half” = ½ bbl keg, or half the remaining ⅙?) renders a question with choice chips and no Commit; this frame is the resolved proposal after that choice. The preview query is internal, never an AI tool.",
    body: (<>
      {E.hd("Composer", "proposal")}
      {E.row("“Blew a half of Hazy at the taproom”")}
      {E.num("−1 × Hazy IPA · ½ bbl keg", "Taproom · depletion · −½ bbl")}
      {E.nav("SKU / package", "Hazy IPA · ½ bbl keg")}
      {E.pick("Location", "Taproom", ["Warehouse", "Taproom"])}
      {E.pick("Type", "Depletion", ["Depletion", "Loss", "Adjustment"])}
      {E.info("Document numbers are assigned on commit.")}
      {E.sp()}
      {E.btns([["Open as form", "g"], ["Commit movement", "irr"]])}
    </>),
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer question",
    to: { "\u201cBlew a half of Hazy at the taproom\u201d": "Composer proposal" },
    job: "One question, chips, no Commit until the SKU is chosen",
    reads: "preview_command [view; internal query, not an AI tool]",
    writes: "none",
    states: [["ambiguous", "choice chips · no Commit"], ["resolved", "opens Composer proposal"]],
    spec: "Named in Composer proposal states and never drawn until now. “Blew a half of Hazy” must pick the package before a Commit exists.",
    body: (<>
      {E.hd("Composer", "question")}
      {E.row("“Blew a half of Hazy at the taproom”")}
      {E.ttl("Which half?")}
      {E.chips(["½ bbl keg", "Half the remaining ⅙"], -1)}
      {E.info("The verb stays off until this is answered.")}
    </>),
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer answer", gatedBy: "Program 15",
    to: { "Shortfall detail": "Pars and allocation", Review: "Pars and allocation" },
    job: "Questions use named registered queries",
    reads: "get_atp · get_shortfalls",
    writes: "none",
    states: [["loading", "answer skeleton"], ["error", "Could not refresh ATP · Retry", 1], ["offline", "cached value + timestamp"]],
    spec: "History is a visible control in the composer strip; no swipe-only interaction.",
    body: (<>
      {E.hd("Composer", "answer")}
      {E.row("“How much Hazy can I promise Friday?”")}
      {E.num("11 × ½ bbl", "plus 40 cases · 2 orders compete for 6")}
      {E.row("Shortfall detail", "who competes for the 6", E.act("Review"))}
    </>),
  },
  {
    step: 4,
    slice: 1,
    group: "Global",
    surface: "sheet",
    name: "Offline outbox", gatedBy: "Program 15",
    to: { Fix: "Cellar transfer", Discard: "Offline outbox", "Record movement · Hazy": "Record movement", "Record fermentation reading · FV3": "Fermentation reading", "Record cellar transfer · FV2": "Cellar transfer", "Record pick · ORD-0229": "Pick" },
    job: "Retry safely; separate response loss from permanent rejection",
    reads: "local_outbox [client state]",
    writes: "none [client replays envelope’s exact registered command with same requestId; confirmed discard is local]",
    states: [["response lost", "Server dedupe returns prior result"], ["permanent", "Open form; preserve fields", 1], ["session expired", "Sign in; keep queue"], ["permission changed", "the row says why and offers only Discard", 1], ["one row", "discarding one leaves the others queued"]],
    spec: "The discard confirmation names every queued write; response loss resolves by requestId and shows the prior result. Discard is per row as well as bulk: a write that can never succeed (a role that changed under it, a validation the server will refuse again) otherwise forces someone to bin the two retryable writes beside it to clear the one that is stuck. A row whose permission changed is never replayed, so it carries no Retry at all; the copy names the role it was written under, because the person holding the phone is usually not the person who changed it.",
    body: (<>
      {E.row("Record movement · Hazy", "waiting for wifi", <>{E.act("Retry", "attention")}{E.act("Discard", "destructive")}</>, "", WifiDisconnected01Icon)}
      {E.row("Record fermentation reading · FV3", "response lost", <>{E.act("Check")}{E.act("Discard", "destructive")}</>, "", WifiDisconnected01Icon)}
      {E.row("Record cellar transfer · FV2", "validation failed", <>{E.act("Fix", "attention")}{E.act("Discard", "destructive")}</>, "w", WifiDisconnected01Icon)}
      {E.row("Record pick · ORD-0229", "your role changed · this will not be sent", E.act("Discard", "destructive"), "w", WifiDisconnected01Icon)}
      {E.btn("Retry 1 waiting")}
      {E.note("Discard asks you to confirm. These 4 unsent writes are deleted.")}
      {E.btn("Discard 4 queued writes", "del")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Orders",
    to: { Pick: "Pick", Finish: "Order", "Put back": "Put back" },
    job: "Find every order by state and take its next valid action",
    reads: "list_orders",
    writes: "none [creation and state changes happen on their own surfaces]",
    states: [["filtered", "one state chip selected"], ["empty", "no orders in this state: New order stays available"]],
    spec: "The Work list with the Orders tab active. Rows cover the active order states and name the next valid action; New order opens the order-entry sheet. Order and Confirm order return here.",
    body: <OrdersView model={toOrdersListViewProps(ordersWorkList)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Confirm order",
    job: "Confirm a submitted order in two taps from Today",
    reads: "get_order · get_atp",
    writes: "confirm_order · cancel_order",
    states: [["loading", "order-shaped skeleton"], ["stale", "line changed · refresh", 1], ["permission", "sales or admin required", 1], ["cancelled", "staged quantities become restock work · Put back clears it"]],
    spec: "2 taps from Today: Confirm → Confirm order, only when no blocking review exists. The registration warning is the same one the Order screen shows; it links to the Compliance registry and never blocks.",
    body: <ConfirmOrderView model={toConfirmOrderViewProps(orderSubmittedRidgeline)} fulfillmentOptions={[LOC_WAREHOUSE.name, LOC_TAPROOM.name]} complianceNote={OHIO_STOUT_NOTE} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Order",
    to: { Adjust: "Adjust lines", "Add line": "New order", Cancel: "Orders" },
    job: "The staff home for one order: state, next action, lines, events, restock",
    reads: "get_order · get_atp",
    writes: "submit_order · adjust_order_lines [sets needs_restock on a picked order] · confirm_order · cancel_order [needs_restock while quantities are staged]",
    states: [["draft", "Submit is the one active verb"], ["confirmed / picked", "lines adjust; restock rows appear when picked qty exceeds ordered"], ["shipped", "read-only tape · Return shipment is the correction"], ["delivered", "the route stamped it · read-only, Return shipment still corrects"], ["stale", "another user changed a line · refresh", 1], ["permission", "sales or admin to adjust; warehouse reads", 1]],
    spec: "Drawn as picked after a line was adjusted down: staged 3 Pils cases must go back to Warehouse. Adjusting down, shipping short and cancelling all set the restock flag; Put back is what clears it. Delivered is the last lifecycle state and arrives from Confirm delivery on the route, not from a verb here. Ship opens Ship and invoice rather than committing here. Cancel is destructive and asks for confirm. Every transition appends an order event row in the same RPC. Confirm still has its own two-tap Today frame.",
    body: <OrderView model={toOrderViewProps(orderPickedRestock)} adjustLines showAddLine complianceNote={OHIO_STOUT_NOTE} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    surface: "sheet",
    name: "Adjust lines",
    to: { "Save lines": "Order" },
    job: "Replace the lines on a confirmed or picked order and say why",
    reads: "get_order · list_skus",
    writes: "adjust_order_lines [sets needs_restock on a picked order]",
    states: [["permission", "sales or admin required", 1], ["picked", "qty below picked stages the rest for Put back"], ["stale", "another user changed a line · refresh", 1]],
    spec: "Opens from Order · Adjust. This is a line edit, not a short pick: Short pick is pick-time shortage from the Pick frame. Reason is required. Saving replaces the full line set in one RPC.",
    body: <AdjustLinesView model={toAdjustLinesViewProps(orderAdjustLines)} reason="customer cut" />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Short pick",
    to: { Pick: "Pick", "Adjust order to 7 cases": "Pick" },
    job: "Resolve one short line before the pick can finish",
    reads: "get_order",
    writes: "resolve_short_pick [one RPC: short_reason + chosen resolution (line qty + allocation) + order_events row]",
    states: [["permission", "warehouse or admin required", 1], ["adjust down", "ordered 10 → 7 · allocation shrinks · ATP recovers"], ["keep staged", "7 staged · 3 remain owed · the order keeps its Pick action"], ["resumed", "Pick reopens showing 7 already picked · only the owed 3 need counting"], ["stale", "another picker changed this line · recheck", 1], ["offline", "resolution waits for live ATP", 1]],
    spec: "Opens from a Pick line whose count is below ordered. Reason is required; exactly one resolution is chosen and the verb names it: adjusting the order is green (mutable order edit); keeping the remainder staged is also green. Keeping the remainder owed does not finish the pick: the order stays picked with a line below ordered and keeps its Pick row in Work and Today until every line reaches its ordered quantity, and reopening Pick shows what is already counted. The restock implication is copy in the preview, never a status column. Done picking completes afterward on the Pick frame.",
    body: <ShortPickView model={toShortPickViewProps(orderShortPick)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Pick",
    job: "Default lines to ordered; touch only exceptions",
    reads: "get_order",
    writes: "record_pick · resolve_short_pick",
    states: [["permission", "warehouse or admin required", 1], ["short pick", "a line below ordered opens the Short pick frame", 1], ["partly picked", "reopened after a kept-owed line · counted lines start at what was picked"], ["concurrent", "another picker changed qty"], ["cancelled", "staged · restock now", 1], ["offline", "queue whole pick set once"]],
    spec: "2 taps from Today: Pick → Done picking (all-as-ordered only). Shortage is not a chip here: entering a count below ordered opens Short pick.",
    body: <PickView model={toPickViewProps(orderPick)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Put back",
    to: { "Put back 3": "Today" },
    job: "Confirm staged quantities were re-shelved after a restock",
    reads: "get_order [restock flag and staged qtys]",
    writes: "confirm_restock [one RPC: clears needs_restock + order_events row]",
    states: [["permission", "warehouse or admin required", 1], ["pending", "Today Put back is the standing row"], ["done", "flag cleared · row leaves Today"], ["cancelled order", "the flag survives cancel · this is the only way back"], ["stale", "someone re-picked · the flag is already clear", 1]],
    spec: "Today’s Put back row opens this. Staged 3 Pils cases after ORD-0229 was adjusted down. The verb writes: it clears the restock flag and appends the order event, because a cancelled order can never be re-picked or shipped and would otherwise leave its row standing on Today forever. Inventory already sits in Warehouse as staged, so nothing moves in the ledger.",
    body: <PutBackView model={toPutBackViewProps(orderPickedRestockPutBack)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Ship and invoice",
    to: { "Ship order": "Shipment done" },
    job: "Default wholesale ship: commit removal and the invoice together",
    reads: "get_order, get_order_ship_sources",
    writes: "ship_order [explicit bin/lot source quantities sum to every line; needs_restock when any qty_shipped < qty_picked; invoice timing = now persisted with the shipment]",
    states: [["stale", "picked qty changed · preview again", 1], ["short ship", "qty below picked needs a reason; remainder is released", 1], ["offline", "wait for live recheck", 1], ["permission", "warehouse or admin required", 1], ["accepted", "INV number on commit · restock row if qty short"]],
    spec: <>Ship qty prefills from picked and is editable per line; a shortage reason appears only when qty &lt; picked, and the same condition sets the restock flag, so the case released here becomes a Put back row rather than staying staged with nothing naming it. Carrier/tracking never block the commit. The preview names the destination state from the ship-to and says the invoice number is assigned on commit. On-delivery timing lives on Ship · confirmation; taproom transfers use Complete transfer.</>,
    body: <ShipView sources={<>{E.pick("Source bin and lot", "Cooler · L-240831-HZ", ["Cooler · L-240831-HZ", "Cooler · Untracked / legacy stock"])}{E.fld("Source quantities", "Every source sums to its shipped line")}</>} model={toShipViewProps(orderShipInvoice)} fulfillmentOptions={[LOC_WAREHOUSE.name, LOC_TAPROOM.name]} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Shipment done",
    job: "The invoice number after a ship, and the named correction",
    reads: "get_order · get_invoice",
    writes: "none",
    states: [["permission", "warehouse or admin required", 1], ["accepted", "INV number on the tape"], ["short", "restock row on Today"]],
    spec: "Post-commit of Ship and invoice. A tape means recorded. Return shipment is the correction.",
    body: <ShipmentDoneView model={toShipmentDoneViewProps(orderShipmentDone)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Ship on delivery",
    to: { "Ship order": "Shipment done" },
    job: "The On delivery state of Ship and invoice",
    reads: "get_order, get_order_ship_sources",
    writes: "ship_order [invoice_timing = on_delivery persisted on the shipment; the same one RPC without the invoice; confirm_delivery invoices later]",
    states: [["stale", "picked qty changed · preview", 1], ["offline", "wait for live recheck", 1], ["permission", "warehouse or admin required", 1]],
    spec: "Folded into Ship and invoice as the On delivery chip. Same fields as Invoice now; the timing is saved on the shipment so Confirm delivery can invoice later. Two screens both titled Ship was confusing.",
    body: <ShipView model={toShipViewProps(orderShipOnDelivery)} fulfillmentOptions={[LOC_WAREHOUSE.name, LOC_TAPROOM.name]} invoiceTiming={1} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Complete transfer",
    to: { "TRF-0088": "Order", "ORD-0088": "Order" },
    job: "Finish a taproom transfer order: same movements, no invoice",
    reads: "get_order, get_order_ship_sources",
    writes: "ship_order [explicit source and destination bins preserve lot; taproom_transfer kind: paired taproom_transfer movements (−source, +destination); no invoice]",
    states: [["stale", "picked qty changed · preview again", 1], ["short", "qty below picked releases the remainder"], ["permission", "warehouse or admin required", 1], ["accepted", "taproom on-hand rises immediately"]],
    spec: "No invoice-timing chip and no destination state: beer moves between the brewery’s own locations. Copper because the paired movements are append-only. Requested from Taproom · Needs replenishment.",
    body: <CompleteTransferView sources={<>{E.pick("Source bin and lot", "Cooler · L-240831-HZ", ["Cooler · L-240831-HZ", "Cooler · Untracked / legacy stock"])}{E.fld("Source quantities", "Every source sums to its shipped line")}</>} model={toCompleteTransferViewProps(orderTransferComplete)} tape={completeTransferTape} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Transfers",
    to: { Submit: "Transfer detail", Pick: "Transfer detail", Receive: "Transfer detail", Open: "Transfer detail", "New transfer": "New transfer", "TRF-0007": "Transfer detail", "TRF-0006": "Transfer detail" },
    job: "Move stock between two locations without an order or an invoice",
    reads: "list_stock_transfers · list_locations · list_bins · list_skus",
    writes: "create_stock_transfer",
    states: [["empty", "New transfer is the only action"], ["draft", "Submit is next"], ["submitted", "Pick is next"], ["picked", "Receive writes the paired movements"], ["permission", "warehouse or admin required", 1]],
    spec: "The Work list with the Transfers tab active. This is the stock-transfer document (from/to location, bins on each line), not the taproom replenishment order that Complete transfer ships. A same-location pair is refused: that is a bin move.",
    body: <TransfersView model={toTransfersViewProps(transfersList)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    surface: "sheet",
    name: "New transfer",
    to: { "Create transfer": "Transfer detail" },
    job: "Draft a stock transfer: two locations, a bin at each end, SKU lines",
    reads: "list_locations · list_bins · list_skus",
    writes: "create_stock_transfer",
    states: [["permission", "warehouse or admin required", 1], ["same location", "refused · use a bin move", 1], ["empty lines", "Create stays off until one SKU has a qty"]],
    spec: "Opens from Transfers · New transfer. Materials and kegs move through the same command from the API; this sheet draws the SKU case. Bins default to the first bin at each location.",
    body: <NewTransferView model={toNewTransferViewProps(newTransferDraft)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Transfer detail",
    to: { Transfers: "Transfers", Submit: "Transfer detail", "Record pick": "Transfer detail", Receive: "Transfer detail", "TRF-0007": "Transfers" },
    job: "One next verb: Submit, Record pick, or Receive the paired movements",
    reads: "get_stock_transfer",
    writes: "submit_stock_transfer · record_stock_transfer_pick · receive_stock_transfer [one RPC: paired location_transfer movements, no invoice]",
    states: [["draft", "Submit is the one verb"], ["submitted", "Record pick defaults to requested qty"], ["picked", "Receive is irreversible"], ["received", "read-only tape · the stock has changed place"], ["permission", "warehouse or admin required", 1]],
    spec: "Not Complete transfer: that ships a taproom replenishment order. Receive posts both ledger halves or neither. No invoice.",
    body: <TransferDetailView model={toTransferDetailViewProps(transferDetailSubmitted)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Pick sheet",
    to: { Pick: "Pick", Open: "Order" },
    job: "Group confirmed demand by ship date",
    reads: "daily_pick_sheet [confirmed orders by requested ship date, one fulfillment source]",
    writes: "none",
    states: [["day chosen", "confirmed orders requesting that ship date"], ["totals", "read-only · what to bring to the floor in one trip"], ["empty", "nothing confirmed for that day"], ["mixed sources", "one source at a time · a Taproom order is not on the Warehouse sheet", 1]],
    spec: "A staging aid, not a command surface: nothing here writes, and a row opens that order's Pick, which is where counting happens. Totals sum the day so a picker carries one load out instead of walking back per order; they are read-only because a total spans orders and picking is per-order. Scoped to one fulfillment source, since a sheet mixing Warehouse and Taproom lines would send someone to the wrong room.",
    body: <PickSheetView model={toPickSheetViewProps(pickSheet)} filters={E.chips(PICK_SHEET_DATE_CHIPS, 1)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Weekly count",
    to: { "Hazy IPA": "SKU detail", "Print current stock labels": "Weekly count", "Record count": "Weekly count", "Open count": "Weekly count", "Correct count": "Weekly count" },
    job: "Record every physical stock bucket and compare the draft with expected brand consumption",
    reads: "get_taproom_count_snapshot · get_taproom_print_labels · get_taproom_draft_projection · list_taproom_counts · get_taproom_count · list_locations",
    writes: "record_taproom_count · correct_taproom_count [Admin only; latest uncorrected root; increases only]",
    states: permitted("taproom, warehouse or admin required").concat([["unknown response", "timeouts and 5xx freeze every quantity and retry the same request", 1], ["stale", "changed stock or brewery date starts a fresh blank recount", 1], ["no POS", "expected stays blank; the physical count still records"], ["matching", "durable receipt with every observation and no movement"], ["corrected", "one logical history row shows the effective receipt and correction audit"], ["correction permission", "Admin only on the latest uncorrected root", 1]]),
    spec: "The physical count is the source of truth and posts depletion, connected or not. Every bin/SKU/lot-or-untracked bucket is entered explicitly in whole packaged units; omitted zeros, fractions, inferred allocation and overcounts are refused. Taproom sees the full worksheet row number on every bucket instead of raw lot identifiers on screen; all three count roles can print the current positive-stock worksheet through one checked projection with lot codes, stable original row numbers, and no history. Print rechecks the captured revision and refuses stale stock without changing count entries or uncertain retries. The draft keeps and links the captured prior-count identity/date. Brand expectation refreshes independently and never replaces the captured stock revision; if its baseline changed, comparison and inputs lock until an explicit fresh recount. Draft actual groups explicit bucket depletion using captured package volumes; it and expected-minus-actual stay blank until every existing bucket for that brand is entered, while a projected brand with no physical bucket has zero actual. Both remain labeled as estimates until the authoritative receipt is saved. A timeout or 5xx response freezes request ID and payload for exact retry; a definitive first validation failure is editable. Changed stock or an expired brewery date offers a fresh blank recount. Saved receipts include safe bin/SKU labels for every observation beyond list-query caps, and the newest 50 logical root headers remain readable even when every line matched and no movement was posted. Admin can correct only the latest uncorrected root when at least one quantity was counted too low, up to the frozen quantity before that count. The replacement keeps every original bucket and observation time, appends signed ledger entries in the correction period, and leaves the original receipt immutable. History and the receipt show the effective count plus who corrected it, when, and why. Warehouse and Taproom can read that audit but never see the correction action. An uncertain response freezes the correction reason, quantities, request ID, and payload for exact retry.",
    body: (<>
      {E.back("Beer", "Weekly count")}
      {E.tabs(["Ridgeline Tap Room", "Downtown"], 0, "w-full")}
      {E.ttl("Expected consumption")}
      {E.note("Captured prior · Sep 1 · reopen saved count")}
      {E.row("Hazy IPA", "expected 1.5 bbl · draft actual 1.0 bbl", "difference +0.5 bbl")}
      {E.btn("Refresh expected", "g")}
      {E.ttl("Count every stock bucket")}
      {E.note("Server date Sep 8 · whole remaining packages only · enter zero explicitly. A partly full keg is one.")}
      {E.btn("Print current stock labels", "g")}
      {E.note("Print includes only current positive stock and keeps the captured worksheet row numbers.")}
      {E.row("Pils · 16 oz case", "Cold · untracked stock · worksheet row 1 · recorded 6", E.stq(4))}
      {E.row("Hazy · ½ bbl keg", "Cold · lot L-260901-HZ · worksheet row 2 · recorded 3", E.stq(2), "w")}
      {E.btn("Record count")}
      {E.ttl("Saved count · Sep 8")}
      {E.note("Latest uncorrected count · saved row 2 · recorded 7, counted 2")}
      {E.btn("Correct count", "g")}
      {E.ttl("Recent saved counts")}
      {E.row("Weekly count · Sep 1", "3 observations · 1 movement · 1 unit depleted · corrected by Admin", E.act("Open count", "primary"))}
      {E.note("Admin can correct only the latest saved count when a quantity was counted too low. Warehouse and Taproom read the correction history without the action.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Variance by brand",
    to: { "Hazy IPA": "SKU detail" },
    job: "Where the gap between poured and counted keeps showing up",
    reads: "list_locations · get_taproom_variance",
    writes: "none",
    states: permitted("taproom, warehouse or admin required").concat([["no POS", "expected stays blank; actual count depletion remains visible", 1], ["first count", "actual is shown without a comparison"], ["incomplete coverage", "mapped expected and variance remain visible; coverage is labeled incomplete"], ["unmapped", "mapped facts remain visible with the gap named"], ["not in inventory", "expected shares are explicitly excluded"]]),
    spec: "Variance is drawn twice on purpose. Inline on the draft count it can catch a miscount; this completed-period page shows whether a difference repeats. Expected comes from frozen POS serving facts, actual from frozen count depletion, and variance is expected minus actual. The comparison is reported and never posted. Whole periods use exact (prior count, current count] timestamps and are selected by their ending brewery-local date. First-count, absent or incomplete coverage, unmapped facts, excluded expected shares, unattributed volume and report as-of remain visible. Null stays unknown; zero is read alongside coverage and excluded consumption. Kegs outside inventory exclude only their expected share; count-derived actual remains intact.",
    body: (<>
      {E.back("Beer", "Variance")}
      {E.ttl("Variance by brand")}
      {E.tabs(["4 weeks", "12 weeks"])}
      {E.tbl(["Brand", "Expected", "Actual", "Variance"], [["Hazy IPA", "11.5 bbl", "11.0 bbl", "+0.5"], ["Pils", "8.0 bbl", "7.9 bbl", "+0.1"], ["Stout", "3.0 bbl", "3.0 bbl", "0.0"]])}
      {E.nav("Hazy IPA", "short 4 weeks running · 1.8 bbl total · −4%")}
      {E.info("A brand short every week points at one line or one shift. A single short week is noise.")}
      {E.note("Reported, never posted. The count already wrote the depletion; this is the explanation for it.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Pars and allocation",
    to: { Release: "Order", Adjust: "Order", "Edit par": "Bin", "Taproom par": "Bin" },
    job: "Change named quantities; never invent priority",
    reads: "get_shortfalls · list_standing_allocations",
    writes: "adjust_order_lines · release_allocation · set_taproom_par · set_standing_allocation",
    states: DEFAULT_STATES,
    spec: "There is no ranking command or priority column; every change is a named quantity edit. Taproom par sets the selected taproom's target for a SKU; standing allocation reserves a named SKU quantity without an order. Releasing a standing allocation returns its quantity to ATP without moving stock.",
    body: <ParsView model={toParsViewProps(parsPils)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Return and credit",
    to: { "Return shipment": "Order" },
    job: "Return beer and correct money atomically",
    reads: "get_invoice, get_invoice_return_sources, list_bins",
    writes: "return_shipment [one RPC: return_in movements at explicit destination + loss movement for a damaged return + credit memo at the invoiced price; owned-fleet keg_events linked to shipment when slice 9 is enabled]",
    states: [["permission", "admin or sales required", 1], ["unsold", "returns as sellable stock at the chosen destination"], ["damaged", "returns, then posts loss in the same RPC · never re-sold", 1], ["wrong item", "sellable · the mis-picked SKU goes back on the shelf"], ["invoice paid", "the credit memo sits unapplied as available credit", 1], ["partial", "only the returned units credit back"]],
    spec: "Reason decides the beer, never the money. Unsold and wrong item return as sellable stock at the destination; damaged returns and is written to loss in the same RPC, because beer that came back broken is not inventory and pretending otherwise puts it back on a pick list. The credit is the price frozen on the original invoice line and the deposit is the one recorded on the original shipment, never today's price group, on the same principle that freezes a channel onto a movement at write time. A paid invoice can still be returned: the credit memo lands unapplied and sits as available credit, which is the state the QuickBooks credit-memo frame already draws.",
    body: <ReturnCreditView sources={E.pick("Original shipped source", "Cooler · L-240831-HZ", ["Cooler · L-240831-HZ"])} model={toReturnCreditViewProps(orderReturnCredit)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "New order",
    to: { "Add line": "New order" },
    job: "Complete customer, source, ship-to and line entry for staff",
    reads: "list_customers · list_locations · list_skus · get_atp",
    writes: "create_order",
    states: permitted("sales or admin required"),
    spec: "Source is required and becomes the order's from-location; the app never guesses “Warehouse.” Save draft lands on the Order screen, where Submit lives.",
    body: <NewOrderView model={toNewOrderViewProps(newOrderDraft)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Customers",
    to: { Open: "Customer detail" },
    job: "Manage accounts, addresses and portal users",
    reads: "list_customers · get_customer",
    writes: "invite_customer_user [existing] · upsert_customer · upsert_ship_to",
    states: DEFAULT_STATES,
    body: <CustomersView model={toCustomersViewProps(customersList)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Customer detail",
    job: "Edit one customer and reach its ship-tos, prices, orders and keg balance",
    reads: "get_customer",
    writes: "upsert_customer · invite_customer_user",
    states: [["permission", "sales or admin required", 1], ["active", "may place orders"], ["inactive", "history remains"], ["license warning", "renewal needs review", 1]],
    spec: "The list opens a named account; related operational records remain links rather than inline editors.",
    body: <CustomerView model={toCustomerViewProps(customerRidgeline)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Invite portal user",
    to: { "Send invite": "Customer detail" },
    job: "Invite one buyer to a customer account",
    reads: "get_customer",
    writes: "invite_customer_user [existing]",
    states: [["permission", "sales or admin required", 1], ["ready", "email is valid"], ["sent", "recipient receives a sign-in link"], ["existing account", "attachment is unsupported; contact the admin", 1]],
    body: (<>
      {E.edit("Email", PORTAL_BUYER.email, "email")}
      {E.fld("Role", "Buyer")}
      {E.note("Sending an invite emails the recipient and cannot be recalled.")}
      {E.btn("Send invite")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Ship-to form",
    job: "Create or edit one delivery address for a customer",
    reads: "get_customer",
    writes: "upsert_ship_to",
    states: [["permission", "sales or admin required", 1], ["new", "address required"], ["existing", "orders keep their frozen destination"], ["default", "new orders select it first"]],
    spec: "Editing an address never rewrites the destination recorded on an existing order.",
    body: <ShipToView model={toShipToViewProps(shipToMain)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    name: "Accounting",
    to: { Review: "Customers", Disconnect: "Disconnect QuickBooks" },
    job: "One page for the QuickBooks connection, and for the three things a pay link needs",
    reads: "get_qbo_connection [design; adds payments_enabled + push defaults]",
    writes: "connect_qbo · disconnect_qbo · set_qbo_push_defaults [design; admin-only]",
    states: [["permission", "admin only", 1], ["healthy", "token good; company id shown"], ["expired", "reconnect before mapping or push", 1], ["payments off", "no pay link can be generated for any invoice", 1], ["ACH only", "card disabled; cheaper, and slower to arrive"], ["defaults changed", "applies to the next push, never retroactively"]],
    spec: "Square already had Settings · Point of sale; QuickBooks had nothing, and Settings · Integrations dead-ended. This is the other half. It exists mainly to make three invisible preconditions visible before a customer meets them: QuickBooks Payments must be active on the company, AllowOnlineACHPayment / AllowOnlineCreditCardPayment must ride every push, and the customer must carry an email. Any one missing and Intuit generates no InvoiceLink, so the portal Pay button either never renders or lands on the unavailable page. Payment method is a money decision, not a checkbox: card runs a percentage fee, so on a four-figure keg invoice the method the customer picks is real money; the fee is visible in the QuickBooks Payment sidebar and MGR does not model it. Push defaults live here rather than per invoice, so an invoice cannot be born unpayable by omission.",
    body: (<>
      {E.back("Settings", "Accounting")}
      {E.ttl("QuickBooks")}
      {E.row("Demo Brewing LLC", "authorization expired · company 9341", E.act("Disconnect", "destructive"), "w")}
      {E.note("QuickBooks authorization expired. Push, payment links and paid-date sync are paused.")}
      {E.btn("Reconnect QuickBooks")}
      {E.row("QuickBooks Payments", "active · card and bank", "", "ok", QuickBooksMark)}
      {E.ttl("Push defaults")}
      {E.info("Every invoice is pushed ready to pay. Turning both off means customers cannot pay online at all.")}
      {E.row("Bank transfer (ACH)", "on · lowest fee", E.sw(true, "Bank transfer payments"), "ok")}
      {E.row("Card", "on · percentage fee applies", E.sw(true, "Card payments"), "ok")}
      {E.row("Customers missing an email", "2 · cannot be pushed", E.act("Review"), "w")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    name: "Connect QuickBooks",
    to: { "Connect QuickBooks": "Accounting" },
    job: "Authorize one QuickBooks company and explain the data exchange before OAuth",
    reads: "none [OAuth returns the selected company]",
    writes: "connect_qbo [design]",
    states: [["permission", "admin only", 1], ["cancelled", "return to Accounting unchanged"], ["already connected", "show Mapping conflict", 1]],
    spec: "The disconnected Accounting state. OAuth is an external write, so the button is copper and the page says what MGR will exchange before leaving.",
    body: (<>
      {E.back("Settings", "Connect QuickBooks")}
      {E.info("MGR reads customers, items, invoice status and payments. It creates wholesale invoices and credit memos.")}
      {E.note("QuickBooks remains the accounting record. Connecting does not push existing invoices.")}
      {E.btn("Connect QuickBooks", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    surface: "sheet",
    name: "Mapping conflict",
    to: { "Ridgeline Tap Room": "Mapping conflict", "Ridgeline Holdings": "Mapping conflict" },
    job: "Resolve an ambiguous QuickBooks customer or item without guessing",
    reads: "get_qbo_mapping_candidates [design]",
    writes: "set_qbo_customer_mapping · set_qbo_item_mapping [design]",
    states: [["permission", "admin only", 1], ["customer", "two candidates match"], ["item", "two candidates match"], ["company claimed", "this company is connected to another brewery", 1]],
    spec: "A candidate is chosen explicitly. A company already claimed by another brewery cannot be overridden here.",
    body: (<>
      {E.note("Two QuickBooks customers match Ridgeline Tap Room. Choose the account this brewery invoices.")}
      {E.row("Ridgeline Tap Room", "Phoenixville · active · customer 184", E.act("Use"))}
      {E.row("Ridgeline Holdings", "Phoenixville · active · customer 227", E.act("Use"))}
      {E.info("If this QuickBooks company belongs to another MGR brewery, disconnect it there first.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    surface: "sheet",
    name: "Disconnect QuickBooks",
    to: { "Disconnect QuickBooks": "Connect QuickBooks" },
    job: "Confirm the external effects of disconnecting QuickBooks",
    reads: "get_qbo_connection [design]",
    writes: "disconnect_qbo [design]",
    states: [["permission", "admin only", 1], ["confirmed", "connection disabled and tokens purged"]],
    spec: "The confirmation names what stops and what remains so reconnecting can resume without remapping.",
    body: (<>
      {E.note("Stops: invoice push, payment links and paid-date sync.")}
      {E.info("Stays: MGR invoices, QuickBooks ids and customer/item mappings.")}
      {E.btn("Disconnect QuickBooks", "del")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Invoices",
    to: { Review: "Invoice", Open: "Invoice" , "Write off": "Invoice" },
    job: "The AR list: what is due, what QuickBooks changed underneath it, and the drill-in for one invoice",
    reads: "list_invoices [qbo_sync_token + qbo_remote_state] · get_qbo_connection · get_qbo_mapping_candidates [design]",
    writes: "connect_qbo · set_qbo_customer_mapping · set_qbo_item_mapping [design] · push_invoice_to_qbo [design; same requestId, except a deleted remote invoice, which pushes under a new one] · write_off_invoice [design; MGR status only, never touches QuickBooks]",
    states: [["connection health", "QuickBooks · token healthy · company 9341"], ["expired", "Reconnect before mapping or push", 1], ["live", "the ordinary case; no badge at all"], ["edited there", "SyncToken changed since MGR pushed", 1], ["voided", "amounts zeroed; this is not payment", 1], ["deleted", "the id points at nothing; sync gets a 404", 1], ["not sent", "pushed but never delivered; only a fault if MGR is not the channel"], ["paid", "the paid date arrives from the QuickBooks Online sync · no user verb"], ["push failed", "the drill-in resolves each mapping", 1]],
    spec: <>QuickBooks has no read-only invoice. Once pushed, the accountant can edit, void or delete it from the Sales transactions sidebar and no API setting prevents that, so MGR detects rather than prevents. QuickBooks hands us the detector free: SyncToken increments on every modification and already rides the response the sync job reads for balance, so drift costs one column and no extra call. The rule this frame protects: <b>a voided invoice is not a paid invoice.</b> Voiding zeroes the amounts, so any logic inferring paid from a QuickBooks balance of zero books cancelled revenue as collected; collected revenue is a read-side rule, remote state live and balance zero, expressed once in the reporting view; no CHECK refuses a paid date, because paid-then-voided is a real history the row must be able to hold. MGR surfaces drift and stops: no re-push that overwrites an accountant’s correction, no field-level merge UI. The one exception is the deleted invoice, where the remote id points at nothing: dedupe on the original requestId would return the first result and create nothing, so that push carries a new requestId and produces a second QuickBooks invoice under the same MGR number. Ordinary retries keep the old requestId and stay protected. ASSUMPTION: a drifted invoice stays in AR at QuickBooks’ numbers, because QuickBooks owns the invoice after push. Drift is not a place, it is what some of these rows are doing, which is why it lives in the states of one list rather than a second one. Rows also carry the due date, push failure and credit-memo status; payments come back through the sync job and are read-only. A failed row opens the drill-in, where connection, each mapping and push are four independent commands, and push persists its exact payload and deterministic requestId before the remote POST. Creating a credit memo stays Return shipment.</>,
    body: (<>
      {E.back("More", "Invoices")}
      {E.row("QuickBooks", "connected · company 9341", "healthy", "ok", QuickBooksMark)}
      {E.row(`${INV.no} · Ridgeline`, `due ${INV.dueShort} · ${INV.total} · pushed`, E.act("Open"))}
      {E.row(`${INV.edited} · Al’s Bar`, <>edited in QuickBooks · $980 {E.arrow()} $1,040</>, E.act("Open in QuickBooks"), "w")}
      {E.row(`${INV.voided} · Teresa’s`, "voided in QuickBooks · not paid", E.act("Write off", "destructive"), "w")}
      {E.row(`${INV.failed} · Al’s Bar`, "push failed · item unmapped · $540", E.act("Review"), "w")}
      {E.row(`${INV.deleted} · Teresa’s`, "deleted in QuickBooks", <>{E.act("Re-push", "attention")}{E.act("Write off", "destructive")}</>, "w")}
      {E.row(`${INV.unsent} · Al’s Bar`, "pushed · not emailed yet", E.act("Open in QuickBooks"))}
      {E.row(`${INV.paid} · Ridgeline`, "paid 8/29 from QuickBooks Online", "$980", "ok")}
      {E.row(`${INV.memo} · Ridgeline`, `credit memo · pushed · against ${INV.no} · −$180`, E.act("Open"))}
      {E.info("MGR shows what changed over there. Corrections belong in QuickBooks, or as a credit memo here.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Invoice",
    to: { "Customer mapping": "Mapping conflict", "Pils · case": "Fix mapping" },
    job: "Review one invoice, resolve its mappings and push it",
    reads: "get_qbo_connection · get_qbo_mapping_candidates [design] · get_invoice · list_invoice_questions",
    writes: "push_invoice_to_qbo [design] · resolve_invoice_question",
    states: [["permission", "sales or admin required", 1], ["unmapped", "push stays unavailable", 1], ["ready", "every customer and item is mapped"], ["pushed", "QuickBooks owns later accounting edits"], ["buyer question", "the note is read here, and answered off-system", 1]],
    spec: "The drill-in for one invoice, and where a buyer's question lands: the portal writes it, the sales Today row points here, and marking it answered is what clears that row. Nothing about the invoice changes; the reply happens in a phone call or an email, which is why the verb says answered rather than replied.",
    body: <InvoiceView model={toInvoiceViewProps(invoiceFailedAls)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Fix mapping",
    to: { "Save mapping": "Invoice" },
    job: "Choose the QuickBooks record for one invoice customer or item",
    reads: "get_qbo_mapping_candidates [design]",
    writes: "set_qbo_customer_mapping · set_qbo_item_mapping [design]",
    states: [["permission", "sales or admin required", 1], ["candidate selected", "save enables invoice push"], ["no match", "create it in QuickBooks first", 1]],
    body: (<>
      {E.pick("QuickBooks item", "Pils 16 oz", ["Pils 16 oz", "Pilsner case"])}
      {E.btn("Save mapping")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Catalog",
    to: { "Hazy IPA": "Brand", Pils: "Brand", Stout: "Brand" },
    job: "Define brands, their sellable formats and prices without ledger writes",
    reads: "list_brands · list_skus",
    writes: "upsert_brand · create_sku · update_sku",
    states: DEFAULT_STATES,
    spec: "Brand facts (ABV and tax class) edit on Brand; SKU associates the brand with a Format. Volume and packaging stay on the Format. This page remains a list with simple pricing, never the v1 price matrix.",
    body: <CatalogView model={toCatalogViewProps(catalogBrands)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Package BOM",
    job: "Replace the packaging materials consumed by one format",
    reads: "get_format_composition",
    writes: "replace_format_bom",
    states: [["permission", "sales or admin required", 1], ["complete", "every material has a quantity"], ["empty", "the Format consumes no tracked packaging"]],
    spec: "The BOM belongs entirely to the Format. A different physical package requires another Format; correcting its existing definition affects future calculations, not recorded consumption. SKUs never override it.",
    body: <PackageBomView model={toPackageBomViewProps(packageBomCase)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Brand",
    job: "Sellable facts without ledger writes, including the TTB fields",
    reads: "list_brands · list_skus",
    writes: "upsert_brand · update_sku · create_sku",
    states: [["permission", "sales or admin required", 1], ["new brand", "name + style + ABV + tax class; description, category, price group and hops optional"], ["new style", "typing a style no one has used offers Add; saved with the brand", 0], ["new SKU", "choose one existing packaged Format; a poured format (pint, taster) is never a SKU. Square publishes it as brand × format"], ["inactive SKU", "hidden from portal; history keeps it"], ["other tax class", "the tax class appears as a field once the brewery sells one besides beer"]],
    spec: "The TTB tax class defaults to beer; other classes appear when the brewery sells one. Style is a picker over the brewery's own styles table; an unmatched entry offers Add and the brand save creates it; no separate styles screen. Description, category and hops are optional nullable columns; price group is the row of the price grid the brand sits on, so the price of any of its packaged SKUs is the cell where the customer's sale channel meets that group and the SKU's format. The brand carries no price of its own, and a brand on no group is unpriced everywhere. Package facts live on Formats. A SKU is one brand × one packaged format. A poured format is never a SKU: the menu publishes brand × pint to Square, and a sale depletes the keg SKU. No container source editor here.",
    body: <BrandView model={toBrandViewProps(brandHazy)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "SKU",
    to: { "Save SKU": "SKU list" },
    job: "Associate one shared package format with a brand",
    reads: "list_formats",
    writes: "create_sku · update_sku",
    states: [["permission", "sales or admin required", 1], ["active", "available to price and sell"], ["inactive", "history remains", 1], ["in use", "format cannot change; create another SKU", 1]],
    spec: "A SKU is one brand × one packaged format. It owns active state, optional UPC, and provider mappings. Price lives on the grid cell (sale channel × price group × format), never as a SKU exception. Group-shared barcodes are a follow-on table; until then a SKU may carry its own UPC. Name, volume and packaging derive from the Format. A different physical package is a different Format. Corrections affect future calculations and open plans; recorded movement volumes and closed packaging yield stay frozen.",
    body: <SkuView model={toSkuViewProps(skuHazyHalf)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "SKU list",
    to: { Edit: "SKU" },
    job: "See every package sold under one brand and open its facts",
    reads: "list_skus",
    writes: "none [creation and editing happen on SKU detail]",
    states: [["permission", "sales or admin required", 1], ["active", "available to price and sell"], ["inactive", "history remains", 1], ["empty", "Add SKU is the only action"]],
    spec: "Brand links here instead of showing an arbitrary one of three SKUs inline.",
    body: <SkuListView model={toSkuListViewProps(skuListHazy)} />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Order",
    name: "Shop",
    to: { Change: "Account", "½ bbl keg": "Shop", "⅙ bbl keg": "Shop", "case · 24×16 oz": "Shop", "12 oz bottle": "Shop", "Coming up": "Coming up" },
    job: "A buyer catalog: listed packages by brand, quantity, Place order",
    reads: "portal_catalog · get_portal_account · portal_order",
    writes: "portal_quote_order · portal_create_order · portal_update_draft_order · portal_submit_quote",
    states: [["empty catalog", "call brewery; nothing orderable"], ["missing price", "item cannot enter cart", 1], ["no ship-to", "contact brewery; choose an existing ship-to", 1], ["no source", "Review stays off until the brewery sets where orders ship from", 1], ["unlisted package", "a format not on the wholesale list is absent", 1], ["quote changed", "return to Shop and review current details", 1], ["receipt", "ORD number after commit"]],
    spec: "Grouped by brand; each row is a package the brewery listed for wholesale (½ keg, ⅙ keg, case, bottle). The list is the offer, not warehouse ATP: no in/low/out badges, no counts. Unlisted packages are absent, not greyed. Schedule packaging run is where staff designate the list. Drawn with a fulfillment source already set; the no-source state keeps Review off and never silently chooses Warehouse. Stepper − and + each ship as 48×48 targets. No staff vocabulary (ATP, gates, fulfillment engineering) anywhere in the portal. No persistent cart: leaving the page keeps nothing. Reorder on a shipped order still prefills Review.",
    body: <ShopView model={toShopViewProps(ridgelineShop)} />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Order",
    name: "Coming up",
    to: { "Hazy IPA": "Shop", "Pils": "Shop", "Saison": "Shop" },
    job: "See what the brewery plans to brew next and jump to that brand on Shop",
    reads: "portal_schedule [SCHEMA/RLS-GATE: view over planned batches exposing brand + planned week only; no customer policy on batches]",
    writes: "none",
    states: [["nothing planned", "check back; the brewery has not scheduled a batch"], ["brand not listed", "row shows the brand with no package to order; ask the brewery", 1]],
    spec: "Planned batches (not yet brewed) as one row per brand and expected week, soonest first. A brand row opens Shop scrolled to that brand; a brand with nothing listed for wholesale still appears so the buyer can ask. Nothing else about the batch is shown: no volume, recipe, tank, lot, or exact day. Reached from Shop; not a nav tab.",
    body: (<>
      {E.hd("Coming up", "Ridgeline")}
      {E.nav("Hazy IPA", "week of Sep 14")}
      {E.nav("Pils", "week of Sep 21")}
      {E.nav("Saison", "week of Oct 5 · not yet listed", "w")}
      {E.info("Dates are the brewery’s plan and can move. Ask Demo Brewing to be notified when a batch is packaged.")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Order",
    surface: "sheet",
    name: "Review order",
    to: { "Hazy IPA · ½ bbl keg": "Review order", "Pils · case · 24×16 oz": "Review order" },
    job: "Confirm quantities, ship-to and fulfillment line, then place the order",
    reads: "portal_catalog · get_portal_account · portal_order",
    writes: "portal_quote_order · portal_submit_quote",
    states: [["tax pending", "subtotal and keg deposits are current; final tax arrives on the invoice"], ["tax calculated", "estimated tax and total shown"], ["price/address/source/deposit changed", "nothing submits; return to Shop and review again", 1], ["no source", "Place order stays off until the brewery sets where orders ship from", 1], ["submit error", "keep the exact reviewed quote · Retry safe", 1], ["duplicate", "same request returns the same ORD number"]],
    spec: "The confirm step freezes the current channel prices, keg deposits, ship-to and fulfillment source on the server. An entitled QuickBooks tax calculation can add an estimate; otherwise it says Tax pending and the invoice remains the final total. Place order rechecks the mutable inputs and writes nothing when any changed. An uncertain retry reuses the exact committed quote and request. After submit the portal is read-only; changes go through the brewery.",
    body: <ReviewOrderView model={toReviewOrderViewProps(ridgelineReviewOrder)} />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Orders",
    name: "Order history",
    to: { "ORD-0231": "Order detail", "ORD-0225": "Order detail", "ORD-0221": "Order detail" },
    job: "See status and adjusted quantities without staff controls",
    reads: "portal_orders",
    writes: "none",
    states: [["expanded row", "lines with ordered vs shipped and plain adjusted copy"], ["no orders", "Start one from Order"]],
    spec: "A row opens Order detail. Shipped rows offer Reorder. Adjusted quantities are stated in buyer copy. No cancel: the portal is read-only after submit, and the row says whom to call.",
    body: <PortalOrdersView model={toPortalOrdersViewProps(portalOrdersList)} />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Orders",
    name: "Order detail",
    to: { "INV-1037": "Paid invoice", "Hazy IPA · ½ bbl keg": "Order detail", "Pils · 16 oz case": "Order detail" },
    job: "One order’s status, lines and the invoice when it exists",
    reads: "portal_order [existing] · portal_invoices [existing]",
    writes: "none",
    states: [["confirmed", "ships date · no invoice yet"], ["adjusted", "lines show ordered vs shipped"], ["shipped", "invoice link · Reorder"], ["delivered", "invoice link · Reorder"]],
    spec: "Opened from Order history. Status is the buyer-facing state. Reorder is on shipped and delivered. The invoice link is absent until the brewery has billed.",
    body: <PortalOrderView model={toPortalOrderViewProps(portalOrderShipped)} />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Pay invoice",
    job: "One stable MGR link that resolves to QuickBooks at the moment it is clicked",
    reads: "portal_invoice · get_qbo_connection [design; payments_enabled flag]",
    writes: "none [Intuit takes the payment; paid_at returns through the sync job]",
    states: [["payable", "Pay opens QuickBooks in a new tab"], ["no payments account", "the button never renders; brewery has no QuickBooks Payments", 1], ["not pushed yet", "no QuickBooks invoice id yet; Pay is absent, not disabled"], ["link unavailable", "Intuit returned none: the unavailable page, never a 500", 1], ["already paid", "Pay is gone; the paid date came back from the sync"]],
    spec: "The whole design is one rule: MGR owns the link, Intuit owns the destination. What is shared (this row, the emailed reminder, the PDF footer) is always /portal/invoices/:id/pay, an MGR URL that is permanent because it resolves late. Intuit’s InvoiceLink is read-only, is generated only for a pay-enabled invoice with a customer email, has no documented expiry, and is intermittently absent; fetching it seconds before the redirect makes every one of those someone else’s problem. It is never stored in a column, never serialised to the client, never put in an email. It is a bearer URL (anyone holding it can pay), so authorization runs on every click before any Intuit call is made, and the 404 for a customer requesting somebody else’s invoice must land before the fetch, not after.",
    body: <PortalInvoiceView model={toPortalInvoiceViewProps(portalInvoiceUnpaid)} variant="pay" />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Payment unavailable",
    job: "The degraded page that replaces a 500 when Intuit returns no link",
    reads: "portal_invoice",
    writes: "none",
    states: [["no link", "Intuit generated none for this invoice", 1], ["no customer email", "the cause push should have caught first", 1], ["payments off", "brewery has no QuickBooks Payments account"], ["reason logged", "the customer sees one page; the brewery sees why"]],
    spec: "Exists so that “works every time” is honest rather than aspirational. Every precondition is checked before the share (push refuses an invoice whose customer has no email, and the Payments capability is cached on the connection), but InvoiceLink can still come back empty, so the click path needs a designed floor. The customer gets one coherent page with the invoice still readable and a way to reach a human; MGR logs the distinguishing reason. Never a stack trace, never a dead redirect, never a Pay button that throws.",
    body: <PortalInvoiceView model={toPortalInvoiceViewProps(portalInvoiceUnpaid)} variant="unavailable" />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    surface: "sheet",
    name: "Question invoice",
    to: { "Send to Demo Brewing": "Pay invoice" },
    job: "Ask the brewery about a line, a total or a payment",
    reads: "portal_invoice",
    writes: "raise_invoice_question",
    states: [["sent", "the buyer sees it went · nothing on the invoice changes"], ["received", "a sales Today row names the invoice and the buyer"], ["no chat provider", "the Today row is the whole delivery · no email is sent", 1], ["answered", "Mark answered on the Invoice frame clears the sales row"]],
    spec: "Available on unpaid and paid invoices and credit memos. The buyer writes a note and it has to land somewhere a person will see: it writes a question row that appears on the sales Today list, and rides the chat integration as a personal message when one is connected. Nothing on the invoice changes.",
    body: <QuestionInvoiceView model={toQuestionInvoiceViewProps(portalInvoiceUnpaid)} />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Paid invoice",
    job: "A paid invoice has no Pay; the date and PDF remain",
    reads: "portal_invoice",
    writes: "none",
    states: DEFAULT_STATES,
    spec: "The paid date arrived from QuickBooks. Pay is gone. Download PDF is the one action.",
    body: <PortalInvoiceView model={toPortalInvoiceViewProps(portalInvoicePaid)} variant="paid" />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Invoice history",
    to: { "INV-1042": "Pay invoice", "INV-1037": "Paid invoice" },
    job: "See issued, due and paid invoices",
    reads: "portal_invoices",
    writes: "none",
    states: DEFAULT_STATES,
    body: <PortalInvoicesView model={toPortalInvoicesViewProps(portalInvoicesRidgeline)} />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Account",
    name: "Account",
    job: "Read own ship-to, signed-in membership and deposit details",
    reads: "get_portal_account",
    writes: "none",
    states: DEFAULT_STATES,
    spec: "Peer portal users are not listed; the composer exposes only account-safe reads and order commands.",
    body: <PortalAccountView model={toPortalAccountViewProps(portalAccountRidgeline)} />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Account",
    surface: "sheet",
    name: "Portal Me",
    to: { "Change password": "Portal set password", "Sign out": "Portal sign in" },
    job: "Who I am on this customer account, leave, change password",
    reads: "supabase_auth_get_session [platform]",
    writes: "supabase_auth_sign_out [platform]",
    states: DEFAULT_STATES,
    spec: "Opened from the portal header Me control. No brewery switcher. Change password opens Portal set password. Sign out is outline here; the destructive accent is a staff Me follow-up.",
    body: <PortalMeView model={toPortalMeViewProps(portalMeRidgeline)} />,
  },
  {
    step: 7,
    slice: 4,
    tab: "Beer",
    name: "Cellar map",
    to: { "FV3 \u00b7 fermenter \u00b7 15 bbl": "Vessel detail" , "Add vessel": "Vessel detail" },
    job: "Occupancy is the subject: fill, gravity and overdue lead every tile",
    reads: "list_occupancies · list_vessels · list_batches · get_batch_completion_preview",
    writes: "upsert_vessel [design; mutable single rows] · complete_batch",
    states: [["open run", "complete batch refused"], ["negative residual", "reload cellar facts", 1], ["uncertain", "retry unchanged request", 1], ["saved", "batch and all open occupancies closed"]],
    spec: "Complete batch reviews the server-derived baseline, frozen packaged output, prior attributed volume, threshold and residual, then atomically closes the batch and all of its open occupancies. A threshold-qualified residual becomes one typed nonphysical loss root; the form accepts no amount or cause. Tile fill derives from occupancy vs vessel capacity, never from a status column. Reading is the one primary; Transfer and Brew day are outline. A tile opens Vessel detail.",
    body: (<>
      {E.back("Beer", "Cellar", E.btn("Add vessel", "g"))}
      {E.tiles([["FV1", "Pils · 12.8 / 15 bbl", "1.9 °P · read 4 h", 0, 85], ["FV2", "Hazy · 9.0 / 15 bbl", "7.5 °P · read 8 h", 0, 60], ["FV3", "Stout · 13.5 / 15 bbl", "5.2 °P · overdue 31 h", 1, 90], ["BT1", "Pils · 7.0 / 10 bbl", "carbing", 0, 70], ["BT2", "Empty · 0 / 10 bbl", "available", 0, 0], ["FB1", "Saison · 0.4 / 1 bbl", "aging · read 1 d", 0, 40]], "c2")}
      {E.btns([["Reading", "p"], ["Transfer", "g"], ["Brew day", "g"]], "c3")}
      {E.nav("FV3 · fermenter · 15 bbl", "occupancy, readings and vessel facts")}
      {E.btn("Complete batch", "g")}
      {E.sp()}
    </>),
  },
  {
    step: 7,
    slice: 4,
    tab: "Beer",
    name: "Vessel detail",
    to: { "Stout · BATCH-0168": "Brew day" },
    job: "Inspect one vessel's occupancy and readings and edit its physical facts",
    reads: "list_vessels [design] · list_fermentation_readings [design]",
    writes: "upsert_vessel [design; mutable facts only]",
    states: [["permission", "brewer or admin required", 1], ["occupied", "batch and fill shown"], ["empty", "available for a batch"], ["reading overdue", "last reading flagged", 1]],
    spec: "Batch occupancy and reading history are records; only the vessel name, type and capacity are editable here.",
    body: <VesselDetailView model={toVesselDetailViewProps(vesselFv3)} />,
  },
  {
    step: 7,
    slice: 4,
    group: "Global",
    surface: "sheet",
    name: "Fermentation reading",
    to: { "Record reading": "Vessel detail" },
    job: "Record any values taken, in the unit set on Settings · Units",
    reads: "get_cellar_map [view; occupancy + last reading] · get_gravity_unit",
    writes: "record_fermentation_reading [design; mutable reading row]",
    states: permitted("brewer or admin required"),
    spec: "One reading may contain gravity, temperature, pH, or any combination. Blank values remain absent; prior values are reference only, never silently copied. Each value is typed; Gravity is the default. The gravity field is labelled and read in whichever unit the reader chose on Settings, then Units; there is no toggle on this sheet, because a unit is a standing preference rather than a per-reading decision. Gravity is stored in degrees Plato whatever is chosen, so switching never moves a reading already taken.",
    body: (<>
      {E.qty("1.019", "prior 1.021", "Gravity (per your unit setting)")}
      {E.qty("68.2", "°F · prior 67.8", "Temperature")}
      {E.qty("", "prior 4.21", "pH")}
      {E.info("Enter only values taken now; blanks are not rewritten.")}
      {E.inp("Note", "optional")}
      {E.pin(<>
        {E.btn("Record reading")}
      </>)}
    </>),
  },
  {
    step: 7,
    slice: 4,
    group: "Global",
    surface: "sheet",
    name: "Cellar addition",
    to: { Material: "Entity picker", "Record addition": "Cellar map" },
    job: "Post-knockout dry hop, fruit or adjunct against an occupancy",
    reads: "get_cellar_map [view; open occupancies] · get_recipe [design; the version’s post-knockout stages]",
    writes: "record_batch_addition [design; one RPC: batch_additions row (stage, occupancy) + material consumption movement; lot required when the material is lot-tracked]",
    states: [["permission", "brewer or admin required", 1], ["no lot", "Choose a lot · Citra is lot-tracked", 1], ["recipe hint", "planned dry hop 1.2 lb/bbl · 18 lb"], ["offline", "queue with requestId"], ["stale", "occupancy closed · choose another", 1]],
    spec: "Not Record movement (that is finished goods) and not Brew day (that is knockout). The consumption movement carries the lot; the addition row carries stage and occupancy so loss accounting stays anchored to the batch.",
    body: (<>
      {E.pick("Occupancy", "FV2 · B-0416 · Hazy IPA", ["FV2 · B-0416 · Hazy IPA", "FV1 · B-0409 · Pils"])}
      {E.nav("Material", "Citra · hop")}
      {E.chips(["dry hop", "fermentation", "other"], 0)}
      {E.qty("18", E.tabs(["lb", "oz", "kg"], 0, "w-fit"))}
      {E.info("Preview: −18 lb Citra · L-0790 · consumption · dry hop · B-0416")}
      {E.pin(<>
        {E.btn("Record addition", "irr")}
      </>)}
    </>),
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Batches",
    to: { Start: "Brew day", "B-0416 \u00b7 Hazy IPA v4": "Brew day", "B-0409 \u00b7 Pils": "Vessel detail", "B-0413 \u00b7 Stout": "Vessel detail" },
    job: "See planned and active batches with the next brew or cellar action",
    reads: "list_batches [design]",
    writes: "none [scheduling happens on Schedule batch; recording on Brew day]",
    states: [["planned", "Start is the next action"], ["active", "the row names the next reading or transfer"], ["empty", "no batches yet: New batch is the only action"]],
    spec: "The Work list with the Batches tab active. Planned batches sort before active batches due for attention; every row names its next action. New batch opens Schedule batch, and Schedule batch and Brew day return here.",
    body: <BatchesView model={toBatchesViewProps(batchesBrewer)} />,
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Schedule batch",
    job: "Set date and planned barrels; recipe and brand are intent, not commitments",
    reads: "get_brew_day [design] · list_recipes · list_brands",
    writes: "schedule_batch [single planned-batch row; both the recipe version and the intended brand are nullable]",
    states: [["permission", "brewer or admin required", 1], ["planned", "Save schedule is the one verb"], ["no recipe yet", "date and barrels alone hold the slot"], ["no brand yet", "identity waits for packaging, which already requires one"], ["brew day", "Record brew day is its own screen"]],
    spec: "The planned mode of brew day: date, planned barrels, and two optional statements of intent. Only date and barrels commit anything: they reserve the slot. The recipe version is already optional in the schema, and revision 2 makes the brand optional too, because identity is optional at brew and required at packaging, where every finished lot must already name a brand. Requiring either here enforces nothing the lot does not, and only forces the decision earlier than the business makes it. Keeping brand as intent is also what keeps the gap between what a batch was meant to be and what it shipped as worth querying, rather than rewriting history when a batch blends or turns into something else. Record brew day is a separate screen so this page has one primary.",
    body: <ScheduleBatchView model={toScheduleBatchViewProps(scheduleBatchHazy)} />,
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Brew day",
    to: { "2-row": "Entity picker", "Citra \u00b7 boil": "Entity picker", "Yeast": "Entity picker", "Brew sheet · Hazy IPA v4": "Mash schedule" },
    job: "Consume actual lots and set knockout baseline",
    reads: "get_brew_day [design]",
    writes: "record_brew_day [design; one RPC: additions + material movements + occupancy]",
    states: permitted("brewer or admin required"),
    spec: "The brew sheet row is a read-out of the version’s process spec, opened frozen; brew day captures actuals, and fermentation reality arrives through Fermentation reading, so there is no mash-actuals form here. Brew-day mode: actual lots and knockout vessel. Planned recipe/date/barrels live on Schedule batch so this page has one primary. Record brew day posts immutable material consumption for mash/boil/whirlpool stages only; the 18 lb Citra dry hop is posted later from Cellar addition. Yeast is consumed as a material lot, not a culture generation (plan §8).",
    body: <BrewDayView model={toBrewDayViewProps(brewDayHazy)} />,
  },
  {
    step: 7,
    slice: 4,
    group: "Global",
    surface: "sheet",
    name: "Cellar transfer",
    to: { "Record transfer": "Cellar map" },
    job: "Write one transfer row that carries its own loss volume",
    reads: "get_cellar_map [view; occupancy volumes]",
    writes: "record_cellar_transfer [design; one RPC: create target occupancy(initial_bbl=0) when empty + append transfer(loss_bbl) + close source occupancy iff fully emptied]",
    states: permitted("brewer or admin required"),
    spec: "Drawn as a blend into an occupied brite: BT1 keeps its occupancy and B-0412 keeps its identity: the schema has one batch per occupancy, and blends are transfers into the surviving one (renaming a blend as a new batch is a plan §8 schema gap). An empty target (BT2) gets a new occupancy starting at zero bbl in the same RPC; the transfer row stays immutable; a fully emptied source closes its occupancy. A partial transfer never implies loss: the person explicitly holds the remainder or records loss. No vessel status.",
    body: (<>
      {E.pick("From", "FV1 · Pils · B-0409 · 12.8 bbl", ["FV1 · Pils · B-0409 · 12.8 bbl", "FV2 · Hazy IPA · B-0416 · 14.6 bbl"])}
      {E.pick("To", "BT1 · Pils · B-0412 · 7.0 / 10 bbl", ["BT1 · Pils · B-0412 · 7.0 / 10 bbl", "BT2 · empty"])}
      {E.qty("3.0", "bbl", "Barrels moving")}
      {E.info("Blend preview: BT1 7.0 + 3.0 = 10.0 bbl (full) · stays B-0412 · Pils. FV1 keeps 9.8 bbl, or Record as loss books those 9.8 bbl as loss.")}
      {E.fld("Remainder in FV1", "9.8 bbl")}
      {E.chips(["Leave in FV1", "Record as loss"], 0)}
      {E.pin(<>
        {E.btn("Record transfer", "irr")}
      </>)}
    </>),
  },
  {
    step: 7,
    slice: 5,
    tab: "Work",
    name: "Close packaging run",
    to: { "Close packaging run": "Run closed", Work: "Packaging runs" },
    job: "Plan a run separately, then create lot and movements on close",
    reads: "get_packaging_run [design; revalidate selected source occupancy] · list_locations",
    writes: "schedule_packaging_run [one RPC: run planned against a brand, with an optional source occupancy, + planned outputs] · update_packaging_run [pick the tank, or stamp the run started: both require a tank] · close_packaging_run [one RPC: revalidate source + close + lot + outputs + material movements at explicit locations]",
    states: [["permission", "brewer or warehouse required", 1], ["short", "a material is short · resolve or explicitly override before starting", 1], ["no damage", "the ordinary close · both fields stay at zero and nothing extra posts"], ["damage", "a named quantity is written off to an explicit bin", 1]],
    spec: "The close half of the packaging frame; planning and editing the plan live in the Schedule packaging run sheet until the run starts. Close is a copper review ( revalidated source, actual outputs, lot, explicit finished-goods destination, material consumption and damage, yield/loss). Consumption is derived from what was actually packaged, never from the plan, which is why leftover material needs no entry: 118 cases consumed 2,832 cans and ends, and the rest never left the shelf to be returned. Damage is the one thing nobody can derive, so it is the one thing asked for, optional and starting at zero. It is asked only where material is issued in whole units and comes back short: labels and ends, not every line of the bill of materials, because a prompt on all five is friction nobody completes. Labels are never counted here. Nobody can count what is left on a roll, and a screen that asks will simply be given a guess that posts as fact; the roll is reconciled at cycle count by counting whole rolls instead. A damaged unit names its destination for the same reason finished goods do: material written off against the wrong bin is worse than material nobody tracked. Print labels is presentation after commit: measured thermal keg-collar/lot labels per plan §3. No packaging-day-actuals screen.",
    body: <ClosePackagingRunView model={toClosePackagingRunViewProps(closePackagingRunHazy)} />,
  },
  {
    step: 7,
    slice: 5,
    tab: "Work",
    name: "Run closed",
    to: { Work: "Packaging runs" },
    job: "Lot and labels after close; Print is the post-commit action",
    reads: "get_packaging_run [design]",
    writes: "none",
    states: [["permission", "brewer or warehouse required", 1], ["closed", "lot assigned · labels ready"], ["print", "keg collar and lot labels"]],
    spec: "Post-commit of Close packaging run. Print labels moves here; the close verb is gone.",
    body: <RunClosedView model={toRunClosedViewProps(runClosedHazy)} />,
  },
  {
    step: 8,
    slice: 5,
    tab: "Work",
    name: "Packaging runs",
    to: { Resolve: "Close packaging run", Start: "Close packaging run", "Pick source": "Schedule packaging run", "RUN-0030 \u00b7 Pils cans": "Run closed", "RUN-0029 \u00b7 Hazy \u00bd bbl": "Run closed", "RUN-0028 \u00b7 Helles cans": "Run closed" },
    job: "See what is planned, what is due and what closed, and schedule the next run",
    reads: "list_packaging_runs [design; planned and recent closed, by planned date] · get_material_shortfalls [view; per planned run]",
    writes: "none [scheduling and closing happen on their own surfaces]",
    states: [["short", "a planned run whose materials fall short says so on the row and its next action is Resolve, not Start"], ["due today", "the same row also appears in Today for the brewer"], ["closed", "recent runs stay for a few weeks with lot, output and yield; after that they are history under Search and Lot trace"], ["empty", "no runs planned: the button is the only thing on the page"]],
    spec: "The Work list with the Runs tab active, which is the packaging list: Work is where everything in motion lives, so runs get no rail entry of their own. Upcoming sorts by planned date and every row names its next action. Recent breaks Work's in-motion rule on purpose, because a brewer plans the next run against the last one's yield; it is kept short and the full history stays in Search. Schedule run opens the sheet; a row opens the run, where closing happens.",
    body: (<>
      {E.hd("Work", "brewer default", E.btn("Schedule run"))}
      {E.tabs(WORK_CHIPS, 4, "w-full", WORK_TABS)}
      {E.ttl("Upcoming")}
      {E.row("RUN-0031 · Hazy cans", "Fri 9/5 · FV3 · 118 cases planned · 480 ends short", E.act("Resolve", "attention"), "w")}
      {E.row("RUN-0032 · Pils ½ bbl", "Tue 9/9 · FV1 · 40 kegs planned", E.act("Start", "info"))}
      {E.row("RUN-0033 · Stout cans", "Thu 9/11 · no source yet", E.act("Pick source"))}
      {E.ttl("Recent")}
      {E.row("RUN-0030 · Pils cans", "closed Tue 9/2 · L-240902-PL · 96 cases · 97% yield", "", "ok")}
      {E.row("RUN-0029 · Hazy ½ bbl", "closed Fri 8/29 · L-240829-HZ · 38 kegs · 95% yield", "", "ok")}
      {E.row("RUN-0028 · Helles cans", "closed Wed 8/27 · L-240827-HL · 110 cases · 92% yield · 2 bbl loss", "", "w")}
      {E.info("Recent keeps the last few weeks. Older runs are under Search and Lot trace.")}
    </>),
  },
  {
    step: 8,
    slice: 5,
    tab: "Work",
    surface: "sheet",
    name: "Schedule packaging run",
    to: { "Save run plan": "Close packaging run", "FV3 · Hazy IPA": "Entity picker" },
    job: "Plan a run against one source occupancy and see shortages before the day",
    reads: "list_occupancies [design; open, with volume and contents] · list_formats [design; for the brand in the source] · get_material_shortfalls [view; preview for the planned outputs]",
    writes: "schedule_packaging_run [one RPC: run planned against a brand, with an optional source occupancy, + planned outputs, each flagged on/off the wholesale list] · update_packaging_run [same sheet reopens a planned run until it starts; picking the tank or starting both require one]",
    states: [["permission", "brewer or warehouse required", 1], ["source chosen", "the brand comes from what is in the vessel, so only that brand's formats are offered"], ["short", "the materials table shows the shortage now, not on the day; Save still works, Start will not"], ["editing", "a planned run reopens here with its values filled; a started run cannot be rescheduled, only closed"], ["no open occupancy", "nothing to package: the source picker says so and links to Cellar"]],
    spec: "The plan half of the packaging frame, pulled out so a run can be scheduled before it exists and edited until it starts. One source occupancy, chosen exactly, is the rule that lets close revalidate it later. Planned outputs are counts per format; the sheet converts to barrels and shows what is left in the vessel so a plan cannot exceed the source. Each output can be listed on the wholesale shop (the brand × package buyers will see); listing is the offer, not an ATP promise, and a format left off is absent from Shop. Materials are previewed from the format BOM so a shortage is a planning fact, not a surprise at the line. Saving writes the run and its planned outputs in one RPC and lands on the run; nothing moves in the ledger until close.",
    body: (<>
      {E.edit("Planned date", "2026-09-05", "date")}
      {E.ttl("Source")}
      {E.nav("FV3 · Hazy IPA", "B-0416 · 42.0 bbl · gravity 2.1 · ready")}
      {E.ttl("Planned outputs")}
      {E.row("Hazy · case · 24×16 oz", "39.6 bbl · on the wholesale list", <>{E.stq(118)}{E.sw(true, "On the wholesale list")}</>)}
      {E.row("Hazy · ½ bbl keg", "2.0 bbl · on the wholesale list", <>{E.stq(4)}{E.sw(true, "On the wholesale list")}</>)}
      {E.row("Hazy · ⅙ bbl keg", "not listed this run", <>{E.stq(0)}{E.sw(false, "On the wholesale list")}</>)}
      {E.fld("Left in FV3", "0.4 bbl · loss at close unless held")}
      {E.ttl("Materials")}
      {E.tbl(["need", "have", "short"], [["cans 2,832", "3,100", "0"], ["ends 2,832", "2,400", <><span className="text-warning-foreground">432</span></>], ["labels 2,832", "5,000", "0"], ["trays 118", "140", "0"]])}
      {E.note("432 ends short. Save the plan now; Start stays disabled until the shortage is resolved or overridden on the run.")}
      {E.btn("Save run plan")}
      {E.info("Nothing moves until the run closes. Saving writes the run and its planned outputs together.")}
    </>),
  },
  {
    step: 7,
    slice: 5,
    tab: "Beer",
    group: "Global",
    name: "Lot trace",
    job: "Trace a lot from its tank and batch through every ledger movement that names it",
    reads: "trace_lot",
    writes: "none",
    states: [["still on hand", "unsold units are the part a recall can actually stop"], ["no shipments", "no recorded shipment of this lot", 1], ["unknown lot", "not found"]],
    spec: "The lot is one packaging run, so the trace follows lot → run → tank → batch and lists every movement carrying the lot: the production that made it, samples and losses pulled from it. Shipping records explicit bin/lot allocations per order line; returns and transfers preserve them. Trace shows actual customer recipients, ship-to addresses, orders and invoices, and balances per SKU/bin plus barrels. Historical untracked consumption cannot be assigned to a lot. It does not descend into POS sale lines, because a sale posts nothing to the ledger and would imply a per-pint traceability MGR does not have.",
    body: (<>
      {E.back("Compliance months", "L-240831-HZ")}
      {E.row("Hazy IPA · 16 oz case", "run 28 · packaged 8/31 · best by 2/27", "7.61 bbl recorded balance")}
      {E.fld("Tank · batch", "FV-3 · batch 41 · brewed 8/10")}
      {E.fld("Drawn", "25.00 bbl")}
      {E.tape([["+120 · production in · Hazy IPA 16 oz case · Warehouse", "8/31"], ["−2 · sample · Hazy IPA 16 oz case · Warehouse", "9/02"]])}
      {E.ttl("Recorded balances by SKU and bin")}
      {E.row("Hazy IPA · 16 oz case", "Warehouse · Cooler", "118 units · 7.61 bbl")}
      {E.ttl("Recipients")}
      {E.blank("No recorded shipments of this lot")}
      {E.note("Only recorded lot identities are traced. Historical untracked stock and consumption cannot be assigned to this lot.")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "Purchase orders",
    to: { "New PO": "New PO", Send: "Receive PO" },
    job: "See draft, sent and partially received purchase orders",
    reads: "list_purchase_orders",
    writes: "none [creation and receiving happen on their own surfaces]",
    states: [["draft", "Send is the next action"], ["partial", "Receive stays available for the remainder"], ["empty", "no open purchase orders: New PO is the only action"]],
    spec: "The Work list with the POs tab active. Each row names the next action; New PO opens the existing vendor purchase draft, and Receive PO returns here.",
    body: <PurchaseOrdersView model={toPurchaseOrdersViewProps(purchaseOrdersWarehouse)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "New PO",
    to: { Vendor: "Entity picker", "Add line": "New PO", "Save draft": "Purchase orders" },
    job: "Draft a vendor order: lines, cost, and the lot the vendor named",
    reads: "list_vendors · list_materials · get_material_requirements",
    writes: "create_purchase_order [one RPC: draft PO + all lines]",
    states: [["permission", "warehouse or admin required", 1], ["new", "vendor and one line required"], ["from requirements", "Planning drafts the lines; the shortfall is the quantity"], ["contracted lot", "the vendor named a lot on the contract · it prefills receiving"], ["no lot named", "the ordinary case · receiving captures it off the package"]],
    spec: "Expected lot is what the vendor named when the order was placed, which for a hop contract is often a crop-year lot. It is advisory: it creates no lot record and posts nothing, and it is offered only on a lot-tracked material. Receiving prefills its lot from it, and what the receiver reads off the arriving package is what creates the lot. That is the same principle as counted quantity: the promise is compared and the count is what posts. Rice hulls is not lot-tracked, so it is never asked.",
    body: <NewPoView model={toNewPoViewProps(newPoCountryMalt)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "Receive PO",
    job: "Count what arrived; trigger derives receipt status",
    reads: "get_purchase_order",
    writes: "send_purchase_order [single row draft → sent; an attestation: Marked sent, never Delivered] · receive_purchase_order [one RPC: receipt + lines (counted, over or short) + lots with best_by + material movements]",
    states: [["loading", "PO-line skeleton"], ["draft", "Send purchase order is the one active verb · counts wait, and the receive verb is not drawn", 1], ["prefilled", "the PO named a lot · the field opens on it and the ordinary receipt changes nothing"], ["no lot on the PO", "the field opens empty · recent lots for that material are offered", 1], ["lot substituted", "the vendor shipped another lot · recorded, never blocked", 1], ["stale", "receipt changed · recheck", 1], ["offline", "keep counts; commit waits"], ["permission", "warehouse or admin", 1], ["success", "partially received"]],
    spec: "Send PO (green) shows while the PO is draft; receiving needs a sent PO. Each lot-tracked line takes a lot code and best-by typed off the vendor packaging, prefilled from the lot the PO named so the ordinary receipt is a glance and no typing. When the PO named none the field opens empty and offers that material\u2019s recent lots, which is what keeps one vendor lot from becoming two records over a stray space. The receive RPC creates the material lot from what is entered here, never from the PO: the package is the only writer of a lot code. A difference is a substitution, which is reported and never blocked. Punctuation or case alone never reads as one: the schema spec owns that comparison rule. Untracked lines (rice hulls) ask for none. Only counted quantity posts; over and short are both visible and both allowed, and the keypad never clamps an over-count as the only guard. PO status is trigger-derived; never write a loaded/status flag.",
    body: <ReceivePoView model={toReceivePoViewProps(receivePoCountryMalt)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "Receipt",
    to: { Work: "Purchase orders" },
    job: "What posted after a receive, including over, short and what is still owed",
    reads: "get_purchase_order [ordered less counted per line]",
    writes: "none",
    states: [["permission", "warehouse or admin required", 1], ["partial", "the PO is partially received · the remainder is named"], ["complete", "every line met expected · nothing is owed"]],
    spec: "Post-commit of Receive PO. The tape is the receipt; status is derived. The remainder is the ordered quantity less everything counted so far, and it is the number a buyer chases a vendor with, so it is stated rather than left to be worked out from the tape. It is derived on read for the same reason status is: a stored balance would need its own correction path the moment a recount lands, and a recount is the ordinary way a miscount is fixed here.",
    body: <ReceiptView model={toReceiptViewProps(receiptPoCountryMalt)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "Beer",
    name: "Materials on hand",
    to: { "Cans \u00b7 16 oz": "Material", "Citra 2026 \u00b7 YCH": "Material", "2-row 2026 \u00b7 Country Malt": "Material", "Yeast \u00b7 WLP066": "Material" },
    job: "See material quantities, lots and best-by dates and start a count",
    reads: "get_material_on_hand",
    writes: "none [counts happen in the Cycle count sheet]",
    states: [["expiring", "the earliest best-by date needs attention"], ["empty", "no materials yet: Add material is the only action"]],
    spec: "The Beer landing's Materials row opens this list. Count opens Cycle count for that material; Add material opens the existing material and vendor flow.",
    body: <MaterialsOnHandView model={toMaterialsOnHandViewProps(materialsOnHandList)} />,
  },
  {
    step: 7,
    slice: 2,
    group: "Global",
    surface: "sheet",
    name: "Cycle count",
    to: { Material: "Entity picker", "Record count": "Materials on hand" },
    job: "Post only variance as an append-only movement",
    reads: "get_material_on_hand",
    writes: "record_material_count [one RPC: count + lines + adjustment movements against named lots]",
    states: [["permission", "warehouse or brewer required", 1], ["one lot", "the variance lands on it · nothing to choose"], ["several lots", "a shortage consumes earliest best-by first; an overage lands on the newest lot"], ["no best-by", "lots with none fall to receipt order behind those that have one"], ["split", "a shortage crossing two lots names both in the preview", 1], ["counted in rolls", "labels are counted as whole rolls · the open roll is excluded and its remainder falls into the variance", 1]],
    spec: "A count is one number and a material may hold several lots, so the RPC has to decide which lot moves. A shortage consumes earliest best-by first, not earliest receipt: best-by is what a recall and an expiry sweep read, and consuming the freshest lot first would leave the oldest to expire on the shelf. An overage lands on the newest lot, since unrecorded stock is far likelier to be the delivery just counted in than one from six months ago. The chosen lot is always named in the preview: a variance that silently splits across two lots is the one thing this sheet must not do quietly. Labels are the exception to counting units, and the reason is practical: nobody counts two thousand labels left on a roll, and a sheet that asks will be handed a guess that posts as fact. Whole rolls are counted instead and the open roll is excluded, so the error is bounded at one roll and the same variance absorbs it at the next count. Applicator waste is what makes the drift, since packaging consumes one label per unit packaged while the real line wastes a little more; counting rolls on a routine keeps that from accumulating unnoticed.",
    body: (<>
      <CycleCountView model={toCycleCountViewProps(cycleCountCans)} footer={null} />
      {E.pin(<>{E.btn("Record count", "irr")}</>)}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    name: "Vendors",
    to: { Edit: "Vendor" },
    job: "List suppliers and open one supplier's terms",
    reads: "list_vendors_and_contracts",
    writes: "none [creation and editing happen on Vendor]",
    states: [["permission", "warehouse or brewer required", 1], ["active", "available for purchase orders"], ["contract", "committed quantity summarized"], ["empty", "Add vendor is the only action"]],
    spec: "Materials, vendors and contracts are separate lists so each row has one predictable destination.",
    body: <VendorsView model={toVendorsViewProps(vendorsList)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    name: "Materials",
    to: { Edit: "Material" },
    job: "List material definitions separately from on-hand lots",
    reads: "list_materials",
    writes: "none [creation and editing happen on Material]",
    states: [["permission", "warehouse or brewer required", 1], ["active", "available to recipes and purchase orders"], ["inactive", "history remains", 1], ["empty", "Add material is the only action"]],
    spec: "This list owns material facts; Materials on hand remains the inventory view.",
    body: <MaterialsView model={toMaterialsViewProps(materialsList)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    surface: "sheet",
    name: "Material",
    to: { "Save material": "Materials" },
    job: "Create or edit one material definition",
    reads: "list_materials",
    writes: "upsert_material",
    states: [["permission", "warehouse or brewer required", 1], ["new", "name, kind and unit required"], ["in use", "unit change refused", 1], ["lot-tracked", "every receipt and consumption names a lot; off means none may"]],
    spec: "Inventory quantities and lots are not edited on the definition, and neither is lead time: the wait is a property of who fulfils an order, so it lives on the vendor. The purchase-unit factor does live here, because a hop box and a can pallet from one supplier are different numbers, and the factor is what turns counted bags into base units on Receive PO.",
    body: <MaterialView model={toMaterialViewProps(materialCitra)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    surface: "sheet",
    name: "Vendor",
    to: { "Save vendor": "Vendors" },
    job: "Create or edit one supplier and its purchase terms",
    reads: "list_vendors_and_contracts",
    writes: "upsert_vendor",
    states: [["permission", "warehouse or brewer required", 1], ["new", "name required"], ["active", "available for purchase orders"]],
    spec: "Contracts remain separate records because a vendor may supply many materials. Lead time lives here rather than on the material: every observation of it is an ordered-to-received span keyed by the vendor, so the estimate sits where the evidence is. Planning reads it to date the buy-by of the slowest supplier a bill of materials resolves to.",
    body: <VendorView model={toVendorViewProps(vendorYch)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    name: "Contracts",
    to: { Edit: "Contract" },
    job: "List material commitments and what is still free to release",
    reads: "list_vendors_and_contracts [committed, received and ordered-not-yet-received per contract]",
    writes: "none [creation and editing happen on Contract]",
    states: [["permission", "warehouse or brewer required", 1], ["active", "committed, received, on order and available all shown"], ["releases in flight", "orders placed and not yet arrived hold back availability", 1], ["fulfilled", "history remains"], ["empty", "Add contract is the only action"]],
    spec: "Each commitment is one vendor and one material. A contract is not an order: it commits a volume for a crop year, and releases are ordered against it all year, so the same contract is drawn down many times. That is why availability counts orders placed as well as deliveries taken. Counting only what has arrived would let two releases be placed against the same remaining quantity, and the over-draw would surface weeks later at receiving. Received is what accounting reconciles against; available is what a buyer decides against. Both are shown because they answer different questions.",
    body: <ContractsView model={toContractsViewProps(contractsList)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    surface: "sheet",
    name: "Contract",
    to: { Vendor: "Entity picker", Material: "Entity picker", "Save contract": "Contracts" },
    job: "Create or edit one material purchasing commitment",
    reads: "list_materials · list_vendors_and_contracts",
    writes: "upsert_material_contract",
    states: [["permission", "warehouse or brewer required", 1], ["new", "vendor, material and quantity required"], ["received", "received and on-order quantities are read-only"]],
    spec: "This sheet owns the commitment and nothing else. Receipts and open releases both update progress, and neither is editable here: a quantity a buyer could type over would stop being evidence. Available is the commitment less what has arrived and less what is already ordered, which is the only one of the four numbers worth acting on.",
    body: <ContractView model={toContractViewProps(contractYchCitra)} />,
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Recipes",
    to: { Review: "Recipe", Finish: "Recipe" },
    job: "Find recipe versions and create the next recipe",
    reads: "list_recipes [design]",
    writes: "none [creation and versioning happen on Recipe]",
    states: [["draft version", "Finish is the next action"], ["empty", "no recipes yet: Create recipe is the only action"]],
    spec: "The More landing's Recipes row opens this list. Each row opens Recipe at its current version and names the next action; Create recipe opens the same surface with only name and style.",
    body: <RecipesView model={toRecipesViewProps(recipesList)} />,
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Recipe",
    to: { Create: "Recipe", "Recipe parent \u00b7 Hazy IPA \u00b7 IPA": "Recipe", "Mash schedule · 3 steps": "Mash schedule", "Fermentation schedule · 4 stages": "Fermentation schedule", "Water · Municipal Denver to Hazy target": "Water" },
    job: "Author immutable versions from assumptions; actuals keep predictions honest",
    reads: "list_recipes · get_recipe [design] · get_recipe_outcomes [design; per-batch actual OG/FG/ABV + realized efficiency/attenuation, derived from fermentation readings, never stored]",
    writes: "create_recipe [design; mutable parent row] · create_recipe_version [one RPC: immutable version + ingredients, with assumption columns on recipe_versions and per-ingredient extract snapshot on recipe_ingredients; SCHEMA-GATE: process-spec columns (pre-boil volume, whirlpool min/temp/rest, knockout temp) remain unbuilt]",
    states: [...permitted("brewer or admin required"), ["no group yet", "the brand picks one at packaging · nothing is blocked"]],
    spec: "Predictions come from one shared registry-layer formula over the version’s snapshotted inputs (assumptions + per-ingredient extract); the editor’s live preview and server reads call the same function; values are never stored, so there is no SQL copy. Versioning is disabled behind its schema gate. A new parent takes name and style only; versions append, and history is never edited. Costing lives on desk. A version is the executable process spec, not only the prediction inputs: volumes, boil, whirlpool and knockout are scalars here, while the mash and fermentation schedules and water open as their own screens because they repeat and carry add, reorder and delete. The mash temperature is gone from this page, because every mash step carries one and a scalar beside them is a second answer to one question. Batch size and knockout volume are gone too: the scale chips already state the batch size and Brew day already records knockout volume as its baseline. Three note fields become one.",
    body: <RecipeView model={toRecipeViewProps(recipeHazyV4)} />,
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Mash schedule",
    to: { Edit: "Mash step", "Add step": "Mash step", "Mash-in": "Mash step", Saccharification: "Mash step", "Mash-out": "Mash step" },
    job: "Order the rests a brewer actually holds on the day",
    reads: "get_recipe [design; the version’s mash schedule]",
    writes: "create_recipe_version [design; the steps are written with their version, never alone; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["draft", "steps add, reorder and delete"], ["frozen", "a cut version reads only · create the next version to change it", 1], ["empty", "no steps yet: Add step is the only action"]],
    spec: "Its own screen because it repeats: add, reorder and delete are verbs a scalar field never needs, and inlining them on Recipe would give that page a second primary. A version is immutable, so this surface is an editor on a draft and a read-out once cut: one whole-screen mode rather than a toggle threaded through a long page. The footer names the conversion rest because Recipe no longer carries a mash temperature of its own; without it the number the prediction reads would have no visible home.",
    body: (<>
      {E.back("Recipe", "Hazy IPA v4 · Mash schedule", E.btn("Add step"))}
      {MASH_STEPS.map((s) => (
        <Fragment key={s.name}>{E.row(s.name, `${s.kind} · ${s.tempF} °F · ${s.duration} min`, E.act("Edit"))}</Fragment>
      ))}
      {E.info(`Total ${totalDuration(MASH_STEPS)} min · the ${saccharificationRest(MASH_STEPS)!.tempF} °F rest feeds the prediction.`)}
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    surface: "sheet",
    name: "Mash step",
    to: { "Save step": "Mash schedule", "Delete step": "Mash schedule" },
    job: "One rest: what the brewer does, at what temperature, for how long",
    reads: "get_recipe [design]",
    writes: "create_recipe_version [design; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["draft", "editable until the version is cut"], ["frozen", "a cut version reads only", 1]],
    spec: "Type and name both stay: they look redundant until a recipe has two infusion steps, where the type says what the brewer does and the name says which one it is. Position comes from list order, never a typed number.",
    body: (<>
      {E.edit("Step name", "Saccharification")}
      {E.pick("Type", "infusion", ["infusion", "decoction", "direct heat", "rest"])}
      {E.cols(
        E.edit("Temp °F", "152", "number"),
        E.edit("Duration min", "60", "number"),
      )}
      {E.edit("Notes · optional", "")}
      {E.btns([["Delete step", "g"], "Save step"])}
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Fermentation schedule",
    to: { Edit: "Fermentation stage", "Add stage": "Fermentation stage", Primary: "Fermentation stage", "Diacetyl rest": "Fermentation stage", "Cold crash": "Fermentation stage", Conditioning: "Fermentation stage" },
    job: "State the temperatures and days a batch is meant to hold",
    reads: "get_recipe [design; the version’s fermentation schedule]",
    writes: "create_recipe_version [design; written with their version, never alone; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["draft", "stages add, reorder and delete"], ["frozen", "a cut version reads only · create the next version to change it", 1], ["empty", "no stages yet: Add stage is the only action"]],
    spec: "The same shape as Mash schedule and for the same reason. The footer places the dry hop because Recipe draws a dry hop on a day number, and a day number means nothing without this list: day 4 is the last day of Primary, which is why a brewer chose it. The separate fermentation-days and conditioning-days fields v1 kept beside this list are dropped, because the list sums to them and two sources for one number is the failure this design keeps removing.",
    body: (<>
      {E.back("Recipe", "Hazy IPA v4 · Fermentation", E.btn("Add stage"))}
      {FERM_STAGES.map((s) => (
        <Fragment key={s.name}>{E.row(s.name, `${s.tempF} °F · ${s.duration} days`, E.act("Edit"))}</Fragment>
      ))}
      {E.info(`Total ${totalDuration(FERM_STAGES)} days · dry hop day 4 falls in Primary.`)}
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    surface: "sheet",
    name: "Fermentation stage",
    to: { "Save stage": "Fermentation schedule", "Delete stage": "Fermentation schedule" },
    job: "One stage: a temperature held for a number of days",
    reads: "get_recipe [design]",
    writes: "create_recipe_version [design; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["draft", "editable until the version is cut"], ["frozen", "a cut version reads only", 1]],
    spec: "Stage type and name both stay, as on Mash step: two custom stages need the type to say what happens and the name to say which one. Position comes from list order.",
    body: (<>
      {E.edit("Stage name", "Diacetyl rest")}
      {E.pick("Stage", "diacetyl rest", ["primary", "secondary", "diacetyl rest", "cold crash", "conditioning", "lagering", "custom"])}
      {E.cols(
        E.edit("Temp °F", "72", "number"),
        E.edit("Duration days", "2", "number"),
      )}
      {E.edit("Notes · optional", "")}
      {E.btns([["Delete stage", "g"], "Save stage"])}
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Water",
    to: { Add: "Water addition", Edit: "Water addition", "Add addition": "Water addition", Gypsum: "Water addition", "Calcium chloride": "Water addition", "Lactic acid": "Water addition" },
    job: "State the water a version starts from, aims at, and what goes in it",
    reads: "get_recipe [design] · list_water_profiles [design]",
    writes: "create_recipe_version [design; water values and the water additions are written with the version; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["brewery source", "the source profile comes from Settings unless this version overrides it"], ["overridden source", "an osmosis blend or a second supply"], ["draft", "additions add, reorder and delete"], ["frozen", "a cut version reads only", 1]],
    spec: "Source water is what comes out of the tap, so it is a Settings value and this screen shows it as the brewery default; a version overrides it only for the case that genuinely varies, an osmosis blend or a second supply. v1 stored it per recipe, so every recipe repeated the same municipal profile and a new water report meant editing all of them. Each addition carries one stage, not v1’s pair of timing and target: for water chemistry those are one axis wearing two hats, since a salt added at mash time goes into the mash by definition. The sulfate to chloride line is example text; ion deltas, salt contribution and pH prediction are calculations this slice does not build, and if they arrive they go through the same shared formula rule Recipe sets for gravity and strength.",
    body: (<>
      {E.back("Recipe", "Hazy IPA v4 · Water")}
      {E.fld("Source profile", "Municipal · Denver · brewery default")}
      {E.pick("Target profile", "Hazy target", ["Hazy target", "Burton", "Municipal · Denver"])}
      {E.cols(
        E.edit("Mash water gal", "9.5", "number"),
        E.edit("Sparge water gal", "12.0", "number"),
      )}
      {E.edit("Target mash pH", "5.35")}
      {E.ttl("Salts and acids")}
      {E.row("Gypsum", "4.0 g · mash", E.act("Edit"))}
      {E.row("Calcium chloride", "6.0 g · mash", E.act("Edit"))}
      {E.row("Lactic acid", "3.0 mL · sparge", E.act("Edit"))}
      {E.row("Add addition", "material · amount · stage", E.act("Add"))}
      {E.info("Sulfate to chloride 0.9 · chloride forward, as the target says.")}
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    surface: "sheet",
    name: "Water addition",
    to: { "Save addition": "Water", "Delete addition": "Water" },
    job: "One salt or acid, its amount, and where it goes",
    reads: "get_recipe [design] · list_materials",
    writes: "create_recipe_version [design; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["draft", "editable until the version is cut"], ["frozen", "a cut version reads only", 1]],
    spec: "One stage field, never a timing and a target both. The material comes from the materials catalog that already exists, so a salt is bought, stocked and consumed like any other input.",
    body: (<>
      {E.pick("Material", "Gypsum", ["Gypsum", "Calcium chloride", "Epsom salt", "Lactic acid", "Phosphoric acid"])}
      {E.inline(
        E.edit("Amount", "4.0", "number"),
        E.pick("Unit", "g", ["g", "mL", "oz"]),
      )}
      {E.pick("Stage", "mash", ["mash", "sparge", "kettle"])}
      {E.btns([["Delete addition", "g"], "Save addition"])}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Compliance months",
    job: "Choose a reporting month and see whether its snapshot was filed",
    reads: "list_compliance_reports · list_lots",
    writes: "none",
    states: [["not filed", "ready to review", 1], ["filed", "immutable snapshot saved"], ["lots", "every packaged lot opens its trace"]],
    spec: "This is the shared destination for the registry back link, the month rows, and the lot trace. The last three months always show, plus every filed period; a month is TTB, the API takes other jurisdictions and ranges.",
    body: (<>
      {E.hd("Compliance", "months")}
      {E.nav("September 2026", "not filed · ready to review", "w")}
      {E.nav("August 2026", "filed 2026-09-02 · 41.20 bbl taxable", "ok")}
      {E.nav("July 2026", "filed 2026-08-04 · 38.75 bbl taxable", "ok")}
      {E.nav("Compliance registry", "brands, states and licenses")}
      {E.ttl("Lot trace")}
      {E.nav("L-240831-HZ", "Hazy IPA · packaged 2026-08-31")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Monthly compliance",
    to: { Confirm: "Monthly compliance", "Reattribute loss": "Monthly compliance" },
    job: "Generate from ledgers, review, then record the external filing",
    reads: "list_compliance_reports · generate_compliance_report · get_loss_review",
    writes: "file_compliance_report · reattribute_loss",
    states: [["current", "generated from the ledger now"], ["does not balance", "a movement type the report cannot classify is named · Save stays off", 1], ["mapping required", "direct cellar Taproom volume needs an approved external filing-line mapping · Save stays off", 1], ["filed", "the snapshot is shown, not regenerated"], ["permission", "sales or admin required", 1]],
    spec: "Admin and Sales review exact completion reconciliation losses and allocate each remainder to Sample, Taproom, or Destruction through append-only category changes, never free-text note matching. Corrections post in the period they are saved and leave earlier filed snapshots unchanged. The identity checks are v1 lessons drawn in user copy: balance per class, one additive removal total, an explanatory non-additive cellar breakdown, 0.00 never blank, no transmission. Beer in process is the tanks now, not at period end, and says so. Removals are keyed by frozen tax treatment; direct cellar Taproom volume requires an approved external filing-line mapping before Save turns on.",
    body: (<>
      {E.back("Compliance months", "August 2026")}
      {E.row("1 · Review auto-reconciled losses", "Completion reconciliations stay in history while allocations change their removal category.")}
      {E.fld("Batch 1042 · original generic loss 0.05741935 bbl · allocated 0.02000000 bbl", "remaining 0.03741935 bbl")}
      {E.fld("Sample · Destination PA · prior allocation", "0.02000000 bbl")}
      {E.btn("Reattribute loss", "g")}
      {E.info("An allocation changes removal categories in the period you save it. Earlier filed snapshots stay unchanged.")}
      {E.row("2 · Review generated figures", "", E.status("Current", "ok"))}
      {E.tbl(["class", "begin", "+", "−", "end"], [["kegs", "41.00", "30.50", "33.20", "38.30"], ["cans", "12.60", "18.00", "14.90", "15.70"], ["bottles", "0.00", "0.00", "0.00", "0.00"]])}
      {E.info("Every package class balances: begin + in − out = end, in barrels. Cellar removals are included once below. Zeros print 0.00.")}
      {E.row("Beer in process", "tanks now, not at period end", "120.40 bbl")}
      {E.row("Packaged", "production into finished goods", "48.50 bbl")}
      {E.row("Taxpaid removals", "", "41.20 bbl")}
      {E.row("Export", "", "6.90 bbl")}
      {E.fld("Losses", "0.05741935 bbl")}
      {E.info("Cellar removals breakdown is explanatory and is already included once in the removal totals. Do not add it again.")}
      {E.fld("Cellar · Losses · non-additive breakdown", "0.05741935 bbl")}
      {E.row("Taxpaid to PA", "destination state", "38.10 bbl")}
      {E.row("Taxpaid to OH", "destination state", "3.10 bbl")}
      {E.row("3 · Confirm filed outside MGR", "", "")}
      {E.info("MGR saves the immutable snapshot; it does not transmit the filing. Save stays off until the report balances and required external mappings are approved.")}
      {E.edit("Note · optional", "filed on pay.gov")}
      {E.btn("Save filed snapshot", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Compliance registry",
    to: { Edit: "Brand approval", "Hazy IPA": "Brand approval", Stout: "Brand approval" },
    job: "Maintain brand and state permissions used by order warnings",
    reads: "get_compliance_registry",
    writes: "upsert_brand_approval · upsert_state_registration · upsert_brewery_state_license",
    states: [["pending", "a brand with no COLA is flagged", 1], ["empty", "no brands yet: nothing to register"], ["permission", "sales or admin required", 1]],
    spec: "Unregistered destination/brand combinations are meant to warn during order confirm and link here; that read is not built yet (drift: order warning). One page, two lists: each brand with its approvals and state registrations under it, then the brewery's licenses; the three sheets add or edit a row.",
    body: (<>
      {E.back("Compliance months", "Registry")}
      {E.tabs(["brands", "licenses"])}
      {E.ttl("Brands")}
      {E.row("Hazy IPA", "COLA 23001001000123 · expires 2031-01-15")}
      {E.row("COLA 23001001000123", "approved 2026-01-15 · expires 2031-01-15", E.act("Edit"))}
      {E.row("OH registration", "OH-88214 · expires 2026-12-31", E.act("Edit"))}
      {E.row("Stout", "COLA pending", "", "w")}
      {E.btns(["Add approval", "Add registration"])}
      {E.ttl("Licenses")}
      {E.row("PA brewery", "G-21884 · expires 2027-06-30", E.act("Edit"))}
      {E.btn("Add license", "g")}
      {E.note("Order confirmation does not read this registry yet; a warning for an unregistered destination state is planned and will never block.")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    surface: "sheet",
    name: "Brand approval",
    to: { "Save approval": "Compliance registry" },
    job: "Record one brand’s federal approval status",
    reads: "get_compliance_registry",
    writes: "upsert_brand_approval",
    states: [["approved", "orders may proceed"], ["duplicate", "the same number on the same brand is one record · conflict", 1]],
    body: (<>
      {E.pick("Brand", "Stout", ["Hazy IPA", "Pils", "Stout"])}
      {E.pick("Approval", "COLA", ["COLA", "Formula"])}
      {E.inp("COLA number")}
      {E.cols(E.edit("Approved on · optional", "2026-01-15", "date"), E.edit("Expires · optional", "2031-01-15", "date"))}
      {E.btn("Save approval")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    surface: "sheet",
    name: "State registration",
    to: { "Save registration": "Compliance registry" },
    job: "Record permission to sell one brand in one state",
    reads: "get_compliance_registry",
    writes: "upsert_state_registration",
    states: [["registered", "brand may ship to the state"], ["missing", "order confirmation warns", 1], ["saved again", "one record per brand and state: saving replaces it"]],
    body: (<>
      {E.pick("Brand", "Hazy IPA", ["Hazy IPA", "Pils", "Stout"])}
      {E.cols(E.edit("State (two letters)", "OH"), E.edit("Registration number · optional", "OH-88214"))}
      {E.edit("Expires · optional", "2026-12-31", "date")}
      {E.note("One record per brand and state: saving again replaces it.")}
      {E.btn("Save registration")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    surface: "sheet",
    name: "License",
    to: { "Save license": "Compliance registry" },
    job: "Record one brewery state license",
    reads: "get_compliance_registry",
    writes: "upsert_brewery_state_license",
    states: [["current", "orders may proceed"], ["expired", "order confirmation warns", 1], ["saved again", "one record per state and kind: saving replaces it"]],
    body: (<>
      {E.cols(E.edit("State (two letters)", "PA"), E.edit("Kind", "brewery"))}
      {E.cols(E.edit("License number · optional", "G-21884"), E.edit("Expires · optional", "2027-06-30", "date"))}
      {E.note("Kind is the license class the state uses: brewery, supplier, direct to consumer. One record per state and kind.")}
      {E.btn("Save license")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    name: "POS mapping",
    job: "Sync idempotently, map reversibly, then post explicit depletion",
    reads: "get_pos_setup [design]",
    writes: "connect_square · sync_square_sales [design; one security-invoker batch RPC per fetched page, deduped by unique external line ID] · set_pos_location_mapping · set_pos_item_mapping · reconcile_pos_sales [design; one RPC: selected depletion movements + sale links]",
    states: [["permission", "warehouse or admin required", 1], ["disconnected", "Connect Square starts external OAuth", 1], ["invalid mapping", "Reconcile disabled until brand/format and quantity per sale validate", 1], ["unmapped location", "its sales hold · nothing reconciles from it", 1], ["location added in Square", "found on the next sync · appears unmapped", 1], ["mapped late", "held sales reconcile at their own dates", 1], ["closed in Square", "mapping and history kept · nothing new arrives", 1]],
    spec: "Locations are never typed: ListLocations returns them at connect and they land in MGR’s list of POS locations, so the left of each row is Square’s truth and only the right is a choice. Both choices open the shared entity picker rather than a mapping page of their own: three rows do not earn a screen, and lifting them out would hide the gate from the reconcile that is blocked by it. MGR holds one Square location to one MGR location: a second claim on the same MGR location is refused, or two registers would deplete one shelf without either knowing. ListLocations runs on every sync, not only at connect: a location opened next year has to surface on its own, or its sales disappear with nothing on screen to explain it. It appears unmapped rather than defaulting to anything. Its held sales are the reason the row counts them: raw rows never delete, so mapping makes a backlog reconcilable rather than forgiving it, and each depletion posts at its own sale date. Posting a month of pours on the mapping date would balance the ledger and falsify every variance report built on it. Nothing else is asked for: once mapped, availability derives from that location’s stock and prices inherit their format defaults, so the menu fills itself. A location closed in Square keeps its mapping and its history and simply stops producing sales. External fetch/retry reuses requestId; raw sale rows never delete; no durable cursor is claimed. Reconcile posts immutable rows only after both mapping fields validate. A former SCHEMA-GATE is closed here: the sale channel is no longer a fixed four-value list pinned to Taproom but a per-brewery table of channels, so on-premise and off-premise report separately without a movement-model change. Each depletion carries a sale channel resolved as the item’s channel override, falling back to the location’s channel: never inferred, and never the old Taproom literal, so two Square locations can post under different channels. Refund lines are in the same list and the same RPC/requestId: a refund previews as a positive adjustment (inventory credit); sales-only reconcile is how v1 lost units. INVERTED (was drawn the other way round): the physical count is the source of truth and posts the depletion; POS sales post nothing and supply expected consumption. The gap between them is the product (bad pours, theft, staff drinks, comps, line cleaning), and it exists only because both halves are kept. Reconcile therefore records the expected figure and the sale links, never a movement.",
    body: (<>
      {E.back("Settings", "Square")}
      {E.btn("Sync Square sales", "g")}
      {E.info("Locations come from Square. Choose what each one feeds and which channel its sales post under.")}
      {E.nav("Square Taproom", "MGR Taproom · channel Taproom", "ok")}
      {E.nav("Square Warehouse", "MGR Warehouse · channel DTC", "ok")}
      {E.nav("Square Events", "new · 42 held sales since Aug 12", "w")}
      {E.btn("Save location mapping", "g")}
      {E.nav("“Hazy 16 oz draft”", "Hazy IPA · ½ bbl keg")}
      {E.fld("Qty per sale", "1/124 keg per 16 oz")}
      {E.pick("Channel override", "Taproom", CHANNELS)}
      {E.btn("Save item mapping", "g")}
      {E.row("7 sales · Hazy 16 oz", "expected consumption · not posted", "−112 oz")}
      {E.row("1 refund · Hazy 16 oz", "expected credit · not posted", "+16 oz", "w")}
      {E.note("The weekly count posts the depletion. These sales are the expected number the count is measured against.")}
      {E.btn("Record 7 sales + 1 refund as expected", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "POS sale detail", gatedBy: "Program 14",
    to: { "Hazy 16 oz draft \u00d7 1": "POS mapping" },
    job: "Trace one Square sale through mapping, expected barrels and reconciliation",
    reads: "get_pos_sale [design]",
    writes: "none [mapping changes on POS mapping]",
    states: [["permission", "warehouse or admin required", 1], ["reconciled", "linked to a count", 0], ["unmapped", "held until item mapping validates", 1], ["refund", "expected consumption reverses"]],
    spec: "The sale detail explains expected consumption only. The physical count remains the inventory write.",
    body: (<>
      {E.back("POS mapping", "Square sale SQ-88421")}
      {E.row("Square Taproom · 9/02 8:14 PM", "$7.00 · completed", "SQ-88421", "ok", SquareMark)}
      {E.row("Hazy 16 oz draft × 1", "mapped to Hazy IPA · ½ bbl keg", E.act("Open mapping"))}
      {E.fld("Expected consumption", "1/124 keg · 16 oz")}
      {E.fld("Sales channel", "Taproom · inherited from location")}
      {E.row("Weekly count · 9/03", "included in expected total · count posted depletion", E.act("Open count"), "ok")}
      {E.info("Square supplied the expected amount. No inventory movement was posted by this sale.")}
    </>),
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Keg fleet",
    to: { "Record keg return": "Keg event history" },
    job: "Manage pools and record events without confusing beer returns",
    reads: "get_keg_fleet · list_customers · list_locations · list_bins · list_vendors",
    writes: "create_keg_pool · update_keg_pool · record_keg_event",
    states: [["acquire", "qty into pool · no customer"], ["return empty", "customer required · deposit refund is a separate credit memo"], ["lost / found", "lost at a customer moves their balance · found never has a customer · no money"], ["retire", "cannot exceed what the bin holds · no customer"]],
    spec: "Return empty is a keg event only; the deposit refund is a separate credit memo (no refund line is posted with the keg event yet). Beer coming back with the keg is Return shipment (beer + deposit). No dirty/clean CIP status.",
    body: <KegFleetView model={toKegFleetViewProps(kegFleetMicrostar)} />,
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Customer keg balance",
    to: { "Over 90 days": "Keg event history" },
    job: "See every keg pool one customer has out and the deposit exposure",
    reads: "get_customer_keg_balance · list_customers",
    writes: "none",
    states: [["permission", "warehouse or admin required", 1], ["current", "all pools and deposits shown"], ["overdue", "oldest unreturned kegs flagged", 1], ["none", "no kegs currently out"]],
    spec: "The same customer-owned detail is reachable from Customers and Keg fleet.",
    body: <KegBalanceView model={toKegBalanceViewProps(kegBalanceRidgeline)} />,
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Keg event history",
    job: "Audit acquired, returned, lost, found and retired keg events",
    reads: "list_keg_events · list_keg_pools · list_customers",
    writes: "none",
    states: [["permission", "warehouse or admin required", 1], ["all", "newest first"], ["filtered", "customer and pool filters combine"], ["empty", "no matching events"]],
    spec: "This is the immutable keg ledger, not an editor.",
    body: <KegHistoryView model={toKegHistoryViewProps(kegHistoryLedger)} />,
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Keg report",
    to: { "Ridgeline Tap Room": "Customer keg balance" },
    job: "Review unreturned aging and utilization across the keg fleet",
    reads: "get_keg_report [view]",
    writes: "none",
    states: [["permission", "warehouse or admin required", 1], ["aging", "customer balances grouped by age"], ["utilization", "out divided by active fleet"], ["empty", "no owned keg pools"]],
    spec: "Aging identifies who needs follow-up; utilization shows whether the fleet is working or sitting.",
    body: (<>
      {E.back("Keg fleet", "Keg report")}
      {E.num("70%", "142 of 203 owned half bbl kegs out")}
      {E.tbl(["Age", "Kegs", "Deposits"], [["0–30 days", "96", "$2,880"], ["31–60 days", "25", "$750"], ["61–90 days", "12", "$360"], ["Over 90 days", "9", "$270"]])}
      {E.row("Ridgeline Tap Room", "9 over 90 days · oldest 5/12", E.act("Open balance"), "w")}
      {E.row("Owned ⅙ bbl", "18 of 36 out", "50% utilized")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "Beer",
    name: "Tap board",
    to: { "Stout · ⅙ bbl": "Swap keg", Taproom: "Tap board", "7 \u00b7 Guest cider \u00b7 keg": "Kick keg", "Amber \u00b7 \u00bd bbl": "Swap keg" },
    job: "What is on, since when, and roughly how much is left",
    reads: "list_open_taps · list_tap_history · list_skus · list_locations",
    writes: "tap_keg · swap_keg · kick_keg",
    states: [["swap", "one act, one record · never kick-then-tap"], ["already swapped", "second attempt fails · safe closer and time shown", 1], ["not in taproom stock", "server-derived flag · expected shares excluded", 1], ["guest or event keg", "explicit label and nominal size · no numeric yield", 1], ["no number", "sorts last · a number is never required"], ["duplicate number", "shown as entered · nothing downstream reads it"], ["kicked", "interval closed with a reason · the tap goes empty"], ["no POS", "no usable numerator · no bar", 1]],
    redrawn: true,
    spec: <>A row offers Swap and Kick. Swap closes one interval and opens the replacement atomically; an own replacement defaults to the outgoing SKU, while a guest replacement requires its own label and positive nominal BBL. Tap numbers are optional and may repeat, and unnumbered rows sort last. Opening and closing fill chips are coarse observations and never inventory quantities. A 30-second poll updates only the board and recent history, preserving dirty and uncertain sheets. Exact retries keep the original request. Own package size and inventory exclusion come from the server. Guest labels never match POS facts, so guest rows show no numeric yield. No usable numerator means no bar. Every action here writes zero finished-goods movements; weekly count owns depletion.</>,
    body: (<>
      {E.back("Beer", "Tap board")}
      {E.ttl("On tap")}
      {E.tabs(["Taproom", "Warehouse"])}
      {E.tiles([["1", "Pils · ½ bbl", "on Mon", 0], ["2", "Hazy IPA · ½ bbl", "on Mon", 0], ["3", "Stout · ⅙ bbl", "on Tue · opened 60%", 0], ["4", "Amber · ½ bbl", "on Sat", 0], ["5", "Helles · ½ bbl", "on Wed", 1], ["6", "Saison · ½ bbl", "on Thu", 0], ["8", "Porter · ⅙ bbl", "on Fri", 0], ["9", "Hazy IPA · ½ bbl", "on Thu · second keg", 1], ["10", "Kolsch · ½ bbl", "on Tue", 0], ["11", "Barrel Dark · ⅙ bbl", "on Sun", 0], ["unnumbered", "Wild Ale · ⅙ bbl", "on Thu · sorts last", 0]])}
      {E.row("7 · Guest cider · keg", "nominal ½ bbl · tapped here by @dana · not our stock · no guest yield", E.act("Kick", "destructive"), "w")}
      {E.info("Tap 7 is empty. Unnumbered kegs sort last.")}
      {E.row("Recent · Kolsch tapped", "Dana · Tue 4:10pm")}
      {E.row("Recent · Saison swapped in", "Ali · Thu 11:20am")}
      {E.note("With no usable POS numerator, a row shows what is on and since when, with no bar. Guest labels are never matched to POS. Nothing on this board posts to the ledger; the weekly count does that.")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "Beer",
    surface: "sheet",
    name: "Kick keg",
    to: { "Kick keg": "Tap board" },
    job: "Close one tap without opening a replacement keg",
    reads: "list_open_taps · list_tap_history",
    writes: "kick_keg",
    states: permitted("taproom, warehouse or admin required").concat([["empty", "tap becomes empty"], ["beer remaining", "closing fill is a coarse observation only"], ["already closed", "safe closer and time shown; reload before acting", 1], ["unknown response", "retry the frozen request unchanged", 1]]),
    spec: "Kick is separate from Swap because it leaves the tap empty and needs a closing reason.",
    body: (<>
      {E.ttl("Kick tap 5")}
      {E.fld("Coming off", "Helles · ½ bbl · on since Wed")}
      {E.pick("Reason", "Kicked empty", ["Kicked empty", "Flavor change", "Quality hold"])}
      {E.ttl("Remaining")}
      {E.chips(FILL_CHIPS, 0)}
      {E.info("Remaining is a rough observation. Closing this interval does not change finished-goods inventory.")}
      {E.btn("Kick keg", "del")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "Beer",
    surface: "sheet",
    name: "Swap keg",
    to: { "Swap · one record": "Tap board", Reload: "Tap board" },
    job: "Close one keg and open the next in a single record",
    reads: "list_open_taps · list_tap_history · list_skus",
    writes: "swap_keg",
    states: permitted("taproom, warehouse or admin required").concat([["same own SKU", "the follow keg is the default · one atomic record"], ["guest keg", "explicit label and positive nominal BBL"], ["already swapped", "safe closer and time shown · nothing opens", 1], ["no number", "left blank · the keg sorts last on the board"], ["close fill", "three chips · never a typed number", 1], ["unknown response", "retry the frozen request unchanged", 1]]),
    spec: <>Swap is one atomic act: it closes the selected interval and opens the replacement, so a half-finished swap is not a state. The default reuses only an outgoing own SKU; a guest replacement always needs an explicit label and positive nominal BBL. The server freezes own nominal volume and decides inventory exclusion. Tap number stays optional and nonunique. Opening and closing chips are coarse observations and never ledger quantities. An already-closed conflict names the safe closer and time from recent history. An uncertain response freezes the payload and request ID for exact retry.</>,
    body: (<>
      {E.row("Already swapped", "Helles was swapped out at 7:42pm by Ali", E.act("Reload"), "w")}
      {E.ttl("Coming off")}
      {E.fld("Tap 5", "Helles · ½ bbl · on since Wed")}
      {E.chips(FILL_CHIPS, 0)}
      {E.ttl("Going on")}
      {E.pick("Packaged keg SKU", "Helles · ½ bbl", ["Helles · ½ bbl", "Pils · ½ bbl"])}
      {E.pick("Identity", "Same own SKU", ["Same own SKU", "Own keg", "Guest keg"])}
      {E.fld("Guest keg label", "required for a guest")}
      {E.fld("Guest nominal BBL", "positive number")}
      {E.fld("Tap number", "5 · optional")}
      {E.info("Remaining is a rough observation. The atomic swap does not change finished-goods inventory.")}
      {E.btn("Swap · one record", "irr")}
      {E.note("The swap is one record. A half-finished swap is not a state this can reach.")}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Routes",
    to: { Assign: "Route", "Add to route": "Route" },
    job: "See planned and active delivery routes and build the next one",
    reads: "list_routes",
    writes: "none [route planning happens on Route]",
    states: [["unassigned", "shipped orders and picked transfers waiting for a route are called out"], ["empty", "no routes yet: New route is the only action"]],
    spec: "Work › Deliveries. Every route not yet returned names its next action; New route opens Route in builder mode, and Route returns here. A stop is a shipped order or a picked stock transfer.",
    body: (<>
      {E.hd("Work", "driver default", E.btn("New route"))}
      {E.tabs(WORK_CHIPS, 6, "w-full", WORK_TABS)}
      {E.row("Route A · 2026-09-10", "departed · 1 of 3 delivered", E.act("Resume", "info"))}
      {E.row("Route B · 2026-09-11", "2 stops · driver not assigned", E.act("Assign", "attention"), "w")}
      {E.row("ORD-0236 · Ridgeline · Dock", "shipped · no route", E.act("Add to route", "attention"), "w")}
      {E.row("TRF-0004 · Storage", "shipped · no route", E.act("Add to route", "attention"), "w")}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Route",
    job: "Build route, inspect derived load and finish route timestamps",
    reads: "list_routes",
    writes: "save_route · depart_route",
    states: [["permission", "warehouse membership; Depart needs the assigned driver or an admin", 1], ["departed", "the builder closes; Driver route and Return route take over"]],
    spec: "Planned state: Depart is the one primary; Save route plan is outline. Return lives on Return route once the route has departed. The stops are a checklist of this route's documents plus every shipped order and picked transfer on no route, each checked one with its stop number; driver, vehicle and stop order save in the same route-save RPC, and a delivered stop cannot be unchecked. There is no loaded status or mark-loaded command. A refused delivery has no screen: leave the stop open and assign it to a later route. A driver shows by the first characters of their id until staff have names.",
    body: (<>
      {E.back("Routes", "Route A · 2026-09-10")}
      {E.edit("Delivery date", "2026-09-10", "date")}
      {E.pick("Driver", "driver 7f3a21c0 · warehouse", ["driver 7f3a21c0 · warehouse", "driver 2b9e44d1 · admin"])}
      {E.edit("Vehicle", "Box truck 2")}
      {E.edit("Route name", "Route A")}
      {E.ttl("Stops")}
      {E.row("ORD-0231 · Ridgeline · Tap Room", "stop 1", "1")}
      {E.row("ORD-0233 · Al’s Bar · Dock", "stop 2", "2")}
      {E.row("TRF-0004 · Storage", "stop 3", "3")}
      {E.row("ORD-0236 · Teresa’s · Dock", "shipped · no route", "", "w")}
      {E.btns([["Save route plan", "g"], ["Depart route", "p"]])}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Return route",
    to: { "Return route": "Routes" },
    job: "Stamp the return once every stop is done",
    reads: "list_routes",
    writes: "return_route",
    states: [["permission", "the assigned driver or an admin", 1], ["planned", "Depart lives on Route"], ["departed", "Return is the one verb, enabled once every stop is delivered"], ["complete", "already returned: the return time replaces the button"]],
    spec: "The departed state of a route once every stop is delivered. Planned routes Depart on Route; this screen is only Return.",
    body: (<>
      {E.back("Routes", "Route A · 2026-09-10")}
      {E.fld("Driver · vehicle", "driver 7f3a21c0 · Box truck 2")}
      {E.fld("Departed", "8:10 AM")}
      {E.row("Stop 1 · ORD-0231 · Ridgeline · Tap Room", "delivered 8:42 AM", "done", "ok")}
      {E.row("Stop 2 · ORD-0233 · Al’s Bar · Dock", "delivered 9:15 AM", "done", "ok")}
      {E.row("Stop 3 · TRF-0004 · Storage", "delivered 10:03 AM", "done", "ok")}
      {E.sp()}
      {E.btn("Return route")}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Driver route",
    to: { Resume: "Confirm delivery" },
    job: "The route as the driver sees it: every stop, the load, Return",
    reads: "list_routes",
    writes: "return_route",
    states: [["permission", "the assigned driver or an admin", 1], ["departed", "Return is the one verb, disabled while a stop is open"], ["next stop", "Resume opens Confirm delivery"]],
    spec: "The departed route as the driver runs it, reached from Deliveries (Resume) or the stop's Back. Route is for building; this is for running. Only the lowest undelivered stop is next; Today shows the same stop.",
    body: (<>
      {E.back("Routes", "Route A · 2026-09-10")}
      {E.fld("Driver · vehicle", "driver 7f3a21c0 · Box truck 2")}
      {E.fld("Departed", "8:10 AM")}
      {E.row("Stop 1 · ORD-0231 · Ridgeline · Tap Room", "next", E.act("Resume", "info"), "w")}
      {E.row("Stop 2 · ORD-0233 · Al’s Bar · Dock", "later")}
      {E.row("Stop 3 · TRF-0004 · Storage", "later")}
      {E.sp()}
      {E.btn("Return route")}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Confirm delivery",
    job: "Name receiving contact, then commit delivery and invoice",
    reads: "get_delivery_stop",
    writes: "confirm_delivery [one RPC: delivered_at + signed_by + invoice only when persisted mode is on-delivery; never ships]",
    states: [["offline", "keep stop open; commit waits", 1], ["response lost", "same requestId returns result"], ["permission", "warehouse membership and being the route’s assigned driver, or admin", 1], ["success", "INV number after commit"], ["transfer stop", "destination and picked lines instead of a customer; stamped, never invoiced; Receive on the transfer moves the stock"]],
    spec: "2 taps: receiving-contact chip from the ship-to → Delivered. Back goes to Driver route. The receiving name is stored as text; the UI never implies a signature image is retained.",
    body: (<>
      {E.back("Driver route", "Route A · Stop 1 of 3")}
      {E.ttl("Ridgeline Tap Room")}
      {E.fld("Invoice timing", "On delivery · saved")}
      {E.row("Hazy IPA · ½ bbl keg", "", "4")}
      {E.row("Pils · 16 oz case", "", "6")}
      {E.edit("Received by", "", "text", ["Dana", "Chris"])}
      {E.sp()}
      {E.btn("Delivered", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 8,
    group: "Desk",
    name: "Planning",
    to: { "Hazy ATP negative 9/9": "Pars and allocation", "Draft 1 purchase order": "New PO", "Lindenmeyr Munroe": "Vendor", "Blue Label": "Vendor" },
    job: "See demand gaps and draft one purchase order per vendor, without priority state",
    reads: "get_planning_shortfalls [view; demand, supply and gap by week; supply must net open purchase orders] · get_material_requirements · list_vendors_and_contracts",
    writes: "draft_purchase_order_from_requirements [one RPC: one draft PO per resolved vendor + lines; the buy-by date is needed-by less the vendor's lead time]",
    states: [["gap", "demand exceeds supply in that week · the only actionable row"], ["covered", "supply meets demand · shown so the horizon reads continuously"], ["one vendor", "the whole shortfall resolves to a single supplier · the verb is singular"], ["several vendors", "a bill of materials spans suppliers · one draft each, named before the verb commits"], ["partly unbuyable", "the slowest supplier is already past its buy-by date · its lines are drawn out of reach, the rest still draft", 1], ["no vendor", "no contract and no default supplier on the material · the row cannot draft", 1], ["empty", "nothing planned and nothing ordered"]],
    spec: "The three columns are defined so the gap is arithmetic rather than judgement. Demand is confirmed and submitted order lines by requested ship week, plus taproom pars; supply is on-hand availability plus the planned outputs of packaging runs already scheduled into that week, less anything already on an open purchase order. That last term is what stops a gap being ordered twice, and it is the mirror of the rule that an unreceived order never inflates what a packaging run believes it has. The horizon runs as far ahead as the slowest supplier behind the shortfall can still be acted on: a gap nobody can still buy for is a report, not a plan. A shortfall is summed per material first and resolved to a supplier second, so a material whose supplier changes mid-horizon does not fragment into two half-orders. Resolution is the active contract for that material, then the material’s default supplier, and otherwise the row cannot draft. Because an order carries one supplier, one shortfall becomes one draft per supplier, and the verb says how many before it commits. Quantities are the gap rounded up to the purchase unit, since nobody buys part of a bag. Lead time belongs to the supplier, not the material, so the buy-by date is the slowest of the suppliers a bill of materials resolves to: cans at three days stay orderable on a run whose labels at seven days no longer are. Nothing here ranks or prioritises, in keeping with Pars and allocation: every change stays a named quantity.",
    body: (<>
      {E.back("More", "Planning")}
      {E.tbl(["week", "demand", "supply", "gap"], [["9/7", "48 bbl", "40 bbl", <><span className="text-warning-foreground">−8</span></>], ["9/14", "52 bbl", "60 bbl", "+8"]])}
      {E.row("Sept 12 packaging", "short 480 ends · buy by 9/5", E.act("Review"), "w")}
      {E.row("Hazy ATP negative 9/9", "open named shortfall", E.act("Review"))}
      {E.ttl("Drafts this creates")}
      {E.row("Lindenmeyr Munroe", "cans, ends, quadpacks, trays · 3 day lead", "4 lines")}
      {E.row("Blue Label", "labels · 7 day lead · past the buy-by date", "out of reach", "w")}
      {E.info("Labels can no longer arrive for the 9/7 week, so that line is left out. The four Lindenmeyr lines still draft.")}
      {E.btn("Draft 1 purchase order")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Chat disconnected",
    job: "Explain the projection before an admin installs a provider",
    reads: "get_chat_integration_health",
    writes: "begin_chat_installation [admin-only, single-use OAuth intent]",
    states: [["permission", "admin only", 1], ["OAuth cancelled", "remain disconnected · try again", 1]],
    spec: "This is production Settings UI, not a developer demo. Preview surfaces remain available while disconnected and use non-sensitive fixtures.",
    body: (<>
      {E.back("Settings", "Chat")}
      {E.ttl("Chat notifications")}
      {E.info("Bring today’s assigned, due and overdue work into chat. Slack shows the work; MGR stays the record.")}
      {E.row("Slack", "Not connected", "", "", SlackMark)}
      {E.nav("Preview surfaces", "App Home · personal DM · team digest")}
      {E.btn("Connect Slack")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Chat settings",
    to: { Disconnect: "Disconnect Slack" , "Open": "Chat settings" },
    job: "Operate one brewery/provider installation and inspect every outbound surface",
    reads: "get_chat_integration_health · get_notification_preferences · get_brewery_operating_defaults · [presentation: ten provider-free fixtures]",
    writes: "set_notification_destination · set_brewery_quiet_hours · set_brewery_operating_defaults · disable_chat_installation · disconnect_chat_installation",
    states: [["permission", "admin only", 1], ["healthy", "last callback and delivery shown"], ["retrying", "queue count + redacted reason", 1], ["disabled", "no sends; previews still work", 1]],
    spec: "Preview picker renders the same provider-neutral fixtures consumed by renderer contract tests. It never queries live customer data or sends a message. Reading cadence is MGR-owned and controls both Today and chat.",
    body: (<>
      {E.back("Settings", "Chat")}
      {E.row("Slack · Demo Brewing", "Connected · scopes healthy", E.act("Disconnect", "destructive"), "ok", SlackMark)}
      {E.pick("Operations channel", "#mgr-operations · private", ["#mgr-operations · private"])}
      {E.window("Quiet hours", "21:00", "06:00")}
      {E.fld("Reading overdue after", `${OVERDUE_HOURS} h · set on Settings`)}
      {E.nav("Health", "last message from Slack today · 8:42 AM")}
      {E.nav("Linked people", "3 linked")}
      <div>
        {E.tabs(["App Home", "Personal DM", "Team digest", "Preferences"])}
        {[["App Home", "4 current work reasons"], ["Personal DM", "Your assigned and overdue work"], ["Team digest", "Shared brewery work summary"], ["Preferences", "Delivery cadence and quiet hours"]].map(([name, detail], i) => (
          <div key={name} data-preview hidden={i !== 0}>{E.row(`Preview · ${name}`, `${detail} · fixture data`)}</div>
        ))}
      </div>
      {E.row("Delivery enabled", "turn off all Slack sends", E.sw(true, "Slack delivery"), "ok")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Linked people",
    job: "See which MGR users linked Slack and remove a stale link",
    reads: "list_chat_user_links",
    writes: "unlink_chat_user",
    states: [["permission", "admin only", 1], ["linked", "three people"], ["unlinked", "personal messages stop for that person", 1]],
    spec: "A brewery admin can remove a stale identity link without disconnecting Slack for everyone.",
    body: (<>
      {E.back("Chat", "Linked people")}
      {E.row("Avery Stone", "Admin · linked 8/29/2026", E.act("Unlink", "destructive"))}
      {E.row("Casey Lin", "Brewer · linked 8/30/2026", E.act("Unlink", "destructive"))}
      {E.row("Morgan Reed", "Driver · linked 9/02/2026", E.act("Unlink", "destructive"))}
      {E.btn("Link your Slack", "g")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    surface: "entry",
    name: "Link your Slack",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    job: "Link the signed-in Slack identity to the signed-in MGR user",
    reads: "get_chat_link_intent",
    writes: "consume_chat_link_proof [single-use]",
    states: [["ready", "both identities named"], ["expired", "return to MGR and request a new link", 1]],
    spec: "The entry page names both identities and the brewery before consuming the single-use proof.",
    body: (<>
      {E.ttl("Link your Slack")}
      {E.info("Slack user Avery Stone will be linked to Avery Stone in Demo Brewing.")}
      {E.note("This enables personal reminders and App Home. It does not change your MGR permissions.")}
      {E.btn("Link accounts", "irr")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    surface: "sheet",
    name: "Disconnect Slack",
    to: { "Disconnect Slack": "Chat disconnected" },
    job: "Confirm the external effects of disconnecting Slack",
    reads: "get_chat_integration_health",
    writes: "disconnect_chat_installation",
    states: [["permission", "admin only", 1], ["confirmed", "installation and identity links removed"]],
    spec: "The confirmation distinguishes stopped delivery from MGR work that remains.",
    body: (<>
      {E.note("Stops: App Home, personal reminders, team digests and Slack actions.")}
      {E.info("Stays: MGR work, assignments, notification preferences and history.")}
      {E.btn("Disconnect Slack", "del")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Reauthorization",
    job: "Fail closed while keeping recovery understandable and personal delivery isolated",
    reads: "get_chat_integration_health",
    writes: "begin_chat_reauthorization · disable_chat_installation · disconnect_chat_installation",
    states: [["permission", "admin only", 1], ["token revoked", "all provider sends stop", 1], ["channel externalized", "team digest stops; eligible personal sends continue", 1], ["uninstalled", "links and queued actions invalidated", 1]],
    spec: "Provider errors remain redacted. Emergency disable does not depend on Slack being reachable.",
    body: (<>
      {E.back("Chat", "Health")}
      {E.note("Slack authorization expired. No messages are being sent.")}
      {E.row("Last message from Slack", "Today · 8:42 AM", E.status("Succeeded", "ok"))}
      {E.row("Last delivery", "Today · 8:43 AM", E.status("Succeeded", "ok"))}
      {E.row("Queued", "3 deliveries", E.status("Paused", "w"), "w")}
      {E.btns([["Reauthorize Slack", "p"], ["Disable integration", "g"]])}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Point of sale",
    to: { Review: "Square → QuickBooks connector", Disconnect: "Disconnect Square" },
    job: "Connect one POS provider and see both directions at a glance",
    reads: "get_pos_integration_health [design; provider-neutral]",
    writes: "begin_pos_installation · disable_pos_installation · disconnect_pos_installation [design; admin-only]",
    states: [["permission", "admin only", 1], ["no provider", "connect one before a menu can publish"], ["healthy", "catalog and sales both current"], ["sales lagging", "the menu still publishes", 1], ["token revoked", "publishing and sync both stop", 1], ["connector detected", "Square already posts taproom revenue to QuickBooks", 1], ["second location", "its own MGR location and its own channel", 1], ["unmapped location", "its sales cannot reconcile until it is mapped", 1]],
    spec: "Provider-neutral by construction, mirroring the chat integration that already solved this: portable contracts, one adapter per provider, and a conformance test every adapter must pass (see the chat contracts module and its adapter conformance test). Square is the only adapter today and the only value this screen can offer; nothing in the copy, the commands or the schema names it. The integration tokens table already records which provider each token belongs to (QuickBooks or Square), so the seam exists below this screen. DISCOVERED from a live Square library: a taproom may already run Square’s own QuickBooks connector, which posts taproom sales into QuickBooks as Sales receipts without MGR. That is a different revenue stream from the wholesale invoices MGR pushes, so today it does not double-count, but only by luck, and a brewery running both without knowing is the failure mode. This screen detects it and says so rather than letting the accountant find two sources of taproom revenue at month end.",
    body: (<>
      {E.back("Settings", "Point of sale")}
      {E.info("Publish what the taproom can sell, and read its sales back. One provider is connected at a time.")}
      {E.row("Square · Demo Brewing LLC", "catalog published · sales syncing", E.act("Disconnect", "destructive"), "ok", SquareMark)}
      {E.row(<>Square {E.arrow()} QuickBooks connector</>, "detected · Square posts taproom sales to QuickBooks Online itself", E.act("Review"), "w", SquareMark)}
      {E.nav("Square locations", "2 mapped · 1 needs mapping")}
      {E.fld("Last sales sync", "Today · 6:58 PM")}
      {E.nav("Menu", "one catalog · Square, the website, per-location price")}
      {E.btn("Disable", "g")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Connect Square",
    to: { "Connect Square": "Square locations" },
    job: "Authorize one Square seller and explain the data exchange before OAuth",
    reads: "none [OAuth returns the selected seller]",
    writes: "begin_pos_installation [design]",
    states: [["permission", "admin only", 1], ["cancelled", "return to Point of sale unchanged"], ["connected", "continue to Square locations"]],
    spec: "The page explains both catalog writes and sales reads before leaving MGR.",
    body: (<>
      {E.back("Settings", "Connect Square")}
      {E.info("MGR publishes catalog items and availability to Square. It reads completed sales to deplete taproom stock.")}
      {E.note("Connecting does not publish a menu or import old sales.")}
      {E.btn("Connect Square", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "Square locations",
    to: { "Save mappings": "Point of sale" },
    job: "Map each Square location to one MGR location and sales channel",
    reads: "list_pos_locations · list_locations · list_sale_channels [design]",
    writes: "set_pos_location_mapping [design]",
    states: [["permission", "admin only", 1], ["mapped", "two locations ready"], ["unmapped", "sales cannot reconcile", 1], ["claimed", "an MGR location cannot be claimed twice", 1]],
    spec: "Each provider location needs both owners before its sales can change inventory.",
    body: (<>
      {E.ttl("Taproom")}
      {E.pick("MGR location", "Taproom", ["Taproom", "Warehouse", "Select location"])}
      {E.pick("Sales channel", "Taproom", [...CHANNELS, "Select channel"])}
      {E.ttl("Warehouse")}
      {E.pick("MGR location", "Warehouse", ["Taproom", "Warehouse", "Select location"])}
      {E.pick("Sales channel", "DTC", [...CHANNELS, "Select channel"])}
      {E.ttl("Third location · needs mapping")}
      {E.pick("MGR location", "Select location", ["Taproom", "Warehouse", "Select location"])}
      {E.pick("Sales channel", "Select channel", [...CHANNELS, "Select channel"])}
      {E.btn("Save mappings")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "Square → QuickBooks connector",
    job: "Acknowledge that Square already posts taproom revenue to QuickBooks",
    reads: "get_pos_integration_health [design]",
    writes: "acknowledge_pos_accounting_connector [design; no external write]",
    states: [["permission", "admin only", 1], ["detected", "acknowledgement required", 1], ["acknowledged", "health warning dismissed"]],
    spec: "Acknowledging records awareness only. MGR does not configure or disable Square's connector.",
    body: (<>
      {E.note("Square already posts taproom sales to QuickBooks Online as sales receipts.")}
      {E.info("MGR pushes wholesale invoices only. Confirm with your accountant that the two revenue streams stay separate.")}
      {E.btn("Understood", "g")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "Disconnect Square",
    to: { "Disconnect Square": "Connect Square" },
    job: "Confirm the external effects of disconnecting Square",
    reads: "get_pos_integration_health [design]",
    writes: "disconnect_pos_installation [design]",
    states: [["permission", "admin only", 1], ["confirmed", "installation disabled and token purged"]],
    spec: "The confirmation names what stops and what remains so reconnecting can reuse mappings.",
    body: (<>
      {E.note("Stops: menu publishing, availability updates and sales sync.")}
      {E.info("Stays: MGR stock, location mappings, sales history and published item ids.")}
      {E.btn("Disconnect Square", "del")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Menu",
    to: { Taproom: "Menu", Warehouse: "Menu", "Stout · pint": "POS item", "Guest cider \u00b7 pint": "POS mapping", Pretzel: "POS mapping" },
    job: "One catalog, published to every destination that sells from it",
    reads: "get_pos_menu [design; derived from brands × formats × taproom stock]",
    writes: "publish_pos_menu [design; upsert by MGR key, provider-neutral] · set_pos_price_override [design; nullable, per pos_location]",
    states: [["permission", "warehouse or admin required", 1], ["derived", "every row is a brand, a format and stock on hand"], ["override", "one row priced away from its format default", 1], ["no price anywhere", "no format default and no override: that row cannot publish", 1], ["out of stock", "row retires itself; price and provider id are kept"], ["provider rejected", "the row keeps its edit; nothing half-published", 1], ["second location", "same catalog, scoped · its own price and stock", 1], ["present at one only", "the other location never sees the row", 1], ["one destination", "a row can publish to Square and not the website", 1], ["website beer unmapped", "adopted by matching it to a brand once", 1]],
    redrawn: true,
    spec: <>This was an authoring surface and is now a read-out. Brand, format and availability are all derived (brand from what is in the bin, formats from the brand, availability from taproom stock), so publishing is zero-touch and a new brand reaches the register the moment stock lands. Retail resolves as the location’s own price override, falling back to the format’s default retail price, which is why the table shows the inherited number and names its Source: an exception has to be legible, or a stale price from last summer becomes silently authoritative. The override column stays empty unless someone sets it, so a format-wide price change actually propagates; writing the default into every row on publish would freeze each one at its first price, which is the failure mode this drawing exists to prevent. Publish changes survives because MGR still owns when the provider copy is refreshed. Location is a scope rather than a column: Square publishes one item with per-location presence on the variation, so MGR maintains one catalog and varies where each row appears; two parallel menus would fight that model and double every retire. Everything under the switcher is read for one location: stock, availability, and the price override that is keyed by POS location. A column would only serve a cross-location comparison nobody performs, while every action here is taken against one register. Renamed from POS menu: the register is no longer the only destination. The website is the third consumer of this catalog after Square and QuickBooks, not an integration of its own: a bespoke web feed would produce a third answer to what are we selling right now, and would leak unannounced beer, which is the same ownership boundary the Square item library taught. So the website is a read client keeping no copy, and the sync logic it runs today exists only because it keeps one. Its existing beers are adopted exactly as pre-integration Square items are: matched to a brand once, then maintained from here, so nothing vanishes from a public page the day MGR connects. Transport is deliberately not drawn: a menu changes a handful of times a day, so a cached read of the published rows is as fresh as a socket per visitor without opening an anonymous realtime path. Destination-native rows sit <i>below</i> that button rather than in the table: position is what says they are outside the publishable set, which no label reliably does. They appear at all because an unmapped taproom item is the reason a sale fails to reconcile, and Map is the only action MGR ever offers against a row it does not own.</>,
    body: (<>
      {E.back("More", "Menu")}
      {E.tabs(["Taproom", "Warehouse"])}
      {E.info("One catalog, scoped to a location. Price and availability are read for the location above.")}
      <div className="min-w-0 overflow-x-auto">{E.tbl(["Brand · format", "Retail", "Source", "Publishes to"], [[E.link("Hazy IPA · pint", "POS item"), "$7.00", "format", "Square · Website"], [E.link("Hazy IPA · crowler", "POS item"), "$9.00", "format", "Square"], [E.link("Pils · pint", "POS item"), "$6.50", "override", "Square · Website"], [E.link("Pils · crowler", "POS item"), "$12.00", "format", "Square"]])}</div>
      {E.row("Stout · pint", "no taproom stock · off the register", E.status("Retired", "w"), "w")}
      {E.info("Pils · pint is the only override: $6.50 against a format default of $7.00. Every other row follows its format.")}
      {E.btn("Publish changes")}
      {E.ttl("Also on these destinations")}
      {E.info("Created in Square or on the website, not by MGR. MGR never renames, prices or retires these; it maps them so their sales reconcile.")}
      {E.row("Guest cider · pint", "not mapped · its sales cannot reconcile", E.act("Map"), "w")}
      {E.row("Pretzel", "not mapped · no MGR stock behind it", E.act("Map"))}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "POS item",
    to: { "Save override": "Menu" },
    job: "Override one price; everything else is inherited from the format",
    reads: "get_pos_menu_item [design]",
    writes: "set_pos_price_override [design; nullable override keyed by pos_location] · clear_pos_price_override [design]",
    states: [["permission", "warehouse or admin required", 1], ["inherited", "no override · the format price is what publishes"], ["overridden", "this row is priced away from the default", 1], ["reset", "override cleared · the row rejoins the format price"], ["no price at all", "no format default and no override · Save stays disabled", 1], ["per location", "a second taproom overrides the same row separately", 1], ["format changed", "conversion and premise follow the format, not this sheet"], ["tax preserved", "publishing never clears the provider’s tax assignment", 1]],
    redrawn: true,
    spec: "Against the brand and format schema, Serving and Premise are no longer authored here. A format owns its conversion (a pint is 1/124 of a ½ bbl) and its premise, so this sheet reads them instead of asking again. What is left is a register price, not a wholesale grid cell: an optional override keyed by POS location, so an empty field lets a format-wide Taproom cell propagate and the Warehouse register can ring a different number than the Taproom without either row copying a wholesale price. Availability stays a rule, not a per-keg switch: MGR retires the row when taproom stock runs out and re-publishes under the same provider id when it returns. Price still lands on the variation rather than the item, so an override writes to the format’s variation id.",
    body: (<>
      {E.fld("Brand", "Hazy IPA")}
      {E.fld("Format", "pint · poured")}
      {E.fld("Pours from", "½ bbl keg · Taproom")}
      {E.fld("Serving", "1/124 of a ½ bbl · 16 oz · from the format")}
      {E.fld("Premise", "On-premise · from the format")}
      {E.fld("Tax", "On-premise rate · held by the provider")}
      {E.fld("Format price", "$7.00")}
      {E.edit("Price override", "$6.50")}
      {E.btn("Reset to format price", "g")}
      {E.row("Sell while taproom stock remains", "retires itself when it runs out", E.sw(true, "Sell while taproom stock remains"))}
      {E.info("Leave the override empty and this row follows the format. A price set here applies to this location only.")}
      {E.btn("Save override")}
    </>),
  },
  // Revision 2 (schema §16, designed 2026-09-02). Most commits here are still
  // drawn gated — the frames exist so the interface can settle before the
  // one-pass migration, per §16's own build order — and each names its gate in
  // `writes`, which is where every other gate in this file is found. §16.3
  // (sale channels) has shipped: its two frames below are ungated and live at
  // /settings/channels.
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Sale channels",
    to: { Taproom: "Channel", Wholesale: "Channel", DTC: "Channel", Export: "Channel", "Add channel": "Channel" },
    job: "Name the channels this brewery sells through and what each one is taxed as",
    reads: "list_sale_channels",
    writes: "upsert_sale_channel · delete_sale_channel",
    states: [["permission", "admin required", 1], ["in use", "delete refused by on delete restrict · human copy, not a 23503", 1], ["seeded", "four defaults arrive with the brewery"], ["inherit", "a customer with no override takes the channel default"]],
    spec: "The channel carries a name and a default tax treatment and nothing else: removal classification stays on the movement type, which is why #42 rejected giving the channel a removal flag or a required-destination-state flag. Resolution order is customer override → channel default, and the resolved value is frozen onto the movement at write time so editing a customer in March never restates January.",
    body: <SaleChannelsView model={toSaleChannelsViewProps(saleChannelsList)} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Channel",
    to: { "Save channel": "Sale channels" },
    job: "Create or edit one sale channel and its default tax treatment",
    reads: "list_sale_channels",
    writes: "upsert_sale_channel · delete_sale_channel",
    states: [["permission", "admin required", 1], ["new", "name and tax treatment required"], ["in use", "delete is refused", 1]],
    body: <ChannelView model={toChannelViewProps(channelExport)} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Units",
    job: "Choose the unit gravity is shown and typed in, for the brewery and for yourself",
    reads: "get_gravity_unit",
    writes: "set_brewery_gravity_unit · set_my_gravity_unit",
    states: [["brewery default", "admins only see and set this row", 1], ["personal override", "any staff role sets their own"], ["inherit", "“Use brewery default” clears the override"]],
    spec: "Gravity is stored in °Plato everywhere and that never changes: this screen changes only what is printed and how a typed value is read back, so an existing reading cannot move. Two controls over one value because the two audiences differ. An admin sets what the brewery reads by default, and any brewer may override it for themselves without asking anyone. A membership with no unit of its own follows the brewery, which is why the personal control offers a third option rather than an empty one. SG input accepts both spellings a brewer uses, 1.050 and 1050.",
    body: <UnitsView model={toUnitsViewProps(unitsPlato)} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Formats",
    job: "Enter volume once on an atomic format and derive every shape above it",
    reads: "list_formats · get_format_composition",
    writes: "upsert_format · replace_format_components [one RPC replaces the child set] · replace_format_bom [one RPC replaces the bill; formats, format_components and format_bom superseded skus.bbl_per_unit and sku_bom]",
    states: [["permission", "sales or admin required", 1], ["atomic", "owns one volume entered in an allowed unit"], ["children missing", "a composed format cannot be created before its children", 1], ["poured", "brand-owned name and positive ounces · never holds stock"], ["in use", "editing a format never moves frozen movement bbl"]],
    spec: "Volume is the basis of all TTB math, so exactly one atomic Format owns it. The input receives its allowed units per instance: US beer packages offer oz, gal and bbl; metric formats may offer mL and L. The server converts the entry to canonical bbl. Composed formats compute volume from their children, which is also what makes repack (§16.10) validated rather than asserted. Poured formats belong to a brand with a name and positive ounces; they have no package facts, components or BOM. Create and edit them under the brand in Catalog. Packaged names are unique per brewery; poured names per brand. Each BOM line's on-break disposition is what the repack sheet reads.",
    body: <FormatsView model={toFormatsViewProps(formatsInventory)} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Format",
    to: { "Save format": "Formats" },
    job: "Create or edit one atomic or composed package format",
    reads: "list_formats · get_format_composition",
    writes: "upsert_format · replace_format_components · replace_format_bom",
    states: [["permission", "sales or admin required", 1], ["atomic", "volume unit choices are set by this input"], ["composed", "volume derives from child formats"]],
    body: <FormatView model={toFormatViewProps(formatCan)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Water profiles", gatedBy: "water profiles",
    to: { Edit: "Water profile", "Add profile": "Water profile", "Municipal · Denver": "Water profile", Burton: "Water profile", "Hazy target": "Water profile" },
    job: "Keep the water a brewery starts from and the waters it aims at",
    reads: "list_water_profiles [design]",
    writes: "none [creation and editing happen on Water profile]",
    states: [["permission", "brewer or admin required", 1], ["source", "the brewery’s own supply · set once in Settings"], ["empty", "no profiles yet: Add profile is the only action"]],
    spec: "A catalog entity beside Formats and price groups, because a profile is referenced by many recipes and edited in one place: a new water report is one edit, not fifty. No quick-create dialog, which v1 needed only because profiles were buried inside the recipe form; reached from Catalog, Add profile is already one tap away.",
    body: (<>
      {E.back("Catalog", "Water profiles", E.btn("Add profile"))}
      {E.row("Municipal · Denver", "Calcium 42 · Magnesium 8 · Sodium 22 · Sulfate 65 · Chloride 30 · Bicarbonate 110", E.act("Edit"))}
      {E.row("Burton", "Calcium 275 · Magnesium 40 · Sodium 25 · Sulfate 610 · Chloride 35 · Bicarbonate 270", E.act("Edit"))}
      {E.row("Hazy target", "Calcium 110 · Magnesium 10 · Sodium 15 · Sulfate 90 · Chloride 180 · Bicarbonate 40", E.act("Edit"))}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Water profile",
    to: { "Save profile": "Water profiles" },
    job: "Name a water and its six ions",
    reads: "get_water_profile [design]",
    writes: "upsert_water_profile [design; SCHEMA-GATE: a water profiles table]",
    states: [["permission", "brewer or admin required", 1], ["in use", "a profile a recipe references cannot be deleted", 1]],
    spec: "Six ions in parts per million, the set every brewing water calculation reads. No ion arithmetic here: this screen records a measurement or a target, and any delta between two profiles is a calculation this slice does not build.",
    body: (<>
      {E.edit("Profile name", "Hazy target")}
      {E.cols(
        E.edit("Calcium ppm", "110", "number"),
        E.edit("Magnesium ppm", "10", "number"),
      )}
      {E.cols(
        E.edit("Sodium ppm", "15", "number"),
        E.edit("Sulfate ppm", "90", "number"),
      )}
      {E.cols(
        E.edit("Chloride ppm", "180", "number"),
        E.edit("Bicarbonate ppm", "40", "number"),
      )}
      {E.btn("Save profile")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Price groups",
    to: { "1": "Price group", "2": "Price group", "3": "Price group" },
    job: "Price every beer from one grid: groups down, formats across, a table per sale channel",
    reads: "list_sale_channels · list_price_groups · list_formats · list_channel_prices",
    writes: "set_channel_price · clear_channel_price · upsert_price_group · delete_price_group",
    states: [["permission", "sales or admin required", 1], ["empty cell", "unpriced · an order for a SKU on that group and format is refused on that channel", 1], ["empty", "no price groups yet: Create price group is the only action"], ["in use", "a group a brand sits on, or a cell prices, cannot be removed", 1]],
    spec: "Reached from Catalog. The brewery's price sheet is one grid: rows are price groups, columns are formats, and each sale channel gets its own table. A beer sits on one group (Catalog → Brand → Price group) and a customer sits on one channel, so the price of any SKU for any customer is the single cell where the two meet. Nothing else prices anything: no per-customer list, no per-SKU exception (the barrel-aged one is simply a higher group), no brewery default. Tapping a cell edits that one price; clearing it makes those SKUs unpriced on that channel. A group's name opens Price group, where its position and cost ceiling live.",
    body: <PriceGroupsView model={toPriceGroupsViewProps(pricingGrid)} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Price group",
    to: { Remove: "Price groups", "Remove price group": "Price groups" },
    job: "Name one row of the price grid, place it, and give it an optional cost ceiling",
    reads: "list_price_groups",
    writes: "upsert_price_group · delete_price_group",
    states: [["permission", "sales or admin required", 1], ["no ceiling", "the group is chosen by hand · nothing is suggested"], ["suggested", "a cost inside the band proposes this group · a person confirms", 0], ["in use", "a brand sits on it or a cell prices it · Remove is refused", 1]],
    spec: "A price group is one row of the grid and holds no prices of its own: the prices are the cells on Price groups. What lives here is the row itself: its name, its position in the sheet, and the optional cost ceiling that sorts the rows and suggests a group for a beer whose cost lands in the band. Nobody is moved automatically, and costing does not exist yet, so nothing reads the ceiling today. Removal is refused while a brand sits on the group or any cell prices it, in product words rather than a foreign-key error.",
    body: <PriceGroupView model={toPriceGroupViewProps(priceGroupTwo)} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Location bins",
    to: { "Walk-in": "Bin", Cold: "Bin", Dry: "Bin", "Add bin": "Bin" },
    job: "Subdivide a location without making every query carry an or-null",
    reads: "list_locations · list_bins",
    writes: "create_bin · update_bin · delete_bin",
    states: [["permission", "warehouse or admin required", 1], ["last bin", "a location keeps at least one · rename it instead", 1], ["has history", "a bin that ever recorded stock is renamed, not removed", 1]],
    spec: "Opened from Location detail. Every location starts with Walk-in, Cold and Dry. Rename or remove what doesn’t match the building, but a location always keeps one bin, so no on-hand or availability query carries a nullable branch. Bins are physical subdivisions a menu can read; they are explicitly not tap lines (§16.8). Par on a bin waits on a later schema change.",
    body: <LocationBinsView model={toLocationBinsViewProps(locationBinsTaproom)} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Bin",
    to: { "Save bin": "Location bins" },
    job: "Create or edit one physical subdivision of a location",
    reads: "list_bins",
    writes: "create_bin · update_bin · delete_bin",
    states: [["permission", "warehouse or admin required", 1], ["last bin", "rename it instead of removing it", 1], ["has history", "a bin that ever recorded stock is renamed, not removed", 1], ["empty", "safe to remove"]],
    body: <BinView model={toBinViewProps(binCold)} />,
  },
  {
    step: 8,
    slice: 1,
    group: "Global",
    surface: "sheet",
    name: "Repack",
    to: { "Record repack": "SKU detail" },
    job: "Break bulk as a paired, bbl-conserving pair of legs, never a loss and a gain",
    reads: "get_format_components [design; §16.2a] · get_material_on_hand",
    writes: "record_repack [SCHEMA-GATE: revision 2 §16.10: repack movement type, shared ref, abs(sum(bbl)) < 0.000001 over the ref]",
    states: [["offered", "composition knows a case yields six four-packs · nobody types both halves"], ["breakage", "−1 case · +5 four-packs · +1 loss keeps the invariant absolute", 1], ["materials", "case tray returns to stock, PakTech is consumed · per-repack override"]],
    spec: "An adjustment cannot express a break: it has no way to pair the two halves, so the break reads as an unexplained loss beside an unexplained gain. The outbound leg's bbl is derived from the inbound leg's frozen total rather than recomputed from barrels per unit (rounding each leg independently leaves −0.00000001 on a 24×16oz case), and the constraint carries a tolerance to catch a hand-entered repack without rejecting a legitimate one. Build-direction repack is out of scope; the whole repack is one RPC sharing one ref so beer and materials cannot disagree.",
    body: (<>
      {E.fld("Break", "Hazy IPA · case · 24×16oz")}
      {E.fld("Location · bin", "Warehouse · Walk-in")}
      {E.qty("1", "case")}
      {E.tape([["−1 case · repack", formatVolume("0.09677419")], ["+6 four-pack · repack", "derived from the case total"], ["Case tray ×1", "return to stock"], ["PakTech ×6", "consumed"]])}
      {E.info(`Preview: conserves ${formatVolume("0.09677419")} · same location and bin · not a TTB removal`)}
      {E.fld("Damaged on break", "0 four-pack · records as loss")}
      {E.pin(<>
        {E.gated("Record repack", "isn’t available yet: breaking a case has nowhere correct to land")}
      </>)}
    </>),
  },
  // ---- The external venues. Not MGR screens: what QuickBooks, Square and Slack
  // show when MGR writes into them, drawn in each product's own design language
  // (components/mgr/venue.tsx) so an integration contract stays legible. Ported
  // from the wireframes file, which is now retired for these too.

  // QuickBooks — what MGR's push produces, rendered by Intuit. Slice 1, step 5.
  {
    step: 5, slice: 1, venue: { name: "QuickBooks Online", title: `Invoice ${INV.no}`, actions: "Edit invoice" },
    name: "Pushed invoice",
    job: "What the accountant opens after one shipment invoices, and the two steps the push does not perform",
    reads: "none [QuickBooks renders; MGR wrote it]",
    writes: "push_invoice [design; requestid, online-only, AllowOnlineACHPayment + AllowOnlineCreditCardPayment]",
    states: [["not sent", "created by MGR; QuickBooks has emailed nobody", 1], ["accepted", "the QuickBooks invoice id is stored on the MGR invoice"], ["rejected", "the QuickBooks sync error is shown in MGR; nothing created here", 1], ["response lost", "the same requestid returns the first invoice, never a second"], ["tax intent missing", "AST does not engage and the invoice books at 0.00 tax", 1], ["no customer email", "push refuses; an invoice without one can never be paid online", 1], ["viewed", "the customer opened it, a signal MGR has no column for", 1]],
    spec: "Drawn as QuickBooks actually presents it: the Sales transactions list with a right sidebar, because QuickBooks has no separate full-page record. Every Product/Service line resolves through the SKU's QuickBooks item reference and the bill-to through the customer's QuickBooks customer reference. MGR sends tax intent, never tax amounts: Intuit requires a transaction-level tax code (TxnTaxCodeRef) to opt the transaction into Automated Sales Tax, and an unmarked line is treated as TAX, so a keg deposit must carry TaxCodeRef NON explicitly or it books as taxable revenue. The header carries the second finding: a pushed invoice reads Not sent. Creating and delivering are different acts and the push performs only the first.",
    body: (<>
      {X.stat("Due in 30 days (Not sent)", 1)}
      {X.amt("Total due", INV.major, INV.cents)}
      {X.when("Invoice date", INV.invoiceDate)}
      {X.when("Due date", INV.due)}
      {X.sec(INV.customer, <>{X.sub("Billing address", ["114 Bridge St.", "Phoenixville, PA  19460"])}{X.link("ap@ridgeline.example")}</>)}
      {X.sec("Invoice activity", X.life(["Opened", "Sent", "Viewed", "Paid"], 1))}
      {X.sec("Products and services", X.rows([["Hazy IPA · ½ bbl · TAX", INV.hazyAmount], ["Pils · 16 oz case · TAX", INV.pilsAmount], ["Keg deposit · NON", INV.depositAmount], ["Total", INV.total]]))}
    </>),
  },
  {
    step: 5, slice: 1, group: "QuickBooks Online", venue: { name: "QuickBooks Online", title: "Payment", actions: "Edit" },
    name: "Payment",
    job: "The accountant records payment here; MGR never offers a Mark paid verb",
    reads: "qbo sync job [design; writes invoices.paid_at]",
    writes: "none [no MGR user action]",
    states: [["paid", "the invoice's paid date is set on the next sync"], ["fee deducted", "the deposit is smaller than the payment", 1], ["partial", "balance drops; the AR row stays due", 1], ["sync lagging", "MGR AR shows the last synced balance", 1]],
    spec: "This frame justifies an absence: there is deliberately no Mark paid button anywhere in MGR. The paid date and the QuickBooks balance arrive from the sync job only, which is why the AR list stops showing an invoice as due without anyone in the brewery doing anything. It also carries a number MGR does not model: QuickBooks Payments deducts a processing fee before deposit, so the bank deposit never equals the invoice. MGR reconciles against the QuickBooks balance, not the deposit, and must not read the gap as a short payment.",
    body: (<>
      {X.stat("Paid")}
      {X.amt("Amount paid", INV.major, INV.cents)}
      {X.when("Payment date", "9/28/2026")}
      {X.sec(INV.customer, <>{X.sub("Billing address", ["114 Bridge St.", "Phoenixville, PA  19460"])}{X.rows([["Phone", "(610) 933-7181"]])}</>)}
      {X.sec("Transaction Details", <>{X.sub("Payment Details", [`QuickBooks Payments-Bank *8837 | Fee: ${INV.fee}`, INV.total])}{X.sub("Deposit Details", ["JPMORGAN CHASE BANK, NA | *0753"])}</>)}
      {X.more("More info")}
    </>),
  },
  {
    step: 5, slice: 1, venue: { name: "QuickBooks Online", title: "Credit memo CM-0068", actions: "Edit" },
    name: "Credit memo",
    job: "A return or keg deposit refund as it lands against the customer",
    reads: "none",
    writes: "create_credit_memo [kind=credit_memo, own requestid]",
    states: [["applied", "reduces the customer balance here"], ["unapplied", "sits as available credit"], ["rejected", "the QuickBooks sync error is shown on the MGR credit row", 1], ["deposit line untaxed", "TaxCodeRef NON, or it refunds phantom tax", 1]],
    spec: "Created by Return shipment or a keg return, never free-form; the plan lists free-form credit memos as deliberately deferred. Returning an empty keg posts the deposit refund and the keg event in one RPC, so the credit and the fleet balance cannot disagree. The deposit line carries TaxCodeRef NON: an unmarked line defaults to TAX and would refund tax that was never charged.",
    body: (<>
      {X.stat("Applied")}
      {X.amt("Total credit", INV.creditMajor, "00")}
      {X.when("Credit date", "9/12/2026")}
      {X.when("Applied to", `Invoice ${INV.no} · original ${INV.total}`)}
      {X.sec(INV.customer, X.sub("Billing address", ["114 Bridge St.", "Phoenixville, PA  19460"]))}
      {X.sec("Products and services", X.rows([["Pils · 16 oz case · TAX", "$76.00"], ["Keg deposit refund · NON", "$30.00"], ["Total", INV.credit]]))}
      {X.more("More info")}
    </>),
  },
  {
    step: 5, slice: 1, group: "QuickBooks Online", venue: { name: "QuickBooks Online", title: "Invoice · not created" },
    name: "Push rejected",
    job: "What QuickBooks refuses when a SKU carries no usable item reference",
    reads: "none",
    writes: "push_invoice [design; rejected, no partial invoice]",
    states: [["failed", "MGR AR row reads push failed", 1], ["unmapped", "the SKU carries no QuickBooks item reference"], ["archived in QuickBooks Online", "mapped, but the item went inactive: same error, different fix", 1], ["never partial", "no half invoice is left behind here"]],
    spec: "Drawn because the failure is external and the recovery is not. MGR stores the raw provider reason as the invoice's sync error and leaves its sync status failed; the row stays in AR. Re-pushing reuses the same requestid, so a fixed mapping cannot produce a second invoice. Two causes share this one message (the SKU was never mapped, or the QuickBooks item has since gone inactive) and the recovery differs, so the error copy must not assume the first. Nothing appears in the list behind this panel, which is the point.",
    body: (<>
      {X.err("Invalid reference", "Invalid Reference Id : Item element id 0 not found.")}
      {X.sec("Request", X.rows([["Order", "ORD-0241"], ["Failed line", "Stout · ⅙ bbl"], ["Created in QuickBooks", "Nothing"]]))}
      {X.note("Either the SKU has no QuickBooks item reference, or the item it points at is archived in QuickBooks. Map it here or reactivate it there, then re-push the same request.")}
    </>),
  },
  {
    step: 7, slice: 7, venue: { name: "QuickBooks Online", title: "Sales receipt", actions: "Edit", selected: "receipt" },
    name: "Square sales receipt",
    job: "Proof that Square's own QuickBooks sync books a daily receipt MGR must not double-count",
    reads: "none [Square's QuickBooks integration wrote it]",
    writes: "none [MGR never pushes taproom sales]",
    states: [["daily total", "one receipt per location per day, not one per sale"], ["tips item", "Square posts a tips line MGR has no concept of", 1], ["double count", "MGR pushing taproom revenue here would book it twice", 1]],
    spec: "Drawn to mark a boundary MGR must not cross. Square's own QuickBooks connection already books taproom revenue as a daily sales receipt, so MGR ingesting Square sales is for inventory only; it must never push that revenue to QuickBooks as well. The tips item is the tell: it is Square's line, not MGR's, and MGR has no concept that would produce it.",
    body: (<>
      {X.stat("Paid")}
      {X.amt("Amount", "59", "73")}
      {X.when("Receipt date", "09/03/2026")}
      {X.sec("Square customer")}
      {X.sec("Sales receipt activity", X.sub("Paid", ["Credit Card"]))}
      {X.sec("Products and services", <>{X.rows([["4-Pack Beer To Go", "$19.00"], ["Draft Sales", "$30.00"], ["Square sale tips item", "$7.79"]])}{X.link("More details")}</>)}
      {X.more("More info")}
    </>),
  },

  // Square — records MGR reads, not writes. Slice 7, step 7.
  {
    step: 7, slice: 7, group: "POS",
    venue: {
      name: "Square", nav: "pay", on: "Transactions",
      panel: (<>
        {X.h("$14.84 Payment", "Sep 1, 2026 10:32 pm")}
        {X.meta([["", "Point of Sale"], ["Collected at", "Taproom"], ["Device", "Square Register 0305"], ["Order Source", "Register"]])}
        {X.sect("For here")}
        {X.li([["Hazy IPA (Pint)", "$14.00", "$7.00 × 2"]])}
        {X.tot([["Subtotal", "14.00"], ["Sales Tax Zelienople", "0.84"], ["Total", "14.84", 1], ["Cash", "14.84"]])}
        {X.note("MGR mapping: the Square Taproom location uses the Taproom sales channel. An unmapped variation blocks reconciliation rather than guessing a quantity.")}
      </>),
    },
    name: "Taproom sale",
    job: "The sale MGR ingests, and the truth the weekly count is checked against",
    reads: "sync_pos_sales [design; slice 7, idempotent per sale id]",
    writes: "none [Square owns the sale]",
    states: [["synced", "depletion posted once per sale id"], ["unmapped item", "reconciliation stays disabled until mapped", 1], ["refund", "arrives as its own line, credited back"], ["disconnected", "no expected number · the count still posts depletion"], ["tips line", "Square posts a tips item MGR has no concept of", 1]],
    spec: "Note the direction: ingesting a sale posts nothing to the ledger; it is the expected number the weekly count is measured against, and the count is what removes the beer. Drawn in the real container: a transaction is a right panel over Transactions, not a free-standing receipt. Read the list, not just the panel: a row summarises as an item name and a count, no SKU and no unit, so the list can never be the reconciliation source. Only the panel carries the lines, and even there the serving is a variation.",
    body: (<>
      {sqTxnHead()}
      {X.day("Tuesday, September 1, 2026", "$1,564.63")}
      {X.txns([["CASH", "10:32 pm", "Hazy IPA (Pint) × 2", "$14.84", "Taproom", 1], ["⋯", "9:59 pm", "No Sale", "$0.00", "Warehouse"], ["CASH", "9:44 pm", "Hazy IPA (Pint), Pils (Pint), Stout (Pint)", "$33.02", "Warehouse"], ["VISA", "9:16 pm", "Pils (Pint) × 3", "$26.67", "Warehouse"], ["VISA", "9:12 pm", "Pils (Can) × 2, Hazy IPA (Can) × 2, Stout (Can) × 2, Pils (Half) × 2, Hazy IPA To Go (Single) × 2, Saison…", "$141.23", "Warehouse"], ["AMEX", "8:52 pm", "Stout (Taster)", "$7.62", "Warehouse"], ["CASH", "8:43 pm", "Hazy IPA To Go (4 Pack)", "$28.89", "Warehouse"]])}
    </>),
  },
  {
    step: 7, slice: 7, group: "POS",
    venue: {
      name: "Square", nav: "pay", on: "Transactions",
      panel: (<>
        {X.h("$12.72 Refund", "Sep 1, 2026 10:51 pm")}
        {X.pill("Refunded", 1)}
        {X.meta([["", "Point of Sale"], ["Collected at", "Taproom"], ["Device", "Square Register 0305"], ["Original sale", "#5g4P"]])}
        {X.sect("Refunded items")}
        {X.li([["Pils · crowler", "−12.00", "$12.00 × 1"]])}
        {X.tot([["Sales Tax Zelienople", "−0.72"], ["Total refunded", "−12.72", 1]])}
        {X.note("Reaches MGR through the same reconcile RPC as the sale.")}
      </>),
    },
    name: "Refund",
    job: "The refund line that becomes a positive inventory adjustment in MGR",
    reads: "sync_pos_sales [design; refund lines included]",
    writes: "none [Square owns the refund]",
    states: [["previewed", "MGR shows a positive adjustment, not a negative sale"], ["partial refund", "only the refunded units credit back"], ["unmapped", "same block as the sale it reverses", 1], ["same list", "a refund is a row in Transactions like any payment"]],
    spec: "The reconcile list includes refund lines and previews the inventory credit as a positive adjustment. Drawing it as a negative sale would invite a signed-quantity bug of exactly the kind the movement vocabulary exists to prevent. A refund is not a separate surface in Square; it is another row in the same Transactions list, opening the same panel, which is why MGR ingests both through one call rather than two.",
    body: (<>
      {sqTxnHead()}
      {X.day("Tuesday, September 1, 2026", "$1,564.63")}
      {X.txns([["VISA", "10:51 pm", "Refund · Pils (Crowler)", "−$12.72", "Taproom", 1], ["CASH", "10:32 pm", "Hazy IPA (Pint) × 2", "$14.84", "Taproom"], ["VISA", "9:16 pm", "Pils (Pint) × 3", "$26.67", "Warehouse"], ["AMEX", "8:52 pm", "Stout (Taster)", "$7.62", "Warehouse"]])}
    </>),
  },
  {
    step: 7, slice: 7, venue: { name: "Square" },
    name: "Item library",
    job: "Which rows MGR maintains, and which it must never touch",
    reads: "none",
    writes: "none [mapping is written in MGR, not here]",
    states: [["MGR-owned", "published, updated and retired by MGR"], ["taproom-owned", "left alone; sales still ingest if mapped"], ["unmapped taproom item", "reconcile disabled for that item only", 1], ["renamed in Square", "id holds; ownership survives"], ["ownership is invisible here", "Square has no owner column; MGR infers it from the stored item id", 1]],
    spec: "Drawn to fix a boundary before publishing can cross it: a taproom rings food, merch and guest taps MGR knows nothing about. MGR maintains only the rows it published and leaves every other one alone; retire must never walk the whole catalog. Items predating the integration are adopted by mapping once, then maintained like the rest. The shading here is ours, not Square's: the real library has no ownership column, so MGR can only tell its rows apart by holding the item id.",
    body: (<>
      {sqItemFilters()}
      {X.items([[1, "Hazy IPA", "On-Prem Draft", "Taproom", "ea", "Available", "$6.00 - $9.00/ea", "mgr"], [1, "Hazy IPA To Go", "Off-Prem Package", "2 locations", "ea", "Available", "$6.50 - $24.00/ea", "mgr"], [1, "Pils", "On-Prem Draft", "Taproom", "ea", "Available", "$6.00 - $9.00/ea", "mgr"], [0, "Pretzel", "Events etc.", "Warehouse", "ea", "Available", "$7.00/ea", ""], [0, "Guest cider", "", "Taproom", "ea", "Available", "Variable", ""], [0, "Logo tee", "", "2 locations", "ea", "Available", "$25.00/ea", ""]])}
      {X.note("Shaded rows carry an item id MGR wrote. Everything else is the taproom’s and is never renamed, hidden or deleted by MGR.")}
    </>),
  },
  {
    step: 7, slice: 7, group: "POS", venue: { name: "Square" },
    name: "Published item",
    job: "A brand becomes a Square item, its formats become variations, and price lives on the format",
    reads: "get_taproom_sellable [view]",
    writes: "publish_pos_item [design; upsert by MGR key, writes back skus.square_item_id + variation ids]",
    states: [["created", "item id and variation ids stored on the SKU"], ["variation added", "a new serving is a new variation, not a new item", 1], ["renamed in MGR", "same item updated, ids hold"], ["collision", "existing Square item adopted, never duplicated", 1], ["tax assignment", "merged, never replaced; a republish must not retax", 1], ["off-premise twin", "its own item and id; same source SKU"]],
    spec: "DISCOVERED from a live library, and it breaks a modelling assumption: a Square item does not carry a price. Variations do. That is why the Price column reads as a range: it is the spread across a pint, a crowler and whatever else hangs off the item, and Variable means the spread is open. So the item id alone is not sufficient: sales report at the variation level, and the per-sale conversion MGR depletes against belongs to the variation, not the item. Publishing must store an id per serving, or a pint and a crowler collapse into one number.",
    body: (<>
      {sqItemFilters()}
      {X.items([[1, "Hazy IPA", "On-Prem Draft", "Taproom", "ea", "Available", "$6.00 - $9.00/ea", "mgr"], [1, "Hazy IPA To Go", "Off-Prem Package", "2 locations", "ea", "Available", "$6.50 - $24.00/ea", "mgr"]])}
      {X.note("MGR mapping: item FQ7K2N4M contains Pint 3YJ6Q8TX at $7.00, Crowler C4PV9K2D at $9.00, and Taster W8N3R6LA at $6.00. Square keeps these variations inside the item; MGR stores each opaque id because conversion differs by variation.")}
    </>),
  },
  {
    step: 7, slice: 7, venue: { name: "Square" },
    name: "Retired item",
    job: "Beer that stopped being available leaves the register without losing its history",
    reads: "get_taproom_sellable [view]",
    writes: "retire_pos_item [design; clears present_at_location_ids, never a delete]",
    states: [["retired", "off the register; past sales still resolve"], ["back in stock", "re-published under the same id, no churn"], ["sold while retiring", "the sale still ingests; the id never went away"], ["delete", "not offered; it would break prior orders", 1], ["variation retired", "one serving can go while the item stays", 1]],
    spec: "The removal half of maintenance, and deliberately not a delete. Deleting a catalog object breaks the orders that reference it and destroys the id the sales ingest maps through, so last month stops reconciling. Clearing the location takes it off the register just as completely, which is why Locations reads none and Status flips rather than the row disappearing. Because price and serving live on variations, retirement has two levels: a blown keg retires the pint while the crowler keeps selling.",
    body: (<>
      {sqItemFilters("All")}
      {X.items([[1, "Stout", "On-Prem Draft", "none", "ea", "Not available", "$6.00 - $9.00/ea", "mgr"], [0, "• Pint · SQ-8790-V1", "", "none", "ea", "Not available", "$7.00/ea", "mgr var"], [0, "• Crowler · SQ-8790-V2", "", "Taproom", "ea", "Available", "$9.00/ea", "mgr var"], [1, "Hazy IPA", "On-Prem Draft", "Taproom", "ea", "Available", "$6.00 - $9.00/ea", "mgr"]])}
      {X.note("Catalog object kept, prior orders still resolve, reconciliation unaffected. The crowler is still pouring while the pint is retired.")}
    </>),
  },

  // Slack — the three places MGR appears inside Slack. Chat slice, step 8.
  {
    step: 8, slice: "chat", surface: "entry", venue: { name: "Slack", shell: "home", ctx: "App Home" },
    name: "Link identity",
    job: "Link one Slack user to one current brewery staff membership",
    reads: "get_chat_link_status",
    writes: "issue_chat_link_proof · consume_chat_link_proof [design; single-use, authenticated MGR completion]",
    states: [["expired", "link expired · create a new one", 1], ["not staff", "customer and removed membership rejected", 1], ["linked", "show personal queue"]],
    spec: "Slack profile email and display name are never identity. The deep link requires normal MGR authentication.",
    body: (<>
      {S.h("Your MGR work")}
      {S.s("Link your account to see only work your current brewery role permits.")}
      {S.acts([["Link MGR account", "pri"]])}
      {S.ctx("No customer contacts, prices or notes are posted here.")}
    </>),
  },
  {
    step: 8, slice: "chat", group: "Chat", surface: "entry", venue: { name: "Slack", shell: "home", ctx: "App Home · Refresh" },
    name: "Personal queue",
    job: "Show the current role-filtered Today projection privately",
    reads: "get_today [linked user + current membership] · get_chat_link_status",
    writes: "none",
    states: [["empty", "You’re caught up"], ["loading", "row-shaped skeletons"], ["stale", "refresh removes resolved work"], ["unlinked", "return to link screen", 1]],
    spec: "Rows are rebuilt from owning MGR queries. App Home remains current during quiet hours and is optional for future providers.",
    body: (<>
      {S.h("Today · 4 waiting")}
      {S.sa("*ORD-0231 · Review submitted order*\nrequested Thu · sales", "Open")}
      {S.sa("*ORD-0235 · Pick due*\nships Fri · warehouse", "Open")}
      {S.sa("*Route A · next stop*\nassigned to you · 9:30 AM", "Open")}
      {S.sa("*FV2 · reading overdue*\nlast reading 26 h ago · brewer", "Open")}
      {S.acts([["Open Today in MGR", "pri"]])}
    </>),
  },
  {
    step: 8, slice: "chat", surface: "entry", venue: { name: "Slack", shell: "msg", ctx: "MGR", who: "Direct message", at: "8:43 AM" },
    name: "Personal DM",
    job: "Notify once when linked work becomes assigned, due or overdue",
    reads: "get_notification_occurrence [design] · owning Today query revalidation",
    writes: "snooze_notification · set_notification_preference [design; integration state only]",
    states: [["quiet hours", "queued until personal window opens"], ["resolved", "same message updates to Resolved"], ["retry", "same semantic delivery; no second message"], ["unauthorized", "suppress and unlink if membership ended", 1]],
    spec: "The provider message is a projection. Deleting it does not change MGR. Deep links contain no trusted actor or tenant claims.",
    body: (<>
      {S.h("ORD-0235")}
      {S.s("*Pick due*\nassigned to you")}
      {S.ctx("Pick due · needs attention")}
      {S.acts([["Open pick in MGR", "pri"], ["Snooze"], ["Mute picks"]])}
    </>),
  },
  {
    step: 8, slice: "chat", group: "Chat", surface: "entry", venue: { name: "Slack", shell: "msg", ctx: "# mgr-operations", who: "private · 6 members", at: "7:00 AM" },
    name: "Team digest",
    job: "Summarize unresolved work without leaking personal or customer detail",
    reads: "get_chat_operations_digest [design; current unresolved counts]",
    writes: "none",
    states: [["morning", "one message for the local morning window"], ["midday", "the same window message updates"], ["channel invalid", "shared delivery disabled; personal delivery continues", 1]],
    spec: "The destination must stay private, bot-member and non-external. Counts and safe operational labels only; details remain personal.",
    body: (<>
      {S.h("Morning operations · 6 waiting")}
      {S.s("*Submitted orders:* 2 · need sales review\n*Picks due:* 2 · warehouse queue\n*Assigned deliveries:* 1 · next stops ready\n*Fermentation readings:* 1 · overdue")}
      {S.ctx("Details and actions are available in each person’s private MGR App Home.")}
      {S.acts([["Open my MGR work", "pri"]])}
    </>),
  },
  {
    step: 8, slice: "chat", surface: "sheet", venue: { name: "Slack", shell: "modal", ctx: "Notification preferences", foot: [["Save preferences", "pri"]] },
    name: "Notification preferences",
    job: "Let a linked user control delivery without changing MGR due state",
    reads: "get_notification_preferences [design]",
    writes: "set_notification_preference · snooze_notification [design; integration state only]",
    states: [["saved", "update App Home and close"], ["invalid hours", "name the correction", 1], ["unsupported provider", "open authenticated MGR fallback", 1]],
    spec: "Snooze and mute affect personal delivery only. App Home and MGR Today still show current work.",
    body: (<>
      {S.toggle("Submitted orders")}
      {S.toggle("Picks due")}
      {S.toggle("Assigned deliveries")}
      {S.toggle("Fermentation readings")}
      {S.select("Quiet hours", "9:00 PM–6:00 AM")}
      {S.ctx("Snooze and mute affect personal delivery only. MGR still shows the work as due.")}
    </>),
  },
  {
    step: 8, slice: "chat", group: "Chat", surface: "sheet", venue: { name: "Slack", shell: "modal", ctx: "Record fermentation reading", foot: [["Open in MGR"]] },
    name: "Fermentation reading form",
    job: "Preview the first eligible operational modal without enabling it early",
    reads: "get_fermentation_reading_preview [view; gated; current occupancy/version]",
    writes: "record_fermentation_reading [IMPLEMENTATION-GATE: request replay + version + correction contract]",
    states: [["not yet eligible", "open the MGR reading flow instead", 1], ["stale", "occupancy changed · refresh", 1], ["response lost", "the same request returns the first result"]],
    spec: "Future phase only. Personal destination, canonical preview and explicit Record reading confirmation. A new reading corrects history; prior rows never edit.",
    body: (<>
      {S.ctx("Future phase only")}
      {S.f([["Vessel", "FV2 · Hazy IPA"], ["Last reading", "26 h ago"], ["Reading", "4.2 °Plato · 68 °F"]])}
      {S.dis("Record reading", "Open this reading in MGR for now")}
    </>),
  },
  {
    step: 8, slice: "chat", surface: "sheet", venue: { name: "Slack", shell: "modal", ctx: "Review order", foot: [["Open order in MGR"]] },
    name: "Order confirmation form",
    job: "Show why warning-free order confirmation remains conditional",
    reads: "get_order_confirmation_preview [view; gated; canonical current preview]",
    writes: "confirm_order [gated; atomic allocation + request replay + expected version]",
    states: [["warning", "ATP, registration, price or source warning routes to MGR", 1], ["stale", "order changed · refresh", 1], ["eligible", "only a warning-free preview can confirm"]],
    spec: "Future phase only. This fixture intentionally carries an ATP warning, so Slack cannot confirm it.",
    body: (<>
      {S.ctx("Future phase only")}
      {S.f([["Order", "ORD-0231 · 3 lines · requested Thu · Submitted"], ["Warning", "Hazy IPA · 16 oz case is 8 units short. Review allocations and restock in MGR."]])}
      {S.dis("Confirm order", "This order needs the full MGR review")}
    </>),
  },
];
