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
  return roundQuantity(quantity * factor);
}

export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
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
  const baseQuantity = convertToBaseUnits(quantity, conversionFactor, safeUnit) ?? 0;
  const baseText = `${formatter(baseQuantity)} und`;

  if (!safeUnit) {
    return `${formatter(quantity)} (${baseText})`;
  }

  return `${formatter(quantity)} ${safeUnit} (${baseText})`;
}

