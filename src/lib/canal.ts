// Detecção do canal de venda a partir dos campos do pedido Tiny.
//
// O Tiny api2 não devolve o nome do marketplace na listagem, então a gente
// precisa inferir pelo padrão do numero_ecommerce:
//   - Mercado Livre: 16 dígitos começando com "2000"     (ex: 2000016326595202)
//   - Shopee:        YYMMDD + 8 caracteres alfanuméricos  (ex: 260508SYJNM0YS)
//   - Amazon:        XXX-XXXXXXX-XXXXXXX                  (ex: 701-9706688-2743400)
//
// Quando o detalhe do pedido carrega, o ecommerce.nome vem preenchido — esse
// caminho tem prioridade.

const REGEX_ML = /^2000\d{12}$/;
const REGEX_SHOPEE = /^\d{6}[A-Z0-9]{8}$/i;
const REGEX_AMAZON = /^\d{3}-\d{7}-\d{7}$/;

export function detectarCanalPorNumero(numeroEcommerce: string | null | undefined): string | null {
  if (!numeroEcommerce) return null;
  const n = numeroEcommerce.trim();
  if (REGEX_ML.test(n)) return "mercadolivre";
  if (REGEX_SHOPEE.test(n)) return "shopee";
  if (REGEX_AMAZON.test(n)) return "amazon";
  return null;
}

export function detectarCanalPorNome(nome: string | null | undefined): string | null {
  if (!nome) return null;
  const lower = nome.toLowerCase();
  if (lower.includes("mercado")) return "mercadolivre";
  if (lower.includes("shopee")) return "shopee";
  if (lower.includes("amazon")) return "amazon";
  if (lower.includes("magalu") || lower.includes("magazine")) return "magalu";
  if (lower.includes("americanas") || lower.includes("b2w")) return "americanas";
  if (lower.includes("nuvem")) return "nuvemshop";
  if (lower.includes("shopify")) return "shopify";
  return lower;
}

export function detectarCanal(input: {
  ecommerceNome?: string | null;
  numeroEcommerce?: string | null;
}): string | null {
  // 1. Prioriza ecommerce.nome (vem do detalhe do pedido)
  const porNome = detectarCanalPorNome(input.ecommerceNome);
  if (porNome) return porNome;

  // 2. Fallback: detecta pelo padrão do numero_ecommerce (vem da lista)
  const porNumero = detectarCanalPorNumero(input.numeroEcommerce);
  if (porNumero) return porNumero;

  // 3. Tem numero mas não bateu nenhum padrão = "outro"
  return input.numeroEcommerce ? "outro" : null;
}
