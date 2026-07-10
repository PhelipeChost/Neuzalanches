import { useEffect, useState } from "react";
import { api } from "../api";
import { s, cores } from "../styles";

const VAZIO = { name: "", contact: "", phone: "", email: "", cnpj: "", notes: "" };

export default function Suppliers() {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(VAZIO);
  const [editando, setEditando] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, cor = cores.verdeEscuro) => { setToast({ msg, cor }); setTimeout(() => setToast(null), 2500); };
  const carregar = () => api.suppliers.listar().then(setLista).catch(() => {});
  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!form.name.trim()) return showToast("Nome é obrigatório", cores.vermelho);
    try {
      if (editando) { await api.suppliers.atualizar(editando, form); showToast("Fornecedor atualizado!"); }
      else { await api.suppliers.criar(form); showToast("Fornecedor criado!"); }
      setForm(VAZIO); setEditando(null); carregar();
    } catch (e) { showToast(e.message, cores.vermelho); }
  };

  const excluir = async (f) => {
    if (!confirm(`Remover ${f.name}?`)) return;
    try { await api.suppliers.excluir(f.id); carregar(); showToast("Fornecedor removido"); }
    catch (e) { showToast(e.message, cores.vermelho); }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={s.h1}>🚚 Fornecedores</div>
        <div style={s.sub}>Quem entrega para o seu mercado — usados nas entradas de estoque e contas a pagar.</div>
      </div>

      <div style={{ ...s.card, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>{editando ? "✎ Editar fornecedor" : "+ Novo fornecedor"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={s.label}>Nome *</label><input style={s.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><label style={s.label}>Contato</label><input style={s.input} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} /></div>
          <div><label style={s.label}>Telefone</label><input style={s.input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10 }}>
          <div><label style={s.label}>Email</label><input style={s.input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><label style={s.label}>CNPJ</label><input style={s.input} value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} /></div>
          <div><label style={s.label}>Observações</label><input style={s.input} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button style={s.btn} onClick={salvar}>{editando ? "💾 Salvar" : "+ Criar fornecedor"}</button>
          {editando && <button style={s.btnSec} onClick={() => { setForm(VAZIO); setEditando(null); }}>Cancelar</button>}
        </div>
      </div>

      <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {["Nome", "Contato", "Telefone", "CNPJ", ""].map(h => <th key={h} style={s.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={5} style={{ ...s.td, textAlign: "center", color: cores.ink3, padding: 30 }}>Nenhum fornecedor cadastrado.</td></tr>}
            {lista.map(f => (
              <tr key={f.id}>
                <td style={{ ...s.td, fontWeight: 600 }}>{f.name}</td>
                <td style={s.td}>{f.contact || "—"}</td>
                <td style={s.td}>{f.phone || "—"}</td>
                <td style={s.td}>{f.cnpj || "—"}</td>
                <td style={{ ...s.td, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button style={{ ...s.btnSec, padding: "5px 12px", fontSize: 12, marginRight: 6 }}
                    onClick={() => { setEditando(f.id); setForm({ name: f.name, contact: f.contact, phone: f.phone, email: f.email, cnpj: f.cnpj, notes: f.notes }); window.scrollTo(0, 0); }}>
                    ✎ Editar
                  </button>
                  <button style={{ ...s.btnDanger, padding: "5px 12px", fontSize: 12 }} onClick={() => excluir(f)}>Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", borderRadius: 10, background: toast.cor, color: "#fff", fontSize: 13.5, zIndex: 999 }}>{toast.msg}</div>}
    </div>
  );
}
