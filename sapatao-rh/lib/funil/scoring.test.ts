import { describe, it, expect } from "vitest";
import { scoreFaixa } from "./scoring";

describe("scoreFaixa", () => {
  it("buckets by threshold; null -> sem", () => {
    expect(scoreFaixa(null)).toBe("sem");
    expect(scoreFaixa(undefined)).toBe("sem");
    expect(scoreFaixa(0)).toBe("baixo");
    expect(scoreFaixa(39)).toBe("baixo");
    expect(scoreFaixa(40)).toBe("medio");
    expect(scoreFaixa(69)).toBe("medio");
    expect(scoreFaixa(70)).toBe("alto");
    expect(scoreFaixa(100)).toBe("alto");
  });
});
