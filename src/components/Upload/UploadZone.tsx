import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';

interface Props {
  onFileUpload: (file: File) => void;
  supportedBanks: string[];
}

const ACCEPTED_TYPES = ['application/pdf'];
const MAX_SIZE_MB = 25;

export function UploadZone({ onFileUpload, supportedBanks }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndUpload = useCallback(
    (file: File) => {
      setFileError(null);

      if (!ACCEPTED_TYPES.includes(file.type) && !file.name.endsWith('.pdf')) {
        setFileError('Please upload a PDF file.');
        return;
      }

      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setFileError(`File is too large. Maximum size is ${MAX_SIZE_MB}MB.`);
        return;
      }

      onFileUpload(file);
    },
    [onFileUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndUpload(file);
    },
    [validateAndUpload]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndUpload(file);
    },
    [validateAndUpload]
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${
            dragActive
              ? 'border-blue-500 bg-blue-50 scale-[1.01]'
              : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={handleChange}
          className="hidden"
          aria-label="Upload bank statement PDF"
        />

        <div className="flex flex-col items-center gap-4">
          <div
            className={`p-4 rounded-full transition-colors ${
              dragActive ? 'bg-blue-100' : 'bg-slate-100'
            }`}
          >
            {dragActive ? (
              <FileText className="w-10 h-10 text-blue-600" />
            ) : (
              <Upload className="w-10 h-10 text-slate-400" />
            )}
          </div>

          <div>
            <p className="text-lg font-semibold text-slate-700">
              {dragActive ? 'Drop your file here' : 'Drop your bank statement PDF here'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              or{' '}
              <span className="text-blue-600 font-medium underline">
                click to browse
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            {supportedBanks.map((bank) => (
              <span
                key={bank}
                className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full"
              >
                {bank}
              </span>
            ))}
            <span className="text-xs text-slate-400">supported</span>
          </div>

          <p className="text-xs text-slate-400 mt-1">
            PDF only &middot; Max {MAX_SIZE_MB}MB &middot; Text-based PDFs
            (not scanned)
          </p>
        </div>
      </div>

      {fileError && (
        <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {fileError}
        </div>
      )}
    </div>
  );
}
