// ─── Escala global da UI ────────────────────────────────────────────────────
// Aplica document.body.style.zoom = escala. O Chromium/Electron escala TUDO
// (fontes, ícones, imagens, layout) sem distorção. Escolha do cliente em
// Configurações → Aparência. Valores: 0.9 a 1.5.
export function aplicarEscalaUI(escala) {
  try {
    const s = Math.min(1.5, Math.max(0.85, Number(escala) || 1));
    document.body.style.zoom = String(s);
    localStorage.setItem("ui-escala", String(s));
  } catch { /* zoom não suportado — só no Chromium */ }
}
export function lerEscalaUI() {
  try {
    const v = parseFloat(localStorage.getItem("ui-escala") || "1");
    return Math.min(1.5, Math.max(0.85, isNaN(v) ? 1 : v));
  } catch { return 1; }
}
