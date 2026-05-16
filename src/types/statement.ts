/** Normalized transaction schema — all parsers output this shape regardless of source bank. */
export interface NormalizedTransaction {
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number;

  referenceNumber?: string;
  category?: string;
  merchantName?: string;
  transactionType?: string;

  rawText: string;
  bankName: string;
  parsingConfidence?: number;
  parsedAt: string;
}

/** Intermediate object before normalization — bank parser output with bank-specific fields. */
export interface RawTransaction {
  date: string;
  description: string;
  debit?: number | string | null;
  credit?: number | string | null;
  balance?: number | string | null;
  referenceNumber?: string;
  rawText?: string;
  parsingConfidence?: number;
}

export interface StatementSummary {
  bankName: string;
  accountNumber: string;
  accountType?: string;
  accountHolderName?: string;
  statementPeriod: {
    startDate: string;
    endDate: string;
  };
  openingBalance: number;
  closingBalance: number;
  currency: string;
  totalTransactions: number;
}

export type ProcessingStatus =
  | 'idle'
  | 'uploaded'
  | 'bank-detecting'
  | 'extracting-text'
  | 'parsing'
  | 'validating'
  | 'ready-for-export'
  | 'error';

export interface ParseError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
}

export interface ValidationWarning {
  line: number;
  field: string;
  issue: string;
  severity: 'warning' | 'error';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationWarning[];
  warnings: ValidationWarning[];
  summary: {
    totalTransactions: number;
    errorCount: number;
    warningCount: number;
  };
}

export interface UploadSession {
  sessionId: string;
  fileName: string;
  fileSize: number;
  fileType: 'pdf' | 'image';
  uploadedAt: string;
  detectedBank: string | null;
  processingStatus: ProcessingStatus;
  error?: ParseError;
  preview?: {
    transactions: NormalizedTransaction[];
    summary: StatementSummary;
    validation: ValidationResult;
  };
}

export interface WordPosition {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface PDFRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface PDFWordData {
  words: WordPosition[];
  rectangles: PDFRectangle[];
}

export interface ParsingOptions {
  dateFormat?: string;
  currencySymbol?: string;
  decimalSeparator?: string;
  thousandsSeparator?: string;
  debitCreditFormat?: 'columns' | 'suffix' | 'sign';
  wordPositions?: PDFWordData;
}

/** Base interface all bank parsers must implement. */
export interface IBankParser {
  bankName: string;
  detectBank(rawText: string): number;
  parse(
    rawText: string,
    options?: ParsingOptions
  ): Promise<{
    transactions: RawTransaction[];
    summary: Partial<StatementSummary>;
  }>;
}
