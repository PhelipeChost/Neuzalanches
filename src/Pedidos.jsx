import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";

const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lbl = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };
const inp = { width: "100%", padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917", background: "#fff" };

const STATUS_PIPELINE = ["pendente", "confirmado", "preparando", "pronto", "entregue"];
const STATUS_LABELS = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
const STATUS_CORES = {
  pendente: { bg: "#fefce8", color: "#ca8a04", border: "#fde68a" },
  confirmado: { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  preparando: { bg: "#fef3c7", color: "#d97706", border: "#fde68a" },
  pronto: { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  entregue: { bg: "#dcfce7", color: "#15803d", border: "#86efac" },
  cancelado: { bg: "#fee2e2", color: "#dc2626", border: "#fecaca" },
};

function StatusPipeline({ status }) {
  const idx = STATUS_PIPELINE.indexOf(status);
  if (status === "cancelado") {
    return <span style={{ background: STATUS_CORES.cancelado.bg, color: STATUS_CORES.cancelado.color, border: `1px solid ${STATUS_CORES.cancelado.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>CANCELADO</span>;
  }
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {STATUS_PIPELINE.map((s, i) => {
        const ativo = i <= idx;
        const cor = ativo ? STATUS_CORES[status] : { bg: "#f5f5f4", color: "#d6d3d1" };
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: cor.bg, border: `2px solid ${ativo ? cor.color : "#e7e5e4"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: cor.color }}>
              {i < idx ? "✓" : i + 1}
            </div>
            {i < STATUS_PIPELINE.length - 1 && (
              <div style={{ width: 16, height: 2, background: i < idx ? cor.color : "#e7e5e4", borderRadius: 1 }} />
            )}
          </div>
        );
      })}
      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: STATUS_CORES[status].color }}>{STATUS_LABELS[status]}</span>
    </div>
  );
}

// ─── MODAL PEDIDO MANUAL ──────────────────────────────────────────────────────
function ModalPedidoManual({ produtos, categorias, adicionaisDisponiveis, onSave, onClose }) {
  const [clienteNome, setClienteNome] = useState("");
  const [obs, setObs] = useState("");
  const [itens, setItens] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [modalAdItem, setModalAdItem] = useState(null); // produto para selecionar adicionais

  // Mapa: nome da categoria -> permite_adicionais
  const catPermiteAdicionais = {};
  categorias.forEach(c => { catPermiteAdicionais[c.nome] = !!c.permite_adicionais; });

  let uidCounter = useRef(0);
  const nextUid = () => `_manual_${Date.now()}_${++uidCounter.current}`;

  const handleClickProduto = (produto) => {
    if (catPermiteAdicionais[produto.categoria] && adicionaisDisponiveis.length > 0) {
      setModalAdItem(produto);
    } else {
      addItem(produto, []);
    }
  };

  const addItem = (produto, adicionaisSel) => {
    const adKey = adicionaisSel.map(a => `${a.id}:${a.quantidade || 1}`).sort().join(",");
    const existente = itens.find(i => i.produto_id === produto.id && (i._adKey || "") === adKey);
    if (existente) {
      setItens(itens.map(i => i._uid === existente._uid ? { ...i, quantidade: i.quantidade + 1 } : i));
    } else {
      setItens([...itens, {
        _uid: nextUid(),
        _adKey: adKey,
        produto_id: produto.id,
        produto_nome: produto.nome,
        preco_unitario: produto.preco,
        quantidade: 1,
        adicionais: adicionaisSel,
      }]);
    }
  };

  const removeItem = (uid) => {
    setItens(itens.filter(i => i._uid !== uid));
  };

  const updateQtd = (uid, qtd) => {
    if (qtd < 1) return removeItem(uid);
    setItens(itens.map(i => i._uid === uid ? { ...i, quantidade: qtd } : i));
  };

  const calcItemTotal = (item) => {
    const adTotal = (item.adicionais || []).reduce((s, a) => s + a.preco * (a.quantidade || 1), 0);
    return (item.preco_unitario + adTotal) * item.quantidade;
  };

  const total = itens.reduce((s, i) => s + calcItemTotal(i), 0);

  const salvar = async () => {
    if (itens.length === 0) return;
    setSalvando(true);
    try {
      const itensLimpos = itens.map(({ _uid, _adKey, ...rest }) => rest);
      await onSave({ itens: itensLimpos, obs, cliente_nome: clienteNome || "Pedido presencial", tipo: "presencial" });
      onClose();
    } catch {
      setSalvando(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", width: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600 }}>Pedido Manual (Presencial)</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>x</button>
        </div>

        <div>
          <label style={lbl}>Nome do cliente (opcional)</label>
          <input style={inp} value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Ex: Joao Silva" />
        </div>

        {/* Lista de produtos */}
        <div style={{ marginTop: 16 }}>
          <label style={lbl}>ADICIONAR PRODUTOS</label>
          <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e7e5e4", borderRadius: 8, padding: 4 }}>
            {produtos.filter(p => p.disponivel).length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "#a8a29e", fontSize: 12 }}>Nenhum produto disponivel</div>
            ) : produtos.filter(p => p.disponivel).map(p => (
              <div key={p.id} onClick={() => handleClickProduto(p)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", cursor: "pointer", borderRadius: 6, transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f0fdf4"}
                onMouseLeave={e => e.currentTarget.style.background = ""}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.nome}</div>
                  <span style={{ fontSize: 10, color: "#a8a29e" }}>
                    {p.categoria}
                    {catPermiteAdicionais[p.categoria] && adicionaisDisponiveis.length > 0 ? " · com adicionais" : ""}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>{fmt(p.preco)}</span>
                  <span style={{ background: "#15803d", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>+</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Itens selecionados */}
        {itens.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <label style={lbl}>ITENS DO PEDIDO</label>
            {itens.map(item => (
              <div key={item._uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f4" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{item.produto_nome}</div>
                  {item.adicionais && item.adicionais.length > 0 && (
                    <div style={{ marginTop: 2 }}>
                      {item.adicionais.map(a => (
                        <span key={a.id} style={{ display: "inline-block", background: "#f0fdf4", color: "#15803d", fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, marginRight: 3 }}>
                          {(a.quantidade || 1) > 1 ? `${a.quantidade}x ` : "+ "}{a.nome} ({fmt(a.preco * (a.quantidade || 1))})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => updateQtd(item._uid, item.quantidade - 1)} style={{ width: 24, height: 24, border: "1px solid #e7e5e4", borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>-</button>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: "center" }}>{item.quantidade}</span>
                  <button onClick={() => updateQtd(item._uid, item.quantidade + 1)} style={{ width: 24, height: 24, border: "1px solid #e7e5e4", borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>+</button>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#15803d", minWidth: 80, textAlign: "right" }}>{fmt(calcItemTotal(item))}</span>
                  <button onClick={() => removeItem(item._uid)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 14 }}>x</button>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "2px solid #e7e5e4" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#15803d" }}>{fmt(total)}</span>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <label style={lbl}>Observacao (opcional)</label>
          <input style={inp} value={obs} onChange={e => setObs(e.target.value)} placeholder="Notas sobre o pedido..." />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || itens.length === 0} style={{ flex: 2, padding: 11, background: "#F38C24", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: (salvando || itens.length === 0) ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: (salvando || itens.length === 0) ? 0.5 : 1 }}>
            {salvando ? "Registrando..." : `Registrar pedido — ${fmt(total)}`}
          </button>
        </div>

        {/* Mini-modal de adicionais dentro do pedido manual */}
        {modalAdItem && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setModalAdItem(null)}>
            <ModalAdicionaisInline
              produto={modalAdItem}
              adicionais={adicionaisDisponiveis}
              onConfirm={(sel) => { addItem(modalAdItem, sel); setModalAdItem(null); }}
              onClose={() => setModalAdItem(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MINI MODAL ADICIONAIS (reutilizavel) ────────────────────────────────────
function ModalAdicionaisInline({ produto, adicionais, onConfirm, onClose }) {
  const [selecionados, setSelecionados] = useState([]);

  const updateQtdAd = (ad, delta) => {
    setSelecionados(prev => {
      const existing = prev.find(s => s.id === ad.id);
      if (existing) {
        const newQtd = existing.quantidade + delta;
        if (newQtd <= 0) return prev.filter(s => s.id !== ad.id);
        return prev.map(s => s.id === ad.id ? { ...s, quantidade: newQtd } : s);
      } else if (delta > 0) {
        return [...prev, { id: ad.id, nome: ad.nome, preco: ad.preco, quantidade: 1 }];
      }
      return prev;
    });
  };

  const totalAdicionais = selecionados.reduce((s, a) => s + a.preco * a.quantidade, 0);
  const totalItem = produto.preco + totalAdicionais;

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "22px 24px", width: 380, boxShadow: "0 15px 50px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{produto.nome}</div>
      <div style={{ fontSize: 13, color: "#15803d", fontWeight: 500, marginBottom: 14 }}>{fmt(produto.preco)}</div>

      <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c", marginBottom: 8, letterSpacing: "0.06em" }}>ADICIONAIS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
        {adicionais.map(ad => {
          const sel = selecionados.find(s => s.id === ad.id);
          const qtd = sel ? sel.quantidade : 0;
          return (
            <div key={ad.id} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
              background: qtd > 0 ? "#f0fdf4" : "#fafaf9", border: `1px solid ${qtd > 0 ? "#86efac" : "#e7e5e4"}`,
              borderRadius: 8, fontSize: 12
            }}>
              <span style={{ flex: 1, fontWeight: 500 }}>{ad.nome}</span>
              <span style={{ fontWeight: 600, color: "#15803d" }}>+ {fmt(ad.preco)}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={() => updateQtdAd(ad, -1)} disabled={qtd === 0}
                  style={{ width: 22, height: 22, border: "1px solid #e7e5e4", borderRadius: 4, background: "#fff", cursor: qtd > 0 ? "pointer" : "default", fontSize: 12, lineHeight: 1, color: qtd > 0 ? "#1c1917" : "#d6d3d1" }}>-</button>
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 18, textAlign: "center" }}>{qtd}</span>
                <button onClick={() => updateQtdAd(ad, 1)}
                  style={{ width: 22, height: 22, border: "1px solid #e7e5e4", borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1.5px solid #e7e5e4", paddingTop: 12 }}>
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: "#15803d" }}>{fmt(totalItem)}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onClose} style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e7e5e4", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
          <button onClick={() => onConfirm(selecionados)} style={{ padding: "7px 14px", background: "#15803d", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>Adicionar</button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function Pedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [adicionaisDisponiveis, setAdicionaisDisponiveis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalManual, setModalManual] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [toast, setToast] = useState("");
  const [expandido, setExpandido] = useState(null);
  const prevCountRef = useRef(0);
  const audioRef = useRef(null);

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  const carregar = useCallback(async () => {
    try {
      const [peds, prods, cats, adds] = await Promise.all([
        api.pedidos.listar(),
        api.produtos.listar(),
        api.categorias.listar(),
        api.adicionais.listar(),
      ]);
      const pendentes = peds.filter(p => p.status === "pendente").length;
      if (prevCountRef.current > 0 && pendentes > prevCountRef.current) {
        try {
          if (!audioRef.current) {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            gain.gain.value = 0.15;
            osc.start();
            setTimeout(() => { osc.frequency.value = 1000; }, 100);
            setTimeout(() => { osc.stop(); ctx.close(); }, 250);
          }
        } catch { /* ignore audio errors */ }
      }
      prevCountRef.current = pendentes;
      setPedidos(peds);
      setProdutos(prods);
      setCategorias(cats);
      setAdicionaisDisponiveis(adds.filter(a => a.disponivel));
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const interval = setInterval(carregar, 10000);
    return () => clearInterval(interval);
  }, [carregar]);

  const criarPedidoManual = async (data) => {
    try {
      const novo = await api.pedidos.criar(data);
      setPedidos(ps => [novo, ...ps]);
      showToast("Pedido registrado!");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
      throw err;
    }
  };

  const atualizarStatus = async (id, novoStatus) => {
    try {
      const atualizado = await api.pedidos.atualizarStatus(id, novoStatus);
      setPedidos(ps => ps.map(p => p.id === id ? atualizado : p));
      if (novoStatus === "entregue") {
        showToast("Pedido entregue! Entrada registrada no fluxo de caixa.", "#15803d");
      } else if (novoStatus === "cancelado") {
        showToast("Pedido cancelado.", "#dc2626");
      } else {
        showToast(`Status atualizado para: ${STATUS_LABELS[novoStatus]}`);
      }
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    }
  };

  const proximoStatus = (statusAtual) => {
    const idx = STATUS_PIPELINE.indexOf(statusAtual);
    return idx >= 0 && idx < STATUS_PIPELINE.length - 1 ? STATUS_PIPELINE[idx + 1] : null;
  };

  const filtrados = pedidos.filter(p => filtroStatus === "todos" || p.status === filtroStatus);
  const pendentesCount = pedidos.filter(p => p.status === "pendente").length;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando pedidos...</div>;

  return (
    <div className="anim">
      {pendentesCount > 0 && (
        <div style={{ background: "#fefce8", border: "1.5px solid #fde68a", borderRadius: 12, padding: "14px 18px", display: "flex", gap: 12, alignItems: "center", marginBottom: 16, animation: "fi 0.3s ease" }}>
          <div style={{ width: 36, height: 36, background: "#fef3c7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🔔</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#92400e" }}>
              {pendentesCount} {pendentesCount === 1 ? "pedido pendente" : "pedidos pendentes"}!
            </div>
            <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>Novos pedidos aguardando confirmacao</div>
          </div>
          <button onClick={() => setFiltroStatus("pendente")} style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#92400e" }}>
            Ver pendentes
          </button>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 500 }}>Pedidos</div>
          <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 2 }}>{pedidos.length} pedidos no total</div>
        </div>
        <button className="btn-add" onClick={() => setModalManual(true)} style={{ background: "#F38C24" }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Pedido manual
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[["todos", "Todos"], ...Object.entries(STATUS_LABELS)].map(([k, v]) => (
          <button key={k} className={`fil ${filtroStatus === k ? "ativo" : ""}`} onClick={() => setFiltroStatus(k)}
            style={filtroStatus === k && k !== "todos" ? { borderColor: STATUS_CORES[k]?.color, color: STATUS_CORES[k]?.color, background: STATUS_CORES[k]?.bg } : undefined}>
            {v}
            {k === "pendente" && pendentesCount > 0 && (
              <span style={{ marginLeft: 4, background: "#dc2626", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{pendentesCount}</span>
            )}
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
          Nenhum pedido {filtroStatus !== "todos" ? `com status "${STATUS_LABELS[filtroStatus]}"` : "encontrado"}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtrados.map(p => {
            const aberto = expandido === p.id;
            const proximo = proximoStatus(p.status);
            const isTerminal = p.status === "entregue" || p.status === "cancelado";
            return (
              <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }} onClick={() => setExpandido(aberto ? null : p.id)}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_CORES[p.status].color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>#{p.id.slice(0, 6)}</span>
                      <span style={{ fontSize: 11, color: "#a8a29e" }}>.</span>
                      <span style={{ fontSize: 12, color: "#57534e" }}>{p.cliente_nome || "Sem nome"}</span>
                      {p.cliente_telefone && <span style={{ fontSize: 11, color: "#78716c" }}>({p.cliente_telefone})</span>}
                      <span style={{ background: p.tipo === "online" ? "#eff6ff" : "#f5f5f4", color: p.tipo === "online" ? "#2563eb" : "#78716c", padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                        {p.tipo === "online" ? "ONLINE" : "PRESENCIAL"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#a8a29e" }}>
                      {new Date(p.created_at).toLocaleString("pt-BR")} . {p.itens?.length || 0} {p.itens?.length === 1 ? "item" : "itens"}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 600, color: "#1c1917", marginRight: 12 }}>{fmt(p.total)}</div>
                  <span style={{ fontSize: 14, color: "#a8a29e", transform: aberto ? "rotate(180deg)" : "", transition: "transform 0.2s" }}>▼</span>
                </div>

                {aberto && (
                  <div style={{ padding: "0 18px 18px", borderTop: "1px solid #f5f5f4" }}>
                    <div style={{ padding: "14px 0" }}>
                      <StatusPipeline status={p.status} />
                    </div>

                    <div style={{ background: "#fafaf9", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                      {p.itens?.map((item, i) => {
                        const adTotal = (item.adicionais || []).reduce((s, a) => s + a.preco * (a.quantidade || 1), 0);
                        const itemTotal = (item.preco_unitario + adTotal) * item.quantidade;
                        return (
                          <div key={i} style={{ padding: "6px 0", borderBottom: i < p.itens.length - 1 ? "1px solid #f5f5f4" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                              <span>{item.quantidade}x {item.produto_nome}</span>
                              <span style={{ fontWeight: 500 }}>{fmt(itemTotal)}</span>
                            </div>
                            {item.adicionais && item.adicionais.length > 0 && (
                              <div style={{ marginTop: 3 }}>
                                {item.adicionais.map(a => (
                                  <span key={a.id || a.nome} style={{ display: "inline-block", background: "#f0fdf4", color: "#15803d", fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, marginRight: 3 }}>
                                    {(a.quantidade || 1) > 1 ? `${a.quantidade}x ` : "+ "}{a.nome} ({fmt(a.preco * (a.quantidade || 1))})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {p.obs && <div style={{ fontSize: 12, color: "#78716c", marginBottom: 12 }}>Obs: {p.obs}</div>}

                    {/* Endereço de entrega */}
                    {p.endereco_rua && (
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", marginBottom: 4, letterSpacing: "0.06em" }}>ENDEREÇO DE ENTREGA</div>
                        <div style={{ fontSize: 13, color: "#1c1917" }}>
                          {p.endereco_rua}{p.endereco_numero ? `, ${p.endereco_numero}` : ""}
                        </div>
                        <div style={{ fontSize: 12, color: "#57534e" }}>
                          {p.endereco_bairro}{p.endereco_cep ? ` — CEP: ${p.endereco_cep}` : ""}
                        </div>
                        {p.endereco_referencia && (
                          <div style={{ fontSize: 12, color: "#78716c", marginTop: 4, fontStyle: "italic" }}>
                            Ref: {p.endereco_referencia}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Método de pagamento */}
                    {p.metodo_pagamento && (
                      <div style={{ display: "inline-block", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 12 }}>
                        {p.metodo_pagamento === "pix" ? "⚡ Pix" : p.metodo_pagamento === "credito" ? "💳 Cartão de Crédito" : p.metodo_pagamento === "debito" ? "💳 Cartão de Débito" : p.metodo_pagamento}
                      </div>
                    )}

                    {!isTerminal && (
                      <div style={{ display: "flex", gap: 8 }}>
                        {proximo && (
                          <button onClick={() => atualizarStatus(p.id, proximo)}
                            style={{ flex: 1, padding: 10, background: STATUS_CORES[proximo].color, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>
                            Avancar para → {STATUS_LABELS[proximo]}
                          </button>
                        )}
                        <button onClick={() => atualizarStatus(p.id, "cancelado")}
                          style={{ padding: "10px 16px", background: "#fff", border: "1.5px solid #fecaca", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#dc2626" }}>
                          Cancelar
                        </button>
                      </div>
                    )}
                    {p.status === "entregue" && (
                      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#15803d", fontWeight: 500 }}>
                        Pedido entregue — Entrada de {fmt(p.total)} registrada automaticamente no fluxo de caixa
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalManual && <ModalPedidoManual produtos={produtos} categorias={categorias} adicionaisDisponiveis={adicionaisDisponiveis} onSave={criarPedidoManual} onClose={() => setModalManual(false)} />}

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}
