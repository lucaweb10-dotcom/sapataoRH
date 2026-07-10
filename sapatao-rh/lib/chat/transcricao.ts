// Transcrição de áudios de uma conversa com cache em messages.transcricao —
// cada áudio é pago 1x; reanálises reusam o cache. Puro/injetável p/ teste.
import { LlmError } from "@/lib/llm/types";

export const MAX_AUDIOS_POR_ANALISE = 20;
export const TRANSCRICAO_PARALELISMO = 3;
export const PLACEHOLDER_SEM_TRANSCRICAO = "[áudio sem transcrição]";

export interface AudioPendente {
  id: string;
  midia_url: string | null;
  transcricao: string | null;
  /** created_at ISO — usado p/ priorizar os mais recentes quando passa do cap. */
  created_at: string;
}

export interface TranscricaoDeps {
  baixarAudio: (path: string) => Promise<{ buffer: Buffer; mime: string } | null>;
  transcrever: (audio: { buffer: Buffer; mime: string }) => Promise<{ texto: string; tokens: number }>;
  /** Grava o cache (update messages.transcricao). Best-effort: erro não derruba a análise. */
  salvarCache: (messageId: string, texto: string) => Promise<{ error: unknown | null }>;
}

/**
 * Resolve a transcrição de cada áudio: cache → Map direto (custo zero); sem cache →
 * transcreve os até MAX_AUDIOS_POR_ANALISE mais recentes (pool de 3), grava cache
 * best-effort. Falha individual vira placeholder SEM cache (retry futuro);
 * `chave_invalida` aborta tudo (re-throw).
 */
export async function transcreverPendentes(
  audios: AudioPendente[],
  deps: TranscricaoDeps,
): Promise<{ porMensagem: Map<string, string>; tokens: number }> {
  const porMensagem = new Map<string, string>();
  let tokens = 0;

  const pendentes: AudioPendente[] = [];
  for (const a of audios) {
    // !== null: transcrição vazia ("" — áudio em silêncio) TAMBÉM é cache pago.
    if (a.transcricao !== null && a.transcricao !== undefined) {
      porMensagem.set(a.id, a.transcricao);
    } else if (a.midia_url) {
      pendentes.push(a);
    } else {
      porMensagem.set(a.id, PLACEHOLDER_SEM_TRANSCRICAO);
    }
  }

  // Prioriza os mais recentes; os que passarem do cap ficam com placeholder.
  const ordenados = [...pendentes].sort((x, y) => y.created_at.localeCompare(x.created_at));
  const aTranscrever = ordenados.slice(0, MAX_AUDIOS_POR_ANALISE);
  for (const fora of ordenados.slice(MAX_AUDIOS_POR_ANALISE)) {
    porMensagem.set(fora.id, PLACEHOLDER_SEM_TRANSCRICAO);
  }

  let chaveInvalida: LlmError | null = null;
  const fila = [...aTranscrever];

  async function worker(): Promise<void> {
    for (;;) {
      const item = fila.shift();
      if (!item || chaveInvalida) return;
      try {
        const audio = await deps.baixarAudio(item.midia_url!);
        if (!audio) {
          porMensagem.set(item.id, PLACEHOLDER_SEM_TRANSCRICAO);
          continue;
        }
        const { texto, tokens: t } = await deps.transcrever(audio);
        tokens += t;
        porMensagem.set(item.id, texto);
        try {
          await deps.salvarCache(item.id, texto);
        } catch {
          /* cache é best-effort */
        }
      } catch (err) {
        if (err instanceof LlmError && err.code === "chave_invalida") {
          chaveInvalida = err;
          return;
        }
        porMensagem.set(item.id, PLACEHOLDER_SEM_TRANSCRICAO);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(TRANSCRICAO_PARALELISMO, aTranscrever.length) },
    () => worker(),
  );
  await Promise.all(workers);

  if (chaveInvalida) throw chaveInvalida;
  return { porMensagem, tokens };
}
