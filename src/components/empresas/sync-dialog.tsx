"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  iniciarSyncEmpresa,
  processarProximoChunk,
  type JobStatus,
} from "@/server/sync-actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string;
  empresaNome: string;
}

interface JobView {
  id: string;
  rotulo: string;
  status: JobStatus | null;
  feito: boolean;
}

function fmtJob(j: JobView): string {
  const s = j.status;
  if (!s) return "iniciando…";
  if (s.status === "error") return `erro: ${s.erro ?? "desconhecido"}`;
  if (s.status === "success") return `concluído (${s.registrosProcessados} registros)`;
  const fase = s.fase === "lista" ? "carregando lista" : s.fase === "detalhe" ? "detalhando" : s.fase ?? "rodando";
  if (s.totalRegistros && s.totalRegistros > 0) {
    return `${fase} — ${s.registrosProcessados}/${s.totalRegistros}`;
  }
  return `${fase} — ${s.registrosProcessados} processados`;
}

export function SyncDialog({ open, onOpenChange, empresaId, empresaNome }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const hojeIso = new Date().toISOString().slice(0, 10);
  const inicioAnoIso = `${new Date().getFullYear()}-01-01`;

  const [dataInicial, setDataInicial] = useState(inicioAnoIso);
  const [dataFinal, setDataFinal] = useState(hojeIso);
  const [running, setRunning] = useState(false);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!open) {
      cancelRef.current = true;
    }
  }, [open]);

  async function iniciar() {
    setErroGeral(null);
    setRunning(true);
    cancelRef.current = false;

    const di = new Date(`${dataInicial}T00:00:00`);
    const df = new Date(`${dataFinal}T23:59:59`);

    const r = await iniciarSyncEmpresa(empresaId, di, df);
    if (!r.ok) {
      setErroGeral(r.error);
      setRunning(false);
      toast({ variant: "destructive", title: "Falha ao iniciar", description: r.error });
      return;
    }

    const initial: JobView[] = [];
    if (r.jobIds.produtos) initial.push({ id: r.jobIds.produtos, rotulo: "Produtos", status: null, feito: false });
    if (r.jobIds.pedidos) initial.push({ id: r.jobIds.pedidos, rotulo: "Pedidos", status: null, feito: false });
    setJobs(initial);

    // Loop sequencial: processa cada job até terminar.
    for (const job of initial) {
      while (!cancelRef.current) {
        const out = await processarProximoChunk(job.id);
        setJobs((prev) =>
          prev.map((j) => (j.id === job.id ? { ...j, status: out.status, feito: out.feito } : j))
        );
        if (out.feito) break;
        if (out.error && out.status?.status === "error") {
          setErroGeral(`${job.rotulo}: ${out.error}`);
          break;
        }
        // pequena pausa para não saturar
        await new Promise((res) => setTimeout(res, 250));
      }
      if (cancelRef.current) break;
    }

    setRunning(false);
    router.refresh();
    if (!cancelRef.current && !erroGeral) {
      toast({ title: "Sincronização concluída", description: empresaNome });
    }
  }

  function fecharSeguro(novo: boolean) {
    if (running && novo === false) {
      const conf = confirm(
        "A sincronização ainda está rodando. Se fechar agora, ela continuará em segundo plano no próximo cron diário. Fechar?"
      );
      if (!conf) return;
    }
    onOpenChange(novo);
  }

  return (
    <Dialog open={open} onOpenChange={fecharSeguro}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sincronizar — {empresaNome}</DialogTitle>
          <DialogDescription>
            Puxa produtos do Tiny e pedidos do período selecionado. A primeira vez pode demorar
            algumas horas dependendo do volume — pode deixar rodando ou continuar amanhã (o cron
            retoma de onde parou).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="dini">De</Label>
              <Input
                id="dini"
                type="date"
                value={dataInicial}
                onChange={(e) => setDataInicial(e.target.value)}
                disabled={running}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dfim">Até</Label>
              <Input
                id="dfim"
                type="date"
                value={dataFinal}
                onChange={(e) => setDataFinal(e.target.value)}
                disabled={running}
              />
            </div>
          </div>

          {jobs.length > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-start gap-2">
                  {j.feito && j.status?.status === "success" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  ) : j.status?.status === "error" ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{j.rotulo}</div>
                    <div className="text-xs text-muted-foreground">{fmtJob(j)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {erroGeral && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {erroGeral}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => fecharSeguro(false)} disabled={running}>
            {running ? "Rodando…" : "Fechar"}
          </Button>
          <Button type="button" onClick={iniciar} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {running ? "Sincronizando…" : "Iniciar sincronização"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
