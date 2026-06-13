import { describe, it, expect } from "vitest";
import { normalizePhone, isOptOut } from "./phone";

describe("normalizePhone", () => {
  it("keeps digits only, strips JID suffix and +", () => {
    expect(normalizePhone("+55 (51) 99999-9999")).toBe("5551999999999");
    expect(normalizePhone("5551999999999@s.whatsapp.net")).toBe("5551999999999");
    expect(normalizePhone("5551999999999:12@s.whatsapp.net")).toBe("5551999999999");
  });
  it("returns empty for junk", () => {
    expect(normalizePhone("abc")).toBe("");
  });
  it("strips device suffix without JID", () => {
    expect(normalizePhone("5551999999999:12")).toBe("5551999999999");
  });
  it("returns empty string for empty input", () => {
    expect(normalizePhone("")).toBe("");
  });
});
describe("isOptOut", () => {
  it("detects PARAR/SAIR/STOP case-insensitive as a standalone word", () => {
    expect(isOptOut("PARAR")).toBe(true);
    expect(isOptOut("quero sair")).toBe(true);
    expect(isOptOut("stop")).toBe(true);
    expect(isOptOut("tenho experiência")).toBe(false);
    expect(isOptOut("continuo disponível")).toBe(false);
  });
  it("does not match word embedded in another word (boundary check)", () => {
    expect(isOptOut("pararei amanhã")).toBe(false);
  });
  it("detects cancelar as a standalone word", () => {
    expect(isOptOut("cancelar")).toBe(true);
  });
  it("detects PARAR with punctuation", () => {
    expect(isOptOut("PARAR!")).toBe(true);
  });
  it("detects quero sair with trailing punctuation", () => {
    expect(isOptOut("quero sair.")).toBe(true);
  });
  it("returns false for empty string", () => {
    expect(isOptOut("")).toBe(false);
  });
  it("returns false for null", () => {
    expect(isOptOut(null)).toBe(false);
  });
});
