"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CriteriosGerais } from "@/lib/cv/criterios-shared";
import { montarPromptPreview } from "@/lib/cv/prompt-preview";
import type { CargoConfig } from "./cargos-section";

const GERAL = "__geral__";

interface Props {
  gerais: CriteriosGerais;
  cargos: CargoConfig[];
}

/** "Veja como a IA vai ler suas respostas" — preview ao vivo do system prompt. */
export function PromptPreview({ gerais, cargos }: Props) {
  const [aberto, setAberto] = useState(false);
  const [cargoId, setCargoId] = useState(cargos[0]?.id ?? GERAL);

  // Cargo desativado/removido após montar → volta para "geral" (trigger nunca fica vazio).
  const cargoIdValido = cargos.some((c) => c.id === cargoId) ? cargoId : GERAL;
  const cargo = cargos.find((c) => c.id === cargoIdValido) ?? null;
  const texto = montarPromptPreview(gerais, cargo);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium text-sapatao-verde hover:underline"
      >
        {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        Ver como a IA vai ler suas respostas
      </button>

      {aberto && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutro-500">Prompt para a vaga:</span>
            <Select
              value={cargoIdValido}
              items={{
                ...Object.fromEntries(cargos.map((c) => [c.id, c.nome])),
                [GERAL]: "Análise geral (sem cargo)",
              }}
              onValueChange={(v: string | null) => setCargoId(v ?? GERAL)}
            >
              <SelectTrigger size="sm" aria-label="Cargo do preview">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cargos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
                <SelectItem value={GERAL}>Análise geral (sem cargo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-neutro-500">
            Pré-visualização ao vivo — reflete o que está na tela, mesmo antes de salvar.
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-neutro-200 bg-neutro-50 p-3 font-mono text-xs text-neutro-700">
            {texto}
          </pre>
        </div>
      )}
    </div>
  );
}
