import type { createAdminClient } from "@/lib/supabase/admin";

/** Limite mensal atingido? null = sem limite (nunca excede). */
export function limiteExcedido(usados: number, limite: number | null): boolean {
  if (limite === null) return false;
  return usados >= limite;
}

/** Tokens de IA consumidos no mês corrente (soma de cv_analises.tokens_est, via RPC service-role). */
export async function tokensUsadosNoMes(
  admin: ReturnType<typeof createAdminClient>,
  empresaId: string,
): Promise<number> {
  // Functions é Record<string, never> no Database (gotcha de embeds) → cast do
  // CLIENT (não do método solto — rpc usa `this` internamente).
  type RpcClient = {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown | null }>;
  };
  const { data, error } = await (admin as unknown as RpcClient).rpc("ia_tokens_mes", {
    p_empresa_id: empresaId,
  });
  if (error) {
    // fail-open consciente (falha na soma não bloqueia análise), mas NUNCA em
    // silêncio — sem este log, um RPC quebrado desligaria o teto sem sinal.
    console.error("[llm/limite] ia_tokens_mes falhou (limite não aplicado):", error);
    return 0;
  }
  return Number(data ?? 0);
}
