import { Loader2 } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/utils";

interface Props {
  pedidosTotal: number;
  pedidosDetalhados: number;
  pct: number;
}

export function ProgressoDetalheBanner({ pedidosTotal, pedidosDetalhados, pct }: Props) {
  if (pedidosTotal === 0) return null;
  if (pedidosDetalhados >= pedidosTotal) return null;

  const faltam = pedidosTotal - pedidosDetalhados;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-900">
        <Loader2 className="h-4 w-4 animate-spin" />
        Detalhamento de pedidos em andamento
      </div>
      <p className="mt-1 text-amber-800">
        {formatNumber(pedidosDetalhados)} de {formatNumber(pedidosTotal)} pedidos detalhados
        ({formatPercent(pct)}). Faltam {formatNumber(faltam)}. Os números nessa página
        consideram só os pedidos já detalhados — abra a página de Empresas e clique em
        Sincronizar pra continuar o detalhamento.
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}
