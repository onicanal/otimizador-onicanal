import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface ProgressoDetalhe {
  pedidosTotal: number;
  pedidosDetalhados: number;
  pct: number;
}

export async function buscarProgressoDetalhe(
  inicio: Date,
  fim: Date,
  empresaId?: string
): Promise<ProgressoDetalhe> {
  const conds = [
    Prisma.sql`pe."dataPedido" >= ${inicio}`,
    Prisma.sql`pe."dataPedido" <= ${fim}`,
    Prisma.sql`(pe."situacao" IS NULL OR LOWER(pe."situacao") NOT LIKE '%cancel%')`,
  ];
  if (empresaId) conds.push(Prisma.sql`pe."empresaId" = ${empresaId}`);
  const where = Prisma.join(conds, " AND ");

  const rows = await prisma.$queryRaw<{ total: number; detalhados: number }[]>`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "ItemPedido" ip WHERE ip."pedidoId" = pe."id"
      ))::int as detalhados
    FROM "Pedido" pe
    WHERE ${where}
  `;
  const r = rows[0] ?? { total: 0, detalhados: 0 };
  const total = Number(r.total);
  const detalhados = Number(r.detalhados);
  const pct = total > 0 ? (detalhados / total) * 100 : 0;
  return { pedidosTotal: total, pedidosDetalhados: detalhados, pct };
}
