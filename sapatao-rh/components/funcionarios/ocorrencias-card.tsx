"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { registrarOcorrencia } from "@/app/(app)/funcionarios/actions";
import { dataBr, hojeIso } from "@/lib/shared/datas";
import type { OcorrenciaComAutor } from "@/lib/funcionarios/queries";
import type { OcorrenciaTipo } from "@/types/database";

const TIPO_LABEL: Record<OcorrenciaTipo, string> = {
  falta: "Falta",
  atestado: "Atestado",
  advertencia: "Advertência",
  elogio: "Elogio",
  desligamento: "Desligamento",
  outro: "Outro",
};

const TIPO_COR: Record<OcorrenciaTipo, string> = {
  falta: "bg-[#fbe6df] text-[#c0492b]",
  atestado: "bg-[#f8ecd9] text-[#a9692a]",
  advertencia: "bg-[#fbe6df] text-[#c0492b]",
  elogio: "bg-brand-50 text-brand-700",
  desligamento: "bg-muted text-muted-foreground",
  outro: "bg-muted text-muted-foreground",
};

const TIPOS_REGISTRAVEIS: OcorrenciaTipo[] = ["falta", "atestado", "advertencia", "elogio", "outro"];

/** Lista + registro de ocorrências do funcionário (alimenta o absenteísmo). */
export function OcorrenciasCard({
  funcionarioId,
  ocorrencias,
  canEdit,
}: {
  funcionarioId: string;
  ocorrencias: OcorrenciaComAutor[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<OcorrenciaTipo>("falta");
  const [data, setData] = useState(hojeIso());
  const [obs, setObs] = useState("");
  const [pending, startTransition] = useTransition();

  const onRegistrar = () => {
    startTransition(async () => {
      const r = await registrarOcorrencia(funcionarioId, { tipo, data, observacao: obs });
      if (r.ok) {
        toast.success("Ocorrência registrada.");
        setObs("");
        router.refresh();
      } else {
        toast.error(r.error === "forbidden" ? "Sem permissão." : r.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={tipo}
            items={Object.fromEntries(TIPOS_REGISTRAVEIS.map((t) => [t, TIPO_LABEL[t]]))}
            onValueChange={(v: string | null) => { if (v) setTipo(v as OcorrenciaTipo); }}
          >
            <SelectTrigger size="sm" aria-label="Tipo de ocorrência">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_REGISTRAVEIS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-36"
            aria-label="Data da ocorrência"
          />
          <Input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observação (opcional)"
            className="min-w-40 flex-1"
            aria-label="Observação"
          />
          <Button size="sm" variant="outline" onClick={onRegistrar} disabled={pending}>
            Registrar
          </Button>
        </div>
      )}

      {ocorrencias.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada.</p>
      ) : (
        <ul className="space-y-2">
          {ocorrencias.map((o) => (
            <li key={o.id} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-micro font-medium ${TIPO_COR[o.tipo]}`}
              >
                {TIPO_LABEL[o.tipo]}
              </span>
              <div className="min-w-0">
                <p className="text-foreground">
                  <span className="tabular-nums">{dataBr(o.data)}</span>
                  {o.observacao && <> — {o.observacao}</>}
                </p>
                {o.registrado_por_nome && (
                  <p className="text-caption text-muted-foreground">por {o.registrado_por_nome}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
