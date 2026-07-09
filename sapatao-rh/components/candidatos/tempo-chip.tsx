"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { tempoNaEtapa } from "@/lib/funil/tempo";

/** "há 3d" chip for time-in-stage; client-side so the server page stays pure. */
export function TempoChip({ desde }: { desde: string | null }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const tempo = tempoNaEtapa(desde, agora);
  if (!tempo) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-neutro-500">
      <Clock className="size-3" />
      {tempo === "agora" ? "agora" : `há ${tempo}`}
    </span>
  );
}
