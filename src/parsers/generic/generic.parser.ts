import type {
  IBankParser,
  RawTransaction,
  StatementSummary,
  ParsingOptions,
  WordPosition,
} from '@/types/statement';
import { parseAmount, normalizeDate, cleanDescription } from '../utils';

/**
 * GenericParser — three-tier fallback for unrecognised bank statements.
 *
 * Tier 1 (Position): Groups word positions by Y-coordinate to reconstruct
 *   table rows, then maps columns by X-coordinate cluster to Date/Description/
 *   Debit/Credit/Balance. Works on any digitally-generated PDF.
 *
 * Tier 2 (Text heuristic): Falls back to line-by-line regex when no word
 *   position data is available (e.g. pdfjs plain-text extraction path).
 *
 * Registered with detectBank() confidence 0.10 — always lower than any
 * specific parser, so it only activates when nothing else matches.
 */
export class GenericParser implements IBankParser {
  bankName = 'Generic';

  detectBank(_rawText: string): number {
    return 0.10; // Always eligible but always yields to specific parsers
  }

  async parse(
    rawText: string,
    options?: ParsingOptions
  ): Promise<{ transactions: RawTransaction[]; summary: Partial<StatementSummary> }> {
    const words = options?.wordPositions?.words;

    if (words && words.length > 0) {
      const result = this.parseByPosition(words);
      if (result.length > 0) {
        return {
          transactions: result,
          summary: { bankName: this.bankName },
        };
      }
    }

    // Tier 2: text heuristic
    return {
      transactions: this.parseByText(rawText),
      summary: { bankName: this.bankName },
    };
  }

  // ── Tier 1: Position-based ──────────────────────────────────────────────

  private parseByPosition(words: WordPosition[]): RawTransaction[] {
    // Group words into rows by Y-coordinate (±4pt tolerance)
    const rows = this.groupWordsIntoRows(words, 4);

    // Find header row
    const headerIdx = rows.findIndex((row) => this.isHeaderRow(row));
    if (headerIdx === -1) return [];

    const headerRow = rows[headerIdx]!;
    const columnMap = this.buildColumnMap(headerRow);
    if (!columnMap.date) return [];

    const transactions: RawTransaction[] = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]!;
      const tx = this.rowToTransaction(row, columnMap);
      if (tx) transactions.push(tx);
    }

    return transactions;
  }

  private groupWordsIntoRows(
    words: WordPosition[],
    tolerance: number
  ): WordPosition[][] {
    const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: WordPosition[][] = [];
    let currentRow: WordPosition[] = [];
    let currentY = -Infinity;

    for (const word of sorted) {
      if (Math.abs(word.y - currentY) > tolerance) {
        if (currentRow.length > 0) rows.push(currentRow);
        currentRow = [word];
        currentY = word.y;
      } else {
        currentRow.push(word);
      }
    }
    if (currentRow.length > 0) rows.push(currentRow);

    return rows;
  }

  private isHeaderRow(row: WordPosition[]): boolean {
    const text = row.map((w) => w.text.toLowerCase()).join(' ');
    return (
      /\bdate\b/.test(text) &&
      (/\bdescription\b/.test(text) ||
        /\bparticulars\b/.test(text) ||
        /\bnarration\b/.test(text)) &&
      (/\bbalance\b/.test(text) || /\bamount\b/.test(text))
    );
  }

  private buildColumnMap(headerRow: WordPosition[]): {
    date?: { minX: number; maxX: number };
    description?: { minX: number; maxX: number };
    debit?: { minX: number; maxX: number };
    credit?: { minX: number; maxX: number };
    balance?: { minX: number; maxX: number };
  } {
    const map: ReturnType<typeof this.buildColumnMap> = {};

    for (const word of headerRow) {
      const t = word.text.toLowerCase();
      const range = { minX: word.x - 5, maxX: word.x + word.width + 5 };

      if (/date/.test(t)) map.date = range;
      else if (/description|particulars|narration|details/.test(t)) map.description = range;
      else if (/debit|withdrawal|dr/.test(t)) map.debit = range;
      else if (/credit|deposit|cr/.test(t)) map.credit = range;
      else if (/balance/.test(t)) map.balance = range;
    }

    return map;
  }

  private rowToTransaction(
    row: WordPosition[],
    colMap: ReturnType<typeof this.buildColumnMap>
  ): RawTransaction | null {
    const getCell = (range?: { minX: number; maxX: number }) => {
      if (!range) return '';
      return row
        .filter((w) => w.x >= range.minX && w.x <= range.maxX)
        .sort((a, b) => a.x - b.x)
        .map((w) => w.text)
        .join(' ')
        .trim();
    };

    const dateStr = getCell(colMap.date);
    if (!dateStr) return null;

    // First cell must look like a date
    const DATE_RE = /\d{1,2}[\s/\-]\d{1,2}[\s/\-]\d{2,4}|\d{1,2}[\s/\-][A-Za-z]{3}[\s/\-]\d{2,4}/;
    if (!DATE_RE.test(dateStr)) return null;

    const description = getCell(colMap.description);
    const debitStr = getCell(colMap.debit);
    const creditStr = getCell(colMap.credit);
    const balanceStr = getCell(colMap.balance);

    if (!description && !debitStr && !creditStr) return null;

    return {
      date: normalizeDate(dateStr),
      description: cleanDescription(description || 'Transaction'),
      debit: debitStr || null,
      credit: creditStr || null,
      balance: balanceStr || undefined,
      rawText: row.map((w) => w.text).join(' '),
      parsingConfidence: 0.55,
    };
  }

  // ── Tier 2: Text heuristic ──────────────────────────────────────────────

  private parseByText(rawText: string): RawTransaction[] {
    const transactions: RawTransaction[] = [];
    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

    // Matches a line that starts with a recognisable date
    const DATE_RE =
      /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}[\/-][A-Za-z]{3,9}[\/-]\d{2,4})\s+/;

    // Matches one or more amounts at the end of a line
    const AMOUNT_RE = /(-?\$?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)/g;

    let lastTx: RawTransaction | null = null;

    for (const line of lines) {
      const dateMatch = line.match(DATE_RE);
      if (dateMatch) {
        const rawDate = dateMatch[1]!;
        const rest = line.slice(dateMatch[0].length);
        const amounts: { value: string; index: number }[] = [];
        let m: RegExpExecArray | null;
        const re = new RegExp(AMOUNT_RE.source, 'g');
        while ((m = re.exec(rest)) !== null) {
          amounts.push({ value: m[1]!, index: m.index });
        }

        if (amounts.length === 0) continue;

        const balance = amounts[amounts.length - 1]!.value;
        const debitOrCredit =
          amounts.length >= 2 ? amounts[amounts.length - 2]!.value : null;
        const firstAmtIdx =
          amounts.length >= 2
            ? amounts[amounts.length - 2]!.index
            : amounts[amounts.length - 1]!.index;
        const description = cleanDescription(rest.slice(0, firstAmtIdx));

        if (!description) continue;

        lastTx = {
          date: normalizeDate(rawDate),
          description,
          debit: debitOrCredit,
          credit: null,
          balance,
          rawText: line,
          parsingConfidence: 0.35,
        };
        transactions.push(lastTx);
      } else if (lastTx) {
        // Continuation line — append to description if no amounts
        const hasAmounts = /\d{1,3}(?:,\d{2,3})*\.\d{2}/.test(line);
        if (!hasAmounts && line.length < 100) {
          lastTx.description = cleanDescription(lastTx.description + ' ' + line);
        }
      }
    }

    // Post-process: use balance deltas to infer debit vs credit
    return this.inferDirectionsFromBalance(transactions);
  }

  private inferDirectionsFromBalance(transactions: RawTransaction[]): RawTransaction[] {
    for (let i = 1; i < transactions.length; i++) {
      const prev = transactions[i - 1]!;
      const curr = transactions[i]!;

      const prevBalance = parseAmount(prev.balance as string);
      const currBalance = parseAmount(curr.balance as string);
      const amount = parseAmount(curr.debit as string);

      if (prevBalance != null && currBalance != null && amount != null) {
        const diff = currBalance - prevBalance;
        if (diff < 0) {
          curr.debit = Math.abs(diff).toString();
          curr.credit = null;
        } else if (diff > 0) {
          curr.credit = Math.abs(diff).toString();
          curr.debit = null;
        }
      }
    }
    return transactions;
  }
}
