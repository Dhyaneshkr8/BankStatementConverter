# Bank Statement Converter — Technical Specification

**Version**: 1.0  
**Date**: 2026-05-15  
**Status**: Draft — Ready for Architecture Review  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Data Model & Schema](#data-model--schema)
4. [Extraction Strategy](#extraction-strategy)
5. [Parser Architecture](#parser-architecture)
6. [Bank-Specific Parsers](#bank-specific-parsers)
7. [Validation & Reconciliation](#validation--reconciliation)
8. [Frontend Requirements](#frontend-requirements)
9. [Backend Requirements](#backend-requirements)
10. [Deployment & Testing](#deployment--testing)
11. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

This document defines the architecture for a production-grade bank statement converter that:

- Extracts transaction data from PDFs/images in multiple formats
- Supports multiple banks (HDFC, SBI, Chase) with extensible architecture for future banks
- Validates and normalizes transactions into a common schema
- Exports clean CSV/XLSX files with preserved transaction ordering

**Key Design Principles:**
- **Privacy first**: Minimal data retention, optional client-side processing
- **Extensibility**: Bank parsers are independent; adding new banks doesn't require core changes
- **Accuracy over speed**: Validation and reconciliation are non-negotiable
- **Clear failures**: Ambiguous data is flagged, not silently converted
- **Testability**: Every parser has a fixtures folder with redacted sample statements

---

## System Architecture

### High-Level Flow

```
┌──────────────┐
│  File Upload │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ File Type Detection  │
│ (PDF/PNG/JPG)        │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Bank Detection       │
│ (Header/Logo scan)   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────────┐
│ Route to Bank Parser     │
│ (HDFC/SBI/Chase/Unknown) │
└──────┬───────────────────┘
       │
       ├─ Try Text Extraction
       │  (pdf-parse / pdfjs)
       │
       ├─ Fall back to Table Extraction
       │  (if structured table detected)
       │
       └─ Fall back to OCR
          (Tesseract / Cloud API)
       │
       ▼
┌──────────────────────┐
│ Raw Data Extraction  │
│ (Bank-specific rows) │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Parser Output (bank-specific) │
│ (Raw transaction objects)     │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Normalization Layer          │
│ (Convert to standard schema)  │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Validation Layer             │
│ (Reconcile, check integrity) │
└──────┬───────────────────────┘
       │
       ├─ All checks pass → Ready for export
       │
       └─ Validation fails → Return errors + preview
       │
       ▼
┌──────────────────────────────┐
│ User Preview & Correction    │
│ (Optional manual fixes)       │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Export (CSV or XLSX)         │
│ Download to user             │
└──────────────────────────────┘
```

### Processing Modes (Deployment Decision)

#### Option A: Client-Side Processing (Privacy-First, MVP)

**Advantages:**
- Bank statements never leave the browser
- Fast (no network round-trip)
- No server infrastructure needed for parsing
- Compliant with strict privacy requirements

**Disadvantages:**
- Limited to text extraction (no OCR for scanned PDFs)
- Limited file size (browser memory constraints)
- No background job support for large statements

**Stack:**
- React frontend with `pdf-parse` or `pdfjs` for text extraction
- Parser logic runs in browser (isomorphic TypeScript)
- Export directly from browser

#### Option B: Server-Side Processing (Full-Featured, Long-term)

**Advantages:**
- Full OCR support (Tesseract self-hosted or AWS Textract)
- Handles large files (no browser memory limits)
- Background job processing (Bull queue for async)
- Analytics & audit logs

**Disadvantages:**
- Bank statements stored on server (require secure handling)
- Compliance requirements (PII logs, data retention policies)
- Infrastructure overhead

**Stack:**
- Node.js + Express/NestJS backend
- Bull queue for async processing
- Tesseract for OCR or AWS Textract for cloud OCR
- Secure file storage with auto-cleanup

#### **Recommendation for v1:**
Start with **Option A** (client-side). Prove architecture, UX, and parser accuracy. Once production-ready, migrate to **Option B** for OCR support and scalability.

---

## Data Model & Schema

### Normalized Transaction Object

Every parser outputs transactions conforming to this TypeScript interface:

```typescript
/**
 * Normalized transaction schema.
 * All parsers must output this shape regardless of source bank.
 */
export interface NormalizedTransaction {
  // Core fields (required)
  date: string;           // ISO 8601 format: "2026-05-15"
  description: string;    // Cleaned, single-line (no line breaks)
  debit: number | null;   // Amount debited (null if credit)
  credit: number | null;  // Amount credited (null if debit)
  balance: number;        // Running balance after transaction

  // Optional fields
  referenceNumber?: string;     // Check #, transaction ID, etc.
  category?: string;            // For future AI tagging
  merchantName?: string;        // Merchant/payee name if detectable
  transactionType?: string;     // e.g., "withdrawal", "deposit", "transfer"

  // Audit/debug (required internally)
  rawText: string;              // Original text before normalization
  bankName: string;             // "HDFC", "SBI", "Chase", etc.
  parsingConfidence?: number;   // 0–1, confidence score if parser supports it
  parsedAt: string;             // ISO timestamp of parsing
}
```

### Statement Summary Object

Parser also returns metadata:

```typescript
export interface StatementSummary {
  bankName: string;
  accountNumber: string;
  accountType?: string;           // "Savings", "Current", "Checking"
  accountHolderName?: string;
  statementPeriod: {
    startDate: string;            // "2026-04-01"
    endDate: string;              // "2026-05-15"
  };
  openingBalance: number;
  closingBalance: number;
  currency: string;               // "INR", "USD", etc.
  totalTransactions: number;
}
```

### File Upload & Processing Status

```typescript
export interface UploadSession {
  sessionId: string;              // UUID
  fileName: string;
  fileSize: number;               // bytes
  fileType: "pdf" | "image";
  uploadedAt: string;             // ISO timestamp
  detectedBank: string | null;    // "HDFC", "SBI", "Chase", or null
  processingStatus: ProcessingStatus;
  error?: ParseError;
  preview?: {
    transactions: NormalizedTransaction[];
    summary: StatementSummary;
    warnings: ValidationWarning[];
  };
}

export type ProcessingStatus = 
  | "uploaded"
  | "bank-detecting"
  | "extracting-text"
  | "parsing"
  | "validating"
  | "ready-for-export"
  | "error";

export interface ParseError {
  code: string;
  message: string;
  details?: Record<string, any>;
  recoverable: boolean;           // Can user fix manually?
}

export interface ValidationWarning {
  line: number;
  field: string;
  issue: string;
  severity: "warning" | "error";
}
```

---

## Extraction Strategy

### Decision Tree: Which Extraction Method to Use

```
┌─ Is file a PDF?
│  │
│  ├─ YES: Try pdf-parse (fast text extraction)
│  │        │
│  │        ├─ Text extracted successfully?
│  │        │  ├─ YES (>500 chars): Proceed to Parser
│  │        │  └─ NO: File is scanned/image-based
│  │        │
│  │        └─ Scanned detected:
│  │           ├─ Try table extraction (Camelot/Tabula)
│  │           │  ├─ Tables found? YES: Extract + OCR cells
│  │           │  └─ NO: Full page OCR (Tesseract)
│  │           │
│  │           └─ If no OCR available: Return error
│  │
│  └─ NO (image file):
│     └─ Direct OCR (Tesseract or cloud API)
│
└─ All methods: Parser receives raw text block
```

### Supported Extraction Tools

| Tool | File Type | Best For | Limitations |
|------|-----------|----------|------------|
| **pdf-parse** (Node) | Text PDF | Digital bank statements | No image/scanned support |
| **pdfjs** (Browser) | Text PDF | Client-side extraction | Memory-limited for large PDFs |
| **Camelot** (Python) | Structured tables | PDFs with clear table layouts | Requires Python backend |
| **Tesseract** | Scanned PDF / Image | Self-hosted OCR | Slower, variable accuracy |
| **AWS Textract** | Scanned PDF / Image | Production OCR | Cloud cost, privacy implications |

**v1 Recommendation:**
- **Client-side**: Use `pdfjs` + fallback error message for scanned PDFs
- **Server-side (future)**: Use `pdf-parse` + Tesseract for scanned

---

## Parser Architecture

### Parser Interface Contract

Every bank parser implements this interface:

```typescript
/**
 * Base interface all bank parsers must implement.
 * Ensures consistent input/output regardless of bank.
 */
export interface IBankParser {
  /**
   * The bank this parser handles.
   * Used for parser registry and error reporting.
   */
  bankName: string;

  /**
   * Detect if raw text is from this bank.
   * Used by auto-detection logic.
   *
   * @param rawText - Raw extracted text from PDF
   * @returns confidence score 0–1
   */
  detectBank(rawText: string): number;

  /**
   * Parse raw text into transaction objects.
   * Parser is responsible for finding table boundaries,
   * splitting rows, and extracting fields.
   *
   * @param rawText - Raw extracted text from PDF
   * @param options - Parsing hints (date format, currency, etc.)
   * @returns parsed transactions + statement summary
   */
  parse(
    rawText: string,
    options?: ParsingOptions
  ): Promise<{
    transactions: RawTransaction[];
    summary: StatementSummary;
  }>;
}

/**
 * Intermediate object before normalization.
 * Bank parser output; may have bank-specific fields.
 */
export interface RawTransaction {
  date: string;              // As parsed from statement (any format)
  description: string;
  debit?: number | string;   // May be string "1,000.00"
  credit?: number | string;
  balance?: number | string;
  referenceNumber?: string;
  rawText?: string;          // For debugging
}

export interface ParsingOptions {
  dateFormat?: string;       // Hint: "DD/MM/YYYY", "MM-DD-YY", etc.
  currencySymbol?: string;   // "₹", "$", "€"
  decimalSeparator?: string; // "." or ","
  thousandsSeparator?: string; // "," or "."
  debitCreditFormat?: "columns" | "suffix" | "sign"; // How debit/credit is indicated
}
```

### Parser Folder Structure

```
src/
├── parsers/
│   ├── index.ts                    # Parser registry & factory
│   ├── base-parser.ts              # Abstract base class
│   ├── hdfc/
│   │   ├── hdfc.parser.ts          # HDFC-specific logic
│   │   ├── hdfc.parser.spec.ts     # Unit tests
│   │   └── fixtures/
│   │       ├── sample-1.pdf        # Redacted sample statement
│   │       ├── sample-1.json       # Expected output
│   │       └── sample-2.pdf        # Another variant
│   ├── sbi/
│   │   ├── sbi.parser.ts
│   │   ├── sbi.parser.spec.ts
│   │   └── fixtures/
│   │       ├── sample-1.pdf
│   │       └── sample-1.json
│   └── chase/
│       ├── chase.parser.ts
│       ├── chase.parser.spec.ts
│       └── fixtures/
│           ├── sample-checking.pdf
│           └── sample-checking.json
├── normalization/
│   ├── normalizer.ts               # Convert RawTransaction → NormalizedTransaction
│   └── normalizer.spec.ts
├── validation/
│   ├── validator.ts                # Reconciliation, integrity checks
│   └── validator.spec.ts
└── extraction/
    ├── extractor.ts                # PDF/image → raw text
    ├── bank-detector.ts            # Identify bank from text
    └── extractor.spec.ts
```

### Parser Registry (Auto-Detection & Routing)

```typescript
/**
 * Central registry for all available parsers.
 * Routes raw text to the correct parser.
 */
export class ParserRegistry {
  private parsers: Map<string, IBankParser> = new Map();

  register(parser: IBankParser): void {
    this.parsers.set(parser.bankName, parser);
  }

  /**
   * Auto-detect which bank the statement is from.
   * Runs detectBank() on all parsers, returns highest confidence match.
   */
  async detectBank(rawText: string): Promise<{
    bankName: string;
    confidence: number;
  }> {
    const scores = Array.from(this.parsers.values()).map(parser => ({
      bankName: parser.bankName,
      confidence: parser.detectBank(rawText),
    }));
    
    const best = scores.sort((a, b) => b.confidence - a.confidence)[0];
    
    if (best.confidence < 0.5) {
      throw new Error(`Could not detect bank (highest score: ${best.confidence})`);
    }
    
    return best;
  }

  /**
   * Parse using the detected (or specified) bank parser.
   */
  async parse(rawText: string, bankName?: string) {
    let parser: IBankParser;
    
    if (bankName) {
      parser = this.parsers.get(bankName);
      if (!parser) throw new Error(`Parser not found for bank: ${bankName}`);
    } else {
      const detected = await this.detectBank(rawText);
      parser = this.parsers.get(detected.bankName);
    }
    
    return parser.parse(rawText);
  }
}
```

---

## Bank-Specific Parsers

### Overview: Supported Banks (v1)

| Bank | Region | Format | Challenges | v1 Support |
|------|--------|--------|------------|-----------|
| **HDFC Bank** | India | Mostly digital PDFs | Multi-line descriptions, variable spacing | ✅ Yes |
| **SBI** | India | Digital + Some scanned | Different layouts per account type | ✅ Yes |
| **Chase** | USA | Consistent digital PDF | Different layouts for different account types | ✅ Yes |

### Bank 1: HDFC Bank

**Detection Signature:**
```
"HDFC Bank" or "www.hdfcbank.com" in header
"Date | Particulars | Debit | Credit | Balance" or similar column headers
Currency: INR (₹)
```

**Date Format:** DD/MM/YYYY  
**Debit/Credit:** Separate columns (numeric values)  
**Currency Symbol:** ₹ (Indian Rupee)  
**Decimal Separator:** . (period)  
**Thousands Separator:** , (comma)

**Sample Statement Structure:**
```
HDFC Bank Limited
Personal Banking Savings Account
Account: XXXX-XXXX-XXXX-1234
Period: 01 May 2026 – 31 May 2026

Date         | Particulars              | Debit    | Credit   | Balance
-------------|--------------------------|----------|----------|----------
01-May-2026  | Opening Balance          |          |          | 50,000.00
02-May-2026  | Transfer Out – ABC Corp  | 10,000.00|          | 40,000.00
05-May-2026  | Salary Credit – XYZ Ltd  |          | 25,000.00| 65,000.00
...
31-May-2026  | Closing Balance          |          |          | 68,500.00
```

**Parser Logic:**
1. Extract header to find bank, account, period
2. Find column headers (Date, Particulars, Debit, Credit, Balance)
3. Split by row, ignoring headers/footers
4. For each row:
   - Parse date (DD-MMM-YYYY format)
   - Extract full description (may span multiple lines)
   - Parse debit/credit (handle commas: "10,000.00" → 10000.00)
   - Parse balance
5. Validate: balance[i-1] ± transaction[i] = balance[i]

**Edge Cases:**
- Opening/closing balance rows (skip or mark specially)
- Multi-line descriptions (e.g., "IMPS Transfer\nto XYZ")
- Blank rows between sections
- Page breaks mid-table
- Different date formats in different statement versions

**Test Cases (Fixtures):**
```
hdfc/fixtures/
├── sample-1-simple.pdf         # Straight linear transactions
├── sample-2-multiline.pdf      # Multi-line descriptions
├── sample-3-multiple-pages.pdf # Statement spanning 3 pages
├── sample-1-simple.json        # Expected output for sample-1
```

### Bank 2: SBI (State Bank of India)

**Detection Signature:**
```
"SBI" or "State Bank of India" in header
Account type indicator (Savings/Current/etc.)
```

**Challenge:** SBI statements vary significantly by account type.

**Savings Account Format:**
```
Date     | Description              | Debit    | Credit   | Balance
---------|--------------------------|----------|----------|----------
01-05-26 | Opening Balance          | -        | -        | 100,000
05-05-26 | NEFT Transfer Out        | 20,000.00| -        | 80,000
...
```

**Current Account Format:**
```
Txn Date | Value Date | Particulars | Cheque # | Debit    | Credit   | Balance
---------|------------|-------------|----------|----------|----------|----------
01-05-26 | 01-05-26   | Opening Bal |    -     | -        | -        | 500,000
...
```

**Parser Logic:**
1. Detect account type from statement header
2. Route to account-specific parser (savings vs. current vs. others)
3. Parse according to format
4. Handle "-" as null debit/credit

**Edge Cases:**
- Different column orders per account type
- Date format varies: DD-MM-YY vs. DD/MM/YYYY
- Cheque column (not always present)
- Special rows: "Interest Accrued", "Charges" (usually in description)

**Test Cases:**
```
sbi/fixtures/
├── sample-savings-1.pdf
├── sample-savings-2-multipage.pdf
├── sample-current-1.pdf
├── sample-current-1.json
```

### Bank 3: Chase Bank (USA)

**Detection Signature:**
```
"Chase" or "JPMorgan" in header
"Date | Description | Debit | Credit | Balance" or "Date | Withdrawals | Deposits | Balance"
Currency: USD ($)
```

**Checking Account Format:**
```
Date       | Description           | Withdrawals | Deposits | Balance
-----------|------------------------|-------------|----------|--------
05/01/2026 | Opening Balance        |             |          | 5,000.00
05/02/2026 | ACH Debit: ABC Corp    | 500.00      |          | 4,500.00
05/05/2026 | ACH Credit: Employer   |             | 2,500.00 | 7,000.00
...
```

**Savings Account Format:**
```
Date       | Deposits | Withdrawals | Interest | Balance
-----------|----------|-------------|----------|--------
05/01/2026 |          |             |          | 10,000.00
05/15/2026 |          |             | 2.50     | 10,002.50
...
```

**Parser Logic:**
1. Detect account type (Checking vs. Savings)
2. Find column headers
3. Parse according to format
4. Date format: MM/DD/YYYY

**Edge Cases:**
- Different layouts for checking vs. savings vs. money market
- "Interest" column (Savings only)
- Multi-line descriptions
- Special characters in descriptions ($, %, &)

**Test Cases:**
```
chase/fixtures/
├── sample-checking-1.pdf
├── sample-savings-1.pdf
├── sample-checking-1.json
```

---

## Validation & Reconciliation

### Validation Rules

Every transaction set must pass these checks before export:

#### 1. Balance Reconciliation (CRITICAL)

```typescript
/**
 * For each transaction, verify:
 * balance[i] = balance[i-1] ± (debit OR credit)
 *
 * Tolerance: ±0.01 (account for floating point errors)
 */
for (let i = 1; i < transactions.length; i++) {
  const prev = transactions[i - 1];
  const curr = transactions[i];
  
  let expectedBalance = prev.balance;
  if (curr.debit) expectedBalance -= curr.debit;
  if (curr.credit) expectedBalance += curr.credit;
  
  const diff = Math.abs(expectedBalance - curr.balance);
  if (diff > 0.01) {
    throw new ValidationError(
      `Line ${i}: Balance mismatch. Expected ${expectedBalance}, got ${curr.balance}`
    );
  }
}
```

#### 2. Field Completeness

```typescript
/**
 * Required fields per transaction:
 */
const REQUIRED_FIELDS = ["date", "description", "balance"];
const REQUIRED_ONE_OF = [["debit", "credit"]]; // At least debit OR credit
```

#### 3. Date Ordering

```typescript
/**
 * Dates must be monotonically increasing.
 * Exception: Allow same-day transactions (ordering ambiguous).
 */
for (let i = 1; i < transactions.length; i++) {
  const prev = new Date(transactions[i - 1].date);
  const curr = new Date(transactions[i].date);
  
  if (curr < prev) {
    throw new ValidationError(
      `Line ${i}: Date goes backwards (${prev.toISOString()} → ${curr.toISOString()})`
    );
  }
}
```

#### 4. Duplicate Detection

```typescript
/**
 * Flag potential duplicates:
 * - Same date, description, amount within 3 consecutive rows
 */
for (let i = 0; i < transactions.length - 1; i++) {
  const curr = transactions[i];
  for (let j = i + 1; j < Math.min(i + 4, transactions.length); j++) {
    const next = transactions[j];
    
    if (
      curr.date === next.date &&
      curr.description === next.description &&
      curr.debit === next.debit &&
      curr.credit === next.credit
    ) {
      warnings.push({
        line: j,
        issue: "Possible duplicate transaction",
        severity: "warning",
      });
    }
  }
}
```

#### 5. Data Type Validation

```typescript
const VALIDATION_RULES = {
  date: { type: "string", format: "YYYY-MM-DD", required: true },
  description: { type: "string", minLength: 1, maxLength: 500, required: true },
  debit: { type: "number", minValue: 0, required: false },
  credit: { type: "number", minValue: 0, required: false },
  balance: { type: "number", required: true },
  referenceNumber: { type: "string", required: false },
};
```

### Validation Workflow

```typescript
export class Validator {
  validate(transactions: NormalizedTransaction[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check 1: Balance reconciliation
    try {
      this.validateBalanceReconciliation(transactions);
    } catch (e) {
      errors.push(e);
    }

    // Check 2: Required fields
    transactions.forEach((t, i) => {
      const fieldErrors = this.validateFields(t, i);
      errors.push(...fieldErrors);
    });

    // Check 3: Date ordering
    try {
      this.validateDateOrdering(transactions);
    } catch (e) {
      errors.push(e);
    }

    // Check 4: Duplicate detection
    const dupeWarnings = this.detectDuplicates(transactions);
    warnings.push(...dupeWarnings);

    // Check 5: Sum validation
    try {
      this.validateSums(transactions);
    } catch (e) {
      errors.push(e);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalTransactions: transactions.length,
        errorCount: errors.length,
        warningCount: warnings.length,
      },
    };
  }
}
```

---

## Frontend Requirements

### Component Structure

```
src/
├── components/
│   ├── Upload/
│   │   ├── UploadZone.tsx           # Drag-drop file upload
│   │   ├── FileValidation.tsx        # File type/size check
│   │   └── UploadProgress.tsx        # Progress + parsing status
│   ├── Preview/
│   │   ├── TransactionTable.tsx      # Display extracted rows
│   │   ├── ValidationErrors.tsx      # Show validation issues
│   │   ├── ManualCorrection.tsx      # Edit rows before export
│   │   └── StatementSummary.tsx      # Bank, period, balances
│   ├── Export/
│   │   ├── ExportOptions.tsx         # CSV vs. XLSX, formatting
│   │   └── ExportButton.tsx          # Trigger download
│   └── Common/
│       ├── LoadingSpinner.tsx
│       ├── ErrorBoundary.tsx
│       └── StatusBadge.tsx
├── pages/
│   ├── ConverterPage.tsx             # Main page (upload → preview → export)
│   └── HistoryPage.tsx               # (Future) previous conversions
├── hooks/
│   ├── useStatementUpload.ts         # Upload + parsing logic
│   ├── useValidation.ts              # Validation state
│   └── useParsing.ts                 # Parser selection + execution
├── services/
│   ├── parsingService.ts             # Call parser (client or server)
│   ├── exportService.ts              # CSV/XLSX generation
│   └── validationService.ts          # Validation API
└── types/
    └── statement.ts                  # TypeScript interfaces (shared with backend)
```

### Key Features

#### 1. Drag-and-Drop Upload
```
- Accept PDF, PNG, JPG
- File size validation (max 25 MB)
- Show file preview (filename, size)
- Disable upload button on invalid file
```

#### 2. Real-Time Parsing Progress
```
Uploading... → Bank Detecting... → Parsing... → Validating... → Ready!

- Progress bar with estimated time
- Detailed status messages
- Cancel button (if processing server-side)
```

#### 3. Transaction Preview
```
- Display table: Date | Description | Debit | Credit | Balance
- Rows with errors highlighted (yellow/red)
- Click to edit inline (optional)
- Show summary: Total transactions, warnings, bank name
```

#### 4. Validation Error Display
```
- Red banner for critical errors (balance mismatch, etc.)
- Yellow warnings for potential issues (duplicates, etc.)
- Clear messages: "Line 5: Balance mismatch. Expected 10,000, got 9,999"
- Option to re-upload or proceed if warnings-only
```

#### 5. Export Options
```
- CSV (UTF-8 with BOM)
- XLSX (with formatting, data types)
- Header row option
- Filename auto-populated with bank + date range
- Download button
```

### Accessibility & UX
- Keyboard navigation (tab through upload → preview → export)
- Screen reader labels on all inputs/buttons
- Error messages in both visual (red) and text form
- Progress updates (aria-live regions)

---

## Backend Requirements (Server-Side Option)

### API Endpoints

```typescript
/**
 * POST /api/upload
 * Upload a bank statement file for parsing.
 *
 * Request:
 *   multipart/form-data
 *   - file: PDF | PNG | JPG
 *   - bankName?: string (optional, for explicit override)
 *
 * Response:
 *   {
 *     sessionId: string
 *     fileName: string
 *     detectedBank: string | null
 *     processingStatus: "extracting" | "parsing" | "validating" | ...
 *   }
 */

/**
 * GET /api/status/:sessionId
 * Poll for parsing progress.
 *
 * Response:
 *   {
 *     processingStatus: "parsing"
 *     progress: { current: 50, total: 100 }
 *     error?: { code: string, message: string }
 *   }
 */

/**
 * GET /api/preview/:sessionId
 * Retrieve parsed transactions & validation results.
 *
 * Response:
 *   {
 *     transactions: NormalizedTransaction[]
 *     summary: StatementSummary
 *     validation: {
 *       valid: boolean
 *       errors: ValidationError[]
 *       warnings: ValidationWarning[]
 *     }
 *   }
 */

/**
 * POST /api/export/:sessionId
 * Export to CSV or XLSX.
 *
 * Request:
 *   { format: "csv" | "xlsx" }
 *
 * Response:
 *   file download (application/octet-stream)
 */
```

### Processing Pipeline (Server)

```
1. File Upload
   ↓
2. Virus Scan (optional, e.g., ClamAV)
   ↓
3. Store temp file (with auto-cleanup in 24h)
   ↓
4. Queue async job (Bull)
   ↓
5. Job: Extract text (pdf-parse) or OCR (Tesseract)
   ↓
6. Job: Detect bank
   ↓
7. Job: Parse (route to bank-specific parser)
   ↓
8. Job: Normalize
   ↓
9. Job: Validate
   ↓
10. Store result in session (Redis or memory)
    ↓
11. Return to frontend
```

### Security & Privacy Checklist

- [ ] HTTPS only (TLS 1.3+)
- [ ] CORS configured (allow only frontend origin)
- [ ] File upload size limit enforced (25 MB)
- [ ] File type validation (whitelist PDF, PNG, JPG only)
- [ ] Virus scan (ClamAV) before processing
- [ ] Uploaded files auto-deleted after 24 hours
- [ ] No logging of transaction data (only file metadata)
- [ ] Session data encrypted at rest
- [ ] Password-protected PDF support (user provides password)
- [ ] Rate limiting (e.g., 10 uploads/hour per IP)

---

## Deployment & Testing

### Testing Strategy

#### Unit Tests (Parser Logic)

```typescript
// hdfc.parser.spec.ts

describe("HDFCParser", () => {
  it("should parse simple linear transactions", async () => {
    const rawText = fs.readFileSync("./fixtures/sample-1-simple.pdf", "utf-8");
    const expected = JSON.parse(
      fs.readFileSync("./fixtures/sample-1-simple.json", "utf-8")
    );

    const result = await parser.parse(rawText);
    expect(result.transactions).toEqual(expected.transactions);
  });

  it("should handle multi-line descriptions", async () => {
    const rawText = fs.readFileSync("./fixtures/sample-2-multiline.pdf", "utf-8");
    // Parse and assert
  });

  it("should validate balance reconciliation", async () => {
    const result = await parser.parse(/* ... */);
    const validator = new Validator();
    const validation = validator.validate(result.transactions);
    expect(validation.valid).toBe(true);
  });

  it("should detect duplicate transactions", async () => {
    const result = await parser.parse(/* ... */);
    const validator = new Validator();
    const validation = validator.validate(result.transactions);
    expect(validation.warnings.some(w => w.issue === "Possible duplicate")).toBe(true);
  });
});
```

#### Integration Tests

```typescript
// parser-registry.spec.ts

describe("ParserRegistry", () => {
  it("should auto-detect HDFC bank", async () => {
    const rawText = fs.readFileSync("./hdfc/fixtures/sample-1.pdf", "utf-8");
    const detected = await registry.detectBank(rawText);
    expect(detected.bankName).toBe("HDFC");
    expect(detected.confidence).toBeGreaterThan(0.8);
  });

  it("should parse HDFC with confidence > 80%", async () => {
    // Load real statement, parse, validate
  });

  it("should fail gracefully on unsupported bank", async () => {
    const unknownText = "Some random PDF content";
    await expect(registry.detectBank(unknownText)).rejects.toThrow(
      "Could not detect bank"
    );
  });
});
```

#### End-to-End Tests (Optional, Playwright)

```typescript
// converter.e2e.spec.ts

test("upload HDFC statement → preview → export CSV", async ({ page }) => {
  await page.goto("/");
  
  // Upload file
  const input = page.locator('input[type="file"]');
  await input.setInputFiles("./hdfc/fixtures/sample-1.pdf");
  
  // Wait for parsing
  await page.waitForSelector("[data-testid='transaction-table']");
  
  // Verify preview
  const rows = page.locator("[data-testid='transaction-row']");
  expect(await rows.count()).toBeGreaterThan(0);
  
  // Export
  const downloadPromise = page.waitForEvent("download");
  await page.click("[data-testid='export-csv-btn']");
  const download = await downloadPromise;
  
  expect(download.suggestedFilename()).toContain(".csv");
});
```

### Sample Statement Fixtures

Redacted sample statements for each bank (with expected parser output):

```
hdfc/fixtures/
├── sample-1-simple.pdf              # 10 transactions, 1 page
├── sample-1-simple.json             # Expected output
├── sample-2-multiline.pdf           # 8 transactions, multi-line descriptions
├── sample-2-multiline.json
├── sample-3-multiple-pages.pdf      # 50 transactions, 5 pages
└── sample-3-multiple-pages.json

sbi/fixtures/
├── sample-savings-1.pdf             # Savings account
├── sample-savings-1.json
├── sample-current-1.pdf             # Current account
└── sample-current-1.json

chase/fixtures/
├── sample-checking-1.pdf
├── sample-checking-1.json
└── sample-savings-1.pdf
```

**Rules for Sample Statements:**
- Redact account numbers (show last 4 digits only)
- Redact customer names
- Keep realistic transaction patterns
- Include edge cases (multi-line, special chars, etc.)
- Version-control in repo with Git LFS if large

### Continuous Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
      
      - run: npm ci
      - run: npm run test:unit        # Parser tests
      - run: npm run test:integration # Registry tests
      - run: npm run lint
      - run: npm run build
      
      # Optional: E2E tests
      - run: npm run test:e2e         # Playwright
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1–2)

**Goals:** Lock in architecture, build parser interface, prove with one bank.

**Deliverables:**
- [ ] TypeScript interfaces & types (all files in `src/types/`)
- [ ] Parser registry + base parser class
- [ ] HDFC parser (v1) + fixtures
- [ ] Normalization + validation layers
- [ ] Unit tests for HDFC parser
- [ ] CLI tool to test parsers locally

**Example CLI Usage:**
```bash
node cli.js parse hdfc ./samples/hdfc-statement.pdf
# Outputs: extracted transactions in JSON
```

### Phase 2: Frontend MVP (Weeks 2–3)

**Goals:** Upload + preview + export working end-to-end (client-side).

**Deliverables:**
- [ ] React components (Upload, Preview, Export)
- [ ] Client-side parsing (pdfjs + isomorphic TypeScript)
- [ ] CSV/XLSX export
- [ ] Basic validation error display
- [ ] Accessibility pass (WCAG AA)

**Test with:** HDFC fixtures in browser

### Phase 3: Additional Banks (Weeks 3–4)

**Goals:** Add SBI and Chase, validate architecture scales.

**Deliverables:**
- [ ] SBI parser + fixtures
- [ ] Chase parser + fixtures
- [ ] Bank detection logic (auto-route to correct parser)
- [ ] Integration tests

**Validation:** Each parser passes all fixtures with 100% balance reconciliation

### Phase 4: Polish & Docs (Week 4)

**Goals:** Production-ready, documented.

**Deliverables:**
- [ ] Error handling edge cases
- [ ] UX improvements (progress indicators, better error messages)
- [ ] README with setup instructions
- [ ] Architecture documentation (this spec + diagrams)
- [ ] Contribution guide for adding new banks

### Phase 5: Server-Side Processing (Future)

**Goals:** Support OCR, handle large files, scalable infrastructure.

**Deliverables:**
- [ ] Backend API (Node.js + Express)
- [ ] Async job queue (Bull + Redis)
- [ ] Tesseract/AWS Textract integration
- [ ] File upload security (virus scan, size limits)
- [ ] Data retention policies + auto-cleanup

---

## Appendix: Decision Matrix

### Client-Side vs. Server-Side

| Aspect | Client-Side | Server-Side |
|--------|-------------|-------------|
| **Privacy** | ✅ Best (no server) | ⚠️ Requires security | 
| **OCR Support** | ❌ Limited | ✅ Full |
| **File Size** | ⚠️ Browser memory limit | ✅ Unlimited |
| **Complexity** | ✅ Simple | ⚠️ Infrastructure needed |
| **v1 Recommendation** | ✅ Start here | For Phase 5 |

### Bank Prioritization (v1)

| Bank | Users | Complexity | Effort | Priority |
|------|-------|-----------|--------|----------|
| HDFC | Medium | Low | 1 week | 🔴 Phase 1 |
| SBI | High | Medium | 1.5 weeks | 🟡 Phase 3 |
| Chase | Low (v1) | Medium | 1.5 weeks | 🟡 Phase 3 |

### Library Choices

| Library | Purpose | Rationale |
|---------|---------|-----------|
| `pdfjs` | Text extraction (client) | Browser-native, no backend needed |
| `pdf-parse` | Text extraction (server) | Fast, accurate for digital PDFs |
| `exceljs` | XLSX generation | Rich formatting, data types, formulas |
| `papaparse` | CSV generation | Simple, reliable CSV output |
| `jest` | Unit testing | Standard in TypeScript ecosystem |

---

## References & Further Reading

- **PDF Processing:**
  - [pdfjs documentation](https://mozilla.github.io/pdf.js/)
  - [pdf-parse (Node.js)](https://github.com/modesty/pdf-parse)
  
- **OCR (Future):**
  - [Tesseract.js](https://github.com/naptha/tesseract.js)
  - [AWS Textract](https://aws.amazon.com/textract/)

- **Data Validation:**
  - [Zod](https://zod.dev/) for runtime schema validation
  - [Joi](https://joi.dev/) for Node.js validation

- **Testing:**
  - [Jest](https://jestjs.io/)
  - [Playwright](https://playwright.dev/) for E2E testing

- **Architecture:**
  - [Hexagonal Architecture (Ports & Adapters)](https://herbertograca.com/2017/09/14/ports-adapters-architecture/)
  - [Clean Code](https://www.oreilly.com/library/view/clean-code-a/9780136083238/) by Robert C. Martin

---

**Document Status:** Ready for team review and implementation kickoff.

**Last Updated:** 2026-05-15  
**Next Review:** After Phase 1 completion
