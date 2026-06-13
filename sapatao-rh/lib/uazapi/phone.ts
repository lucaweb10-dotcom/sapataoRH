export function normalizePhone(raw: string): string {
  const beforeColon = raw.split("@")[0].split(":")[0];
  return beforeColon.replace(/\D/g, "");
}

const OPTOUT = /(^|\s)(parar|sair|stop|cancelar)(\s|$|\.|!)/i;

export function isOptOut(text: string | null | undefined): boolean {
  if (!text) return false;
  return OPTOUT.test(text.trim());
}
