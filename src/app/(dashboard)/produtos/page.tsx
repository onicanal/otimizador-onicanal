import { ComingSoon } from "@/components/coming-soon";

export default function ProdutosPage() {
  return (
    <ComingSoon
      title="Produtos"
      fase="Fase 2"
      descricao="Catálogo consolidado das 3 empresas com vendas, custo e estoque."
      itens={[
        "Lista filtrável por empresa, categoria, marca",
        "Coluna de unidades vendidas no período",
        "Coluna de margem média",
        "Indicador visual de ruptura e estoque mínimo",
      ]}
    />
  );
}
