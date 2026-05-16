/** Parse a numeric string like "1,00,000.50" or "10,000.00" into a number. */
export function parseAmount(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const cleaned = raw.toString().replace(/[₹$€£,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

/**
 * Normalize various date formats to ISO "YYYY-MM-DD".
 * Handles: DD/MM/YYYY, DD-MM-YYYY, DD-MMM-YYYY, DD/MM/YY, MM/DD/YYYY (US).
 */
export function normalizeDate(raw: string, usFormat = false): string {
  const trimmed = raw.trim();

  // DD-MMM-YYYY or DD/MMM/YYYY  (e.g. "02-May-2026", "15 Jan 2026")
  const monthNameMatch = trimmed.match(
    /(\d{1,2})[\s/\-]([A-Za-z]+)[\s/\-](\d{2,4})/
  );
  if (monthNameMatch) {
    const day = monthNameMatch[1]!.padStart(2, '0');
    const monthStr = monthNameMatch[2]!.toLowerCase();
    const month = MONTH_MAP[monthStr];
    if (month) {
      let year = monthNameMatch[3]!;
      if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }
  }

  // Numeric formats
  const numMatch = trimmed.match(/(\d{1,4})[\s/\-](\d{1,2})[\s/\-](\d{2,4})/);
  if (numMatch) {
    let p1 = numMatch[1]!;
    let p2 = numMatch[2]!;
    let p3 = numMatch[3]!;

    // YYYY-MM-DD already ISO
    if (p1.length === 4) {
      return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
    }

    if (p3.length === 2) p3 = `20${p3}`;

    if (usFormat) {
      // MM/DD/YYYY
      return `${p3}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
    }
    // DD/MM/YYYY
    return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
  }

  return trimmed;
}

/** Clean a description string — collapse whitespace, remove line breaks. */
export function cleanDescription(raw: string): string {
  return raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Count how many of the given keywords appear in text (case-insensitive). */
export function countKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
}
