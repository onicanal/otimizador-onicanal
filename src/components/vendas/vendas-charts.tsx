"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { formatBRL, formatNumber } from "@/lib/utils";
import { rotuloCanal } from "@/lib/periodo";

const PALETA_CANAIS: Record<string, string> = {
  mercadolivre: "#FFE600",
  shopee: "#EE4D2D",
  amazon: "#FF9900",
  magalu: "#0086FF",
  americanas: "#E60014",
  nuvemshop: "#1F7AE0",
  shopify: "#7AB55C",
  outro: "#A0A0A0",
};

function corCanal(c: string): string {
  return PALETA_CANAIS[c] ?? "#888888";
}

// =====================================================================
// Linha de faturamento por dia (multi-empresa opcional)
// =====================================================================

export interface LinhaTemporalSerie {
  empresaId: string;
  empresaNome: string;
  cor: string;
  pontos: { data: string; valor: number }[];
}

export function LinhaTemporal({ series, datas }: { series: LinhaTemporalSerie[]; datas: string[] }) {
  // Pivota: cada linha é um dia, com colunas para cada empresa.
  const data = datas.map((d) => {
    const linha: Record<string, string | number> = { data: d };
    for (const s of series) {
      const ponto = s.pontos.find((p) => p.data === d);
      linha[s.empresaId] = ponto ? ponto.valor : 0;
    }
    return linha;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="data"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => {
            const d = new Date(`${v}T00:00:00`);
            return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
          }}
        />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatBRL(Number(v))} width={90} />
        <Tooltip
          formatter={(v: number) => formatBRL(v)}
          labelFormatter={(v: string) => {
            const d = new Date(`${v}T00:00:00`);
            return d.toLocaleDateString("pt-BR");
          }}
        />
        <Legend />
        {series.map((s) => (
          <Line
            key={s.empresaId}
            type="monotone"
            dataKey={s.empresaId}
            name={s.empresaNome}
            stroke={s.cor}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// =====================================================================
// Donut por canal
// =====================================================================

export function PorCanal({ data }: { data: { canal: string; valor: number; pedidos: number }[] }) {
  if (data.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">Sem dados.</div>;
  }
  const total = data.reduce((sum, d) => sum + d.valor, 0);
  const sorted = [...data].sort((a, b) => b.valor - a.valor);
  return (
    <div className="grid grid-cols-2 gap-2">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={sorted}
            dataKey="valor"
            nameKey="canal"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
          >
            {sorted.map((entry) => (
              <Cell key={entry.canal} fill={corCanal(entry.canal)} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatBRL(v)} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex flex-col justify-center gap-1.5 text-sm">
        {sorted.map((d) => {
          const pct = total > 0 ? (d.valor / total) * 100 : 0;
          return (
            <li key={d.canal} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: corCanal(d.canal) }} />
                <span className="truncate">{rotuloCanal(d.canal)}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                {formatBRL(d.valor)} <span className="text-xs">({pct.toFixed(0)}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// =====================================================================
// Barras por empresa
// =====================================================================

export function PorEmpresa({
  data,
}: {
  data: { empresaId: string; nome: string; cor: string; valor: number; pedidos: number }[];
}) {
  if (data.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">Sem dados.</div>;
  }
  const sorted = [...data].sort((a, b) => b.valor - a.valor);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatBRL(Number(v))} />
        <YAxis type="category" dataKey="nome" tick={{ fontSize: 12 }} width={90} />
        <Tooltip
          formatter={(v: number, _name: string, p: { payload?: { pedidos?: number } }) => [
            `${formatBRL(v)} • ${formatNumber(p.payload?.pedidos ?? 0)} pedidos`,
            "Faturamento",
          ]}
        />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
          {sorted.map((d) => (
            <Cell key={d.empresaId} fill={d.cor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
