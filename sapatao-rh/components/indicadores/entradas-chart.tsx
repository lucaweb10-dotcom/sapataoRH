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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SemanaEntry } from "@/lib/indicadores/queries";

/* Recharts recebe cor por prop, não por classe — os valores abaixo espelham
 * os tokens do tema claro (neutro-200, neutro-500, neutro-100, brand-700). */
const GRID = "#E7E2D6";
const AXIS = "#8A8F82";
const CURSOR = "#F1EDE4";
const BAR = "#1C4A2E";

export function EntradasChart({ dados }: { dados: SemanaEntry[] }) {
  const total = dados.reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entradas por semana</CardTitle>
        <CardDescription>Últimas 8 semanas</CardDescription>
        <CardAction>
          <span className="font-display text-3xl leading-none font-bold tabular">{total}</span>
        </CardAction>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum candidato no período.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dados} margin={{ top: 4, right: 0, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis
                dataKey="rotulo"
                tick={{ fontSize: 11, fill: AXIS }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: AXIS }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: `1px solid ${GRID}`, fontSize: 12 }}
                cursor={{ fill: CURSOR }}
                formatter={(value) => [value, "candidatos"]}
              />
              <Bar dataKey="count" fill={BAR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
