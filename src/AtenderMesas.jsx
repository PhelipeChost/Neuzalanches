// ─── ATENDER MESAS (plataforma online) ───────────────────────────────────────
// Cardápio próprio da ATENDENTE: ela escolhe a mesa e lança os pedidos que o
// cliente fala com ela no salão. A lista de mesas é exatamente a que o PDV
// registrou — as mesas sobem no sync de catálogo (PDV → online), então criar
// ou excluir mesa no PDV reflete aqui sozinho.
// O pedido cai na comanda da mesa (mesma engrenagem do QR) e desce pra cozinha
// do PDV pelo sync de comandas.
import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import MesaApp from "./MesaApp";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_INFO = {
  livre:     { label: "Livre",           cor: "#15803d", bg: "#f0fdf4", borda: "#bbf7d0" },
  ocupada:   { label: "Ocupada",         cor: "#d97706", bg: "#fffbeb", borda: "#fde68a" },
  fechar:    { label: "Pediu a conta",   cor: "#dc2626", bg: "#fef2f2", borda: "#fecaca" },
  reservada: { label: "Reservada",       cor: "#2563eb", bg: "#eff6ff", borda: "#bfdbfe" },
};

export default function AtenderMesas() {
  const [mesas, setMesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mesaAberta, setMesaAberta] = useState(null); // número da mesa em atendimento

  const carregar = useCallback(async () => {
    try {
      const lista = await api.mesas.listar();
      setMesas(Array.isArray(lista) ? lista.sort((a, b) => a.numero - b.numero) : []);
      setErro("");
    } catch (e) {
      setErro(e.message || "Erro ao carregar mesas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const iv = setInterval(carregar, 10000);
    return () => clearInterval(iv);
  }, [carregar]);

  // Mesa aberta → cardápio da atendente (mesmo motor do QR, com botão voltar)
  if (mesaAberta != null) {
    return (
      <MesaApp
        mesaNumero={mesaAberta}
        modoAtendente
        onVoltar={() => { setMesaAberta(null); carregar(); }}
      />
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f5f5f4", minHeight: "100vh", color: "#1c1917" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .am-card { transition: transform 0.12s, box-shadow 0.12s; }
        .am-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.10); }
      `}</style>

      <header style={{ background: "#fff", borderBottom: "1px solid #e7e5e4", padding: "0 32px", minHeight: 56, display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 50 }}>
        <span style={{ fontSize: 22 }}>🍽️</span>
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700 }}>Atender Mesas</div>
          <div style={{ fontSize: 11, color: "#78716c" }}>Escolha a mesa e lance o pedido do cliente — vai direto pra cozinha do PDV</div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={carregar}
          style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #e7e5e4", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#57534e" }}>
          🔄 Atualizar
        </button>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 60px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#a8a29e" }}>Carregando mesas…</div>
        ) : erro ? (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "16px 20px", color: "#dc2626", fontSize: 13 }}>
            {erro}
          </div>
        ) : mesas.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 14, padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🪑</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Nenhuma mesa registrada</div>
            <div style={{ fontSize: 13, color: "#78716c", maxWidth: 440, margin: "0 auto", lineHeight: 1.5 }}>
              As mesas são criadas na <b>Frente de Caixa do PDV</b> (botão "Gerenciar mesas") e aparecem
              aqui automaticamente na próxima sincronização do catálogo.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20, fontSize: 12.5, color: "#57534e" }}>
              <span><b style={{ color: "#15803d" }}>{mesas.filter(m => m.status === "livre").length}</b> livres</span>
              <span><b style={{ color: "#d97706" }}>{mesas.filter(m => m.status === "ocupada").length}</b> ocupadas</span>
              <span><b style={{ color: "#dc2626" }}>{mesas.filter(m => m.status === "fechar").length}</b> pedindo conta</span>
              <span style={{ color: "#a8a29e" }}>· {mesas.length} mesas no total (registradas no PDV)</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
              {mesas.map(m => {
                const st = STATUS_INFO[m.status] || STATUS_INFO.livre;
                return (
                  <button key={m.id} className="am-card" onClick={() => setMesaAberta(m.numero)}
                    style={{
                      background: st.bg, border: `2px solid ${st.borda}`, borderRadius: 14,
                      padding: "20px 14px", cursor: "pointer", textAlign: "center", fontFamily: "inherit",
                    }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#78716c", letterSpacing: "0.08em" }}>MESA</div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 34, fontWeight: 800, color: "#1c1917", lineHeight: 1.1 }}>{m.numero}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: st.cor, marginTop: 6 }}>{st.label}</div>
                    {m.comanda && (
                      <div style={{ fontSize: 11, color: "#57534e", marginTop: 4 }}>
                        #{String(m.comanda.numero).padStart(3, "0")} · {fmt(m.comanda.total)}
                      </div>
                    )}
                    <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 700, color: "#15803d" }}>Lançar pedido →</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
