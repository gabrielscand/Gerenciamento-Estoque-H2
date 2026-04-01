export type AppTabPermissionKey =
  | 'dashboard'
  | 'stock'
  | 'items'
  | 'entry'
  | 'exit'
  | 'history';

export interface AppUserPermissions {
  dashboard: boolean;
  stock: boolean;
  items: boolean;
  entry: boolean;
  exit: boolean;
  history: boolean;
}

export interface AppUser {
  id: number;
  remoteId: string;
  username: string;
  functionName: string;
  isAdmin: boolean;
  permissions: AppUserPermissions;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  functionName: string;
  isAdmin: boolean;
  permissions: AppUserPermissions;
}

export interface UpdateUserInput {
  username: string;
  functionName: string;
  password?: string;
  isAdmin: boolean;
  permissions: AppUserPermissions;
}

export interface StockItem {
  id: number;
  name: string;
  unit: string;
  conversionFactor: number;
  minQuantity: number;
  minQuantityInBaseUnits: number;
  category: string | null;
  currentStockQuantity: number | null;
  currentStockQuantityInBaseUnits: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockItemInput {
  name: string;
  unit: string;
  minQuantity: number;
  category: string;
}

export interface UpdateStockItemInput {
  name: string;
  unit: string;
  minQuantity: number;
  category: string;
}

export interface StockItemListRow {
  id: number;
  name: string;
  unit: string;
  conversionFactor: number;
  minQuantity: number;
  minQuantityInBaseUnits: number;
  category: string | null;
  currentStockQuantity: number | null;
  currentStockQuantityInBaseUnits: number | null;
}

export interface DailyInspectionItem {
  id: number;
  name: string;
  unit: string;
  conversionFactor: number;
  minQuantity: number;
  minQuantityInBaseUnits: number;
  category: string | null;
  currentStockQuantity: number | null;
  currentStockQuantityInBaseUnits: number | null;
  currentQuantity: number | null;
  currentQuantityInBaseUnits: number | null;
}

export interface StockMovementItem {
  id: number;
  name: string;
  unit: string;
  conversionFactor: number;
  minQuantity: number;
  minQuantityInBaseUnits: number;
  category: string | null;
  currentStockQuantity: number | null;
  currentStockQuantityInBaseUnits: number | null;
  currentQuantity: number | null;
  currentQuantityInBaseUnits: number | null;
}

export interface DailyCountUpdateInput {
  itemId: number;
  quantity: number;
}

export interface DailyHistoryEntry {
  id: number;
  date: string;
  itemId: number;
  name: string;
  unit: string;
  conversionFactor: number;
  quantity: number;
  quantityInBaseUnits: number;
  createdByUsername: string | null;
  minQuantity: number;
  minQuantityInBaseUnits: number;
  movementType: 'entry' | 'exit' | 'initial' | 'consumption' | 'legacy_snapshot';
  stockAfterQuantity: number | null;
  stockAfterQuantityInBaseUnits: number | null;
  needsPurchase: boolean;
  missingQuantity: number;
  missingQuantityInBaseUnits: number;
  itemDeleted: boolean;
}

export interface DailyHistoryGroup {
  date: string;
  totalItems: number;
  countedItems: number;
  okItems: number;
  needPurchaseItems: number;
  totalMissingQuantity: number;
  totalMissingQuantityInBaseUnits: number;
  entries: DailyHistoryEntry[];
}

export type HistoryPeriodType = 'quinzenal' | 'mensal';

export interface PeriodHistoryDayEntry {
  id: number;
  date: string;
  itemId: number;
  name: string;
  unit: string;
  conversionFactor: number;
  quantity: number;
  quantityInBaseUnits: number;
  createdByUsername: string | null;
  minQuantity: number;
  minQuantityInBaseUnits: number;
  movementType: 'entry' | 'exit' | 'initial' | 'consumption' | 'legacy_snapshot';
  stockAfterQuantity: number | null;
  stockAfterQuantityInBaseUnits: number | null;
  needsPurchase: boolean;
  missingQuantity: number;
  missingQuantityInBaseUnits: number;
  itemDeleted: boolean;
}

export interface PeriodHistoryDay {
  date: string;
  hasEntry: boolean;
  hasExit: boolean;
  entries: PeriodHistoryDayEntry[];
}

export interface PeriodHistoryGroup {
  id: string;
  periodType: HistoryPeriodType;
  month: string;
  label: string;
  startDate: string;
  endDate: string;
  inspectedDays: number;
  countedEntries: number;
  itemsToBuyCount: number;
  totalMissingQuantity: number;
  totalMissingQuantityInBaseUnits: number;
  totalConsumedQuantity: number;
  totalConsumedQuantityInBaseUnits: number;
  days: PeriodHistoryDay[];
}

export type DashboardAbcMetric = 'movement' | 'entry' | 'exit';
export type DashboardAbcClass = 'A' | 'B' | 'C';

export interface DashboardItemAnalyticsRow {
  itemId: number;
  name: string;
  unit: string;
  conversionFactor: number;
  category: string | null;
  entryQuantity: number;
  entryQuantityInBaseUnits: number;
  exitQuantity: number;
  exitQuantityInBaseUnits: number;
  movementTotal: number;
  movementTotalInBaseUnits: number;
}

export interface DashboardDailySeriesPoint {
  date: string;
  dayLabel: string;
  entryQuantity: number;
  entryQuantityInBaseUnits: number;
  exitQuantity: number;
  exitQuantityInBaseUnits: number;
  movementTotal: number;
  movementTotalInBaseUnits: number;
}

export interface DashboardAnalyticsTotals {
  entryQuantity: number;
  entryQuantityInBaseUnits: number;
  exitQuantity: number;
  exitQuantityInBaseUnits: number;
  movementTotal: number;
  movementTotalInBaseUnits: number;
  activeItems: number;
  movementEntries: number;
}

export interface DashboardAnalyticsData {
  month: string;
  startDate: string;
  endDate: string;
  totals: DashboardAnalyticsTotals;
  items: DashboardItemAnalyticsRow[];
  dailySeries: DashboardDailySeriesPoint[];
}

export interface DashboardAbcPoint {
  rank: number;
  itemId: number;
  name: string;
  unit: string;
  conversionFactor: number;
  entryQuantity: number;
  entryQuantityInBaseUnits: number;
  exitQuantity: number;
  exitQuantityInBaseUnits: number;
  movementTotal: number;
  movementTotalInBaseUnits: number;
  metricValue: number;
  sharePercent: number;
  cumulativePercent: number;
  abcClass: DashboardAbcClass;
}

export interface StockCurrentOverviewRow {
  id: number;
  name: string;
  unit: string;
  conversionFactor: number;
  minQuantity: number;
  minQuantityInBaseUnits: number;
  category: string | null;
  currentStockQuantity: number | null;
  currentStockQuantityInBaseUnits: number | null;
  needsPurchase: boolean;
  missingQuantity: number;
  missingQuantityInBaseUnits: number;
}

export interface DailyStockEntry {
  id: number;
  itemId: number;
  date: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export type HistoryReportPeriod = 'diario' | 'quinzenal' | 'mensal';
export type HistoryReportMovementType = 'entry' | 'exit';

export interface HistoryReportEntry {
  id: number;
  date: string;
  itemId: number;
  name: string;
  unit: string;
  conversionFactor: number;
  quantity: number;
  quantityInBaseUnits: number;
  movementType: HistoryReportMovementType;
}

export interface HistoryReportItemSummary {
  itemId: number;
  name: string;
  unit: string;
  conversionFactor: number;
  totalEntryQuantity: number;
  totalEntryQuantityInBaseUnits: number;
  totalExitQuantity: number;
  totalExitQuantityInBaseUnits: number;
  movementDates: string[];
  isTopEntry: boolean;
  isTopExit: boolean;
}
