// ─── PDV (frente de caixa do mercado) ────────────────────────────────────────
// Fluxo: abrir caixa → bipar produto (código de barras) → carrinho →
// finalizar com pagamentos múltiplos (troco em dinheiro) → cupom → fechar caixa.
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { s, cores, fmtBRL } from "../styles";
import { useAuth } from "../AuthContext";

const METODOS = [
  { key: "dinheiro", label: "💵 Dinheiro" },
  { key: "pix",      label: "⚡ Pix" },
  { key: "credito",  label: "💳 Crédito" },
  { key: "debito",   label: "💳 Débito" },
  { key: "vale",     label: "🎫 Vale" },
];

export default function PDV({ quiosque = false, onLogout }) {
  const { user } = useAuth();
  const [sessao, setSessao] = useState(undefined); // undefined = carregando, null = fechado
  const [carrinho, setCarrinho] = useState([]);
  const [bip, setBip] = useState("");
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState([]);
  const [desconto, setDesconto] = useState("");
  const [pagamentos, setPagamentos] = useState([]); // [{method, amount}]
  const [modalPagar, setModalPagar] = useState(false);
  const [modalAbrir, setModalAbrir] = useState(false);
  const [modalFechar, setModalFechar] = useState(false);
  const [valorAbertura, setValorAbertura] = useState("200");
  const [contagem, setContagem] = useState({});
  const [fechamento, setFechamento] = useState(null);
  const [ultimaVenda, setUltimaVenda] = useState(null);
  const [toast, setToast] = useState(null);
  const bipRef = useRef(null);

  const showToast = (msg, cor = cores.verdeEscuro) => { setToast({ msg, cor }); setTimeout(() => setToast(null), 2600); };

  const carregarSessao = () => api.cash.atual().then(setSessao).catch(() => setSessao(null));
  useEffect(() => { carregarSessao(); }, []);

  // foco perpétuo no campo de bipagem (leitor de código de barras)
  useEffect(() => {
    const iv = setInterval(() => {
      if (!modalPagar && !modalAbrir && !modalFechar && document.activeElement?.tagName !== "INPUT") {
        bipRef.current?.focus();
      }
    }, 1500);
    return () => clearInterval(iv);
  }, [modalPagar, modalAbrir, modalFechar]);

  const total = carrinho.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const desc = Math.min(Number(desconto) || 0, total);
  const totalFinal = +(total - desc).toFixed(2);
  const pago = pagamentos.reduce((a, p) => a + p.amount, 0);
  const falta = Math.max(0, +(totalFinal - pago).toFixed(2));
  const troco = Math.max(0, +(pago - totalFinal).toFixed(2));

  // ── bipar por código de barras
  const bipar = async (e) => {
    e.preventDefault();
    const code = bip.trim();
    if (!code) return;
    setBip("");
    try {
      const p = await api.products.porBarcode(code);
      adicionarProduto(p, p.qty_multiplier || 1);
    } catch (err) { showToast(err.message, cores.vermelho); }
  };

  const adicionarProduto = (p, qty = 1) => {
    setCarrinho(c => {
      const idx = c.findIndex(i => i.product_id === p.id);
      if (idx >= 0) {
        const novo = [...c];
        novo[idx] = { ...novo[idx], qty: +(novo[idx].qty + qty).toFixed(3) };
        return novo;
      }
      return [...c, { product_id: p.id, name: p.name, unit: p.unit, unit_price: p.price, qty }];
    });
  };

  // busca por nome (fallback quando não tem código)
  useEffect(() => {
    if (!busca.trim()) { setResultados([]); return; }
    const t = setTimeout(() => {
      api.products.listar(`?q=${encodeURIComponent(busca.trim())}`).then(r => setResultados(r.slice(0, 8))).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  const mudarQty = (idx, delta) => {
    setCarrinho(c => c.map((i, k) => k === idx ? { ...i, qty: Math.max(0.001, +(i.qty + delta).toFixed(3)) } : i));
  };
  const removerItem = (idx) => setCarrinho(c => c.filter((_, k) => k !== idx));

  // ── pagamentos
  const addPagamento = (method, amount) => {
    const v = +(Number(amount) || 0).toFixed(2);
    if (v <= 0) return;
    setPagamentos(p => [...p, { method, amount: v }]);
  };

  const finalizar = async () => {
    try {
      const venda = await api.sales.criar({
        items: carrinho.map(i => ({ product_id: i.product_id, qty: i.qty })),
        payments: pagamentos,
        discount: desc,
      });
      setUltimaVenda(venda);
      setCarrinho([]); setPagamentos([]); setDesconto(""); setModalPagar(false);
      showToast(`Venda #${venda.number} concluída!${venda.change > 0 ? ` Troco: ${fmtBRL(venda.change)}` : ""}`);
      api.print.cupom(venda.id).catch(() => {});
      carregarSessao();
    } catch (err) { showToast(err.message, cores.vermelho); }
  };

  // ── abrir / fechar caixa
  const abrirCaixa = async () => {
    try {
      await api.cash.abrir(Number(valorAbertura) || 0);
      setModalAbrir(false);
      carregarSessao();
      showToast("Caixa aberto — boas vendas!");
    } catch (err) { showToast(err.message, cores.vermelho); }
  };

  const fecharCaixa = async () => {
    try {
      const r = await api.cash.fechar(
        Object.fromEntries(Object.entries(contagem).map(([k, v]) => [k, Number(v) || 0]))
      );
      setFechamento(r);
      setModalFechar(false);
      carregarSessao();
    } catch (err) { showToast(err.message, cores.vermelho); }
  };

  if (sessao === undefined) return <div style={{ padding: 60, textAlign: "center", color: cores.ink3 }}>Carregando caixa...</div>;

  // ── caixa FECHADO: tela de abertura
  if (!sessao) {
    return (
      <div style={{ maxWidth: 460, margin: "60px auto", textAlign: "center" }}>
        {quiosque && (
          <button onClick={onLogout} style={{ ...s.btnSec, position: "fixed", top: 16, right: 16 }}>Sair</button>
        )}
        <div style={{ fontSize: 54, marginBottom: 12 }}>🔒</div>
        <div style={s.h1}>Caixa fechado</div>
        <div style={{ ...s.sub, marginBottom: 26 }}>Abra o caixa para começar a vender.</div>
        <div style={{ ...s.card, textAlign: "left" }}>
          <label style={s.label}>Fundo de troco (R$)</label>
          <input style={s.input} type="number" step="0.01" value={valorAbertura} onChange={e => setValorAbertura(e.target.value)} />
          <button style={{ ...s.btn, width: "100%", marginTop: 14, padding: 13 }} onClick={abrirCaixa}>
            🔓 Abrir caixa
          </button>
        </div>
        {fechamento && (
          <div style={{ ...s.card, textAlign: "left", marginTop: 16, borderColor: fechamento.difference === 0 ? "#bbf7d0" : "#fecaca" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Último fechamento</div>
            <div style={{ fontSize: 13, color: cores.ink2 }}>
              Diferença: <b style={{ color: fechamento.difference === 0 ? cores.verde : cores.vermelho }}>{fmtBRL(fechamento.difference)}</b>
              {fechamento.difference === 0 ? " — caixa bateu! ✅" : fechamento.difference > 0 ? " (sobra)" : " (falta)"}
            </div>
          </div>
        )}
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  // ── caixa ABERTO: tela de venda
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 18, alignItems: "start" }}>
      {/* Coluna esquerda: bipagem + busca */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={s.h1}>🛒 PDV</div>
            <div style={s.sub}>
              Caixa aberto · {sessao.vendas_qtd || 0} venda(s) · {fmtBRL(sessao.vendas_total)} hoje
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {quiosque && <button style={s.btnSec} onClick={onLogout}>Sair</button>}
            <button style={{ ...s.btnSec, color: cores.vermelho, borderColor: "#fecaca" }}
              onClick={() => { setContagem({}); setModalFechar(true); }}>
              🔒 Fechar caixa
            </button>
          </div>
        </div>

        {/* Bipagem */}
        <form onSubmit={bipar} style={{ ...s.card, marginBottom: 14 }}>
          <label style={s.label}>Código de barras (bipe aqui)</label>
          <input ref={bipRef} autoFocus value={bip} onChange={e => setBip(e.target.value)}
            placeholder="Passe o leitor ou digite o código e Enter"
            style={{ ...s.input, fontSize: 18, padding: "14px 16px", fontFamily: "monospace" }} />
        </form>

        {/* Busca por nome */}
        <div style={s.card}>
          <label style={s.label}>Buscar produto por nome</label>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Ex: arroz" style={s.input} />
          {resultados.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {resultados.map(p => (
                <button key={p.id} onClick={() => { adicionarProduto(p); setBusca(""); setResultados([]); }}
                  style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, border: `1px solid ${cores.linha}`, background: "#fafaf9", cursor: "pointer", fontSize: 13.5, fontFamily: "inherit" }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: cores.verde, fontWeight: 700 }}>{fmtBRL(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {ultimaVenda && (
          <div style={{ ...s.card, marginTop: 14, background: cores.verdeBg, borderColor: "#bbf7d0" }}>
            <div style={{ fontSize: 13, color: cores.verdeEscuro }}>
              ✅ Última venda: <b>#{ultimaVenda.number}</b> — {fmtBRL(ultimaVenda.total)}
              {ultimaVenda.change > 0 && <> · troco <b>{fmtBRL(ultimaVenda.change)}</b></>}
              <button onClick={() => api.print.cupom(ultimaVenda.id).then(() => showToast("Cupom reenviado")).catch(e => showToast(e.message, cores.vermelho))}
                style={{ ...s.btnSec, padding: "4px 12px", fontSize: 12, marginLeft: 10 }}>🖨️ Reimprimir</button>
            </div>
          </div>
        )}
      </div>

      {/* Coluna direita: carrinho */}
      <div style={{ ...s.card, position: "sticky", top: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Carrinho ({carrinho.length})</div>
        {carrinho.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: cores.ink3, fontSize: 13 }}>
            Bipe um produto para começar
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
            {carrinho.map((i, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#fafaf9", borderRadius: 9 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
                  <div style={{ fontSize: 11, color: cores.ink3 }}>{fmtBRL(i.unit_price)} / {i.unit}</div>
                </div>
                <button onClick={() => mudarQty(idx, -1)} style={{ ...s.btnSec, padding: "3px 10px" }}>−</button>
                <span style={{ minWidth: 34, textAlign: "center", fontWeight: 700, fontSize: 14 }}>{i.qty}</span>
                <button onClick={() => mudarQty(idx, 1)} style={{ ...s.btnSec, padding: "3px 10px" }}>+</button>
                <div style={{ minWidth: 70, textAlign: "right", fontWeight: 700, fontSize: 13.5 }}>{fmtBRL(i.qty * i.unit_price)}</div>
                <button onClick={() => removerItem(idx)} style={{ background: "none", border: "none", color: cores.vermelho, cursor: "pointer", fontSize: 15 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: `1px solid ${cores.linha}`, marginTop: 14, paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: cores.ink2, marginBottom: 6 }}>
            <span>Subtotal</span><span>{fmtBRL(total)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: cores.ink2 }}>Desconto (R$)</span>
            <input type="number" step="0.01" min="0" value={desconto} onChange={e => setDesconto(e.target.value)}
              style={{ ...s.input, width: 100, padding: "5px 9px", textAlign: "right" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 800, marginBottom: 14 }}>
            <span>TOTAL</span><span style={{ color: cores.verde }}>{fmtBRL(totalFinal)}</span>
          </div>
          <button disabled={carrinho.length === 0} onClick={() => { setPagamentos([]); setModalPagar(true); }}
            style={{ ...s.btn, width: "100%", padding: 15, fontSize: 16, opacity: carrinho.length === 0 ? 0.5 : 1 }}>
            💳 Finalizar venda (F2)
          </button>
          {carrinho.length > 0 && (
            <button onClick={() => { if (confirm("Limpar o carrinho?")) setCarrinho([]); }}
              style={{ ...s.btnSec, width: "100%", marginTop: 8, fontSize: 12.5 }}>Limpar carrinho</button>
          )}
        </div>
      </div>

      {/* ── MODAL: pagamento misto */}
      {modalPagar && (
        <div style={s.modalOverlay} onClick={e => { if (e.target === e.currentTarget) setModalPagar(false); }}>
          <div style={s.modal}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Pagamento</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: cores.verde, marginBottom: 16 }}>{fmtBRL(totalFinal)}</div>

            <PagamentoForm onAdd={addPagamento} sugestao={falta} />

            {pagamentos.length > 0 && (
              <div style={{ margin: "14px 0", display: "flex", flexDirection: "column", gap: 6 }}>
                {pagamentos.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#fafaf9", borderRadius: 8, fontSize: 13.5 }}>
                    <span>{METODOS.find(m => m.key === p.method)?.label || p.method}</span>
                    <span style={{ fontWeight: 700 }}>{fmtBRL(p.amount)}
                      <button onClick={() => setPagamentos(pg => pg.filter((_, k) => k !== i))}
                        style={{ background: "none", border: "none", color: cores.vermelho, cursor: "pointer", marginLeft: 8 }}>×</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: `1px solid ${cores.linha}`, paddingTop: 12, fontSize: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Pago</span><b>{fmtBRL(pago)}</b>
              </div>
              {falta > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: cores.ambar }}><span>Falta</span><b>{fmtBRL(falta)}</b></div>}
              {troco > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: cores.azul }}><span>Troco</span><b>{fmtBRL(troco)}</b></div>}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button style={{ ...s.btnSec, flex: 1 }} onClick={() => setModalPagar(false)}>Voltar</button>
              <button style={{ ...s.btn, flex: 2, opacity: falta > 0 ? 0.5 : 1 }} disabled={falta > 0} onClick={finalizar}>
                ✅ Concluir {troco > 0 ? `(troco ${fmtBRL(troco)})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: fechar caixa */}
      {modalFechar && (
        <div style={s.modalOverlay} onClick={e => { if (e.target === e.currentTarget) setModalFechar(false); }}>
          <div style={s.modal}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Fechar caixa</div>
            <div style={{ fontSize: 12.5, color: cores.ink3, marginBottom: 16 }}>
              Conte o que tem na gaveta por forma de pagamento. O sistema compara com o esperado.
            </div>
            {METODOS.map(m => (
              <div key={m.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 14 }}>{m.label}</span>
                <input type="number" step="0.01" min="0" placeholder="0,00"
                  value={contagem[m.key] ?? ""} onChange={e => setContagem(c => ({ ...c, [m.key]: e.target.value }))}
                  style={{ ...s.input, width: 140, textAlign: "right" }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button style={{ ...s.btnSec, flex: 1 }} onClick={() => setModalFechar(false)}>Cancelar</button>
              <button style={{ ...s.btn, flex: 2, background: cores.vermelho }} onClick={fecharCaixa}>🔒 Fechar caixa</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast toast={toast} />}
    </div>
  );
}

function PagamentoForm({ onAdd, sugestao }) {
  const [metodo, setMetodo] = useState("dinheiro");
  const [valor, setValor] = useState("");
  useEffect(() => { setValor(sugestao > 0 ? String(sugestao.toFixed(2)) : ""); }, [sugestao]);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {METODOS.map(m => (
          <button key={m.key} onClick={() => setMetodo(m.key)}
            style={{
              padding: "9px 13px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              border: `1.5px solid ${metodo === m.key ? cores.verde : cores.linha}`,
              background: metodo === m.key ? cores.verdeBg : "#fff",
              color: metodo === m.key ? cores.verde : cores.ink2,
            }}>{m.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)}
          placeholder="Valor" style={{ ...s.input, flex: 1 }}
          onKeyDown={e => { if (e.key === "Enter") { onAdd(metodo, valor); setValor(""); } }} />
        <button style={s.btn} onClick={() => { onAdd(metodo, valor); setValor(""); }}>+ Adicionar</button>
      </div>
    </div>
  );
}

function Toast({ toast }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, padding: "12px 20px", borderRadius: 10,
      background: toast.cor, color: "#fff", fontSize: 13.5, fontWeight: 500, zIndex: 999,
    }}>{toast.msg}</div>
  );
}
