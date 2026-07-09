import { useState, useMemo, useEffect, useCallback } from "react";
import { api } from "./api";
import CustosFixos from "./CustosFixos";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const CATEGORIAS_ENTRADA = ["Vendas", "Serviços", "Investimento", "Empréstimo", "Outros"];
const CATEGORIAS_SAIDA = ["Fornecedores", "Folha de Pagamento", "Aluguel", "Impostos", "Marketing", "Infraestrutura", "Tecnologia", "Administrativo", "CMV", "Outros"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// CMV legado: vendas antigas geravam um lançamento de SAÍDA "CMV". O CMV agora
// vive embutido na venda (campo custo) e no DRE — fora do feed/caixa.
const ehCMVLegado = (l) => l.tipo === "saida" && l.cat === "CMV";

// Ícone do feed por natureza do lançamento
function iconeLanc(l) {
  if (l.tipo === "entrada") return l.cat === "Vendas" ? "🧾" : "⬇️";
  const c = (l.cat || "").toLowerCase();
  if (c.includes("folha")) return "👤";
  if (c.includes("fornecedor")) return "📦";
  if (c.includes("aluguel")) return "🏠";
  if (c.includes("imposto")) return "🧾";
  if (c.includes("marketing")) return "📣";
  if (c.includes("empréstimo") || c.includes("emprestimo")) return "🏦";
  return "💸";
}

// Determina a "categoria visual" do ícone (cores do modelo)
function classeIconeLanc(l) {
  if (l.tipo === "entrada") return l.cat === "Vendas" ? "ns-ic-venda" : "ns-ic-prev";
  const c = (l.cat || "").toLowerCase();
  if (c.includes("folha"))      return "ns-ic-folha";
  if (c.includes("fornecedor")) return "ns-ic-forn";
  if (c.includes("empréstimo") || c.includes("emprestimo")) return "ns-ic-emp";
  return "ns-ic-saida";
}

// Linha do feed: venda + custo + margem em UMA linha (item 1 do briefing)
function LancRow({ l, onClick }) {
  const pos = l.tipo === "entrada";
  const margem = (l.custo != null && l.valor > 0) ? ((l.valor - l.custo) / l.valor) * 100 : null;
  return (
    <div className="ns-lanc" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className={`ic ${classeIconeLanc(l)}`}>{iconeLanc(l)}</div>
      <div className="mid">
        <div className="nm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.descricao}</div>
        <div className="meta">
          <span className="mtag">{l.cat}</span>
          <span>{l.data.split("-").reverse().join("/")}</span>
          {l.status === "previsto" && <span className="ns-chip warn" style={{ fontSize: 10 }}>previsto</span>}
        </div>
      </div>
      <div className="right">
        <div className={`vv ${pos ? "pos" : "neg"}`}>{pos ? "+" : "−"}{fmt(l.valor)}</div>
        {margem != null && <div className="marg">custo {fmt(l.custo)} · margem {margem.toFixed(0)}%</div>}
      </div>
    </div>
  );
}

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
  const W = 520, H = 140, barW = 26, margin = 24;
  const n = dados.length;
  const colW = barW * 2 + 4;
  const step = n > 1 ? (W - margin * 2 - colW) / (n - 1) : 0;

  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} style={{ width: "100%", maxWidth: W }}>
      {dados.map((d, i) => {
        const x = margin + i * step;
        const hE = (d.entrada / max) * H;
        const hS = (d.saida / max) * H;
        return (
          <g key={d.mes}>
            {d.atual && <rect x={x - 9} y={0} width={colW + 18} height={H + 6} rx={9} fill="#f5f5f4" />}
            <rect x={x} y={H - hE} width={barW} height={hE} rx={4} fill="#16a34a" opacity={0.9} />
            <rect x={x + barW + 4} y={H - hS} width={barW} height={hS} rx={4} fill="#dc2626" opacity={0.8} />
            <text x={x + barW + 2} y={H + 19} textAnchor="middle" fontSize={11} fill={d.atual ? "#1c1917" : "#a8a29e"} fontWeight={d.atual ? 700 : 500} fontFamily="Inter, sans-serif">{d.mes}</text>
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
function ModalLancamento({ onSave, onCreateEmprestimo, onClose, editando, categoriasFin = [] }) {
  // Modo: simples (entrada/saída) ou emprestimo (gera parcelas previstas)
  const [modo, setModo] = useState("simples");
  const [form, setForm] = useState(editando || { tipo: "entrada", descricao: "", valor: "", data: new Date().toISOString().split("T")[0], cat: "Vendas", status: "realizado", obs: "" });
  // Campos extras do empréstimo
  const [emp, setEmp] = useState({ n_parcelas: 6, juros_pct: 3, dia_pagamento: new Date().getDate() });
  const [salvando, setSalvando] = useState(false);

  // Categorias: prioriza as do CRUD (filtradas por tipo). Se vazio, cai nas constantes legadas.
  const cats = (() => {
    const cruDoTipo = categoriasFin.filter(c => !c.arquivada && (c.tipo === "ambos" || c.tipo === form.tipo)).map(c => c.nome);
    if (cruDoTipo.length > 0) {
      // Garante que a categoria atual (mesmo legada) ainda aparece na lista
      if (form.cat && !cruDoTipo.includes(form.cat)) return [form.cat, ...cruDoTipo];
      return cruDoTipo;
    }
    return form.tipo === "entrada" ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  })();

  // Preview ao vivo das parcelas
  const previewParcelas = (() => {
    const v = parseFloat(form.valor) || 0;
    const n = Math.max(1, Math.min(360, parseInt(emp.n_parcelas, 10) || 1));
    const j = (parseFloat(emp.juros_pct) || 0) / 100;
    const total = j > 0 ? v * Math.pow(1 + j, n) : v;
    const parcela = total / n;
    return { v, n, j, total, parcela };
  })();

  const salvar = async () => {
    if (modo === "emprestimo") {
      const v = parseFloat(form.valor);
      if (!form.descricao || !v || v <= 0) return;
      setSalvando(true);
      try {
        await onCreateEmprestimo({
          descricao: form.descricao,
          valor: v,
          data: form.data,
          cat: form.cat,
          juros_pct: parseFloat(emp.juros_pct) || 0,
          n_parcelas: parseInt(emp.n_parcelas, 10) || 1,
          dia_pagamento: parseInt(emp.dia_pagamento, 10) || new Date(form.data).getDate(),
        });
        onClose();
      } catch { setSalvando(false); }
      return;
    }

    if (!form.descricao || !form.valor || !form.data) return;
    setSalvando(true);
    try {
      await onSave({ ...form, valor: parseFloat(form.valor) });
      onClose();
    } catch { setSalvando(false); }
  };

  // Se está editando, não permite trocar pra empréstimo (cria fluxo só na criação)
  const podeEmprestimo = !editando;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "24px 26px", width: 520, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 500 }}>{editando ? "Editar" : "Novo"} Lançamento</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e", lineHeight: 1 }}>×</button>
        </div>

        {/* Seletor de tipo: entrada / saída / empréstimo */}
        {podeEmprestimo && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
            <button onClick={() => { setModo("simples"); setForm(f => ({ ...f, tipo: "entrada", cat: "Vendas" })); }}
              style={{ padding: 11, border: `2px solid ${modo === "simples" && form.tipo === "entrada" ? "#15803d" : "#e7e5e4"}`, borderRadius: 10, background: modo === "simples" && form.tipo === "entrada" ? "#f0fdf4" : "#fff", color: modo === "simples" && form.tipo === "entrada" ? "#15803d" : "#78716c", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              <div style={{ fontSize: 16 }}>⬇️</div>
              <div style={{ marginTop: 3 }}>Entrada</div>
            </button>
            <button onClick={() => { setModo("simples"); setForm(f => ({ ...f, tipo: "saida", cat: "Fornecedores" })); }}
              style={{ padding: 11, border: `2px solid ${modo === "simples" && form.tipo === "saida" ? "#dc2626" : "#e7e5e4"}`, borderRadius: 10, background: modo === "simples" && form.tipo === "saida" ? "#fef2f2" : "#fff", color: modo === "simples" && form.tipo === "saida" ? "#dc2626" : "#78716c", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              <div style={{ fontSize: 16 }}>⬆️</div>
              <div style={{ marginTop: 3 }}>Saída</div>
            </button>
            <button onClick={() => { setModo("emprestimo"); setForm(f => ({ ...f, tipo: "entrada", cat: "Empréstimo" })); }}
              style={{ padding: 11, border: `2px solid ${modo === "emprestimo" ? "#7C5CFC" : "#e7e5e4"}`, borderRadius: 10, background: modo === "emprestimo" ? "#EFEBFE" : "#fff", color: modo === "emprestimo" ? "#5b3df1" : "#78716c", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              <div style={{ fontSize: 16 }}>🏦</div>
              <div style={{ marginTop: 3 }}>Empréstimo</div>
            </button>
          </div>
        )}

        {/* Toggle entrada/saida — só quando editando ou modo simples (e não é hub de tipos) */}
        {editando && (
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {["entrada", "saida"].map(t => (
              <button key={t} onClick={() => setForm({ ...form, tipo: t, cat: t === "entrada" ? "Vendas" : "Fornecedores" })}
                style={{ flex: 1, padding: "9px", border: `2px solid ${form.tipo === t ? (t === "entrada" ? "#15803d" : "#dc2626") : "#e7e5e4"}`, borderRadius: 8, background: form.tipo === t ? (t === "entrada" ? "#f0fdf4" : "#fef2f2") : "#fff", color: form.tipo === t ? (t === "entrada" ? "#15803d" : "#dc2626") : "#78716c", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                {t === "entrada" ? "↑ Entrada" : "↓ Saída"}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Descrição</label>
            <input style={inp} type="text" placeholder={modo === "emprestimo" ? "Ex: Empréstimo capital de giro" : "Ex: Pagamento cliente X"}
              value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>{modo === "emprestimo" ? "Valor recebido (R$)" : "Valor (R$)"}</label>
            <input style={inp} type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div>
              <label style={lbl}>Data</label>
              <input style={inp} type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
            </div>
            {modo !== "emprestimo" && (
              <div>
                <label style={lbl}>Status</label>
                <select style={inp} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="realizado">Realizado</option>
                  <option value="previsto">Previsto</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label style={lbl}>Categoria</label>
            <select style={inp} value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>
              {cats.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {modo !== "emprestimo" && (
            <div>
              <label style={lbl}>Observação (opcional)</label>
              <input style={inp} placeholder="Notas adicionais..." value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} />
            </div>
          )}

          {/* Bloco do empréstimo inteligente */}
          {modo === "emprestimo" && (
            <div style={{ background: "#EFEBFE", border: "1px solid #DDD3FD", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "#5b3df1", fontWeight: 700, fontSize: 13 }}>
                🧠 A plataforma gera N saídas previstas automaticamente
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>Nº DE PARCELAS</label>
                  <input style={inp} type="number" min="1" max="360" value={emp.n_parcelas}
                    onChange={e => setEmp(s => ({ ...s, n_parcelas: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>JUROS A.M. (%)</label>
                  <input style={inp} type="number" step="0.01" min="0" value={emp.juros_pct}
                    onChange={e => setEmp(s => ({ ...s, juros_pct: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>DIA DO PAGTO</label>
                  <input style={inp} type="number" min="1" max="28" value={emp.dia_pagamento}
                    onChange={e => setEmp(s => ({ ...s, dia_pagamento: e.target.value }))} />
                </div>
              </div>
              {previewParcelas.v > 0 && (
                <div style={{ background: "#fff", border: "1px solid #DDD3FD", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: "#5b3df1", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 6 }}>PRÉVIA DAS PARCELAS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 130, overflowY: "auto" }}>
                    {Array.from({ length: Math.min(previewParcelas.n, 6) }).map((_, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0" }}>
                        <span style={{ color: "#78716c" }}>Parcela {i + 1}/{previewParcelas.n}</span>
                        <span style={{ fontWeight: 700, color: "#1c1917" }}>{fmt(previewParcelas.parcela)}</span>
                      </div>
                    ))}
                    {previewParcelas.n > 6 && (
                      <div style={{ textAlign: "center", color: "#a8a29e", fontSize: 11 }}>… +{previewParcelas.n - 6} parcelas</div>
                    )}
                  </div>
                  <div style={{ borderTop: "1px dashed #DDD3FD", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#78716c" }}>Total com juros:</span>
                    <span style={{ fontWeight: 800, color: "#5b3df1" }}>{fmt(previewParcelas.total)}</span>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 11, color: "#5b3df1", lineHeight: 1.45 }}>
                💡 Cada parcela vira <b>saída prevista</b> no mês certo. Você pode editar uma parcela individualmente
                quando pagar (com juros/desconto) e o saldo se ajusta sozinho.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            style={{ flex: 2, padding: 11,
              background: modo === "emprestimo" ? "#7C5CFC" : (form.tipo === "entrada" ? "#15803d" : "#dc2626"),
              border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: salvando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: salvando ? 0.7 : 1 }}>
            {salvando ? "Salvando..." : modo === "emprestimo"
              ? `🏦 Gerar empréstimo + ${parseInt(emp.n_parcelas, 10) || 0} parcelas`
              : editando ? "Salvar alterações" : "Registrar lançamento"}
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

// ─── EDITOR DE CATEGORIAS (chips com dot + nome + ×, igual ao modelo) ────────
function CategoriasEditor({ categorias, onCriar, onAtualizar, onExcluir }) {
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoCor, setNovoCor] = useState("#7C5CFC");
  const [novoTipo, setNovoTipo] = useState("ambos");
  const [editandoId, setEditandoId] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [editCor, setEditCor] = useState("");

  const CORES = ["#15A056", "#F2741A", "#7C5CFC", "#2D6FE8", "#E03B3B", "#0F7A41", "#E879A6", "#9AA3B0"];

  const salvarNova = async () => {
    if (!novoNome.trim()) return;
    try {
      await onCriar({ nome: novoNome.trim(), cor: novoCor, tipo: novoTipo });
      setNovoNome(""); setCriando(false);
    } catch {}
  };

  const salvarEdicao = async (id) => {
    if (!editNome.trim()) return;
    await onAtualizar(id, { nome: editNome.trim(), cor: editCor });
    setEditandoId(null);
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {categorias.filter(c => !c.arquivada).map(c => (
          editandoId === c.id ? (
            <div key={c.id} className="ns-cat" style={{ padding: "5px 8px", gap: 6 }}>
              <input type="color" value={editCor} onChange={e => setEditCor(e.target.value)}
                style={{ width: 22, height: 22, border: "none", padding: 0, background: "transparent", cursor: "pointer" }} />
              <input type="text" value={editNome} onChange={e => setEditNome(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") salvarEdicao(c.id); if (e.key === "Escape") setEditandoId(null); }}
                autoFocus
                style={{ border: "1px solid var(--linha)", borderRadius: 6, padding: "3px 8px", fontSize: 12.5, fontFamily: "var(--font-ui)", outline: "none", width: 120 }} />
              <button onClick={() => salvarEdicao(c.id)}
                style={{ background: "var(--verde)", color: "#fff", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>✓</button>
              <button onClick={() => setEditandoId(null)}
                style={{ background: "transparent", color: "var(--ink3)", border: "none", borderRadius: 6, padding: "3px 6px", fontSize: 14, cursor: "pointer" }}>×</button>
            </div>
          ) : (
            <div key={c.id} className="ns-cat">
              <span className="dot" style={{ background: c.cor || "#78716c" }} />
              <span>{c.nome}</span>
              <span style={{ fontSize: 10, color: "var(--ink3)", fontWeight: 500, marginLeft: 2 }}>
                {c.tipo === "entrada" ? "↓" : c.tipo === "saida" ? "↑" : "↕"}
              </span>
              <button className="x" title="Editar"
                onClick={() => { setEditandoId(c.id); setEditNome(c.nome); setEditCor(c.cor || "#78716c"); }}
                style={{ fontSize: 10 }}>✎</button>
              <button className="x" title="Remover" onClick={() => onExcluir(c.id)}>×</button>
            </div>
          )
        ))}
        {!criando && (
          <button className="ns-cat-add" onClick={() => setCriando(true)}>+ Nova categoria</button>
        )}
      </div>

      {criando && (
        <div style={{ background: "var(--card2)", border: "1px solid var(--linha)", borderRadius: 10, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 10, alignItems: "center" }}>
          <input
            value={novoNome} onChange={e => setNovoNome(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") salvarNova(); if (e.key === "Escape") setCriando(false); }}
            placeholder="Nome da categoria" autoFocus
            style={{ border: "1px solid var(--linha)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "var(--font-ui)", outline: "none", color: "var(--ink)" }}
          />
          <select value={novoTipo} onChange={e => setNovoTipo(e.target.value)}
            style={{ border: "1px solid var(--linha)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "var(--font-ui)", outline: "none", color: "var(--ink)", background: "#fff" }}>
            <option value="ambos">Entrada e saída</option>
            <option value="entrada">Só entrada</option>
            <option value="saida">Só saída</option>
          </select>
          <div style={{ display: "flex", gap: 4 }}>
            {CORES.map(c => (
              <button key={c} onClick={() => setNovoCor(c)} title={c}
                style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: novoCor === c ? "2px solid var(--ink)" : "2px solid transparent", cursor: "pointer" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={salvarNova} style={{ background: "var(--verde)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-ui)" }}>Criar</button>
            <button onClick={() => { setCriando(false); setNovoNome(""); }} className="ns-btn-ghost">Cancelar</button>
          </div>
        </div>
      )}

      {categorias.filter(c => !c.arquivada).length === 0 && !criando && (
        <div className="ns-muted" style={{ fontSize: 12, marginTop: 6 }}>Nenhuma categoria cadastrada ainda.</div>
      )}
    </div>
  );
}

// ─── COMPONENTES DRE ──────────────────────────────────────────────────────────
function lubroBrutoColor(v) { return v >= 0 ? "#15803d" : "#dc2626"; }

function DiagItem({ ok, warn, label, desc }) {
  const cor = ok ? "#15803d" : warn ? "#d97706" : "#dc2626";
  const icon = ok ? "✓" : warn ? "⚠" : "✕";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ color: cor, fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#1c1917" }}>{label}</div>
        <div style={{ fontSize: 11, color: cor }}>{desc}</div>
      </div>
    </div>
  );
}

// ─── GRÁFICO PONTO DE EQUILÍBRIO ─────────────────────────────────────────────
function GraficoEquilibrio({ dados, pe }) {
  const maxAcum = dados.length > 0 ? dados[dados.length - 1].acumulado : 0;
  const maxY = Math.max(maxAcum, pe) * 1.18 || 1;
  const W = 580, H = 160, padL = 8, padR = 34, padT = 10, padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = dados.length;
  if (n < 2) return null;

  const cx = (i) => padL + (i / (n - 1)) * chartW;
  const cy = (v) => padT + chartH - (v / maxY) * chartH;

  const pts = dados.map((d, i) => `${cx(i).toFixed(1)},${cy(d.acumulado).toFixed(1)}`).join(" ");
  const areaPts = `${cx(0).toFixed(1)},${(padT + chartH).toFixed(1)} ${pts} ${cx(n - 1).toFixed(1)},${(padT + chartH).toFixed(1)}`;
  const peY = cy(pe);
  const crossIdx = pe > 0 ? dados.findIndex(d => d.acumulado >= pe) : -1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#e7e5e4" strokeWidth={1} />
      {pe > 0 && pe <= maxY * 1.05 && (
        <>
          <line x1={padL} y1={peY} x2={W - padR} y2={peY} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" />
          <text x={W - padR + 4} y={peY + 4} fontSize={9} fill="#f59e0b" fontFamily="DM Sans,sans-serif" fontWeight="700">PE</text>
        </>
      )}
      <polygon points={areaPts} fill="url(#eqGrad)" />
      <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {crossIdx >= 0 && (
        <>
          <line x1={cx(crossIdx).toFixed(1)} y1={padT} x2={cx(crossIdx).toFixed(1)} y2={padT + chartH} stroke="#15803d" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
          <circle cx={cx(crossIdx)} cy={cy(dados[crossIdx].acumulado)} r={5} fill="#15803d" stroke="#fff" strokeWidth={2} />
        </>
      )}
      {dados.map((d, i) => {
        if (i % 5 !== 0 && i !== n - 1) return null;
        return <text key={d.dia} x={cx(i)} y={H - 5} textAnchor="middle" fontSize={9} fill="#a8a29e" fontFamily="DM Sans,sans-serif">{d.dia}</text>;
      })}
    </svg>
  );
}

// ─── FLUXO DE CAIXA PRINCIPAL ──────────────────────────────────────────────────
export default function FluxoCaixa() {
  const [tab, setTab] = useState("visao-geral");
  const [lancamentos, setLancamentos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [custosFixosList, setCustosFixosList] = useState([]);
  const [categoriasFin, setCategoriasFin] = useState([]); // categorias editáveis (CRUD)
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
      const [lancs, config, peds, custos, cats] = await Promise.all([
        api.lancamentos.listar(),
        api.config.obter(),
        api.pedidos.listar(),
        api.custosFixos.listar(),
        api.categoriasFinanceiro.listar().catch(() => []),
      ]);
      setLancamentos(lancs);
      setSaldoInicial(config.saldo_inicial);
      setPedidos(peds);
      setCustosFixosList(custos);
      setCategoriasFin(cats);
    } catch (err) {
      showToast("Erro ao carregar dados: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, []);

  // CRUD de categorias financeiras (usado na aba Lançamentos)
  const criarCategoriaFin = async (dados) => {
    try {
      const nova = await api.categoriasFinanceiro.criar(dados);
      setCategoriasFin(cs => [...cs, nova]);
      showToast("Categoria criada!");
      return nova;
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); throw err; }
  };
  const atualizarCategoriaFin = async (id, dados) => {
    try {
      const upd = await api.categoriasFinanceiro.atualizar(id, dados);
      setCategoriasFin(cs => cs.map(c => c.id === id ? upd : c));
      showToast("Categoria atualizada!");
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };
  const excluirCategoriaFin = async (id) => {
    try {
      await api.categoriasFinanceiro.excluir(id);
      setCategoriasFin(cs => cs.filter(c => c.id !== id));
      showToast("Categoria removida.", "#7c3aed");
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // ─── AUTO-GERAR CUSTOS FIXOS AO MUDAR MÊS ────────────────────────────────
  useEffect(() => {
    if (loading) return;
    const gerarCustosFixos = async () => {
      try {
        const gerados = await api.custosFixos.gerar(mesSel);
        if (gerados.length > 0) {
          setLancamentos(ls => [...ls, ...gerados]);
          showToast(`${gerados.length} custo(s) fixo(s) lançado(s) automaticamente.`);
        }
      } catch { /* silencioso — não bloqueia o fluxo */ }
    };
    gerarCustosFixos();
  }, [mesSel, loading]);

  // Filtrar por mês selecionado
  const lancamentosMes = useMemo(() => lancamentos.filter(l => l.data.startsWith(mesSel)), [lancamentos, mesSel]);

  // Caixa: exclui lançamentos legados de CMV (agora embutido na venda + DRE)
  const lancamentosCaixa = useMemo(() => lancamentosMes.filter(l => !ehCMVLegado(l)), [lancamentosMes]);

  // Métricas do mês (movimento de caixa, sem CMV)
  const entradas = useMemo(() => lancamentosCaixa.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0), [lancamentosCaixa]);
  const saidas = useMemo(() => lancamentosCaixa.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0), [lancamentosCaixa]);
  const saldoMes = entradas - saidas;
  const entradasRealizadas = useMemo(() => lancamentosCaixa.filter(l => l.tipo === "entrada" && l.status === "realizado").reduce((s, l) => s + l.valor, 0), [lancamentosCaixa]);
  const saidasRealizadas = useMemo(() => lancamentosCaixa.filter(l => l.tipo === "saida" && l.status === "realizado").reduce((s, l) => s + l.valor, 0), [lancamentosCaixa]);
  const saldoAtual = saldoInicial + entradasRealizadas - saidasRealizadas;
  const resultadoMes = entradasRealizadas - saidasRealizadas;
  const margemResultado = entradasRealizadas > 0 ? (resultadoMes / entradasRealizadas) * 100 : 0;

  // Variação de entradas vs. mês anterior (chip do KPI "Entrou no mês")
  const entradasMesAnterior = useMemo(() => {
    const [ano, mes] = mesSel.split("-").map(Number);
    let m = mes - 1, a = ano; if (m < 1) { m += 12; a--; }
    const key = `${a}-${String(m).padStart(2, "0")}`;
    return lancamentos.filter(l => l.data.startsWith(key) && l.tipo === "entrada" && l.status === "realizado" && !ehCMVLegado(l)).reduce((s, l) => s + l.valor, 0);
  }, [lancamentos, mesSel]);
  const varEntradasPct = entradasMesAnterior > 0 ? Math.round(((entradasRealizadas - entradasMesAnterior) / entradasMesAnterior) * 100) : null;
  const mesAnteriorLabel = (() => {
    const [, mes] = mesSel.split("-").map(Number);
    let m = mes - 1; if (m < 1) m += 12;
    return MESES[m - 1].toLowerCase();
  })();

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

  // Filtros da listagem (sobre o caixa — CMV legado fica fora do feed/tabela)
  const lancamentosFiltrados = useMemo(() => lancamentosCaixa.filter(l => {
    if (filtroTipo !== "todos" && l.tipo !== filtroTipo) return false;
    if (filtroStatus !== "todos" && l.status !== filtroStatus) return false;
    if (filtroCat !== "todas" && l.cat !== filtroCat) return false;
    if (busca && !l.descricao.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  }).sort((a, b) => new Date(b.data) - new Date(a.data)), [lancamentosCaixa, filtroTipo, filtroStatus, filtroCat, busca]);

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
      const ls = lancamentos.filter(l => l.data.startsWith(m) && !ehCMVLegado(l));
      return {
        mes: MESES[parseInt(m.split("-")[1]) - 1],
        entrada: ls.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0),
        saida: ls.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0),
        atual: m === mesSel,
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

  // Cria empréstimo: gera 1 entrada (recebimento) + N saídas previstas (parcelas)
  const criarEmprestimo = async (dados) => {
    try {
      await api.emprestimo.criar(dados);
      // Recarrega todos os lançamentos (parcelas geradas no servidor)
      const todos = await api.lancamentos.listar();
      setLancamentos(todos);
      showToast(`Empréstimo registrado! ${dados.n_parcelas} parcelas previstas geradas.`);
    } catch (err) {
      showToast("Erro ao criar empréstimo: " + err.message, "#dc2626");
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

  // ─── DRE: CUSTOS FIXOS ATIVOS + LUCRO LÍQUIDO ────────────────────────────────
  const totalCustosFixos = useMemo(
    () => custosFixosList.filter(c => c.ativo).reduce((s, c) => s + c.valor, 0),
    [custosFixosList]
  );
  const lucroLiquido = lucroBruto - totalCustosFixos;
  const margemLiquida = receitaVendas > 0 ? (lucroLiquido / receitaVendas) * 100 : 0;

  // Custos fixos agrupados por categoria (para detalhe do DRE)
  const custosFixosPorCat = useMemo(() => {
    const ativos = custosFixosList.filter(c => c.ativo);
    const acc = {};
    ativos.forEach(c => {
      if (!acc[c.categoria]) acc[c.categoria] = 0;
      acc[c.categoria] += c.valor;
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [custosFixosList]);

  // ─── PONTO DE EQUILÍBRIO ──────────────────────────────────────────────────────
  const margemContribDecimal = receitaVendas > 0 ? (receitaVendas - cmvTotal) / receitaVendas : 0;
  const pontoEquilibrio = margemContribDecimal > 0 ? totalCustosFixos / margemContribDecimal : 0;
  const folga = receitaVendas - pontoEquilibrio;
  const margemSeguranca = pontoEquilibrio > 0 && receitaVendas > 0 ? (folga / receitaVendas) * 100 : 0;

  // Faturamento diário acumulado no mês (para o gráfico e cálculo do dia de equilíbrio)
  const vendasDiariasAcum = useMemo(() => {
    const [ano, mes] = mesSel.split("-").map(Number);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    let acum = 0;
    return Array.from({ length: diasNoMes }, (_, i) => {
      const dia = String(i + 1).padStart(2, "0");
      const vendas = pedidosMes
        .filter(p => p.created_at && p.created_at.startsWith(`${mesSel}-${dia}`))
        .reduce((s, p) => s + p.total, 0);
      acum += vendas;
      return { dia: i + 1, vendas, acumulado: acum };
    });
  }, [pedidosMes, mesSel]);

  const diaEquilibrio = pontoEquilibrio > 0
    ? vendasDiariasAcum.find(d => d.acumulado >= pontoEquilibrio)
    : null;

  const nav = [
    { key: "visao-geral", label: "Visão Geral" },
    { key: "dre", label: "DRE" },
    { key: "equilibrio", label: "Equilíbrio" },
    { key: "indicadores", label: "Indicadores CMV" },
    { key: "lancamentos", label: "Lançamentos" },
    { key: "custos-fixos", label: "Custos Fixos" },
    { key: "categorias", label: "Por Categoria" },
    { key: "projecao", label: "Projeção" },
  ];

  const corSaldo = saldoAtual >= 0 ? "#15803d" : "#dc2626";

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando dados financeiros...</div>;
  }

  return (
    <div className="anim">
      {/* Sub-navegação (estilo modelo: branco com borda, tab.on = preto) */}
      <div className="ns-tabs">
        {nav.map(n => (
          <button key={n.key} className={`ns-tab ${tab === n.key ? "on" : ""}`} onClick={() => setTab(n.key)}>{n.label}</button>
        ))}
      </div>

      {/* Controles: mês + botão laranja */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="ns-mes-sel">
          <span style={{ color: "var(--ink3)", fontSize: 12, fontWeight: 500 }}>Mês:</span>
          <input type="month" value={mesSel} onChange={e => setMesSel(e.target.value)} />
        </div>
        <button className="ns-btn-novo" onClick={() => { setEditando(null); setModal(true); }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Novo lançamento
        </button>
      </div>

        {/* ── VISÃO GERAL ──────────────────────────────────────────────────── */}
        {tab === "visao-geral" && (
          <div className="anim">
            {/* KPIs (estilo modelo: hero verde/vermelho + 3 secundários) */}
            <div className="ns-kpis">
              {/* HERO — Resultado do mês (sign-aware) */}
              <div className={`ns-kpi hero ${resultadoMes < 0 ? "neg" : ""}`}>
                <div className="lab">Resultado do mês</div>
                <div className="val">{resultadoMes >= 0 ? "+" : "−"}{fmt(Math.abs(resultadoMes))}</div>
                <div className="sub">
                  {entradasRealizadas > 0 ? `margem de ${margemResultado.toFixed(1).replace(".", ",")}% sobre o que entrou` : "sem entradas no mês"}
                </div>
                <div className="spark" style={{ background: "rgba(255,255,255,0.25)" }}>
                  <i style={{ background: "#fff", width: `${Math.min(Math.abs(margemResultado), 100)}%` }} />
                </div>
              </div>

              {/* Entrou no mês */}
              <div className="ns-kpi">
                <div className="pic" style={{ background: "var(--verde-bg)", color: "var(--verde-d)" }}>↓</div>
                <div className="lab">Entrou no mês</div>
                <div className="val">{fmt(entradasRealizadas)}</div>
                <div className="sub">
                  {varEntradasPct != null && (
                    <span className={`ns-chip ${varEntradasPct >= 0 ? "up" : "down"}`}>{varEntradasPct >= 0 ? "+" : ""}{varEntradasPct}%</span>
                  )}
                  vs. {mesAnteriorLabel}
                </div>
              </div>

              {/* Saiu no mês */}
              <div className="ns-kpi">
                <div className="pic" style={{ background: "var(--vermelho-bg)", color: "var(--vermelho-d)" }}>↑</div>
                <div className="lab">Saiu no mês</div>
                <div className="val">{fmt(saidasRealizadas)}</div>
                <div className="sub ns-muted">fornecedores, folha e despesas</div>
              </div>

              {/* Saldo em caixa */}
              <div className="ns-kpi">
                <div className="pic" style={{ background: "var(--azul-bg)", color: "var(--azul)" }}>≈</div>
                <div className="lab">Saldo em caixa</div>
                <div className="val" style={{ color: saldoAtual >= 0 ? "var(--verde-d)" : "var(--vermelho-d)" }}>{fmt(saldoAtual)}</div>
                <div className="sub ns-muted">
                  inicial {fmt(saldoInicial)}
                  <button onClick={() => setModalSaldo(true)}
                    style={{ background: "var(--card2)", border: "1px solid var(--linha)", borderRadius: 6, padding: "2px 9px", fontSize: 11, color: "var(--ink2)", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 500, marginLeft: 6 }}>
                    Editar
                  </button>
                </div>
              </div>
            </div>

            {/* Gráfico + últimos lançamentos (lado a lado, vira 1 col em mobile) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13, marginBottom: 14 }}>
              <div className="ns-panel" style={{ minWidth: 0 }}>
                <div className="ns-panel-h">
                  <h3>Entradas × Saídas</h3>
                  <span className="ns-muted" style={{ fontSize: 12 }}>últimos 6 meses</span>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ink2)", marginBottom: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--verde)" }} />Entrou</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--vermelho)" }} />Saiu</span>
                </div>
                <GraficoBarras dados={dadosGrafico} />
              </div>

              <div className="ns-panel" style={{ minWidth: 0 }}>
                <div className="ns-panel-h">
                  <h3>Últimos lançamentos</h3>
                  <button className="ns-panel-link" onClick={() => setTab("lancamentos")}>Ver todos →</button>
                </div>
                {lancamentosCaixa.length === 0 ? (
                  <div className="ns-muted" style={{ padding: "24px 0", textAlign: "center", fontSize: 13 }}>
                    Nenhum lançamento neste mês.
                  </div>
                ) : (
                  <div className="ns-lanc-list">
                    {[...lancamentosCaixa].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5).map(l => (
                      <LancRow key={l.id} l={l} onClick={() => { setEditando(l); setModal(true); }} />
                    ))}
                  </div>
                )}
                <div className="ns-nota" style={{ marginTop: 14 }}>
                  <span>💡</span>
                  <span><b>Venda + custo viraram uma linha só.</b> Você vê o que entrou e a margem ao lado — sem o CMV repetido. O CMV continua no DRE.</span>
                </div>
              </div>
            </div>

            {/* Alerta de previstos */}
            {(() => {
              const previstos = lancamentosMes.filter(l => l.status === "previsto");
              const entradasPrev = previstos.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
              const saidasPrev = previstos.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
              if (previstos.length === 0) return null;
              return (
                <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 12, padding: "14px 18px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 18 }}>⚠</span>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>{previstos.length} lançamentos previstos ainda não realizados</div>
                    <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
                      {fmt(entradasPrev)} em entradas e {fmt(saidasPrev)} em saídas aguardando confirmação.
                    </div>
                  </div>
                  <button onClick={() => { setTab("lancamentos"); setFiltroStatus("previsto"); }}
                    style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-ui)", color: "#92400e" }}>
                    Revisar previstos
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── DRE ─────────────────────────────────────────────────────────── */}
        {tab === "dre" && (
          <div className="anim">
            <div className="ns-panel">
              <div className="ns-panel-h">
                <h3>DRE — {MESES[parseInt(mesSel.split("-")[1]) - 1]} de {mesSel.split("-")[0]}</h3>
                <span className="ns-muted" style={{ fontSize: 12 }}>de cima pra baixo: o caminho do dinheiro</span>
              </div>

              {(() => {
                const pctDe = (v) => receitaVendas > 0 ? (v / receitaVendas) * 100 : 0;
                const rotuloPct = (v) => receitaVendas > 0 ? `${pctDe(v).toFixed(0)}% da receita` : "—";
                const linhas = [
                  { nome: "Receita com vendas",      desc: `${pedidosMes.length} pedido${pedidosMes.length !== 1 ? "s" : ""} entregue${pedidosMes.length !== 1 ? "s" : ""}`, valor: receitaVendas,    sinal: "+", pct: 100,                  barLabel: `${fmt(receitaVendas)}`, barColor: "var(--verde)",   valClass: "up" },
                  { nome: "(−) Custo das mercadorias", desc: "CMV — o que você pagou no que vendeu", valor: cmvTotal,         sinal: "−", pct: pctDe(cmvTotal),      barLabel: rotuloPct(cmvTotal),    barColor: "var(--laranja)", valClass: "down" },
                  { nome: "= Lucro bruto",           desc: "sobrou antes das despesas",            valor: lucroBruto,       sinal: "",  pct: pctDe(lucroBruto),    barLabel: rotuloPct(lucroBruto),  barColor: "var(--verde-d)", valClass: lucroBruto >= 0 ? "up" : "down" },
                  { nome: "(−) Despesas do mês",     desc: "folha, aluguel, luz, taxas…",          valor: totalCustosFixos, sinal: "−", pct: pctDe(totalCustosFixos), barLabel: rotuloPct(totalCustosFixos), barColor: "var(--vermelho)", valClass: "down" },
                ];
                return linhas.map(r => (
                  <div key={r.nome} className="ns-dre-row">
                    <div className="dnm">
                      {r.nome}
                      <small>{r.desc}</small>
                    </div>
                    <div className="ns-dre-bar-wrap">
                      <div className="ns-dre-bar" style={{ width: `${Math.max(0, Math.min(r.pct, 100))}%`, background: r.barColor }}>{r.barLabel}</div>
                    </div>
                    <div className={`dval ${r.valClass}`}>{r.sinal} {fmt(Math.abs(r.valor))}</div>
                  </div>
                ));
              })()}

              {/* Resultado (total) — estilo modelo (.dre-row.total) */}
              <div className="ns-dre-row total">
                <div className="dnm">
                  Resultado (lucro de verdade)
                  <small style={{ color: lucroLiquido >= 0 ? "var(--verde-d)" : "var(--vermelho-d)", fontWeight: 600 }}>
                    margem de {margemLiquida.toFixed(1).replace(".", ",")}%
                  </small>
                </div>
                <div className="ns-dre-bar-wrap">
                  <div className="ns-dre-bar" style={{ width: `${Math.max(0, Math.min(Math.abs(margemLiquida), 100))}%`, background: lucroLiquido >= 0 ? "var(--verde-d)" : "var(--vermelho-d)" }} />
                </div>
                <div className={`dval ${lucroLiquido >= 0 ? "up" : "down"}`}>{lucroLiquido >= 0 ? "+ " : "− "}{fmt(Math.abs(lucroLiquido))}</div>
              </div>

              <div className="ns-nota" style={{ marginTop: 14 }}>
                <span>💡</span>
                <span>Cada linha tem uma <b>barra proporcional</b> — bate o olho e entende. A margem do resultado aparece destacada. O CMV continua aqui na contabilidade, mesmo fora do feed.</span>
              </div>
            </div>

            {/* ── Detalhe dos custos fixos + diagnóstico (responsivo) ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 13, marginTop: 13 }}>
              <div className="card" style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#57534e", marginBottom: 12, letterSpacing: "0.06em" }}>DESPESAS DO MÊS POR CATEGORIA</div>
                {custosFixosPorCat.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {custosFixosPorCat.map(([cat, val]) => (
                      <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#fafaf9", borderRadius: 7 }}>
                        <span style={{ fontSize: 12.5, color: "#57534e" }}>{cat}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "#78716c" }}>{fmt(val)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginTop: 2, borderTop: "1px solid #f0efed" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1917" }}>Total de despesas</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#dc2626" }}>{fmt(totalCustosFixos)}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#a8a29e", fontStyle: "italic" }}>
                    Nenhum custo fixo ativo. Configure na aba "Custos Fixos".
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: "16px 18px", background: "#fafaf9" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#57534e", marginBottom: 12, letterSpacing: "0.06em" }}>DIAGNÓSTICO</div>
                {receitaVendas === 0 ? (
                  <div style={{ fontSize: 12, color: "#a8a29e" }}>Sem pedidos entregues neste mês.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <DiagItem
                      ok={margemBruta >= 50}
                      warn={margemBruta >= 30}
                      label="Margem Bruta"
                      desc={margemBruta >= 50 ? "Excelente (≥50%)" : margemBruta >= 30 ? "Boa (≥30%)" : "Baixa — revise o CMV"}
                    />
                    <DiagItem
                      ok={margemLiquida >= 20}
                      warn={margemLiquida >= 5}
                      label="Margem Líquida"
                      desc={margemLiquida >= 20 ? "Excelente (≥20%)" : margemLiquida >= 5 ? "Moderada (≥5%)" : margemLiquida < 0 ? "Negativa — prejuízo" : "Baixa — reduza custos fixos"}
                    />
                    <DiagItem
                      ok={totalCustosFixos / receitaVendas <= 0.3}
                      warn={totalCustosFixos / receitaVendas <= 0.5}
                      label="Peso dos Fixos"
                      desc={totalCustosFixos / receitaVendas <= 0.3 ? "Controlado (≤30% da receita)" : totalCustosFixos / receitaVendas <= 0.5 ? "Moderado (≤50%)" : "Alto (>50% da receita)"}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PONTO DE EQUILÍBRIO ──────────────────────────────────────────── */}
        {tab === "equilibrio" && (
          <div className="anim">
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Ponto de Equilíbrio — {MESES[parseInt(mesSel.split("-")[1]) - 1]}/{mesSel.split("-")[0]}</div>
              <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 3 }}>
                Faturamento mínimo necessário para cobrir todos os custos fixos com a margem atual.
              </div>
            </div>

            {/* Estado sem dados suficientes */}
            {receitaVendas === 0 && (
              <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 12, padding: "20px 24px", fontSize: 13, color: "#92400e" }}>
                ⚠ Sem pedidos entregues neste mês. O cálculo precisa de dados de vendas para determinar a margem de contribuição.
              </div>
            )}
            {receitaVendas > 0 && totalCustosFixos === 0 && (
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "20px 24px", fontSize: 13, color: "#1e40af" }}>
                💡 Nenhum custo fixo ativo cadastrado. Vá em <strong>Custos Fixos</strong> para configurar e o ponto de equilíbrio será calculado automaticamente.
              </div>
            )}

            {/* Conteúdo principal */}
            {receitaVendas > 0 && totalCustosFixos > 0 && (
              <>
                {/* KPI Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
                  {/* PE */}
                  <div className="card" style={{ padding: "16px 18px", borderTop: "3px solid #f59e0b" }}>
                    <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>PONTO DE EQUILÍBRIO</div>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 700, color: "#f59e0b" }}>{fmt(pontoEquilibrio)}</div>
                    <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4 }}>por mês</div>
                  </div>
                  {/* Faturamento atual */}
                  <div className="card" style={{ padding: "16px 18px", borderTop: "3px solid #2563eb" }}>
                    <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>FATURAMENTO ATUAL</div>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 700, color: "#2563eb" }}>{fmt(receitaVendas)}</div>
                    <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4 }}>{pedidosMes.length} pedidos entregues</div>
                  </div>
                  {/* Resultado vs PE */}
                  <div className="card" style={{ padding: "16px 18px", borderTop: `3px solid ${folga >= 0 ? "#15803d" : "#dc2626"}` }}>
                    <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>
                      {folga >= 0 ? "ACIMA DO PE" : "ABAIXO DO PE"}
                    </div>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 700, color: folga >= 0 ? "#15803d" : "#dc2626" }}>
                      {folga >= 0 ? "+" : ""}{fmt(folga)}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4, color: folga >= 0 ? "#15803d" : "#dc2626", fontWeight: 500 }}>
                      {folga >= 0 ? `✓ PE atingido — margem de segurança ${margemSeguranca.toFixed(1)}%` : `Faltam ${fmt(Math.abs(folga))} para cobrir os fixos`}
                    </div>
                  </div>
                  {/* Dia em que atingiu */}
                  <div className="card" style={{ padding: "16px 18px", borderTop: `3px solid ${diaEquilibrio ? "#15803d" : "#a8a29e"}` }}>
                    <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>DIA DO EQUILÍBRIO</div>
                    {diaEquilibrio ? (
                      <>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 28, fontWeight: 700, color: "#15803d", lineHeight: 1 }}>
                          Dia {diaEquilibrio.dia}
                        </div>
                        <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 6 }}>
                          de {vendasDiariasAcum.length} dias no mês
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 700, color: "#a8a29e" }}>—</div>
                        <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4 }}>Ainda não atingido</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Gráfico + Fórmula */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14, marginBottom: 14 }}>
                  {/* Gráfico acumulado */}
                  <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Faturamento acumulado no mês</div>
                        <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 2 }}>Cada dia soma o faturamento dos pedidos entregues</div>
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#78716c" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ display: "inline-block", width: 20, borderTop: "2px dashed #f59e0b" }} /> PE
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#15803d" }} /> Equilíbrio
                        </span>
                      </div>
                    </div>
                    <GraficoEquilibrio dados={vendasDiariasAcum} pe={pontoEquilibrio} />
                  </div>

                  {/* Fórmula e detalhes */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Cálculo */}
                    <div className="card" style={{ padding: "16px 18px", background: "#fafaf9" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#57534e", marginBottom: 12, letterSpacing: "0.06em" }}>COMO FOI CALCULADO</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 12 }}>
                          <div style={{ color: "#a8a29e", fontSize: 10, marginBottom: 2 }}>CUSTOS FIXOS TOTAIS</div>
                          <div style={{ fontWeight: 600, color: "#dc2626" }}>{fmt(totalCustosFixos)}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "#a8a29e", textAlign: "center" }}>÷</div>
                        <div style={{ fontSize: 12 }}>
                          <div style={{ color: "#a8a29e", fontSize: 10, marginBottom: 2 }}>MARGEM DE CONTRIBUIÇÃO</div>
                          <div style={{ fontWeight: 600, color: "#2563eb" }}>{(margemContribDecimal * 100).toFixed(1)}%</div>
                          <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 2 }}>
                            ({fmt(receitaVendas)} − {fmt(cmvTotal)}) ÷ {fmt(receitaVendas)}
                          </div>
                        </div>
                        <div style={{ borderTop: "1px solid #e7e5e4", paddingTop: 8 }}>
                          <div style={{ color: "#a8a29e", fontSize: 10, marginBottom: 2 }}>= PONTO DE EQUILÍBRIO</div>
                          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 700, color: "#f59e0b" }}>{fmt(pontoEquilibrio)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Margem de segurança */}
                    <div className="card" style={{ padding: "16px 18px" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#57534e", marginBottom: 10, letterSpacing: "0.06em" }}>MARGEM DE SEGURANÇA</div>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 700, color: margemSeguranca >= 20 ? "#15803d" : margemSeguranca >= 0 ? "#d97706" : "#dc2626" }}>
                        {margemSeguranca.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4 }}>
                        {margemSeguranca >= 20 ? "Negócio bem protegido" : margemSeguranca >= 0 ? "Atenção: margem pequena" : "Operando abaixo do PE"}
                      </div>
                      <div style={{ marginTop: 10, height: 6, background: "#f5f5f4", borderRadius: 3 }}>
                        <div style={{ width: `${Math.min(Math.abs(margemSeguranca), 100)}%`, height: "100%", background: margemSeguranca >= 20 ? "#15803d" : margemSeguranca >= 0 ? "#d97706" : "#dc2626", borderRadius: 3, transition: "width 0.8s" }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabela de faturamento diário */}
                {vendasDiariasAcum.some(d => d.vendas > 0) && (
                  <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ padding: "12px 18px", borderBottom: "1px solid #f5f5f4", fontSize: 13, fontWeight: 600 }}>
                      Faturamento por dia
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ display: "flex", gap: 0, padding: "10px 16px", flexWrap: "wrap" }}>
                        {vendasDiariasAcum.filter(d => d.vendas > 0).map(d => {
                          const atingiu = d.acumulado >= pontoEquilibrio;
                          const esteEODia = diaEquilibrio && d.dia === diaEquilibrio.dia;
                          return (
                            <div key={d.dia} style={{ minWidth: 90, padding: "8px 10px", margin: "3px", background: esteEODia ? "#f0fdf4" : "#fafaf9", borderRadius: 8, border: esteEODia ? "1.5px solid #86efac" : "1px solid #f5f5f4", textAlign: "center" }}>
                              <div style={{ fontSize: 10, color: "#a8a29e", marginBottom: 3 }}>Dia {d.dia}</div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1c1917" }}>{fmt(d.vendas)}</div>
                              <div style={{ fontSize: 10, color: atingiu ? "#15803d" : "#a8a29e", marginTop: 2, fontWeight: atingiu ? 600 : 400 }}>
                                {fmt(d.acumulado)} acum.
                              </div>
                              {esteEODia && <div style={{ fontSize: 9, color: "#15803d", fontWeight: 700, marginTop: 2 }}>✓ PE atingido</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
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
            {/* Painel: Categorias editáveis (CRUD) */}
            <div className="ns-panel ns-mb12">
              <div className="ns-panel-h">
                <h3>Categorias</h3>
                <span className="ns-muted" style={{ fontSize: 12 }}>crie, edite ou remova as suas categorias de lançamento</span>
              </div>
              <CategoriasEditor
                categorias={categoriasFin}
                onCriar={criarCategoriaFin}
                onAtualizar={atualizarCategoriaFin}
                onExcluir={excluirCategoriaFin}
              />
            </div>

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
                {/* Categorias do CRUD (preferidas) + qualquer categoria legada que ainda aparece em lançamentos antigos */}
                {(() => {
                  const fromCrud = categoriasFin.filter(c => !c.arquivada).map(c => c.nome);
                  const fromLegado = [...CATEGORIAS_ENTRADA, ...CATEGORIAS_SAIDA];
                  const todas = [...new Set([...fromCrud, ...fromLegado])].sort();
                  return todas.map(c => <option key={c}>{c}</option>);
                })()}
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
                    {l.custo != null && l.valor > 0
                      ? <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 1 }}>custo {fmt(l.custo)} · margem {(((l.valor - l.custo) / l.valor) * 100).toFixed(0)}%</div>
                      : l.obs && <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 1 }}>{l.obs}</div>}
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

        {/* ── CUSTOS FIXOS ─────────────────────────────────────────────────── */}
        {tab === "custos-fixos" && <CustosFixos onCustosChange={setCustosFixosList} />}

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
      {modal && <ModalLancamento onSave={salvarLancamento} onCreateEmprestimo={criarEmprestimo} onClose={() => { setModal(false); setEditando(null); }} editando={editando} categoriasFin={categoriasFin} />}

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
