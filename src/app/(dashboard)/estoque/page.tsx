import { ComingSoon } from "@/components/coming-soon";

export default function EstoquePage() {
  return (
    <ComingSoon
      title="Estoque"
      fase="Fase 5"
      descricao="Saúde do estoque consolidada das 3 empresas."
      itens={[
        "Cobertura em dias por SKU",
        "Giro de estoque (mensal e anual)",
        "Produtos parados (>90 dias sem venda)",
        "Sugestão automática de compra com base em demanda",
      ]}
    />
  );
}
