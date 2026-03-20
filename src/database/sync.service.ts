import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from './index';
import { emitCatalogOptionsChanged } from './catalog.events';

type LocalPendingStockItemRow = {
  remote_id: string;
  name: string;
  unit: string;
  min_quantity: number;
  current_stock_quantity: number | null;
  category: string | null;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type LocalPendingDailyEntryRow = {
  remote_id: string;
  remote_item_id: string;
  date: string;
  quantity: number;
  movement_type: string | null;
  stock_after_quantity: number | null;
  created_by_user_remote_id: string | null;
  created_by_username: string | null;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type LocalPendingAppUserRow = {
  remote_id: string;
  username: string;
  username_normalized: string;
  function_name: string | null;
  password_hash: string;
  password_salt: string;
  is_admin: number;
  can_access_dashboard: number;
  can_access_stock: number;
  can_access_items: number;
  can_access_entry: number;
  can_access_exit: number;
  can_access_history: number;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type LocalPendingItemCategoryRow = {
  local_id: number;
  remote_id: string;
  name: string;
  name_normalized: string;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type LocalPendingMeasurementUnitRow = {
  local_id: number;
  remote_id: string;
  name: string;
  name_normalized: string;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type LocalSyncLookupRow = {
  id: number;
  updated_at: string;
  sync_status: string;
};

type RemoteStockItem = {
  id: string;
  name: string;
  unit: string;
  min_quantity: number;
  current_stock_quantity: number | null;
  category: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type RemoteDailyEntry = {
  id: string;
  item_id: string;
  date: string;
  quantity: number;
  movement_type: string | null;
  stock_after_quantity: number | null;
  created_by_user_remote_id: string | null;
  created_by_username: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type RemoteAppUser = {
  id: string;
  username: string;
  username_normalized: string;
  function_name: string | null;
  password_hash: string;
  password_salt: string;
  is_admin: boolean;
  can_access_dashboard: boolean;
  can_access_stock: boolean;
  can_access_items: boolean;
  can_access_entry: boolean;
  can_access_exit: boolean;
  can_access_history: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type RemoteItemCategory = {
  id: string;
  name: string;
  name_normalized: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type RemoteMeasurementUnit = {
  id: string;
  name: string;
  name_normalized: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type SyncMetaRow = {
  key: string;
  value: string;
};

export type SyncStateSnapshot = {
  configured: boolean;
  isSyncing: boolean;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncError: string | null;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
const SUPABASE_REST_URL = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1` : '';

let activeSync: Promise<boolean> | null = null;
let syncState: SyncStateSnapshot = {
  configured: Boolean(SUPABASE_REST_URL && SUPABASE_PUBLISHABLE_KEY),
  isSyncing: false,
  lastSyncStartedAt: null,
  lastSyncCompletedAt: null,
  lastSyncError: null,
};
const syncListeners = new Set<() => void>();

function nowIsoString(): string {
  return new Date().toISOString();
}

function emitSyncState(): void {
  for (const listener of syncListeners) {
    listener();
  }
}

function updateSyncState(nextState: Partial<SyncStateSnapshot>): void {
  syncState = {
    ...syncState,
    ...nextState,
    configured: Boolean(SUPABASE_REST_URL && SUPABASE_PUBLISHABLE_KEY),
  };
  emitSyncState();
}

function normalizeTimestamp(value: string): string {
  if (value.includes('T')) {
    return value;
  }

  return `${value.replace(' ', 'T')}Z`;
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(normalizeTimestamp(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function createHeaders(prefer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json',
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

function buildInClause(values: string[]): string {
  return values.map(() => '?').join(', ');
}

async function setSyncMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `
      INSERT INTO sync_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value;
    `,
    key,
    value,
  );
}

async function fetchRemote<T>(path: string): Promise<T> {
  const response = await fetch(`${SUPABASE_REST_URL}${path}`, {
    method: 'GET',
    headers: createHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar Supabase (${response.status}).`);
  }

  return (await response.json()) as T;
}

async function upsertRemote(path: string, payload: unknown[]): Promise<void> {
  if (payload.length === 0) {
    return;
  }

  const response = await fetch(`${SUPABASE_REST_URL}${path}`, {
    method: 'POST',
    headers: createHeaders('resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao enviar dados ao Supabase (${response.status}): ${body}`);
  }
}

async function markStockItemsAsSynced(db: SQLiteDatabase, remoteIds: string[]): Promise<void> {
  if (remoteIds.length === 0) {
    return;
  }

  const clause = buildInClause(remoteIds);
  await db.runAsync(
    `
      UPDATE stock_items
      SET sync_status = 'synced'
      WHERE remote_id IN (${clause});
    `,
    ...remoteIds,
  );
}

async function markDailyEntriesAsSynced(db: SQLiteDatabase, remoteIds: string[]): Promise<void> {
  if (remoteIds.length === 0) {
    return;
  }

  const clause = buildInClause(remoteIds);
  await db.runAsync(
    `
      UPDATE daily_stock_entries
      SET sync_status = 'synced'
      WHERE remote_id IN (${clause});
    `,
    ...remoteIds,
  );
}

async function markAppUsersAsSynced(db: SQLiteDatabase, remoteIds: string[]): Promise<void> {
  if (remoteIds.length === 0) {
    return;
  }

  const clause = buildInClause(remoteIds);
  await db.runAsync(
    `
      UPDATE app_users
      SET sync_status = 'synced'
      WHERE remote_id IN (${clause});
    `,
    ...remoteIds,
  );
}

async function markItemCategoriesAsSynced(db: SQLiteDatabase, remoteIds: string[]): Promise<void> {
  if (remoteIds.length === 0) {
    return;
  }

  const clause = buildInClause(remoteIds);
  await db.runAsync(
    `
      UPDATE item_categories
      SET sync_status = 'synced'
      WHERE remote_id IN (${clause});
    `,
    ...remoteIds,
  );
}

async function markMeasurementUnitsAsSynced(db: SQLiteDatabase, remoteIds: string[]): Promise<void> {
  if (remoteIds.length === 0) {
    return;
  }

  const clause = buildInClause(remoteIds);
  await db.runAsync(
    `
      UPDATE measurement_units
      SET sync_status = 'synced'
      WHERE remote_id IN (${clause});
    `,
    ...remoteIds,
  );
}

async function pushPendingStockItems(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<LocalPendingStockItemRow>(
    `
      SELECT
        remote_id,
        name,
        unit,
        min_quantity,
        current_stock_quantity,
        category,
        is_deleted,
        deleted_at,
        created_at,
        updated_at
      FROM stock_items
      WHERE sync_status <> 'synced'
      ORDER BY updated_at ASC, id ASC;
    `,
  );

  if (rows.length === 0) {
    return;
  }

  await upsertRemote(
    '/stock_items?on_conflict=id',
    rows.map((row) => ({
      id: row.remote_id,
      name: row.name,
      unit: row.unit,
      min_quantity: row.min_quantity,
      current_stock_quantity: row.current_stock_quantity,
      category: row.category,
      is_deleted: row.is_deleted === 1,
      deleted_at: row.deleted_at ? normalizeTimestamp(row.deleted_at) : null,
      created_at: normalizeTimestamp(row.created_at),
      updated_at: normalizeTimestamp(row.updated_at),
    })),
  );

  await markStockItemsAsSynced(
    db,
    rows.map((row) => row.remote_id),
  );
}

async function pushPendingDailyEntries(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<LocalPendingDailyEntryRow>(
    `
      SELECT
        daily_stock_entries.remote_id AS remote_id,
        stock_items.remote_id AS remote_item_id,
        daily_stock_entries.date AS date,
        daily_stock_entries.quantity AS quantity,
        daily_stock_entries.movement_type AS movement_type,
        daily_stock_entries.stock_after_quantity AS stock_after_quantity,
        daily_stock_entries.created_by_user_remote_id AS created_by_user_remote_id,
        daily_stock_entries.created_by_username AS created_by_username,
        daily_stock_entries.is_deleted AS is_deleted,
        daily_stock_entries.deleted_at AS deleted_at,
        daily_stock_entries.created_at AS created_at,
        daily_stock_entries.updated_at AS updated_at
      FROM daily_stock_entries
      INNER JOIN stock_items ON stock_items.id = daily_stock_entries.item_id
      WHERE daily_stock_entries.sync_status <> 'synced'
      ORDER BY daily_stock_entries.updated_at ASC, daily_stock_entries.id ASC;
    `,
  );

  if (rows.length === 0) {
    return;
  }

  await upsertRemote(
    '/daily_stock_entries?on_conflict=id',
    rows.map((row) => ({
      id: row.remote_id,
      item_id: row.remote_item_id,
      date: row.date,
      quantity: row.quantity,
      movement_type: row.movement_type,
      stock_after_quantity: row.stock_after_quantity,
      created_by_user_remote_id: row.created_by_user_remote_id,
      created_by_username: row.created_by_username,
      is_deleted: row.is_deleted === 1,
      deleted_at: row.deleted_at ? normalizeTimestamp(row.deleted_at) : null,
      created_at: normalizeTimestamp(row.created_at),
      updated_at: normalizeTimestamp(row.updated_at),
    })),
  );

  await markDailyEntriesAsSynced(
    db,
    rows.map((row) => row.remote_id),
  );
}

async function pushPendingAppUsers(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<LocalPendingAppUserRow>(
    `
      SELECT
        remote_id,
        username,
        username_normalized,
        function_name,
        password_hash,
        password_salt,
        is_admin,
        can_access_dashboard,
        can_access_stock,
        can_access_items,
        can_access_entry,
        can_access_exit,
        can_access_history,
        is_deleted,
        deleted_at,
        created_at,
        updated_at
      FROM app_users
      WHERE sync_status <> 'synced'
        AND remote_id IS NOT NULL
        AND TRIM(remote_id) <> ''
      ORDER BY updated_at ASC, id ASC;
    `,
  );

  if (rows.length === 0) {
    return;
  }

  await upsertRemote(
    '/app_users?on_conflict=id',
    rows.map((row) => ({
      id: row.remote_id,
      username: row.username,
      username_normalized: row.username_normalized,
      function_name: row.function_name,
      password_hash: row.password_hash,
      password_salt: row.password_salt,
      is_admin: row.is_admin === 1,
      can_access_dashboard: row.can_access_dashboard === 1,
      can_access_stock: row.can_access_stock === 1,
      can_access_items: row.can_access_items === 1,
      can_access_entry: row.can_access_entry === 1,
      can_access_exit: row.can_access_exit === 1,
      can_access_history: row.can_access_history === 1,
      is_deleted: row.is_deleted === 1,
      deleted_at: row.deleted_at ? normalizeTimestamp(row.deleted_at) : null,
      created_at: normalizeTimestamp(row.created_at),
      updated_at: normalizeTimestamp(row.updated_at),
    })),
  );

  await markAppUsersAsSynced(
    db,
    rows.map((row) => row.remote_id),
  );
}

async function pushPendingItemCategories(db: SQLiteDatabase): Promise<void> {
  let rows = await db.getAllAsync<LocalPendingItemCategoryRow>(
    `
      SELECT
        id AS local_id,
        remote_id,
        name,
        name_normalized,
        is_deleted,
        deleted_at,
        created_at,
        updated_at
      FROM item_categories
      WHERE sync_status <> 'synced'
        AND remote_id IS NOT NULL
        AND TRIM(remote_id) <> ''
      ORDER BY updated_at ASC, id ASC;
    `,
  );

  if (rows.length === 0) {
    return;
  }

  const remoteRows = await fetchRemote<Array<Pick<RemoteItemCategory, 'id' | 'name_normalized' | 'is_deleted'>>>(
    '/item_categories?select=id,name_normalized,is_deleted',
  );
  const activeRemoteByNormalized = new Map<string, string>();

  for (const remoteRow of remoteRows) {
    if (remoteRow.is_deleted) {
      continue;
    }

    activeRemoteByNormalized.set(remoteRow.name_normalized, remoteRow.id);
  }

  let hasReconciled = false;

  for (const row of rows) {
    if (row.is_deleted === 1) {
      continue;
    }

    const existingRemoteId = activeRemoteByNormalized.get(row.name_normalized);

    if (!existingRemoteId || existingRemoteId === row.remote_id) {
      continue;
    }

    const localRowWithSameRemoteId = await db.getFirstAsync<{ id: number }>(
      `
        SELECT id
        FROM item_categories
        WHERE remote_id = ?
        LIMIT 1;
      `,
      existingRemoteId,
    );

    if (localRowWithSameRemoteId && localRowWithSameRemoteId.id !== row.local_id) {
      const timestamp = nowIsoString();
      await db.runAsync(
        `
          UPDATE item_categories
          SET
            is_deleted = 1,
            deleted_at = COALESCE(deleted_at, ?),
            updated_at = ?,
            sync_status = 'synced'
          WHERE id = ?;
        `,
        timestamp,
        timestamp,
        row.local_id,
      );
      hasReconciled = true;
      continue;
    }

    await db.runAsync(
      `
        UPDATE item_categories
        SET
          remote_id = ?,
          sync_status = 'synced'
        WHERE id = ?;
      `,
      existingRemoteId,
      row.local_id,
    );
    hasReconciled = true;
  }

  if (hasReconciled) {
    rows = await db.getAllAsync<LocalPendingItemCategoryRow>(
      `
        SELECT
          id AS local_id,
          remote_id,
          name,
          name_normalized,
          is_deleted,
          deleted_at,
          created_at,
          updated_at
        FROM item_categories
        WHERE sync_status <> 'synced'
          AND remote_id IS NOT NULL
          AND TRIM(remote_id) <> ''
        ORDER BY updated_at ASC, id ASC;
      `,
    );
  }

  if (rows.length === 0) {
    return;
  }

  await upsertRemote(
    '/item_categories?on_conflict=id',
    rows.map((row) => ({
      id: row.remote_id,
      name: row.name,
      name_normalized: row.name_normalized,
      is_deleted: row.is_deleted === 1,
      deleted_at: row.deleted_at ? normalizeTimestamp(row.deleted_at) : null,
      created_at: normalizeTimestamp(row.created_at),
      updated_at: normalizeTimestamp(row.updated_at),
    })),
  );

  await markItemCategoriesAsSynced(
    db,
    rows.map((row) => row.remote_id),
  );
}

async function pushPendingMeasurementUnits(db: SQLiteDatabase): Promise<void> {
  let rows = await db.getAllAsync<LocalPendingMeasurementUnitRow>(
    `
      SELECT
        id AS local_id,
        remote_id,
        name,
        name_normalized,
        is_deleted,
        deleted_at,
        created_at,
        updated_at
      FROM measurement_units
      WHERE sync_status <> 'synced'
        AND remote_id IS NOT NULL
        AND TRIM(remote_id) <> ''
      ORDER BY updated_at ASC, id ASC;
    `,
  );

  if (rows.length === 0) {
    return;
  }

  const remoteRows = await fetchRemote<Array<Pick<RemoteMeasurementUnit, 'id' | 'name_normalized' | 'is_deleted'>>>(
    '/measurement_units?select=id,name_normalized,is_deleted',
  );
  const activeRemoteByNormalized = new Map<string, string>();

  for (const remoteRow of remoteRows) {
    if (remoteRow.is_deleted) {
      continue;
    }

    activeRemoteByNormalized.set(remoteRow.name_normalized, remoteRow.id);
  }

  let hasReconciled = false;

  for (const row of rows) {
    if (row.is_deleted === 1) {
      continue;
    }

    const existingRemoteId = activeRemoteByNormalized.get(row.name_normalized);

    if (!existingRemoteId || existingRemoteId === row.remote_id) {
      continue;
    }

    const localRowWithSameRemoteId = await db.getFirstAsync<{ id: number }>(
      `
        SELECT id
        FROM measurement_units
        WHERE remote_id = ?
        LIMIT 1;
      `,
      existingRemoteId,
    );

    if (localRowWithSameRemoteId && localRowWithSameRemoteId.id !== row.local_id) {
      const timestamp = nowIsoString();
      await db.runAsync(
        `
          UPDATE measurement_units
          SET
            is_deleted = 1,
            deleted_at = COALESCE(deleted_at, ?),
            updated_at = ?,
            sync_status = 'synced'
          WHERE id = ?;
        `,
        timestamp,
        timestamp,
        row.local_id,
      );
      hasReconciled = true;
      continue;
    }

    await db.runAsync(
      `
        UPDATE measurement_units
        SET
          remote_id = ?,
          sync_status = 'synced'
        WHERE id = ?;
      `,
      existingRemoteId,
      row.local_id,
    );
    hasReconciled = true;
  }

  if (hasReconciled) {
    rows = await db.getAllAsync<LocalPendingMeasurementUnitRow>(
      `
        SELECT
          id AS local_id,
          remote_id,
          name,
          name_normalized,
          is_deleted,
          deleted_at,
          created_at,
          updated_at
        FROM measurement_units
        WHERE sync_status <> 'synced'
          AND remote_id IS NOT NULL
          AND TRIM(remote_id) <> ''
        ORDER BY updated_at ASC, id ASC;
      `,
    );
  }

  if (rows.length === 0) {
    return;
  }

  await upsertRemote(
    '/measurement_units?on_conflict=id',
    rows.map((row) => ({
      id: row.remote_id,
      name: row.name,
      name_normalized: row.name_normalized,
      is_deleted: row.is_deleted === 1,
      deleted_at: row.deleted_at ? normalizeTimestamp(row.deleted_at) : null,
      created_at: normalizeTimestamp(row.created_at),
      updated_at: normalizeTimestamp(row.updated_at),
    })),
  );

  await markMeasurementUnitsAsSynced(
    db,
    rows.map((row) => row.remote_id),
  );
}

async function mergeRemoteStockItems(db: SQLiteDatabase, remoteItems: RemoteStockItem[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const remoteItem of remoteItems) {
      const local = await db.getFirstAsync<LocalSyncLookupRow>(
        `
          SELECT id, updated_at, sync_status
          FROM stock_items
          WHERE remote_id = ?
          LIMIT 1;
        `,
        remoteItem.id,
      );

      if (!local) {
        await db.runAsync(
          `
            INSERT INTO stock_items (
              remote_id,
            sync_status,
            name,
            unit,
            min_quantity,
            current_stock_quantity,
            category,
            is_deleted,
            deleted_at,
            created_at,
            updated_at
          )
          VALUES (?, 'synced', ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        remoteItem.id,
        remoteItem.name,
        remoteItem.unit,
        remoteItem.min_quantity,
        remoteItem.current_stock_quantity,
        remoteItem.category,
        remoteItem.is_deleted ? 1 : 0,
        remoteItem.deleted_at,
        remoteItem.created_at,
        remoteItem.updated_at,
      );
        continue;
      }

      const shouldKeepLocal =
        local.sync_status !== 'synced' && toTimestamp(local.updated_at) > toTimestamp(remoteItem.updated_at);

      if (shouldKeepLocal) {
        continue;
      }

      await db.runAsync(
        `
          UPDATE stock_items
          SET
            name = ?,
            unit = ?,
            min_quantity = ?,
            current_stock_quantity = ?,
            category = ?,
            is_deleted = ?,
            deleted_at = ?,
            created_at = ?,
            updated_at = ?,
            sync_status = 'synced'
          WHERE id = ?;
        `,
        remoteItem.name,
        remoteItem.unit,
        remoteItem.min_quantity,
        remoteItem.current_stock_quantity,
        remoteItem.category,
        remoteItem.is_deleted ? 1 : 0,
        remoteItem.deleted_at,
        remoteItem.created_at,
        remoteItem.updated_at,
        local.id,
      );
    }
  });
}

async function mergeRemoteDailyEntries(db: SQLiteDatabase, remoteEntries: RemoteDailyEntry[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const remoteEntry of remoteEntries) {
      const localItem = await db.getFirstAsync<{ id: number }>(
        `
          SELECT id
          FROM stock_items
          WHERE remote_id = ?
          LIMIT 1;
        `,
        remoteEntry.item_id,
      );

      if (!localItem) {
        continue;
      }

      const local = await db.getFirstAsync<LocalSyncLookupRow>(
        `
          SELECT id, updated_at, sync_status
          FROM daily_stock_entries
          WHERE remote_id = ?
          LIMIT 1;
        `,
        remoteEntry.id,
      );

      if (!local) {
        await db.runAsync(
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
            VALUES (?, ?, 'synced', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          localItem.id,
          remoteEntry.id,
          remoteEntry.date,
          remoteEntry.quantity,
          remoteEntry.movement_type,
          remoteEntry.stock_after_quantity,
          remoteEntry.created_by_user_remote_id,
          remoteEntry.created_by_username,
          remoteEntry.is_deleted ? 1 : 0,
          remoteEntry.deleted_at,
          remoteEntry.created_at,
          remoteEntry.updated_at,
        );
        continue;
      }

      const shouldKeepLocal =
        local.sync_status !== 'synced' && toTimestamp(local.updated_at) > toTimestamp(remoteEntry.updated_at);

      if (shouldKeepLocal) {
        continue;
      }

      await db.runAsync(
        `
          UPDATE daily_stock_entries
          SET
            item_id = ?,
            date = ?,
            quantity = ?,
            movement_type = ?,
            stock_after_quantity = ?,
            created_by_user_remote_id = ?,
            created_by_username = ?,
            is_deleted = ?,
            deleted_at = ?,
            created_at = ?,
            updated_at = ?,
            sync_status = 'synced'
          WHERE id = ?;
        `,
        localItem.id,
        remoteEntry.date,
        remoteEntry.quantity,
        remoteEntry.movement_type,
        remoteEntry.stock_after_quantity,
        remoteEntry.created_by_user_remote_id,
        remoteEntry.created_by_username,
        remoteEntry.is_deleted ? 1 : 0,
        remoteEntry.deleted_at,
        remoteEntry.created_at,
        remoteEntry.updated_at,
        local.id,
      );
    }
  });
}

async function mergeRemoteAppUsers(db: SQLiteDatabase, remoteUsers: RemoteAppUser[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const remoteUser of remoteUsers) {
      const local = await db.getFirstAsync<LocalSyncLookupRow>(
        `
          SELECT id, updated_at, sync_status
          FROM app_users
          WHERE remote_id = ?
          LIMIT 1;
        `,
        remoteUser.id,
      );

      if (!local) {
        await db.runAsync(
          `
            INSERT INTO app_users (
              remote_id,
              sync_status,
              username,
              username_normalized,
              function_name,
              password_hash,
              password_salt,
              is_admin,
              can_access_dashboard,
              can_access_stock,
              can_access_items,
              can_access_entry,
              can_access_exit,
              can_access_history,
              is_deleted,
              deleted_at,
              created_at,
              updated_at
            )
            VALUES (?, 'synced', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          remoteUser.id,
          remoteUser.username,
          remoteUser.username_normalized,
          remoteUser.function_name,
          remoteUser.password_hash,
          remoteUser.password_salt,
          remoteUser.is_admin ? 1 : 0,
          remoteUser.can_access_dashboard ? 1 : 0,
          remoteUser.can_access_stock ? 1 : 0,
          remoteUser.can_access_items ? 1 : 0,
          remoteUser.can_access_entry ? 1 : 0,
          remoteUser.can_access_exit ? 1 : 0,
          remoteUser.can_access_history ? 1 : 0,
          remoteUser.is_deleted ? 1 : 0,
          remoteUser.deleted_at,
          remoteUser.created_at,
          remoteUser.updated_at,
        );
        continue;
      }

      const shouldKeepLocal =
        local.sync_status !== 'synced' && toTimestamp(local.updated_at) > toTimestamp(remoteUser.updated_at);

      if (shouldKeepLocal) {
        continue;
      }

      await db.runAsync(
        `
          UPDATE app_users
          SET
            username = ?,
            username_normalized = ?,
            function_name = ?,
            password_hash = ?,
            password_salt = ?,
            is_admin = ?,
            can_access_dashboard = ?,
            can_access_stock = ?,
            can_access_items = ?,
            can_access_entry = ?,
            can_access_exit = ?,
            can_access_history = ?,
            is_deleted = ?,
            deleted_at = ?,
            created_at = ?,
            updated_at = ?,
            sync_status = 'synced'
          WHERE id = ?;
        `,
        remoteUser.username,
        remoteUser.username_normalized,
        remoteUser.function_name,
        remoteUser.password_hash,
        remoteUser.password_salt,
        remoteUser.is_admin ? 1 : 0,
        remoteUser.can_access_dashboard ? 1 : 0,
        remoteUser.can_access_stock ? 1 : 0,
        remoteUser.can_access_items ? 1 : 0,
        remoteUser.can_access_entry ? 1 : 0,
        remoteUser.can_access_exit ? 1 : 0,
        remoteUser.can_access_history ? 1 : 0,
        remoteUser.is_deleted ? 1 : 0,
        remoteUser.deleted_at,
        remoteUser.created_at,
        remoteUser.updated_at,
        local.id,
      );
    }
  });
}

async function mergeRemoteItemCategories(
  db: SQLiteDatabase,
  remoteCategories: RemoteItemCategory[],
): Promise<void> {
  let hasCatalogChanges = false;

  await db.withTransactionAsync(async () => {
    for (const remoteCategory of remoteCategories) {
      const local = await db.getFirstAsync<LocalSyncLookupRow>(
        `
          SELECT id, updated_at, sync_status
          FROM item_categories
          WHERE remote_id = ?
          LIMIT 1;
        `,
        remoteCategory.id,
      );

      if (!local) {
        await db.runAsync(
          `
            INSERT INTO item_categories (
              remote_id,
              sync_status,
              name,
              name_normalized,
              is_deleted,
              deleted_at,
              created_at,
              updated_at
            )
            VALUES (?, 'synced', ?, ?, ?, ?, ?, ?);
          `,
          remoteCategory.id,
          remoteCategory.name,
          remoteCategory.name_normalized,
          remoteCategory.is_deleted ? 1 : 0,
          remoteCategory.deleted_at,
          remoteCategory.created_at,
          remoteCategory.updated_at,
        );
        hasCatalogChanges = true;
        continue;
      }

      const shouldKeepLocal =
        local.sync_status !== 'synced' &&
        toTimestamp(local.updated_at) > toTimestamp(remoteCategory.updated_at);

      if (shouldKeepLocal) {
        continue;
      }

      await db.runAsync(
        `
          UPDATE item_categories
          SET
            name = ?,
            name_normalized = ?,
            is_deleted = ?,
            deleted_at = ?,
            created_at = ?,
            updated_at = ?,
            sync_status = 'synced'
          WHERE id = ?;
        `,
        remoteCategory.name,
        remoteCategory.name_normalized,
        remoteCategory.is_deleted ? 1 : 0,
        remoteCategory.deleted_at,
        remoteCategory.created_at,
        remoteCategory.updated_at,
        local.id,
      );
      hasCatalogChanges = true;
    }
  });

  if (hasCatalogChanges) {
    emitCatalogOptionsChanged();
  }
}

async function mergeRemoteMeasurementUnits(
  db: SQLiteDatabase,
  remoteUnits: RemoteMeasurementUnit[],
): Promise<void> {
  let hasCatalogChanges = false;

  await db.withTransactionAsync(async () => {
    for (const remoteUnit of remoteUnits) {
      const local = await db.getFirstAsync<LocalSyncLookupRow>(
        `
          SELECT id, updated_at, sync_status
          FROM measurement_units
          WHERE remote_id = ?
          LIMIT 1;
        `,
        remoteUnit.id,
      );

      if (!local) {
        await db.runAsync(
          `
            INSERT INTO measurement_units (
              remote_id,
              sync_status,
              name,
              name_normalized,
              is_deleted,
              deleted_at,
              created_at,
              updated_at
            )
            VALUES (?, 'synced', ?, ?, ?, ?, ?, ?);
          `,
          remoteUnit.id,
          remoteUnit.name,
          remoteUnit.name_normalized,
          remoteUnit.is_deleted ? 1 : 0,
          remoteUnit.deleted_at,
          remoteUnit.created_at,
          remoteUnit.updated_at,
        );
        hasCatalogChanges = true;
        continue;
      }

      const shouldKeepLocal =
        local.sync_status !== 'synced' &&
        toTimestamp(local.updated_at) > toTimestamp(remoteUnit.updated_at);

      if (shouldKeepLocal) {
        continue;
      }

      await db.runAsync(
        `
          UPDATE measurement_units
          SET
            name = ?,
            name_normalized = ?,
            is_deleted = ?,
            deleted_at = ?,
            created_at = ?,
            updated_at = ?,
            sync_status = 'synced'
          WHERE id = ?;
        `,
        remoteUnit.name,
        remoteUnit.name_normalized,
        remoteUnit.is_deleted ? 1 : 0,
        remoteUnit.deleted_at,
        remoteUnit.created_at,
        remoteUnit.updated_at,
        local.id,
      );
      hasCatalogChanges = true;
    }
  });

  if (hasCatalogChanges) {
    emitCatalogOptionsChanged();
  }
}

async function performSync(): Promise<boolean> {
  const db = await getDatabase();
  const startedAt = nowIsoString();
  await setSyncMeta(db, 'last_sync_started_at', startedAt);
  updateSyncState({
    configured: true,
    isSyncing: true,
    lastSyncStartedAt: startedAt,
  });

  try {
    await pushPendingAppUsers(db);
    await pushPendingItemCategories(db);
    await pushPendingMeasurementUnits(db);
    await pushPendingStockItems(db);
    await pushPendingDailyEntries(db);

    const remoteUsers = await fetchRemote<RemoteAppUser[]>(
      '/app_users?select=id,username,username_normalized,function_name,password_hash,password_salt,is_admin,can_access_dashboard,can_access_stock,can_access_items,can_access_entry,can_access_exit,can_access_history,is_deleted,deleted_at,created_at,updated_at&order=updated_at.asc',
    );
    await mergeRemoteAppUsers(db, remoteUsers);

    const remoteItems = await fetchRemote<RemoteStockItem[]>(
      '/stock_items?select=id,name,unit,min_quantity,current_stock_quantity,category,is_deleted,deleted_at,created_at,updated_at&order=updated_at.asc',
    );
    await mergeRemoteStockItems(db, remoteItems);

    const remoteCategories = await fetchRemote<RemoteItemCategory[]>(
      '/item_categories?select=id,name,name_normalized,is_deleted,deleted_at,created_at,updated_at&order=updated_at.asc',
    );
    await mergeRemoteItemCategories(db, remoteCategories);

    const remoteUnits = await fetchRemote<RemoteMeasurementUnit[]>(
      '/measurement_units?select=id,name,name_normalized,is_deleted,deleted_at,created_at,updated_at&order=updated_at.asc',
    );
    await mergeRemoteMeasurementUnits(db, remoteUnits);

    const remoteEntries = await fetchRemote<RemoteDailyEntry[]>(
      '/daily_stock_entries?select=id,item_id,date,quantity,movement_type,stock_after_quantity,created_by_user_remote_id,created_by_username,is_deleted,deleted_at,created_at,updated_at&order=updated_at.asc',
    );
    await mergeRemoteDailyEntries(db, remoteEntries);

    const completedAt = nowIsoString();
    await setSyncMeta(db, 'last_sync_error', '');
    await setSyncMeta(db, 'last_sync_completed_at', completedAt);
    updateSyncState({
      configured: true,
      isSyncing: false,
      lastSyncCompletedAt: completedAt,
      lastSyncError: null,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao sincronizar.';
    await setSyncMeta(db, 'last_sync_error', message);
    updateSyncState({
      configured: true,
      isSyncing: false,
      lastSyncError: message,
    });
    throw error;
  }
}

export function isRemoteSyncConfigured(): boolean {
  return Boolean(SUPABASE_REST_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function getSyncStateSnapshot(): SyncStateSnapshot {
  return syncState;
}

export function subscribeToSyncState(listener: () => void): () => void {
  syncListeners.add(listener);

  return () => {
    syncListeners.delete(listener);
  };
}

export async function refreshSyncStateFromDatabase(): Promise<SyncStateSnapshot> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SyncMetaRow>(
    `
      SELECT key, value
      FROM sync_meta
      WHERE key IN ('last_sync_started_at', 'last_sync_completed_at', 'last_sync_error');
    `,
  );
  const meta = new Map(rows.map((row) => [row.key, row.value]));

  syncState = {
    configured: isRemoteSyncConfigured(),
    isSyncing: activeSync !== null,
    lastSyncStartedAt: meta.get('last_sync_started_at') || null,
    lastSyncCompletedAt: meta.get('last_sync_completed_at') || null,
    lastSyncError: meta.get('last_sync_error') || null,
  };
  emitSyncState();

  return syncState;
}

export async function syncAppData(): Promise<boolean> {
  if (!isRemoteSyncConfigured()) {
    updateSyncState({ configured: false, isSyncing: false });
    return false;
  }

  if (!activeSync) {
    activeSync = performSync()
      .catch((error) => {
        console.warn('[Sync] falha ao sincronizar dados', error);
        return false;
      })
      .finally(() => {
        activeSync = null;
      });
  }

  return activeSync;
}

export function syncAppDataInBackground(): void {
  if (!isRemoteSyncConfigured()) {
    return;
  }

  void syncAppData();
}
