import { useState, useEffect, useCallback } from "react";
import { api } from "./api";

const fmt = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lbl = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };
const inp = { width: "100%", padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917", background: "#fff" };

const CATEGORIAS = [
  "Aluguel", "Energia", "Salários", "Gás", "Contador", "Internet",
  "Água", "Telefone", "Marketing", "Impostos", "Manutenção", "Outros",
];

const CAT_CORES = {
  "Aluguel":     { bg: "#eff6ff", color: "#2563eb" },
  "Energia":     { bg: "#fefce8", color: "#ca8a04" },
  "Salários":    { bg: "#f0fdf4", color: "#15803d" },
  "Gás":         { bg: "#fff7ed", color: "#ea580c" },
  "Contador":    { bg: "#fdf4ff", color: "#9333ea" },
  "Internet":    { bg: "#ecfeff", color: "#0891b2" },
  "Água":        { bg: "#f0f9ff", color: "#0284c7" },
  "Telefone":    { bg: "#f5f3ff", color: "#7c3aed" },
  "Marketing":   { bg: "#fef2f2", color: "#dc2626" },
  "Impostos":    { bg: "#fafaf9", color: "#57534e" },
  "Manutenção":  { bg: "#fef3c7", color: "#d97706" },
  "Outros":      { bg: "#f5f5f4", color: "#78716c" },
};

function catStyle(cat) {
  const c = CAT_CORES[cat] || CAT_CORES["Outros"];
  return { background: c.bg, color: c.color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, display: "inline-block" };
}

// ─── MODAL CUSTO FIXO ─────────────────────────────────────────────────────────
function ModalCustoFixo({ editando, onSave, onClose }) {
  const [form, setForm] = useState(
    editando
      ? { nome: editando.nome, valor: String(editando.valor), categoria: editando.categoria, ativo: !!editando.ativo }
      : { nome: "", valor: "", categoria: "Aluguel", ativo: true }
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const salvar = async () => {
    setErro("");
    if (!form.nome.trim()) return setErro("Nome é obrigatório.");
    const valor = parseFloat(form.valor);
    if (isNaN(valor) || valor < 0) return setErro("Valor inválido.");
    setSalvando(true);
    try {
      await onSave({ nome: form.nome.trim(), valor, categoria: form.categoria, ativo: form.ativo });
      onClose();
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", width: 440, maxWidth: "94vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{editando ? "Editar" : "Novo"} Custo Fixo</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>NOME DO CUSTO</label>
            <input style={inp} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Aluguel do ponto" autoFocus />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>CATEGORIA</label>
              <select style={{ ...inp, cursor: "pointer" }} value={form.categoria}
                onChange={e => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>VALOR MENSAL (R$)</label>
              <input style={inp} type="number" step="0.01" min="0" value={form.valor}
                onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, userSelect: "none" }}>
            <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />
            <span style={{ color: form.ativo ? "#15803d" : "#a8a29e", fontWeight: 500 }}>
              {form.ativo ? "Ativo — gera lançamento todo mês" : "Inativo — não gera lançamentos"}
            </span>
          </label>

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
            {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar custo fixo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function CustosFixos() {
  const [custos, setCustos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 3000); };

  const carregar = useCallback(async () => {
    try {
      setCustos(await api.custosFixos.listar());
    } catch (err) {
      showToast("Erro ao carregar: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (data) => {
    if (editando) {
      const atualizado = await api.custosFixos.atualizar(editando.id, data);
      setCustos(cs => cs.map(c => c.id === editando.id ? atualizado : c));
      showToast("Custo fixo atualizado!");
    } else {
      const novo = await api.custosFixos.criar(data);
      setCustos(cs => [...cs, novo]);
      showToast("Custo fixo cadastrado! Será lançado como previsto no mês atual.");
    }
    setEditando(null);
    setModal(false);
  };

  const toggleAtivo = async (cf) => {
    try {
      const atualizado = await api.custosFixos.atualizar(cf.id, { ...cf, ativo: !cf.ativo });
      setCustos(cs => cs.map(c => c.id === cf.id ? atualizado : c));
      showToast(atualizado.ativo ? "Custo ativado." : "Custo desativado.", "#78716c");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    }
  };

  const excluir = async (cf) => {
    try {
      await api.custosFixos.excluir(cf.id);
      setCustos(cs => cs.filter(c => c.id !== cf.id));
      setConfirmDel(null);
      showToast("Custo fixo excluído. Lançamentos previstos pendentes foram removidos.", "#78716c");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    }
  };

  const totalMensal = custos.filter(c => c.ativo).reduce((s, c) => s + c.valor, 0);

  // Agrupar por categoria
  const porCategoria = custos.reduce((acc, c) => {
    if (!acc[c.categoria]) acc[c.categoria] = [];
    acc[c.categoria].push(c);
    return acc;
  }, {});

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <div style={{ color: "#a8a29e", fontSize: 13 }}>Carregando custos fixos...</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }} className="anim">

      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Custos Fixos Mensais</div>
          <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 3 }}>
            Custos que se repetem todo mês — gerados automaticamente como lançamentos previstos.
          </div>
        </div>
        <button className="btn-add" onClick={() => { setEditando(null); setModal(true); }}>
          + Novo custo fixo
        </button>
      </div>

      {/* Card resumo */}
      {custos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 6 }}>TOTAL FIXO / MÊS</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#dc2626" }}>{fmt(totalMensal)}</div>
            <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 3 }}>{custos.filter(c => c.ativo).length} custos ativos</div>
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 6 }}>TOTAL ANUAL PREVISTO</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#92400e" }}>{fmt(totalMensal * 12)}</div>
            <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 3 }}>Projeção de 12 meses</div>
          </div>
        </div>
      )}

      {/* Lista por categoria */}
      {custos.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 52, color: "#a8a29e" }}>
          Nenhum custo fixo cadastrado. Clique em "+ Novo custo fixo" para começar.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {Object.entries(porCategoria).sort(([a], [b]) => a.localeCompare(b)).map(([cat, itens]) => (
            <div key={cat} className="card" style={{ padding: 0, overflow: "hidden" }}>
              {/* Header categoria */}
              <div style={{ padding: "10px 18px", borderBottom: "1px solid #f5f5f4", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fafaf9" }}>
                <span style={catStyle(cat)}>{cat}</span>
                <span style={{ fontSize: 12, color: "#78716c", fontWeight: 600 }}>
                  {fmt(itens.filter(i => i.ativo).reduce((s, i) => s + i.valor, 0))}/mês
                </span>
              </div>
              {/* Itens */}
              {itens.map((cf, idx) => (
                <div key={cf.id} style={{ display: "flex", alignItems: "center", padding: "12px 18px", gap: 14, borderBottom: idx < itens.length - 1 ? "1px solid #f5f5f4" : "none", opacity: cf.ativo ? 1 : 0.5 }}>
                  {/* Toggle ativo */}
                  <button
                    onClick={() => toggleAtivo(cf)}
                    title={cf.ativo ? "Clique para desativar" : "Clique para ativar"}
                    style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: cf.ativo ? "#15803d" : "#d6d3d1", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                    <span style={{ position: "absolute", top: 2, left: cf.ativo ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", display: "block" }} />
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1c1917" }}>{cf.nome}</div>
                    <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 2 }}>
                      {cf.ativo ? "Gera lançamento previsto todo mês" : "Inativo"}
                    </div>
                  </div>

                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: "#dc2626", flexShrink: 0 }}>
                    {fmt(cf.valor)}<span style={{ fontSize: 11, color: "#a8a29e", fontWeight: 400 }}>/mês</span>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="icon-btn" onClick={() => { setEditando(cf); setModal(true); }}>✏️ Editar</button>
                    <button className="icon-btn del" onClick={() => setConfirmDel(cf)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div style={{ marginTop: 20, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#1e40af" }}>
        💡 Os lançamentos são criados automaticamente como <strong>previstos</strong> quando você abre o <strong>Financeiro → aba do mês</strong>.
        Quando o custo é pago, marque o lançamento como <strong>realizado</strong> no Financeiro.
      </div>

      {/* Modal */}
      {modal && (
        <ModalCustoFixo
          editando={editando}
          onSave={salvar}
          onClose={() => { setModal(false); setEditando(null); }}
        />
      )}

      {/* Confirmação exclusão */}
      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setConfirmDel(null)}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "26px 28px", width: 380, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Excluir custo fixo?</div>
            <div style={{ fontSize: 13, color: "#57534e", marginBottom: 20 }}>
              <strong>"{confirmDel.nome}"</strong> será removido. Os lançamentos <em>previstos</em> gerados por ele também serão excluídos.
              Lançamentos já realizados <strong>não</strong> são afetados.
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
