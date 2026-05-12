import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";

const fmtHora = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "Z");
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const tempoDesde = (iso) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso + "Z").getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
};

const TIPO_CFG = {
  mesa:     { icon: "🪑", color: "#F59E0B", bg: "#2A1A0A" },
  delivery: { icon: "🛵", color: "#60A5FA", bg: "#172554" },
};

export default function CozinhaApp({ onNavegar }) {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState("");
  const [toast, setToast] = useState(null);
  const [marcando, setMarcando] = useState({});
  const prevCount = useRef(0);
  const audioRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const g = await api.cozinha.filaUnificada();
      const total = g.reduce((s, gr) => s + gr.itens.length, 0);
      if (total > prevCount.current && prevCount.current > 0) {
        try { audioRef.current?.play(); } catch {}
      }
      prevCount.current = total;
      setGrupos(g);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const iv = setInterval(carregar, 6000);
    return () => clearInterval(iv);
  }, [carregar]);

  const handleGrupoStatus = async (grupo, novoStatus) => {
    setMarcando(m => ({ ...m, [grupo.grupo_id]: true }));
    try {
      await api.cozinha.atualizarStatus(grupo.grupo_id, novoStatus);
      const msg = novoStatus === "preparando"
        ? `🔥 ${grupo.label}${grupo.cliente_nome ? ` — ${grupo.cliente_nome}` : ""} em preparo!`
        : `✓ ${grupo.label}${grupo.cliente_nome ? ` — ${grupo.cliente_nome}` : ""} pronto!`;
      showToast(msg);
      await carregar();
    } catch {} finally {
      setMarcando(m => ({ ...m, [grupo.grupo_id]: false }));
    }
  };

  const handleItemStatus = async (itemId, nome, novoStatus) => {
    setMarcando(m => ({ ...m, [itemId]: true }));
    try {
      await api.comandas.itens.atualizarStatus(itemId, novoStatus);
      const msg = novoStatus === "preparando" ? `🔥 ${nome} em preparo!` : `✓ ${nome} pronto!`;
      showToast(msg);
      await carregar();
    } catch {} finally {
      setMarcando(m => ({ ...m, [itemId]: false }));
    }
  };

  const totalItens = grupos.reduce((s, g) => s + g.itens.length, 0);

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
      background: "#0F0F0F", color: "#F5F5F4", minHeight: "100vh",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .cz-topbar { position: sticky; top: 0; z-index: 50; background: #1A1A1A; border-bottom: 2px solid #2A2A2A; padding: 16px 28px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
        .cz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 18px; padding: 24px 28px; max-width: 1600px; margin: 0 auto; }
        .cz-card { background: #1A1A1A; border: 1.5px solid #2A2A2A; border-radius: 16px; overflow: hidden; }
        .cz-card-head { padding: 14px 18px; background: #222; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2A2A2A; gap: 10px; }
        .cz-item { padding: 12px 18px; border-bottom: 1px solid #1F1F1F; display: flex; align-items: flex-start; gap: 12px; }
        .cz-item:last-child { border-bottom: none; }
        .cz-card-footer { padding: 12px 18px; border-top: 1px solid #2A2A2A; background: #1D1D1D; }
        .cz-btn-footer { color: #fff; border: none; border-radius: 10px; padding: 12px 22px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s; flex-shrink: 0; width: 100%; }
        .cz-btn-footer:hover { transform: scale(1.02); }
        .cz-btn-footer:active { transform: scale(0.98); }
        .cz-btn-footer:disabled { opacity: 0.5; cursor: wait; transform: none; }
        .cz-btn-preparar { background: #B45309; }
        .cz-btn-preparar:hover { background: #92400E; }
        .cz-btn-pronto { background: #15803d; }
        .cz-btn-pronto:hover { background: #166534; }
        .cz-btn-item { color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s; flex-shrink: 0; white-space: nowrap; }
        .cz-btn-item:disabled { opacity: 0.5; cursor: wait; }
        .cz-card.preparando { border-color: #B4530955; background: #1C1708; }
        .cz-card.preparando .cz-card-head { background: #2A1A0A; }
        .cz-card.preparando .cz-card-footer { background: #231A08; }
        .cz-badge { display: inline-flex; align-items: center; justify-content: center; padding: 2px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; }
        .cz-toast { position: fixed; bottom: 28px; right: 28px; background: #15803d; color: #fff; padding: 14px 24px; border-radius: 12px; font-size: 15px; font-weight: 700; z-index: 200; animation: cz-fi 0.3s ease; box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
        @keyframes cz-fi { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .cz-pulse { animation: cz-p 2s infinite; }
        @keyframes cz-p { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
        .cz-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 16px; color: #555; }
        @media (max-width: 720px) { .cz-grid { grid-template-columns: 1fr; padding: 16px; } .cz-topbar { padding: 12px 16px; gap: 12px; } }
      `}</style>

      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2LlZeUi3xuY2Bwg5GdnZSIeGxlZXWGl6WinJCDdm1rcYKWpqqflot+c29xgJOipZ6Wh3pzdnqIl6OimJGHfHd3fYqYoZ+WjYR+eXyEj5qfm5WPiIJ+gIeSmZ2al5CLhYKEiZKZnJmVkIuGhYiNlJqcmZWQi4eGipCWmpuYlZCLiIiLkJWZmpiVkY2KiYyRlpiYlpKOi4qMkJWYmJaUkY6Li42RlZeXlZOQjouLjZGUl5aVk5CPjIyOkpWXlpSTkI6NjpCTlZWUk5GPjo2PkZSVlZSTkY+OjpCSlJWUk5KQj46PkZOUlJOSkZCPj5CSlJSUk5KRkI+QkZOUlJOTkpGQkJGTk5OTkpKRkJCRkpOTk5OSkpGRkZKTk5OTkpKSkZGSkpOTk5KSkpGRkpKTk5OTkpKSkZGSkpOTk5KSkpKRkpKTk5OTk5KSkpKSkpOTk5OTkpKSkpKSk5OTk5OTkpKSkpKSk5OTk5OTk5KSkpKSkpOTk5OTk5KSkpKS" preload="auto" />

      <header className="cz-topbar">
        <button onClick={() => onNavegar(null)} style={{ background: "none", border: "1.5px solid #333", borderRadius: 10, padding: "8px 14px", color: "#aaa", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>← Início</button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔥</div>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Cozinha</div>
            <div style={{ fontSize: 11, color: "#777", fontWeight: 500 }}>Fila de preparo</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className={totalItens > 0 ? "cz-pulse" : ""} style={{ width: 10, height: 10, borderRadius: "50%", background: totalItens > 0 ? "#DC2626" : "#333" }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: -1 }}>{totalItens}</span>
            <span style={{ fontSize: 13, color: "#777", fontWeight: 500 }}>na fila</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span className="cz-badge" style={{ background: "#2A1A0A", color: "#F59E0B" }}>🪑 {grupos.filter(g => g.tipo === "mesa").reduce((s, g) => s + g.itens.length, 0)}</span>
            <span className="cz-badge" style={{ background: "#172554", color: "#60A5FA" }}>🛵 {grupos.filter(g => g.tipo === "delivery").reduce((s, g) => s + g.itens.length, 0)}</span>
          </div>
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 14, color: "#555", fontWeight: 500 }}>{clock}</span>
        </div>
      </header>

      {loading ? (
        <div className="cz-empty">
          <div style={{ fontSize: 40 }}>🔥</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Carregando fila...</div>
        </div>
      ) : grupos.length === 0 ? (
        <div className="cz-empty">
          <div style={{ fontSize: 64 }}>✨</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#777" }}>Nenhum pedido na fila</div>
          <div style={{ fontSize: 14, color: "#444" }}>Aguardando novos pedidos...</div>
        </div>
      ) : (
        <div className="cz-grid">
          {grupos.map(grupo => {
            const cfg = TIPO_CFG[grupo.tipo] || TIPO_CFG.mesa;
            const isMesa = grupo.tipo === "mesa";
            const estaPreparando = grupo.status_grupo === "preparando";
            return (
              <div key={grupo.grupo_id} className={`cz-card${estaPreparando ? " preparando" : ""}`} style={{ borderColor: estaPreparando ? "#B4530955" : `${cfg.color}33` }}>
                <div className="cz-card-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                    <div>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 800 }}>{grupo.label}</div>
                      {grupo.cliente_nome && (
                        <div style={{ fontSize: 12, color: "#999", fontWeight: 500, marginTop: 1 }}>{grupo.cliente_nome}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    {estaPreparando && (
                      <span className="cz-badge cz-pulse" style={{ background: "#422006", color: "#F59E0B" }}>🔥 Preparando</span>
                    )}
                    <span className="cz-badge" style={{ background: cfg.bg, color: cfg.color }}>
                      {grupo.itens.length} {grupo.itens.length === 1 ? "item" : "itens"}
                    </span>
                    {!isMesa && (
                      <span className="cz-badge" style={{
                        background: grupo.tipo_entrega === "retirada" ? "#1A2E05" : "#172554",
                        color: grupo.tipo_entrega === "retirada" ? "#84CC16" : "#60A5FA",
                      }}>
                        {grupo.tipo_entrega === "retirada" ? "🏪 Retirada" : "🛵 Entrega"}
                      </span>
                    )}
                  </div>
                </div>

                {grupo.itens.map((item, idx) => {
                  const itemPreparando = item.status === "preparando";
                  const proximoStatus = itemPreparando ? "pronto" : "preparando";
                  return (
                    <div key={item.id || idx} className="cz-item">
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 800, color: cfg.color, minWidth: 28 }}>
                        {item.quantidade > 1 ? `${item.quantidade}×` : ""}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{item.produto_nome}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: "#666", fontVariantNumeric: "tabular-nums" }}>⏱ {fmtHora(item.created_at)} · {tempoDesde(item.created_at)}</span>
                          {itemPreparando && (
                            <span className="cz-badge cz-pulse" style={{ background: "#422006", color: "#F59E0B", fontSize: 10 }}>🔥 Preparando</span>
                          )}
                          {item.origem === "qr" && (
                            <span className="cz-badge" style={{ background: "#1E1B4B", color: "#818CF8", fontSize: 10 }}>📱 QR</span>
                          )}
                          {item.origem === "online" && (
                            <span className="cz-badge" style={{ background: "#172554", color: "#60A5FA", fontSize: 10 }}>🌐 Online</span>
                          )}
                        </div>
                        {item.obs && (
                          <div style={{ marginTop: 6, fontSize: 12, color: "#F59E0B", background: "#2A1A0A", padding: "5px 10px", borderRadius: 6, fontWeight: 600 }}>
                            📝 {item.obs}
                          </div>
                        )}
                      </div>
                      {isMesa && (
                        <button className="cz-btn-item" style={{ background: itemPreparando ? "#15803d" : "#B45309" }} disabled={!!marcando[item.id]} onClick={() => handleItemStatus(item.id, item.produto_nome, proximoStatus)}>
                          {marcando[item.id] ? "..." : itemPreparando ? "✓ Pronto" : "🔥 Preparar"}
                        </button>
                      )}
                    </div>
                  );
                })}

                {grupo.obs && (
                  <div style={{ padding: "10px 18px", borderTop: "1px solid #222", fontSize: 13, color: "#F59E0B", fontWeight: 600 }}>
                    📝 {grupo.obs}
                  </div>
                )}

                <div className="cz-card-footer">
                  {estaPreparando ? (
                    <button className="cz-btn-footer cz-btn-pronto" disabled={!!marcando[grupo.grupo_id]}
                      onClick={() => handleGrupoStatus(grupo, "pronto")}>
                      {marcando[grupo.grupo_id] ? "Marcando..." : `✓ Tudo pronto — ${grupo.label}`}
                    </button>
                  ) : (
                    <button className="cz-btn-footer cz-btn-preparar" disabled={!!marcando[grupo.grupo_id]}
                      onClick={() => handleGrupoStatus(grupo, "preparando")}>
                      {marcando[grupo.grupo_id] ? "Marcando..." : `🔥 Preparar — ${grupo.label}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className="cz-toast">{toast}</div>}
    </div>
  );
}
