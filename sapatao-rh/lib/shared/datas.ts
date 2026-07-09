/** dd/mm/aaaa a partir de uma date ISO (yyyy-mm-dd), sem risco de timezone. */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** yyyy-mm-dd de hoje (local). */
export function hojeIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
