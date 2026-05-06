import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";
import {
  tinyListarPedidos,
  tinyObterPedido,
  toTinyDate,
  fromTinyDate,
  type TinyPedidoListItem,
  type TinyPedidoDetalhe,
} from "@/lib/tiny";

const CHUNK_BUDGET_MS = 52_000;

interface PedidosCheckpoint {
  fase: "lista" | "detalhe";
  dataInicial: string; // dd/mm/yyyy
  dataFinal: string; // dd/mm/yyyy
  paginaAtual: number;
  totalPaginas: number;
  pendentes: string[]; // tinyIds dos pedidos a buscar detalhe
  totalPedidos: number;
}

function getCheckpoint(detalhes: Prisma.JsonValue | null): PedidosCheckpoint {
  if (!detalhes || typeof detalhes !== "object") {
    return {
      fase: "lista",
      dataInicial: "",
      dataFinal: "",
      paginaAtual: 1,
      totalPaginas: 1,
      pendentes: [],
      totalPedidos: 0,
    };
  }
  const c = detalhes as Partial<PedidosCheckpoint>;
  return {
    fase: c.fase === "detalhe" ? "detalhe" : "lista",
    dataInicial: c.dataInicial ?? "",
    dataFinal: c.dataFinal ?? "",
    paginaAtual: typeof c.paginaAtual === "number" ? c.paginaAtual : 1,
    totalPaginas: typeof c.totalPaginas === "number" ? c.totalPaginas : 1,
    pendentes: Array.isArray(c.pendentes) ? c.pendentes : [],
    totalPedidos: typeof c.totalPedidos === "number" ? c.totalPedidos : 0,
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

function parseDecimal(v: string | undefined | null): Prisma.Decimal | null {
  if (!v) return null;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(n)) return null;
  return new Prisma.Decimal(n);
}

function detectarCanal(pedido: { ecommerce?: { nome?: string; nomeMarketplace?: string }; numero_ecommerce?: string }): string | null {
  const nome = pedido.ecommerce?.nomeMarketplace ?? pedido.ecommerce?.nome;
  if (!nome) {
    return pedido.numero_ecommerce ? "outro" : null;
  }
  const lower = nome.toLowerCase();
  if (lower.includes("mercado")) return "mercadolivre";
  if (lower.includes("shopee")) return "shopee";
  if (lower.includes("amazon")) return "amazon";
  if (lower.includes("magalu") || lower.includes("magazine")) return "magalu";
  if (lower.includes("americanas") || lower.includes("b2w")) return "americanas";
  if (lower.includes("nuvem") || lower.includes("nuvemshop")) return "nuvemshop";
  if (lower.includes("shopify")) return "shopify";
  return lower;
}

async function upsertPedidoLista(empresaId: string, item: TinyPedidoListItem): Promise<string> {
  const p = item.pedido;
  const tinyId = String(p.id);
  const dataPedido = fromTinyDate(p.data_pedido) ?? new Date();
  const valorTotal = parseDecimal(p.valor) ?? new Prisma.Decimal(0);
  const canal = detectarCanal(p);

  await prisma.pedido.upsert({
    where: { empresaId_tinyId: { empresaId, tinyId } },
    create: {
      empresaId,
      tinyId,
      numero: p.numero,
      numeroEcommerce: p.numero_ecommerce ?? null,
      canal,
      situacao: p.situacao,
      dataPedido,
      cliente: p.nome ?? null,
      valorTotal,
      raw: item as unknown as Prisma.InputJsonValue,
    },
    update: {
      numero: p.numero,
      numeroEcommerce: p.numero_ecommerce ?? null,
      canal,
      situacao: p.situacao,
      dataPedido,
      cliente: p.nome ?? null,
      valorTotal,
    },
  });

  return tinyId;
}

async function buscarDetalhePedido(token: string, empresaId: string, tinyId: string): Promise<void> {
  const detalhe = await tinyObterPedido(token, tinyId).catch(() => null);
  if (!detalhe) return;

  await persistirDetalhe(empresaId, tinyId, detalhe);
}

async function persistirDetalhe(empresaId: string, tinyId: string, detalhe: TinyPedidoDetalhe): Promise<void> {
  const pedido = await prisma.pedido.findUnique({
    where: { empresaId_tinyId: { empresaId, tinyId } },
  });
  if (!pedido) return;

  const totalProdutos = parseDecimal(detalhe.totais?.total_produtos);
  const totalPedido = parseDecimal(detalhe.totais?.total_pedido) ?? parseDecimal(detalhe.valor);
  const valorFrete = parseDecimal(detalhe.totais?.total_frete) ?? parseDecimal(detalhe.valor_frete);
  const valorDesconto = parseDecimal(detalhe.totais?.total_desconto) ?? parseDecimal(detalhe.valor_desconto);
  const dataFaturamento = fromTinyDate(detalhe.data_faturamento ?? null);
  const canal = detectarCanal(detalhe);

  // Atualiza dados do pedido
  await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      situacao: detalhe.situacao ?? pedido.situacao,
      dataAprovacao: dataFaturamento,
      cliente: detalhe.cliente?.nome ?? pedido.cliente,
      documentoCli: detalhe.cliente?.cpf_cnpj ?? null,
      uf: detalhe.cliente?.uf ?? null,
      cidade: detalhe.cliente?.cidade ?? null,
      ...(canal && { canal }),
      ...(totalPedido && { valorTotal: totalPedido }),
      ...(valorFrete && { valorFrete }),
      ...(valorDesconto && { valorDesconto }),
      raw: detalhe as unknown as Prisma.InputJsonValue,
    },
  });

  // Re-sincroniza itens (deleta os antigos e cria novos)
  await prisma.itemPedido.deleteMany({ where: { pedidoId: pedido.id } });

  const itens = detalhe.itens ?? [];
  let custoTotalPedido = new Prisma.Decimal(0);

  for (const wrap of itens) {
    const it = wrap.item;
    const sku = it.codigo;
    const quantidade = parseDecimal(it.quantidade) ?? new Prisma.Decimal(0);
    const valorUnit = parseDecimal(it.valor_unitario) ?? new Prisma.Decimal(0);
    const desconto = parseDecimal(it.desconto);
    const valorTotal = valorUnit.mul(quantidade).minus(desconto ?? 0);

    // Tenta resolver o produto pelo SKU para puxar custo
    const produto = sku
      ? await prisma.produto.findFirst({ where: { empresaId, sku } })
      : null;

    const custoUnit = produto?.precoCusto ?? null;
    const custoTotal = custoUnit ? custoUnit.mul(quantidade) : null;
    if (custoTotal) custoTotalPedido = custoTotalPedido.plus(custoTotal);

    await prisma.itemPedido.create({
      data: {
        pedidoId: pedido.id,
        produtoId: produto?.id ?? null,
        sku,
        descricao: it.descricao,
        quantidade,
        valorUnit,
        valorTotal,
        desconto: desconto ?? undefined,
        custoUnit: custoUnit ?? undefined,
        custoTotal: custoTotal ?? undefined,
      },
    });
  }

  // Calcula margem do pedido
  if (custoTotalPedido.gt(0) && totalProdutos) {
    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        custoTotal: custoTotalPedido,
        margemBruta: totalProdutos.minus(custoTotalPedido),
      },
    });
  }
}

export async function processarChunkPedidos(jobId: string): Promise<{ feito: boolean; processados: number; total: number; fase: string }> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job não encontrado.");
  if (job.status === "success") {
    return { feito: true, processados: job.registrosProcessados ?? 0, total: job.totalRegistros ?? 0, fase: "feito" };
  }

  const empresa = await prisma.empresa.findUnique({ where: { id: job.empresaId } });
  if (!empresa) throw new Error("Empresa não encontrada.");

  const token = decryptToken(empresa);
  const checkpoint = getCheckpoint(job.detalhes);
  const t0 = Date.now();

  await prisma.syncJob.update({ where: { id: jobId }, data: { status: "running" } });

  let processados = job.registrosProcessados ?? 0;

  try {
    // Fase 1: paginar lista de pedidos do período
    while (checkpoint.fase === "lista" && Date.now() - t0 < CHUNK_BUDGET_MS) {
      const { pedidos, totalPaginas } = await tinyListarPedidos(token, {
        dataInicial: checkpoint.dataInicial,
        dataFinal: checkpoint.dataFinal,
        pagina: checkpoint.paginaAtual,
      });
      checkpoint.totalPaginas = totalPaginas;

      for (const item of pedidos) {
        const tinyId = await upsertPedidoLista(empresa.id, item);
        checkpoint.pendentes.push(tinyId);
        checkpoint.totalPedidos += 1;
      }

      if (checkpoint.paginaAtual >= totalPaginas || pedidos.length === 0) {
        checkpoint.fase = "detalhe";
        break;
      }
      checkpoint.paginaAtual += 1;
    }

    // Fase 2: buscar detalhe de cada pedido (itens, cliente, custo)
    while (
      checkpoint.fase === "detalhe" &&
      checkpoint.pendentes.length > 0 &&
      Date.now() - t0 < CHUNK_BUDGET_MS
    ) {
      const tinyId = checkpoint.pendentes.shift()!;
      await buscarDetalhePedido(token, empresa.id, tinyId);
      processados += 1;
    }

    const feito = checkpoint.fase === "detalhe" && checkpoint.pendentes.length === 0;

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: feito ? "success" : "running",
        finalizadoEm: feito ? new Date() : null,
        registrosProcessados: processados,
        totalRegistros: checkpoint.totalPedidos,
        detalhes: checkpoint as unknown as Prisma.InputJsonValue,
      },
    });

    if (feito) {
      await prisma.empresa.update({
        where: { id: empresa.id },
        data: { ultimoSyncPedidos: new Date() },
      });
    }

    return { feito, processados, total: checkpoint.totalPedidos, fase: checkpoint.fase };
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

export async function iniciarSyncPedidos(empresaId: string, dataInicial: Date, dataFinal: Date): Promise<string> {
  await prisma.syncJob.updateMany({
    where: { empresaId, tipo: "pedidos", status: { in: ["pending", "running"] } },
    data: { status: "error", finalizadoEm: new Date(), erro: "substituído por novo sync" },
  });

  const job = await prisma.syncJob.create({
    data: {
      empresaId,
      tipo: "pedidos",
      status: "pending",
      detalhes: {
        fase: "lista",
        dataInicial: toTinyDate(dataInicial),
        dataFinal: toTinyDate(dataFinal),
        paginaAtual: 1,
        totalPaginas: 1,
        pendentes: [],
        totalPedidos: 0,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return job.id;
}
