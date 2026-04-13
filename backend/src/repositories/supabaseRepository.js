const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { normalizeName } = require('../utils/normalize');

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias no backend de importacao.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function fetchActiveItemsIndex() {
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, name, unit, min_quantity, category')
    .eq('is_deleted', false);

  if (error) {
    throw new Error(`[supabase] Falha ao consultar itens ativos: ${error.message}`);
  }

  const index = new Map();

  for (const item of data ?? []) {
    const normalized = normalizeName(item.name);

    if (normalized.length > 0 && !index.has(normalized)) {
      index.set(normalized, item);
    }
  }

  return index;
}

async function ensureCategory(name) {
  const normalized = normalizeName(name);

  const { data: existing, error: existingError } = await supabase
    .from('item_categories')
    .select('id, is_deleted')
    .eq('name_normalized', normalized)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`[supabase] Falha ao validar categoria: ${existingError.message}`);
  }

  if (existing) {
    if (existing.is_deleted) {
      const { error: restoreError } = await supabase
        .from('item_categories')
        .update({ is_deleted: false, deleted_at: null, name })
        .eq('id', existing.id);

      if (restoreError) {
        throw new Error(`[supabase] Falha ao reativar categoria: ${restoreError.message}`);
      }
    }

    return;
  }

  const { error: createError } = await supabase
    .from('item_categories')
    .insert({
      id: randomUUID(),
      name,
      name_normalized: normalized,
      is_deleted: false,
    });

  if (createError) {
    throw new Error(`[supabase] Falha ao criar categoria: ${createError.message}`);
  }
}

async function ensureMeasurementUnit(name) {
  const normalized = normalizeName(name);

  const { data: existing, error: existingError } = await supabase
    .from('measurement_units')
    .select('id, is_deleted')
    .eq('name_normalized', normalized)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`[supabase] Falha ao validar unidade: ${existingError.message}`);
  }

  if (existing) {
    if (existing.is_deleted) {
      const { error: restoreError } = await supabase
        .from('measurement_units')
        .update({ is_deleted: false, deleted_at: null, name })
        .eq('id', existing.id);

      if (restoreError) {
        throw new Error(`[supabase] Falha ao reativar unidade: ${restoreError.message}`);
      }
    }

    return;
  }

  const { error: createError } = await supabase
    .from('measurement_units')
    .insert({
      id: randomUUID(),
      name,
      name_normalized: normalized,
      conversion_factor: 1,
      is_deleted: false,
    });

  if (createError) {
    throw new Error(`[supabase] Falha ao criar unidade: ${createError.message}`);
  }
}

async function insertStockItem({ name, unit, category, minQuantity }) {
  await ensureCategory(category);
  await ensureMeasurementUnit(unit);

  const { error } = await supabase
    .from('stock_items')
    .insert({
      id: randomUUID(),
      name,
      unit,
      category,
      min_quantity: minQuantity,
      is_deleted: false,
    });

  if (error) {
    throw new Error(`[supabase] Falha ao inserir item: ${error.message}`);
  }
}

async function updateStockItem(existingItemId, { name, unit, category, minQuantity }) {
  await ensureCategory(category);
  await ensureMeasurementUnit(unit);

  const { error } = await supabase
    .from('stock_items')
    .update({
      name,
      unit,
      category,
      min_quantity: minQuantity,
    })
    .eq('id', existingItemId)
    .eq('is_deleted', false);

  if (error) {
    throw new Error(`[supabase] Falha ao atualizar item existente: ${error.message}`);
  }
}

module.exports = {
  fetchActiveItemsIndex,
  insertStockItem,
  updateStockItem,
};
