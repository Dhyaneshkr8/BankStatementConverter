import { Building2, Calendar, CreditCard, Hash } from 'lucide-react';
import type { StatementSummary } from '@/types/statement';

interface Props {
  summary: Partial<StatementSummary>;
}

export function StatementSummaryCard({ summary }: Props) {
  const items = [
    {
      icon: Building2,
      label: 'Bank',
      value: summary.bankName ?? 'Unknown',
    },
    {
      icon: Hash,
      label: 'Account',
      value: summary.accountNumber
        ? `${summary.accountType ? summary.accountType + ' — ' : ''}${summary.accountNumber}`
        : 'Not detected',
    },
    {
      icon: Calendar,
      label: 'Period',
      value: summary.statementPeriod
        ? `${summary.statementPeriod.startDate} to ${summary.statementPeriod.endDate}`
        : 'Not detected',
    },
    {
      icon: CreditCard,
      label: 'Balance',
      value:
        summary.openingBalance != null && summary.closingBalance != null
          ? `${formatCurrency(summary.openingBalance, summary.currency)} → ${formatCurrency(summary.closingBalance, summary.currency)}`
          : 'Not detected',
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="p-4 flex items-start gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Icon className="w-4 h-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 font-medium">{label}</p>
              <p className="text-sm text-slate-900 font-semibold truncate">
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatCurrency(amount: number, currency?: string): string {
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : '';
  return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
