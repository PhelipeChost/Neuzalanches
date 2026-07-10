import { useEffect, useState } from "react";
import { api } from "../api";
import { s, cores, fmtBRL, fmtN } from "../styles";

const VAZIO = { name: "", category: "Outros", unit: "un", price: "", cost: "", stock: "", min_stock: "", supplier_id: "", barcodes: [{ barcode: "", qty_multiplier: 1 }] };

export default function Products() {
  const [lista, setLista] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState("");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [toast, setToast] = useState(null);

  const showToast = (msg, cor = cores.verdeEscuro) => { setToast({ msg, cor }); setTimeout(() => setToast(null), 2500); };

  const carregar = () => {
    const params = new URLSearchParams();
    if (busca) params.set("q", busca);
    if (catFiltro) params.set("category", catFiltro);
    api.products.listar(params.toString() ? `?${params}` : "").then(setLista).catch(() => {});
  };

  useEffect(() => {
    api.products.categorias().then(setCategorias).catch(() => {});
    api.suppliers.listar().then(setFornecedores).catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [busca, catFiltro]);

  const abrirNovo = () => { setEditando(null); setForm(VAZIO); setModal(true); };
  const abrirEditar = (p) => {
    setEditando(p.id);
    setForm({
      name: p.name, category: p.category, unit: p.unit, price: p.price, cost: p.cost,
      stock: p.stock, min_stock: p.min_stock, supplier_id: p.supplier_id || "",
      barcodes: p.barcodes.length ? p.barcodes.map(b => ({ barcode: b.barcode, qty_multiplier: b.qty_multiplier })) : [{ barcode: "", qty_multiplier: 1 }],
    });
    setModal(true);
  };

  const salvar = async () => {
    if (!form.name.trim()) return showToast("Nome é obrigatório", cores.vermelho);
    const dados = {
      ...form,
      price: Number(form.price) || 0, cost: Number(form.cost) || 0,
      stock: Number(form.stock) || 0, min_stock: Number(form.min_stock) || 0,
      supplier_id: form.supplier_id || null,
      barcodes: form.barcodes.filter(b => b.barcode.trim()),
    };
    try {
      if (editando) { await api.products.atualizar(editando, dados); showToast("Produto atualizado!"); }
      else { await api.products.criar(dados); showToast("Produto criado!"); }
      setModal(false); carregar();
    } catch (e) { showToast(e.message, cores.vermelho); }
  };

  const excluir = async (p) => {
    if (!confirm(`Remover ${p.name}?`)) return;
    try { await api.products.excluir(p.id); carregar(); showToast("Produto removido"); }
    catch (e) { showToast(e.message, cores.vermelho); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={s.h1}>🏷️ Produtos</div>
          <div style={s.sub}>{lista.length} produto(s) · categorias fixas por setor do mercado</div>
        </div>
        <button style={s.btn} onClick={abrirNovo}>+ Novo produto</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...s.input, maxWidth: 280 }} placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} />
        <select style={{ ...s.input, maxWidth: 260, cursor: "pointer" }} value={catFiltro} onChange={e => setCatFiltro(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ ...s.card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Produto", "Categoria", "Cód. barras", "Preço", "Custo", "Estoque", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={7} style={{ ...s.td, textAlign: "center", color: cores.ink3, padding: 30 }}>Nenhum produto.</td></tr>}
            {lista.map(p => (
              <tr key={p.id}>
                <td style={{ ...s.td, fontWeight: 600 }}>{p.name}</td>
                <td style={{ ...s.td, fontSize: 12, color: cores.ink2 }}>{p.category}</td>
                <td style={{ ...s.td, fontFamily: "monospace", fontSize: 12 }}>{p.barcodes.map(b => b.barcode).join(", ") || "—"}</td>
                <td style={{ ...s.td, fontWeight: 700, color: cores.verde }}>{fmtBRL(p.price)}</td>
                <td style={s.td}>{fmtBRL(p.cost)}</td>
                <td style={{ ...s.td, fontWeight: 600, color: p.min_stock > 0 && p.stock <= p.min_stock ? cores.vermelho : cores.ink }}>
                  {fmtN(p.stock)} {p.unit}
                  {p.min_stock > 0 && p.stock <= p.min_stock && <span style={{ ...s.badge(cores.vermelhoBg, cores.vermelho), marginLeft: 6 }}>BAIXO</span>}
                </td>
                <td style={{ ...s.td, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button style={{ ...s.btnSec, padding: "5px 12px", fontSize: 12, marginRight: 6 }} onClick={() => abrirEditar(p)}>✎</button>
                  <button style={{ ...s.btnDanger, padding: "5px 12px", fontSize: 12 }} onClick={() => excluir(p)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={s.modalOverlay} onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div style={s.modal}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{editando ? "Editar produto" : "Novo produto"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={s.label}>Nome *</label><input style={s.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                <div>
                  <label style={s.label}>Categoria (setor)</label>
                  <select style={{ ...s.input, cursor: "pointer" }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Unidade</label>
                  <select style={{ ...s.input, cursor: "pointer" }} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                    {["un", "kg", "g", "L", "mL", "pct", "cx", "dz"].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                <div><label style={s.label}>Preço venda</label><input style={s.input} type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
                <div><label style={s.label}>Custo</label><input style={s.input} type="number" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></div>
                <div><label style={s.label}>Estoque{editando ? " (via Estoque)" : ""}</label><input style={s.input} type="number" step="0.001" value={form.stock} disabled={!!editando} onChange={e => setForm({ ...form, stock: e.target.value })} /></div>
                <div><label style={s.label}>Mínimo</label><input style={s.input} type="number" step="0.001" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} /></div>
              </div>
              <div>
                <label style={s.label}>Fornecedor padrão</label>
                <select style={{ ...s.input, cursor: "pointer" }} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">Sem fornecedor</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Códigos de barras (multiplicador p/ fardo: bipa 1, baixa N)</label>
                {form.barcodes.map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <input style={{ ...s.input, flex: 2, fontFamily: "monospace" }} placeholder="Código de barras" value={b.barcode}
                      onChange={e => setForm(f => ({ ...f, barcodes: f.barcodes.map((x, k) => k === i ? { ...x, barcode: e.target.value } : x) }))} />
                    <input style={{ ...s.input, flex: 1 }} type="number" step="1" min="1" title="Multiplicador de quantidade" value={b.qty_multiplier}
                      onChange={e => setForm(f => ({ ...f, barcodes: f.barcodes.map((x, k) => k === i ? { ...x, qty_multiplier: e.target.value } : x) }))} />
                    <button style={{ ...s.btnDanger, padding: "5px 12px" }}
                      onClick={() => setForm(f => ({ ...f, barcodes: f.barcodes.filter((_, k) => k !== i) }))}>×</button>
                  </div>
                ))}
                <button style={{ ...s.btnSec, padding: "6px 14px", fontSize: 12 }}
                  onClick={() => setForm(f => ({ ...f, barcodes: [...f.barcodes, { barcode: "", qty_multiplier: 1 }] }))}>
                  + Adicionar código
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
              <button style={s.btnSec} onClick={() => setModal(false)}>Cancelar</button>
              <button style={s.btn} onClick={salvar}>💾 Salvar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", borderRadius: 10, background: toast.cor, color: "#fff", fontSize: 13.5, zIndex: 999 }}>{toast.msg}</div>}
    </div>
  );
}
