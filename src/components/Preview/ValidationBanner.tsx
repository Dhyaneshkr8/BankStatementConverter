import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { ValidationResult } from '@/types/statement';

interface Props {
  validation: ValidationResult;
}

export function ValidationBanner({ validation }: Props) {
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 text-sm">
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
        <div>
          <span className="font-semibold">All checks passed.</span>{' '}
          {validation.summary.totalTransactions} transactions extracted
          successfully.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {validation.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-800 mb-2">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="font-semibold text-sm">
              {validation.errors.length} error
              {validation.errors.length > 1 ? 's' : ''} found
            </span>
          </div>
          <ul className="space-y-1 text-sm text-red-700 ml-7">
            {validation.errors.slice(0, 5).map((e, i) => (
              <li key={i}>
                Row {e.line + 1}: {e.issue}
              </li>
            ))}
            {validation.errors.length > 5 && (
              <li className="text-red-500">
                ...and {validation.errors.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-800 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <span className="font-semibold text-sm">
              {validation.warnings.length} warning
              {validation.warnings.length > 1 ? 's' : ''}
            </span>
          </div>
          <ul className="space-y-1 text-sm text-amber-700 ml-7">
            {validation.warnings.slice(0, 5).map((w, i) => (
              <li key={i}>
                Row {w.line + 1}: {w.issue}
              </li>
            ))}
            {validation.warnings.length > 5 && (
              <li className="text-amber-500">
                ...and {validation.warnings.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
