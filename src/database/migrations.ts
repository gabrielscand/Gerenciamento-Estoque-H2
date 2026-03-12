import type { SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_VERSION = 1;

export async function applyMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) {
    return;
  }

  await db.withTransactionAsync(async () => {
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

    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}
