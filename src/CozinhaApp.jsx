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

export default function CozinhaApp({ onVoltar }) {
  const [fila, setFila] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState("");
  const [toast, setToast] = useState(null);
  const [marcando, setMarcando] = useState({});
  const prevCount = useRef(0);
  const audioRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const f = await api.cozinha.fila();
      if (f.length > prevCount.current && prevCount.current > 0) {
        try { audioRef.current?.play(); } catch {}
      }
      prevCount.current = f.length;
      setFila(f);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const iv = setInterval(carregar, 6000);
    return () => clearInterval(iv);
  }, [carregar]);

  const handlePronto = async (itemId, nome) => {
    setMarcando(m => ({ ...m, [itemId]: true }));
    try {
      await api.comandas.itens.atualizarStatus(itemId, "pronto");
      showToast(`✓ ${nome} pronto!`);
      await carregar();
    } catch {} finally {
      setMarcando(m => ({ ...m, [itemId]: false }));
    }
  };

  const porMesa = {};
  fila.forEach(item => {
    const key = item.mesa_numero || "?";
    if (!porMesa[key]) porMesa[key] = [];
    porMesa[key].push(item);
  });

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
      background: "#0F0F0F", color: "#F5F5F4", minHeight: "100vh",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .cz-topbar { position: sticky; top: 0; z-index: 50; background: #1A1A1A; border-bottom: 2px solid #2A2A2A; padding: 16px 28px; display: flex; align-items: center; gap: 20px; }
        .cz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px; padding: 24px 28px; max-width: 1600px; margin: 0 auto; }
        .cz-mesa-card { background: #1A1A1A; border: 1.5px solid #2A2A2A; border-radius: 16px; overflow: hidden; }
        .cz-mesa-head { padding: 14px 18px; background: #222; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2A2A2A; }
        .cz-item { padding: 14px 18px; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 14px; }
        .cz-item:last-child { border-bottom: none; }
        .cz-btn-pronto { background: #15803d; color: #fff; border: none; border-radius: 10px; padding: 12px 22px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s; flex-shrink: 0; }
        .cz-btn-pronto:hover { background: #166534; transform: scale(1.04); }
        .cz-btn-pronto:active { transform: scale(0.97); }
        .cz-btn-pronto:disabled { opacity: 0.5; cursor: wait; transform: none; }
        .cz-badge { display: inline-flex; align-items: center; justify-content: center; padding: 2px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; }
        .cz-toast { position: fixed; bottom: 28px; right: 28px; background: #15803d; color: #fff; padding: 14px 24px; border-radius: 12px; font-size: 15px; font-weight: 700; z-index: 200; animation: cz-fi 0.3s ease; box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
        @keyframes cz-fi { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .cz-pulse { animation: cz-p 2s infinite; }
        @keyframes cz-p { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
        .cz-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 16px; color: #555; }
        @media (max-width: 720px) { .cz-grid { grid-template-columns: 1fr; padding: 16px; } .cz-topbar { padding: 12px 16px; } }
      `}</style>

      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2LlZeUi3xuY2Bwg5GdnZSIeGxlZXWGl6WinJCDdm1rcYKWpqqflot+c29xgJOipZ6Wh3pzdnqIl6OimJGHfHd3fYqYoZ+WjYR+eXyEj5qfm5WPiIJ+gIeSmZ2al5CLhYKEiZKZnJmVkIuGhYiNlJqcmZWQi4eGipCWmpuYlZCLiIiLkJWZmpiVkY2KiYyRlpiYlpKOi4qMkJWYmJaUkY6Li42RlZeXlZOQjouLjZGUl5aVk5CPjIyOkpWXlpSTkI6NjpCTlZWUk5GPjo2PkZSVlZSTkY+OjpCSlJWUk5KQj46PkZOUlJOSkZCPj5CSlJSUk5KRkI+QkZOUlJOTkpGQkJGTk5OTkpKRkJCRkpOTk5OSkpGRkZKTk5OTkpKSkZGSkpOTk5KSkpGRkpKTk5OTkpKSkZGSkpOTk5KSkpKRkpKTk5OTk5KSkpKSkpOTk5OTkpKSkpKSk5OTk5OTkpKSkpKSk5OTk5OTk5KSkpKSkpOTk5OTk5KSkpKS" preload="auto" />

      <header className="cz-topbar">
        <button onClick={() => onVoltar()} style={{ background: "none", border: "1.5px solid #333", borderRadius: 10, padding: "8px 16px", color: "#aaa", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
          ← Voltar
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔥</div>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Cozinha</div>
            <div style={{ fontSize: 11, color: "#777", fontWeight: 500 }}>Fila de preparo</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className={fila.length > 0 ? "cz-pulse" : ""} style={{ width: 10, height: 10, borderRadius: "50%", background: fila.length > 0 ? "#DC2626" : "#333" }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: -1 }}>{fila.length}</span>
            <span style={{ fontSize: 13, color: "#777", fontWeight: 500 }}>na fila</span>
          </div>
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 14, color: "#555", fontWeight: 500 }}>{clock}</span>
        </div>
      </header>

      {loading ? (
        <div className="cz-empty">
          <div style={{ fontSize: 40 }}>🔥</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Carregando fila...</div>
        </div>
      ) : fila.length === 0 ? (
        <div className="cz-empty">
          <div style={{ fontSize: 64 }}>✨</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#777" }}>Nenhum item na fila</div>
          <div style={{ fontSize: 14, color: "#444" }}>Aguardando novos pedidos...</div>
        </div>
      ) : (
        <div className="cz-grid">
          {Object.entries(porMesa).sort(([a], [b]) => Number(a) - Number(b)).map(([mesa, itens]) => (
            <div key={mesa} className="cz-mesa-card">
              <div className="cz-mesa-head">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🪑</span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 800 }}>Mesa {mesa}</span>
                </div>
                <span className="cz-badge" style={{ background: "#2A1A0A", color: "#F59E0B" }}>
                  {itens.length} {itens.length === 1 ? "item" : "itens"}
                </span>
              </div>
              {itens.map(item => (
                <div key={item.id} className="cz-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{item.produto_nome}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#777", fontVariantNumeric: "tabular-nums" }}>⏱ {fmtHora(item.created_at)} · {tempoDesde(item.created_at)}</span>
                      {item.origem === "qr" && (
                        <span className="cz-badge" style={{ background: "#1E1B4B", color: "#818CF8", fontSize: 10 }}>📱 QR Code</span>
                      )}
                      <span className="cz-badge" style={{
                        background: item.status === "preparando" ? "#422006" : "#172554",
                        color: item.status === "preparando" ? "#FBBF24" : "#60A5FA",
                        fontSize: 10,
                      }}>
                        {item.status === "preparando" ? "🔥 Preparando" : "⏳ Pendente"}
                      </span>
                    </div>
                    {item.obs && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#F59E0B", background: "#2A1A0A", padding: "5px 10px", borderRadius: 6, fontWeight: 600 }}>
                        📝 {item.obs}
                      </div>
                    )}
                  </div>
                  <button
                    className="cz-btn-pronto"
                    disabled={!!marcando[item.id]}
                    onClick={() => handlePronto(item.id, item.produto_nome)}
                  >
                    {marcando[item.id] ? "..." : "✓ Pronto"}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {toast && <div className="cz-toast">{toast}</div>}
    </div>
  );
}
