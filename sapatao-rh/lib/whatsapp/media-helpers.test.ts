import { describe, it, expect } from "vitest";
import { mimeToExt, tipoFromMime, isCurriculoDoc, isAnalisavelCv } from "./media-helpers";

describe("mimeToExt", () => {
  it("maps known mimes, falls back to bin", () => {
    expect(mimeToExt("image/jpeg")).toBe("jpg");
    expect(mimeToExt("application/pdf")).toBe("pdf");
    expect(mimeToExt("audio/ogg; codecs=opus")).toBe("ogg");
    expect(mimeToExt(null)).toBe("bin");
    expect(mimeToExt("application/unknown")).toBe("bin");
  });
});
describe("tipoFromMime", () => {
  it("classifies by prefix, default document", () => {
    expect(tipoFromMime("image/png")).toBe("image");
    expect(tipoFromMime("audio/ogg")).toBe("audio");
    expect(tipoFromMime("video/mp4")).toBe("video");
    expect(tipoFromMime("application/pdf")).toBe("document");
    expect(tipoFromMime(null)).toBe("document");
  });
});
describe("isCurriculoDoc", () => {
  it("true for pdf/doc/docx only", () => {
    expect(isCurriculoDoc("application/pdf")).toBe(true);
    expect(isCurriculoDoc("application/msword")).toBe(true);
    expect(isCurriculoDoc("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    expect(isCurriculoDoc("image/jpeg")).toBe(false);
    expect(isCurriculoDoc(null)).toBe(false);
  });
});

describe("isAnalisavelCv", () => {
  it("aceita só PDF e DOCX (exclui .doc legado e imagens)", () => {
    expect(isAnalisavelCv("application/pdf")).toBe(true);
    expect(isAnalisavelCv("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    expect(isAnalisavelCv("application/msword")).toBe(false); // .doc não é extraível
    expect(isAnalisavelCv("image/png")).toBe(false);
    expect(isAnalisavelCv(null)).toBe(false);
  });
});
