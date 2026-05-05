"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { EmpresaDialog, type EmpresaFormValues } from "@/components/empresas/empresa-dialog";
import { deleteEmpresa, removeEmpresaToken } from "@/server/empresas-actions";

export interface EmpresaItem {
  id: string;
  nome: string;
  apelido: string | null;
  cnpj: string | null;
  cor: string;
  ativo: boolean;
  hasToken: boolean;
  ultimoSyncProdutos: Date | null;
  ultimoSyncPedidos: Date | null;
}

interface Props {
  empresas: EmpresaItem[];
}

export function EmpresasList({ empresas }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmpresaFormValues | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function openEdit(e: EmpresaItem) {
    setEditing({
      id: e.id,
      nome: e.nome,
      apelido: e.apelido,
      cnpj: e.cnpj,
      cor: e.cor,
      ativo: e.ativo,
      hasToken: e.hasToken,
    });
    setDialogOpen(true);
  }

  function onRemoveToken(id: string) {
    if (!confirm("Remover o token desta empresa? A sincronização será interrompida.")) return;
    startTransition(async () => {
      const r = await removeEmpresaToken(id);
      if (!r.ok) {
        toast({ variant: "destructive", title: "Erro", description: r.error });
        return;
      }
      toast({ title: r.message ?? "Token removido." });
      router.refresh();
    });
  }

  function onDelete(id: string, nome: string) {
    if (!confirm(`Excluir a empresa "${nome}" e todos os dados sincronizados?`)) return;
    startTransition(async () => {
      const r = await deleteEmpresa(id);
      if (!r.ok) {
        toast({ variant: "destructive", title: "Erro", description: r.error });
        return;
      }
      toast({ title: r.message ?? "Empresa excluída." });
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empresas</h1>
          <p className="text-muted-foreground">
            Cadastre cada CNPJ e cole o token da API do Tiny.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nova empresa
        </Button>
      </div>

      {empresas.length === 0 ? (
        <Card className="mt-6 border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhuma empresa cadastrada ainda</p>
              <p className="text-sm text-muted-foreground">
                Adicione sua primeira empresa para começar.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Adicionar empresa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {empresas.map((e) => (
            <Card key={e.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-md text-white"
                      style={{ backgroundColor: e.cor }}
                    >
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{e.nome}</CardTitle>
                      {e.apelido && (
                        <p className="text-xs text-muted-foreground">{e.apelido}</p>
                      )}
                    </div>
                  </div>
                  {!e.ativo && <Badge variant="outline">inativa</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">CNPJ</dt>
                    <dd className="font-mono text-xs">{e.cnpj || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tiny conectado</dt>
                    <dd>
                      {e.hasToken ? (
                        <Badge variant="success">conectado</Badge>
                      ) : (
                        <Badge variant="outline">sem token</Badge>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Último sync</dt>
                    <dd className="text-xs">
                      {e.ultimoSyncProdutos
                        ? new Date(e.ultimoSyncProdutos).toLocaleString("pt-BR")
                        : "—"}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(e)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  {e.hasToken && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemoveToken(e.id)}
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Remover token
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(e.id, e.nome)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialogOpen && (
        <EmpresaDialog open={dialogOpen} onOpenChange={setDialogOpen} empresa={editing} />
      )}
    </>
  );
}
