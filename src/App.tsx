import { useState, useCallback } from 'react';
import type {
  NormalizedTransaction,
  StatementSummary,
  ValidationResult,
  ProcessingStatus,
} from '@/types/statement';
import { processFile, getSupportedBanks } from '@/services/parsingService';
import type { ProcessingUpdate } from '@/services/parsingService';
import { Header } from '@/components/Header';
import { UploadZone } from '@/components/Upload/UploadZone';
import { ProcessingProgress } from '@/components/Upload/ProcessingProgress';
import { StatementSummaryCard } from '@/components/Preview/StatementSummaryCard';
import { ValidationBanner } from '@/components/Preview/ValidationBanner';
import { TransactionTable } from '@/components/Preview/TransactionTable';
import { ExportPanel } from '@/components/Export/ExportPanel';
import { Footer } from '@/components/Footer';

interface ProcessedData {
  transactions: NormalizedTransaction[];
  summary: Partial<StatementSummary>;
  validation: ValidationResult;
  detectedBank: string;
}

export default function App() {
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState<ProcessingUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProcessedData | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const handleFileUpload = useCallback(async (file: File) => {
    setError(null);
    setData(null);
    setFileName(file.name);
    setStatus('uploaded');

    try {
      const result = await processFile(file, (update) => {
        setStatus(update.status);
        setProgress(update);
      });

      setData({
        transactions: result.transactions,
        summary: result.summary,
        validation: result.validation,
        detectedBank: result.detectedBank,
      });
      setStatus('ready-for-export');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  }, []);

  const handleReset = useCallback(() => {
    setStatus('idle');
    setProgress(null);
    setError(null);
    setData(null);
    setFileName('');
  }, []);

  const handleTransactionEdit = useCallback(
    (index: number, field: keyof NormalizedTransaction, value: string | number | null) => {
      if (!data) return;
      setData((prev) => {
        if (!prev) return prev;
        const updated = [...prev.transactions];
        updated[index] = { ...updated[index]!, [field]: value };
        return { ...prev, transactions: updated };
      });
    },
    [data]
  );

  const isProcessing = ['uploaded', 'bank-detecting', 'extracting-text', 'parsing', 'validating'].includes(status);
  const showResults = status === 'ready-for-export' && data != null;
  const banks = getSupportedBanks();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-4 mb-10">
          {[
            { step: 1, label: 'Upload', active: status === 'idle' || isProcessing },
            { step: 2, label: 'Preview', active: showResults },
            { step: 3, label: 'Export', active: showResults },
          ].map(({ step, label, active }) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step}
              </div>
              <span
                className={`text-sm font-medium ${
                  active ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
              {step < 3 && (
                <div className="w-12 h-px bg-slate-300 mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Upload step */}
        {status === 'idle' && (
          <UploadZone onFileUpload={handleFileUpload} supportedBanks={banks} />
        )}

        {/* Processing indicator */}
        {isProcessing && progress && (
          <ProcessingProgress update={progress} fileName={fileName} />
        )}

        {/* Error state */}
        {status === 'error' && error && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <h3 className="text-red-800 font-semibold text-lg mb-2">Processing Failed</h3>
              <p className="text-red-700 mb-4">{error}</p>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Try Another File
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {showResults && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                Results for{' '}
                <span className="text-blue-600">{fileName}</span>
              </h2>
              <button
                onClick={handleReset}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Convert another file
              </button>
            </div>

            <StatementSummaryCard summary={data.summary} />
            <ValidationBanner validation={data.validation} />
            <ExportPanel
              transactions={data.transactions}
              summary={data.summary}
            />
            <TransactionTable
              transactions={data.transactions}
              onEdit={handleTransactionEdit}
            />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
