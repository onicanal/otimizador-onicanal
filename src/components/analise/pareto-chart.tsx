"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { formatBRL } from "@/lib/utils";

interface Ponto {
  index: number;
  faturamento: number;
  cumulativoPct: number;
  classe: "A" | "B" | "C";
}

const CLASS_COLOR: Record<"A" | "B" | "C", string> = {
  A: "#10b981", // verde
  B: "#f59e0b", // âmbar
  C: "#ef4444", // vermelho
};

export function ParetoChart({ pontos }: { pontos: Ponto[] }) {
  if (pontos.length === 0) {
    return <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">Sem dados pra montar a curva.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={pontos} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="index" tick={{ fontSize: 11 }} label={{ value: "produtos (ranking)", position: "insideBottom", offset: -2, fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatBRL(Number(v))} width={90} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={50} />
        <Tooltip
          formatter={(v: number, name: string) => {
            if (name === "Faturamento") return formatBRL(v);
            if (name === "Acumulado") return `${v.toFixed(1)}%`;
            return v;
          }}
          labelFormatter={(v) => `Posição ${v}`}
        />
        <Bar yAxisId="left" dataKey="faturamento" name="Faturamento">
          {pontos.map((p) => (
            <Cell key={p.index} fill={CLASS_COLOR[p.classe]} />
          ))}
        </Bar>
        <Line yAxisId="right" type="monotone" dataKey="cumulativoPct" name="Acumulado" stroke="#1f2937" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
