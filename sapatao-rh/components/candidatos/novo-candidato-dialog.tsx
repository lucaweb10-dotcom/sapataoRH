"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { UserRoundPlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarCandidato } from "@/app/(app)/candidatos/actions";
import { ORIGENS, type Origem } from "@/lib/validations/candidatos";

const ORIGEM_LABEL: Record<Origem, string> = {
  indicacao: "Indicação",
  presencial: "Presencial",
  site: "Site",
  whatsapp: "WhatsApp",
  outro: "Outro",
};

const SEM_UNIDADE = "nenhuma";

/** Dialog de cadastro manual de candidato (lead de indicação/presencial).
 *  Usado no header de /candidatos, no header do /funil e dentro do "Nova conversa". */
export function NovoCandidatoDialog({
  vagas,
  unidades,
  aoCriar = "ficha",
  open: openProp,
  onOpenChange,
  withTrigger = true,
  onCreated,
}: {
  vagas: string[];
  unidades: { id: string; nome: string }[];
  /** Navegação padrão no sucesso (server pages não podem passar callback). */
  aoCriar?: "ficha" | "refresh";
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  withTrigger?: boolean;
  /** Sobrepõe a navegação padrão (uso client→client, ex.: Nova conversa). */
  onCreated?: (candidatoId: string) => void;
}) {
  const router = useRouter();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [vaga, setVaga] = useState("");
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [origem, setOrigem] = useState<Origem>("outro");
  const [tags, setTags] = useState("");
  const [pending, setPending] = useState(false);
  const [duplicado, setDuplicado] = useState<{ id: string | null } | null>(null);

  function reset() {
    setNome("");
    setTelefone("");
    setVaga("");
    setUnidadeId(null);
    setOrigem("outro");
    setTags("");
    setDuplicado(null);
  }

  async function submit() {
    setPending(true);
    setDuplicado(null);
    try {
      const r = await criarCandidato({
        nome,
        telefone,
        vaga_interesse: vaga.trim() || null,
        unidade_id: unidadeId,
        origem,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (r.ok) {
        toast.success("Candidato cadastrado.");
        setOpen(false);
        reset();
        if (onCreated) onCreated(r.candidatoId);
        else if (aoCriar === "ficha") router.push(`/candidatos/${r.candidatoId}`);
        else router.refresh();
        return;
      }
      if (r.error === "telefone_existente") {
        setDuplicado({ id: r.candidatoId ?? null });
        return;
      }
      toast.error(
        r.error === "invalido"
          ? "Confira nome (mín. 2 letras) e telefone (10 a 15 dígitos)."
          : r.error === "forbidden"
            ? "Sem permissão."
            : "Erro ao cadastrar o candidato.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {withTrigger && (
        <Button
          size="sm"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <UserRoundPlus className="size-3.5" />
          Novo candidato
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setDuplicado(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo candidato</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="mb-1">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label className="mb-1">Telefone (com DDD)</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="51 99900-0000"
                inputMode="tel"
              />
            </div>
            <div>
              <Label className="mb-1">Vaga de interesse</Label>
              <Input
                value={vaga}
                onChange={(e) => setVaga(e.target.value)}
                list="sp6-vagas-sugeridas"
                placeholder="ex.: Atendente"
                maxLength={80}
              />
              <datalist id="sp6-vagas-sugeridas">
                {vagas.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="mb-1">Origem</Label>
                <Select
                  value={origem}
                  onValueChange={(v: string | null) => setOrigem((v as Origem) ?? "outro")}
                  items={ORIGEM_LABEL}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGENS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {ORIGEM_LABEL[o]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {unidades.length > 0 && (
                <div className="flex-1">
                  <Label className="mb-1">Unidade</Label>
                  <Select
                    value={unidadeId ?? SEM_UNIDADE}
                    onValueChange={(v: string | null) =>
                      setUnidadeId(v === SEM_UNIDADE ? null : v)
                    }
                    items={{
                      [SEM_UNIDADE]: "Sem unidade",
                      ...Object.fromEntries(unidades.map((u) => [u.id, u.nome])),
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_UNIDADE}>Sem unidade</SelectItem>
                      {unidades.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <Label className="mb-1">Tags (separadas por vírgula)</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="ex.: manhã, cnh-b"
              />
            </div>

            {duplicado && (
              <p className="rounded-lg border border-warning/25 bg-warning-soft p-2.5 text-caption text-warning-foreground">
                Já existe um candidato com este telefone.{" "}
                {duplicado.id ? (
                  <Link
                    href={`/candidatos/${duplicado.id}`}
                    className="font-semibold underline"
                    onClick={() => setOpen(false)}
                  >
                    Abrir ficha existente
                  </Link>
                ) : (
                  "Procure-o na lista de candidatos."
                )}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={submit} disabled={pending || !nome.trim() || !telefone.trim()}>
              {pending ? "Salvando…" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
