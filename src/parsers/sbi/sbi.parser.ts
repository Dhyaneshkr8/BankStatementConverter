import type { IBankParser, RawTransaction, StatementSummary, ParsingOptions } from '@/types/statement';
import { parseAmount, normalizeDate, cleanDescription, countKeywords } from '../utils';

const SBI_KEYWORDS = [
  'state bank of india',
  'sbi',
  'onlinesbi.com',
  'www.onlinesbi.com',
  'state bank',
];

export class SBIParser implements IBankParser {
  bankName = 'SBI';

  detectBank(rawText: string): number {
    const score = countKeywords(rawText, SBI_KEYWORDS);
    if (score >= 3) return 0.95;
    if (score >= 2) return 0.85;
    if (score === 1) return 0.55;
    return 0;
  }

  async parse(
    rawText: string,
    _options?: ParsingOptions
  ): Promise<{ transactions: RawTransaction[]; summary: Partial<StatementSummary> }> {
    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    const summary = this.extractSummary(lines);
    const transactions = this.extractTransactions(lines);

    return {
      transactions,
      summary: { ...summary, bankName: this.bankName, currency: 'INR' },
    };
  }

  private extractSummary(lines: string[]): Partial<StatementSummary> {
    const summary: Partial<StatementSummary> = {};

    for (const line of lines) {
      const accMatch = line.match(
        /(?:a\/?c|account)\s*(?:no\.?|number|#)?\s*:?\s*(\d[\d\s*X\-]+\d)/i
      );
      if (accMatch) {
        summary.accountNumber = accMatch[1]!.replace(/\s/g, '');
      }

      const periodMatch = line.match(
        /(?:from|period)\s*:?\s*(\d{1,2}[\s/\-][A-Za-z0-9]+[\s/\-]\d{2,4})\s*(?:to|–|-)\s*(\d{1,2}[\s/\-][A-Za-z0-9]+[\s/\-]\d{2,4})/i
      );
      if (periodMatch) {
        summary.statementPeriod = {
          startDate: normalizeDate(periodMatch[1]!),
          endDate: normalizeDate(periodMatch[2]!),
        };
      }

      if (/savings/i.test(line)) summary.accountType = 'Savings';
      else if (/current/i.test(line) && !summary.accountType) summary.accountType = 'Current';

      const nameMatch = line.match(/(?:name|holder)\s*:?\s+(.+)/i);
      if (nameMatch && !summary.accountHolderName) {
        summary.accountHolderName = nameMatch[1]!.trim();
      }
    }

    return summary;
  }

  private extractTransactions(lines: string[]): RawTransaction[] {
    const transactions: RawTransaction[] = [];
    const dateRegex = /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}[\/-][A-Za-z]{3,9}[\/-]\d{2,4})/;

    let lastTransaction: RawTransaction | null = null;
    let pendingDescription = '';

    for (const line of lines) {
      if (/^(?:txn\s*date|date|value\s*date)/i.test(line)) continue;
      if (/^---/.test(line)) continue;

      const dateMatch = line.match(dateRegex);
      if (dateMatch) {
        if (lastTransaction && pendingDescription) {
          lastTransaction.description = cleanDescription(
            lastTransaction.description + ' ' + pendingDescription
          );
          pendingDescription = '';
        }

        const rawDate = dateMatch[1]!;
        const rest = line.slice(dateMatch[0].length).trim();

        // SBI sometimes has two dates (txn date + value date)
        let descriptionStart = rest;
        const secondDateMatch = rest.match(
          /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}[\/-][A-Za-z]{3,9}[\/-]\d{2,4})\s+/
        );
        if (secondDateMatch) {
          descriptionStart = rest.slice(secondDateMatch[0].length);
        }

        const parsed = this.parseTransactionLine(rawDate, descriptionStart);
        if (parsed) {
          if (/opening\s*bal/i.test(parsed.description)) continue;
          lastTransaction = parsed;
          transactions.push(parsed);
        }
      } else if (lastTransaction) {
        const hasAmounts = /\d{1,3}(?:,\d{2,3})*\.\d{2}/.test(line);
        if (!hasAmounts && line.length < 100) {
          pendingDescription += ' ' + line;
        }
      }
    }

    if (lastTransaction && pendingDescription) {
      lastTransaction.description = cleanDescription(
        lastTransaction.description + ' ' + pendingDescription
      );
    }

    return transactions;
  }

  private parseTransactionLine(rawDate: string, rest: string): RawTransaction | null {
    const amountRegex = /(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)/g;
    const amounts: { value: string; index: number }[] = [];
    let match: RegExpExecArray | null;

    while ((match = amountRegex.exec(rest)) !== null) {
      // Skip very small numbers likely part of description (ref numbers, etc.)
      if (match[1]!.replace(/,/g, '').length >= 2 || parseFloat(match[1]!) >= 10) {
        amounts.push({ value: match[1]!, index: match.index });
      }
    }

    if (amounts.length === 0) return null;

    let description: string;
    let debit: string | null = null;
    let credit: string | null = null;
    let balance: string | null = null;

    if (amounts.length >= 3) {
      const firstAmountIdx = amounts[amounts.length - 3]!.index;
      description = rest.slice(0, firstAmountIdx).trim();
      debit = amounts[amounts.length - 3]!.value;
      credit = amounts[amounts.length - 2]!.value;
      balance = amounts[amounts.length - 1]!.value;
    } else if (amounts.length === 2) {
      const firstAmountIdx = amounts[0]!.index;
      description = rest.slice(0, firstAmountIdx).trim();
      debit = amounts[0]!.value;
      balance = amounts[1]!.value;
    } else {
      description = rest.replace(amountRegex, '').trim();
      balance = amounts[0]!.value;
      if (!description) return null;
    }

    const debitNum = parseAmount(debit);
    const creditNum = parseAmount(credit);

    return {
      date: normalizeDate(rawDate),
      description: cleanDescription(description || 'Transaction'),
      debit: debitNum === 0 ? null : (debit ?? null),
      credit: creditNum === 0 ? null : (credit ?? null),
      balance: balance ?? undefined,
      rawText: `${rawDate} ${rest}`,
    };
  }
}
