import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "./api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtR = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtN = (v, d = 2) => (parseFloat(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const todayISO = () => new Date().toISOString().split("T")[0];

// ─── Styles ──────────────────────────────────────────────────────────────────

const inp = {
  padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8,
  fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917",
  width: "100%", background: "#fff"
};
const btnPrimary = {
  background: "#15803d", color: "#fff", border: "none", borderRadius: 8,
  padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap"
};
const btnSecondary = {
  background: "none", border: "1.5px solid #e7e5e4", borderRadius: 8,
  padding: "8px 16px", fontSize: 13, cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", color: "#78716c"
};
const btnDanger = {
  background: "none", border: "1px solid #fecaca", borderRadius: 6,
  padding: "4px 10px", fontSize: 11, cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", color: "#dc2626"
};
const card = {
  background: "#fff", border: "1px solid #e7e5e4", borderRadius: 12, padding: "18px 20px"
};

function KPICard({ label, value, sub, color = "#15803d", warn = false }) {
  return (
    <div style={{ ...card, flex: "1 1 160px", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: warn ? "#dc2626" : color, fontFamily: "'Inter', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Badge({ children, color = "#15803d", bg = "#f0fdf4" }) {
  return (
    <span style={{ background: bg, color, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>
      {children}
    </span>
  );
}

function SaldoBadge({ saldo, minimo }) {
  if (saldo <= 0) return <Badge color="#dc2626" bg="#fef2f2">Zerado</Badge>;
  if (minimo > 0 && saldo <= minimo) return <Badge color="#d97706" bg="#fffbeb">Baixo</Badge>;
  return <Badge color="#15803d" bg="#f0fdf4">OK</Badge>;
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

function Dashboard({ onTabChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api.estoque.dashboard();
      setData(d);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando...</div>;
  if (!data) return null;

  const { totalItens, estoqueValor, itensBaixos, itensSemEstoque, ultimasEntradas, ultimasSaidas } = data;

  return (
    <div className="anim" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KPICard label="Total de Itens" value={totalItens} sub="itens cadastrados" />
        <KPICard label="Valor em Estoque" value={fmtR(estoqueValor)} sub="custo médio × saldo" />
        <KPICard label="Itens com Saldo Baixo" value={itensBaixos.length} sub="abaixo do mínimo" warn={itensBaixos.length > 0} />
        <KPICard label="Itens Zerados" value={itensSemEstoque.length} sub="sem saldo" warn={itensSemEstoque.length > 0} />
      </div>

      {itensBaixos.length > 0 && (
        <div style={{ ...card, borderLeft: "4px solid #d97706" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#d97706", marginBottom: 12 }}>⚠ Itens com Estoque Baixo</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {itensBaixos.map(i => (
              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "#fffbeb", borderRadius: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{i.codigo} — {i.nome}</span>
                <span style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>Saldo: {fmtN(i.saldo_atual)} {i.unidade} / Mín: {fmtN(i.estoque_minimo)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Últimas Entradas</div>
          {ultimasEntradas.length === 0 ? (
            <div style={{ fontSize: 12, color: "#a8a29e", textAlign: "center", padding: 16 }}>Nenhuma entrada ainda.<br />
              <button onClick={() => onTabChange("rapida")} style={{ ...btnPrimary, marginTop: 10, fontSize: 12, padding: "6px 14px" }}>+ Registrar Entrada</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ultimasEntradas.map(e => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid #f5f5f4" }}>
                  <span style={{ color: "#1c1917", fontWeight: 500 }}>{e.item_nome}</span>
                  <span style={{ color: "#15803d" }}>+{fmtN(e.quantidade)} · {fmtR(e.custo_unitario)}/un</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Últimas Saídas</div>
          {ultimasSaidas.length === 0 ? (
            <div style={{ fontSize: 12, color: "#a8a29e", textAlign: "center", padding: 16 }}>Nenhuma saída ainda.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ultimasSaidas.map(e => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid #f5f5f4" }}>
                  <span style={{ color: "#1c1917", fontWeight: 500 }}>{e.item_nome}</span>
                  <span style={{ color: "#dc2626" }}>-{fmtN(e.quantidade)} · {e.motivo}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ITENS ───────────────────────────────────────────────────────────────────

function Itens({ itens, categorias, fornecedores, onReload, showToast }) {
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ codigo: "", nome: "", unidade: "un", categoria_id: "", fornecedor_id: "", estoque_minimo: "", estoque_maximo: "" });
  const [saving, setSaving] = useState(false);

  const itensFiltrados = useMemo(() => {
    const q = busca.toLowerCase();
    return itens.filter(i => !q || i.nome.toLowerCase().includes(q) || i.codigo.toLowerCase().includes(q));
  }, [itens, busca]);

  const abrirNovo = () => {
    setEditando(null);
    setForm({ codigo: "", nome: "", unidade: "un", categoria_id: "", fornecedor_id: "", estoque_minimo: "", estoque_maximo: "" });
    setModalAberto(true);
  };

  const abrirEditar = (item) => {
    setEditando(item);
    setForm({
      codigo: item.codigo, nome: item.nome, unidade: item.unidade,
      categoria_id: item.categoria_id || "", fornecedor_id: item.fornecedor_id || "",
      estoque_minimo: item.estoque_minimo || "", estoque_maximo: item.estoque_maximo || ""
    });
    setModalAberto(true);
  };

  const salvar = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) return showToast("Código e nome são obrigatórios", "#dc2626");
    setSaving(true);
    try {
      const data = {
        ...form,
        categoria_id: form.categoria_id || null,
        fornecedor_id: form.fornecedor_id || null,
        estoque_minimo: parseFloat(form.estoque_minimo) || 0,
        estoque_maximo: parseFloat(form.estoque_maximo) || 0,
      };
      if (editando) {
        await api.estoque.itens.atualizar(editando.id, { ...data, ativo: editando.ativo });
        showToast("Item atualizado!");
      } else {
        await api.estoque.itens.criar(data);
        showToast("Item criado!");
      }
      setModalAberto(false);
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
    finally { setSaving(false); }
  };

  const excluir = async (item) => {
    if (!window.confirm(`Excluir "${item.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.estoque.itens.excluir(item.id);
      showToast("Item excluído", "#7c3aed");
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
  };

  const toggleAtivo = async (item) => {
    try {
      await api.estoque.itens.atualizar(item.id, {
        codigo: item.codigo, nome: item.nome, unidade: item.unidade,
        categoria_id: item.categoria_id, fornecedor_id: item.fornecedor_id,
        estoque_minimo: item.estoque_minimo, estoque_maximo: item.estoque_maximo,
        ativo: !item.ativo
      });
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
  };

  const UNIDADES = ["un", "kg", "g", "L", "mL", "caixa", "pct", "dz", "m", "cm"];

  return (
    <div className="anim">
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input className="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item..." style={{ maxWidth: 260 }} />
        <div style={{ flex: 1 }} />
        <button onClick={abrirNovo} style={btnPrimary}>+ Novo Item</button>
      </div>

      {itensFiltrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#a8a29e" }}>
          {itens.length === 0 ? "Nenhum item cadastrado. Clique em + Novo Item para começar." : "Nenhum item encontrado."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e7e5e4" }}>
                {["Código", "Nome", "Unidade", "Categoria", "Saldo", "Custo Médio", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 11, color: "#78716c", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.map(i => (
                <tr key={i.id} style={{ borderBottom: "1px solid #f5f5f4" }}>
                  <td style={{ padding: "10px 10px", fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>{i.codigo}</td>
                  <td style={{ padding: "10px 10px", fontWeight: 500 }}>{i.nome}</td>
                  <td style={{ padding: "10px 10px", color: "#78716c" }}>{i.unidade}</td>
                  <td style={{ padding: "10px 10px", color: "#78716c" }}>{i.categoria_nome || "—"}</td>
                  <td style={{ padding: "10px 10px", fontWeight: 600, color: i.saldo_atual <= 0 ? "#dc2626" : i.estoque_minimo > 0 && i.saldo_atual <= i.estoque_minimo ? "#d97706" : "#15803d" }}>
                    {fmtN(i.saldo_atual)} {i.unidade}
                  </td>
                  <td style={{ padding: "10px 10px" }}>{fmtR(i.custo_medio)}</td>
                  <td style={{ padding: "10px 10px" }}>
                    <SaldoBadge saldo={i.saldo_atual} minimo={i.estoque_minimo} />
                    {!i.ativo && <Badge color="#a8a29e" bg="#f5f5f4">Inativo</Badge>}
                  </td>
                  <td style={{ padding: "10px 10px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => abrirEditar(i)} style={{ ...btnSecondary, padding: "4px 10px", fontSize: 11 }}>Editar</button>
                      <button onClick={() => toggleAtivo(i)} style={{ ...btnSecondary, padding: "4px 10px", fontSize: 11 }}>
                        {i.ativo ? "Inativar" : "Ativar"}
                      </button>
                      <button onClick={() => excluir(i)} style={btnDanger}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal novo/editar */}
      {modalAberto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{editando ? "Editar Item" : "Novo Item de Estoque"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: "0 0 140px" }}>
                  <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>CÓDIGO *</label>
                  <input style={inp} value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="Ex: MAT001" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>NOME *</label>
                  <input style={inp} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome do item" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>UNIDADE</label>
                  <select style={{ ...inp }} value={form.unidade} onChange={e => setForm({ ...form, unidade: e.target.value })}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>CATEGORIA</label>
                  <select style={{ ...inp }} value={form.categoria_id} onChange={e => setForm({ ...form, categoria_id: e.target.value })}>
                    <option value="">Sem categoria</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>FORNECEDOR PADRÃO</label>
                <select style={{ ...inp }} value={form.fornecedor_id} onChange={e => setForm({ ...form, fornecedor_id: e.target.value })}>
                  <option value="">Sem fornecedor</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>ESTOQUE MÍNIMO</label>
                  <input style={inp} type="number" step="0.001" value={form.estoque_minimo} onChange={e => setForm({ ...form, estoque_minimo: e.target.value })} placeholder="0" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>ESTOQUE MÁXIMO</label>
                  <input style={inp} type="number" step="0.001" value={form.estoque_maximo} onChange={e => setForm({ ...form, estoque_maximo: e.target.value })} placeholder="0" />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button onClick={() => setModalAberto(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={salvar} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ENTRADA RÁPIDA (Mobile-first) ───────────────────────────────────────────

function EntradaRapida({ itens, fornecedores, onReload, showToast }) {
  const [busca, setBusca] = useState("");
  const [itemSel, setItemSel] = useState(null);
  const [showLista, setShowLista] = useState(false);
  const [form, setForm] = useState({ quantidade: "", custo_unitario: "", fornecedor_id: "", data: todayISO(), nf: "", obs: "" });
  const [saving, setSaving] = useState(false);
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);

  const itensFiltrados = useMemo(() => {
    const q = busca.toLowerCase();
    return itens.filter(i => i.ativo && (!q || i.nome.toLowerCase().includes(q) || i.codigo.toLowerCase().includes(q))).slice(0, 10);
  }, [itens, busca]);

  const selecionarItem = (item) => {
    setItemSel(item);
    setBusca(`${item.codigo} — ${item.nome}`);
    setShowLista(false);
    setForm(f => ({ ...f, custo_unitario: item.custo_medio > 0 ? String(item.custo_medio) : "" }));
  };

  const registrar = async () => {
    if (!itemSel) return showToast("Selecione um item", "#dc2626");
    const qtd = parseFloat(form.quantidade);
    if (!qtd || qtd <= 0) return showToast("Informe a quantidade", "#dc2626");
    const custo = parseFloat(form.custo_unitario) || 0;
    setSaving(true);
    try {
      await api.estoque.entradas.registrar({
        item_id: itemSel.id,
        quantidade: qtd,
        custo_unitario: custo,
        fornecedor_id: form.fornecedor_id || null,
        data: form.data,
        nf: form.nf,
        obs: form.obs,
      });
      showToast(`Entrada registrada: +${qtd} ${itemSel.unidade} de ${itemSel.nome}`);
      setItemSel(null);
      setBusca("");
      setForm({ quantidade: "", custo_unitario: "", fornecedor_id: "", data: todayISO(), nf: "", obs: "" });
      setDetalhesAbertos(false);
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
    finally { setSaving(false); }
  };

  return (
    <div className="anim">
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <div style={{ fontSize: 13, color: "#78716c", marginBottom: 20 }}>
          Registre uma entrada de estoque rapidamente. Apenas 3 campos obrigatórios.
        </div>

        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Campo 1: Item */}
          <div style={{ position: "relative" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 700, display: "block", marginBottom: 6, letterSpacing: "0.06em" }}>
              ITEM * <span style={{ fontSize: 10, fontWeight: 400 }}>(código ou nome)</span>
            </label>
            <input
              style={{ ...inp, fontSize: 16, padding: "12px 14px" }}
              value={busca}
              onChange={e => { setBusca(e.target.value); setItemSel(null); setShowLista(true); }}
              onFocus={() => setShowLista(true)}
              placeholder="Buscar item por código ou nome..."
              autoComplete="off"
            />
            {showLista && itensFiltrados.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e7e5e4", borderRadius: 8, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", maxHeight: 240, overflowY: "auto" }}>
                {itensFiltrados.map(i => (
                  <div key={i.id} onClick={() => selecionarItem(i)}
                    style={{ padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #f5f5f4", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f5f5f4"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{i.nome}</div>
                      <div style={{ fontSize: 11, color: "#78716c" }}>{i.codigo} · {i.unidade}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#15803d" }}>Saldo: {fmtN(i.saldo_atual)}</div>
                      <div style={{ fontSize: 11, color: "#a8a29e" }}>{fmtR(i.custo_medio)}/un</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {itemSel && (
              <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                <Badge color="#15803d" bg="#f0fdf4">✓ {itemSel.unidade}</Badge>
                <span style={{ fontSize: 11, color: "#a8a29e" }}>Saldo atual: {fmtN(itemSel.saldo_atual)} {itemSel.unidade}</span>
              </div>
            )}
          </div>

          {/* Campo 2: Quantidade */}
          <div>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 700, display: "block", marginBottom: 6, letterSpacing: "0.06em" }}>
              QUANTIDADE *
            </label>
            <input
              style={{ ...inp, fontSize: 20, fontWeight: 700, padding: "12px 14px", color: "#15803d" }}
              type="number" step="0.001" min="0.001"
              value={form.quantidade}
              onChange={e => setForm({ ...form, quantidade: e.target.value })}
              placeholder={`0 ${itemSel?.unidade || ""}`}
              inputMode="decimal"
            />
          </div>

          {/* Campo 3: Custo */}
          <div>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 700, display: "block", marginBottom: 6, letterSpacing: "0.06em" }}>
              CUSTO UNITÁRIO *
            </label>
            <input
              style={{ ...inp, fontSize: 18, padding: "12px 14px" }}
              type="number" step="0.01" min="0"
              value={form.custo_unitario}
              onChange={e => setForm({ ...form, custo_unitario: e.target.value })}
              placeholder="R$ 0,00"
              inputMode="decimal"
            />
            {itemSel && itemSel.custo_medio > 0 && (
              <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4 }}>
                Custo médio atual: {fmtR(itemSel.custo_medio)}/un
              </div>
            )}
          </div>

          {/* Detalhes opcionais */}
          <button onClick={() => setDetalhesAbertos(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#78716c", textAlign: "left", padding: 0 }}>
            {detalhesAbertos ? "▲" : "▼"} Campos opcionais (fornecedor, data, NF, obs)
          </button>

          {detalhesAbertos && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0 0", borderTop: "1px solid #f5f5f4" }}>
              <div>
                <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>FORNECEDOR</label>
                <select style={inp} value={form.fornecedor_id} onChange={e => setForm({ ...form, fornecedor_id: e.target.value })}>
                  <option value="">Sem fornecedor</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>DATA</label>
                  <input type="date" style={inp} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>Nº NF / Nota</label>
                  <input style={inp} value={form.nf} onChange={e => setForm({ ...form, nf: e.target.value })} placeholder="NF-001" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>OBSERVAÇÃO</label>
                <input style={inp} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Observação opcional" />
              </div>
            </div>
          )}

          {/* Preview e botão */}
          {itemSel && form.quantidade && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
              <strong>{itemSel.nome}</strong>: +{fmtN(parseFloat(form.quantidade) || 0, 3)} {itemSel.unidade}
              {form.custo_unitario && ` · Total: ${fmtR((parseFloat(form.quantidade) || 0) * (parseFloat(form.custo_unitario) || 0))}`}
            </div>
          )}

          <button onClick={registrar} disabled={saving} style={{ ...btnPrimary, padding: "14px", fontSize: 15, borderRadius: 10, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Registrando..." : "✓ Confirmar Entrada"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ENTRADA EM LOTE ──────────────────────────────────────────────────────────

function EntradaLote({ itens, fornecedores, onReload, showToast }) {
  const [linhas, setLinhas] = useState(() =>
    itens.filter(i => i.ativo).map(i => ({ item: i, quantidade: "", custo_unitario: String(i.custo_medio || ""), selecionado: false }))
  );
  const [dataGlobal, setDataGlobal] = useState(todayISO());
  const [fornecedorGlobal, setFornecedorGlobal] = useState("");
  const [nfGlobal, setNfGlobal] = useState("");
  const [busca, setBusca] = useState("");
  const [saving, setSaving] = useState(false);

  // Reinicializar quando itens mudar
  useEffect(() => {
    setLinhas(itens.filter(i => i.ativo).map(i => ({ item: i, quantidade: "", custo_unitario: String(i.custo_medio || ""), selecionado: false })));
  }, [itens]);

  const linhasFiltradas = useMemo(() => {
    const q = busca.toLowerCase();
    return linhas.filter(l => !q || l.item.nome.toLowerCase().includes(q) || l.item.codigo.toLowerCase().includes(q));
  }, [linhas, busca]);

  const linhasPreenchidas = linhas.filter(l => l.quantidade && parseFloat(l.quantidade) > 0);

  const setLinha = (id, campo, valor) => {
    setLinhas(ls => ls.map(l => l.item.id === id ? { ...l, [campo]: valor } : l));
  };

  const toggleSelecionado = (id) => {
    setLinhas(ls => ls.map(l => l.item.id === id ? { ...l, selecionado: !l.selecionado } : l));
  };

  const limpar = () => {
    setLinhas(ls => ls.map(l => ({ ...l, quantidade: "", selecionado: false })));
  };

  const registrar = async () => {
    if (linhasPreenchidas.length === 0) return showToast("Preencha ao menos uma quantidade", "#dc2626");
    setSaving(true);
    try {
      const entradas = linhasPreenchidas.map(l => ({
        item_id: l.item.id,
        quantidade: parseFloat(l.quantidade),
        custo_unitario: parseFloat(l.custo_unitario) || 0,
        fornecedor_id: fornecedorGlobal || null,
        data: dataGlobal,
        nf: nfGlobal,
        obs: "",
      }));
      const { processadas } = await api.estoque.entradas.lote(entradas);
      showToast(`${processadas} entrada(s) registrada(s) com sucesso!`);
      limpar();
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
    finally { setSaving(false); }
  };

  const totalCusto = linhasPreenchidas.reduce((s, l) => s + (parseFloat(l.quantidade) || 0) * (parseFloat(l.custo_unitario) || 0), 0);

  return (
    <div className="anim">
      {/* Cabeçalho global */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Configurações da Compra</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>DATA DA COMPRA</label>
            <input type="date" style={inp} value={dataGlobal} onChange={e => setDataGlobal(e.target.value)} />
          </div>
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>FORNECEDOR</label>
            <select style={inp} value={fornecedorGlobal} onChange={e => setFornecedorGlobal(e.target.value)}>
              <option value="">Sem fornecedor</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>Nº NF / NOTA</label>
            <input style={inp} value={nfGlobal} onChange={e => setNfGlobal(e.target.value)} placeholder="NF-001" />
          </div>
        </div>
      </div>

      {/* Barra de busca e resumo */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input className="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Filtrar itens..." style={{ maxWidth: 260 }} />
        <div style={{ flex: 1 }} />
        {linhasPreenchidas.length > 0 && (
          <div style={{ fontSize: 12, color: "#78716c" }}>
            <strong style={{ color: "#15803d" }}>{linhasPreenchidas.length}</strong> item(ns) · Total: <strong>{fmtR(totalCusto)}</strong>
          </div>
        )}
        {linhasPreenchidas.length > 0 && <button onClick={limpar} style={btnSecondary}>Limpar</button>}
        <button onClick={registrar} disabled={saving || linhasPreenchidas.length === 0}
          style={{ ...btnPrimary, opacity: (saving || linhasPreenchidas.length === 0) ? 0.6 : 1 }}>
          {saving ? "Registrando..." : `✓ Registrar ${linhasPreenchidas.length > 0 ? `(${linhasPreenchidas.length})` : ""}`}
        </button>
      </div>

      {/* Tabela de itens */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f5f5f4", borderBottom: "2px solid #e7e5e4" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: "#78716c", fontWeight: 600 }}>ITEM</th>
              <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: "#78716c", fontWeight: 600 }}>SALDO ATUAL</th>
              <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: "#78716c", fontWeight: 600, minWidth: 130 }}>QUANTIDADE ENTRADA</th>
              <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: "#78716c", fontWeight: 600, minWidth: 130 }}>CUSTO UNITÁRIO</th>
              <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, color: "#78716c", fontWeight: 600 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.map(l => {
              const qtd = parseFloat(l.quantidade) || 0;
              const custo = parseFloat(l.custo_unitario) || 0;
              const totalLinha = qtd * custo;
              const preenchida = qtd > 0;
              return (
                <tr key={l.item.id} style={{ borderBottom: "1px solid #f5f5f4", background: preenchida ? "#f0fdf4" : "transparent" }}>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ fontWeight: preenchida ? 700 : 500 }}>{l.item.nome}</div>
                    <div style={{ fontSize: 11, color: "#78716c", fontFamily: "monospace" }}>{l.item.codigo} · {l.item.unidade}</div>
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: l.item.saldo_atual <= 0 ? "#dc2626" : "#78716c", fontWeight: 600 }}>
                    {fmtN(l.item.saldo_atual)} {l.item.unidade}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <input
                      type="number" step="0.001" min="0"
                      value={l.quantidade}
                      onChange={e => setLinha(l.item.id, "quantidade", e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                      style={{ ...inp, width: 120, fontSize: 14, fontWeight: preenchida ? 700 : 400, color: preenchida ? "#15803d" : "#1c1917", padding: "6px 10px" }}
                    />
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <input
                      type="number" step="0.01" min="0"
                      value={l.custo_unitario}
                      onChange={e => setLinha(l.item.id, "custo_unitario", e.target.value)}
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                      style={{ ...inp, width: 120, padding: "6px 10px", fontSize: 14 }}
                    />
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: preenchida ? 700 : 400, color: preenchida ? "#15803d" : "#a8a29e", fontSize: 13 }}>
                    {preenchida ? fmtR(totalLinha) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {linhasPreenchidas.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid #e7e5e4", background: "#f0fdf4" }}>
                <td colSpan={4} style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700 }}>Total da compra</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 15, fontWeight: 700, color: "#15803d" }}>{fmtR(totalCusto)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── SAÍDAS ──────────────────────────────────────────────────────────────────

function Saidas({ itens, onReload, showToast }) {
  const [saidas, setSaidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ item_id: "", quantidade: "", motivo: "consumo", data: todayISO(), obs: "" });
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");

  const MOTIVOS = ["consumo", "vencimento", "perda", "devolução", "outros"];

  const load = useCallback(async () => {
    try {
      const s = await api.estoque.saidas.listar();
      setSaidas(s);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const registrar = async () => {
    if (!form.item_id) return showToast("Selecione um item", "#dc2626");
    const qtd = parseFloat(form.quantidade);
    if (!qtd || qtd <= 0) return showToast("Informe a quantidade", "#dc2626");
    setSaving(true);
    try {
      await api.estoque.saidas.registrar({ ...form, quantidade: qtd });
      showToast("Saída registrada!");
      setForm({ item_id: "", quantidade: "", motivo: "consumo", data: todayISO(), obs: "" });
      await load();
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
    finally { setSaving(false); }
  };

  const saidasFiltradas = useMemo(() => {
    const q = busca.toLowerCase();
    return saidas.filter(s => !q || s.item_nome.toLowerCase().includes(q));
  }, [saidas, busca]);

  const itemSelecionado = itens.find(i => i.id === form.item_id);

  return (
    <div className="anim" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Registrar Saída</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>ITEM *</label>
            <select style={inp} value={form.item_id} onChange={e => setForm({ ...form, item_id: e.target.value })}>
              <option value="">Selecionar item...</option>
              {itens.filter(i => i.ativo && i.saldo_atual > 0).map(i => (
                <option key={i.id} value={i.id}>{i.codigo} — {i.nome} (Saldo: {fmtN(i.saldo_atual)} {i.unidade})</option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 100px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>QTD *</label>
            <input type="number" step="0.001" min="0.001" style={inp} value={form.quantidade}
              onChange={e => setForm({ ...form, quantidade: e.target.value })} placeholder={`0 ${itemSelecionado?.unidade || ""}`} inputMode="decimal" />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>MOTIVO</label>
            <select style={inp} value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })}>
              {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>DATA</label>
            <input type="date" style={inp} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
          </div>
          <div style={{ flex: "2 1 180px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>OBS</label>
            <input style={inp} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Observação" />
          </div>
          <button onClick={registrar} disabled={saving} style={{ ...btnPrimary, flexShrink: 0, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : "Registrar"}
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Histórico de Saídas</div>
          <input className="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." style={{ maxWidth: 200 }} />
        </div>
        {loading ? <div style={{ textAlign: "center", padding: 20, color: "#a8a29e" }}>Carregando...</div> :
          saidasFiltradas.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: "#a8a29e" }}>Nenhuma saída registrada.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e7e5e4" }}>
                    {["Data", "Item", "Qtd", "Motivo", "Obs"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#78716c", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {saidasFiltradas.map(s => (
                    <tr key={s.id} style={{ borderBottom: "1px solid #f5f5f4" }}>
                      <td style={{ padding: "8px 10px", fontSize: 12 }}>{new Date(s.data + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 500 }}>{s.item_nome}</td>
                      <td style={{ padding: "8px 10px", color: "#dc2626", fontWeight: 600 }}>-{fmtN(s.quantidade)} {s.unidade}</td>
                      <td style={{ padding: "8px 10px" }}><Badge color="#d97706" bg="#fffbeb">{s.motivo}</Badge></td>
                      <td style={{ padding: "8px 10px", color: "#78716c", fontSize: 12 }}>{s.obs || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}

// ─── AJUSTES ─────────────────────────────────────────────────────────────────

function Ajustes({ itens, onReload, showToast }) {
  const [ajustes, setAjustes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ item_id: "", saldo_novo: "", motivo: "", data: todayISO(), obs: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await api.estoque.ajustes.listar();
      setAjustes(a);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const itemSelecionado = itens.find(i => i.id === form.item_id);

  const registrar = async () => {
    if (!form.item_id) return showToast("Selecione um item", "#dc2626");
    const novoSaldo = parseFloat(form.saldo_novo);
    if (isNaN(novoSaldo) || novoSaldo < 0) return showToast("Informe o novo saldo (≥ 0)", "#dc2626");
    setSaving(true);
    try {
      await api.estoque.ajustes.registrar({ ...form, saldo_novo: novoSaldo });
      showToast("Ajuste registrado!");
      setForm({ item_id: "", saldo_novo: "", motivo: "", data: todayISO(), obs: "" });
      await load();
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
    finally { setSaving(false); }
  };

  return (
    <div className="anim" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Ajuste de Inventário</div>
        <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>Use para corrigir diferenças encontradas na contagem física do estoque.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>ITEM *</label>
            <select style={inp} value={form.item_id} onChange={e => setForm({ ...form, item_id: e.target.value, saldo_novo: "" })}>
              <option value="">Selecionar item...</option>
              {itens.filter(i => i.ativo).map(i => (
                <option key={i.id} value={i.id}>{i.codigo} — {i.nome} (Atual: {fmtN(i.saldo_atual)} {i.unidade})</option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>NOVO SALDO *</label>
            <input type="number" step="0.001" min="0" style={inp} value={form.saldo_novo}
              onChange={e => setForm({ ...form, saldo_novo: e.target.value })}
              placeholder={itemSelecionado ? fmtN(itemSelecionado.saldo_atual) : "0"} inputMode="decimal" />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>MOTIVO</label>
            <input style={inp} value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Contagem física" />
          </div>
          <div style={{ flex: "0 0 130px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>DATA</label>
            <input type="date" style={inp} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
          </div>
          <button onClick={registrar} disabled={saving} style={{ ...btnPrimary, flexShrink: 0, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : "Ajustar"}
          </button>
        </div>
        {itemSelecionado && form.saldo_novo !== "" && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#f0fdf4", borderRadius: 8, fontSize: 12 }}>
            Diferença: <strong style={{ color: parseFloat(form.saldo_novo) - itemSelecionado.saldo_atual >= 0 ? "#15803d" : "#dc2626" }}>
              {parseFloat(form.saldo_novo) - itemSelecionado.saldo_atual >= 0 ? "+" : ""}{fmtN(parseFloat(form.saldo_novo) - itemSelecionado.saldo_atual)} {itemSelecionado.unidade}
            </strong>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Histórico de Ajustes</div>
        {loading ? <div style={{ textAlign: "center", padding: 20, color: "#a8a29e" }}>Carregando...</div> :
          ajustes.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: "#a8a29e" }}>Nenhum ajuste registrado.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e7e5e4" }}>
                    {["Data", "Item", "Antes", "Depois", "Diferença", "Motivo"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#78716c", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ajustes.map(a => {
                    const diff = a.saldo_novo - a.saldo_anterior;
                    return (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f5f5f4" }}>
                        <td style={{ padding: "8px 10px", fontSize: 12 }}>{new Date(a.data + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 500 }}>{a.item_nome}</td>
                        <td style={{ padding: "8px 10px", color: "#78716c" }}>{fmtN(a.saldo_anterior)} {a.unidade}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>{fmtN(a.saldo_novo)} {a.unidade}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 600, color: diff >= 0 ? "#15803d" : "#dc2626" }}>
                          {diff >= 0 ? "+" : ""}{fmtN(diff)}
                        </td>
                        <td style={{ padding: "8px 10px", color: "#78716c", fontSize: 12 }}>{a.motivo || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}

// ─── FORNECEDORES ─────────────────────────────────────────────────────────────

function FornecedoresTab({ fornecedores, onReload, showToast }) {
  const [form, setForm] = useState({ nome: "", telefone: "", email: "", obs: "" });
  const [editando, setEditando] = useState(null);
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!form.nome.trim()) return showToast("Nome é obrigatório", "#dc2626");
    setSaving(true);
    try {
      if (editando) {
        await api.estoque.fornecedores.atualizar(editando.id, form);
        showToast("Fornecedor atualizado!");
      } else {
        await api.estoque.fornecedores.criar(form);
        showToast("Fornecedor criado!");
      }
      setForm({ nome: "", telefone: "", email: "", obs: "" });
      setEditando(null);
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
    finally { setSaving(false); }
  };

  const excluir = async (f) => {
    if (!window.confirm(`Excluir "${f.nome}"?`)) return;
    try {
      await api.estoque.fornecedores.excluir(f.id);
      showToast("Fornecedor removido", "#7c3aed");
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
  };

  const editar = (f) => {
    setEditando(f);
    setForm({ nome: f.nome, telefone: f.telefone || "", email: f.email || "", obs: f.obs || "" });
  };

  return (
    <div className="anim" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{editando ? "Editar Fornecedor" : "Novo Fornecedor"}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 180px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>NOME *</label>
            <input style={inp} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome do fornecedor" />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>TELEFONE</label>
            <input style={inp} value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>EMAIL</label>
            <input type="email" style={inp} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@fornecedor.com" />
          </div>
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 4 }}>OBS</label>
            <input style={inp} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Observação" />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {editando && <button onClick={() => { setEditando(null); setForm({ nome: "", telefone: "", email: "", obs: "" }); }} style={btnSecondary}>Cancelar</button>}
            <button onClick={salvar} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando..." : editando ? "Atualizar" : "Criar"}</button>
          </div>
        </div>
      </div>

      {fornecedores.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#a8a29e" }}>Nenhum fornecedor cadastrado.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {fornecedores.map(f => (
            <div key={f.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{f.nome}</div>
                <div style={{ fontSize: 12, color: "#78716c" }}>
                  {f.telefone && <span style={{ marginRight: 12 }}>📞 {f.telefone}</span>}
                  {f.email && <span style={{ marginRight: 12 }}>✉ {f.email}</span>}
                  {f.obs && <span>{f.obs}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => editar(f)} style={{ ...btnSecondary, padding: "4px 12px", fontSize: 11 }}>Editar</button>
                <button onClick={() => excluir(f)} style={btnDanger}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CATEGORIAS ───────────────────────────────────────────────────────────────

function CategoriasTab({ categorias, onReload, showToast }) {
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);

  const criar = async () => {
    if (!nome.trim()) return showToast("Informe o nome", "#dc2626");
    setSaving(true);
    try {
      await api.estoque.categorias.criar({ nome: nome.trim() });
      showToast("Categoria criada!");
      setNome("");
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
    finally { setSaving(false); }
  };

  const excluir = async (id, n) => {
    if (!window.confirm(`Excluir "${n}"?`)) return;
    try {
      await api.estoque.categorias.excluir(id);
      showToast("Categoria removida", "#7c3aed");
      onReload();
    } catch (err) { showToast(err.message, "#dc2626"); }
  };

  return (
    <div className="anim">
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nova Categoria</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={{ ...inp, flex: 1 }} value={nome} onChange={e => setNome(e.target.value)}
            onKeyDown={e => e.key === "Enter" && criar()} placeholder="Ex: Laticínios, Carnes, Embalagens..." />
          <button onClick={criar} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>+ Criar</button>
        </div>
      </div>

      {categorias.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#a8a29e" }}>Nenhuma categoria cadastrada.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {categorias.map(c => (
            <div key={c.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px" }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{c.nome}</span>
              <button onClick={() => excluir(c.id, c.nome)} style={btnDanger}>Excluir</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Estoque() {
  const [tab, setTab] = useState("dashboard");
  const [itens, setItens] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (msg, cor = "#14532d") => {
    setToast({ msg, cor });
    setTimeout(() => setToast(null), 3000);
  };

  const carregarDados = useCallback(async () => {
    try {
      const [itensDados, catsDados, fornDados] = await Promise.all([
        api.estoque.itens.listar(),
        api.estoque.categorias.listar(),
        api.estoque.fornecedores.listar(),
      ]);
      setItens(itensDados);
      setCategorias(catsDados);
      setFornecedores(fornDados);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const nav = [
    { key: "dashboard", label: "Dashboard" },
    { key: "itens", label: "Itens" },
    { key: "rapida", label: "Entrada Rápida" },
    { key: "lote", label: "Entrada em Lote" },
    { key: "saidas", label: "Saídas" },
    { key: "ajustes", label: "Ajustes" },
    { key: "fornecedores", label: "Fornecedores" },
    { key: "categorias", label: "Categorias" },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando estoque...</div>;

  return (
    <div>
      <style>{`
        .est-nav-pill { padding: 6px 14px; border-radius: 7px; border: none; background: none; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 12px; color: #78716c; white-space: nowrap; }
        .est-nav-pill:hover { background: #f5f5f4; color: #1c1917; }
        .est-nav-pill.active { background: #fff; color: #15803d; font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600 }}>Estoque</div>
          <div style={{ fontSize: 12, color: "#a8a29e" }}>Controle de insumos e materiais</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", gap: 2, background: "#f5f5f4", borderRadius: 10, padding: 3, flexWrap: "wrap", marginBottom: 24, overflowX: "auto" }}>
        {nav.map(n => (
          <button key={n.key} className={`est-nav-pill ${tab === n.key ? "active" : ""}`} onClick={() => setTab(n.key)}>
            {n.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard onTabChange={setTab} />}
      {tab === "itens" && <Itens itens={itens} categorias={categorias} fornecedores={fornecedores} onReload={carregarDados} showToast={showToast} />}
      {tab === "rapida" && <EntradaRapida itens={itens} fornecedores={fornecedores} onReload={carregarDados} showToast={showToast} />}
      {tab === "lote" && <EntradaLote itens={itens} fornecedores={fornecedores} onReload={carregarDados} showToast={showToast} />}
      {tab === "saidas" && <Saidas itens={itens} onReload={carregarDados} showToast={showToast} />}
      {tab === "ajustes" && <Ajustes itens={itens} onReload={carregarDados} showToast={showToast} />}
      {tab === "fornecedores" && <FornecedoresTab fornecedores={fornecedores} onReload={carregarDados} showToast={showToast} />}
      {tab === "categorias" && <CategoriasTab categorias={categorias} onReload={carregarDados} showToast={showToast} />}

      {toast && (
        <div className="toast" style={{ background: toast.cor }}>{toast.msg}</div>
      )}
    </div>
  );
}
