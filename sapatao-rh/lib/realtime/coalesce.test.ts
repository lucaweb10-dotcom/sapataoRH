import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCoalescer, REFRESH_COALESCE_MS } from "./coalesce";

let agora = 0;
const now = () => agora;

beforeEach(() => {
  agora = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

/** Avança relógio lógico e timers juntos — senão o `elapsed` nunca cresce. */
function avancar(ms: number) {
  agora += ms;
  vi.advanceTimersByTime(ms);
}

describe("createCoalescer", () => {
  it("roda o primeiro evento imediatamente (sem atraso perceptível)", () => {
    const run = vi.fn();
    createCoalescer(run, 500, now).schedule();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("colapsa uma rajada em 2 execuções: a imediata e uma no fim da janela", () => {
    const run = vi.fn();
    const c = createCoalescer(run, 500, now);
    for (let i = 0; i < 20; i++) c.schedule();
    expect(run).toHaveBeenCalledTimes(1);
    avancar(500);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("não roda de novo no fim da janela se não houve evento novo", () => {
    const run = vi.fn();
    const c = createCoalescer(run, 500, now);
    c.schedule();
    avancar(500);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("eventos espaçados além da janela rodam todos na hora", () => {
    const run = vi.fn();
    const c = createCoalescer(run, 500, now);
    c.schedule();
    avancar(600);
    c.schedule();
    avancar(600);
    c.schedule();
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("uma rajada longa nunca ultrapassa 1 execução por janela", () => {
    const run = vi.fn();
    const c = createCoalescer(run, 500, now);
    // 3 segundos de eventos a cada 50ms = 60 eventos
    for (let i = 0; i < 60; i++) {
      c.schedule();
      avancar(50);
    }
    // 3000ms / 500ms = 6 janelas, +1 da borda de subida inicial
    expect(run.mock.calls.length).toBeLessThanOrEqual(7);
    expect(run.mock.calls.length).toBeGreaterThan(1);
  });

  it("cancel() impede a execução pendente (desmontagem do componente)", () => {
    const run = vi.fn();
    const c = createCoalescer(run, 500, now);
    c.schedule();
    c.schedule();
    c.cancel();
    avancar(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("usa 500ms por padrão", () => {
    const run = vi.fn();
    const c = createCoalescer(run, undefined, now);
    c.schedule();
    c.schedule();
    avancar(REFRESH_COALESCE_MS - 1);
    expect(run).toHaveBeenCalledTimes(1);
    avancar(1);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
