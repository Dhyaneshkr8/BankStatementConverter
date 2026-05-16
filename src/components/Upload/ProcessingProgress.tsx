import { Loader2 } from 'lucide-react';
import type { ProcessingUpdate } from '@/services/parsingService';

interface Props {
  update: ProcessingUpdate;
  fileName: string;
}

export function ProcessingProgress({ update, fileName }: Props) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="flex flex-col items-center gap-5">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />

          <div className="text-center">
            <p className="text-lg font-semibold text-slate-800">
              {update.message}
            </p>
            <p className="text-sm text-slate-500 mt-1">{fileName}</p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-md">
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${update.progress ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 text-right mt-1">
              {update.progress ?? 0}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
