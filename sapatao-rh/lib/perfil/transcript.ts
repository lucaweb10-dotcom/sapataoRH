// Builder puro do transcript da conversa p/ a análise de perfil (SP3b).

export const MAX_TRANSCRIPT_CHARS = 24_000;
/** Início preservado no truncamento (respostas da triagem inicial). */
const HEAD_CHARS = 4_000;

export type TranscriptMsg = {
  id: string;
  direction: "inbound" | "outbound";
  tipo: string; // MessageTipo
  conteudo: string | null;
  midia_mime: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  /** Transcrição já resolvida (cache/recém-transcrita/placeholder); null p/ não-áudio. */
  transcricao: string | null;
};

function rotulo(msg: TranscriptMsg): string {
  if (msg.tipo === "system") return "Sistema";
  return msg.direction === "inbound" ? "Candidato" : "RH";
}

function dataHora(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

function corpo(msg: TranscriptMsg): string {
  switch (msg.tipo) {
    case "text":
    case "system":
      return msg.conteudo ?? "";
    case "image":
      return msg.conteudo ? `[imagem: ${msg.conteudo}]` : "[imagem]";
    case "audio":
    case "ptt":
      return `[áudio]: ${msg.transcricao ?? "[áudio sem transcrição]"}`;
    case "document": {
      const nome =
        typeof msg.metadata.fileName === "string" ? msg.metadata.fileName : (msg.midia_mime ?? "arquivo");
      return `[documento anexado: ${nome} — ver ANEXOS]`;
    }
    case "video":
      return "[vídeo]";
    case "sticker":
      return "[figurinha]";
    default:
      return msg.conteudo ?? `[${msg.tipo}]`;
  }
}

/**
 * Monta o transcript rotulado da conversa. Acima do cap, preserva o INÍCIO
 * (triagem) + o FINAL (recência), marcando o trecho omitido.
 */
export function montarTranscript(msgs: TranscriptMsg[], opts?: { maxChars?: number }): string {
  const maxChars = opts?.maxChars ?? MAX_TRANSCRIPT_CHARS;
  const linhas = msgs
    .map((m) => {
      const texto = corpo(m).trim();
      if (!texto) return null;
      return `[${dataHora(m.created_at)}] ${rotulo(m)}: ${texto}`;
    })
    .filter((l): l is string => l !== null);

  const completo = linhas.join("\n");
  if (completo.length <= maxChars) return completo;

  const marcador = "\n…[trecho intermediário omitido]…\n";
  const head = completo.slice(0, HEAD_CHARS);
  const tailBudget = Math.max(0, maxChars - HEAD_CHARS - marcador.length);
  const tail = completo.slice(completo.length - tailBudget);
  return head + marcador + tail;
}
