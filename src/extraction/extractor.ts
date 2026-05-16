import * as pdfjsLib from 'pdfjs-dist';
import type { PDFWordData, WordPosition } from '@/types/statement';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/** Extract raw text grouped by Y-position lines from a single page. */
function extractPageLines(items: Array<{ str: string; transform: number[] }>): string {
  const lineMap = new Map<number, Array<{ x: number; text: string }>>();

  for (const item of items) {
    if (!item.str) continue;
    // Round Y to nearest 2pt bucket to group sub-pixel items on the same line
    const y = Math.round(item.transform[5]! / 2) * 2;
    const x = item.transform[4]!;
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y)!.push({ x, text: item.str });
  }

  // Higher Y = higher on page in PDF coordinate system
  const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

  const lines: string[] = [];
  for (const y of sortedYs) {
    const lineItems = lineMap.get(y)!.sort((a, b) => a.x - b.x);
    const lineText = lineItems.map((item) => item.text).join(' ');
    if (lineText.trim()) lines.push(lineText);
  }

  return lines.join('\n');
}

/** Extract all text content from a PDF file (client-side, text-based PDFs). */
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; transform: number[] }>;
    const pageText = extractPageLines(items);
    if (pageText) pages.push(pageText);
  }

  return pages.join('\n\n--- PAGE BREAK ---\n\n');
}

/**
 * Extract text AND word-level position data from a PDF.
 * Returns both the full text string and structured word positions
 * suitable for geometric parsing (rectangle-tier and position-tier).
 */
export async function extractWithPositions(file: File): Promise<{
  rawText: string;
  wordData: PDFWordData;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  const words: WordPosition[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
    }>;

    // Collect word positions (PDF Y is bottom-up; convert to top-down)
    for (const item of items) {
      if (!item.str.trim()) continue;
      words.push({
        text: item.str,
        x: item.transform[4]!,
        y: viewport.height - item.transform[5]!, // flip to top-down coords
        width: item.width,
        height: item.height,
        page: pageNum,
      });
    }

    pages.push(extractPageLines(items));
  }

  return {
    rawText: pages.join('\n\n--- PAGE BREAK ---\n\n'),
    wordData: { words, rectangles: [] }, // rectangles need Pyodide/pdfminer to extract
  };
}

/**
 * Detect whether a PDF is text-based or image-based (scanned).
 * Checks up to the first 3 pages so multi-page PDFs with sparse first pages
 * are not incorrectly classified as scanned.
 */
export async function detectPDFType(file: File): Promise<'text' | 'scanned'> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pagesToCheck = Math.min(pdf.numPages, 3);
  let totalText = '';

  for (let i = 1; i <= pagesToCheck; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    totalText += content.items.map((item: any) => item.str).join('');
    if (totalText.trim().length > 100) return 'text'; // short-circuit early
  }

  return totalText.trim().length > 100 ? 'text' : 'scanned';
}
