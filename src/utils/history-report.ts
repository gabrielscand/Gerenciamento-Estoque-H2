import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { listHistoryEntriesByDateRange } from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import type {
  HistoryReportEntry,
  HistoryReportItemSummary,
  HistoryReportPeriod,
} from '../types/inventory';
import {
  formatDateLabel,
  formatMonthLabel,
  getMonthDateRange,
  getTodayLocalDateString,
  isValidDateString,
} from './date';

type ReportDateRange = {
  startDate: string;
  endDate: string;
  selectedMonth: string | null;
};

type ReportPeriodMeta = {
  reportTitle: string;
  periodLabel: string;
};

type ReportTopItem = {
  name: string;
  unit: string;
  quantity: number;
};

type ReportSummaryPayload = {
  period: HistoryReportPeriod;
  startDate: string;
  endDate: string;
  selectedMonth: string | null;
  generatedAt: Date;
  entries: HistoryReportEntry[];
  topEntryItems: ReportTopItem[];
  topExitItems: ReportTopItem[];
  itemSummaries: HistoryReportItemSummary[];
};

export type GenerateHistoryReportPdfResult = {
  period: HistoryReportPeriod;
  startDate: string;
  endDate: string;
  totalMovements: number;
  uri: string | null;
  shared: boolean;
};

export type GenerateHistoryReportPdfOptions = {
  selectedMonth?: string;
  referenceDate?: Date;
};

function formatDateTime(value: Date): string {
  return value.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatQuantity(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function shiftIsoDate(date: string, dayDelta: number): string {
  if (!isValidDateString(date)) {
    return date;
  }

  const [year, month, day] = date.split('-').map(Number);
  const nextDate = new Date(year, month - 1, day);
  nextDate.setDate(nextDate.getDate() + dayDelta);
  return getTodayLocalDateString(nextDate);
}

function resolveDateRange(
  period: HistoryReportPeriod,
  options: GenerateHistoryReportPdfOptions = {},
): ReportDateRange {
  const referenceDate = options.referenceDate ?? new Date();
  const today = getTodayLocalDateString(referenceDate);
  const selectedMonthRange = options.selectedMonth ? getMonthDateRange(options.selectedMonth) : null;
  const selectedMonth = selectedMonthRange ? options.selectedMonth ?? null : null;

  if (period === 'diario') {
    return {
      startDate: today,
      endDate: today,
      selectedMonth: null,
    };
  }

  if (period === 'quinzenal') {
    if (selectedMonthRange) {
      return {
        startDate: selectedMonthRange.startDate,
        endDate: selectedMonthRange.endDate,
        selectedMonth,
      };
    }

    return {
      startDate: shiftIsoDate(today, -14),
      endDate: today,
      selectedMonth: null,
    };
  }

  if (selectedMonthRange) {
    return {
      startDate: selectedMonthRange.startDate,
      endDate: selectedMonthRange.endDate,
      selectedMonth,
    };
  }

  return {
    startDate: shiftIsoDate(today, -29),
    endDate: today,
    selectedMonth: null,
  };
}

function getPeriodMeta(period: HistoryReportPeriod, selectedMonth: string | null): ReportPeriodMeta {
  if (period === 'diario') {
    return {
      reportTitle: 'Relatorio Diario de Movimentacoes',
      periodLabel: 'Diario',
    };
  }

  if (period === 'quinzenal') {
    if (selectedMonth) {
      return {
        reportTitle: 'Relatorio Quinzenal de Movimentacoes',
        periodLabel: `Quinzenal de ${formatMonthLabel(selectedMonth)} (01-15 e 16-fim)`,
      };
    }

    return {
      reportTitle: 'Relatorio Quinzenal de Movimentacoes',
      periodLabel: 'Quinzenal (ultimos 15 dias)',
    };
  }

  if (selectedMonth) {
    return {
      reportTitle: 'Relatorio Mensal de Movimentacoes',
      periodLabel: `Mensal de ${formatMonthLabel(selectedMonth)}`,
    };
  }

  return {
    reportTitle: 'Relatorio Mensal de Movimentacoes',
    periodLabel: 'Mensal (ultimos 30 dias)',
  };
}

function getMovementLabel(movementType: HistoryReportEntry['movementType']): string {
  return movementType === 'entry' ? 'Entrada' : 'Saida';
}

function getTopItems(
  summaries: HistoryReportItemSummary[],
  movementType: HistoryReportEntry['movementType'],
  limit: number = 5,
): ReportTopItem[] {
  const quantityField =
    movementType === 'entry' ? 'totalEntryQuantity' : 'totalExitQuantity';

  return summaries
    .filter((summary) => summary[quantityField] > 0)
    .sort(
      (left, right) =>
        right[quantityField] - left[quantityField] ||
        left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
    )
    .slice(0, limit)
    .map((summary) => ({
      name: summary.name,
      unit: summary.unit,
      quantity: summary[quantityField],
    }));
}

function buildItemSummaries(entries: HistoryReportEntry[]): HistoryReportItemSummary[] {
  const map = new Map<
    number,
    {
      itemId: number;
      name: string;
      unit: string;
      totalEntryQuantity: number;
      totalExitQuantity: number;
      movementDates: Set<string>;
    }
  >();

  for (const entry of entries) {
    const current = map.get(entry.itemId) ?? {
      itemId: entry.itemId,
      name: entry.name,
      unit: entry.unit,
      totalEntryQuantity: 0,
      totalExitQuantity: 0,
      movementDates: new Set<string>(),
    };

    if (entry.movementType === 'entry') {
      current.totalEntryQuantity += entry.quantity;
    } else {
      current.totalExitQuantity += entry.quantity;
    }

    current.movementDates.add(entry.date);
    map.set(entry.itemId, current);
  }

  const list = Array.from(map.values());
  const maxEntry = list.reduce((max, item) => Math.max(max, item.totalEntryQuantity), 0);
  const maxExit = list.reduce((max, item) => Math.max(max, item.totalExitQuantity), 0);

  return list
    .map((item) => ({
      itemId: item.itemId,
      name: item.name,
      unit: item.unit,
      totalEntryQuantity: item.totalEntryQuantity,
      totalExitQuantity: item.totalExitQuantity,
      movementDates: Array.from(item.movementDates).sort((left, right) => right.localeCompare(left)),
      isTopEntry: maxEntry > 0 && item.totalEntryQuantity === maxEntry,
      isTopExit: maxExit > 0 && item.totalExitQuantity === maxExit,
    }))
    .sort(
      (left, right) =>
        right.totalEntryQuantity +
          right.totalExitQuantity -
          (left.totalEntryQuantity + left.totalExitQuantity) ||
        left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
    );
}

function buildPdfHtml(payload: ReportSummaryPayload): string {
  const periodMeta = getPeriodMeta(payload.period, payload.selectedMonth);
  const periodRangeLabel = `${formatDateLabel(payload.startDate)} a ${formatDateLabel(payload.endDate)}`;

  const topEntryListHtml =
    payload.topEntryItems.length > 0
      ? payload.topEntryItems
          .map(
            (item, index) =>
              `<li><strong>${index + 1}. ${escapeHtml(item.name)}</strong> - ${escapeHtml(
                formatQuantity(item.quantity),
              )} ${escapeHtml(item.unit)}</li>`,
          )
          .join('')
      : '<li>Sem entradas no periodo.</li>';

  const topExitListHtml =
    payload.topExitItems.length > 0
      ? payload.topExitItems
          .map(
            (item, index) =>
              `<li><strong>${index + 1}. ${escapeHtml(item.name)}</strong> - ${escapeHtml(
                formatQuantity(item.quantity),
              )} ${escapeHtml(item.unit)}</li>`,
          )
          .join('')
      : '<li>Sem saidas no periodo.</li>';

  const movementRowsHtml =
    payload.entries.length > 0
      ? payload.entries
          .map(
            (entry) => `
              <tr>
                <td>${escapeHtml(formatDateLabel(entry.date))}</td>
                <td>${escapeHtml(entry.name)}</td>
                <td>${escapeHtml(getMovementLabel(entry.movementType))}</td>
                <td>${escapeHtml(formatQuantity(entry.quantity))} ${escapeHtml(entry.unit)}</td>
              </tr>
            `,
          )
          .join('')
      : `
        <tr>
          <td colspan="4" class="empty-cell">Sem movimentacoes no periodo selecionado.</td>
        </tr>
      `;

  const summaryRowsHtml =
    payload.itemSummaries.length > 0
      ? payload.itemSummaries
          .map((item) => {
            const highlightLabels: string[] = [];

            if (item.isTopEntry) {
              highlightLabels.push('Maior entrada');
            }

            if (item.isTopExit) {
              highlightLabels.push('Maior saida');
            }

            return `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(formatQuantity(item.totalEntryQuantity))} ${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(formatQuantity(item.totalExitQuantity))} ${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(item.movementDates.map((date) => formatDateLabel(date)).join(', '))}</td>
                <td>${escapeHtml(highlightLabels.join(' / ') || '-')}</td>
              </tr>
            `;
          })
          .join('')
      : `
        <tr>
          <td colspan="5" class="empty-cell">Nenhum item movimentado neste periodo.</td>
        </tr>
      `;

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(periodMeta.reportTitle)}</title>
        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #2a0834;
            margin: 24px;
            line-height: 1.4;
          }
          .title {
            font-size: 26px;
            font-weight: 800;
            color: #5f1175;
            margin-bottom: 8px;
          }
          .subtitle {
            color: #77158e;
            margin-bottom: 18px;
            font-size: 14px;
          }
          .section {
            margin-top: 18px;
            padding: 14px;
            border: 1px solid #d8c3ea;
            border-radius: 12px;
            background: #fcf8ff;
          }
          .section h2 {
            margin: 0 0 10px;
            color: #5f1175;
            font-size: 16px;
          }
          .highlight-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .highlight-card {
            border: 1px solid #d8c3ea;
            border-radius: 10px;
            background: #ffffff;
            padding: 10px;
          }
          ul {
            margin: 8px 0 0;
            padding-left: 18px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            font-size: 12px;
            background: #ffffff;
          }
          th, td {
            border: 1px solid #d8c3ea;
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #ede0f9;
            color: #5f1175;
            font-weight: 800;
          }
          .empty-cell {
            text-align: center;
            color: #6f617a;
            font-style: italic;
          }
          .meta-row {
            margin: 4px 0;
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <div class="title">${escapeHtml(periodMeta.reportTitle)}</div>
        <div class="subtitle">Relatorio de estoque | H2 Campinas</div>

        <section class="section">
          <h2>1. Informacoes gerais</h2>
          <div class="meta-row"><strong>Periodo:</strong> ${escapeHtml(periodMeta.periodLabel)}</div>
          <div class="meta-row"><strong>Faixa de datas:</strong> ${escapeHtml(periodRangeLabel)}</div>
          <div class="meta-row"><strong>Gerado em:</strong> ${escapeHtml(formatDateTime(payload.generatedAt))}</div>
          <div class="meta-row"><strong>Total de movimentacoes:</strong> ${escapeHtml(String(payload.entries.length))}</div>
        </section>

        <section class="section">
          <h2>2. Destaques principais</h2>
          <div class="highlight-grid">
            <div class="highlight-card">
              <strong>Top itens com maior entrada</strong>
              <ul>${topEntryListHtml}</ul>
            </div>
            <div class="highlight-card">
              <strong>Top itens com maior saida</strong>
              <ul>${topExitListHtml}</ul>
            </div>
          </div>
        </section>

        <section class="section">
          <h2>3. Lista completa de movimentacoes</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Item</th>
                <th>Tipo</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              ${movementRowsHtml}
            </tbody>
          </table>
        </section>

        <section class="section">
          <h2>4. Resumo por item</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Total entradas</th>
                <th>Total saidas</th>
                <th>Datas com movimentacao</th>
                <th>Destaque</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRowsHtml}
            </tbody>
          </table>
        </section>
      </body>
    </html>
  `;
}

type PdfTextOptions = {
  fontSize?: number;
  bold?: boolean;
  indent?: number;
  lineGap?: number;
};

type PdfCursor = {
  x: number;
  y: number;
  top: number;
  maxY: number;
  width: number;
};

function ensurePdfSpace(doc: any, cursor: PdfCursor, neededHeight: number): void {
  if (cursor.y + neededHeight <= cursor.maxY) {
    return;
  }

  doc.addPage();
  cursor.y = cursor.top;
}

function writePdfText(doc: any, cursor: PdfCursor, text: string, options: PdfTextOptions = {}): void {
  const fontSize = options.fontSize ?? 10;
  const indent = options.indent ?? 0;
  const lineGap = options.lineGap ?? 4;
  const lineHeight = fontSize + lineGap;
  const availableWidth = Math.max(40, cursor.width - indent);
  const lines: string[] = doc.splitTextToSize(text, availableWidth);

  doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(42, 8, 52);

  for (const line of lines) {
    ensurePdfSpace(doc, cursor, lineHeight);
    doc.text(line, cursor.x + indent, cursor.y);
    cursor.y += lineHeight;
  }
}

function addPdfSpacer(cursor: PdfCursor, size: number = 6): void {
  cursor.y += size;
}

function buildPdfFileName(period: HistoryReportPeriod, startDate: string, endDate: string): string {
  return `relatorio-${period}-${startDate}-${endDate}.pdf`;
}

async function generateWebPdf(payload: ReportSummaryPayload): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 40;
  const right = 40;
  const top = 44;
  const bottom = 44;
  const periodMeta = getPeriodMeta(payload.period, payload.selectedMonth);
  const periodRangeLabel = `${formatDateLabel(payload.startDate)} a ${formatDateLabel(payload.endDate)}`;
  const cursor: PdfCursor = {
    x: left,
    y: top,
    top,
    maxY: pageHeight - bottom,
    width: pageWidth - left - right,
  };

  writePdfText(doc, cursor, periodMeta.reportTitle, { fontSize: 20, bold: true, lineGap: 6 });
  writePdfText(doc, cursor, 'Relatorio de estoque | H2 Campinas', { fontSize: 11 });
  addPdfSpacer(cursor, 8);

  writePdfText(doc, cursor, '1. Informacoes gerais', { fontSize: 14, bold: true, lineGap: 6 });
  writePdfText(doc, cursor, `Tipo: ${periodMeta.periodLabel}`);
  writePdfText(doc, cursor, `Periodo analisado: ${periodRangeLabel}`);
  writePdfText(doc, cursor, `Data de geracao: ${formatDateTime(payload.generatedAt)}`);
  writePdfText(doc, cursor, `Total de movimentacoes: ${String(payload.entries.length)}`);
  addPdfSpacer(cursor, 8);

  writePdfText(doc, cursor, '2. Destaques principais', { fontSize: 14, bold: true, lineGap: 6 });
  writePdfText(doc, cursor, 'Itens com maior entrada:', { bold: true });
  if (payload.topEntryItems.length === 0) {
    writePdfText(doc, cursor, '- Sem entradas no periodo.', { indent: 10 });
  } else {
    payload.topEntryItems.forEach((item, index) => {
      writePdfText(
        doc,
        cursor,
        `- ${index + 1}. ${item.name} | ${formatQuantity(item.quantity)} ${item.unit}`,
        { indent: 10 },
      );
    });
  }

  writePdfText(doc, cursor, 'Itens com maior saida:', { bold: true });
  if (payload.topExitItems.length === 0) {
    writePdfText(doc, cursor, '- Sem saidas no periodo.', { indent: 10 });
  } else {
    payload.topExitItems.forEach((item, index) => {
      writePdfText(
        doc,
        cursor,
        `- ${index + 1}. ${item.name} | ${formatQuantity(item.quantity)} ${item.unit}`,
        { indent: 10 },
      );
    });
  }
  addPdfSpacer(cursor, 8);

  writePdfText(doc, cursor, '3. Lista completa de movimentacoes', { fontSize: 14, bold: true, lineGap: 6 });
  if (payload.entries.length === 0) {
    writePdfText(doc, cursor, 'Sem movimentacoes no periodo selecionado.', { indent: 10 });
  } else {
    payload.entries.forEach((entry) => {
      writePdfText(
        doc,
        cursor,
        `- ${formatDateLabel(entry.date)} | ${entry.name} | ${getMovementLabel(entry.movementType)} | ${formatQuantity(entry.quantity)} ${entry.unit}`,
        { indent: 10 },
      );
    });
  }
  addPdfSpacer(cursor, 8);

  writePdfText(doc, cursor, '4. Resumo por item (todos os itens do periodo)', {
    fontSize: 14,
    bold: true,
    lineGap: 6,
  });
  if (payload.itemSummaries.length === 0) {
    writePdfText(doc, cursor, 'Nenhum item movimentado neste periodo.', { indent: 10 });
  } else {
    payload.itemSummaries.forEach((item) => {
      const highlights: string[] = [];
      if (item.isTopEntry) {
        highlights.push('Maior entrada');
      }
      if (item.isTopExit) {
        highlights.push('Maior saida');
      }

      writePdfText(
        doc,
        cursor,
        `- ${item.name} | Entradas: ${formatQuantity(item.totalEntryQuantity)} ${item.unit} | Saidas: ${formatQuantity(item.totalExitQuantity)} ${item.unit}`,
        { indent: 10, bold: true },
      );
      writePdfText(
        doc,
        cursor,
        `  Datas: ${item.movementDates.map((date) => formatDateLabel(date)).join(', ') || '-'}`,
        { indent: 16 },
      );
      writePdfText(doc, cursor, `  Destaque: ${highlights.join(' / ') || '-'}`, { indent: 16 });
    });
  }

  doc.save(buildPdfFileName(payload.period, payload.startDate, payload.endDate));
}

export async function generateHistoryReportPdf(
  period: HistoryReportPeriod,
  options: GenerateHistoryReportPdfOptions = {},
): Promise<GenerateHistoryReportPdfResult> {
  const syncOk = await syncAppData();

  if (!syncOk) {
    throw new Error('Falha ao sincronizar com o Supabase. Nao foi possivel gerar o relatorio.');
  }

  const { startDate, endDate, selectedMonth } = resolveDateRange(period, options);
  const entries = await listHistoryEntriesByDateRange(startDate, endDate);
  const itemSummaries = buildItemSummaries(entries);
  const topEntryItems = getTopItems(itemSummaries, 'entry', 5);
  const topExitItems = getTopItems(itemSummaries, 'exit', 5);
  const generatedAt = new Date();

  const payload: ReportSummaryPayload = {
    period,
    startDate,
    endDate,
    selectedMonth,
    generatedAt,
    entries,
    topEntryItems,
    topExitItems,
    itemSummaries,
  };

  const html = buildPdfHtml(payload);

  if (Platform.OS === 'web') {
    await generateWebPdf(payload);

    return {
      period,
      startDate,
      endDate,
      totalMovements: entries.length,
      uri: null,
      shared: false,
    };
  }

  const pdfFile = await Print.printToFileAsync({
    html,
  });

  let shared = false;

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(pdfFile.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Compartilhar relatorio de estoque',
    });
    shared = true;
  } else {
    await Print.printAsync({ html });
  }

  return {
    period,
    startDate,
    endDate,
    totalMovements: entries.length,
    uri: pdfFile.uri,
    shared,
  };
}
