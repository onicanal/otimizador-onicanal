import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { iniciarSyncProdutos, processarChunkProdutos } from "@/server/sync/produtos";
import { iniciarSyncPedidos, processarChunkPedidos } from "@/server/sync/pedidos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOTAL_BUDGET_MS = 55_000;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron envia: Authorization: Bearer <CRON_SECRET>
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  // Permite chamada manual via query string (debug)
  if (req.nextUrl.searchParams.get("secret") === secret) return true;
  return false;
}

/**
 * Cron diário: cria jobs incrementais e processa pendentes até esgotar o budget.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const log: string[] = [];

  // 1) Cria jobs incrementais para empresas ativas com token
  const empresas = await prisma.empresa.findMany({
    where: { ativo: true, tinyTokenCipher: { not: null } },
  });

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 7); // janela móvel de 7 dias
  const hoje = new Date();

  for (const empresa of empresas) {
    // Só cria sync de produtos uma vez por semana (domingo)
    if (new Date().getDay() === 0) {
      try {
        await iniciarSyncProdutos(empresa.id);
        log.push(`produtos: criado job para ${empresa.nome}`);
      } catch (e) {
        log.push(`produtos: erro ao criar job para ${empresa.nome}: ${e}`);
      }
    }

    // Pedidos: cria job todo dia
    try {
      await iniciarSyncPedidos(empresa.id, ontem, hoje);
      log.push(`pedidos: criado job para ${empresa.nome}`);
    } catch (e) {
      log.push(`pedidos: erro ao criar job para ${empresa.nome}: ${e}`);
    }
  }

  // 2) Processa jobs pendentes até esgotar o budget
  let chunks = 0;
  while (Date.now() - t0 < TOTAL_BUDGET_MS) {
    const job = await prisma.syncJob.findFirst({
      where: { status: { in: ["pending", "running"] } },
      orderBy: [
        { tipo: "asc" }, // produtos antes de pedidos (custo é referenciado)
        { iniciadoEm: "asc" },
      ],
    });
    if (!job) break;

    try {
      if (job.tipo === "produtos") {
        const r = await processarChunkProdutos(job.id);
        log.push(`chunk produtos ${job.id}: feito=${r.feito} ${r.processados}/${r.total}`);
        if (r.feito) chunks += 1;
      } else if (job.tipo === "pedidos") {
        const r = await processarChunkPedidos(job.id);
        log.push(`chunk pedidos ${job.id}: feito=${r.feito} ${r.processados}/${r.total}`);
        if (r.feito) chunks += 1;
      } else {
        await prisma.syncJob.update({
          where: { id: job.id },
          data: { status: "error", erro: `tipo desconhecido: ${job.tipo}`, finalizadoEm: new Date() },
        });
      }
    } catch (e) {
      log.push(`erro no chunk ${job.id}: ${e instanceof Error ? e.message : e}`);
      // O próprio processarChunk* já marca o job como error.
      // Para evitar loop infinito, paramos se o mesmo job retornou erro.
      break;
    }
    chunks += 1;
    if (chunks > 200) break;
  }

  return NextResponse.json({
    ok: true,
    duracao_ms: Date.now() - t0,
    chunks_processados: chunks,
    log: log.slice(-50),
  });
}

// Permite chamada explícita de "rodar pendentes" sem criar novos jobs
// usada como fallback: POST /api/cron/sync (sem criar jobs novos)
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  let chunks = 0;
  const _budget = TOTAL_BUDGET_MS;
  void _budget;

  while (Date.now() - t0 < TOTAL_BUDGET_MS) {
    const job = await prisma.syncJob.findFirst({
      where: { status: { in: ["pending", "running"] } },
      orderBy: { iniciadoEm: "asc" },
    });
    if (!job) break;

    try {
      if (job.tipo === "produtos") await processarChunkProdutos(job.id);
      else if (job.tipo === "pedidos") await processarChunkPedidos(job.id);
      else
        await prisma.syncJob.update({
          where: { id: job.id },
          data: { status: "error", erro: `tipo desconhecido`, finalizadoEm: new Date() } satisfies Prisma.SyncJobUpdateInput,
        });
      chunks += 1;
    } catch {
      break;
    }
  }

  return NextResponse.json({ ok: true, chunks });
}
