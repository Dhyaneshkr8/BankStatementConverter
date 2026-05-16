import type { NormalizedTransaction, ValidationResult, ValidationWarning } from '@/types/statement';

// Matches TECHNICAL_SPEC.md: ±0.01 tolerance on balance reconciliation
const BALANCE_TOLERANCE = 0.01;

export function validate(transactions: NormalizedTransaction[]): ValidationResult {
  const errors: ValidationWarning[] = [];
  const warnings: ValidationWarning[] = [];

  validateRequiredFields(transactions, errors);
  validateDataTypes(transactions, errors);
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

function validateDataTypes(
  transactions: NormalizedTransaction[],
  errors: ValidationWarning[]
): void {
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  transactions.forEach((t, i) => {
    if (t.date && !ISO_DATE_RE.test(t.date)) {
      errors.push({
        line: i,
        field: 'date',
        issue: `Date is not in ISO format (YYYY-MM-DD): "${t.date}"`,
        severity: 'error',
      });
    }

    if (t.date && ISO_DATE_RE.test(t.date)) {
      const parsed = new Date(t.date);
      if (isNaN(parsed.getTime())) {
        errors.push({
          line: i,
          field: 'date',
          issue: `Date is not a valid calendar date: "${t.date}"`,
          severity: 'error',
        });
      }
    }

    if (t.debit != null && (typeof t.debit !== 'number' || isNaN(t.debit) || t.debit < 0)) {
      errors.push({
        line: i,
        field: 'debit',
        issue: `Debit must be a non-negative number, got: ${t.debit}`,
        severity: 'error',
      });
    }

    if (t.credit != null && (typeof t.credit !== 'number' || isNaN(t.credit) || t.credit < 0)) {
      errors.push({
        line: i,
        field: 'credit',
        issue: `Credit must be a non-negative number, got: ${t.credit}`,
        severity: 'error',
      });
    }

    if (t.description && t.description.length > 500) {
      errors.push({
        line: i,
        field: 'description',
        issue: `Description exceeds 500 characters (${t.description.length})`,
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
          issue: `Possible duplicate of row ${i} (same date, description, and amount)`,
          severity: 'warning',
        });
      }
    }
  }
}
