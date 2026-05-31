import { useState, useEffect } from "react";
import { api } from "./api";
import Produtos from "./Produtos";
import Promocoes from "./Promocoes";

const cfgInp = { padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917" };
const cfgBtn = { background: "#F38C24", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" };
const cfgDel = { background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#dc2626" };
const cfgRow = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "10px 14px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f5f5f4" };

// ─── CATEGORIAS ──────────────────────────────────────────────────────────────
function CategoriasTab() {
  const [categorias, setCategorias] = useState([]);
  const [novaCat, setNovaCat] = useState("");
  const [novaCatAdicionais, setNovaCatAdicionais] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    api.categorias.listar().then(setCategorias).catch(() => showToast("Erro ao carregar", "#dc2626")).finally(() => setLoading(false));
  }, []);

  const adicionar = async () => {
    const nome = novaCat.trim();
    if (!nome) return showToast("Digite o nome da categoria", "#dc2626");
    try {
      const nova = await api.categorias.criar({ nome, permite_adicionais: novaCatAdicionais });
      setCategorias(cs => [...cs, nova]);
      setNovaCat("");
      setNovaCatAdicionais(false);
      showToast("Categoria criada!");
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
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600 }}>Categorias de Produtos</div>
      </div>
      <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 2, marginBottom: 20 }}>{categorias.length} categorias cadastradas</div>

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
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
function AdicionaisTab() {
  const [adicionais, setAdicionais] = useState([]);
  const [novoAd, setNovoAd] = useState({ nome: "", preco: "", custo: "" });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };
  const fmtPreco = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  useEffect(() => {
    api.adicionais.listar().then(setAdicionais).catch(() => showToast("Erro ao carregar", "#dc2626")).finally(() => setLoading(false));
  }, []);

  const adicionar = async () => {
    const nome = novoAd.nome.trim();
    const preco = parseFloat(novoAd.preco);
    const custo = parseFloat(novoAd.custo) || 0;
    if (!nome || isNaN(preco) || preco < 0) return showToast("Preencha nome e preco valido", "#dc2626");
    try {
      const novo = await api.adicionais.criar({ nome, preco, custo, disponivel: true });
      setAdicionais(ads => [...ads, novo]);
      setNovoAd({ nome: "", preco: "", custo: "" });
      showToast("Adicional criado!");
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
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600 }}>Adicionais (Acompanhamentos)</div>
      </div>
      <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 2, marginBottom: 20 }}>{adicionais.length} adicionais cadastrados</div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
          Itens extras que o cliente pode adicionar aos produtos de categorias com adicionais habilitados. Ex: Cheddar, Bacon, Ovo.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <input value={novoAd.nome} onChange={e => setNovoAd({ ...novoAd, nome: e.target.value })}
            placeholder="Nome do adicional" style={{ ...cfgInp, flex: 1, minWidth: 0 }} />
          <input value={novoAd.preco} onChange={e => setNovoAd({ ...novoAd, preco: e.target.value })}
            placeholder="Preco venda" type="number" step="0.01" style={{ ...cfgInp, width: 110, minWidth: 110 }} />
          <input value={novoAd.custo} onChange={e => setNovoAd({ ...novoAd, custo: e.target.value })}
            placeholder="Custo (CMV)" type="number" step="0.01" style={{ ...cfgInp, width: 110, minWidth: 110 }} />
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.cardapio.stats().then(setStats).catch(() => {}).finally(() => setLoading(false));
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
    </div>
  );
}

const NAV_TABS = [
  { key: "produtos", label: "Produtos", icon: "\u{1F354}" },
  { key: "promocoes", label: "Promoções", icon: "\u{1F525}" },
  { key: "categorias", label: "Categorias", icon: "\u{1F4C2}" },
  { key: "adicionais", label: "Adicionais", icon: "\u{2795}" },
  { key: "desempenho", label: "Desempenho", icon: "\u{1F4CA}" },
];

export default function ProdutosApp({ onNavegar }) {
  const [aba, setAba] = useState("produtos");

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
        <button onClick={() => onNavegar(null)} style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <img src="/logo.png" alt="Logo" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
            onError={e => { e.currentTarget.style.display = "none"; }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: "#1c1917" }}>Produtos e Promoções</span>
        </button>

        <div style={{ width: 1, height: 22, background: "#e7e5e4" }} />

        <div className="pa-nav">
          {NAV_TABS.map(t => (
            <button key={t.key} className={`pa-pill ${aba === t.key ? "active" : ""}`} onClick={() => setAba(t.key)}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={() => onNavegar(null)} style={{ padding: "6px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
          {"←"} Início
        </button>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>
        {aba === "produtos" && <Produtos />}
        {aba === "promocoes" && <Promocoes />}
        {aba === "categorias" && <CategoriasTab />}
        {aba === "adicionais" && <AdicionaisTab />}
        {aba === "desempenho" && <DesempenhoTab />}
      </div>
    </div>
  );
}
