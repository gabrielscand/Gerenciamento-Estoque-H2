import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from './index';

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
              is_deleted,
              deleted_at,
              created_at,
              updated_at
            )
            VALUES (?, ?, 'synced', ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          localItem.id,
          remoteEntry.id,
          remoteEntry.date,
          remoteEntry.quantity,
          remoteEntry.movement_type,
          remoteEntry.stock_after_quantity,
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
        remoteEntry.is_deleted ? 1 : 0,
        remoteEntry.deleted_at,
        remoteEntry.created_at,
        remoteEntry.updated_at,
        local.id,
      );
    }
  });
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
    await pushPendingStockItems(db);
    await pushPendingDailyEntries(db);

    const remoteItems = await fetchRemote<RemoteStockItem[]>(
      '/stock_items?select=id,name,unit,min_quantity,current_stock_quantity,category,is_deleted,deleted_at,created_at,updated_at&order=updated_at.asc',
    );
    await mergeRemoteStockItems(db, remoteItems);

    const remoteEntries = await fetchRemote<RemoteDailyEntry[]>(
      '/daily_stock_entries?select=id,item_id,date,quantity,movement_type,stock_after_quantity,is_deleted,deleted_at,created_at,updated_at&order=updated_at.asc',
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
