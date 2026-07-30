import { advanceStatus } from "./status";
import { normalizeStatus } from "@/lib/uazapi/extract";
import type { MessageStatus } from "@/types/database";

/** Status a partir dos quais ainda faz sentido perguntar ao provedor. */
const NAO_TERMINAIS: MessageStatus[] = ["sent", "delivered"];

export interface ReconciliarDeps {
  /** Mensagens outbound da conversa que ainda podem avançar. */
  listarPendentes: () => Promise<{ id: string; uazapi_msg_id: string; status: MessageStatus }[]>;
  /** Consulta no provedor os acks do chat. */
  buscarNoProvedor: () => Promise<{ providerId: string; status: string }[]>;
  atualizar: (id: string, status: MessageStatus) => Promise<void>;
}

/**
 * Reconcilia o ack das mensagens que NÓS enviamos.
 *
 * A UAZAPI não entrega `messages_update` para mensagens enviadas pela própria
 * API, então o webhook nunca avança essas linhas de `sent` para
 * `delivered`/`read`. Aqui perguntamos ativamente e aplicamos a mesma regra
 * forward-only do webhook — nunca regride, então uma resposta atrasada ou fora
 * de ordem é inofensiva.
 */
export async function reconciliarAcks(deps: ReconciliarDeps): Promise<{ atualizadas: number }> {
  const pendentes = await deps.listarPendentes();
  if (pendentes.length === 0) return { atualizadas: 0 };

  const doProvedor = await deps.buscarNoProvedor();
  if (doProvedor.length === 0) return { atualizadas: 0 };

  const porProviderId = new Map(doProvedor.map((m) => [m.providerId, m.status]));

  let atualizadas = 0;
  for (const msg of pendentes) {
    const bruto = porProviderId.get(msg.uazapi_msg_id);
    if (!bruto) continue;
    const normalizado = normalizeStatus(bruto);
    // "deleted" não é um estado de entrega — o webhook também o ignora.
    if (!normalizado || normalizado === "deleted") continue;
    const proximo = advanceStatus(msg.status, normalizado);
    if (proximo === msg.status) continue;
    await deps.atualizar(msg.id, proximo);
    atualizadas++;
  }
  return { atualizadas };
}

export { NAO_TERMINAIS };
