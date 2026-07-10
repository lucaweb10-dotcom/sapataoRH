"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CriteriosGerais } from "@/lib/cv/criterios-shared";
import { salvarCriteriosGerais } from "./actions";
import { CampoLista, Pergunta, linhasParaLista, listaParaLinhas } from "./campo-lista";
import { PromptPreview } from "./prompt-preview";
import type { CargoConfig } from "./cargos-section";

interface Props {
  gerais: CriteriosGerais;
  cargosAtivos: CargoConfig[];
}

export function CriteriosGeraisForm({ gerais, cargosAtivos }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [naoEliminar, setNaoEliminar] = useState(listaParaLinhas(gerais.nao_eliminar));
  const [distancia, setDistancia] = useState(gerais.distancia_max);
  const [unidades, setUnidades] = useState(listaParaLinhas(gerais.unidades));
  const [contexto, setContexto] = useState(gerais.contexto);

  const valores: CriteriosGerais = {
    versao: 2,
    nao_eliminar: linhasParaLista(naoEliminar),
    distancia_max: distancia.trim(),
    unidades: linhasParaLista(unidades),
    contexto: contexto.trim(),
  };

  // Compara a forma NORMALIZADA (o que seria salvo) com o que está salvo.
  const dirty =
    listaParaLinhas(valores.nao_eliminar) !== listaParaLinhas(gerais.nao_eliminar) ||
    valores.distancia_max !== gerais.distancia_max ||
    listaParaLinhas(valores.unidades) !== listaParaLinhas(gerais.unidades) ||
    valores.contexto !== gerais.contexto;

  async function handleSalvar() {
    setSaving(true);
    try {
      const r = await salvarCriteriosGerais(valores);
      if (!r.ok) {
        if (r.error === "invalido")
          toast.error("Confira as respostas — algum campo passou do tamanho máximo.");
        else if (r.error === "forbidden")
          toast.error("Você não tem permissão para alterar as configurações de IA.");
        else toast.error("Erro ao salvar. Tente novamente.");
        return;
      }
      // Normaliza o estado local (trim/linhas vazias) — sem isso o dirty-state
      // continuaria acusando "não salvas" após o refresh.
      setNaoEliminar(listaParaLinhas(valores.nao_eliminar));
      setDistancia(valores.distancia_max);
      setUnidades(listaParaLinhas(valores.unidades));
      setContexto(valores.contexto);
      toast.success("Critérios salvos. As próximas análises já usam as novas respostas.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutro-200 bg-white p-6 space-y-6">
      <div>
        <h2 className="font-semibold text-neutro-900">
          Como a sua empresa contrata? <span className="font-normal text-neutro-500">(vale para todas as vagas)</span>
        </h2>
        <p className="text-sm text-neutro-600 mt-0.5">
          Estas respostas viram as instruções da IA — é praticamente o &quot;prompt&quot; dela.
          Quanto mais específicas, mais o parecer reflete o jeito da empresa de contratar. Você
          pode ajustar quando quiser: as mudanças valem para as próximas análises.
        </p>
      </div>

      <Pergunta
        numero={1}
        label='Quais "defeitos" comuns a IA deve relevar?'
        recomendado
        explicativo='Sem esta lista, a IA tende a penalizar padrões que talvez não importem para a sua operação — por exemplo, pouco tempo em cada emprego, que é normal no varejo. Tudo o que estiver aqui é tratado como neutro: não elimina nem derruba a nota. É a sua chance de corrigir os "preconceitos" automáticos da IA.'
      >
        <CampoLista
          ariaLabel="Fatores que a IA deve relevar"
          value={naoEliminar}
          onChange={setNaoEliminar}
          placeholder={"Pouco tempo de permanência nos empregos anteriores\nPeríodos sem trabalhar (desemprego)\nCurrículo mal formatado ou incompleto"}
        />
      </Pergunta>

      <Pergunta
        numero={2}
        label="A que distância da unidade o candidato pode morar?"
        recomendado
        explicativo="Frentista e caixa trabalham em turnos, inclusive madrugada — morar longe é a principal causa de falta e desistência. A IA compara o endereço ou bairro do candidato com as unidades listadas e sinaliza quando o limite é ultrapassado. Se ficar vazio, a distância é ignorada na análise."
      >
        <div className="space-y-2">
          <input
            value={distancia}
            onChange={(e) => setDistancia(e.target.value)}
            aria-label="Distância máxima aceita"
            placeholder="Até 17 minutos (ou ~8 km) da unidade"
            className="w-full rounded-md border border-neutro-200 px-3 py-2 text-sm"
          />
          <CampoLista
            ariaLabel="Unidades da empresa (nome e endereço)"
            value={unidades}
            onChange={setUnidades}
            placeholder={"Unidade Roselândia — Av. Brasil, 1234, Roselândia\nUnidade Centro — Rua XV de Novembro, 500, Centro"}
          />
        </div>
      </Pergunta>

      <Pergunta
        numero={3}
        label="O que mais a IA precisa saber sobre a empresa?"
        explicativo="Texto livre que entra nas instruções junto com tudo acima: cultura, benefícios, avisos, particularidades. É o lugar das regras que não couberam nas outras perguntas."
      >
        <textarea
          value={contexto}
          onChange={(e) => setContexto(e.target.value)}
          aria-label="Contexto extra da empresa"
          placeholder="Somos uma rede de 3 postos com conveniência 24h. Valorizamos simpatia no atendimento e proatividade. Oferecemos vale-transporte e cesta básica."
          rows={4}
          className="w-full resize-y rounded-md border border-neutro-200 px-3 py-2 text-sm"
        />
      </Pergunta>

      <PromptPreview gerais={valores} cargos={cargosAtivos} />

      <div className="flex items-center gap-3">
        <Button onClick={handleSalvar} disabled={saving || !dirty}>
          {saving ? "Salvando..." : "Salvar critérios gerais"}
        </Button>
        {dirty && <span className="text-xs text-amber-600">Alterações não salvas.</span>}
      </div>
    </div>
  );
}
