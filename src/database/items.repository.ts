import { getDatabase } from './index';
import {
  isRemoteSyncConfigured,
  syncAppData,
  syncAppDataInBackground,
} from './sync.service';
import { normalizeCatalogName } from '../constants/categories';
import { emitCatalogOptionsChanged, subscribeCatalogOptionsChanged } from './catalog.events';
import {
  formatDateLabel,
  getMonthDateRange,
  getTodayLocalDateString,
  isValidDateString,
  isValidMonthString,
} from '../utils/date';
import type {
  CreateStockItemInput,
  DashboardAnalyticsData,
  DashboardDailySeriesPoint,
  DashboardItemAnalyticsRow,
  DailyCountUpdateInput,
  DailyHistoryEntry,
  DailyHistoryGroup,
  HistoryReportEntry,
  PeriodHistoryDay,
  PeriodHistoryDayEntry,
  PeriodHistoryGroup,
  StockMovementItem,
  StockCurrentOverviewRow,
  StockItem,
  StockItemListRow,
  UpdateStockItemInput,
} from '../types/inventory';

type StockItemRow = {
  id: number;
  name: string;
  unit: string;
  min_quantity: number;
  current_stock_quantity?: number | null;
  category?: string | null;
  is_deleted?: number;
  deleted_at?: string | null;
  sync_status?: string;
  created_at: string;
  updated_at: string;
};

type StockItemListRowQuery = {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  currentStockQuantity: number | null;
  category: string | null;
};

type StockCurrentOverviewQuery = {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  currentStockQuantity: number | null;
  category: string | null;
};

type StockMovementItemQuery = {
  id: number;
  name: string;
  unit: string;
  minQuantity: number;
  currentStockQuantity: number | null;
  category: string | null;
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
  id: number;
  date: string;
  itemId: number;
  name: string;
  unit: string;
  quantity: number;
  createdByUsername: string | null;
  minQuantity: number;
  movementType: 'entry' | 'exit' | 'initial' | 'consumption' | 'legacy_snapshot';
  stockAfterQuantity: number | null;
  missingQuantity: number;
  itemDeleted: number;
};

type PeriodHistorySummaryRow = {
  countedEntries: number;
  inspectedDays: number;
  totalMissingQuantity: number;
  totalConsumedQuantity: number;
};

type PeriodHistoryDayDetailRow = {
  id: number;
  date: string;
  itemId: number;
  name: string;
  unit: string;
  quantity: number;
  createdByUsername: string | null;
  minQuantity: number;
  movementType: string | null;
  stockAfterQuantity: number | null;
  missingQuantity: number;
  itemDeleted: number;
};

type HistoryReportEntryRow = {
  id: number;
  date: string;
  itemId: number;
  name: string;
  unit: string;
  quantity: number;
  movementType: string | null;
};

type DashboardSummaryRow = {
  totalEntryQuantity: number | null;
  totalExitQuantity: number | null;
  movementEntries: number | null;
};

type DashboardItemTotalsRow = {
  itemId: number;
  name: string;
  unit: string;
  category: string | null;
  entryQuantity: number | null;
  exitQuantity: number | null;
};

type DashboardDailySeriesRow = {
  date: string;
  entryQuantity: number | null;
  exitQuantity: number | null;
};

type StockItemRemoteRow = {
  id: number;
  name: string;
  remote_id: string;
  current_stock_quantity: number | null;
};

type CatalogOptionListRow = {
  id: number;
  name: string;
  nameNormalized: string;
};

type CatalogExistingRow = {
  id: number;
};

type CatalogCurrentRow = {
  id: number;
  nameNormalized: string;
};

type CatalogBackfillValueRow = {
  value: string;
};

type CatalogUsageCountRow = {
  total: number;
};

type DailyTimelineRow = {
  id: number;
  date: string;
  quantity: number;
  movement_type: string | null;
  stock_after_quantity: number | null;
};

type SessionAuthorRow = {
  remote_id: string;
  username: string;
};

function normalizeItemName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function nowIsoString(): string {
  return new Date().toISOString();
}

async function getCurrentSessionAuthor(database: Awaited<ReturnType<typeof getDatabase>>): Promise<SessionAuthorRow | null> {
  const author = await database.getFirstAsync<SessionAuthorRow>(
    `
      SELECT app_users.remote_id AS remote_id, app_users.username AS username
      FROM app_session
      INNER JOIN app_users ON app_users.remote_id = app_session.remote_user_id
      WHERE app_session.id = 1
        AND app_users.is_deleted = 0
      LIMIT 1;
    `,
  );

  if (!author || !author.remote_id || author.username.trim().length === 0) {
    return null;
  }

  return author;
}

function normalizeCategory(category: string | null | undefined): StockItem['category'] {
  if (!category) {
    return null;
  }

  const normalized = normalizeCatalogName(category);
  return normalized.length === 0 ? null : normalized;
}

function createRemoteItemId(): string {
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createCatalogRemoteId(prefix: 'cat' | 'unit'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function backfillCatalogFromStockItems(
  database: Awaited<ReturnType<typeof getDatabase>>,
  tableName: 'item_categories' | 'measurement_units',
  sourceColumn: 'category' | 'unit',
): Promise<boolean> {
  const rows = await database.getAllAsync<CatalogBackfillValueRow>(
    `
      SELECT DISTINCT ${sourceColumn} AS value
      FROM stock_items
      WHERE is_deleted = 0
        AND ${sourceColumn} IS NOT NULL
        AND TRIM(${sourceColumn}) <> '';
    `,
  );

  if (rows.length === 0) {
    return false;
  }

  const timestamp = nowIsoString();
  let hasInserted = false;

  for (const row of rows) {
    const normalizedName = normalizeCatalogName(row.value);

    if (normalizedName.length === 0) {
      continue;
    }

    const result = await database.runAsync(
      `
        INSERT OR IGNORE INTO ${tableName} (
          remote_id,
          sync_status,
          name,
          name_normalized,
          created_at,
          updated_at
        )
        VALUES (?, 'pending', ?, ?, ?, ?);
      `,
      createCatalogRemoteId(tableName === 'item_categories' ? 'cat' : 'unit'),
      normalizedName,
      normalizedName,
      timestamp,
      timestamp,
    );

    if ((result.changes ?? 0) > 0) {
      hasInserted = true;
    }
  }

  return hasInserted;
}

let activeCatalogBackfill: Promise<void> | null = null;

async function ensureCatalogBackfillFromStockItems(
  database: Awaited<ReturnType<typeof getDatabase>>,
): Promise<void> {
  if (!activeCatalogBackfill) {
    activeCatalogBackfill = (async () => {
      const hasCategoryInsertions = await backfillCatalogFromStockItems(
        database,
        'item_categories',
        'category',
      );
      const hasUnitInsertions = await backfillCatalogFromStockItems(
        database,
        'measurement_units',
        'unit',
      );

      if (hasCategoryInsertions || hasUnitInsertions) {
        syncAppDataInBackground();
      }
    })().finally(() => {
      activeCatalogBackfill = null;
    });
  }

  await activeCatalogBackfill;
}

function createMovementRemoteId(itemRemoteId: string, date: string, movementType: 'entry' | 'exit'): string {
  const uniquePart = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${itemRemoteId}:${date}:${movementType}:${uniquePart}`;
}

function isMovementType(
  value: string | null | undefined,
): value is DailyHistoryEntry['movementType'] {
  return (
    value === 'entry' ||
    value === 'exit' ||
    value === 'initial' ||
    value === 'consumption' ||
    value === 'legacy_snapshot'
  );
}

function normalizeMovementType(
  value: string | null | undefined,
  fallback: DailyHistoryEntry['movementType'] = 'exit',
): DailyHistoryEntry['movementType'] {
  return isMovementType(value) ? value : fallback;
}

function isEntryLikeMovementType(movementType: DailyHistoryEntry['movementType']): boolean {
  return (
    movementType === 'entry' || movementType === 'initial' || movementType === 'legacy_snapshot'
  );
}

function isExitLikeMovementType(movementType: DailyHistoryEntry['movementType']): boolean {
  return movementType === 'exit' || movementType === 'consumption';
}

function toReportMovementType(
  movementType: DailyHistoryEntry['movementType'],
): HistoryReportEntry['movementType'] {
  return isEntryLikeMovementType(movementType) ? 'entry' : 'exit';
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

async function createCatalogOption(
  tableName: 'item_categories' | 'measurement_units',
  rawName: string,
  duplicateError: string,
): Promise<void> {
  const database = await getDatabase();
  const normalizedName = normalizeCatalogName(rawName);

  if (normalizedName.length === 0) {
    throw new Error('Informe um nome valido.');
  }

  const existing = await database.getFirstAsync<CatalogExistingRow>(
    `
      SELECT id
      FROM ${tableName}
      WHERE name_normalized = ?
        AND is_deleted = 0
      LIMIT 1;
    `,
    normalizedName,
  );

  if (existing) {
    throw new Error(duplicateError);
  }

  const timestamp = nowIsoString();
  await database.runAsync(
    `
      INSERT INTO ${tableName} (
        remote_id,
        sync_status,
        name,
        name_normalized,
        created_at,
        updated_at
      )
      VALUES (?, 'pending', ?, ?, ?, ?);
    `,
    createCatalogRemoteId(tableName === 'item_categories' ? 'cat' : 'unit'),
    normalizedName,
    normalizedName,
    timestamp,
    timestamp,
  );

  emitCatalogOptionsChanged();
  syncAppDataInBackground();
}

async function updateCatalogOption(
  tableName: 'item_categories' | 'measurement_units',
  optionId: number,
  rawName: string,
  duplicateError: string,
  notFoundError: string,
): Promise<void> {
  const database = await getDatabase();
  const normalizedName = normalizeCatalogName(rawName);
  const usageColumn = tableName === 'item_categories' ? 'category' : 'unit';

  if (normalizedName.length === 0) {
    throw new Error('Informe um nome valido.');
  }

  const current = await database.getFirstAsync<CatalogCurrentRow>(
    `
      SELECT
        id,
        name_normalized AS nameNormalized
      FROM ${tableName}
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1;
    `,
    optionId,
  );

  if (!current) {
    throw new Error(notFoundError);
  }

  const existing = await database.getFirstAsync<CatalogExistingRow>(
    `
      SELECT id
      FROM ${tableName}
      WHERE name_normalized = ?
        AND is_deleted = 0
        AND id <> ?
      LIMIT 1;
    `,
    normalizedName,
    optionId,
  );

  if (existing) {
    throw new Error(duplicateError);
  }

  if (current.nameNormalized === normalizedName) {
    return;
  }

  const timestamp = nowIsoString();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `
        UPDATE ${tableName}
        SET
          name = ?,
          name_normalized = ?,
          updated_at = ?,
          sync_status = 'pending'
        WHERE id = ?
          AND is_deleted = 0;
      `,
      normalizedName,
      normalizedName,
      timestamp,
      optionId,
    );

    await database.runAsync(
      `
        UPDATE stock_items
        SET
          ${usageColumn} = ?,
          updated_at = ?,
          sync_status = 'pending'
        WHERE is_deleted = 0
          AND ${usageColumn} = ?;
      `,
      normalizedName,
      timestamp,
      current.nameNormalized,
    );
  });

  emitCatalogOptionsChanged();
  syncAppDataInBackground();
}

async function archiveCatalogOption(
  tableName: 'item_categories' | 'measurement_units',
  optionId: number,
  usageColumn: 'category' | 'unit',
  inUseError: string,
  notFoundError: string,
): Promise<void> {
  const database = await getDatabase();

  const current = await database.getFirstAsync<CatalogCurrentRow>(
    `
      SELECT
        id,
        name_normalized AS nameNormalized
      FROM ${tableName}
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1;
    `,
    optionId,
  );

  if (!current) {
    throw new Error(notFoundError);
  }

  const usage = await database.getFirstAsync<CatalogUsageCountRow>(
    `
      SELECT COUNT(1) AS total
      FROM stock_items
      WHERE is_deleted = 0
        AND ${usageColumn} = ?;
    `,
    current.nameNormalized,
  );

  if ((usage?.total ?? 0) > 0) {
    throw new Error(inUseError);
  }

  const timestamp = nowIsoString();
  const result = await database.runAsync(
    `
      UPDATE ${tableName}
      SET
        is_deleted = 1,
        deleted_at = ?,
        updated_at = ?,
        sync_status = 'pending'
      WHERE id = ?
        AND is_deleted = 0;
    `,
    timestamp,
    timestamp,
    optionId,
  );

  if ((result.changes ?? 0) === 0) {
    throw new Error(notFoundError);
  }

  emitCatalogOptionsChanged();
  syncAppDataInBackground();
}

export type CatalogOption = {
  id: number;
  name: string;
  nameNormalized: string;
};

export function subscribeToCatalogOptionsChanged(listener: () => void): () => void {
  return subscribeCatalogOptionsChanged(listener);
}

async function listCatalogOptions(
  tableName: 'item_categories' | 'measurement_units',
): Promise<CatalogOption[]> {
  const database = await getDatabase();
  await ensureCatalogBackfillFromStockItems(database);
  const rows = await database.getAllAsync<CatalogOptionListRow>(
    `
      SELECT
        id,
        name,
        name_normalized AS nameNormalized
      FROM ${tableName}
      WHERE is_deleted = 0
      ORDER BY name COLLATE NOCASE ASC;
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: normalizeCatalogName(row.name),
    nameNormalized: normalizeCatalogName(row.nameNormalized),
  }));
}

export async function listItemCategories(): Promise<string[]> {
  const rows = await listCatalogOptions('item_categories');
  return rows.map((row) => row.name).filter((row) => row.length > 0);
}

export async function listMeasurementUnits(): Promise<string[]> {
  const rows = await listCatalogOptions('measurement_units');
  return rows.map((row) => row.name).filter((row) => row.length > 0);
}

export async function listItemCategoryOptions(): Promise<CatalogOption[]> {
  return listCatalogOptions('item_categories');
}

export async function listMeasurementUnitOptions(): Promise<CatalogOption[]> {
  return listCatalogOptions('measurement_units');
}

export async function createItemCategory(name: string): Promise<void> {
  await createCatalogOption('item_categories', name, 'Categoria ja existe.');
}

export async function createMeasurementUnit(name: string): Promise<void> {
  await createCatalogOption('measurement_units', name, 'Unidade de medida ja existe.');
}

export async function updateItemCategory(optionId: number, name: string): Promise<void> {
  await updateCatalogOption(
    'item_categories',
    optionId,
    name,
    'Categoria ja existe.',
    'Categoria nao encontrada.',
  );
}

export async function updateMeasurementUnit(optionId: number, name: string): Promise<void> {
  await updateCatalogOption(
    'measurement_units',
    optionId,
    name,
    'Unidade de medida ja existe.',
    'Unidade de medida nao encontrada.',
  );
}

export async function archiveItemCategory(optionId: number): Promise<void> {
  await archiveCatalogOption(
    'item_categories',
    optionId,
    'category',
    'Nao e possivel excluir: existem itens ativos usando essa categoria.',
    'Categoria nao encontrada.',
  );
}

export async function archiveMeasurementUnit(optionId: number): Promise<void> {
  await archiveCatalogOption(
    'measurement_units',
    optionId,
    'unit',
    'Nao e possivel excluir: existem itens ativos usando essa unidade.',
    'Unidade de medida nao encontrada.',
  );
}

function toSafeNumber(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}

function buildDateRangeList(startDate: string, endDate: string): string[] {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const current = new Date(startYear, startMonth - 1, startDay);
  const final = new Date(endYear, endMonth - 1, endDay);
  const result: string[] = [];

  while (current.getTime() <= final.getTime()) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    result.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function isGreaterThan(a: number, b: number): boolean {
  return a - b > 0.000001;
}

const DELETE_CHAIN_BLOCKED_ERROR =
  'Nao e possivel excluir: existe saida posterior sem saldo suficiente.';

type RecalculateReason = 'generic' | 'delete';

function createMissingBaseError(reason: RecalculateReason): Error {
  if (reason === 'delete') {
    return new Error(DELETE_CHAIN_BLOCKED_ERROR);
  }

  return new Error('Saida sem saldo base para calculo.');
}

function createInsufficientStockError(
  reason: RecalculateReason,
  itemName: string,
  date: string,
): Error {
  if (reason === 'delete') {
    return new Error(DELETE_CHAIN_BLOCKED_ERROR);
  }

  return new Error(
    `Saida de ${itemName} em ${formatDateLabel(date)} maior que o saldo disponivel.`,
  );
}

async function syncAfterDailyHistoryMutation(): Promise<void> {
  if (!isRemoteSyncConfigured()) {
    return;
  }

  const syncOk = await syncAppData();

  if (!syncOk) {
    throw new Error(
      'Alteracao salva localmente, mas falhou a sincronizacao com Supabase. Tente sincronizar novamente.',
    );
  }
}

async function recalculateItemStockTimeline(
  database: Awaited<ReturnType<typeof getDatabase>>,
  itemId: number,
  reason: RecalculateReason = 'generic',
): Promise<void> {
  const item = await database.getFirstAsync<{
    id: number;
    name: string;
    current_stock_quantity: number | null;
  }>(
    `
      SELECT id, name, current_stock_quantity
      FROM stock_items
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1;
    `,
    itemId,
  );

  if (!item) {
    return;
  }

  const timeline = await database.getAllAsync<DailyTimelineRow>(
    `
      SELECT
        id,
        date,
        quantity,
        movement_type,
        stock_after_quantity
      FROM daily_stock_entries
      WHERE item_id = ?
        AND is_deleted = 0
      ORDER BY date ASC, created_at ASC, id ASC;
    `,
    itemId,
  );

  let running: number | null = null;

  for (const entry of timeline) {
    const currentType = normalizeMovementType(entry.movement_type, 'exit');
    const nextType: DailyHistoryEntry['movementType'] =
      currentType === 'initial' || currentType === 'legacy_snapshot'
        ? 'entry'
        : currentType === 'consumption'
          ? 'exit'
          : currentType;
    let nextStockAfter: number;

    if (nextType === 'entry') {
      const base = running ?? 0;
      nextStockAfter = roundQuantity(base + entry.quantity);
      running = nextStockAfter;
    } else {
      if (running === null) {
        throw createMissingBaseError(reason);
      }

      if (isGreaterThan(entry.quantity, running)) {
        throw createInsufficientStockError(reason, item.name, entry.date);
      }

      nextStockAfter = roundQuantity(running - entry.quantity);
      running = nextStockAfter;
    }

    const changedType = nextType !== currentType;
    const changedStockAfter = entry.stock_after_quantity === null
      ? true
      : Math.abs(entry.stock_after_quantity - nextStockAfter) > 0.000001;

    if (changedType || changedStockAfter) {
      await database.runAsync(
        `
          UPDATE daily_stock_entries
          SET
            movement_type = ?,
            stock_after_quantity = ?,
            sync_status = 'pending',
            updated_at = ?
          WHERE id = ?;
        `,
        nextType,
        nextStockAfter,
        nowIsoString(),
        entry.id,
      );
    }
  }

  const hasStockChanged =
    (item.current_stock_quantity === null && running !== null) ||
    (item.current_stock_quantity !== null &&
      running !== null &&
      Math.abs(item.current_stock_quantity - running) > 0.000001) ||
    (item.current_stock_quantity !== null && running === null);

  if (hasStockChanged) {
    await database.runAsync(
      `
        UPDATE stock_items
        SET
          current_stock_quantity = ?,
          sync_status = 'pending',
          updated_at = ?
        WHERE id = ?;
      `,
      running,
      nowIsoString(),
      itemId,
    );
  }
}

export async function listStockItems(): Promise<StockItemListRow[]> {
  const database = await getDatabase();

  const rows = await database.getAllAsync<StockItemListRowQuery>(
    `
      SELECT
        id,
        name,
        unit,
        min_quantity AS minQuantity,
        current_stock_quantity AS currentStockQuantity,
        category
      FROM stock_items
      WHERE is_deleted = 0
      ORDER BY name COLLATE NOCASE ASC;
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    unit: row.unit,
    minQuantity: row.minQuantity,
    currentStockQuantity: row.currentStockQuantity,
    category: normalizeCategory(row.category),
  }));
}

export async function listStockCurrentOverview(): Promise<StockCurrentOverviewRow[]> {
  const database = await getDatabase();

  const rows = await database.getAllAsync<StockCurrentOverviewQuery>(
    `
      SELECT
        id,
        name,
        unit,
        min_quantity AS minQuantity,
        current_stock_quantity AS currentStockQuantity,
        category
      FROM stock_items
      WHERE is_deleted = 0
      ORDER BY name COLLATE NOCASE ASC;
    `,
  );

  return rows.map((row) => {
    const currentStock = row.currentStockQuantity;
    const needsPurchase = currentStock !== null ? currentStock <= row.minQuantity : false;
    const missingQuantity =
      currentStock !== null && currentStock < row.minQuantity
        ? roundQuantity(row.minQuantity - currentStock)
        : 0;

    return {
      id: row.id,
      name: row.name,
      unit: row.unit,
      minQuantity: row.minQuantity,
      category: normalizeCategory(row.category),
      currentStockQuantity: currentStock,
      needsPurchase,
      missingQuantity,
    };
  });
}

export async function listStockMovementItems(
  movementType: 'entry' | 'exit',
  date: string = getTodayLocalDateString(),
): Promise<StockMovementItem[]> {
  if (!isValidDateString(date)) {
    throw new Error('Data de vistoria invalida.');
  }

  const database = await getDatabase();

  const rows = await database.getAllAsync<StockMovementItemQuery>(
    `
      SELECT
        stock_items.id AS id,
        stock_items.name AS name,
        stock_items.unit AS unit,
        stock_items.min_quantity AS minQuantity,
        stock_items.current_stock_quantity AS currentStockQuantity,
        stock_items.category AS category,
        movement_totals.totalQuantity AS currentQuantity
      FROM stock_items
      LEFT JOIN (
        SELECT
          item_id,
          SUM(quantity) AS totalQuantity
        FROM daily_stock_entries
        WHERE date = ?
          AND movement_type = ?
          AND is_deleted = 0
        GROUP BY item_id
      ) AS movement_totals ON movement_totals.item_id = stock_items.id
      WHERE stock_items.is_deleted = 0
      ORDER BY stock_items.name COLLATE NOCASE ASC;
    `,
    date,
    movementType,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    unit: row.unit,
    minQuantity: row.minQuantity,
    currentStockQuantity: row.currentStockQuantity,
    category: normalizeCategory(row.category),
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
          current_stock_quantity,
          category,
          created_at,
          updated_at
        FROM stock_items
        WHERE LOWER(TRIM(name)) = ?
          AND is_deleted = 0
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
          current_stock_quantity,
          category,
          created_at,
          updated_at
        FROM stock_items
        WHERE LOWER(TRIM(name)) = ?
          AND is_deleted = 0
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
    currentStockQuantity: row.current_stock_quantity ?? null,
    category: normalizeCategory(row.category),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createStockItem(input: CreateStockItemInput): Promise<void> {
  const database = await getDatabase();
  const name = input.name.trim();
  const unit = normalizeCatalogName(input.unit);
  const category = normalizeCatalogName(input.category);
  const timestamp = nowIsoString();
  const remoteId = createRemoteItemId();

  if (unit.length === 0) {
    throw new Error('Informe a unidade de medida.');
  }

  if (category.length === 0) {
    throw new Error('Selecione uma categoria.');
  }

  await database.runAsync(
    `
      INSERT INTO stock_items (
        remote_id,
        sync_status,
        name,
        unit,
        min_quantity,
        category,
        created_at,
        updated_at
      )
      VALUES (?, 'pending', ?, ?, ?, ?, ?, ?);
    `,
    remoteId,
    name,
    unit,
    input.minQuantity,
    category,
    timestamp,
    timestamp,
  );

  syncAppDataInBackground();
}

export async function updateStockItem(itemId: number, input: UpdateStockItemInput): Promise<void> {
  const database = await getDatabase();
  const name = input.name.trim();
  const unit = normalizeCatalogName(input.unit);
  const category = normalizeCatalogName(input.category);
  const timestamp = nowIsoString();

  if (unit.length === 0) {
    throw new Error('Informe a unidade de medida.');
  }

  if (category.length === 0) {
    throw new Error('Selecione uma categoria.');
  }

  const result = await database.runAsync(
    `
      UPDATE stock_items
      SET
        name = ?,
        unit = ?,
        min_quantity = ?,
        category = ?,
        updated_at = ?,
        sync_status = 'pending'
      WHERE id = ?
        AND is_deleted = 0;
    `,
    name,
    unit,
    input.minQuantity,
    category,
    timestamp,
    itemId,
  );

  if ((result.changes ?? 0) === 0) {
    throw new Error('Item nao encontrado para edicao.');
  }

  syncAppDataInBackground();
}

export async function archiveStockItem(itemId: number): Promise<void> {
  const database = await getDatabase();
  const timestamp = nowIsoString();
  const localItem = await database.getFirstAsync<StockItemRow>(
    `
      SELECT
        id,
        is_deleted,
        deleted_at,
        sync_status,
        updated_at
      FROM stock_items
      WHERE id = ?
      LIMIT 1;
    `,
    itemId,
  );

  if (!localItem || localItem.is_deleted === 1) {
    throw new Error('Item nao encontrado para exclusao.');
  }

  await database.runAsync(
    `
      UPDATE stock_items
      SET
        is_deleted = 1,
        deleted_at = ?,
        updated_at = ?,
        sync_status = 'pending'
      WHERE id = ?
        AND is_deleted = 0;
    `,
    timestamp,
    timestamp,
    itemId,
  );

  if (!isRemoteSyncConfigured()) {
    return;
  }

  await syncAppData();
}

async function saveStockMovements(
  updates: DailyCountUpdateInput[],
  movementType: 'entry' | 'exit',
  date: string = getTodayLocalDateString(),
): Promise<void> {
  if (!isValidDateString(date)) {
    throw new Error('Data de movimentacao invalida.');
  }

  if (updates.length === 0) {
    return;
  }

  const database = await getDatabase();
  const sessionAuthor = await getCurrentSessionAuthor(database);
  const uniqueItemIds = Array.from(new Set(updates.map((update) => update.itemId)));
  const itemIdPlaceholders = uniqueItemIds.map(() => '?').join(', ');
  const itemRows = await database.getAllAsync<StockItemRemoteRow>(
    `
      SELECT id, name, remote_id, current_stock_quantity
      FROM stock_items
      WHERE id IN (${itemIdPlaceholders})
        AND is_deleted = 0;
    `,
    ...uniqueItemIds,
  );
  const itemById = new Map<number, StockItemRemoteRow>(itemRows.map((row) => [row.id, row]));

  await database.withTransactionAsync(async () => {
    for (const update of updates) {
      if (!Number.isFinite(update.quantity) || update.quantity < 0) {
        throw new Error('Quantidade invalida para vistoria diaria.');
      }

      const item = itemById.get(update.itemId);

      if (!item) {
        throw new Error('Item nao encontrado para sincronizacao da vistoria.');
      }

      if (!item.remote_id) {
        throw new Error('Item nao encontrado para sincronizacao da vistoria.');
      }

      if (movementType === 'exit') {
        const currentStock = item.current_stock_quantity;

        if (currentStock === null) {
          throw new Error(
            `Nao e possivel registrar saida de ${item.name}: item sem estoque inicial.`,
          );
        }

        if (isGreaterThan(update.quantity, currentStock)) {
          throw createInsufficientStockError('generic', item.name, date);
        }
      }

      const entryRemoteId = createMovementRemoteId(item.remote_id, date, movementType);
      const timestamp = nowIsoString();

      await database.runAsync(
        `
          INSERT INTO daily_stock_entries (
            item_id,
            remote_id,
            sync_status,
            date,
            quantity,
            movement_type,
            stock_after_quantity,
            created_by_user_remote_id,
            created_by_username,
            is_deleted,
            deleted_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, 'pending', ?, ?, ?, NULL, ?, ?, 0, NULL, ?, ?);
        `,
        update.itemId,
        entryRemoteId,
        date,
        update.quantity,
        movementType,
        sessionAuthor?.remote_id ?? null,
        sessionAuthor?.username ?? null,
        timestamp,
        timestamp,
      );
    }

    for (const itemId of uniqueItemIds) {
      await recalculateItemStockTimeline(database, itemId);
    }
  });

  syncAppDataInBackground();
}

export async function saveStockEntries(
  updates: DailyCountUpdateInput[],
  date: string = getTodayLocalDateString(),
): Promise<void> {
  return saveStockMovements(updates, 'entry', date);
}

export async function saveStockExits(
  updates: DailyCountUpdateInput[],
  date: string = getTodayLocalDateString(),
): Promise<void> {
  return saveStockMovements(updates, 'exit', date);
}

export async function updateDailyHistoryEntry(
  entryId: number,
  quantity: number,
): Promise<void> {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Quantidade invalida para editar movimentacao.');
  }

  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const entry = await database.getFirstAsync<{ item_id: number }>(
      `
        SELECT item_id
        FROM daily_stock_entries
        WHERE id = ?
          AND is_deleted = 0
        LIMIT 1;
      `,
      entryId,
    );

    if (!entry) {
      throw new Error('Movimentacao nao encontrada para edicao.');
    }

    const result = await database.runAsync(
      `
        UPDATE daily_stock_entries
        SET
          quantity = ?,
          is_deleted = 0,
          deleted_at = NULL,
          stock_after_quantity = NULL,
          updated_at = ?,
          sync_status = 'pending'
        WHERE id = ?
          AND is_deleted = 0;
      `,
      quantity,
      nowIsoString(),
      entryId,
    );

    if ((result.changes ?? 0) === 0) {
      throw new Error('Movimentacao nao encontrada para edicao.');
    }

    await recalculateItemStockTimeline(database, entry.item_id);
  });

  await syncAfterDailyHistoryMutation();
}

export async function archiveDailyHistoryEntry(entryId: number): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const currentEntry = await database.getFirstAsync<{ item_id: number }>(
      `
        SELECT item_id
        FROM daily_stock_entries
        WHERE id = ?
          AND is_deleted = 0
        LIMIT 1;
      `,
      entryId,
    );

    if (!currentEntry) {
      throw new Error('Movimentacao nao encontrada para exclusao.');
    }

    const timestamp = nowIsoString();
    const result = await database.runAsync(
      `
        UPDATE daily_stock_entries
        SET
          is_deleted = 1,
          deleted_at = ?,
          updated_at = ?,
          sync_status = 'pending'
        WHERE id = ?
          AND is_deleted = 0;
      `,
      timestamp,
      timestamp,
      entryId,
    );

    if ((result.changes ?? 0) === 0) {
      throw new Error('Movimentacao nao encontrada para exclusao.');
    }

    await recalculateItemStockTimeline(database, currentEntry.item_id, 'delete');
  });

  await syncAfterDailyHistoryMutation();
}

export async function archiveDailyHistoryDate(date: string): Promise<void> {
  if (!isValidDateString(date)) {
    throw new Error('Data de vistoria invalida.');
  }

  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const affectedRows = await database.getAllAsync<{ item_id: number }>(
      `
        SELECT item_id
        FROM daily_stock_entries
        WHERE date = ?
          AND is_deleted = 0;
      `,
      date,
    );
    if (affectedRows.length === 0) {
      throw new Error('Vistoria diaria nao encontrada para exclusao.');
    }

    const affectedItemIds = Array.from(new Set(affectedRows.map((row) => row.item_id)));

    const timestamp = nowIsoString();
    const result = await database.runAsync(
      `
        UPDATE daily_stock_entries
        SET
          is_deleted = 1,
          deleted_at = ?,
          updated_at = ?,
          sync_status = 'pending'
        WHERE date = ?
          AND is_deleted = 0;
      `,
      timestamp,
      timestamp,
      date,
    );

    if ((result.changes ?? 0) === 0) {
      throw new Error('Vistoria diaria nao encontrada para exclusao.');
    }

    for (const itemId of affectedItemIds) {
      await recalculateItemStockTimeline(database, itemId, 'delete');
    }
  });

  await syncAfterDailyHistoryMutation();
}

export async function archiveDailyHistoryDateByMovement(
  date: string,
  movementFilter: 'entry' | 'exit',
): Promise<void> {
  if (!isValidDateString(date)) {
    throw new Error('Data de vistoria invalida.');
  }

  const movementTypes =
    movementFilter === 'entry'
      ? ['entry', 'initial', 'legacy_snapshot']
      : ['exit', 'consumption'];
  const movementLabel = movementFilter === 'entry' ? 'Entrada' : 'Saida';
  const placeholders = movementTypes.map(() => '?').join(', ');

  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const affectedRows = await database.getAllAsync<{ item_id: number }>(
      `
        SELECT item_id
        FROM daily_stock_entries
        WHERE date = ?
          AND is_deleted = 0
          AND movement_type IN (${placeholders});
      `,
      date,
      ...movementTypes,
    );

    if (affectedRows.length === 0) {
      throw new Error(`Nenhuma movimentacao de ${movementLabel} encontrada para exclusao neste dia.`);
    }

    const affectedItemIds = Array.from(new Set(affectedRows.map((row) => row.item_id)));

    const timestamp = nowIsoString();
    const result = await database.runAsync(
      `
        UPDATE daily_stock_entries
        SET
          is_deleted = 1,
          deleted_at = ?,
          updated_at = ?,
          sync_status = 'pending'
        WHERE date = ?
          AND is_deleted = 0
          AND movement_type IN (${placeholders});
      `,
      timestamp,
      timestamp,
      date,
      ...movementTypes,
    );

    if ((result.changes ?? 0) === 0) {
      throw new Error(`Nenhuma movimentacao de ${movementLabel} encontrada para exclusao neste dia.`);
    }

    for (const itemId of affectedItemIds) {
      await recalculateItemStockTimeline(database, itemId, 'delete');
    }
  });

  await syncAfterDailyHistoryMutation();
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
        SUM(CASE WHEN daily_stock_entries.stock_after_quantity > stock_items.min_quantity THEN 1 ELSE 0 END) AS okItems,
        SUM(CASE WHEN daily_stock_entries.stock_after_quantity <= stock_items.min_quantity THEN 1 ELSE 0 END) AS needPurchaseItems,
        SUM(
          CASE
            WHEN daily_stock_entries.stock_after_quantity < stock_items.min_quantity
              THEN stock_items.min_quantity - daily_stock_entries.stock_after_quantity
            ELSE 0
          END
        ) AS totalMissingQuantity
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      WHERE daily_stock_entries.is_deleted = 0
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
        daily_stock_entries.id AS id,
        daily_stock_entries.date AS date,
        stock_items.id AS itemId,
        stock_items.name AS name,
        stock_items.unit AS unit,
        daily_stock_entries.quantity AS quantity,
        daily_stock_entries.created_by_username AS createdByUsername,
        daily_stock_entries.movement_type AS movementType,
        daily_stock_entries.stock_after_quantity AS stockAfterQuantity,
        stock_items.min_quantity AS minQuantity,
        stock_items.is_deleted AS itemDeleted,
        CASE
          WHEN daily_stock_entries.stock_after_quantity < stock_items.min_quantity
            THEN stock_items.min_quantity - daily_stock_entries.stock_after_quantity
          ELSE 0
        END AS missingQuantity
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      WHERE daily_stock_entries.is_deleted = 0
      ORDER BY daily_stock_entries.date DESC, stock_items.name COLLATE NOCASE ASC;
    `,
  );

  const entriesByDate = new Map<string, DailyHistoryEntry[]>();

  for (const detail of detailRows) {
    const dateEntries = entriesByDate.get(detail.date) ?? [];
    dateEntries.push({
      id: detail.id,
      date: detail.date,
      itemId: detail.itemId,
      name: detail.name,
      unit: detail.unit,
      quantity: detail.quantity,
      createdByUsername: detail.createdByUsername,
      minQuantity: detail.minQuantity,
      movementType: normalizeMovementType(detail.movementType, 'exit'),
      stockAfterQuantity: detail.stockAfterQuantity,
      needsPurchase: detail.stockAfterQuantity !== null ? detail.stockAfterQuantity <= detail.minQuantity : false,
      missingQuantity: detail.missingQuantity,
      itemDeleted: detail.itemDeleted === 1,
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

export async function listHistoryEntriesByDateRange(
  startDate: string,
  endDate: string,
): Promise<HistoryReportEntry[]> {
  if (!isValidDateString(startDate) || !isValidDateString(endDate) || startDate > endDate) {
    throw new Error('Periodo invalido para gerar relatorio.');
  }

  const database = await getDatabase();
  const rows = await database.getAllAsync<HistoryReportEntryRow>(
    `
      SELECT
        daily_stock_entries.id AS id,
        daily_stock_entries.date AS date,
        stock_items.id AS itemId,
        stock_items.name AS name,
        stock_items.unit AS unit,
        daily_stock_entries.quantity AS quantity,
        daily_stock_entries.movement_type AS movementType
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      WHERE daily_stock_entries.is_deleted = 0
        AND daily_stock_entries.date BETWEEN ? AND ?
      ORDER BY daily_stock_entries.date DESC, daily_stock_entries.created_at ASC, daily_stock_entries.id ASC;
    `,
    startDate,
    endDate,
  );

  return rows.map((row) => {
    const normalizedMovementType = normalizeMovementType(row.movementType, 'exit');

    return {
      id: row.id,
      date: row.date,
      itemId: row.itemId,
      name: row.name,
      unit: row.unit,
      quantity: row.quantity,
      movementType: toReportMovementType(normalizedMovementType),
    };
  });
}

async function loadPeriodEntries(
  startDate: string,
  endDate: string,
): Promise<{
  countedEntries: number;
  inspectedDays: number;
  itemsToBuyCount: number;
  days: PeriodHistoryDay[];
  totalMissingQuantity: number;
  totalConsumedQuantity: number;
}> {
  const database = await getDatabase();

  const summaryRow = await database.getFirstAsync<PeriodHistorySummaryRow>(
    `
      SELECT
        COUNT(*) AS countedEntries,
        COUNT(DISTINCT daily_stock_entries.date) AS inspectedDays,
        SUM(
          CASE
            WHEN daily_stock_entries.movement_type IN ('exit', 'consumption')
              THEN daily_stock_entries.quantity
            ELSE 0
          END
        ) AS totalConsumedQuantity,
        SUM(
          CASE
            WHEN daily_stock_entries.stock_after_quantity < stock_items.min_quantity
              THEN stock_items.min_quantity - daily_stock_entries.stock_after_quantity
            ELSE 0
          END
        ) AS totalMissingQuantity
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      WHERE daily_stock_entries.date BETWEEN ? AND ?
        AND daily_stock_entries.is_deleted = 0;
    `,
    startDate,
    endDate,
  );

  const detailRows = await database.getAllAsync<PeriodHistoryDayDetailRow>(
    `
      SELECT
        daily_stock_entries.id AS id,
        daily_stock_entries.date AS date,
        stock_items.id AS itemId,
        stock_items.name AS name,
        stock_items.unit AS unit,
        daily_stock_entries.quantity AS quantity,
        daily_stock_entries.created_by_username AS createdByUsername,
        stock_items.min_quantity AS minQuantity,
        daily_stock_entries.movement_type AS movementType,
        daily_stock_entries.stock_after_quantity AS stockAfterQuantity,
        stock_items.is_deleted AS itemDeleted,
        CASE
          WHEN daily_stock_entries.stock_after_quantity < stock_items.min_quantity
            THEN stock_items.min_quantity - daily_stock_entries.stock_after_quantity
          ELSE 0
        END AS missingQuantity
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      WHERE daily_stock_entries.date BETWEEN ? AND ?
        AND daily_stock_entries.is_deleted = 0
      ORDER BY daily_stock_entries.date DESC, daily_stock_entries.created_at ASC, daily_stock_entries.id ASC;
    `,
    startDate,
    endDate,
  );

  const daysByDate = new Map<string, PeriodHistoryDay>();
  const itemsToBuyIds = new Set<number>();

  for (const detailRow of detailRows) {
    const movementType = normalizeMovementType(detailRow.movementType, 'exit');
    const needsPurchase =
      detailRow.stockAfterQuantity !== null ? detailRow.stockAfterQuantity <= detailRow.minQuantity : false;

    if (needsPurchase) {
      itemsToBuyIds.add(detailRow.itemId);
    }

    const dayEntries = daysByDate.get(detailRow.date) ?? {
      date: detailRow.date,
      hasEntry: false,
      hasExit: false,
      entries: [],
    };

    if (isEntryLikeMovementType(movementType)) {
      dayEntries.hasEntry = true;
    }

    if (isExitLikeMovementType(movementType)) {
      dayEntries.hasExit = true;
    }

    const nextEntry: PeriodHistoryDayEntry = {
      id: detailRow.id,
      date: detailRow.date,
      itemId: detailRow.itemId,
      name: detailRow.name,
      unit: detailRow.unit,
      quantity: detailRow.quantity,
      createdByUsername: detailRow.createdByUsername,
      minQuantity: detailRow.minQuantity,
      movementType,
      stockAfterQuantity: detailRow.stockAfterQuantity,
      needsPurchase,
      missingQuantity: detailRow.missingQuantity,
      itemDeleted: detailRow.itemDeleted === 1,
    };

    dayEntries.entries.push(nextEntry);
    daysByDate.set(detailRow.date, dayEntries);
  }

  const days = Array.from(daysByDate.values()).sort((left, right) =>
    right.date.localeCompare(left.date),
  );

  return {
    countedEntries: summaryRow?.countedEntries ?? 0,
    inspectedDays: summaryRow?.inspectedDays ?? 0,
    itemsToBuyCount: itemsToBuyIds.size,
    totalConsumedQuantity: summaryRow?.totalConsumedQuantity ?? 0,
    totalMissingQuantity: summaryRow?.totalMissingQuantity ?? 0,
    days,
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
      itemsToBuyCount: firstHalfData.itemsToBuyCount,
      totalConsumedQuantity: firstHalfData.totalConsumedQuantity,
      totalMissingQuantity: firstHalfData.totalMissingQuantity,
      days: firstHalfData.days,
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
      itemsToBuyCount: secondHalfData.itemsToBuyCount,
      totalConsumedQuantity: secondHalfData.totalConsumedQuantity,
      totalMissingQuantity: secondHalfData.totalMissingQuantity,
      days: secondHalfData.days,
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
      itemsToBuyCount: monthlyData.itemsToBuyCount,
      totalConsumedQuantity: monthlyData.totalConsumedQuantity,
      totalMissingQuantity: monthlyData.totalMissingQuantity,
      days: monthlyData.days,
    },
  ];
}

export async function getDashboardAnalytics(month: string): Promise<DashboardAnalyticsData> {
  if (!isValidMonthString(month)) {
    throw new Error('Mes invalido para dashboard.');
  }

  const monthRange = getMonthDateRange(month);

  if (!monthRange) {
    throw new Error('Mes invalido para dashboard.');
  }

  const { startDate, endDate } = monthRange;
  const database = await getDatabase();

  const summaryRow = await database.getFirstAsync<DashboardSummaryRow>(
    `
      SELECT
        SUM(
          CASE
            WHEN movement_type IN ('entry', 'initial', 'legacy_snapshot')
              THEN quantity
            ELSE 0
          END
        ) AS totalEntryQuantity,
        SUM(
          CASE
            WHEN movement_type IN ('exit', 'consumption')
              THEN quantity
            ELSE 0
          END
        ) AS totalExitQuantity,
        COUNT(*) AS movementEntries
      FROM daily_stock_entries
      WHERE is_deleted = 0
        AND date BETWEEN ? AND ?;
    `,
    startDate,
    endDate,
  );

  const itemRows = await database.getAllAsync<DashboardItemTotalsRow>(
    `
      SELECT
        stock_items.id AS itemId,
        stock_items.name AS name,
        stock_items.unit AS unit,
        stock_items.category AS category,
        SUM(
          CASE
            WHEN daily_stock_entries.movement_type IN ('entry', 'initial', 'legacy_snapshot')
              THEN daily_stock_entries.quantity
            ELSE 0
          END
        ) AS entryQuantity,
        SUM(
          CASE
            WHEN daily_stock_entries.movement_type IN ('exit', 'consumption')
              THEN daily_stock_entries.quantity
            ELSE 0
          END
        ) AS exitQuantity
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      WHERE daily_stock_entries.is_deleted = 0
        AND daily_stock_entries.date BETWEEN ? AND ?
      GROUP BY stock_items.id, stock_items.name, stock_items.unit, stock_items.category
      ORDER BY
        (
          SUM(
            CASE
              WHEN daily_stock_entries.movement_type IN ('entry', 'initial', 'legacy_snapshot')
                THEN daily_stock_entries.quantity
              ELSE 0
            END
          ) +
          SUM(
            CASE
              WHEN daily_stock_entries.movement_type IN ('exit', 'consumption')
                THEN daily_stock_entries.quantity
              ELSE 0
            END
          )
        ) DESC,
        stock_items.name COLLATE NOCASE ASC;
    `,
    startDate,
    endDate,
  );

  const dailyRows = await database.getAllAsync<DashboardDailySeriesRow>(
    `
      SELECT
        date AS date,
        SUM(
          CASE
            WHEN movement_type IN ('entry', 'initial', 'legacy_snapshot')
              THEN quantity
            ELSE 0
          END
        ) AS entryQuantity,
        SUM(
          CASE
            WHEN movement_type IN ('exit', 'consumption')
              THEN quantity
            ELSE 0
          END
        ) AS exitQuantity
      FROM daily_stock_entries
      WHERE is_deleted = 0
        AND date BETWEEN ? AND ?
      GROUP BY date
      ORDER BY date ASC;
    `,
    startDate,
    endDate,
  );

  const items: DashboardItemAnalyticsRow[] = itemRows
    .map((row) => {
      const entryQuantity = roundQuantity(toSafeNumber(row.entryQuantity));
      const exitQuantity = roundQuantity(toSafeNumber(row.exitQuantity));
      const movementTotal = roundQuantity(entryQuantity + exitQuantity);

      return {
        itemId: row.itemId,
        name: row.name,
        unit: row.unit,
        category: normalizeCategory(row.category),
        entryQuantity,
        exitQuantity,
        movementTotal,
      };
    })
    .filter((item) => item.movementTotal > 0)
    .sort(
      (left, right) =>
        right.movementTotal - left.movementTotal ||
        left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
    );

  const dailyByDate = new Map<string, { entryQuantity: number; exitQuantity: number }>();

  for (const row of dailyRows) {
    const entryQuantity = roundQuantity(toSafeNumber(row.entryQuantity));
    const exitQuantity = roundQuantity(toSafeNumber(row.exitQuantity));
    dailyByDate.set(row.date, { entryQuantity, exitQuantity });
  }

  const dailySeries: DashboardDailySeriesPoint[] = buildDateRangeList(startDate, endDate).map((date) => {
    const dailyPoint = dailyByDate.get(date);
    const entryQuantity = dailyPoint?.entryQuantity ?? 0;
    const exitQuantity = dailyPoint?.exitQuantity ?? 0;
    const movementTotal = roundQuantity(entryQuantity + exitQuantity);
    const [, , day] = date.split('-');

    return {
      date,
      dayLabel: day,
      entryQuantity,
      exitQuantity,
      movementTotal,
    };
  });

  const totalEntryQuantity = roundQuantity(toSafeNumber(summaryRow?.totalEntryQuantity));
  const totalExitQuantity = roundQuantity(toSafeNumber(summaryRow?.totalExitQuantity));
  const movementEntries = Math.max(0, Math.trunc(toSafeNumber(summaryRow?.movementEntries)));

  return {
    month,
    startDate,
    endDate,
    totals: {
      entryQuantity: totalEntryQuantity,
      exitQuantity: totalExitQuantity,
      movementTotal: roundQuantity(totalEntryQuantity + totalExitQuantity),
      activeItems: items.length,
      movementEntries,
    },
    items,
    dailySeries,
  };
}
