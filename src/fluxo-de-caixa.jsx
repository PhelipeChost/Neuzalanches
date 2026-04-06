import { useState, useMemo, useEffect, useCallback } from "react";
import { api } from "./api";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const CATEGORIAS_ENTRADA = ["Vendas", "Serviços", "Investimento", "Empréstimo", "Outros"];
const CATEGORIAS_SAIDA = ["Fornecedores", "Folha de Pagamento", "Aluguel", "Impostos", "Marketing", "Infraestrutura", "Tecnologia", "Administrativo", "CMV", "Outros"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── COMPONENTES AUXILIARES ────────────────────────────────────────────────────
function Badge({ tipo }) {
  if (tipo === "entrada") return <span style={{ background: "#dcfce7", color: "#15803d", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Entrada</span>;
  if (tipo === "saida") return <span style={{ background: "#fee2e2", color: "#dc2626", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Saída</span>;
}

function StatusBadge({ status }) {
  if (status === "realizado") return <span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 600, letterSpacing: "0.05em" }}>REALIZADO</span>;
  return <span style={{ background: "#fefce8", color: "#ca8a04", border: "1px solid #fde68a", padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 600, letterSpacing: "0.05em" }}>PREVISTO</span>;
}

function MiniBar({ pct, cor }) {
  return (
    <div style={{ height: 4, background: "#f5f5f4", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: cor, borderRadius: 2, transition: "width 0.8s ease" }} />
    </div>
  );
}

function GraficoBarras({ dados }) {
  const max = Math.max(...dados.map(d => Math.max(d.entrada, d.saida)), 1);
  const W = 520, H = 140, barW = 28, gap = 52;

  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} style={{ width: "100%", maxWidth: W }}>
      {dados.map((d, i) => {
        const x = 20 + i * gap;
        const hE = (d.entrada / max) * H;
        const hS = (d.saida / max) * H;
        return (
          <g key={d.mes}>
            <rect x={x} y={H - hE} width={barW * 0.9} height={hE} rx={3} fill="#16a34a" opacity={0.85} />
            <rect x={x + barW} y={H - hS} width={barW * 0.9} height={hS} rx={3} fill="#dc2626" opacity={0.75} />
            <text x={x + barW * 0.9} y={H + 18} textAnchor="middle" fontSize={10} fill="#a8a29e" fontFamily="DM Sans, sans-serif">{d.mes}</text>
          </g>
        );
      })}
      <line x1={10} y1={H} x2={W - 10} y2={H} stroke="#e7e5e4" strokeWidth={1} />
    </svg>
  );
}

function GraficoLinha({ pontos, cor = "#15803d" }) {
  if (pontos.length < 2) return null;
  const max = Math.max(...pontos.map(p => p.v));
  const min = Math.min(...pontos.map(p => p.v));
  const range = max - min || 1;
  const W = 100, H = 36;
  const pts = pontos.map((p, i) => {
    const x = (i / (pontos.length - 1)) * W;
    const y = H - ((p.v - min) / range) * H;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 80, height: 32 }}>
      <polyline points={pts} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function GraficoReceitaCMV({ dados }) {
  const max = Math.max(...dados.map(d => Math.max(d.receita, d.cmv)), 1);
  const W = 520, H = 140, barW = 24, gap = 52;

  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} style={{ width: "100%", maxWidth: W }}>
      {dados.map((d, i) => {
        const x = 20 + i * gap;
        const hR = (d.receita / max) * H;
        const hC = (d.cmv / max) * H;
        return (
          <g key={d.mes}>
            <rect x={x} y={H - hR} width={barW * 0.9} height={hR} rx={3} fill="#2563eb" opacity={0.85} />
            <rect x={x + barW + 2} y={H - hC} width={barW * 0.9} height={hC} rx={3} fill="#f59e0b" opacity={0.85} />
            <text x={x + barW} y={H + 18} textAnchor="middle" fontSize={10} fill="#a8a29e" fontFamily="DM Sans, sans-serif">{d.mes}</text>
          </g>
        );
      })}
      <line x1={10} y1={H} x2={W - 10} y2={H} stroke="#e7e5e4" strokeWidth={1} />
    </svg>
  );
}

function GraficoDonut({ valor1, valor2, label1, label2, cor1 = "#2563eb", cor2 = "#f59e0b" }) {
  const total = valor1 + valor2;
  if (total === 0) return null;
  const pct1 = valor1 / total;
  const r = 40, cx = 50, cy = 50, circumference = 2 * Math.PI * r;
  const dash1 = circumference * pct1;
  const dash2 = circumference - dash1;

  return (
    <svg viewBox="0 0 100 100" style={{ width: 120, height: 120 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={cor2} strokeWidth={12} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={cor1} strokeWidth={12}
        strokeDasharray={`${dash1} ${dash2}`}
        strokeDashoffset={circumference * 0.25}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }} />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={14} fontWeight="600" fill="#1c1917" fontFamily="Fraunces, serif">
        {Math.round(pct1 * 100)}%
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize={7} fill="#a8a29e" fontFamily="DM Sans, sans-serif">MARGEM</text>
    </svg>
  );
}

// ─── MODAL DE LANÇAMENTO ───────────────────────────────────────────────────────
function ModalLancamento({ onSave, onClose, editando }) {
  const [form, setForm] = useState(editando || { tipo: "entrada", descricao: "", valor: "", data: new Date().toISOString().split("T")[0], cat: "Vendas", status: "realizado", obs: "" });
  const [salvando, setSalvando] = useState(false);
  const cats = form.tipo === "entrada" ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;

  const salvar = async () => {
    if (!form.descricao || !form.valor || !form.data) return;
    setSalvando(true);
    try {
      await onSave({ ...form, valor: parseFloat(form.valor) });
      onClose();
    } catch {
      setSalvando(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 500 }}>{editando ? "Editar" : "Novo"} Lançamento</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {["entrada", "saida"].map(t => (
            <button key={t} onClick={() => setForm({ ...form, tipo: t, cat: t === "entrada" ? "Vendas" : "Fornecedores" })}
              style={{ flex: 1, padding: "9px", border: `2px solid ${form.tipo === t ? (t === "entrada" ? "#15803d" : "#dc2626") : "#e7e5e4"}`, borderRadius: 8, background: form.tipo === t ? (t === "entrada" ? "#f0fdf4" : "#fef2f2") : "#fff", color: form.tipo === t ? (t === "entrada" ? "#15803d" : "#dc2626") : "#78716c", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
              {t === "entrada" ? "↑ Entrada" : "↓ Saída"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[["Descrição", "text", "descricao", "Ex: Pagamento cliente X"], ["Valor (R$)", "number", "valor", "0,00"]].map(([label, type, key, ph]) => (
            <div key={key}>
              <label style={lbl}>{label}</label>
              <input style={inp} type={type} placeholder={ph} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div>
              <label style={lbl}>Data</label>
              <input style={inp} type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Status</label>
              <select style={inp} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="realizado">Realizado</option>
                <option value="previsto">Previsto</option>
              </select>
            </div>
          </div>

          <div>
            <label style={lbl}>Categoria</label>
            <select style={inp} value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>
              {cats.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>Observação (opcional)</label>
            <input style={inp} placeholder="Notas adicionais..." value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ flex: 2, padding: 11, background: form.tipo === "entrada" ? "#15803d" : "#dc2626", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: salvando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: salvando ? 0.7 : 1 }}>
            {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Registrar lançamento"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL SALDO INICIAL ──────────────────────────────────────────────────────
function ModalSaldoInicial({ valorAtual, onSave, onClose }) {
  const [valor, setValor] = useState(String(valorAtual));
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const num = parseFloat(valor);
    if (isNaN(num)) return;
    setSalvando(true);
    try {
      await onSave(num);
      onClose();
    } catch {
      setSalvando(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 500, marginBottom: 18 }}>Saldo Inicial</div>
        <label style={lbl}>Valor (R$)</label>
        <input style={inp} type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ flex: 2, padding: 11, background: "#15803d", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: salvando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: salvando ? 0.7 : 1 }}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };
const inp = { width: "100%", padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917", background: "#fff" };

// ─── FLUXO DE CAIXA PRINCIPAL ──────────────────────────────────────────────────
export default function FluxoCaixa() {
  const [tab, setTab] = useState("visao-geral");
  const [lancamentos, setLancamentos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [modalSaldo, setModalSaldo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroCat, setFiltroCat] = useState("todas");
  const [mesSel, setMesSel] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [busca, setBusca] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  // ─── CARREGAR DADOS DO BANCO ───────────────────────────────────────────────
  const carregarDados = useCallback(async () => {
    try {
      const [lancs, config, peds] = await Promise.all([
        api.lancamentos.listar(),
        api.config.obter(),
        api.pedidos.listar(),
      ]);
      setLancamentos(lancs);
      setSaldoInicial(config.saldo_inicial);
      setPedidos(peds);
    } catch (err) {
      showToast("Erro ao carregar dados: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // Filtrar por mês selecionado
  const lancamentosMes = useMemo(() => lancamentos.filter(l => l.data.startsWith(mesSel)), [lancamentos, mesSel]);

  // Métricas do mês
  const entradas = useMemo(() => lancamentosMes.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0), [lancamentosMes]);
  const saidas = useMemo(() => lancamentosMes.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0), [lancamentosMes]);
  const saldoMes = entradas - saidas;
  const entradasRealizadas = useMemo(() => lancamentosMes.filter(l => l.tipo === "entrada" && l.status === "realizado").reduce((s, l) => s + l.valor, 0), [lancamentosMes]);
  const saidasRealizadas = useMemo(() => lancamentosMes.filter(l => l.tipo === "saida" && l.status === "realizado").reduce((s, l) => s + l.valor, 0), [lancamentosMes]);
  const saldoAtual = saldoInicial + entradasRealizadas - saidasRealizadas;

  // ─── CMV & INDICADORES DO MÊS (baseado em pedidos entregues) ────────────────
  const pedidosMes = useMemo(() => pedidos.filter(p => p.status === "entregue" && p.created_at && p.created_at.startsWith(mesSel)), [pedidos, mesSel]);

  const receitaVendas = useMemo(() => pedidosMes.reduce((s, p) => s + p.total, 0), [pedidosMes]);

  const cmvTotal = useMemo(() => {
    return pedidosMes.reduce((total, p) => {
      const custoItens = (p.itens || []).reduce((s, item) => {
        return s + (item.custo_unitario || 0) * item.quantidade;
      }, 0);
      return total + custoItens;
    }, 0);
  }, [pedidosMes]);

  const lucroBruto = receitaVendas - cmvTotal;
  const margemBruta = receitaVendas > 0 ? (lucroBruto / receitaVendas) * 100 : 0;
  const markup = cmvTotal > 0 ? ((receitaVendas - cmvTotal) / cmvTotal) * 100 : 0;
  const ticketMedio = pedidosMes.length > 0 ? receitaVendas / pedidosMes.length : 0;
  const custoMedioPedido = pedidosMes.length > 0 ? cmvTotal / pedidosMes.length : 0;

  // Dados para gráfico Receita vs CMV (últimos 4 meses)
  const dadosReceitaCMV = useMemo(() => {
    const [ano, mes] = mesSel.split("-").map(Number);
    const meses = [];
    for (let i = -2; i <= 1; i++) {
      let m = mes + i;
      let a = ano;
      if (m < 1) { m += 12; a--; }
      if (m > 12) { m -= 12; a++; }
      meses.push(`${a}-${String(m).padStart(2, "0")}`);
    }
    return meses.map(mesKey => {
      const pedsEntregues = pedidos.filter(p => p.status === "entregue" && p.created_at && p.created_at.startsWith(mesKey));
      const receita = pedsEntregues.reduce((s, p) => s + p.total, 0);
      const cmv = pedsEntregues.reduce((total, p) => {
        return total + (p.itens || []).reduce((s, item) => s + (item.custo_unitario || 0) * item.quantidade, 0);
      }, 0);
      return {
        mes: MESES[parseInt(mesKey.split("-")[1]) - 1],
        receita,
        cmv,
      };
    });
  }, [pedidos, mesSel]);

  // Filtros da listagem
  const lancamentosFiltrados = useMemo(() => lancamentosMes.filter(l => {
    if (filtroTipo !== "todos" && l.tipo !== filtroTipo) return false;
    if (filtroStatus !== "todos" && l.status !== filtroStatus) return false;
    if (filtroCat !== "todas" && l.cat !== filtroCat) return false;
    if (busca && !l.descricao.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  }).sort((a, b) => new Date(b.data) - new Date(a.data)), [lancamentosMes, filtroTipo, filtroStatus, filtroCat, busca]);

  // Categorias do mês
  const categorias = useMemo(() => {
    const acc = {};
    lancamentosMes.forEach(l => {
      if (!acc[l.cat]) acc[l.cat] = { entrada: 0, saida: 0 };
      acc[l.cat][l.tipo] += l.valor;
    });
    return Object.entries(acc).map(([cat, v]) => ({ cat, ...v })).sort((a, b) => (b.entrada + b.saida) - (a.entrada + a.saida));
  }, [lancamentosMes]);

  // Saldo acumulado por dia (para o mês)
  const saldoDiario = useMemo(() => {
    let acum = saldoInicial;
    const ordenados = [...lancamentosMes].filter(l => l.status === "realizado").sort((a, b) => new Date(a.data) - new Date(b.data));
    const resultado = [];
    const diasSet = [...new Set(ordenados.map(l => l.data))].sort();
    diasSet.forEach(dia => {
      const movs = ordenados.filter(l => l.data === dia);
      movs.forEach(l => { acum += l.tipo === "entrada" ? l.valor : -l.valor; });
      resultado.push({ v: acum, d: dia.split("-")[2] });
    });
    return resultado.length > 1 ? resultado : [{ v: saldoInicial, d: "01" }, { v: saldoAtual, d: "30" }];
  }, [lancamentosMes, saldoAtual, saldoInicial]);

  // Dados para gráfico de barras (mês selecionado ± 2 meses)
  const dadosGrafico = useMemo(() => {
    const [ano, mes] = mesSel.split("-").map(Number);
    const meses = [];
    for (let i = -2; i <= 1; i++) {
      let m = mes + i;
      let a = ano;
      if (m < 1) { m += 12; a--; }
      if (m > 12) { m -= 12; a++; }
      meses.push(`${a}-${String(m).padStart(2, "0")}`);
    }
    return meses.map(m => {
      const ls = lancamentos.filter(l => l.data.startsWith(m));
      return {
        mes: MESES[parseInt(m.split("-")[1]) - 1],
        entrada: ls.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0),
        saida: ls.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0),
      };
    });
  }, [lancamentos, mesSel]);

  // Meses para projeção (mês atual + 2 próximos)
  const mesesProjecao = useMemo(() => {
    const [ano, mes] = mesSel.split("-").map(Number);
    const result = [];
    for (let i = 0; i < 3; i++) {
      let m = mes + i;
      let a = ano;
      if (m > 12) { m -= 12; a++; }
      result.push(`${a}-${String(m).padStart(2, "0")}`);
    }
    return result;
  }, [mesSel]);

  // ─── CRUD OPERATIONS ─────────────────────────────────────────────────────────
  const salvarLancamento = async (l) => {
    try {
      if (editando) {
        const atualizado = await api.lancamentos.atualizar(l.id, l);
        setLancamentos(ls => ls.map(x => x.id === l.id ? atualizado : x));
        showToast("Lançamento atualizado!");
      } else {
        const novo = await api.lancamentos.criar(l);
        setLancamentos(ls => [novo, ...ls]);
        showToast("Lançamento registrado!");
      }
      setEditando(null);
    } catch (err) {
      showToast("Erro ao salvar: " + err.message, "#dc2626");
      throw err;
    }
  };

  const excluir = async (id) => {
    try {
      await api.lancamentos.excluir(id);
      setLancamentos(ls => ls.filter(l => l.id !== id));
      setConfirmDel(null);
      showToast("Lançamento excluído.", "#7c3aed");
    } catch (err) {
      showToast("Erro ao excluir: " + err.message, "#dc2626");
    }
  };

  const salvarSaldoInicial = async (valor) => {
    try {
      await api.config.salvar({ saldo_inicial: valor });
      setSaldoInicial(valor);
      showToast("Saldo inicial atualizado!");
    } catch (err) {
      showToast("Erro ao salvar saldo: " + err.message, "#dc2626");
      throw err;
    }
  };

  const nav = [
    { key: "visao-geral", label: "Visão Geral" },
    { key: "indicadores", label: "Indicadores CMV" },
    { key: "lancamentos", label: "Lançamentos" },
    { key: "categorias", label: "Por Categoria" },
    { key: "projecao", label: "Projeção" },
  ];

  const corSaldo = saldoAtual >= 0 ? "#15803d" : "#dc2626";

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando dados financeiros...</div>;
  }

  return (
    <div className="anim">
      {/* Sub-navegação financeira + controles */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 2, background: "#f5f5f4", borderRadius: 10, padding: 3, flexWrap: "wrap", width: "100%", maxWidth: 900 }}>
          {nav.map(n => (
            <button key={n.key} className={`nav-pill ${tab === n.key ? "active" : ""}`} onClick={() => setTab(n.key)}>{n.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#a8a29e" }}>Mês:</span>
            <input type="month" className="mes-sel" value={mesSel} onChange={e => setMesSel(e.target.value)} />
          </div>
          <button className="btn-add" onClick={() => { setEditando(null); setModal(true); }} style={{ background: "#F38C24" }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Novo lançamento
          </button>
        </div>
      </div>

        {/* ── VISÃO GERAL ──────────────────────────────────────────────────── */}
        {tab === "visao-geral" && (
          <div className="anim">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
              <div className="saldo-card">
                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>SALDO ATUAL</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{fmt(saldoAtual)}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  Saldo inicial: {fmt(saldoInicial)}
                  <button className="saldo-edit-btn" onClick={() => setModalSaldo(true)}>Editar</button>
                </div>
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  <GraficoLinha pontos={saldoDiario} cor="#86efac" />
                  <span style={{ fontSize: 12, opacity: 0.8 }}>{saldoDiario.length} movimentos realizados</span>
                </div>
              </div>

              {[
                { label: "ENTRADAS NO MÊS", valor: entradas, sub: `${fmt(entradasRealizadas)} realizados`, cor: "#15803d", pct: entradas > 0 ? 100 : 0 },
                { label: "SAÍDAS NO MÊS", valor: saidas, sub: `${fmt(saidasRealizadas)} realizados`, cor: "#dc2626", pct: entradas > 0 ? Math.round((saidas / entradas) * 100) : 0 },
                { label: "RESULTADO DO MÊS", valor: saldoMes, sub: saldoMes >= 0 ? "Superávit" : "Déficit", cor: saldoMes >= 0 ? "#15803d" : "#dc2626", pct: entradas > 0 ? Math.abs(Math.round((saldoMes / entradas) * 100)) : 0 },
              ].map(m => (
                <div key={m.label} className="metric">
                  <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>{m.label}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 500, color: m.cor, lineHeight: 1 }}>{fmt(m.valor)}</div>
                  <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 6 }}>{m.sub}</div>
                  <MiniBar pct={m.pct} cor={m.cor} />
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Entradas × Saídas</div>
                  <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#78716c" }}>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#16a34a", borderRadius: 2, marginRight: 4 }} />Entradas</span>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#dc2626", borderRadius: 2, marginRight: 4 }} />Saídas</span>
                  </div>
                </div>
                <GraficoBarras dados={dadosGrafico} />
              </div>

              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "16px 18px", borderBottom: "1px solid #f5f5f4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Últimos lançamentos</div>
                  <button onClick={() => setTab("lancamentos")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#15803d", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>Ver todos →</button>
                </div>
                {lancamentosMes.length === 0 ? (
                  <div style={{ padding: "32px 0", textAlign: "center", color: "#a8a29e", fontSize: 13 }}>
                    Nenhum lançamento neste mês.
                  </div>
                ) : [...lancamentosMes].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5).map(l => (
                  <div key={l.id} className="row-item" onClick={() => { setEditando(l); setModal(true); }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: l.tipo === "entrada" ? "#15803d" : "#dc2626", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.descricao}</div>
                      <div style={{ fontSize: 10, color: "#a8a29e" }}>{l.data.split("-").reverse().join("/")} · {l.cat}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: l.tipo === "entrada" ? "#15803d" : "#dc2626", flexShrink: 0 }}>
                      {l.tipo === "entrada" ? "+" : "-"}{fmt(l.valor)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alertas */}
            {(() => {
              const previstos = lancamentosMes.filter(l => l.status === "previsto");
              const entradasPrev = previstos.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
              const saidasPrev = previstos.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
              if (previstos.length === 0) return null;
              return (
                <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 12, padding: "14px 18px", display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>⚠</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>{previstos.length} lançamentos previstos ainda não realizados</div>
                    <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
                      {fmt(entradasPrev)} em entradas e {fmt(saidasPrev)} em saídas aguardando confirmação.
                    </div>
                  </div>
                  <button onClick={() => { setTab("lancamentos"); setFiltroStatus("previsto"); }} style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#92400e" }}>
                    Revisar previstos
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── INDICADORES CMV ───────────────────────────────────────────────── */}
        {tab === "indicadores" && (
          <div className="anim">
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
              {[
                { label: "RECEITA TOTAL", valor: fmt(receitaVendas), cor: "#2563eb", desc: `${pedidosMes.length} pedidos entregues` },
                { label: "CMV TOTAL", valor: fmt(cmvTotal), cor: "#f59e0b", desc: "Custo das mercadorias vendidas" },
                { label: "LUCRO BRUTO", valor: fmt(lucroBruto), cor: lucroBruto >= 0 ? "#15803d" : "#dc2626", desc: "Receita - CMV" },
                { label: "MARGEM BRUTA", valor: `${margemBruta.toFixed(1)}%`, cor: margemBruta >= 30 ? "#15803d" : margemBruta >= 15 ? "#d97706" : "#dc2626", desc: margemBruta >= 30 ? "Margem saudavel" : margemBruta >= 15 ? "Margem moderada" : "Margem baixa" },
              ].map(m => (
                <div key={m.label} className="metric">
                  <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>{m.label}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 500, color: m.cor, lineHeight: 1 }}>{m.valor}</div>
                  <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 6 }}>{m.desc}</div>
                </div>
              ))}
            </div>

            {/* Segunda linha de KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
              {[
                { label: "MARKUP", valor: `${markup.toFixed(1)}%`, cor: "#7c3aed", desc: "Margem sobre o custo" },
                { label: "TICKET MEDIO", valor: fmt(ticketMedio), cor: "#2563eb", desc: "Valor medio por pedido" },
                { label: "CUSTO MEDIO/PEDIDO", valor: fmt(custoMedioPedido), cor: "#f59e0b", desc: "CMV medio por pedido" },
                { label: "PEDIDOS NO MES", valor: String(pedidosMes.length), cor: "#1c1917", desc: "Pedidos entregues" },
              ].map(m => (
                <div key={m.label} className="metric">
                  <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>{m.label}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 500, color: m.cor, lineHeight: 1 }}>{m.valor}</div>
                  <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 6 }}>{m.desc}</div>
                </div>
              ))}
            </div>

            {/* Gráficos */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
              {/* Gráfico Receita vs CMV */}
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Receita vs CMV</div>
                  <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#78716c" }}>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#2563eb", borderRadius: 2, marginRight: 4 }} />Receita</span>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#f59e0b", borderRadius: 2, marginRight: 4 }} />CMV</span>
                  </div>
                </div>
                <GraficoReceitaCMV dados={dadosReceitaCMV} />
              </div>

              {/* Donut de composição */}
              <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, alignSelf: "flex-start" }}>Composicao da Receita</div>
                {receitaVendas > 0 ? (
                  <>
                    <GraficoDonut valor1={lucroBruto > 0 ? lucroBruto : 0} valor2={cmvTotal} label1="Lucro" label2="CMV" cor1="#15803d" cor2="#f59e0b" />
                    <div style={{ display: "flex", gap: 20, marginTop: 16, fontSize: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: "#15803d" }} />
                        <span style={{ color: "#44403c" }}>Lucro Bruto</span>
                        <span style={{ fontWeight: 600, color: "#15803d" }}>{fmt(lucroBruto)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: "#f59e0b" }} />
                        <span style={{ color: "#44403c" }}>CMV</span>
                        <span style={{ fontWeight: 600, color: "#f59e0b" }}>{fmt(cmvTotal)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: "#a8a29e", fontSize: 13, padding: "24px 0" }}>Sem dados de vendas neste mes.</div>
                )}
              </div>
            </div>

            {/* Tabela de detalhamento por pedido */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #f5f5f4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Detalhamento por pedido entregue</div>
                <div style={{ fontSize: 11, color: "#a8a29e" }}>{pedidosMes.length} pedidos</div>
              </div>
              {pedidosMes.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center", color: "#a8a29e", fontSize: 13 }}>Nenhum pedido entregue neste mes.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#fafaf9", borderBottom: "1px solid #f5f5f4" }}>
                      {["Pedido", "Cliente", "Receita", "CMV", "Lucro", "Margem"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em" }}>{h.toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosMes.slice(0, 20).map(p => {
                      const cmvPedido = (p.itens || []).reduce((s, item) => s + (item.custo_unitario || 0) * item.quantidade, 0);
                      const lucroPedido = p.total - cmvPedido;
                      const margemPedido = p.total > 0 ? (lucroPedido / p.total) * 100 : 0;
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid #fafaf9" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#fafaf9"}
                          onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <td style={{ padding: "10px 16px", fontSize: 12, fontWeight: 500 }}>#{p.id.slice(0, 6)}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, color: "#57534e" }}>{p.cliente_nome || "—"}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#2563eb" }}>{fmt(p.total)}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, fontWeight: 500, color: "#f59e0b" }}>{fmt(cmvPedido)}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, color: lucroPedido >= 0 ? "#15803d" : "#dc2626" }}>{fmt(lucroPedido)}</td>
                          <td style={{ padding: "10px 16px" }}>
                            <span style={{ background: margemPedido >= 30 ? "#dcfce7" : margemPedido >= 15 ? "#fef3c7" : "#fee2e2", color: margemPedido >= 30 ? "#15803d" : margemPedido >= 15 ? "#92400e" : "#dc2626", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                              {margemPedido.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── LANÇAMENTOS ──────────────────────────────────────────────────── */}
        {tab === "lancamentos" && (
          <div className="anim">
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <input className="search" placeholder="Buscar lançamento..." value={busca} onChange={e => setBusca(e.target.value)} />
              <div style={{ display: "flex", gap: 6 }}>
                {[["todos", "Todos"], ["entrada", "Entradas"], ["saida", "Saídas"]].map(([v, l]) => (
                  <button key={v} className={`fil ${filtroTipo === v ? "ativo" : ""}`} onClick={() => setFiltroTipo(v)}>{l}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["todos", "Todos"], ["realizado", "Realizados"], ["previsto", "Previstos"]].map(([v, l]) => (
                  <button key={v} className={`fil ${filtroStatus === v ? "ativo" : ""}`} onClick={() => setFiltroStatus(v)}>{l}</button>
                ))}
              </div>
              <select className="fil" value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ cursor: "pointer" }}>
                <option value="todas">Todas categorias</option>
                {[...CATEGORIAS_ENTRADA, ...CATEGORIAS_SAIDA].filter((v, i, a) => a.indexOf(v) === i).map(c => <option key={c}>{c}</option>)}
              </select>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 12, color: "#a8a29e" }}>{lancamentosFiltrados.length} registros</div>
            </div>

            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px 110px 100px 90px 80px", gap: 0, padding: "10px 16px", borderBottom: "1px solid #f5f5f4", background: "#fafaf9" }}>
                {["Data", "Descrição", "Categoria", "Valor", "Tipo", "Status", ""].map(h => (
                  <div key={h} style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em" }}>{h.toUpperCase()}</div>
                ))}
              </div>

              {lancamentosFiltrados.length === 0 ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "#a8a29e", fontSize: 13 }}>
                  Nenhum lançamento encontrado para os filtros selecionados.
                </div>
              ) : lancamentosFiltrados.map(l => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px 110px 100px 90px 80px", gap: 0, padding: "11px 16px", borderBottom: "1px solid #fafaf9", transition: "background 0.1s", alignItems: "center" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafaf9"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}>
                  <div style={{ fontSize: 12, color: "#78716c" }}>{l.data.split("-").reverse().join("/")}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{l.descricao}</div>
                    {l.obs && <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 1 }}>{l.obs}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: "#57534e" }}>{l.cat}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: l.tipo === "entrada" ? "#15803d" : "#dc2626" }}>
                    {l.tipo === "entrada" ? "+" : "-"}{fmt(l.valor)}
                  </div>
                  <div><Badge tipo={l.tipo} /></div>
                  <div><StatusBadge status={l.status} /></div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button className="icon-btn" onClick={() => { setEditando(l); setModal(true); }} title="Editar">✎</button>
                    <button className="icon-btn del" onClick={() => setConfirmDel(l.id)} title="Excluir">✕</button>
                  </div>
                </div>
              ))}
            </div>

            {lancamentosFiltrados.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, marginTop: 12, padding: "10px 16px", background: "#fff", borderRadius: 10, border: "1px solid #e7e5e4" }}>
                {[
                  ["Entradas", lancamentosFiltrados.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0), "#15803d"],
                  ["Saídas", lancamentosFiltrados.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0), "#dc2626"],
                  ["Saldo", lancamentosFiltrados.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0) - lancamentosFiltrados.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0), "#1c1917"],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em" }}>{l.toUpperCase()}</div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 500, color: c }}>{fmt(v)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CATEGORIAS ───────────────────────────────────────────────────── */}
        {tab === "categorias" && (
          <div className="anim">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {["entrada", "saida"].map(tipo => {
                const cats = categorias.filter(c => c[tipo] > 0).sort((a, b) => b[tipo] - a[tipo]);
                const total = cats.reduce((s, c) => s + c[tipo], 0);
                const cor = tipo === "entrada" ? "#15803d" : "#dc2626";
                const cores = tipo === "entrada"
                  ? ["#15803d", "#16a34a", "#22c55e", "#4ade80", "#86efac"]
                  : ["#dc2626", "#ef4444", "#f87171", "#fca5a5", "#d97706"];

                return (
                  <div key={tipo} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{tipo === "entrada" ? "↑ Receitas" : "↓ Despesas"} por categoria</div>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, color: cor, fontWeight: 500 }}>{fmt(total)}</div>
                    </div>

                    {cats.length === 0 ? (
                      <div style={{ padding: "24px 0", textAlign: "center", color: "#a8a29e", fontSize: 13 }}>Sem dados neste mês.</div>
                    ) : cats.map((c, i) => {
                      const pct = total > 0 ? Math.round((c[tipo] / total) * 100) : 0;
                      return (
                        <div key={c.cat} style={{ marginBottom: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 13 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: cores[i % cores.length], flexShrink: 0 }} />
                              <span style={{ color: "#44403c" }}>{c.cat}</span>
                            </div>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#a8a29e" }}>{pct}%</span>
                              <span style={{ fontWeight: 600, color: cor }}>{fmt(c[tipo])}</span>
                            </div>
                          </div>
                          <div style={{ height: 6, background: "#f5f5f4", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: cores[i % cores.length], borderRadius: 3, transition: "width 0.8s ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="card" style={{ marginTop: 14, padding: 0, overflowX: "auto" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #f5f5f4", fontSize: 13, fontWeight: 600 }}>Resumo por categoria</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fafaf9", borderBottom: "1px solid #f5f5f4" }}>
                    {["Categoria", "Entradas", "Saídas", "Saldo"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em" }}>{h.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categorias.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: "32px 0", textAlign: "center", color: "#a8a29e", fontSize: 13 }}>Sem dados neste mês.</td></tr>
                  ) : categorias.map(c => (
                    <tr key={c.cat} style={{ borderBottom: "1px solid #fafaf9" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#fafaf9"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 500 }}>{c.cat}</td>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: "#15803d", fontWeight: 500 }}>{c.entrada > 0 ? fmt(c.entrada) : "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: "#dc2626", fontWeight: 500 }}>{c.saida > 0 ? fmt(c.saida) : "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600, color: (c.entrada - c.saida) >= 0 ? "#15803d" : "#dc2626" }}>{fmt(c.entrada - c.saida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PROJEÇÃO ─────────────────────────────────────────────────────── */}
        {tab === "projecao" && (
          <div className="anim">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 16 }}>
              {[
                { label: "SALDO ATUAL", valor: saldoAtual, cor: corSaldo, desc: "Baseado nos lançamentos realizados" },
                { label: "PREVISÃO DE ENTRADAS", valor: lancamentos.filter(l => l.tipo === "entrada" && l.status === "previsto" && l.data.startsWith(mesSel)).reduce((s, l) => s + l.valor, 0), cor: "#15803d", desc: "Lançamentos previstos não realizados" },
                { label: "PREVISÃO DE SAÍDAS", valor: lancamentos.filter(l => l.tipo === "saida" && l.status === "previsto" && l.data.startsWith(mesSel)).reduce((s, l) => s + l.valor, 0), cor: "#dc2626", desc: "Lançamentos previstos não realizados" },
              ].map(m => (
                <div key={m.label} className="metric">
                  <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>{m.label}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 26, fontWeight: 500, color: m.cor }}>{fmt(m.valor)}</div>
                  <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 6 }}>{m.desc}</div>
                </div>
              ))}
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 20 }}>Projeção mensal — próximos 3 meses</div>
              {mesesProjecao.map((m, idx) => {
                const ls = lancamentos.filter(l => l.data.startsWith(m));
                const ent = ls.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
                const sai = ls.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
                const sal = ent - sai;
                const nomeMes = MESES[parseInt(m.split("-")[1]) - 1];
                const isAtual = m === mesSel;
                return (
                  <div key={m} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, padding: "14px 16px", background: isAtual ? "#f0fdf4" : "#fafaf9", borderRadius: 10, border: isAtual ? "1.5px solid #bbf7d0" : "1.5px solid transparent" }}>
                    <div style={{ width: 52, textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>{nomeMes}</div>
                      {isAtual && <div style={{ fontSize: 9, color: "#15803d", fontWeight: 600, letterSpacing: "0.08em" }}>ATUAL</div>}
                      {idx > 0 && <div style={{ fontSize: 9, color: "#a8a29e", letterSpacing: "0.06em" }}>PREVISTO</div>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        <div style={{ flex: ent, height: 8, background: "#16a34a", borderRadius: "4px 0 0 4px", minWidth: ent > 0 ? 4 : 0 }} />
                        <div style={{ flex: sai, height: 8, background: "#dc2626", borderRadius: "0 4px 4px 0", minWidth: sai > 0 ? 4 : 0 }} />
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                        <span style={{ color: "#15803d" }}>↑ {fmt(ent)}</span>
                        <span style={{ color: "#dc2626" }}>↓ {fmt(sai)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 100 }}>
                      <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 2 }}>RESULTADO</div>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600, color: sal >= 0 ? "#15803d" : "#dc2626" }}>{fmt(sal)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 18 }}>Indicadores financeiros</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
                {[
                  { label: "Margem do mês", valor: entradas > 0 ? `${Math.round((saldoMes / entradas) * 100)}%` : "—", desc: "Lucro sobre receita", cor: saldoMes / (entradas || 1) > 0.2 ? "#15803d" : "#d97706" },
                  { label: "Taxa de realização", valor: lancamentosMes.length > 0 ? `${Math.round((lancamentosMes.filter(l => l.status === "realizado").length / lancamentosMes.length) * 100)}%` : "—", desc: "Lançamentos confirmados", cor: "#2563eb" },
                  { label: "Comprometimento", valor: entradas > 0 ? `${Math.round((saidas / entradas) * 100)}%` : "—", desc: "Despesas sobre receita", cor: saidas / (entradas || 1) > 0.8 ? "#dc2626" : "#15803d" },
                ].map(i => (
                  <div key={i.label} style={{ textAlign: "center", padding: "16px", background: "#fafaf9", borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>{i.label.toUpperCase()}</div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 500, color: i.cor }}>{i.valor}</div>
                    <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4 }}>{i.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      {/* MODAL LANÇAMENTO */}
      {modal && <ModalLancamento onSave={salvarLancamento} onClose={() => { setModal(false); setEditando(null); }} editando={editando} />}

      {/* MODAL SALDO INICIAL */}
      {modalSaldo && <ModalSaldoInicial valorAtual={saldoInicial} onSave={salvarSaldoInicial} onClose={() => setModalSaldo(false)} />}

      {/* MODAL CONFIRMAR EXCLUSÃO */}
      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConfirmDel(null)}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "26px 28px", width: 360 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Excluir lançamento?</div>
            <div style={{ fontSize: 13, color: "#78716c", marginBottom: 22 }}>Essa ação não pode ser desfeita.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDel(null)} style={{ flex: 1, padding: 10, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
              <button onClick={() => excluir(confirmDel)} style={{ flex: 1, padding: 10, background: "#dc2626", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}
