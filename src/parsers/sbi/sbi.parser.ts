import type { IBankParser, RawTransaction, StatementSummary, ParsingOptions } from '@/types/statement';
import { parseAmount, normalizeDate, cleanDescription, countKeywords, parseAmountWithSuffix } from '../utils';

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
    // SBI statements may use a single combined Debit/Credit column with Dr/Cr suffix.
    // Check for that pattern first.
    const drCrMatch = rest.match(
      /^(.+?)\s+(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)\s*(Dr\.?|Cr\.?)\s+(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)$/i
    );
    if (drCrMatch) {
      const { isDebit } = parseAmountWithSuffix(`${drCrMatch[2]} ${drCrMatch[3]}`);
      return {
        date: normalizeDate(rawDate),
        description: cleanDescription(drCrMatch[1]!),
        debit: isDebit ? drCrMatch[2]! : null,
        credit: isDebit === false ? drCrMatch[2]! : null,
        balance: drCrMatch[4],
        rawText: `${rawDate} ${rest}`,
        parsingConfidence: 0.85,
      };
    }

    // Standard multi-column format
    const amountRegex = /(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)/g;
    const amounts: { value: string; index: number }[] = [];
    let match: RegExpExecArray | null;

    while ((match = amountRegex.exec(rest)) !== null) {
      // Filter out very short numbers that are likely part of reference codes
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
      const v1 = amounts[amounts.length - 3]!.value;
      const v2 = amounts[amounts.length - 2]!.value;
      balance = amounts[amounts.length - 1]!.value;

      const n1 = parseAmount(v1) ?? 0;
      const n2 = parseAmount(v2) ?? 0;

      // Same zero-check logic as HDFC: only one column has a non-zero value
      if (n1 > 0 && n2 === 0) {
        debit = v1;
        credit = null;
      } else if (n2 > 0 && n1 === 0) {
        credit = v2;
        debit = null;
      } else {
        debit = v1;
        credit = v2;
      }
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

    return {
      date: normalizeDate(rawDate),
      description: cleanDescription(description || 'Transaction'),
      debit,
      credit,
      balance: balance ?? undefined,
      rawText: `${rawDate} ${rest}`,
      parsingConfidence: 0.85,
    };
  }
}
