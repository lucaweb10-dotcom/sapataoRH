"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CriteriosCargo } from "@/lib/cv/criterios-shared";
import { alternarCargoAtivo, criarCargosPadrao } from "./actions";
import { CargoDialog } from "./cargo-dialog";

export interface CargoConfig {
  id: string;
  nome: string;
  ativo: boolean;
  criterios: CriteriosCargo;
}

export function CargosSection({ cargos }: { cargos: CargoConfig[] }) {
  const router = useRouter();
  const [dialogCargo, setDialogCargo] = useState<CargoConfig | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [criandoPadrao, setCriandoPadrao] = useState(false);

  function abrir(cargo: CargoConfig | null) {
    setDialogCargo(cargo);
    setDialogAberto(true);
  }

  async function handleCriarPadrao() {
    setCriandoPadrao(true);
    try {
      const r = await criarCargosPadrao();
      if (!r.ok) {
        toast.error(r.error === "forbidden" ? "Sem permissão." : "Erro ao criar os cargos padrão.");
        return;
      }
      toast.success(
        r.criados && r.criados > 0
          ? `${r.criados} cargos criados com critérios pré-preenchidos — revise e ajuste ao seu jeito.`
          : "Os cargos padrão já existem.",
      );
      router.refresh();
    } finally {
      setCriandoPadrao(false);
    }
  }

  async function handleAlternar(cargo: CargoConfig) {
    const r = await alternarCargoAtivo(cargo.id, !cargo.ativo);
    if (!r.ok) {
      toast.error("Erro ao alterar o cargo.");
      return;
    }
    toast.success(cargo.ativo ? `${cargo.nome} desativado.` : `${cargo.nome} reativado.`);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-neutro-200 bg-white p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-neutro-900">Critérios por cargo</h2>
        <p className="text-sm text-neutro-600 mt-0.5">
          Cada vaga tem exigências diferentes — o que elimina um frentista não elimina uma
          cozinheira. A análise roda para UM cargo, usando os critérios dele + os critérios gerais
          abaixo.
        </p>
      </div>

      {cargos.length === 0 ? (
        <div className="space-y-3 rounded-md border border-dashed border-neutro-200 p-4 text-center">
          <p className="text-sm text-neutro-600">
            Nenhum cargo cadastrado. Sem cargos, a análise roda no modo geral (menos precisa).
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={handleCriarPadrao} disabled={criandoPadrao}>
              <Wand2 className="size-4" />
              {criandoPadrao ? "Criando…" : "Criar cargos padrão de posto"}
            </Button>
            <Button variant="outline" onClick={() => abrir(null)}>
              <Plus className="size-4" />
              Adicionar cargo do zero
            </Button>
          </div>
          <p className="text-xs text-neutro-500">
            Os cargos padrão (Frentista, Caixa, Atendente, Cozinha) já vêm com critérios
            pré-preenchidos e editáveis.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-neutro-100">
            {cargos.map((cargo) => (
              <li key={cargo.id} className="flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => abrir(cargo)}
                  className="flex-1 text-left hover:opacity-80"
                >
                  <span className={`text-sm font-medium ${cargo.ativo ? "text-neutro-900" : "text-neutro-500 line-through"}`}>
                    {cargo.nome}
                  </span>
                  <span className="block text-xs text-neutro-500">
                    {cargo.criterios.eliminatorios.length} eliminatórios ·{" "}
                    {cargo.criterios.desejaveis.length} desejáveis ·{" "}
                    {cargo.criterios.pontos_sucesso.length + cargo.criterios.pontos_baixa.length}{" "}
                    pontos de nota
                  </span>
                </button>
                <Button size="sm" variant="ghost" onClick={() => abrir(cargo)}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleAlternar(cargo)}>
                  {cargo.ativo ? "Desativar" : "Reativar"}
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" onClick={() => abrir(null)}>
            <Plus className="size-4" />
            Adicionar cargo
          </Button>
        </>
      )}

      {dialogAberto && (
        <CargoDialog
          key={dialogCargo?.id ?? "novo"}
          cargo={dialogCargo}
          open={dialogAberto}
          onOpenChange={setDialogAberto}
        />
      )}
    </div>
  );
}
