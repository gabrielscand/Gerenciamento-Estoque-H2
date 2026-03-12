export function getTodayLocalDateString(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function isValidDateString(value: string): boolean {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }

  const [yearString, monthString, dayString] = trimmed.split('-');
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const parsedDate = new Date(year, month - 1, day);

  return (
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day
  );
}

export function parseDateStringToDate(value: string): Date | null {
  if (!isValidDateString(value)) {
    return null;
  }

  const [yearString, monthString, dayString] = value.split('-');
  return new Date(Number(yearString), Number(monthString) - 1, Number(dayString));
}

export function formatDateLabel(yyyyMmDd: string): string {
  if (!isValidDateString(yyyyMmDd)) {
    return yyyyMmDd;
  }

  const [year, month, day] = yyyyMmDd.split('-');
  return `${day}/${month}/${year}`;
}

export function isFutureDate(value: string, referenceDate: Date = new Date()): boolean {
  const selectedDate = parseDateStringToDate(value);

  if (!selectedDate) {
    return false;
  }

  const baseDate = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );

  return selectedDate.getTime() > baseDate.getTime();
}

export function parseDisplayDateToIso(value: string): string | null {
  const trimmed = value.trim();

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return null;
  }

  const [dayString, monthString, yearString] = trimmed.split('/');
  const isoDate = `${yearString}-${monthString}-${dayString}`;

  return isValidDateString(isoDate) ? isoDate : null;
}

export function getCurrentMonthString(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function isValidMonthString(value: string): boolean {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    return false;
  }

  const [yearString, monthString] = trimmed.split('-');
  const year = Number(yearString);
  const month = Number(monthString);

  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
}

export function formatMonthLabel(yyyyMm: string): string {
  if (!isValidMonthString(yyyyMm)) {
    return yyyyMm;
  }

  const [year, month] = yyyyMm.split('-');
  return `${month}/${year}`;
}

export function parseDisplayMonthToIso(value: string): string | null {
  const trimmed = value.trim();

  if (!/^\d{2}\/\d{4}$/.test(trimmed)) {
    return null;
  }

  const [monthString, yearString] = trimmed.split('/');
  const isoMonth = `${yearString}-${monthString}`;

  return isValidMonthString(isoMonth) ? isoMonth : null;
}

export function getMonthDateRange(yyyyMm: string): { startDate: string; endDate: string } | null {
  if (!isValidMonthString(yyyyMm)) {
    return null;
  }

  const [yearString, monthString] = yyyyMm.split('-');
  const year = Number(yearString);
  const month = Number(monthString);
  const endDay = new Date(year, month, 0).getDate();

  return {
    startDate: `${yyyyMm}-01`,
    endDate: `${yyyyMm}-${String(endDay).padStart(2, '0')}`,
  };
}
