// ─── SISTEMA DE MARCA POR CLIENTE ────────────────────────────────────────────
// Cada cliente que ganha um cardápio digital personalizado é uma entrada aqui,
// escolhida em BUILD TIME pela env VITE_BRAND. O cardápio (ClienteApp) lê a
// marca ativa e aplica paleta + fontes + textos do hero. Sem VITE_BRAND, cai
// na marca "default" (tema quente original) — nenhum site existente muda.
//
// Como adicionar um cliente novo:
//   1. Duplique um bloco em BRANDS com um slug (ex.: "boutiquedepeixes").
//   2. Ajuste paleta (light/dark), fontDisplay, hero (gradiente + textos).
//   3. Build: cross-env VITE_ONLINE=1 VITE_BRAND=<slug> vite build --base=/<slug>/
//   4. Deploy num backend/rota próprios (ver _deploy-cliente.mjs).
//
// A LOGO e o NOME do estabelecimento continuam vindo do admin/PDV (config) —
// aqui é só a ESTÉTICA (cores, tipografia, clima). O emblema é só o fallback
// enquanto o cliente ainda não subiu a logo dele.

const BRANDS = {
  // ── Marca padrão: tema quente (lanchonete/hamburgueria) — NÃO MEXER ──────────
  default: {
    slug: "default",
    nomePadrao: "Cardápio",
    tagline: "",
    // layout do cardápio: "menu" = grade de cards (padrão lanchonete);
    // "vitrine" = carrossel horizontal por categoria, card compacto de varejo.
    layout: "menu",
    fontDisplay: "'Syne', sans-serif",
    fontImport: "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Nunito:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap",
    emblema: null, // usa o "N" padrão do Logo
    // Fundo + emoji do card quando o produto não tem foto (por categoria).
    catFallback: { bg: "#5C2A0A", emoji: "🍽️" },
    catVisual: {
      "Hambúrgueres": { bg: "#5C2A0A", emoji: "🍔" },
      "Hamburgueres": { bg: "#5C2A0A", emoji: "🍔" },
      "Beirutes":     { bg: "#6B1A1A", emoji: "🥙" },
      "Lanches":      { bg: "#2A4A18", emoji: "🥪" },
      "Salgados":     { bg: "#7A5A18", emoji: "🥟" },
      "Porções":      { bg: "#4A3214", emoji: "🍟" },
      "Porcoes":      { bg: "#4A3214", emoji: "🍟" },
      "Bebidas":      { bg: "#12305A", emoji: "🥤" },
      "Sobremesas":   { bg: "#5C1A4A", emoji: "🍰" },
    },
    hero: {
      titulo: "Destaques do dia",
      sub: "Promoções e combos só hoje · Não perca!",
      emoji: "🔥",
      gradiente: "linear-gradient(135deg, #FBBF24 0%, #F59E0B 50%, #DC2626 100%)",
      sombra: "0 8px 24px rgba(220,38,38,0.25)",
    },
    promo: { borda: "#F59E0B", faixa: "linear-gradient(90deg, #DC2626 0%, #F59E0B 100%)" },
    tema: {
      light: {
        bg: "#FFF9F4", surface: "#FFFFFF", surfaceWarm: "#FFF2E6",
        brand: "#E8650A", brandDark: "#C0510A", brandLight: "#FEEADA",
        dark: "#1C0F05", text: "#2B1608", textMuted: "#9A6E50", textSoft: "#C49878",
        border: "#EDD9C5", borderDark: "#D8BFA8",
        hot: "#DC2626", newGreen: "#059669",
        accent: "#E8650A", gold: "#F59E0B", brandGlow: "rgba(232,101,10,0.10)",
      },
      dark: {
        bg: "#120A04", surface: "#1E1008", surfaceWarm: "#251408",
        brand: "#F07020", brandDark: "#D05C10", brandLight: "#3A1A06",
        dark: "#0E0804", text: "#F5E8D8", textMuted: "#C09070", textSoft: "#7A5540",
        border: "#2E1A0A", borderDark: "#3E2414",
        hot: "#EF4444", newGreen: "#10B981",
        accent: "#F07020", gold: "#FBBF24", brandGlow: "rgba(240,112,32,0.14)",
      },
    },
  },

  // ── Boutique de Peixes e Frutos do Mar — estética costeira premium ───────────
  // Paleta tirada da própria logo: navy profundo (texto), ferrugem/cobre (anel),
  // creme (fundo), e os tons de mar (peixe azul-esverdeado, camarão coral,
  // concha dourada). Fonte serif "Fraunces" = ar de boutique/artesanal.
  boutiquedepeixes: {
    slug: "boutiquedepeixes",
    nomePadrao: "Boutique de Peixes e Frutos do Mar",
    tagline: "Peixes e frutos do mar frescos, todo dia",
    layout: "vitrine", // carrossel horizontal por categoria, estilo peixaria/varejo
    fontDisplay: "'Plus Jakarta Sans', 'Inter', sans-serif", // sans-serif limpa (estilo da ref.)
    fontImport: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap",
    emblema: "🐟", // fallback enquanto o cliente não sobe a logo dele
    // Fundo (tons de mar profundo) + emoji do card sem foto, por categoria.
    catFallback: { bg: "#123240", emoji: "🐟" },
    catVisual: {
      "Peixes":         { bg: "#123A4C", emoji: "🐟" },
      "Peixe":          { bg: "#123A4C", emoji: "🐟" },
      "Peixes Frescos": { bg: "#123A4C", emoji: "🐟" },
      "Frutos do Mar":  { bg: "#0F3040", emoji: "🦞" },
      "Frutos do mar":  { bg: "#0F3040", emoji: "🦞" },
      "Camarões":       { bg: "#7A3418", emoji: "🦐" },
      "Camaroes":       { bg: "#7A3418", emoji: "🦐" },
      "Camarão":        { bg: "#7A3418", emoji: "🦐" },
      "Mariscos":       { bg: "#164A4A", emoji: "🦪" },
      "Moluscos":       { bg: "#164A4A", emoji: "🦑" },
      "Lulas":          { bg: "#164A4A", emoji: "🦑" },
      "Polvo":          { bg: "#3A1F4A", emoji: "🐙" },
      "Salmão":         { bg: "#8A3B22", emoji: "🐟" },
      "Salmao":         { bg: "#8A3B22", emoji: "🐟" },
      "Bacalhau":       { bg: "#2A4A5A", emoji: "🐟" },
      "Ostras":         { bg: "#164A4A", emoji: "🦪" },
      "Caranguejo":     { bg: "#7A3418", emoji: "🦀" },
      "Siri":           { bg: "#7A3418", emoji: "🦀" },
      "Congelados":     { bg: "#1B4A5C", emoji: "🧊" },
      "Porções":        { bg: "#134A3C", emoji: "🍤" },
      "Porcoes":        { bg: "#134A3C", emoji: "🍤" },
      "Combos":         { bg: "#123240", emoji: "🍽️" },
      "Bebidas":        { bg: "#123A5A", emoji: "🥤" },
    },
    hero: {
      titulo: "Fresco do dia",
      sub: "Pescados e frutos do mar selecionados · direto pra sua casa",
      emoji: "🔥",
      gradiente: "linear-gradient(135deg, #F5811E 0%, #F27A1A 55%, #D8650C 120%)",
      sombra: "0 10px 28px rgba(242,122,26,0.30)",
    },
    promo: { borda: "#F27A1A", faixa: "linear-gradient(90deg, #D8650C 0%, #F27A1A 100%)" },
    // Paleta branco / preto / laranja (ref.: Peixaria 59 Prime).
    // Claro = fundo branco, texto preto, laranja nos CTAs, preço preto.
    // Escuro = fundo quase-preto, texto branco, laranja nos CTAs, preço laranja.
    tema: {
      light: {
        bg: "#FFFFFF",           // branco
        surface: "#FFFFFF",
        surfaceWarm: "#F4F4F5",  // cinza claro (placeholders/chips)
        brand: "#F27A1A",        // laranja — CTAs, abas ativas, "+"
        brandDark: "#D8650C",
        brandLight: "#FDECDC",   // laranja clareado p/ chips/hover
        dark: "#141414",         // preto — barra de navegação
        text: "#171717",         // preto tinta
        textMuted: "#6B7280",    // cinza (nome do produto = secundário)
        textSoft: "#9CA3AF",
        border: "#EAEAEA",
        borderDark: "#DCDCDC",
        hot: "#EF4444",          // vermelho do selo de desconto (−44%)
        newGreen: "#16A34A",     // verde "Aberto"/sucesso
        accent: "#F27A1A",       // laranja
        gold: "#F59E0B",
        price: "#171717",        // PREÇO preto no tema claro
        brandGlow: "rgba(242,122,26,0.14)",
      },
      dark: {
        bg: "#0D0D0D",           // quase preto
        surface: "#171717",
        surfaceWarm: "#1F1F1F",
        brand: "#F5811E",        // laranja
        brandDark: "#D8650C",
        brandLight: "#2A1B0C",
        dark: "#000000",         // barra de navegação preta
        text: "#F5F5F5",         // branco
        textMuted: "#A1A1AA",
        textSoft: "#71717A",
        border: "#262626",
        borderDark: "#333333",
        hot: "#F87171",
        newGreen: "#22C55E",
        accent: "#F5811E",
        gold: "#FBBF24",
        price: "#F5811E",        // PREÇO laranja no tema escuro (igual à ref.)
        brandGlow: "rgba(245,129,30,0.18)",
      },
    },
  },
};

const _slug = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_BRAND) || "default";

export const BRAND = BRANDS[_slug] || BRANDS.default;

// Visual (fundo + emoji) da categoria, robusto a acento/caixa/plural leve.
// Ex.: "Camarões", "camaroes", "CAMARÃO" caem todos no mesmo item.
const _norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const _catNorm = Object.keys(BRAND.catVisual || {}).reduce((acc, k) => {
  acc[_norm(k)] = BRAND.catVisual[k];
  return acc;
}, {});
export function visualCategoria(nome) {
  const n = _norm(nome);
  if (_catNorm[n]) return _catNorm[n];
  // tenta singular/plural simples (remove 's'/'es' final)
  const semPlural = n.replace(/(es|s)$/, "");
  for (const k in _catNorm) {
    if (k.replace(/(es|s)$/, "") === semPlural) return _catNorm[k];
  }
  return BRAND.catFallback;
}

// Gera o bloco de variáveis CSS a partir de uma paleta { light|dark }.
export function cssVarsDaMarca(paleta) {
  return `
      --bg:           ${paleta.bg};
      --surface:      ${paleta.surface};
      --surface-warm: ${paleta.surfaceWarm};
      --brand:        ${paleta.brand};
      --brand-dark:   ${paleta.brandDark};
      --brand-light:  ${paleta.brandLight};
      --dark:         ${paleta.dark};
      --text:         ${paleta.text};
      --text-muted:   ${paleta.textMuted};
      --text-soft:    ${paleta.textSoft};
      --border:       ${paleta.border};
      --border-dark:  ${paleta.borderDark};
      --hot:          ${paleta.hot};
      --new-green:    ${paleta.newGreen};
      --accent:       ${paleta.accent};
      --gold:         ${paleta.gold};
      --price:        ${paleta.price || paleta.text};
      --brand-glow:   ${paleta.brandGlow};`;
}

export default BRAND;
