import { describe, it, expect } from "vitest";
import { ping } from "./smoke";

describe("test harness", () => {
  it("runs and imports modules via @ alias", () => {
    expect(ping()).toBe("pong");
  });
});
