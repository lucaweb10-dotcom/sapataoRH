import { describe, it, expect } from "vitest";
import {
  cutoffDoPeriodo,
  agruparPorSemana,
  calcularSlaStatus,
  media,
} from "./calculos";

const AGORA = new Date("2026-06-15T12:00:00Z"); // segunda-feira

describe("cutoffDoPeriodo", () => {
  it("30d retorna 30 dias atrás meia-noite", () => {
    const c = cutoffDoPeriodo("30d", AGORA);
    expect(c).not.toBeNull();
    expect(c!.toISOString().startsWith("2026-05-16")).toBe(true);
    expect(c!.getHours()).toBe(0);
  });

  it("90d retorna 90 dias atrás", () => {
    const c = cutoffDoPeriodo("90d", AGORA);
    expect(c).not.toBeNull();
    expect(c!.toISOString().startsWith("2026-03-17")).toBe(true);
  });

  it("365d retorna ~1 ano atrás", () => {
    const c = cutoffDoPeriodo("365d", AGORA);
    expect(c).not.toBeNull();
    expect(c!.getFullYear()).toBe(2025);
  });

  it("all retorna null", () => {
    expect(cutoffDoPeriodo("all", AGORA)).toBeNull();
  });
});

describe("agruparPorSemana", () => {
  it("retorna nSemanas buckets mesmo sem dados", () => {
    const r = agruparPorSemana([], 4, AGORA);
    expect(r).toHaveLength(4);
    expect(r.every((e) => e.count === 0)).toBe(true);
  });

  it("conta data na semana correta", () => {
    // 2026-06-15 é segunda → bucket dd/mm = 15/06
    const r = agruparPorSemana(["2026-06-15T10:00:00Z"], 4, AGORA);
    const ultimo = r[r.length - 1];
    expect(ultimo.count).toBe(1);
  });

  it("ignora datas fora da janela", () => {
    const r = agruparPorSemana(["2025-01-01T00:00:00Z"], 4, AGORA);
    expect(r.every((e) => e.count === 0)).toBe(true);
  });

  it("acumula múltiplas datas na mesma semana", () => {
    const datas = [
      "2026-06-15T08:00:00Z",
      "2026-06-16T09:00:00Z",
      "2026-06-17T10:00:00Z",
    ];
    const r = agruparPorSemana(datas, 4, AGORA);
    const ultimo = r[r.length - 1];
    expect(ultimo.count).toBe(3);
  });

  it("distribui entre semanas distintas", () => {
    const datas = [
      "2026-06-08T10:00:00Z", // semana anterior
      "2026-06-15T10:00:00Z", // semana atual
    ];
    const r = agruparPorSemana(datas, 4, AGORA);
    const penultimo = r[r.length - 2];
    const ultimo = r[r.length - 1];
    expect(penultimo.count).toBe(1);
    expect(ultimo.count).toBe(1);
  });
});

describe("calcularSlaStatus", () => {
  it("retorna zeros se sla_dias null", () => {
    const r = calcularSlaStatus(["2026-06-14T00:00:00Z"], null, AGORA);
    expect(r).toEqual({ dentro: 0, fora: 0 });
  });

  it("retorna zeros se lista vazia", () => {
    expect(calcularSlaStatus([], 5, AGORA)).toEqual({ dentro: 0, fora: 0 });
  });

  it("ignora entradas null", () => {
    expect(calcularSlaStatus([null, null], 5, AGORA)).toEqual({ dentro: 0, fora: 0 });
  });

  it("dentro quando chegou ontem e sla=3", () => {
    const ontem = new Date(AGORA);
    ontem.setDate(ontem.getDate() - 1);
    const r = calcularSlaStatus([ontem.toISOString()], 3, AGORA);
    expect(r).toEqual({ dentro: 1, fora: 0 });
  });

  it("fora quando chegou 10 dias atrás e sla=7", () => {
    const d = new Date(AGORA);
    d.setDate(d.getDate() - 10);
    const r = calcularSlaStatus([d.toISOString()], 7, AGORA);
    expect(r).toEqual({ dentro: 0, fora: 1 });
  });

  it("separa dentro e fora corretamente", () => {
    const novo = new Date(AGORA);
    novo.setDate(novo.getDate() - 1); // dentro
    const velho = new Date(AGORA);
    velho.setDate(velho.getDate() - 10); // fora
    const r = calcularSlaStatus([novo.toISOString(), velho.toISOString()], 5, AGORA);
    expect(r).toEqual({ dentro: 1, fora: 1 });
  });
});

describe("media", () => {
  it("retorna null para array vazio", () => {
    expect(media([])).toBeNull();
  });

  it("retorna null se todos são null", () => {
    expect(media([null, null])).toBeNull();
  });

  it("ignora nulls no cálculo", () => {
    expect(media([null, 50, null, 100])).toBe(75);
  });

  it("arredonda para inteiro", () => {
    expect(media([33, 34])).toBe(34); // 33.5 arredonda
  });

  it("valor único", () => {
    expect(media([72])).toBe(72);
  });
});
