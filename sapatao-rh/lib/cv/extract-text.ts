export interface ExtractDeps {
  pdf: (buffer: Buffer) => Promise<string>;
  docx: (buffer: Buffer) => Promise<string>;
}

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function clean(mime: string): string {
  return (mime ?? "").toLowerCase().split(";")[0].trim();
}

async function defaultPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2: instanciar PDFParse({ data }) e chamar getText() (.text concatenado).
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    // libera o documento/worker do pdfjs (evita leak em runtime Node de vida longa)
    await parser.destroy();
  }
}

async function defaultDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Extracts plain text from a CV buffer by mime. PDF via pdf-parse, DOCX via
 * mammoth (lazily imported — Node runtime only). Throws on unsupported formats
 * (images/.doc) so the caller can return an actionable "envie em PDF" message.
 * `deps` is injectable for tests.
 */
export async function extractCvText(
  buffer: Buffer,
  mime: string,
  deps: ExtractDeps = { pdf: defaultPdf, docx: defaultDocx },
): Promise<string> {
  const m = clean(mime);
  if (m === PDF) return (await deps.pdf(buffer)).trim();
  if (m === DOCX) return (await deps.docx(buffer)).trim();
  throw new Error(`Formato não suportado para análise (${m}). Envie o currículo em PDF ou DOCX.`);
}
