import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import type { NormalizedTransaction, StatementSummary } from '@/types/statement';
import { downloadCSV, downloadXLSX } from '@/services/exportService';

interface Props {
  transactions: NormalizedTransaction[];
  summary: Partial<StatementSummary>;
}

export function ExportPanel({ transactions, summary }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileDown className="w-5 h-5 text-slate-600" />
          <div>
            <h3 className="text-sm font-semibold text-slate-700">
              Export Transactions
            </h3>
            <p className="text-xs text-slate-500">
              Download as Excel or CSV
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadXLSX(transactions, summary)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Download Excel
          </button>

          <button
            onClick={() => downloadCSV(transactions, summary)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 text-sm font-medium rounded-lg border border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Download CSV
          </button>
        </div>
      </div>
    </div>
  );
}
