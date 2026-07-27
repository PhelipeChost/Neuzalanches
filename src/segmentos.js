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
//   vendaPorPeso → produto pode ser marcado como vendido por kg (preço × peso)

// vendaPorPeso é UNIVERSAL — habilitado em todos os segmentos. Quem não usa,
// simplesmente não marca o checkbox "Vender por peso" no cadastro do produto.
// Peixaria/açougue etc. continuam sendo os casos naturais, mas restaurante que
// vende buffet por kg, cafeteria que vende grãos, mercado de conveniência…
// todos aproveitam sem precisar migrar de segmento.
export const SEGMENTOS = {
  snack_bar: {
    icone: "🥪", nome: "Lanchonete",
    desc: "Lanches e porções com adicionais",
    recursos: { adicionais: true, vendaPorPeso: true },
  },
  hamburger_shop: {
    icone: "🍔", nome: "Hamburgueria",
    desc: "Hambúrgueres artesanais com adicionais",
    recursos: { adicionais: true, vendaPorPeso: true },
  },
  pizzeria: {
    icone: "🍕", nome: "Pizzaria",
    desc: "Tamanhos, meio a meio e bordas recheadas",
    recursos: { tamanhos: true, meioAMeio: true, bordas: true, adicionais: true, vendaPorPeso: true },
  },
  pastelaria: {
    icone: "🥟", nome: "Pastelaria",
    desc: "Pastéis por sabor com adicionais",
    recursos: { adicionais: true, vendaPorPeso: true },
  },
  ice_cream_shop: {
    icone: "🍦", nome: "Sorveteria",
    desc: "Tamanhos e complementos inclusos",
    recursos: { tamanhos: true, complementos: true, vendaPorPeso: true },
  },
  acai_shop: {
    icone: "🫐", nome: "Açaiteria",
    desc: "Tamanhos e complementos inclusos",
    recursos: { tamanhos: true, complementos: true, vendaPorPeso: true },
  },
  cafeteria: {
    icone: "☕", nome: "Cafeteria",
    desc: "Bebidas por tamanho com adicionais",
    recursos: { tamanhos: true, adicionais: true, vendaPorPeso: true },
  },
  restaurant: {
    icone: "🍱", nome: "Marmitaria / Restaurante",
    desc: "Marmitas por tamanho com acompanhamentos",
    recursos: { tamanhos: true, adicionais: true, vendaPorPeso: true },
  },
  convenience_store: {
    icone: "🏪", nome: "Conveniência",
    desc: "Produtos simples de prateleira",
    recursos: { vendaPorPeso: true },
  },
  fish_market: {
    icone: "🐟", nome: "Peixaria",
    desc: "Peixes e frutos do mar — venda por peso (kg) opcional por produto",
    recursos: { adicionais: true, vendaPorPeso: true },
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
  vendaPorPeso: "Venda por peso (kg) — opcional por produto",
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

// ── PIZZARIA v2 ──────────────────────────────────────────────────────────────
// Tamanhos de pizza vivem no CARDÁPIO (herdados por todos os sabores).
// Cada tamanho: { nome, fatias, max_sabores, multiplicador_cmv, ordem? }.
// multiplicador_cmv: fator que multiplica o CMV base do sabor. Padrão = razão
// de fatias em relação ao tamanho "referência" (o que tem multiplicador 1.0
// declarado — normalmente Grande).
export function tamanhosPizzaDoCardapio(cardapio) {
  const cfg = parseConfig(cardapio?.config);
  const ts = Array.isArray(cfg.tamanhos_pizza) ? cfg.tamanhos_pizza : [];
  const clean = ts
    .filter(t => t && t.nome)
    .map(t => ({
      nome: String(t.nome),
      fatias: Math.max(1, parseInt(t.fatias, 10) || 8),
      max_sabores: Math.max(1, parseInt(t.max_sabores, 10) || 1),
      // multiplicador_cmv: se null → auto (calculado depois pela razão de fatias)
      multiplicador_cmv: t.multiplicador_cmv != null && !isNaN(parseFloat(t.multiplicador_cmv))
        ? parseFloat(t.multiplicador_cmv) : null,
      ordem: parseInt(t.ordem, 10) || 0,
    }))
    .sort((a, b) => a.ordem - b.ordem);
  // Auto-fill: quando um tamanho não tem multiplicador definido, usa a razão
  // de fatias contra a mediana (referência natural do cardápio). Assim mesmo
  // sem o cliente configurar nada, pizzas menores custam menos que grandes.
  const fatiasRef = clean.length > 0
    ? (clean.find(t => t.multiplicador_cmv === 1)?.fatias
       ?? clean[Math.floor(clean.length / 2)]?.fatias
       ?? 8)
    : 8;
  return clean.map(t => ({
    ...t,
    multiplicador_cmv_efetivo: t.multiplicador_cmv != null
      ? t.multiplicador_cmv
      : Math.round((t.fatias / fatiasRef) * 100) / 100,
  }));
}

// Fator CMV do tamanho (1.0 se não for pizzaria/tamanho não encontrado)
export function fatorCmvTamanho(cardapio, tamanhoNome) {
  if (!cardapio || cardapio.tipo !== "pizzeria") return 1;
  const t = tamanhosPizzaDoCardapio(cardapio).find(x => x.nome === tamanhoNome);
  return t ? Number(t.multiplicador_cmv_efetivo) || 1 : 1;
}

// Ingredientes de um sabor/produto (array de strings). Vazio = "sem ingredientes
// cadastrados" (cliente não vê remoção).
export function ingredientesDoProduto(produto) {
  const cfg = parseConfig(produto?.config);
  const list = Array.isArray(cfg.ingredientes) ? cfg.ingredientes : [];
  return list.map(s => String(s || "").trim()).filter(Boolean);
}

// Nome composto de pizza com N sabores. Usa fração automática (½, ⅓, ¼…) só
// quando fica visualmente OK. Acima de 4, cai em "Sabor1 + Sabor2 + Sabor3 + Sabor4".
const FRACOES = { 2: "½", 3: "⅓", 4: "¼" };
export function nomePizza(sabores, tamanhoNome) {
  const nomes = sabores.map(s => s?.nome).filter(Boolean);
  if (nomes.length === 0) return "Pizza";
  let base;
  if (nomes.length === 1) base = nomes[0];
  else if (FRACOES[nomes.length]) base = nomes.map(n => `${FRACOES[nomes.length]} ${n}`).join(" ");
  else base = nomes.join(" + ");
  return tamanhoNome ? `${base} — ${tamanhoNome}` : base;
}

// ── VENDA POR PESO (kg) ─────────────────────────────────────────────────────
// Um produto é "por peso" quando o admin marca config.venda_por_peso=true no
// cadastro. Só disponível em cardápios cujo segmento tem recurso vendaPorPeso.
// Guardamos o peso em `quantidade` (Opção A: reaproveita o campo existente,
// evita mudar todo cálculo de preço no financeiro/NFC-e). Formatação de UI
// converte o número em "0,350 kg" quando o produto é por peso.
export function produtoPorPeso(produto) {
  if (!produto) return false;
  const cfg = parseConfig(produto.config);
  return cfg.venda_por_peso === true;
}

// Cardápio permite ter algum produto por peso? (só verifica o segmento)
export function cardapioPermitePorPeso(cardapio) {
  if (!cardapio) return false;
  return !!infoSegmento(cardapio.tipo).recursos.vendaPorPeso;
}

// Formata quantidade para exibição. Se por peso, retorna "0,350 kg";
// senão retorna número normal (usar formatação de "3×" fora daqui).
export function fmtQuantidade(qtd, porPeso) {
  const n = Number(qtd || 0);
  if (porPeso) {
    // até 3 casas decimais (mínimo 1g), sem casas sobrando à toa
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " kg";
  }
  // quantidade inteira ou próxima → mostra sem decimais
  return String(Math.round(n));
}

// Rótulo do preço unitário: "R$ 45,00/kg" se por peso, senão só o valor formatado
export function fmtPrecoUnitario(preco, porPeso) {
  const s = Number(preco || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return porPeso ? `${s}/kg` : s;
}
