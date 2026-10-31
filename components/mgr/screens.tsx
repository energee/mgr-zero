import { NotFoundView } from "@/components/mgr/views/not-found";
import { BatchCompletionFixture } from "@/components/mgr/fixtures/batch-completion";
import { AccountInvitationsView } from "@/components/mgr/views/account-invitations";
import { CommandRecoveryView } from "@/components/mgr/views/command-recovery";
import { PackagingSourcePicker, PlanActions } from "@/components/mgr/views/plan-actions";
import { RefusedReturnFormView } from "@/components/mgr/views/refused-return";
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
// edit surface with empty values (Create brewery is the pattern), so New
// customer, Add location, New PO, Add keg pool and New price group open the
// records already here rather than earning frames of their own. And the
// composer strip is staff shell chrome — screen-frame.tsx passes E.comp() to
// staff frames — so it is present under every staff frame without any
// body naming it.
//
// Option casing: every option an operator picks reads as a label, in sentence
// case — Depletion, Taxable, Festival removal — including the generic domain
// terms #132 once kept lowercase. #333 (QA sweep, 2026-09-13) supersedes that
// rule: raw enum casing leaking into pickers was reported as a bug, and a list
// that mixes "taproom" with "Warehouse" reads as an oversight whatever the
// intent. Units stay as written (lb, oz, bbl), and a named record keeps its own
// capitalization (Warehouse, Citra, Al's Bar).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QboMappingView, QboMappingsView } from "@/components/mgr/views/qbo-mapping";
import { qboMappingScopeOptions } from "@/lib/mgr/accounting-view";
import { InvoicesView } from "@/components/mgr/views/invoices";
import { invoiceList, invoicesSync } from "@/lib/mgr/fixtures/invoices";
import { dollarsInput } from "@/lib/mgr/money";
import { InviteView, TeamMemberView } from "@/components/mgr/views/team-controls";
import { CreateBreweryView } from "@/components/mgr/views/create-brewery";
import { ImportView } from "@/components/mgr/views/import";
import { importPreview } from "@/lib/mgr/fixtures/import";
import { ChatDisconnectView, ChatLinkedPeopleView, ChatLinkConsentView, ChatHealthView, ChatSettingsView, ChatPersonalPreferencesView } from "@/components/mgr/views/chat";
import { linkedChatPeople, chatLinkIntent, chatRecovery, chatDisconnected, chatConnected, personalChatPreferences } from "@/lib/mgr/fixtures/chat";
import { CHAT_PREVIEW_FIXTURES } from "@/lib/chat/preview-fixtures";
import { NOTIFICATION_REASON_LABEL, PERSONAL_NOTIFICATION_REASONS } from "@/lib/chat/contracts";
import { ShipmentSourcesView } from "@/components/mgr/views/shipment-sources";
import { shipmentSources } from "@/lib/mgr/fixtures/order-sheets";
import { BatchesView } from "@/components/mgr/views/batches";
import { BeerView } from "@/components/mgr/views/beer";
import { BinView } from "@/components/mgr/views/bin";
import { BrewDayView } from "@/components/mgr/views/brew-day";
import { BrewPrepView } from "@/components/mgr/views/brew-prep";
import { BrewTimelineView } from "@/components/mgr/views/brew-timeline";
import { BrandApprovalView } from "@/components/mgr/views/brand-approval";
import { BrandView } from "@/components/mgr/views/brand";
import { CatalogView } from "@/components/mgr/views/catalog";
import { ColaReviewView } from "@/components/mgr/views/cola-review";
import { ColaLabelImageView } from "@/components/mgr/views/cola-label-image";
import { colaReviewBrands, colaReviewRecord, colaReviewDetails } from "@/lib/mgr/fixtures/cola-review";
import { missingColaIds } from "@/lib/mgr/cola-review";
import { ListControls } from "@/components/mgr/list-controls";
import { ChannelView } from "@/components/mgr/views/channel";
import { ClosePackagingRunView } from "@/components/mgr/views/close-packaging-run";
import { CompleteTransferView } from "@/components/mgr/views/complete-transfer";
import { ConfirmDeliveryView } from "@/components/mgr/views/confirm-delivery";
import { ConfirmOrderView } from "@/components/mgr/views/confirm-order";
import { ComplianceMonthsView } from "@/components/mgr/views/compliance-months";
import { LicensesView } from "@/components/mgr/views/licenses";
import { DriverRouteView } from "@/components/mgr/views/driver-route";
import { ContractView } from "@/components/mgr/views/contract";
import { ContractsView } from "@/components/mgr/views/contracts";
import { CycleCountView, CycleCountFooter } from "@/components/mgr/views/cycle-count";
import { CellarTransferView, CellarTransferFooter } from "@/components/mgr/views/cellar-transfer";
import { CellarAdditionView, CellarAdditionFooter } from "@/components/mgr/views/cellar-addition";
import { TaproomVarianceView } from "@/components/mgr/views/taproom-variance";
import { taproomVariance, weeklyCount } from "@/lib/mgr/fixtures/taproom";
import { WeeklyCountView } from "@/components/mgr/views/weekly-count";
import { TapBoardView, TapKegView } from "@/components/mgr/views/tap-board";
import { AccountingView, DisconnectQuickBooksView, QboConnectionView, QboSyncView } from "@/components/mgr/views/accounting";
import { accountingExpired, quickBooksMappings } from "@/lib/mgr/fixtures/accounting";
import { tapBoard, tapBoardSkus, kickKeg, swapKeg } from "@/lib/mgr/fixtures/taproom";
import { cellarAdditionCitra, cellarTransferPils } from "@/lib/mgr/fixtures/production";
import { brewTurnModel } from "@/lib/mgr/brew-day-view";
import { CustomerView } from "@/components/mgr/views/customer";
import { CustomersView } from "@/components/mgr/views/customers";
import { DeniedView } from "@/components/mgr/views/denied";
import { EntryView } from "@/components/mgr/views/entry";
import { FinishedGoodsView } from "@/components/mgr/views/finished-goods";
import { FermentationReadingActionsView, FermentationReadingView, readingIdentity } from "@/components/mgr/views/fermentation-reading";
import { FirstRunView } from "@/components/mgr/views/first-run";
import { CatalogCategoriesFixture, FormatFixture, ReceiptFixture, TransferDetailFixture, WeeklyCountFixture } from "@/components/mgr/fixture-adapters";
import { FormatView } from "@/components/mgr/views/format";
import { DeleteFormatControl } from "@/components/mgr/views/delete-format";
import { FormatsView } from "@/components/mgr/views/formats";
import { WaterProfilesView } from "@/components/mgr/views/water-profiles";
import { WaterProfileView } from "@/components/mgr/views/water-profile";
import { InvoiceView, RecordPaymentView, VoidPaymentView } from "@/components/mgr/views/invoice";
import { InvoiceAccountingActionsView, PushInvoiceView, WriteOffInvoiceView } from "@/components/mgr/views/invoice-accounting";
import { KegBalanceView } from "@/components/mgr/views/keg-balance";
import { KegFleetView } from "@/components/mgr/views/keg-fleet";
import { KegReportView } from "@/components/mgr/views/keg-report";
import { KegHistoryView } from "@/components/mgr/views/keg-history";
import { LocationBinsView } from "@/components/mgr/views/location-bins";
import { LicenseView } from "@/components/mgr/views/license";
import { LocationView } from "@/components/mgr/views/location";
import { MaterialLotTraceView } from "@/components/mgr/views/material-lot-trace";
import { toMaterialLotTraceViewProps } from "@/lib/mgr/material-lot-trace-view";
import { LotTraceView } from "@/components/mgr/views/lot-trace";
import { MaterialView } from "@/components/mgr/views/material";
import { MaterialsOnHandView } from "@/components/mgr/views/materials-on-hand";
import { LocationsView } from "@/components/mgr/views/locations";
import { MeView } from "@/components/mgr/views/me";
import { MoreView } from "@/components/mgr/views/more";
import { MonthlyComplianceView, PeriodBeforeBooksView } from "@/components/mgr/views/monthly-compliance";
import { ReattributeLossView } from "@/components/mgr/views/reattribute-loss";
import { NewOrderView } from "@/components/mgr/views/new-order";
import { EditDraftOrderView } from "@/components/mgr/views/edit-draft-order";
import { editDraftOrder } from "@/lib/mgr/fixtures/edit-draft-order";
import { QueryFeedback } from "@/components/mgr/query-feedback";
import { NewPoView } from "@/components/mgr/views/new-po";
import { NewTransferView } from "@/components/mgr/views/new-transfer";
import { OrderView } from "@/components/mgr/views/order";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { PackageBomView } from "@/components/mgr/views/package-bom";
import { PackagingRunsView } from "@/components/mgr/views/packaging-runs";
import { ReplenishmentDemo } from "@/components/mgr/replenishment-demo";
import { ReplenishmentView } from "@/components/mgr/views/replenishment";
import { PickView } from "@/components/mgr/views/pick";
import { PickSheetView } from "@/components/mgr/views/pick-sheet";
import { PlanningView } from "@/components/mgr/views/planning";
import { DisconnectSquareView, PointOfSaleView, PosItemView, PosMenuView, PosSaleDetailView, PosSyncActions, SquareLocationsView } from "@/components/mgr/views/pos";
import { PortalAccountView } from "@/components/mgr/views/portal-account";
import { PortalInvoiceView } from "@/components/mgr/views/portal-invoice";
import { PortalInvoicesView } from "@/components/mgr/views/portal-invoices";
import { PortalMeView } from "@/components/mgr/views/portal-me";
import { PortalOrderView } from "@/components/mgr/views/portal-order";
import { ComingUpView } from "@/components/mgr/views/coming-up";
import { PortalOrdersView } from "@/components/mgr/views/portal-orders";
import { PriceGroupView } from "@/components/mgr/views/price-group";
import { PriceGroupsView } from "@/components/mgr/views/price-groups";
import { PurchaseOrdersView } from "@/components/mgr/views/purchase-orders";
import { PutBackView } from "@/components/mgr/views/put-back";
import { RepackView } from "@/components/mgr/views/repack";
import { ReceiptView } from "@/components/mgr/views/receipt";
import { ReceivePoView } from "@/components/mgr/views/receive-po";
import { QuestionInvoiceView } from "@/components/mgr/views/question-invoice";
import { RecipeView } from "@/components/mgr/views/recipe";
import { RecipesView } from "@/components/mgr/views/recipes";
import { NewRecipeFieldsView } from "@/components/mgr/views/new-recipe";
import { IngredientView } from "@/components/mgr/views/ingredient";
import { RecordMovementView } from "@/components/mgr/views/record-movement";
import { RunClosedView } from "@/components/mgr/views/run-closed";
import { ReverseMovementView } from "@/components/mgr/views/reverse-movement";
import { ReturnCreditView, ReturnSourcesView } from "@/components/mgr/views/return-credit";
import { ReturnRouteView } from "@/components/mgr/views/return-route";
import { RouteView } from "@/components/mgr/views/route";
import { RoutesView } from "@/components/mgr/views/routes";
import { ReviewOrderView } from "@/components/mgr/views/review-order";
import { SaleChannelsView } from "@/components/mgr/views/sale-channels";
import { ScheduleBatchView } from "@/components/mgr/views/schedule-batch";
import { SchedulePackagingRunView } from "@/components/mgr/views/schedule-packaging-run";
import { SearchView } from "@/components/mgr/views/search";
import { SessionExpiredView } from "@/components/mgr/views/session-expired";
import { SettingsView } from "@/components/mgr/views/settings";
import { StateRegistrationView } from "@/components/mgr/views/state-registration";
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
import { VendorView } from "@/components/mgr/views/vendor";
import { VendorsView } from "@/components/mgr/views/vendors";
import { VendorDetailView } from "@/components/mgr/views/vendor-detail";
import { RemoveVesselControl, VesselDetailView } from "@/components/mgr/views/vessel-detail";
import { CellarMapView } from "@/components/mgr/views/cellar-map";
import { cellarMapBrewer } from "@/lib/mgr/fixtures/production";
import { OHIO_STOUT_NOTE, LOC_TAPROOM, LOC_WAREHOUSE } from "@/lib/mgr/fixtures/demo";
import { beerOverview } from "@/lib/mgr/fixtures/beer";
import { brandHazy, catalogBrands, formatCan, formatsInventory, packageBomCase, skuHazyHalf, skuListHazy, waterProfiles } from "@/lib/mgr/fixtures/catalog";
import { customerRidgeline, customersList, customersMissingEmail, shipToMain } from "@/lib/mgr/fixtures/customers";
import { deniedInvoices } from "@/lib/mgr/fixtures/denied";
import { expiredInvite, expiredReset, noMembership, portalForgotPassword, portalSetPassword, portalSignIn, portalStaffOnly, resetPassword, setPassword, signIn } from "@/lib/mgr/fixtures/entry";
import { firstRunDemo } from "@/lib/mgr/fixtures/first-run";
import { meMaria } from "@/lib/mgr/fixtures/me";
import { moreNavs } from "@/lib/mgr/fixtures/more";
import { entityPickerPalette, searchPalette } from "@/lib/mgr/fixtures/search";
import { sessionExpiredQueued } from "@/lib/mgr/fixtures/session-expired";
import { DEMO_TIME_ZONE, settingsDemo } from "@/lib/mgr/fixtures/settings";
import { teamRoster } from "@/lib/mgr/fixtures/team";
import { todayBrewer, todayDriver, todayEmpty, todaySales, todayTaproom, todayWarehouse } from "@/lib/mgr/fixtures/today";
import { workWarehouse } from "@/lib/mgr/fixtures/work";
import { invoiceFailedAls, invoiceFailedAlsAccounting, invoiceLocalPartlyPaid } from "@/lib/mgr/fixtures/invoice";
import { finishedGoodsList, recordMovementFestival, reverseMovementAdjustment } from "@/lib/mgr/fixtures/inventory";
import { binCold, locationBinsTaproom, locationTaproom, locationsList } from "@/lib/mgr/fixtures/locations";
import { newOrderDraft, orderPickedRestock, orderPickedRestockPutBack, orderSubmittedRidgeline, orderTransferComplete, ordersWorkList } from "@/lib/mgr/fixtures/orders";
import { orderPick, orderReturnCredit, orderShipInvoice, orderShipOnDelivery, orderShipmentDone, orderShortPick } from "@/lib/mgr/fixtures/order-sheets";
import { replenishmentDemo } from "@/lib/mgr/fixtures/replenishment";
import {
  batchesBrewer, brewDayTurnsHazy, brewPrepMineral, brewTimelineMineral, closePackagingRunHazy, FERM_STAGES, MASH_STEPS, recipeBrandOptions, recipeHazyV4, recipesList, WATER_HAZY,
  runClosedHazy, scheduleBatchHazy, vesselFv3, vesselNew,
} from "@/lib/mgr/fixtures/production";
import { PICK_SHEET_DATE_CHIPS, pickSheet } from "@/lib/mgr/fixtures/pick-sheet";
import { ridgelineComingUp, ridgelineReviewOrder, ridgelineShop } from "@/lib/mgr/fixtures/portal";
import { portalAccountRidgeline, portalMeRidgeline } from "@/lib/mgr/fixtures/portal-account";
import { portalInvoicePaid, portalInvoiceUnpaid, portalInvoicesRidgeline } from "@/lib/mgr/fixtures/portal-invoices";
import { portalOrderShipped, portalOrdersList } from "@/lib/mgr/fixtures/portal-orders";
import { priceGroupTwo, pricingGrid } from "@/lib/mgr/fixtures/pricing";
import { channelExport, saleChannelsList } from "@/lib/mgr/fixtures/settings-catalog";
import { newTransferDraft, transferDetailSubmitted, transfersList } from "@/lib/mgr/fixtures/transfers";
import {
  contractEdit, contractsList, countSheetShelf, cycleCountCans, materialCitra, materialsOnHandList,
  correctReceiptPo, draftPoCanSource, editPoCanSource, newPoDraft, newPoIncomplete, purchaseOrdersWarehouse, receiptPoPartial, receivePoSent, vendorDetail, vendorEdit, vendorsList,
} from "@/lib/mgr/fixtures/purchasing";
import { kegBalanceRidgeline, kegFleet, kegHistoryLedger, kegReportOwned } from "@/lib/mgr/fixtures/kegs";
import { packagingRuns, repackCase, schedulePackagingRun } from "@/lib/mgr/fixtures/packaging";
import { planningDemo } from "@/lib/mgr/fixtures/planning";
import { monthlyComplianceAmended, monthlyComplianceAugust, monthlyComplianceSeptember, monthlyComplianceUnbalanced } from "@/lib/mgr/fixtures/monthly-compliance";
import { confirmDeliveryStop1, driverRouteA, returnRouteA, routeAPlan, routesDriver } from "@/lib/mgr/fixtures/delivery";
import {
  brandApprovalStout, complianceMonthsDemo, licensesDemo, licensePaBrewery, lotTraceHazy, materialLotTraceCitra, stateRegistrationHazy,
} from "@/lib/mgr/fixtures/compliance";
import { toBatchesViewProps } from "@/lib/mgr/batches-view";
import { toBeerViewProps } from "@/lib/mgr/beer-view";
import { toBinViewProps } from "@/lib/mgr/bin-view";
import { toBrandViewProps } from "@/lib/mgr/brand-view";
import { toCatalogScopes, toCatalogViewProps } from "@/lib/mgr/catalog-view";
import { toChannelViewProps } from "@/lib/mgr/channel-view";
import { toCompleteTransferViewProps } from "@/lib/mgr/complete-transfer-view";
import { toContractsViewProps } from "@/lib/mgr/contracts-view";
import { toConfirmOrderViewProps } from "@/lib/mgr/confirm-order-view";
import { toLicensesViewProps } from "@/lib/mgr/licenses-view";
import { toCustomerViewProps } from "@/lib/mgr/customer-view";
import { toCustomersViewProps } from "@/lib/mgr/customers-view";
import { pageNotFoundModel, toAcceptInviteViewProps } from "@/lib/mgr/entry-view";
import { toFinishedGoodsViewProps } from "@/lib/mgr/finished-goods-view";
import { toFormatViewProps } from "@/lib/mgr/format-view";
import { toFormatsViewProps } from "@/lib/mgr/formats-view";
import { toWaterProfileFields, toWaterProfilesViewProps } from "@/lib/mgr/water-profiles-view";
import { qboPushConfirmation } from "@/lib/mgr/qbo-ui";
import { toInvoiceViewProps } from "@/lib/mgr/invoice-view";
import { toKegBalanceViewProps } from "@/lib/mgr/keg-balance-view";
import { toKegFleetViewProps } from "@/lib/mgr/keg-fleet-view";
import { toKegReportViewProps } from "@/lib/mgr/keg-report-view";
import { toKegHistoryViewProps } from "@/lib/mgr/keg-history-view";
import { toLocationBinsViewProps } from "@/lib/mgr/location-bins-view";
import { toLocationViewProps } from "@/lib/mgr/location-view";
import { toLotTraceViewProps } from "@/lib/mgr/lot-trace-view";
import { toLocationsViewProps } from "@/lib/mgr/locations-view";
import { toMaterialsOnHandViewProps, toMaterialsScopes } from "@/lib/mgr/materials-on-hand-view";
import { ComposerConversationView } from "@/components/mgr/views/composer-conversation";
import { ComposerStripView } from "@/components/mgr/views/composer-strip";
import { ComposerProposalView, OfflineOutboxView } from "@/components/mgr/views/composer";
import { COMPOSER_SETUP_ACTIVITY, COMPOSER_SETUP_TIMEOUT_MESSAGE, COMPOSER_SETUP_TIMEOUT_MS } from "@/lib/composer/setup";
import { toMoreViewProps } from "@/lib/mgr/more-view";
import { toNewOrderViewProps } from "@/lib/mgr/new-order-view";
import { newPoReason } from "@/lib/mgr/new-po-view";
import { vesselReason } from "@/lib/mgr/vessel-detail-view";
import { submitReason } from "@/lib/mgr/submit-reason";
import { toNewTransferViewProps } from "@/lib/mgr/new-transfer-view";
import { toOrderViewProps } from "@/lib/mgr/order-view";
import { toOrdersListViewProps } from "@/lib/mgr/orders-list-view";
import { toPackageBomViewProps } from "@/lib/mgr/package-bom-view";
import { toPickViewProps } from "@/lib/mgr/pick-view";
import { toPickSheetViewProps } from "@/lib/mgr/pick-sheet-view";
import { toPortalAccountViewProps } from "@/lib/mgr/portal-account-view";
import { toPortalInvoiceViewProps } from "@/lib/mgr/portal-invoice-view";
import { toPortalInvoicesViewProps } from "@/lib/mgr/portal-invoices-view";
import { toPortalMeViewProps } from "@/lib/mgr/portal-me-view";
import { toPortalOrderViewProps } from "@/lib/mgr/portal-order-view";
import { toComingUpViewProps } from "@/lib/mgr/coming-up-view";
import { toPortalOrdersViewProps } from "@/lib/mgr/portal-orders-view";
import { toPriceGroupViewProps } from "@/lib/mgr/price-group-view";
import { toPriceGroupsViewProps } from "@/lib/mgr/price-groups-view";
import { toPurchaseOrdersViewProps } from "@/lib/mgr/purchase-orders-view";
import { toPutBackViewProps } from "@/lib/mgr/put-back-view";
import { toQuestionInvoiceViewProps } from "@/lib/mgr/question-invoice-view";
import { toRecipesViewProps } from "@/lib/mgr/recipes-view";
import { toRecordMovementViewProps } from "@/lib/mgr/record-movement-view";
import { toPackagingRunsViewProps } from "@/lib/mgr/packaging-runs-view";
import { toPlanningViewProps } from "@/lib/mgr/planning-view";
import { beforeBooksState, toMonthlyComplianceViewProps } from "@/lib/mgr/monthly-compliance-view";
import { toReverseMovementViewProps } from "@/lib/mgr/reverse-movement-view";
import { toReviewOrderViewProps } from "@/lib/mgr/review-order-view";
import { toReturnCreditViewProps } from "@/lib/mgr/return-credit-view";
import { toRoutesViewProps } from "@/lib/mgr/routes-view";
import { toSaleChannelsViewProps } from "@/lib/mgr/sale-channels-view";
import { toShipToViewProps } from "@/lib/mgr/ship-to-view";
import { toShipViewProps } from "@/lib/mgr/ship-view";
import { toShipmentDoneViewProps } from "@/lib/mgr/shipment-done-view";
import { toShopViewProps } from "@/lib/mgr/shop-view";
import { toShortPickViewProps } from "@/lib/mgr/short-pick-view";
import { toSkuListViewProps } from "@/lib/mgr/sku-list-view";
import { toSkuViewProps } from "@/lib/mgr/sku-view";
import { toTodayViewProps } from "@/lib/mgr/today-view";
import { toTransferDetailViewProps } from "@/lib/mgr/transfer-detail-view";
import { toTransfersViewProps } from "@/lib/mgr/transfers-view";
import { toVendorsViewProps } from "@/lib/mgr/vendors-view";
import { toVendorDetailViewProps } from "@/lib/mgr/vendor-detail-view";
import { toWorkViewProps } from "@/lib/mgr/work-view";
import { S, sqItemFilters, sqTxnHead, X, type Venue } from "@/components/mgr/venue";
import { MgrIcon } from "@/components/mgr-icon";
import type { SaltMaterial, WaterProfileIons } from "@/lib/mgr/recipe-process-view";
import { MashScheduleView, MashStepView } from "@/components/mgr/views/mash-schedule";
import { FermentationScheduleView, FermentationStageView } from "@/components/mgr/views/fermentation-schedule";
import { WaterAdditionView, WaterView } from "@/components/mgr/views/water";
import { toAdditionFields, toMashStepFields, toStageFields, toWaterProfileOption } from "@/lib/mgr/recipe-process-view";

const WATER_PROFILE_OPTIONS: WaterProfileIons[] = waterProfiles.map(toWaterProfileOption);
const SALT_OPTIONS: SaltMaterial[] = [
  { id: "gypsum", name: "Gypsum", salt: "gypsum" }, { id: "cacl", name: "Calcium chloride", salt: "calcium_chloride" }, { id: "epsom", name: "Epsom salt", salt: "epsom_salt" },
  { id: "lactic", name: "Lactic acid", salt: null }, { id: "phos", name: "Phosphoric acid", salt: null },
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
  /** Default page; other surfaces use the same entry, form, or chat wrapper as live. */
  surface?: "page" | "sheet" | "entry" | "composer";
  name: string;
  /** Action-specific sheet title when the inventory record describes both New and Edit. */
  sheetTitle?: string;
  job: ReactNode;
  reads: ReactNode;
  writes: ReactNode;
  /** Annotation chips: state, note, and `1` for a blocked or failure state (offline, permission, error), drawn filled. */
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
  /** Entry-screen header (mark + product name); sheets use `sheetTitle` or `name`. */
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

// A rough remaining fill, wherever a keg comes off a tap.

export { WORK_TABS } from "@/lib/mgr/work-view";

// The states every screen can reach; a record with designed states lists its own instead.
const DEFAULT_STATES: NonNullable<Screen["states"]> = [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]];
/** DEFAULT_STATES with the permission note swapped for who may open the screen. */
/** One open occupancy's cellar verbs as Vessel detail and a recorded batch draw them (live: app/(app)/cellar/occupancy-actions.tsx). */
const occupancyActions = (reading: boolean) => <div className="flex flex-wrap gap-2">{reading && E.btn("Reading", "g")}{E.btn("Transfer", "g")}{E.btn("Addition", "g")}<BatchCompletionFixture /></div>;
const permitted = (who: string): NonNullable<Screen["states"]> => [["permission", who, 1], ...DEFAULT_STATES.filter(([st]) => st !== "permission")];
/** Settings and its no-warehouse variant draw the same page, so they read and write the same. */
const SETTINGS_IO = { reads: "get_brewery · get_brewery_ai_model · list_locations · list_team_members · list_compliance_reports · list_reporting_basis_corrections · gateway.getAvailableModels [platform]", writes: "update_brewery · set_brewery_operating_defaults · set_books_opened_on · correct_reporting_basis · set_brewery_gravity_unit · set_brewery_ai_model · update_location · set_portal_fulfillment_source" };

/** INV-1039 partly paid in MGR: Record payment's cap and the $300.00 check Void payment voids. */
const LOCAL_PARTLY_PAID = toInvoiceViewProps(invoiceLocalPartlyPaid);
const LOCAL_CHECK = LOCAL_PARTLY_PAID.payments[0];
const LOCAL_BALANCE_CENTS = LOCAL_PARTLY_PAID.paymentBalanceCents!;

export const SCREENS: Screen[] = [
  // step 1 — foundations and both authenticated shells
  {
    step: 1, slice: "all", tab: "Today", name: "Today",
    to: { Pick: "Pick sheet", "Put back": "Put back", "3 orders ready": "Pick sheet", "Staged · ORD-0229": "Order" , "Next delivery \u00b7 Ridgeline": "Driver route" },
    job: "Role-filtered work that opens ready to finish · full-size exemplar at ship scale",
    reads: "get_today [delivery rows require assigned warehouse member or admin]", writes: "none",
    states: [["empty", "Nothing waiting · the quick actions stay"], ["loading", "row-shaped skeletons"], ["error", "Today did not load · Retry", 1], ["offline", "cached rows · writes queue"], ["role hidden", "only relevant permitted work · no blank gaps"]],
    spec: "Drawn as the warehouse persona at honest 16px density. Above the rows sit the role's quick actions: New order for sales, Record movement and Receive PO for warehouse, New batch for brewer, all four for admin. Record movement opens the form on Finished goods and closing it returns here. Rows are role-filtered per plan §3; the row verb is the action. A row standing for one order opens that order's Pick. This row stands for three, so Pick lands on the day's Pick sheet and each order opens its own Pick from there; the verb never becomes a noun to explain itself. The restock row appears while the order's restock flag is set and opens the order. Warehouse reaches the live Weekly count from Beer → Weekly count, so Today draws no count footer.",
    body: <TodayView model={toTodayViewProps(todayWarehouse)} />,
  },
  {
    step: 4, slice: "all", tab: "Today", name: "Today empty",
    job: "Nothing waiting; the role's quick actions stay",
    reads: "get_today", writes: "none",
    states: [["empty", "Nothing waiting · the quick actions stay"]],
    spec: "Empty Today, drawn for warehouse. When work exists the row is where you act; with nothing waiting the quick actions are the only buttons.",
    body: <TodayView model={toTodayViewProps(todayEmpty)} />,
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Sales",
    to: { "Pils · 16 oz case": "Pars and allocation", Open: "Invoice", "Al\u2019s Bar \u00b7 OH": "State registration", "Refused beer to return and credit": "Return and credit" },
    job: "Sales landing: submitted orders to confirm and beer that is short",
    reads: "get_today [sales role filter] · get_shortfalls · list_invoice_questions", writes: "none",
    states: [["empty", "Nothing waiting · New order stays"], ["role hidden", "no Pick/Receive; no blank gaps"], ["buyer question", "a portal question lands here, because nothing else in MGR would show it"]],
    spec: "The same Today read as the exemplar, filtered for sales. Confirm is the row verb (2 taps); shortfall rows open Shortfall, pars and standing allocation. A question raised from the portal's Question invoice sheet appears as a row here and opens that invoice, where Mark answered clears it: the note has a destination a person opens and a way to leave the list again. New order is the quick action above the rows.",
    body: <TodayView model={toTodayViewProps(todaySales)} />,
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Brewer",
    to: { "Close": "Close packaging run" },
    job: "Brewer landing: readings due, brew day due, packaging to close",
    reads: "get_today [brewer role filter]", writes: "none",
    states: [["empty", "Nothing waiting · New batch stays"], ["role hidden", "no picks or receipts"]],
    spec: "New batch is the quick action above the rows and opens Batches. Reading opens the Fermentation reading sheet defaulted to the overdue vessel. Brew day and packaging rows open their Work frames. Warehouse picks never appear here. The row verb is the action.",
    body: <TodayView model={toTodayViewProps(todayBrewer)} />,
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Driver",
    to: { Resume: "Confirm delivery" },
    job: "Driver landing: the next stop and nothing else",
    reads: "get_today [delivery rows require route.driver_user_id = caller or admin]", writes: "none",
    states: [["empty", "No route today"], ["offline", "stop list cached · Delivered waits", 1], ["permission", "warehouse membership + assigned route", 1]],
    spec: "The next delivery row comes from a get_today-shaped delivery_next item. Resume opens Confirm delivery for that stop. The full stop list, load, departure and Return belong on Driver route, not Today.",
    body: <TodayView model={toTodayViewProps(todayDriver)} />,
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
    to: { "Variance by brand": "Variance by brand" },
    reads: "get_beer_overview", writes: "none",
    states: DEFAULT_STATES,
    body: <BeerView model={toBeerViewProps(beerOverview)} />,
  },
  {
    step: 1, slice: "all", tab: "Work", name: "Work", job: "Everything currently in motion, ordered by next due action",
    reads: "list_work", writes: "none",
    states: DEFAULT_STATES,
    spec: "Warehouse default rows shown; filter chips are the kinds the role may open (a brewer has no Purchase orders or Deliveries), each labeled with its sidebar name, and an explicit filter choice is remembered. Pick and Replenishment follow as navigation-only chips for roles with access. Rows sort by urgency/due time, not newest activity.",
    body: <WorkView model={toWorkViewProps(workWarehouse)} />,
  },
  {
    step: 1, slice: "all", tab: "More", name: "More", job: "Setup and desk review, never standing work",
    reads: "none [role navigation manifest]", writes: "none",
    states: DEFAULT_STATES,
    spec: "Role-filtered; hidden entries leave no gaps. Entries sit under Sales, Production, Setup and Menu headings, and an area with none of the role's entries has no heading. The rail's More group uses the same headings. Setup holds only Settings, the one home of Import, Sale channels, Locations, Team and the connections. Chat and your gravity unit are in Me, so a taproom user has no More tab. Standing work remains in Today, Beer or Work.",
    body: <MoreView model={toMoreViewProps(moreNavs)} />,
  },
  {
    step: 1, slice: "all", group: "Global", surface: "sheet", name: "Search", job: "Find permitted pages and records",
    reads: "search_entities", writes: "none",
    states: [["first use", "Type a page name, record name, or document number."], ["empty", "No pages or records found · Try a page name, record name, or document number."], ["loading", "row-shaped skeletons"], ["offline", "cached matches only", 1], ["permission", "Results honor row access"], ["document number", "ORD-0231 matches exactly and sorts first"]],
    spec: "Pages are matched by name from the same role-filtered shipped navigation as the shell and appear in their own Pages group, even while records load or fail; each shows its navigation entry's one-line description, the same line a More card shows. Before a term, the latest five opened records show as Recent, or, when there are none, a first-use hint names what to type. Entity pickers offer records only. One registered search across the entity kinds the caller's role can read; results are grouped by kind and arrow keys move between matches; filtering never widens what is permitted, and RLS decides the rows either way, so a term matching a customer the caller cannot see returns nothing rather than a redacted row. A document number (ORD-0231, INV-1042, L-240831-HZ) matches exactly and sorts above name matches, because someone typing one is holding it in their hand; names match on prefix. A number without its prefix matches every numbered kind. A kind with no detail page, such as a material, opens its list page. This is also where history lives: a run closed months ago leaves the Work list and is found here.",
    body: <SearchView model={searchPalette} />,
  },
  {
    step: 1, slice: "all", group: "Global", surface: "sheet", name: "Me", job: "Who I am, which brewery, leave",
    to: { "Maria Alvarez": "Me" },
    reads: "supabase_auth_get_session [platform] · get_first_run_state · get_gravity_unit", writes: "supabase_auth_sign_out [platform] · set_my_gravity_unit",
    states: [["dedicated mode", "switcher hidden · one brewery"], ["single membership", "switcher hidden"], ["gravity read failed", "the gravity unit section is left out"]],
    spec: "Opened from the header Me control. Brewery switcher renders only in SaaS mode with more than one membership. Your own settings live here for every role: Chat opens your Slack link and notifications, and Gravity unit is your display choice, saved on tap, with “Use brewery default” following the admin's choice in Settings. Gravity is stored in °Plato everywhere, so the choice changes only what is printed and how a typed value is read. The preview converts one sample reading into the unit in effect. Change password opens Set new password (headed Change password), as portal Me opens Portal set password: a signed-in person should not have to sign out and use the recovery flow. No notification history.",
    body: <MeView model={meMaria} />,
  },
  {
    step: 1, slice: "all", tab: "More", name: "Settings", job: "Edit brewery/location basics and route to rare setup",
    to: { "Water profiles": "Water profiles" },
    ...SETTINGS_IO,
    states: [...permitted("admin only"), ["filed basis", "ordinary field is locked · recorded correction flags every affected filed period"], ["correction history", "immutable old/new basis, actor, time and reason"], ["uncertain correction", "fields freeze · retry unchanged request"]],
    spec: "Invoices remains a first-class More and desk-rail destination. The TTB registry number is a brewery column and feeds the compliance report header; state licenses, the PA license included, live on Licenses (#1517). The customer-facing phone is the number the portal prints when online payment is unavailable, so it is collected here rather than assumed. Gravity unit under Brewery details is the brewery default, saved on tap; each person may choose their own in Me. Days to package is the brewery-wide projected packaging estimate, default 14 and whole days from 1 to 120. It adds to the actual brew date, or planned date before brewing. AI model offers the live Vercel AI Gateway language-model catalog and sets one brewery-wide Ask MGR default. Brewery details is one form saved by Save brewery. Picking an AI model or a fulfillment warehouse saves it at once; a failed save puts the picker back. After filing, the ordinary books date is locked; Correct reporting basis has its own save and immutable correction history. Deployment mode is read-only. Team opens the Team frame.",
    body: <SettingsView model={settingsDemo} />,
  },
  {
    step: 8, slice: "all", tab: "More", name: "Settings no warehouse", job: "Say why the portal has no fulfillment warehouse to choose",
    to: { "Water profiles": "Water profiles" },
    ...SETTINGS_IO,
    states: [["permission", "admin only", 1], ["no warehouse", "picker disabled · note names Warehouse in Uses · Edit locations opens Locations"], ["warehouse use removed", "a saved source no longer offered starts unchosen"]],
    spec: "Wholesale fulfillment offers only locations whose Uses include Warehouse. With none, the disabled picker says so beneath it and Edit locations opens Locations, where an admin adds Warehouse to a location's Uses. Picking a warehouse saves it.",
    body: <SettingsView model={{ ...settingsDemo, warehouseId: null, warehouseOptions: [] }} />,
  },
  {
    step: 8,
    slice: "all",
    tab: "More",
    name: "Locations",
    to: { Taproom: "Location detail", Warehouse: "Location detail", Edit: "Location detail", "See finished goods across all locations": "Finished goods" },
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
    to: { "Save location": "Locations", "Walk-in": "Bin", Cold: "Bin", Dry: "Bin", "Add bin": "Bin" },
    job: "Edit one location and work its physical bins",
    reads: "list_locations · list_bins · get_bin_move_stock",
    writes: "update_location · create_bin · update_bin · delete_bin · move_stock_bin",
    states: [["permission", "admin edits the location · warehouse or admin works the bins", 1], ["warehouse", "fulfillment source"], ["taproom", "POS and taps may map here"], ["several at once", "one building pours, stores and ships"], ["in use", "use changes preserve history"], ["timezone", "brewery zone by name · set in Settings → Timezone"], ["last bin", "a location keeps at least one · rename it instead", 1], ["has history", "a bin that ever recorded stock is renamed, not removed", 1], ["empty", "nothing stored in any bin · says so and opens Record movement for this location, in place of Move stock"], ["move unavailable", "stock but only one bin · Move stock says why", 1], ["no stock access", "staff who cannot read bin stock see the bins without counts"]],
    spec: "Location facts come first, then the location's Bins on the same page, since the bins are where the work is (#1507). A place is put to as many uses as it is actually put to: one building pours, stores and ships. Every guard asks whether a use is among them, never what the place mainly is. Uses takes several answers, and the line under it names the screens each use gates. A note says what a bin is. Each bin says how many kinds of stock it holds, or Empty. Every location starts with Walk-in, Cold and Dry. Rename or remove what doesn’t match the building, but a location always keeps one bin, so no on-hand or availability query carries a nullable branch. Bins are physical subdivisions a menu can read; they are explicitly not tap lines (§16.8). Par on a bin waits on a later schema change.",
    body: <LocationView model={toLocationViewProps(locationTaproom)} bins={<LocationBinsView model={toLocationBinsViewProps(locationBinsTaproom)} />} />,
  },
  {
    step: 1, slice: "all", group: "Global", name: "Permission denied",
    job: "A forbidden route says what was refused and offers one way back",
    reads: "none [the denied query never runs]", writes: "none",
    states: [["bookmarked", "direct URL · denied, not empty rows", 1], ["revoked mid-session", "the next command is refused; the shell stays usable", 1]],
    spec: "Plan §3: navigation and Today hide inapplicable actions while the registry and RLS still deny direct URLs and commands, so this frame exists for the URL, not for a link. It names the refusal and the role that would satisfy it, never a blank table, a spinner, or the shape of data the caller may not read.",
    body: <DeniedView model={deniedInvoices} />,
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "Page not found",
    job: "Leave an unknown address and return to Today",
    reads: "none", writes: "none",
    states: [["unknown route", "the link is wrong or out of date"]],
    to: { "Back to Today": "Today" },
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={pageNotFoundModel} />,
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "No membership",
    job: "Signed in, but this account is not on any brewery or customer",
    reads: "none", writes: "none",
    states: [["no brewery", "create a brewery on hosted MGR"], ["dedicated", "creation is hidden"], ["no customer", "contact the brewery"]],
    spec: "After sign-in with no brewery and no customer account. The queue is empty because nothing was writable.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={noMembership} />,
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "Portal staff only",
    job: "A staff login on no customer account opens the portal",
    reads: "none", writes: "none",
    states: [["staff only", "back to Today or sign out"]],
    spec: "Staff roles never open a customer's portal, so a portal page sends a staff login on no customer account here. A login that is also on customer accounts opens only those accounts. No customer picker or preview.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={portalStaffOnly} />,
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "Expired invite",
    job: "The invite link is no longer valid",
    reads: "none", writes: "none",
    states: [["expired", "sign in or recover your password"], ["wrong audience", "a customer link used on staff, or the reverse", 1], ["already a member", "sign in instead"]],
    spec: "Plan §5b. A used or timed-out token never opens Accept invite.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={expiredInvite} />,
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "Expired reset",
    job: "The password reset link is no longer valid",
    reads: "none", writes: "none",
    states: [["expired", "request a new reset link"]],
    spec: "A timed-out recovery token never opens Set new password.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={expiredReset} />,
  },
  {
    step: 4, slice: 1, group: "Global", surface: "sheet", name: "Session expired",
    to: { "Sign in to retry": "Sign in", "Record fermentation reading · FV3": "Offline outbox" },
    job: "Sign in again; queued eligible readings stay in the outbox",
    reads: "local_outbox [client state]", writes: "none",
    states: [["queue kept", "1 reading waiting"], ["signed in", "Retry 1 waiting on the outbox"]],
    spec: "Mid-write expiry does not drop an eligible frozen reading. Sign in as its original actor and brewery, then Offline outbox can retry that exact envelope. Movement, pick and transfer actions are never queued.",
    body: <SessionExpiredView model={sessionExpiredQueued} />,
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
    body: <EntryView model={signIn} />,
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "Account invitations",
    to: { "Accept invitation": "Today", "Continue": "Today" },
    job: "Consent to join using an existing account", states: DEFAULT_STATES,
    reads: "list_my_invitations", writes: "accept_account_invitation",
    spec: "Existing accounts consent before membership is granted. Expired or revoked invitations cannot be accepted.",
    body: <AccountInvitationsView invitations={[{ id: "example", breweryName: "Demo Brewing", kind: "staff", role: "sales", customerName: null, expiresAt: "2026-10-04" }]} />,
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
    body: <EntryView model={toAcceptInviteViewProps("Demo Brewing", ["warehouse"])} />,
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
    body: <EntryView model={resetPassword} />,
  },
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Set new password",
    job: "Change a password with current credentials or a verified recovery link",
    reads: "supabase_auth_get_user · supabase_auth_get_claims [platform]",
    writes: "supabase_auth_sign_in_with_password · supabase_auth_update_user · supabase_auth_sign_out [platform; membership unchanged]",
    states: [["incorrect current password", "Correct the current password or request a reset link", 1], ["mismatch", "The new passwords do not match", 1], ["recovery", "Verified recovery omits current password; sign in again after saving"]],
    spec: "Current credentials are checked before changing a password. Only Auth-verified recovery skips the old password; URL flags and metadata never do. Other sessions lose refresh access. Recovery signs out after Save.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={setPassword} />,
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
    body: <EntryView model={portalSignIn} />,
  },
  {
    step: 6,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Portal forgot password",
    to: { "Send reset link": "Portal set password", "Back to sign in": "Portal sign in" },
    job: "Recover a buyer login without saying whether the email exists",
    reads: "none",
    writes: "supabase_auth_reset_password_for_email [platform]",
    states: DEFAULT_STATES,
    spec: "The sent state is this same screen with the info. Enumeration is never confirmed.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={portalForgotPassword} />,
  },
  {
    step: 6,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Portal set password",
    to: { "Save password": "Shop" },
    job: "Change a buyer password with current credentials or verified recovery",
    reads: "supabase_auth_get_user · supabase_auth_get_claims [platform]",
    writes: "supabase_auth_sign_in_with_password · supabase_auth_update_user · supabase_auth_sign_out [platform]",
    states: DEFAULT_STATES,
    spec: "Current-password changes retain access to Order. Verified recovery signs in again on Portal sign in after Save. Need a reset link? opens Portal forgot password.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <EntryView model={portalSetPassword} />,
  },
  {
    step: 2,
    slice: 1,
    tab: "More",
    name: "Team",
    job: "Roster, staff roles, invitations and membership removal",
    reads: "list_team_members · list_pending_invitations",
    writes: "invite_staff [existing] · update_staff_role · revoke_staff · resend_account_invitation · revoke_account_invitation",
    states: [["last admin", "removing Admin refused · keep one admin", 1], ["permission", "admin only", 1], ["no pending invitations", "section hidden"]],
    spec: "A person shows their saved profile name with email beneath; when no name is saved, the full email is the identity. Roles are listed in enum order: Admin, Sales, Warehouse, Brewer, Taproom. Admin invites one staff role and can assign several roles to another member; permissions are the union of the held roles. A new account joins the roster when its invite email is sent. Pending invitations lists invitations an existing account has not yet accepted: email, role and the day sent, with no expiry; with none it says No pending invitations. Resend issues it again with the same role. Cancel confirms, then revokes it. After either, the old invitation can no longer be accepted. Removing membership leaves the sign-in account.",
    body: <TeamView model={teamRoster} />,
  },
  {
    step: 2, slice: 1, tab: "More", surface: "sheet", name: "Invite staff",
    to: { "Send invite": "Team" },
    job: "Invite one person to the staff with one role",
    reads: "none", writes: "invite_staff",
    states: [["permission", "admin only", 1], ["retry", "unchanged input keeps request identity"], ["existing account", "pending invitation; access after they accept in Invitations"]],
    body: <InviteView buyer={false} />,
  },
  {
    step: 2,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Team member",
    to: { "Save roles": "Team" },
    job: "Change one member's roles or remove that membership",
    reads: "list_team_members",
    writes: "update_staff_role · revoke_staff",
    states: [["permission", "admin only", 1], ["last admin", "keep at least one member with Admin", 1], ["no roles", "choose at least one role", 1], ["self", "remove refused", 1]],
    spec: "Choose one or more roles. Each adds its permissions; Admin already includes every staff permission. Removing Admin is a demotion even when another role remains and is refused for the last admin. Invitations still grant one role. The live form opens only for another member; removing membership leaves their sign-in account.",
    body: <TeamMemberView name="Dave Chen <dave@demobrewing.com>" avatar="/mock/dave.jpg" savedRoles={["brewer"]} />,
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
    writes: "provision_brewery [existing; authenticated pre-tenant command; service-only RPC with the verified actor: brewery + first admin membership]",
    states: DEFAULT_STATES,
    spec: "Hidden in dedicated mode, and the command refuses there for every caller; this is the pre-brewery provisioning boundary.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: <CreateBreweryView />,
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
    spec: "Admin sees this until a location and a brand both exist; adding the second of the two ends the checklist. Import and staff invitation are optional and do not block onboarding. Team and first-run use the same staff invitation form with one role.",
    body: <FirstRunView model={firstRunDemo} />,
  },
  {
    step: 3,
    slice: 1,
    group: "Desk",
    name: "Import",
    // The kind chips carry record names ("Customers", "Ship-tos"); authored
    // here so a tap selects the kind instead of resolving to those screens.
    to: { "Import 2 rows": "Import", "Back to matching columns": "Import", Customers: "Import", "Ship-tos": "Import", "Products / SKUs": "Import", "Channel prices": "Import", "Opening balances": "Import" },
    job: "Upload, match columns, review and import valid rows, each on its own",
    reads: "list_skus · list_locations · list_bins · list_customers · list_formats · list_price_groups · list_sale_channels",
    writes: "import_csv",
    states: [["upload error", "the file did not parse · nothing staged", 1], ["all invalid", "Import disabled · fix column matches", 1], ["mixed", "2 ready · 1 blocked"], ["rerun target", "same requestId returns original committed and blocked results"], ["permission", "Import requires admin", 1], ["upload", "kind chosen · friendly labels beside stable CSV keys · required, optional, or required for a US address · Download template includes one incomplete example row"]],
    spec: "The steps are Upload, Match columns, Review and Import. When every required column already matches by name, Upload offers Review directly, and Columns differ? opens Match columns. Before upload, the screen lists friendly field labels beside stable CSV keys and marks each one required, optional, or required for a US address. Download template uses a friendly filename and includes one incomplete example row with a mandatory cell blank, so it cannot import as downloaded. Review requires every mandatory column to be matched, including State for US addresses. One logical row is atomic; siblings commit independently. Reference ID cells accept a UUID or trimmed, case-insensitive exact name; missing or ambiguous names block the row. Bin names are scoped to the location, and pour formats to the price group. Product imports use packaged formats. Review is editable on phone and desk. All-invalid batches cannot be imported. Routine guidance is informational, including the retained explanation that importing opening stock in a new batch counts it twice. Same-batch retry preserves raw cells and returns original results; correction starts only blocked rows with a new identity. Reloading the same tab restores an unresolved batch; Discard saved request drops it after a confirming step and sends nothing.",
    body: <ImportView model={importPreview} />,
  },
  {
    step: 3,
    slice: 1,
    tab: "Beer",
    name: "Finished goods",
    to: { "Add SKU in Catalog": "Catalog", "Record taproom count": "Weekly count" },
    job: "See sellable beer by SKU and act on shortages",
    reads: "get_on_hand · get_atp · get_inventory_value",
    writes: "none [SKU creation happens on its own surface]",
    states: [["uncosted", "units without receipt cost are counted but not valued"], ["permission", "value total shows only for Admin and Sales"], ["short", "a negative Available says Shortfall and links to the competing orders"], ["empty", "no finished goods yet: header actions and the taproom count pointer remain"]],
    spec: "The Beer landing's Finished goods row opens this list. On hand, allocated and available sit in aligned columns on the desk and as labeled values on the phone; the SKU name opens SKU detail, and Shortfall under a negative Available opens the shortfall. The header holds the page actions. Record movement is for Admin and Warehouse; for them each active SKU's row also ends with Record movement, which opens the form with that SKU chosen. Record taproom count points to the existing Weekly count for taproom stock, not a general finished-goods count. Add SKU in Catalog is for Admin and Sales and opens Catalog, where SKUs are made. Inventory value uses frozen packaging-close cost and separately counts units without cost.",
    body: <FinishedGoodsView model={toFinishedGoodsViewProps(finishedGoodsList)} />,
  },
  {
    step: 3,
    slice: 1,
    tab: "Beer",
    name: "SKU detail",
    to: { Warehouse: "SKU detail", Taproom: "SKU detail", "Record movement": "Record movement", "Reverse movement": "Reverse movement", "+1 · Adjustment": "Reverse movement" },
    job: "See on-hand, ATP and immutable tape together",
    reads: "get_inventory_sku · get_on_hand · get_atp · list_movements",
    writes: "reverse_inventory_movement [standalone adjustment/loss only; admin or warehouse]",
    states: permitted("sales reads; admin or warehouse reverses eligible standalone adjustments/losses"),
    spec: "The SKU name on Finished goods opens inventory SKU detail with complete on-hand by location, ATP and paginated immutable history. Admin and Warehouse get Record movement in the header, opened on this SKU, and reverse only standalone adjustments and losses with a required note; the exact linked opposite retains frozen volume, class, bin and lot. Sales reads only. Count corrections live on the eligible latest saved weekly count; shipment rows retain Return shipment. This is distinct from the catalog SKU editor.",
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
    to: { "Record movement": "Finished goods" },
    job: "Enter a positive amount; the form derives direction and the server calculates barrels",
    reads: "list_skus · list_locations · list_bins · get_bin_on_hand [a chosen SKU starts on the bin holding the most of it] · get_atp · get_inventory_lot [prefilled lot code, including depleted lots]",
    writes: "record_movement [existing; one append-only inventory movement]",
    states: [["no movement type", "No movement type preselected · Still needed: movement type, beside the withheld Record movement", 1], ["incomplete", "Still needed names each missing field; the preview appears once nothing is missing", 1], ["invalid quantity", "Zero or less, or a third decimal place, is marked under Quantity once the field is left · the movement type signs it; two decimals are allowed", 1], ["no SKUs", "No SKUs yet · Add a SKU opens Catalog for Admin · Warehouse is told who adds them", 1], ["offline", "Wait for a connection; movements are never queued"], ["stale", "ATP changed · preview again", 1], ["permission", "admin or warehouse required · sales reads Beer only", 1], ["saved", "the form closes and a toast reads the receipt line: signed quantity, SKU, kind, state, frozen volume, bin and lot · the ledger lists the row"], ["stocked SKU", "choosing a SKU starts on the bin holding the most of it"], ["unregistered destination", "Stout to OH warns and links to the registry · never blocks", 1]],
    spec: "The form derives the signed API quantity from the movement kind (adjustments ask Add or Remove); the server derives 0.50000000 bbl and never accepts client-supplied barrels. It requires a live connection and is never put in the offline outbox. Drawn with festival removal selected: sample and festival removal leave the premises and require a destination state (the schema enforces it); destruction, loss and depletion never carry one. An unregistered brand and destination warn here with the same copy the order screens use, because a festival removal leaves the premises exactly as a shipment does and was the one path that crossed a state line without saying so. This frame carries Hazy IPA into PA, which is registered, so the warning is a state rather than drawn copy. Channel stays.",
    body: (<>
      <RecordMovementView model={toRecordMovementViewProps(recordMovementFestival)} footer={null} />
      {E.pin(<>{E.btn("Record movement", "irr")}</>)}
    </>),
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
    body: <SearchView model={entityPickerPalette} />,
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer proposal",
    to: { "Preview current data": "Composer proposal", "Open as form": "Record movement", Dismiss: "Today", "Commit movement": "Composer proposal" },
    job: "A chat request becomes a canonical server preview; signed effect leads",
    reads: "list_skus · list_locations · list_bins · list_sale_channels · get_bin_move_stock · preview_command [internal query, not an AI tool]",
    writes: "record_movement [Commit; same requestId + previewToken; server revalidates]",
    states: [["editing", "Any field edit removes the proposal and Commit", 1], ["stale", "Reject and preview current data", 1], ["permission", "No proposal beyond allowed role", 1]],
    spec: "The user starts with a normal chat message. The Gateway conversation collects exact fields before preview. The preview query is internal, never a model-executed write; the proposal contains only its canonical effects and warnings.",
    body: <>
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">Record one half-barrel keg of Hazy IPA as taproom depletion.</div>
      <ComposerProposalView
        effects={[{ label: "Hazy IPA · ½ bbl keg · Taproom · Walk-in", qty: "-1", bbl: "-0.50000000", stockBeforeQty: "3", stockAfterQty: "2", taxTreatment: "taxable", correction: "reverse_inventory_movement" }]}
        warnings={[]}
        openHref="#"
        openTo="Record movement"
        onCommit={() => undefined}
      />
    </>,
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer setup",
    surface: "composer",
    to: { "Retry setup": "Composer setup", "Back to page": "Today" },
    job: "Open your latest conversation, or start your first, before you can type",
    reads: "list_chat_conversations · get_chat_history",
    writes: "create_chat_conversation [first open only; one request id across retries]",
    states: [["opening", "pulsing bar · Retry setup · input disabled"], ["timed out", `after ${COMPOSER_SETUP_TIMEOUT_MS / 1000} seconds: ${COMPOSER_SETUP_TIMEOUT_MESSAGE} · Try again`, 1], ["failed", "the server's message · Try again", 1]],
    spec: `Setup restores the latest conversation and its history, or creates one. A stalled load ends after ${COMPOSER_SETUP_TIMEOUT_MS / 1000} seconds in the failure alert. Try again re-runs setup with the same create request id, so a retry never makes a second conversation.`,
    body: <><ComposerConversationView messages={[]} activity={COMPOSER_SETUP_ACTIVITY} onSetupRetry={() => undefined} /><ComposerStripView disabled /></>,
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer question",
    surface: "composer",
    to: { "New chat": "Composer question", "Back to page": "Today" },
    job: "Ask one exact follow-up in the conversation; no Commit until every required field is known",
    reads: "list_skus · list_locations · list_bins · list_sale_channels · get_bin_move_stock",
    writes: "none",
    states: [["missing SKU", "structured picker · no Commit"], ["resolved", "Preview movement becomes available"]],
    spec: "The Gateway conversation asks for the first missing exact field. This state asks for the exact SKU / package and exposes no inferred candidate language or Commit verb.",
    body: <><ComposerConversationView messages={[
      { id: "question-user", role: "user", content: "We blew a half of Hazy." },
      { id: "question-assistant", role: "assistant", content: "Which SKU / package: Hazy IPA · ½ bbl keg or Hazy IPA · case?" },
    ]} /><ComposerStripView /></>,
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer answer",
    surface: "composer",
    to: { "Shortfall detail": "Pars and allocation", Review: "Pars and allocation", "New chat": "Composer answer", "Back to page": "Today" },
    job: "Questions use named registered queries",
    reads: "get_atp · get_shortfalls",
    writes: "none",
    states: [["loading", "answer skeleton"], ["not configured", "message box disabled; contact administrator", 1], ["provider access denied", "check provider access and credits; no retry", 1], ["rate limited", "wait, then Try again", 1], ["provider unavailable", "temporary outage; Try again", 1], ["offline", "check connection; chat messages are not queued", 1], ["unknown failure", "safe guidance; no blind retry", 1]],
    spec: "Navigate / Ask MGR in the header opens a right-side overlay on desktop and full-screen chat on phones. Navigate, Back to page, or Escape closes it without discarding drafts, messages, or an active response. The page keeps its width and scroll position. Phone focus stays in chat; opening by touch does not open the keyboard. HTTP and stream failures use the same safe error codes. Only transient failures offer Try again; provider-access denials do not. Ordinary forms and saved readings remain available when AI fails.",
    body: <><ComposerConversationView messages={[
      { id: "answer-user", role: "user", content: "How much Hazy is available to promise?" },
      { id: "answer-assistant", role: "assistant", content: "11 × ½ bbl plus 40 cases are currently available to promise. Observed Sep 10, 2026, 10:00 AM." },
    ]} /><ComposerStripView /></>,
  },
  {
    step: 4,
    slice: 1,
    group: "Global",
    name: "Unresolved requests",
    to: { "Retry saved request": "Unresolved requests", "Discard saved request": "Unresolved requests", "Confirm discard": "Unresolved requests", "Keep saved request": "Unresolved requests" },
    job: "Recover the result of a form submission whose response was lost",
    reads: "sessionStorage [original actor, brewery, customer and frozen request]",
    writes: "none [explicit retry replays the original command identity]",
    states: [["reload", "Saved input survives in the same browser tab"], ["edited", "Resolve the saved request before submitting the same action on the same record", 1], ["other row", "A row action (price, invoice push, menu item, delete) on a different row proceeds"], ["discard", "After a confirming step the saved request is dropped and nothing is sent", 1], ["other account", "Requests remain isolated to the original account and brewery", 1]],
    spec: "Shared command forms save an unresolved request before transport. A saved request blocks the same command on the same record. Row actions (prices, invoice pushes, menu items, deletes, edits to an existing row) name their row, so other rows proceed; other commands wait until the saved request is retried or discarded. A request still being sent from this tab is not listed, so it cannot be discarded mid-flight. Reads and one-time link proofs are never saved. An uncertain response freezes its input and identity until exact recovery succeeds or the user discards it. Retry is explicit, never automatic. Discard asks for confirmation, sends nothing, and tells the user to check the result first. Invitations use the same lifecycle. CSV imports recover on Import; specialized portal, count, completion and composer recovery remain separate.",
    body: <CommandRecoveryView rows={[{ requestId: "saved-request", name: "record_movement", input: { qty: 2, note: "Opening stock" }, path: "/inventory" }]} />,
  },
  {
    step: 4,
    slice: 1,
    group: "Global",
    name: "Offline outbox",
    to: { "Retry exact reading": "Offline outbox", "Retry 1 waiting": "Offline outbox", Fix: "Fermentation reading", Discard: "Offline outbox", "Discard 2 queued readings": "Offline outbox", "Record fermentation reading · FV3": "Fermentation reading", "Record fermentation reading · FV2": "Fermentation reading", Dismiss: "Offline outbox" },
    job: "Retry an exact captured reading without broadening offline writes",
    reads: "local_outbox [client state]",
    writes: "none [client replays envelope’s exact registered command with same requestId; confirmed discard is local]",
    states: [["response lost", "Server dedupe returns the prior reading"], ["permanent", "Fix opens a reviewed fresh reading; original stays queued", 1], ["session expired", "Sign in; keep queue"], ["permission changed", "the row says why and offers only Discard", 1], ["one row", "discarding one leaves sibling readings queued"], ["set aside", "unreadable saved reading set aside unsent · Dismiss", 1]],
    spec: "Only fermentation readings are eligible. Their captured observation time, parsed values, occupancy, actor, brewery, role and request ID are persisted before transport and reused exactly. Movement, pick and transfer commands require current server state and never enter this outbox. Named discard confirmation works per row or in bulk; Fix starts a reviewed fresh ID without silently deleting an uncertain original. A saved entry that can no longer be read is set aside unsent, readable siblings stay queued, and a notice says so until Dismiss deletes the set-aside copy.",
    body: <OfflineOutboxView notice="1 unreadable offline reading was set aside and not sent. Re-enter it if still needed." onDismissNotice={() => {}} rows={[
      { id: "reading-fv3", label: "Record fermentation reading · FV3", status: "response not confirmed", retryable: true, fixHref: "#", fixTo: "Fermentation reading" },
      { id: "reading-fv2", label: "Record fermentation reading · FV2", status: "your role changed from brewer · this will not be sent" },
    ]} />,
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
    states: [["filtered", "Status set to one state; a customer scope adds a Customer line with Clear"], ["empty", "no orders in this state: New order stays available"], ["loading", "inline status on first visit; cached rows remain during refresh"], ["error", "inline error and Try again; existing rows remain"]],
    spec: "The Work list with the Orders tab active, drawn as a register: Order (the number, its one link), Customer, Requested ship date (Not scheduled when none), Status with a Restock staged badge, and the next valid action when it is more than Open. On a phone the same facts are labeled under the order number. A labeled Status pick replaces the state tabs and keeps the customer scope; Clear drops only the customer. New order opens the order-entry page. Order and Confirm order return here. OrdersView's listStatus and feedback slots use shared QueryFeedback: first-load text without skeletons, Last checked with Updating during refresh, and last-known data with connection or retry feedback. The visible list checks every five seconds and on tab return or reconnect; hidden and unmounted lists do not poll.",
    body: <OrdersView model={toOrdersListViewProps(ordersWorkList)} feedback={<QueryFeedback timeZone={DEMO_TIME_ZONE} updatedAt={Date.parse("2026-09-13T12:00:00Z")} />} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Confirm order",
    job: "Confirm a submitted order in two taps from Today",
    reads: "get_order · get_atp",
    writes: "confirm_order · adjust_order_lines [submitted: replaces lines; allocations wait for confirm] · cancel_order",
    states: [["loading", "order-shaped skeleton"], ["stale", "line changed · refresh", 1], ["permission", "sales or admin required", 1], ["cancelled", "staged quantities become restock work · Put back clears it"], ["Available below zero", "confirmed anyway: Order confirmed · Available is below zero for … · quantities read-only · Back to order"]],
    spec: "2 taps from Today: Confirm → Confirm order, only when no blocking review exists. Lines sit under their brand, each named by its format, with the quantity as a number field: editing one asks for a Reason and swaps the verbs for Save lines and Discard changes. Confirm order stays at the bottom of the phone screen; Cancel order is the order page's quiet trigger below it. The registration warning is the same one the Order screen shows; it links to the brand’s compliance rows and never blocks.",
    to: { "16 oz case": "SKU detail" },
    body: <ConfirmOrderView model={toConfirmOrderViewProps(orderSubmittedRidgeline)} fulfillmentOptions={[LOC_WAREHOUSE.name, LOC_TAPROOM.name]} complianceNote={OHIO_STOUT_NOTE} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Order",
    to: { "Record pick": "Pick", Ship: "Ship and invoice", "Put back": "Put back", "Edit draft": "Edit draft", "Cancel order": "Orders" },
    job: "The staff home for one order: state, next action, lines, events, restock",
    reads: "get_order · get_atp · get_order_cogs · get_order_email_status [Admin/Sales: confirmation email states]",
    writes: "submit_order · set_order_pickup [Admin/Sales: unshipped wholesale only; no line or allocation changes] · adjust_order_lines [picked: an added or raised line sends the order back to confirmed for a re-pick; staged excess sets needs_restock] · cancel_order [needs_restock while quantities are staged] · reorder_refused_delivery [one editable draft for refused quantities with original PO and note; the history then names it]",
    states: [["draft", "Edit draft corrects headers and lines; Submit advances the order"], ["confirmed / picked", "Admin and Sales change, add (Add line) and remove (✕) lines in place with a required Reason; restock rows appear when picked qty exceeds ordered; a save leaving a SKU below zero available still saves: Lines saved · Available is below zero for … under the lines"], ["changed after pick", "count only the added or raised lines · the rest is already staged", 1], ["shipped", "read-only tape · Return shipment is the correction · Cost line for Admin and Sales: frozen lot cost, returns netted, margin on the order-line prices; units without a receipt cost are counted and the margin is withheld"], ["shipped · stop delivered", "the route stamped the stop; the order stays shipped · read-only, Return shipment still corrects"], ["stale", "another user changed a line · refresh", 1], ["permission", "sales or admin to adjust and see Cost; warehouse reads", 1]],
    spec: "Drawn as picked after a line was adjusted down: staged 3 Pils cases must go back to Warehouse. Adjusting down, shipping short and cancelling all set the restock flag; Put back is what clears it. Shipped is the last lifecycle state: Confirm delivery on the route stamps the stop, not the order, and no verb here sets it. Ship opens Ship and invoice rather than committing here. Cancel is destructive and asks for confirm. Every transition appends an order event row in the same RPC. A submitted order has no direct Confirm here: Review and confirm opens Confirm order, so stock and source warnings show before commit (#713). Lines change in place, not on a separate page: Ordered is a number field, ✕ removes a line, and Add line appends one that picks its SKU; any change asks for a Reason and saves the full line set in one RPC. On a picked order an added or raised line is unpicked work: the order returns to confirmed with that line uncounted and a changed-after-pick marker, and Ship stays hidden until Pick counts it.",
    body: <OrderView model={toOrderViewProps(orderPickedRestock)} pickup={{ value: false }} actions={<>{E.btn("Ship", "g")}{E.btn("Record pick", "g")}</>} lineEdit={{ skus: [], added: [] }} complianceNote={OHIO_STOUT_NOTE} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Order draft",
    to: { "Edit draft": "Edit draft", Submit: "Order", "Cancel order": "Orders" },
    job: "Review and edit a saved draft before submission",
    reads: "get_order",
    writes: "submit_order · set_order_pickup [Admin/Sales: unshipped wholesale only] · cancel_order",
    states: [["draft", "Edit draft and Submit available to Admin and Sales"]],
    spec: "Draft variant of Order. The picked/restock frame remains separate; Edit draft opens the shared saved-order editor.",
    body: <OrderView model={toOrderViewProps({ ...orderPickedRestock, emailStatuses: [], order: { ...orderPickedRestock.order, status: "draft", needs_restock: false }, lines: orderPickedRestock.lines.map(line => ({ ...line, qty_picked: null, qty_shipped: null, one_way_fee_cents: null })), deposits: [], events: [], atp: [] })} pickup={{ value: false }} actions={E.btn("Submit")} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Edit draft",
    job: "Correct a saved draft before submission",
    reads: "get_order · get_customer · list_skus",
    writes: "update_draft_order",
    states: [["draft", "saved headers and lines prefilled"], ["incomplete line", "Save draft disabled until fixed or removed", 1], ["permission", "Admin and Sales only", 1], ["submitted", "returns to the order; editing refused", 1]],
    spec: "The shared page editor changes ship-to, requested ship date, customer PO, Pickup and lines. Customer, kind and fulfillment locations stay fixed. Saving keeps draft status and refreshes line prices; clearing the requested date explicitly removes it. Inventory simulates saving locally, while staff calls the existing authorized draft command.",
    body: <EditDraftOrderView model={editDraftOrder} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    surface: "sheet",
    name: "Short pick",
    sheetTitle: toShortPickViewProps(orderShortPick).title,
    to: { "Adjust order to 7 cases": "Pick" },
    job: "Resolve one short line before the pick can finish",
    reads: "get_order",
    writes: "resolve_short_pick [one RPC: short_reason + adjusted line qty + allocation + order_events row]",
    states: [["permission", "warehouse or admin required", 1], ["adjust down", "ordered 10 → 7 · allocation shrinks · ATP recovers · missing 3 cancelled"], ["zero count", "ask Sales or Admin to remove the line or cancel the order", 1], ["put back pending", "staged beer waits for Put back · adjustment refused", 1], ["stale", "another picker changed this line · recheck", 1], ["offline", "adjustment waits for live ATP", 1]],
    spec: "Opens from a Pick line whose count is below ordered, as a sheet over Pick; saving closes it and Pick reloads the adjusted line, so counts typed on other lines stay. A reason and a positive short count are required. Adjust order to N makes the count the order and releases the missing quantity's allocation. The preview says the missing quantity is cancelled, not backordered. A zero count directs staff to Sales or Admin to remove the line on the order, or cancel the order when no lines remain. Done picking completes afterward on the Pick frame.",
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
    states: [["permission", "warehouse or admin required", 1], ["short pick", "a line below ordered opens the Short pick frame", 1], ["partly picked", "reopened after a short count · counted lines start at what was picked"], ["short stock", "the source holds less than ordered · Ordered says Only N available · the count still starts at ordered", 1], ["invalid count", "blank, negative, above ordered or exponent notation · named under the field · Done picking says why it waits", 1], ["concurrent", "another picker changed qty"], ["cancelled", "staged · restock now", 1], ["offline", "queue whole pick set once"]],
    spec: "2 taps from Today: Pick → Done picking (all-as-ordered only). The sheet is just the order: one table row per SKU (Format · Product · Ordered · Actual), grouped by package format then brand name, with the format named once on its first row, under the customer and ship date. Brands keep their staff aliases. Shortage is not a chip here: entering a count below ordered opens Short pick.",
    to: { "16 oz case": "SKU detail" },
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
    reads: "get_order · get_order_ship_sources",
    writes: "ship_order [explicit bin/lot source quantities sum to every line; needs_restock when any qty_shipped < qty_picked; returnable keg lines post Shipped shells and warn, never refuse, when recorded shells are short; invoice timing = now persisted with the shipment; each line below picked carries its shortage reason, saved on the line in the same transaction]",
    states: [["stale", "picked qty changed · preview again", 1], ["short ship", "qty below picked needs a reason; remainder is released", 1], ["no reason", "a short line without a reason is refused", 1], ["offline", "wait for live recheck", 1], ["permission", "warehouse or admin required", 1], ["accepted", "INV number on commit · restock row if qty short"]],
    spec: <>Ship qty prefills from picked and is editable per line; a shortage reason appears under each line whose qty &lt; picked, prefilled with the reason saved at short pick so an unchanged one is not retyped; it is saved on the line, where the order and the buyer’s portal show it. The same condition sets the restock flag, so the case released here becomes a Put back row rather than staying staged with nothing naming it. Carrier/tracking never block the commit. The preview names the destination state from the ship-to and says the invoice number is assigned on commit. On-delivery timing lives on Ship · confirmation; taproom transfers use Complete transfer.</>,
    body: <ShipView sources={<ShipmentSourcesView {...shipmentSources(orderShipInvoice.lines)} />} model={toShipViewProps(orderShipInvoice)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Shipment done",
    job: "The invoice number after a ship, and the named correction",
    reads: "get_order · get_invoice",
    writes: "none",
    states: [["permission", "warehouse or admin required", 1], ["accepted", "INV number on the tape"], ["short", "restock row on Today"], ["kegs short", "saved warning names the short pool, size and shipping location", 1]],
    spec: "Post-commit of Ship and invoice. Recorded shell shortages appear as reconciliation warnings; shipping is not refused for shells. A tape means recorded; a line shipped short names its saved reason after short:. Return shipment is the correction: live, it opens the invoice's Return page; deferred to delivery, it waits for the invoice delivery raises. A delivery order on no route offers Add to route, which opens New route with this shipment ticked; a pickup order does not. Ship stays on this result; Open order goes on to the order.",
    body: <ShipmentDoneView model={toShipmentDoneViewProps(orderShipmentDone)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Ship on delivery",
    to: { "Ship order": "Shipment done" },
    job: "The On delivery state of Ship and invoice",
    reads: "get_order · get_order_ship_sources",
    writes: "ship_order [returnable keg lines post Shipped shells and warn, never refuse, when recorded shells are short; invoice_timing = on_delivery persisted on the shipment; the same one RPC without the invoice; confirm_delivery invoices later; a line below picked carries its shortage reason]",
    states: [["stale", "picked qty changed · preview", 1], ["offline", "wait for live recheck", 1], ["permission", "warehouse or admin required", 1]],
    spec: "Folded into Ship and invoice as the On delivery chip. Same fields as Invoice now; the timing is saved on the shipment so Confirm delivery can invoice later. Two screens both titled Ship was confusing.",
    body: <ShipView sources={<ShipmentSourcesView {...shipmentSources(orderShipOnDelivery.lines)} />} model={toShipViewProps(orderShipOnDelivery)} invoiceTiming={1} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Complete transfer",
    to: { "TRF-0088": "Order", "ORD-0088": "Order" },
    job: "Finish a taproom transfer order: same movements, no invoice",
    reads: "get_order · get_order_ship_sources",
    writes: "ship_order [explicit source and destination bins preserve lot; taproom_transfer kind: paired taproom_transfer movements (−source, +destination); no invoice]",
    states: [["stale", "picked qty changed · preview again", 1], ["short", "qty below picked releases the remainder"], ["permission", "warehouse or admin required", 1], ["accepted", "taproom on-hand rises immediately"]],
    spec: "No invoice-timing chip and no destination state: beer moves between the brewery’s own locations. Copper because the paired movements are append-only. Requested from Taproom · Needs replenishment.",
    body: <CompleteTransferView sources={<ShipmentSourcesView {...shipmentSources(orderTransferComplete.lines)} destinationBins={[{ id: "taproom-cooler", name: "Taproom cooler" }]} />} model={toCompleteTransferViewProps(orderTransferComplete)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Transfers",
    to: { Pick: "Transfer detail", Receive: "Transfer detail", "New transfer": "New transfer", "TRF-0007": "Transfer detail", "TRF-0006": "Transfer detail" },
    job: "Move stock between two locations without an order or an invoice",
    reads: "list_stock_transfers · list_locations · list_bins · list_skus",
    writes: "create_stock_transfer",
    states: [["empty", "New transfer is the only action"], ["submitted", "Pick is next"], ["picked", "Receive writes the paired movements"], ["permission", "warehouse or admin required", 1]],
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
    job: "Create a stock transfer: two locations, a bin at each end, SKU lines",
    reads: "list_locations · list_bins · list_skus",
    writes: "create_stock_transfer",
    states: [["permission", "warehouse or admin required", 1], ["same location", "refused · use a bin move", 1], ["empty lines", "Create transfer stays off until one SKU has a qty"]],
    spec: "Opens from Transfers · New transfer. Materials and kegs move through the same command from the API; this sheet draws the SKU case. Bins default to the first bin at each location. There is no draft: Create transfer submits it, and Receive is next.",
    body: <NewTransferView model={toNewTransferViewProps(newTransferDraft)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Transfer detail",
    to: { Transfers: "Transfers", Receive: "Transfer detail", "Cancel transfer": "Transfer detail", "TRF-0007": "Transfers" },
    job: "One next verb: Receive the paired movements; or cancel it with a reason",
    reads: "get_stock_transfer",
    writes: "record_stock_transfer_pick · receive_stock_transfer [one RPC: paired location_transfer movements, no invoice] · cancel_stock_transfer",
    states: [["submitted", "Receive records the pick at the requested qty, then receives · no separate pick step"], ["picked", "Receive is irreversible"], ["received", "read-only tape · the stock has changed place"], ["cancelled", "the reason shows · picks released, nothing moved"], ["permission", "warehouse or admin required", 1]],
    spec: "Not Complete transfer: that ships a taproom replenishment order. Receive posts both ledger halves or neither. No invoice. Cancel transfer asks for a reason and is offered until the transfer is received: a pick never leaves the source bin, so cancelling releases the picks and moves nothing, which is how a transfer that can never balance at receipt is closed out.",
    body: <TransferDetailFixture><TransferDetailView model={toTransferDetailViewProps(transferDetailSubmitted)} /></TransferDetailFixture>,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Pick sheet",
    to: { Pick: "Pick" },
    job: "Group confirmed demand by ship date",
    reads: "daily_pick_sheet [confirmed orders by requested ship date, one fulfillment source]",
    writes: "none",
    states: [["day chosen", "confirmed orders requesting that ship date"], ["totals", "read-only · what to bring to the floor in one trip"], ["empty", "nothing confirmed for that day"], ["changed after pick", "the row carries the marker · count only the added or raised lines", 1], ["mixed sources", "one source at a time · a Taproom order is not on the Warehouse sheet", 1]],
    spec: "A staging aid, not a command surface: nothing here writes, and a row opens that order's Pick, which is where counting happens. Each ship date shows its order count, with Orders and Totals side by side on wide screens and stacked on smaller screens and in print. Totals group by package format then brand name, with each format named once and brand aliases retained. They show all ordered quantities, including picked orders, not quantities left to pick. They are read-only because a total spans orders and picking is per-order. A changed-after-pick row reminds the picker to count only the added or raised lines. Scoped to one fulfillment source, since a sheet mixing Warehouse and Taproom lines would send someone to the wrong room.",
    body: <PickSheetView model={toPickSheetViewProps(pickSheet)} filters={E.chips(PICK_SHEET_DATE_CHIPS, 1)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Weekly count",
    to: { "Hazy IPA": "SKU detail", Pils: "SKU detail", "Print current stock labels": "Weekly count", "Record count": "Weekly count", "Correct count": "Weekly count", "Count worksheet": "Weekly count" },
    job: "Record every physical stock bucket and compare the draft with expected brand consumption",
    reads: "get_taproom_count_snapshot · get_taproom_print_labels · get_taproom_draft_projection · list_taproom_counts · get_taproom_count · list_locations",
    writes: "record_taproom_count · correct_taproom_count [Admin only; latest uncorrected root; changed quantities in either direction]",
    states: permitted("taproom, warehouse or admin required").concat([["unknown response", "timeouts and 5xx freeze every quantity and retry the same request", 1], ["stale", "changed stock or brewery date starts a fresh blank recount", 1], ["no POS", "expected stays blank; the physical count still records"], ["matching", "durable receipt with every observation and no movement"], ["corrected", "one logical history row shows the effective receipt and correction audit"], ["correction permission", "Admin only on the latest uncorrected root", 1]]),
    spec: "The physical count is the source of truth. Shortages default to Sold; Destroyed posts destruction with no channel or tax facts. Matching Sold is a no-op; matching Destroyed is refused. One choice applies to each bin/SKU/lot bucket and freezes with the request. Destroyed lines cannot be corrected; mixed counts retain their sold-line correction. Every bin/SKU/lot-or-untracked bucket is entered explicitly in whole packaged units; omitted zeros, fractions, inferred allocation and overcounts are refused. Buckets list by SKU, then bin, name; each starts empty, and its Same as recorded fills that one bucket with the recorded quantity. Taproom sees the full worksheet row number on every tracked bucket instead of raw lot identifiers on screen; an untracked bucket shows no row number; all three count roles can print the current positive-stock worksheet through one checked projection with lot codes, stable original row numbers, and no history. Print rechecks the captured revision and refuses stale stock without changing count entries or uncertain retries. The draft keeps and links the captured prior-count identity/date. Brand expectation refreshes independently and never replaces the captured stock revision; if its baseline changed, comparison and inputs lock until an explicit fresh recount. A brand with no expectation draws no comparison row. Draft actual groups explicit bucket depletion using captured package volumes; it and expected-minus-actual stay blank until every existing bucket for that brand is entered, while a projected brand with no physical bucket has zero actual. Both remain labeled as estimates until the authoritative receipt is saved. A timeout or 5xx response freezes request ID and payload for exact retry; a definitive first validation failure is editable. Changed stock or an expired brewery date offers a fresh blank recount. Saved receipts include safe bin/SKU labels for every observation beyond list-query caps, and the newest 50 logical root headers remain readable even when every line matched and no movement was posted. Admin can correct only the latest uncorrected root when at least one sold quantity was counted too low or too high, from zero through the frozen quantity before that count. Formerly matching sold lines can be reduced; lower corrections cannot take current bucket stock below zero. The replacement keeps every original bucket and observation time, appends signed ledger entries in the correction period, and leaves the original receipt immutable. History and the receipt show the effective count plus who corrected it, when, and why. Warehouse and Taproom can read that audit but never see the correction action. An uncertain response freezes the correction reason, quantities, request ID, and payload for exact retry.",
    body: <WeeklyCountFixture><WeeklyCountView model={weeklyCount} /></WeeklyCountFixture>,
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Variance by brand",
    to: { "Hazy IPA": "SKU detail" },
    job: "Where the gap between poured and counted keeps showing up",
    reads: "list_locations · get_taproom_variance",
    writes: "none · Recurring brand trend [SCHEMA-GATE: post-v1 scope; the report has no brand-by-period trend projection]",
    states: permitted("taproom, warehouse or admin required").concat([["no POS", "expected stays blank; actual count depletion remains visible", 1], ["first count", "actual is shown without a comparison"], ["incomplete coverage", "mapped expected and variance remain visible; coverage is labeled incomplete"], ["unmapped", "mapped facts remain visible with the gap named"], ["not in inventory", "expected shares are explicitly excluded"]]),
    spec: "Variance is drawn twice on purpose. Inline on the draft count it can catch a miscount; this completed-period page shows whether a difference repeats. Expected comes from frozen POS serving facts, actual from frozen sold count depletion, and variance is expected minus actual. Destroyed volume is reported separately by brand and completed period. The comparison is reported and never posted. Whole periods use exact (prior count, current count] timestamps and are selected by their ending brewery-local date. First-count, absent or incomplete coverage, unmapped facts, excluded expected shares, unattributed volume and report as-of remain visible. Null stays unknown; zero is read alongside coverage and excluded consumption. Kegs outside inventory exclude only their expected share; count-derived actual remains intact.",
    body: <TaproomVarianceView model={taproomVariance} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Pars and allocation",
    to: { "Create replenishment order": "Order" },
    job: "Replenish a taproom and review reservations across all locations",
    reads: "list_locations · list_skus · replenishment_suggestions · get_shortfalls · list_standing_allocations",
    writes: "create_replenishment_order · release_allocation · set_taproom_par · set_standing_allocation",
    states: [...DEFAULT_STATES, ["no taprooms", "add a taproom under Locations"], ["no pars", "no suggestions for this taproom"], ["no shortfalls", "no current global shortfalls"], ["no standing allocations", "none reserved for this taproom"], ["missing source", "no other Warehouse location; creation remains unavailable"], ["filtered SKU", "only global shortfalls are filtered; its reservation detail starts open"], ["read-only", "Warehouse sees quantities but no mutation controls"], ["Available below zero", "a standing allocation saved past availability: Allocation saved · Available is below zero for … · Done"]],
    spec: "Replenishment has one page title and three sections: Taproom replenishment, Standing allocations, and Shortfalls across all locations. Location and From warehouse precede the editable SKU table. Numeric and SKU-name sorting retains the browser's last choice; draft quantities stay with their SKU. Shortfall reservation details expand only when reviewed, and a Finished goods SKU filter does not narrow the taproom's suggestions. Par and standing-allocation edits remain named quantity changes, never priorities; release changes ATP without moving stock.",
    body: <ReplenishmentDemo><ReplenishmentView model={replenishmentDemo} fromLocationId="" qtys={{}} /></ReplenishmentDemo>,
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Return and credit",
    to: { "Return shipment": "Order" },
    job: "Return beer and correct money atomically",
    reads: "get_invoice · get_invoice_return_sources · list_bins",
    writes: "return_shipment [one RPC: return_in movements at explicit destination + loss for damaged beer + credit memo at invoice prices; full kegs return shells automatically; deposit-only refunds optionally check in empty kegs in the same transaction and otherwise need no location or reason]",
    states: [["permission", "admin or sales required", 1], ["unsold", "returns as sellable stock at the chosen destination"], ["damaged", "returns, then posts loss in the same RPC · never re-sold", 1], ["wrong item", "sellable · the mis-picked SKU goes back on the shelf"], ["invoice paid", "the credit memo sits unapplied as available credit", 1], ["partial", "only the returned units credit back"]],
    spec: "Reason decides the beer, never the money. Unsold and wrong item return as sellable stock; damaged returns post loss in the same RPC. Credit uses the original invoice prices. Deposit-only refunds ask for no beer disposition. Check in empty kegs with this refund optionally adds receiving location and bin and records Returned shells atomically. Leave it off when shells were already returned. Full beer returns already include their shells. A paid invoice's credit remains available credit.",
    body: <ReturnCreditView sources={<ReturnSourcesView groups={[{ key: "l-hazy", name: orderReturnCredit.lines[0].skus?.name ?? "Line", sources: [{ id: "shipped-hazy", label: "L-240831-HZ · shipped from Cooler", shipped: 4 }] }]} quantities={{ "shipped-hazy": "1" }} />} bins={[{ id: "cooler", name: "Cooler" }]} binId="cooler" model={toReturnCreditViewProps(orderReturnCredit)} />,
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
    states: [...permitted("sales or admin required"), ["pricing loading", "Loading customer-priced SKUs; no empty claim"], ["pricing offline", "Waiting for connection; resumes on reconnect"], ["pricing failed", "error and Try again; cached choices marked last-known", 1], ["pricing empty", "no active SKUs priced for this customer; check Price groups"], ["customer changed", "unavailable selections keep quantities and labels; replace or remove before saving", 1], ["empty catalog", "names what is missing; links Customers (wholesale only) and Catalog, never Locations, which only an admin adds"], ["past date", "a Requested ship before brewery-local today warns; Save draft still works"]],
    spec: "Source is required and becomes the order's from-location; the app never guesses “Warehouse.” Save draft lands on the Order screen, where Submit lives. The shared QueryFeedback sits below the heading: Updating preserves inputs, and connection or retry feedback identifies last-known data without a Last checked timestamp on the unsaved form. Visible customer, location and SKU options refresh every 30 seconds and on tab return or reconnect, without resetting the draft. Offline, error and empty states are supplied through the shared feedback contract rather than additional fixture frames. Customer pricing uses the same feedback below the PO field and inside Select SKU: initial loading, paused connection, failed read with Try again, and last-known cached choices stay distinct from a successful empty list. A customer change preserves quantities and selections; an unavailable SKU keeps its label and a visible warning until replaced or removed. Save draft cannot count or submit an unavailable selection.",
    body: <NewOrderView model={toNewOrderViewProps(newOrderDraft)} feedback={<QueryFeedback timeZone={DEMO_TIME_ZONE} showCheckedAt={false} updatedAt={Date.parse("2026-09-13T12:00:00Z")} />} />,
  },
  {
    step: 5, slice: 1, tab: "Work", name: "New order pricing loading",
    job: "Wait for the customer's priced SKU choices", reads: "list_skus", writes: "create_order",
    states: [["pricing loading", "first read; Save draft waits"]],
    spec: "The first customer pricing read shows loading feedback, never an empty claim. Save draft waits for the choices.",
    body: <NewOrderView model={{ ...toNewOrderViewProps(newOrderDraft), skus: [] }} skuOptionsReady={false} skuFeedback={<QueryFeedback timeZone={DEMO_TIME_ZONE} loading="Loading customer-priced SKUs" />} disabled />,
  },
  {
    step: 5, slice: 1, tab: "Work", name: "New order unavailable SKU",
    job: "Repair a retained SKU after changing customers", reads: "list_skus", writes: "create_order",
    states: [["customer changed", "replace or remove the unavailable selection", 1]],
    spec: "Unavailable selections keep their labels and quantities. Replace the SKU or remove the line before saving.",
    body: <NewOrderView model={{ ...toNewOrderViewProps(newOrderDraft), skus: [], lines: toNewOrderViewProps(newOrderDraft).lines.map(line => ({ ...line, skuError: "This SKU is unavailable for this order. Choose an available SKU or remove this line." })) }} reason={submitReason(["an available SKU on each line"])} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Customers",
    job: "Manage accounts, addresses and portal users",
    reads: "list_customers · get_customer",
    writes: "invite_customer_user [existing] · upsert_customer · upsert_ship_to",
    states: DEFAULT_STATES,
    body: <CustomersView model={toCustomersViewProps(customersList)} search={<ListControls search={{ label: "Search customers", value: "", keep: {} }} />} />,
  },
  {
    step: 5, slice: 1, tab: "More", name: "Customers missing email",
    job: "Review customer accounts without a current portal login email",
    reads: "list_customers [missingPortalEmail]",
    writes: "none [Invite and Remove access on Customer detail correct portal access]",
    states: [["permission", "sales or admin required", 1], ["missing", "no current portal login has a nonblank email"], ["empty", "all customers have a portal login email"]],
    spec: "This is a presence check, not deliverability or sending. The filtered list and Accounting count use the same authorized server predicate.",
    body: <CustomersView model={toCustomersViewProps(customersMissingEmail)} search={<ListControls search={{ label: "Search customers", value: "", keep: {} }} />} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Customer detail",
    to: { "Open balance": "Invoices" },
    job: "Edit one customer and reach its ship-tos, prices, orders, open balance and keg balance",
    reads: "get_customer · list_customer_users · list_invoices",
    writes: "upsert_customer · invite_customer_user · revoke_customer_user · delete_customer [admin]",
    states: [["permission", "sales or admin required", 1], ["active", "may place orders"], ["inactive", "history remains"], ["license warning", "renewal needs review", 1]],
    spec: "Desktop uses open sections without card borders or backgrounds, grouping account details, ship-tos and portal users in the main column, with trading terms and customer activity alongside. The sections stack at narrow widths. Account details and trading terms save together inline; deletion sits below a separate divider. Admin can confirm Delete customer for an unused account, including its ship-tos. Linked orders, invoices, keg records, portal access, invitations and QuickBooks identities block deletion. Portal users lists each buyer by email; Admin or Sales can confirm Remove access for one buyer, which ends their portal access at once and keeps their orders, invoices and sign-in account. Customer activity shows Admin and Sales the Open balance: the sum of the customer's unpaid invoice balances by the Invoices register's rule, Unknown when any balance is unknown, never $0.00; it opens the Invoices register filtered to this customer and Unpaid.",
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
    states: [["permission", "sales or admin required", 1], ["ready", "email is valid"], ["sent", "recipient receives a sign-in link"], ["existing account", "pending invitation; access after they accept in Invitations"]],
    body: <InviteView buyer defaultEmail={PORTAL_BUYER.email} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Ship-to form",
    sheetTitle: "Edit ship-to",
    job: "Create or edit one delivery address for a customer",
    reads: "get_customer",
    writes: "upsert_ship_to",
    states: [["permission", "sales or admin required", 1], ["new", "label required; a US ship-to also picks its state"], ["duplicate label", "A ship-to labeled Main already exists for this customer · inline error and save withheld"], ["bad ZIP", "a US postal code must be a ZIP or ZIP+4 · inline error and save withheld"], ["existing", "orders keep their frozen destination"], ["default", "new orders select it first"]],
    spec: "Editing an address never rewrites the destination recorded on an existing order. Street, city and postal code stay optional until known.",
    body: <ShipToView model={toShipToViewProps(shipToMain)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    name: "Accounting",
    to: { Review: "Customers missing email", "Customers missing a portal login email": "Customers missing email", Disconnect: "Disconnect QuickBooks", "Retry saved sync": "Accounting", "Sync QuickBooks": "Accounting" },
    job: "One page for the QuickBooks connection, and for the three things a pay link needs",
    reads: "get_qbo_connection · get_qbo_sync_status · count_customers_missing_portal_email",
    writes: "connect_qbo · disconnect_qbo · set_qbo_push_defaults · sync_qbo_payments",
    states: [["permission", "admin only", 1], ["healthy", "safe company status shown; the self-renewing token expiry is not"], ["expired", "reconnect before mapping or push", 1], ["payments unavailable", "Pay returns the customer to the invoice when QuickBooks has no payment link", 1], ["ACH only", "card disabled; cheaper, and slower to arrive"], ["defaults changed", "applies to the next push, never retroactively"]],
    spec: "Accounting shows connection health and customer portal access readiness. The missing-email count means no current portal member has a nonblank login email; it does not establish QuickBooks billing-email or payment readiness. Review opens that same filtered customer set and is hidden when the count is zero. Staff correct access through the existing Invite and Remove actions. QuickBooks Payments and invoice payment options remain separate provider concerns.",
    body: <AccountingView model={accountingExpired} />,
  },
  {
    step: 5, slice: 1, tab: "More", group: "QuickBooks Online",
    name: "Accounting unavailable",
    to: { "QuickBooks Online": "Accounting unavailable", "Connect QuickBooks": "Accounting unavailable", "Bank transfer (ACH) and card": "Accounting unavailable", "Customers missing a portal login email": "Customers missing email", Review: "Customers missing email" },
    job: "Explain that QuickBooks is not turned on before offering authorization",
    reads: "get_qbo_connection · count_customers_missing_portal_email",
    writes: "none",
    states: [["not turned on", "Connect QuickBooks disabled; no prior connection or sync facts", 1]],
    body: <AccountingView model={{ connected: false, canDisconnect: false, reconnect: false, company: "QuickBooks Online", status: "Not connected", remoteRevocationUnresolved: false }} connection={<QboConnectionView configured={false} />} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    surface: "sheet",
    name: "Map to QuickBooks",
    to: { "Save mapping": "Accounting" },
    job: "Map one customer, SKU, vendor, account or item to its exact QuickBooks record without guessing",
    reads: "list_customers · list_skus · get_qbo_connection · list_qbo_customers · list_qbo_items [live on open]",
    writes: "set_qbo_customer_mapping · set_qbo_item_mapping · set_qbo_deposit_mapping · set_qbo_one_way_fee_mapping",
    states: [["permission", "admin only", 1], ["customer", "two candidates match"], ["item", "two candidates match"], ["list unavailable", "typed ID with the reason", 1], ["company claimed", "this company is connected to another brewery", 1]],
    spec: "A customer or item is picked from the connected company's active records, read live when the dialog opens; nothing is preselected. A vendor or purchase account takes its exact typed ID, and so does a customer or item when the list cannot load. MGR never chooses automatically from a matching name. A company already claimed by another brewery cannot be overridden here.",
    body: <QboMappingView kind="customer" defaultValue="184" companyConflict picker={{ options: [{ id: "184", name: "Oak and Barrel" }, { id: "212", name: "Ridgeline Taproom" }], loading: false, error: null }} />,
  },
  {
    step: 5, slice: 1, tab: "More", group: "QuickBooks Online",
    name: "QuickBooks mappings",
    to: { "Oak and Barrel": "Map to QuickBooks", "Pils · case": "Map to QuickBooks", "Fictional Malt Supply": "Map to QuickBooks", "Purchase account": "Map to QuickBooks", "Deposit and refund item": "Map to QuickBooks", "One-way keg fee item": "Map to QuickBooks" },
    job: "Review verified customer, SKU, vendor, purchase account, deposit and one-way keg fee mappings for the connected company",
    reads: "get_qbo_connection · list_customers · list_skus · list_vendors [unmapped: no id in the connected company]",
    writes: "set_qbo_customer_mapping · set_qbo_item_mapping · set_qbo_vendor_mapping · set_qbo_purchase_account · set_qbo_deposit_mapping · set_qbo_one_way_fee_mapping",
    states: [["permission", "admin only", 1], ["disconnected", "mapping changes unavailable", 1], ["empty", "no customers, SKUs or vendors"], ["unmapped", "Show · Unmapped (N) keeps only rows with no id in the connected company"], ["receipt Bills", "one exact vendor ID per vendor and one brewery-wide purchase account"]],
    body: <QboMappingsView title="QuickBooks mappings" backLabel="Accounting" company="Demo Brewing LLC" sections={quickBooksMappings} scope={{ value: "all", options: qboMappingScopeOptions(2, false) }} />,
  },
  {
    step: 5, slice: 1, tab: "More",
    name: "Invoice mappings",
    to: { "Oak and Barrel": "Fix mapping", "Pils · case": "Fix mapping" },
    job: "Review one invoice's customer and item mappings before fixing exact provider IDs",
    reads: "get_invoice",
    writes: "set_qbo_customer_mapping · set_qbo_item_mapping",
    states: [["permission", "sales or admin required", 1], ["unmapped", "verify the provider ID", 1]],
    body: <QboMappingsView title="Fix QuickBooks mapping" backLabel="Invoice" context="invoice" sections={[
      { rows: [{ id: "customer", label: "Oak and Barrel", kind: "customer", currentId: "184" }, { id: "sku", label: "Pils · case", kind: "item", detail: "Item mapping required" }] },
    ]} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    surface: "sheet",
    name: "Disconnect QuickBooks",
    to: { "Disconnect QuickBooks": "Accounting" },
    job: "Confirm the external effects of disconnecting QuickBooks",
    reads: "get_qbo_connection",
    writes: "disconnect_qbo",
    states: [["permission", "admin only", 1], ["confirmed", "connection disabled and tokens purged"], ["recovery required", "still offered: purges the credential and attempts revocation", 1], ["revocation unresolved", "credential purged; QuickBooks never confirmed revocation", 1]],
    spec: "A dialog over Accounting. The confirmation names what stops and what remains so reconnecting can resume without remapping. A finished disconnect closes it, and Accounting then offers Connect QuickBooks.",
    body: <DisconnectQuickBooksView />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Invoices",
    to: { "Sync QuickBooks": "Invoices", "Email delivery status": "Invoices" },
    job: "The AR list: what is due, what QuickBooks changed underneath it, and the drill-in for one invoice",
    reads: "list_invoices · get_qbo_connection · get_qbo_sync_status",
    writes: "connect_qbo · set_qbo_customer_mapping · set_qbo_item_mapping · push_invoice_to_qbo · sync_qbo_payments · write_off_invoice [existing commands] · Open in QuickBooks [verified company-bound invoice destination] · email delivery status [SCHEMA-GATE: post-v1 scope; the invoice query returns no delivery state]",
    states: [["customer", "a customer filter from Open balance adds a Customer line with Clear; Show keeps the customer"], ["overdue", "outstanding invoice due before brewery-local today", 1], ["connection health", "QuickBooks · token healthy · company 9341"], ["not turned on", "disabled Connect before navigation with the same reason as Accounting", 1], ["never connected", "no stale-payment or reconnect warning"], ["expired", "Reconnect before mapping, push or sync; Sync QuickBooks is hidden, Admin sees Connect, Sales sees Admin must connect", 1], ["live", "the ordinary case; no badge at all"], ["edited there", "SyncToken changed since MGR pushed", 1], ["voided", "amounts zeroed; this is not payment", 1], ["deleted", "the id points at nothing; sync gets a 404", 1], ["not sent", "pushed but never delivered; only a fault if MGR is not the channel"], ["paid", "payment status is confirmed by QuickBooks Online sync, or paid in full by payments recorded in MGR"], ["needs mapping", "a failed push Admin or Sales can fix; the drill-in resolves each mapping", 1]],
    spec: <>QuickBooks has no read-only invoice. Once pushed, the accountant can edit, void or delete it from the Sales transactions sidebar and no API setting prevents that, so MGR detects rather than prevents. QuickBooks hands us the detector free: SyncToken increments on every modification and already rides the response the manual sync reads for balance, so drift costs one column and no extra call. The rule this frame protects: <b>a voided invoice is not a paid invoice.</b> Voiding zeroes the amounts, so any logic inferring paid from a QuickBooks balance of zero books cancelled revenue as collected; collected revenue is a read-side rule, remote state live and balance zero, expressed once in the reporting view; no CHECK refuses a historical payment-confirmation marker, because paid-then-voided is a real history the row must be able to hold. MGR surfaces drift and stops: no re-push that overwrites an accountant’s correction, no field-level merge UI. The one exception is the deleted invoice, where the remote id points at nothing: dedupe on the original requestId would return the first result and create nothing, so that push carries a new requestId and produces a second QuickBooks invoice under the same MGR number. Ordinary retries keep the old requestId and stay protected. ASSUMPTION: a drifted invoice stays in AR at QuickBooks’ numbers, because QuickBooks owns the invoice after push. Drift is not a place, it is what some of these rows are doing, which is why it lives in the states of one list rather than a second one. An outstanding invoice is overdue only when its due date is before brewery-local today, not on the due day itself. Credit memos, invoices whose balance is unknown (push result unknown, pushed to a previous company, or not yet synced), and settled, paid, written-off, voided or deleted invoices are never marked overdue. Inventory pins its clock. Rows also carry the due date, push failure and credit-memo status; payments come back through manual sync and are read-only, except on an invoice QuickBooks never received, which takes Record payment. A failed row opens the drill-in, where connection, each mapping and push are four independent commands, and push persists its exact payload and deterministic requestId before the remote POST. Creating a credit memo stays Return shipment.</>,
    body: <InvoicesView rows={invoiceList} connection={{ connected: true, detail: "Connected · company 9341", canConnect: true }} sync={<QboSyncView status={invoicesSync} />} />,
  },
  {
    step: 5, slice: 1, tab: "More",
    name: "Invoices unavailable",
    to: { Connect: "Invoices unavailable", "Email delivery status": "Invoices unavailable" },
    job: "Show unavailable QuickBooks setup without implying an earlier connection",
    reads: "list_invoices · get_qbo_connection",
    writes: "none",
    states: [["not turned on", "Connect disabled before navigation; no stale-payment warning", 1]],
    body: <InvoicesView rows={[]} connection={{ connected: false, configured: false, reconnect: false, detail: "Not connected", canConnect: true }} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Invoice",
    to: { "Pils · case": "Fix mapping", Return: "Return and credit", "Record payment": "Record payment", Void: "Void payment" },
    job: "Review one invoice, resolve its mappings and push it, or record its payments in MGR",
    reads: "get_qbo_connection · get_invoice · list_invoice_questions",
    writes: "push_invoice_to_qbo · write_off_invoice · resolve_invoice_question · record_invoice_payment · void_invoice_payment",
    states: [["permission", "sales or admin required", 1], ["unmapped", "push stays unavailable", 1], ["ready", "every customer and item is mapped"], ["pushed", "QuickBooks owns later accounting edits"], ["buyer question", "the note is read here, and answered off-system", 1], ["partly paid", "the summary shows the balance and the cash received, from QuickBooks or from payments recorded in MGR"], ["paid in MGR", "payments recorded in MGR reach the total; paid on the day the last one was received"], ["payments block push", "an unvoided payment in MGR: no Push and no mapping rows", 1], ["no payment due", "a $0.00 invoice QuickBooks never received takes no payment and is never overdue"], ["edited in QuickBooks", "Current invoice total beside the Frozen MGR line subtotal; the lines stay as frozen", 1], ["no balance", "an unknown balance reads Unknown, never $0.00", 1], ["credit memo", "a signed Credit memo total, no balance due and no Return"]],
    spec: "Read as a document: number, state and customer, then Issued and Due beside the one price summary (before the lines on the phone). The summary groups the stored line amounts by line kind; its total is the QuickBooks total when there is one, and the balance comes from QuickBooks, or from MGR's payment ledger for an invoice QuickBooks never received. Payments lists what was recorded in MGR, voided ones with their reasons; Record payment appears only where that ledger owns the balance, and Void is the only correction. QuickBooks status is said once, with only the mappings that need action. The drill-in is also where a buyer's question lands: the portal writes it, the sales Today row points here, and marking it answered is what clears that row. Nothing about the invoice changes; the reply happens in a phone call or an email, which is why the verb says answered rather than replied. Return closes the page because it corrects a shipment and is not the next step.",
    body: <InvoiceView model={toInvoiceViewProps(invoiceFailedAls)} quickbooks={{ detail: invoiceFailedAlsAccounting.detail }} accountingActions={<InvoiceAccountingActionsView invoiceLabel="INV-1039" actions={invoiceFailedAlsAccounting.actions} />} staffLink={{ href: null, reason: "This invoice has not been successfully pushed to QuickBooks." }} />,
  },
  ...([
    { name: "Invoice ready to push", detail: "ready to push", actions: ["push", "write_off"], remoteState: "live", hasPendingPush: false },
    { name: "Invoice push result unknown", detail: "push result unknown · retry uses the same request", actions: ["retry"], remoteState: "live", hasPendingPush: true },
    { name: "Invoice deleted in QuickBooks", detail: "deleted in QuickBooks", actions: ["repush", "write_off"], remoteState: "deleted", hasPendingPush: false },
  ] as const).map((state): Screen => ({
    step: 5, slice: 1, tab: "More", name: state.name,
    job: "Review the accounting actions available for this invoice state",
    reads: "get_invoice · get_qbo_connection", writes: "push_invoice_to_qbo · write_off_invoice",
    to: { "Push to QuickBooks": "Push invoice to QuickBooks", "Write off": "Write off invoice", Return: "Return and credit" },
    states: [[state.name, state.detail]],
    body: <InvoiceView
      model={toInvoiceViewProps({ ...invoiceFailedAls, mappings: undefined, hasPendingPush: state.hasPendingPush, wasPushedToQbo: state.remoteState === "deleted", invoice: { ...invoiceFailedAls.invoice, qbo_sync_status: state.remoteState === "deleted" ? "pushed" : "pending", qbo_invoice_id: state.remoteState === "deleted" ? "qbo-1039" : null, qbo_remote_state: state.remoteState } })}
      correction={state.remoteState === "deleted" ? null : undefined}
      quickbooks={{ detail: state.detail }}
      accountingActions={<InvoiceAccountingActionsView invoiceLabel="INV-1039" actions={[...state.actions]} />}
    />,
  })),
  ...([
    { name: "Push invoice to QuickBooks", action: "push" },
    { name: "Retry exact push", action: "retry" },
    { name: "Push corrected invoice", action: "corrected_push" },
    { name: "Re-push deleted invoice", action: "repush" },
  ] as const).map((state): Screen => ({
    step: 5, slice: 1, tab: "More", surface: "sheet", name: state.name, sheetTitle: qboPushConfirmation(state.action, "INV-1039").title,
    job: "Confirm the exact QuickBooks invoice operation before sending",
    reads: "get_invoice · get_qbo_connection", writes: "push_invoice_to_qbo",
    to: { [qboPushConfirmation(state.action, "INV-1039").confirmLabel]: "Invoice" },
    states: [["confirm", "Review which request will be sent"], ["sending", "Sending…; duplicate submission disabled"], ["error", "The refusal remains in the confirmation dialog", 1]],
    body: <PushInvoiceView action={state.action} invoiceLabel="INV-1039" />,
  })),
  {
    step: 5, slice: 1, tab: "More", surface: "sheet", name: "Write off invoice",
    job: "Record an invoice as written off in MGR with a required reason",
    reads: "get_invoice", writes: "write_off_invoice",
    to: { "Confirm write-off": "Invoice" },
    states: [["permission", "Admin only", 1], ["reason missing", "Confirm write-off stays unavailable", 1], ["writing off", "Writing off…; duplicate submission disabled"], ["error", "Keep the reason and show the refusal", 1]],
    spec: "A write-off changes only MGR's local status. It does not change QuickBooks, record cash, or create a credit. Reason is required and limited to 500 characters.",
    body: <WriteOffInvoiceView />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Record payment",
    to: { "Record payment": "Invoice" },
    job: "Record one payment received outside QuickBooks, on an invoice QuickBooks never received",
    reads: "get_invoice · get_qbo_connection",
    writes: "record_invoice_payment",
    states: [["permission", "admin or sales required", 1], ["above balance", "an amount over the balance due is refused", 1], ["future", "a received day after the brewery's today is refused", 1], ["prepayment", "a received day before the issue date is accepted"], ["paid in full", "the invoice reads Paid"], ["connected", "the invoice is no longer sent to QuickBooks", 1]],
    spec: "Amount, received day and method are required; a reference such as a check number is optional. The amount is capped at the balance due, so there is no credit balance, and the received day at the brewery's today. Paid in full marks the invoice paid on the latest received day of its payments. A payment is never edited; Void corrects it.",
    // INV-1039 partly paid in MGR: the rest of its balance, received on the inventory's today.
    body: <RecordPaymentView value={{ amount: dollarsInput(LOCAL_BALANCE_CENTS), receivedOn: "2026-10-04", method: "check", reference: "1190" }} maxCents={LOCAL_BALANCE_CENTS} maxDate="2026-10-04" quickbooksConnected />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Void payment",
    to: { "Confirm void": "Invoice" },
    job: "Void one payment recorded in MGR, with a reason",
    reads: "get_invoice",
    writes: "void_invoice_payment",
    states: [["permission", "admin or sales required", 1], ["already voided", "a payment is voided once", 1], ["below total", "a paid invoice is no longer paid"]],
    spec: "Voiding is the only correction: the payment stays on the invoice, marked voided with its reason, and no longer counts toward the balance. An invoice whose payments are all voided can be pushed to QuickBooks again.",
    body: <VoidPaymentView paymentId={LOCAL_CHECK.id} amount={LOCAL_CHECK.amount} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Fix mapping",
    to: { "Save mapping": "Invoice" },
    job: "Choose the QuickBooks record for one invoice customer or item",
    reads: "get_invoice · get_qbo_connection · list_qbo_customers · list_qbo_items [live on open]",
    writes: "set_qbo_customer_mapping · set_qbo_item_mapping",
    states: [["permission", "sales or admin required", 1], ["candidate selected", "save enables invoice push"], ["no match", "create it in QuickBooks first", 1]],
    body: <QboMappingView kind="item" defaultValue="307" picker={{ options: [{ id: "307", name: "Beer:Pils · case" }], loading: false, error: null }} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Catalog",
    to: { "Bulk process COLAs": "Bulk process COLAs", "Hazy IPA": "Brand", Pils: "Brand", Stout: "Brand", "New format": "Format", "16 oz can": "Format", "four-pack": "Format", "case · 24×16oz": "Format", "½ bbl keg": "Format" },
    job: "Define brands, their sellable formats and prices without ledger writes",
    reads: "list_brands [incl. recorded COLA approvals and selected images] · list_skus · list_catalog_categories · get_cola_image",
    writes: "upsert_brand · create_sku · update_sku",
    states: DEFAULT_STATES,
    spec: "Brand facts (ABV and tax class) edit on Brand; SKU associates the brand with a Format. Volume and packaging stay on the Format. This page remains a list with simple pricing, never the v1 price matrix.",
    body: <CatalogView model={toCatalogViewProps(catalogBrands)} images={Object.fromEntries(toCatalogViewProps(catalogBrands).brands.flatMap(brand => brand.image ? [[brand.key, <ColaLabelImageView key={brand.key} label={`${brand.name} · COLA ${brand.image.ttbId}`} src="/mock/cola-label.svg" compact />]] : []))} controls={<ListControls search={{ label: "Search brands or aliases", value: "", keep: {} }} scopes={toCatalogScopes({ sort: "name", category: "", categories: ["Core", "Seasonal"] })} />} formats={toFormatsViewProps({ ...formatsInventory, formats: formatsInventory.formats.filter(format => format.basis === "packaged") })} />,
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
    body: <PackageBomView model={toPackageBomViewProps(packageBomCase)} rowAction={E.act("Edit")} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Brand",
    to: { Edit: "Brand approval", "COLA TTB ID 25318001000034": "Brand approval", "OH registration": "State registration", "Add approval": "Brand approval", "Add registration": "State registration", Use: "Brand", "Suggested group 2": "Brand", "Edit SKU": "SKU", "Four Pack · 6 per Case": "Format", Glass: "Price group", "Edit on price group": "Price group", "Manage formats": "Catalog" },
    job: "Sellable brand facts and compliance, including selected COLA label images",
    reads: "list_brands [incl. the staff-only alias, SKUs and pours] · list_catalog_categories · list_formats [packaged, with contents] · list_channel_prices · list_sale_channels · list_keg_pools · get_compliance_registry [this brand’s approvals and registrations] · get_brand_recipe_cost [recipe cost per barrel and any uncosted ingredient] · get_cola_image",
    writes: "upsert_brand · save_catalog_category · delete_catalog_category · update_sku · create_sku · upsert_brand_approval · upsert_state_registration",
    states: [["permission", "sales or admin required", 1], ["new brand", "name + style + ABV + tax class; description, category, price group and hops optional"], ["new style", "typing a style no one has used offers Add; saved with the brand", 0], ["sells as", "one switch per packaged Format · on creates the SKU or turns it back on"], ["switched off", "the SKU turns inactive, never deleted: hidden from portal; history keeps it"], ["other tax class", "the tax class appears as a field once the brewery sells one besides beer"], ["COLA · None on file", "no recorded COLA; no application status inferred"], ["suggested group", "the recipe cost lands in a ceiling band · Use fills the select, Save brand commits"], ["cost unknown", "an ingredient has no receipt cost yet: the sum is not shown as a cost", 1], ["saved first", "SKUs and compliance wait until the brand is saved; the first save moves to its page"], ["badges", "missing COLA jumps to Compliance; price group or Unpriced, category, active SKU count"]],
    spec: "The TTB tax class defaults to beer; other classes appear when the brewery sells one. Style is a picker over the brewery's own styles table; an unmatched entry offers Add and the brand save creates it; no separate styles screen. Description, category and hops are optional nullable columns; price group is the row of the price grid the brand sits on, so the price of any of its packaged SKUs is the cell where the customer's sale channel meets that group and the SKU's format. The brand carries no price of its own, and a brand on no group is unpriced everywhere. Package facts live on Formats. Sells as lists every packaged Format with a switch: on means the brand sells it, which is an active SKU, and Edit SKU opens that SKU's sheet (UPC, keg pool, batch share). Under the switches, each switched-on Format's contents read as lines (Four Pack · 6 per Case), then the price group's pours. A pour is a serving from the tap, not a SKU: the menu publishes brand × pour to Square, and a sale depletes the keg SKU. Every line shows its price per sale channel; prices and pours are edited on the price group. No container source editor here. Compliance is the brand’s: its COLA or formula approvals and its state registrations list under the sell sheet, each row opening its sheet, with Add approval and Add registration; a brand with no recorded COLA says None on file, as Catalog does. Manage categories opens beside Category: Admin and Sales can add, rename across all brands, and confirm deletion of unused categories. Uncategorized clears a brand’s assignment when saved. The brewery’s own licenses are the Licenses page under Compliance, never a brand row. Under the price group, the brand’s recipe cost per barrel (its last brewed version, else its newest) is read against the groups’ ceilings and names the band it falls in; Use only fills the select. A recipe with an ingredient that has never been received has no trustworthy cost, so the row says which ingredient instead of a number. No recipe, no row.",
    body: <BrandView model={toBrandViewProps(brandHazy)} images={{ cola: <ColaLabelImageView label="Hazy IPA · COLA 25318001000034" src="/mock/cola-label.svg" /> }} categoryAction={<CatalogCategoriesFixture categories={toBrandViewProps(brandHazy).categoryOptions} />} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "SKU",
    to: { "Save SKU": "Brand" },
    job: "Edit a packaged SKU opened from its brand's Sells as",
    reads: "list_formats · list_keg_pools",
    writes: "update_sku",
    states: [["permission", "sales or admin required", 1], ["active", "available to price and sell"], ["inactive", "history remains", 1], ["in use", "format cannot change; create another SKU", 1], ["keg pool", "keg formats only · None charges no deposit"], ["no pool", "warning on SKU list · no deposit", 1], ["batch share", "optional percentage on an existing SKU · brand total at most 100%"]],
    spec: "A SKU is one brand in one packaged format, and holds stock. The Brand page's Sells as switch creates it, turns it off and back on; Edit SKU there opens this sheet. A pour is not a SKU: it is added on its price group. It owns active state, optional UPC, and provider mappings. Edit SKU also sets its default batch package share as a percentage; blank projects nothing, and all shares of one brand total at most 100%. Create first, then edit to set the share. A keg SKU selects a Keg pool or None; the pool kind derives container source. Out-of-service pools cannot be newly linked; existing links survive retirement. Price lives on the grid cell (sale channel × price group × format), never as a SKU exception. Group-shared barcodes are a follow-on table; until then a SKU may carry its own UPC. Name, volume and packaging derive from the Format. A different physical package is a different Format. Corrections affect future calculations and open plans; recorded movement volumes and closed packaging yield stay frozen.",
    body: <SkuView model={toSkuViewProps(skuHazyHalf)} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "SKU list",
    to: { Edit: "SKU", Pint: "SKU" },
    job: "See a brand's packaged SKUs and its price group's pours, from an old link",
    reads: "list_skus",
    writes: "none [editing happens on SKU detail]",
    states: [["permission", "sales or admin required", 1], ["active", "available to price and sell"], ["inactive", "history remains", 1], ["empty", "points to Sells as on the Brand page"]],
    spec: "Kept for old links. Packages are switched on under the Brand page's Sells as, so there is no New SKU here; Brand goes back to that section. Pours (servings from the tap) are added on the price group.",
    body: <SkuListView model={toSkuListViewProps(skuListHazy)} createAction={null} />,
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
    reads: "portal_schedule [planned batches as brand + expected week and whether the brand is on the buyer's list; a definer view scoped to the buyer's brewery, no customer policy on batches]",
    writes: "none",
    states: [["nothing planned", "check back; the brewery has not scheduled a batch"], ["brand not listed", "row shows the brand with no package to order; ask the brewery", 1]],
    spec: "Planned batches (not yet brewed, planned this week or later) as one row per brand and expected week, soonest first. A brand row opens Shop scrolled to that brand; a brand with nothing listed for wholesale still appears so the buyer can ask. Nothing else about the batch is shown: no volume, recipe, tank, lot, or exact day. Reached from Shop; not a nav tab.",
    body: <ComingUpView model={toComingUpViewProps(ridgelineComingUp)} />,
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
    spec: "The confirm step freezes the current channel prices, keg deposits, ship-to and fulfillment source on the server. A submitted order keeps each reviewed keg deposit with its original order line; the invoice charges that frozen price for the quantity shipped and QuickBooks receives it through the configured deposit item. An entitled QuickBooks tax calculation can add an estimate; otherwise it says Tax pending and the invoice remains the final total. Place order rechecks the mutable inputs and writes nothing when any changed. An uncertain retry reuses the exact committed quote and request. After submit the portal is read-only; changes go through the brewery.",
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
    states: [["confirmed", "ships date · no invoice yet"], ["adjusted", "lines show ordered vs shipped"], ["shipped", "invoice link · Reorder"], ["shipped · stop delivered", "the order stays shipped · invoice link · Reorder"]],
    spec: "Opened from Order history. Status is the buyer-facing state. Reorder is on shipped orders, whether or not the stop is delivered. The invoice link is absent until the brewery has billed.",
    body: <PortalOrderView model={toPortalOrderViewProps(portalOrderShipped)} />,
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Pay invoice",
    job: "Choose Pay invoice to request a fresh QuickBooks payment handoff",
    reads: "portal_invoice",
    writes: "none [Intuit takes the payment; confirmed payment status returns on the next manual sync]",
    states: [["payable", "Pay opens QuickBooks in a new tab"], ["no payments account", "the button never renders; brewery has no QuickBooks Payments", 1], ["not pushed yet", "no QuickBooks invoice id yet; Pay is absent, not disabled"], ["link unavailable", "Intuit returned none: the unavailable page, never a 500", 1], ["already paid", "Pay is gone; payment status was confirmed by sync"]],
    spec: "MGR owns the payment action; Intuit owns the destination. Pay invoice submits a POST to /portal/invoices/:id/pay and opens the handoff in a new tab. Viewing or prefetching a URL never spends admission or refreshes credentials. MGR authorizes the invoice before any Intuit call, requests a fresh InvoiceLink, then rechecks access and balance before redirecting. The bearer URL is never stored, serialized to the client, or put in an email. An absent link returns to Payment unavailable; a foreign invoice returns 404 before provider access.",
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
    job: "Review a paid invoice or ask the brewery a question",
    reads: "portal_invoice",
    writes: "none",
    states: DEFAULT_STATES,
    spec: "QuickBooks sync confirmed payment status, not a settlement date. Pay is gone. Invoice facts and Question this invoice remain; MGR does not offer a PDF download.",
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
    to: { "Change password": "Portal set password", "Sign out": "Portal sign in", "Switch account": "Shop" },
    job: "Who I am on this customer account, leave, change password",
    reads: "supabase_auth_get_session [platform]",
    writes: "supabase_auth_sign_out [platform]",
    states: DEFAULT_STATES,
    spec: "Opened from the portal header Me control. Accounts with multiple customer memberships can switch between them. Change password opens Portal set password. Sign out uses the same destructive treatment as staff Me.",
    body: <PortalMeView model={toPortalMeViewProps(portalMeRidgeline)} accounts={[{ value: "ridgeline", label: "Ridgeline · Demo Brewing" }, { value: "al", label: "Al’s Bar · Demo Brewing" }]} activeCustomerId="ridgeline" />,
  },
  {
    step: 7,
    slice: 4,
    tab: "Beer",
    name: "Cellar map",
    to: { "FV3 \u00b7 fermenter \u00b7 15 bbl": "Vessel detail" , "Add vessel": "New vessel" },
    job: "Occupancy is the subject: fill, gravity and overdue lead every tile",
    reads: "list_occupancies · list_vessels · list_batches · list_fermentation_readings · get_gravity_unit · get_batch_completion_preview",
    writes: "upsert_vessel [mutable single rows; admin] · complete_batch",
    states: [["brewer", "Add vessel hidden; vessels are admin-managed"], ["no vessels", "Add your tanks to start tracking the cellar · primary Add vessel for admin; no Batches link", 1], ["no beer", "Reading, Transfer, Addition off · one note says why", 1], ["beer in tanks", "named volume requires explicit loss acknowledgement", 1], ["open run", "complete batch refused"], ["negative residual", "reload cellar facts", 1], ["uncertain", "retry unchanged request", 1], ["saved", "batch and all open occupancies closed"]],
    spec: "Complete batch reviews the server-derived baseline, frozen packaged output, prior attributed volume, threshold, residual and current beer in each open tank. Beer at or above max(0.05 bbl, 0.5% of baseline) requires an explicit acknowledgement naming the barrels and tanks being written off. The same shared completion surface freezes the acknowledgement during submission and uncertain retry, then atomically closes the batch and all of its open occupancies. A threshold-qualified residual becomes one typed nonphysical loss root; the form accepts no amount or cause. Tile fill derives from occupancy vs vessel capacity, never from a status column. With no vessels, the empty state says to add tanks and offers Add vessel as its primary action for an admin. Once a vessel exists, Reading is the one primary; Transfer and Addition are outline, and with no beer in any tank all three are off under one note saying why. Brew day is not a cellar action: once a vessel exists, a link under the actions opens Batches. A tile opens Vessel detail, and each tile holding beer has its own Reading; Reading and its sheet return to Cellar. Complete batch with one open batch reviews it at once, and leads with one loss line; the ledger figures sit under Details. Retired vessels are not tiles. Add vessel shows only to an admin.",
    body: <CellarMapView model={cellarMapBrewer} complete={<BatchCompletionFixture />} />,
  },
  {
    step: 7,
    slice: 4,
    tab: "Beer",
    name: "Vessel detail",
    to: { "Stout · BATCH-0168": "Brew day" },
    job: "Inspect one vessel's occupancy and readings and edit its physical facts",
    reads: "list_vessels · list_occupancies · list_fermentation_readings · get_gravity_unit",
    writes: "upsert_vessel [mutable facts only] · delete_vessel",
    states: [["permission", "brewer or admin required", 1], ["brewer", "vessel facts read-only; no Save or Delete"], ["occupied", "batch and fill shown"], ["empty", "available for a batch"], ["reading overdue", "last reading flagged", 1], ["holding beer", "delete refused", 1], ["with batch history", "retired, not deleted"], ["incomplete", "Save vessel says what is still needed; a capacity of 0 or less is marked at its field", 1]],
    spec: "Batch occupancy and reading history are records; only the vessel name, type and capacity are editable here, and only by an admin. A brewer sees the facts as text. Delete vessel sits in its own section below Save vessel and confirms first. A vessel holding beer is refused. A vessel that has held beer is retired: it leaves the cellar, transfer targets and brew day, while its batch history and the Batches vessel table keep it. A vessel that never held beer is deleted. A vessel holding beer has its cellar verbs beside Reading: Transfer and Addition open on this tank, and Complete batch reviews its batch at once.",
    body: <VesselDetailView model={vesselFv3} remove={<RemoveVesselControl vessel="FV3" />} actions={occupancyActions(false)} />,
  },
  {
    step: 7,
    slice: 4,
    tab: "Beer",
    name: "New vessel",
    to: { "Save vessel": "Cellar map" },
    job: "Add a vessel: its name, type and capacity",
    reads: "none",
    writes: "upsert_vessel",
    states: [["permission", "admin only", 1], ["new", "only the vessel facts; occupancy and readings appear on Vessel detail once it is saved"], ["incomplete", "Save vessel says what is still needed; a capacity outside the stored range or precision is marked at its field", 1]],
    spec: "Add vessel on Cellar and New vessel on Batches open this page: Vessel detail before the vessel exists. A vessel not saved yet has no occupancy or readings, so only its facts are drawn. Save vessel stays withheld until it has a name and a capacity from 0.001 to 9,999,999.999 bbl, with up to three decimal places, and the sentence beside it names what is missing. A typed capacity outside that range or precision is marked under the field once it is left. Save vessel returns to Cellar.",
    body: <VesselDetailView model={vesselNew} reason={vesselReason(vesselNew)} />,
  },
  {
    step: 7,
    slice: 4,
    group: "Global",
    surface: "sheet",
    name: "Fermentation reading",
    to: { "Save reading": "Vessel detail", "Save and next tank": "Fermentation reading", "Retry exact reading": "Fermentation reading", "Fix as new reading": "Fermentation reading", "Discard FV3 reading": "Fermentation reading" },
    job: "Record any values taken, in the unit set on Settings · Units",
    reads: "list_occupancies · list_fermentation_readings · get_gravity_unit · list_vessels [Save and next tank follows the Cellar map's tile order]",
    writes: "record_fermentation_reading [one immutable reading row]",
    states: [...permitted("brewer or admin required"), ["offline or response lost", "Retry exact reading · Fix as new reading · Discard FV3 reading", 1], ["next tank", "Save and next tank shows while another tank after this one holds beer; it saves, then opens that tank's reading"]],
    spec: "The sheet names the receiving vessel and, when the occupancy has one, its batch. Its deep link opens over the existing vessel detail, and closing returns to the page it came from: Cellar, Batches or the batch, else Vessel detail. Observed at defaults to now and stays folded behind Observed … · Change in the labeled brewery time zone, matching history; edited nonexistent or repeated DST times are refused rather than guessed. Observed at and Temperature are required. Gravity, pH and Note are optional; blanks remain absent, and prior values are each field's placeholder: reference only, never silently copied. Saving freezes every parsed field and the observation time before transport. Exact retry preserves that request; Fix starts a reviewed fresh request while the uncertain original remains queued; named discard removes only the selected attempt. The gravity field uses the reader's standing unit preference and stores degrees Plato.",
    body: (() => {
      const formId = "fermentation-reading-form";
      const values = { observedAt: "2026-09-10T08:10:00", tempF: "68.2", gravity: "1.019", ph: "", note: "" };
      return <>
        <FermentationReadingView formId={formId} values={values} identity={readingIdentity({ vessel_name: "FV3", batch_no: 416, brand_name: "Hazy IPA" })} unit="sg" timeZone="America/New_York" prior={{ tempF: "67.8", gravity: "1.021", ph: "4.21" }} />
        {E.pin(<FermentationReadingActionsView formId={formId} values={values} unit="sg" next />)}
      </>;
    })(),
  },
  {
    step: 7,
    slice: 4,
    group: "Global",
    surface: "sheet",
    name: "Cellar addition",
    to: { "Record addition": "Cellar map" },
    job: "Post-knockout dry hop, fruit or adjunct against an occupancy",
    reads: "list_occupancies · list_materials · list_material_lots",
    writes: "record_batch_addition [one RPC: batch_additions row (stage, occupancy) + material consumption movement from the bin holding the most of it; lot required when the material is lot-tracked]",
    states: [["permission", "brewer or admin required", 1], ["no lot", "Still needed: a lot (Citra is lot-tracked)", 1], ["short", "only what the bin holds can be consumed", 1], ["offline", "queue with requestId"], ["stale", "occupancy closed · choose another", 1]],
    spec: "Not Record movement (that is finished goods) and not Brew day (that is knockout). The consumption movement carries the lot; the addition row carries stage and occupancy so loss accounting stays anchored to the batch. The bin is not picked: the RPC drains the bin holding the most of that material and lot.",
    body: <><CellarAdditionView model={cellarAdditionCitra} footer={null} />{E.pin(<CellarAdditionFooter />)}</>,
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Batches",
    to: { Brew: "Brew prep", "New vessel": "New vessel" },
    job: "See planned and active batches with the next brew or cellar action",
    reads: "list_batches · list_vessels · list_brands · list_recipes · get_gravity_unit",
    writes: "none [scheduling happens on the New batch sheet; recording on Brew day or Fermentation reading; existing commands]",
    states: [["planned", "Brew is the next action and opens the brew-day page"], ["active", "each open occupancy is a line with its latest reading and its own Reading action"], ["completed", "closed batches stay available in their own group"], ["empty", "New batch and vessel setup remain available"], ["brewer", "New vessel hidden; vessels are admin-managed"], ["retired vessel", "listed as Inactive"]],
    spec: "The Work list with the Batches tab active. Each lifecycle group is a table on the desk and a list on the phone. The batch number is the link that opens a batch; only a planned batch adds Brew. A vessel name opens that vessel's page, editable only by an admin; New vessel shows only to an admin. The Vessels table lists retired vessels as Inactive. New batch opens the New batch sheet. Its Schedule batch returns here, and so does Brew day.",
    body: <BatchesView model={toBatchesViewProps(batchesBrewer)} />,
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    surface: "sheet",
    name: "New batch",
    to: { "Schedule batch": "Batches" },
    job: "Set date and planned barrels; recipe and brand are intent, not commitments",
    reads: "get_brew_day · list_recipes · list_brands",
    writes: "schedule_batch [single planned-batch row; both the recipe version and the intended brand are nullable]",
    states: [["permission", "brewer or admin required", 1], ["planned", "Schedule batch is the one verb"], ["no recipe yet", "date and barrels alone hold the slot"], ["no brand yet", "identity waits for packaging, which already requires one"], ["brew day", "Record brew day is its own screen"], ["from a recipe", "Recipe's Schedule batch opens this sheet with that recipe's current version and its brand chosen"]],
    spec: "The planned mode of brew day: date, planned barrels, and two optional statements of intent. Only date and barrels commit anything: they reserve the slot. The recipe version is already optional in the schema, and revision 2 makes the brand optional too, because identity is optional at brew and required at packaging, where every finished lot must already name a brand. Requiring either here enforces nothing the lot does not, and only forces the decision earlier than the business makes it. Keeping brand as intent is also what keeps the gap between what a batch was meant to be and what it shipped as worth querying, rather than rewriting history when a batch blends or turns into something else. Record brew day is a separate screen so this sheet has one primary.",
    body: <ScheduleBatchView model={scheduleBatchHazy} />,
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Brew day",
    to: { "2-row": "Entity picker", "Citra \u00b7 boil": "Entity picker", "Yeast": "Entity picker", "Brew sheet · Hazy IPA v4": "Mash schedule", "Record brew turn": "Brew day" },
    job: "Consume actual lots and set knockout baseline",
    reads: "get_brew_day · get_brew_day_plan · get_brew_record · list_vessels",
    writes: "record_brew_day [another turn: confirmed actual sources + frozen sheet + knockout into the open vessel], correct_brew_record [linked material compensation; later cellar work does not prevent ingredient or process correction]",
    states: [...permitted("brewer or admin required"), ["multiple turns", "Add brew turn and correct each current turn"]],
    spec: "A brewed batch's page, drawn recorded and then with Add brew turn open; a planned batch opens Brew prep and the Brew day timeline instead, and a cancelled one shows only that it is cancelled. Add brew turn records another same-batch knockout into its existing open vessel. Each turn owns its frozen actuals and correction chain; the batch keeps its first brew date. Transfers, started packaging, closure, filed reports and capacity bounds prevent another turn. The brew sheet row is a read-out of the version’s process spec, opened frozen; brew day captures actuals, and fermentation reality arrives through Fermentation reading, so there is no mash-actuals form here. Brew-day mode: actual lots and knockout vessel. Planned recipe/date/barrels live on the New batch sheet so this page has one primary. Record brew day posts immutable material consumption for mash/boil/whirlpool stages only; the 18 lb Citra dry hop is posted later from Cellar addition. Yeast is consumed as a material lot, not a culture generation (plan §8).",
    body: <><BrewDayView model={brewDayTurnsHazy} actions={occupancyActions(true)} /><BrewDayView model={brewTurnModel(brewDayTurnsHazy)} /></>,
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Brew prep",
    to: { "Malted Oats": "Edit material", "Fieldstone Pilsen": "Edit material", "Chit Malt": "Edit material", "Rolled Oats": "Edit material", "Fieldstone White Wheat": "Edit material", "Brewer’s Crystals": "Edit material", "Valley Hops Nelson Sauvin 2026": "Edit material", "Choose lot": "Entity picker", "Done pulling": "Brew day timeline" },
    job: "Pull a batch's brew-day ingredients before the brew, touching only exceptions",
    reads: "get_brew_day · get_brew_day_plan · list_vessels",
    writes: "save_batch_pulls [one RPC: replaces the batch's pulls and planned tank; moves no stock], reschedule_batch, cancel_batch",
    states: [...permitted("brewer or admin required"), ["at plan", "each line starts at plan in whole packs plus loose pounds"], ["short", "a line pulled below plan turns amber and offers Short", 1], ["no source", "Choose lot picks the bin and lot to pull from", 1]],
    spec: "The Prep tab of a batch, drawn like the order Pick sheet. Lines group under the brew-day stages that consume them: Mash, Boil, Whirlpool. Each line starts at the recipe plan scaled to the batch, shown in whole packs of the material's purchase unit plus loose pounds, so 220 lb of a 50 lb sack reads 4 × 50 lb + 20 lb. A pack count accepts decimals (4.4 sacks). An opened bag is not tracked as inventory: a partial pull is just pounds. Cellar-stage additions are listed as later work, not pulled here. Done pulling saves each line's pulled quantity, source bin and lot, plus the planned vessel, as a draft that moves no stock, then opens the Brew day tab, which starts from those pulls. The tabs sit under the title, then the planned barrels, date and note on one line. A line under one pack shows only its pounds field. On desk each line is one row with its fields at the right; on a phone Print pull list and Done pulling stay at the foot of the screen. Change plan (Reschedule, Cancel plan) is folded at the bottom, outside the pull form. A planned tank retired since Prep starts unchosen. The live batch page mounts this view on a planned batch's Prep tab.",
    body: <BrewPrepView model={brewPrepMineral} planActions={<PlanActions plannedOn="2026-10-22" />} />,
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Brew day timeline",
    to: { "Confirm all": "Brew day timeline", "Malted Oats": "Edit material", "Fieldstone Pilsen": "Edit material", "Chit Malt": "Edit material", "Rolled Oats": "Edit material", "Fieldstone White Wheat": "Edit material", "Brewer’s Crystals": "Edit material", "Valley Hops Nelson Sauvin 2026": "Edit material", Gypsum: "Edit material" },
    job: "Brew in process order, confirming each pulled ingredient and recording knockout once",
    reads: "get_brew_day · get_brew_day_plan · list_vessels",
    writes: "record_brew_day [existing command: confirmed actual sources + frozen sheet + knockout occupancy]",
    states: [...permitted("brewer or admin required"), ["in progress", "the first stage with an unconfirmed ingredient is the open one on a phone"], ["unconfirmed", "Record brew day stays disabled until every ingredient is confirmed; Prep's pulls start confirmed", 1], ["knockout", "vessel, barrels and brew date set the loss baseline"]],
    spec: "The Brew day tab of a batch, redesigned as a timeline: Mash, Lauter, Boil, Whirlpool, Knockout. Each stage heads with its recipe target and holds its own ingredients and process readings. A row confirms as pulled in one tap, and a row Prep already pulled starts confirmed; Edit opens the same packs and loose pounds field Prep uses. The recipe's water additions are rows too, converted to the material's stock unit, so record_brew_day writes them with the rest. The recipe owns each ingredient's stage, so there is no stage pick. Vessel, knockout barrels and brew date close the timeline in Knockout. On a phone the stages fold so one is open at a time. Record brew day stays the one irreversible verb. A line with no exact source (its material sits in several bins) picks one in Edit. With nothing pulled, Confirm no ingredients used appears and Record needs it. Confirm all confirms every row at once. Each stage heading counts its confirmed ingredients, so a folded stage says what is left. On a phone Edit and Confirm take their own full-width line, and Record brew day stays at the foot of the screen; on desk the readings keep a readable width and Knockout is one row. The planned facts sit under the tabs; Change plan is folded at the bottom, outside the record form. The live batch page mounts this view for a planned batch; a recorded or cancelled batch keeps the Brew day screen (history, corrections, brew turns).",
    body: <BrewTimelineView model={brewTimelineMineral} planActions={<PlanActions plannedOn="2026-10-22" />} />,
  },
  {
    step: 7,
    slice: 4,
    group: "Global",
    surface: "sheet",
    name: "Cellar transfer",
    to: { "Record transfer": "Cellar map" },
    job: "Write one transfer row that carries its own loss volume",
    reads: "list_occupancies · list_vessels",
    writes: "record_cellar_transfer [one RPC: create target occupancy(initial_bbl=0) when empty + append transfer + a generic loss volume adjustment on the source when loss > 0 + close source occupancy iff fully emptied]",
    states: permitted("brewer or admin required"),
    spec: "Drawn as a blend into an occupied brite: BT1 keeps its occupancy and B-0412 keeps its identity: the schema has one batch per occupancy, and blends are transfers into the surviving one (renaming a blend as a new batch is a plan §8 schema gap). An empty target (BT2) gets a new occupancy starting at zero bbl in the same RPC; the transfer row stays immutable; a fully emptied source closes its occupancy. A partial transfer never implies loss: the person explicitly holds the remainder or records loss. No vessel status. With no other vessel, the To list says so and links Add a vessel for an admin; anyone else is told to ask Admin.",
    body: <><CellarTransferView model={cellarTransferPils} footer={null} />{E.pin(<CellarTransferFooter />)}</>,
  },
  {
    name: "Packaging plan",
    to: { Packaging: "Packaging runs", "Start run": "Close packaging run" },
    step: 7,
    slice: 5,
    tab: "Work",
    job: "Reschedule or cancel an unstarted packaging plan",
    reads: "get_packaging_run · list_occupancies",
    writes: "cancel_packaging_run · reschedule_packaging_run · update_packaging_run",
    states: [["permission", "brewer, warehouse or admin required", 1], ["unstarted", "change the date or cancel before physical work"], ["cancelled", "retained history; no demand or stock movement"]],
    spec: "A run with no tank yet has one step: choose the source tank (the only open one is already chosen) and Start run, which picks it and starts the run together; a run whose tank was picked at scheduling shows only Start run. Retain the plan and outputs when cancelled. Cancellation removes demand and completion blockers without moving stock. Reschedule changes only the planned date before physical work.",
    body: <ClosePackagingRunView model={{ title: "RUN-0033", backTo: "Packaging", brand: "Hazy IPA", plannedOn: "2026-09-28", source: "No source yet", plannedOutputs: [["Hazy case", 120, "Not recorded"]], showCloseReview: false }} planActions={<PlanActions plannedOn="2026-09-28" />} action={<PackagingSourcePicker occupancies={[{ occupancy_id: "fv3-hazy", vessel_name: "FV3", brand_name: "Hazy IPA", bbl: 15 }]} />} />,
  },
  {
    step: 7,
    slice: 5,
    tab: "Work",
    name: "Close packaging run",
    to: { "Close packaging run": "Run closed", Work: "Packaging runs" },
    job: "Plan a run separately, then create lot and movements on close",
    reads: "get_packaging_run · get_packaging_close_plan · list_locations · list_bins",
    writes: "close_packaging_run [atomic lot, outputs, tank draw and explicit source material usage/loss]",
    states: [["permission", "admin, brewer or warehouse required", 1], ["short", "used plus lost exceeds selected source stock", 1], ["zero", "confirm zero for a planned material not used"], ["stale", "review the changed BOM plan before closing", 1], ["future date", "packaged on cannot be after today", 1], ["filed period", "packaged on falls in a filed report period", 1]],
    spec: "Barrels drawn starts from the planned outputs' barrels per unit when every planned package has a volume. Close freezes the reviewed BOM and confirmed source actuals. Used plus lost reduces stock; unused returned is informational because no material left stock at schedule or start. Counted quantities are whole units. Measured quantities use stored base units; roll conversion remains gated. Sources may be split and extra actual materials named. Output, lot, tank and material writes remain atomic. An uncertain close keeps the exact request and offers unchanged retry. Finished stock is dated Packaged on for compliance reporting.",
    body: <ClosePackagingRunView model={closePackagingRunHazy} />,
  },
  {
    step: 7,
    slice: 5,
    tab: "Work",
    name: "Run closed",
    to: { Work: "Packaging runs" },
    job: "Review committed lot, tank draw, actual outputs and material history",
    reads: "get_packaging_run · get_packaging_material_record · get_packaging_close_plan",
    writes: "correct_packaging_material_record",
    states: [["permission", "brewer or warehouse required", 1], ["closed", "recorded lot, draw and actual outputs"], ["uncertain", "retry or discard the saved close/correction before new edits"]],
    spec: "Frozen planned-versus-actual material history survives BOM edits. A reasoned material-only correction appends exact reversals and a replacement record. Downstream finished-goods use, batch completion and filed reports prevent correction. Outputs and tank draw never change.",
    body: <RunClosedView model={runClosedHazy} />,
  },
  {
    step: 8,
    slice: 5,
    tab: "Work",
    name: "Packaging runs",
    to: { Resolve: "Close packaging run", Start: "Packaging plan", "Pick source": "Packaging plan" },
    job: "See what is planned, what is due and what closed, and schedule the next run",
    reads: "list_packaging_runs · list_brands · list_occupancies · list_skus · list_locations · list_bins",
    writes: "none [scheduling and closing happen on their own surfaces]",
    states: [["short", "a planned run whose materials fall short says so beneath its run number and its next action is Resolve, not Start"], ["overdue", "an unstarted active plan before brewery-local today is marked Overdue; finished runs never are"], ["due today", "the same run also appears in Today for the brewer"], ["closed", "finished runs stay under Recent, with optional lot, output, yield and loss only when supplied"], ["empty", "no runs planned: the empty state points at Schedule run"]],
    spec: "Reuse the responsive RecordTable register shared with Batches: sortable columns on desktop and labeled records on phones. Keep Upcoming and Recent separate. Upcoming shows run, brand, planned date, source, planned quantity and next action. Recent shows run, brand, status, finished date and planned quantity; lot, actual output, yield and loss appear only when supplied, never inferred from planned quantities. Dates for finished runs use the brewery timezone. Schedule run and Repack keep their existing forms. A run number opens its record; finished runs have no next action.",
    body: <PackagingRunsView model={toPackagingRunsViewProps(packagingRuns, DEMO_TIME_ZONE)} />,
  },
  {
    step: 8,
    slice: 5,
    tab: "Work",
    surface: "sheet",
    name: "Schedule packaging run",
    to: { "Save run plan": "Packaging plan", "FV3 · Hazy IPA": "Entity picker", "Add a package in Catalog": "Catalog" },
    job: "Plan a brand's packages with an optional source and visible planning warnings",
    reads: "list_brands · list_occupancies [open, with volume and contents] · list_skus [with authoritative format package type and volume] · get_packaging_material_plan [preview for the planned outputs]",
    writes: "schedule_packaging_run [one RPC: brand, planned date, optional source occupancy and planned outputs]",
    states: [["permission", "admin, brewer or warehouse required", 1], ["no source", "a valid plan can be saved without selecting a tank"], ["fractional kegs", "whole keg quantities required; fractional non-keg packages remain permitted", 1], ["source short", "warn before saving when planned volume exceeds the selected tank; Save still works"], ["past date", "warn before brewery-local today; Save still works"], ["no packages", "Catalog recovery for a creator, otherwise name who can add packages"], ["material short", "preview the shortage; planning remains allowed"]],
    spec: "A brand identifies the run; a source tank is optional until starting. Planned outputs use the SKU format's package type, never its name: keg counts must be whole. Entered invalid quantities cannot be silently omitted. The sheet converts known volumes to barrels and shows the source remainder, warning when the selected source is short without reserving beer or blocking a flexible plan. Dates before brewery-local today warn without recording physical work. Materials come from the format BOM. Saving writes the run and outputs atomically; inventory moves only at close.",
    body: <SchedulePackagingRunView model={schedulePackagingRun} />,
  },
  {
    step: 7,
    slice: 5,
    tab: "Beer",
    group: "Global",
    name: "Lot trace",
    to: { "Citra hops": "Material lot trace" },
    job: "Trace a lot through its member batches, recorded transfers and ledger movements",
    reads: "trace_lot",
    writes: "none",
    states: [["blended", "member batches and stored source transfers, without percentages", 1], ["still on hand", "unsold units are the part a recall can actually stop"], ["no shipments", "no recorded shipment of this lot", 1], ["unknown lot", "not found"]],
    spec: "The lot is one packaging run. Ingredients link to material-lot recall; exact reversals are excluded and additions from every recorded member batch are included before its downstream departure. Trace follows recorded transfers backward from its tank before run close, tightening the time cutoff at every upstream transfer. Member batches and original transfer quantities are shown without proportional attribution or estimated shares; later arrivals are excluded. Trace lists every movement carrying the lot: the production that made it, samples and losses pulled from it. Shipping records explicit bin/lot allocations per order line; returns and transfers preserve them. Trace shows actual customer recipients, ship-to addresses, orders and invoices, and balances per SKU/bin plus barrels. Historical untracked consumption cannot be assigned to a lot. It does not descend into POS sale lines, because a sale posts nothing to the ledger and would imply a per-pint traceability MGR does not have.",
    body: <LotTraceView model={toLotTraceViewProps(lotTraceHazy, DEMO_TIME_ZONE)} />,
  },
  {
    step: 7, slice: 5, tab: "Beer", group: "Global", name: "Material lot trace",
    job: "Find recorded beer and recipients affected by an ingredient lot",
    reads: "trace_material_lot", writes: "none",
    to: { "L-240831-HZ": "Lot trace" },
    states: [["still on hand", "remaining recorded material can be quarantined", 1], ["unpackaged batch", "consumption without a finished lot remains visible"], ["no shipments", "no recorded customer shipments"], ["unknown lot", "not found"]],
    spec: "Header Search finds material lot codes, even when exhausted, for Admin and Sales. Trace follows effective consumption into every brew turn and cellar addition, packaging-material consumption and recorded blend membership, then finished lots and actual recipients. Exact reversed consumptions are excluded. Unlinked tracked consumption is shown explicitly; historical untracked material cannot be assigned a lot. Quantities show recorded use, not estimated shares. The same MaterialLotTraceView serves inventory and live reads.",
    body: <MaterialLotTraceView model={toMaterialLotTraceViewProps(materialLotTraceCitra, DEMO_TIME_ZONE)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "Purchase orders",
    to: { "New PO": "New PO", "Mark sent": "Draft PO" },
    job: "See draft, sent and partially received purchase orders",
    reads: "list_purchase_orders",
    writes: "none [creation and receiving happen on their own surfaces]",
    states: [["draft", "Mark sent is the next action"], ["partial", "Receive stays available for the remainder"], ["empty", "no open purchase orders: New PO is the only action"]],
    spec: "The Work list with the Purchase orders tab active. Each row names the next action; New PO opens the existing vendor purchase draft, and Receive PO returns here.",
    body: <PurchaseOrdersView model={toPurchaseOrdersViewProps(purchaseOrdersWarehouse)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "New PO",
    to: { Vendor: "Entity picker", "Add line": "New PO", Remove: "New PO", "Save draft": "Purchase orders", "Save and mark sent": "Receive PO" },
    job: "Draft a vendor order: lines, cost, and the lot the vendor named",
    reads: "list_vendors_and_contracts · list_materials · get_material_requirements",
    writes: "create_purchase_order [one RPC: draft PO + all lines] · send_purchase_order [Save and mark sent]",
    states: [["permission", "warehouse or admin required", 1], ["new", "vendor and one line required · every line needs a material and a quantity above zero · Remove drops a line"], ["lead time", "picking a vendor sets Expected to today plus its typed lead time · blank when it has none · still editable"], ["from requirements", "Planning drafts the lines; the shortfall is the quantity"], ["contracted lot", "the vendor named a lot on the contract · it prefills receiving"], ["contract in force", "one contract for the vendor and material in force today · the line's cost starts at its price and the line draws it down · several leave it blank"], ["no lot named", "the ordinary case · receiving captures it off the package"], ["past date", "an Expected date before brewery-local today warns; Save draft still works"]],
    spec: "A flat form: vendor and optional expected date (picking a vendor fills it with today plus the vendor's lead time), then material lines with visible quantity and unit-cost labels. Spacing groups related fields without cards, repeated section headings, line-number headings, a Draft badge, or instructional paragraphs. Material, quantity, and cost align on large screens; smaller screens stack material above the numeric fields, and the narrowest screens stack all three. Each line owns its Remove action and optional expected lot. Expected lot is advisory, creates no lot record, and only appears for lot-tracked materials. Receiving prefills from it; the actual package decides the received lot. Once a vendor is chosen, its default materials lead the material picker. Save draft retains its validation reason; Save and mark sent waits on the same fields, marks the saved draft sent from a mail client, and opens it. If marking fails, the error says the draft is saved and links it.",
    body: <NewPoView model={newPoDraft} />,
  },
  {
    step: 7, slice: 2, tab: "Work", name: "New PO incomplete",
    to: { "Add a vendor": "Vendors", "Add line": "New PO", "Save draft": "Purchase orders", "Save and mark sent": "Receive PO" },
    job: "See what a draft still needs before it can be saved",
    reads: "list_vendors · list_materials", writes: "create_purchase_order",
    states: [["no vendors", "the picker says so and links to Vendors", 1], ["bad value", "marked at its field with what to enter instead", 1], ["withheld", "Save draft names what is still missing"]],
    spec: "The shared form feedback on one page. An empty picker says there is nothing to choose and links to where the record is made. A typed value the command cannot take is marked at its own field, with the correction under it; a blank optional cost is not an error. Save draft stays withheld, and the sentence beside it names every missing piece, so a disabled button is never silent.",
    body: <NewPoView model={newPoIncomplete} reason={newPoReason({ vendor: newPoIncomplete.vendor, lines: newPoIncomplete.lines })} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "Receive PO",
    to: { "Cancel purchase order": "Purchase orders", "Close short": "Purchase orders" },
    job: "Count what arrived; trigger derives receipt status",
    reads: "get_purchase_order · list_locations · list_bins · get_material_on_hand [the first open line's material: the receipt starts on the bin holding the most of it]",
    writes: "cancel_purchase_order [draft or sent without receipts; required reason releases remainder] · close_purchase_order_short [received stock retained; required reason releases remainder] · send_purchase_order [single row draft → sent; an attestation: Marked sent, never Delivered] · receive_purchase_order [one RPC: receipt + lines (counted, over or short, optional actual unit cost) + lots with best_by + material movements] · Recent lot suggestions [SCHEMA-GATE: post-v1 scope; the purchase-order query does not return recent material lots]",
    states: [["loading", "PO-line skeleton"], ["draft", "Mark sent is the one active verb · Edit draft reopens the lines · counts wait, and the receive verb is not drawn", 1], ["prefilled", "the PO named a lot · the field opens on it and the ordinary receipt changes nothing"], ["no lot on the PO", "the field opens empty · recent lots for that material are offered", 1], ["lot substituted", "the vendor shipped another lot · recorded, never blocked", 1], ["stale", "receipt changed · recheck", 1], ["offline", "keep counts; commit waits"], ["permission", "warehouse or admin", 1], ["success", "partially received"]],
    spec: "Cancel purchase order and Close short fold behind their titles below the order's next verb. Cancel purchase order requires a reason and no posted receipts. Close short requires a reason after a receipt; only the unreceived remainder is released, with actor and time retained. Closed orders leave Work and planning, refuse new receipts, and receipt corrections never reopen them. Send PO (green) shows while the PO is draft; receiving needs a sent PO. Each lot-tracked line takes a lot code and best-by typed off the vendor packaging, prefilled from the lot the PO named so the ordinary receipt is a glance and no typing. When the PO named none the field opens empty and offers that material\u2019s recent lots, which is what keeps one vendor lot from becoming two records over a stray space. The receive RPC creates the material lot from what is entered here, never from the PO: the package is the only writer of a lot code. A difference is a substitution, which is reported and never blocked. Punctuation or case alone never reads as one: the schema spec owns that comparison rule. Untracked lines (rice hulls) ask for none. Only counted quantity posts; over and short are both visible and both allowed, and the keypad never clamps an over-count as the only guard. PO status is trigger-derived; never write a loaded/status flag.",
    body: <ReceivePoView model={receivePoSent} />,
  },
  {
    step: 7, slice: 2, tab: "Work", name: "Draft PO",
    to: { "Edit draft": "Edit PO", "Mark sent": "Receive PO", "Cancel purchase order": "Purchase orders" },
    job: "Mark a draft sent, or fix its lines first",
    reads: "get_purchase_order",
    writes: "send_purchase_order [single row draft → sent; an attestation: Marked sent, never Delivered] · cancel_purchase_order [required reason]",
    states: [["permission", "warehouse or admin", 1], ["draft", "Mark sent first · Edit draft opens Edit PO · Cancel purchase order folded below"]],
    spec: "Receive PO for a draft. The lines read as ordered, How it went out picks the attestation, and Mark sent is the verb. Edit draft opens the same New PO form on the saved lines. Cancel purchase order is rare, so it folds behind its title after Mark sent and opens to its reason and button.",
    body: <ReceivePoView model={draftPoCanSource} />,
  },
  {
    step: 7, slice: 2, tab: "Work", name: "Edit PO",
    to: { "Add line": "Edit PO", Remove: "Edit PO", "Save draft": "Draft PO", "Save and mark sent": "Receive PO" },
    job: "Change a draft's vendor, expected date or lines before it is sent",
    reads: "get_purchase_order · list_vendors_and_contracts · list_materials",
    writes: "update_purchase_order [one RPC: draft header + all lines replaced] · send_purchase_order [Save and mark sent]",
    states: [["permission", "warehouse or admin required", 1], ["draft", "opens on the saved vendor, expected date and lines"], ["sent", "a sent or closed order returns to its page", 1]],
    spec: "The New PO form, titled with the draft's number and opened on what was saved. The same validation and verbs apply: Save draft returns to the draft, and Save and mark sent marks it sent and opens it. The note a draft carries is kept.",
    body: <NewPoView model={editPoCanSource} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "Receipt",
    to: { Work: "Purchase orders", "PO-0142": "Receive PO", "Correct receipt": "Correct receipt", "Original receipt": "Receipt", "Corrected receipt": "Receipt", "Fix Accounting mappings": "QuickBooks mappings" },
    job: "What posted after a receive, including over, short, what is still owed, and its QuickBooks Bill",
    reads: "get_purchase_order [ordered less counted per line; correction-chain Bill identity and status] · get_qbo_connection [admin only; purchase account] · list_vendors [admin Bill mapping readiness]",
    writes: "post_receipt_bill [admin only; confirmation; one frozen Bill per receipt correction chain; pending retries query then replay the exact snapshot and provider request ID; definite rejection requires explicit newAttemptReason corrected]",
    states: [["permission", "warehouse or admin required; only admin can post Bills", 1], ["partial", "the PO is partially received · the remainder is named"], ["complete", "every line met expected · nothing is owed"], ["unmapped", "fix exact vendor and purchase account IDs in Accounting mappings", 1], ["unknown", "retry checks for the Bill first then resends the same snapshot and provider request ID if absent", 1], ["rejected", "fix mappings then explicitly Post corrected Bill", 1], ["posted", "Bill posted, adjust in QuickBooks; payments are QuickBooks-only"]],
    spec: "Post-commit of Receive PO. The tape is the receipt; status is derived. The remainder is the ordered quantity less everything counted so far, and it is the number a buyer chases a vendor with, so it is stated rather than left to be worked out from the tape. It is derived on read for the same reason status is: a stored balance would need its own correction path the moment a recount lands, and a recount is the ordinary way a miscount is fixed here.",
    body: <ReceiptFixture><ReceiptView model={receiptPoPartial} /></ReceiptFixture>,
  },
  {
    step: 7, slice: 2, tab: "Work", name: "Correct receipt",
    to: { "Correct receipt": "Receipt" },
    job: "Correct receipt counts and receiving bin without erasing original facts or downstream provenance",
    reads: "get_purchase_order [frozen receipt quantities, units and lot facts] · list_locations · list_bins",
    writes: "correct_purchase_receipt [exact material reversal and immutable replacement receipt with corrected counts and unit costs in one transaction]",
    states: [["permission", "warehouse or admin", 1], ["ready", "reason, corrected counts and receiving bin"], ["blocked", "negative stock or changed used/shared lot identity", 1], ["stale", "receipt already replaced; open its latest revision", 1], ["success", "replacement receipt and current balance"]],
    spec: "Reuse Receive PO fields with a required reason and editable receiving location and bin. Keep the receipt date fixed. Unit cost ($) starts on the frozen receipt price; an optional replacement price changes this receipt only, never the sent order. Preserve original facts, append exact compensation movements, and record replacement counts. Subsequent use is allowed when the resulting affected buckets stay nonnegative and used lot identities remain unchanged. Only the latest revision contributes to the PO balance.",
    body: <ReceivePoView model={correctReceiptPo} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "Beer",
    name: "Materials on hand",
    to: { Edit: "Edit material", "Count sheet": "Count sheet" },
    job: "See material quantities, edit a material, and start a count",
    reads: "list_materials · get_material_on_hand",
    writes: "none [edits happen in Edit material, counts in Cycle count and Count sheet]",
    states: [["inactive", "an inactive material stays listed, its Status Inactive"], ["empty", "add a material, then open Purchase orders to receive stock"]],
    spec: "The Beer landing's Materials on hand row opens this list. Each row shows the material's type, on hand summed across bins in its base unit, whether its lots are tracked, and its status. Edit opens Edit material for that material's definition; Count opens Cycle count for its stock; Count sheet opens one count over every listed material held in a bin; Add material opens a blank definition. One list serves both, so there is no separate definitions list.",
    body: <MaterialsOnHandView model={toMaterialsOnHandViewProps(materialsOnHandList)} controls={<ListControls search={{ label: "Search materials", value: "", keep: {} }} scopes={toMaterialsScopes({ category: "" })} />} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "Beer",
    name: "Materials empty",
    job: "Add the first material and find Purchase orders to receive stock",
    reads: "list_materials · get_material_on_hand",
    writes: "none [creation happens in Add material]",
    states: [["empty", "add a material before receiving it"]],
    spec: "Keep Add material at the page header and Purchase orders with the empty-state instructions.",
    body: <MaterialsOnHandView model={toMaterialsOnHandViewProps({ rows: [] })} />,
  },
  {
    step: 7,
    slice: 2,
    group: "Global",
    surface: "sheet",
    name: "Cycle count",
    to: { Material: "Entity picker", "Preview count": "Cycle count", "Record count": "Materials on hand" },
    job: "Post only variance as an append-only movement",
    reads: "get_material_on_hand · get_material_count_preview",
    writes: "record_material_count [one RPC: reviewed revision + count + lines + exact adjustment movements] · Roll conversion [SCHEMA-GATE: post-v1 scope; counts accept base units only]",
    states: [["permission", "warehouse or brewer required", 1], ["one lot", "the variance lands on it · nothing to choose"], ["several lots", "a shortage consumes earliest best-by first; an overage lands on the newest lot"], ["no best-by", "lots with none fall to receipt order behind those that have one"], ["split", "a shortage crossing two lots names both in the preview", 1], ["base units", "enter the material base quantity · roll conversion remains unavailable", 1]],
    spec: "A count is one number and a material may hold several lots, so the RPC has to decide which lot moves. A shortage consumes earliest best-by first, not earliest receipt: best-by is what a recall and an expiry sweep read, and consuming the freshest lot first would leave the oldest to expire on the shelf. An overage lands on the newest lot, since unrecorded stock is far likelier to be the delivery just counted in than one from six months ago. Preview count names each affected lot and signed base-unit adjustment before Record count. Changed stock or lot metadata requires another preview; an uncertain record response freezes the request for exact retry. The chosen lot is always named in the preview: a variance that silently splits across two lots is the one thing this sheet must not do quietly. All materials use their stored base units. Roll conversion remains gated and no manual lot editor is offered.",
    body: <><CycleCountView model={cycleCountCans} footer={null} />{E.pin(<CycleCountFooter />)}</>,
  },
  {
    step: 7,
    slice: 2,
    group: "Global",
    surface: "sheet",
    name: "Count sheet",
    to: { Material: "Entity picker", "Preview count": "Count sheet", "Record count": "Materials on hand" },
    job: "Count every material held in one bin in one pass",
    reads: "get_material_on_hand · get_material_count_preview",
    writes: "record_material_count [one RPC: reviewed revision + count + every counted line + exact adjustment movements]",
    states: [["permission", "warehouse or brewer required", 1], ["blank", "a line left blank is not counted and not recorded"], ["matching", "a line that matches still records, with no adjustment", 1], ["empty", "no listed material has stock in the bin", 1]],
    spec: "Materials on hand's Count sheet opens this. Pick the location and bin; the sheet lists every material on the list with stock in that bin, by name. Type a count for each material you counted and leave the rest blank. One preview covers every counted line and names each line's lots and signed adjustments, then one Record count saves them as one count with the reviewed revision. Lot choice, the stale-preview refusal and the frozen retry are Cycle count's. A search or type filter on the list narrows the sheet too.",
    body: <><CycleCountView model={countSheetShelf} footer={null} />{E.pin(<CycleCountFooter />)}</>,
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    name: "Vendors",
    to: { Edit: "Vendor" },
    job: "List suppliers and open one supplier's terms",
    reads: "list_vendors_and_contracts · list_vendors [while a search is on: the new-contract vendor picker still offers every vendor]",
    writes: "none [creation and editing happen on Vendor]",
    states: [["permission", "warehouse or brewer required", 1], ["active", "available for purchase orders"], ["contract", "committed quantity summarized"], ["empty", "Add vendor is the only action"]],
    spec: "Materials, vendors and contracts are separate lists so each row has one predictable destination.",
    body: <VendorsView model={toVendorsViewProps(vendorsList)} controls={<ListControls search={{ label: "Search vendors", value: "", keep: {} }} />} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    name: "Vendor detail",
    to: { Edit: "Vendor", "Citra 2026": "Materials on hand", "Mosaic 2025": "Materials on hand" },
    job: "See one supplier's terms, contracts, open orders and default materials",
    reads: "list_vendors_and_contracts [vendorId] · list_purchase_orders [vendorId; admin or warehouse] · list_materials [defaultVendorId, inactive included]",
    writes: "upsert_vendor [on Vendor]",
    states: [["permission", "warehouse or brewer required", 1], ["brewer", "no open purchase orders section"], ["inactive", "status reads Inactive · history remains"], ["no contracts", "the Contracts section says so"], ["no open orders", "the open purchase orders section says so"], ["no default materials", "the Default materials section says so"]],
    spec: "Edit stays on each Vendors row and is also here; both open the same Edit vendor sheet. Deactivate vendor stays inside that sheet rather than becoming its own button. Contracts are read-only here; Add and Edit contract stay in the Contracts list on Vendors. Default materials include inactive ones, marked Inactive, as Materials on hand shows them. Only open purchase orders are listed: draft, sent and partially received. Brewer cannot read purchase orders, so for Brewer the section is left out rather than shown empty.",
    body: <VendorDetailView model={toVendorDetailViewProps(vendorDetail)} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    surface: "sheet",
    name: "Edit material",
    to: { "Save material": "Materials on hand" },
    job: "Edit one material definition",
    reads: "list_materials",
    writes: "upsert_material",
    states: [["permission", "warehouse or brewer required", 1], ["new", "name, kind and base unit required"], ["in use", "units change refused", 1], ["lot-tracked", "every receipt and consumption names a lot; off means none may"], ["malt or adjunct", "extract potential asked; recipe predictions read it"]],
    spec: "Inventory quantities and lots are not edited on the definition, and neither is lead time: the wait is a property of who fulfils an order, so it lives on the vendor. The purchase-unit factor does live here, because a hop box and a can pallet from one supplier are different numbers, and the factor is what turns counted bags into base units on Receive PO.",
    body: <MaterialView model={materialCitra} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    surface: "sheet",
    name: "Add material",
    to: { "Save material": "Materials on hand" },
    job: "Create a material definition before ordering or counting stock",
    reads: "list_vendors",
    writes: "upsert_material",
    states: [["permission", "warehouse or brewer required", 1], ["new", "name, kind and base unit required"]],
    spec: "Kind starts unselected. Unit labels name the measure without changing the stored unit or purchase-unit factor.",
    body: <MaterialView model={{ ...materialCitra, name: "", kind: "", unit: "lb", purchaseUnit: "lb", baseUnits: "1", defaultVendorId: "", lotTracked: false }} />,
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    surface: "sheet",
    name: "Vendor",
    sheetTitle: "Edit vendor",
    to: { "Save vendor": "Vendors" },
    job: "Create or edit one supplier and its purchase terms",
    reads: "list_vendors_and_contracts",
    writes: "upsert_vendor",
    states: [["permission", "admin, warehouse or brewer required", 1], ["new", "name required · status controls appear after saving"], ["active", "available for new purchase orders"], ["inactive", "not a New purchase order choice · existing links remain"], ["change status", "Deactivate vendor or Reactivate vendor confirms before saving form changes"]],
    spec: "Contracts remain separate records because a vendor may supply many materials. Lead time lives here rather than on the material: every observation of it is an ordered-to-received span keyed by the vendor, so the estimate sits where the evidence is. Planning reads it to date the buy-by of the slowest supplier a bill of materials resolves to.",
    body: <VendorView model={vendorEdit} />,
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
    sheetTitle: "Edit contract",
    to: { Vendor: "Entity picker", Material: "Entity picker", "Save contract": "Contracts" },
    job: "Create or edit one material purchasing commitment",
    reads: "list_materials · list_vendors_and_contracts",
    writes: "upsert_material_contract · delete_material_contract",
    states: [["permission", "warehouse or brewer required", 1], ["new", "vendor, material and quantity required"], ["received", "received and on-order quantities are read-only"], ["dates", "an end before the start is named under Ends and blocks Save · a set date offers Clear"], ["on purchase orders", "Delete is refused; set an end date instead", 1]],
    spec: "This sheet owns the commitment and nothing else. Receipts and open releases both update progress, and neither is editable here: a quantity a buyer could type over would stop being evidence. Available is the commitment less what has arrived and less what is already ordered, which is the only one of the four numbers worth acting on. Delete confirms first and is refused once a purchase order uses the contract; set an end date instead.",
    body: <ContractView model={contractEdit} />,
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Recipes",
    to: { "New recipe": "Recipe", "Hazy IPA": "Recipe", Pils: "Recipe", "Farmhouse saison": "Recipe", "Water profiles": "Water profiles" },
    job: "Find recipe versions and create the next recipe",
    reads: "list_recipes",
    writes: "none [creation and versioning happen on Recipe]",
    states: [["no version yet", "a recipe saved without a version reads No version yet, in the warning style"], ["empty", "no recipes yet: New recipe, with the Water profiles row below"]],
    spec: "The More landing's Recipes row opens this list, and its back returns to More. Each row shows the recipe's name, its current version and its brand, and the name opens Recipe at that version; New recipe opens Recipe with no version yet: the parent fields above the first version's editor, one save. A Water profiles row under the list opens the catalog a version picks its source and target water from.",
    body: <RecipesView model={toRecipesViewProps(recipesList)} controls={<ListControls search={{ label: "Search recipes", value: "", keep: {} }} />} />,
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Recipe",
    // The Round choices rewrite the line's per bbl in place, so they stay on Recipe.
    to: { "Schedule batch": "New batch", "v4 (current)": "Recipe", v3: "Recipe", v2: "Recipe", v1: "Recipe", "Round to 19 × 50 lb": "Recipe", "Round to 20 × 50 lb": "Recipe", "Round to 1 × 44 lb": "Recipe", "Add ingredient": "Ingredient", "Mash schedule · 3 steps": "Mash schedule", "Fermentation schedule · 4 stages": "Fermentation schedule", Water: "Water" },
    job: "Author immutable versions from assumptions; actuals keep predictions honest",
    reads: "list_recipes · get_recipe · list_brands [the parent row's Brand picker] · get_recipe_outcomes [design; per-batch actual OG/FG/ABV + realized efficiency/attenuation, derived from fermentation readings, never stored]",
    writes: "create_recipe [mutable parent row] · set_recipe_brand [change the parent row's brand after creation] · create_recipe_version [one RPC: immutable version + ingredients + mash and fermentation schedules + water and additions, with assumption and process-spec columns on recipe_versions and per-ingredient extract snapshot on recipe_ingredients]",
    states: [...permitted("brewer or admin required"), ["no group yet", "the brand picks one at packaging · nothing is blocked"], ["no version", "a recipe without a version draws No version yet, says what a version records, and keeps New recipe version as the one action, no numbers"], ["draft", "New recipe version opens a copy of the current version; an unsaved draft is kept in this tab and restored with Start over"], ["frozen", "a saved version reads out as text; a change is the next version"], ["history", "Versions links select an older saved version; (current) returns to the latest; older versions have no write controls"], ["schedule", "Schedule batch sits beside New recipe version once a version exists; it opens New batch on Batches with the current version and its brand chosen; an older version and a recipe without one do not offer it"]],
    spec: "Predictions come from one shared registry-layer formula over the version’s snapshotted inputs (assumptions + per-ingredient extract); the editor’s live preview and server reads call the same function; values are never stored, so there is no SQL copy. The page defaults to the newest version; Versions links beside Saved open an exact version with ?v=N, and (current) returns to the newest. Older versions are read-only; each batch's Brew day keeps the plan it was brewed from. A new parent takes a name, the brand it is meant to brew and a note; the brand names the style. New recipe opens this page with no version, and one save writes the parent and its first version. Versions append, and history is never edited. Costing lives on desk. A version is the executable process spec, not only the prediction inputs: volumes, boil, whirlpool and knockout are scalars here, while the mash and fermentation schedules and water open as their own screens because they repeat and carry add, reorder and delete. The mash temperature is gone from this page, because every mash step carries one and a scalar beside them is a second answer to one question. Batch size and knockout volume are gone too: every quantity is per barrel, the batch names its size on Brew day, and Brew day already records knockout volume as its baseline. The scale chips that once previewed a 15 or 30 bbl bill are gone until a brewery's own batch sizes can feed them. Three note fields become one.",
    body: <RecipeView model={recipeHazyV4} parentForm={<NewRecipeFieldsView brands={recipeBrandOptions} values={{ name: "Hazy IPA", brandId: "hazy", note: "" }} />} />,
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    surface: "sheet",
    name: "Ingredient",
    to: { "Save ingredient": "Recipe", "Delete ingredient": "Recipe" },
    job: "One line of the bill: which material, where it enters, how much per barrel",
    reads: "list_materials · none [draft: the version form’s state]",
    writes: "create_recipe_version [written with the version, never alone]",
    states: [["permission", "brewer or admin required", 1], ["draft", "editable until the version is cut"], ["frozen", "a cut version reads only", 1]],
    spec: "The add-ingredient row on Recipe opens this sheet straight into the fields; there is no list to pass through because the recipe page is the list. Quantity is per barrel in the material's own base unit so the batch size scales it and no unit is retyped; timing is optional and in minutes, since a dry hop’s day is a fermentation stage, not an ingredient fact.",
    body: (<>
      <IngredientView fields={{ materialId: "citra", stage: "dry_hop", perBblQty: "1.2", timing: "" }} materials={[{ id: "2row", name: "2-row", unit: "lb", category: "malt" }, { id: "citra", name: "Citra", unit: "lb", category: "hop" }, { id: "cans", name: "Cans · 16 oz", unit: "each", category: "packaging" }]} />
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Mash schedule",
    to: { Edit: "Mash step", "Add step": "Mash step", "Mash-in": "Mash step", Saccharification: "Mash step", "Mash-out": "Mash step" },
    job: "Order the rests a brewer actually holds on the day",
    reads: "get_recipe [a cut version’s mash schedule] · none [draft: the version form’s state]",
    writes: "create_recipe_version [the steps are written with their version, never alone]",
    states: [["permission", "brewer or admin required", 1], ["draft", "steps add, reorder and delete"], ["frozen", "a cut version reads only · create the next version to change it", 1], ["empty", "no steps yet: Add step is the only action"]],
    spec: "Its own screen because it repeats: add, reorder and delete are verbs a scalar field never needs, and inlining them on Recipe would give that page a second primary. A version is immutable, so this surface is an editor on a draft and a read-out once cut: one whole-screen mode rather than a toggle threaded through a long page. The footer names the conversion rest because Recipe no longer carries a mash temperature of its own; without it the number the prediction reads would have no visible home.",
    body: (<>
      <MashScheduleView title="Hazy IPA v4 · Mash schedule" steps={MASH_STEPS} />
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
    reads: "none [draft: the version form’s state]",
    writes: "create_recipe_version [written with the version, never alone]",
    states: [["permission", "brewer or admin required", 1], ["draft", "editable until the version is cut"], ["frozen", "a cut version reads only", 1]],
    spec: "Type and name both stay: they look redundant until a recipe has two infusion steps, where the type says what the brewer does and the name says which one it is. Position comes from list order, never a typed number.",
    body: (<>
      <MashStepView fields={toMashStepFields(MASH_STEPS[1])} />
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Fermentation schedule",
    to: { Edit: "Fermentation stage", "Add stage": "Fermentation stage", Primary: "Fermentation stage", "Diacetyl rest": "Fermentation stage", "Cold crash": "Fermentation stage", Conditioning: "Fermentation stage" },
    job: "State the temperatures and days a batch is meant to hold",
    reads: "get_recipe [a cut version’s fermentation schedule] · none [draft: the version form’s state]",
    writes: "create_recipe_version [written with their version, never alone]",
    states: [["permission", "brewer or admin required", 1], ["draft", "stages add, reorder and delete"], ["frozen", "a cut version reads only · create the next version to change it", 1], ["empty", "No stages yet. Add a stage to plan temperatures and timing."]],
    spec: "The same shape as Mash schedule and for the same reason. The footer places the dry hop because Recipe draws a dry hop on a day number, and a day number means nothing without this list: day 4 is the last day of Primary, which is why a brewer chose it. The separate fermentation-days and conditioning-days fields v1 kept beside this list are dropped, because the list sums to them and two sources for one number is the failure this design keeps removing.",
    body: (<>
      <FermentationScheduleView title="Hazy IPA v4 · Fermentation" stages={FERM_STAGES} dryHopDay={4} />
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
    reads: "none [draft: the version form’s state]",
    writes: "create_recipe_version [written with the version, never alone]",
    states: [["permission", "brewer or admin required", 1], ["draft", "editable until the version is cut"], ["frozen", "a cut version reads only", 1]],
    spec: "Stage type and name both stay, as on Mash step: two custom stages need the type to say what happens and the name to say which one. Position comes from list order.",
    body: (<>
      <FermentationStageView fields={toStageFields(FERM_STAGES[1])} />
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Water",
    to: { "Water profiles": "Water profiles", Add: "Water addition", Edit: "Water addition", "Add addition": "Water addition", Gypsum: "Water addition", "Calcium chloride": "Water addition", "Lactic acid": "Water addition" },
    job: "State the water a version starts from, aims at, and what goes in it",
    reads: "get_recipe [a cut version’s water] · list_water_profiles · none [draft: the version form’s state]",
    writes: "create_recipe_version [water values and the water additions are written with the version]",
    states: [["permission", "brewer or admin required", 1], ["source profile", "the version picks its source from Water profiles, which this sheet links to"], ["second source", "an osmosis blend or a second supply is another profile"], ["draft", "additions add, reorder and delete"], ["frozen", "a cut version reads only", 1], ["suggestions hidden", "post-v1 scope; Suggest additions and the ion read-out are not drawn until materials carry a salt identity, as in the live sheet"], ["off target", "post-v1 scope; once unlocked, an ion more than 20 ppm from target warns", 1]],
    spec: "Source water is what comes out of the tap. Settings has no brewery-wide source default: each version picks its source from the Water profiles catalog, which Settings → Water profiles opens for Admin and the Water profiles row here opens for Brewer (Brewer has no Catalog), and an osmosis blend or a second supply is just another profile. v1 stored the ions per recipe, so every recipe repeated the same municipal profile and a new water report meant editing all of them; a catalog profile is edited once. Each addition carries one stage, not v1’s pair of timing and target: for water chemistry those are one axis wearing two hats, since a salt added at mash time goes into the mash by definition. Post-v1 scope: Suggest additions and the Against target read-out are hidden here and live until materials carry a salt identity; when they open, both run the one shared water formula (waterChemistry) over mash plus sparge water. pH prediction is still not built.",
    body: (<>
      <WaterView title="Hazy IPA v4 · Water" water={WATER_HAZY} profiles={WATER_PROFILE_OPTIONS} materials={SALT_OPTIONS} />
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
    reads: "list_materials · none [draft: the version form’s state]",
    writes: "create_recipe_version [written with the version, never alone]",
    states: [["permission", "brewer or admin required", 1], ["draft", "editable until the version is cut"], ["frozen", "a cut version reads only", 1]],
    spec: "One stage field, never a timing and a target both. The material comes from the materials catalog that already exists, so a salt is bought, stocked and consumed like any other input.",
    body: (<>
      <WaterAdditionView fields={toAdditionFields(WATER_HAZY.additions[0])} materials={SALT_OPTIONS} />
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Compliance months",
    to: { "September 2026": "Period in progress", "August 2026": "Filed period needs amendment" },
    job: "Choose a monthly, quarterly, or annual reporting period and see whether its snapshot was filed",
    reads: "list_compliance_reports · list_compliance_active_periods · list_lots",
    writes: "none",
    states: [["not filed", "Not filed · Ready to review", 1], ["no activity", "an ended, unfiled period with no movement, cellar removal or invoice · Not filed · No activity", 1], ["in progress", "the current period: reviewable · In progress · File after the month ends"], ["filed", "the snapshot saved in MGR · Filed <date> · <bbl> taxpaid"], ["lot search", "a lot code lists the newest matching lots, each opening its trace; none before a search"], ["no lot match", "No lots match · check the code or clear the search", 1], ["no period yet", "every recent period starts before the books opened · names that date and the first period MGR can report"]],
    spec: "This is the shared destination for the Licenses back link, the period rows, and the lot trace. Monthly, Quarterly, and Annual tabs swap the list: the last three months, four calendar quarters, or two calendar years show, less any that start before the books-opened date, plus every filed period of that length. A tab left with no period says No monthly (quarterly, annual) period yet. Lot trace is a lot-code search: no lot is listed until a code is searched, then the 50 newest matches show. A TTB filing is exactly one calendar month, quarter, or year; the API takes other jurisdictions and ranges.",
    body: <ComplianceMonthsView model={complianceMonthsDemo} controls={<ListControls search={{ label: "Search lot codes", value: "", keep: {} }} />} />,
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Monthly compliance",
    to: { Confirm: "Monthly compliance", "Reattribute loss": "Reattribute loss" },
    job: "Generate from ledgers, review, then record in MGR a filing made with TTB outside it",
    reads: "list_compliance_reports · generate_compliance_report · get_loss_review",
    writes: "file_compliance_report · reattribute_loss",
    states: [["past/current/upcoming", "calendar position in the brewery's day, separate from Live figures or Filed"], ["empty export", "No transactions in this period · export disabled", 1], ["does not balance", "step 2 names what does not balance · Save is off, with the reason beside it", 1], ["filed", "the snapshot is shown, not regenerated"], ["permission", "sales or admin required", 1]],
    spec: "Admin and Sales review exact generic cellar losses (each batch completion loss and each cellar transfer loss) and allocate each remainder to Sample, Taproom, or Destruction through append-only category changes, never free-text note matching. Corrections post in the period they are saved and leave earlier filed snapshots unchanged. The identity checks are v1 lessons drawn in user copy: balance per class, one additive removal total, an explanatory non-additive cellar breakdown, 0.00 never blank. Step 3 says before Save that MGR does not file with TTB or the state: Save filed snapshot only records the filing in MGR. Beer in process depends on the period: the current period shows the tanks now; an ended period shows the beer remaining in tanks at the end of its last day in the brewery's time zone. The hint says which, and names that period-end date. Destination-state totals and Export state transactions retain exact supporting movement BBL and invoice/credit cents, including source-linked returns and signed adjustments. Filed exports use the saved facts; missing historical facts are explicit. Removals are keyed by frozen tax treatment; direct cellar Taproom volume files once, as a removal under its frozen Taproom tax treatment (taxpaid for the default channel).",
    body: <MonthlyComplianceView model={toMonthlyComplianceViewProps(monthlyComplianceAugust)} />,
  },
  {
    step: 7, slice: 6, tab: "More", surface: "sheet", name: "Reattribute loss",
    to: { "Save reattribution": "Monthly compliance" },
    job: "Choose how much of a cellar loss belongs on another TTB line",
    reads: "get_loss_review",
    writes: "reattribute_loss",
    states: [["no target", "the exact whole remainder is filled in · Target is unchosen · Save names the missing target"], ["sample", "a two-letter destination state is required"], ["partial", "a positive amount with up to eight decimal places cannot exceed the exact remainder"], ["uncertain", "fields and request ID stay frozen · Retry unchanged reattribution recovers the result"], ["saved", "Loss reattribution saved · refresh the remaining amount"], ["permission", "sales or admin required", 1]],
    spec: "Shares the live command form and E fields. No target is selected by default: Sample, Taproom, and Destruction post to different TTB lines. Samples require a destination state. Corrections append history in the period they are saved, without changing earlier filed snapshots.",
    body: <ReattributeLossView loss={monthlyComplianceAugust.losses[0]} />,
  },
  {
    step: 7, slice: 6, tab: "More", name: "Report does not balance",
    to: { "Reattribute loss": "Reattribute loss" },
    job: "See why a period's filing cannot be recorded yet, and what to check",
    reads: "list_compliance_reports · generate_compliance_report · get_loss_review",
    writes: "reattribute_loss",
    states: [["does not balance", "step 2 notes name each class that does not balance and any movement with no report column · Save is off, the same words beside it"], ["unassigned", "a transaction with no recorded destination is noted in step 2 and does not hold Save", 1]],
    spec: "The same Monthly compliance page when the generated report does not balance. The adapter puts the report's warnings in staff words and builds the reason beside Save from the blocking ones; the Unassigned note never blocks. A warning it does not recognize is shown as written.",
    body: <MonthlyComplianceView model={toMonthlyComplianceViewProps(monthlyComplianceUnbalanced)} />,
  },
  {
    step: 7, slice: 6, tab: "More", name: "Filed period needs amendment",
    to: { "Reattribute loss": "Reattribute loss" },
    job: "Review an original filed snapshot and the recorded basis correction that requires an external amendment",
    reads: "list_compliance_reports · get_loss_review",
    writes: "reattribute_loss",
    states: [["needs amendment", "original snapshot unchanged · corrected figures and actor/time history"], ["invalidated period", "period starts before corrected books-opened date · consult compliance owner"], ["permission", "sales or admin required", 1]],
    spec: "A recorded admin basis correction flags every filed period it affects. The same shared Monthly compliance view retains the immutable original snapshot and shows the recorded corrected figures separately. No amended report is sent or flag cleared by MGR.",
    body: <MonthlyComplianceView model={toMonthlyComplianceViewProps(monthlyComplianceAmended)} />,
  },
  {
    step: 7, slice: 6, tab: "More", name: "Period before the books opened",
    to: { "Open Settings": "Settings" },
    job: "Explain why a period that starts before the books opened has no report",
    reads: "list_compliance_reports",
    writes: "none",
    states: [["before books", "the period starts before the books-opened date · no report, Settings holds the date"], ["sales", "no Open Settings button, which would land on No access · asks an admin to change the date", 1]],
    spec: "MGR reports only from the books-opened date on, so a period that starts earlier has nothing to generate. The page names that date instead of failing. Drawn as an admin, who gets Open Settings; Settings is admin-only, so Sales is asked to have an admin change the date instead. A filed period stays readable after a basis correction (Filed period needs amendment).",
    body: <PeriodBeforeBooksView title="October 2026" state={{ ...beforeBooksState("October 2026", "2026-10-15", true, "2026-10-20"), action: { label: "Open Settings" } }} />,
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Period in progress",
    to: { "Reattribute loss": "Reattribute loss" },
    job: "Review the current period from the ledger before it can be filed",
    reads: "list_compliance_reports · generate_compliance_report · get_loss_review",
    writes: "reattribute_loss",
    states: [["in progress", "the period has not ended · \"You can record the filing after <period> ends\" in place of Save"], ["filed early", "refused: a period is filed only after it ends", 1]],
    spec: "The same Monthly compliance page while its month, quarter, or year is still running. Figures and losses are reviewable and losses can be reattributed, but the snapshot is not offered until the period ends, so a filing never freezes part of one.",
    body: <MonthlyComplianceView model={toMonthlyComplianceViewProps(monthlyComplianceSeptember)} />,
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Licenses",
    to: { Edit: "License" },
    job: "Maintain the brewery’s own state licenses",
    reads: "get_compliance_registry",
    writes: "upsert_brewery_state_license · delete_brewery_state_license",
    states: [["current", "expiry is today or later, or not recorded"], ["expired", "expiry before today in the brewery timezone · warning and expired mark", 1], ["empty", "no licenses yet: Add license is the only action"], ["permission", "sales or admin required", 1]],
    spec: "The brewery’s licenses, not any brand’s: one row per state and kind (brewery, supplier, direct to consumer), so no brand tab and no toggle. A brand’s COLA, formula approvals and state registrations live on that Brand. Order confirmation is meant to read all three and warn on an unlicensed or unregistered destination; that read is not built yet (drift: order warning). Delete confirms before permanently removing a license added by mistake.",
    body: <LicensesView model={toLicensesViewProps(licensesDemo)} />,
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    surface: "sheet",
    name: "Brand approval",
    to: { "Save approval": "Brand", "Find COLA on TTB": "Brand approval", "Load COLA by TTB ID": "Brand approval", Use: "Brand approval", STOUT: "Brand approval", "OATMEAL STOUT": "Brand approval" },
    job: "Record one brand’s federal approval status",
    reads: "get_compliance_registry · search_colas · get_cola_details · get_cola_image",
    writes: "upsert_brand_approval",
    states: [["approved", "orders may proceed"], ["from a brand", "the subject is stated, not picked"], ["saved ID", "entering a COLA already on this brand updates its approval instead of adding a duplicate"], ["COLA search", "Use copies the identifiers and loads approved label choices"], ["direct TTB ID", "load an approved COLA by ID without matching the brand name"], ["label images", "choose a label; fields and image save together"], ["no registry number", "Settings has no TTB registry number: add it before loading labels", 1], ["no match", "enter a known TTB ID directly"], ["TTB down", "show a retrieval error, never an empty answer", 1]],
    spec: "A COLA has a required 14-digit TTB ID and an optional applicant serial number. Both identifiers preserve leading zeros. Save approval and Open COLA require the 14-digit ID; the sheet states the format and counts digits near its limit. The registry link uses the TTB ID, never the serial, and does not itself verify approval. A formula keeps its formula number without the COLA-only format. A COLA does not expire. Find COLA searches the brewery's permit by brand name without requiring an entered ID; Use loads that approval's label images. Load COLA by TTB ID accepts a known 14-digit ID directly, regardless of the label's name. Only an approved, dated COLA under the brewery's permit supplies images. A saved ID updates its existing approval when added again. Changing the ID or approval kind clears draft image choices. Save approval stores the fields and selected image together.",
    body: <BrandApprovalView model={brandApprovalStout} />,
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    surface: "sheet",
    name: "Bulk process COLAs",
    to: { COLA: "Bulk process COLAs", "Open COLA on TTB": "Bulk process COLAs", "Selected: Brand (front) or keg collar": "Bulk process COLAs", Skip: "Bulk process COLAs", "Save and next": "Bulk process COLAs" },
    job: "Review the brewery’s approved labels and select a catalog image for each brand",
    reads: "search_colas · get_cola_details · get_cola_image",
    writes: "upsert_brand_approval",
    states: [["selection", "brands with no COLA on file start selected; select all or any shown brand"], ["review", "the only matching COLA and its only label image start chosen; save or skip each brand"], ["no match", "show all labels under the permit or skip"], ["not approved", "TTB must report APPROVED before images can be selected", 1], ["complete", "saved choices stay; skipped brands are unchanged"]],
    body: <ColaReviewView brands={colaReviewBrands} selected={colaReviewBrands.map(brand => brand.id)} missing={missingColaIds(colaReviewBrands)} queue={colaReviewBrands} index={0} saved={0} candidates={[colaReviewRecord]} ttbId={colaReviewRecord.ttbId} details={colaReviewDetails} imageUrl={colaReviewDetails.images[0]!.url} showAll={false} images={Object.fromEntries(colaReviewDetails.images.map(image => [image.url, <ColaLabelImageView key={image.url} label={image.label} src="/mock/cola-label.svg" />]))} />,
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    surface: "sheet",
    name: "State registration",
    to: { "Save registration": "Brand" },
    job: "Record permission to sell one brand in one state",
    reads: "get_compliance_registry",
    writes: "upsert_state_registration",
    states: [["registered", "brand may ship to the state"], ["missing", "order confirmation warns", 1], ["saved again", "one record per brand and state: saving replaces it"]],
    body: <StateRegistrationView model={stateRegistrationHazy} />,
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    surface: "sheet",
    name: "License",
    sheetTitle: "Edit license",
    to: { "Save license": "Licenses" },
    job: "Record one brewery state license",
    reads: "get_compliance_registry",
    writes: "upsert_brewery_state_license · delete_brewery_state_license",
    states: [["current", "expiry is today or later, or not recorded"], ["expired", "the Licenses list marks expiry before today with a warning", 1], ["saved again", "one record per state and kind: saving replaces it"], ["delete", "Delete confirms before permanently removing a mistaken license"]],
    body: <LicenseView model={licensePaBrewery} locked />,
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "POS sale detail",
    to: { "Taproom · Sep 2 · 8:14 PM": "POS sale detail", "Revision 2 · sale": "POS sale detail", "Revision 1 · sale": "POS sale detail" },
    job: "Trace one Square sale through mapping, expected barrels and reconciliation",
    reads: "get_pos_sale",
    writes: "none [mapping changes on Menu]",
    states: [["permission", "warehouse or admin required", 1], ["reconciled", "linked to a count", 0], ["unmapped", "held until item mapping validates", 1], ["refund", "expected consumption reverses"]],
    spec: "The sale detail explains expected consumption only. The physical count remains the inventory write.",
    body: <PosSaleDetailView title="Square sale SQ-88421" sale={{ id: "sale-1", label: "Hazy IPA · pint", detail: "accepted · Pour · pint", amount: "$7.00", status: "mapped", location: "Taproom", soldAt: "Sep 2 · 8:14 PM", quantity: "1", expected: "0.004 bbl · 16 oz", source: "order SQ-88421 · line 1 · revision 2" }} revisions={[{ label: "Revision 2 · sale", detail: "accepted · 1 · Pour · pint", current: true }, { label: "Revision 1 · sale", detail: "removed · retained history", current: false }]} />,
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Keg fleet",
    job: "Manage pools and record events without confusing beer returns",
    reads: "get_keg_fleet · list_customers · list_locations · list_bins · list_vendors",
    writes: "create_keg_pool · update_keg_pool · record_keg_event",
    states: [["negative shells", "pool, size and location below zero · record Acquired kegs to reconcile", 1], ["acquire", "qty into pool · no customer"], ["return empty", "customer required · deposit refund is a separate credit memo"], ["lost / found", "lost at a customer moves their balance · found never has a customer · no money"], ["retire", "cannot exceed what the bin holds · no customer"], ["unavailable", "no pool in service or no location · Record keg event says what is missing", 1]],
    spec: "Return empty is a keg event only; the deposit refund is a separate credit memo through Return shipment, which posts Returned only when the beer comes back in a full keg. The two stay separate records; Customer keg balance and Keg report flag a customer with a refunded deposit whose kegs on deposit disagree with kegs out plus kegs lost. No dirty/clean CIP status.",
    body: <KegFleetView model={toKegFleetViewProps(kegFleet)} />,
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Customer keg balance",
    to: { "Over 90 days": "Keg event history", "Record return": "Keg fleet" },
    job: "See every keg pool one customer has out and the deposit exposure",
    reads: "get_customer_keg_balance · list_customers · list_locations · list_bins",
    writes: "record_keg_event [Record return]",
    states: [["permission", "warehouse or admin required", 1], ["current", "all pools and deposits shown"], ["overdue", "oldest unreturned kegs flagged", 1], ["mismatch", "a deposit was refunded and kegs on deposit disagree with kegs out plus kegs lost · flagged", 1], ["none", "no kegs currently out"]],
    spec: "The same customer-owned detail is reachable from Customers and Keg fleet. A deposit refund and the empty keg's Returned event are separate records, so a pool and size where a deposit was refunded and the kegs on deposit differ from kegs out plus kegs lost at the customer is flagged. A shipped order charges the deposit and posts Shipped shells; a row with no refund is never flagged; a deposit still held with no keg out is a row too. Each row with kegs out has Record return: Record keg event with its pool, size, Returned and this customer chosen.",
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
    states: [["permission", "warehouse or admin required", 1], ["all", "newest first"], ["filtered", "pool and customer picks combine · each has All · the URL keeps them"], ["empty", "no matching events"]],
    spec: "This is the immutable keg ledger, not an editor.",
    body: <KegHistoryView model={toKegHistoryViewProps(kegHistoryLedger)} />,
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Keg report",
    to: { "Ridgeline Tap Room": "Customer keg balance", "Al’s Bar": "Customer keg balance" },
    job: "Review unreturned aging and utilization across the keg fleet",
    reads: "get_keg_report [utilization from keg_fleet_totals; aging is FIFO over keg_events, returns retire the oldest shipment first; deposit mismatches join keg_customer_balances, keg_deposit_balances, lost keg events, and keg deposit refund lines]",
    writes: "none",
    states: [["permission", "warehouse or admin required", 1], ["aging", "unreturned kegs grouped by age, deposits at the pool rate"], ["deposit mismatch", "after a refund, kegs on deposit disagree with kegs out plus kegs lost, per customer, pool and size", 1], ["utilization", "out divided by fleet, per pool and size"], ["no pools", "no keg pool yet · Open Keg fleet to add one"], ["no kegs", "a pool exists but no kegs acquired · Open Keg fleet to record them"]],
    spec: "Aging identifies who needs follow-up; utilization shows whether the fleet is working or sitting. The ledger counts kegs rather than serials, so a return closes the oldest open shipment. A deposit refund and the Returned keg event are separate records, so the report lists every customer, pool and size with a refunded deposit whose deposit count disagrees with kegs out plus kegs lost.",
    body: <KegReportView model={toKegReportViewProps(kegReportOwned, DEMO_TIME_ZONE)} />,
  },
  {
    step: 7,
    slice: 7,
    tab: "Beer",
    name: "Tap board",
    to: { "Stout · ⅙ bbl": "Swap keg", Taproom: "Tap board", "Guest cider \u00b7 keg": "Kick keg", "Amber \u00b7 \u00bd bbl": "Swap keg" },
    job: "What is on, since when, and roughly how much is left",
    reads: "list_open_taps · list_tap_history · list_skus · list_locations",
    writes: "tap_keg · swap_keg · kick_keg",
    states: [["swap", "one act, one record · never kick-then-tap"], ["already swapped", "second attempt fails · safe closer and time shown", 1], ["not in taproom stock", "server-derived flag · expected shares excluded", 1], ["guest or event keg", "explicit label and nominal size · no numeric yield", 1], ["no number", "sorts last · a number is never required"], ["duplicate number", "shown as entered · nothing downstream reads it"], ["kicked", "interval closed with a reason · the tap goes empty"], ["no POS", "no usable numerator · no bar", 1], ["not ready", "submit withheld · the line beside it names what is missing"], ["no keg SKUs", "no keg SKU with a keg volume · the picker says so and points to Catalog · guest keg still works", 1]],
    redrawn: true,
    spec: <>Each own or guest tile offers Swap and Kick and shows the same opening day, date, actor and fill. Swap closes one interval and opens the replacement atomically; an own replacement defaults to the outgoing SKU, while a guest replacement requires its own label and positive nominal BBL. Tap numbers are optional and may repeat, and unnumbered tiles sort last. Opening and closing fill chips are coarse observations and never inventory quantities. After an action saves, its sheet closes and the board announces Updating the board while its existing refetch runs. A 30-second poll updates only the board and recent history, preserving dirty and uncertain sheets. Exact retries keep the original request. Own package size and inventory exclusion come from the server. Guest labels never match POS facts, so guest tiles show no numeric yield. No usable numerator means no bar. Every action here writes zero finished-goods movements; weekly count owns depletion.</>,
    body: <TapBoardView state={tapBoard} skus={tapBoardSkus} timeZone={DEMO_TIME_ZONE} navigation={{ locations: [{ value: "taproom", label: "Taproom" }, { value: "downtown", label: "Downtown" }], location: "taproom" }} />,
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
    body: <TapKegView sheet={kickKeg} skus={tapBoardSkus} timeZone={DEMO_TIME_ZONE} />,
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
    states: permitted("taproom, warehouse or admin required").concat([["same own SKU", "the follow keg is the default · one atomic record"], ["guest keg", "explicit label and positive nominal BBL"], ["already swapped", "safe closer and time shown · nothing opens", 1], ["no number", "left blank · the keg sorts last on the board"], ["close fill", "three chips · never a typed number", 1], ["not ready", "submit withheld · the line beside it names what is missing (a packaged keg SKU, guest label or size)"], ["unknown response", "retry the frozen request unchanged", 1]]),
    spec: <>Swap is one atomic act: it closes the selected interval and opens the replacement, so a half-finished swap is not a state. The default reuses only an outgoing own SKU; a guest replacement always needs an explicit label and positive nominal BBL. The server freezes own nominal volume and decides inventory exclusion. Tap number stays optional and nonunique. Opening and closing chips are coarse observations and never ledger quantities. An already-closed conflict names the safe closer and time from recent history. An uncertain response freezes the payload and request ID for exact retry.</>,
    body: <TapKegView sheet={swapKeg} skus={tapBoardSkus} timeZone={DEMO_TIME_ZONE} closedFact="Helles was swapped out at 7:42pm by Ali" />,
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Routes",
    to: { Assign: "Route", Return: "Return route", "Add to route": "Route" },
    job: "See open and returned delivery routes and build the next one",
    reads: "list_routes",
    writes: "none [route planning happens on Route]",
    states: [["unassigned", "shipped orders and picked transfers waiting for a route are called out"], ["empty", "no routes yet: New route is the only action"], ["returned", "Status Returned lists finished routes newest first; an empty Open list points there"]],
    spec: "Work › Deliveries. The Status pick shows Open routes, each naming its next action (Return once every stop has an outcome, which opens the route's Return route), or Returned routes, newest first. New route opens Route in builder mode, and Route returns here. A stop is a shipped order or a picked stock transfer.",
    body: <RoutesView model={toRoutesViewProps(routesDriver)} />,
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
    spec: "Planned state: Depart is the one primary; Save route plan is outline. Return lives on Return route once the route has departed. The stops are a checklist of this route's documents plus every shipped order and picked transfer on no route, each checked one with its stop number; driver, vehicle and stop order save in the same route-save RPC, and a delivered stop cannot be unchecked. A new route's first save opens the saved route, so Depart is one tap away; Add to route from Shipment done or a Routes row arrives with that document checked as stop 1. There is no loaded status or mark-loaded command. A refused delivery closes with an outcome; its physical return is recorded separately. A driver shows as their roster email, with their roles in the picker; a saved driver no longer on the team reads \"driver not on the team\", and one without Warehouse or Admin reads \"can no longer drive\".",
    body: <RouteView model={routeAPlan} />,
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Return route",
    to: { "Return route": "Routes", "Check in": "Check in refused beer" },
    job: "Stamp the return once every stop is done",
    reads: "list_routes",
    writes: "return_route",
    states: [["permission", "the assigned driver or an admin", 1], ["planned", "Depart lives on Route"], ["departed", "Return is the one verb, enabled once every stop has an outcome"], ["complete", "already returned: the return time replaces the button"]],
    spec: "The departed state of a route once every stop has an outcome. Outstanding refused beer remains visible until physically checked in. Planned routes Depart on Route; this screen is only Return.",
    body: <ReturnRouteView model={returnRouteA} />,
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Driver route",
    to: { Deliver: "Confirm delivery" },
    job: "The route as the driver sees it: every stop, the load, Return",
    reads: "list_routes",
    writes: "return_route",
    states: [["permission", "the assigned driver or an admin", 1], ["departed", "Return is the one verb, disabled while a stop is open"], ["next stop", "Deliver opens Confirm delivery"]],
    spec: "The departed route as the driver runs it, reached from Deliveries (Resume) or the stop's Back. Route is for building; this is for running. Only the lowest undelivered stop is next; Today shows the same stop.",
    body: <DriverRouteView model={driverRouteA} />,
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Confirm delivery",
    to: { "Check in refused beer": "Check in refused beer", "Not delivered · leave for a later route": "Driver route", Delivered: "Driver route" },
    job: "Name receiving contact, then commit delivery and invoice",
    reads: "get_delivery_stop",
    writes: "confirm_delivery [one RPC: delivered_at + signed_by + invoice only when persisted mode is on-delivery; never ships] · leave_delivery_for_later [one RPC: deletes an open unattempted stop and unassigns its document]",
    states: [["offline", "keep stop open; commit waits", 1], ["response lost", "same requestId returns result"], ["permission", "warehouse membership and being the route’s assigned driver, or admin", 1], ["success", "INV number after commit"], ["transfer stop", "destination and picked lines instead of a customer; stamped, never invoiced; Receive on the transfer moves the stock"]],
    spec: "Not delivered · leave for a later route removes an unattempted stop from its departed route, logs an order event for a shipment, and leaves stock, invoices and refusals untouched. No driver note is needed. The document is unassigned for a later route. Closed / no access is not a refusal reason. Enter refused quantities and a refusal reason when needed; accepted quantities are billed at captured order prices. Full refusal needs no receiving name and creates no on-delivery invoice. Either outcome returns to Driver route. Received by starts as the newest earlier signer at this ship-to and suggests the others. Back goes to Driver route. The receiving name is stored as text; the UI never implies a signature image is retained.",
    body: <ConfirmDeliveryView model={confirmDeliveryStop1} />,
  },
  {
    step: 7, slice: 10, tab: "Work", name: "Check in refused beer",
    job: "Record refused beer physically returned to a bin",
    reads: "list_refused_returns + get_invoice_return_sources + list_locations + list_bins",
    writes: "check_in_refused_return",
    states: [["permission", "warehouse or admin for on-delivery shipments; admin or sales uses Return and credit for invoice-now", 1], ["damage", "return and loss posted together"], ["retry", "same request replays"]],
    spec: "Refusal alone restores no stock. Check in actual received quantities against their shipped source lot. Outstanding returns remain visible after the route returns. Invoice-now refusals use Return and credit.",
    body: <RefusedReturnFormView model={{ title: "Check in · Ridgeline", locationId: "warehouse", locations: [{ value: "warehouse", label: "Warehouse" }], bins: [{ value: "cold", label: "Cold room", locationId: "warehouse" }], lines: [{ id: "hazy", name: "Hazy IPA · ½ bbl keg", outstanding: 2, sources: [{ id: "source", label: "HZ-041 · Cold room", shipped: 4 }] }] }} />,
  },
  {
    step: 7,
    slice: 8,
    group: "Desk",
    name: "Planning",
    to: { "Can labels": "Edit material", "Quadpack carriers": "Edit material", "Hazy ATP negative Sep 9, 2026": "Pars and allocation", "Create purchase order": "New PO", "Set vendor": "Materials on hand", "Hop bags": "Edit material", "Fictional Packaging Supply": "Vendor", "Fictional Label Works": "Vendor" },
    job: "See demand gaps by vendor and create each vendor's purchase order, without priority state",
    reads: "get_material_requirements",
    writes: "draft_purchase_order_from_requirements [one RPC: one draft PO per resolved vendor + lines; the buy-by date is needed-by less the vendor's lead time]",
    states: [["gap", "demand exceeds supply in that week · the only actionable row"], ["projected", "includes N projected · uncovered orders and batch package shares"], ["covered", "supply meets demand · shown so the horizon reads continuously"], ["by vendor", "rows group under the vendor they resolve to, A to Z · each group ends with its own Create purchase order"], ["partly unbuyable", "a row already past its buy-by date is drawn out of reach · the rest of its group still drafts", 1], ["no vendor", "no contract and no default supplier · grouped last under No vendor · each row offers Set vendor, which opens Materials at that material", 1], ["empty", "No material shortages · shortage-only, so it never claims work is scheduled · links to Batches, Packaging, and Materials · drawn as Planning empty"]],
    spec: "Material demand combines unbrewed recipe ingredients, open packaging runs, and projected packaging from uncovered orders and active batches with SKU package shares. Batch units are rounded down from planned barrels times the SKU share divided by format volume; needed-by is brew date (planned until brewed) plus Days to package. Any non-cancelled run linked directly or through its source tank replaces the whole batch projection, including after it closes. An unlinked tankless run does not identify a batch and cannot replace that batch's projection. Order projection is the smaller of negative ATP and open order allocations, less open runs and projected batch units of that SKU, so stock and planned supply are never counted twice. Standing allocations hold stock ahead of orders but never project alone. Order needed-by is the earliest requested ship date, or today without one. Packaging units flow through the format's material quantities once, rounding each-count materials up. One row per material includes the projected portion and reads includes N projected. On-hand material and unreceived purchase orders reduce the gap. Resolution is an active contract, then the material's default vendor; missing vendor and past buy-by rows cannot draft. Buy-by is needed-by less vendor lead time. Projected and firm shortfalls draft identically, one purchase order per vendor group, rounded to whole purchase units. Nothing here ranks or prioritises.",
    body: <PlanningView model={toPlanningViewProps(planningDemo)} />,
  },
  {
    step: 7,
    slice: 8,
    group: "Desk",
    name: "Planning empty",
    to: { Packaging: "Packaging runs" },
    job: "Say nothing is short without claiming any work is scheduled, and point to where demand is set up",
    reads: "get_material_requirements",
    writes: "none",
    states: [["empty", "No material shortages · links to Batches, Packaging, and Materials, each only for a role that can open it"]],
    spec: "Planning asks only for shortages, so an empty list says nothing about whether any batch or packaging run is scheduled. The links sit inside the empty block, under the sentence that introduces them. Batches is Brewer's, so Warehouse sees only Packaging and Materials. With nothing to buy there is no draft button.",
    body: <PlanningView model={toPlanningViewProps({ requirements: [] })} />,
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
    states: [["permission", "admin only", 1], ["OAuth cancelled", "remain disconnected · try again", 1], ["not available", "Connect Slack disabled · ask MGR support", 1]],
    spec: "This is production Settings UI, not a developer demo. The sample preview tabs wait until Slack is connected (#1509).",
    body: <ChatSettingsView health={chatDisconnected} timezone="America/New_York" readingDueHours={24} previewFixtures={CHAT_PREVIEW_FIXTURES} />,
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Chat settings",
    to: { Disconnect: "Disconnect Slack", "Reading overdue after": "Settings" },
    job: "Operate one brewery/provider installation and inspect every outbound surface",
    reads: "get_chat_integration_health · get_notification_preferences · get_brewery_operating_defaults · list_chat_channels · list_chat_user_links · [presentation: ten provider-free fixtures]",
    writes: "set_notification_destination · set_brewery_quiet_hours · disable_chat_installation · disconnect_chat_installation · unlink_chat_user",
    states: [["permission", "admin only", 1], ["healthy", "last callback and delivery shown"], ["retrying", "queue count + redacted reason", 1], ["disabled", "no sends; previews still work", 1]],
    spec: "Four preview tabs render the same provider-neutral fixtures consumed by renderer contract tests, labelled as sample data. The All preview states picker shows only in development. Previews never query live customer data or send a message. Reading overdue after is shown read-only and links to Brewery details on Settings, which owns it because it controls both Today and chat (#1509). Private channels load with the page, and picking one saves it. The Delivery switch is the one way to stop sends here. Linked people lists who linked Slack, with Unlink for each and how to link your own, so an admin can remove a stale link without disconnecting Slack for everyone.",
    body: <ChatSettingsView health={chatConnected} timezone="America/New_York" readingDueHours={24} channels={[{ id: "COPS", name: "mgr-operations" }]} channel="COPS" previewFixtures={CHAT_PREVIEW_FIXTURES} people={<ChatLinkedPeopleView people={linkedChatPeople} timeZone={DEMO_TIME_ZONE} />} />,
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "My notification preferences",
    job: "Control personal Slack delivery without changing assigned MGR work",
    reads: "get_notification_preferences",
    writes: "set_notification_preference · set_notification_destination · set_personal_quiet_hours · unlink_chat_user",
    states: [["unlinked", "preferences remain available before linking"], ["linked", "unlink only your Slack identity"], ["permission", "every staff role; Taproom cannot set personal quiet hours", 1], ["Slack not connected", "a note replaces the link steps until the brewery's Slack is active", 1], ["error", "keep entered quiet hours and show the command error", 1]],
    spec: "Personal delivery preferences do not change MGR work, App Home or team digests. Each reason uses the label Slack's preferences dialog shows. The brewery quiet hours show read-only to every role; clearing both personal times follows them.",
    body: <ChatPersonalPreferencesView preferences={personalChatPreferences} />,
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
    spec: "The entry page names the MGR account and email, Slack display name and user id, workspace name and workspace id, and brewery before consuming the single-use proof.",
    body: <ChatLinkConsentView intent={chatLinkIntent} />,
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
    body: <ChatDisconnectView />,
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Reauthorization",
    to: { Connection: "Reauthorization", "Last successful message from Slack": "Reauthorization", "Last successful delivery": "Reauthorization", queued: "Reauthorization", retrying: "Reauthorization", "Manage delivery": "Chat settings" },
    job: "Fail closed while keeping recovery understandable and personal delivery isolated",
    reads: "get_chat_integration_health",
    writes: "begin_chat_reauthorization · disable_chat_installation · disconnect_chat_installation",
    states: [["permission", "admin only", 1], ["token revoked", "all provider sends stop", 1], ["channel externalized", "team digest stops; eligible personal sends continue", 1], ["uninstalled", "links and queued actions invalidated", 1]],
    spec: "Provider errors remain redacted. Emergency disable does not depend on Slack being reachable.",
    body: <ChatHealthView health={chatRecovery} />,
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Point of sale",
    to: { Disconnect: "Disconnect Square", "Sync Square": "Point of sale", "Square locations2 mapped · 1 needs mapping": "Square locations", "Taproom · Sep 1 to Sep 8": "Point of sale", "Sale · Hazy IPA · pint": "POS sale detail", "Return · Hazy IPA · pint": "POS sale detail", "MenuOne catalog · per-location stock and price": "Menu", "Open Accounting": "Accounting" },
    job: "Connect one POS provider and see both directions at a glance",
    reads: "get_pos_integration_health · list_pos_locations · list_pos_sales",
    writes: "sync_square_catalog · sync_square_sales · disconnect_square",
    states: [["permission", "admin only", 1], ["not turned on", "disabled Connect Square with its reason", 1], ["no provider", "connect one before a menu can publish"], ["healthy", "catalog and sales both current"], ["sales lagging", "the menu still publishes", 1], ["token revoked", "publishing and sync both stop", 1], ["taproom sales in QuickBooks", "Square may send them through its own connector; MGR explains it, never detects it", 1], ["second location", "its own MGR location and its own channel", 1], ["unmapped location", "its sales cannot reconcile until it is mapped", 1], ["authorization failed", "note beside current health; the existing connection is kept"], ["partial sync", "never counts as complete coverage", 1], ["return", "retained as a source fact; never posts stock"]],
    spec: "Square is the sole POS provider in this slice. This page reports connection, mapping, and completed sync state without exposing token material. Square’s optional QuickBooks connector remains a separate accountant-reviewed revenue feed: MGR provides a note and Accounting deep link, but does not detect, configure, or synchronize it.",
    body: <PointOfSaleView model={{ connected: true, merchant: "Demo Brewing LLC", state: "Connected", locations: "2 mapped · 1 needs mapping", lastSync: "Today · 6:58 PM" }} syncAction={<PosSyncActions />} coverage={["Taproom · Sep 1 to Sep 8"]} sales={[{ id: "sale-1", label: "Sale · Hazy IPA · pint", detail: "Taproom · current revision", amount: "$7.00", status: "mapped", openable: true }, { id: "return-1", label: "Return · Hazy IPA · pint", detail: "Taproom · current revision", amount: "−$7.00", status: "mapped", openable: true }]} />,
  },
  {
    step: 7, slice: 7, tab: "More", group: "POS",
    name: "Point of sale unavailable",
    to: { "Connect Square": "Point of sale unavailable", Square: "Point of sale unavailable", "Open Accounting": "Accounting" },
    job: "Explain that Square is not turned on before offering authorization",
    reads: "get_pos_integration_health",
    writes: "none",
    states: [["not turned on", "Connect Square disabled with its reason; no prior seller or sales facts", 1]],
    body: <PointOfSaleView model={{ connected: false, configured: false, merchant: "", state: "Not connected" }} />,
  },

  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "Square locations",
    job: "Map each Square location to one MGR location and sales channel",
    reads: "list_pos_locations · list_locations",
    writes: "set_pos_location_mapping · retire_pos_location_mapping [Admin confirms retirement; historical sales keep their location, replacement mapping applies to later sales]",
    states: [["permission", "admin only", 1], ["mapped", "two locations ready"], ["unmapped", "sales cannot reconcile", 1], ["claimed", "an MGR location cannot be claimed twice", 1]],
    spec: "A provider location maps to exactly one MGR location, saved when it is picked; a failed save puts the pick back. Sales remain expected-consumption facts; the physical count owns depletion.",
    to: { "Retire mapping": "Square locations" },
    body: <SquareLocationsView locations={[{ id: "taproom", name: "Taproom" }, { id: "warehouse", name: "Warehouse" }]} rows={[{ externalLocationId: "square-tap", name: "Square Taproom", detail: "active · available · Taproom", mgrLocationId: "taproom" }, { externalLocationId: "square-events", name: "Third location", detail: "active · available · needs mapping", mgrLocationId: "" }]} />,
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "Disconnect Square",
    to: { "Disconnect Square": "Point of sale" },
    job: "Confirm the external effects of disconnecting Square",
    reads: "get_pos_integration_health",
    writes: "disconnect_square",
    states: [["permission", "admin only", 1], ["confirmed", "installation disabled and token purged"], ["recovery required", "still offered: purges the credential and attempts revocation", 1], ["revocation unresolved", "credential purged; stays in recovery, never shown as disconnected", 1]],
    spec: "A dialog over Point of sale. The confirmation names what stops and what remains so reconnecting can reuse mappings. A confirmed revocation closes it, and Point of sale then offers Connect Square; an unconfirmed one keeps it open with Retry revocation.",
    body: <DisconnectSquareView />,
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Menu",
    to: { Taproom: "Menu", Warehouse: "Menu" },
    job: "One catalog, published to every destination that sells from it",
    reads: "get_pos_menu [derived from brands × formats × configured-bin stock]",
    writes: "configure_pos_menu · set_pos_price_override [nullable, per POS location] · set_pos_website_publication · publish_pos_menu [complete derived location change set] · set_pos_item_mapping [Also in Square]",
    states: [["permission", "warehouse or admin required", 1], ["derived", "every row is a brand, a format and stock on hand"], ["override", "one row priced away from its format default", 1], ["no price anywhere", "no format default and no override: that row cannot publish", 1], ["out of stock", "row retires itself; price and provider id are kept"], ["provider rejected", "the row keeps its edit; nothing half-published", 1], ["second location", "same catalog, scoped · its own price and stock", 1], ["present at one only", "the other location never sees the row", 1], ["one destination", "a row can publish to Square and not the website", 1], ["website beer unmapped", "adopted by matching it to a brand once", 1], ["also in Square", "an unmapped Square item that has sold anywhere: map it or ignore it", 1], ["mapped or ignored", "a decided Square item can change its mapping"], ["unsold", "a Square item not from MGR asks for nothing until it sells"]],
    redrawn: true,
    spec: <>This was an authoring surface and is now a read-out. Brand, format and availability are all derived (brand from what is in the bin, formats from the brand, availability from taproom stock), so publishing is zero-touch and a new brand reaches the register the moment stock lands. Retail resolves as the location’s own price override, falling back to the format’s default retail price, which is why the table shows the inherited number and names its Source: an exception has to be legible, or a stale price from last summer becomes silently authoritative. The override column stays empty unless someone sets it, so a format-wide price change actually propagates; writing the default into every row on publish would freeze each one at its first price, which is the failure mode this drawing exists to prevent. Publish changes survives because MGR still owns when the provider copy is refreshed, and sends the complete derived change set for the selected location. Square keeps one durable parent item per brand’s poured menu group, with pint, taster and the brand’s other poured formats as variations; publishing one brand updates that whole item. Location is a scope rather than a column: Square uses per-location presence on the variations, so MGR maintains one catalog and varies where each format appears; two parallel menus would fight that model and double every retire. Everything under the switcher is read for one location: stock, availability, and the price override that is keyed by POS location. A column would only serve a cross-location comparison nobody performs, while every action here is taken against one register. Renamed from POS menu: the register is no longer the only destination. The website is the third consumer of this catalog after Square and QuickBooks, not an integration of its own: a bespoke web feed would produce a third answer to what are we selling right now, and would leak unannounced beer, which is the same ownership boundary the Square item library taught. So the website is a read client keeping no copy, and the sync logic it runs today exists only because it keeps one. Its existing beers are adopted exactly as pre-integration Square items are: matched to a brand once, then maintained from here, so nothing vanishes from a public page the day MGR connects. Transport is deliberately not drawn: a menu changes a handful of times a day, so a cached read of the published rows is as fresh as a socket per visitor without opening an anonymous realtime path. Destination-native rows sit <i>below</i> that button rather than in the table: position is what says they are outside the publishable set, which no label reliably does. They appear at all because an unmapped taproom item is the reason a sale fails to reconcile, and Map is the only action MGR ever offers against a row it does not own.</>,
    body: <PosMenuView model={{ locations: [{ id: "taproom", label: "Taproom" }, { id: "warehouse", label: "Warehouse" }], selectedLocationId: "taproom", locationName: "Taproom", binName: "Cold", channelName: "Taproom", items: [{ brandId: "hazy", formatId: "pint", label: "Hazy IPA · pint", retail: "$7.00", source: "format", destinations: "Square · Website", available: true }], excluded: [{ brandId: "stout", formatId: "stout-pint", label: "Stout · pint", retail: "$7.00", source: "format", destinations: "Square", available: false, reason: "no taproom stock" }], externalItems: [{ externalItemId: "item-guest", externalVariationId: "var-guest", label: "Guest cider · pint", detail: "Sold in Square · not from MGR", disposition: "queued", target: "" }, { externalItemId: "item-shirt", externalVariationId: "var-shirt", label: "Shirt · Large", detail: "Ignored", disposition: "ignored", target: "ignore" }] }} targets={[{ value: "format:pint", label: "Pour · House · pint" }]} />,
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Menu setup",
    to: { "Set up Square": "Point of sale" },
    job: "Say what Menu is missing when Square has no locations yet",
    reads: "list_pos_locations · get_square_connected",
    writes: "none",
    states: [["not turned on", "no setup action; the same reason as Connect Square", 1], ["admin", "Set up Square opens Point of sale"], ["connected, none synced", "Square is connected but no location has synced yet · Set up Square opens Point of sale to sync"], ["warehouse", "no link; says Square isn’t connected and asks an admin to connect Square, because Point of sale settings are admin-only", 1]],
    spec: "Drawn as an admin with Square turned on. When Square is not connected and isn’t turned on in MGR, every role sees the same unavailable reason as Connect Square, with no setup action. Otherwise a disconnected Square is titled Square isn’t connected for Admin and Warehouse alike, even when locations remain from before a disconnect. If Square is connected but no location has synced yet, the setup message says so. Every Menu role reads only whether Square is connected; only an admin gets the settings link, while Warehouse is asked to have an admin act.",
    body: <PosMenuView model={{ locations: [], selectedLocationId: "", locationName: "Square location", items: [], excluded: [], externalItems: [], setup: { title: "Square isn’t connected", description: "Connect Square, then map a Square location to an MGR location.", action: { label: "Set up Square" } } }} />,
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Menu unmapped",
    to: { "Map Square locations": "Square locations" },
    job: "Say what Menu is missing when Square locations exist but none is mapped",
    reads: "list_pos_locations · get_square_connected",
    writes: "none",
    states: [["admin", "Map Square locations opens Square locations"], ["warehouse", "no link; asks an admin to map one", 1]],
    spec: "Drawn as an admin. Square is connected and its locations were found, so connecting is not the missing step: mapping one to an MGR location is. The copy says so rather than repeating the connect instruction. Warehouse reads the same state with no link, for the same admin-only reason as Menu setup.",
    body: <PosMenuView model={{ locations: [], selectedLocationId: "", locationName: "Square location", items: [], excluded: [], externalItems: [], setup: { title: "No Square location mapped", description: "Square locations were found, but none is mapped to an MGR location.", action: { label: "Map Square locations" } } }} />,
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "POS item",
    to: { "Save and publish": "POS item" },
    job: "Override one price; everything else is inherited from the format",
    reads: "get_pos_menu_item",
    writes: "set_pos_price_override · set_pos_website_publication · publish_pos_item",
    states: [["permission", "warehouse or admin required", 1], ["inherited", "no override · the format price is what publishes"], ["overridden", "this row is priced away from the default", 1], ["reset", "override cleared · the row rejoins the format price"], ["no price at all", "no format default and no override · Save stays disabled", 1], ["per location", "a second taproom overrides the same row separately", 1], ["per beer", "another beer on the price group pours the same format with its own override", 1], ["format changed", "conversion and premise follow the format, not this sheet"], ["tax preserved", "publishing never clears the provider’s tax assignment", 1]],
    redrawn: true,
    spec: "Against the brand and format schema, Serving and Premise are no longer authored here. A format owns its conversion (a pint is 1/124 of a ½ bbl) and its premise, so this sheet reads them instead of asking again. What is left is a register price, not a wholesale grid cell: an optional override keyed by POS location and beer (the pour itself is shared by every beer on the price group), so an empty field lets a format-wide Taproom cell propagate and the Warehouse register can ring a different number than the Taproom without either row copying a wholesale price. Availability stays a rule, not a per-keg switch: MGR retires the row when taproom stock runs out and re-publishes under the same provider id when it returns. Price still lands on the variation rather than the item, so an override writes to the format’s variation id. Save and publish saves the override, then publishes the item; a failed save publishes nothing.",
    body: <PosItemView item={{ brand: "Hazy IPA", format: "pint · poured", sources: "½ bbl keg · Taproom", serving: "16 oz · from the format", price: "$7.00", override: "6.50", websitePublished: true, available: true }} />,
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
    states: [["permission", "admin required", 1], ["in use", "no Delete on a channel a record uses or on the system Taproom channel · rule stated only in the delete confirm · a foreign key or the Taproom check refuses the delete, human copy, not a 23503", 1], ["seeded", "four defaults arrive with the brewery"], ["inherit", "a customer with no override takes the channel default"]],
    spec: "The channel carries a name and a default tax treatment and nothing else: removal classification stays on the movement type, which is why #42 rejected giving the channel a removal flag or a required-destination-state flag. Resolution order is customer override → channel default, and the resolved value is frozen onto the movement at write time so editing a customer in March never restates January.",
    body: <SaleChannelsView model={toSaleChannelsViewProps({ ...saleChannelsList, canDelete: true })} />,
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
    writes: "upsert_sale_channel",
    states: [["permission", "admin required", 1], ["new", "titled Add channel · name and tax treatment required"], ["edit", "titled with the channel being edited"]],
    spec: "Drawn editing the Export channel. The sheet has no Delete: removal and its in-use rule live on the Sale channels list. Every selected tax treatment shows its meaning under the chips, including the default Taxable choice. The four removals without payment of tax (Export, Vessel supplies, Research, Transfer in bond) keep their approved TTB meanings.",
    body: <ChannelView model={toChannelViewProps(channelExport)} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Formats",
    to: { "16 oz can": "Format", "four-pack": "Format", "case · 24×16oz": "Format", "½ bbl keg": "Format", "Hazy IPA · Pint": "Format" },
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
    to: { "Save format": "Formats", "Save materials": "Package BOM" },
    job: "Create or edit one shared package format",
    spec: "New and Edit use the same form. Choose a container and size; standard kegs derive volume, cans and bottles multiply container size by count. Names are suggested with optional rename. Custom size preserves nonstandard volumes. Create saves a composed parent and its child quantities in one transaction; the parent volume is always derived. Packaging materials have their own save action. Admin can confirm Delete format for an unused packaged format; SKUs, other packages, prices and history block deletion. Format changes affect every linked SKU, never recorded movement volumes.",
    reads: "list_formats · get_format_composition",
    writes: "upsert_format · create_composed_format · replace_format_components · replace_format_bom · delete_format [admin]",
    states: [["permission", "sales or admin required", 1], ["atomic", "volume unit choices are set by this input"], ["composed", "volume derives from child formats"]],
    body: <FormatFixture><FormatView model={toFormatViewProps(formatCan)} deleteAction={<DeleteFormatControl name={formatCan.format.name} />} componentOptions={formatsInventory.formats.filter(format => format.basis === "packaged" && format.bbl_per_unit !== null && !formatsInventory.components?.some(component => component.parent_format_id === format.id))} /></FormatFixture>,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Water profiles",
    to: { Edit: "Water profile", "Add water profile": "Water profile", "Municipal · Denver": "Water profile", Burton: "Water profile", "Hazy target": "Water profile" },
    job: "Keep the water a brewery starts from and the waters it aims at",
    reads: "list_water_profiles",
    writes: "none [creation and editing happen on Water profile]",
    states: [["permission", "brewer or admin required", 1], ["empty", "no profiles yet: Add water profile is the only action"]],
    spec: "A catalog entity beside Formats and price groups, because a profile is referenced by many recipes and edited in one place: a new water report is one edit, not fifty. No quick-create dialog, which v1 needed only because profiles were buried inside the recipe form; reached from Catalog or Settings (Admin), or from Recipes or a recipe’s Water sheet (Brewer and Admin), Add water profile is already one tap away. The empty state explicitly says profiles are not classified as source or target here; a recipe version chooses either role on its Water sheet. Each row reads the six ions, then alkalinity and water pH when the profile has them. Entering from Settings → Source water keeps Settings as the back destination for Admin. Other entries follow the role: Catalog for Admin, Recipes for Brewer.",
    body: <WaterProfilesView model={toWaterProfilesViewProps({ profiles: waterProfiles })} />,
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Water profile",
    to: { "Save water profile": "Water profiles" },
    job: "Name a water, its six ions, and optionally its alkalinity, pH and notes",
    reads: "list_water_profiles",
    writes: "upsert_water_profile [one RPC; insert when profileId is empty, else edit]",
    states: [["permission", "brewer or admin required", 1], ["in use", "a profile a recipe references cannot be deleted", 1], ["not ready", "Still needed beside Save water profile names missing or out-of-range values"]],
    spec: "Six ions in parts per million (ppm, the same as mg/L), the set every brewing water calculation reads. Each is required and none can be negative, as the help line above the fields says. Every ion input points to that line, so a screen reader reads it too. Three optional fields follow. Alkalinity as CaCO3 is in ppm and cannot be negative; bicarbonate does not replace it. Water pH is the water’s own pH, from 0 to 14. One help line above the three says they are optional and that water pH is not a recipe’s target mash pH; each of the three points to it. Notes are free text of up to 2000 characters. Clearing an optional field on an edit removes it. No ion arithmetic here: this screen records a measurement or a target, and any delta between two profiles is a calculation this slice does not build.",
    body: <WaterProfileView fields={toWaterProfileFields(waterProfiles[0])} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Price groups",
    to: { "1": "Price group", "2": "Price group", "3": "Price group" },
    job: "Price every beer from one grid: groups down, formats across, a tab per sale channel",
    reads: "list_sale_channels · list_price_groups · list_formats · list_channel_prices",
    writes: "set_channel_price · clear_channel_price · upsert_price_group · delete_price_group",
    states: [["permission", "sales or admin required", 1], ["empty cell", "unpriced · an order for a SKU on that group and format is refused on that channel", 1], ["empty", "no price groups yet: New price group is the only action"], ["in use", "a group a brand sits on, or a cell prices, cannot be removed", 1]],
    spec: "Reached from More and from Catalog; back returns to More. The brewery's price sheet is one grid: rows are price groups, columns are packaged formats plus pours owned by a group (one column per pour name, headed Pour · and the name, so a keg and a pour of one name differ). One tab per sale channel; the grid shows the selected channel, the first by default, and the address keeps the tab. A beer sits on one group (Catalog → Brand → Price group) and a customer sits on one channel, so the price of any SKU for any customer is the single cell where the two meet. Every cell is a dollars field edited in place: Enter or leaving the input saves. Saving and Saved appear inline; invalid, negative, exponent, or extra-precision amounts are refused without rounding. Zero is valid. An unpriced cell is empty with a dash. Emptying a priced cell and leaving it clears the price; no cell carries its own Clear button. A group with no pour of a column's name shows + add, which opens Add pour on that group with the name filled in. A group's name opens Price group, where its position, cost ceiling, and pours live.",
    body: <PriceGroupsView model={toPriceGroupsViewProps(pricingGrid)} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Price group",
    to: { "Remove price group": "Price groups" },
    job: "Name one row of the price grid, place it, and give it an optional cost ceiling",
    reads: "list_price_groups",
    writes: "upsert_price_group · delete_price_group · upsert_format · delete_format · set_price_group_barcode",
    states: [["permission", "sales or admin required", 1], ["no ceiling", "the group is chosen by hand · nothing is suggested"], ["suggested", "a cost inside the band proposes this group on Brand · a person confirms"], ["in use", "a brand sits on it or a cell prices it · Remove is refused", 1]],
    spec: "A price group is one row of the grid: its name, position, optional cost ceiling, and the pours it owns. Glass sizes are added here (name and ounces), not on a brand. Every beer on the group uses those pours. Each pour row has Edit pour (name, ounces) beside Remove. Remove on a pour and Delete on the group each ask for confirmation first; Remove deletes the pour unless a cell still prices it. Prices are the cells on Price groups. Ceilings are dollars per barrel of recipe cost. Brand reads them: the band a brand’s recipe cost falls in is offered there, and nobody is moved automatically. Removal is refused while a brand sits on the group, a cell prices it, or the group owns a pour. Barcodes: the group owns one UPC per packaged format, and every SKU on it scans as that code unless the SKU has its own. A format with no code reads none and raises no warning, since a keg usually has none; one code may cover several formats. Codes leave with the group.",
    body: <PriceGroupView model={toPriceGroupViewProps(priceGroupTwo)} />,
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Bin",
    to: { "Save bin": "Location detail" },
    job: "Create or edit one physical subdivision of a location",
    reads: "list_bins",
    writes: "create_bin · update_bin · delete_bin",
    states: [["permission", "warehouse or admin required", 1], ["missing name", "Still needed: a bin name · submit blocked"], ["duplicate name", "A bin named Dry already exists here · inline error and submit blocked"], ["last bin", "rename it instead of removing it", 1], ["has history", "a bin that ever recorded stock is renamed, not removed", 1], ["menu bin", "a POS menu uses it · point the menu at another bin first", 1], ["never used", "Remove asks to confirm first"]],
    spec: "Titled with the bin’s name (Edit bin · Cold), or Add bin. Remove sits in its own section below Save and opens a confirmation that states the rule. Taps are not bins; the note links the Tap board.",
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
    reads: "list_repack_parents · get_bin_move_stock",
    writes: "record_repack [one RPC; the outbound leg's qty is derived from format composition, abs(sum(bbl)) < 0.000001 over the shared ref; both legs carry the picked lot]",
    states: [["offered", "composition knows a case yields six four-packs · nobody types both halves"], ["breakage", "−1 case · +6 four-packs always · repack records no damage", 1], ["materials", "case tray returns to stock, PakTech is consumed · per-repack override"]],
    spec: "An adjustment cannot express a break: it has no way to pair the two halves, so the break reads as an unexplained loss beside an unexplained gain. The outbound leg's bbl is derived from the inbound leg's frozen total rather than recomputed from barrels per unit (rounding each leg independently leaves −0.00000001 on a 24×16oz case), and the constraint carries a tolerance to catch a hand-entered repack without rejecting a legitimate one. Build-direction repack is out of scope; the whole repack is one RPC sharing one ref so beer and materials cannot disagree.",
    body: <><RepackView model={repackCase} footer={null} />{E.pin(E.btn("Record repack"))}</>,
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
    writes: "push_invoice_to_qbo [existing; requestid, online-only, AllowOnlineACHPayment + AllowOnlineCreditCardPayment]",
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
    job: "The accountant records payment here for an invoice in QuickBooks",
    reads: "sync_qbo_payments [manual sync; records guarded payment-confirmation status]",
    writes: "none [no MGR user action]",
    states: [["paid", "the invoice's payment status is confirmed on the next sync"], ["fee deducted", "the deposit is smaller than the payment", 1], ["partial", "balance drops; the AR row stays due", 1], ["sync lagging", "MGR AR shows the last synced balance", 1]],
    spec: "An invoice in QuickBooks is paid here; MGR offers Record payment only for an invoice QuickBooks never received. Payment status and the QuickBooks balance update only when staff run the manual sync; no settlement date is supplied, which is why the AR list stops showing an invoice as due without anyone marking it paid. It also carries a number MGR does not model: QuickBooks Payments deducts a processing fee before deposit, so the bank deposit never equals the invoice. MGR reconciles against the QuickBooks balance, not the deposit, and must not read the gap as a short payment.",
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
    spec: "Created by Return shipment, never free-form; the plan lists free-form credit memos as deliberately deferred. A keg deposit refund is credited through Return on the invoice that charged the deposit; the empty keg's Returned event is recorded separately in Keg fleet, so the credit is not linked to the fleet balance; Customer keg balance flags a pool and size where the refunded deposit and the kegs on deposit disagree. The deposit line carries TaxCodeRef NON: an unmarked line defaults to TAX and would refund tax that was never charged.",
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
    writes: "push_invoice_to_qbo [existing; rejected, no partial invoice]",
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
    reads: "sync_square_sales [existing; slice 7, idempotent per sale id]",
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
    reads: "sync_square_sales [existing; refund lines included]",
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
    writes: "publish_pos_item [brand id + Square location; whole brand item with its format variations]",
    states: [["created", "durable parent item id stored for the brand group; variation ids stored per format"], ["variation added", "a new serving is a new variation, not a new item", 1], ["renamed in MGR", "same item updated, ids hold"], ["adopted", "one explicitly mapped observed item and variation become MGR-maintained", 1], ["tax assignment", "merged, never replaced; a republish must not retax", 1], ["off-premise twin", "its own item and id; same source brand"]],
    spec: "DISCOVERED from a live library, and it breaks a modelling assumption: a Square item does not carry a price. Variations do. That is why the Price column reads as a range: it is the spread across a pint, a crowler and whatever else hangs off the item, and Variable means the spread is open. MGR therefore stores one durable parent item identity for a brand and menu group plus a durable variation identity per format. Sales report at the variation level, and the per-sale conversion MGR depletes against belongs to the variation, not the item. Publishing the brand updates the complete item while preserving unrelated seller variations and fields.",
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
    writes: "publish_pos_item [existing; clears present_at_location_ids, never a delete]",
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
    writes: "issue_chat_link_proof [design] · consume_chat_link_proof [single-use, authenticated MGR completion]",
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
      {S.sa("*ORD-0231 · Order submitted*\nSubmitted · Ships today · Sales", "Open")}
      {S.sa("*ORD-0235 · Pick due*\nShips tomorrow · Warehouse", "Open")}
      {S.sa("*Route A · stop 3 · Next delivery stop*\nAssigned to you · 9:30 AM", "Open")}
      {S.sa("*FV2 · Fermentation reading overdue*\nLast reading 26 h ago · Brewer", "Open")}
      {S.acts([["Open Today in MGR", "pri"]])}
    </>),
  },
  {
    step: 8, slice: "chat", surface: "entry", venue: { name: "Slack", shell: "msg", ctx: "MGR", who: "Direct message", at: "8:43 AM" },
    name: "Personal DM",
    job: "Notify once when linked work becomes assigned, due or overdue",
    reads: "get_notification_occurrence [design] · owning Today query revalidation",
    writes: "snooze_notification · set_notification_preference [integration state only]",
    states: [["quiet hours", "queued until personal window opens"], ["resolved", "same message updates to Resolved"], ["retry", "same semantic delivery; no second message"], ["unauthorized", "suppress and unlink if membership ended", 1]],
    spec: "The provider message is a projection. Deleting it does not change MGR. Deep links contain no trusted actor or tenant claims.",
    body: (<>
      {S.h("ORD-0235")}
      {S.s("*Pick due*\nAssigned to you")}
      {S.ctx("Pick due · Needs attention")}
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
      {S.s("*Submitted orders:* 2 · Need sales review\n*Picks due:* 2 · Warehouse queue\n*Assigned deliveries:* 1 · Next stops ready\n*Fermentation readings:* 1 · Overdue")}
      {S.ctx("Details and actions are available in each person’s private MGR App Home.")}
      {S.acts([["Open my MGR work", "pri"]])}
    </>),
  },
  {
    step: 8, slice: "chat", surface: "sheet", venue: { name: "Slack", shell: "modal", ctx: "Notification preferences", foot: [["Save preferences", "pri"]] },
    name: "Notification preferences",
    job: "Let a linked user control delivery without changing MGR due state",
    reads: "get_notification_preferences",
    writes: "set_notification_preference · snooze_notification [integration state only]",
    states: [["saved", "update App Home and close"], ["invalid hours", "name the correction", 1], ["unsupported provider", "open authenticated MGR fallback", 1]],
    spec: "Snooze and mute affect personal delivery only. App Home and MGR Today still show current work.",
    body: (<>
      {PERSONAL_NOTIFICATION_REASONS.map(reason => <div key={reason}>{S.toggle(NOTIFICATION_REASON_LABEL[reason])}</div>)}
      {S.select("Sample quiet hours", "9:00 PM–6:00 AM")}
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
      {S.f([["Vessel", "FV2 · Hazy IPA"], ["Last reading", "26 h ago"], ["Reading", "4.2 °P · 68 °F"]])}
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
      {S.f([["Order", "ORD-0231 · 3 lines · ships today · Submitted"], ["Warning", "Hazy IPA · 16 oz case is 8 units short. Review allocations and restock in MGR."]])}
      {S.dis("Confirm order", "This order needs the full MGR review")}
    </>),
  },
  {
    step: 5, slice: 1, tab: "More", name: "Water profiles empty",
    to: { "Add water profile": "Water profile" },
    job: "Invite the first profile, and say a recipe’s Water sheet picks its role",
    reads: "list_water_profiles",
    writes: "none [creation and editing happen on Water profile]",
    states: [["empty", "no saved profiles · Add water profile"]],
    spec: "The empty list uses the same water-profile catalog view as the populated list. Profiles have no source or target classification; those choices belong on a recipe’s Water sheet.",
    body: <WaterProfilesView model={toWaterProfilesViewProps({ profiles: [] })} />,
  },
  {
    step: 2, slice: 1, tab: "Beer", name: "Staff page not found",
    job: "Leave an unknown staff address without losing the staff shell",
    reads: "none", writes: "none",
    states: [["unknown route", "/kegs/missing · the link is wrong or out of date"]],
    body: <NotFoundView message="There is nothing at this address in this brewery. It may have been removed, or the link may be wrong." backLabel="Back to Today" backTo="Today" />,
  },
  {
    step: 2, slice: 1, portal: "Order", name: "Portal page not found",
    job: "Leave an unknown customer address without losing the portal shell",
    reads: "none", writes: "none",
    states: [["unknown route", "/portal/missing · the link is wrong or out of date"]],
    body: <NotFoundView message="There is nothing at this address for your account. It may have been removed, or the link may be wrong." backLabel="Back to Orders" backTo="Order history" />,
  },
];
