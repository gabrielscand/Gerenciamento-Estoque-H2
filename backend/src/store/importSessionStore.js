const { randomUUID } = require('crypto');

const defaultTtlMinutes = Number(process.env.IMPORT_SESSION_TTL_MINUTES ?? '30');
const ttlMs = Number.isFinite(defaultTtlMinutes) && defaultTtlMinutes > 0
  ? defaultTtlMinutes * 60 * 1000
  : 30 * 60 * 1000;

const sessions = new Map();

function cleanupExpiredSessions() {
  const now = Date.now();

  for (const [importId, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(importId);
    }
  }
}

function createImportSession(payload) {
  cleanupExpiredSessions();

  const importId = randomUUID();
  sessions.set(importId, {
    ...payload,
    importId,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });

  return importId;
}

function getImportSession(importId) {
  cleanupExpiredSessions();

  const session = sessions.get(importId);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(importId);
    return null;
  }

  return session;
}

function deleteImportSession(importId) {
  sessions.delete(importId);
}

module.exports = {
  createImportSession,
  deleteImportSession,
  getImportSession,
};
