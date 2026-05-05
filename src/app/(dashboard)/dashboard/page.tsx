import Link from "next/link";
import { ArrowRight, Building2, Plug, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const empresas = await prisma.empresa.count();
  const empresasConectadas = await prisma.empresa.count({
    where: { tinyTokenCipher: { not: null } },
  });

  const onboarding = empresas === 0 || empresasConectadas < empresas;

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

      {onboarding && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Vamos colocar o Onicanal pra rodar</CardTitle>
            </div>
            <CardDescription>
              Em poucos passos você conecta suas 3 empresas no Tiny e o painel começa a puxar dados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <Badge variant={empresas > 0 ? "success" : "outline"}>1</Badge>
                <div className="flex-1">
                  <p className="font-medium">Cadastre suas empresas</p>
                  <p className="text-sm text-muted-foreground">
                    Adicione cada CNPJ em <Link href="/empresas" className="text-primary underline-offset-4 hover:underline">Empresas</Link>.
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
                <Badge variant="outline">3</Badge>
                <div className="flex-1">
                  <p className="font-medium">Aguarde a primeira sincronização</p>
                  <p className="text-sm text-muted-foreground">
                    Vamos puxar produtos, pedidos e estoque automaticamente. (Disponível na Fase 2.)
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Empresas cadastradas</CardDescription>
            <CardTitle className="text-3xl">{empresas}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Total de CNPJs no painel.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Empresas conectadas ao Tiny</CardDescription>
            <CardTitle className="text-3xl">{empresasConectadas}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Plug className="h-3.5 w-3.5" /> Token de API cadastrado.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Próxima fase</CardDescription>
            <CardTitle className="text-lg">Sincronização Tiny</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Conector da API + sync agendada de produtos e pedidos.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
