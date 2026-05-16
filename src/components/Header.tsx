import { FileSpreadsheet, Shield } from 'lucide-react';

export function Header() {
  return (
    <header className="bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <FileSpreadsheet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Bank Statement Converter
            </h1>
            <p className="text-xs text-slate-500">
              Convert PDF bank statements to Excel & CSV
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
          <Shield className="w-3.5 h-3.5 text-green-600" />
          <span className="text-green-700 font-medium">
            Privacy-first — files never leave your browser
          </span>
        </div>
      </div>
    </header>
  );
}
