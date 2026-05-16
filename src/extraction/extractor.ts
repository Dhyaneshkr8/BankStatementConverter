import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/** Extract all text content from a PDF file (client-side, text-based PDFs). */
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; transform: number[] }>;

    // Group text items by their Y position to reconstruct lines
    const lineMap = new Map<number, Array<{ x: number; text: string }>>();

    for (const item of items) {
      const y = Math.round(item.transform[5]!);
      const x = item.transform[4]!;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x, text: item.str });
    }

    // Sort lines top-to-bottom (higher Y = higher on page in PDF coords)
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

    const pageLines: string[] = [];
    for (const y of sortedYs) {
      const lineItems = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map((item) => item.text).join(' ');
      if (lineText.trim()) {
        pageLines.push(lineText);
      }
    }

    pages.push(pageLines.join('\n'));
  }

  return pages.join('\n\n--- PAGE BREAK ---\n\n');
}

/** Detect whether a PDF is text-based or image-based (scanned). */
export async function detectPDFType(
  file: File
): Promise<'text' | 'scanned'> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Check first page for extractable text
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map((item: any) => item.str).join('');

  return text.trim().length > 100 ? 'text' : 'scanned';
}
