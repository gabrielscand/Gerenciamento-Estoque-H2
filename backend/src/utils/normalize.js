function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ');
}

function parsePositiveNumber(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  const normalized = String(value ?? '')
    .trim()
    .replace(',', '.');

  if (normalized.length === 0) {
    return null;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function isBlank(value) {
  return String(value ?? '').trim().length === 0;
}

module.exports = {
  isBlank,
  normalizeName,
  parsePositiveNumber,
};
