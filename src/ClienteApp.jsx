import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";
import { ImagemProduto } from "./Produtos";

// ─── CONFIGURAÇÕES DA MARCA ───────────────────────────────────────────────────
const WHATSAPP_NUMERO = "5518991589923"; // número do bot conectado

// ─── SLIDESHOW CLIENTE (modal de detalhe) ─────────────────────────────────────
function SlideshowModal({ produto }) {
  const [imagens, setImagens] = useState(produto.imagem ? [produto.imagem] : []);
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => {
    api.produtos.imagens.listar(produto.id).then(imgs => {
      if (imgs.length > 0) setImagens(imgs.map(i => i.imagem));
      else if (produto.imagem) setImagens([produto.imagem]);
      setIdx(0);
    }).catch(() => {});
  }, [produto.id]);

  const prev = () => setIdx(i => (i - 1 + imagens.length) % imagens.length);
  const next = () => setIdx(i => (i + 1) % imagens.length);
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
    touchStartX.current = null;
  };

  if (imagens.length === 0) return (
    <div style={{ width: "100%", height: 240, background: "var(--surface-warm)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 56, opacity: 0.35 }}>🍔</span>
    </div>
  );

  return (
    <div style={{ position: "relative", width: "100%", height: 260, background: "#5C2A0A", overflow: "hidden", userSelect: "none" }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <img src={imagens[idx]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      {imagens.length > 1 && (
        <>
          <button onClick={prev} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 38, height: 38, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <button onClick={next} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 38, height: 38, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
            {imagens.map((_, i) => (
              <div key={i} onClick={() => setIdx(i)}
                style={{ width: i === idx ? 22 : 7, height: 7, borderRadius: 4, background: i === idx ? "var(--brand)" : "rgba(255,255,255,0.7)", cursor: "pointer", transition: "width 0.2s", border: "1px solid rgba(0,0,0,0.15)" }} />
            ))}
          </div>
          <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12 }}>
            {idx + 1}/{imagens.length}
          </div>
        </>
      )}
    </div>
  );
}

const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const METODOS_PAGAMENTO = [
  { id: "pix", label: "Pix", icon: "⚡" },
  { id: "credito", label: "Cartão de Crédito", icon: "💳" },
  { id: "debito", label: "Cartão de Débito", icon: "💳" },
  { id: "dinheiro", label: "Dinheiro", icon: "💵" },
];

let uidCounter = 0;
function nextUid() { return `_${Date.now()}_${++uidCounter}`; }

// ─── HORÁRIO DE FUNCIONAMENTO — lido da API ───────────────────────────────────
async function fetchHorarioAberto() {
  try {
    const r = await fetch("/api/config/horario");
    if (!r.ok) return true;
    const data = await r.json();
    return !!data.aberto;
  } catch {
    return true;
  }
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// ─── ESTILOS COMPARTILHADOS ────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", padding: "11px 14px",
  border: "1.5px solid var(--border-dark)", borderRadius: 10,
  fontFamily: "'Nunito', sans-serif", fontSize: 14,
  outline: "none", color: "var(--text)", background: "var(--surface)",
  transition: "border-color 0.18s, box-shadow 0.18s",
};
const labelStyle = {
  display: "block", fontSize: 11, color: "var(--text-muted)",
  fontWeight: 800, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase",
};

// ─── MODAL CHECKOUT (INFO CLIENTE + ENDEREÇO + PAGAMENTO) ─────────────────────
function ModalCheckout({ onConfirm, onClose, totalCarrinho }) {
  const [etapa, setEtapa] = useState("cliente");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState("entrega");
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [referencia, setReferencia] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [metodoPagamento, setMetodoPagamento] = useState("");
  const [pixInfo, setPixInfo] = useState({ pix_key: "", pix_nome: "" });
  const [copiadoPix, setCopiadoPix] = useState(false);
  const [precisaTroco, setPrecisaTroco] = useState(false);
  const [trocoPara, setTrocoPara] = useState("");

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
  const enderecoValido = () => tipoEntrega === "retirada" || (rua.trim() && bairro.trim());

  const copiarPix = () => {
    navigator.clipboard.writeText(pixInfo.pix_key).then(() => {
      setCopiadoPix(true);
      setTimeout(() => setCopiadoPix(false), 2000);
    }).catch(() => {});
  };

  const parseValor = (s) => {
    if (!s) return 0;
    const limpo = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(limpo);
    return Number.isFinite(n) ? n : 0;
  };

  const trocoValido = () => {
    if (metodoPagamento !== "dinheiro") return true;
    if (!precisaTroco) return true;
    const v = parseValor(trocoPara);
    return v > totalCarrinho;
  };

  const confirmar = () => {
    const trocoNum = metodoPagamento === "dinheiro" && precisaTroco ? parseValor(trocoPara) : null;
    const enderecoFinal = tipoEntrega === "retirada"
      ? { cep: "", rua: "", numero: "", bairro: "", referencia: "" }
      : { cep: cep.replace(/\D/g, ""), rua, numero, bairro, referencia };
    onConfirm({
      cliente_nome: clienteNome.trim(),
      cliente_telefone: clienteTelefone.replace(/\D/g, ""),
      cliente_email: clienteEmail.trim(),
      endereco: enderecoFinal,
      metodo_pagamento: metodoPagamento,
      troco_para: trocoNum,
      tipo_entrega: tipoEntrega,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "var(--surface)", borderRadius: 18, padding: "26px 28px", width: 500, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", border: "1.5px solid var(--border)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>Finalizar Pedido</div>
          <button onClick={onClose} style={{ background: "var(--surface-warm)", border: "none", borderRadius: "50%", width: 34, height: 34, fontSize: 16, cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Etapas */}
        <div style={{ display: "flex", gap: 4, marginBottom: 22 }}>
          {[["cliente", "1. Seus Dados"], ["endereco", "2. Endereço"], ["pagamento", "3. Pagamento"]].map(([k, v]) => (
            <div key={k} style={{
              flex: 1, textAlign: "center", padding: "9px 0",
              borderBottom: `3px solid ${etapa === k ? "var(--brand)" : "var(--border)"}`,
              fontSize: 12, fontWeight: etapa === k ? 800 : 600,
              color: etapa === k ? "var(--brand)" : "var(--text-soft)",
              cursor: "pointer", transition: "all 0.2s",
              fontFamily: "'Nunito', sans-serif",
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
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Nome completo *</label>
              <input style={inputStyle} value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Seu nome completo" />
            </div>
            <div>
              <label style={labelStyle}>Telefone *</label>
              <input style={inputStyle} type="tel" value={clienteTelefone} onChange={e => setClienteTelefone(formatPhone(e.target.value))} placeholder="(18) 99999-0000" />
            </div>
            <div>
              <label style={labelStyle}>E-mail (opcional)</label>
              <input style={inputStyle} type="email" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="seu@email.com" />
            </div>
            <button onClick={() => { if (clienteValido()) setEtapa("endereco"); }}
              disabled={!clienteValido()}
              style={{ width: "100%", marginTop: 8, padding: 14, background: clienteValido() ? "var(--brand)" : "var(--border-dark)", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: clienteValido() ? "pointer" : "not-allowed", fontFamily: "'Nunito', sans-serif" }}>
              Continuar para endereço
            </button>
          </div>
        )}

        {/* ETAPA 2: ENDEREÇO / RETIRADA */}
        {etapa === "endereco" && (
          <div>
            <div style={{ ...labelStyle, marginBottom: 10 }}>Como prefere receber?</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button type="button" onClick={() => setTipoEntrega("entrega")}
                style={{ flex: 1, padding: "16px 12px", background: tipoEntrega === "entrega" ? "var(--brand-light)" : "var(--surface-warm)", color: tipoEntrega === "entrega" ? "var(--brand)" : "var(--text-muted)", border: `1.5px solid ${tipoEntrega === "entrega" ? "var(--brand)" : "var(--border-dark)"}`, borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 24 }}>🏠</span>
                <span>Entrega no endereço</span>
              </button>
              <button type="button" onClick={() => setTipoEntrega("retirada")}
                style={{ flex: 1, padding: "16px 12px", background: tipoEntrega === "retirada" ? "var(--brand-light)" : "var(--surface-warm)", color: tipoEntrega === "retirada" ? "var(--brand)" : "var(--text-muted)", border: `1.5px solid ${tipoEntrega === "retirada" ? "var(--brand)" : "var(--border-dark)"}`, borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 24 }}>🏪</span>
                <span>Retirar no estabelecimento</span>
              </button>
            </div>

            {tipoEntrega === "entrega" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>CEP</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={cep} onChange={e => handleCepChange(e.target.value)} placeholder="00000-000" maxLength={9} />
                    {buscandoCep && <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: "var(--brand)", fontWeight: 700, whiteSpace: "nowrap" }}>Buscando...</div>}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Rua / Logradouro *</label>
                  <input style={inputStyle} value={rua} onChange={e => setRua(e.target.value)} placeholder="Ex: Rua das Flores" />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Número</label>
                    <input style={inputStyle} value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>Bairro *</label>
                    <input style={inputStyle} value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Ex: Centro" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Referência</label>
                  <input style={inputStyle} value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ex: Portão azul, ao lado da padaria" />
                </div>
              </div>
            )}

            {tipoEntrega === "retirada" && (
              <div style={{ background: "var(--brand-light)", border: "1.5px solid var(--brand)", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 14, color: "var(--brand)", fontWeight: 800, marginBottom: 8, fontFamily: "'Syne', sans-serif" }}>🏪 Retirada no estabelecimento</div>
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>
                  Quando o pedido estiver pronto, você receberá um aviso pelo WhatsApp para vir buscar.
                </div>
              </div>
            )}

            <button onClick={() => { if (enderecoValido()) setEtapa("pagamento"); }}
              disabled={!enderecoValido()}
              style={{ width: "100%", marginTop: 22, padding: 14, background: enderecoValido() ? "var(--brand)" : "var(--border-dark)", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: enderecoValido() ? "pointer" : "not-allowed", fontFamily: "'Nunito', sans-serif" }}>
              Continuar para pagamento
            </button>
          </div>
        )}

        {/* ETAPA 3: PAGAMENTO */}
        {etapa === "pagamento" && (
          <div>
            <div style={{ ...labelStyle, marginBottom: 12 }}>Escolha o método de pagamento</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {METODOS_PAGAMENTO.map(m => (
                <label key={m.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
                  background: metodoPagamento === m.id ? "var(--brand-light)" : "var(--surface-warm)",
                  border: `1.5px solid ${metodoPagamento === m.id ? "var(--brand)" : "var(--border-dark)"}`,
                  borderRadius: 12, cursor: "pointer", transition: "all 0.15s",
                }}>
                  <input type="radio" name="pagamento" checked={metodoPagamento === m.id} onChange={() => setMetodoPagamento(m.id)} style={{ accentColor: "var(--brand)" }} />
                  <span style={{ fontSize: 20 }}>{m.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{m.label}</span>
                </label>
              ))}
            </div>

            {metodoPagamento === "pix" && pixInfo.pix_key && (
              <div style={{ background: "var(--brand-light)", border: "1.5px solid var(--brand)", borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--brand)", marginBottom: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Dados para Pix</div>
                <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>
                  <span style={{ fontWeight: 800 }}>Chave:</span> {pixInfo.pix_key}
                </div>
                <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 12 }}>
                  <span style={{ fontWeight: 800 }}>Nome:</span> {pixInfo.pix_nome}
                </div>
                <button onClick={copiarPix}
                  style={{ background: copiadoPix ? "var(--new-green)" : "var(--brand)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif", transition: "background 0.2s" }}>
                  {copiadoPix ? "✓ Copiado!" : "Copiar chave Pix"}
                </button>
              </div>
            )}

            {metodoPagamento === "dinheiro" && (
              <div style={{ background: "var(--surface-warm)", border: "1.5px solid var(--border-dark)", borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", marginBottom: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Pagamento em dinheiro</div>

                <div style={{ display: "flex", gap: 8, marginBottom: precisaTroco ? 14 : 0 }}>
                  <button type="button" onClick={() => { setPrecisaTroco(false); setTrocoPara(""); }}
                    style={{ flex: 1, padding: "11px 12px", background: !precisaTroco ? "var(--brand)" : "var(--surface)", color: !precisaTroco ? "#fff" : "var(--text-muted)", border: `1.5px solid ${!precisaTroco ? "var(--brand)" : "var(--border-dark)"}`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                    Não preciso de troco
                  </button>
                  <button type="button" onClick={() => setPrecisaTroco(true)}
                    style={{ flex: 1, padding: "11px 12px", background: precisaTroco ? "var(--brand)" : "var(--surface)", color: precisaTroco ? "#fff" : "var(--text-muted)", border: `1.5px solid ${precisaTroco ? "var(--brand)" : "var(--border-dark)"}`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                    Preciso de troco
                  </button>
                </div>

                {precisaTroco && (
                  <div>
                    <label style={labelStyle}>Troco para quanto? *</label>
                    <input
                      style={inputStyle}
                      value={trocoPara}
                      onChange={e => setTrocoPara(e.target.value)}
                      placeholder="Ex: 100,00"
                      inputMode="decimal"
                    />
                    {trocoPara && parseValor(trocoPara) > 0 && parseValor(trocoPara) <= totalCarrinho && (
                      <div style={{ fontSize: 12, color: "var(--hot)", marginTop: 6, fontWeight: 700 }}>
                        O valor precisa ser maior que o total ({fmt(totalCarrinho)}).
                      </div>
                    )}
                    {trocoPara && parseValor(trocoPara) > totalCarrinho && (
                      <div style={{ fontSize: 13, color: "var(--new-green)", marginTop: 6, fontWeight: 800 }}>
                        Levaremos troco de {fmt(parseValor(trocoPara) - totalCarrinho)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ borderTop: "2px solid var(--border)", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-soft)", fontWeight: 800, letterSpacing: "0.08em" }}>TOTAL DO PEDIDO</div>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 26, fontWeight: 800, color: "var(--brand)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>{fmt(totalCarrinho)}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEtapa("endereco")}
                  style={{ padding: "12px 20px", background: "var(--surface)", border: "1.5px solid var(--border-dark)", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", color: "var(--text-muted)" }}>
                  Voltar
                </button>
                <button onClick={confirmar}
                  disabled={!metodoPagamento || !trocoValido()}
                  style={{ padding: "12px 26px", background: (metodoPagamento && trocoValido()) ? "var(--brand)" : "var(--border-dark)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: (metodoPagamento && trocoValido()) ? "pointer" : "not-allowed", fontFamily: "'Nunito', sans-serif" }}>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "var(--surface)", borderRadius: 18, padding: "26px 28px", width: 440, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", border: "1.5px solid var(--border)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>Adicionais</div>
          <button onClick={onClose} style={{ background: "var(--surface-warm)", border: "none", borderRadius: "50%", width: 34, height: 34, fontSize: 16, cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18, padding: "14px 16px", background: "var(--surface-warm)", borderRadius: 12 }}>
          <ImagemProduto src={produto.imagem} tamanho={52} borderRadius={10} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: "var(--text)" }}>{produto.nome}</div>
            <div style={{ fontSize: 14, color: "var(--brand)", fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", marginTop: 2 }}>{fmt(produto.preco)}</div>
          </div>
        </div>

        <div style={{ ...labelStyle, marginBottom: 10 }}>Escolha seus adicionais</div>

        {adicionais.length === 0 ? (
          <div style={{ padding: 18, textAlign: "center", color: "var(--text-soft)", fontSize: 13, background: "var(--surface-warm)", borderRadius: 10 }}>Nenhum adicional disponível.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            {adicionais.map(ad => {
              const sel = selecionados.find(s => s.id === ad.id);
              const qtd = sel ? sel.quantidade : 0;
              return (
                <div key={ad.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                  background: qtd > 0 ? "var(--brand-light)" : "var(--surface)",
                  border: `1.5px solid ${qtd > 0 ? "var(--brand)" : "var(--border-dark)"}`,
                  borderRadius: 10, transition: "all 0.15s",
                }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{ad.nome}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--brand)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>+ {fmt(ad.preco)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => updateQtdAd(ad, -1)} disabled={qtd === 0}
                      style={{ width: 28, height: 28, border: "1.5px solid var(--border-dark)", borderRadius: 6, background: "var(--surface)", cursor: qtd > 0 ? "pointer" : "default", fontSize: 16, lineHeight: 1, color: qtd > 0 ? "var(--text)" : "var(--text-soft)", fontWeight: 700 }}>−</button>
                    <span style={{ fontSize: 13, fontWeight: 800, minWidth: 22, textAlign: "center", color: "var(--text)" }}>{qtd}</span>
                    <button onClick={() => updateQtdAd(ad, 1)}
                      style={{ width: 28, height: 28, border: "1.5px solid var(--border-dark)", borderRadius: 6, background: "var(--surface)", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "var(--text)", fontWeight: 700 }}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: "2px solid var(--border)", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-soft)", fontWeight: 800, letterSpacing: "0.08em" }}>TOTAL DO ITEM</div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, color: "var(--brand)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" }}>{fmt(totalItem)}</div>
          </div>
          <button onClick={() => onConfirm(selecionados)}
            style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
            Adicionar ao carrinho
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BANNER FECHADO EXPANSÍVEL ───────────────────────────────────────────────
function BannerFechado() {
  const [expandido, setExpandido] = useState(false);
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const diasAbertos = [2, 3, 4, 5, 6, 0]; // Ter–Dom

  return (
    <div style={{ background: "var(--surface-warm)", borderBottom: "1px solid var(--border)" }}>
      <button onClick={() => setExpandido(v => !v)} style={{
        width: "100%", background: "none", border: "none", cursor: "pointer",
        color: "var(--text-muted)", padding: "11px 24px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        fontSize: 13.5, fontWeight: 700, fontFamily: "'Nunito', sans-serif",
      }}>
        <span style={{ width: 8, height: 8, background: "var(--hot)", borderRadius: "50%", animation: "nlpulse 2s infinite" }} />
        <span>Estabelecimento fechado no momento</span>
        <span style={{ marginLeft: 4, color: "var(--brand)", fontWeight: 800 }}>
          {expandido ? "Ocultar ▴" : "Ver horários ▾"}
        </span>
      </button>

      {expandido && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "18px 24px 22px", animation: "fi 0.2s ease" }}>
          <div style={{ ...labelStyle, marginBottom: 12, color: "var(--text-muted)" }}>Dias de funcionamento</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {DIAS.map((d, i) => {
              const ativo = diasAbertos.includes(i);
              return (
                <div key={d} style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800,
                  background: ativo ? "var(--brand)" : "var(--surface)",
                  color: ativo ? "#fff" : "var(--text-soft)",
                  border: ativo ? "none" : "1.5px solid var(--border-dark)",
                  fontFamily: "'Nunito', sans-serif",
                }}>
                  {d}
                </div>
              );
            })}
          </div>

          <div style={{ ...labelStyle, marginBottom: 12 }}>Horário</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ background: "var(--surface)", borderRadius: 12, padding: "12px 22px", textAlign: "center", border: "1.5px solid var(--border-dark)" }}>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: "var(--text)", letterSpacing: "-0.5px" }}>19:00</div>
              <div style={{ fontSize: 10, color: "var(--text-soft)", marginTop: 2, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Abre</div>
            </div>
            <div style={{ color: "var(--text-soft)", fontSize: 20 }}>→</div>
            <div style={{ background: "var(--surface)", borderRadius: 12, padding: "12px 22px", textAlign: "center", border: "1.5px solid var(--border-dark)" }}>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: "var(--text)", letterSpacing: "-0.5px" }}>01:00</div>
              <div style={{ fontSize: 10, color: "var(--text-soft)", marginTop: 2, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Fecha</div>
            </div>
            <div style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, fontWeight: 600 }}>
              Horário de Brasília.<br />Volta amanhã? 😊
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CARD DE PRODUTO ──────────────────────────────────────────────────────────
function CardProduto({ p, catPermiteAdicionais, adicionaisDisponiveis, onVerDetalhes, onAdd }) {
  const podePersonalizar = catPermiteAdicionais[p.categoria] && adicionaisDisponiveis.length > 0;

  // Cor de fundo + emoji por categoria (palette quente)
  const cfgPorCat = {
    "Hambúrgueres": { bg: "#5C2A0A", emoji: "🍔" },
    "Hamburgueres": { bg: "#5C2A0A", emoji: "🍔" },
    "Beirutes":     { bg: "#6B1A1A", emoji: "🥙" },
    "Lanches":      { bg: "#2A4A18", emoji: "🥪" },
    "Salgados":     { bg: "#7A5A18", emoji: "🥟" },
    "Porções":      { bg: "#4A3214", emoji: "🍟" },
    "Porcoes":      { bg: "#4A3214", emoji: "🍟" },
    "Bebidas":      { bg: "#12305A", emoji: "🥤" },
    "Sobremesas":   { bg: "#5C1A4A", emoji: "🍰" },
  };
  const cfg = cfgPorCat[p.categoria] || { bg: "#5C2A0A", emoji: "🍽️" };
  const bgImg = cfg.bg;

  return (
    <div onClick={() => onVerDetalhes(p)} style={{
      background: "var(--surface)",
      border: "1.5px solid var(--border)",
      borderRadius: 16,
      overflow: "hidden",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      transition: "border-color 0.2s, transform 0.15s",
      position: "relative",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = ""; }}
    >
      {/* Imagem com fundo quente — emoji da categoria quando não há foto */}
      <div style={{
        width: "100%",
        aspectRatio: "3/2",
        background: bgImg,
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {p.imagem ? (
          <img src={p.imagem} alt={p.nome}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <span style={{ fontSize: 56, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.35))", position: "relative", zIndex: 1 }}>
            {cfg.emoji}
          </span>
        )}
        {/* Gradiente sutil */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at center, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.18) 100%)", pointerEvents: "none" }} />
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6, lineHeight: 1.25, letterSpacing: "-0.2px" }}>
          {p.nome}
        </div>
        {p.descricao && (
          <div style={{
            fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5,
            marginBottom: 10, flex: 1,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {p.descricao}
          </div>
        )}
        {podePersonalizar && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 12, fontWeight: 800, color: "var(--brand)",
            background: "var(--brand-light)", padding: "3px 10px",
            borderRadius: 100, marginBottom: 10, width: "fit-content",
          }}>
            ✦ Personalizável
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--brand)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" }}>
            {fmt(p.preco)}
          </span>
          <button onClick={e => { e.stopPropagation(); onAdd(p); }}
            style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0, transition: "background 0.18s" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--brand-dark)"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--brand)"}
          >
            + Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DETALHE DO PRODUTO ─────────────────────────────────────────────────
function ModalProduto({ produto, adicionais, permiteAdicionais, aberto, onAddSimples, onAddComAdicionais, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300,
      display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--surface)", borderRadius: "22px 22px 0 0", width: "100%", maxWidth: 580,
        maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 -10px 50px rgba(0,0,0,0.25)",
        animation: "slideUp 0.3s cubic-bezier(.32,.72,0,1)",
        border: "1.5px solid var(--border)",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0", background: "var(--surface)" }}>
          <div style={{ width: 40, height: 4, background: "var(--border-dark)", borderRadius: 2 }} />
        </div>

        {/* Slideshow */}
        <div style={{ marginTop: 8 }}>
          <SlideshowModal produto={produto} />
        </div>

        {/* Conteúdo */}
        <div style={{ padding: "22px 24px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, lineHeight: 1.2, color: "var(--text)", letterSpacing: "-0.5px" }}>
              {produto.nome}
            </div>
            <button onClick={onClose} style={{ background: "var(--surface-warm)", border: "none", borderRadius: "50%", width: 34, height: 34, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--text-muted)" }}>✕</button>
          </div>

          {produto.descricao && (
            <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 18, fontWeight: 500 }}>{produto.descricao}</p>
          )}

          {permiteAdicionais && adicionais.length > 0 && (
            <div style={{ background: "var(--brand-light)", border: "1.5px solid var(--brand)", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "var(--brand)", fontWeight: 700 }}>
              ✦ Personalize com adicionais após clicar em adicionar
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 32, fontWeight: 800, color: "var(--brand)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.8px" }}>
              {fmt(produto.preco)}
            </div>
          </div>

          {!aberto ? (
            <div style={{ marginTop: 18, background: "var(--brand-light)", borderRadius: 12, padding: "14px 16px", fontSize: 13, color: "var(--hot)", fontWeight: 700, textAlign: "center", border: "1.5px solid var(--hot)" }}>
              🔒 Estabelecimento fechado. Volte entre Ter–Dom, das 19h às 01h.
            </div>
          ) : (
            <button
              onClick={() => { permiteAdicionais && adicionais.length > 0 ? onAddComAdicionais(produto) : onAddSimples(produto, []); onClose(); }}
              style={{ marginTop: 18, width: "100%", padding: "16px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif", transition: "background 0.18s" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--brand-dark)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--brand)"}
            >
              + Adicionar ao carrinho
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ÍCONES SVG (lua/sol/whatsapp) ────────────────────────────────────────────
function IconMoon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
}
function IconSun() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>;
}
function IconWhatsapp() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413"/></svg>;
}

// ─── MEUS PEDIDOS (Cliente — read-only, autenticado por telefone) ────────────
const STATUS_PIPELINE_CLI = ["pendente", "confirmado", "preparando", "pronto", "entregue"];
const STATUS_LABELS_CLI = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
const STATUS_EMOJI_CLI = {
  pendente: "⏳",
  confirmado: "✅",
  preparando: "🍳",
  pronto: "🛵",
  entregue: "🎉",
  cancelado: "❌",
};
const STATUS_DESC_CLI = {
  pendente: "Aguardando confirmação do estabelecimento",
  confirmado: "Pedido confirmado, será preparado em breve",
  preparando: "Seu pedido está sendo preparado agora",
  pronto: "Pronto! Saindo para entrega ou disponível para retirada",
  entregue: "Pedido entregue. Bom apetite!",
  cancelado: "Pedido cancelado",
};

const parseDateUTCCli = (str) => {
  if (!str) return new Date(NaN);
  if (str instanceof Date) return str;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str);
  return new Date(str.replace(" ", "T") + "Z");
};

function StatusPipelineCli({ status }) {
  if (status === "cancelado") {
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: "rgba(239,68,68,0.12)", color: "#dc2626",
        padding: "8px 14px", borderRadius: 999,
        fontSize: 13, fontWeight: 800, fontFamily: "'Nunito', sans-serif",
        border: "1.5px solid rgba(239,68,68,0.3)",
      }}>
        ❌ CANCELADO
      </div>
    );
  }
  const idx = STATUS_PIPELINE_CLI.indexOf(status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", justifyContent: "space-between" }}>
      {STATUS_PIPELINE_CLI.map((s, i) => {
        const ativo = i <= idx;
        const atual = i === idx;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: i < STATUS_PIPELINE_CLI.length - 1 ? 1 : "0 0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 56 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: ativo ? "var(--brand)" : "var(--surface-warm)",
                color: ativo ? "#fff" : "var(--text-muted)",
                border: atual ? "3px solid var(--brand)" : `2px solid ${ativo ? "var(--brand)" : "var(--border-dark)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 800,
                boxShadow: atual ? "0 0 0 4px rgba(243,140,36,0.18)" : "none",
                transition: "all 0.2s",
              }}>
                {i < idx ? "✓" : STATUS_EMOJI_CLI[s]}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 800,
                color: ativo ? "var(--text)" : "var(--text-muted)",
                fontFamily: "'Nunito', sans-serif",
                textTransform: "uppercase", letterSpacing: "0.05em",
                textAlign: "center",
              }}>
                {STATUS_LABELS_CLI[s]}
              </span>
            </div>
            {i < STATUS_PIPELINE_CLI.length - 1 && (
              <div style={{
                flex: 1, height: 3, minWidth: 14,
                background: i < idx ? "var(--brand)" : "var(--border-dark)",
                borderRadius: 2, marginTop: -16,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MeusPedidosView({ ativo }) {
  const [telefone, setTelefone] = useState(() => localStorage.getItem("nl_meus_pedidos_telefone") || "");
  const [confirmado, setConfirmado] = useState(() => Boolean(localStorage.getItem("nl_meus_pedidos_telefone")));
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [expandido, setExpandido] = useState(null);

  const fmtBR = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtData = (iso) => {
    const d = parseDateUTCCli(iso);
    const data = d.toLocaleDateString("pt-BR");
    const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${data} às ${hora}`;
  };

  const buscar = useCallback(async () => {
    const num = telefone.replace(/\D/g, "");
    if (num.length < 10) { setErro("Digite um telefone válido com DDD"); return; }
    setLoading(true);
    setErro("");
    try {
      const lista = await api.pedidos.meusPedidos(num);
      setPedidos(lista);
    } catch (e) {
      setErro(e.message || "Erro ao carregar pedidos");
    } finally {
      setLoading(false);
    }
  }, [telefone]);

  // Carrega ao confirmar/abrir
  useEffect(() => {
    if (confirmado && ativo) buscar();
  }, [confirmado, ativo, buscar]);

  // Auto-refresh a cada 15s enquanto a tab estiver ativa
  useEffect(() => {
    if (!confirmado || !ativo) return;
    const id = setInterval(buscar, 15000);
    return () => clearInterval(id);
  }, [confirmado, ativo, buscar]);

  const confirmar = () => {
    const num = telefone.replace(/\D/g, "");
    if (num.length < 10) { setErro("Digite um telefone válido com DDD"); return; }
    localStorage.setItem("nl_meus_pedidos_telefone", telefone);
    setConfirmado(true);
  };

  const trocarTelefone = () => {
    localStorage.removeItem("nl_meus_pedidos_telefone");
    setConfirmado(false);
    setPedidos([]);
    setExpandido(null);
  };

  // ─── Tela de digitar telefone ────────────────────────────────────────
  if (!confirmado) {
    return (
      <div className="nl-anim" style={{ maxWidth: 520, margin: "40px auto 0" }}>
        <div style={{
          background: "var(--surface)", border: "1.5px solid var(--border)",
          borderRadius: 18, padding: "32px 28px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>📋</div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 24, fontWeight: 800, color: "var(--text)", marginBottom: 6, letterSpacing: "-0.3px" }}>
              Meus Pedidos
            </div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.5, fontFamily: "'Nunito', sans-serif" }}>
              Digite o telefone que você usou no pedido para acompanhar o status em tempo real.
            </div>
          </div>

          <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase", fontFamily: "'Nunito', sans-serif" }}>
            Seu telefone
          </label>
          <input
            type="tel"
            value={telefone}
            onChange={e => { setTelefone(formatPhone(e.target.value)); setErro(""); }}
            onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
            placeholder="(11) 99999-9999"
            autoFocus
            style={{
              width: "100%", padding: "13px 16px", fontSize: 16, fontWeight: 700,
              border: `1.5px solid ${erro ? "#dc2626" : "var(--border-dark)"}`,
              borderRadius: 12, outline: "none",
              color: "var(--text)", background: "var(--surface-warm)",
              fontFamily: "'Nunito', sans-serif", textAlign: "center",
              letterSpacing: "0.5px",
            }}
          />
          {erro && <div style={{ fontSize: 12, color: "#dc2626", marginTop: 8, fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>{erro}</div>}

          <button
            onClick={confirmar}
            style={{
              width: "100%", marginTop: 18, padding: 14,
              background: "var(--brand)", color: "#fff",
              border: "none", borderRadius: 12,
              fontSize: 15, fontWeight: 800, cursor: "pointer",
              fontFamily: "'Nunito', sans-serif",
              transition: "transform 0.1s",
            }}
            onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
            onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
            Ver meus pedidos
          </button>

          <div style={{ marginTop: 14, padding: 12, background: "var(--surface-warm)", borderRadius: 10, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, fontFamily: "'Nunito', sans-serif" }}>
            🔒 Seu telefone fica salvo apenas no seu navegador. Você pode trocar a qualquer momento.
          </div>
        </div>
      </div>
    );
  }

  // ─── Lista de pedidos ────────────────────────────────────────────────
  return (
    <div className="nl-anim">
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 22, gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 24, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>
            📋 Meus Pedidos
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2, fontFamily: "'Nunito', sans-serif", fontWeight: 600 }}>
            Telefone: <span style={{ color: "var(--text)", fontWeight: 800 }}>{telefone}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={buscar} disabled={loading}
            style={{
              padding: "9px 14px", background: "var(--surface)", color: "var(--text)",
              border: "1.5px solid var(--border-dark)", borderRadius: 10,
              fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer",
              fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", gap: 6,
            }}>
            {loading ? "Atualizando..." : "🔄 Atualizar"}
          </button>
          <button onClick={trocarTelefone}
            style={{
              padding: "9px 14px", background: "var(--surface)", color: "var(--text-muted)",
              border: "1.5px solid var(--border-dark)", borderRadius: 10,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Nunito', sans-serif",
            }}>
            Trocar telefone
          </button>
        </div>
      </div>

      {loading && pedidos.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)", fontFamily: "'Nunito', sans-serif", fontSize: 14, fontWeight: 700 }}>
          Carregando pedidos...
        </div>
      ) : pedidos.length === 0 ? (
        <div style={{
          background: "var(--surface)", border: "1.5px solid var(--border)",
          borderRadius: 18, padding: "60px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🍔</div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 6, letterSpacing: "-0.2px" }}>
            Nenhum pedido encontrado
          </div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", fontFamily: "'Nunito', sans-serif", lineHeight: 1.5 }}>
            Ainda não temos pedidos com este telefone.<br/>
            Que tal fazer o seu primeiro?
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {pedidos.map(p => {
            const aberto = expandido === p.id;
            const corStatus = p.status === "cancelado" ? "#dc2626" : p.status === "entregue" ? "#16a34a" : "var(--brand)";
            const isRetirada = p.tipo_entrega === "retirada" || (!p.endereco_rua && p.tipo_entrega !== "entrega");
            return (
              <div key={p.id} style={{
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: 16, overflow: "hidden",
                boxShadow: "0 4px 14px rgba(0,0,0,0.04)",
              }}>
                {/* Cabeçalho */}
                <div onClick={() => setExpandido(aberto ? null : p.id)}
                  style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: p.status === "cancelado" ? "rgba(239,68,68,0.12)" : "var(--brand-light)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, flexShrink: 0,
                  }}>
                    {STATUS_EMOJI_CLI[p.status] || "📦"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.2px" }}>
                        Pedido <span style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, color: "var(--text-muted)", fontSize: 14 }}>#{p.id.slice(0, 6).toUpperCase()}</span>
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                        background: p.status === "cancelado" ? "rgba(239,68,68,0.12)" : p.status === "entregue" ? "rgba(22,163,74,0.12)" : "var(--brand-light)",
                        color: corStatus,
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        fontFamily: "'Nunito', sans-serif",
                      }}>
                        {STATUS_LABELS_CLI[p.status]}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'Nunito', sans-serif", fontWeight: 600 }}>
                      {fmtData(p.created_at)} • {p.itens?.length || 0} {p.itens?.length === 1 ? "item" : "itens"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 19, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>
                      {fmtBR(p.total)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginTop: 2 }}>
                      {aberto ? "▲ Recolher" : "▼ Ver detalhes"}
                    </div>
                  </div>
                </div>

                {/* Detalhes */}
                {aberto && (
                  <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
                    {/* Pipeline */}
                    <div style={{ padding: "20px 0 16px" }}>
                      <StatusPipelineCli status={p.status} />
                    </div>

                    {/* Mensagem do status */}
                    <div style={{
                      background: p.status === "cancelado" ? "rgba(239,68,68,0.08)" : "var(--brand-light)",
                      border: `1.5px solid ${p.status === "cancelado" ? "rgba(239,68,68,0.25)" : "var(--brand)"}`,
                      borderRadius: 10, padding: "10px 14px",
                      marginBottom: 14,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: p.status === "cancelado" ? "#dc2626" : "var(--brand)", fontFamily: "'Nunito', sans-serif" }}>
                        {STATUS_EMOJI_CLI[p.status]} {STATUS_DESC_CLI[p.status]}
                      </div>
                    </div>

                    {/* Itens */}
                    <div style={{
                      background: "var(--surface-warm)", borderRadius: 10,
                      padding: "12px 16px", marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase", fontFamily: "'Nunito', sans-serif" }}>
                        Itens do pedido
                      </div>
                      {p.itens?.map((item, i) => {
                        const adTotal = (item.adicionais || []).reduce((s, a) => s + a.preco * (a.quantidade || 1), 0);
                        const itemTotal = (item.preco_unitario + adTotal) * item.quantidade;
                        return (
                          <div key={i} style={{ padding: "8px 0", borderBottom: i < p.itens.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontFamily: "'Nunito', sans-serif", color: "var(--text)" }}>
                              <span style={{ fontWeight: 700 }}>{item.quantidade}× {item.produto_nome}</span>
                              <span style={{ fontWeight: 800 }}>{fmtBR(itemTotal)}</span>
                            </div>
                            {item.adicionais && item.adicionais.length > 0 && (
                              <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {item.adicionais.map(a => (
                                  <span key={a.id || a.nome} style={{
                                    fontSize: 11, fontWeight: 700,
                                    background: "var(--brand-light)", color: "var(--brand)",
                                    padding: "2px 8px", borderRadius: 4, fontFamily: "'Nunito', sans-serif",
                                  }}>
                                    {(a.quantidade || 1) > 1 ? `${a.quantidade}× ` : "+ "}{a.nome}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Observação */}
                    {p.obs && (
                      <div style={{
                        background: "rgba(245,158,11,0.1)", border: "1.5px solid rgba(245,158,11,0.4)",
                        borderRadius: 10, padding: "10px 14px", marginBottom: 12,
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "#92400e", letterSpacing: "0.08em", marginBottom: 3, fontFamily: "'Nunito', sans-serif" }}>
                          📝 OBSERVAÇÃO
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "'Nunito', sans-serif" }}>
                          {p.obs}
                        </div>
                      </div>
                    )}

                    {/* Tipo de entrega */}
                    <div style={{
                      background: "var(--surface-warm)", borderRadius: 10,
                      padding: "10px 14px", marginBottom: 8, fontSize: 13, fontFamily: "'Nunito', sans-serif", color: "var(--text)",
                    }}>
                      {isRetirada ? (
                        <><span style={{ fontWeight: 800 }}>🏪 Retirada no estabelecimento</span></>
                      ) : (
                        <>
                          <div style={{ fontWeight: 800, marginBottom: 2 }}>🏠 Entrega no endereço</div>
                          <div style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                            {p.endereco_rua}, {p.endereco_numero} — {p.endereco_bairro}
                            {p.endereco_referencia && <> ({p.endereco_referencia})</>}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Pagamento */}
                    {p.metodo_pagamento && (() => {
                      const labels = { pix: "⚡ Pix", credito: "💳 Cartão de Crédito", debito: "💳 Cartão de Débito", cartao: "💳 Cartão", dinheiro: "💵 Dinheiro" };
                      const label = labels[p.metodo_pagamento] || p.metodo_pagamento;
                      const trocoNum = Number(p.troco_para || 0);
                      const totalNum = Number(p.total || 0);
                      const mostraTroco = p.metodo_pagamento === "dinheiro" && trocoNum > 0 && trocoNum > totalNum;
                      return (
                        <div style={{
                          background: "var(--surface-warm)", borderRadius: 10,
                          padding: "10px 14px", fontSize: 13, fontFamily: "'Nunito', sans-serif", color: "var(--text)",
                        }}>
                          <span style={{ fontWeight: 800 }}>Pagamento:</span> {label}
                          {p.metodo_pagamento === "dinheiro" && (
                            mostraTroco
                              ? <> — Troco para {fmtBR(trocoNum)} <span style={{ color: "#15803d", fontWeight: 700 }}>(devolver {fmtBR(trocoNum - totalNum)})</span></>
                              : <> — Sem troco</>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CLIENTE APP ──────────────────────────────────────────────────────────────
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
  const [modalProduto, setModalProduto] = useState(null);

  // Tema (light/dark) com persistência
  const [tema, setTema] = useState(() => {
    try { return localStorage.getItem("nl-theme") || "light"; }
    catch { return "light"; }
  });
  useEffect(() => {
    try { localStorage.setItem("nl-theme", tema); } catch {}
    // Sincroniza body/html com o tema do app
    const bg = tema === "dark" ? "#120A04" : "#FFF9F4";
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    document.documentElement.style.setProperty("--nl-bg-current", bg);
  }, [tema]);
  const toggleTema = () => setTema(t => t === "light" ? "dark" : "light");

  const showToast = (msg, cor) => { setToast({ msg, cor: cor || "var(--brand)" }); setTimeout(() => setToast(""), 3500); };

  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    fetchHorarioAberto().then(setAberto);
    const t = setInterval(() => fetchHorarioAberto().then(setAberto), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

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
      showToast("Erro: " + err.message, "var(--hot)");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirModalProduto = (produto) => setModalProduto(produto);

  const handleAddProduto = (produto) => {
    if (!aberto) {
      showToast("🔒 Estabelecimento fechado no momento. Volte de Ter–Dom, das 19h às 01h.", "var(--hot)");
      return;
    }
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
    showToast(`${produto.nome} adicionado!`, "var(--new-green)");
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

  const enviarPedido = async ({ cliente_nome, cliente_telefone, cliente_email, endereco, metodo_pagamento, troco_para, tipo_entrega }) => {
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
        troco_para,
        tipo_entrega,
        endereco,
      });
      setCarrinho([]);
      setObs("");
      setModalCheckout(false);
      setPedidoEnviado(novo);
      setTab("confirmacao");
      showToast("Pedido enviado com sucesso!", "var(--new-green)");
    } catch (err) {
      showToast("Erro: " + err.message, "var(--hot)");
    } finally {
      setEnviando(false);
    }
  };

  const [busca, setBusca] = useState("");
  const [catAtiva, setCatAtiva] = useState(null);

  const categoriasComProdutos = categorias
    .map(c => c.nome)
    .filter(nome => produtos.some(p => p.categoria === nome));

  const semCategoria = produtos.filter(p => !p.categoria);

  const produtosFiltrados = busca.trim()
    ? produtos.filter(p =>
        p.nome.toLowerCase().includes(busca.toLowerCase()) ||
        (p.descricao || "").toLowerCase().includes(busca.toLowerCase())
      )
    : produtos;

  const scrollParaCategoria = (cat) => {
    setCatAtiva(cat);
    const el = document.getElementById(`cat-sec-${cat.replace(/\s+/g, "-")}`);
    if (el) {
      const offset = 130;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (busca.trim() || tab !== "catalogo") return;
    const handleScroll = () => {
      const offset = 150;
      for (let i = categoriasComProdutos.length - 1; i >= 0; i--) {
        const cat = categoriasComProdutos[i];
        const el = document.getElementById(`cat-sec-${cat.replace(/\s+/g, "-")}`);
        if (el && el.getBoundingClientRect().top <= offset) {
          setCatAtiva(cat);
          return;
        }
      }
      if (categoriasComProdutos.length > 0) setCatAtiva(categoriasComProdutos[0]);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [categoriasComProdutos, busca, tab]);

  // ─── ESTILOS GLOBAIS DO TEMA ────────────────────────────────────────────────
  const themeStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Nunito:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');

    /* Override do index.css que constrange #root */
    html, body { margin: 0 !important; padding: 0 !important; background: var(--nl-bg-current, #FFF9F4); }
    #root {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      text-align: left !important;
      display: block !important;
      min-height: 100vh;
    }

    .nl-app {
      --bg:           #FFF9F4;
      --surface:      #FFFFFF;
      --surface-warm: #FFF2E6;
      --brand:        #E8650A;
      --brand-dark:   #C0510A;
      --brand-light:  #FEEADA;
      --dark:         #1C0F05;
      --text:         #2B1608;
      --text-muted:   #9A6E50;
      --text-soft:    #C49878;
      --border:       #EDD9C5;
      --border-dark:  #D8BFA8;
      --hot:          #DC2626;
      --new-green:    #059669;
    }
    .nl-app[data-theme="dark"] {
      --bg:           #120A04;
      --surface:      #1E1008;
      --surface-warm: #251408;
      --brand:        #F07020;
      --brand-dark:   #D05C10;
      --brand-light:  #3A1A06;
      --dark:         #0E0804;
      --text:         #F5E8D8;
      --text-muted:   #C09070;
      --text-soft:    #7A5540;
      --border:       #2E1A0A;
      --border-dark:  #3E2414;
      --hot:          #EF4444;
      --new-green:    #10B981;
    }

    .nl-app, .nl-app * { box-sizing: border-box; }
    .nl-app { font-family: 'Nunito', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

    /* Fonte dos preços */
    .nl-price {
      font-family: 'Plus Jakarta Sans', sans-serif !important;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.3px;
    }

    @keyframes nlpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    @keyframes fi { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideUp { from { transform: translateY(60px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    .nl-anim { animation: fi 0.25s ease; }

    .nl-search:focus {
      border-color: var(--brand) !important;
      box-shadow: 0 0 0 3px rgba(232,101,10,0.1);
    }

    .nl-cat-nav::-webkit-scrollbar { display: none; }
    .nl-cat-nav { scrollbar-width: none; }

    .nl-toast {
      position: fixed; bottom: 92px; right: 24px;
      padding: 14px 22px; border-radius: 12px;
      font-size: 13.5px; font-weight: 700; z-index: 999;
      animation: fi 0.3s ease; color: #fff;
      box-shadow: 0 8px 28px rgba(0,0,0,0.25);
      max-width: 360px;
      font-family: 'Nunito', sans-serif;
    }

    /* Responsivo */
    .nl-product-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    @media (max-width: 740px) {
      .nl-product-grid { grid-template-columns: repeat(2, 1fr); }
      .nl-nav-tabs { display: none !important; }
      .nl-nav-tabs-mobile { display: flex !important; }
      .nl-cta-label { display: none; }
    }
    @media (max-width: 460px) {
      .nl-product-grid { grid-template-columns: 1fr; }
      .nl-logo-name { display: none; }
    }

    .nl-nav-tabs-mobile { display: none; }
  `;

  if (loading) {
    return (
      <div className="nl-app">
        <style>{themeStyles}</style>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "var(--text-soft)", fontSize: 14, fontWeight: 700 }}>Carregando…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="nl-app" data-theme={tema}>
      <style>{themeStyles}</style>

      {/* ── NAV ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--dark)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 64,
        borderBottom: "2px solid rgba(232,101,10,0.25)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38,
            background: "var(--brand)",
            borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0,
            overflow: "hidden",
          }}>
            <img src="/logo.png" alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement.innerHTML = "🍔"; }} />
          </div>
          <span className="nl-logo-name" style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17,
            color: "#fff", letterSpacing: "-0.2px", lineHeight: 1,
          }}>
            Neuza<span style={{ color: "var(--brand)" }}>Lanches</span>
          </span>
        </div>

        {/* Tabs no centro (desktop) */}
        <div className="nl-nav-tabs" style={{
          display: "flex", gap: 4,
          background: "rgba(255,255,255,0.07)",
          padding: 4, borderRadius: 10,
        }}>
          {[["catalogo", "Cardápio"], ["meuspedidos", "Meus Pedidos"], ["carrinho", `Carrinho (${carrinho.length})`]].map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: "7px 18px", borderRadius: 7,
              fontSize: 14, fontWeight: 700,
              background: tab === k ? "rgba(255,255,255,0.15)" : "transparent",
              color: tab === k ? "#fff" : "rgba(255,255,255,0.55)",
              cursor: "pointer", border: "none", fontFamily: "'Nunito', sans-serif",
              transition: "all 0.18s",
            }}>
              {v}
            </button>
          ))}
        </div>

        {/* Tabs mobile (compactas) */}
        <div className="nl-nav-tabs-mobile" style={{
          gap: 4, background: "rgba(255,255,255,0.07)",
          padding: 4, borderRadius: 10,
        }}>
          {[["catalogo", "Cardápio"], ["meuspedidos", "📋"], ["carrinho", `🛒 ${carrinho.length}`]].map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: "7px 14px", borderRadius: 7,
              fontSize: 13, fontWeight: 700,
              background: tab === k ? "rgba(255,255,255,0.15)" : "transparent",
              color: tab === k ? "#fff" : "rgba(255,255,255,0.55)",
              cursor: "pointer", border: "none", fontFamily: "'Nunito', sans-serif",
            }}>
              {v}
            </button>
          ))}
        </div>

        {/* Direita: tema + WhatsApp */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={toggleTema} title="Alternar tema" aria-label="Alternar tema"
            style={{
              width: 38, height: 38, borderRadius: 9,
              border: "1.5px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.85)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.18s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.16)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.85)"; }}
          >
            {tema === "dark" ? <IconSun /> : <IconMoon />}
          </button>

          {/* Botão WhatsApp header */}
          <a href={`https://wa.me/${WHATSAPP_NUMERO}`} target="_blank" rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#25D366", color: "#fff",
              padding: "9px 18px", borderRadius: 8,
              fontSize: 14, fontWeight: 800,
              border: "none", fontFamily: "'Nunito', sans-serif",
              transition: "background 0.18s", textDecoration: "none",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#1EB857"}
            onMouseLeave={e => e.currentTarget.style.background = "#25D366"}
          >
            <IconWhatsapp />
            <span className="nl-cta-label">Enviar mensagem</span>
          </a>
        </div>
      </nav>

      {/* Banner fechado */}
      {!aberto && <BannerFechado />}

      {/* MAIN */}
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* CATÁLOGO */}
        {tab === "catalogo" && (
          <div className="nl-anim">

            {/* Search */}
            <div style={{ position: "relative", marginBottom: 22 }}>
              <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 17, pointerEvents: "none" }}>🔍</span>
              <input
                className="nl-search"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar no cardápio..."
                style={{
                  width: "100%", padding: "13px 14px 13px 46px",
                  border: "1.5px solid var(--border-dark)", borderRadius: 12,
                  fontFamily: "'Nunito', sans-serif", fontSize: 15,
                  outline: "none", color: "var(--text)", background: "var(--surface)",
                  fontWeight: 600,
                  transition: "border-color 0.18s, box-shadow 0.18s",
                }}
              />
              {busca && (
                <button onClick={() => setBusca("")} style={{
                  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                  background: "var(--surface-warm)", border: "none", borderRadius: "50%",
                  width: 24, height: 24, fontSize: 12, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)",
                  fontWeight: 700,
                }}>✕</button>
              )}
            </div>

            {/* Filtros (pills de categorias) */}
            {!busca.trim() && categoriasComProdutos.length > 1 && (
              <div className="nl-cat-nav" style={{
                display: "flex", gap: 8, marginBottom: 32,
                overflowX: "auto", whiteSpace: "nowrap",
                position: "sticky", top: 64, zIndex: 40,
                background: "var(--bg)",
                margin: "0 -24px 24px",
                padding: "12px 24px 14px",
              }}>
                {categoriasComProdutos.map(cat => (
                  <button
                    key={cat}
                    onClick={() => scrollParaCategoria(cat)}
                    style={{
                      padding: "8px 18px", borderRadius: 100,
                      fontFamily: "'Nunito', sans-serif", fontSize: 13.5, fontWeight: 700,
                      border: `1.5px solid ${catAtiva === cat ? "var(--brand)" : "var(--border-dark)"}`,
                      background: catAtiva === cat ? "var(--brand)" : "var(--surface)",
                      color: catAtiva === cat ? "#fff" : "var(--text-muted)",
                      cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                      transition: "all 0.18s", lineHeight: 1,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {produtosFiltrados.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 60, color: "var(--text-soft)",
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: 16, marginTop: 20, fontWeight: 600,
              }}>
                {busca ? `Nenhum produto encontrado para "${busca}".` : "Nenhum produto disponível no momento."}
              </div>

            ) : busca.trim() ? (
              /* Resultado da busca — lista plana */
              <div className="nl-product-grid">
                {produtosFiltrados.map(p => (
                  <CardProduto key={p.id} p={p} catPermiteAdicionais={catPermiteAdicionais} adicionaisDisponiveis={adicionaisDisponiveis}
                    onVerDetalhes={abrirModalProduto} onAdd={handleAddProduto} />
                ))}
              </div>

            ) : (
              /* Seções por categoria */
              <div>
                {categoriasComProdutos.map(cat => (
                  <div
                    key={cat}
                    id={`cat-sec-${cat.replace(/\s+/g, "-")}`}
                    style={{ marginBottom: 48, scrollMarginTop: 130 }}
                  >
                    {/* Header da seção */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      <div style={{ width: 6, height: 6, background: "var(--brand)", borderRadius: "50%", flexShrink: 0 }} />
                      <span style={{
                        fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 800,
                        letterSpacing: "2px", textTransform: "uppercase", color: "var(--text-soft)",
                        whiteSpace: "nowrap",
                      }}>{cat}</span>
                      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                      <span style={{
                        fontSize: 12, color: "var(--text-soft)", fontWeight: 700, whiteSpace: "nowrap",
                      }}>
                        {produtos.filter(p => p.categoria === cat).length} {produtos.filter(p => p.categoria === cat).length === 1 ? "item" : "itens"}
                      </span>
                    </div>

                    <div className="nl-product-grid">
                      {produtos.filter(p => p.categoria === cat).map(p => (
                        <CardProduto key={p.id} p={p} catPermiteAdicionais={catPermiteAdicionais} adicionaisDisponiveis={adicionaisDisponiveis}
                          onVerDetalhes={abrirModalProduto} onAdd={handleAddProduto} />
                      ))}
                    </div>
                  </div>
                ))}

                {semCategoria.length > 0 && (
                  <div id="cat-sec-outros" style={{ marginBottom: 48 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      <div style={{ width: 6, height: 6, background: "var(--text-soft)", borderRadius: "50%", flexShrink: 0 }} />
                      <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: "var(--text-soft)" }}>Outros</span>
                      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    </div>
                    <div className="nl-product-grid">
                      {semCategoria.map(p => (
                        <CardProduto key={p.id} p={p} catPermiteAdicionais={catPermiteAdicionais} adicionaisDisponiveis={adicionaisDisponiveis}
                          onVerDetalhes={abrirModalProduto} onAdd={handleAddProduto} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MEUS PEDIDOS */}
        {tab === "meuspedidos" && (
          <MeusPedidosView ativo={tab === "meuspedidos"} />
        )}

        {/* CARRINHO */}
        {tab === "carrinho" && (
          <div className="nl-anim">
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, marginBottom: 22, color: "var(--text)", letterSpacing: "-0.5px" }}>Seu Carrinho</div>

            {carrinho.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 60, color: "var(--text-soft)",
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: 16, fontWeight: 600,
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
                <div style={{ fontSize: 15, marginBottom: 18 }}>Seu carrinho está vazio.</div>
                <button onClick={() => setTab("catalogo")} style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                  Ver cardápio
                </button>
              </div>
            ) : (
              <div style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
                {carrinho.map((item, i) => {
                  const itemTotal = calcItemTotal(item);
                  return (
                    <div key={item._uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: i < carrinho.length - 1 ? "1px solid var(--border)" : "none", flexWrap: "wrap", gap: 10 }}>
                      <div style={{ flex: "1 1 200px" }}>
                        <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text)", fontFamily: "'Syne', sans-serif" }}>{item.produto_nome}</div>
                        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2, fontWeight: 600 }}>{fmt(item.preco_unitario)} cada</div>
                        {item.adicionais && item.adicionais.length > 0 && (
                          <div style={{ marginTop: 6 }}>
                            {item.adicionais.map(a => (
                              <span key={a.id} style={{ display: "inline-block", background: "var(--brand-light)", color: "var(--brand)", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 100, marginRight: 4, marginBottom: 4 }}>
                                {(a.quantidade || 1) > 1 ? `${a.quantidade}x ` : "+ "}{a.nome} ({fmt(a.preco * (a.quantidade || 1))})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button onClick={() => updateQtd(item._uid, item.quantidade - 1)} style={{ width: 30, height: 30, border: "1.5px solid var(--border-dark)", borderRadius: 7, background: "var(--surface)", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "var(--text)", fontWeight: 700 }}>−</button>
                        <span style={{ fontSize: 14, fontWeight: 800, minWidth: 24, textAlign: "center", color: "var(--text)" }}>{item.quantidade}</span>
                        <button onClick={() => updateQtd(item._uid, item.quantidade + 1)} style={{ width: 30, height: 30, border: "1.5px solid var(--border-dark)", borderRadius: 7, background: "var(--surface)", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "var(--text)", fontWeight: 700 }}>+</button>
                        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 17, fontWeight: 800, color: "var(--brand)", minWidth: 90, textAlign: "right", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" }}>{fmt(itemTotal)}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Observação */}
                <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
                  <label style={labelStyle}>Observação (opcional)</label>
                  <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Sem cebola, ponto da carne, etc."
                    style={inputStyle} />
                </div>

                {/* Total + enviar */}
                <div style={{ padding: "20px", borderTop: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-soft)", fontWeight: 800, letterSpacing: "0.08em" }}>TOTAL</div>
                    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 32, fontWeight: 800, color: "var(--brand)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.8px" }}>{fmt(totalCarrinho)}</div>
                  </div>
                  <button onClick={abrirCheckout} disabled={enviando}
                    style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 12, padding: "14px 32px", fontSize: 14.5, fontWeight: 800, cursor: enviando ? "wait" : "pointer", fontFamily: "'Nunito', sans-serif", opacity: enviando ? 0.7 : 1, transition: "background 0.18s" }}
                    onMouseEnter={e => !enviando && (e.currentTarget.style.background = "var(--brand-dark)")}
                    onMouseLeave={e => !enviando && (e.currentTarget.style.background = "var(--brand)")}
                  >
                    {enviando ? "Enviando..." : "Fazer pedido"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONFIRMAÇÃO */}
        {tab === "confirmacao" && pedidoEnviado && (
          <div className="nl-anim" style={{ textAlign: "center" }}>
            <div style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 18, padding: 44, maxWidth: 520, margin: "0 auto" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--brand-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 32, color: "var(--new-green)", fontWeight: 800 }}>✓</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, marginBottom: 10, color: "var(--brand)", letterSpacing: "-0.5px" }}>Pedido enviado!</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20, fontWeight: 600 }}>
                Seu pedido <strong style={{ color: "var(--text)" }}>#{pedidoEnviado.id.slice(0, 6)}</strong> foi recebido com sucesso.
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, fontWeight: 500 }}>
                {pedidoEnviado.itens?.map(item => `${item.quantidade}x ${item.produto_nome}`).join(", ")}
              </div>
              <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 32, fontWeight: 800, color: "var(--brand)", marginBottom: 26, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.8px" }}>{fmt(pedidoEnviado.total)}</div>
              <button onClick={() => { setPedidoEnviado(null); setTab("catalogo"); }}
                style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 10, padding: "13px 28px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                Fazer novo pedido
              </button>
            </div>
          </div>
        )}
      </main>

      {/* WhatsApp FAB */}
      <a href={`https://wa.me/${WHATSAPP_NUMERO}`} target="_blank" rel="noopener noreferrer"
        style={{
          position: "fixed", bottom: 24, right: 24,
          width: 54, height: 54, background: "#25D366",
          borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, cursor: "pointer", zIndex: 200,
          color: "#fff",
          boxShadow: "0 4px 20px rgba(37,211,102,0.4)",
          textDecoration: "none",
          transition: "transform 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
        title="Falar no WhatsApp"
      >
        <IconWhatsapp />
      </a>

      {/* Modal Detalhe do Produto */}
      {modalProduto && (
        <ModalProduto
          produto={modalProduto}
          adicionais={adicionaisDisponiveis}
          permiteAdicionais={!!catPermiteAdicionais[modalProduto.categoria]}
          aberto={aberto}
          onAddSimples={(p, ads) => { addCarrinhoSimples(p, ads); }}
          onAddComAdicionais={(p) => { setModalAdicional(p); }}
          onClose={() => setModalProduto(null)}
        />
      )}

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
      {toast && <div className="nl-toast" style={{ background: toast.cor || "var(--brand)" }}>{toast.msg}</div>}
    </div>
  );
}
