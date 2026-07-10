// ─── Financeiro: DRE simplificado, contas a pagar, curva ABC, histórico ──────
import { useEffect, useState } from "react";
import { api } from "../api";
import { s, cores, fmtBRL } from "../styles";

const hoje = () => { const d = new Date(); d.setUTCHours(d.getUTCHours() - 3); return d.toISOString().slice(0, 10); };
const inicioMes = () => hoje().slice(0, 8) + "01";

export default function Finance() {
  const [aba, setAba] = useState("dre");
  const [de, setDe] = useState(inicioMes());
  const [ate, setAte] = useState(hoje());
  const [toast, setToast] = useState(null);
  const showToast = (msg, cor = cores.verdeEscuro) => { setToast({ msg, cor }); setTimeout(() => setToast(null), 2500); };

  const ABAS = [
    { key: "dre", label: "📊 DRE" },
    { key: "abc", label: "🏆 Curva ABC" },
    { key: "contas", label: "📄 Contas a pagar" },
    { key: "caixas", label: "🗃️ Caixas" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={s.h1}>💰 Financeiro</div>
        <div style={s.sub}>Resultado do período, curva ABC de produtos e contas a pagar.</div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "#e9e7e5", borderRadius: 10, padding: 3 }}>
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              style={{
                padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
                fontWeight: aba === a.key ? 700 : 500, fontFamily: "inherit",
                background: aba === a.key ? "#fff" : "transparent", color: aba === a.key ? cores.verde : cores.ink2,
              }}>{a.label}</button>
          ))}
        </div>
        {(aba === "dre" || aba === "abc") && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" style={{ ...s.input, width: 150 }} value={de} onChange={e => setDe(e.target.value)} />
            <span style={{ color: cores.ink3 }}>→</span>
            <input type="date" style={{ ...s.input, width: 150 }} value={ate} onChange={e => setAte(e.target.value)} />
          </div>
        )}
      </div>

      {aba === "dre" && <DRE de={de} ate={ate} />}
      {aba === "abc" && <ABC de={de} ate={ate} />}
      {aba === "contas" && <Contas showToast={showToast} />}
      {aba === "caixas" && <Caixas />}

      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", borderRadius: 10, background: toast.cor, color: "#fff", fontSize: 13.5, zIndex: 999 }}>{toast.msg}</div>}
    </div>
  );
}

function DRE({ de, ate }) {
  const [r, setR] = useState(null);
  useEffect(() => { api.finance.resumo(de, ate).then(setR).catch(() => {}); }, [de, ate]);
  if (!r) return <div style={{ color: cores.ink3 }}>Carregando...</div>;
  const linha = (label, valor, opts = {}) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f5f5f4", fontSize: 14, fontWeight: opts.bold ? 800 : 500 }}>
      <span>{label}</span>
      <span style={{ color: opts.cor || cores.ink }}>{fmtBRL(valor)}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>DRE simplificado — {r.vendas_qtd} venda(s)</div>
        {linha("Receita bruta", r.dre.receita_bruta)}
        {linha("(−) Estornos", -r.dre.estornos, { cor: cores.vermelho })}
        {linha("Receita líquida", r.dre.receita_liquida, { bold: true })}
        {linha("(−) CMV (custo das mercadorias)", -r.dre.cmv, { cor: cores.vermelho })}
        {linha("Lucro bruto", r.dre.lucro_bruto, { bold: true, cor: cores.verde })}
        {linha("(−) Despesas pagas", -r.dre.despesas, { cor: cores.vermelho })}
        {linha("RESULTADO", r.dre.resultado, { bold: true, cor: r.dre.resultado >= 0 ? cores.verde : cores.vermelho })}
      </div>
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Por categoria (setor)</div>
        {r.por_categoria.length === 0 && <div style={{ color: cores.ink3, fontSize: 13 }}>Sem vendas no período.</div>}
        {r.por_categoria.map(c => (
          <div key={c.category} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f5f5f4", fontSize: 13.5 }}>
            <span>{c.category} <span style={{ color: cores.ink3, fontSize: 11 }}>({c.qtd} un)</span></span>
            <span>
              <b style={{ color: cores.verde }}>{fmtBRL(c.receita)}</b>
              <span style={{ color: cores.ink3, fontSize: 11.5, marginLeft: 6 }}>lucro {fmtBRL(c.receita - c.custo)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ABC({ de, ate }) {
  const [r, setR] = useState(null);
  useEffect(() => { api.finance.abc(de, ate).then(setR).catch(() => {}); }, [de, ate]);
  if (!r) return <div style={{ color: cores.ink3 }}>Carregando...</div>;
  const corClasse = { A: cores.verde, B: cores.ambar, C: cores.ink3 };
  return (
    <div style={{ ...s.card, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["#", "Produto", "Qtd", "Receita", "% da receita", "Classe"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>
          {r.curva.length === 0 && <tr><td colSpan={6} style={{ ...s.td, textAlign: "center", color: cores.ink3, padding: 30 }}>Sem vendas no período.</td></tr>}
          {r.curva.map((p, i) => (
            <tr key={p.product_id}>
              <td style={{ ...s.td, color: cores.ink3, fontWeight: 700 }}>{i + 1}º</td>
              <td style={{ ...s.td, fontWeight: 600 }}>{p.name}</td>
              <td style={s.td}>{p.qtd}</td>
              <td style={{ ...s.td, fontWeight: 700 }}>{fmtBRL(p.receita)}</td>
              <td style={s.td}>{p.pct}%</td>
              <td style={s.td}><span style={s.badge(corClasse[p.classe] + "22", corClasse[p.classe])}>{p.classe}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Contas({ showToast }) {
  const [lista, setLista] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [form, setForm] = useState({ description: "", category: "Geral", amount: "", due_date: hoje(), recurrence: "none", supplier_id: "" });

  const carregar = () => api.expenses.listar().then(setLista).catch(() => {});
  useEffect(() => { carregar(); api.suppliers.listar().then(setFornecedores).catch(() => {}); }, []);

  const criar = async () => {
    if (!form.description || !form.amount) return showToast("Descrição e valor são obrigatórios", cores.vermelho);
    try {
      await api.expenses.criar({ ...form, amount: Number(form.amount), supplier_id: form.supplier_id || null });
      setForm({ description: "", category: "Geral", amount: "", due_date: hoje(), recurrence: "none", supplier_id: "" });
      carregar(); showToast("Conta criada!");
    } catch (e) { showToast(e.message, cores.vermelho); }
  };

  const pagar = async (e) => {
    try { await api.expenses.pagar(e.id); carregar(); showToast("Conta paga! " + (e.recurrence !== "none" ? "Próxima ocorrência gerada." : "")); }
    catch (err) { showToast(err.message, cores.vermelho); }
  };

  const vencida = (e) => !e.paid_at && e.due_date < hoje();

  return (
    <div>
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>+ Nova conta a pagar</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10 }}>
          <div><label style={s.label}>Descrição *</label><input style={s.input} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div><label style={s.label}>Valor *</label><input style={s.input} type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          <div><label style={s.label}>Vencimento</label><input style={s.input} type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
          <div>
            <label style={s.label}>Recorrência</label>
            <select style={{ ...s.input, cursor: "pointer" }} value={form.recurrence} onChange={e => setForm({ ...form, recurrence: e.target.value })}>
              <option value="none">Única</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Fornecedor</label>
            <select style={{ ...s.input, cursor: "pointer" }} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">—</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        </div>
        <button style={{ ...s.btn, marginTop: 12 }} onClick={criar}>+ Adicionar conta</button>
      </div>

      <div style={{ ...s.card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Descrição", "Fornecedor", "Vencimento", "Valor", "Recorrência", "Status", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={7} style={{ ...s.td, textAlign: "center", color: cores.ink3, padding: 30 }}>Nenhuma conta cadastrada.</td></tr>}
            {lista.map(e => (
              <tr key={e.id} style={{ opacity: e.paid_at ? 0.55 : 1 }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{e.description}</td>
                <td style={s.td}>{e.supplier_name || "—"}</td>
                <td style={{ ...s.td, color: vencida(e) ? cores.vermelho : cores.ink, fontWeight: vencida(e) ? 700 : 500 }}>{e.due_date}</td>
                <td style={{ ...s.td, fontWeight: 700 }}>{fmtBRL(e.amount)}</td>
                <td style={s.td}>{e.recurrence === "none" ? "Única" : e.recurrence === "weekly" ? "Semanal" : "Mensal"}</td>
                <td style={s.td}>
                  {e.paid_at ? <span style={s.badge(cores.verdeBg, cores.verde)}>✓ Paga</span>
                    : vencida(e) ? <span style={s.badge(cores.vermelhoBg, cores.vermelho)}>Vencida</span>
                    : <span style={s.badge(cores.ambarBg, cores.ambar)}>Em aberto</span>}
                </td>
                <td style={{ ...s.td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {!e.paid_at && <button style={{ ...s.btn, padding: "5px 14px", fontSize: 12, marginRight: 6 }} onClick={() => pagar(e)}>💸 Pagar</button>}
                  <button style={{ ...s.btnDanger, padding: "5px 12px", fontSize: 12 }}
                    onClick={() => { if (confirm("Excluir esta conta?")) api.expenses.excluir(e.id).then(carregar); }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Caixas() {
  const [lista, setLista] = useState([]);
  useEffect(() => { api.cash.historico().then(setLista).catch(() => {}); }, []);
  return (
    <div style={{ ...s.card, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["Abertura", "Por", "Fechamento", "Fundo", "Diferença", "Status"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>
          {lista.length === 0 && <tr><td colSpan={6} style={{ ...s.td, textAlign: "center", color: cores.ink3, padding: 30 }}>Nenhum caixa registrado.</td></tr>}
          {lista.map(c => (
            <tr key={c.id}>
              <td style={{ ...s.td, fontSize: 12.5 }}>{(c.opened_at || "").slice(0, 16)}</td>
              <td style={s.td}>{c.opened_by_name}</td>
              <td style={{ ...s.td, fontSize: 12.5 }}>{c.closed_at ? c.closed_at.slice(0, 16) : "—"}</td>
              <td style={s.td}>{fmtBRL(c.opening_amount)}</td>
              <td style={{ ...s.td, fontWeight: 700, color: c.difference === null ? cores.ink3 : c.difference === 0 ? cores.verde : cores.vermelho }}>
                {c.difference === null ? "—" : fmtBRL(c.difference)}
              </td>
              <td style={s.td}>
                {c.status === "open" ? <span style={s.badge(cores.verdeBg, cores.verde)}>🟢 Aberto</span> : <span style={s.badge("#f5f5f4", cores.ink2)}>Fechado</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
