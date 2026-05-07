"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { rotuloCanal } from "@/lib/periodo";

interface Props {
  empresas: { id: string; nome: string; apelido: string | null; cor: string }[];
  canais: string[];
}

const PRESETS: { value: string; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "mes", label: "Este mês" },
  { value: "ano", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];

export function VendasFilters({ empresas, canais }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [periodo, setPeriodo] = useState(sp.get("periodo") ?? "30d");
  const [empresa, setEmpresa] = useState(sp.get("empresa") ?? "all");
  const [canal, setCanal] = useState(sp.get("canal") ?? "all");
  const [ini, setIni] = useState(sp.get("ini") ?? "");
  const [fim, setFim] = useState(sp.get("fim") ?? "");

  function aplicar(over?: Partial<{ periodo: string; empresa: string; canal: string; ini: string; fim: string }>) {
    const params = new URLSearchParams();
    const p = over?.periodo ?? periodo;
    const e = over?.empresa ?? empresa;
    const c = over?.canal ?? canal;
    const i = over?.ini ?? ini;
    const f = over?.fim ?? fim;

    if (p && p !== "30d") params.set("periodo", p);
    if (e && e !== "all") params.set("empresa", e);
    if (c && c !== "all") params.set("canal", c);
    if (p === "custom") {
      if (i) params.set("ini", i);
      if (f) params.set("fim", f);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(`/vendas${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <select
          value={periodo}
          onChange={(e) => {
            setPeriodo(e.target.value);
            aplicar({ periodo: e.target.value });
          }}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {periodo === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={ini}
            onChange={(e) => setIni(e.target.value)}
            onBlur={() => aplicar({ ini })}
            className="w-[160px]"
          />
          <span className="text-muted-foreground">até</span>
          <Input
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            onBlur={() => aplicar({ fim })}
            className="w-[160px]"
          />
        </div>
      )}

      <select
        value={empresa}
        onChange={(e) => {
          setEmpresa(e.target.value);
          aplicar({ empresa: e.target.value });
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

      <select
        value={canal}
        onChange={(e) => {
          setCanal(e.target.value);
          aplicar({ canal: e.target.value });
        }}
        className="h-10 rounded-md border bg-background px-3 text-sm"
      >
        <option value="all">Todos os canais</option>
        {canais.map((c) => (
          <option key={c} value={c}>
            {rotuloCanal(c)}
          </option>
        ))}
      </select>
    </div>
  );
}
