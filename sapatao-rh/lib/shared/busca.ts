/** Prepares free text for a PostgREST `or(...ilike...)` filter: strips the
 *  chars that break or() parsing (commas/parens) and escapes ilike wildcards
 *  so user input is matched literally. Empty result = nothing usable. */
export function textoIlikeSeguro(q: string): string {
  return q
    .replace(/[,()]/g, " ")
    .replace(/([\\%_])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function somenteDigitos(q: string): string {
  return q.replace(/\D/g, "");
}
