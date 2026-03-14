import type { StockCategory } from '../constants/categories';

export interface StockItem {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  category: StockCategory | null;
  currentStockQuantity: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockItemInput {
  name: string;
  unit: string;
  minQuantity: number;
  category: StockCategory;
}

export interface UpdateStockItemInput {
  name: string;
  unit: string;
  minQuantity: number;
  category: StockCategory;
}

export interface StockItemListRow {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  category: StockCategory | null;
  currentStockQuantity: number | null;
}

export interface DailyInspectionItem {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  category: StockCategory | null;
  currentStockQuantity: number | null;
  currentQuantity: number | null;
}

export interface StockMovementItem {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  category: StockCategory | null;
  currentStockQuantity: number | null;
  currentQuantity: number | null;
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
  quantity: number;
  minQuantity: number;
  movementType: 'entry' | 'exit' | 'initial' | 'consumption' | 'legacy_snapshot';
  stockAfterQuantity: number | null;
  needsPurchase: boolean;
  missingQuantity: number;
  itemDeleted: boolean;
}

export interface DailyHistoryGroup {
  date: string;
  totalItems: number;
  countedItems: number;
  okItems: number;
  needPurchaseItems: number;
  totalMissingQuantity: number;
  entries: DailyHistoryEntry[];
}

export type HistoryPeriodType = 'quinzenal' | 'mensal';

export interface PeriodHistoryEntry {
  itemId: number;
  name: string;
  unit: string;
  totalMissingQuantity: number;
  consumedQuantityTotal: number;
  countedDays: number;
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
  totalConsumedQuantity: number;
  entries: PeriodHistoryEntry[];
}

export interface StockCurrentOverviewRow {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  category: StockCategory | null;
  currentStockQuantity: number | null;
  needsPurchase: boolean;
  missingQuantity: number;
}

export interface DailyStockEntry {
  id: number;
  itemId: number;
  date: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}
