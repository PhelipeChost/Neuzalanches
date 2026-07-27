// ─── Tema global (light/dark) — identidade Nexus ────────────────────────────
// Aplica data-theme no <html>. As telas que usam CSS vars (--bg, --surface,
// --text…) mudam sozinhas; as que têm cores hardcoded ganham override global
// via ui-tema.css injetado no App.jsx.
//
// A PALETA da marca vem do reinonexusideal.com.br: navy frio (fundo),
// esmeralda (#3ECF8E) como cor-assinatura e champagne/ouro (#C9A84C) nos CTAs.
// O tema escuro antigo era marrom quente e destoava da marca — agora é navy.

// Fonte única da verdade da paleta escura Nexus. FrenteCaixa e o override
// global do App.jsx importam daqui pra não divergir.
export const NEXUS_DARK = {
  bg:            "#0a0c12", // fundo da página (mais profundo)
  bgSubtle:      "#0e1119",
  surface:       "#12151f", // cards / painéis
  surface2:      "#1a1e2a", // headers de card, superfícies aninhadas
  surface3:      "#222736", // hover / seleção
  border:        "#252a38",
  borderStrong:  "#333a4d",
  text:          "#e8eaf0",
  textMuted:     "#9ca3b8",
  textSoft:      "#6b7288",
  brand:         "#3ecf8e", // esmeralda — cor-assinatura Nexus
  brandDeep:     "#22c55e",
  gold:          "#d4b25f",
  goldDeep:      "#c9a84c",
  success:       "#3ecf8e",
  warning:       "#fbbf24",
  danger:        "#f87171",
  info:          "#60a5fa",
  purple:        "#a78bfa",
};

export const TEMA_BG = { dark: NEXUS_DARK.bg, light: "#f5f5f4" };

export function aplicarTemaUI(tema) {
  const t = tema === "dark" ? "dark" : "light";
  try {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("ui-tema", t);
    // Cor do <html>/<body>: se o zoom da escala UI deixar o conteúdo menor que
    // o viewport, sobra área do wrapper — garante que a "borda" tenha a cor do
    // tema, não a bg default do App.
    const bg = TEMA_BG[t];
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    // Avisa telas com tema próprio (FrenteCaixa) pra sincronizar ao vivo quando
    // o cliente troca o tema em Configurações.
    window.dispatchEvent(new CustomEvent("ui-tema-change", { detail: t }));
  } catch { /* SSR / sem localStorage */ }
}
export function lerTemaUI() {
  try {
    const t = localStorage.getItem("ui-tema");
    if (t === "dark" || t === "light") return t;
  } catch { /* ignore */ }
  return "light";
}
export function alternarTemaUI() {
  const novo = lerTemaUI() === "dark" ? "light" : "dark";
  aplicarTemaUI(novo);
  return novo;
}
