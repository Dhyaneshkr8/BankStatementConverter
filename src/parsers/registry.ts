import type { IBankParser, RawTransaction, StatementSummary, ParsingOptions } from '@/types/statement';

/**
 * Central registry for all available parsers.
 * Routes raw text to the highest-confidence parser.
 * GenericParser (confidence 0.10) acts as the always-available fallback
 * so detection never throws for text-based PDFs.
 */
export class ParserRegistry {
  private parsers: Map<string, IBankParser> = new Map();

  register(parser: IBankParser): void {
    this.parsers.set(parser.bankName, parser);
  }

  /** Returns named banks only — excludes fallback parsers from the support list shown to users. */
  getRegisteredBanks(): string[] {
    return Array.from(this.parsers.entries())
      .filter(([, parser]) => !parser.isFallback)
      .map(([name]) => name);
  }

  async detectBank(rawText: string): Promise<{ bankName: string; confidence: number }> {
    const scores = Array.from(this.parsers.values()).map((parser) => ({
      bankName: parser.bankName,
      confidence: parser.detectBank(rawText),
    }));

    const best = scores.sort((a, b) => b.confidence - a.confidence)[0];

    // Threshold: anything above GenericParser's 0.10 wins. If only Generic
    // matched, we still proceed — it will use heuristic parsing.
    if (!best || best.confidence === 0) {
      throw new Error(
        'Could not extract any text from this PDF. It may be a scanned or image-only document.'
      );
    }

    return best;
  }

  async parse(
    rawText: string,
    bankName?: string,
    options?: ParsingOptions
  ): Promise<{ transactions: RawTransaction[]; summary: Partial<StatementSummary> }> {
    let parser: IBankParser | undefined;

    if (bankName) {
      parser = this.parsers.get(bankName);
      if (!parser) throw new Error(`Parser not found for bank: ${bankName}`);
    } else {
      const detected = await this.detectBank(rawText);
      parser = this.parsers.get(detected.bankName);
    }

    if (!parser) throw new Error('No parser available');
    return parser.parse(rawText, options);
  }
}
