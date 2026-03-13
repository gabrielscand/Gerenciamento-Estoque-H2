import { getDatabase } from './index';
import { isRemoteSyncConfigured, syncAppData, syncAppDataInBackground } from './sync.service';
import { isStockCategory } from '../constants/categories';
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

type DailyInspectionItemQuery = {
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
  date: string;
  itemId: number;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  movementType: 'initial' | 'consumption' | 'legacy_snapshot';
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

type PeriodHistoryDetailRow = {
  itemId: number;
  name: string;
  unit: string;
  countedDays: number;
  totalMissingQuantity: number;
  consumedQuantityTotal: number;
};

type StockItemRemoteRow = {
  id: number;
  name: string;
  remote_id: string;
  current_stock_quantity: number | null;
};

type DailyTimelineRow = {
  id: number;
  date: string;
  quantity: number;
  movement_type: string | null;
  stock_after_quantity: number | null;
};

function normalizeItemName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function nowIsoString(): string {
  return new Date().toISOString();
}

function normalizeCategory(category: string | null | undefined): StockItem['category'] {
  if (!category) {
    return null;
  }

  const normalized = category.trim().toLowerCase();
  return isStockCategory(normalized) ? normalized : null;
}

function createRemoteItemId(): string {
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDailyEntryRemoteId(itemRemoteId: string, date: string): string {
  return `${itemRemoteId}:${date}`;
}

function isMovementType(
  value: string | null | undefined,
): value is DailyHistoryEntry['movementType'] {
  return value === 'initial' || value === 'consumption' || value === 'legacy_snapshot';
}

function normalizeMovementType(
  value: string | null | undefined,
  fallback: DailyHistoryEntry['movementType'] = 'consumption',
): DailyHistoryEntry['movementType'] {
  return isMovementType(value) ? value : fallback;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isGreaterThan(a: number, b: number): boolean {
  return a - b > 0.000001;
}

const DELETE_BASE_BLOCKED_ERROR =
  'Nao e possivel excluir: este dia e base inicial de lancamentos posteriores.';
const DELETE_CHAIN_BLOCKED_ERROR =
  'Nao e possivel excluir: consumo posterior ficaria sem saldo base.';

type RecalculateReason = 'generic' | 'delete';

function createMissingBaseError(reason: RecalculateReason): Error {
  if (reason === 'delete') {
    return new Error(DELETE_CHAIN_BLOCKED_ERROR);
  }

  return new Error('Consumo sem saldo base para calculo.');
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
    `Consumo de ${itemName} em ${formatDateLabel(date)} maior que o saldo disponivel.`,
  );
}

async function assertAnchorDeletionAllowed(
  database: Awaited<ReturnType<typeof getDatabase>>,
  itemId: number,
  date: string,
  movementType: string | null | undefined,
): Promise<void> {
  const normalizedType = normalizeMovementType(movementType);
  if (normalizedType !== 'initial' && normalizedType !== 'legacy_snapshot') {
    return;
  }

  const hasLaterRows = await database.getFirstAsync<{ id: number }>(
    `
      SELECT id
      FROM daily_stock_entries
      WHERE item_id = ?
        AND date > ?
        AND is_deleted = 0
      LIMIT 1;
    `,
    itemId,
    date,
  );

  if (hasLaterRows) {
    throw new Error(DELETE_BASE_BLOCKED_ERROR);
  }
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
      ORDER BY date ASC, updated_at ASC, id ASC;
    `,
    itemId,
  );

  let running: number | null = null;

  for (const entry of timeline) {
    const currentType = normalizeMovementType(entry.movement_type);
    const nextType: DailyHistoryEntry['movementType'] = currentType;
    let nextStockAfter: number;

    if (currentType === 'legacy_snapshot' || currentType === 'initial') {
      nextStockAfter = roundQuantity(entry.quantity);
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
        stock_items.current_stock_quantity AS currentStockQuantity,
        stock_items.category AS category,
        daily_stock_entries.quantity AS currentQuantity
      FROM stock_items
      LEFT JOIN daily_stock_entries
        ON daily_stock_entries.item_id = stock_items.id
        AND daily_stock_entries.date = ?
        AND daily_stock_entries.is_deleted = 0
      WHERE stock_items.is_deleted = 0
      ORDER BY stock_items.name COLLATE NOCASE ASC;
    `,
    date,
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
  const unit = input.unit.trim();
  const timestamp = nowIsoString();
  const remoteId = createRemoteItemId();

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
    input.category,
    timestamp,
    timestamp,
  );

  syncAppDataInBackground();
}

export async function updateStockItem(itemId: number, input: UpdateStockItemInput): Promise<void> {
  const database = await getDatabase();
  const name = input.name.trim();
  const unit = input.unit.trim();
  const timestamp = nowIsoString();

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
    input.category,
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

  const syncOk = await syncAppData();

  if (syncOk) {
    return;
  }

  await database.runAsync(
    `
      UPDATE stock_items
      SET
        is_deleted = ?,
        deleted_at = ?,
        sync_status = ?,
        updated_at = ?
      WHERE id = ?;
    `,
    localItem.is_deleted ?? 0,
    localItem.deleted_at ?? null,
    localItem.sync_status ?? 'pending',
    localItem.updated_at,
    itemId,
  );

  throw new Error('Nao foi possivel sincronizar a exclusao do item. Tente novamente.');
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

      const priorEntry = await database.getFirstAsync<{ id: number }>(
        `
          SELECT id
          FROM daily_stock_entries
          WHERE item_id = ?
            AND date < ?
            AND is_deleted = 0
          ORDER BY date DESC, updated_at DESC, id DESC
          LIMIT 1;
        `,
        update.itemId,
        date,
      );
      const movementType: DailyHistoryEntry['movementType'] = priorEntry ? 'consumption' : 'initial';
      const entryRemoteId = buildDailyEntryRemoteId(item.remote_id, date);
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
            is_deleted,
            deleted_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, 'pending', ?, ?, ?, NULL, 0, NULL, ?, ?)
          ON CONFLICT(item_id, date)
          DO UPDATE SET
            remote_id = excluded.remote_id,
            quantity = excluded.quantity,
            movement_type = excluded.movement_type,
            stock_after_quantity = NULL,
            is_deleted = 0,
            deleted_at = NULL,
            updated_at = excluded.updated_at,
            sync_status = 'pending';
        `,
        update.itemId,
        entryRemoteId,
        date,
        update.quantity,
        movementType,
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

export async function updateDailyHistoryEntry(
  date: string,
  itemId: number,
  quantity: number,
): Promise<void> {
  if (!isValidDateString(date)) {
    throw new Error('Data de vistoria invalida.');
  }

  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Quantidade invalida para edicao.');
  }

  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
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
        WHERE date = ?
          AND item_id = ?
          AND is_deleted = 0;
      `,
      quantity,
      nowIsoString(),
      date,
      itemId,
    );

    if ((result.changes ?? 0) === 0) {
      throw new Error('Entrada diaria nao encontrada para edicao.');
    }

    await recalculateItemStockTimeline(database, itemId);
  });

  await syncAfterDailyHistoryMutation();
}

export async function archiveDailyHistoryEntry(date: string, itemId: number): Promise<void> {
  if (!isValidDateString(date)) {
    throw new Error('Data de vistoria invalida.');
  }

  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const currentEntry = await database.getFirstAsync<{ movement_type: string | null }>(
      `
        SELECT movement_type
        FROM daily_stock_entries
        WHERE date = ?
          AND item_id = ?
          AND is_deleted = 0
        LIMIT 1;
      `,
      date,
      itemId,
    );

    if (!currentEntry) {
      throw new Error('Entrada diaria nao encontrada para exclusao.');
    }

    await assertAnchorDeletionAllowed(database, itemId, date, currentEntry.movement_type);

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
          AND item_id = ?
          AND is_deleted = 0;
      `,
      timestamp,
      timestamp,
      date,
      itemId,
    );

    if ((result.changes ?? 0) === 0) {
      throw new Error('Entrada diaria nao encontrada para exclusao.');
    }

    await recalculateItemStockTimeline(database, itemId, 'delete');
  });

  await syncAfterDailyHistoryMutation();
}

export async function archiveDailyHistoryDate(date: string): Promise<void> {
  if (!isValidDateString(date)) {
    throw new Error('Data de vistoria invalida.');
  }

  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const affectedRows = await database.getAllAsync<{ item_id: number; movement_type: string | null }>(
      `
        SELECT item_id, movement_type
        FROM daily_stock_entries
        WHERE date = ?
          AND is_deleted = 0;
      `,
      date,
    );
    if (affectedRows.length === 0) {
      throw new Error('Vistoria diaria nao encontrada para exclusao.');
    }

    for (const row of affectedRows) {
      await assertAnchorDeletionAllowed(database, row.item_id, date, row.movement_type);
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
        daily_stock_entries.date AS date,
        stock_items.id AS itemId,
        stock_items.name AS name,
        stock_items.unit AS unit,
        daily_stock_entries.quantity AS quantity,
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
      date: detail.date,
      itemId: detail.itemId,
      name: detail.name,
      unit: detail.unit,
      quantity: detail.quantity,
      minQuantity: detail.minQuantity,
      movementType: normalizeMovementType(detail.movementType, 'legacy_snapshot'),
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

async function loadPeriodEntries(
  startDate: string,
  endDate: string,
): Promise<{
  countedEntries: number;
  inspectedDays: number;
  entries: PeriodHistoryEntry[];
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
            WHEN daily_stock_entries.movement_type = 'consumption'
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

  const detailRows = await database.getAllAsync<PeriodHistoryDetailRow>(
    `
      SELECT
        stock_items.id AS itemId,
        stock_items.name AS name,
        stock_items.unit AS unit,
        COUNT(DISTINCT daily_stock_entries.date) AS countedDays,
        SUM(
          CASE
            WHEN daily_stock_entries.movement_type = 'consumption'
              THEN daily_stock_entries.quantity
            ELSE 0
          END
        ) AS consumedQuantityTotal,
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
        AND daily_stock_entries.is_deleted = 0
      GROUP BY stock_items.id, stock_items.name, stock_items.unit
      HAVING SUM(
        CASE
          WHEN daily_stock_entries.stock_after_quantity < stock_items.min_quantity
            THEN stock_items.min_quantity - daily_stock_entries.stock_after_quantity
          ELSE 0
        END
      ) > 0
      OR SUM(
        CASE
          WHEN daily_stock_entries.movement_type = 'consumption'
            THEN daily_stock_entries.quantity
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
    totalConsumedQuantity: summaryRow?.totalConsumedQuantity ?? 0,
    totalMissingQuantity: summaryRow?.totalMissingQuantity ?? 0,
    entries: detailRows.map((row) => ({
      itemId: row.itemId,
      name: row.name,
      unit: row.unit,
      countedDays: row.countedDays,
      consumedQuantityTotal: row.consumedQuantityTotal ?? 0,
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
      itemsToBuyCount: firstHalfData.entries.filter((entry) => entry.totalMissingQuantity > 0).length,
      totalConsumedQuantity: firstHalfData.totalConsumedQuantity,
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
      itemsToBuyCount: secondHalfData.entries.filter((entry) => entry.totalMissingQuantity > 0).length,
      totalConsumedQuantity: secondHalfData.totalConsumedQuantity,
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
      itemsToBuyCount: monthlyData.entries.filter((entry) => entry.totalMissingQuantity > 0).length,
      totalConsumedQuantity: monthlyData.totalConsumedQuantity,
      totalMissingQuantity: monthlyData.totalMissingQuantity,
      entries: monthlyData.entries,
    },
  ];
}
