/**
 * Teto de tamanho para anexo do chat.
 *
 * O arquivo trafega em base64 dentro de um JSON até o nosso route handler, e
 * base64 infla ~33%. O gargalo não é o WhatsApp (que aceita bem mais) e sim o
 * limite de corpo de requisição da plataforma — em serverless costuma ser
 * ~4,5MB. 3MB de arquivo viram ~4MB de base64, que passa com folga.
 *
 * Uma única fonte da verdade para o cliente (bloqueia antes de ler o arquivo,
 * com mensagem honesta) e para o servidor (rejeita 413 se alguém burlar a UI).
 */
export const MAX_ANEXO_BYTES = 3 * 1024 * 1024;

/** base64 gera 4 caracteres a cada 3 bytes; a margem cobre o padding. */
export const MAX_ANEXO_BASE64_CHARS = Math.ceil((MAX_ANEXO_BYTES * 4) / 3) + 1024;

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Mensagem para o usuário — diz o tamanho do arquivo e o limite, nunca "tente de novo". */
export function mensagemAnexoGrande(bytes: number): string {
  return `Arquivo de ${formatarBytes(bytes)} — o limite é ${formatarBytes(
    MAX_ANEXO_BYTES,
  )}. Reduza o arquivo e tente de novo.`;
}

export function anexoCabe(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_ANEXO_BYTES;
}
