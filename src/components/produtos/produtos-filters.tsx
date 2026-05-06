"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Props {
  empresas: { id: string; nome: string; apelido: string | null; cor: string }[];
}

export function ProdutosFilters({ empresas }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [empresa, setEmpresa] = useState(sp.get("empresa") ?? "all");
  const [q, setQ] = useState(sp.get("q") ?? "");

  function aplicar(novoEmpresa: string, novoQ: string) {
    const params = new URLSearchParams();
    if (novoEmpresa && novoEmpresa !== "all") params.set("empresa", novoEmpresa);
    if (novoQ) params.set("q", novoQ);
    const qs = params.toString();
    startTransition(() => {
      router.push(`/produtos${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[260px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou SKU…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") aplicar(empresa, q);
          }}
          className="pl-9"
        />
      </div>
      <select
        value={empresa}
        onChange={(e) => {
          setEmpresa(e.target.value);
          aplicar(e.target.value, q);
        }}
        className="h-10 rounded-md border bg-background px-3 text-sm"
      >
        <option value="all">Todas as empresas</option>
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.apelido || e.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
