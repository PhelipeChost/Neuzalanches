import { useState, useEffect, useRef } from "react";
import { api } from "./api";

const STATUS_LABELS = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
const STATUS_CORES = {
  pendente: { bg: "#fef3c7", color: "#92400e" },
  confirmado: { bg: "#dbeafe", color: "#1e40af" },
  preparando: { bg: "#fce7f3", color: "#9d174d" },
  pronto: { bg: "#dcfce7", color: "#15803d" },
  entregue: { bg: "#f0fdf4", color: "#166534" },
  cancelado: { bg: "#fee2e2", color: "#991b1b" },
};
const ATIVOS = ["pendente", "confirmado", "preparando", "pronto"];

export default function PedidosOnlineApp({ onNavegar }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("ativos");
  const [toast, setToast] = useState("");
  const [selecionado, setSelecionado] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const interval = useRef(null);

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 3000); };

  const carregar = async () => {
    try {
      const lista = await api.pedidos.listar();
      setPedidos(lista.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch { }
  };

  useEffect(() => {
    carregar().finally(() => setLoading(false));
    interval.current = setInterval(carregar, 8000);
    return () => clearInterval(interval.current);
  }, []);

  const atualizarStatus = async (id, status) => {
    setAtualizando(true);
    try {
      await api.pedidos.atualizarStatus(id, status);
      showToast(`Pedido #${id} → ${STATUS_LABELS[status]}`);
      await carregar();
      setSelecionado(null);
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setAtualizando(false); }
  };

  const filtrados = pedidos.filter(p =>
    filtro === "ativos" ? ATIVOS.includes(p.status) : !ATIVOS.includes(p.status)
  );

  const fmt = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtHora = (iso) => { try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  const fmtData = (iso) => { try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); } catch { return ""; } };

  const badge = (status) => {
    const c = STATUS_CORES[status] || {};
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: c.bg, color: c.color }}>{STATUS_LABELS[status] || status}</span>;
  };

  const ativosCount = pedidos.filter(p => ATIVOS.includes(p.status)).length;

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#a8a29e", fontFamily: "'DM Sans', sans-serif" }}>Carregando pedidos...</div>;

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f5f5f4", minHeight: "100vh", color: "#1c1917" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .po-card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 14px 16px; cursor: pointer; transition: all 0.15s; }
        .po-card:hover { border-color: #d6d3d1; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .po-btn { border: none; border-radius: 8px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .po-btn:disabled { opacity: 0.5; cursor: default; }
        .anim { animation: fi 0.25s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 999; animation: fi 0.3s ease; color: #fff; }
      `}</style>

      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e7e5e4", padding: "0 24px", minHeight: 56, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => onNavegar(null)} style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: "#1c1917" }}>Pedidos</span>
        </button>

        {ativosCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#fef3c7", color: "#92400e" }}>
            {ativosCount} ativo{ativosCount > 1 ? "s" : ""}
          </span>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 4, background: "#f5f5f4", borderRadius: 8, padding: 3 }}>
          {[{ key: "ativos", label: "Ativos" }, { key: "finalizados", label: "Finalizados" }].map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)} style={{
              padding: "6px 16px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              background: filtro === f.key ? "#fff" : "transparent", color: filtro === f.key ? "#1c1917" : "#78716c",
              boxShadow: filtro === f.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}>{f.label}</button>
          ))}
        </div>

        <button onClick={() => onNavegar(null)} style={{ padding: "6px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
          {"←"} Início
        </button>
      </header>

      {/* Lista */}
      <div className="anim" style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px" }}>
        {filtrados.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#a8a29e" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{filtro === "ativos" ? "📋" : "✅"}</div>
            <div style={{ fontSize: 14 }}>{filtro === "ativos" ? "Nenhum pedido ativo no momento." : "Nenhum pedido finalizado."}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtrados.map(p => (
              <div key={p.id} className="po-card" onClick={() => setSelecionado(selecionado?.id === p.id ? null : p)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>#{p.id}</span>
                    {p.tipo === "mesa" && <span style={{ fontSize: 11, color: "#78716c" }}>Mesa {p.mesa_numero}</span>}
                    {p.tipo === "delivery" && <span style={{ fontSize: 11, color: "#78716c" }}>Delivery</span>}
                    {p.tipo === "balcao" && <span style={{ fontSize: 11, color: "#78716c" }}>Balcao</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {badge(p.status)}
                    <span style={{ fontSize: 11, color: "#a8a29e" }}>{fmtData(p.created_at)} {fmtHora(p.created_at)}</span>
                  </div>
                </div>

                {p.cliente_nome && <div style={{ fontSize: 12, color: "#57534e", marginBottom: 2 }}>{p.cliente_nome} {p.cliente_telefone && `· ${p.cliente_telefone}`}</div>}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <div style={{ fontSize: 12, color: "#78716c" }}>
                    {(p.itens || []).length} {(p.itens || []).length === 1 ? "item" : "itens"}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#15803d" }}>{fmt(p.total)}</div>
                </div>

                {/* Detalhes expandidos */}
                {selecionado?.id === p.id && (
                  <div style={{ marginTop: 12, borderTop: "1px solid #f5f5f4", paddingTop: 12 }}>
                    {(p.itens || []).map((it, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: "#57534e" }}>
                        <span>{it.quantidade}x {it.produto_nome}{it.observacao ? ` (${it.observacao})` : ""}</span>
                        <span style={{ fontWeight: 600 }}>{fmt(it.preco_unitario * it.quantidade)}</span>
                      </div>
                    ))}
                    {p.observacao && <div style={{ fontSize: 12, color: "#78716c", fontStyle: "italic", marginTop: 6 }}>Obs: {p.observacao}</div>}
                    {p.endereco && <div style={{ fontSize: 12, color: "#78716c", marginTop: 4 }}>Entrega: {p.endereco}</div>}

                    {ATIVOS.includes(p.status) && (
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        {p.status === "pendente" && (
                          <button className="po-btn" disabled={atualizando} onClick={e => { e.stopPropagation(); atualizarStatus(p.id, "confirmado"); }}
                            style={{ background: "#2563eb", color: "#fff" }}>Confirmar</button>
                        )}
                        {(p.status === "pendente" || p.status === "confirmado") && (
                          <button className="po-btn" disabled={atualizando} onClick={e => { e.stopPropagation(); atualizarStatus(p.id, "preparando"); }}
                            style={{ background: "#db2777", color: "#fff" }}>Preparar</button>
                        )}
                        {p.status === "preparando" && (
                          <button className="po-btn" disabled={atualizando} onClick={e => { e.stopPropagation(); atualizarStatus(p.id, "pronto"); }}
                            style={{ background: "#15803d", color: "#fff" }}>Pronto</button>
                        )}
                        {p.status === "pronto" && (
                          <button className="po-btn" disabled={atualizando} onClick={e => { e.stopPropagation(); atualizarStatus(p.id, "entregue"); }}
                            style={{ background: "#166534", color: "#fff" }}>Entregue</button>
                        )}
                        <button className="po-btn" disabled={atualizando} onClick={e => { e.stopPropagation(); if (confirm("Cancelar este pedido?")) atualizarStatus(p.id, "cancelado"); }}
                          style={{ background: "#fee2e2", color: "#991b1b" }}>Cancelar</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}
