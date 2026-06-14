const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
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
// Note: outbound audio is intentionally classified as 'audio' (file) in SP1c — 'ptt' (voice note) is out of scope.
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
