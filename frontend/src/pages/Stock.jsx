// ─── Estoque: entrada (com fornecedor + custo), ajuste com motivo,
// inventário (contagem) e trilha de movimentos ────────────────────────────────
import { useEffect, useState } from "react";
import { api } from "../api";
import { s, cores, fmtBRL, fmtN } from "../styles";

const TIPO_LABEL = { entrada: "📥 Entrada", ajuste: "🔧 Ajuste", venda: "🛒 Venda", estorno: "↩️ Estorno", inventario: "📋 Inventário" };

export default function Stock() {
  const [aba, setAba] = useState("entrada");
  const [produtos, setProdutos] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [toast, setToast] = useState(null);

  const showToast = (msg, cor = cores.verdeEscuro) => { setToast({ msg, cor }); setTimeout(() => setToast(null), 2500); };
  const carregar = () => api.products.listar().then(setProdutos).catch(() => {});

  useEffect(() => {
    carregar();
    api.suppliers.listar().then(setFornecedores).catch(() => {});
  }, []);

  const ABAS = [
    { key: "entrada", label: "📥 Entrada" },
    { key: "ajuste", label: "🔧 Ajuste" },
    { key: "inventario", label: "📋 Inventário" },
    { key: "movimentos", label: "📜 Movimentos" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={s.h1}>📦 Estoque</div>
        <div style={s.sub}>Entradas com fornecedor e custo, ajustes com motivo, inventário e trilha completa.</div>
      </div>

      <div style={{ display: "flex", gap: 4, background: "#e9e7e5", borderRadius: 10, padding: 3, marginBottom: 20, maxWidth: 520 }}>
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            style={{
              flex: 1, padding: "9px 8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
              fontWeight: aba === a.key ? 700 : 500, fontFamily: "inherit",
              background: aba === a.key ? "#fff" : "transparent", color: aba === a.key ? cores.verde : cores.ink2,
            }}>{a.label}</button>
        ))}
      </div>

      {aba === "entrada" && <Entrada produtos={produtos} fornecedores={fornecedores} onDone={carregar} showToast={showToast} />}
      {aba === "ajuste" && <Ajuste produtos={produtos} onDone={carregar} showToast={showToast} />}
      {aba === "inventario" && <Inventario produtos={produtos} onDone={carregar} showToast={showToast} />}
      {aba === "movimentos" && <Movimentos />}

      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", borderRadius: 10, background: toast.cor, color: "#fff", fontSize: 13.5, zIndex: 999 }}>{toast.msg}</div>}
    </div>
  );
}

function SelectProduto({ produtos, value, onChange }) {
  return (
    <select style={{ ...s.input, cursor: "pointer" }} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Selecione o produto...</option>
      {produtos.map(p => <option key={p.id} value={p.id}>{p.name} (saldo: {fmtN(p.stock)} {p.unit})</option>)}
    </select>
  );
}

function Entrada({ produtos, fornecedores, onDone, showToast }) {
  const [form, setForm] = useState({ product_id: "", qty: "", unit_cost: "", supplier_id: "" });
  const registrar = async () => {
    if (!form.product_id || !form.qty) return showToast("Produto e quantidade são obrigatórios", cores.vermelho);
    try {
      const r = await api.stock.entrada({ ...form, qty: Number(form.qty), unit_cost: form.unit_cost ? Number(form.unit_cost) : undefined, supplier_id: form.supplier_id || null });
      showToast(`Entrada registrada! Novo saldo: ${fmtN(r.novo_saldo)}`);
      setForm({ product_id: "", qty: "", unit_cost: "", supplier_id: "" });
      onDone();
    } catch (e) { showToast(e.message, cores.vermelho); }
  };
  return (
    <div style={{ ...s.card, maxWidth: 560 }}>
      <div style={{ fontWeight: 700, marginBottom: 14 }}>Entrada de mercadoria</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><label style={s.label}>Produto *</label><SelectProduto produtos={produtos} value={form.product_id} onChange={v => setForm({ ...form, product_id: v })} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={s.label}>Quantidade *</label><input style={s.input} type="number" step="0.001" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></div>
          <div><label style={s.label}>Custo unitário (R$)</label><input style={s.input} type="number" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} /></div>
        </div>
        <div>
          <label style={s.label}>Fornecedor</label>
          <select style={{ ...s.input, cursor: "pointer" }} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
            <option value="">Sem fornecedor</option>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <button style={{ ...s.btn, padding: 12 }} onClick={registrar}>📥 Registrar entrada</button>
      </div>
    </div>
  );
}

function Ajuste({ produtos, onDone, showToast }) {
  const [form, setForm] = useState({ product_id: "", new_qty: "", reason: "" });
  const prod = produtos.find(p => p.id === form.product_id);
  const registrar = async () => {
    if (!form.product_id || form.new_qty === "" || !form.reason.trim()) return showToast("Preencha produto, quantidade e motivo", cores.vermelho);
    try {
      await api.stock.ajuste({ ...form, new_qty: Number(form.new_qty) });
      showToast("Ajuste registrado!");
      setForm({ product_id: "", new_qty: "", reason: "" });
      onDone();
    } catch (e) { showToast(e.message, cores.vermelho); }
  };
  return (
    <div style={{ ...s.card, maxWidth: 560 }}>
      <div style={{ fontWeight: 700, marginBottom: 14 }}>Ajuste manual (quebra, perda, correção)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><label style={s.label}>Produto *</label><SelectProduto produtos={produtos} value={form.product_id} onChange={v => setForm({ ...form, product_id: v })} /></div>
        <div>
          <label style={s.label}>Novo saldo {prod ? `(atual: ${fmtN(prod.stock)} ${prod.unit})` : ""}</label>
          <input style={s.input} type="number" step="0.001" value={form.new_qty} onChange={e => setForm({ ...form, new_qty: e.target.value })} />
        </div>
        <div><label style={s.label}>Motivo *</label><input style={s.input} placeholder="Ex: quebra, vencimento, erro de contagem" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
        <button style={{ ...s.btn, padding: 12, background: cores.ambar }} onClick={registrar}>🔧 Ajustar saldo</button>
      </div>
    </div>
  );
}

function Inventario({ produtos, onDone, showToast }) {
  const [sessao, setSessao] = useState(undefined);
  const [contagens, setContagens] = useState({});

  const carregar = () => api.inventory.atual().then(sv => {
    setSessao(sv);
    if (sv) {
      const c = {};
      for (const ct of sv.counts) c[ct.product_id] = ct.counted_qty;
      setContagens(c);
    }
  }).catch(() => setSessao(null));
  useEffect(() => { carregar(); }, []);

  const abrir = async () => {
    try { await api.inventory.abrir(""); carregar(); showToast("Inventário aberto — conte os produtos"); }
    catch (e) { showToast(e.message, cores.vermelho); }
  };

  const contar = async (productId, qty) => {
    setContagens(c => ({ ...c, [productId]: qty }));
    try { await api.inventory.contar(sessao.id, productId, Number(qty) || 0); }
    catch (e) { showToast(e.message, cores.vermelho); }
  };

  const finalizar = async () => {
    if (!confirm("Aplicar as diferenças da contagem no estoque? Essa ação ajusta os saldos.")) return;
    try { const r = await api.inventory.finalizar(sessao.id); showToast(`Inventário aplicado (${r.ajustados} itens)`); carregar(); onDone(); }
    catch (e) { showToast(e.message, cores.vermelho); }
  };

  const cancelar = async () => {
    if (!confirm("Cancelar o inventário? As contagens serão descartadas.")) return;
    try { await api.inventory.cancelar(sessao.id); carregar(); showToast("Inventário cancelado"); }
    catch (e) { showToast(e.message, cores.vermelho); }
  };

  if (sessao === undefined) return <div style={{ color: cores.ink3 }}>Carregando...</div>;

  if (!sessao) {
    return (
      <div style={{ ...s.card, maxWidth: 560, textAlign: "center", padding: 36 }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhum inventário em andamento</div>
        <div style={{ fontSize: 13, color: cores.ink3, marginBottom: 18 }}>
          Abra uma sessão de contagem, conte produto por produto e aplique as diferenças no final.
        </div>
        <button style={s.btn} onClick={abrir}>+ Abrir inventário</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Contagem em andamento — {Object.keys(contagens).length} de {produtos.length} contados</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={s.btnSec} onClick={cancelar}>Cancelar</button>
          <button style={s.btn} onClick={finalizar}>✅ Finalizar e aplicar</button>
        </div>
      </div>
      <div style={{ ...s.card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Produto", "Saldo no sistema", "Contado", "Diferença"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {produtos.map(p => {
              const contado = contagens[p.id];
              const diff = contado !== undefined && contado !== "" ? +(Number(contado) - p.stock).toFixed(3) : null;
              return (
                <tr key={p.id}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{p.name}</td>
                  <td style={s.td}>{fmtN(p.stock)} {p.unit}</td>
                  <td style={s.td}>
                    <input type="number" step="0.001" style={{ ...s.input, width: 120, padding: "6px 10px" }}
                      value={contado ?? ""} onChange={e => contar(p.id, e.target.value)} />
                  </td>
                  <td style={{ ...s.td, fontWeight: 700, color: diff === null ? cores.ink3 : diff === 0 ? cores.verde : diff > 0 ? cores.azul : cores.vermelho }}>
                    {diff === null ? "—" : diff > 0 ? `+${fmtN(diff)}` : fmtN(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Movimentos() {
  const [lista, setLista] = useState([]);
  useEffect(() => { api.stock.movimentos().then(setLista).catch(() => {}); }, []);
  return (
    <div style={{ ...s.card, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["Data", "Produto", "Tipo", "Qtd", "Custo", "Fornecedor", "Motivo", "Por"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>
          {lista.length === 0 && <tr><td colSpan={8} style={{ ...s.td, textAlign: "center", color: cores.ink3, padding: 30 }}>Sem movimentos ainda.</td></tr>}
          {lista.map(m => (
            <tr key={m.id}>
              <td style={{ ...s.td, fontSize: 12, whiteSpace: "nowrap" }}>{(m.created_at || "").slice(0, 16)}</td>
              <td style={{ ...s.td, fontWeight: 600 }}>{m.product_name}</td>
              <td style={s.td}>{TIPO_LABEL[m.type] || m.type}</td>
              <td style={{ ...s.td, fontWeight: 700, color: m.qty > 0 ? cores.verde : cores.vermelho }}>{m.qty > 0 ? `+${fmtN(m.qty)}` : fmtN(m.qty)}</td>
              <td style={s.td}>{m.unit_cost ? fmtBRL(m.unit_cost) : "—"}</td>
              <td style={s.td}>{m.supplier_name || "—"}</td>
              <td style={{ ...s.td, fontSize: 12, color: cores.ink2 }}>{m.reason || "—"}</td>
              <td style={{ ...s.td, fontSize: 12 }}>{m.user_name || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
