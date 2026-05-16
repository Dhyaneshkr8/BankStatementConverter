export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
        <p>
          Bank Statement Converter &mdash; All processing happens in your
          browser. Your files are never uploaded to any server.
        </p>
        <p>Supports HDFC, SBI, and Chase bank statements.</p>
      </div>
    </footer>
  );
}
