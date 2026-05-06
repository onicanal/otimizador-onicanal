import Link from "next/link";
import { ArrowRight, Building2, Loader2, Package, Plug, ShoppingCart, Sparkles, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { formatBRL, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [
    empresas,
    empresasConectadas,
    totalProdutos,
    pedidosDoMes,
    faturamentoDoMesAgg,
    syncsRodando,
  ] = await Promise.all([
    prisma.empresa.count(),
    prisma.empresa.count({ where: { tinyTokenCipher: { not: null } } }),
    prisma.produto.count(),
    prisma.pedido.count({ where: { dataPedido: { gte: inicioMes } } }),
    prisma.pedido.aggregate({
      where: { dataPedido: { gte: inicioMes } },
      _sum: { valorTotal: true },
    }),
    prisma.syncJob.count({ where: { status: { in: ["pending", "running"] } } }),
  ]);

  const faturamentoMes = faturamentoDoMesAgg._sum.valorTotal
    ? Number(faturamentoDoMesAgg._sum.valorTotal)
    : 0;

  const onboarding = empresas === 0 || empresasConectadas === 0 || totalProdutos === 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bem-vindo</h1>
          <p className="text-muted-foreground">
            Visão geral do seu negócio multiempresa em tempo real.
          </p>
        </div>
      </div>

      {syncsRodando > 0 && (
        <Card className="border-blue-500/40 bg-blue-500/5">
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <div className="flex-1">
              <p className="font-medium">
                {syncsRodando} {syncsRodando === 1 ? "sincronização rodando" : "sincronizações rodando"}
              </p>
              <p className="text-sm text-muted-foreground">
                Os números abaixo vão atualizar conforme os dados chegam.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/empresas">Ver progresso</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {onboarding && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Vamos colocar o Onicanal pra rodar</CardTitle>
            </div>
            <CardDescription>
              Em poucos passos você conecta suas empresas e o painel começa a puxar dados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <Badge variant={empresas > 0 ? "success" : "outline"}>1</Badge>
                <div className="flex-1">
                  <p className="font-medium">Cadastre suas empresas</p>
                  <p className="text-sm text-muted-foreground">
                    Adicione cada CNPJ em{" "}
                    <Link href="/empresas" className="text-primary underline-offset-4 hover:underline">
                      Empresas
                    </Link>
                    .
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant={empresasConectadas > 0 ? "success" : "outline"}>2</Badge>
                <div className="flex-1">
                  <p className="font-medium">Cole os tokens da API do Tiny</p>
                  <p className="text-sm text-muted-foreground">
                    Cada empresa tem seu token (Configurações → Integrações → API).
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant={totalProdutos > 0 ? "success" : "outline"}>3</Badge>
                <div className="flex-1">
                  <p className="font-medium">Sincronize produtos e pedidos</p>
                  <p className="text-sm text-muted-foreground">
                    Em Empresas, clique em <strong>Sincronizar</strong> em cada empresa para puxar os
                    dados da API do Tiny.
                  </p>
                </div>
              </li>
            </ol>
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/empresas">
                  <Building2 className="h-4 w-4" />
                  Ir para Empresas
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" /> Empresas conectadas
            </CardDescription>
            <CardTitle className="text-3xl">
              {empresasConectadas}
              <span className="text-base font-normal text-muted-foreground"> / {empresas}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Plug className="h-3.5 w-3.5" /> Com token Tiny cadastrado.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Package className="h-3.5 w-3.5" /> Produtos sincronizados
            </CardDescription>
            <CardTitle className="text-3xl">{formatNumber(totalProdutos)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Catálogo consolidado das empresas.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <ShoppingCart className="h-3.5 w-3.5" /> Pedidos do mês
            </CardDescription>
            <CardTitle className="text-3xl">{formatNumber(pedidosDoMes)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Mês atual até hoje.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Faturamento do mês
            </CardDescription>
            <CardTitle className="text-3xl">{formatBRL(faturamentoMes)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Soma do valor dos pedidos.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
