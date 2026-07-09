import { useState, useEffect } from "react";
import { api } from "./api";
import ClienteApp from "./ClienteApp";
import SetupWizard from "./SetupWizard";

import FrenteCaixa from "./FrenteCaixa";
import CozinhaApp from "./CozinhaApp";
import ProdutosApp from "./ProdutosApp";
import EstoqueApp from "./EstoqueApp";
import FinanceiroApp from "./FinanceiroApp";
import ConfigApp from "./ConfigApp";
import PedidosOnlineApp from "./PedidosOnlineApp";
import MesaApp from "./MesaApp";

const SENHA_MANUTENCAO = "31076hibridos";

// ─── T5: Onboarding em 4 passos (primeiro acesso) ────────────────────────────
function OnboardingCard({ onNavegar, produtosTem, steps, onStep, onDismiss }) {
  const PASSOS = [
    { key: "produtos", icon: "🍔", setor: "produtos", titulo: "Monte seu cardápio", desc: "Cadastre produtos, categorias e adicionais", auto: produtosTem },
    { key: "horario",  icon: "🕕", setor: "config",   titulo: "Configure o horário", desc: "Dias e horas de funcionamento da loja" },
    { key: "qr",       icon: "🪑", setor: "caixa",    titulo: "Imprima os QR Codes", desc: "Um por mesa, para o cliente pedir sozinho" },
    { key: "cozinha",  icon: "🔥", setor: "cozinha",  titulo: "Abra a Cozinha", desc: "Acompanhe os pedidos chegando em tempo real" },
  ];
  const isDone = (p) => p.auto || !!steps[p.key];
  const concluidos = PASSOS.filter(isDone).length;
  const pct = Math.round((concluidos / PASSOS.length) * 100);

  return (
    <div style={{ background: "#fff", border: "2px solid #15803d", borderRadius: 18, padding: "22px 24px", maxWidth: 620, width: "100%", margin: "0 auto 28px", textAlign: "left", boxShadow: "0 8px 30px rgba(21,128,61,0.10)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 800, color: "#1c1917" }}>👋 Bem-vindo! Vamos configurar em 4 passos</div>
          <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>Leva uns minutinhos. Você pode voltar aqui quando quiser.</div>
        </div>
        <button onClick={onDismiss} title="Dispensar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#a8a29e", lineHeight: 1, padding: 4 }}>×</button>
      </div>

      {/* Barra de progresso */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 16px" }}>
        <div style={{ flex: 1, height: 7, background: "#f0fdf4", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#15803d", borderRadius: 4, transition: "width 0.4s ease" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#15803d", whiteSpace: "nowrap" }}>{concluidos}/{PASSOS.length}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PASSOS.map((p, i) => {
          const done = isDone(p);
          return (
            <div key={p.key} onClick={() => { onStep(p.key); onNavegar(p.setor); }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, cursor: "pointer",
                background: done ? "#f0fdf4" : "#fafaf9", border: `1.5px solid ${done ? "#bbf7d0" : "#e7e5e4"}`, transition: "all 0.15s" }}
              onMouseEnter={e => { if (!done) e.currentTarget.style.background = "#f5f5f4"; }}
              onMouseLeave={e => { if (!done) e.currentTarget.style.background = "#fafaf9"; }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                background: done ? "#15803d" : "#fff", border: done ? "none" : "1.5px solid #e7e5e4", color: "#fff" }}>
                {done ? "✓" : p.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: done ? "#15803d" : "#1c1917", textDecoration: done ? "line-through" : "none" }}>
                  {i + 1}. {p.titulo}
                </div>
                <div style={{ fontSize: 12, color: "#78716c" }}>{p.desc}</div>
              </div>
              <span style={{ fontSize: 13, color: done ? "#15803d" : "#a8a29e", fontWeight: 600, whiteSpace: "nowrap" }}>
                {done ? "Feito" : "Abrir →"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Build desktop (PDV): sem cardápio/mesa (partes online). Só o sistema administrativo.
const IS_DESKTOP = import.meta.env.VITE_DESKTOP === "1";
// Build online (cardápio digital): cliente + bot; admin reduzido a Configurações
// (horário, foto, nome e conexão com o PDV). O resto da gestão vive no PDV.
const IS_ONLINE = import.meta.env.VITE_ONLINE === "1";
// Setores que cada build oferece no hub admin.
const SETORES_BUILD = IS_ONLINE ? ["pedidos", "config"] : ["produtos", "cozinha", "caixa", "estoque", "financeiro", "config"];

export default function App() {
  const _base = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  const _path = window.location.pathname.startsWith(_base)
    ? window.location.pathname.slice(_base.length) || "/"
    : window.location.pathname;

  // /mesa/:numero — cardápio público para QR code (sem login). Fora do desktop.
  const mesaMatch = _path.match(/^\/mesa\/(\d+)/);
  if (mesaMatch && !IS_DESKTOP) {
    return <MesaApp mesaNumero={parseInt(mesaMatch[1], 10)} />;
  }

  const isCaixaRoute = _path.startsWith('/caixa');
  // No desktop, TUDO é rota admin — o cardápio do cliente não existe aqui.
  const isAdminRoute = IS_DESKTOP || _path.startsWith('/admin') || isCaixaRoute;

  // /caixa agora redireciona para /admin (login unificado)
  if (isCaixaRoute) {
    window.history.replaceState(null, "", `${_base}/admin`);
  }

  const [usuario, setUsuario] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setor, setSetor] = useState(() => localStorage.getItem("nl_setor") || null); // null = hub; restaura último setor
  const [pendentesCount, setPendentesCount] = useState(0);

  // T5 — onboarding (primeiro acesso)
  const [onbDismissed, setOnbDismissed] = useState(() => localStorage.getItem("nl_onb_done") === "1");
  const [onbSteps, setOnbSteps] = useState(() => { try { return JSON.parse(localStorage.getItem("nl_onb_steps") || "{}"); } catch { return {}; } });
  const [produtosTem, setProdutosTem] = useState(false);
  const marcarPasso = (key) => {
    setOnbSteps(prev => { const nx = { ...prev, [key]: true }; localStorage.setItem("nl_onb_steps", JSON.stringify(nx)); return nx; });
  };
  const dispensarOnb = () => { localStorage.setItem("nl_onb_done", "1"); setOnbDismissed(true); };

  // Perfil do estabelecimento (modo mesas/balcão, módulos habilitados)
  const [perfil, setPerfil] = useState(null);
  const [perfilLoading, setPerfilLoading] = useState(false);

  // Admin login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");
  const [loginErro, setLoginErro] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Login opcional (PDV desktop): quando o servidor local diz que login não é
  // necessário, entra direto como operador (admin sem email).
  const [loginNecessario, setLoginNecessario] = useState(true);

  // Restaurar sessão admin do localStorage + refrescar setores via /auth/me
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("usuario");
    if (savedToken && savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user.tipo === "admin") {
          setToken(savedToken);
          setUsuario(user);
          // Atualiza setores em background (caso o dono tenha alterado depois do login)
          api.me().then(me => {
            const atualizado = { ...user, setores: me.setores ?? null };
            setUsuario(atualizado);
            try { localStorage.setItem("usuario", JSON.stringify(atualizado)); } catch {}
          }).catch(() => {});
        } else {
          localStorage.removeItem("token");
          localStorage.removeItem("usuario");
        }
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
      }
      setLoading(false);
      return;
    }
    // Sem sessão salva: consulta se o login é exigido (desktop pode estar com login desligado)
    api.loginStatus()
      .then(s => {
        setLoginNecessario(!!s.login_necessario);
        if (!s.login_necessario) {
          setUsuario({ id: "local", nome: "Operador", email: null, tipo: "admin", setores: null });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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

  // T6 — lembrar último setor acessado (volta direto nele no próximo acesso)
  useEffect(() => {
    if (setor) localStorage.setItem("nl_setor", setor);
    else localStorage.removeItem("nl_setor");
  }, [setor]);

  // T5 — detecta se já há produtos (auto-conclui o passo do cardápio)
  useEffect(() => {
    if (!usuario || usuario.tipo !== "admin" || onbDismissed) return;
    api.produtos.listar().then(ps => setProdutosTem(Array.isArray(ps) && ps.length > 0)).catch(() => {});
  }, [usuario, onbDismissed]);

  // Carregar perfil do estabelecimento após login
  useEffect(() => {
    if (!usuario || usuario.tipo !== "admin") return;
    setPerfilLoading(true);
    api.perfil.obter()
      .then(p => setPerfil(p))
      .catch(() => setPerfil({ modo: "", modulos: [], configurado: false, nome_estabelecimento: "" }))
      .finally(() => setPerfilLoading(false));
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
          {IS_DESKTOP && window.licenca?.reset && (
            <button onClick={() => { if (confirm("Resetar licença? O programa pedirá uma nova ativação.")) window.licenca.reset(); }}
              style={{ marginTop: 16, padding: "7px 16px", border: "1.5px solid #fecaca", borderRadius: 8, background: "#fff", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#dc2626" }}>
              Resetar licença
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── SETUP WIZARD (primeiro acesso — perfil não configurado) ──────────────
  // No cardápio online o wizard não roda (a configuração estrutural vive no PDV).
  if (perfilLoading) return null;
  if (!IS_ONLINE && perfil && !perfil.configurado) {
    return <SetupWizard logoUrl="/logo.png" onComplete={(p) => setPerfil({ ...p, configurado: true })} />;
  }

  // Módulo habilitado? Frente de Caixa, Produtos, Financeiro, Config = sempre.
  // Cozinha, Estoque, Fiscal = opcionais (controlados pelo perfil).
  const modulosAtivos = perfil?.modulos || [];
  const moduloHabilitado = (m) => ["caixa", "produtos", "financeiro", "config", "pedidos"].includes(m) || modulosAtivos.includes(m);

  // Setores permitidos para este admin. null/[] = todos.
  const setoresPermitidos = Array.isArray(usuario?.setores) && usuario.setores.length > 0
    ? usuario.setores
    : null;
  const podeAcessar = (s) => SETORES_BUILD.includes(s) && (!setoresPermitidos || setoresPermitidos.includes(s)) && moduloHabilitado(s);

  const navegar = (destino) => {
    if (destino === "cardapio") window.location.href = "/";
    else if (["cozinha", "caixa", "produtos", "estoque", "financeiro", "config"].includes(destino)) {
      if (!podeAcessar(destino)) return;
      if (destino === "config" && perfil?.configurado) {
        const senha = prompt("Senha de manutenção:");
        if (senha !== SENHA_MANUTENCAO) { alert("Senha incorreta."); return; }
      }
      setSetor(destino);
    } else setSetor(null);
  };

  // Setor restaurado do localStorage mas sem permissão → joga pro hub
  if (setor && !podeAcessar(setor)) {
    setSetor(null);
    return null;
  }

  // ─── SETOR: Pedidos Online (só no build online) ──────────────────────────
  if (setor === "pedidos") return <PedidosOnlineApp onNavegar={navegar} />;

  // ─── SETOR: Cozinha ──────────────────────────────────────────────────────
  if (setor === "cozinha") return <CozinhaApp onNavegar={navegar} />;

  // ─── SETOR: Produtos e Promoções ─────────────────────────────────────────
  if (setor === "produtos") return <ProdutosApp onNavegar={navegar} />;

  // ─── SETOR: Frente de Caixa ───────────────────────────────────────────────
  if (setor === "caixa") return <FrenteCaixa onNavegar={navegar} nomeUsuario={usuario?.nome} modoPerfil={perfil?.modo || "mesas"} />;

  // ─── SETOR: Estoque e Insumos ─────────────────────────────────────────────
  if (setor === "estoque") return <EstoqueApp onNavegar={navegar} />;

  // ─── SETOR: Financeiro ────────────────────────────────────────────────────
  if (setor === "financeiro") return <FinanceiroApp onNavegar={navegar} />;

  // ─── SETOR: Configurações ─────────────────────────────────────────────────
  if (setor === "config") return <ConfigApp onNavegar={navegar} />;

  // ─── HUB: Escolha do setor ──────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f5f5f4", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .hub-card { background: #fff; border: 2px solid #e7e5e4; border-radius: 20px; padding: 36px 28px; width: 220px; cursor: pointer; text-align: center; transition: all 0.2s ease; display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .hub-card:hover { border-color: #15803d; transform: translateY(-4px); box-shadow: 0 12px 36px rgba(0,0,0,0.1); }
        .hub-card:active { transform: translateY(-1px); }
        @media (max-width: 900px) { .hub-card { width: 170px; padding: 28px 18px; } }
      `}</style>
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ marginBottom: 36 }}>
          <img src="/logo.png" alt="Logo" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", marginBottom: 14 }}
            onError={e => { e.currentTarget.style.display = "none"; }} />
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#1c1917" }}>Olá, {usuario.nome}</div>
          <div style={{ fontSize: 13, color: "#a8a29e", marginTop: 6 }}>Selecione seu setor de trabalho</div>
        </div>

        {!IS_ONLINE && !onbDismissed && (
          <OnboardingCard
            onNavegar={setSetor}
            produtosTem={produtosTem}
            steps={onbSteps}
            onStep={marcarPasso}
            onDismiss={dispensarOnb}
          />
        )}
        <div style={{ display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap", maxWidth: 900 }}>
          {/* Produtos e Promoções */}
          {podeAcessar("produtos") && (
            <div className="hub-card" onClick={() => setSetor("produtos")}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🍔</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Produtos e Promoções</div>
              <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Cardápio, categorias e adicionais</div>
            </div>
          )}

          {/* Cozinha */}
          {podeAcessar("cozinha") && (
            <div className="hub-card" onClick={() => setSetor("cozinha")}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🔥</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Cozinha</div>
              <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Pedidos, fila de preparo e histórico</div>
              {pendentesCount > 0 && (
                <div style={{ background: "#dc2626", color: "#fff", borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700 }}>
                  {pendentesCount} pendente{pendentesCount > 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}

          {/* Frente de Caixa */}
          {podeAcessar("caixa") && (
            <div className="hub-card" onClick={() => setSetor("caixa")}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #D97706 0%, #B45309 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
                {perfil?.modo === "balcao" ? "🏪" : "🍽️"}
              </div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Frente de Caixa</div>
              <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>
                {perfil?.modo === "balcao" ? "Caixa, pedidos e pagamentos" : "Salão, mesas e comandas"}
              </div>
            </div>
          )}

          {/* Estoque e Insumos */}
          {podeAcessar("estoque") && (
            <div className="hub-card" onClick={() => setSetor("estoque")}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>📦</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Estoque e Insumos</div>
              <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Controle de estoque e ficha técnica</div>
            </div>
          )}

          {/* Financeiro */}
          {podeAcessar("financeiro") && (
            <div className="hub-card" onClick={() => setSetor("financeiro")}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>💰</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Financeiro</div>
              <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Fluxo de caixa e lançamentos</div>
            </div>
          )}

          {/* Pedidos (só online — fallback quando PDV perde internet) */}
          {podeAcessar("pedidos") && (
            <div className="hub-card" onClick={() => setSetor("pedidos")}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>📋</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Pedidos</div>
              <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Lista de pedidos e gerenciamento</div>
              {pendentesCount > 0 && (
                <div style={{ background: "#dc2626", color: "#fff", borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700 }}>
                  {pendentesCount} pendente{pendentesCount > 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}

          {/* Configurações */}
          {podeAcessar("config") && (
            <div className="hub-card" onClick={() => setSetor("config")}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #64748B 0%, #475569 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>⚙️</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Configurações</div>
              <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>{IS_ONLINE ? "Horário, dados e conexão" : "Funcionários, horário e lixeira"}</div>
            </div>
          )}
        </div>

        {/* Aviso quando o funcionário tem acesso restrito */}
        {setoresPermitidos && (
          <div style={{ marginTop: 20, fontSize: 11, color: "#a8a29e" }}>
            Você tem acesso a {setoresPermitidos.length} {setoresPermitidos.length === 1 ? "função" : "funções"} desta plataforma. Para liberar outras, fale com o administrador.
          </div>
        )}
        <div style={{ marginTop: 32, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
          {loginNecessario ? (
            <button onClick={handleLogout} style={{ padding: "8px 20px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
              Sair da conta
            </button>
          ) : (
            <span style={{ fontSize: 11, color: "#a8a29e" }}>
              🔓 Acesso livre — ative o login em Configurações para exigir senha por funcionário
            </span>
          )}
          {IS_DESKTOP && window.licenca?.reset && (
            <button onClick={() => { if (confirm("Resetar licença? O programa pedirá uma nova ativação.")) window.licenca.reset(); }}
              style={{ padding: "8px 16px", border: "1.5px solid #fecaca", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#dc2626" }}>
              Resetar licença
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
