import { prisma } from "@/lib/db";
import { EmpresasList, type EmpresaItem } from "@/components/empresas/empresas-list";

export const dynamic = "force-dynamic";

export default async function EmpresasPage() {
  const rows = await prisma.empresa.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });

  const empresas: EmpresaItem[] = rows.map((e) => ({
    id: e.id,
    nome: e.nome,
    apelido: e.apelido,
    cnpj: e.cnpj,
    cor: e.cor,
    ativo: e.ativo,
    hasToken: !!e.tinyTokenCipher,
    ultimoSyncProdutos: e.ultimoSyncProdutos,
    ultimoSyncPedidos: e.ultimoSyncPedidos,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <EmpresasList empresas={empresas} />
    </div>
  );
}
