"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { createEmpresa, updateEmpresa } from "@/server/empresas-actions";

export interface EmpresaFormValues {
  id?: string;
  nome: string;
  apelido?: string | null;
  cnpj?: string | null;
  cor: string;
  ativo: boolean;
  hasToken: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa?: EmpresaFormValues;
}

export function EmpresaDialog({ open, onOpenChange, empresa }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const isEditing = !!empresa?.id;

  const [nome, setNome] = useState(empresa?.nome ?? "");
  const [apelido, setApelido] = useState(empresa?.apelido ?? "");
  const [cnpj, setCnpj] = useState(empresa?.cnpj ?? "");
  const [cor, setCor] = useState(empresa?.cor ?? "#FF6B35");
  const [ativo, setAtivo] = useState(empresa?.ativo ?? true);
  const [tinyToken, setTinyToken] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const fd = new FormData();
    fd.set("nome", nome);
    fd.set("apelido", apelido ?? "");
    fd.set("cnpj", cnpj ?? "");
    fd.set("cor", cor);
    fd.set("ativo", ativo ? "true" : "false");
    fd.set("tinyToken", tinyToken);

    startTransition(async () => {
      const result = isEditing
        ? await updateEmpresa(empresa!.id!, fd)
        : await createEmpresa(fd);

      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "Não foi possível salvar",
          description: result.error,
        });
        return;
      }

      toast({ title: result.message ?? "Salvo." });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          <DialogDescription>
            Cadastre o CNPJ e cole o token da API do Tiny para começar a sincronizar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Onicanal Ltda."
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="apelido">Apelido</Label>
              <Input
                id="apelido"
                value={apelido ?? ""}
                onChange={(e) => setApelido(e.target.value)}
                placeholder="Loja A"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={cnpj ?? ""}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cor">Cor (gráficos)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cor"
                  type="color"
                  className="h-10 w-14 cursor-pointer p-1"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  disabled={isPending}
                />
                <Input
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex h-10 items-center gap-2 rounded-md border bg-background px-3">
                <input
                  id="ativo"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  disabled={isPending}
                />
                <Label htmlFor="ativo" className="cursor-pointer">
                  Empresa ativa
                </Label>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <Label htmlFor="tinyToken">
              Token da API do Tiny (Olist)
              {empresa?.hasToken && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  já cadastrado — preencha apenas para substituir
                </span>
              )}
            </Label>
            <Input
              id="tinyToken"
              type="password"
              autoComplete="off"
              value={tinyToken}
              onChange={(e) => setTinyToken(e.target.value)}
              placeholder={empresa?.hasToken ? "•••••••••••• (atual)" : "Cole o token aqui"}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Onde encontrar: painel do Tiny → Configurações → Integrações → API. O token é
              criptografado antes de ser salvo no banco.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
