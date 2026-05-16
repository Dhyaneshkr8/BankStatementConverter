import type { RawTransaction, NormalizedTransaction } from '@/types/statement';
import { parseAmount } from '@/parsers/utils';
import { BALANCE_TOLERANCE } from '@/validation/validator';

/** Convert RawTransaction[] from any parser into NormalizedTransaction[]. */
export function normalize(
  raw: RawTransaction[],
  bankName: string
): NormalizedTransaction[] {
  const now = new Date().toISOString();

  return raw.map((t) => {
    const debit = parseAmount(t.debit as string);
    const credit = parseAmount(t.credit as string);
    const balance = parseAmount(t.balance as string);

    // Ensure debit/credit are stored as absolute values
    const absDebit = debit != null ? Math.abs(debit) : null;
    const absCredit = credit != null ? Math.abs(credit) : null;

    const transactionType = inferTransactionType(t.description, absDebit, absCredit);

    return {
      date: t.date,
      description: t.description,
      debit: absDebit === 0 ? null : absDebit,
      credit: absCredit === 0 ? null : absCredit,
      balance: balance ?? 0,
      referenceNumber: t.referenceNumber,
      transactionType,
      rawText: t.rawText ?? '',
      bankName,
      parsingConfidence: t.parsingConfidence,
      parsedAt: now,
    };
  });
}

/**
 * Infer a human-readable transaction type from description and debit/credit direction.
 * Intentionally lightweight — not a full categorisation engine.
 */
function inferTransactionType(
  description: string,
  debit: number | null,
  credit: number | null
): string {
  const desc = description.toLowerCase();

  if (/\b(upi|neft|rtgs|imps|transfer|trf|xfer)\b/.test(desc)) return 'transfer';
  if (/\b(atm|cash\s*withdrawal|cash\s*wd)\b/.test(desc)) return 'atm_withdrawal';
  if (/\b(salary|sal|payroll)\b/.test(desc)) return 'salary';
  if (/\b(emi|loan\s*repay|loan\s*payment)\b/.test(desc)) return 'loan_payment';
  if (/\b(interest|int\s*cr|interest\s*credit)\b/.test(desc) && credit != null) return 'interest';
  if (/\b(charges?|fee|annual\s*fee|service\s*charge)\b/.test(desc)) return 'charge';

  if (debit != null && credit == null) return 'withdrawal';
  if (credit != null && debit == null) return 'deposit';
  return 'transaction';
}

/**
 * Attempt to infer which amounts are debits vs credits when the parser
 * could not determine column assignment. Uses balance changes as ground truth.
 * Only corrects when the current assignment is clearly wrong (wrong sign of balance delta).
 */
export function inferDebitCredit(
  transactions: NormalizedTransaction[]
): NormalizedTransaction[] {
  for (let i = 1; i < transactions.length; i++) {
    const prev = transactions[i - 1]!;
    const curr = transactions[i]!;

    if (prev.balance === 0 || curr.balance === 0) continue;

    const balanceDiff = curr.balance - prev.balance;

    // If only one side is set, verify it matches the balance delta
    if (curr.debit != null && curr.credit == null) {
      const expectedBalance = prev.balance - curr.debit;
      const diff = Math.abs(expectedBalance - curr.balance);
      // If balance went UP instead of down, this debit is actually a credit
      if (balanceDiff > 0 && diff < BALANCE_TOLERANCE) {
        curr.credit = curr.debit;
        curr.debit = null;
        curr.transactionType = inferTransactionType(curr.description, null, curr.credit);
      }
    } else if (curr.credit != null && curr.debit == null) {
      const expectedBalance = prev.balance + curr.credit;
      const diff = Math.abs(expectedBalance - curr.balance);
      // If balance went DOWN instead of up, this credit is actually a debit
      if (balanceDiff < 0 && diff < BALANCE_TOLERANCE) {
        curr.debit = curr.credit;
        curr.credit = null;
        curr.transactionType = inferTransactionType(curr.description, curr.debit, null);
      }
    } else if (curr.debit != null && curr.credit != null) {
      // Both set: resolve using balance delta
      if (Math.abs(balanceDiff) < BALANCE_TOLERANCE) continue; // no-op row — skip, don't exit
      if (balanceDiff < 0) {
        curr.debit = Math.abs(balanceDiff);
        curr.credit = null;
      } else {
        curr.credit = Math.abs(balanceDiff);
        curr.debit = null;
      }
      curr.transactionType = inferTransactionType(curr.description, curr.debit, curr.credit);
    }
  }

  return transactions;
}
