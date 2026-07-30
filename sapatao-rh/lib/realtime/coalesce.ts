/**
 * Colapsa uma rajada de eventos em no máximo uma execução a cada `waitMs`.
 *
 * Borda de subida (leading): o PRIMEIRO evento roda na hora — mensagem nova tem
 * que aparecer sem meio segundo de atraso. Os eventos seguintes dentro da janela
 * viram uma única execução no fim dela (trailing).
 *
 * Existe porque `router.refresh()` por evento de realtime vira tempestade de
 * re-render da página inteira quando a empresa está movimentada.
 */
export const REFRESH_COALESCE_MS = 500;

export interface Coalescer {
  schedule: () => void;
  cancel: () => void;
}

export function createCoalescer(
  run: () => void,
  waitMs: number = REFRESH_COALESCE_MS,
  now: () => number = Date.now,
): Coalescer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let lastRun = Number.NEGATIVE_INFINITY;

  function fire() {
    timer = null;
    pending = false;
    lastRun = now();
    run();
  }

  function armWindow(ms: number) {
    timer = setTimeout(() => {
      timer = null;
      if (pending) {
        fire();
        armWindow(waitMs);
      }
    }, ms);
  }

  return {
    schedule() {
      if (timer) {
        pending = true;
        return;
      }
      const elapsed = now() - lastRun;
      if (elapsed >= waitMs) {
        fire();
        armWindow(waitMs);
        return;
      }
      pending = true;
      armWindow(waitMs - elapsed);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = false;
    },
  };
}
