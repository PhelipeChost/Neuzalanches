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
      ? {
          nome: editando.nome,
          valor: String(editando.valor || 0),
          categoria: editando.categoria,
          ativo: !!editando.ativo,
          tipo: editando.tipo === "variavel" ? "variavel" : "fixo",
          diaria: String(editando.diaria || ""),
          qtd: String(editando.qtd || ""),
        }
      : { nome: "", valor: "", categoria: "Aluguel", ativo: true, tipo: "fixo", diaria: "", qtd: "" }
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const totalVariavel = (parseFloat(form.diaria) || 0) * (parseFloat(form.qtd) || 0);

  const salvar = async () => {
    setErro("");
    if (!form.nome.trim()) return setErro("Nome é obrigatório.");
    if (form.tipo === "variavel") {
      const diaria = parseFloat(form.diaria);
      const qtd = parseFloat(form.qtd);
      if (isNaN(diaria) || diaria < 0) return setErro("Valor da diária inválido.");
      if (isNaN(qtd) || qtd < 0) return setErro("Quantidade inválida.");
      setSalvando(true);
      try {
        await onSave({
          nome: form.nome.trim(), valor: 0, categoria: form.categoria, ativo: form.ativo,
          tipo: "variavel", diaria, qtd,
        });
        onClose();
      } catch (err) { setErro(err.message); setSalvando(false); }
    } else {
      const valor = parseFloat(form.valor);
      if (isNaN(valor) || valor < 0) return setErro("Valor inválido.");
      setSalvando(true);
      try {
        await onSave({
          nome: form.nome.trim(), valor, categoria: form.categoria, ativo: form.ativo,
          tipo: "fixo", diaria: 0, qtd: 0,
        });
        onClose();
      } catch (err) { setErro(err.message); setSalvando(false); }
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

          {/* Tipo: fixo (valor mensal) ou variável (diária × quantidade) */}
          <div>
            <label style={lbl}>TIPO DE CUSTO</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { v: "fixo",     l: "Fixo",     d: "Mesmo valor todo mês (ex: aluguel)" },
                { v: "variavel", l: "Variável", d: "Diária × nº de diárias (ex: garçom)" },
              ].map(t => (
                <button key={t.v} type="button"
                  onClick={() => setForm({ ...form, tipo: t.v })}
                  style={{
                    padding: "10px 12px", textAlign: "left",
                    borderRadius: 10, cursor: "pointer", background: "#fff",
                    border: `1.5px solid ${form.tipo === t.v ? (t.v === "fixo" ? "#2563eb" : "#F38C24") : "#e7e5e4"}`,
                    backgroundColor: form.tipo === t.v ? (t.v === "fixo" ? "#eff6ff" : "#fff7ed") : "#fff",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.tipo === t.v ? (t.v === "fixo" ? "#1e40af" : "#9a3412") : "#1c1917" }}>{t.l}</div>
                  <div style={{ fontSize: 11, color: "#78716c", marginTop: 2 }}>{t.d}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={lbl}>CATEGORIA</label>
            <select style={{ ...inp, cursor: "pointer", width: "100%" }} value={form.categoria}
              onChange={e => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {form.tipo === "variavel" ? (
            <div>
              <label style={lbl}>VALOR UNITÁRIO × QUANTIDADE</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
                <input style={inp} type="number" step="0.01" min="0" value={form.diaria}
                  onChange={e => setForm({ ...form, diaria: e.target.value })} placeholder="Valor da diária" />
                <span style={{ fontSize: 14, color: "#a8a29e", fontWeight: 600 }}>×</span>
                <input style={inp} type="number" step="1" min="0" value={form.qtd}
                  onChange={e => setForm({ ...form, qtd: e.target.value })} placeholder="Qtd no mês" />
              </div>
              <div style={{ marginTop: 8, padding: "8px 12px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 12, color: "#9a3412", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Total do mês:</span>
                <strong>{fmt(totalVariavel)}</strong>
              </div>
            </div>
          ) : (
            <div>
              <label style={lbl}>VALOR MENSAL (R$)</label>
              <input style={inp} type="number" step="0.01" min="0" value={form.valor}
                onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
            </div>
          )}

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
export default function CustosFixos({ onCustosChange }) {
  const [custos, setCustos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 3000); };

  // Notifica o pai (FluxoCaixa) sempre que a lista mudar
  const setCustosSync = (updater) => {
    setCustos(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (onCustosChange) onCustosChange(next);
      return next;
    });
  };

  const carregar = useCallback(async () => {
    try {
      const lista = await api.custosFixos.listar();
      setCustos(lista);
      if (onCustosChange) onCustosChange(lista);
    } catch (err) {
      showToast("Erro ao carregar: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (data) => {
    if (editando) {
      const atualizado = await api.custosFixos.atualizar(editando.id, data);
      setCustosSync(cs => cs.map(c => c.id === editando.id ? atualizado : c));
      showToast("Custo fixo atualizado!");
    } else {
      const novo = await api.custosFixos.criar(data);
      setCustosSync(cs => [...cs, novo]);
      showToast("Custo fixo cadastrado! Será lançado como previsto no mês atual.");
    }
    setEditando(null);
    setModal(false);
  };

  const toggleAtivo = async (cf) => {
    try {
      const atualizado = await api.custosFixos.atualizar(cf.id, { ...cf, ativo: !cf.ativo });
      setCustosSync(cs => cs.map(c => c.id === cf.id ? atualizado : c));
      showToast(atualizado.ativo ? "Custo ativado." : "Custo desativado.", "#78716c");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    }
  };

  const excluir = async (cf) => {
    try {
      await api.custosFixos.excluir(cf.id);
      setCustosSync(cs => cs.filter(c => c.id !== cf.id));
      setConfirmDel(null);
      showToast("Custo fixo excluído. Lançamentos previstos pendentes foram removidos.", "#78716c");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    }
  };

  // Total mensal: para variável usa diaria*qtd, para fixo usa valor
  const totalEfetivo = (c) => c.tipo === "variavel" ? (Number(c.diaria) || 0) * (Number(c.qtd) || 0) : (Number(c.valor) || 0);
  const totalMensal = custos.filter(c => c.ativo).reduce((s, c) => s + totalEfetivo(c), 0);

  // Edição inline da quantidade/diária de um custo variável (recalcula no banco)
  const atualizarVariavel = async (cf, campo, valor) => {
    const novoValor = Math.max(0, Number(valor) || 0);
    try {
      const atualizado = await api.custosFixos.atualizar(cf.id, {
        nome: cf.nome, valor: 0, categoria: cf.categoria, ativo: cf.ativo,
        tipo: "variavel",
        diaria: campo === "diaria" ? novoValor : (Number(cf.diaria) || 0),
        qtd:    campo === "qtd"    ? novoValor : (Number(cf.qtd) || 0),
      });
      setCustosSync(cs => cs.map(c => c.id === cf.id ? atualizado : c));
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

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
                  {fmt(itens.filter(i => i.ativo).reduce((s, i) => s + totalEfetivo(i), 0))}/mês
                </span>
              </div>
              {/* Itens */}
              {itens.map((cf, idx) => {
                const ehVariavel = cf.tipo === "variavel";
                const total = totalEfetivo(cf);
                return (
                <div key={cf.id} style={{ display: "flex", alignItems: "center", padding: "12px 18px", gap: 14, borderBottom: idx < itens.length - 1 ? "1px solid #f5f5f4" : "none", opacity: cf.ativo ? 1 : 0.5, flexWrap: "wrap" }}>
                  {/* Toggle ativo */}
                  <button
                    onClick={() => toggleAtivo(cf)}
                    title={cf.ativo ? "Clique para desativar" : "Clique para ativar"}
                    style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: cf.ativo ? "#15803d" : "#d6d3d1", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                    <span style={{ position: "absolute", top: 2, left: cf.ativo ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", display: "block" }} />
                  </button>

                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1c1917" }}>{cf.nome}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        background: ehVariavel ? "#fff7ed" : "#eff6ff",
                        color: ehVariavel ? "#9a3412" : "#1e40af",
                      }}>{ehVariavel ? "VARIÁVEL" : "FIXO"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 2 }}>
                      {!cf.ativo ? "Inativo" : ehVariavel
                        ? "Total = valor da diária × nº de diárias do mês"
                        : "Gera lançamento previsto todo mês"}
                    </div>
                  </div>

                  {/* Edição inline para variável */}
                  {ehVariavel ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#57534e", flexShrink: 0 }}>
                      R$
                      <input type="number" min="0" step="0.01" defaultValue={cf.diaria || 0}
                        onBlur={e => atualizarVariavel(cf, "diaria", e.target.value)}
                        style={{ width: 70, padding: "5px 7px", border: "1.5px solid #e7e5e4", borderRadius: 6, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", textAlign: "right", color: "#1c1917" }} />
                      <span style={{ color: "#a8a29e" }}>×</span>
                      <input type="number" min="0" step="1" defaultValue={cf.qtd || 0}
                        onBlur={e => atualizarVariavel(cf, "qtd", e.target.value)}
                        style={{ width: 56, padding: "5px 7px", border: "1.5px solid #e7e5e4", borderRadius: 6, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", textAlign: "center", color: "#1c1917" }} />
                      <span style={{ color: "#a8a29e", fontSize: 11 }}>diárias</span>
                    </div>
                  ) : null}

                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: "#dc2626", flexShrink: 0, minWidth: 110, textAlign: "right" }}>
                    {fmt(total)}<span style={{ fontSize: 11, color: "#a8a29e", fontWeight: 400 }}>/mês</span>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="icon-btn" onClick={() => { setEditando(cf); setModal(true); }}>✏️ Editar</button>
                    <button className="icon-btn del" onClick={() => setConfirmDel(cf)}>🗑️</button>
                  </div>
                </div>
              );})}
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
