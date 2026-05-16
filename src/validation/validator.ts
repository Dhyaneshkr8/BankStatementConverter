import type { NormalizedTransaction, ValidationResult, ValidationWarning } from '@/types/statement';

const BALANCE_TOLERANCE = 0.02;

export function validate(transactions: NormalizedTransaction[]): ValidationResult {
  const errors: ValidationWarning[] = [];
  const warnings: ValidationWarning[] = [];

  validateRequiredFields(transactions, errors);
  validateBalanceReconciliation(transactions, warnings);
  validateDateOrdering(transactions, warnings);
  detectDuplicates(transactions, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalTransactions: transactions.length,
      errorCount: errors.length,
      warningCount: warnings.length,
    },
  };
}

function validateRequiredFields(
  transactions: NormalizedTransaction[],
  errors: ValidationWarning[]
): void {
  transactions.forEach((t, i) => {
    if (!t.date) {
      errors.push({ line: i, field: 'date', issue: 'Missing date', severity: 'error' });
    }
    if (!t.description) {
      errors.push({ line: i, field: 'description', issue: 'Missing description', severity: 'error' });
    }
    if (t.debit == null && t.credit == null) {
      errors.push({
        line: i,
        field: 'amount',
        issue: 'Neither debit nor credit amount found',
        severity: 'error',
      });
    }
  });
}

function validateBalanceReconciliation(
  transactions: NormalizedTransaction[],
  warnings: ValidationWarning[]
): void {
  for (let i = 1; i < transactions.length; i++) {
    const prev = transactions[i - 1]!;
    const curr = transactions[i]!;

    if (prev.balance === 0 || curr.balance === 0) continue;

    let expected = prev.balance;
    if (curr.debit != null) expected -= curr.debit;
    if (curr.credit != null) expected += curr.credit;

    const diff = Math.abs(expected - curr.balance);
    if (diff > BALANCE_TOLERANCE) {
      warnings.push({
        line: i,
        field: 'balance',
        issue: `Balance mismatch: expected ${expected.toFixed(2)}, got ${curr.balance.toFixed(2)} (diff: ${diff.toFixed(2)})`,
        severity: 'warning',
      });
    }
  }
}

function validateDateOrdering(
  transactions: NormalizedTransaction[],
  warnings: ValidationWarning[]
): void {
  for (let i = 1; i < transactions.length; i++) {
    const prev = new Date(transactions[i - 1]!.date);
    const curr = new Date(transactions[i]!.date);

    if (isNaN(prev.getTime()) || isNaN(curr.getTime())) continue;

    if (curr < prev) {
      warnings.push({
        line: i,
        field: 'date',
        issue: `Date goes backwards: ${transactions[i - 1]!.date} → ${transactions[i]!.date}`,
        severity: 'warning',
      });
    }
  }
}

function detectDuplicates(
  transactions: NormalizedTransaction[],
  warnings: ValidationWarning[]
): void {
  for (let i = 0; i < transactions.length - 1; i++) {
    const curr = transactions[i]!;
    for (let j = i + 1; j < Math.min(i + 4, transactions.length); j++) {
      const next = transactions[j]!;

      if (
        curr.date === next.date &&
        curr.description === next.description &&
        curr.debit === next.debit &&
        curr.credit === next.credit
      ) {
        warnings.push({
          line: j,
          field: 'transaction',
          issue: 'Possible duplicate transaction',
          severity: 'warning',
        });
      }
    }
  }
}
