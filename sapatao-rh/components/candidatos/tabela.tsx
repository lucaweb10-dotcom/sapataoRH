"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScoreBadge } from "@/components/shared/score-badge";
import { StatusBadge } from "./status-badge";
import { tempoNaEtapa } from "@/lib/funil/tempo";
import type { CandidatoLista } from "@/lib/candidatos/queries";

export type EtapaInfo = { nome: string; cor: string };

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function CandidatosTabela({
  rows,
  etapasById,
}: {
  rows: CandidatoLista[];
  etapasById: Record<string, EtapaInfo>;
}) {
  const router = useRouter();

  // Same 60s tick as the funil board so "atualizado há X" stays fresh.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-xl border border-neutro-200 bg-card shadow-warm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Candidato</TableHead>
            <TableHead>Vaga</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead>Score IA</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-4">Atualizado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => {
            const etapa = c.etapa_id ? etapasById[c.etapa_id] : undefined;
            const tempo = tempoNaEtapa(c.updated_at, agora);
            return (
              <TableRow
                key={c.id}
                onClick={() => router.push(`/candidatos/${c.id}`)}
                className="cursor-pointer"
              >
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="shrink-0">
                      {c.avatar_url && <AvatarImage src={c.avatar_url} alt={c.nome} />}
                      <AvatarFallback className="bg-brand-700 font-semibold text-neutro-50">
                        {initials(c.nome)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-sm font-semibold text-neutro-900">{c.nome}</p>
                      <p className="truncate text-xs text-neutro-500">{c.telefone}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-neutro-700">
                  {c.vaga_interesse ?? "—"}
                </TableCell>
                <TableCell>
                  {etapa ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-neutro-900">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: etapa.cor }}
                      />
                      {etapa.nome}
                    </span>
                  ) : (
                    <span className="text-sm text-neutro-500">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <ScoreBadge score={c.score_ia} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell className="pr-4 text-xs text-neutro-500">
                  {tempo === "agora" || tempo === "" ? "agora" : `há ${tempo}`}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
