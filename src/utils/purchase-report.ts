import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getCategoryLabel } from '../constants/categories';
import { listStockCurrentOverview } from '../database/items.repository';
import { syncAppData } from '../database/sync.service';
import type { StockCurrentOverviewRow } from '../types/inventory';
import { getTodayLocalDateString } from './date';

type PurchaseReportItem = {
  id: number;
  name: string;
  unit: string;
  category: string | null;
  minQuantity: number;
  currentStockQuantity: number | null;
  missingQuantity: number;
};

type PurchaseReportPayload = {
  generatedAt: Date;
  items: PurchaseReportItem[];
  totalMissingQuantity: number;
};

export type GeneratePurchaseReportPdfResult = {
  totalItems: number;
  totalMissingQuantity: number;
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

function getStatusLabel(item: PurchaseReportItem): string {
  if (item.missingQuantity > 0) {
    return `Faltam ${formatQuantity(item.missingQuantity)} ${item.unit}`;
  }

  return 'No minimo (comprar)';
}

function collectPurchaseItems(items: StockCurrentOverviewRow[]): PurchaseReportItem[] {
  return items
    .filter((item) => item.needsPurchase)
    .sort(
      (left, right) =>
        right.missingQuantity - left.missingQuantity ||
        left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      category: item.category,
      minQuantity: item.minQuantity,
      currentStockQuantity: item.currentStockQuantity,
      missingQuantity: item.missingQuantity,
    }));
}

function buildPdfHtml(payload: PurchaseReportPayload): string {
  const rowsHtml =
    payload.items.length > 0
      ? payload.items
          .map(
            (item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>${escapeHtml(item.category ? getCategoryLabel(item.category) : 'Sem categoria')}</td>
                <td>${escapeHtml(formatQuantity(item.currentStockQuantity ?? 0))} ${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(formatQuantity(item.minQuantity))} ${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(formatQuantity(item.missingQuantity))} ${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(getStatusLabel(item))}</td>
              </tr>
            `,
          )
          .join('')
      : `
          <tr>
            <td colspan="7" class="empty-cell">Nenhum item para compra no momento.</td>
          </tr>
        `;

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Lista de Compras</title>
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
          <h1 class="title">Lista de Compras</h1>
          <p class="subtitle">Itens abaixo ou no limite minimo para reposicao</p>
        </div>

        <section class="meta">
          <div class="meta-item">
            <div class="meta-label">Gerado em</div>
            <div class="meta-value">${escapeHtml(formatDateTime(payload.generatedAt))}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Itens para comprar</div>
            <div class="meta-value">${escapeHtml(String(payload.items.length))}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Faltante total</div>
            <div class="meta-value">${escapeHtml(formatQuantity(payload.totalMissingQuantity))}</div>
          </div>
        </section>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Categoria</th>
              <th>Estoque atual</th>
              <th>Minimo</th>
              <th>Faltante</th>
              <th>Status</th>
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

function buildPdfFileName(referenceDate: Date): string {
  return `lista-compras-${getTodayLocalDateString(referenceDate)}.pdf`;
}

async function generateWebPdf(payload: PurchaseReportPayload): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(95, 17, 117);
  doc.rect(0, 0, pageWidth, 88, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('LISTA DE COMPRAS', 40, 55);

  let currentY = 118;

  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    head: [['Campo', 'Valor']],
    body: [
      ['Gerado em', formatDateTime(payload.generatedAt)],
      ['Itens para comprar', String(payload.items.length)],
      ['Faltante total', formatQuantity(payload.totalMissingQuantity)],
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
          item.category ? getCategoryLabel(item.category) : 'Sem categoria',
          `${formatQuantity(item.currentStockQuantity ?? 0)} ${item.unit}`,
          `${formatQuantity(item.minQuantity)} ${item.unit}`,
          `${formatQuantity(item.missingQuantity)} ${item.unit}`,
          getStatusLabel(item),
        ])
      : [['-', 'Nenhum item para compra no momento.', '-', '-', '-', '-', '-']];

  autoTable(doc, {
    startY: currentY,
    theme: 'striped',
    head: [['#', 'Item', 'Categoria', 'Estoque atual', 'Minimo', 'Faltante', 'Status']],
    body: rows,
    headStyles: { fillColor: [95, 17, 117], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 6 },
    alternateRowStyles: { fillColor: [250, 245, 253] },
    margin: { left: 40, right: 40 },
    didParseCell: function didParseCell(data: any) {
      if (data.section === 'body' && data.column.index === 6) {
        if (String(data.cell.raw).includes('Faltam')) {
          data.cell.styles.textColor = [176, 35, 35];
          data.cell.styles.fontStyle = 'bold';
        } else if (String(data.cell.raw).includes('No minimo')) {
          data.cell.styles.textColor = [122, 66, 12];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  doc.save(buildPdfFileName(payload.generatedAt));
}

export async function generatePurchaseReportPdf(): Promise<GeneratePurchaseReportPdfResult> {
  const syncOk = await syncAppData();

  if (!syncOk) {
    throw new Error('Falha ao sincronizar com o Supabase. Nao foi possivel gerar a lista de compras.');
  }

  const items = collectPurchaseItems(await listStockCurrentOverview());
  const payload: PurchaseReportPayload = {
    generatedAt: new Date(),
    items,
    totalMissingQuantity: items.reduce((sum, item) => sum + item.missingQuantity, 0),
  };

  const html = buildPdfHtml(payload);

  if (Platform.OS === 'web') {
    await generateWebPdf(payload);

    return {
      totalItems: payload.items.length,
      totalMissingQuantity: payload.totalMissingQuantity,
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
      dialogTitle: 'Compartilhar lista de compras',
    });
    shared = true;
  } else {
    await Print.printAsync({ html });
  }

  return {
    totalItems: payload.items.length,
    totalMissingQuantity: payload.totalMissingQuantity,
    uri: pdfFile.uri,
    shared,
  };
}
