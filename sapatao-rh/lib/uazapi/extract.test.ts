import { describe, it, expect } from "vitest";
import { extractMessageId, extractQr, normalizeStatus } from "./extract";

describe("extractMessageId", () => {
  it("prefers messageid, falls back through id/key.id/message.key.id", () => {
    expect(extractMessageId({ messageid: "m1" })).toBe("m1");
    expect(extractMessageId({ id: "owner:m2" })).toBe("owner:m2");
    expect(extractMessageId({ key: { id: "m3" } })).toBe("m3");
    expect(extractMessageId({ message: { key: { id: "m4" } } })).toBe("m4");
    expect(extractMessageId({})).toBeNull();
  });
});
describe("extractQr", () => {
  it("tries qrcode/qrCode/base64 across shapes", () => {
    expect(extractQr({ instance: { qrcode: "Q1" } })).toBe("Q1");
    expect(extractQr({ qrcode: "Q2" })).toBe("Q2");
    expect(extractQr({ qrCode: "Q3" })).toBe("Q3");
    expect(extractQr({ base64: "Q4" })).toBe("Q4");
    expect(extractQr({})).toBeNull();
  });
});
describe("normalizeStatus", () => {
  it("maps Title-Case + variants case-insensitively", () => {
    expect(normalizeStatus("Read")).toBe("read");
    expect(normalizeStatus("DELIVERY_ACK")).toBe("delivered");
    expect(normalizeStatus("server_ack")).toBe("sent");
    expect(normalizeStatus("PLAYED")).toBe("read");
    expect(normalizeStatus("ERROR")).toBe("failed");
    expect(normalizeStatus("Deleted")).toBe("deleted");
    expect(normalizeStatus("weird")).toBeNull();
  });
  it("maps PENDING to sent", () => {
    expect(normalizeStatus("PENDING")).toBe("sent");
  });
  it("maps canceled to failed", () => {
    expect(normalizeStatus("canceled")).toBe("failed");
  });
  it("trims whitespace before mapping", () => {
    expect(normalizeStatus("  Read  ")).toBe("read");
  });
  it("returns null for non-string inputs", () => {
    expect(normalizeStatus(123)).toBeNull();
    expect(normalizeStatus(null)).toBeNull();
  });
});
describe("extractQr (additional)", () => {
  it("reads base64 from nested instance object", () => {
    expect(extractQr({ instance: { base64: "Q5" } })).toBe("Q5");
  });
});
