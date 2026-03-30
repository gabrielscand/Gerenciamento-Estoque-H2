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
      : '<li>Sem entradas no período.</li>';

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
      : '<li>Sem saídas no período.</li>';

  const movementRowsHtml =
    payload.entries.length > 0
      ? payload.entries
          .map(
            (entry) => `
              <tr>
                <td>${escapeHtml(formatDateLabel(entry.date))}</td>
                <td><strong>${escapeHtml(entry.name)}</strong></td>
                <td><span class="badge ${entry.movementType === 'entry' ? 'badge-entry' : 'badge-exit'}">${escapeHtml(getMovementLabel(entry.movementType))}</span></td>
                <td><strong>${escapeHtml(formatQuantity(entry.quantity))}</strong> <span class="unit">${escapeHtml(entry.unit)}</span></td>
              </tr>
            `,
          )
          .join('')
      : `
        <tr>
          <td colspan="4" class="empty-cell">Sem movimentações no período selecionado.</td>
        </tr>
      `;

  const summaryRowsHtml =
    payload.itemSummaries.length > 0
      ? payload.itemSummaries
          .map((item) => {
            const highlightLabels: string[] = [];

            if (item.isTopEntry) highlightLabels.push('Maior entrada');
            if (item.isTopExit) highlightLabels.push('Maior saída');

            return `
              <tr>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td class="col-entry">${escapeHtml(formatQuantity(item.totalEntryQuantity))} <span class="unit">${escapeHtml(item.unit)}</span></td>
                <td class="col-exit">${escapeHtml(formatQuantity(item.totalExitQuantity))} <span class="unit">${escapeHtml(item.unit)}</span></td>
                <td class="col-dates">${escapeHtml(item.movementDates.map((date) => formatDateLabel(date)).join(', '))}</td>
                <td>${highlightLabels.length > 0 ? `<span class="badge badge-highlight">${escapeHtml(highlightLabels.join(' / '))}</span>` : '-'}</td>
              </tr>
            `;
          })
          .join('')
      : `
        <tr>
          <td colspan="5" class="empty-cell">Nenhum item movimentado neste período.</td>
        </tr>
      `;

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(periodMeta.reportTitle)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Inter', sans-serif;
            color: #1a1a1a;
            margin: 0;
            padding: 40px;
            line-height: 1.5;
            background-color: #fbfcff;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 24px;
            border-bottom: 2px solid #e2d9eb;
          }
          .logo {
            font-size: 20px;
            font-weight: 800;
            color: #8c24a8;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-bottom: 12px;
          }
          .title {
            font-size: 28px;
            font-weight: 800;
            color: #5f1175;
            margin-bottom: 8px;
          }
          .subtitle {
            color: #6f617a;
            font-size: 15px;
            font-weight: 500;
          }
          .section {
            margin-top: 32px;
            background: #ffffff;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(95, 17, 117, 0.05), 0 2px 4px -1px rgba(95, 17, 117, 0.03);
            border: 1px solid #f0e6f7;
          }
          .section h2 {
            margin: 0 0 20px;
            color: #5f1175;
            font-size: 18px;
            font-weight: 700;
            display: flex;
            align-items: center;
          }
          .highlight-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
          }
          .highlight-card {
            padding: 16px;
            background: #faf5fd;
            border-radius: 8px;
            border-left: 4px solid #8c24a8;
          }
          .highlight-card strong {
            display: block;
            color: #5f1175;
            margin-bottom: 12px;
            font-size: 15px;
          }
          ul {
            margin: 0;
            padding-left: 20px;
            color: #333333;
          }
          li {
            margin-bottom: 6px;
          }
          table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            margin-top: 10px;
            font-size: 13px;
          }
          th {
            background: #5f1175;
            color: #ffffff;
            font-weight: 600;
            text-align: left;
            padding: 12px 16px;
          }
          th:first-child { border-top-left-radius: 8px; }
          th:last-child { border-top-right-radius: 8px; }
          td {
            padding: 12px 16px;
            border-bottom: 1px solid #f0e6f7;
            color: #4a4a4a;
            vertical-align: middle;
          }
          tr:last-child td { border-bottom: none; }
          tr:nth-child(even) td { background-color: #faf5fd; }
          .empty-cell {
            text-align: center;
            color: #8c8c8c;
            font-style: italic;
            padding: 30px !important;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .meta-item {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 6px;
          }
          .meta-label {
            font-size: 11px;
            color: #6f617a;
            margin-bottom: 4px;
            text-transform: uppercase;
            font-weight: 600;
          }
          .meta-value {
            font-size: 14px;
            color: #2a0834;
            font-weight: 600;
          }
          .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .badge-entry { background: #e8f5e9; color: #2e7d32; }
          .badge-exit { background: #ffebee; color: #c62828; }
          .badge-highlight { background: #fff3e0; color: #ef6c00; }
          .unit { color: #888; font-size: 11px; }
          .col-dates { line-height: 1.4; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">H2 Campinas</div>
          <div class="title">${escapeHtml(periodMeta.reportTitle)}</div>
          <div class="subtitle">Relatório de Transações de Estoque</div>
        </div>

        <section class="section">
          <h2>1. Informações Gerais</h2>
          <div class="meta-grid">
            <div class="meta-item">
              <div class="meta-label">Período Selecionado</div>
              <div class="meta-value">${escapeHtml(periodMeta.periodLabel)}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Faixa de Datas</div>
              <div class="meta-value">${escapeHtml(periodRangeLabel)}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Gerado Em</div>
              <div class="meta-value">${escapeHtml(formatDateTime(payload.generatedAt))}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Operações Registradas</div>
              <div class="meta-value">${escapeHtml(String(payload.entries.length))}</div>
            </div>
          </div>
        </section>

        <section class="section">
          <h2>2. Quadro de Destaques</h2>
          <div class="highlight-grid">
            <div class="highlight-card">
              <strong>Top Itens: Maior Entrada</strong>
              <ul>${topEntryListHtml}</ul>
            </div>
            <div class="highlight-card">
              <strong>Top Itens: Maior Saída</strong>
              <ul>${topExitListHtml}</ul>
            </div>
          </div>
        </section>

        <section class="section">
          <h2>3. Movimentações Detalhadas</h2>
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
          <h2>4. Resumo Consolidado por Item</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Total Entradas</th>
                <th>Total Saídas</th>
                <th>Datas com movimentação</th>
                <th>Destaques</th>
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

function buildPdfFileName(period: HistoryReportPeriod, startDate: string, endDate: string): string {
  return `relatorio-${period}-${startDate}-${endDate}.pdf`;
}

async function generateWebPdf(payload: ReportSummaryPayload): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  
  const periodMeta = getPeriodMeta(payload.period, payload.selectedMonth);
  const periodRangeLabel = `${formatDateLabel(payload.startDate)} a ${formatDateLabel(payload.endDate)}`;
  
  // Header Style
  doc.setFillColor(95, 17, 117); // #5f1175 (H2 Brand)
  doc.rect(0, 0, pageWidth, 90, 'F');
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(215, 190, 230);
  doc.text('H2 CAMPINAS | GERENCIAMENTO DE ESTOQUE', 40, 35);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(periodMeta.reportTitle.toUpperCase(), 40, 65);

  let currentY = 120;

  // 1. Informacoes Gerais 
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(95, 17, 117);
  doc.text('1. INFORMAÇÕES GERAIS', 40, currentY);
  currentY += 12;

  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    head: [['Campo', 'Valor']],
    body: [
      ['Período', periodMeta.periodLabel],
      ['Faixa de datas', periodRangeLabel],
      ['Data de geração', formatDateTime(payload.generatedAt)],
      ['Total de movimentações', String(payload.entries.length)],
    ],
    headStyles: { fillColor: [95, 17, 117], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150, fillColor: [250, 245, 253] } },
    margin: { left: 40, right: 40 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 30;

  // 2. Destaques principais
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(95, 17, 117);
  doc.text('2. QUADRO DE DESTAQUES', 40, currentY);
  currentY += 12;

  const maxDestaques = Math.max(payload.topEntryItems.length, payload.topExitItems.length, 1);
  const destaquesBody = [];
  for (let i = 0; i < maxDestaques; i++) {
    const entry = payload.topEntryItems[i] 
      ? `${i + 1}. ${payload.topEntryItems[i].name} (${formatQuantity(payload.topEntryItems[i].quantity)} ${payload.topEntryItems[i].unit})` 
      : (i === 0 && payload.topEntryItems.length === 0 ? 'Sem entradas no período.' : '');
    const exit = payload.topExitItems[i]
      ? `${i + 1}. ${payload.topExitItems[i].name} (${formatQuantity(payload.topExitItems[i].quantity)} ${payload.topExitItems[i].unit})`
      : (i === 0 && payload.topExitItems.length === 0 ? 'Sem saídas no período.' : '');
    destaquesBody.push([entry, exit]);
  }

  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    head: [['Top Itens: Maior Entrada', 'Top Itens: Maior Saída']],
    body: destaquesBody,
    headStyles: { fillColor: [140, 36, 168], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { left: 40, right: 40 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 30;

  // 3. Movimentacoes Detalhadas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(95, 17, 117);
  doc.text('3. MOVIMENTAÇÕES DETALHADAS', 40, currentY);
  currentY += 12;

  const movBody = payload.entries.length > 0 
    ? payload.entries.map(e => [
        formatDateLabel(e.date),
        e.name,
        getMovementLabel(e.movementType),
        `${formatQuantity(e.quantity)} ${e.unit}`
      ])
    : [['-', 'Sem movimentacoes no periodo selecionado.', '-', '-']];

  autoTable(doc, {
    startY: currentY,
    theme: 'striped',
    head: [['Data', 'Item', 'Tipo', 'Quantidade']],
    body: movBody,
    headStyles: { fillColor: [95, 17, 117], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 6 },
    alternateRowStyles: { fillColor: [250, 245, 253] },
    margin: { left: 40, right: 40 },
    didParseCell: function(data: any) {
      if (data.section === 'body' && data.column.index === 2) {
        if (data.cell.raw === 'Entrada') {
          data.cell.styles.textColor = [46, 125, 50]; // Green
          data.cell.styles.fontStyle = 'bold';
        } else if (data.cell.raw === 'Saida') {
          data.cell.styles.textColor = [198, 40, 40]; // Red
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 30;

  // 4. Resumo por Item
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(95, 17, 117);
  doc.text('4. RESUMO CONSOLIDADO POR ITEM', 40, currentY);
  currentY += 12;

  const resBody = payload.itemSummaries.length > 0
    ? payload.itemSummaries.map(i => {
        const highlights = [];
        if (i.isTopEntry) highlights.push('Maior entrada');
        if (i.isTopExit) highlights.push('Maior saída');
        return [
          i.name,
          `${formatQuantity(i.totalEntryQuantity)} ${i.unit}`,
          `${formatQuantity(i.totalExitQuantity)} ${i.unit}`,
          i.movementDates.map(d => formatDateLabel(d)).join(', ') || '-',
          highlights.join(' / ') || '-'
        ];
      })
    : [['-', 'Nenhum item movimentado neste periodo.', '-', '-', '-']];

  autoTable(doc, {
    startY: currentY,
    theme: 'striped',
    head: [['Item', 'Total Entradas', 'Total Saídas', 'Datas com movimentação', 'Destaques']],
    body: resBody,
    headStyles: { fillColor: [95, 17, 117], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 6 },
    alternateRowStyles: { fillColor: [250, 245, 253] },
    margin: { left: 40, right: 40 },
    columnStyles: { 3: { cellWidth: 120 } },
    didParseCell: function(data: any) {
      if (data.section === 'body' && data.column.index === 4 && data.cell.raw !== '-') {
         data.cell.styles.textColor = [239, 108, 0]; // Orange highlight
         data.cell.styles.fontStyle = 'bold';
      }
    }
  });

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
