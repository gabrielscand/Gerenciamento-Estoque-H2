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
import { formatDateLabel, getTodayLocalDateString, isValidDateString } from './date';

type ReportDateRange = {
  startDate: string;
  endDate: string;
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

function resolveDateRange(period: HistoryReportPeriod, referenceDate: Date = new Date()): ReportDateRange {
  const today = getTodayLocalDateString(referenceDate);

  if (period === 'diario') {
    return {
      startDate: today,
      endDate: today,
    };
  }

  if (period === 'quinzenal') {
    return {
      startDate: shiftIsoDate(today, -14),
      endDate: today,
    };
  }

  return {
    startDate: shiftIsoDate(today, -29),
    endDate: today,
  };
}

function getPeriodMeta(period: HistoryReportPeriod): ReportPeriodMeta {
  if (period === 'diario') {
    return {
      reportTitle: 'Relatorio Diario de Movimentacoes',
      periodLabel: 'Diario',
    };
  }

  if (period === 'quinzenal') {
    return {
      reportTitle: 'Relatorio Quinzenal de Movimentacoes',
      periodLabel: 'Quinzenal (ultimos 15 dias)',
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
  const periodMeta = getPeriodMeta(payload.period);
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

export async function generateHistoryReportPdf(
  period: HistoryReportPeriod,
): Promise<GenerateHistoryReportPdfResult> {
  const syncOk = await syncAppData();

  if (!syncOk) {
    throw new Error('Falha ao sincronizar com o Supabase. Nao foi possivel gerar o relatorio.');
  }

  const { startDate, endDate } = resolveDateRange(period);
  const entries = await listHistoryEntriesByDateRange(startDate, endDate);
  const itemSummaries = buildItemSummaries(entries);
  const topEntryItems = getTopItems(itemSummaries, 'entry', 5);
  const topExitItems = getTopItems(itemSummaries, 'exit', 5);
  const generatedAt = new Date();

  const html = buildPdfHtml({
    period,
    startDate,
    endDate,
    generatedAt,
    entries,
    topEntryItems,
    topExitItems,
    itemSummaries,
  });

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });

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
