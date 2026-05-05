import { ComingSoon } from "@/components/coming-soon";

export default function ABCPage() {
  return (
    <ComingSoon
      title="Curva ABC"
      fase="Fase 4"
      descricao="Classifique seu portfólio por faturamento e por margem nos últimos 90 dias."
      itens={[
        "Curva ABC por faturamento (regra 80/15/5)",
        "Curva ABC por margem bruta",
        "Cruzamento ABC × XYZ (variabilidade da demanda)",
        "Exportação para Excel",
      ]}
    />
  );
}
