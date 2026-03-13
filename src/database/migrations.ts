import type { SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_VERSION = 2;

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

    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}
