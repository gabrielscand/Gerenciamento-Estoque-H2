export const STOCK_CATEGORIES = [
  'mercearia',
  'bebidas',
  'bomboniere',
  'material limpeza',
  'material descartavel',
] as const;

export type StockCategory = (typeof STOCK_CATEGORIES)[number];

const CATEGORY_LABELS: Record<StockCategory, string> = {
  mercearia: 'Mercearia',
  bebidas: 'Bebidas',
  bomboniere: 'Bomboniere',
  'material limpeza': 'Material limpeza',
  'material descartavel': 'Material descartavel',
};

export function getCategoryLabel(category: StockCategory): string {
  return CATEGORY_LABELS[category];
}

export function isStockCategory(value: string): value is StockCategory {
  return (STOCK_CATEGORIES as readonly string[]).includes(value);
}
