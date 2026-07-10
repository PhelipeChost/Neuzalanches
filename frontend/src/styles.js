// ─── Estilos centralizados (sem framework de CSS) ───────────────────────────
export const cores = {
  fundo: "#f5f5f4",
  card: "#ffffff",
  linha: "#e7e5e4",
  ink: "#1c1917",
  ink2: "#57534e",
  ink3: "#a8a29e",
  verde: "#15803d",
  verdeEscuro: "#14532d",
  verdeBg: "#f0fdf4",
  vermelho: "#dc2626",
  vermelhoBg: "#fef2f2",
  ambar: "#d97706",
  ambarBg: "#fffbeb",
  azul: "#2563eb",
  sidebar: "#0f1a17",
};

export const s = {
  card: { background: cores.card, border: `1px solid ${cores.linha}`, borderRadius: 12, padding: 20 },
  h1: { fontSize: 22, fontWeight: 700, color: cores.ink },
  sub: { fontSize: 12, color: cores.ink3, marginTop: 2 },
  label: { display: "block", fontSize: 11, fontWeight: 600, color: cores.ink2, letterSpacing: "0.06em", marginBottom: 5, textTransform: "uppercase" },
  input: {
    width: "100%", padding: "10px 13px", border: `1.5px solid ${cores.linha}`, borderRadius: 8,
    fontSize: 14, outline: "none", color: cores.ink, background: "#fff", fontFamily: "inherit",
  },
  btn: {
    padding: "10px 20px", background: cores.verde, color: "#fff", border: "none", borderRadius: 8,
    fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  btnSec: {
    padding: "10px 20px", background: "#fff", color: cores.ink2, border: `1.5px solid ${cores.linha}`,
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  btnDanger: {
    padding: "8px 14px", background: "#fff", color: cores.vermelho, border: "1.5px solid #fecaca",
    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  th: { padding: "9px 12px", textAlign: "left", fontSize: 11, color: cores.ink2, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: `2px solid ${cores.linha}`, whiteSpace: "nowrap" },
  td: { padding: "10px 12px", fontSize: 13.5, color: cores.ink, borderBottom: `1px solid #f5f5f4` },
  badge: (bg, cor) => ({ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: bg, color: cor }),
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 },
  modal: { background: "#fff", borderRadius: 14, padding: 26, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" },
};

export const fmtBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");
