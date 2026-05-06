import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";
import {
  tinyListarProdutos,
  tinyObterProduto,
  tinyObterEstoque,
  parseTinyNumber,
  type TinyProdutoListItem,
} from "@/lib/tiny";

function toDecimal(v: unknown): Prisma.Decimal | null {
  const n = parseTinyNumber(v);
  return n === null ? null : new Prisma.Decimal(n);
}

// Tempo máximo (ms) que cada chunk pode rodar antes de parar e devolver controle.
// Vercel Hobby: 60s — deixamos 8s de folga para teardown/persistência.
const CHUNK_BUDGET_MS = 52_000;

interface ProdutosCheckpoint {
  fase: "lista" | "detalhe";
  paginaAtual: number;
  totalPaginas: number;
  // IDs de produtos pendentes de buscar detalhe/estoque
  pendentes: string[];
  totalProdutos: number;
}

function getCheckpoint(detalhes: Prisma.JsonValue | null): ProdutosCheckpoint {
  const def: ProdutosCheckpoint = {
    fase: "lista",
    paginaAtual: 1,
    totalPaginas: 1,
    pendentes: [],
    totalProdutos: 0,
  };
  if (!detalhes || typeof detalhes !== "object") return def;
  const c = detalhes as Partial<ProdutosCheckpoint>;
  return {
    fase: c.fase === "detalhe" ? "detalhe" : "lista",
    paginaAtual: typeof c.paginaAtual === "number" ? c.paginaAtual : 1,
    totalPaginas: typeof c.totalPaginas === "number" ? c.totalPaginas : 1,
    pendentes: Array.isArray(c.pendentes) ? c.pendentes : [],
    totalProdutos: typeof c.totalProdutos === "number" ? c.totalProdutos : 0,
  };
}

function decryptToken(empresa: { tinyTokenCipher: string | null; tinyTokenIv: string | null; tinyTokenTag: string | null }) {
  if (!empresa.tinyTokenCipher || !empresa.tinyTokenIv || !empresa.tinyTokenTag) {
    throw new Error("Empresa sem token Tiny cadastrado.");
  }
  return decryptString({
    cipher: empresa.tinyTokenCipher,
    iv: empresa.tinyTokenIv,
    tag: empresa.tinyTokenTag,
  });
}

/**
 * Salva produtos da listagem (dados básicos) em lote.
 * Retorna IDs que precisam de detalhe/estoque.
 */
async function upsertProdutosLista(empresaId: string, items: TinyProdutoListItem[]): Promise<string[]> {
  const ids: string[] = [];

  for (const it of items) {
    const p = it.produto;
    const tinyId = String(p.id);
    ids.push(tinyId);

    const precoVenda = toDecimal(p.preco);
    const precoCusto = toDecimal(p.preco_custo) ?? toDecimal(p.preco_custo_medio);

    await prisma.produto.upsert({
      where: { empresaId_tinyId: { empresaId, tinyId } },
      create: {
        empresaId,
        tinyId,
        sku: p.codigo ?? tinyId,
        nome: p.nome,
        unidade: p.unidade ?? null,
        precoVenda: precoVenda ?? undefined,
        precoCusto: precoCusto ?? undefined,
        ativo: p.situacao !== "I" && p.situacao !== "E",
        raw: it as unknown as Prisma.InputJsonValue,
      },
      update: {
        sku: p.codigo ?? tinyId,
        nome: p.nome,
        unidade: p.unidade ?? null,
        ...(precoVenda !== null && { precoVenda }),
        ...(precoCusto !== null && { precoCusto }),
        ativo: p.situacao !== "I" && p.situacao !== "E",
        raw: it as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return ids;
}

async function buscarDetalheEEstoque(token: string, empresaId: string, tinyId: string): Promise<void> {
  const [det, est] = await Promise.all([
    tinyObterProduto(token, tinyId).catch(() => null),
    tinyObterEstoque(token, tinyId).catch(() => null),
  ]);

  const data: Prisma.ProdutoUpdateInput = {};

  if (det) {
    if (det.categoria) data.categoria = det.categoria;
    if (det.marca) data.marca = det.marca;
    if (det.ncm) data.ncm = det.ncm;
    const custo = toDecimal(det.preco_custo) ?? toDecimal(det.preco_custo_medio);
    if (custo) data.precoCusto = custo;
    const min = parseTinyNumber(det.estoque_minimo);
    if (min !== null) data.estoqueMinimo = Math.round(min);
    if (det.anexos && det.anexos.length > 0 && det.anexos[0].anexo?.url) {
      data.imagemUrl = det.anexos[0].anexo.url;
    }
  }

  if (est) {
    data.estoqueAtual = Math.round(est.saldo);
  }

  if (Object.keys(data).length > 0) {
    await prisma.produto.updateMany({
      where: { empresaId, tinyId },
      data,
    });
  }
}

/**
 * Processa um chunk do sync de produtos. Devolve true se terminou.
 */
export async function processarChunkProdutos(jobId: string): Promise<{ feito: boolean; processados: number; total: number }> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job não encontrado.");
  if (job.status === "success") return { feito: true, processados: job.registrosProcessados ?? 0, total: job.totalRegistros ?? 0 };

  const empresa = await prisma.empresa.findUnique({ where: { id: job.empresaId } });
  if (!empresa) throw new Error("Empresa não encontrada.");

  const token = decryptToken(empresa);
  const checkpoint = getCheckpoint(job.detalhes);
  const t0 = Date.now();

  await prisma.syncJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  let processados = job.registrosProcessados ?? 0;

  try {
    // Fase 1: paginar a lista de produtos
    while (checkpoint.fase === "lista" && Date.now() - t0 < CHUNK_BUDGET_MS) {
      const { produtos, totalPaginas } = await tinyListarProdutos(token, checkpoint.paginaAtual);
      checkpoint.totalPaginas = totalPaginas;

      const ids = await upsertProdutosLista(empresa.id, produtos);
      checkpoint.pendentes.push(...ids);
      checkpoint.totalProdutos += ids.length;

      if (checkpoint.paginaAtual >= totalPaginas || produtos.length === 0) {
        checkpoint.fase = "detalhe";
        break;
      }
      checkpoint.paginaAtual += 1;
    }

    // Fase 2: buscar detalhe/estoque de cada produto
    while (
      checkpoint.fase === "detalhe" &&
      checkpoint.pendentes.length > 0 &&
      Date.now() - t0 < CHUNK_BUDGET_MS
    ) {
      const tinyId = checkpoint.pendentes.shift()!;
      await buscarDetalheEEstoque(token, empresa.id, tinyId);
      processados += 1;
    }

    const feito = checkpoint.fase === "detalhe" && checkpoint.pendentes.length === 0;

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: feito ? "success" : "running",
        finalizadoEm: feito ? new Date() : null,
        registrosProcessados: processados,
        totalRegistros: checkpoint.totalProdutos,
        detalhes: checkpoint as unknown as Prisma.InputJsonValue,
      },
    });

    if (feito) {
      await prisma.empresa.update({
        where: { id: empresa.id },
        data: { ultimoSyncProdutos: new Date(), primeiroSyncOk: true },
      });
    }

    return { feito, processados, total: checkpoint.totalProdutos };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "erro desconhecido";
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: "error",
        finalizadoEm: new Date(),
        erro,
        detalhes: checkpoint as unknown as Prisma.InputJsonValue,
      },
    });
    throw e;
  }
}

/**
 * Cria um job de sync de produtos para a empresa.
 */
export async function iniciarSyncProdutos(empresaId: string): Promise<string> {
  // Cancela jobs antigos da mesma empresa/tipo que ficaram presos em "running"
  await prisma.syncJob.updateMany({
    where: { empresaId, tipo: "produtos", status: { in: ["pending", "running"] } },
    data: { status: "error", finalizadoEm: new Date(), erro: "substituído por novo sync" },
  });

  const job = await prisma.syncJob.create({
    data: {
      empresaId,
      tipo: "produtos",
      status: "pending",
      detalhes: {
        fase: "lista",
        paginaAtual: 1,
        totalPaginas: 1,
        pendentes: [],
        totalProdutos: 0,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return job.id;
}
