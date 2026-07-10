const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
function clean(mime: string | null): string {
  return (mime ?? "").toLowerCase().split(";")[0].trim();
}
export function mimeToExt(mime: string | null): string {
  return EXT[clean(mime)] ?? "bin";
}
// Note: outbound audio defaults to 'audio' (file) classification here — a voice note
// ('ptt') is opted into explicitly via the `voiceNote` flag threaded through
// enviarMidia/sendMediaSchema, since MIME alone can't tell a recorded note from an
// audio-file attachment (see SP6 gravar/enviar nota de voz).
export function tipoFromMime(mime: string | null): "image" | "audio" | "video" | "document" {
  const m = clean(mime);
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "document";
}
const CV_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export function isCurriculoDoc(mime: string | null): boolean {
  return CV_MIMES.has(clean(mime));
}

// Formatos que a análise de IA realmente consegue extrair (PDF + DOCX). Mais estrito
// que isCurriculoDoc (que inclui .doc legado) — usado para oferecer/admitir a análise.
const CV_ANALISAVEL_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export function isAnalisavelCv(mime: string | null): boolean {
  return CV_ANALISAVEL_MIMES.has(clean(mime));
}
