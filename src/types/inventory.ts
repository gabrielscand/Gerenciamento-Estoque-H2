export interface StockItem {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockItemInput {
  name: string;
  unit: string;
  minQuantity: number;
}

export interface UpdateStockItemInput {
  name: string;
  unit: string;
  minQuantity: number;
}

export interface StockItemListRow {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
}

export interface DailyInspectionItem {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  currentQuantity: number | null;
}

export interface DailyCountUpdateInput {
  itemId: number;
  quantity: number;
}

export interface DailyHistoryEntry {
  itemId: number;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  needsPurchase: boolean;
  missingQuantity: number;
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
  entries: PeriodHistoryEntry[];
}

export interface DailyStockEntry {
  id: number;
  itemId: number;
  date: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}
