"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CriteriosCargo } from "@/lib/cv/criterios-shared";
import { criarCargo, atualizarCargo } from "./actions";
import { CampoLista, Pergunta, linhasParaLista, listaParaLinhas } from "./campo-lista";
import type { CargoConfig } from "./cargos-section";

interface Props {
  cargo: CargoConfig | null; // null = criar
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CargoDialog({ cargo, open, onOpenChange }: Props) {
  const router = useRouter();
  const editing = !!cargo;
  const [pending, setPending] = useState(false);
  const [nome, setNome] = useState(cargo?.nome ?? "");
  const [eliminatorios, setEliminatorios] = useState(listaParaLinhas(cargo?.criterios.eliminatorios ?? []));
  const [desejaveis, setDesejaveis] = useState(listaParaLinhas(cargo?.criterios.desejaveis ?? []));
  const [sucesso, setSucesso] = useState(listaParaLinhas(cargo?.criterios.pontos_sucesso ?? []));
  const [baixa, setBaixa] = useState(listaParaLinhas(cargo?.criterios.pontos_baixa ?? []));
  const [contexto, setContexto] = useState(cargo?.criterios.contexto_cargo ?? "");

  async function submit() {
    setPending(true);
    try {
      const criterios: CriteriosCargo = {
        eliminatorios: linhasParaLista(eliminatorios),
        desejaveis: linhasParaLista(desejaveis),
        pontos_sucesso: linhasParaLista(sucesso),
        pontos_baixa: linhasParaLista(baixa),
        contexto_cargo: contexto.trim(),
      };
      const r = editing
        ? await atualizarCargo(cargo!.id, { nome: nome.trim(), criterios })
        : await criarCargo({ nome: nome.trim(), criterios });
      if (!r.ok) {
        if (r.error === "nome_duplicado") toast.error("Já existe um cargo com esse nome.");
        else if (r.error === "invalido")
          toast.error("Confira as respostas — nome ou algum critério passou do tamanho máximo.");
        else if (r.error === "forbidden") toast.error("Sem permissão.");
        else toast.error("Erro ao salvar o cargo.");
        return;
      }
      toast.success(editing ? `Cargo ${nome.trim()} atualizado.` : `Cargo ${nome.trim()} criado.`);
      onOpenChange(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Critérios do cargo` : "Novo cargo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="mb-1">Nome do cargo</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={60}
              placeholder="Frentista"
            />
          </div>

          <Pergunta
            numero={1}
            label="O que elimina um candidato de imediato?"
            recomendado
            explicativo="Se qualquer item desta lista não for atendido, a IA marca o candidato como Inapto para este cargo, independente do resto. Use só para exigências inegociáveis — lei ou operação. Vazio = ninguém é reprovado automaticamente."
          >
            <CampoLista
              ariaLabel="Critérios eliminatórios do cargo"
              value={eliminatorios}
              onChange={setEliminatorios}
              placeholder={"Ter 18 anos ou mais\nDisponibilidade para escala 6x1, incluindo fins de semana"}
            />
          </Pergunta>

          <Pergunta
            numero={2}
            label="O que descreve o perfil ideal, sem ser obrigatório?"
            recomendado
            explicativo="Cada item atendido aumenta a nota; não atender não elimina. A IA mostra o ✓/✗ de cada critério com a evidência encontrada. Vazio = a IA avalia só com noções genéricas da vaga."
          >
            <CampoLista
              ariaLabel="Critérios desejáveis do cargo"
              value={desejaveis}
              onChange={setDesejaveis}
              placeholder={"Experiência como frentista, caixa ou atendente\nJá ter operado máquina de cartão"}
            />
          </Pergunta>

          <Pergunta
            numero={3}
            label='O que faz você pensar "quero entrevistar essa pessoa"?'
            explicativo='Sinais positivos que somam pontos além dos critérios — o desempate entre candidatos parecidos. Aparecem em "Pontos fortes" do parecer.'
          >
            <CampoLista
              ariaLabel="Pontos que aumentam a nota"
              value={sucesso}
              onChange={setSucesso}
              placeholder={"Morar perto da unidade\nIndicação de funcionário atual da rede"}
            />
          </Pergunta>

          <Pergunta
            numero={4}
            label="O que acende um alerta amarelo (sem eliminar)?"
            explicativo='Derrubam a nota e viram "Pontos de atenção" + pergunta sugerida para esclarecer na entrevista — o candidato continua no processo.'
          >
            <CampoLista
              ariaLabel="Pontos que reduzem a nota"
              value={baixa}
              onChange={setBaixa}
              placeholder={"Nunca ter trabalhado com atendimento ao público\nRestrição de horário não informada"}
            />
          </Pergunta>

          <Pergunta
            numero={5}
            label="O que mais a IA precisa saber sobre este cargo?"
            explicativo="Texto livre sobre a rotina, exigências físicas, particularidades. Entra nas instruções junto com os critérios acima."
          >
            <textarea
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
              aria-label="Contexto do cargo"
              placeholder="Atendimento na pista: abastecimento, troca de óleo simples, cortesia com o cliente."
              rows={3}
              className="w-full resize-y rounded-md border border-border px-3 py-2 text-sm"
            />
          </Pergunta>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button onClick={submit} disabled={pending || nome.trim().length < 2}>
            {pending ? "Salvando…" : "Salvar cargo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
