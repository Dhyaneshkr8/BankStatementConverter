import type { IBankParser, RawTransaction, StatementSummary, ParsingOptions } from '@/types/statement';
import { parseAmount, normalizeDate, cleanDescription, countKeywords } from '../utils';

const HDFC_KEYWORDS = [
  'hdfc bank',
  'hdfcbank.com',
  'hdfc bank limited',
  'www.hdfcbank.com',
];

const HEADER_PATTERNS = [
  /date\s+(?:narration|particulars|description)/i,
  /(?:withdrawal|debit)\s+(?:amt|amount)/i,
  /(?:deposit|credit)\s+(?:amt|amount)/i,
  /closing\s+balance/i,
];

export class HDFCParser implements IBankParser {
  bankName = 'HDFC';

  detectBank(rawText: string): number {
    const keywordScore = countKeywords(rawText, HDFC_KEYWORDS);
    const headerScore = HEADER_PATTERNS.filter((p) => p.test(rawText)).length;

    if (keywordScore >= 2) return 0.95;
    if (keywordScore === 1 && headerScore >= 1) return 0.85;
    if (keywordScore === 1) return 0.6;
    if (headerScore >= 2) return 0.3;
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
      // Account number
      const accMatch = line.match(/(?:a\/?c|account)\s*(?:no\.?|number|#)?\s*:?\s*(\d[\d\sX*\-]+\d)/i);
      if (accMatch) {
        summary.accountNumber = accMatch[1]!.replace(/\s/g, '');
      }

      // Account holder name (typically after "Mr./Mrs./Ms." or before account line)
      const nameMatch = line.match(/(?:mr\.?|mrs\.?|ms\.?|m\/s)\s+(.+)/i);
      if (nameMatch && !summary.accountHolderName) {
        summary.accountHolderName = nameMatch[1]!.trim();
      }

      // Statement period
      const periodMatch = line.match(
        /(?:period|from)\s*:?\s*(\d{1,2}[\s/\-][A-Za-z0-9]+[\s/\-]\d{2,4})\s*(?:to|–|-|thru)\s*(\d{1,2}[\s/\-][A-Za-z0-9]+[\s/\-]\d{2,4})/i
      );
      if (periodMatch) {
        summary.statementPeriod = {
          startDate: normalizeDate(periodMatch[1]!),
          endDate: normalizeDate(periodMatch[2]!),
        };
      }

      // Account type
      if (/savings/i.test(line)) summary.accountType = 'Savings';
      else if (/current/i.test(line) && !summary.accountType) summary.accountType = 'Current';
    }

    return summary;
  }

  private extractTransactions(lines: string[]): RawTransaction[] {
    const transactions: RawTransaction[] = [];

    // HDFC has varied formats. Match lines starting with a date.
    // Typical: DD/MM/YYYY <description> <debit> <credit> <balance>
    // or columns separated by whitespace with amounts at the end.

    const dateRegex = /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}[\/-][A-Za-z]{3,9}[\/-]\d{2,4})/;

    let pendingDescription = '';
    let lastTransaction: RawTransaction | null = null;

    for (const line of lines) {
      // Skip header rows and known non-transaction lines
      if (/^date\s/i.test(line) || /^particulars/i.test(line) || /---/.test(line)) continue;
      if (/opening\s+balance/i.test(line) && !/\d{1,2}[\/-]/.test(line.slice(0, 12))) continue;

      const dateMatch = line.match(dateRegex);
      if (dateMatch) {
        // Save any pending multi-line description
        if (lastTransaction && pendingDescription) {
          lastTransaction.description = cleanDescription(
            lastTransaction.description + ' ' + pendingDescription
          );
          pendingDescription = '';
        }

        const rawDate = dateMatch[1]!;
        const rest = line.slice(dateMatch[0].length).trim();
        const parsed = this.parseTransactionLine(rawDate, rest);

        if (parsed) {
          lastTransaction = parsed;
          transactions.push(parsed);
        }
      } else if (lastTransaction) {
        // Continuation line (multi-line description)
        const hasNumbers = /\d{1,3}(?:,\d{2,3})*\.\d{2}/.test(line);
        if (!hasNumbers && line.length < 100) {
          pendingDescription += ' ' + line;
        }
      }
    }

    // Flush last pending description
    if (lastTransaction && pendingDescription) {
      lastTransaction.description = cleanDescription(
        lastTransaction.description + ' ' + pendingDescription
      );
    }

    return transactions;
  }

  private parseTransactionLine(rawDate: string, rest: string): RawTransaction | null {
    // Try to extract amounts from the end of the line.
    // Look for patterns like: description  10,000.00  40,000.00
    // Numbers can have commas and are typically at the end.

    const amountRegex = /(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)/g;
    const amounts: { value: string; index: number }[] = [];
    let match: RegExpExecArray | null;

    while ((match = amountRegex.exec(rest)) !== null) {
      amounts.push({ value: match[1]!, index: match.index });
    }

    if (amounts.length === 0) return null;

    let description: string;
    let debit: string | null = null;
    let credit: string | null = null;
    let balance: string | null = null;

    if (amounts.length >= 3) {
      // description + debit + credit + balance (or description + amount + balance)
      const firstAmountIdx = amounts[amounts.length - 3]!.index;
      description = rest.slice(0, firstAmountIdx).trim();
      const v1 = amounts[amounts.length - 3]!.value;
      const v2 = amounts[amounts.length - 2]!.value;
      balance = amounts[amounts.length - 1]!.value;

      // Determine which is debit vs credit based on position gap
      // In HDFC, if one of the middle values is in the "debit" column it's debit
      debit = v1;
      credit = v2;
    } else if (amounts.length === 2) {
      const firstAmountIdx = amounts[0]!.index;
      description = rest.slice(0, firstAmountIdx).trim();
      // Amount + balance
      debit = amounts[0]!.value;
      balance = amounts[1]!.value;
    } else {
      // Single amount — treat as balance row or skip
      description = rest.replace(amountRegex, '').trim();
      balance = amounts[0]!.value;

      if (/opening|closing/i.test(description)) {
        return null;
      }
    }

    // Clean up: if debit is "0" or matches balance, it might actually be credit
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
