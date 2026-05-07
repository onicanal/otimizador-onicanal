import { Prisma } from "@prisma/client";
import { Package } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatNumber, formatPercent } from "@/lib/utils";
import { calcularIntervalo, type PeriodoPreset } from "@/lib/periodo";
import { AnaliseFilters } from "@/components/analise/analise-filters";
import { ParetoChart } from "@/components/analise/pareto-chart";
import { ProgressoDetalheBanner } from "@/components/analise/progresso-detalhe-banner";
import { buscarProgressoDetalhe } from "@/server/sync-progress";

export const dynamic = "force-dynamic";

interface SearchParams {
  periodo?: string;
  empresa?: string;
  categoria?: string;
  metrica?: "faturamento" | "unidades" | "margem";
  ini?: string;
  fim?: string;
}

interface Filtros {
  inicio: Date;
  fim: Date;
  empresaId?: string;
  categoria?: string;
  metrica: "faturamento" | "unidades" | "margem";
}

interface ProdutoAgg {
  produtoId: string;
  sku: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  empresaCor: string;
  categoria: string | null;
  faturamento: number;
  unidades: number;
  custo: number;
  margem: number;
  cumulativo: number;
  cumulativoPct: number;
  classe: "A" | "B" | "C";
}

function montarWhere(f: Filtros) {
  const conds = [
    Prisma.sql`pe."dataPedido" >= ${f.inicio}`,
    Prisma.sql`pe."dataPedido" <= ${f.fim}`,
    Prisma.sql`(pe."situacao" IS NULL OR LOWER(pe."situacao") NOT LIKE '%cancel%')`,
    Prisma.sql`ip."produtoId" IS NOT NULL`,
  ];
  if (f.empresaId) conds.push(Prisma.sql`pe."empresaId" = ${f.empresaId}`);
  if (f.categoria) conds.push(Prisma.sql`p."categoria" = ${f.categoria}`);
  return Prisma.join(conds, " AND ");
}

async function buscarAggProdutos(f: Filtros) {
  const where = montarWhere(f);
  return prisma.$queryRaw<
    {
      produtoId: string;
      sku: string;
      nome: string;
      empresaId: string;
      categoria: string | null;
      faturamento: number;
      unidades: number;
      custo: number;
    }[]
  >`
    SELECT
      p."id" as "produtoId",
      p."sku" as "sku",
      p."nome" as "nome",
      p."empresaId" as "empresaId",
      p."categoria" as "categoria",
      COALESCE(SUM(ip."valorTotal"), 0)::float as "faturamento",
      COALESCE(SUM(ip."quantidade"), 0)::float as "unidades",
      COALESCE(SUM(ip."custoTotal"), 0)::float as "custo"
    FROM "ItemPedido" ip
    JOIN "Pedido" pe ON pe."id" = ip."pedidoId"
    JOIN "Produto" p ON p."id" = ip."produtoId"
    WHERE ${where}
    GROUP BY p."id", p."sku", p."nome", p."empresaId", p."categoria"
    ORDER BY "faturamento" DESC
  `;
}

async function buscarCategorias() {
  const rows = await prisma.$queryRaw<{ categoria: string }[]>`
    SELECT DISTINCT "categoria" as categoria
    FROM "Produto"
    WHERE "categoria" IS NOT NULL
    ORDER BY categoria ASC
  `;
  return rows.map((r) => r.categoria);
}

function classificar(produtos: { faturamento: number; unidades: number; custo: number; margem: number }[], chave: "faturamento" | "unidades" | "margem") {
  const ordenados = [...produtos].sort((a, b) => b[chave] - a[chave]);
  const total = ordenados.reduce((s, p) => s + p[chave], 0);
  let acumulado = 0;
  return ordenados.map((p) => {
    acumulado += p[chave];
    const pct = total > 0 ? (acumulado / total) * 100 : 0;
    const classe: "A" | "B" | "C" = pct <= 80 ? "A" : pct <= 95 ? "B" : "C";
    return { ...p, cumulativo: acumulado, cumulativoPct: pct, classe };
  });
}

function ClassBadge({ classe }: { classe: "A" | "B" | "C" }) {
  const map = {
    A: { label: "A", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    B: { label: "B", className: "bg-amber-100 text-amber-700 border-amber-200" },
    C: { label: "C", className: "bg-red-100 text-red-700 border-red-200" },
  };
  const { label, className } = map[classe];
  return <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border px-1.5 text-xs font-semibold ${className}`}>{label}</span>;
}

export default async function ABCPage({ searchParams }: { searchParams: SearchParams }) {
  const presetParam = (searchParams.periodo as PeriodoPreset) ?? "30d";
  const intervalo = calcularIntervalo(presetParam, searchParams.ini, searchParams.fim);

  const empresaId = searchParams.empresa && searchParams.empresa !== "all" ? searchParams.empresa : undefined;
  const categoriaSel = searchParams.categoria && searchParams.categoria !== "all" ? searchParams.categoria : undefined;
  const metrica = (searchParams.metrica ?? "faturamento") as "faturamento" | "unidades" | "margem";

  const filtros: Filtros = { inicio: intervalo.inicio, fim: intervalo.fim, empresaId, categoria: categoriaSel, metrica };

  const [empresas, categorias, agg, progresso] = await Promise.all([
    prisma.empresa.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, apelido: true, cor: true } }),
    buscarCategorias(),
    buscarAggProdutos(filtros),
    buscarProgressoDetalhe(intervalo.inicio, intervalo.fim, empresaId),
  ]);

  const empresaMap = new Map(empresas.map((e) => [e.id, e]));

  const enriched = agg.map((p) => ({
    ...p,
    margem: Number(p.faturamento) - Number(p.custo),
  }));

  const classificados = classificar(enriched, metrica) as ProdutoAgg[];
  // Adiciona empresa info
  const linhas: ProdutoAgg[] = classificados.map((p) => {
    const e = empresaMap.get(p.empresaId);
    return {
      ...p,
      empresaNome: e?.apelido || e?.nome || "—",
      empresaCor: e?.cor || "#888",
    };
  });

  const totalA = linhas.filter((p) => p.classe === "A").length;
  const totalB = linhas.filter((p) => p.classe === "B").length;
  const totalC = linhas.filter((p) => p.classe === "C").length;
  const sumA = linhas.filter((p) => p.classe === "A").reduce((s, p) => s + p[metrica], 0);
  const sumB = linhas.filter((p) => p.classe === "B").reduce((s, p) => s + p[metrica], 0);
  const sumC = linhas.filter((p) => p.classe === "C").reduce((s, p) => s + p[metrica], 0);
  const totalGeral = sumA + sumB + sumC;

  const pontosPareto = linhas.slice(0, 100).map((p, i) => ({
    index: i + 1,
    faturamento: p[metrica],
    cumulativoPct: p.cumulativoPct,
    classe: p.classe,
  }));

  const linhasParaTabela = linhas.slice(0, 200);

  function nomeMetrica() {
    return metrica === "faturamento" ? "Faturamento" : metrica === "unidades" ? "Unidades" : "Margem";
  }

  function fmtMetrica(v: number) {
    return metrica === "unidades" ? formatNumber(v) : formatBRL(v);
  }

  function metricaTab(value: "faturamento" | "unidades" | "margem", label: string) {
    const isActive = metrica === value;
    const params = new URLSearchParams();
    if (presetParam !== "30d") params.set("periodo", presetParam);
    if (empresaId) params.set("empresa", empresaId);
    if (categoriaSel) params.set("categoria", categoriaSel);
    if (value !== "faturamento") params.set("metrica", value);
    if (presetParam === "custom") {
      if (searchParams.ini) params.set("ini", searchParams.ini);
      if (searchParams.fim) params.set("fim", searchParams.fim);
    }
    const qs = params.toString();
    const href = `/abc${qs ? `?${qs}` : ""}`;
    return (
      <a
        href={href}
        className={`rounded-md border px-3 py-1.5 text-sm transition ${isActive ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
      >
        {label}
      </a>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Curva ABC</h1>
        <p className="text-muted-foreground">
          {intervalo.rotulo} · {intervalo.inicio.toLocaleDateString("pt-BR")} → {intervalo.fim.toLocaleDateString("pt-BR")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AnaliseFilters empresas={empresas} categorias={categorias} basePath="/abc" />
        <div className="flex items-center gap-2 ml-auto">
          {metricaTab("faturamento", "Por faturamento")}
          {metricaTab("unidades", "Por unidades")}
          {metricaTab("margem", "Por margem")}
        </div>
      </div>

      <ProgressoDetalheBanner {...progresso} />

      {linhas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Sem dados de itens nesse período</p>
              <p className="text-sm text-muted-foreground">
                A Curva ABC depende dos itens dentro de cada pedido, que ainda estão sendo
                detalhados em background. Volte aqui em algumas horas — os dados aparecem
                conforme o sync avança.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Classe A — top performers</CardDescription>
                <CardTitle className="text-3xl">
                  {formatNumber(totalA)}
                  <span className="text-base font-normal text-muted-foreground"> SKUs</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  {fmtMetrica(sumA)} ·{" "}
                  <span className="text-muted-foreground">{formatPercent(totalGeral > 0 ? (sumA / totalGeral) * 100 : 0)} do total</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Classe B — média</CardDescription>
                <CardTitle className="text-3xl">
                  {formatNumber(totalB)}
                  <span className="text-base font-normal text-muted-foreground"> SKUs</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  {fmtMetrica(sumB)} ·{" "}
                  <span className="text-muted-foreground">{formatPercent(totalGeral > 0 ? (sumB / totalGeral) * 100 : 0)} do total</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Classe C — cauda longa</CardDescription>
                <CardTitle className="text-3xl">
                  {formatNumber(totalC)}
                  <span className="text-base font-normal text-muted-foreground"> SKUs</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  {fmtMetrica(sumC)} ·{" "}
                  <span className="text-muted-foreground">{formatPercent(totalGeral > 0 ? (sumC / totalGeral) * 100 : 0)} do total</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Curva de Pareto — top 100 produtos</CardTitle>
              <CardDescription>
                Barras = {nomeMetrica().toLowerCase()} do produto · linha preta = % acumulado · cores indicam a classe (A=verde, B=âmbar, C=vermelho)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ParetoChart pontos={pontosPareto} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 200 produtos</CardTitle>
              <CardDescription>Ordenado por {nomeMetrica().toLowerCase()}.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Classe</th>
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Empresa</th>
                      <th className="px-3 py-2 text-right">Unidades</th>
                      <th className="px-3 py-2 text-right">Faturamento</th>
                      <th className="px-3 py-2 text-right">Margem</th>
                      <th className="px-3 py-2 text-right">Acum.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasParaTabela.map((p, i) => (
                      <tr key={p.produtoId} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2"><ClassBadge classe={p.classe} /></td>
                        <td className="px-3 py-2">
                          <div className="max-w-[320px] truncate font-medium">{p.nome}</div>
                          {p.categoria && <div className="text-xs text-muted-foreground">{p.categoria}</div>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.empresaCor }} />
                            <span className="text-xs text-muted-foreground">{p.empresaNome}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{formatNumber(p.unidades)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatBRL(p.faturamento)}</td>
                        <td className={`px-3 py-2 text-right ${p.margem >= 0 ? "" : "text-destructive"}`}>{formatBRL(p.margem)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{p.cumulativoPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {linhas.length > 200 && (
                <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Mostrando os 200 primeiros. Total: {formatNumber(linhas.length)} produtos com vendas no período.
                </div>
              )}
            </CardContent>
          </Card>

          <Badge variant="outline" className="text-xs">
            Importante: a Curva ABC usa o detalhamento dos pedidos (itens). Se os números parecerem baixos, é porque parte dos pedidos ainda está sendo detalhada em background.
          </Badge>
        </>
      )}
    </div>
  );
}
