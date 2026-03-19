import * as Crypto from 'expo-crypto';
import { getDatabase } from './index';
import { isRemoteSyncConfigured, syncAppDataInBackground } from './sync.service';
import type {
  AppTabPermissionKey,
  AppUser,
  AppUserPermissions,
  CreateUserInput,
  UpdateUserInput,
} from '../types/inventory';

type AppUserRow = {
  id: number;
  remote_id: string;
  username: string;
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
  created_at: string;
  updated_at: string;
};

const DEFAULT_ADMIN_USERNAME = 'admh2';
const DEFAULT_ADMIN_PASSWORD = 'H2Club.com';
const DEFAULT_ADMIN_FUNCTION = 'Administrador chefe';

export const EMPTY_USER_PERMISSIONS: AppUserPermissions = {
  dashboard: false,
  stock: false,
  items: false,
  entry: false,
  exit: false,
  history: false,
};

const TAB_PERMISSION_COLUMNS: Record<AppTabPermissionKey, keyof AppUserRow> = {
  dashboard: 'can_access_dashboard',
  stock: 'can_access_stock',
  items: 'can_access_items',
  entry: 'can_access_entry',
  exit: 'can_access_exit',
  history: 'can_access_history',
};

function nowIsoString(): string {
  return new Date().toISOString();
}

function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase();
}

function buildRemoteUserId(): string {
  return `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureAnyPermissionSelected(permissions: AppUserPermissions): void {
  const hasPermission = Object.values(permissions).some((value) => value);
  if (!hasPermission) {
    throw new Error('Selecione pelo menos uma aba para o usuario.');
  }
}

function mapUserRow(row: AppUserRow): AppUser {
  return {
    id: row.id,
    remoteId: row.remote_id,
    username: row.username,
    functionName: row.function_name?.trim() || 'Sem funcao',
    isAdmin: row.is_admin === 1,
    permissions: {
      dashboard: row.can_access_dashboard === 1,
      stock: row.can_access_stock === 1,
      items: row.can_access_items === 1,
      entry: row.can_access_entry === 1,
      exit: row.can_access_exit === 1,
      history: row.can_access_history === 1,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`,
  );
}

function createSalt(): string {
  const base = typeof Crypto.randomUUID === 'function'
    ? Crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return base.slice(0, 32);
}

async function createPasswordPayload(password: string): Promise<{ salt: string; hash: string }> {
  if (password.length === 0) {
    throw new Error('Informe uma senha valida.');
  }

  const salt = createSalt();
  const hash = await hashPassword(password, salt);

  return { salt, hash };
}

async function getCurrentSessionRemoteUserId(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ remote_user_id: string }>(
    `
      SELECT remote_user_id
      FROM app_session
      WHERE id = 1
      LIMIT 1;
    `,
  );

  return row?.remote_user_id ?? null;
}

async function markUserPendingSync(remoteUserId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `
      UPDATE app_users
      SET sync_status = 'pending'
      WHERE remote_id = ?;
    `,
    remoteUserId,
  );
}

export async function ensureDefaultAdminUser(): Promise<void> {
  const db = await getDatabase();
  const activeUsers = await db.getFirstAsync<{ total: number }>(
    `
      SELECT COUNT(*) AS total
      FROM app_users
      WHERE is_deleted = 0;
    `,
  );

  if ((activeUsers?.total ?? 0) > 0) {
    return;
  }

  const password = await createPasswordPayload(DEFAULT_ADMIN_PASSWORD);
  const timestamp = nowIsoString();

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
      VALUES (?, 'pending', ?, ?, ?, ?, ?, 1, 1, 1, 1, 1, 1, 1, 0, NULL, ?, ?);
    `,
    buildRemoteUserId(),
    DEFAULT_ADMIN_USERNAME,
    normalizeUsername(DEFAULT_ADMIN_USERNAME),
    DEFAULT_ADMIN_FUNCTION,
    password.hash,
    password.salt,
    timestamp,
    timestamp,
  );

  if (isRemoteSyncConfigured()) {
    syncAppDataInBackground();
  }
}

async function upsertLocalSession(remoteUserId: string): Promise<void> {
  const db = await getDatabase();
  const timestamp = nowIsoString();

  await db.runAsync(
    `
      INSERT INTO app_session (id, remote_user_id, created_at, updated_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id)
      DO UPDATE SET
        remote_user_id = excluded.remote_user_id,
        updated_at = excluded.updated_at;
    `,
    remoteUserId,
    timestamp,
    timestamp,
  );
}

export async function getCurrentSessionUser(): Promise<AppUser | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AppUserRow>(
    `
      SELECT
        app_users.id,
        app_users.remote_id,
        app_users.username,
        app_users.function_name,
        app_users.password_hash,
        app_users.password_salt,
        app_users.is_admin,
        app_users.can_access_dashboard,
        app_users.can_access_stock,
        app_users.can_access_items,
        app_users.can_access_entry,
        app_users.can_access_exit,
        app_users.can_access_history,
        app_users.created_at,
        app_users.updated_at
      FROM app_session
      INNER JOIN app_users ON app_users.remote_id = app_session.remote_user_id
      WHERE app_session.id = 1
        AND app_users.is_deleted = 0
      LIMIT 1;
    `,
  );

  if (!row) {
    await db.runAsync('DELETE FROM app_session WHERE id = 1;');
    return null;
  }

  return mapUserRow(row);
}

export async function login(username: string, password: string): Promise<AppUser> {
  const normalizedUsername = normalizeUsername(username);

  if (normalizedUsername.length === 0 || password.length === 0) {
    throw new Error('Informe usuario e senha.');
  }

  const db = await getDatabase();
  const row = await db.getFirstAsync<AppUserRow>(
    `
      SELECT
        id,
        remote_id,
        username,
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
        created_at,
        updated_at
      FROM app_users
      WHERE username_normalized = ?
        AND is_deleted = 0
      LIMIT 1;
    `,
    normalizedUsername,
  );

  if (!row) {
    throw new Error('Usuario ou senha invalidos.');
  }

  const incomingHash = await hashPassword(password, row.password_salt);

  if (incomingHash !== row.password_hash) {
    throw new Error('Usuario ou senha invalidos.');
  }

  await upsertLocalSession(row.remote_id);

  return mapUserRow(row);
}

export async function logout(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM app_session WHERE id = 1;');
}

export function canAccessTab(user: AppUser, tab: AppTabPermissionKey): boolean {
  return user.permissions[tab];
}

export async function listUsers(): Promise<AppUser[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AppUserRow>(
    `
      SELECT
        id,
        remote_id,
        username,
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
        created_at,
        updated_at
      FROM app_users
      WHERE is_deleted = 0
      ORDER BY LOWER(username) ASC;
    `,
  );

  return rows.map(mapUserRow);
}

export async function createUser(input: CreateUserInput): Promise<void> {
  const username = input.username.trim();
  const functionName = input.functionName.trim();
  const normalizedUsername = normalizeUsername(username);

  if (normalizedUsername.length === 0) {
    throw new Error('Informe um usuario valido.');
  }

  if (input.password.length === 0) {
    throw new Error('Informe uma senha valida.');
  }

  ensureAnyPermissionSelected(input.permissions);

  const db = await getDatabase();
  const duplicate = await db.getFirstAsync<{ id: number }>(
    `
      SELECT id
      FROM app_users
      WHERE username_normalized = ?
        AND is_deleted = 0
      LIMIT 1;
    `,
    normalizedUsername,
  );

  if (duplicate) {
    throw new Error('Ja existe um usuario com esse nome.');
  }

  const password = await createPasswordPayload(input.password);
  const timestamp = nowIsoString();

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
      VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?);
    `,
    buildRemoteUserId(),
    username,
    normalizedUsername,
    functionName.length > 0 ? functionName : 'Sem funcao',
    password.hash,
    password.salt,
    input.isAdmin ? 1 : 0,
    input.permissions.dashboard ? 1 : 0,
    input.permissions.stock ? 1 : 0,
    input.permissions.items ? 1 : 0,
    input.permissions.entry ? 1 : 0,
    input.permissions.exit ? 1 : 0,
    input.permissions.history ? 1 : 0,
    timestamp,
    timestamp,
  );

  if (isRemoteSyncConfigured()) {
    syncAppDataInBackground();
  }
}

export async function updateUser(userId: number, input: UpdateUserInput): Promise<void> {
  const username = input.username.trim();
  const functionName = input.functionName.trim();
  const newPassword = input.password?.trim() ?? '';
  const normalizedUsername = normalizeUsername(username);

  if (normalizedUsername.length === 0) {
    throw new Error('Informe um usuario valido.');
  }

  ensureAnyPermissionSelected(input.permissions);

  const db = await getDatabase();
  const current = await db.getFirstAsync<{ id: number; is_admin: number; remote_id: string }>(
    `
      SELECT id, is_admin, remote_id
      FROM app_users
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1;
    `,
    userId,
  );

  if (!current) {
    throw new Error('Usuario nao encontrado para edicao.');
  }

  const duplicate = await db.getFirstAsync<{ id: number }>(
    `
      SELECT id
      FROM app_users
      WHERE username_normalized = ?
        AND is_deleted = 0
        AND id <> ?
      LIMIT 1;
    `,
    normalizedUsername,
    userId,
  );

  if (duplicate) {
    throw new Error('Ja existe um usuario com esse nome.');
  }

  if (current.is_admin === 1 && !input.isAdmin) {
    const otherAdmins = await db.getFirstAsync<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM app_users
        WHERE is_deleted = 0
          AND is_admin = 1
          AND id <> ?;
      `,
      userId,
    );

    if ((otherAdmins?.total ?? 0) === 0) {
      throw new Error('Nao e possivel remover permissao do ultimo administrador.');
    }
  }

  const timestamp = nowIsoString();
  let passwordPayload: { hash: string; salt: string } | null = null;

  if (newPassword.length > 0) {
    passwordPayload = await createPasswordPayload(newPassword);
  }

  if (passwordPayload) {
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
          sync_status = 'pending',
          updated_at = ?
        WHERE id = ?
          AND is_deleted = 0;
      `,
      username,
      normalizedUsername,
      functionName.length > 0 ? functionName : 'Sem funcao',
      passwordPayload.hash,
      passwordPayload.salt,
      input.isAdmin ? 1 : 0,
      input.permissions.dashboard ? 1 : 0,
      input.permissions.stock ? 1 : 0,
      input.permissions.items ? 1 : 0,
      input.permissions.entry ? 1 : 0,
      input.permissions.exit ? 1 : 0,
      input.permissions.history ? 1 : 0,
      timestamp,
      userId,
    );
  } else {
    await db.runAsync(
      `
        UPDATE app_users
        SET
          username = ?,
          username_normalized = ?,
          function_name = ?,
          is_admin = ?,
          can_access_dashboard = ?,
          can_access_stock = ?,
          can_access_items = ?,
          can_access_entry = ?,
          can_access_exit = ?,
          can_access_history = ?,
          sync_status = 'pending',
          updated_at = ?
        WHERE id = ?
          AND is_deleted = 0;
      `,
      username,
      normalizedUsername,
      functionName.length > 0 ? functionName : 'Sem funcao',
      input.isAdmin ? 1 : 0,
      input.permissions.dashboard ? 1 : 0,
      input.permissions.stock ? 1 : 0,
      input.permissions.items ? 1 : 0,
      input.permissions.entry ? 1 : 0,
      input.permissions.exit ? 1 : 0,
      input.permissions.history ? 1 : 0,
      timestamp,
      userId,
    );
  }

  if (isRemoteSyncConfigured()) {
    syncAppDataInBackground();
  }
}

export async function archiveUser(userId: number): Promise<void> {
  const db = await getDatabase();
  const target = await db.getFirstAsync<{ id: number; is_admin: number; remote_id: string }>(
    `
      SELECT id, is_admin, remote_id
      FROM app_users
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1;
    `,
    userId,
  );

  if (!target) {
    throw new Error('Usuario nao encontrado para exclusao.');
  }

  const sessionRemoteUserId = await getCurrentSessionRemoteUserId();
  if (sessionRemoteUserId && sessionRemoteUserId === target.remote_id) {
    throw new Error('Nao e permitido excluir o proprio usuario logado.');
  }

  if (target.is_admin === 1) {
    const otherAdmins = await db.getFirstAsync<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM app_users
        WHERE is_deleted = 0
          AND is_admin = 1
          AND id <> ?;
      `,
      userId,
    );

    if ((otherAdmins?.total ?? 0) === 0) {
      throw new Error('Nao e permitido excluir o ultimo administrador ativo.');
    }
  }

  const timestamp = nowIsoString();

  await db.runAsync(
    `
      UPDATE app_users
      SET
        is_deleted = 1,
        deleted_at = ?,
        sync_status = 'pending',
        updated_at = ?
      WHERE id = ?
        AND is_deleted = 0;
    `,
    timestamp,
    timestamp,
    userId,
  );

  if (isRemoteSyncConfigured()) {
    syncAppDataInBackground();
  }
}
