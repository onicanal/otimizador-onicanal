import { ComingSoon } from "@/components/coming-soon";

export default function VendasPage() {
  return (
    <ComingSoon
      title="Vendas"
      fase="Fase 3"
      descricao="Faturamento, ticket médio e comparativos por empresa, canal e período."
      itens={[
        "Série temporal diária / semanal / mensal",
        "Comparativo por canal (Mercado Livre, Shopee, Amazon, site)",
        "Comparativo entre as 3 empresas",
        "Funil: pedido → aprovado → faturado → entregue",
      ]}
    />
  );
}
