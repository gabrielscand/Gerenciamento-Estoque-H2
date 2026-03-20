export const DEFAULT_STOCK_CATEGORIES = [
  'mercearia',
  'bebidas',
  'bomboniere',
  'material limpeza',
  'material descartavel',
] as const;

export const DEFAULT_MEASUREMENT_UNITS = [
  'un',
  'kg',
  'caixa',
  'pacote',
  'gf',
  'duzia',
  'mz',
] as const;

export function normalizeCatalogName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ');
}

export function getCategoryLabel(category: string): string {
  return category
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
