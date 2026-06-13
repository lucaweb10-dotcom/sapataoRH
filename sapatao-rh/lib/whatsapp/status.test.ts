import { describe, it, expect } from "vitest";
import { advanceStatus } from "./status";

describe("advanceStatus (forward-only)", () => {
  it("advances along queued<sent<delivered<read", () => {
    expect(advanceStatus("queued", "sent")).toBe("sent");
    expect(advanceStatus("sent", "delivered")).toBe("delivered");
    expect(advanceStatus("delivered", "read")).toBe("read");
  });
  it("never regresses on out-of-order events", () => {
    expect(advanceStatus("read", "sent")).toBe("read");
    expect(advanceStatus("delivered", "sent")).toBe("delivered");
  });
  it("failed overrides queued/sent but not delivered/read", () => {
    expect(advanceStatus("queued", "failed")).toBe("failed");
    expect(advanceStatus("sent", "failed")).toBe("failed");
    expect(advanceStatus("delivered", "failed")).toBe("delivered");
    expect(advanceStatus("read", "failed")).toBe("read");
  });
  it("failed is terminal", () => {
    expect(advanceStatus("failed", "sent")).toBe("failed");
    expect(advanceStatus("failed", "read")).toBe("failed");
  });
  it("is idempotent", () => {
    expect(advanceStatus("read", "read")).toBe("read");
    expect(advanceStatus("queued", "queued")).toBe("queued");
  });
});
