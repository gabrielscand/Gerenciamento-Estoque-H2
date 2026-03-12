import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { applyMigrations } from './migrations';

const DATABASE_NAME = 'gerenciamento-estoque.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME);
  }

  const database = await databasePromise;
  await database.execAsync('PRAGMA foreign_keys = ON;');

  return database;
}

export async function runMigrations(): Promise<void> {
  console.log('[SQLite] iniciando migracoes...');
  const database = await getDatabase();
  await applyMigrations(database);
  console.log('[SQLite] migracoes concluidas.');
}

export async function initDatabase(): Promise<void> {
  await runMigrations();
  console.log('[SQLite] banco inicializado e migrado com sucesso.');
}
