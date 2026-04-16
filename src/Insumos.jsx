import { useState, useEffect, useCallback } from "react";
import { api } from "./api";

const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lbl = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };
const inp = { width: "100%", padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917", background: "#fff" };

const UNIDADES = ["un", "kg", "g", "L", "mL", "dz", "cx", "pct", "fatia", "porção"];

// ─── MODAL INSUMO ─────────────────────────────────────────────────────────────
function ModalInsumo({ onSave, onClose, editando }) {
  const [form, setForm] = useState(
    editando
      ? { nome: editando.nome, unidade: editando.unidade, preco_unitario: String(editando.preco_unitario) }
      : { nome: "", unidade: "kg", preco_unitario: "" }
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const salvar = async () => {
    setErro("");
    if (!form.nome.trim()) return setErro("Nome é obrigatório.");
    const preco = parseFloat(form.preco_unitario);
    if (isNaN(preco) || preco < 0) return setErro("Preço inválido.");
    setSalvando(true);
    try {
      await onSave({ nome: form.nome.trim(), unidade: form.unidade, preco_unitario: preco });
      onClose();
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", width: 420, maxWidth: "94vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{editando ? "Editar" : "Novo"} Insumo</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>NOME DO INSUMO</label>
            <input style={inp} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Queijo Mussarela" autoFocus />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>UNIDADE DE MEDIDA</label>
              <select style={{ ...inp, cursor: "pointer" }} value={form.unidade}
                onChange={e => setForm({ ...form, unidade: e.target.value })}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>PREÇO POR {form.unidade.toUpperCase()} (R$)</label>
              <input style={inp} type="number" step="0.01" min="0" value={form.preco_unitario}
                onChange={e => setForm({ ...form, preco_unitario: e.target.value })}
                placeholder="0,00" />
            </div>
          </div>
          {erro && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#dc2626" }}>{erro}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: 11, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            style={{ flex: 2, padding: 11, background: "#15803d", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: salvando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: salvando ? 0.7 : 1 }}>
            {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar insumo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function Insumos() {
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState("");
  const [busca, setBusca] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  const carregar = useCallback(async () => {
    try {
      setInsumos(await api.insumos.listar());
    } catch (err) {
      showToast("Erro ao carregar insumos: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (data) => {
    if (editando) {
      const atualizado = await api.insumos.atualizar(editando.id, data);
      setInsumos(ins => ins.map(i => i.id === editando.id ? atualizado : i));
      showToast("Insumo atualizado! CMV dos produtos recalculado.");
    } else {
      const novo = await api.insumos.criar(data);
      setInsumos(ins => [...ins, novo]);
      showToast("Insumo cadastrado!");
    }
    setEditando(null);
    setModal(false);
  };

  const excluir = async (ins) => {
    try {
      await api.insumos.excluir(ins.id);
      setInsumos(list => list.filter(i => i.id !== ins.id));
      setConfirmDel(null);
      showToast("Insumo excluído.", "#78716c");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    }
  };

  const filtrados = insumos.filter(i =>
    i.nome.toLowerCase().includes(busca.toLowerCase()) ||
    i.unidade.toLowerCase().includes(busca.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <div style={{ color: "#a8a29e", fontSize: 13 }}>Carregando insumos...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px" }} className="anim">

      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Ficha Técnica — Insumos</div>
          <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 3 }}>
            Cadastre os insumos e seus preços. O CMV dos produtos é calculado automaticamente.
          </div>
        </div>
        <button className="btn-add" onClick={() => { setEditando(null); setModal(true); }}>
          + Novo insumo
        </button>
      </div>

      {/* Busca */}
      <div style={{ marginBottom: 16 }}>
        <input className="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar insumo..." />
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
          {busca ? "Nenhum insumo encontrado." : "Nenhum insumo cadastrado ainda. Clique em \"+ Novo insumo\" para começar."}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafaf9", borderBottom: "1px solid #e7e5e4" }}>
                <th style={{ padding: "10px 18px", textAlign: "left", fontWeight: 600, color: "#57534e", fontSize: 11, letterSpacing: "0.05em" }}>INSUMO</th>
                <th style={{ padding: "10px 18px", textAlign: "center", fontWeight: 600, color: "#57534e", fontSize: 11, letterSpacing: "0.05em" }}>UNIDADE</th>
                <th style={{ padding: "10px 18px", textAlign: "right", fontWeight: 600, color: "#57534e", fontSize: 11, letterSpacing: "0.05em" }}>PREÇO / UNIDADE</th>
                <th style={{ padding: "10px 18px", textAlign: "right", fontWeight: 600, color: "#57534e", fontSize: 11, letterSpacing: "0.05em" }}>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((ins, idx) => (
                <tr key={ins.id} style={{ borderBottom: idx < filtrados.length - 1 ? "1px solid #f5f5f4" : "none", transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafaf9"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}>
                  <td style={{ padding: "12px 18px", fontWeight: 500, color: "#1c1917" }}>{ins.nome}</td>
                  <td style={{ padding: "12px 18px", textAlign: "center" }}>
                    <span style={{ background: "#f5f5f4", color: "#57534e", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {ins.unidade}
                    </span>
                  </td>
                  <td style={{ padding: "12px 18px", textAlign: "right", fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#15803d" }}>
                    {fmt(ins.preco_unitario)}
                  </td>
                  <td style={{ padding: "12px 18px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="icon-btn" onClick={() => { setEditando(ins); setModal(true); }}>✏️ Editar</button>
                      <button className="icon-btn del" onClick={() => setConfirmDel(ins)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info */}
      {insumos.length > 0 && (
        <div style={{ marginTop: 16, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#1e40af" }}>
          💡 Ao alterar o preço de um insumo, o CMV de todos os produtos que o utilizam é recalculado automaticamente.
          Para definir a composição de um produto, acesse <strong>Produtos → editar → Ficha Técnica</strong>.
        </div>
      )}

      {/* Modal cadastro/edição */}
      {modal && (
        <ModalInsumo
          editando={editando}
          onSave={salvar}
          onClose={() => { setModal(false); setEditando(null); }}
        />
      )}

      {/* Confirmação exclusão */}
      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setConfirmDel(null)}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "26px 28px", width: 360, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Excluir insumo?</div>
            <div style={{ fontSize: 13, color: "#57534e", marginBottom: 20 }}>
              <strong>"{confirmDel.nome}"</strong> será removido de todas as fichas técnicas. O CMV dos produtos afetados voltará ao valor zero da composição.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDel(null)}
                style={{ flex: 1, padding: 10, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>
                Cancelar
              </button>
              <button onClick={() => excluir(confirmDel)}
                style={{ flex: 1, padding: 10, background: "#dc2626", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}
