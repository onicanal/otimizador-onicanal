// Cliente da API v2 do Tiny ERP (Olist).
//
// Doc: https://www.tiny.com.br/ajuda/api
// Auth: token permanente em querystring + formato=json
// Rate limit oficial: 30 req/min por token. Usamos 25 req/min para folga.

const TINY_BASE_URL = "https://api.tiny.com.br/api2";
const RATE_LIMIT_PER_MIN = 25;
const MIN_INTERVAL_MS = Math.ceil(60_000 / RATE_LIMIT_PER_MIN); // ~2400ms

const lastCallByToken = new Map<string, number>();

async function rateLimit(token: string) {
  const last = lastCallByToken.get(token) ?? 0;
  const elapsed = Date.now() - last;
  const wait = MIN_INTERVAL_MS - elapsed;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCallByToken.set(token, Date.now());
}

export interface TinyResponse<T = unknown> {
  retorno: {
    status: "OK" | "Erro";
    status_processamento?: "1" | "2" | "3"; // 3 = OK
    codigo_erro?: string;
    erros?: { erro: string }[] | { erro: string };
    pagina?: string | number;
    numero_paginas?: string | number;
  } & T;
}

export class TinyError extends Error {
  constructor(
    message: string,
    public code?: string,
    public endpoint?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "TinyError";
  }
}

async function tinyCall<T = unknown>(
  endpoint: string,
  token: string,
  params: Record<string, string | number | undefined> = {}
): Promise<TinyResponse<T>["retorno"]> {
  await rateLimit(token);

  const body = new URLSearchParams();
  body.set("token", token);
  body.set("formato", "json");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      body.set(k, String(v));
    }
  }

  const url = `${TINY_BASE_URL}/${endpoint}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (res.status === 429) {
    throw new TinyError("Rate limit estourado.", "rate_limit", endpoint, true);
  }
  if (!res.ok) {
    throw new TinyError(`HTTP ${res.status} em ${endpoint}`, String(res.status), endpoint, res.status >= 500);
  }

  const json = (await res.json()) as TinyResponse<T>;
  const ret = json.retorno;

  if (ret.status === "Erro") {
    const errs = Array.isArray(ret.erros)
      ? ret.erros.map((e) => e.erro).join("; ")
      : (ret.erros as { erro: string } | undefined)?.erro ?? "erro desconhecido";

    // status_processamento "2" = sem registros (não é erro real)
    if (ret.status_processamento === "2") {
      return ret;
    }

    const isAuth = /token|aut|inválido|invalido/i.test(errs);
    throw new TinyError(errs, ret.codigo_erro, endpoint, !isAuth);
  }

  return ret;
}

// =====================================================================
// Tipos resumidos das respostas (campos úteis)
// =====================================================================

export interface TinyProdutoListItem {
  produto: {
    id: string;
    codigo?: string;
    nome: string;
    unidade?: string;
    preco?: string;
    preco_promocional?: string;
    preco_custo?: string;
    preco_custo_medio?: string;
    situacao?: string; // A=ativo, I=inativo, E=excluído
  };
}

export interface TinyProdutoDetalhe {
  id: string;
  codigo?: string;
  nome: string;
  unidade?: string;
  ncm?: string;
  marca?: string;
  categoria?: string;
  preco?: string;
  preco_custo?: string;
  preco_custo_medio?: string;
  estoque_minimo?: string;
  anexos?: { anexo: { url: string } }[];
  situacao?: string;
}

export interface TinyEstoqueItem {
  saldo: string;
  saldoReservado?: string;
  deposito?: { nome: string; saldo: string };
}

export interface TinyPedidoListItem {
  pedido: {
    id: string;
    numero: string;
    numero_ecommerce?: string;
    data_pedido: string; // dd/mm/yyyy
    data_prevista?: string;
    nome?: string;
    valor: string;
    situacao: string;
    ecommerce?: { nome?: string };
  };
}

export interface TinyPedidoDetalhe {
  id: string;
  numero: string;
  numero_ecommerce?: string;
  data_pedido: string;
  data_faturamento?: string;
  cliente?: { nome?: string; cpf_cnpj?: string; uf?: string; cidade?: string };
  itens?: { item: TinyItemPedido }[];
  totais?: {
    total_produtos?: string;
    total_pedido?: string;
    total_frete?: string;
    total_desconto?: string;
  };
  valor?: string;
  valor_frete?: string;
  valor_desconto?: string;
  situacao: string;
  ecommerce?: { nome?: string; nomeMarketplace?: string };
  marcador?: string;
}

export interface TinyItemPedido {
  id_produto?: string;
  codigo: string;
  descricao: string;
  unidade?: string;
  quantidade: string;
  valor_unitario: string;
  desconto?: string;
}

// =====================================================================
// Métodos públicos
// =====================================================================

export async function tinyTestarToken(token: string): Promise<{ ok: true; conta?: string } | { ok: false; erro: string }> {
  try {
    const ret = await tinyCall<{ conta?: { nome?: string } }>("info.php", token);
    return { ok: true, conta: ret.conta?.nome };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha desconhecida" };
  }
}

export async function tinyListarProdutos(
  token: string,
  pagina: number
): Promise<{ produtos: TinyProdutoListItem[]; totalPaginas: number }> {
  const ret = await tinyCall<{ produtos?: TinyProdutoListItem[] }>(
    "produtos.pesquisa.php",
    token,
    { pagina, situacao: "A" }
  );
  return {
    produtos: ret.produtos ?? [],
    totalPaginas: Number(ret.numero_paginas ?? 1),
  };
}

export async function tinyObterProduto(token: string, id: string): Promise<TinyProdutoDetalhe | null> {
  const ret = await tinyCall<{ produto?: TinyProdutoDetalhe }>("produto.obter.php", token, { id });
  return ret.produto ?? null;
}

export async function tinyObterEstoque(
  token: string,
  id: string
): Promise<{ saldo: number; depositos: { nome: string; saldo: number }[] } | null> {
  const ret = await tinyCall<{ produto?: { saldo?: string; depositos?: { deposito: { nome: string; saldo: string } }[] } }>(
    "produto.obter.estoque.php",
    token,
    { id }
  );
  if (!ret.produto) return null;
  return {
    saldo: Number(ret.produto.saldo ?? 0),
    depositos: (ret.produto.depositos ?? []).map((d) => ({
      nome: d.deposito.nome,
      saldo: Number(d.deposito.saldo),
    })),
  };
}

export interface TinyListarPedidosParams {
  dataInicial?: string; // dd/mm/yyyy
  dataFinal?: string; // dd/mm/yyyy
  dataAtualizacao?: string; // dd/mm/yyyy
  situacao?: string;
  pagina: number;
}

export async function tinyListarPedidos(
  token: string,
  params: TinyListarPedidosParams
): Promise<{ pedidos: TinyPedidoListItem[]; totalPaginas: number }> {
  const ret = await tinyCall<{ pedidos?: TinyPedidoListItem[] }>(
    "pedidos.pesquisa.php",
    token,
    { ...params }
  );
  return {
    pedidos: ret.pedidos ?? [],
    totalPaginas: Number(ret.numero_paginas ?? 1),
  };
}

export async function tinyObterPedido(token: string, id: string): Promise<TinyPedidoDetalhe | null> {
  const ret = await tinyCall<{ pedido?: TinyPedidoDetalhe }>("pedido.obter.php", token, { id });
  return ret.pedido ?? null;
}

// =====================================================================
// Utilitários de data
// =====================================================================

export function toTinyDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function fromTinyDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
}
