import { describe, it, expect } from "vitest";
import {
  MAX_ANEXO_BYTES,
  MAX_ANEXO_BASE64_CHARS,
  anexoCabe,
  formatarBytes,
  mensagemAnexoGrande,
} from "./limites";

describe("limite de anexo", () => {
  it("aceita exatamente no teto e recusa um byte acima", () => {
    expect(anexoCabe(MAX_ANEXO_BYTES)).toBe(true);
    expect(anexoCabe(MAX_ANEXO_BYTES + 1)).toBe(false);
  });

  it("recusa arquivo vazio", () => {
    expect(anexoCabe(0)).toBe(false);
  });

  it("o teto de base64 comporta um arquivo no limite (inflação de ~33%)", () => {
    const base64DoArquivoNoLimite = Math.ceil(MAX_ANEXO_BYTES / 3) * 4;
    expect(MAX_ANEXO_BASE64_CHARS).toBeGreaterThanOrEqual(base64DoArquivoNoLimite);
  });

  it("formata em unidade legível", () => {
    expect(formatarBytes(512)).toBe("512 B");
    expect(formatarBytes(2048)).toBe("2 KB");
    expect(formatarBytes(3 * 1024 * 1024)).toBe("3,0 MB");
  });

  it("a mensagem diz o tamanho, o limite, e não manda 'tentar de novo' à toa", () => {
    const msg = mensagemAnexoGrande(8 * 1024 * 1024);
    expect(msg).toContain("8,0 MB");
    expect(msg).toContain("3,0 MB");
    expect(msg).toContain("Reduza o arquivo");
  });
});
