import { getDatabase } from './index';
import {
  formatDateLabel,
  getMonthDateRange,
  getTodayLocalDateString,
  isValidDateString,
  isValidMonthString,
} from '../utils/date';
import type {
  CreateStockItemInput,
  DailyCountUpdateInput,
  DailyHistoryEntry,
  DailyHistoryGroup,
  DailyInspectionItem,
  PeriodHistoryEntry,
  PeriodHistoryGroup,
  StockItem,
  StockItemListRow,
  UpdateStockItemInput,
} from '../types/inventory';

type StockItemRow = {
  id: number;
  name: string;
  unit: string;
  min_quantity: number;
  created_at: string;
  updated_at: string;
};

type StockItemListRowQuery = {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
};

type DailyInspectionItemQuery = {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  currentQuantity: number | null;
};

type DailyHistorySummaryRow = {
  date: string;
  countedItems: number;
  okItems: number;
  needPurchaseItems: number;
  totalMissingQuantity: number;
};

type DailyHistoryDetailRow = {
  date: string;
  itemId: number;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  missingQuantity: number;
};

type PeriodHistorySummaryRow = {
  countedEntries: number;
  inspectedDays: number;
  totalMissingQuantity: number;
};

type PeriodHistoryDetailRow = {
  itemId: number;
  name: string;
  unit: string;
  countedDays: number;
  totalMissingQuantity: number;
};

function normalizeItemName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export async function listStockItems(): Promise<StockItemListRow[]> {
  const database = await getDatabase();

  return database.getAllAsync<StockItemListRowQuery>(
    `
      SELECT
        id,
        name,
        unit,
        min_quantity AS minQuantity
      FROM stock_items
      ORDER BY name COLLATE NOCASE ASC;
    `,
  );
}

export async function listDailyInspectionItems(
  date: string = getTodayLocalDateString(),
): Promise<DailyInspectionItem[]> {
  if (!isValidDateString(date)) {
    throw new Error('Data de vistoria invalida.');
  }

  const database = await getDatabase();

  const rows = await database.getAllAsync<DailyInspectionItemQuery>(
    `
      SELECT
        stock_items.id AS id,
        stock_items.name AS name,
        stock_items.unit AS unit,
        stock_items.min_quantity AS minQuantity,
        daily_stock_entries.quantity AS currentQuantity
      FROM stock_items
      LEFT JOIN daily_stock_entries
        ON daily_stock_entries.item_id = stock_items.id
        AND daily_stock_entries.date = ?
      ORDER BY stock_items.name COLLATE NOCASE ASC;
    `,
    date,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    unit: row.unit,
    minQuantity: row.minQuantity,
    currentQuantity: row.currentQuantity,
  }));
}

export async function findItemByNormalizedName(
  name: string,
  excludeItemId?: number,
): Promise<StockItem | null> {
  const normalizedName = normalizeItemName(name);
  const database = await getDatabase();
  let row: StockItemRow | null = null;

  if (typeof excludeItemId === 'number') {
    row = await database.getFirstAsync<StockItemRow>(
      `
        SELECT
          id,
          name,
          unit,
          min_quantity,
          created_at,
          updated_at
        FROM stock_items
        WHERE LOWER(TRIM(name)) = ?
          AND id <> ?
        LIMIT 1;
      `,
      normalizedName,
      excludeItemId,
    );
  } else {
    row = await database.getFirstAsync<StockItemRow>(
      `
        SELECT
          id,
          name,
          unit,
          min_quantity,
          created_at,
          updated_at
        FROM stock_items
        WHERE LOWER(TRIM(name)) = ?
        LIMIT 1;
      `,
      normalizedName,
    );
  }

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    minQuantity: row.min_quantity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createStockItem(input: CreateStockItemInput): Promise<void> {
  const database = await getDatabase();
  const name = input.name.trim();
  const unit = input.unit.trim();

  await database.runAsync(
    `
      INSERT INTO stock_items (name, unit, min_quantity)
      VALUES (?, ?, ?);
    `,
    name,
    unit,
    input.minQuantity,
  );
}

export async function updateStockItem(itemId: number, input: UpdateStockItemInput): Promise<void> {
  const database = await getDatabase();
  const name = input.name.trim();
  const unit = input.unit.trim();

  const result = await database.runAsync(
    `
      UPDATE stock_items
      SET
        name = ?,
        unit = ?,
        min_quantity = ?,
        updated_at = datetime('now')
      WHERE id = ?;
    `,
    name,
    unit,
    input.minQuantity,
    itemId,
  );

  if ((result.changes ?? 0) === 0) {
    throw new Error('Item nao encontrado para edicao.');
  }
}

export async function saveDailyInspection(
  updates: DailyCountUpdateInput[],
  date: string = getTodayLocalDateString(),
): Promise<void> {
  if (!isValidDateString(date)) {
    throw new Error('Data de vistoria invalida.');
  }

  if (updates.length === 0) {
    return;
  }

  const database = await getDatabase();

  await database.withTransactionAsync(async () => {
    for (const update of updates) {
      if (!Number.isFinite(update.quantity) || update.quantity < 0) {
        throw new Error('Quantidade invalida para vistoria diaria.');
      }

      await database.runAsync(
        `
          INSERT INTO daily_stock_entries (item_id, date, quantity)
          VALUES (?, ?, ?)
          ON CONFLICT(item_id, date)
          DO UPDATE SET
            quantity = excluded.quantity,
            updated_at = datetime('now');
        `,
        update.itemId,
        date,
        update.quantity,
      );
    }
  });
}

export async function listDailyHistoryGrouped(): Promise<DailyHistoryGroup[]> {
  const database = await getDatabase();
  const totalItemsRow = await database.getFirstAsync<{ totalItems: number }>(
    'SELECT COUNT(*) AS totalItems FROM stock_items;',
  );
  const totalItems = totalItemsRow?.totalItems ?? 0;

  const summaryRows = await database.getAllAsync<DailyHistorySummaryRow>(
    `
      SELECT
        daily_stock_entries.date AS date,
        COUNT(*) AS countedItems,
        SUM(CASE WHEN daily_stock_entries.quantity >= stock_items.min_quantity THEN 1 ELSE 0 END) AS okItems,
        SUM(CASE WHEN daily_stock_entries.quantity < stock_items.min_quantity THEN 1 ELSE 0 END) AS needPurchaseItems,
        SUM(
          CASE
            WHEN daily_stock_entries.quantity < stock_items.min_quantity
              THEN stock_items.min_quantity - daily_stock_entries.quantity
            ELSE 0
          END
        ) AS totalMissingQuantity
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      GROUP BY daily_stock_entries.date
      ORDER BY daily_stock_entries.date DESC;
    `,
  );

  if (summaryRows.length === 0) {
    return [];
  }

  const detailRows = await database.getAllAsync<DailyHistoryDetailRow>(
    `
      SELECT
        daily_stock_entries.date AS date,
        stock_items.id AS itemId,
        stock_items.name AS name,
        stock_items.unit AS unit,
        daily_stock_entries.quantity AS quantity,
        stock_items.min_quantity AS minQuantity,
        CASE
          WHEN daily_stock_entries.quantity < stock_items.min_quantity
            THEN stock_items.min_quantity - daily_stock_entries.quantity
          ELSE 0
        END AS missingQuantity
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      ORDER BY daily_stock_entries.date DESC, stock_items.name COLLATE NOCASE ASC;
    `,
  );

  const entriesByDate = new Map<string, DailyHistoryEntry[]>();

  for (const detail of detailRows) {
    const dateEntries = entriesByDate.get(detail.date) ?? [];
    dateEntries.push({
      itemId: detail.itemId,
      name: detail.name,
      unit: detail.unit,
      quantity: detail.quantity,
      minQuantity: detail.minQuantity,
      needsPurchase: detail.quantity < detail.minQuantity,
      missingQuantity: detail.missingQuantity,
    });
    entriesByDate.set(detail.date, dateEntries);
  }

  return summaryRows.map((summary) => ({
    date: summary.date,
    totalItems,
    countedItems: summary.countedItems,
    okItems: summary.okItems,
    needPurchaseItems: summary.needPurchaseItems,
    totalMissingQuantity: summary.totalMissingQuantity,
    entries: entriesByDate.get(summary.date) ?? [],
  }));
}

async function loadPeriodEntries(
  startDate: string,
  endDate: string,
): Promise<{ countedEntries: number; inspectedDays: number; entries: PeriodHistoryEntry[]; totalMissingQuantity: number }> {
  const database = await getDatabase();

  const summaryRow = await database.getFirstAsync<PeriodHistorySummaryRow>(
    `
      SELECT
        COUNT(*) AS countedEntries,
        COUNT(DISTINCT daily_stock_entries.date) AS inspectedDays,
        SUM(
          CASE
            WHEN daily_stock_entries.quantity < stock_items.min_quantity
              THEN stock_items.min_quantity - daily_stock_entries.quantity
            ELSE 0
          END
        ) AS totalMissingQuantity
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      WHERE daily_stock_entries.date BETWEEN ? AND ?;
    `,
    startDate,
    endDate,
  );

  const detailRows = await database.getAllAsync<PeriodHistoryDetailRow>(
    `
      SELECT
        stock_items.id AS itemId,
        stock_items.name AS name,
        stock_items.unit AS unit,
        COUNT(DISTINCT daily_stock_entries.date) AS countedDays,
        SUM(
          CASE
            WHEN daily_stock_entries.quantity < stock_items.min_quantity
              THEN stock_items.min_quantity - daily_stock_entries.quantity
            ELSE 0
          END
        ) AS totalMissingQuantity
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      WHERE daily_stock_entries.date BETWEEN ? AND ?
      GROUP BY stock_items.id, stock_items.name, stock_items.unit
      HAVING SUM(
        CASE
          WHEN daily_stock_entries.quantity < stock_items.min_quantity
            THEN stock_items.min_quantity - daily_stock_entries.quantity
          ELSE 0
        END
      ) > 0
      ORDER BY stock_items.name COLLATE NOCASE ASC;
    `,
    startDate,
    endDate,
  );

  return {
    countedEntries: summaryRow?.countedEntries ?? 0,
    inspectedDays: summaryRow?.inspectedDays ?? 0,
    totalMissingQuantity: summaryRow?.totalMissingQuantity ?? 0,
    entries: detailRows.map((row) => ({
      itemId: row.itemId,
      name: row.name,
      unit: row.unit,
      countedDays: row.countedDays,
      totalMissingQuantity: row.totalMissingQuantity,
    })),
  };
}

export async function listFortnightlyHistoryGrouped(month: string): Promise<PeriodHistoryGroup[]> {
  if (!isValidMonthString(month)) {
    throw new Error('Mes invalido para relatorio quinzenal.');
  }

  const monthRange = getMonthDateRange(month);

  if (!monthRange) {
    throw new Error('Mes invalido para relatorio quinzenal.');
  }

  const firstHalfStart = `${month}-01`;
  const firstHalfEnd = `${month}-15`;
  const secondHalfStart = `${month}-16`;
  const secondHalfEnd = monthRange.endDate;

  const firstHalfData = await loadPeriodEntries(firstHalfStart, firstHalfEnd);
  const secondHalfData = await loadPeriodEntries(secondHalfStart, secondHalfEnd);

  return [
    {
      id: `${month}-Q1`,
      periodType: 'quinzenal',
      month,
      label: `1a quinzena (${formatDateLabel(firstHalfStart)} a ${formatDateLabel(firstHalfEnd)})`,
      startDate: firstHalfStart,
      endDate: firstHalfEnd,
      inspectedDays: firstHalfData.inspectedDays,
      countedEntries: firstHalfData.countedEntries,
      itemsToBuyCount: firstHalfData.entries.length,
      totalMissingQuantity: firstHalfData.totalMissingQuantity,
      entries: firstHalfData.entries,
    },
    {
      id: `${month}-Q2`,
      periodType: 'quinzenal',
      month,
      label: `2a quinzena (${formatDateLabel(secondHalfStart)} a ${formatDateLabel(secondHalfEnd)})`,
      startDate: secondHalfStart,
      endDate: secondHalfEnd,
      inspectedDays: secondHalfData.inspectedDays,
      countedEntries: secondHalfData.countedEntries,
      itemsToBuyCount: secondHalfData.entries.length,
      totalMissingQuantity: secondHalfData.totalMissingQuantity,
      entries: secondHalfData.entries,
    },
  ];
}

export async function listMonthlyHistoryGrouped(month: string): Promise<PeriodHistoryGroup[]> {
  if (!isValidMonthString(month)) {
    throw new Error('Mes invalido para relatorio mensal.');
  }

  const monthRange = getMonthDateRange(month);

  if (!monthRange) {
    throw new Error('Mes invalido para relatorio mensal.');
  }

  const monthlyData = await loadPeriodEntries(monthRange.startDate, monthRange.endDate);

  return [
    {
      id: `${month}-M`,
      periodType: 'mensal',
      month,
      label: `Mensal (${formatDateLabel(monthRange.startDate)} a ${formatDateLabel(monthRange.endDate)})`,
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      inspectedDays: monthlyData.inspectedDays,
      countedEntries: monthlyData.countedEntries,
      itemsToBuyCount: monthlyData.entries.length,
      totalMissingQuantity: monthlyData.totalMissingQuantity,
      entries: monthlyData.entries,
    },
  ];
}
