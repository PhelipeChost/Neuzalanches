// ─── Segmentos de cardápio (multiestabelecimento) ────────────────────────────
// Cada CARDÁPIO tem um tipo (establishment_type) que define quais recursos
// aparecem no cadastro de produto e no fluxo de montagem (PDV, mesas e
// cardápio digital). O mesmo estabelecimento pode ter vários cardápios de
// tipos diferentes (ex.: Pizzaria + Açaiteria).
//
// Recursos:
//   tamanhos     → produto tem lista de tamanhos com preço próprio (P/M/G, 300ml…)
//   meioAMeio    → pizza com 2 sabores (metade/metade) da mesma categoria
//   bordas       → bordas recheadas configuradas no cardápio (pizzaria)
//   complementos → adicionais com N inclusos grátis (açaí/sorvete: toppings)
//   adicionais   → adicionais clássicos pagos (lanches, bebidas…)

export const SEGMENTOS = {
  snack_bar: {
    icone: "🥪", nome: "Lanchonete",
    desc: "Lanches e porções com adicionais",
    recursos: { adicionais: true },
  },
  hamburger_shop: {
    icone: "🍔", nome: "Hamburgueria",
    desc: "Hambúrgueres artesanais com adicionais",
    recursos: { adicionais: true },
  },
  pizzeria: {
    icone: "🍕", nome: "Pizzaria",
    desc: "Tamanhos, meio a meio e bordas recheadas",
    recursos: { tamanhos: true, meioAMeio: true, bordas: true, adicionais: true },
  },
  pastelaria: {
    icone: "🥟", nome: "Pastelaria",
    desc: "Pastéis por sabor com adicionais",
    recursos: { adicionais: true },
  },
  ice_cream_shop: {
    icone: "🍦", nome: "Sorveteria",
    desc: "Tamanhos e complementos inclusos",
    recursos: { tamanhos: true, complementos: true },
  },
  acai_shop: {
    icone: "🫐", nome: "Açaiteria",
    desc: "Tamanhos e complementos inclusos",
    recursos: { tamanhos: true, complementos: true },
  },
  cafeteria: {
    icone: "☕", nome: "Cafeteria",
    desc: "Bebidas por tamanho com adicionais",
    recursos: { tamanhos: true, adicionais: true },
  },
  restaurant: {
    icone: "🍱", nome: "Marmitaria / Restaurante",
    desc: "Marmitas por tamanho com acompanhamentos",
    recursos: { tamanhos: true, adicionais: true },
  },
  convenience_store: {
    icone: "🏪", nome: "Conveniência",
    desc: "Produtos simples de prateleira",
    recursos: {},
  },
};

export const TIPOS_CARDAPIO = Object.keys(SEGMENTOS);

export function infoSegmento(tipo) {
  return SEGMENTOS[tipo] || SEGMENTOS.snack_bar;
}

// Labels dos recursos (Suporte / telas de config)
export const RECURSOS_LABELS = {
  tamanhos: "Tamanhos com preço próprio",
  meioAMeio: "Pizza meio a meio (2 sabores)",
  bordas: "Bordas recheadas",
  complementos: "Complementos com inclusos grátis",
  adicionais: "Adicionais pagos",
};

// ── Config JSON (parse defensivo) ────────────────────────────────────────────
export function parseConfig(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

// Tamanhos válidos de um produto: [{ nome, preco }]
export function tamanhosDoProduto(produto) {
  const cfg = parseConfig(produto?.config);
  const ts = Array.isArray(cfg.tamanhos) ? cfg.tamanhos : [];
  return ts.filter(t => t && t.nome && Number(t.preco) >= 0);
}

// Preço "a partir de" para exibição nos cards
export function precoExibicao(produto) {
  const ts = tamanhosDoProduto(produto);
  if (ts.length === 0) return { preco: Number(produto?.preco || 0), aPartirDe: false };
  const min = Math.min(...ts.map(t => Number(t.preco)));
  return { preco: min, aPartirDe: ts.length > 1 };
}

// ── Resolução produto → cardápio ─────────────────────────────────────────────
// produto.categoria é o NOME da categoria; cardapio.categorias são IDs.
// Devolve o primeiro cardápio ativo que contém a categoria do produto.
export function cardapioDoProduto(produto, cardapios, categorias) {
  if (!produto || !Array.isArray(cardapios) || cardapios.length === 0) return null;
  const cat = (categorias || []).find(c => c.nome === produto.categoria);
  if (cat) {
    const c = cardapios.find(cd => cd.ativo !== 0 && (cd.categorias || []).includes(cat.id));
    if (c) return c;
  }
  return null;
}

// Tipo efetivo do cardápio de um produto (fallback: snack_bar)
export function tipoDoProduto(produto, cardapios, categorias) {
  const c = cardapioDoProduto(produto, cardapios, categorias);
  return c?.tipo || "snack_bar";
}

// ── Preço do meio a meio ─────────────────────────────────────────────────────
// regra: "maior" (padrão das pizzarias) ou "media"
export function precoMeioAMeio(precoA, precoB, regra) {
  const a = Number(precoA || 0), b = Number(precoB || 0);
  return regra === "media" ? (a + b) / 2 : Math.max(a, b);
}

// Preço de um tamanho específico de um produto (cai no preço base sem tamanhos)
export function precoDoTamanho(produto, nomeTamanho) {
  const ts = tamanhosDoProduto(produto);
  const t = ts.find(x => x.nome === nomeTamanho);
  return t ? Number(t.preco) : Number(produto?.preco || 0);
}
