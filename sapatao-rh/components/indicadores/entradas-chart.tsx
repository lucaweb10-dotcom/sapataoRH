"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SemanaEntry } from "@/lib/indicadores/queries";

export function EntradasChart({ dados }: { dados: SemanaEntry[] }) {
  const total = dados.reduce((s, d) => s + d.count, 0);

  return (
    <div className="rounded-xl border border-neutro-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-neutro-900">Entradas por semana</h3>
          <p className="text-xs text-neutro-700">Últimas 8 semanas</p>
        </div>
        <span className="text-2xl font-bold text-neutro-900">{total}</span>
      </div>
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-neutro-700">Nenhum candidato no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dados} margin={{ top: 4, right: 0, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D6" vertical={false} />
            <XAxis
              dataKey="rotulo"
              tick={{ fontSize: 11, fill: "#8A8F82" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#8A8F82" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #E7E2D6", fontSize: 12 }}
              cursor={{ fill: "#F1EDE4" }}
              formatter={(value) => [value, "candidatos"]}
            />
            <Bar dataKey="count" fill="#1C4A2E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
