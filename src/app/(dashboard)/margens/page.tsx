import { Prisma } from "@prisma/client";
import { AlertTriangle, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatNumber, formatPercent } from "@/lib/utils";
import { calcularIntervalo, type PeriodoPreset } from "@/lib/periodo";
import { AnaliseFilters } from "@/components/analise/analise-filters";
import { ProgressoDetalheBanner } from "@/components/analise/progresso-detalhe-banner";
import { buscarProgressoDetalhe } from "@/server/sync-progress";

export const dynamic = "force-dynamic";

interface SearchParams {
  periodo?: string;
  empresa?: string;
  categoria?: string;
  ini?: string;
  fim?: string;
}

interface Filtros {
  inicio: Date;
  fim: Date;
  empresaId?: string;
  categoria?: string;
}

interface ProdutoMargem {
  produtoId: string;
  sku: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  empresaCor: string;
  categoria: string | null;
  faturamento: number;
  custo: number;
  unidades: number;
  margemAbs: number;
  margemPct: number;
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

async function buscarProdutosComMargem(f: Filtros) {
  const where = montarWhere(f);
  return prisma.$queryRaw<
    {
      produtoId: string;
      sku: string;
      nome: string;
      empresaId: string;
      categoria: string | null;
      faturamento: number;
      custo: number;
      unidades: number;
    }[]
  >`
    SELECT
      p."id" as "produtoId",
      p."sku" as "sku",
      p."nome" as "nome",
      p."empresaId" as "empresaId",
      p."categoria" as "categoria",
      COALESCE(SUM(ip."valorTotal"), 0)::float as "faturamento",
      COALESCE(SUM(COALESCE(ip."custoTotal", ip."quantidade" * p."precoCusto", 0)), 0)::float as "custo",
      COALESCE(SUM(ip."quantidade"), 0)::float as "unidades"
    FROM "ItemPedido" ip
    JOIN "Pedido" pe ON pe."id" = ip."pedidoId"
    JOIN "Produto" p ON p."id" = ip."produtoId"
    WHERE ${where}
    GROUP BY p."id", p."sku", p."nome", p."empresaId", p."categoria"
    HAVING COALESCE(SUM(ip."valorTotal"), 0) > 0
  `;
}

async function buscarMargemPorCategoria(f: Filtros) {
  const where = montarWhere(f);
  return prisma.$queryRaw<
    {
      categoria: string | null;
      faturamento: number;
      custo: number;
      produtos: number;
    }[]
  >`
    SELECT
      p."categoria" as "categoria",
      COALESCE(SUM(ip."valorTotal"), 0)::float as "faturamento",
      COALESCE(SUM(COALESCE(ip."custoTotal", ip."quantidade" * p."precoCusto", 0)), 0)::float as "custo",
      COUNT(DISTINCT p."id")::int as "produtos"
    FROM "ItemPedido" ip
    JOIN "Pedido" pe ON pe."id" = ip."pedidoId"
    JOIN "Produto" p ON p."id" = ip."produtoId"
    WHERE ${where}
    GROUP BY p."categoria"
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

function bucketsMargem(produtos: ProdutoMargem[]) {
  // Distribuição: <0%, 0-10%, 10-20%, 20-30%, 30-50%, >50%
  const faixas = [
    { min: -Infinity, max: 0, label: "Prejuízo (<0%)", cor: "#ef4444" },
    { min: 0, max: 10, label: "0–10%", cor: "#f59e0b" },
    { min: 10, max: 20, label: "10–20%", cor: "#fbbf24" },
    { min: 20, max: 30, label: "20–30%", cor: "#84cc16" },
    { min: 30, max: 50, label: "30–50%", cor: "#10b981" },
    { min: 50, max: Infinity, label: ">50%", cor: "#059669" },
  ];
  return faixas.map((faixa) => {
    const itens = produtos.filter((p) => p.margemPct >= faixa.min && p.margemPct < faixa.max);
    const fat = itens.reduce((s, p) => s + p.faturamento, 0);
    return {
      label: faixa.label,
      cor: faixa.cor,
      produtos: itens.length,
      faturamento: fat,
    };
  });
}

export default async function MargensPage({ searchParams }: { searchParams: SearchParams }) {
  const presetParam = (searchParams.periodo as PeriodoPreset) ?? "30d";
  const intervalo = calcularIntervalo(presetParam, searchParams.ini, searchParams.fim);

  const empresaId = searchParams.empresa && searchParams.empresa !== "all" ? searchParams.empresa : undefined;
  const categoriaSel = searchParams.categoria && searchParams.categoria !== "all" ? searchParams.categoria : undefined;

  const filtros: Filtros = { inicio: intervalo.inicio, fim: intervalo.fim, empresaId, categoria: categoriaSel };

  const [empresas, categorias, produtosRaw, porCategoria, progresso] = await Promise.all([
    prisma.empresa.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, apelido: true, cor: true } }),
    buscarCategorias(),
    buscarProdutosComMargem(filtros),
    buscarMargemPorCategoria(filtros),
    buscarProgressoDetalhe(intervalo.inicio, intervalo.fim, empresaId),
  ]);

  const empresaMap = new Map(empresas.map((e) => [e.id, e]));

  const produtos: ProdutoMargem[] = produtosRaw.map((p) => {
    const e = empresaMap.get(p.empresaId);
    const margemAbs = Number(p.faturamento) - Number(p.custo);
    const margemPct = p.faturamento > 0 ? (margemAbs / p.faturamento) * 100 : 0;
    return {
      ...p,
      empresaNome: e?.apelido || e?.nome || "—",
      empresaCor: e?.cor || "#888",
      margemAbs,
      margemPct,
    };
  });

  const totalFat = produtos.reduce((s, p) => s + p.faturamento, 0);
  const totalCusto = produtos.reduce((s, p) => s + p.custo, 0);
  const margemTotalAbs = totalFat - totalCusto;
  const margemTotalPct = totalFat > 0 ? (margemTotalAbs / totalFat) * 100 : 0;

  const comCusto = produtos.filter((p) => p.custo > 0);
  const semCusto = produtos.filter((p) => p.custo === 0);
  const noPrejuizo = comCusto.filter((p) => p.margemAbs < 0);
  const positivos = comCusto.filter((p) => p.margemAbs >= 0);

  const buckets = bucketsMargem(comCusto);

  // Top 20 por margem absoluta (R$)
  const topAbsoluta = [...comCusto]
    .filter((p) => p.margemAbs > 0)
    .sort((a, b) => b.margemAbs - a.margemAbs)
    .slice(0, 20);

  // Top 20 por margem % (com pelo menos 5 unidades vendidas pra evitar ruído)
  const topPercentual = [...comCusto]
    .filter((p) => p.margemAbs > 0 && p.unidades >= 5)
    .sort((a, b) => b.margemPct - a.margemPct)
    .slice(0, 20);

  // Piores: maior prejuízo absoluto
  const piores = [...noPrejuizo].sort((a, b) => a.margemAbs - b.margemAbs).slice(0, 20);

  // Por categoria
  const linhasCategoria = porCategoria.map((c) => {
    const margemAbs = Number(c.faturamento) - Number(c.custo);
    const margemPct = c.faturamento > 0 ? (margemAbs / c.faturamento) * 100 : 0;
    return {
      categoria: c.categoria || "(sem categoria)",
      faturamento: Number(c.faturamento),
      custo: Number(c.custo),
      produtos: c.produtos,
      margemAbs,
      margemPct,
    };
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Margens</h1>
        <p className="text-muted-foreground">
          {intervalo.rotulo} · {intervalo.inicio.toLocaleDateString("pt-BR")} → {intervalo.fim.toLocaleDateString("pt-BR")}
        </p>
      </div>

      <AnaliseFilters empresas={empresas} categorias={categorias} basePath="/margens" />

      <ProgressoDetalheBanner {...progresso} />

      {produtos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Wallet className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Sem dados de itens nesse período</p>
              <p className="text-sm text-muted-foreground">
                A análise de margens depende dos itens dentro de cada pedido, que ainda estão
                sendo detalhados em background. Volte aqui em algumas horas.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Margem bruta total</CardDescription>
                <CardTitle className="text-2xl">{formatBRL(margemTotalAbs)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {formatPercent(margemTotalPct)} sobre {formatBRL(totalFat)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Produtos rentáveis</CardDescription>
                <CardTitle className="text-2xl text-emerald-600">{formatNumber(positivos.length)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {comCusto.length > 0 ? formatPercent((positivos.length / comCusto.length) * 100) : "0%"} dos com custo
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Produtos no prejuízo</CardDescription>
                <CardTitle className="text-2xl text-destructive">{formatNumber(noPrejuizo.length)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Perda: {formatBRL(noPrejuizo.reduce((s, p) => s + p.margemAbs, 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Sem custo cadastrado</CardDescription>
                <CardTitle className="text-2xl">{formatNumber(semCusto.length)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {formatBRL(semCusto.reduce((s, p) => s + p.faturamento, 0))} não analisáveis
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição por faixa de margem</CardTitle>
              <CardDescription>Quantidade de SKUs e faturamento por faixa de margem percentual.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {buckets.map((b) => {
                  const maxFat = Math.max(...buckets.map((x) => x.faturamento), 1);
                  const pctBar = (b.faturamento / maxFat) * 100;
                  return (
                    <div key={b.label} className="grid grid-cols-[140px_1fr_140px] items-center gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: b.cor }} />
                        <span>{b.label}</span>
                      </div>
                      <div className="relative h-6 overflow-hidden rounded-md bg-muted">
                        <div className="h-full rounded-md" style={{ width: `${pctBar}%`, backgroundColor: b.cor, opacity: 0.7 }} />
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                          {formatBRL(b.faturamento)}
                        </span>
                      </div>
                      <div className="text-right text-muted-foreground">
                        {formatNumber(b.produtos)} {b.produtos === 1 ? "SKU" : "SKUs"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Top margem absoluta (R$)
                </CardTitle>
                <CardDescription>Produtos que mais geram lucro em valor.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2 text-right">Margem</th>
                        <th className="px-3 py-2 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topAbsoluta.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Sem dados.</td>
                        </tr>
                      ) : (
                        topAbsoluta.map((p, i) => (
                          <tr key={p.produtoId} className="border-b hover:bg-muted/30">
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2">
                              <div className="max-w-[280px] truncate font-medium">{p.nome}</div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.empresaCor }} />
                                <span>{p.empresaNome}</span>
                                <span>·</span>
                                <span className="font-mono">{p.sku}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-emerald-600">{formatBRL(p.margemAbs)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{formatPercent(p.margemPct)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Top margem percentual (%)
                </CardTitle>
                <CardDescription>Maior margem relativa, com no mínimo 5 unidades vendidas.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2 text-right">%</th>
                        <th className="px-3 py-2 text-right">Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPercentual.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Sem dados.</td>
                        </tr>
                      ) : (
                        topPercentual.map((p, i) => (
                          <tr key={p.produtoId} className="border-b hover:bg-muted/30">
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2">
                              <div className="max-w-[280px] truncate font-medium">{p.nome}</div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.empresaCor }} />
                                <span>{p.empresaNome}</span>
                                <span>·</span>
                                <span className="font-mono">{p.sku}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-emerald-600">{formatPercent(p.margemPct)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{formatBRL(p.margemAbs)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {piores.length > 0 && (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Produtos no prejuízo
                </CardTitle>
                <CardDescription>
                  Vendendo abaixo do custo cadastrado. Revise preço de venda, custo do produto ou descontos aplicados.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Empresa</th>
                        <th className="px-3 py-2 text-right">Unidades</th>
                        <th className="px-3 py-2 text-right">Faturamento</th>
                        <th className="px-3 py-2 text-right">Custo</th>
                        <th className="px-3 py-2 text-right">Prejuízo</th>
                        <th className="px-3 py-2 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {piores.map((p) => (
                        <tr key={p.produtoId} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <div className="max-w-[280px] truncate font-medium">{p.nome}</div>
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
                          <td className="px-3 py-2 text-right">{formatBRL(p.faturamento)}</td>
                          <td className="px-3 py-2 text-right">{formatBRL(p.custo)}</td>
                          <td className="px-3 py-2 text-right font-medium text-destructive">{formatBRL(p.margemAbs)}</td>
                          <td className="px-3 py-2 text-right text-destructive">{formatPercent(p.margemPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {noPrejuizo.length > 20 && (
                  <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Mostrando os 20 maiores. Total no prejuízo: {formatNumber(noPrejuizo.length)} produtos.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                Margem por categoria
              </CardTitle>
              <CardDescription>Comparativo de rentabilidade entre categorias.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Categoria</th>
                      <th className="px-3 py-2 text-right">SKUs</th>
                      <th className="px-3 py-2 text-right">Faturamento</th>
                      <th className="px-3 py-2 text-right">Custo</th>
                      <th className="px-3 py-2 text-right">Margem</th>
                      <th className="px-3 py-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasCategoria.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Sem dados.</td>
                      </tr>
                    ) : (
                      linhasCategoria.map((c) => (
                        <tr key={c.categoria} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium">{c.categoria}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{formatNumber(c.produtos)}</td>
                          <td className="px-3 py-2 text-right">{formatBRL(c.faturamento)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{formatBRL(c.custo)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${c.margemAbs >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                            {formatBRL(c.margemAbs)}
                          </td>
                          <td className={`px-3 py-2 text-right ${c.margemPct >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                            {formatPercent(c.margemPct)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Badge variant="outline" className="text-xs">
            Importante: a margem é calculada como faturamento − custo (do item no pedido, ou do produto cadastrado quando o item não tem custo). Não desconta taxas de marketplace, frete ou impostos.
          </Badge>
        </>
      )}
    </div>
  );
}
