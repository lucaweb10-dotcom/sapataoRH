import { describe, it, expect, vi } from "vitest";
import { extractCvText } from "./extract-text";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("extractCvText (dispatch por mime)", () => {
  const deps = { pdf: vi.fn(async () => "  texto pdf  "), docx: vi.fn(async () => "texto docx") };

  it("PDF -> extractor de pdf (com trim)", async () => {
    expect(await extractCvText(Buffer.from(""), "application/pdf", deps)).toBe("texto pdf");
    expect(deps.pdf).toHaveBeenCalled();
  });
  it("DOCX -> extractor de docx", async () => {
    expect(await extractCvText(Buffer.from(""), DOCX, deps)).toBe("texto docx");
  });
  it("ignora parâmetros de charset no mime", async () => {
    expect(await extractCvText(Buffer.from(""), "application/pdf; charset=binary", deps)).toBe("texto pdf");
  });
  it("mime não suportado (imagem) lança", async () => {
    await expect(extractCvText(Buffer.from(""), "image/png", deps)).rejects.toThrow();
  });
  it(".doc legado lança", async () => {
    await expect(extractCvText(Buffer.from(""), "application/msword", deps)).rejects.toThrow();
  });
});
