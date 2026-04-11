import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import { ImagemProduto } from "./Produtos";
import ModalAuth from "./Login";

const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABELS = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  pronto: "Pronto p/ retirada",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
const STATUS_CORES = {
  pendente: { bg: "#fefce8", color: "#ca8a04" },
  confirmado: { bg: "#eff6ff", color: "#2563eb" },
  preparando: { bg: "#fef3c7", color: "#d97706" },
  pronto: { bg: "#f0fdf4", color: "#16a34a" },
  entregue: { bg: "#dcfce7", color: "#15803d" },
  cancelado: { bg: "#fee2e2", color: "#dc2626" },
};
const STATUS_PIPELINE = ["pendente", "confirmado", "preparando", "pronto", "entregue"];

const METODOS_PAGAMENTO = [
  { id: "pix", label: "Pix", icon: "⚡" },
  { id: "credito", label: "Cartão de Crédito", icon: "💳" },
  { id: "debito", label: "Cartão de Débito", icon: "💳" },
];

let uidCounter = 0;
function nextUid() { return `_${Date.now()}_${++uidCounter}`; }

// ─── MODAL CHECKOUT (ENDEREÇO + PAGAMENTO) ────────────────────────────────────
function ModalCheckout({ enderecosSalvos, onConfirm, onClose, totalCarrinho }) {
  const [etapa, setEtapa] = useState("endereco"); // "endereco" | "pagamento"
  const [enderecoTipo, setEnderecoTipo] = useState(enderecosSalvos.length > 0 ? "salvo" : "novo");
  const [enderecoSelecionado, setEnderecoSelecionado] = useState(enderecosSalvos[0]?.id || "");
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [referencia, setReferencia] = useState("");
  const [salvarEndereco, setSalvarEndereco] = useState(true);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [metodoPagamento, setMetodoPagamento] = useState("");
  const [pixInfo, setPixInfo] = useState({ pix_key: "", pix_nome: "" });
  const [copiadoPix, setCopiadoPix] = useState(false);

  const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  useEffect(() => {
    api.pix.obter().then(setPixInfo).catch(() => {});
  }, []);

  const buscarCep = async () => {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const data = await api.buscarCep(cepLimpo);
      setRua(data.rua || "");
      setBairro(data.bairro || "");
    } catch { /* ignore */ }
    finally { setBuscandoCep(false); }
  };

  const handleCepChange = (val) => {
    // Formatar CEP: 00000-000
    const limpo = val.replace(/\D/g, "").slice(0, 8);
    if (limpo.length > 5) {
      setCep(`${limpo.slice(0, 5)}-${limpo.slice(5)}`);
    } else {
      setCep(limpo);
    }
  };

  useEffect(() => {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length === 8) buscarCep();
  }, [cep]);

  const enderecoValido = () => {
    if (enderecoTipo === "salvo") return !!enderecoSelecionado;
    return rua.trim() && bairro.trim();
  };

  const copiarPix = () => {
    navigator.clipboard.writeText(pixInfo.pix_key).then(() => {
      setCopiadoPix(true);
      setTimeout(() => setCopiadoPix(false), 2000);
    }).catch(() => {});
  };

  const confirmar = () => {
    let endereco;
    if (enderecoTipo === "salvo") {
      endereco = { endereco_id: enderecoSelecionado };
    } else {
      endereco = { cep: cep.replace(/\D/g, ""), rua, numero, bairro, referencia, salvar: salvarEndereco };
    }
    onConfirm({ endereco, metodo_pagamento: metodoPagamento });
  };

  const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917", background: "#fff" };
  const labelStyle = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", width: 480, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600 }}>Finalizar Pedido</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>x</button>
        </div>

        {/* Etapas */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[["endereco", "1. Endereço"], ["pagamento", "2. Pagamento"]].map(([k, v]) => (
            <div key={k} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderBottom: `3px solid ${etapa === k ? "#15803d" : "#e7e5e4"}`, fontSize: 13, fontWeight: etapa === k ? 600 : 400, color: etapa === k ? "#15803d" : "#a8a29e", cursor: "pointer", transition: "all 0.2s" }}
              onClick={() => { if (k === "endereco") setEtapa("endereco"); else if (enderecoValido()) setEtapa("pagamento"); }}>
              {v}
            </div>
          ))}
        </div>

        {/* ETAPA 1: ENDEREÇO */}
        {etapa === "endereco" && (
          <div>
            {enderecosSalvos.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                <button onClick={() => setEnderecoTipo("salvo")}
                  style={{ flex: 1, padding: "9px 0", border: `1.5px solid ${enderecoTipo === "salvo" ? "#15803d" : "#e7e5e4"}`, borderRadius: 8, background: enderecoTipo === "salvo" ? "#f0fdf4" : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: enderecoTipo === "salvo" ? "#15803d" : "#78716c" }}>
                  Endereço salvo
                </button>
                <button onClick={() => setEnderecoTipo("novo")}
                  style={{ flex: 1, padding: "9px 0", border: `1.5px solid ${enderecoTipo === "novo" ? "#15803d" : "#e7e5e4"}`, borderRadius: 8, background: enderecoTipo === "novo" ? "#f0fdf4" : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: enderecoTipo === "novo" ? "#15803d" : "#78716c" }}>
                  Novo endereço
                </button>
              </div>
            )}

            {enderecoTipo === "salvo" && enderecosSalvos.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {enderecosSalvos.map(end => (
                  <label key={end.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
                    background: enderecoSelecionado === end.id ? "#f0fdf4" : "#fafaf9",
                    border: `1.5px solid ${enderecoSelecionado === end.id ? "#86efac" : "#e7e5e4"}`,
                    borderRadius: 10, cursor: "pointer", transition: "all 0.15s"
                  }}>
                    <input type="radio" name="endereco" checked={enderecoSelecionado === end.id} onChange={() => setEnderecoSelecionado(end.id)} style={{ accentColor: "#15803d", marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{end.rua}{end.numero ? `, ${end.numero}` : ""}</div>
                      <div style={{ fontSize: 12, color: "#78716c" }}>{end.bairro}{end.cep ? ` — CEP: ${end.cep}` : ""}</div>
                      {end.referencia && <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 2 }}>Ref: {end.referencia}</div>}
                    </div>
                  </label>
                ))}
              </div>
            ) : (
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
                    <label style={labelStyle}>NÚMERO</label>
                    <input style={inputStyle} value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>BAIRRO *</label>
                    <input style={inputStyle} value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Ex: Centro" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>REFERÊNCIA PARA O ENTREGADOR</label>
                  <input style={inputStyle} value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ex: Portão azul, ao lado da padaria" />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#57534e", cursor: "pointer" }}>
                  <input type="checkbox" checked={salvarEndereco} onChange={e => setSalvarEndereco(e.target.checked)} style={{ accentColor: "#15803d" }} />
                  Salvar endereço para próximos pedidos
                </label>
              </div>
            )}

            <button onClick={() => { if (enderecoValido()) setEtapa("pagamento"); }}
              disabled={!enderecoValido()}
              style={{ width: "100%", marginTop: 20, padding: 12, background: enderecoValido() ? "#15803d" : "#d6d3d1", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: enderecoValido() ? "pointer" : "not-allowed", fontFamily: "'DM Sans', sans-serif" }}>
              Continuar para pagamento
            </button>
          </div>
        )}

        {/* ETAPA 2: PAGAMENTO */}
        {etapa === "pagamento" && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#78716c", marginBottom: 10, letterSpacing: "0.06em" }}>ESCOLHA O MÉTODO DE PAGAMENTO</div>

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
            <div style={{ borderTop: "2px solid #e7e5e4", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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

export default function ClienteApp({ usuario, onLogin, onLogout }) {
  const [tab, setTab] = useState("catalogo");
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [adicionaisDisponiveis, setAdicionaisDisponiveis] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [carrinho, setCarrinho] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modalAdicional, setModalAdicional] = useState(null);
  const [modalCheckout, setModalCheckout] = useState(false);
  const [enderecosSalvos, setEnderecosSalvos] = useState([]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState(null);

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

      if (usuario) {
        const [peds, ends] = await Promise.all([
          api.pedidos.listar(),
          api.enderecos.listar(),
        ]);
        setPedidos(peds);
        setEnderecosSalvos(ends);
      }
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, [usuario]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!usuario) return;
    const interval = setInterval(async () => {
      try { setPedidos(await api.pedidos.listar()); } catch { /* ignore */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [usuario]);

  const handleAddProduto = (produto) => {
    if (!usuario) {
      setPendingProduct(produto);
      setShowAuthModal(true);
      return;
    }
    if (catPermiteAdicionais[produto.categoria] && adicionaisDisponiveis.length > 0) {
      setModalAdicional(produto);
    } else {
      addCarrinhoSimples(produto, []);
    }
  };

  const addCarrinhoSimples = (produto, adicionaisSelecionados) => {
    const adTotal = adicionaisSelecionados.reduce((s, a) => s + a.preco, 0);
    const adKey = adicionaisSelecionados.map(a => `${a.id}:${a.quantidade || 1}`).sort().join(",");

    // Verificar se já tem o mesmo produto com os mesmos adicionais
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

  const handleAuthSuccess = (user, token) => {
    setShowAuthModal(false);
    onLogin(user, token);
  };

  const handleAuthClose = () => {
    setShowAuthModal(false);
    setPendingProduct(null);
  };

  // Process pending product after successful auth
  useEffect(() => {
    if (usuario && pendingProduct) {
      const prod = pendingProduct;
      setPendingProduct(null);
      if (catPermiteAdicionais[prod.categoria] && adicionaisDisponiveis.length > 0) {
        setModalAdicional(prod);
      } else {
        addCarrinhoSimples(prod, []);
      }
    }
  }, [usuario, pendingProduct]);

  // Reset tab if user logs out while on pedidos
  useEffect(() => {
    if (!usuario && tab === "pedidos") setTab("catalogo");
  }, [usuario, tab]);

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
    if (!usuario) {
      setShowAuthModal(true);
      return;
    }
    setModalCheckout(true);
  };

  const enviarPedido = async ({ endereco, metodo_pagamento }) => {
    if (carrinho.length === 0) return;
    setEnviando(true);
    try {
      const itensLimpos = carrinho.map(({ _uid, _adKey, ...rest }) => rest);
      const novo = await api.pedidos.criar({ itens: itensLimpos, obs, endereco, metodo_pagamento });
      setPedidos(ps => [novo, ...ps]);
      setCarrinho([]);
      setObs("");
      setModalCheckout(false);
      setTab("pedidos");
      // Recarregar enderecos salvos (caso tenha salvo um novo)
      api.enderecos.listar().then(setEnderecosSalvos).catch(() => {});
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
          .client-user { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
          .logout-btn { flex: 0 0 auto; }
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
          {[["catalogo", "Cardapio"], ["carrinho", `Carrinho (${carrinho.length})`], ...(usuario ? [["pedidos", "Meus Pedidos"]] : [])].map(([k, v]) => (
            <button key={k} className={`nav-pill ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{v}</button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }} />

        <div className="client-user" style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          {usuario ? (
            <>
              <div style={{ fontSize: 12, color: "#78716c" }}>Ola, {usuario.nome.split(" ")[0]}</div>
              <button className="logout-btn" onClick={onLogout} style={{ padding: "6px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
                Sair
              </button>
            </>
          ) : (
            <button onClick={() => setShowAuthModal(true)} style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "#F38C24", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>
              Entrar
            </button>
          )}
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
                  const adTotal = (item.adicionais || []).reduce((s, a) => s + a.preco * (a.quantidade || 1), 0);
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

        {/* MEUS PEDIDOS */}
        {tab === "pedidos" && (
          <div className="anim">
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Meus Pedidos</div>

            {pedidos.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
                Voce ainda nao fez nenhum pedido.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {pedidos.map(p => {
                  const idx = STATUS_PIPELINE.indexOf(p.status);
                  const pct = p.status === "cancelado" ? 0 : ((idx + 1) / STATUS_PIPELINE.length) * 100;
                  return (
                    <div key={p.id} className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#7B4532" }}>Pedido #{p.id.slice(0, 6)}</span>
                          <span style={{ fontSize: 11, color: "#a8a29e", marginLeft: 8 }}>{new Date(p.created_at).toLocaleString("pt-BR")}</span>
                        </div>
                        <span style={{ background: STATUS_CORES[p.status].bg, color: STATUS_CORES[p.status].color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                          {STATUS_LABELS[p.status]}
                        </span>
                      </div>

                      {p.status !== "cancelado" && (
                        <div style={{ height: 6, background: "#f5f5f4", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: STATUS_CORES[p.status].color, borderRadius: 3, transition: "width 0.8s ease" }} />
                        </div>
                      )}

                      {/* Itens resumo com adicionais */}
                      <div style={{ fontSize: 12, color: "#78716c", marginBottom: 8 }}>
                        {p.itens?.map((item, idx) => {
                          const adTexto = item.adicionais && item.adicionais.length > 0
                            ? ` (+ ${item.adicionais.map(a => (a.quantidade || 1) > 1 ? `${a.quantidade}x ${a.nome}` : a.nome).join(", ")})`
                            : "";
                          return `${item.quantidade}x ${item.produto_nome}${adTexto}`;
                        }).join(", ")}
                      </div>
                      {p.obs && <div style={{ fontSize: 11, color: "#a8a29e", marginBottom: 8 }}>Obs: {p.obs}</div>}

                      {/* Endereço */}
                      {p.endereco_rua && (
                        <div style={{ fontSize: 11, color: "#57534e", marginBottom: 6, padding: "6px 10px", background: "#fafaf9", borderRadius: 6 }}>
                          <span style={{ fontWeight: 600 }}>Entrega:</span> {p.endereco_rua}{p.endereco_numero ? `, ${p.endereco_numero}` : ""} — {p.endereco_bairro}
                          {p.endereco_referencia ? ` (${p.endereco_referencia})` : ""}
                        </div>
                      )}

                      {/* Pagamento */}
                      {p.metodo_pagamento && (
                        <div style={{ fontSize: 11, color: "#57534e", marginBottom: 8 }}>
                          <span style={{ fontWeight: 600 }}>Pagamento:</span> {p.metodo_pagamento === "pix" ? "Pix" : p.metodo_pagamento === "credito" ? "Cartão de Crédito" : p.metodo_pagamento === "debito" ? "Cartão de Débito" : p.metodo_pagamento}
                        </div>
                      )}

                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 600, color: "#15803d" }}>{fmt(p.total)}</div>
                    </div>
                  );
                })}
              </div>
            )}
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
          enderecosSalvos={enderecosSalvos}
          totalCarrinho={totalCarrinho}
          onConfirm={enviarPedido}
          onClose={() => setModalCheckout(false)}
        />
      )}

      {/* Modal Auth */}
      {showAuthModal && (
        <ModalAuth
          onLogin={handleAuthSuccess}
          onClose={handleAuthClose}
          defaultMode={pendingProduct ? "registro" : "login"}
        />
      )}

      {/* Toast */}
      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}
