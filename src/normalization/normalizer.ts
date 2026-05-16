import type { RawTransaction, NormalizedTransaction } from '@/types/statement';
import { parseAmount } from '@/parsers/utils';

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

    return {
      date: t.date,
      description: t.description,
      debit: debit,
      credit: credit,
      balance: balance ?? 0,
      referenceNumber: t.referenceNumber,
      rawText: t.rawText ?? '',
      bankName,
      parsedAt: now,
    };
  });
}

/**
 * Attempt to infer which amounts are debits vs credits when the parser
 * couldn't determine column assignment. Uses balance changes as ground truth.
 */
export function inferDebitCredit(
  transactions: NormalizedTransaction[]
): NormalizedTransaction[] {
  for (let i = 1; i < transactions.length; i++) {
    const prev = transactions[i - 1]!;
    const curr = transactions[i]!;

    // If both debit and credit are set, try to determine the correct one
    if (curr.debit != null && curr.credit != null && curr.balance !== 0) {
      const balanceDiff = curr.balance - prev.balance;

      if (balanceDiff < 0) {
        // Balance decreased → debit
        curr.debit = Math.abs(balanceDiff);
        curr.credit = null;
      } else if (balanceDiff > 0) {
        // Balance increased → credit
        curr.credit = Math.abs(balanceDiff);
        curr.debit = null;
      }
    }

    // If only debit is set but balance increased, swap to credit
    if (curr.debit != null && curr.credit == null && curr.balance !== 0 && i > 0) {
      const balanceDiff = curr.balance - prev.balance;
      if (balanceDiff > 0 && Math.abs(balanceDiff - curr.debit) < 0.01) {
        curr.credit = curr.debit;
        curr.debit = null;
      }
    }
  }

  return transactions;
}
