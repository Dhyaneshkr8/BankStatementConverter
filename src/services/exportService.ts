import type { NormalizedTransaction, StatementSummary } from '@/types/statement';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';

interface ExportRow {
  Date: string;
  Description: string;
  Debit: string;
  Credit: string;
  Balance: string;
  Reference: string;
}

function transactionsToRows(transactions: NormalizedTransaction[]): ExportRow[] {
  return transactions.map((t) => ({
    Date: t.date,
    Description: t.description,
    Debit: t.debit != null ? t.debit.toFixed(2) : '',
    Credit: t.credit != null ? t.credit.toFixed(2) : '',
    Balance: t.balance.toFixed(2),
    Reference: t.referenceNumber ?? '',
  }));
}

export function exportToCSV(transactions: NormalizedTransaction[]): string {
  const rows = transactionsToRows(transactions);
  return Papa.unparse(rows, { header: true });
}

export function downloadCSV(
  transactions: NormalizedTransaction[],
  summary?: Partial<StatementSummary>
): void {
  const csv = '\uFEFF' + exportToCSV(transactions); // BOM for Excel UTF-8
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const filename = buildFilename(summary, 'csv');

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadXLSX(
  transactions: NormalizedTransaction[],
  summary?: Partial<StatementSummary>
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Transactions');

  // Summary section
  if (summary) {
    if (summary.bankName) sheet.addRow(['Bank', summary.bankName]);
    if (summary.accountNumber) sheet.addRow(['Account', summary.accountNumber]);
    if (summary.accountType) sheet.addRow(['Type', summary.accountType]);
    if (summary.statementPeriod) {
      sheet.addRow([
        'Period',
        `${summary.statementPeriod.startDate} to ${summary.statementPeriod.endDate}`,
      ]);
    }
    if (summary.currency) sheet.addRow(['Currency', summary.currency]);
    sheet.addRow([]);
  }

  // Header row
  const headerRow = sheet.addRow([
    'Date',
    'Description',
    'Debit',
    'Credit',
    'Balance',
    'Reference',
  ]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  // Data rows
  for (const t of transactions) {
    const row = sheet.addRow([
      t.date,
      t.description,
      t.debit ?? '',
      t.credit ?? '',
      t.balance,
      t.referenceNumber ?? '',
    ]);

    // Format amount columns as numbers
    [3, 4, 5].forEach((col) => {
      const cell = row.getCell(col);
      if (cell.value !== '' && cell.value != null) {
        cell.numFmt = '#,##0.00';
      }
    });
  }

  // Auto-width columns
  sheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const cellLength = cell.value?.toString().length ?? 0;
      if (cellLength > maxLength) maxLength = cellLength;
    });
    column.width = Math.min(maxLength + 2, 50);
  });

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const filename = buildFilename(summary, 'xlsx');

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildFilename(
  summary: Partial<StatementSummary> | undefined,
  ext: string
): string {
  const parts = ['statement'];
  if (summary?.bankName) parts.push(summary.bankName.toLowerCase());
  if (summary?.statementPeriod) {
    parts.push(summary.statementPeriod.startDate);
    parts.push(summary.statementPeriod.endDate);
  }
  return parts.join('_') + '.' + ext;
}
