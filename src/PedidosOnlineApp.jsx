import { useState, useEffect, useRef } from "react";
import { api } from "./api";

const STATUS_LABELS = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  pronto: "Pronto",
  aguardando_confirmacao: "Aguardando cliente",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
const STATUS_CORES = {
  pendente:               { bg: "#fef3c7", color: "#92400e" },
  confirmado:             { bg: "#dbeafe", color: "#1e40af" },
  preparando:             { bg: "#fce7f3", color: "#9d174d" },
  pronto:                 { bg: "#dcfce7", color: "#15803d" },
  aguardando_confirmacao: { bg: "#ede9fe", color: "#5b21b6" },
  entregue:               { bg: "#f0fdf4", color: "#166534" },
  cancelado:              { bg: "#fee2e2", color: "#991b1b" },
};
const ATIVOS = ["pendente", "confirmado", "preparando", "pronto", "aguardando_confirmacao"];

const fmt = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKg = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// Peso "final" ≠ peso "desejado" indica que o lojista já pesou a peça.
const jaFoiPesado = (item) => Number(item.quantidade) !== Number(item.peso_desejado_kg);

export default function PedidosOnlineApp({ onNavegar }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("ativos");
  const [toast, setToast] = useState("");
  const [selecionado, setSelecionado] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [modalPesar, setModalPesar] = useState(null); // pedido
  const interval = useRef(null);

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 3000); };

  const carregar = async () => {
    try {
      const lista = await api.pedidos.listar();
      setPedidos(lista.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      // Se algum pedido aberto foi atualizado, sincroniza o painel de detalhes
      setSelecionado(prev => prev ? (lista.find(p => p.id === prev.id) || prev) : null);
      setModalPesar(prev => prev ? (lista.find(p => p.id === prev.id) || prev) : null);
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
      showToast(`Pedido #${id.slice(0, 6)} → ${STATUS_LABELS[status]}`);
      await carregar();
      if (status === "entregue" || status === "cancelado") setSelecionado(null);
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setAtualizando(false); }
  };

  const confirmarPesagem = async (id) => {
    setAtualizando(true);
    try {
      await api.pedidos.confirmarPesagem(id);
      showToast("✅ Cliente confirmou — pedido liberado");
      await carregar();
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setAtualizando(false); }
  };

  const recusarPesagem = async (id) => {
    const motivo = prompt("Motivo da recusa (opcional):", "");
    if (motivo === null) return;
    setAtualizando(true);
    try {
      await api.pedidos.recusarPesagem(id, motivo);
      showToast("❌ Pedido cancelado — cliente recusou");
      await carregar();
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setAtualizando(false); }
  };

  const registrarPeso = async (pedidoId, itemId, pesoKg) => {
    setAtualizando(true);
    try {
      const r = await api.pedidos.pesarItem(pedidoId, itemId, pesoKg);
      if (r._ajuste?.dentro_tolerancia) {
        const msg = r._ajuste?.eh_ajuste
          ? `⚖️ Peso corrigido — dentro da tolerância. Novo total: ${fmt(r.total)}`
          : `⚖️ Peso registrado — cliente avisado. Novo total: ${fmt(r.total)}`;
        showToast(msg);
      } else {
        showToast(`⚖️ Peso ${((r._ajuste?.diferenca_pct || 0) * 100).toFixed(0)}% fora — aguardando confirmação do cliente`, "#b45309");
      }
      await carregar();
      return r;
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); throw e; }
    finally { setAtualizando(false); }
  };

  const filtrados = pedidos.filter(p =>
    filtro === "ativos" ? ATIVOS.includes(p.status) : !ATIVOS.includes(p.status)
  );

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
        .po-modal-back { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .po-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; border: 1px solid #e7e5e4; }
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
            {filtrados.map(p => {
              const itens = p.itens || [];
              // Fluxo por peso — se algum item ainda não foi pesado (quantidade == peso_desejado)
              // e o pedido não está aguardando o cliente, precisa pesar antes de avançar.
              const itensPorPeso = itens.filter(it => it.por_peso);
              const temItemPorPesarAinda = itensPorPeso.some(it => !jaFoiPesado(it));
              const precisaPesar = temItemPorPesarAinda && (p.status === "pendente" || p.status === "confirmado");
              const aguardandoCliente = p.status === "aguardando_confirmacao";

              return (
              <div key={p.id} className="po-card" onClick={() => setSelecionado(selecionado?.id === p.id ? null : p)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>#{String(p.id).slice(0, 6)}</span>
                    {p.tipo === "mesa" && <span style={{ fontSize: 11, color: "#78716c" }}>Mesa {p.mesa_numero}</span>}
                    {p.tipo_entrega === "entrega" && <span style={{ fontSize: 11, color: "#78716c" }}>Delivery</span>}
                    {p.tipo_entrega === "retirada" && <span style={{ fontSize: 11, color: "#78716c" }}>Retirada</span>}
                    {itensPorPeso.length > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#ede9fe", color: "#5b21b6" }}>⚖️ POR PESO</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {badge(p.status)}
                    <span style={{ fontSize: 11, color: "#a8a29e" }}>{fmtData(p.created_at)} {fmtHora(p.created_at)}</span>
                  </div>
                </div>

                {p.cliente_nome && <div style={{ fontSize: 12, color: "#57534e", marginBottom: 2 }}>{p.cliente_nome} {p.cliente_telefone && `· ${p.cliente_telefone}`}</div>}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <div style={{ fontSize: 12, color: "#78716c" }}>
                    {itens.length} {itens.length === 1 ? "item" : "itens"}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#15803d" }}>{fmt(p.total)}</div>
                </div>

                {/* Detalhes expandidos */}
                {selecionado?.id === p.id && (
                  <div style={{ marginTop: 12, borderTop: "1px solid #f5f5f4", paddingTop: 12 }}>
                    {itens.map((it, i) => {
                      const porPeso = !!it.por_peso;
                      const pesado = porPeso && jaFoiPesado(it);
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: "#57534e" }}>
                          <span>
                            {porPeso ? (
                              <>
                                <b style={{ color: pesado ? "#15803d" : "#b45309" }}>{fmtKg(it.quantidade)} kg</b>
                                {" × "}{it.produto_nome}
                                {!pesado && <span style={{ color: "#b45309", marginLeft: 6 }}>· aguardando pesagem</span>}
                                {pesado && it.peso_desejado_kg && Number(it.peso_desejado_kg) !== Number(it.quantidade) && (
                                  <span style={{ color: "#a8a29e", marginLeft: 6 }}>(cliente pediu {fmtKg(it.peso_desejado_kg)} kg)</span>
                                )}
                              </>
                            ) : (
                              <>{it.quantidade}x {it.produto_nome}</>
                            )}
                          </span>
                          <span style={{ fontWeight: 600 }}>{fmt(it.preco_unitario * it.quantidade)}</span>
                        </div>
                      );
                    })}
                    {p.observacao && <div style={{ fontSize: 12, color: "#78716c", fontStyle: "italic", marginTop: 6 }}>Obs: {p.observacao}</div>}
                    {p.obs && <div style={{ fontSize: 12, color: "#78716c", fontStyle: "italic", marginTop: 6 }}>Obs: {p.obs}</div>}
                    {(p.endereco_rua || p.endereco) && (
                      <div style={{ fontSize: 12, color: "#78716c", marginTop: 4 }}>
                        Entrega: {p.endereco_rua ? `${p.endereco_rua}${p.endereco_numero ? `, ${p.endereco_numero}` : ""}${p.endereco_bairro ? ` — ${p.endereco_bairro}` : ""}` : p.endereco}
                      </div>
                    )}

                    {ATIVOS.includes(p.status) && (
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        {aguardandoCliente ? (
                          <>
                            <button className="po-btn" disabled={atualizando}
                              onClick={e => { e.stopPropagation(); confirmarPesagem(p.id); }}
                              style={{ background: "#15803d", color: "#fff" }}>✅ Cliente confirmou</button>
                            <button className="po-btn" disabled={atualizando}
                              onClick={e => { e.stopPropagation(); recusarPesagem(p.id); }}
                              style={{ background: "#b91c1c", color: "#fff" }}>❌ Cliente recusou</button>
                            <button className="po-btn" disabled={atualizando}
                              onClick={e => { e.stopPropagation(); setModalPesar(p); }}
                              style={{ background: "#fff", color: "#5b21b6", border: "1px solid #7c3aed" }}>⚖️ Ajustar peso</button>
                          </>
                        ) : precisaPesar ? (
                          <button className="po-btn" disabled={atualizando}
                            onClick={e => { e.stopPropagation(); setModalPesar(p); }}
                            style={{ background: "#7c3aed", color: "#fff" }}>⚖️ Pesar peças</button>
                        ) : (
                          <>
                            {p.status === "pendente" && (
                              <button className="po-btn" disabled={atualizando} onClick={e => { e.stopPropagation(); atualizarStatus(p.id, "confirmado"); }}
                                style={{ background: "#2563eb", color: "#fff" }}>Confirmar</button>
                            )}
                            {(p.status === "pendente" || p.status === "confirmado") && (
                              <button className="po-btn" disabled={atualizando} onClick={e => { e.stopPropagation(); atualizarStatus(p.id, "entregue"); }}
                                style={{ background: "#166534", color: "#fff" }}>✓ Entregar</button>
                            )}
                            {p.status === "preparando" && (
                              <button className="po-btn" disabled={atualizando} onClick={e => { e.stopPropagation(); atualizarStatus(p.id, "pronto"); }}
                                style={{ background: "#15803d", color: "#fff" }}>Pronto</button>
                            )}
                            {p.status === "pronto" && (
                              <button className="po-btn" disabled={atualizando} onClick={e => { e.stopPropagation(); atualizarStatus(p.id, "entregue"); }}
                                style={{ background: "#166534", color: "#fff" }}>Entregue</button>
                            )}
                            {itensPorPeso.length > 0 && (
                              <button className="po-btn" disabled={atualizando}
                                onClick={e => { e.stopPropagation(); setModalPesar(p); }}
                                style={{ background: "#fff", color: "#5b21b6", border: "1px solid #7c3aed" }}>✏️ Ajustar peso</button>
                            )}
                          </>
                        )}
                        {!aguardandoCliente && (
                          <button className="po-btn" disabled={atualizando} onClick={e => { e.stopPropagation(); if (confirm("Cancelar este pedido?")) atualizarStatus(p.id, "cancelado"); }}
                            style={{ background: "#fee2e2", color: "#991b1b" }}>Cancelar</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {modalPesar && (
        <ModalPesarPecas
          pedido={pedidos.find(p => p.id === modalPesar.id) || modalPesar}
          atualizando={atualizando}
          onRegistrarPeso={registrarPeso}
          onEntregar={() => atualizarStatus(modalPesar.id, "entregue").then(() => setModalPesar(null))}
          onClose={() => setModalPesar(null)}
        />
      )}

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}

// ─── Modal de pesagem ────────────────────────────────────────────────────────
// Um input por item por_peso. Registro individual (chama API) — o backend decide
// tolerância. No fim, se tudo pesado e nada travou, botão "Entregar" fecha.
function ModalPesarPecas({ pedido, atualizando, onRegistrarPeso, onEntregar, onClose }) {
  const itensPorPeso = (pedido.itens || []).filter(it => it.por_peso);
  const [pesos, setPesos] = useState(() => {
    // Pré-preenche: se já foi pesado antes, mostra o último peso registrado
    // (pra facilitar corrigir); senão, o peso que o cliente pediu.
    const o = {};
    for (const it of itensPorPeso) {
      const foiPesado = jaFoiPesado(it);
      o[it.id] = String(Number(foiPesado ? it.quantidade : (it.peso_desejado_kg || it.quantidade || 0)));
    }
    return o;
  });
  const [enviando, setEnviando] = useState({});

  const registrar = async (item) => {
    const kg = parseFloat(String(pesos[item.id] || "").replace(",", "."));
    if (!kg || kg <= 0) return;
    setEnviando(s => ({ ...s, [item.id]: true }));
    try { await onRegistrarPeso(pedido.id, item.id, kg); }
    catch { /* toast do handler pai */ }
    finally { setEnviando(s => ({ ...s, [item.id]: false })); }
  };

  const todosPesados = itensPorPeso.every(jaFoiPesado);
  const podeEntregar = todosPesados && pedido.status !== "aguardando_confirmacao";

  return (
    <div className="po-modal-back" onClick={onClose}>
      <div className="po-modal" onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #f5f5f4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1c1917" }}>⚖️ Pesar peças</div>
            <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>Pedido #{String(pedido.id).slice(0, 6)} · {pedido.cliente_nome || "—"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #e7e5e4", color: "#78716c", borderRadius: 8, width: 32, height: 32, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: "10px 20px 6px", fontSize: 12.5, color: "#57534e", lineHeight: 1.55 }}>
          Coloque a peça na balança, digite o peso real (em kg) e clique <b>Registrar</b>. Se ficar até <b>20% acima ou abaixo</b> do que o cliente pediu, o pedido segue com um aviso via WhatsApp. Se ficar fora disso, o pedido trava esperando o cliente aprovar. Pesou errado ou o cliente trocou de peça? É só digitar o novo peso e registrar de novo.
        </div>

        <div style={{ padding: "10px 20px" }}>
          {itensPorPeso.map(item => {
            const pesado = jaFoiPesado(item);
            return (
              <div key={item.id} style={{ padding: "14px 0", borderBottom: "1px solid #f5f5f4" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "#1c1917" }}>{item.produto_nome}</div>
                <div style={{ fontSize: 12, color: "#78716c", marginBottom: 10 }}>
                  Cliente pediu: <b style={{ color: "#1c1917" }}>{fmtKg(item.peso_desejado_kg)} kg</b>
                  {pesado && <> · Pesado agora: <b style={{ color: "#15803d" }}>{fmtKg(item.quantidade)} kg</b> ({fmt(item.preco_unitario * item.quantidade)})</>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="text" inputMode="decimal" autoFocus={!pesado}
                    value={pesos[item.id] || ""}
                    onChange={e => setPesos(s => ({ ...s, [item.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                    onKeyDown={e => e.key === "Enter" && registrar(item)}
                    style={{ flex: 1, padding: "12px 14px", background: "#fafaf9", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 18, fontWeight: 800, color: "#1c1917", textAlign: "right", outline: "none", fontFamily: "inherit" }}
                  />
                  <span style={{ fontSize: 13, color: "#78716c", fontWeight: 700 }}>kg</span>
                  <button className="po-btn" onClick={() => registrar(item)} disabled={!!enviando[item.id]}
                    style={{ background: pesado ? "#e7e5e4" : "#7c3aed", color: pesado ? "#44403c" : "#fff", padding: "12px 18px" }}>
                    {enviando[item.id] ? "..." : pesado ? "Corrigir" : "Registrar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 20px 18px", borderTop: "1px solid #f5f5f4", display: "flex", gap: 10 }}>
          <button className="po-btn" onClick={onClose}
            style={{ flex: 1, background: "#f5f5f4", color: "#57534e" }}>
            Fechar
          </button>
          {podeEntregar && (
            <button className="po-btn" onClick={onEntregar} disabled={atualizando}
              style={{ flex: 2, background: "#166534", color: "#fff" }}>
              ✓ Entregar pedido
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
