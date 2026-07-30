/**
 * Constantes de paginação da thread.
 *
 * Módulo NEUTRO de propósito: `lib/chat/queries.ts` importa `next/headers`
 * (server-only) e o composer/thread são client components — importar a
 * constante de lá arrastaria o módulo de servidor para o bundle do browser.
 */

/** Tamanho da janela de mensagens. Sem virtualização: janela + scroll infinito
 *  dão conta, e virtualizar quebraria a âncora de scroll ao prepender. */
export const MESSAGES_PAGE_SIZE = 60;
