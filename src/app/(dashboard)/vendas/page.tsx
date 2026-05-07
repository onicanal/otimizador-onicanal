import { Prisma } from "@prisma/client";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatNumber } from "@/lib/utils";
import { calcularIntervalo, intervaloAnterior, isoDate, type PeriodoPreset } from "@/lib/periodo";
import { VendasFilters } from "@/components/vendas/vendas-filters";
import { LinhaTemporal, PorCanal, PorEmpresa, type LinhaTemporalSerie } from "@/components/vendas/vendas-charts";

export const dynamic = "force-dynamic";

interface SearchParams {
  periodo?: string;
  empresa?: string;
  canal?: string;
  ini?: string;
  fim?: string;
}

interface Filtros {
  inicio: Date;
  fim: Date;
  empresaId?: string;
  canal?: string;
}

interface DiaPonto {
  data: string;
  empresaId: string;
  valor: number;
}
interface TopDia {
  data: string;
  valor: number;
  pedidos: number;
}

function montarWhereSQL(f: Filtros) {
  const conds = [
    Prisma.sql`"dataPedido" >= ${f.inicio}`,
    Prisma.sql`"dataPedido" <= ${f.fim}`,
    Prisma.sql`("situacao" IS NULL OR LOWER("situacao") NOT LIKE '%cancel%')`,
  ];
  if (f.empresaId) conds.push(Prisma.sql`"empresaId" = ${f.empresaId}`);
  if (f.canal) conds.push(Prisma.sql`"canal" = ${f.canal}`);
  return Prisma.join(conds, " AND ");
}

async function buscarTotais(f: Filtros) {
  const where = montarWhereSQL(f);
  const rows = await prisma.$queryRaw<{ faturamento: number; pedidos: number; ticket: number }[]>`
    SELECT
      COALESCE(SUM("valorTotal"), 0)::float as faturamento,
      COUNT(*)::int as pedidos,
      COALESCE(AVG("valorTotal"), 0)::float as ticket
    FROM "Pedido"
    WHERE ${where}
  `;
  return rows[0] ?? { faturamento: 0, pedidos: 0, ticket: 0 };
}

async function buscarPorDia(f: Filtros): Promise<DiaPonto[]> {
  const where = montarWhereSQL(f);
  const rows = await prisma.$queryRaw<{ data: string; empresaId: string; valor: number }[]>`
    SELECT
      TO_CHAR(DATE("dataPedido"), 'YYYY-MM-DD') as data,
      "empresaId" as "empresaId",
      SUM("valorTotal")::float as valor
    FROM "Pedido"
    WHERE ${where}
    GROUP BY DATE("dataPedido"), "empresaId"
    ORDER BY data ASC
  `;
  return rows;
}

async function buscarPorCanal(f: Filtros) {
  const where = montarWhereSQL(f);
  return prisma.$queryRaw<{ canal: string | null; valor: number; pedidos: number }[]>`
    SELECT
      COALESCE("canal", 'outro') as canal,
      SUM("valorTotal")::float as valor,
      COUNT(*)::int as pedidos
    FROM "Pedido"
    WHERE ${where}
    GROUP BY COALESCE("canal", 'outro')
    ORDER BY valor DESC
  `;
}

async function buscarPorEmpresa(f: Filtros) {
  const where = montarWhereSQL(f);
  return prisma.$queryRaw<{ empresaId: string; valor: number; pedidos: number }[]>`
    SELECT
      "empresaId" as "empresaId",
      SUM("valorTotal")::float as valor,
      COUNT(*)::int as pedidos
    FROM "Pedido"
    WHERE ${where}
    GROUP BY "empresaId"
  `;
}

async function buscarTopDias(f: Filtros): Promise<TopDia[]> {
  const where = montarWhereSQL(f);
  return prisma.$queryRaw<TopDia[]>`
    SELECT
      TO_CHAR(DATE("dataPedido"), 'YYYY-MM-DD') as data,
      SUM("valorTotal")::float as valor,
      COUNT(*)::int as pedidos
    FROM "Pedido"
    WHERE ${where}
    GROUP BY DATE("dataPedido")
    ORDER BY valor DESC
    LIMIT 10
  `;
}

async function buscarCanaisDistintos() {
  const rows = await prisma.$queryRaw<{ canal: string }[]>`
    SELECT DISTINCT "canal" as canal
    FROM "Pedido"
    WHERE "canal" IS NOT NULL
    ORDER BY canal ASC
  `;
  return rows.map((r) => r.canal);
}

function gerarRangeDatas(inicio: Date, fim: Date): string[] {
  const out: string[] = [];
  const cur = new Date(inicio);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(fim);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    out.push(isoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual > 0 ? null : 0;
  return ((atual - anterior) / anterior) * 100;
}

function VarBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> sem comparativo
      </span>
    );
  }
  const positivo = pct > 0;
  const Icon = pct === 0 ? Minus : positivo ? ArrowUpRight : ArrowDownRight;
  const cls = pct === 0 ? "text-muted-foreground" : positivo ? "text-emerald-600" : "text-red-600";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cls}`}>
      <Icon className="h-3 w-3" />
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1)}% vs período anterior
    </span>
  );
}

export default async function VendasPage({ searchParams }: { searchParams: SearchParams }) {
  const presetParam = (searchParams.periodo as PeriodoPreset) ?? "30d";
  const intervalo = calcularIntervalo(presetParam, searchParams.ini, searchParams.fim);
  const anterior = intervaloAnterior(intervalo);

  const empresaId = searchParams.empresa && searchParams.empresa !== "all" ? searchParams.empresa : undefined;
  const canalSelecionado = searchParams.canal && searchParams.canal !== "all" ? searchParams.canal : undefined;

  const filtros: Filtros = { inicio: intervalo.inicio, fim: intervalo.fim, empresaId, canal: canalSelecionado };
  const filtrosAnterior: Filtros = { inicio: anterior.inicio, fim: anterior.fim, empresaId, canal: canalSelecionado };

  const empresas = await prisma.empresa.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, apelido: true, cor: true },
  });

  const [totalAtual, totalAnterior, porDia, porCanal, porEmpresa, topDias, canaisDistintos] = await Promise.all([
    buscarTotais(filtros),
    buscarTotais(filtrosAnterior),
    buscarPorDia(filtros),
    buscarPorCanal(filtros),
    buscarPorEmpresa(filtros),
    buscarTopDias(filtros),
    buscarCanaisDistintos(),
  ]);

  const empresaMap = new Map(empresas.map((e) => [e.id, e]));
  const datas = gerarRangeDatas(intervalo.inicio, intervalo.fim);
  const empresasNaSerie = empresaId ? empresas.filter((e) => e.id === empresaId) : empresas;

  const series: LinhaTemporalSerie[] = empresasNaSerie.map((e) => ({
    empresaId: e.id,
    empresaNome: e.apelido || e.nome,
    cor: e.cor,
    pontos: porDia
      .filter((p) => p.empresaId === e.id)
      .map((p) => ({ data: p.data, valor: Number(p.valor) })),
  }));

  const porEmpresaUI = porEmpresa
    .map((r) => {
      const e = empresaMap.get(r.empresaId);
      return e
        ? {
            empresaId: r.empresaId,
            nome: e.apelido || e.nome,
            cor: e.cor,
            valor: Number(r.valor),
            pedidos: Number(r.pedidos),
          }
        : null;
    })
    .filter(
      (x): x is { empresaId: string; nome: string; cor: string; valor: number; pedidos: number } => x !== null
    );

  const porCanalUI = porCanal.map((r) => ({
    canal: r.canal ?? "outro",
    valor: Number(r.valor),
    pedidos: Number(r.pedidos),
  }));

  const varFat = variacaoPct(Number(totalAtual.faturamento), Number(totalAnterior.faturamento));
  const varPed = variacaoPct(Number(totalAtual.pedidos), Number(totalAnterior.pedidos));
  const varTic = variacaoPct(Number(totalAtual.ticket), Number(totalAnterior.ticket));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
        <p className="text-muted-foreground">
          {intervalo.rotulo} · {intervalo.inicio.toLocaleDateString("pt-BR")} → {intervalo.fim.toLocaleDateString("pt-BR")}
        </p>
      </div>

      <VendasFilters empresas={empresas} canais={canaisDistintos} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Faturamento</CardDescription>
            <CardTitle className="text-3xl">{formatBRL(Number(totalAtual.faturamento))}</CardTitle>
          </CardHeader>
          <CardContent>
            <VarBadge pct={varFat} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pedidos</CardDescription>
            <CardTitle className="text-3xl">{formatNumber(Number(totalAtual.pedidos))}</CardTitle>
          </CardHeader>
          <CardContent>
            <VarBadge pct={varPed} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ticket médio</CardDescription>
            <CardTitle className="text-3xl">{formatBRL(Number(totalAtual.ticket))}</CardTitle>
          </CardHeader>
          <CardContent>
            <VarBadge pct={varTic} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Período anterior</CardDescription>
            <CardTitle className="text-2xl">{formatBRL(Number(totalAnterior.faturamento))}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {anterior.inicio.toLocaleDateString("pt-BR")} → {anterior.fim.toLocaleDateString("pt-BR")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faturamento por dia</CardTitle>
          <CardDescription>Cada empresa em uma cor — passe o mouse pra ver detalhes.</CardDescription>
        </CardHeader>
        <CardContent>
          {series.every((s) => s.pontos.length === 0) ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              Sem dados nesse período. Sincronize os pedidos em Empresas para ver o gráfico.
            </div>
          ) : (
            <LinhaTemporal series={series} datas={datas} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por canal</CardTitle>
          </CardHeader>
          <CardContent>
            <PorCanal data={porCanalUI} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <PorEmpresa data={porEmpresaUI} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 dias do período</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2 text-right">Pedidos</th>
                <th className="px-4 py-2 text-right">Faturamento</th>
                <th className="px-4 py-2 text-right">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {topDias.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Sem dados nesse período.
                  </td>
                </tr>
              ) : (
                topDias.map((d, i) => {
                  const pedidos = Number(d.pedidos);
                  const valor = Number(d.valor);
                  const ticket = pedidos > 0 ? valor / pedidos : 0;
                  return (
                    <tr key={d.data} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2">
                        {i < 3 ? <Badge variant="success">{i + 1}º</Badge> : <span className="text-muted-foreground">{i + 1}º</span>}
                      </td>
                      <td className="px-4 py-2">
                        {new Date(`${d.data}T00:00:00`).toLocaleDateString("pt-BR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-2 text-right">{formatNumber(pedidos)}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatBRL(valor)}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{formatBRL(ticket)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
