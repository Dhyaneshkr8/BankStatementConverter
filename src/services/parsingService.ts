import type {
  NormalizedTransaction,
  StatementSummary,
  ProcessingStatus,
  ValidationResult,
} from '@/types/statement';
import { extractWithPositions } from '@/extraction/extractor';
import { createParserRegistry } from '@/parsers';
import { normalize, inferDebitCredit } from '@/normalization/normalizer';
import { validate } from '@/validation/validator';

const registry = createParserRegistry();

export interface ProcessingUpdate {
  status: ProcessingStatus;
  message: string;
  progress?: number;
}

export type OnProgress = (update: ProcessingUpdate) => void;

export interface ProcessingResult {
  transactions: NormalizedTransaction[];
  summary: Partial<StatementSummary>;
  validation: ValidationResult;
  detectedBank: string;
  rawText: string;
}

/** Full processing pipeline: File → extract → detect bank → parse → normalize → validate */
export async function processFile(
  file: File,
  onProgress: OnProgress
): Promise<ProcessingResult> {
  onProgress({ status: 'uploaded', message: 'File received', progress: 10 });

  // 1. Extract text + word positions; isScanned is detected in the same pass
  onProgress({ status: 'extracting-text', message: 'Extracting text from PDF…', progress: 25 });
  const { rawText, wordData, isScanned } = await extractWithPositions(file);

  if (isScanned) {
    throw new Error(
      'This appears to be a scanned/image-based PDF. ' +
        'Currently only text-based PDFs are supported. ' +
        'OCR support is coming in a future version.'
    );
  }

  if (rawText.trim().length < 50) {
    throw new Error(
      'Very little text was extracted from this PDF. ' +
        'It may be a scanned document or use an unsupported encoding.'
    );
  }

  // 3. Detect bank
  onProgress({ status: 'bank-detecting', message: 'Detecting bank…', progress: 40 });
  const detection = await registry.detectBank(rawText);

  // 4. Parse — pass word positions so GenericParser can use geometric tiers
  onProgress({
    status: 'parsing',
    message: detection.bankName === 'Generic'
      ? 'Parsing statement with generic parser…'
      : `Parsing ${detection.bankName} statement…`,
    progress: 60,
  });
  const { transactions: rawTxns, summary } = await registry.parse(
    rawText,
    detection.bankName,
    { wordPositions: wordData }
  );

  if (rawTxns.length === 0) {
    throw new Error(
      detection.bankName === 'Generic'
        ? 'Could not extract any transactions. The PDF format may not be supported, ' +
            'or the statement may be scanned. Try a digitally-generated bank statement.'
        : `No transactions found in the ${detection.bankName} statement. ` +
            'The statement layout may differ from what was expected.'
    );
  }

  // 5. Normalize
  let normalized = normalize(rawTxns, detection.bankName);

  // 6. Smart debit/credit inference using balance deltas
  normalized = inferDebitCredit(normalized);

  // 7. Fill summary totals
  if (normalized.length > 0) {
    summary.totalTransactions = normalized.length;
    if (summary.openingBalance == null) {
      summary.openingBalance = normalized[0]!.balance;
    }
    if (summary.closingBalance == null) {
      summary.closingBalance = normalized[normalized.length - 1]!.balance;
    }
  }

  // 8. Validate
  onProgress({ status: 'validating', message: 'Validating transactions…', progress: 85 });
  const validation = validate(normalized);

  onProgress({ status: 'ready-for-export', message: 'Ready!', progress: 100 });

  return {
    transactions: normalized,
    summary,
    validation,
    detectedBank: detection.bankName,
    rawText,
  };
}

export function getSupportedBanks(): string[] {
  return registry.getRegisteredBanks();
}
