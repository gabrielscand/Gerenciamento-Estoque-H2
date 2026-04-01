import type { SQLiteDatabase } from 'expo-sqlite';
import { DEFAULT_MEASUREMENT_UNITS, DEFAULT_STOCK_CATEGORIES, normalizeCatalogName } from '../constants/categories';
import { getDefaultConversionFactorForUnit } from '../utils/unit-conversion';

const SCHEMA_VERSION = 12;

async function applySchemaV1(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS stock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      unit TEXT NOT NULL CHECK(length(trim(unit)) > 0),
      min_quantity REAL NOT NULL CHECK(min_quantity >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS daily_stock_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      date TEXT NOT NULL CHECK(date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      quantity REAL NOT NULL CHECK(quantity >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES stock_items(id) ON DELETE CASCADE,
      UNIQUE (item_id, date)
    );
  `);

  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_daily_stock_entries_date ON daily_stock_entries(date);',
  );
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_daily_stock_entries_item_id ON daily_stock_entries(item_id);',
  );
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_daily_stock_entries_item_date ON daily_stock_entries(item_id, date);',
  );

  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS trg_stock_items_updated_at
    AFTER UPDATE ON stock_items
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE stock_items
      SET updated_at = datetime('now')
      WHERE id = OLD.id;
    END;
  `);

  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS trg_daily_stock_entries_updated_at
    AFTER UPDATE ON daily_stock_entries
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE daily_stock_entries
      SET updated_at = datetime('now')
      WHERE id = OLD.id;
    END;
  `);
}

async function applySchemaV2(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE stock_items ADD COLUMN remote_id TEXT;
  `).catch(() => {});
  await db.execAsync(`
    ALTER TABLE stock_items ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
  `).catch(() => {});
  await db.execAsync(`
    ALTER TABLE daily_stock_entries ADD COLUMN remote_id TEXT;
  `).catch(() => {});
  await db.execAsync(`
    ALTER TABLE daily_stock_entries ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
  `).catch(() => {});

  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_items_remote_id ON stock_items(remote_id);',
  );
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_stock_entries_remote_id ON daily_stock_entries(remote_id);',
  );

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await db.execAsync(`
    DROP TRIGGER IF EXISTS trg_stock_items_updated_at;
  `);
  await db.execAsync(`
    DROP TRIGGER IF EXISTS trg_daily_stock_entries_updated_at;
  `);

  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS trg_stock_items_updated_at
    AFTER UPDATE ON stock_items
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE stock_items
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = OLD.id;
    END;
  `);

  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS trg_daily_stock_entries_updated_at
    AFTER UPDATE ON daily_stock_entries
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE daily_stock_entries
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = OLD.id;
    END;
  `);

  await db.execAsync(`
    UPDATE stock_items
    SET
      remote_id = COALESCE(remote_id, lower(hex(randomblob(16)))),
      sync_status = COALESCE(NULLIF(sync_status, ''), 'pending')
    WHERE remote_id IS NULL OR sync_status IS NULL OR sync_status = '';
  `);

  await db.execAsync(`
    UPDATE daily_stock_entries
    SET
      remote_id = (
        SELECT stock_items.remote_id || ':' || daily_stock_entries.date
        FROM stock_items
        WHERE stock_items.id = daily_stock_entries.item_id
      ),
      sync_status = COALESCE(NULLIF(sync_status, ''), 'pending')
    WHERE remote_id IS NULL OR sync_status IS NULL OR sync_status = '';
  `);
}

async function applySchemaV3(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE stock_items ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
  `).catch(() => {});
  await db.execAsync(`
    ALTER TABLE stock_items ADD COLUMN deleted_at TEXT;
  `).catch(() => {});

  await db.execAsync(`
    UPDATE stock_items
    SET
      is_deleted = COALESCE(is_deleted, 0),
      deleted_at = CASE
        WHEN is_deleted = 0 THEN NULL
        ELSE deleted_at
      END
    WHERE is_deleted IS NULL OR (is_deleted = 0 AND deleted_at IS NOT NULL);
  `);

  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_stock_items_is_deleted ON stock_items(is_deleted);',
  );
}

async function applySchemaV4(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE stock_items ADD COLUMN category TEXT;
  `).catch(() => {});

  await db.execAsync(`
    UPDATE stock_items
    SET category = NULL
    WHERE category IS NOT NULL AND TRIM(category) = '';
  `);

  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_stock_items_category ON stock_items(category);',
  );
}

async function applySchemaV5(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE daily_stock_entries ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
  `).catch(() => {});
  await db.execAsync(`
    ALTER TABLE daily_stock_entries ADD COLUMN deleted_at TEXT;
  `).catch(() => {});

  await db.execAsync(`
    UPDATE daily_stock_entries
    SET
      is_deleted = COALESCE(is_deleted, 0),
      deleted_at = CASE
        WHEN is_deleted = 0 THEN NULL
        ELSE deleted_at
      END
    WHERE is_deleted IS NULL OR (is_deleted = 0 AND deleted_at IS NOT NULL);
  `);

  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_daily_stock_entries_is_deleted ON daily_stock_entries(is_deleted);',
  );
}

async function applySchemaV6(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE stock_items ADD COLUMN current_stock_quantity REAL;
  `).catch(() => {});

  await db.execAsync(`
    ALTER TABLE daily_stock_entries ADD COLUMN movement_type TEXT;
  `).catch(() => {});
  await db.execAsync(`
    ALTER TABLE daily_stock_entries ADD COLUMN stock_after_quantity REAL;
  `).catch(() => {});

  await db.execAsync(`
    UPDATE daily_stock_entries
    SET
      movement_type = COALESCE(NULLIF(TRIM(movement_type), ''), 'legacy_snapshot'),
      stock_after_quantity = COALESCE(stock_after_quantity, quantity)
    WHERE movement_type IS NULL
      OR TRIM(movement_type) = ''
      OR stock_after_quantity IS NULL;
  `);

  await db.execAsync(`
    UPDATE stock_items
    SET current_stock_quantity = (
      SELECT daily_stock_entries.stock_after_quantity
      FROM daily_stock_entries
      WHERE daily_stock_entries.item_id = stock_items.id
        AND COALESCE(daily_stock_entries.is_deleted, 0) = 0
      ORDER BY daily_stock_entries.date DESC, daily_stock_entries.updated_at DESC, daily_stock_entries.id DESC
      LIMIT 1
    )
    WHERE current_stock_quantity IS NULL;
  `);

  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_daily_stock_entries_movement_type ON daily_stock_entries(movement_type);',
  );
}

async function applySchemaV7(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE daily_stock_entries RENAME TO daily_stock_entries_v7_old;
  `);

  await db.execAsync(`
    CREATE TABLE daily_stock_entries_v7_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      remote_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      date TEXT NOT NULL CHECK(date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      quantity REAL NOT NULL CHECK(quantity >= 0),
      movement_type TEXT,
      stock_after_quantity REAL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES stock_items(id) ON DELETE CASCADE
    );
  `);

  await db.execAsync(`
    INSERT INTO daily_stock_entries_v7_new (
      id,
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
    SELECT
      id,
      item_id,
      remote_id,
      sync_status,
      date,
      quantity,
      movement_type,
      stock_after_quantity,
      COALESCE(is_deleted, 0),
      deleted_at,
      created_at,
      updated_at
    FROM daily_stock_entries_v7_old;
  `);

  await db.execAsync(`
    DROP TABLE daily_stock_entries_v7_old;
  `);

  await db.execAsync(`
    ALTER TABLE daily_stock_entries_v7_new RENAME TO daily_stock_entries;
  `);

  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_daily_stock_entries_date ON daily_stock_entries(date);',
  );
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_daily_stock_entries_item_id ON daily_stock_entries(item_id);',
  );
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_stock_entries_remote_id ON daily_stock_entries(remote_id);',
  );
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_daily_stock_entries_is_deleted ON daily_stock_entries(is_deleted);',
  );
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_daily_stock_entries_movement_type ON daily_stock_entries(movement_type);',
  );

  await db.execAsync(`
    DROP TRIGGER IF EXISTS trg_daily_stock_entries_updated_at;
  `);
  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS trg_daily_stock_entries_updated_at
    AFTER UPDATE ON daily_stock_entries
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE daily_stock_entries
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = OLD.id;
    END;
  `);

  await db.execAsync(`
    UPDATE daily_stock_entries
    SET
      is_deleted = 1,
      deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      sync_status = 'pending',
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE is_deleted = 0;
  `);

  await db.execAsync(`
    UPDATE stock_items
    SET
      current_stock_quantity = NULL,
      sync_status = 'pending',
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE is_deleted = 0;
  `);
}

async function applySchemaV8(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL,
      function_name TEXT,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      can_access_dashboard INTEGER NOT NULL DEFAULT 0,
      can_access_stock INTEGER NOT NULL DEFAULT 0,
      can_access_items INTEGER NOT NULL DEFAULT 0,
      can_access_entry INTEGER NOT NULL DEFAULT 0,
      can_access_exit INTEGER NOT NULL DEFAULT 0,
      can_access_history INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_session (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      remote_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_remote_id ON app_users(remote_id);',
  );
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_app_users_is_deleted ON app_users(is_deleted);',
  );
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username_normalized_active ON app_users(username_normalized) WHERE is_deleted = 0;',
  );
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_app_session_remote_user_id ON app_session(remote_user_id);',
  );

  await db.execAsync(`
    DROP TRIGGER IF EXISTS trg_app_users_updated_at;
  `);
  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS trg_app_users_updated_at
    AFTER UPDATE ON app_users
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE app_users
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = OLD.id;
    END;
  `);
}

async function applySchemaV9(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE daily_stock_entries ADD COLUMN created_by_user_remote_id TEXT;
  `).catch(() => {});
  await db.execAsync(`
    ALTER TABLE daily_stock_entries ADD COLUMN created_by_username TEXT;
  `).catch(() => {});

  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_daily_stock_entries_created_by_user_remote_id ON daily_stock_entries(created_by_user_remote_id);',
  );
}

function createCatalogRemoteId(prefix: 'cat' | 'unit'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function applySchemaV10(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS item_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      name_normalized TEXT NOT NULL CHECK(length(trim(name_normalized)) > 0),
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS measurement_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      name_normalized TEXT NOT NULL CHECK(length(trim(name_normalized)) > 0),
      conversion_factor REAL NOT NULL DEFAULT 1 CHECK(conversion_factor > 0),
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_item_categories_remote_id ON item_categories(remote_id);',
  );
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_units_remote_id ON measurement_units(remote_id);',
  );
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_item_categories_name_normalized_active ON item_categories(name_normalized) WHERE is_deleted = 0;',
  );
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_units_name_normalized_active ON measurement_units(name_normalized) WHERE is_deleted = 0;',
  );
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_item_categories_is_deleted ON item_categories(is_deleted);',
  );
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_measurement_units_is_deleted ON measurement_units(is_deleted);',
  );

  await db.execAsync(`
    DROP TRIGGER IF EXISTS trg_item_categories_updated_at;
  `);
  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS trg_item_categories_updated_at
    AFTER UPDATE ON item_categories
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE item_categories
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = OLD.id;
    END;
  `);

  await db.execAsync(`
    DROP TRIGGER IF EXISTS trg_measurement_units_updated_at;
  `);
  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS trg_measurement_units_updated_at
    AFTER UPDATE ON measurement_units
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE measurement_units
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = OLD.id;
    END;
  `);

  const timestamp = new Date().toISOString();
  const existingCategories = await db.getAllAsync<{ category: string | null }>(
    `
      SELECT DISTINCT category
      FROM stock_items
      WHERE category IS NOT NULL
        AND TRIM(category) <> '';
    `,
  );
  const existingUnits = await db.getAllAsync<{ unit: string }>(
    `
      SELECT DISTINCT unit
      FROM stock_items
      WHERE TRIM(unit) <> '';
    `,
  );

  const categoriesToSeed = new Set<string>(DEFAULT_STOCK_CATEGORIES);
  for (const row of existingCategories) {
    if (!row.category) {
      continue;
    }

    const normalized = normalizeCatalogName(row.category);
    if (normalized.length > 0) {
      categoriesToSeed.add(normalized);
    }
  }

  const unitsToSeed = new Set<string>(DEFAULT_MEASUREMENT_UNITS);
  for (const row of existingUnits) {
    const normalized = normalizeCatalogName(row.unit);
    if (normalized.length > 0) {
      unitsToSeed.add(normalized);
    }
  }

  for (const name of categoriesToSeed) {
    const normalized = normalizeCatalogName(name);
    await db.runAsync(
      `
        INSERT OR IGNORE INTO item_categories (
          remote_id,
          sync_status,
          name,
          name_normalized,
          created_at,
          updated_at
        )
        VALUES (?, 'pending', ?, ?, ?, ?);
      `,
      createCatalogRemoteId('cat'),
      normalized,
      normalized,
      timestamp,
      timestamp,
    );
  }

  for (const name of unitsToSeed) {
    const normalized = normalizeCatalogName(name);
    await db.runAsync(
      `
        INSERT OR IGNORE INTO measurement_units (
          remote_id,
          sync_status,
          name,
          name_normalized,
          conversion_factor,
          created_at,
          updated_at
        )
        VALUES (?, 'pending', ?, ?, ?, ?, ?);
      `,
      createCatalogRemoteId('unit'),
      normalized,
      normalized,
      getDefaultConversionFactorForUnit(normalized),
      timestamp,
      timestamp,
    );
  }
}

async function applySchemaV11(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE measurement_units ADD COLUMN conversion_factor REAL NOT NULL DEFAULT 1 CHECK(conversion_factor > 0);
  `).catch(() => {});

  await db.execAsync(`
    UPDATE measurement_units
    SET conversion_factor = CASE
      WHEN name_normalized IN ('dz', 'duzia') THEN 12
      WHEN name_normalized = 'mz' THEN 6
      WHEN name_normalized IN ('und', 'un', 'unidade') THEN 1
      WHEN conversion_factor IS NULL OR conversion_factor <= 0 THEN 1
      ELSE conversion_factor
    END;
  `);
}

async function applySchemaV12(db: SQLiteDatabase): Promise<void> {
  const tableInfo = await db.getAllAsync<{ name: string }>(
    `
      PRAGMA table_info(measurement_units);
    `,
  );
  const hasConversionFactor = tableInfo.some((column) => column.name === 'conversion_factor');

  if (!hasConversionFactor) {
    await db.execAsync(`
      ALTER TABLE measurement_units
      ADD COLUMN conversion_factor REAL NOT NULL DEFAULT 1;
    `);
  }

  await db.execAsync(`
    UPDATE measurement_units
    SET conversion_factor = CASE
      WHEN name_normalized IN ('dz', 'duzia') THEN 12
      WHEN name_normalized = 'mz' THEN 6
      WHEN name_normalized IN ('und', 'un', 'unidade') THEN 1
      WHEN conversion_factor IS NULL OR conversion_factor <= 0 THEN 1
      ELSE conversion_factor
    END;
  `);
}

export async function applyMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) {
    return;
  }

  await db.withTransactionAsync(async () => {
    if (currentVersion < 1) {
      await applySchemaV1(db);
    }

    if (currentVersion < 2) {
      await applySchemaV2(db);
    }

    if (currentVersion < 3) {
      await applySchemaV3(db);
    }

    if (currentVersion < 4) {
      await applySchemaV4(db);
    }

    if (currentVersion < 5) {
      await applySchemaV5(db);
    }

    if (currentVersion < 6) {
      await applySchemaV6(db);
    }

    if (currentVersion < 7) {
      await applySchemaV7(db);
    }

    if (currentVersion < 8) {
      await applySchemaV8(db);
    }

    if (currentVersion < 9) {
      await applySchemaV9(db);
    }

    if (currentVersion < 10) {
      await applySchemaV10(db);
    }

    if (currentVersion < 11) {
      await applySchemaV11(db);
    }

    if (currentVersion < 12) {
      await applySchemaV12(db);
    }

    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}
