import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import ClienteApp from "./ClienteApp";
import FluxoCaixa from "./fluxo-de-caixa";
import Produtos from "./Produtos";
import Pedidos from "./Pedidos";
import Insumos from "./Insumos";
import CustosFixos from "./CustosFixos";
import Estoque from "./Estoque";

const cfgInp = { padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917" };
const cfgBtn = { background: "#F38C24", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" };
const cfgDel = { background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#dc2626" };
const cfgRow = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "10px 14px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f5f5f4" };

const DIAS_SEMANA = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

function AdminConfig() {
  const [emails, setEmails] = useState([]);
  const [novoEmail, setNovoEmail] = useState("");
  const [categorias, setCategorias] = useState([]);
  const [novaCat, setNovaCat] = useState("");
  const [novaCatAdicionais, setNovaCatAdicionais] = useState(false);
  const [adicionais, setAdicionais] = useState([]);
  const [novoAd, setNovoAd] = useState({ nome: "", preco: "", custo: "" });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // Horário de funcionamento
  const [horario, setHorario] = useState({ status: "auto", dias: [0,2,3,4,5,6], abertura: "19:00", fechamento: "01:00" });
  const [horarioAberto, setHorarioAberto] = useState(false);
  const [salvandoHorario, setSalvandoHorario] = useState(false);

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    Promise.all([
      api.adminEmails.listar(),
      api.categorias.listar(),
      api.adicionais.listar(),
      api.horario.obter(),
    ]).then(([em, cats, ads, hor]) => {
      setEmails(em);
      setCategorias(cats);
      setAdicionais(ads);
      const { aberto, ...cfg } = hor;
      setHorario(cfg);
      setHorarioAberto(aberto);
    }).catch(() => showToast("Erro ao carregar", "#dc2626")).finally(() => setLoading(false));
  }, []);

  const salvarHorario = async (novoHorario) => {
    setSalvandoHorario(true);
    try {
      const resultado = await api.horario.salvar(novoHorario);
      const { aberto, ...cfg } = resultado;
      setHorario(cfg);
      setHorarioAberto(aberto);
      showToast("Horário salvo!");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally {
      setSalvandoHorario(false);
    }
  };

  const toggleDia = (dia) => {
    const novosDias = horario.dias.includes(dia)
      ? horario.dias.filter(d => d !== dia)
      : [...horario.dias, dia].sort((a, b) => a - b);
    setHorario(h => ({ ...h, dias: novosDias }));
  };

  // ── Admin Emails ──
  const adicionarEmail = async () => {
    const email = novoEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return showToast("Digite um email valido", "#dc2626");
    if (emails.some(e => e.email === email)) return showToast("Email ja esta na lista", "#d97706");
    try {
      await api.adminEmails.adicionar(email);
      setEmails(es => [...es, { email, created_at: new Date().toISOString() }]);
      setNovoEmail("");
      showToast("Convite admin adicionado!");
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  const removerEmail = async (email) => {
    try {
      await api.adminEmails.remover(email);
      setEmails(es => es.filter(e => e.email !== email));
      showToast("Email removido", "#7c3aed");
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  // ── Categorias ──
  const adicionarCategoria = async () => {
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

  const removerCategoria = async (id) => {
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

  // ── Adicionais ──
  const adicionarAdicional = async () => {
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

  const removerAdicional = async (id) => {
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

  const fmtPreco = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando...</div>;

  return (
    <div className="anim">
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Configuracoes</div>
      <div style={{ fontSize: 12, color: "#a8a29e", marginBottom: 24 }}>Gerencie categorias, adicionais e acessos administrativos</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>

        {/* ── HORÁRIO DE FUNCIONAMENTO ───────────────────────────────── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Horário de Funcionamento</div>
            <span style={{
              background: horarioAberto ? "#dcfce7" : "#fee2e2",
              color: horarioAberto ? "#16a34a" : "#dc2626",
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
            }}>
              {horarioAberto ? "🟢 Aberto agora" : "🔴 Fechado agora"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 18 }}>
            Controle quando a plataforma aceita pedidos e o que o bot responde no WhatsApp.
          </div>

          {/* Status override */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 8 }}>MODO DE OPERAÇÃO</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { value: "auto", label: "⏰ Automático", desc: "Segue os horários abaixo" },
                { value: "aberto", label: "🟢 Forçar aberto", desc: "Sempre aberto" },
                { value: "fechado", label: "🔴 Forçar fechado", desc: "Sempre fechado" },
              ].map(opt => (
                <button key={opt.value} onClick={() => setHorario(h => ({ ...h, status: opt.value }))}
                  title={opt.desc}
                  style={{
                    flex: 1, padding: "9px 8px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                    background: horario.status === opt.value ? "#1c1917" : "#fff",
                    color: horario.status === opt.value ? "#fff" : "#57534e",
                    border: horario.status === opt.value ? "2px solid #1c1917" : "2px solid #e7e5e4",
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dias da semana */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 8 }}>DIAS DE FUNCIONAMENTO</div>
            <div style={{ display: "flex", gap: 6 }}>
              {DIAS_SEMANA.map(d => {
                const ativo = horario.dias.includes(d.value);
                return (
                  <button key={d.value} onClick={() => toggleDia(d.value)}
                    style={{
                      flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                      background: ativo ? "#F38C24" : "#f5f5f4",
                      color: ativo ? "#fff" : "#a8a29e",
                      border: ativo ? "2px solid #F38C24" : "2px solid #e7e5e4",
                    }}>
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horário */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 8 }}>HORÁRIO</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: "#78716c", display: "block", marginBottom: 4 }}>Abre às</label>
                <input type="time" value={horario.abertura}
                  onChange={e => setHorario(h => ({ ...h, abertura: e.target.value }))}
                  style={{ ...cfgInp, width: "100%" }} />
              </div>
              <div style={{ fontSize: 18, color: "#a8a29e", paddingTop: 18 }}>→</div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: "#78716c", display: "block", marginBottom: 4 }}>Fecha às</label>
                <input type="time" value={horario.fechamento}
                  onChange={e => setHorario(h => ({ ...h, fechamento: e.target.value }))}
                  style={{ ...cfgInp, width: "100%" }} />
              </div>
            </div>
            {horario.abertura > horario.fechamento || horario.fechamento < horario.abertura ? (
              <div style={{ fontSize: 11, color: "#78716c", marginTop: 6, fontStyle: "italic" }}>
                ℹ️ Horário atravessa a meia-noite (ex: 19:00 às 01:00)
              </div>
            ) : null}
          </div>

          <button onClick={() => salvarHorario(horario)} disabled={salvandoHorario}
            style={{ ...cfgBtn, width: "100%", padding: 11, opacity: salvandoHorario ? 0.6 : 1 }}>
            {salvandoHorario ? "Salvando..." : "💾 Salvar configuração"}
          </button>
        </div>

        {/* ── CATEGORIAS ─────────────────────────────────────────────── */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Categorias de Produtos</div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
            Categorias disponiveis para classificar os produtos. Marque "Permite adicionais" para categorias como Lanches.
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
            <input value={novaCat} onChange={e => setNovaCat(e.target.value)} onKeyDown={e => e.key === "Enter" && adicionarCategoria()}
              placeholder="Nova categoria" style={{ ...cfgInp, flex: 1 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#78716c", whiteSpace: "nowrap", cursor: "pointer" }}>
              <input type="checkbox" checked={novaCatAdicionais} onChange={e => setNovaCatAdicionais(e.target.checked)} style={{ accentColor: "#15803d" }} />
              Adicionais
            </label>
            <button onClick={adicionarCategoria} style={cfgBtn}>+ Criar</button>
          </div>

          {categorias.length === 0 ? (
            <div style={{ textAlign: "center", padding: 16, color: "#a8a29e", fontSize: 13 }}>Nenhuma categoria.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {categorias.map(c => (
                <div key={c.id} style={cfgRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{c.nome}</span>
                    {c.permite_adicionais ? (
                      <span style={{ background: "#f0fdf4", color: "#15803d", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4 }}>Adicionais</span>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button onClick={() => toggleAdicionais(c)}
                      style={{ background: "none", border: "1px solid #e7e5e4", borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
                      {c.permite_adicionais ? "Desativar adicionais" : "Ativar adicionais"}
                    </button>
                    <button onClick={() => removerCategoria(c.id)} style={cfgDel}>Remover</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── ADICIONAIS ─────────────────────────────────────────────── */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Adicionais (Acompanhamentos)</div>
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
            <button onClick={adicionarAdicional} style={cfgBtn}>+ Criar</button>
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
                    <button onClick={() => removerAdicional(a.id)} style={cfgDel}>Remover</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── ADMIN EMAILS ───────────────────────────────────────────── */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Convite de Administradores</div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
            Adicione emails que terao acesso admin ao se registrarem.
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input value={novoEmail} onChange={e => setNovoEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && adicionarEmail()}
              placeholder="email@exemplo.com" style={{ ...cfgInp, flex: 1, minWidth: 0 }} />
            <button onClick={adicionarEmail} style={cfgBtn}>+ Convidar</button>
          </div>

          {emails.length === 0 ? (
            <div style={{ textAlign: "center", padding: 16, color: "#a8a29e", fontSize: 13 }}>Nenhum email admin cadastrado.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {emails.map(e => (
                <div key={e.email} style={cfgRow}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{e.email}</span>
                    <span style={{ fontSize: 10, color: "#a8a29e", marginLeft: 8 }}>
                      adicionado em {new Date(e.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <button onClick={() => removerEmail(e.email)} style={cfgDel}>Remover</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}

export default function App() {
  const isAdminRoute = window.location.pathname.startsWith('/admin');

  const [usuario, setUsuario] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState("pedidos");
  const [pendentesCount, setPendentesCount] = useState(0);

  // Admin login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");
  const [loginErro, setLoginErro] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Restaurar sessão admin do localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("usuario");
    if (savedToken && savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user.tipo === "admin") {
          setToken(savedToken);
          setUsuario(user);
        } else {
          localStorage.removeItem("token");
          localStorage.removeItem("usuario");
        }
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
      }
    }
    setLoading(false);
  }, []);

  // Polling de pedidos pendentes (admin)
  useEffect(() => {
    if (!usuario || usuario.tipo !== "admin") return;
    const checkPendentes = async () => {
      try {
        const { count } = await api.pedidos.contarPendentes();
        setPendentesCount(count);
      } catch { /* ignore */ }
    };
    checkPendentes();
    const interval = setInterval(checkPendentes, 10000);
    return () => clearInterval(interval);
  }, [usuario]);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoginErro("");
    setLoginLoading(true);
    try {
      const result = await api.login({ email: loginEmail, senha: loginSenha });
      if (result.usuario.tipo !== "admin") {
        setLoginErro("Acesso restrito a administradores");
        setLoginLoading(false);
        return;
      }
      localStorage.setItem("token", result.token);
      localStorage.setItem("usuario", JSON.stringify(result.usuario));
      setToken(result.token);
      setUsuario(result.usuario);
    } catch (err) {
      setLoginErro(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    setUsuario(null);
    setToken(null);
  };

  if (loading) return null;

  // ─── ROTA PÚBLICA: Cardápio do cliente ───────────────────────────────────
  if (!isAdminRoute) {
    return <ClienteApp />;
  }

  // ─── ROTA /admin: Login do admin ─────────────────────────────────────────
  if (!usuario || usuario.tipo !== "admin") {
    const lblStyle = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };
    const inpStyle = { width: "100%", padding: "10px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif", color: "#1c1917" };
    return (
      <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f5f5f4", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
        `}</style>
        <div style={{ background: "#fff", borderRadius: 16, padding: "40px 36px", width: 400, maxWidth: "92vw", boxShadow: "0 8px 30px rgba(0,0,0,0.08)" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <img src="/logo.png" alt="NeuzaLanches" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", marginBottom: 12 }} />
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700 }}>Painel Admin</div>
            <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 4 }}>Acesse com suas credenciais</div>
          </div>
          <form onSubmit={handleAdminLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={lblStyle}>EMAIL</label>
              <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} type="email" required placeholder="admin@email.com" style={inpStyle} />
            </div>
            <div>
              <label style={lblStyle}>SENHA</label>
              <input value={loginSenha} onChange={e => setLoginSenha(e.target.value)} type="password" required placeholder="••••••••" minLength={4} style={inpStyle} />
            </div>
            {loginErro && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#dc2626" }}>{loginErro}</div>
            )}
            <button type="submit" disabled={loginLoading}
              style={{ padding: 12, background: "#15803d", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loginLoading ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", opacity: loginLoading ? 0.7 : 1, marginTop: 4 }}>
              {loginLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── ROTA /admin: Painel admin (logado) ──────────────────────────────────
  const adminNav = [
    { key: "pedidos", label: "Pedidos", badge: pendentesCount },
    { key: "produtos", label: "Produtos" },
    { key: "insumos", label: "Insumos" },
    { key: "estoque", label: "Estoque" },
    { key: "financeiro", label: "Financeiro" },
    { key: "config", label: "Configurações" },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f5f5f4", minHeight: "100vh", color: "#1c1917" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Fraunces:ital,wght@0,300;0,500;0,600;1,300&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #d6d3d1; border-radius: 2px; }
        .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 20px 22px; }
        .nav-pill { padding: 7px 18px; border-radius: 8px; border: none; background: none; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 13px; color: #78716c; transition: all 0.15s; position: relative; }
        .nav-pill:hover { background: #f5f5f4; color: #1c1917; }
        .nav-pill.active { background: #fff; color: #15803d; font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        .header-nav { display: flex; gap: 2px; background: #f5f5f4; border-radius: 10px; padding: 3px; flex-wrap: wrap; }
        .app-header { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; min-height: 56px; }
        @media (max-width: 720px) {
          .app-header { padding: 8px 16px; gap: 12px; }
          .header-nav { width: 100%; }
          .nav-pill { flex: 1 1 120px; min-width: 120px; }
          .header-user { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
          .logout-btn { flex: 0 0 auto; }
        }
        .fil { padding: 7px 12px; border: 1.5px solid #e7e5e4; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 12px; outline: none; color: #57534e; background: #fff; cursor: pointer; }
        .fil.ativo { border-color: #15803d; color: #15803d; background: #f0fdf4; font-weight: 500; }
        .btn-add { display: flex; align-items: center; gap: 8px; background: #15803d; color: #fff; border: none; border-radius: 9px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: background 0.2s; }
        .btn-add:hover { background: #166534; }
        .icon-btn { background: none; border: 1px solid #e7e5e4; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px; color: #78716c; transition: all 0.15s; }
        .icon-btn:hover { background: #f5f5f4; color: #1c1917; }
        .icon-btn.del:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
        .search { padding: 8px 14px; border: 1.5px solid #e7e5e4; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; background: #fff; width: 100%; max-width: 260px; min-width: 0; color: #1c1917; }
        .search:focus { border-color: #15803d88; }
        .anim { animation: fi 0.25s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .metric { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 18px 20px; }
        .saldo-card { background: linear-gradient(135deg, #15803d 0%, #166534 100%); border-radius: 14px; padding: 22px 24px; color: #fff; }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 999; animation: fi 0.3s ease; color: #fff; }
        .mes-sel { padding: 8px 14px; border: 1.5px solid #e7e5e4; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; color: #1c1917; background: #fff; cursor: pointer; }
        .saldo-edit-btn { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 6px; padding: 3px 10px; cursor: pointer; font-size: 11px; color: rgba(255,255,255,0.8); font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .saldo-edit-btn:hover { background: rgba(255,255,255,0.25); color: #fff; }
      `}</style>

      {/* Header Admin */}
      <header className="app-header" style={{ background: "#fff", borderBottom: "1px solid #e7e5e4", padding: "0 32px", height: "auto", minHeight: 56, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src="/logo.png" alt="Logo" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600 }}>Painel Admin</span>
        </div>

        <div style={{ width: 1, height: 22, background: "#e7e5e4" }} />

        {/* Nav admin */}
        <div className="header-nav" style={{ display: "flex", gap: 2, background: "#f5f5f4", borderRadius: 10, padding: 3, flexWrap: "wrap", flex: "1 1 auto", minWidth: 0 }}>
          {adminNav.map(n => (
            <button key={n.key} className={`nav-pill ${adminTab === n.key ? "active" : ""}`} onClick={() => setAdminTab(n.key)}>
              {n.label}
              {n.badge > 0 && (
                <span style={{ position: "absolute", top: -4, right: -4, background: "#dc2626", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: "center" }}>
                  {n.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }} />

        <div className="header-user" style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 12, color: "#78716c" }}>
            {usuario.nome} <span style={{ background: "#f0fdf4", color: "#15803d", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, marginLeft: 4 }}>ADMIN</span>
          </div>
          <button className="logout-btn" onClick={handleLogout} style={{ padding: "6px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
            Sair
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>
        {adminTab === "pedidos" && <Pedidos />}
        {adminTab === "produtos" && <Produtos />}
        {adminTab === "insumos" && <Insumos />}
        {adminTab === "estoque" && <Estoque />}
        {adminTab === "financeiro" && <FluxoCaixa />}
        {adminTab === "config" && <AdminConfig />}
      </div>
    </div>
  );
}
