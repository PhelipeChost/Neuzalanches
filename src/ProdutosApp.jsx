import { useState, useEffect } from "react";
import { api } from "./api";
import Produtos from "./Produtos";
import Promocoes from "./Promocoes";
import Logo from "./Logo";
import { SEGMENTOS, TIPOS_CARDAPIO, infoSegmento, parseConfig } from "./segmentos";

const cfgInp = { padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917" };
const cfgBtn = { background: "#F38C24", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" };
const cfgDel = { background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#dc2626" };
const cfgRow = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "10px 14px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f5f5f4" };

// ─── CATEGORIAS ──────────────────────────────────────────────────────────────
function CategoriasTab({ cardapioAtivo, cardapioNome }) {
  const [categorias, setCategorias] = useState([]);
  const [novaCat, setNovaCat] = useState("");
  const [novaCatAdicionais, setNovaCatAdicionais] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    setLoading(true);
    api.categorias.listar({ cardapio_id: cardapioAtivo })
      .then(setCategorias)
      .catch(() => showToast("Erro ao carregar", "#dc2626"))
      .finally(() => setLoading(false));
  }, [cardapioAtivo]);

  const adicionar = async () => {
    const nome = novaCat.trim();
    if (!nome) return showToast("Digite o nome da categoria", "#dc2626");
    try {
      const nova = await api.categorias.criar({ nome, permite_adicionais: novaCatAdicionais, cardapio_id: cardapioAtivo });
      setCategorias(cs => [...cs, nova]);
      setNovaCat("");
      setNovaCatAdicionais(false);
      showToast(`Categoria criada no cardápio ${cardapioNome || ""}!`);
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  const remover = async (id) => {
    try {
      await api.categorias.excluir(id);
      setCategorias(cs => cs.filter(c => c.id !== id));
      showToast("Categoria removida", "#7c3aed");
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  const toggleAdicionais = async (cat) => {
    try {
      const atualizada = await api.categorias.atualizar(cat.id, { nome: cat.nome, permite_adicionais: !cat.permite_adicionais });
      setCategorias(cs => cs.map(c => c.id === cat.id ? atualizada : c));
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  const salvarMaxAdicionais = async (cat, valor) => {
    const max = Math.max(0, parseInt(valor, 10) || 0);
    // atualização otimista
    setCategorias(cs => cs.map(c => c.id === cat.id ? { ...c, max_adicionais: max } : c));
    try {
      await api.categorias.atualizar(cat.id, { nome: cat.nome, max_adicionais: max });
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  const mover = async (id, direcao) => {
    const idx = categorias.findIndex(c => c.id === id);
    if (idx < 0) return;
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= categorias.length) return;
    const novaLista = [...categorias];
    [novaLista[idx], novaLista[novoIdx]] = [novaLista[novoIdx], novaLista[idx]];
    setCategorias(novaLista);
    try {
      await api.categorias.reordenar(novaLista.map(c => c.id));
    } catch (err) {
      showToast("Erro ao reordenar: " + err.message, "#dc2626");
      try { setCategorias(await api.categorias.listar()); } catch {}
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando...</div>;

  return (
    <div className="anim">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600 }}>Categorias {cardapioNome ? `— ${cardapioNome}` : ""}</div>
      </div>
      <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 2, marginBottom: 20 }}>
        {categorias.length} categoria{categorias.length !== 1 ? "s" : ""} deste cardápio
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
          Categorias para classificar os produtos no cardápio. Marque "Permite adicionais" para categorias como Lanches.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
          <input value={novaCat} onChange={e => setNovaCat(e.target.value)} onKeyDown={e => e.key === "Enter" && adicionar()}
            placeholder="Nova categoria" style={{ ...cfgInp, flex: 1 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#78716c", whiteSpace: "nowrap", cursor: "pointer" }}>
            <input type="checkbox" checked={novaCatAdicionais} onChange={e => setNovaCatAdicionais(e.target.checked)} style={{ accentColor: "#15803d" }} />
            Adicionais
          </label>
          <button onClick={adicionar} style={cfgBtn}>+ Criar</button>
        </div>

        {categorias.length === 0 ? (
          <div style={{ textAlign: "center", padding: 16, color: "#a8a29e", fontSize: 13 }}>Nenhuma categoria.</div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: "#a8a29e", marginBottom: 8, fontStyle: "italic" }}>
              A ordem abaixo é a mesma do cardápio do cliente. Use as setas para reorganizar.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {categorias.map((c, idx) => (
                <div key={c.id} style={cfgRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button onClick={() => mover(c.id, -1)} disabled={idx === 0}
                        style={{ background: idx === 0 ? "#fafaf9" : "#fff", border: "1px solid #e7e5e4", borderRadius: 4, padding: "1px 6px", fontSize: 10, cursor: idx === 0 ? "not-allowed" : "pointer", color: idx === 0 ? "#d6d3d1" : "#57534e", fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>{"▲"}</button>
                      <button onClick={() => mover(c.id, 1)} disabled={idx === categorias.length - 1}
                        style={{ background: idx === categorias.length - 1 ? "#fafaf9" : "#fff", border: "1px solid #e7e5e4", borderRadius: 4, padding: "1px 6px", fontSize: 10, cursor: idx === categorias.length - 1 ? "not-allowed" : "pointer", color: idx === categorias.length - 1 ? "#d6d3d1" : "#57534e", fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>{"▼"}</button>
                    </div>
                    <span style={{ fontSize: 11, color: "#a8a29e", fontWeight: 700, minWidth: 18 }}>{idx + 1}.</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{c.nome}</span>
                    {c.permite_adicionais && (
                      <span style={{ background: "#f0fdf4", color: "#15803d", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4 }}>Adicionais</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {c.permite_adicionais && (
                      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#78716c", whiteSpace: "nowrap" }} title="Máximo de adicionais por item. 0 = sem limite.">
                        Limite:
                        <input type="number" min="0" step="1" defaultValue={c.max_adicionais || 0}
                          onBlur={e => salvarMaxAdicionais(c, e.target.value)}
                          style={{ width: 52, padding: "3px 6px", border: "1px solid #e7e5e4", borderRadius: 6, fontSize: 11, textAlign: "center", fontFamily: "'DM Sans', sans-serif" }} />
                      </label>
                    )}
                    <button onClick={() => toggleAdicionais(c)}
                      style={{ background: "none", border: "1px solid #e7e5e4", borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
                      {c.permite_adicionais ? "Desativar adicionais" : "Ativar adicionais"}
                    </button>
                    <button onClick={() => remover(c.id)} style={cfgDel}>Remover</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}

// ─── ADICIONAIS ──────────────────────────────────────────────────────────────
function AdicionaisTab({ cardapioAtivo, cardapioNome }) {
  const [adicionais, setAdicionais] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [novoAd, setNovoAd] = useState({ nome: "", preco: "", custo: "", categoria: "" });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };
  const fmtPreco = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.adicionais.listar({ cardapio_id: cardapioAtivo }),
      api.categorias.listar({ cardapio_id: cardapioAtivo }),
    ])
      .then(([ads, cats]) => { setAdicionais(ads); setCategorias(cats); })
      .catch(() => showToast("Erro ao carregar", "#dc2626"))
      .finally(() => setLoading(false));
  }, [cardapioAtivo]);

  const adicionar = async () => {
    const nome = novoAd.nome.trim();
    const preco = parseFloat(novoAd.preco);
    const custo = parseFloat(novoAd.custo) || 0;
    if (!nome || isNaN(preco) || preco < 0) return showToast("Preencha nome e preco valido", "#dc2626");
    try {
      const novo = await api.adicionais.criar({ nome, preco, custo, disponivel: true, categoria: novoAd.categoria, cardapio_id: cardapioAtivo });
      setAdicionais(ads => [...ads, novo]);
      setNovoAd({ nome: "", preco: "", custo: "", categoria: "" });
      showToast(`Adicional criado no cardápio ${cardapioNome || ""}!`);
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  const remover = async (id) => {
    try {
      await api.adicionais.excluir(id);
      setAdicionais(ads => ads.filter(a => a.id !== id));
      showToast("Adicional removido", "#7c3aed");
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  const toggleDisponivel = async (ad) => {
    try {
      const atualizado = await api.adicionais.atualizar(ad.id, { nome: ad.nome, preco: ad.preco, custo: ad.custo || 0, disponivel: !ad.disponivel });
      setAdicionais(ads => ads.map(a => a.id === ad.id ? atualizado : a));
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando...</div>;

  return (
    <div className="anim">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600 }}>Adicionais {cardapioNome ? `— ${cardapioNome}` : ""}</div>
      </div>
      <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 2, marginBottom: 20 }}>{adicionais.length} adicional{adicionais.length !== 1 ? "es" : ""} deste cardápio</div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
          Itens extras que o cliente pode adicionar aos produtos. Vincule a uma <b>categoria</b> para que o adicional apareça só nela (ex: adicionais de bebidas), ou deixe em <b>Todas</b> para valer em qualquer produto com adicionais habilitados.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <input value={novoAd.nome} onChange={e => setNovoAd({ ...novoAd, nome: e.target.value })}
            placeholder="Nome do adicional" style={{ ...cfgInp, flex: 1, minWidth: 0 }} />
          <input value={novoAd.preco} onChange={e => setNovoAd({ ...novoAd, preco: e.target.value })}
            placeholder="Preco venda" type="number" step="0.01" style={{ ...cfgInp, width: 110, minWidth: 110 }} />
          <input value={novoAd.custo} onChange={e => setNovoAd({ ...novoAd, custo: e.target.value })}
            placeholder="Custo (CMV)" type="number" step="0.01" style={{ ...cfgInp, width: 110, minWidth: 110 }} />
          <select value={novoAd.categoria} onChange={e => setNovoAd({ ...novoAd, categoria: e.target.value })}
            style={{ ...cfgInp, cursor: "pointer", minWidth: 150 }}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
          <button onClick={adicionar} style={cfgBtn}>+ Criar</button>
        </div>

        {adicionais.length === 0 ? (
          <div style={{ textAlign: "center", padding: 16, color: "#a8a29e", fontSize: 13 }}>Nenhum adicional cadastrado.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {adicionais.map(a => (
              <div key={a.id} style={cfgRow}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{a.nome}</span>
                  <span style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>{fmtPreco(a.preco)}</span>
                  {a.custo > 0 && <span style={{ fontSize: 11, color: "#a8a29e" }}>CMV: {fmtPreco(a.custo)}</span>}
                  <span style={{ background: a.categoria ? "#eff6ff" : "#f5f5f4", color: a.categoria ? "#2563eb" : "#78716c", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4 }}>
                    {a.categoria ? `📂 ${a.categoria}` : "Todas"}
                  </span>
                  <span style={{ background: a.disponivel ? "#dcfce7" : "#fee2e2", color: a.disponivel ? "#15803d" : "#dc2626", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4 }}>
                    {a.disponivel ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => toggleDisponivel(a)}
                    style={{ background: "none", border: "1px solid #e7e5e4", borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
                    {a.disponivel ? "Desativar" : "Ativar"}
                  </button>
                  <button onClick={() => remover(a.id)} style={cfgDel}>Remover</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}

// ─── PRODUTOS APP (Hub Section) ──────────────────────────────────────────────
// ─── T10: DESEMPENHO DO CARDÁPIO ──────────────────────────────────────────────
function DesempenhoTab() {
  const [stats, setStats] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catSel, setCatSel] = useState("__todas__");
  const [criterio, setCriterio] = useState("quantidade"); // quantidade | faturamento | margem | menor_margem

  useEffect(() => {
    Promise.all([
      api.cardapio.stats().catch(() => null),
      api.relatorios.ranking().catch(() => null),
    ]).then(([s, r]) => { setStats(s); setRanking(r); }).finally(() => setLoading(false));
  }, []);

  const fmtR = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtPct = (v) => `${((v || 0) * 100).toFixed(1)}%`;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando desempenho...</div>;
  if (!stats) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Sem dados de desempenho ainda.</div>;

  const Kpi = ({ label, value, sub, cor = "#1c1917" }) => (
    <div className="card" style={{ flex: "1 1 160px", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: cor, fontFamily: "'Inter', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 3 }}>{sub}</div>}
    </div>
  );

  const nomesDia = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const maxSerie = Math.max(...stats.serie.map(s => s.c), 1);

  return (
    <div className="anim">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600 }}>Status do cardápio</div>
        <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 2 }}>Quantas pessoas viram seu cardápio e quantas viraram pedido</div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi label="Visitas (total)" value={stats.visitasTotal} sub="acessos ao cardápio" cor="#2563eb" />
        <Kpi label="Pedidos (total)" value={stats.pedidosTotal} sub="pedidos recebidos" cor="#15803d" />
        <Kpi label="Conversão" value={fmtPct(stats.conversao)} sub="pedidos ÷ visitas" cor="#F38C24" />
        <Kpi label="Receita (7 dias)" value={fmtR(stats.receita7d)} sub="pedidos não cancelados" cor="#15803d" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Últimos 7 dias</div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14, fontSize: 13, color: "#57534e" }}>
          <span><b style={{ color: "#2563eb" }}>{stats.visitas7d}</b> visitas</span>
          <span><b style={{ color: "#15803d" }}>{stats.pedidos7d}</b> pedidos</span>
          <span>conversão <b style={{ color: "#F38C24" }}>{fmtPct(stats.conversao7d)}</b></span>
        </div>
        {stats.serie.length === 0 ? (
          <div style={{ fontSize: 12, color: "#a8a29e", padding: "12px 0" }}>Ainda sem visitas registradas nos últimos 7 dias.</div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120, paddingTop: 8 }}>
            {stats.serie.map(s => {
              const h = Math.round((s.c / maxSerie) * 100);
              const d = new Date(s.d + "T00:00:00");
              return (
                <div key={s.d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb" }}>{s.c}</div>
                  <div style={{ width: "100%", maxWidth: 40, height: `${Math.max(h, 4)}%`, background: "linear-gradient(180deg, #60a5fa, #2563eb)", borderRadius: "6px 6px 0 0", transition: "height 0.4s ease" }} />
                  <div style={{ fontSize: 10, color: "#a8a29e" }}>{nomesDia[d.getDay()]}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: "#a8a29e" }}>
        💡 As visitas são contadas uma vez por sessão de cada cliente que abre o cardápio público.
      </div>

      {/* ── Ranking de vendas ── */}
      {ranking && ranking.produtos && ranking.produtos.length > 0 && (() => {
        const cats = ranking.categorias || [];
        const CRITERIOS = [
          { key: "quantidade",   label: "🔥 Mais vendidos",     campo: "quantidade",  desc: false },
          { key: "faturamento",  label: "💰 Maior faturamento", campo: "faturamento", desc: false },
          { key: "margem",       label: "📈 Maior lucro",       campo: "margem",      desc: false },
          { key: "menor_margem", label: "📉 Menor lucro",       campo: "margem",      desc: true },
        ];
        const crit = CRITERIOS.find(c => c.key === criterio) || CRITERIOS[0];
        const filtrados = catSel === "__todas__" ? ranking.produtos : ranking.produtos.filter(p => p.categoria === catSel);
        const lista = filtrados.slice().sort((a, b) => crit.desc
          ? (Number(a[crit.campo]) || 0) - (Number(b[crit.campo]) || 0)
          : (Number(b[crit.campo]) || 0) - (Number(a[crit.campo]) || 0));
        const maxVal = Math.max(...lista.map(p => Math.abs(Number(p[crit.campo]) || 0)), 1);
        const totalUnidades = filtrados.reduce((s, p) => s + (Number(p.quantidade) || 0), 0);
        const ehDinheiro = crit.campo !== "quantidade";
        const Linha = ({ p, pos, cor }) => (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #f5f5f4" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#a8a29e", minWidth: 24 }}>{pos}º</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1c1917", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome}</div>
              {catSel === "__todas__" && <div style={{ fontSize: 10, color: "#a8a29e" }}>{p.categoria}</div>}
              <div style={{ height: 5, background: "#f5f5f4", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                <div style={{ width: `${Math.max(4, (Math.abs(Number(p[crit.campo]) || 0) / maxVal) * 100)}%`, height: "100%", background: cor, borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: (crit.campo === "margem" && p.margem < 0) ? "#dc2626" : "#1c1917" }}>
                {ehDinheiro ? fmtR(p[crit.campo]) : p.quantidade}
              </div>
              <div style={{ fontSize: 10, color: "#a8a29e" }}>
                {ehDinheiro ? `${p.quantidade} un` : fmtR(p.faturamento)}
              </div>
            </div>
          </div>
        );
        return (
          <div style={{ marginTop: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700 }}>Ranking de vendas</div>
                <div style={{ fontSize: 12, color: "#a8a29e" }}>{totalUnidades} unidades vendidas · {filtrados.length} produto(s)</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={criterio} onChange={e => setCriterio(e.target.value)} style={{ ...cfgInp, cursor: "pointer", minWidth: 170 }}>
                  {CRITERIOS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select value={catSel} onChange={e => setCatSel(e.target.value)} style={{ ...cfgInp, cursor: "pointer", minWidth: 180 }}>
                  <option value="__todas__">Todas as categorias</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#15803d" }}>{crit.label}</div>
                {lista.slice(0, 8).map((p, i) => <Linha key={p.produto_id || p.nome} p={p} pos={i + 1} cor={crit.desc ? "#d97706" : "#15803d"} />)}
              </div>
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#d97706" }}>🐢 Fim do ranking</div>
                {lista.length <= 1 ? <div style={{ fontSize: 12, color: "#a8a29e" }}>Poucos dados ainda.</div>
                  : lista.slice().reverse().slice(0, 5).map((p, k) => <Linha key={p.produto_id || p.nome} p={p} pos={lista.length - k} cor="#d97706" />)}
              </div>
            </div>
            {ranking.adicionais && ranking.adicionais.length > 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#2563eb" }}>➕ Adicionais mais pedidos</div>
                {ranking.adicionais.slice().sort((a, b) => (b.quantidade || 0) - (a.quantidade || 0)).slice(0, 6).map((a, i) => (
                  <div key={a.nome} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #f5f5f4" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#a8a29e", minWidth: 24 }}>{i + 1}º</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1c1917" }}>{a.nome}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#1c1917" }}>{a.quantidade}</span>
                    <span style={{ fontSize: 10, color: "#a8a29e", minWidth: 72, textAlign: "right" }}>{fmtR(a.faturamento)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── CARDÁPIOS (multi-menu) ──────────────────────────────────────────────────
function CardapiosTab({ onChange }) {
  const [cardapios, setCardapios] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [adicionais, setAdicionais] = useState([]);
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState("snack_bar");
  const [editando, setEditando] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  const carregar = async () => {
    try {
      const [c, cats, ads] = await Promise.all([
        api.cardapios.listar(),
        api.categorias.listar(),
        api.adicionais.listar(),
      ]);
      setCardapios(c);
      setCategorias(cats);
      setAdicionais(ads || []);
    } catch (e) { showToast("Erro ao carregar", "#dc2626"); }
    finally { setLoading(false); }
  };
  useEffect(() => { carregar(); }, []);

  const criar = async () => {
    if (!novoNome.trim()) return showToast("Digite o nome do cardápio", "#dc2626");
    try {
      const seg = infoSegmento(novoTipo);
      await api.cardapios.criar({ nome: novoNome.trim(), icone: seg.icone, cor: "#15803d", tipo: novoTipo });
      setNovoNome(""); setNovoTipo("snack_bar");
      await carregar();
      onChange?.();
      showToast(`Cardápio de ${seg.nome} criado!`);
    } catch (e) { showToast(e.message, "#dc2626"); }
  };

  const excluir = async (id) => {
    if (!confirm("Excluir este cardápio?")) return;
    try { await api.cardapios.excluir(id); await carregar(); onChange?.(); showToast("Excluído"); }
    catch (e) { showToast(e.message, "#dc2626"); }
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    try {
      await api.cardapios.atualizar(editando.id, {
        nome: editando.nome, icone: editando.icone, cor: editando.cor, ativo: editando.ativo,
        imagem: editando.imagem, tipo: editando.tipo || "snack_bar", config: editando.configObj || {},
      });
      await api.cardapios.definirCategorias(editando.id, editando.categorias);
      await api.cardapios.definirAdicionais(editando.id, editando.adicionais || []);
      setEditando(null);
      await carregar();
      onChange?.();
      showToast("Salvo!");
    } catch (e) { showToast(e.message, "#dc2626"); }
  };

  // Config do segmento no editor (bordas, regra de preço, inclusos…)
  const setCfg = (patch) => setEditando(prev => ({ ...prev, configObj: { ...(prev.configObj || {}), ...patch } }));

  const toggleCat = (catId) => {
    if (!editando) return;
    setEditando(prev => ({
      ...prev,
      categorias: prev.categorias.includes(catId)
        ? prev.categorias.filter(c => c !== catId)
        : [...prev.categorias, catId],
    }));
  };

  const toggleAdicional = (adId) => {
    if (!editando) return;
    setEditando(prev => ({
      ...prev,
      adicionais: (prev.adicionais || []).includes(adId)
        ? (prev.adicionais || []).filter(a => a !== adId)
        : [...(prev.adicionais || []), adId],
    }));
  };

  // Upload de imagem (para tela de seleção de cardápio quando >= 2)
  const escolherImagem = (e) => {
    const f = e.target.files?.[0];
    if (!f || !editando) return;
    if (f.size > 400 * 1024) return showToast("Imagem > 400KB. Reduza a foto.", "#dc2626");
    const reader = new FileReader();
    reader.onload = () => setEditando(prev => ({ ...prev, imagem: String(reader.result) }));
    reader.readAsDataURL(f);
  };

  const ICONES = ["📋", "🍔", "🍕", "🍣", "🥗", "☕", "🍺", "🌙", "☀️", "🎉", "🏖️", "🛵"];

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#78716c" }}>Carregando...</div>;

  return (
    <div className="card anim">
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 18, fontFamily: "'Inter', sans-serif" }}>Cardápios</h3>
      <p style={{ fontSize: 12, color: "#78716c", marginBottom: 18, lineHeight: 1.5 }}>
        Crie um cardápio para cada segmento do seu negócio (ex: Pizzaria, Açaiteria, Lanches).
        O <b>tipo do cardápio</b> define os recursos do cadastro de produto e da montagem do pedido —
        pizzaria ganha tamanhos, meio a meio e bordas; açaí ganha complementos inclusos; e assim por diante.
      </p>

      {/* Criar novo: nome + tipo de segmento */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <input style={{ ...cfgInp, flex: "1 1 220px" }} value={novoNome} onChange={e => setNovoNome(e.target.value)}
            placeholder="Nome do cardápio (ex: Pizzas da Casa)" onKeyDown={e => e.key === "Enter" && criar()} />
          <button style={cfgBtn} onClick={criar}>+ Criar cardápio</button>
        </div>
        <div style={{ fontSize: 11, color: "#78716c", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
          Tipo do cardápio
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
          {TIPOS_CARDAPIO.map(t => {
            const seg = SEGMENTOS[t];
            const sel = novoTipo === t;
            return (
              <button key={t} onClick={() => setNovoTipo(t)}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 10, textAlign: "left",
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  border: `1.5px solid ${sel ? "#15803d" : "#e7e5e4"}`,
                  background: sel ? "#f0fdf4" : "#fff" }}>
                <span style={{ fontSize: 20 }}>{seg.icone}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: sel ? "#15803d" : "#1c1917" }}>{seg.nome}</span>
                  <span style={{ display: "block", fontSize: 10, color: "#a8a29e", lineHeight: 1.35 }}>{seg.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {cardapios.length === 0 && (
        <div style={{ textAlign: "center", padding: 24, color: "#a8a29e", fontSize: 13 }}>
          Nenhum cardápio criado. Todas as categorias aparecem juntas no menu online.
        </div>
      )}

      {/* Lista */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cardapios.map(c => (
          <div key={c.id} style={{ background: "#fafaf9", border: "1.5px solid #e7e5e4", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>{c.icone}</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1c1917" }}>{c.nome}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "#eff6ff", color: "#2563eb" }}>
                      {infoSegmento(c.tipo).icone} {infoSegmento(c.tipo).nome}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#78716c" }}>
                    {c.categorias.length} categoria{c.categorias.length !== 1 ? "s" : ""}
                    {!c.ativo && <span style={{ color: "#dc2626", marginLeft: 8, fontWeight: 600 }}>INATIVO</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="icon-btn" onClick={() => setEditando({ ...c, categorias: [...(c.categorias || [])], adicionais: [...(c.adicionais || [])], configObj: parseConfig(c.config) })} title="Editar">✏️</button>
                <button className="icon-btn del" onClick={() => excluir(c.id)} title="Excluir">🗑️</button>
              </div>
            </div>

            {/* Inline editor */}
            {editando?.id === c.id && (
              <div style={{ marginTop: 14, padding: "14px 16px", background: "#fff", borderRadius: 10, border: "1px solid #e7e5e4" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                  <input style={{ ...cfgInp, flex: "1 1 160px" }} value={editando.nome} onChange={e => setEditando(p => ({ ...p, nome: e.target.value }))} />
                  <select style={{ ...cfgInp, width: 60 }} value={editando.icone} onChange={e => setEditando(p => ({ ...p, icone: e.target.value }))}>
                    {ICONES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                  <input type="color" value={editando.cor} onChange={e => setEditando(p => ({ ...p, cor: e.target.value }))} style={{ width: 36, height: 36, border: "1.5px solid #e7e5e4", borderRadius: 8, cursor: "pointer", padding: 2 }} />
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!editando.ativo} onChange={e => setEditando(p => ({ ...p, ativo: e.target.checked ? 1 : 0 }))} /> Ativo
                  </label>
                </div>

                {/* Tipo do cardápio (segmento) */}
                <div style={{ fontSize: 12, fontWeight: 600, color: "#57534e", marginBottom: 8 }}>Tipo do cardápio:</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                  <select style={{ ...cfgInp, minWidth: 220, cursor: "pointer" }} value={editando.tipo || "snack_bar"}
                    onChange={e => setEditando(p => ({ ...p, tipo: e.target.value }))}>
                    {TIPOS_CARDAPIO.map(t => <option key={t} value={t}>{SEGMENTOS[t].icone} {SEGMENTOS[t].nome}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: "#a8a29e" }}>{infoSegmento(editando.tipo).desc}</span>
                </div>

                {/* Config específica: PIZZARIA — meio a meio + bordas */}
                {infoSegmento(editando.tipo).recursos.meioAMeio && (
                  <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>🍕 Pizza meio a meio</div>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input type="checkbox" checked={(editando.configObj?.meio_a_meio ?? true) !== false}
                          onChange={e => setCfg({ meio_a_meio: e.target.checked })} />
                        Permitir 2 sabores (metade/metade)
                      </label>
                      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        Preço do meio a meio:
                        <select style={{ ...cfgInp, padding: "5px 8px", fontSize: 12 }} value={editando.configObj?.regra_preco || "maior"}
                          onChange={e => setCfg({ regra_preco: e.target.value })}>
                          <option value="maior">Sabor mais caro</option>
                          <option value="media">Média dos sabores</option>
                        </select>
                      </label>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>Bordas recheadas (opcional)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(editando.configObj?.bordas || []).map((b, i) => (
                        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input style={{ ...cfgInp, flex: 1, padding: "6px 10px", fontSize: 12 }} value={b.nome}
                            onChange={e => setCfg({ bordas: (editando.configObj?.bordas || []).map((x, j) => j === i ? { ...x, nome: e.target.value } : x) })}
                            placeholder="Ex: Borda de catupiry" />
                          <input style={{ ...cfgInp, width: 90, padding: "6px 10px", fontSize: 12 }} type="number" step="0.01" value={b.preco}
                            onChange={e => setCfg({ bordas: (editando.configObj?.bordas || []).map((x, j) => j === i ? { ...x, preco: e.target.value } : x) })}
                            placeholder="R$" />
                          <button onClick={() => setCfg({ bordas: (editando.configObj?.bordas || []).filter((_, j) => j !== i) })}
                            style={{ ...cfgDel, padding: "5px 10px" }}>×</button>
                        </div>
                      ))}
                      <button onClick={() => setCfg({ bordas: [...(editando.configObj?.bordas || []), { nome: "", preco: "" }] })}
                        style={{ ...cfgBtn, background: "#fff", color: "#92400e", border: "1.5px solid #fde68a", padding: "6px 14px", fontSize: 12, alignSelf: "flex-start" }}>
                        + Adicionar borda
                      </button>
                    </div>
                  </div>
                )}

                {/* Config específica: AÇAÍ / SORVETERIA — complementos inclusos */}
                {infoSegmento(editando.tipo).recursos.complementos && (
                  <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#5b21b6", marginBottom: 8 }}>
                      {infoSegmento(editando.tipo).icone} Complementos inclusos
                    </div>
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      O cliente escolhe até
                      <input style={{ ...cfgInp, width: 64, padding: "5px 8px", fontSize: 12, textAlign: "center" }} type="number" min="0" step="1"
                        value={editando.configObj?.inclusos ?? 0}
                        onChange={e => setCfg({ inclusos: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                      complementos grátis (os cadastrados em Adicionais). Acima disso, cobra o preço do adicional. 0 = todos pagos.
                    </label>
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 600, color: "#57534e", marginBottom: 8 }}>Categorias deste cardápio:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {categorias.map(cat => {
                    const sel = editando.categorias.includes(cat.id);
                    return (
                      <button key={cat.id} onClick={() => toggleCat(cat.id)}
                        style={{
                          padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${sel ? editando.cor : "#e7e5e4"}`,
                          background: sel ? editando.cor + "18" : "#fff", color: sel ? editando.cor : "#78716c",
                          fontSize: 12, fontWeight: sel ? 600 : 400, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                        }}>
                        {cat.nome}
                      </button>
                    );
                  })}
                  {categorias.length === 0 && <span style={{ fontSize: 12, color: "#a8a29e" }}>Nenhuma categoria cadastrada — crie na aba "Categorias"</span>}
                </div>

                <div style={{ fontSize: 12, fontWeight: 600, color: "#57534e", marginBottom: 8 }}>Adicionais deste cardápio:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {adicionais.map(ad => {
                    const sel = (editando.adicionais || []).includes(ad.id);
                    return (
                      <button key={ad.id} onClick={() => toggleAdicional(ad.id)}
                        style={{
                          padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${sel ? editando.cor : "#e7e5e4"}`,
                          background: sel ? editando.cor + "18" : "#fff", color: sel ? editando.cor : "#78716c",
                          fontSize: 12, fontWeight: sel ? 600 : 400, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                        }}>
                        {ad.nome}
                      </button>
                    );
                  })}
                  {adicionais.length === 0 && <span style={{ fontSize: 12, color: "#a8a29e" }}>Nenhum adicional cadastrado — crie na aba "Adicionais"</span>}
                </div>

                <div style={{ fontSize: 12, fontWeight: 600, color: "#57534e", marginBottom: 8 }}>Imagem do cardápio (só aparece quando houver mais de um):</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                  {editando.imagem ? (
                    <div style={{ position: "relative" }}>
                      <img src={editando.imagem} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", border: "1.5px solid #e7e5e4" }} />
                      <button type="button" onClick={() => setEditando(p => ({ ...p, imagem: "" }))}
                        style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", background: "#dc2626", color: "#fff", border: "2px solid #fff", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
                    </div>
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: 12, background: "#fafaf9", border: "1.5px dashed #d6d3d1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#a8a29e" }}>📷</div>
                  )}
                  <label style={{ ...cfgBtn, background: "#fff", border: "1.5px solid #e7e5e4", color: "#57534e", cursor: "pointer", margin: 0 }}>
                    {editando.imagem ? "Trocar foto" : "Escolher foto"}
                    <input type="file" accept="image/*" onChange={escolherImagem} style={{ display: "none" }} />
                  </label>
                  <div style={{ fontSize: 11, color: "#a8a29e" }}>Recomendado 400×400px, máx 400KB.</div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button style={cfgBtn} onClick={salvarEdicao}>Salvar</button>
                  <button style={{ ...cfgBtn, background: "#fff", color: "#78716c", border: "1.5px solid #e7e5e4" }} onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {toast && <div className="toast" style={{ background: toast.cor }}>{toast.msg}</div>}
    </div>
  );
}

// Cardápios como raiz do fluxo: o cliente cria um cardápio (Lanches, Pastéis),
// depois cadastra categorias/adicionais/produtos/promoções DENTRO desse cardápio.
const NAV_TABS = [
  { key: "cardapios",  label: "Cardápios",  icon: "\u{1F4CB}" },
  { key: "produtos",   label: "Produtos",   icon: "\u{1F354}" },
  { key: "categorias", label: "Categorias", icon: "\u{1F4C2}" },
  { key: "adicionais", label: "Adicionais", icon: "\u{2795}" },
  { key: "promocoes",  label: "Promoções",  icon: "\u{1F525}" },
  { key: "desempenho", label: "Desempenho", icon: "\u{1F4CA}" },
];

// Abas que precisam de um cardápio selecionado (as demais são globais)
const ABAS_POR_CARDAPIO = new Set(["produtos", "categorias", "adicionais", "promocoes"]);

export default function ProdutosApp({ onNavegar }) {
  const [aba, setAba] = useState("cardapios");
  const [cardapios, setCardapios] = useState([]);
  const [cardapioAtivo, setCardapioAtivo] = useState(() => localStorage.getItem("nl_cardapio_ativo") || "");

  // Carrega cardápios pra o seletor; se não há ativo salvo, escolhe o primeiro.
  useEffect(() => {
    api.cardapios.listar().then(cs => {
      setCardapios(cs);
      if (!cardapioAtivo && cs.length > 0) {
        setCardapioAtivo(cs[0].id);
        localStorage.setItem("nl_cardapio_ativo", cs[0].id);
      }
      // Cardápio salvo não existe mais? Reseta.
      if (cardapioAtivo && !cs.find(c => c.id === cardapioAtivo)) {
        const novo = cs[0]?.id || "";
        setCardapioAtivo(novo);
        if (novo) localStorage.setItem("nl_cardapio_ativo", novo); else localStorage.removeItem("nl_cardapio_ativo");
      }
    }).catch(() => {});
  }, []);

  const trocarCardapio = (id) => {
    setCardapioAtivo(id);
    if (id) localStorage.setItem("nl_cardapio_ativo", id);
    else localStorage.removeItem("nl_cardapio_ativo");
  };

  // Callback pra sub-abas avisarem que criaram/deletaram cardápio → recarrega
  const recarregarCardapios = async () => {
    try { setCardapios(await api.cardapios.listar()); } catch {}
  };

  const cardapioAtual = cardapios.find(c => c.id === cardapioAtivo);
  const precisaCardapio = ABAS_POR_CARDAPIO.has(aba);

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f5f5f4", minHeight: "100vh", color: "#1c1917" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=Fraunces:ital,wght@0,300;0,500;0,600;1,300&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #d6d3d1; border-radius: 2px; }
        .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 20px 22px; }
        .btn-add { display: flex; align-items: center; gap: 8px; background: #15803d; color: #fff; border: none; border-radius: 9px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: background 0.2s; }
        .btn-add:hover { background: #166534; }
        .icon-btn { background: none; border: 1px solid #e7e5e4; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px; color: #78716c; transition: all 0.15s; }
        .icon-btn:hover { background: #f5f5f4; color: #1c1917; }
        .icon-btn.del:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
        .search { padding: 8px 14px; border: 1.5px solid #e7e5e4; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; background: #fff; width: 100%; max-width: 260px; min-width: 0; color: #1c1917; }
        .search:focus { border-color: #15803d88; }
        .fil { padding: 7px 12px; border: 1.5px solid #e7e5e4; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 12px; outline: none; color: #57534e; background: #fff; cursor: pointer; }
        .fil.ativo { border-color: #15803d; color: #15803d; background: #f0fdf4; font-weight: 500; }
        .anim { animation: fi 0.25s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 999; animation: fi 0.3s ease; color: #fff; }
        .pa-nav { display: flex; gap: 2px; background: #f5f5f4; border-radius: 10px; padding: 3px; flex-wrap: wrap; }
        .pa-pill { padding: 8px 18px; border-radius: 8px; border: none; background: none; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 13px; color: #78716c; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
        .pa-pill:hover { background: #fff; color: #1c1917; }
        .pa-pill.active { background: #fff; color: #F38C24; font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        @media (max-width: 720px) { .pa-nav { width: 100%; } .pa-pill { flex: 1 1 100px; justify-content: center; } }
      `}</style>

      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e7e5e4", padding: "0 32px", minHeight: 56, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Logo size={32} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: "#1c1917" }}>Produtos e Promoções</span>
        </div>

        <div style={{ width: 1, height: 22, background: "#e7e5e4" }} />

        <div className="pa-nav">
          {NAV_TABS.map(t => (
            <button key={t.key} className={`pa-pill ${aba === t.key ? "active" : ""}`} onClick={() => setAba(t.key)}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
      </header>

      {/* Seletor de cardápio ativo (visível nas abas que filtram por cardápio) */}
      {precisaCardapio && cardapios.length > 0 && (
        <div style={{ background: "#fff", borderBottom: "1px solid #e7e5e4", padding: "10px 32px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#78716c", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Cardápio ativo:</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {cardapios.map(c => (
              <button key={c.id} onClick={() => trocarCardapio(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 999,
                  border: `1.5px solid ${cardapioAtivo === c.id ? c.cor : "#e7e5e4"}`,
                  background: cardapioAtivo === c.id ? (c.cor + "18") : "#fafaf9",
                  color: cardapioAtivo === c.id ? c.cor : "#78716c",
                  fontWeight: cardapioAtivo === c.id ? 700 : 500,
                  fontSize: 12.5, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                }}>
                <span>{c.icone}</span>
                <span>{c.nome}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => setAba("cardapios")}
            style={{ fontSize: 11, color: "#78716c", background: "none", border: "1px solid #e7e5e4", padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            + gerenciar cardápios
          </button>
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>
        {precisaCardapio && cardapios.length === 0 ? (
          <SemCardapios onCriar={() => setAba("cardapios")} />
        ) : (
          <>
            {aba === "cardapios" && <CardapiosTab onChange={recarregarCardapios} />}
            {aba === "produtos" && <Produtos cardapioAtivo={cardapioAtivo} cardapioNome={cardapioAtual?.nome} cardapioTipo={cardapioAtual?.tipo || "snack_bar"} />}
            {aba === "categorias" && <CategoriasTab cardapioAtivo={cardapioAtivo} cardapioNome={cardapioAtual?.nome} />}
            {aba === "adicionais" && <AdicionaisTab cardapioAtivo={cardapioAtivo} cardapioNome={cardapioAtual?.nome} />}
            {aba === "promocoes" && <Promocoes cardapioAtivo={cardapioAtivo} cardapioNome={cardapioAtual?.nome} />}
            {aba === "desempenho" && <DesempenhoTab />}
          </>
        )}
      </div>
    </div>
  );
}

// Placeholder quando o usuário abre uma aba antes de criar qualquer cardápio.
function SemCardapios({ onCriar }) {
  return (
    <div className="card anim" style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Você ainda não tem cardápios</div>
      <div style={{ fontSize: 13, color: "#78716c", marginBottom: 20, maxWidth: 460, margin: "0 auto 20px" }}>
        No Nexus PDV, produtos, categorias, adicionais e promoções vivem dentro de um cardápio. Comece criando o primeiro (ex: "Lanches", "Pastéis", "Bebidas").
      </div>
      <button onClick={onCriar} style={{ background: "#15803d", color: "#fff", border: "none", padding: "11px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
        Criar meu primeiro cardápio →
      </button>
    </div>
  );
}
