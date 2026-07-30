"use client";

// Bloco de pergunta do questionário de IA: label + badge + explicativo + campo.
// Listas usam textarea "um critério por linha" (frases inteiras não cabem em chips).

interface PerguntaProps {
  numero: number;
  label: string;
  recomendado?: boolean;
  explicativo: string;
  children: React.ReactNode;
}

export function Pergunta({ numero, label, recomendado, explicativo, children }: PerguntaProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sapatao-verde/10 text-micro font-semibold text-sapatao-verde">
          {numero}
        </span>
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-micro ${
            recomendado
              ? "bg-sapatao-verde/10 text-sapatao-verde"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {recomendado ? "Recomendado" : "Opcional"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{explicativo}</p>
      {children}
    </div>
  );
}

interface CampoListaProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
  ariaLabel?: string;
}

/** Textarea de lista (1 critério por linha). O parse p/ array é feito no submit. */
export function CampoLista({ value, onChange, placeholder, rows = 3, ariaLabel }: CampoListaProps) {
  return (
    <div className="space-y-1">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-label={ariaLabel}
        className="w-full resize-y rounded-md border border-border px-3 py-2 text-sm"
      />
      <p className="text-caption text-muted-foreground">Um critério por linha.</p>
    </div>
  );
}

/** "a\nb\n\n c " → ["a","b","c"] */
export function linhasParaLista(texto: string): string[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** ["a","b"] → "a\nb" */
export function listaParaLinhas(lista: string[]): string {
  return lista.join("\n");
}
