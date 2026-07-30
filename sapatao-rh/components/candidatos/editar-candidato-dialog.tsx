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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { atualizarCandidato, type Responsavel } from "@/app/(app)/candidatos/actions";
import type { Candidato } from "@/types/database";

export type CandidatoEditavel = Pick<
  Candidato,
  | "id"
  | "nome"
  | "idade"
  | "cep"
  | "endereco"
  | "tem_veiculo"
  | "telefone"
  | "vaga_interesse"
  | "tags"
  | "atribuido_a"
>;

const NINGUEM = "ninguem";
type Veiculo = "sim" | "nao" | "nd";

/** Dialog compartilhado (ficha + painel do chat) para editar dados do candidato.
 *  Telefone fica TRAVADO quando já existe conversa (identidade do WhatsApp) —
 *  o server (atualizarCandidato) também bloqueia (telefone_bloqueado). */
export function EditarCandidatoDialog({
  candidato,
  temConversa,
  vagas,
  responsaveis,
}: {
  candidato: CandidatoEditavel;
  temConversa: boolean;
  vagas: string[];
  responsaveis: Responsavel[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [nome, setNome] = useState(candidato.nome);
  const [idade, setIdade] = useState(candidato.idade != null ? String(candidato.idade) : "");
  const [cep, setCep] = useState(candidato.cep ?? "");
  const [endereco, setEndereco] = useState(candidato.endereco ?? "");
  const [temVeiculo, setTemVeiculo] = useState<Veiculo>(
    candidato.tem_veiculo === null ? "nd" : candidato.tem_veiculo ? "sim" : "nao",
  );
  const [telefone, setTelefone] = useState(candidato.telefone);
  const [vaga, setVaga] = useState(candidato.vaga_interesse ?? "");
  const [tags, setTags] = useState(candidato.tags.join(", "));
  const [atribuidoA, setAtribuidoA] = useState<string>(candidato.atribuido_a ?? NINGUEM);

  function reset() {
    setNome(candidato.nome);
    setIdade(candidato.idade != null ? String(candidato.idade) : "");
    setCep(candidato.cep ?? "");
    setEndereco(candidato.endereco ?? "");
    setTemVeiculo(candidato.tem_veiculo === null ? "nd" : candidato.tem_veiculo ? "sim" : "nao");
    setTelefone(candidato.telefone);
    setVaga(candidato.vaga_interesse ?? "");
    setTags(candidato.tags.join(", "));
    setAtribuidoA(candidato.atribuido_a ?? NINGUEM);
  }

  async function submit() {
    setPending(true);
    try {
      const idadeNum = idade.trim() === "" ? null : Number(idade);
      const r = await atualizarCandidato(candidato.id, {
        nome,
        idade: idadeNum !== null && Number.isNaN(idadeNum) ? null : idadeNum,
        cep: cep.trim() || null,
        endereco: endereco.trim() || null,
        tem_veiculo: temVeiculo === "nd" ? null : temVeiculo === "sim",
        vaga_interesse: vaga.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        atribuido_a: atribuidoA === NINGUEM ? null : atribuidoA,
        ...(temConversa ? {} : { telefone }),
      });
      if (r.ok) {
        toast.success("Dados atualizados.");
        setOpen(false);
        router.refresh();
        return;
      }
      toast.error(
        r.error === "telefone_bloqueado"
          ? "O telefone é a identidade do WhatsApp após a 1ª conversa — não pode mudar."
          : r.error === "telefone_existente"
            ? "Já existe outro candidato com este telefone."
            : r.error === "invalido"
              ? "Confira os campos (idade 14–99, telefone 10–15 dígitos)."
              : r.error === "forbidden"
                ? "Sem permissão."
                : "Erro ao salvar.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Editar dados
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar dados do candidato</DialogTitle>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            <div>
              <Label className="mb-1">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label className="mb-1">Telefone</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                disabled={temConversa}
                title={
                  temConversa
                    ? "Telefone é a identidade do WhatsApp após a 1ª conversa."
                    : undefined
                }
                inputMode="tel"
              />
              {temConversa && (
                <p className="mt-1 text-caption text-muted-foreground">
                  Travado: telefone é a identidade do WhatsApp após a 1ª conversa.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <div className="w-24">
                <Label className="mb-1">Idade</Label>
                <Input
                  type="number"
                  min={14}
                  max={99}
                  value={idade}
                  onChange={(e) => setIdade(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label className="mb-1">CEP</Label>
                <Input value={cep} onChange={(e) => setCep(e.target.value)} maxLength={9} />
              </div>
            </div>
            <div>
              <Label className="mb-1">Endereço</Label>
              <Input
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="mb-1">Veículo próprio</Label>
                <Select
                  value={temVeiculo}
                  onValueChange={(v: string | null) => setTemVeiculo((v as Veiculo) ?? "nd")}
                  items={{ nd: "Não informado", sim: "Sim", nao: "Não" }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nd">Não informado</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="mb-1">Responsável</Label>
                <Select
                  value={atribuidoA}
                  onValueChange={(v: string | null) => setAtribuidoA(v ?? NINGUEM)}
                  items={{
                    [NINGUEM]: "Ninguém",
                    ...Object.fromEntries(responsaveis.map((r) => [r.id, r.nome])),
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NINGUEM}>Ninguém</SelectItem>
                    {responsaveis.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1">Vaga de interesse</Label>
              <Input
                value={vaga}
                onChange={(e) => setVaga(e.target.value)}
                list="sp6-vagas-editar"
                maxLength={80}
              />
              <datalist id="sp6-vagas-editar">
                {vagas.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
            <div>
              <Label className="mb-1">Tags (separadas por vírgula)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={submit} disabled={pending || !nome.trim()}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
