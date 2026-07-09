/** CPF helpers — pure, no I/O. CPFs are stored as 11 digits (no mask). */

export function normalizarCpf(entrada: string): string {
  return entrada.replace(/\D/g, "");
}

/** Validates the CPF check digits (aceita com ou sem máscara). */
export function cpfValido(entrada: string): boolean {
  const cpf = normalizarCpf(entrada);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // 000..., 111..., etc.

  const dv = (len: number): number => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(cpf[i]) * (len + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

/** 04252011040 -> 042.520.110-40 (para exibição). */
export function formatarCpf(cpf: string | null): string {
  if (!cpf) return "";
  const d = normalizarCpf(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
