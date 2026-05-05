import { ComingSoon } from "@/components/coming-soon";

export default function MargensPage() {
  return (
    <ComingSoon
      title="Margens"
      fase="Fase 4"
      descricao="Análise de margem bruta por produto, categoria, canal e empresa."
      itens={[
        "Margem média por canal (descontando taxas e frete)",
        "Top produtos por margem absoluta",
        "Produtos no prejuízo (margem negativa)",
        "Evolução da margem ao longo do tempo",
      ]}
    />
  );
}
