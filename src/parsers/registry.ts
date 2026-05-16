import type { IBankParser, RawTransaction, StatementSummary, ParsingOptions } from '@/types/statement';

/** Central registry for all available parsers. Routes raw text to the correct parser. */
export class ParserRegistry {
  private parsers: Map<string, IBankParser> = new Map();

  register(parser: IBankParser): void {
    this.parsers.set(parser.bankName, parser);
  }

  getRegisteredBanks(): string[] {
    return Array.from(this.parsers.keys());
  }

  async detectBank(rawText: string): Promise<{ bankName: string; confidence: number }> {
    const scores = Array.from(this.parsers.values()).map((parser) => ({
      bankName: parser.bankName,
      confidence: parser.detectBank(rawText),
    }));

    const best = scores.sort((a, b) => b.confidence - a.confidence)[0];

    if (!best || best.confidence < 0.4) {
      throw new Error(
        `Could not detect bank. Highest confidence: ${best?.confidence.toFixed(2) ?? 'none'}. ` +
          `Supported banks: ${this.getRegisteredBanks().join(', ')}`
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
