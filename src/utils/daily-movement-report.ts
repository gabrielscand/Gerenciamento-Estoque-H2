import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getCategoryLabel } from '../constants/categories';
import type { DailyMovementReportItem } from '../types/inventory';
import { formatOriginalAndBaseQuantity } from './unit-conversion';

type DailyMovementReportOptions = {
  periodLabel: string;
  // Sufixo do nome do arquivo (ex.: o dia escolhido "2026-06-08" ou o mes "2026-06").
  fileLabel: string;
};

type DailyMovementReportPayload = {
  generatedAt: Date;
  periodLabel: string;
  fileLabel: string;
  items: DailyMovementReportItem[];
};

export type GenerateDailyMovementReportPdfResult = {
  totalItems: number;
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

function categoryLabelOf(item: DailyMovementReportItem): string {
  return item.category ? getCategoryLabel(item.category) : 'Sem categoria';
}

// Movimentacao (entrada/saida). "-" quando nao houve.
function formatMovement(
  quantity: number,
  baseQuantity: number,
  unit: string,
  conversionFactor: number,
): string {
  if (baseQuantity <= 0) {
    return '-';
  }
  return formatOriginalAndBaseQuantity(quantity, unit, conversionFactor, formatQuantity);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Ordena por categoria (rotulo) e, dentro dela, por nome (ordem alfabetica).
function sortItems(items: DailyMovementReportItem[]): DailyMovementReportItem[] {
  return [...items].sort((left, right) => {
    const byCategory = categoryLabelOf(left).localeCompare(categoryLabelOf(right), 'pt-BR', {
      sensitivity: 'base',
    });
    if (byCategory !== 0) {
      return byCategory;
    }
    return left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });
  });
}

function buildPdfHtml(payload: DailyMovementReportPayload): string {
  const rowsHtml =
    payload.items.length > 0
      ? payload.items
          .map(
            (item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>${escapeHtml(categoryLabelOf(item))}</td>
                <td>${escapeHtml(
                  formatMovement(
                    item.entryQuantity,
                    item.entryQuantityInBaseUnits,
                    item.unit,
                    item.conversionFactor,
                  ),
                )}</td>
                <td>${escapeHtml(
                  formatMovement(
                    item.exitQuantity,
                    item.exitQuantityInBaseUnits,
                    item.unit,
                    item.conversionFactor,
                  ),
                )}</td>
              </tr>
            `,
          )
          .join('')
      : `
          <tr>
            <td colspan="5" class="empty-cell">Nenhuma entrada ou saída no período.</td>
          </tr>
        `;

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Movimentação</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Inter', sans-serif;
            color: #1a1a1a;
            margin: 0;
            padding: 34px;
            background: #fbfcff;
          }
          .header {
            margin-bottom: 24px;
            padding: 18px 20px;
            background: #5f1175;
            color: #ffffff;
            border-radius: 12px;
          }
          .title {
            font-size: 24px;
            font-weight: 800;
            margin: 0 0 6px;
          }
          .subtitle {
            font-size: 13px;
            color: #e7d3f2;
            margin: 0;
          }
          .meta {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            margin: 0 0 18px;
          }
          .meta-item {
            background: #ffffff;
            border: 1px solid #ecdaf8;
            border-radius: 10px;
            padding: 10px 12px;
          }
          .meta-label {
            color: #6f617a;
            font-size: 11px;
            font-weight: 700;
            margin-bottom: 4px;
          }
          .meta-value {
            color: #2a0834;
            font-size: 14px;
            font-weight: 700;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #ecdaf8;
          }
          thead th {
            background: #8c24a8;
            color: #ffffff;
            font-size: 12px;
            font-weight: 700;
            text-align: left;
            padding: 10px 12px;
          }
          td {
            padding: 10px 12px;
            border-top: 1px solid #f2e8fa;
            font-size: 12px;
            color: #40314a;
          }
          tr:nth-child(even) td {
            background: #fcf8ff;
          }
          .empty-cell {
            text-align: center;
            color: #7f718a;
            font-style: italic;
            padding: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">Movimentação</h1>
          <p class="subtitle">Entradas e saídas por categoria (sem ajustes de estoque)</p>
        </div>

        <section class="meta">
          <div class="meta-item">
            <div class="meta-label">Gerado em</div>
            <div class="meta-value">${escapeHtml(formatDateTime(payload.generatedAt))}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Período</div>
            <div class="meta-value">${escapeHtml(payload.periodLabel)}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Total de itens</div>
            <div class="meta-value">${escapeHtml(String(payload.items.length))}</div>
          </div>
        </section>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Categoria</th>
              <th>Entrada</th>
              <th>Saída</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

function buildPdfFileName(fileLabel: string): string {
  return `movimentacao-${fileLabel}.pdf`;
}

async function generateWebPdf(payload: DailyMovementReportPayload): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(95, 17, 117);
  doc.rect(0, 0, pageWidth, 88, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('MOVIMENTAÇÃO', 40, 55);

  let currentY = 118;

  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    head: [['Campo', 'Valor']],
    body: [
      ['Gerado em', formatDateTime(payload.generatedAt)],
      ['Período', payload.periodLabel],
      ['Total de itens', String(payload.items.length)],
    ],
    headStyles: { fillColor: [95, 17, 117], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 140, fillColor: [250, 245, 253] } },
    margin: { left: 40, right: 40 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 24;

  const rows =
    payload.items.length > 0
      ? payload.items.map((item, index) => [
          String(index + 1),
          item.name,
          categoryLabelOf(item),
          formatMovement(
            item.entryQuantity,
            item.entryQuantityInBaseUnits,
            item.unit,
            item.conversionFactor,
          ),
          formatMovement(
            item.exitQuantity,
            item.exitQuantityInBaseUnits,
            item.unit,
            item.conversionFactor,
          ),
        ])
      : [['-', 'Nenhuma entrada ou saída no período.', '-', '-', '-']];

  autoTable(doc, {
    startY: currentY,
    theme: 'striped',
    head: [['#', 'Item', 'Categoria', 'Entrada', 'Saída']],
    body: rows,
    headStyles: { fillColor: [95, 17, 117], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 6 },
    alternateRowStyles: { fillColor: [250, 245, 253] },
    margin: { left: 40, right: 40 },
  });

  doc.save(buildPdfFileName(payload.fileLabel));
}

export async function generateDailyMovementReportPdf(
  items: DailyMovementReportItem[],
  options: DailyMovementReportOptions,
): Promise<GenerateDailyMovementReportPdfResult> {
  const payload: DailyMovementReportPayload = {
    generatedAt: new Date(),
    periodLabel: options.periodLabel,
    fileLabel: options.fileLabel,
    items: sortItems(items),
  };

  const html = buildPdfHtml(payload);

  if (Platform.OS === 'web') {
    await generateWebPdf(payload);

    return {
      totalItems: payload.items.length,
      uri: null,
      shared: false,
    };
  }

  const pdfFile = await Print.printToFileAsync({ html });

  let shared = false;

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(pdfFile.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Compartilhar relatório de movimentação',
    });
    shared = true;
  } else {
    await Print.printAsync({ html });
  }

  return {
    totalItems: payload.items.length,
    uri: pdfFile.uri,
    shared,
  };
}
