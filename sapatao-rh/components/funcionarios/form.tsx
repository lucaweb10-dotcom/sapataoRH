"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { criarFuncionario, atualizarFuncionario } from "@/app/(app)/funcionarios/actions";
import type { FuncionarioInput } from "@/lib/validations/funcionario";
import type { FormValores } from "@/lib/funcionarios/form-valores";
import type { Unidade } from "@/types/database";

const SEM_UNIDADE = "nenhuma";

function Campo({
  label,
  children,
  obrigatorio,
}: {
  label: string;
  children: React.ReactNode;
  obrigatorio?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-caption font-medium text-muted-foreground">
        {label}
        {obrigatorio && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

/** Formulário de funcionário (criar/editar). `funcionarioId` presente = edição. */
export function FuncionarioForm({
  unidades,
  defaults,
  funcionarioId,
  candidatoOrigemId,
}: {
  unidades: Unidade[];
  defaults: FormValores;
  funcionarioId?: string;
  candidatoOrigemId?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<FormValores>(defaults);
  const [pending, startTransition] = useTransition();

  const set = (campo: keyof FormValores) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [campo]: e.target.value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: FuncionarioInput = {
      ...v,
      unidade_id: v.unidade_id === "" ? "" : v.unidade_id,
      candidato_origem_id: candidatoOrigemId ?? null,
    };
    startTransition(async () => {
      const r = funcionarioId
        ? await atualizarFuncionario(funcionarioId, input)
        : await criarFuncionario(input);
      if (r.ok) {
        toast.success(funcionarioId ? "Funcionário atualizado." : "Funcionário cadastrado.");
        router.push(`/funcionarios/${r.id ?? funcionarioId}`);
        router.refresh();
      } else {
        toast.error(r.error === "forbidden" ? "Sem permissão." : r.error);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 shadow-warm">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Dados pessoais</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo label="Nome completo" obrigatorio>
              <Input value={v.nome_completo} onChange={set("nome_completo")} required />
            </Campo>
          </div>
          <Campo label="CPF">
            <Input value={v.cpf} onChange={set("cpf")} placeholder="000.000.000-00" />
          </Campo>
          <Campo label="RG">
            <Input value={v.rg} onChange={set("rg")} />
          </Campo>
          <Campo label="Data de nascimento">
            <Input type="date" value={v.data_nascimento} onChange={set("data_nascimento")} />
          </Campo>
          <Campo label="Telefone">
            <Input value={v.telefone} onChange={set("telefone")} placeholder="51 99999-0000" />
          </Campo>
          <Campo label="E-mail">
            <Input type="email" value={v.email} onChange={set("email")} />
          </Campo>
          <Campo label="CEP">
            <Input value={v.cep} onChange={set("cep")} />
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Endereço">
              <Input value={v.endereco} onChange={set("endereco")} />
            </Campo>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-warm">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Dados profissionais</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Cargo" obrigatorio>
            <Input
              value={v.cargo}
              onChange={set("cargo")}
              placeholder="Frentista, Caixa, Atendente…"
              required
            />
          </Campo>
          <Campo label="Unidade">
            <Select
              value={v.unidade_id === "" ? SEM_UNIDADE : v.unidade_id}
              items={{
                [SEM_UNIDADE]: "Sem unidade",
                ...Object.fromEntries(unidades.map((u) => [u.id, u.nome])),
              }}
              onValueChange={(sel: string | null) =>
                setV((s) => ({ ...s, unidade_id: !sel || sel === SEM_UNIDADE ? "" : sel }))
              }
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
          </Campo>
          <Campo label="Data de admissão" obrigatorio>
            <Input type="date" value={v.data_admissao} onChange={set("data_admissao")} required />
          </Campo>
          <Campo label="Salário (R$)">
            <Input value={v.salario} onChange={set("salario")} placeholder="2.350,50" />
          </Campo>
          <Campo label="Jornada">
            <Input value={v.jornada} onChange={set("jornada")} placeholder="44h semanais" />
          </Campo>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {funcionarioId ? "Salvar alterações" : "Cadastrar funcionário"}
        </Button>
      </div>
    </form>
  );
}
