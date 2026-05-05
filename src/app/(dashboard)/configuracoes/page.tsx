import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function ConfiguracoesPage() {
  const session = await auth();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Sua conta e preferências do painel.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conta</CardTitle>
          <CardDescription>Informações do usuário logado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nome</span>
            <span className="font-medium">{session?.user?.name ?? "—"}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">E-mail</span>
            <span className="font-medium">{session?.user?.email ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Próximas opções</CardTitle>
          <CardDescription>Disponíveis nas próximas fases.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Frequência de sincronização Tiny (15 / 30 / 60 min)</li>
            <li>Histórico de sincronizações por empresa</li>
            <li>Cadastro de canais e taxas de marketplace</li>
            <li>Exportação de relatórios (Excel/PDF)</li>
            <li>Convite de novos usuários (multiusuário)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
