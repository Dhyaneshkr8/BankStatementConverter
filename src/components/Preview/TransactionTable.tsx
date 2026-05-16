import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Check } from 'lucide-react';
import type { NormalizedTransaction } from '@/types/statement';

interface Props {
  transactions: NormalizedTransaction[];
  onEdit: (index: number, field: keyof NormalizedTransaction, value: string | number | null) => void;
}

const PAGE_SIZE = 25;

export function TransactionTable({ transactions, onEdit }: Props) {
  const [page, setPage] = useState(0);
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const totalPages = Math.ceil(transactions.length / PAGE_SIZE);

  let sorted = [...transactions.map((t, i) => ({ ...t, _idx: i }))];
  if (sortField) {
    sorted.sort((a, b) => {
      const aVal = (a as any)[sortField];
      const bVal = (b as any)[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }

  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const startEdit = (row: number, field: string, currentValue: string | number | null) => {
    setEditingCell({ row, field });
    setEditValue(currentValue?.toString() ?? '');
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const { row, field } = editingCell;

    let value: string | number | null = editValue;
    if (['debit', 'credit', 'balance'].includes(field)) {
      value = editValue === '' ? null : parseFloat(editValue);
    }
    onEdit(row, field as keyof NormalizedTransaction, value);
    setEditingCell(null);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortAsc ? (
      <ChevronUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-0.5" />
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          Transactions ({transactions.length})
        </h3>
        <p className="text-xs text-slate-400">
          Click any cell to edit &middot; Page {page + 1} of {totalPages}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-3 font-medium w-10">#</th>
              {[
                { key: 'date', label: 'Date', w: 'w-28' },
                { key: 'description', label: 'Description', w: '' },
                { key: 'debit', label: 'Debit', w: 'w-28' },
                { key: 'credit', label: 'Credit', w: 'w-28' },
                { key: 'balance', label: 'Balance', w: 'w-32' },
              ].map(({ key, label, w }) => (
                <th
                  key={key}
                  className={`px-4 py-3 font-medium cursor-pointer hover:text-slate-700 ${w}`}
                  onClick={() => handleSort(key)}
                >
                  {label}
                  <SortIcon field={key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageItems.map((t, i) => {
              const realIdx = t._idx;
              return (
                <tr
                  key={realIdx}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-2.5 text-slate-400 text-xs">
                    {realIdx + 1}
                  </td>
                  {renderCell(realIdx, 'date', t.date, 'text-slate-700')}
                  {renderCell(realIdx, 'description', t.description, 'text-slate-800 max-w-xs truncate')}
                  {renderCell(realIdx, 'debit', t.debit, 'text-red-600 font-mono tabular-nums')}
                  {renderCell(realIdx, 'credit', t.credit, 'text-green-600 font-mono tabular-nums')}
                  {renderCell(realIdx, 'balance', t.balance, 'text-slate-900 font-mono font-medium tabular-nums')}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            Showing {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, transactions.length)} of{' '}
            {transactions.length}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );

  function renderCell(
    rowIdx: number,
    field: string,
    value: string | number | null,
    className: string
  ) {
    const isEditing =
      editingCell?.row === rowIdx && editingCell?.field === field;

    if (isEditing) {
      return (
        <td className="px-4 py-1">
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditingCell(null);
              }}
              className="w-full px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              onClick={commitEdit}
              className="p-1 text-blue-600 hover:text-blue-800"
              aria-label="Save edit"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      );
    }

    const display =
      value == null
        ? ''
        : typeof value === 'number'
          ? value.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : value;

    return (
      <td
        className={`px-4 py-2.5 group cursor-pointer ${className}`}
        onClick={() => startEdit(rowIdx, field, value)}
        title="Click to edit"
      >
        <span className="flex items-center gap-1">
          {display || <span className="text-slate-300">—</span>}
          <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </span>
      </td>
    );
  }
}
