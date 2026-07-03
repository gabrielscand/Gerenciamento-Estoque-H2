function normalizeUnitName(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function getDefaultConversionFactorForUnit(unitName: string | null | undefined): number {
  const normalized = normalizeUnitName(unitName);

  if (normalized === 'dz' || normalized === 'duzia') {
    return 12;
  }

  if (normalized === 'mz') {
    return 6;
  }

  if (normalized === 'und' || normalized === 'un' || normalized === 'unidade') {
    return 1;
  }

  return 1;
}

export function normalizeConversionFactor(
  conversionFactor: number | null | undefined,
  unitName?: string | null,
): number {
  if (typeof conversionFactor === 'number' && Number.isFinite(conversionFactor) && conversionFactor > 0) {
    return conversionFactor;
  }

  return getDefaultConversionFactorForUnit(unitName);
}

export function convertToBaseUnits(
  quantity: number | null | undefined,
  conversionFactor: number | null | undefined,
  unitName?: string | null,
): number | null {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    return null;
  }

  const factor = normalizeConversionFactor(conversionFactor, unitName);
  const raw = quantity * factor;
  // Itens de fardo são pacotes discretos: a quantidade em unidades (base) e
  // sempre inteira. Arredonda para inteiro para não exibir casas decimais.
  return isFardoConversionFactor(factor) ? Math.round(raw) : roundQuantity(raw);
}

export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const FARDO_CONVERSION_FACTORS = new Set([4, 6, 8, 12, 24]);

export function isFardoConversionFactor(conversionFactor: number | null | undefined): boolean {
  return typeof conversionFactor === 'number' && FARDO_CONVERSION_FACTORS.has(conversionFactor);
}

// Quantidade de fardos a comprar, arredondada para cima (não se compra fração de fardo).
// Itens não-fardo retornam a quantidade original.
export function purchaseQuantityForBuy(
  missingQuantity: number,
  conversionFactor: number | null | undefined,
): number {
  if (!isFardoConversionFactor(conversionFactor)) {
    return missingQuantity;
  }

  return Math.ceil(missingQuantity);
}

export function formatOriginalAndBaseQuantity(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  conversionFactor: number | null | undefined,
  formatter: (value: number) => string,
): string {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    return '-';
  }

  const safeUnit = (unit ?? '').trim();
  const factor = normalizeConversionFactor(conversionFactor, safeUnit);
  const baseQuantity = convertToBaseUnits(quantity, conversionFactor, safeUnit) ?? 0;

  // Itens de fardo: mostra os dois jeitos lado a lado. O fardo conta so os
  // inteiros (arredonda para baixo); a unidade segue o total exato.
  // Ex.: 27 und, fardo de 6 -> "4 fardo de 6 / 27 und".
  if (safeUnit && isFardoConversionFactor(factor)) {
    const fardos = Math.floor(baseQuantity / factor);
    return `${formatter(fardos)} ${safeUnit} / ${formatter(baseQuantity)} und`;
  }

  const baseText = `${formatter(baseQuantity)} und`;

  if (!safeUnit) {
    return `${formatter(quantity)} (${baseText})`;
  }

  return `${formatter(quantity)} ${safeUnit} (${baseText})`;
}

