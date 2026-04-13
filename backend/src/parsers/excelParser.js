const XLSX = require('xlsx');

const REQUIRED_COLUMNS = ['nome_item', 'unidade_medida'];

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function mapHeaderToField(header) {
  const normalized = normalizeHeader(header);

  if (['nome_item', 'nome', 'item', 'produto'].includes(normalized)) {
    return 'nome_item';
  }

  if (['unidade_medida', 'unidade', 'medida', 'unit'].includes(normalized)) {
    return 'unidade_medida';
  }

  if (['categoria', 'category'].includes(normalized)) {
    return 'categoria';
  }

  if (['codigo', 'cod', 'code'].includes(normalized)) {
    return 'codigo';
  }

  if (['descricao', 'descricao', 'description'].includes(normalized)) {
    return 'descricao';
  }

  if (['quantidade_minima', 'minimo', 'min_quantity', 'estoque_minimo'].includes(normalized)) {
    return 'quantidade_minima';
  }

  return null;
}

function parseExcelRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('Arquivo sem planilha valida.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });

  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('Arquivo sem dados.');
  }

  const headerRow = matrix[0] || [];
  const headerMap = new Map();

  headerRow.forEach((columnName, index) => {
    const field = mapHeaderToField(columnName);

    if (field && !headerMap.has(field)) {
      headerMap.set(field, index);
    }
  });

  for (const requiredColumn of REQUIRED_COLUMNS) {
    if (!headerMap.has(requiredColumn)) {
      throw new Error(`Coluna obrigatoria ausente: ${requiredColumn}.`);
    }
  }

  const parsedRows = [];

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];

    parsedRows.push({
      rowNumber: rowIndex + 1,
      nome_item: String(row[headerMap.get('nome_item')] ?? '').trim(),
      unidade_medida: String(row[headerMap.get('unidade_medida')] ?? '').trim(),
      categoria: String(row[headerMap.get('categoria') ?? -1] ?? '').trim(),
      codigo: String(row[headerMap.get('codigo') ?? -1] ?? '').trim(),
      descricao: String(row[headerMap.get('descricao') ?? -1] ?? '').trim(),
      quantidade_minima: String(row[headerMap.get('quantidade_minima') ?? -1] ?? '').trim(),
    });
  }

  return parsedRows;
}

module.exports = {
  parseExcelRows,
};
