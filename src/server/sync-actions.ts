"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { iniciarSyncProdutos, processarChunkProdutos } from "@/server/sync/produtos";
import { iniciarSyncPedidos, processarChunkPedidos } from "@/server/sync/pedidos";

export type SyncActionResult =
  | { ok: true; jobIds: { produtos?: string; pedidos?: string }; message?: string }
  | { ok: false; error: string };

async function ensureAuth() {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado.");
}

/**
 * Cria jobs de sync (produtos + pedidos do período) para uma empresa.
 * Não processa nada — só cria; o processamento acontece via /api/sync/run.
 */
export async function iniciarSyncEmpresa(empresaId: string, dataInicial: Date, dataFinal: Date): Promise<SyncActionResult> {
  try {
    await ensureAuth();

    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!empresa) return { ok: false, error: "Empresa não encontrada." };
    if (!empresa.tinyTokenCipher) return { ok: false, error: "Empresa sem token Tiny." };

    const produtosJobId = await iniciarSyncProdutos(empresaId);
    const pedidosJobId = await iniciarSyncPedidos(empresaId, dataInicial, dataFinal);

    revalidatePath("/empresas");
    revalidatePath("/dashboard");
    return {
      ok: true,
      jobIds: { produtos: produtosJobId, pedidos: pedidosJobId },
      message: "Sincronização iniciada.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao iniciar." };
  }
}

export interface JobStatus {
  id: string;
  tipo: string;
  status: string;
  registrosProcessados: number;
  totalRegistros: number | null;
  iniciadoEm: Date;
  finalizadoEm: Date | null;
  erro: string | null;
  fase?: string;
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  let fase: string | undefined;
  if (job.detalhes && typeof job.detalhes === "object" && !Array.isArray(job.detalhes)) {
    const d = job.detalhes as Record<string, unknown>;
    if (typeof d.fase === "string") fase = d.fase;
  }

  return {
    id: job.id,
    tipo: job.tipo,
    status: job.status,
    registrosProcessados: job.registrosProcessados ?? 0,
    totalRegistros: job.totalRegistros,
    iniciadoEm: job.iniciadoEm,
    finalizadoEm: job.finalizadoEm,
    erro: job.erro,
    fase,
  };
}

/**
 * Processa o próximo chunk do job. Chamado em loop pelo browser.
 * Devolve true quando o job termina.
 */
export async function processarProximoChunk(jobId: string): Promise<{ feito: boolean; status: JobStatus | null; error?: string }> {
  try {
    await ensureAuth();
    const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
    if (!job) return { feito: true, status: null, error: "Job não encontrado." };

    if (job.status === "success" || job.status === "error") {
      return { feito: true, status: await getJobStatus(jobId) };
    }

    if (job.tipo === "produtos") {
      const r = await processarChunkProdutos(jobId);
      return { feito: r.feito, status: await getJobStatus(jobId) };
    }
    if (job.tipo === "pedidos") {
      const r = await processarChunkPedidos(jobId);
      return { feito: r.feito, status: await getJobStatus(jobId) };
    }
    return { feito: true, status: null, error: `Tipo de job desconhecido: ${job.tipo}` };
  } catch (e) {
    return { feito: false, status: await getJobStatus(jobId), error: e instanceof Error ? e.message : "erro" };
  }
}
