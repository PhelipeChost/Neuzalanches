import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import { ImagemProduto } from "./Produtos";

const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const METODOS_PAGAMENTO = [
  { id: "pix", label: "Pix", icon: "⚡" },
  { id: "credito", label: "Cartao de Credito", icon: "💳" },
  { id: "debito", label: "Cartao de Debito", icon: "💳" },
];

let uidCounter = 0;
function nextUid() { return `_${Date.now()}_${++uidCounter}`; }

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// ─── MODAL CHECKOUT (INFO CLIENTE + ENDEREÇO + PAGAMENTO) ─────────────────────
function ModalCheckout({ onConfirm, onClose, totalCarrinho }) {
  const [etapa, setEtapa] = useState("cliente"); // "cliente" | "endereco" | "pagamento"

  // Info do cliente
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");

  // Endereço
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [referencia, setReferencia] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Pagamento
  const [metodoPagamento, setMetodoPagamento] = useState("");
  const [pixInfo, setPixInfo] = useState({ pix_key: "", pix_nome: "" });
  const [copiadoPix, setCopiadoPix] = useState(false);

  useEffect(() => {
    api.pix.obter().then(setPixInfo).catch(() => {});
  }, []);

  const handleCepChange = (val) => {
    const limpo = val.replace(/\D/g, "").slice(0, 8);
    setCep(limpo.length > 5 ? `${limpo.slice(0, 5)}-${limpo.slice(5)}` : limpo);
  };

  useEffect(() => {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length === 8) {
      setBuscandoCep(true);
      api.buscarCep(cepLimpo).then(data => {
        setRua(data.rua || "");
        setBairro(data.bairro || "");
      }).catch(() => {}).finally(() => setBuscandoCep(false));
    }
  }, [cep]);

  const clienteValido = () => clienteNome.trim() && clienteTelefone.replace(/\D/g, "").length >= 10;
  const enderecoValido = () => rua.trim() && bairro.trim();

  const copiarPix = () => {
    navigator.clipboard.writeText(pixInfo.pix_key).then(() => {
      setCopiadoPix(true);
      setTimeout(() => setCopiadoPix(false), 2000);
    }).catch(() => {});
  };

  const confirmar = () => {
    onConfirm({
      cliente_nome: clienteNome.trim(),
      cliente_telefone: clienteTelefone.replace(/\D/g, ""),
      cliente_email: clienteEmail.trim(),
      endereco: { cep: cep.replace(/\D/g, ""), rua, numero, bairro, referencia },
      metodo_pagamento: metodoPagamento,
    });
  };

  const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917", background: "#fff" };
  const labelStyle = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", width: 480, maxWidth: "92vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600 }}>Finalizar Pedido</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>x</button>
        </div>

        {/* Etapas */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[["cliente", "1. Seus Dados"], ["endereco", "2. Endereco"], ["pagamento", "3. Pagamento"]].map(([k, v]) => (
            <div key={k} style={{
              flex: 1, textAlign: "center", padding: "8px 0",
              borderBottom: `3px solid ${etapa === k ? "#15803d" : "#e7e5e4"}`,
              fontSize: 12, fontWeight: etapa === k ? 600 : 400,
              color: etapa === k ? "#15803d" : "#a8a29e",
              cursor: "pointer", transition: "all 0.2s"
            }}
              onClick={() => {
                if (k === "cliente") setEtapa("cliente");
                else if (k === "endereco" && clienteValido()) setEtapa("endereco");
                else if (k === "pagamento" && clienteValido() && enderecoValido()) setEtapa("pagamento");
              }}>
              {v}
            </div>
          ))}
        </div>

        {/* ETAPA 1: INFO DO CLIENTE */}
        {etapa === "cliente" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={labelStyle}>NOME COMPLETO *</label>
              <input style={inputStyle} value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Seu nome completo" />
            </div>
            <div>
              <label style={labelStyle}>TELEFONE *</label>
              <input style={inputStyle} type="tel" value={clienteTelefone} onChange={e => setClienteTelefone(formatPhone(e.target.value))} placeholder="(92) 99999-0000" />
            </div>
            <div>
              <label style={labelStyle}>EMAIL (OPCIONAL)</label>
              <input style={inputStyle} type="email" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="seu@email.com" />
            </div>
            <button onClick={() => { if (clienteValido()) setEtapa("endereco"); }}
              disabled={!clienteValido()}
              style={{ width: "100%", marginTop: 8, padding: 12, background: clienteValido() ? "#15803d" : "#d6d3d1", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: clienteValido() ? "pointer" : "not-allowed", fontFamily: "'DM Sans', sans-serif" }}>
              Continuar para endereco
            </button>
          </div>
        )}

        {/* ETAPA 2: ENDEREÇO */}
        {etapa === "endereco" && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={labelStyle}>CEP</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...inputStyle, flex: 1 }} value={cep} onChange={e => handleCepChange(e.target.value)} placeholder="00000-000" maxLength={9} />
                  {buscandoCep && <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: "#15803d", fontWeight: 500, whiteSpace: "nowrap" }}>Buscando...</div>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>RUA / LOGRADOURO *</label>
                <input style={inputStyle} value={rua} onChange={e => setRua(e.target.value)} placeholder="Ex: Rua das Flores" />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>NUMERO</label>
                  <input style={inputStyle} value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>BAIRRO *</label>
                  <input style={inputStyle} value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Ex: Centro" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>REFERENCIA PARA O ENTREGADOR</label>
                <input style={inputStyle} value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ex: Portao azul, ao lado da padaria" />
              </div>
            </div>

            <button onClick={() => { if (enderecoValido()) setEtapa("pagamento"); }}
              disabled={!enderecoValido()}
              style={{ width: "100%", marginTop: 20, padding: 12, background: enderecoValido() ? "#15803d" : "#d6d3d1", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: enderecoValido() ? "pointer" : "not-allowed", fontFamily: "'DM Sans', sans-serif" }}>
              Continuar para pagamento
            </button>
          </div>
        )}

        {/* ETAPA 3: PAGAMENTO */}
        {etapa === "pagamento" && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#78716c", marginBottom: 10, letterSpacing: "0.06em" }}>ESCOLHA O METODO DE PAGAMENTO</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {METODOS_PAGAMENTO.map(m => (
                <label key={m.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                  background: metodoPagamento === m.id ? "#f0fdf4" : "#fafaf9",
                  border: `1.5px solid ${metodoPagamento === m.id ? "#86efac" : "#e7e5e4"}`,
                  borderRadius: 10, cursor: "pointer", transition: "all 0.15s"
                }}>
                  <input type="radio" name="pagamento" checked={metodoPagamento === m.id} onChange={() => setMetodoPagamento(m.id)} style={{ accentColor: "#15803d" }} />
                  <span style={{ fontSize: 18 }}>{m.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{m.label}</span>
                </label>
              ))}
            </div>

            {/* Info PIX */}
            {metodoPagamento === "pix" && pixInfo.pix_key && (
              <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#15803d", marginBottom: 8, letterSpacing: "0.06em" }}>DADOS PARA PAGAMENTO PIX</div>
                <div style={{ fontSize: 13, color: "#1c1917", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>Chave:</span> {pixInfo.pix_key}
                </div>
                <div style={{ fontSize: 13, color: "#1c1917", marginBottom: 10 }}>
                  <span style={{ fontWeight: 600 }}>Nome:</span> {pixInfo.pix_nome}
                </div>
                <button onClick={copiarPix}
                  style={{ background: copiadoPix ? "#16a34a" : "#15803d", color: "#fff", border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "background 0.2s" }}>
                  {copiadoPix ? "✓ Copiado!" : "Copiar chave Pix"}
                </button>
              </div>
            )}

            {/* Total e confirmar */}
            <div style={{ borderTop: "2px solid #e7e5e4", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600 }}>TOTAL DO PEDIDO</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#15803d" }}>{fmt(totalCarrinho)}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEtapa("endereco")}
                  style={{ padding: "12px 18px", background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>
                  Voltar
                </button>
                <button onClick={confirmar}
                  disabled={!metodoPagamento}
                  style={{ padding: "12px 24px", background: metodoPagamento ? "#15803d" : "#d6d3d1", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: metodoPagamento ? "pointer" : "not-allowed", fontFamily: "'DM Sans', sans-serif" }}>
                  Confirmar Pedido
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MODAL ADICIONAIS ──────────────────────────────────────────────────────────
function ModalAdicionais({ produto, adicionais, onConfirm, onClose }) {
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", width: 420, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500 }}>Adicionais</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>x</button>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, padding: "12px 14px", background: "#fafaf9", borderRadius: 10 }}>
          <ImagemProduto src={produto.imagem} tamanho={48} borderRadius={8} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{produto.nome}</div>
            <div style={{ fontSize: 13, color: "#15803d", fontWeight: 500 }}>{fmt(produto.preco)}</div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: "#78716c", marginBottom: 8, letterSpacing: "0.06em" }}>ESCOLHA SEUS ADICIONAIS</div>

        {adicionais.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "#a8a29e", fontSize: 13 }}>Nenhum adicional disponivel.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {adicionais.map(ad => {
              const sel = selecionados.find(s => s.id === ad.id);
              const qtd = sel ? sel.quantidade : 0;
              return (
                <div key={ad.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  background: qtd > 0 ? "#f0fdf4" : "#fff", border: `1.5px solid ${qtd > 0 ? "#86efac" : "#e7e5e4"}`,
                  borderRadius: 10, transition: "all 0.15s"
                }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{ad.nome}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>+ {fmt(ad.preco)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => updateQtdAd(ad, -1)} disabled={qtd === 0}
                      style={{ width: 26, height: 26, border: "1px solid #e7e5e4", borderRadius: 6, background: "#fff", cursor: qtd > 0 ? "pointer" : "default", fontSize: 14, lineHeight: 1, color: qtd > 0 ? "#1c1917" : "#d6d3d1" }}>-</button>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: "center" }}>{qtd}</span>
                    <button onClick={() => updateQtdAd(ad, 1)}
                      style={{ width: 26, height: 26, border: "1px solid #e7e5e4", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: "2px solid #e7e5e4", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600 }}>TOTAL DO ITEM</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: "#15803d" }}>{fmt(totalItem)}</div>
          </div>
          <button onClick={() => onConfirm(selecionados)}
            style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Adicionar ao carrinho
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CLIENTE APP ───────────────────────────────────────────────────────────────
export default function ClienteApp() {
  const [tab, setTab] = useState("catalogo");
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [adicionaisDisponiveis, setAdicionaisDisponiveis] = useState([]);
  const [carrinho, setCarrinho] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modalAdicional, setModalAdicional] = useState(null);
  const [modalCheckout, setModalCheckout] = useState(false);
  const [pedidoEnviado, setPedidoEnviado] = useState(null);

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  // Mapa: nome da categoria -> permite_adicionais
  const catPermiteAdicionais = {};
  categorias.forEach(c => { catPermiteAdicionais[c.nome] = !!c.permite_adicionais; });

  const carregar = useCallback(async () => {
    try {
      const [prods, cats, adds] = await Promise.all([
        api.produtos.listar(),
        api.categorias.listar(),
        api.adicionais.listar(),
      ]);
      setProdutos(prods.filter(p => p.disponivel));
      setCategorias(cats);
      setAdicionaisDisponiveis(adds.filter(a => a.disponivel));
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const handleAddProduto = (produto) => {
    if (catPermiteAdicionais[produto.categoria] && adicionaisDisponiveis.length > 0) {
      setModalAdicional(produto);
    } else {
      addCarrinhoSimples(produto, []);
    }
  };

  const addCarrinhoSimples = (produto, adicionaisSelecionados) => {
    const adKey = adicionaisSelecionados.map(a => `${a.id}:${a.quantidade || 1}`).sort().join(",");
    const existente = carrinho.find(i => i.produto_id === produto.id && (i._adKey || "") === adKey);

    if (existente) {
      setCarrinho(carrinho.map(i => i._uid === existente._uid ? { ...i, quantidade: i.quantidade + 1 } : i));
    } else {
      setCarrinho([...carrinho, {
        _uid: nextUid(),
        _adKey: adKey,
        produto_id: produto.id,
        produto_nome: produto.nome,
        preco_unitario: produto.preco,
        quantidade: 1,
        adicionais: adicionaisSelecionados,
      }]);
    }
    showToast(`${produto.nome} adicionado!`);
  };

  const confirmarAdicionais = (adicionaisSelecionados) => {
    if (modalAdicional) {
      addCarrinhoSimples(modalAdicional, adicionaisSelecionados);
      setModalAdicional(null);
    }
  };

  const updateQtd = (uid, qtd) => {
    if (qtd < 1) return setCarrinho(carrinho.filter(i => i._uid !== uid));
    setCarrinho(carrinho.map(i => i._uid === uid ? { ...i, quantidade: qtd } : i));
  };

  const calcItemTotal = (item) => {
    const adTotal = (item.adicionais || []).reduce((s, a) => s + a.preco * (a.quantidade || 1), 0);
    return (item.preco_unitario + adTotal) * item.quantidade;
  };

  const totalCarrinho = carrinho.reduce((s, i) => s + calcItemTotal(i), 0);

  const abrirCheckout = () => {
    if (carrinho.length === 0) return;
    setModalCheckout(true);
  };

  const enviarPedido = async ({ cliente_nome, cliente_telefone, cliente_email, endereco, metodo_pagamento }) => {
    if (carrinho.length === 0) return;
    setEnviando(true);
    try {
      const itensLimpos = carrinho.map(({ _uid, _adKey, ...rest }) => rest);
      const novo = await api.pedidos.criarPublico({
        itens: itensLimpos,
        obs,
        cliente_nome,
        cliente_telefone,
        cliente_email,
        metodo_pagamento,
        endereco,
      });
      setCarrinho([]);
      setObs("");
      setModalCheckout(false);
      setPedidoEnviado(novo);
      setTab("confirmacao");
      showToast("Pedido enviado com sucesso!");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally {
      setEnviando(false);
    }
  };

  const categoriasUnicas = [...new Set(produtos.map(p => p.categoria).filter(Boolean))];

  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#f5f5f4", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#78716c", fontSize: 14 }}>Carregando...</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f5f5f4", minHeight: "100vh", color: "#1c1917" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Fraunces:ital,wght@0,300;0,500;0,600;1,300&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #d6d3d1; border-radius: 2px; }
        .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 20px 22px; }
        .nav-pill { padding: 7px 18px; border-radius: 8px; border: none; background: none; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 13px; color: #78716c; transition: all 0.15s; }
        .nav-pill:hover { background: #f5f5f4; color: #1c1917; }
        .nav-pill.active { background: #fff; color: #15803d; font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        .header-nav { display: flex; gap: 2px; background: #f5f5f4; border-radius: 10px; padding: 3px; flex-wrap: wrap; }
        .client-header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; min-height: 56px; }
        @media (max-width: 720px) {
          .client-header { padding: 8px 16px; gap: 12px; }
          .header-nav { width: 100%; }
          .nav-pill { flex: 1 1 120px; min-width: 120px; }
        }
        .anim { animation: fi 0.25s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 999; animation: fi 0.3s ease; color: #fff; }
      `}</style>

      {/* Header */}
      <header className="client-header" style={{ background: "#fff", borderBottom: "1px solid #e7e5e4", padding: "0 24px", height: "auto", minHeight: 56, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src="/logo.png" alt="Logo" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 700 }}>NeuzaLanches</span>
        </div>

        <div style={{ width: 1, height: 22, background: "#e7e5e4" }} />

        <div className="header-nav" style={{ display: "flex", gap: 2, background: "#f5f5f4", borderRadius: 10, padding: 3, flexWrap: "wrap", flex: "1 1 auto", minWidth: 0 }}>
          {[["catalogo", "Cardapio"], ["carrinho", `Carrinho (${carrinho.length})`]].map(([k, v]) => (
            <button key={k} className={`nav-pill ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{v}</button>
          ))}
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px" }}>

        {/* CATALOGO */}
        {tab === "catalogo" && (
          <div className="anim">
            {produtos.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
                Nenhum produto disponivel no momento.
              </div>
            ) : (
              <>
                {categoriasUnicas.length > 0 ? categoriasUnicas.map(cat => (
                  <div key={cat} style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: cat === "Lanches" ? "#F38C24" : "#57534e", marginBottom: 10, padding: "4px 0", borderBottom: "1px solid #e7e5e4" }}>{cat}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                      {produtos.filter(p => p.categoria === cat).map(p => (
                        <div key={p.id} className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", gap: 12 }}>
                            <ImagemProduto src={p.imagem} tamanho={64} borderRadius={10} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: p.categoria === "Lanches" ? "#7B4532" : "inherit" }}>{p.nome}</div>
                              {p.descricao && <div style={{ fontSize: 12, color: "#78716c", marginTop: 4 }}>{p.descricao}</div>}
                            </div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                            <div>
                              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600, color: "#15803d" }}>{fmt(p.preco)}</span>
                              {catPermiteAdicionais[p.categoria] && adicionaisDisponiveis.length > 0 && (
                                <div style={{ fontSize: 10, color: "#78716c", marginTop: 2 }}>Adicionais disponiveis</div>
                              )}
                            </div>
                            <button onClick={() => handleAddProduto(p)} style={{ background: "#F38C24", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                              + Adicionar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                    {produtos.map(p => (
                      <div key={p.id} className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", gap: 12 }}>
                          <ImagemProduto src={p.imagem} tamanho={64} borderRadius={10} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: p.categoria === "Lanches" ? "#7B4532" : "inherit" }}>{p.nome}</div>
                            {p.descricao && <div style={{ fontSize: 12, color: "#78716c", marginTop: 4 }}>{p.descricao}</div>}
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600, color: "#15803d" }}>{fmt(p.preco)}</span>
                          <button onClick={() => handleAddProduto(p)} style={{ background: "#F38C24", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                            + Adicionar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* CARRINHO */}
        {tab === "carrinho" && (
          <div className="anim">
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Seu Carrinho</div>

            {carrinho.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
                Seu carrinho esta vazio. Adicione produtos do cardapio.
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => setTab("catalogo")} style={{ background: "#F38C24", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    Ver cardapio
                  </button>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {carrinho.map((item, i) => {
                  const itemTotal = calcItemTotal(item);
                  return (
                    <div key={item._uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: i < carrinho.length - 1 ? "1px solid #f5f5f4" : "none" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{item.produto_nome}</div>
                        <div style={{ fontSize: 12, color: "#a8a29e" }}>{fmt(item.preco_unitario)} cada</div>
                        {item.adicionais && item.adicionais.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {item.adicionais.map(a => (
                              <span key={a.id} style={{ display: "inline-block", background: "#f0fdf4", color: "#15803d", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, marginRight: 4, marginBottom: 2 }}>
                                {(a.quantidade || 1) > 1 ? `${a.quantidade}x ` : "+ "}{a.nome} ({fmt(a.preco * (a.quantidade || 1))})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button onClick={() => updateQtd(item._uid, item.quantidade - 1)} style={{ width: 28, height: 28, border: "1px solid #e7e5e4", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>-</button>
                        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 24, textAlign: "center" }}>{item.quantidade}</span>
                        <button onClick={() => updateQtd(item._uid, item.quantidade + 1)} style={{ width: 28, height: 28, border: "1px solid #e7e5e4", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>+</button>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: "#15803d", minWidth: 90, textAlign: "right" }}>{fmt(itemTotal)}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Observacao */}
                <div style={{ padding: "14px 18px", borderTop: "1px solid #e7e5e4" }}>
                  <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 5 }}>Observacao (opcional)</label>
                  <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Sem cebola, ponto da carne, etc."
                    style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917" }} />
                </div>

                {/* Total e enviar */}
                <div style={{ padding: "18px", borderTop: "2px solid #e7e5e4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#a8a29e", fontWeight: 600 }}>TOTAL</div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 700, color: "#15803d" }}>{fmt(totalCarrinho)}</div>
                  </div>
                  <button onClick={abrirCheckout} disabled={enviando}
                    style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 14, fontWeight: 600, cursor: enviando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", opacity: enviando ? 0.7 : 1 }}>
                    {enviando ? "Enviando..." : "Fazer pedido"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONFIRMAÇÃO DO PEDIDO */}
        {tab === "confirmacao" && pedidoEnviado && (
          <div className="anim" style={{ textAlign: "center" }}>
            <div className="card" style={{ padding: 40, maxWidth: 500, margin: "0 auto" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28, color: "#15803d" }}>✓</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 8, color: "#15803d" }}>Pedido Enviado!</div>
              <div style={{ fontSize: 14, color: "#78716c", marginBottom: 20 }}>
                Seu pedido <strong>#{pedidoEnviado.id.slice(0, 6)}</strong> foi recebido com sucesso.
              </div>
              <div style={{ fontSize: 13, color: "#57534e", marginBottom: 8 }}>
                {pedidoEnviado.itens?.map(item => `${item.quantidade}x ${item.produto_nome}`).join(", ")}
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, color: "#15803d", marginBottom: 24 }}>{fmt(pedidoEnviado.total)}</div>
              <button onClick={() => { setPedidoEnviado(null); setTab("catalogo"); }}
                style={{ background: "#F38C24", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Fazer novo pedido
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Adicionais */}
      {modalAdicional && (
        <ModalAdicionais
          produto={modalAdicional}
          adicionais={adicionaisDisponiveis}
          onConfirm={confirmarAdicionais}
          onClose={() => setModalAdicional(null)}
        />
      )}

      {/* Modal Checkout */}
      {modalCheckout && (
        <ModalCheckout
          totalCarrinho={totalCarrinho}
          onConfirm={enviarPedido}
          onClose={() => setModalCheckout(false)}
        />
      )}

      {/* Toast */}
      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}
