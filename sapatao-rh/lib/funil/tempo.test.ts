import { describe, it, expect } from "vitest";
import { tempoNaEtapa } from "./tempo";

const base = new Date("2026-06-13T12:00:00Z").getTime();

describe("tempoNaEtapa", () => {
  it("formats relative duration; null -> empty", () => {
    expect(tempoNaEtapa(null, base)).toBe("");
    expect(tempoNaEtapa("2026-06-13T11:59:30Z", base)).toBe("agora");
    expect(tempoNaEtapa("2026-06-13T11:30:00Z", base)).toBe("30m");
    expect(tempoNaEtapa("2026-06-13T09:00:00Z", base)).toBe("3h");
    expect(tempoNaEtapa("2026-06-10T12:00:00Z", base)).toBe("3d");
  });

  it("clamps future timestamps to 'agora' (no negative durations)", () => {
    expect(tempoNaEtapa("2026-06-13T12:05:00Z", base)).toBe("agora");
  });

  it("uses exact boundaries", () => {
    expect(tempoNaEtapa("2026-06-13T11:59:00Z", base)).toBe("1m"); // 60s -> 1m
    expect(tempoNaEtapa("2026-06-13T11:00:00Z", base)).toBe("1h"); // 3600s -> 1h
    expect(tempoNaEtapa("2026-06-12T12:00:00Z", base)).toBe("1d"); // 86400s -> 1d
  });
});
