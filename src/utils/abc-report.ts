import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { DashboardAbcPoint } from '../types/inventory';
import { getTodayLocalDateString } from './date';

type AbcReportOptions = {
  monthLabel: string;
  metricLabel: string;
  viewLabel: string;
};

type AbcReportPayload = {
  generatedAt: Date;
  points: DashboardAbcPoint[];
  options: AbcReportOptions;
  counts: { A: number; B: number; C: number };
};

export type GenerateAbcReportPdfResult = {
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

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function countByClass(points: DashboardAbcPoint[]): { A: number; B: number; C: number } {
  const counts = { A: 0, B: 0, C: 0 };
  for (const point of points) {
    counts[point.abcClass] += 1;
  }
  return counts;
}

function buildPdfHtml(payload: AbcReportPayload): string {
  const itemHeader = payload.options.viewLabel.toLowerCase().includes('categoria') ? 'Categoria' : 'Item';
  const rowsHtml =
    payload.points.length > 0
      ? payload.points
          .map(
            (point, index) => `
              <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHtml(point.name)}</strong></td>
                <td>${escapeHtml(point.abcClass)}</td>
                <td>${escapeHtml(`${formatQuantity(point.metricValue)} und`)}</td>
                <td>${escapeHtml(formatPercent(point.sharePercent))}</td>
                <td>${escapeHtml(formatPercent(point.cumulativePercent))}</td>
              </tr>
            `,
          )
          .join('')
      : `
          <tr>
            <td colspan="6" class="empty-cell">Nenhum item com movimentação para a Curva ABC.</td>
          </tr>
        `;

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Curva ABC</title>
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
          <h1 class="title">Curva ABC</h1>
          <p class="subtitle">Itens priorizados pela Curva ABC (classe A até C)</p>
        </div>

        <section class="meta">
          <div class="meta-item">
            <div class="meta-label">Gerado em</div>
            <div class="meta-value">${escapeHtml(formatDateTime(payload.generatedAt))}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Mês</div>
            <div class="meta-value">${escapeHtml(payload.options.monthLabel)}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Metrica</div>
            <div class="meta-value">${escapeHtml(payload.options.metricLabel)}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Visao</div>
            <div class="meta-value">${escapeHtml(payload.options.viewLabel)}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Total de itens</div>
            <div class="meta-value">${escapeHtml(String(payload.points.length))}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">A / B / C</div>
            <div class="meta-value">${escapeHtml(
              `${payload.counts.A} / ${payload.counts.B} / ${payload.counts.C}`,
            )}</div>
          </div>
        </section>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>${escapeHtml(itemHeader)}</th>
              <th>Classe</th>
              <th>${escapeHtml(payload.options.metricLabel)}</th>
              <th>Participação</th>
              <th>Acumulado</th>
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
  return `curva-abc-${getTodayLocalDateString(referenceDate)}.pdf`;
}

async function generateWebPdf(payload: AbcReportPayload): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const itemHeader = payload.options.viewLabel.toLowerCase().includes('categoria') ? 'Categoria' : 'Item';

  doc.setFillColor(95, 17, 117);
  doc.rect(0, 0, pageWidth, 88, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('CURVA ABC', 40, 55);

  let currentY = 118;

  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    head: [['Campo', 'Valor']],
    body: [
      ['Gerado em', formatDateTime(payload.generatedAt)],
      ['Mês', payload.options.monthLabel],
      ['Metrica', payload.options.metricLabel],
      ['Visao', payload.options.viewLabel],
      ['Total de itens', String(payload.points.length)],
      ['A / B / C', `${payload.counts.A} / ${payload.counts.B} / ${payload.counts.C}`],
    ],
    headStyles: { fillColor: [95, 17, 117], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 140, fillColor: [250, 245, 253] } },
    margin: { left: 40, right: 40 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 24;

  const rows =
    payload.points.length > 0
      ? payload.points.map((point, index) => [
          String(index + 1),
          point.name,
          point.abcClass,
          `${formatQuantity(point.metricValue)} und`,
          formatPercent(point.sharePercent),
          formatPercent(point.cumulativePercent),
        ])
      : [['-', 'Nenhum item com movimentação para a Curva ABC.', '-', '-', '-', '-']];

  autoTable(doc, {
    startY: currentY,
    theme: 'striped',
    head: [['#', itemHeader, 'Classe', payload.options.metricLabel, 'Participação', 'Acumulado']],
    body: rows,
    headStyles: { fillColor: [95, 17, 117], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 6 },
    alternateRowStyles: { fillColor: [250, 245, 253] },
    margin: { left: 40, right: 40 },
    didParseCell: function didParseCell(data: any) {
      if (data.section === 'body' && data.column.index === 2) {
        const raw = String(data.cell.raw);
        if (raw === 'A') {
          data.cell.styles.textColor = [47, 138, 95];
          data.cell.styles.fontStyle = 'bold';
        } else if (raw === 'B') {
          data.cell.styles.textColor = [184, 121, 20];
          data.cell.styles.fontStyle = 'bold';
        } else if (raw === 'C') {
          data.cell.styles.textColor = [183, 54, 54];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  doc.save(buildPdfFileName(payload.generatedAt));
}

export async function generateAbcReportPdf(
  points: DashboardAbcPoint[],
  options: AbcReportOptions,
): Promise<GenerateAbcReportPdfResult> {
  const orderedPoints = [...points].sort((left, right) => left.rank - right.rank);
  const payload: AbcReportPayload = {
    generatedAt: new Date(),
    points: orderedPoints,
    options,
    counts: countByClass(orderedPoints),
  };

  const html = buildPdfHtml(payload);

  if (Platform.OS === 'web') {
    await generateWebPdf(payload);

    return {
      totalItems: payload.points.length,
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
      dialogTitle: 'Compartilhar Curva ABC',
    });
    shared = true;
  } else {
    await Print.printAsync({ html });
  }

  return {
    totalItems: payload.points.length,
    uri: pdfFile.uri,
    shared,
  };
}
