// Helpers para definir o intervalo de datas a partir do filtro selecionado.

export type PeriodoPreset = "7d" | "30d" | "90d" | "mes" | "ano" | "custom";

export interface IntervaloDatas {
  inicio: Date;
  fim: Date;
  preset: PeriodoPreset;
  rotulo: string;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function calcularIntervalo(
  preset: PeriodoPreset,
  customIni?: string,
  customFim?: string
): IntervaloDatas {
  const hoje = new Date();
  const fim = endOfDay(hoje);
  let inicio: Date;
  let rotulo: string;

  switch (preset) {
    case "7d":
      inicio = startOfDay(new Date(hoje.getTime() - 6 * 24 * 60 * 60 * 1000));
      rotulo = "Últimos 7 dias";
      break;
    case "30d":
      inicio = startOfDay(new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000));
      rotulo = "Últimos 30 dias";
      break;
    case "90d":
      inicio = startOfDay(new Date(hoje.getTime() - 89 * 24 * 60 * 60 * 1000));
      rotulo = "Últimos 90 dias";
      break;
    case "mes":
      inicio = startOfDay(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
      rotulo = "Este mês";
      break;
    case "ano":
      inicio = startOfDay(new Date(hoje.getFullYear(), 0, 1));
      rotulo = "Este ano";
      break;
    case "custom":
      inicio = customIni ? startOfDay(new Date(`${customIni}T00:00:00`)) : startOfDay(new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000));
      const fimCustom = customFim ? endOfDay(new Date(`${customFim}T00:00:00`)) : fim;
      rotulo = "Personalizado";
      return { inicio, fim: fimCustom, preset, rotulo };
  }

  return { inicio, fim, preset, rotulo };
}

/**
 * Calcula o intervalo imediatamente anterior, com mesma duração, para comparativo.
 */
export function intervaloAnterior(intervalo: IntervaloDatas): { inicio: Date; fim: Date } {
  const ms = intervalo.fim.getTime() - intervalo.inicio.getTime();
  const fim = new Date(intervalo.inicio.getTime() - 1);
  const inicio = new Date(fim.getTime() - ms);
  return { inicio, fim };
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function rotuloCanal(c: string): string {
  const map: Record<string, string> = {
    mercadolivre: "Mercado Livre",
    shopee: "Shopee",
    amazon: "Amazon",
    magalu: "Magalu",
    americanas: "Americanas",
    nuvemshop: "Nuvemshop",
    shopify: "Shopify",
    outro: "Outro",
  };
  return map[c] ?? c;
}
