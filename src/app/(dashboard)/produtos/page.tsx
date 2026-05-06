import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatNumber, formatPercent } from "@/lib/utils";
import { ProdutosFilters } from "@/components/produtos/produtos-filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  empresa?: string;
  q?: string;
  pagina?: string;
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const empresas = await prisma.empresa.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, apelido: true, cor: true },
  });

  const pagina = Math.max(1, Number(searchParams.pagina) || 1);
  const empresaFiltro = searchParams.empresa && searchParams.empresa !== "all" ? searchParams.empresa : null;
  const q = (searchParams.q || "").trim();

  const where = {
    ...(empresaFiltro && { empresaId: empresaFiltro }),
    ...(q && {
      OR: [
        { nome: { contains: q, mode: "insensitive" as const } },
        { sku: { contains: q, mode: "insensitive" as const } },
      ],
    }),
  };

  const [total, produtos] = await Promise.all([
    prisma.produto.count({ where }),
    prisma.produto.findMany({
      where,
      orderBy: { nome: "asc" },
      skip: (pagina - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { empresa: { select: { nome: true, apelido: true, cor: true } } },
    }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const empresaCor = (id: string) => empresas.find((e) => e.id === id)?.cor ?? "#888";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Produtos</h1>
        <p className="text-muted-foreground">
          {formatNumber(total)} produtos sincronizados das suas empresas.
        </p>
      </div>

      <ProdutosFilters empresas={empresas} />

      {produtos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum produto encontrado</p>
              <p className="text-sm text-muted-foreground">
                {total === 0
                  ? "Sincronize uma empresa em Empresas → Sincronizar para puxar produtos do Tiny."
                  : "Ajuste os filtros para ver outros produtos."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-3">Produto</th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3">Categoria</th>
                    <th className="px-3 py-3 text-right">Estoque</th>
                    <th className="px-3 py-3 text-right">Custo</th>
                    <th className="px-3 py-3 text-right">Venda</th>
                    <th className="px-3 py-3 text-right">Margem</th>
                    <th className="px-3 py-3">Empresa</th>
                  </tr>
                </thead>
                <tbody>
                  {produtos.map((p) => {
                    const venda = p.precoVenda ? Number(p.precoVenda) : null;
                    const custo = p.precoCusto ? Number(p.precoCusto) : null;
                    const margemPct =
                      venda && custo && venda > 0 ? ((venda - custo) / venda) * 100 : null;
                    const ruptura =
                      p.estoqueAtual !== null &&
                      p.estoqueMinimo !== null &&
                      p.estoqueAtual !== undefined &&
                      p.estoqueMinimo !== undefined &&
                      p.estoqueMinimo > 0 &&
                      p.estoqueAtual <= p.estoqueMinimo;

                    return (
                      <tr key={p.id} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-3">
                            {p.imagemUrl ? (
                              <Image
                                src={p.imagemUrl}
                                alt={p.nome}
                                width={36}
                                height={36}
                                className="rounded border bg-muted object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded border bg-muted text-muted-foreground">
                                <Package className="h-4 w-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-medium">{p.nome}</div>
                              {p.marca && (
                                <div className="text-xs text-muted-foreground">{p.marca}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.categoria || "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span>{formatNumber(p.estoqueAtual ?? 0)}</span>
                            {ruptura && (
                              <Badge variant="destructive" className="text-[10px]">
                                ruptura
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {custo !== null ? formatBRL(custo) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {venda !== null ? formatBRL(venda) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {margemPct !== null ? formatPercent(margemPct) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: empresaCor(p.empresaId) }}
                            />
                            <span className="text-xs text-muted-foreground">
                              {p.empresa.apelido || p.empresa.nome}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {totalPaginas > 1 && (
        <Pagination
          pagina={pagina}
          totalPaginas={totalPaginas}
          empresa={searchParams.empresa}
          q={searchParams.q}
        />
      )}
    </div>
  );
}

function Pagination({
  pagina,
  totalPaginas,
  empresa,
  q,
}: {
  pagina: number;
  totalPaginas: number;
  empresa?: string;
  q?: string;
}) {
  function url(p: number) {
    const sp = new URLSearchParams();
    if (empresa) sp.set("empresa", empresa);
    if (q) sp.set("q", q);
    if (p > 1) sp.set("pagina", String(p));
    const qs = sp.toString();
    return `/produtos${qs ? `?${qs}` : ""}`;
  }
  const prev = Math.max(1, pagina - 1);
  const next = Math.min(totalPaginas, pagina + 1);
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        Página {pagina} de {totalPaginas}
      </span>
      <div className="flex gap-2">
        <Link
          href={url(prev)}
          className="rounded-md border px-3 py-1.5 hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-40"
          aria-disabled={pagina <= 1}
        >
          Anterior
        </Link>
        <Link
          href={url(next)}
          className="rounded-md border px-3 py-1.5 hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-40"
          aria-disabled={pagina >= totalPaginas}
        >
          Próxima
        </Link>
      </div>
    </div>
  );
}
