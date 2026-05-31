import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lbl = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };
const inpLight = { width: "100%", padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917", background: "#fff" };
const parseDateUTC = (str) => {
  if (!str) return new Date(NaN);
  if (str instanceof Date) return str;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str);
  return new Date(str.replace(" ", "T") + "Z");
};
const fmtHora = (iso) => {
  if (!iso) return "";
  const d = parseDateUTC(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const tempoDesde = (iso) => {
  if (!iso) return "";
  const diff = Date.now() - parseDateUTC(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
};

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const TIPO_CFG = {
  mesa:     { icon: "\u{1FA91}", color: "#F59E0B", bg: "#2A1A0A", label: "Mesas na cozinha" },
  delivery: { icon: "\u{1F6F5}", color: "#60A5FA", bg: "#172554", label: "Delivery ativos" },
  retirada: { icon: "\u{1F3EA}", color: "#84CC16", bg: "#1A2E05", label: "Retiradas ativas" },
  casa:     { icon: "\u{1F37D}️", color: "#C084FC", bg: "#2E1065", label: "No local ativos" },
};

const STATUS_PIPELINE = ["pendente", "confirmado", "preparando", "pronto", "entregue"];
const STATUS_LABELS = {
  pendente: "Pendente", confirmado: "Confirmado", preparando: "Preparando",
  pronto: "Pronto", entregue: "Entregue", cancelado: "Cancelado",
};
const STATUS_CORES = {
  pendente:   { bg: "#332B00", color: "#FBBF24", border: "#854D0E" },
  confirmado: { bg: "#172554", color: "#60A5FA", border: "#1E40AF" },
  preparando: { bg: "#2A1A0A", color: "#F59E0B", border: "#B45309" },
  pronto:     { bg: "#052E16", color: "#4ADE80", border: "#15803D" },
  entregue:   { bg: "#0A2E1A", color: "#22C55E", border: "#16A34A" },
  cancelado:  { bg: "#350A0A", color: "#F87171", border: "#DC2626" },
};

// ─── STATUS PIPELINE COMPONENT (dark) ────────────────────────────────────────
function StatusPipelineDark({ status }) {
  const idx = STATUS_PIPELINE.indexOf(status);
  if (status === "cancelado") {
    return <span style={{ background: STATUS_CORES.cancelado.bg, color: STATUS_CORES.cancelado.color, border: `1px solid ${STATUS_CORES.cancelado.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>CANCELADO</span>;
  }
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      {STATUS_PIPELINE.map((s, i) => {
        const ativo = i <= idx;
        const cor = ativo ? STATUS_CORES[status] : { bg: "#1A1A1A", color: "#555", border: "#333" };
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: cor.bg, border: `2px solid ${ativo ? cor.color : "#333"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: cor.color }}>
              {i < idx ? "✓" : i + 1}
            </div>
            {i < STATUS_PIPELINE.length - 1 && (
              <div style={{ width: 16, height: 2, background: i < idx ? cor.color : "#333", borderRadius: 1 }} />
            )}
          </div>
        );
      })}
      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: (STATUS_CORES[status] || {}).color || "#777" }}>{STATUS_LABELS[status]}</span>
    </div>
  );
}

// ─── MODAL ADICIONAIS (light, for overlay) ──────────────────────────────────
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
      <div style={{ fontSize: 15, fontWeight: 600, color: "#1c1917", marginBottom: 4 }}>{produto.nome}</div>
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
              borderRadius: 8, fontSize: 12, color: "#1c1917"
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
        <span style={{ fontSize: 18, fontWeight: 600, color: "#15803d" }}>{fmt(totalItem)}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onClose} style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e7e5e4", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>Cancelar</button>
          <button onClick={() => onConfirm(selecionados)} style={{ padding: "7px 14px", background: "#15803d", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>Adicionar</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL PEDIDO MANUAL (light, for overlay) ──────────────────────────────
function ModalPedidoManual({ produtos, categorias, adicionaisDisponiveis, onSave, onClose }) {
  const [clienteNome, setClienteNome] = useState("");
  const [obs, setObs] = useState("");
  const [itens, setItens] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [modalAdItem, setModalAdItem] = useState(null);
  const [registrados, setRegistrados] = useState(0); // T11: contador de lançamentos na sessão

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

  const removeItem = (uid) => setItens(itens.filter(i => i._uid !== uid));
  const updateQtd = (uid, qtd) => {
    if (qtd < 1) return removeItem(uid);
    setItens(itens.map(i => i._uid === uid ? { ...i, quantidade: qtd } : i));
  };

  const calcItemTotal = (item) => {
    const adTotal = (item.adicionais || []).reduce((s, a) => s + a.preco * (a.quantidade || 1), 0);
    return (item.preco_unitario + adTotal) * item.quantidade;
  };

  const total = itens.reduce((s, i) => s + calcItemTotal(i), 0);

  const salvar = async (continuar = false) => {
    if (itens.length === 0) return;
    setSalvando(true);
    try {
      const itensLimpos = itens.map(({ _uid, _adKey, ...rest }) => rest);
      await onSave({ itens: itensLimpos, obs, cliente_nome: clienteNome || "Pedido presencial", tipo: "presencial" });
      if (continuar) {
        // T11: lançamento rápido — limpa o form e mantém o modal aberto para o próximo
        setItens([]); setObs(""); setClienteNome("");
        setRegistrados(n => n + 1);
        setSalvando(false);
      } else {
        onClose();
      }
    } catch { setSalvando(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", width: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", color: "#1c1917" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600 }}>Pedido Manual (Presencial)</div>
            {registrados > 0 && (
              <span style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                {registrados} lançado{registrados > 1 ? "s" : ""} nesta sessão
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>×</button>
        </div>

        <div>
          <label style={lbl}>Nome do cliente (opcional)</label>
          <input style={inpLight} value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Ex: João Silva" />
        </div>

        {/* Lista de produtos */}
        <div style={{ marginTop: 16 }}>
          <label style={lbl}>ADICIONAR PRODUTOS</label>
          <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e7e5e4", borderRadius: 8, padding: 4 }}>
            {produtos.filter(p => p.disponivel).length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "#a8a29e", fontSize: 12 }}>Nenhum produto disponível</div>
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
                  <button onClick={() => removeItem(item._uid)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 14 }}>×</button>
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
          <label style={lbl}>Observação (opcional)</label>
          <input style={inpLight} value={obs} onChange={e => setObs(e.target.value)} placeholder="Notas sobre o pedido..." />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>{registrados > 0 ? "Concluir" : "Cancelar"}</button>
          <button onClick={() => salvar(true)} disabled={salvando || itens.length === 0} title="Registra e mantém aberto para o próximo (lançamento rápido)" style={{ flex: 1.4, padding: 11, background: "#fff", border: "1.5px solid #15803d", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: (salvando || itens.length === 0) ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#15803d", opacity: (salvando || itens.length === 0) ? 0.5 : 1 }}>
            {salvando ? "..." : "+ Registrar e novo"}
          </button>
          <button onClick={() => salvar(false)} disabled={salvando || itens.length === 0} style={{ flex: 2, padding: 11, background: "#15803d", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: (salvando || itens.length === 0) ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: (salvando || itens.length === 0) ? 0.5 : 1 }}>
            {salvando ? "Registrando..." : `Registrar — ${fmt(total)}`}
          </button>
        </div>

        {/* Mini-modal de adicionais */}
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

// ─── RELÓGIO ISOLADO (T2: evita re-render da grade inteira a cada 1s) ─────────
function RelogioCozinha() {
  const hora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const [agora, setAgora] = useState(hora);
  useEffect(() => {
    const iv = setInterval(() => setAgora(hora()), 1000);
    return () => clearInterval(iv);
  }, []);
  return <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 14, color: "#555", fontWeight: 500 }}>{agora}</span>;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function CozinhaApp({ onNavegar }) {
  const [pedidos, setPedidos] = useState([]);
  const [gruposMesa, setGruposMesa] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [marcando, setMarcando] = useState({});
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroMes, setFiltroMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [expandido, setExpandido] = useState(null);
  const [modo, setModo] = useState("fila"); // "fila" = active queue, "historico" = all orders
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [adicionaisDisponiveis, setAdicionaisDisponiveis] = useState([]);
  const [modalManual, setModalManual] = useState(false);

  // ─── SOM & NOTIFICACOES ──────────────────────────────────────────────────
  const [somAtivo, setSomAtivo] = useState(() => {
    const v = localStorage.getItem("nl_coz_som");
    return v === null ? true : v === "1";
  });
  const [repetirSom, setRepetirSom] = useState(() => {
    const v = localStorage.getItem("nl_coz_repetir");
    return v === null ? true : v === "1";
  });
  const [audioDesbloqueado, setAudioDesbloqueado] = useState(false);
  const prevPendRef = useRef(0);
  const audioCtxRef = useRef(null);
  const somAtivoRef = useRef(somAtivo);
  const repetirRef = useRef(repetirSom);

  useEffect(() => { somAtivoRef.current = somAtivo; localStorage.setItem("nl_coz_som", somAtivo ? "1" : "0"); }, [somAtivo]);
  useEffect(() => { repetirRef.current = repetirSom; localStorage.setItem("nl_coz_repetir", repetirSom ? "1" : "0"); }, [repetirSom]);


  // Desbloqueia AudioContext no primeiro clique
  useEffect(() => {
    const unlock = () => {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
        setAudioDesbloqueado(true);
      } catch {}
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("click", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  const tocarSom = useCallback(() => {
    if (!somAtivoRef.current) return;
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume();
      const tones = [
        { freq: 880, start: 0, dur: 0.18 },
        { freq: 1109, start: 0.10, dur: 0.20 },
        { freq: 1319, start: 0.20, dur: 0.30 },
      ];
      const now = ctx.currentTime;
      tones.forEach(t => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = t.freq;
        gain.gain.setValueAtTime(0, now + t.start);
        gain.gain.linearRampToValueAtTime(0.25, now + t.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + t.start);
        osc.stop(now + t.start + t.dur + 0.05);
      });
    } catch {}
  }, []);

  const notificarNavegador = useCallback((qtd) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification("\u{1F514} Novo pedido na cozinha!", {
        body: qtd === 1 ? "1 pedido pendente." : `${qtd} pedidos pendentes.`,
        icon: "/favicon.ico",
        tag: "cozinha-pedido",
      });
    } catch {}
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // ─── CARREGAR DADOS ──────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    try {
      const [peds, fila, prods, cats, ads] = await Promise.all([
        api.pedidos.listar(),
        api.cozinha.filaUnificada(),
        api.produtos.listar(),
        api.categorias.listar(),
        api.adicionais.listar(),
      ]);
      setProdutos(prods);
      setCategorias(cats);
      setAdicionaisDisponiveis(ads);
      const pendentes = peds.filter(p => p.status === "pendente").length;
      const mesaItens = fila.filter(g => g.tipo === "mesa").reduce((s, g) => s + g.itens.length, 0);
      const totalNovo = pendentes + mesaItens;
      if (totalNovo > prevPendRef.current && prevPendRef.current >= 0) {
        tocarSom();
        notificarNavegador(pendentes);
      } else if (prevPendRef.current === 0 && totalNovo > 0) {
        tocarSom();
        notificarNavegador(pendentes);
      }
      prevPendRef.current = totalNovo;
      setPedidos(peds);
      setGruposMesa(fila.filter(g => g.tipo === "mesa"));
    } catch {} finally { setLoading(false); }
  }, [tocarSom, notificarNavegador]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const iv = setInterval(carregar, 8000);
    return () => clearInterval(iv);
  }, [carregar]);

  // Repetir som enquanto tiver pendentes
  const pendentesAtual = pedidos.filter(p => p.status === "pendente").length;
  useEffect(() => {
    if (!somAtivo || !repetirSom || pendentesAtual === 0) return;
    const iv = setInterval(tocarSom, 8000);
    return () => clearInterval(iv);
  }, [somAtivo, repetirSom, pendentesAtual, tocarSom]);

  const toggleSom = () => {
    const novo = !somAtivo;
    setSomAtivo(novo);
    if (novo) {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
      setTimeout(tocarSom, 100);
    }
  };

  // ─── PEDIDO MANUAL & EXCLUIR ──────────────────────────────────────────────
  const criarPedidoManual = async (dados) => {
    await api.pedidos.criar(dados);
    showToast("✅ Pedido manual registrado!");
    await carregar();
  };

  const excluirPedido = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este pedido permanentemente?")) return;
    try {
      await api.pedidos.excluir(id);
      setPedidos(ps => ps.filter(p => p.id !== id));
      setExpandido(null);
      showToast("🗑️ Pedido excluído");
    } catch { showToast("Erro ao excluir pedido"); }
  };

  // ─── STATUS MANAGEMENT ───────────────────────────────────────────────────
  const atualizarStatusPedido = async (id, novoStatus) => {
    setMarcando(m => ({ ...m, [id]: true }));
    try {
      const atualizado = await api.pedidos.atualizarStatus(id, novoStatus);
      setPedidos(ps => ps.map(p => p.id === id ? atualizado : p));
      if (novoStatus === "entregue") showToast("✅ Pedido entregue!");
      else if (novoStatus === "cancelado") showToast("❌ Pedido cancelado.");
      else showToast(`Status → ${STATUS_LABELS[novoStatus]}`);
    } catch {} finally { setMarcando(m => ({ ...m, [id]: false })); }
  };

  const handleGrupoStatus = async (grupo, novoStatus) => {
    setMarcando(m => ({ ...m, [grupo.grupo_id]: true }));
    try {
      await api.cozinha.atualizarStatus(grupo.grupo_id, novoStatus);
      showToast(novoStatus === "preparando" ? `\u{1F525} ${grupo.label} em preparo!` : `✓ ${grupo.label} pronto!`);
      await carregar();
    } catch {} finally { setMarcando(m => ({ ...m, [grupo.grupo_id]: false })); }
  };

  const handleItemStatus = async (itemId, nome, novoStatus) => {
    setMarcando(m => ({ ...m, [itemId]: true }));
    try {
      await api.comandas.itens.atualizarStatus(itemId, novoStatus);
      showToast(novoStatus === "preparando" ? `\u{1F525} ${nome} em preparo!` : `✓ ${nome} pronto!`);
      await carregar();
    } catch {} finally { setMarcando(m => ({ ...m, [itemId]: false })); }
  };

  const proximoStatus = (s) => {
    const idx = STATUS_PIPELINE.indexOf(s);
    return idx >= 0 && idx < STATUS_PIPELINE.length - 1 ? STATUS_PIPELINE[idx + 1] : null;
  };

  // ─── FILTERING ───────────────────────────────────────────────────────────
  const tipoFromPedido = (p) => {
    if (p.tipo_entrega === "retirada") return "retirada";
    if (p.tipo_entrega === "casa") return "casa";
    return "delivery";
  };

  const pedidosFiltrados = pedidos.filter(p => {
    if (filtroTipo === "mesa") return false;
    if (filtroTipo !== "todos" && tipoFromPedido(p) !== filtroTipo) return false;
    if (filtroStatus !== "todos" && p.status !== filtroStatus) return false;
    // In "fila" mode, hide terminal statuses unless explicitly filtered
    if (modo === "fila" && filtroStatus === "todos" && ["entregue", "cancelado"].includes(p.status)) return false;
    if (filtroMes && filtroMes !== "todos") {
      const d = parseDateUTC(p.created_at);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (ym !== filtroMes) return false;
    }
    return true;
  });

  const mesasFiltradas = gruposMesa.filter(g => {
    if (modo === "historico") return false; // hide mesa groups in history mode
    if (filtroTipo !== "todos" && filtroTipo !== "mesa") return false;
    if (filtroStatus !== "todos") {
      if (!["pendente", "preparando"].includes(filtroStatus)) return false;
      if (g.status_grupo !== filtroStatus) return false;
    }
    return true;
  });

  // ─── DAY GROUPING ───────────────────────────────────────────────────────
  const gruposDia = (() => {
    const mapa = new Map();
    pedidosFiltrados.forEach(p => {
      if (!p.created_at) return;
      const d = parseDateUTC(p.created_at);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(p);
    });
    for (const arr of mapa.values()) arr.sort((a, b) => parseDateUTC(b.created_at) - parseDateUTC(a.created_at));
    return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  })();

  const mesesDisponiveis = (() => {
    const set = new Set();
    pedidos.forEach(p => {
      if (!p.created_at) return;
      const d = parseDateUTC(p.created_at);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    const hoje = new Date();
    set.add(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
    set.add(filtroMes);
    return [...set].sort().reverse();
  })();

  const labelMes = (ym) => {
    const [a, m] = ym.split("-").map(Number);
    const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    return `${nomes[m - 1]} de ${a}`;
  };

  const labelDia = (chave) => {
    const [a, m, d] = chave.split("-").map(Number);
    const data = new Date(a, m - 1, d);
    const dias = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
    const hoje = new Date();
    const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
    const same = (x, y) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
    let pre = `Dia ${String(d).padStart(2, "0")}`;
    if (same(data, hoje)) pre = `Hoje (Dia ${String(d).padStart(2, "0")})`;
    else if (same(data, ontem)) pre = `Ontem (Dia ${String(d).padStart(2, "0")})`;
    return `${pre} — ${dias[data.getDay()]}`;
  };

  const totalDoDia = (lista) => lista.reduce((s, p) => s + Number(p.total || 0), 0);

  // ─── COUNTERS ────────────────────────────────────────────────────────────
  const totalMesaItens = gruposMesa.reduce((s, g) => s + g.itens.length, 0);
  const countByTipo = {
    mesa: totalMesaItens,
    delivery: pedidos.filter(p => tipoFromPedido(p) === "delivery" && !["entregue", "cancelado"].includes(p.status)).length,
    retirada: pedidos.filter(p => tipoFromPedido(p) === "retirada" && !["entregue", "cancelado"].includes(p.status)).length,
    casa: pedidos.filter(p => tipoFromPedido(p) === "casa" && !["entregue", "cancelado"].includes(p.status)).length,
  };
  const totalAtivos = Object.values(countByTipo).reduce((s, n) => s + n, 0);

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", background: "#0F0F0F", color: "#F5F5F4", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .cz-topbar { position: sticky; top: 0; z-index: 50; background: #1A1A1A; border-bottom: 2px solid #2A2A2A; padding: 16px 28px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .cz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; max-width: 1600px; }
        .cz-card { background: #1A1A1A; border: 1.5px solid #2A2A2A; border-radius: 16px; overflow: hidden; transition: border-color 0.15s; }
        .cz-card:hover { border-color: #3A3A3A; }
        .cz-card-head { padding: 14px 18px; background: #222; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2A2A2A; gap: 10px; cursor: pointer; }
        .cz-item { padding: 12px 18px; border-bottom: 1px solid #1F1F1F; display: flex; align-items: flex-start; gap: 12px; }
        .cz-item:last-child { border-bottom: none; }
        .cz-card-foot { padding: 12px 18px; border-top: 1px solid #2A2A2A; background: #1D1D1D; display: flex; gap: 8px; }
        .cz-btn { color: #fff; border: none; border-radius: 10px; padding: 10px 18px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s; flex: 1; }
        .cz-btn:hover { transform: scale(1.02); filter: brightness(1.1); }
        .cz-btn:active { transform: scale(0.98); }
        .cz-btn:disabled { opacity: 0.5; cursor: wait; transform: none; filter: none; }
        .cz-btn-item { color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s; flex-shrink: 0; white-space: nowrap; }
        .cz-btn-item:disabled { opacity: 0.5; cursor: wait; }
        .cz-card.preparando { border-color: #B4530955; background: #1C1708; }
        .cz-card.preparando .cz-card-head { background: #2A1A0A; }
        .cz-badge { display: inline-flex; align-items: center; justify-content: center; padding: 2px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; }
        .cz-toast { position: fixed; bottom: 28px; right: 28px; background: #15803d; color: #fff; padding: 14px 24px; border-radius: 12px; font-size: 15px; font-weight: 700; z-index: 200; animation: cz-fi 0.3s ease; box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
        @keyframes cz-fi { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .cz-pulse { animation: cz-p 2s infinite; }
        @keyframes cz-p { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
        .cz-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 40vh; gap: 16px; color: #555; }
        @media (max-width: 720px) { .cz-grid { grid-template-columns: 1fr; } .cz-topbar { padding: 12px 16px; gap: 10px; } }
      `}</style>

      {/* ─── TOP BAR ───────────────────────────────────────────────────────── */}
      <header className="cz-topbar">
        <button onClick={() => onNavegar(null)} style={{ background: "none", border: "1.5px solid #333", borderRadius: 10, padding: "8px 14px", color: "#aaa", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>{"←"} Início</button>
        <button onClick={() => setModalManual(true)} style={{ background: "#15803d", border: "none", borderRadius: 10, padding: "8px 16px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>{"+"} Pedido Manual</button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{"\u{1F525}"}</div>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Cozinha</div>
            <div style={{ fontSize: 11, color: "#777", fontWeight: 500 }}>Gestão completa de pedidos</div>
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Sound toggles */}
          <button onClick={toggleSom} style={{
            background: somAtivo ? "#052E16" : "#1A1A1A",
            color: somAtivo ? "#4ADE80" : "#555",
            border: `1.5px solid ${somAtivo ? "#15803D" : "#2A2A2A"}`,
            borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            {somAtivo ? "\u{1F514}" : "\u{1F515}"} {somAtivo ? "Som" : "Mudo"}
          </button>
          {somAtivo && (
            <button onClick={() => setRepetirSom(r => !r)} style={{
              background: repetirSom ? "#332B00" : "#1A1A1A",
              color: repetirSom ? "#FBBF24" : "#555",
              border: `1.5px solid ${repetirSom ? "#854D0E" : "#2A2A2A"}`,
              borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {repetirSom ? "\u{1F501} Repetir" : "1️⃣ Uma vez"}
            </button>
          )}
          {somAtivo && !audioDesbloqueado && (
            <span style={{ fontSize: 10, color: "#F87171", fontWeight: 600 }}>{"⚠️"} Clique para liberar</span>
          )}

          {/* Counters */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className={totalAtivos > 0 ? "cz-pulse" : ""} style={{ width: 10, height: 10, borderRadius: "50%", background: totalAtivos > 0 ? "#DC2626" : "#333" }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: -1 }}>{totalAtivos}</span>
            <span style={{ fontSize: 12, color: "#777", fontWeight: 500 }}>ativos</span>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {Object.entries(TIPO_CFG).map(([k, c]) => (
              <span key={k} className="cz-badge" title={`${c.label}: ${countByTipo[k]}`} style={{ background: c.bg, color: c.color }}>{c.icon} {countByTipo[k]}</span>
            ))}
          </div>
          <RelogioCozinha />
        </div>
      </header>

      {/* ─── PENDING ALERT ─────────────────────────────────────────────────── */}
      {pendentesAtual > 0 && (
        <div style={{ background: "#332B00", border: "1.5px solid #854D0E", borderRadius: 12, padding: "12px 18px", margin: "14px 28px 0", display: "flex", gap: 12, alignItems: "center", animation: "cz-fi 0.3s ease" }}>
          <span style={{ fontSize: 22 }}>{"\u{1F514}"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#FBBF24" }}>{pendentesAtual} {pendentesAtual === 1 ? "pedido pendente" : "pedidos pendentes"}!</div>
            <div style={{ fontSize: 12, color: "#B45309" }}>Aguardando confirmação</div>
          </div>
          <button onClick={() => { setFiltroStatus("pendente"); setFiltroTipo("todos"); }} style={{ background: "#422006", border: "1px solid #854D0E", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#FBBF24" }}>
            Ver pendentes
          </button>
        </div>
      )}

      {/* ─── MODE TOGGLE ──────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 28px 0", display: "flex", gap: 6, alignItems: "center" }}>
        {[
          { key: "fila", label: "🔥 Fila Ativa", desc: "Pedidos em andamento" },
          { key: "historico", label: "📋 Histórico", desc: "Todos os pedidos" },
        ].map(m => {
          const ativo = modo === m.key;
          return (
            <button key={m.key} onClick={() => { setModo(m.key); if (m.key === "fila") { setFiltroStatus("todos"); setFiltroMes(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }); } }} style={{
              background: ativo ? (m.key === "fila" ? "#350A0A" : "#172554") : "#1A1A1A",
              color: ativo ? (m.key === "fila" ? "#F87171" : "#60A5FA") : "#555",
              border: `1.5px solid ${ativo ? (m.key === "fila" ? "#7F1D1D" : "#1E40AF") : "#2A2A2A"}`,
              borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}>
              {m.label}
            </button>
          );
        })}
        <span style={{ fontSize: 12, color: "#444", marginLeft: 8 }}>{modo === "fila" ? "Mostrando pedidos em andamento" : "Mostrando todo o histórico"}</span>
      </div>

      {/* ─── FILTERS ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 28px 0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { key: "todos", label: "Todos", icon: "" },
          { key: "mesa", label: "Mesas", icon: "\u{1FA91}" },
          { key: "delivery", label: "Delivery", icon: "\u{1F6F5}" },
          { key: "retirada", label: "Retirada", icon: "\u{1F3EA}" },
          { key: "casa", label: "No local", icon: "\u{1F37D}️" },
        ].map(f => {
          const ativo = filtroTipo === f.key;
          const cfg = TIPO_CFG[f.key];
          return (
            <button key={f.key} onClick={() => setFiltroTipo(f.key)} style={{
              background: ativo ? (cfg?.bg || "#333") : "#1A1A1A",
              color: ativo ? (cfg?.color || "#F5F5F4") : "#777",
              border: `1.5px solid ${ativo ? (cfg?.color || "#555") + "55" : "#2A2A2A"}`,
              borderRadius: 10, padding: "7px 14px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}>
              {f.icon ? `${f.icon} ` : ""}{f.label}
            </button>
          );
        })}

        <span style={{ width: 1, height: 22, background: "#2A2A2A", margin: "0 2px" }} />

        {[["todos", "Todos"], ...Object.entries(STATUS_LABELS)].map(([k, v]) => {
          const ativo = filtroStatus === k;
          const cor = STATUS_CORES[k];
          return (
            <button key={`s-${k}`} onClick={() => setFiltroStatus(k)} style={{
              background: ativo && cor ? cor.bg : ativo ? "#333" : "#1A1A1A",
              color: ativo && cor ? cor.color : ativo ? "#F5F5F4" : "#555",
              border: `1.5px solid ${ativo && cor ? cor.border : ativo ? "#555" : "#2A2A2A"}`,
              borderRadius: 10, padding: "7px 12px", fontSize: 11, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}>
              {v}
              {k === "pendente" && pendentesAtual > 0 && (
                <span style={{ marginLeft: 4, background: "#DC2626", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{pendentesAtual}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── DATE CONTROLS ─────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 28px 0", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {modo === "historico" && (
          <>
            <label style={{ fontSize: 11, color: "#555", fontWeight: 600, letterSpacing: "0.06em" }}>MÊS</label>
            <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={{
              background: "#1A1A1A", color: "#F5F5F4", border: "1.5px solid #2A2A2A", borderRadius: 8,
              padding: "7px 12px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            }}>
              <option value="todos">Todos os meses</option>
              {mesesDisponiveis.map(ym => <option key={ym} value={ym}>{labelMes(ym)}</option>)}
            </select>
          </>
        )}
        <span style={{ fontSize: 12, color: "#555" }}>
          {pedidosFiltrados.length} {pedidosFiltrados.length === 1 ? "pedido" : "pedidos"}
          {mesasFiltradas.length > 0 && ` · ${mesasFiltradas.length} mesa${mesasFiltradas.length > 1 ? "s" : ""}`}
          {" · "}
          <span style={{ color: "#4ADE80", fontWeight: 600 }}>{fmt(pedidosFiltrados.reduce((s, p) => s + Number(p.total || 0), 0))}</span>
        </span>
      </div>

      {loading ? (
        <div className="cz-empty"><div style={{ fontSize: 40 }}>{"\u{1F525}"}</div><div style={{ fontSize: 14, fontWeight: 600 }}>Carregando...</div></div>
      ) : (
        <div style={{ padding: "18px 28px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ─── MESA GROUPS ─────────────────────────────────────────────── */}
          {mesasFiltradas.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 800, color: "#F59E0B" }}>{"\u{1FA91}"} Mesas na cozinha</span>
                <span style={{ fontSize: 12, color: "#555" }}>{mesasFiltradas.length} {mesasFiltradas.length === 1 ? "grupo" : "grupos"}</span>
              </div>
              <div className="cz-grid">
                {mesasFiltradas.map(grupo => {
                  const cfg = TIPO_CFG.mesa;
                  const estaPreparando = grupo.status_grupo === "preparando";
                  return (
                    <div key={grupo.grupo_id} className={`cz-card${estaPreparando ? " preparando" : ""}`} style={{ borderColor: estaPreparando ? "#B4530955" : `${cfg.color}33` }}>
                      <div className="cz-card-head" style={{ cursor: "default" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                          <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                          <div>
                            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 800 }}>{grupo.label}</div>
                            {grupo.cliente_nome && <div style={{ fontSize: 12, color: "#999", fontWeight: 500, marginTop: 1 }}>{grupo.cliente_nome}</div>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {estaPreparando && <span className="cz-badge cz-pulse" style={{ background: "#422006", color: "#F59E0B" }}>{"\u{1F525}"} Preparando</span>}
                          <span className="cz-badge" style={{ background: cfg.bg, color: cfg.color }}>{grupo.itens.length} {grupo.itens.length === 1 ? "item" : "itens"}</span>
                        </div>
                      </div>
                      {grupo.itens.map((item, idx) => {
                        const ip = item.status === "preparando";
                        return (
                          <div key={item.id || idx} className="cz-item">
                            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 800, color: cfg.color, minWidth: 28 }}>
                              {item.quantidade > 1 ? `${item.quantidade}×` : ""}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 700 }}>{item.produto_nome}</div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                                <span style={{ fontSize: 11, color: "#666", fontVariantNumeric: "tabular-nums" }}>{"⏱"} {fmtHora(item.created_at)} · {tempoDesde(item.created_at)}</span>
                                {ip && <span className="cz-badge cz-pulse" style={{ background: "#422006", color: "#F59E0B", fontSize: 10 }}>{"\u{1F525}"} Preparando</span>}
                                {item.origem === "qr" && <span className="cz-badge" style={{ background: "#1E1B4B", color: "#818CF8", fontSize: 10 }}>{"\u{1F4F1}"} QR</span>}
                                {item.origem === "online" && <span className="cz-badge" style={{ background: "#172554", color: "#60A5FA", fontSize: 10 }}>{"\u{1F310}"} Online</span>}
                              </div>
                              {item.obs && <div style={{ marginTop: 6, fontSize: 12, color: "#F59E0B", background: "#2A1A0A", padding: "5px 10px", borderRadius: 6, fontWeight: 600 }}>{"\u{1F4DD}"} {item.obs}</div>}
                            </div>
                            <button className="cz-btn-item" style={{ background: ip ? "#15803d" : "#B45309" }} disabled={!!marcando[item.id]} onClick={() => handleItemStatus(item.id, item.produto_nome, ip ? "pronto" : "preparando")}>
                              {marcando[item.id] ? "..." : ip ? "✓ Pronto" : "\u{1F525} Preparar"}
                            </button>
                          </div>
                        );
                      })}
                      {grupo.obs && <div style={{ padding: "10px 18px", borderTop: "1px solid #222", fontSize: 13, color: "#F59E0B", fontWeight: 600 }}>{"\u{1F4DD}"} {grupo.obs}</div>}
                      <div className="cz-card-foot">
                        {estaPreparando ? (
                          <button className="cz-btn" style={{ background: "#15803d" }} disabled={!!marcando[grupo.grupo_id]} onClick={() => handleGrupoStatus(grupo, "pronto")}>
                            {marcando[grupo.grupo_id] ? "Marcando..." : `✓ Tudo pronto — ${grupo.label}`}
                          </button>
                        ) : (
                          <button className="cz-btn" style={{ background: "#B45309" }} disabled={!!marcando[grupo.grupo_id]} onClick={() => handleGrupoStatus(grupo, "preparando")}>
                            {marcando[grupo.grupo_id] ? "Marcando..." : `\u{1F525} Preparar — ${grupo.label}`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── PEDIDOS BY DAY ──────────────────────────────────────────── */}
          {gruposDia.map(([chaveDia, lista]) => (
            <div key={chaveDia}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", marginBottom: 12, borderBottom: "2px solid #2A2A2A" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 800 }}>{labelDia(chaveDia)}</span>
                  <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>{lista.length} {lista.length === 1 ? "pedido" : "pedidos"}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#4ADE80" }}>{fmt(totalDoDia(lista))}</span>
              </div>
              <div className="cz-grid">
                {lista.map(p => {
                  const tipo = tipoFromPedido(p);
                  const cfg = TIPO_CFG[tipo];
                  const aberto = expandido === p.id;
                  const prox = proximoStatus(p.status);
                  const isTerminal = p.status === "entregue" || p.status === "cancelado";
                  const cor = STATUS_CORES[p.status];
                  return (
                    <div key={p.id} className="cz-card" style={{ borderColor: `${(cor || {}).color || "#2A2A2A"}33` }}>
                      <div className="cz-card-head" onClick={() => setExpandido(aberto ? null : p.id)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 800 }}>#{p.id.slice(0, 6)}</span>
                              <span className="cz-badge" style={{ background: cfg.bg, color: cfg.color }}>{cfg.icon} {tipo === "delivery" ? "Delivery" : tipo === "retirada" ? "Retirada" : "No local"}</span>
                              <span className="cz-badge" style={{ background: p.tipo === "online" ? "#172554" : "#1A1A1A", color: p.tipo === "online" ? "#60A5FA" : "#777" }}>
                                {p.tipo === "online" ? "ONLINE" : "PRESENCIAL"}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                              {p.cliente_nome || "Sem nome"} · {fmtHora(p.created_at)} · {tempoDesde(p.created_at)}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <span className="cz-badge" style={{ background: (cor || {}).bg, color: (cor || {}).color, border: `1px solid ${(cor || {}).border}` }}>
                            {STATUS_LABELS[p.status]}
                          </span>
                          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700 }}>{fmt(p.total)}</span>
                          <span style={{ fontSize: 14, color: "#555", transform: aberto ? "rotate(180deg)" : "", transition: "transform 0.2s" }}>{"▼"}</span>
                        </div>
                      </div>

                      {aberto && (
                        <div style={{ padding: "14px 18px", borderTop: "1px solid #222" }}>
                          {/* Status Pipeline */}
                          <div style={{ marginBottom: 14 }}>
                            <StatusPipelineDark status={p.status} />
                          </div>

                          {/* WhatsApp notifications */}
                          {p.cliente_telefone && (() => {
                            const notif = [];
                            const idx = STATUS_PIPELINE.indexOf(p.status);
                            if (idx >= 0) notif.push("✅ Confirmado");
                            if (idx >= 2) notif.push("\u{1F373} Preparando");
                            if (idx >= 3) notif.push("\u{1F6F5} Pronto");
                            if (p.status === "entregue") notif.push("\u{1F389} Entregue");
                            if (p.status === "cancelado") notif.push("❌ Cancelado");
                            return notif.length > 0 ? (
                              <div style={{ background: "#052E16", border: "1px solid #15803D", borderRadius: 8, padding: "8px 14px", marginBottom: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#4ADE80", letterSpacing: "0.06em", marginBottom: 5 }}>{"\u{1F4F1}"} WHATSAPP ENVIADAS</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {notif.map(n => <span key={n} style={{ fontSize: 11, color: "#22C55E", background: "#0A2E1A", borderRadius: 4, padding: "2px 8px", fontWeight: 500 }}>{n}</span>)}
                                </div>
                              </div>
                            ) : null;
                          })()}

                          {/* Items */}
                          <div style={{ background: "#111", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                            {p.itens?.map((item, i) => {
                              const adTotal = (item.adicionais || []).reduce((s, a) => s + a.preco * (a.quantidade || 1), 0);
                              const itemTotal = (item.preco_unitario + adTotal) * item.quantidade;
                              return (
                                <div key={i} style={{ padding: "6px 0", borderBottom: i < p.itens.length - 1 ? "1px solid #1F1F1F" : "none" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                    <span>{item.quantidade}x {item.produto_nome}</span>
                                    <span style={{ fontWeight: 500, color: "#aaa" }}>{fmt(itemTotal)}</span>
                                  </div>
                                  {item.adicionais?.length > 0 && (
                                    <div style={{ marginTop: 3 }}>
                                      {item.adicionais.map(a => (
                                        <span key={a.id || a.nome} style={{ display: "inline-block", background: "#052E16", color: "#4ADE80", fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, marginRight: 3 }}>
                                          {(a.quantidade || 1) > 1 ? `${a.quantidade}x ` : "+ "}{a.nome}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Obs */}
                          {p.obs && (
                            <div style={{ background: "#2A1A0A", border: "1.5px solid #B45309", borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 10 }}>
                              <span style={{ fontSize: 18 }}>{"\u{1F4DD}"}</span>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B", letterSpacing: "0.08em", marginBottom: 3 }}>OBSERVAÇÃO</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#F5F5F4" }}>{p.obs}</div>
                              </div>
                            </div>
                          )}

                          {/* Tipo info */}
                          {tipo === "retirada" && (
                            <div style={{ background: "#1A2E05", border: "1px solid #3F6212", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: "#84CC16", fontWeight: 600 }}>{"\u{1F3EA}"} Retirada no estabelecimento</div>
                          )}
                          {tipo === "casa" && (
                            <div style={{ background: "#2E1065", border: "1px solid #7C3AED", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: "#C084FC", fontWeight: 600 }}>{"\u{1F37D}️"} Consumir no local</div>
                          )}
                          {tipo === "delivery" && p.endereco_rua && (
                            <div style={{ background: "#172554", border: "1px solid #1E40AF", borderRadius: 8, padding: "8px 14px", marginBottom: 12 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#60A5FA", letterSpacing: "0.06em", marginBottom: 4 }}>{"\u{1F3E0}"} ENTREGA</div>
                              <div style={{ fontSize: 13, color: "#F5F5F4" }}>{p.endereco_rua}{p.endereco_numero ? `, ${p.endereco_numero}` : ""}</div>
                              <div style={{ fontSize: 12, color: "#999" }}>{p.endereco_bairro}{p.endereco_cep ? ` — CEP: ${p.endereco_cep}` : ""}</div>
                              {p.endereco_referencia && <div style={{ fontSize: 12, color: "#777", marginTop: 4, fontStyle: "italic" }}>Ref: {p.endereco_referencia}</div>}
                            </div>
                          )}

                          {/* Payment */}
                          {p.metodo_pagamento && (() => {
                            const labels = { pix: "⚡ Pix", credito: "\u{1F4B3} Crédito", debito: "\u{1F4B3} Débito", dinheiro: "\u{1F4B5} Dinheiro" };
                            const label = labels[p.metodo_pagamento] || p.metodo_pagamento;
                            const trocoNum = Number(p.troco_para);
                            const totalNum = Number(p.total);
                            const mostraTroco = p.metodo_pagamento === "dinheiro" && trocoNum > 0 && trocoNum > totalNum;
                            return (
                              <div style={{ display: "inline-block", background: "#332B00", border: "1px solid #854D0E", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "#FBBF24", marginBottom: 12 }}>
                                {label}
                                {p.metodo_pagamento === "dinheiro" && (
                                  mostraTroco
                                    ? <> {"—"} Troco para {fmt(trocoNum)} <span style={{ color: "#4ADE80" }}>(devolver {fmt(trocoNum - totalNum)})</span></>
                                    : <> {"—"} Sem troco</>
                                )}
                              </div>
                            );
                          })()}

                          {/* Action buttons */}
                          {!isTerminal && (
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                              {prox && (
                                <button className="cz-btn" style={{ background: (STATUS_CORES[prox] || {}).color || "#333" }} disabled={!!marcando[p.id]} onClick={() => atualizarStatusPedido(p.id, prox)}>
                                  {marcando[p.id] ? "..." : `Avançar → ${STATUS_LABELS[prox]}`}
                                </button>
                              )}
                              <button className="cz-btn" style={{ background: "#350A0A", border: "1px solid #7F1D1D", flex: "none", padding: "10px 16px" }} disabled={!!marcando[p.id]} onClick={() => atualizarStatusPedido(p.id, "cancelado")}>
                                Cancelar
                              </button>
                            </div>
                          )}
                          {p.status === "entregue" && (
                            <div style={{ background: "#052E16", border: "1px solid #15803D", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#4ADE80", fontWeight: 500 }}>
                              {"✅"} Entregue {"—"} {fmt(p.total)} registrado no caixa
                            </div>
                          )}

                          {/* Delete button */}
                          <div style={{ marginTop: 10, borderTop: "1px solid #222", paddingTop: 10, display: "flex", justifyContent: "flex-end" }}>
                            <button onClick={() => excluirPedido(p.id)} style={{ background: "none", border: "1px solid #7F1D1D", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#F87171", display: "flex", alignItems: "center", gap: 5 }}>
                              {"🗑️"} Excluir pedido
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {mesasFiltradas.length === 0 && gruposDia.length === 0 && (
            <div className="cz-empty">
              <div style={{ fontSize: 64 }}>{"✨"}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#777" }}>Nenhum item encontrado</div>
              <div style={{ fontSize: 14, color: "#444" }}>Ajuste os filtros ou aguarde novos pedidos...</div>
            </div>
          )}
        </div>
      )}

      {toast && <div className="cz-toast">{toast}</div>}

      {/* ─── MODAL PEDIDO MANUAL ──────────────────────────────────────────── */}
      {modalManual && (
        <ModalPedidoManual
          produtos={produtos}
          categorias={categorias}
          adicionaisDisponiveis={adicionaisDisponiveis}
          onSave={criarPedidoManual}
          onClose={() => setModalManual(false)}
        />
      )}
    </div>
  );
}
