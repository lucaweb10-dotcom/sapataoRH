/**
 * Compact relative duration since `entrouEm` (ISO) until `agora` (epoch ms).
 * null/empty -> ""; <60s (or future) -> "agora"; then "Xm" / "Xh" / "Xd".
 */
export function tempoNaEtapa(entrouEm: string | null, agora: number): string {
  if (!entrouEm) return "";
  const diff = Math.floor((agora - new Date(entrouEm).getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
