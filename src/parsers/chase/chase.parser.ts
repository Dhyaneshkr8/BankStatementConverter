import type { IBankParser, RawTransaction, StatementSummary, ParsingOptions } from '@/types/statement';
import { parseAmount, normalizeDate, cleanDescription, countKeywords } from '../utils';

const CHASE_KEYWORDS = [
  'chase',
  'jpmorgan',
  'jpmorgan chase',
  'chase bank',
  'chase.com',
];

export class ChaseParser implements IBankParser {
  bankName = 'Chase';

  detectBank(rawText: string): number {
    const score = countKeywords(rawText, CHASE_KEYWORDS);
    if (score >= 2) return 0.95;
    if (score === 1) return 0.7;
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
      summary: { ...summary, bankName: this.bankName, currency: 'USD' },
    };
  }

  private extractSummary(lines: string[]): Partial<StatementSummary> {
    const summary: Partial<StatementSummary> = {};

    for (const line of lines) {
      const accMatch = line.match(
        /(?:account|acct)\s*(?:#|number|no\.?)?\s*:?\s*([\d*X\-]+\d)/i
      );
      if (accMatch) {
        summary.accountNumber = accMatch[1]!.replace(/\s/g, '');
      }

      const periodMatch = line.match(
        /(?:through|thru|from)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*(?:to|through|thru|–|-)\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
      );
      if (periodMatch) {
        summary.statementPeriod = {
          startDate: this.parseUSDate(periodMatch[1]!),
          endDate: this.parseUSDate(periodMatch[2]!),
        };
      }

      // Also try MM/DD/YYYY - MM/DD/YYYY
      const numPeriodMatch = line.match(
        /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:to|through|thru|–|-)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
      );
      if (numPeriodMatch && !summary.statementPeriod) {
        summary.statementPeriod = {
          startDate: normalizeDate(numPeriodMatch[1]!, true),
          endDate: normalizeDate(numPeriodMatch[2]!, true),
        };
      }

      if (/checking/i.test(line)) summary.accountType = 'Checking';
      else if (/savings/i.test(line) && !summary.accountType) summary.accountType = 'Savings';

      const nameMatch = line.match(/^([A-Z][A-Z\s]+)$/);
      if (nameMatch && !summary.accountHolderName && nameMatch[1]!.length > 3) {
        summary.accountHolderName = nameMatch[1]!.trim();
      }
    }

    return summary;
  }

  private parseUSDate(dateStr: string): string {
    // "January 1, 2026" or "Jan 1, 2026"
    const match = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (match) {
      const monthNames: Record<string, string> = {
        january: '01', jan: '01', february: '02', feb: '02',
        march: '03', mar: '03', april: '04', apr: '04',
        may: '05', june: '06', jun: '06', july: '07', jul: '07',
        august: '08', aug: '08', september: '09', sep: '09', sept: '09',
        october: '10', oct: '10', november: '11', nov: '11',
        december: '12', dec: '12',
      };
      const month = monthNames[match[1]!.toLowerCase()];
      if (month) {
        return `${match[3]}-${month}-${match[2]!.padStart(2, '0')}`;
      }
    }
    return dateStr;
  }

  private extractTransactions(lines: string[]): RawTransaction[] {
    const transactions: RawTransaction[] = [];
    // Chase US format: MM/DD or MM/DD/YYYY
    const dateRegex = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+/;

    let lastTransaction: RawTransaction | null = null;
    let pendingDescription = '';
    // Track year from statement period for MM/DD-only dates
    const currentYear = new Date().getFullYear();

    for (const line of lines) {
      if (/^date\s/i.test(line) || /^description/i.test(line)) continue;
      if (/---/.test(line)) continue;

      const dateMatch = line.match(dateRegex);
      if (dateMatch) {
        if (lastTransaction && pendingDescription) {
          lastTransaction.description = cleanDescription(
            lastTransaction.description + ' ' + pendingDescription
          );
          pendingDescription = '';
        }

        let rawDate = dateMatch[1]!;
        // If date is MM/DD without year, append current year
        if (rawDate.split('/').length === 2) {
          rawDate += `/${currentYear}`;
        }

        const rest = line.slice(dateMatch[0].length).trim();
        const parsed = this.parseTransactionLine(rawDate, rest);

        if (parsed) {
          if (/(?:opening|beginning)\s*balance/i.test(parsed.description)) continue;
          lastTransaction = parsed;
          transactions.push(parsed);
        }
      } else if (lastTransaction) {
        const hasAmounts = /\$?\d{1,3}(?:,\d{3})*\.\d{2}/.test(line);
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
    // Chase amounts: may have leading $ or -, e.g. "-$1,234.56" or "$500.00"
    const amountRegex = /(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})/g;
    const amounts: { value: string; numericValue: number; index: number }[] = [];
    let match: RegExpExecArray | null;

    while ((match = amountRegex.exec(rest)) !== null) {
      const numericValue = parseAmount(match[1]!) ?? 0;
      amounts.push({ value: match[1]!, numericValue, index: match.index });
    }

    if (amounts.length === 0) return null;

    let description: string;
    let debit: string | null = null;
    let credit: string | null = null;
    let balance: string | null = null;

    if (amounts.length >= 3) {
      const firstAmountIdx = amounts[amounts.length - 3]!.index;
      description = rest.slice(0, firstAmountIdx).trim();
      const v1 = amounts[amounts.length - 3]!;
      const v2 = amounts[amounts.length - 2]!;
      balance = amounts[amounts.length - 1]!.value;

      // Negative = debit (withdrawal), positive = credit (deposit)
      if (v1.numericValue < 0) {
        debit = v1.value;
        credit = v2.numericValue > 0 ? v2.value : null;
      } else if (v2.numericValue < 0) {
        debit = v2.value;
        credit = v1.numericValue > 0 ? v1.value : null;
      } else {
        // Both positive: use column heuristic — first is debit, second is credit
        debit = v1.value;
        credit = v2.value;
      }
    } else if (amounts.length === 2) {
      const firstAmountIdx = amounts[0]!.index;
      description = rest.slice(0, firstAmountIdx).trim();
      const v = amounts[0]!;
      balance = amounts[1]!.value;

      // Negative → debit; positive → could be either, leave for inferDebitCredit
      if (v.numericValue < 0) {
        debit = v.value;
      } else {
        debit = v.value; // inferDebitCredit will correct based on balance delta
      }
    } else {
      // Single amount — no balance column
      description = rest.replace(amountRegex, '').trim();
      const v = amounts[0]!;
      if (v.numericValue < 0) {
        debit = v.value;
      } else {
        credit = v.value;
      }
    }

    // Ensure debit values stored as positive numbers for consistency
    const debitNum = debit != null ? Math.abs(parseAmount(debit) ?? 0) : null;
    const creditNum = credit != null ? Math.abs(parseAmount(credit) ?? 0) : null;

    return {
      date: normalizeDate(rawDate, true),
      description: cleanDescription(description || 'Transaction'),
      debit: debitNum === 0 ? null : (debitNum != null ? debitNum.toString() : null),
      credit: creditNum === 0 ? null : (creditNum != null ? creditNum.toString() : null),
      balance: balance ?? undefined,
      rawText: `${rawDate} ${rest}`,
      parsingConfidence: 0.85,
    };
  }
}
