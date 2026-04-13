const { parseExcelRows } = require('../parsers/excelParser');
const {
  fetchActiveItemsIndex,
  insertStockItem,
  updateStockItem,
} = require('../repositories/supabaseRepository');
const {
  createImportSession,
  deleteImportSession,
  getImportSession,
} = require('../store/importSessionStore');
const { isBlank, normalizeName, parsePositiveNumber } = require('../utils/normalize');

function buildRowKey(rowNumber, sequence) {
  return `row-${rowNumber}-${sequence}`;
}

function ensureDefaults(defaultCategory, defaultMinQuantity) {
  const normalizedCategory = normalizeName(defaultCategory);

  if (normalizedCategory.length === 0) {
    throw new Error('Categoria padrao obrigatoria para importar.');
  }

  const parsedDefaultMin = parsePositiveNumber(defaultMinQuantity);

  if (parsedDefaultMin === null || parsedDefaultMin < 0) {
    throw new Error('Quantidade minima padrao invalida.');
  }

  return {
    category: normalizedCategory,
    minQuantity: parsedDefaultMin,
  };
}

async function previewImport({ fileBuffer, defaultCategory, defaultMinQuantity }) {
  console.info('[import-items][preview] iniciando processamento do arquivo');
  const defaults = ensureDefaults(defaultCategory, defaultMinQuantity);
  const worksheetRows = parseExcelRows(fileBuffer);

  const activeItemIndex = await fetchActiveItemsIndex();
  const invalidRows = [];
  const preparedRows = [];
  const seenNames = new Set();
  let ignoredEmptyRows = 0;

  worksheetRows.forEach((row, rowIndex) => {
    const rowNumber = row.rowNumber;
    const name = row.nome_item.trim();
    const unit = normalizeName(row.unidade_medida);

    if (isBlank(row.nome_item) && isBlank(row.unidade_medida) && isBlank(row.categoria) && isBlank(row.quantidade_minima)) {
      ignoredEmptyRows += 1;
      return;
    }

    if (name.length === 0) {
      invalidRows.push({ rowNumber, reason: 'nome_item obrigatorio.' });
      return;
    }

    if (unit.length === 0) {
      invalidRows.push({ rowNumber, reason: 'unidade_medida obrigatoria.' });
      return;
    }

    const normalizedName = normalizeName(name);

    if (seenNames.has(normalizedName)) {
      invalidRows.push({ rowNumber, reason: 'Nome duplicado dentro do arquivo.' });
      return;
    }

    seenNames.add(normalizedName);

    const parsedMinFromFile = parsePositiveNumber(row.quantidade_minima);
    const minQuantity = parsedMinFromFile === null ? defaults.minQuantity : parsedMinFromFile;

    if (minQuantity < 0) {
      invalidRows.push({ rowNumber, reason: 'quantidade_minima nao pode ser negativa.' });
      return;
    }

    const category = normalizeName(row.categoria || defaults.category);

    if (category.length === 0) {
      invalidRows.push({ rowNumber, reason: 'Categoria invalida para a linha.' });
      return;
    }

    const existing = activeItemIndex.get(normalizedName) ?? null;

    preparedRows.push({
      rowKey: buildRowKey(rowNumber, rowIndex + 1),
      rowNumber,
      name,
      normalizedName,
      unit,
      category,
      minQuantity,
      existingItem: existing,
    });
  });

  const conflicts = preparedRows
    .filter((row) => row.existingItem)
    .map((row) => ({
      rowKey: row.rowKey,
      rowNumber: row.rowNumber,
      name: row.name,
      unit: row.unit,
      category: row.category,
      minQuantity: row.minQuantity,
      existingItemId: row.existingItem.id,
      existingItemName: row.existingItem.name,
      existingUnit: row.existingItem.unit,
      existingCategory: row.existingItem.category,
      existingMinQuantity: row.existingItem.min_quantity,
    }));

  const summaryPreview = {
    totalRows: worksheetRows.length,
    validRows: preparedRows.length,
    ignoredEmptyRows,
    newItems: preparedRows.length - conflicts.length,
    conflicts: conflicts.length,
    invalidRows: invalidRows.length,
  };

  const importId = createImportSession({
    preparedRows,
    conflicts,
    invalidRows,
    summaryPreview,
  });

  console.info(
    `[import-items][preview] concluido importId=${importId} validRows=${summaryPreview.validRows} conflicts=${summaryPreview.conflicts} invalidRows=${summaryPreview.invalidRows}`,
  );

  return {
    importId,
    summaryPreview,
    conflicts,
    invalidRows,
  };
}

function mapConflictDecisions(conflicts, conflictDecisions) {
  const decisionsMap = new Map();

  for (const decision of conflictDecisions || []) {
    const action = decision?.action;

    if (decision?.rowKey && (action === 'ignore' || action === 'update')) {
      decisionsMap.set(decision.rowKey, action);
    }
  }

  for (const conflict of conflicts) {
    if (!decisionsMap.has(conflict.rowKey)) {
      throw new Error(`Decisao ausente para conflito da linha ${conflict.rowNumber}.`);
    }
  }

  return decisionsMap;
}

async function commitImport({ importId, conflictDecisions }) {
  console.info(`[import-items][commit] iniciando confirmacao importId=${importId ?? 'n/a'}`);
  if (!importId || String(importId).trim().length === 0) {
    throw new Error('importId obrigatorio para confirmar importacao.');
  }

  const session = getImportSession(importId);

  if (!session) {
    throw new Error('Sessao de importacao expirada ou invalida. Faca o preview novamente.');
  }

  const decisionsMap = mapConflictDecisions(session.conflicts, conflictDecisions);

  const summaryCommit = {
    imported: 0,
    updated: 0,
    ignored: 0,
    errors: 0,
  };
  const errorDetails = [];

  for (const row of session.preparedRows) {
    try {
      if (row.existingItem) {
        const action = decisionsMap.get(row.rowKey);

        if (action === 'ignore') {
          summaryCommit.ignored += 1;
          continue;
        }

        await updateStockItem(row.existingItem.id, {
          name: row.name,
          unit: row.unit,
          category: row.category,
          minQuantity: row.minQuantity,
        });
        summaryCommit.updated += 1;
        continue;
      }

      await insertStockItem({
        name: row.name,
        unit: row.unit,
        category: row.category,
        minQuantity: row.minQuantity,
      });
      summaryCommit.imported += 1;
    } catch (error) {
      summaryCommit.errors += 1;
      errorDetails.push({
        rowKey: row.rowKey,
        rowNumber: row.rowNumber,
        name: row.name,
        reason: error instanceof Error ? error.message : 'Erro desconhecido ao aplicar linha.',
      });
    }
  }

  deleteImportSession(importId);

  console.info(
    `[import-items][commit] concluido importId=${importId} imported=${summaryCommit.imported} updated=${summaryCommit.updated} ignored=${summaryCommit.ignored} errors=${summaryCommit.errors}`,
  );

  return {
    summaryCommit,
    errorDetails,
  };
}

module.exports = {
  commitImport,
  previewImport,
};
