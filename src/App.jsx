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
import SuporteApp from "./SuporteApp";
import SidebarNav, { SIDEBAR_LAYOUT_WIDTH } from "./SidebarNav";
import Logo from "./Logo";
import NexusLogo from "./NexusLogo";

const SENHA_MANUTENCAO = "31076hibridos";
const SENHA_SUPORTE = "31076hibridos";

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
const SETORES_BUILD = IS_ONLINE
  ? ["pedidos", "config"]
  : ["produtos", "cozinha", "caixa", "estoque", "financeiro", "config", "suporte"];

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
  // Setor default = "caixa" no PDV (Frente de Caixa é a cara principal), "pedidos" no online.
  const [setor, setSetor] = useState(() => {
    const saved = localStorage.getItem("nl_setor");
    if (saved) return saved;
    return IS_ONLINE ? "pedidos" : "caixa";
  });
  const [pendentesCount, setPendentesCount] = useState(0);
  const [suporteLiberado, setSuporteLiberado] = useState(false);
  const [modalSuporte, setModalSuporte] = useState(false);
  const [senhaSuporte, setSenhaSuporte] = useState("");
  const [erroSuporte, setErroSuporte] = useState("");
  const [syncStatus, setSyncStatus] = useState("sem-config");

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

  // No build online (mercadolojo), a sidebar reflete "isso é o painel online"
  useEffect(() => { if (IS_ONLINE) setSyncStatus("online-panel"); }, []);

  // Polling do status de sincronização com o cardápio online (rodapé da sidebar)
  useEffect(() => {
    if (!usuario || usuario.tipo !== "admin" || IS_ONLINE) return;
    const checkSync = async () => {
      try {
        const cfg = await api.sync.config();
        if (!cfg.url || !cfg.token || !cfg.enabled) { setSyncStatus("sem-config"); return; }
        const erroRecente = (cfg.last_sync_result || "").toLowerCase().startsWith("erro");
        const ultimaMs = cfg.last_sync ? Date.now() - new Date(cfg.last_sync).getTime() : Infinity;
        if (erroRecente || ultimaMs > 20 * 60_000) setSyncStatus("offline");
        else setSyncStatus("ok");
      } catch { setSyncStatus("offline"); }
    };
    checkSync();
    const interval = setInterval(checkSync, 30_000);
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
    setSuporteLiberado(false);
  };

  // Volta pra sessão de operador local (PDV com login desligado) sem reiniciar
  const voltarComoOperador = () => {
    setLoginErro("");
    setUsuario({ id: "local", nome: "Operador", email: null, tipo: "admin", setores: null });
  };

  if (loading) return null;

  // ─── ROTA PÚBLICA: Cardápio do cliente ───────────────────────────────────
  if (!isAdminRoute) {
    return <ClienteApp />;
  }

  // ─── ROTA /admin: Login do admin ─────────────────────────────────────────
  if (!usuario || usuario.tipo !== "admin") {
    // PDV desktop: tela de login premium com identidade Nexus (fundo escuro
    // gradient + glass card + logo Nexus). Online: mantém o design light
    // padrão com a logo do estabelecimento.
    if (IS_DESKTOP) return (
      <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", minHeight: "100vh",
        background: "radial-gradient(1200px 700px at 15% 10%, #0f2b1e 0%, #0a1712 45%, #050a08 100%)",
        color: "#f5f5f4", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
        position: "relative", overflow: "hidden" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@500;600;700;800&family=Fraunces:wght@300;500&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          .nx-bg-orb-a, .nx-bg-orb-b {
            position: absolute; border-radius: 50%; filter: blur(120px); pointer-events: none; z-index: 0;
          }
          .nx-bg-orb-a { width: 520px; height: 520px; top: -140px; right: -80px; background: rgba(21,128,61,0.35); }
          .nx-bg-orb-b { width: 400px; height: 400px; bottom: -120px; left: -100px; background: rgba(245,158,11,0.10); }
          .nx-glass-card {
            background: rgba(20,32,26,0.72);
            border: 1px solid rgba(255,255,255,0.06);
            backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
            border-radius: 22px;
            box-shadow: 0 30px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(21,128,61,0.14) inset;
          }
          .nx-inp {
            width: 100%; padding: 13px 16px;
            background: rgba(255,255,255,0.04); border: 1.5px solid rgba(255,255,255,0.08);
            border-radius: 12px; color: #f5f5f4; font-size: 14px; outline: none;
            font-family: 'DM Sans', sans-serif; transition: border-color 0.15s, background 0.15s;
          }
          .nx-inp:focus { border-color: rgba(21,128,61,0.85); background: rgba(255,255,255,0.06); }
          .nx-inp::placeholder { color: #78716c; }
          .nx-btn {
            padding: 13px 20px; border: none; border-radius: 12px; cursor: pointer;
            font-size: 14px; font-weight: 700; font-family: 'DM Sans', sans-serif;
            background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
            color: #fff; transition: transform 0.12s, box-shadow 0.15s;
            box-shadow: 0 8px 24px rgba(21,128,61,0.30);
          }
          .nx-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(21,128,61,0.40); }
          .nx-btn:disabled { opacity: 0.6; cursor: wait; }
          .nx-link-btn {
            width: 100%; padding: 12px 16px; border-radius: 12px; cursor: pointer;
            background: transparent; border: 1.5px solid rgba(255,255,255,0.08);
            color: #d6d3d1; font-size: 13px; font-weight: 600; font-family: 'DM Sans', sans-serif;
            transition: background 0.15s, border-color 0.15s;
          }
          .nx-link-btn:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.14); }
          .nx-danger-btn {
            padding: 8px 16px; border-radius: 10px; cursor: pointer;
            background: transparent; border: 1.5px solid rgba(220,38,38,0.35);
            color: #f87171; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif;
          }
          .nx-danger-btn:hover { background: rgba(220,38,38,0.08); }
        `}</style>
        <div className="nx-bg-orb-a" />
        <div className="nx-bg-orb-b" />

        <div className="nx-glass-card" style={{ position: "relative", zIndex: 1, width: 440, maxWidth: "92vw", padding: "44px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><NexusLogo size={84} /></div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: "#fff" }}>Nexus PDV</div>
            <div style={{ fontSize: 12.5, color: "#78716c", marginTop: 6, letterSpacing: "0.03em" }}>
              Plataforma de gestão · Reino Nexus Ideal
            </div>
          </div>

          <form onSubmit={handleAdminLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 10.5, color: "#a8a29e", fontWeight: 700, letterSpacing: "0.10em", marginBottom: 6 }}>EMAIL</label>
              <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} type="email" required placeholder="seu@email.com" className="nx-inp" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10.5, color: "#a8a29e", fontWeight: 700, letterSpacing: "0.10em", marginBottom: 6 }}>SENHA</label>
              <input value={loginSenha} onChange={e => setLoginSenha(e.target.value)} type="password" required placeholder="••••••••" minLength={4} className="nx-inp" />
            </div>
            {loginErro && (
              <div style={{ background: "rgba(220,38,38,0.10)", border: "1px solid rgba(220,38,38,0.30)", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#fca5a5" }}>
                {loginErro}
              </div>
            )}
            <button type="submit" disabled={loginLoading} className="nx-btn" style={{ marginTop: 6 }}>
              {loginLoading ? "Entrando..." : "Entrar no PDV"}
            </button>
          </form>

          {!loginNecessario && (
            <button onClick={voltarComoOperador} className="nx-link-btn" style={{ marginTop: 14 }}>
              ← Continuar como operador (sem conta)
            </button>
          )}

          {window.licenca?.reset && (
            <div style={{ textAlign: "center", marginTop: 22 }}>
              <button onClick={() => { if (confirm("Resetar licença? O programa pedirá uma nova ativação.")) window.licenca.reset(); }}
                className="nx-danger-btn">Resetar licença</button>
            </div>
          )}
        </div>
      </div>
    );

    // Online: tela padrão light
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
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><Logo size={72} /></div>
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
          {!loginNecessario && (
            <button onClick={voltarComoOperador}
              style={{ marginTop: 16, width: "100%", padding: "10px 16px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fafaf9", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>
              ← Continuar como operador (sem conta)
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
    return <SetupWizard onComplete={(p) => setPerfil({ ...p, configurado: true })} />;
  }

  // Módulo habilitado? Frente de Caixa, Produtos, Financeiro, Config, Suporte = sempre.
  // Cozinha, Estoque, Fiscal = opcionais (controlados pelo perfil).
  const modulosAtivos = perfil?.modulos || [];
  const moduloHabilitado = (m) => ["caixa", "produtos", "financeiro", "config", "pedidos", "suporte"].includes(m) || modulosAtivos.includes(m);

  // Setores permitidos para este admin. null/[] = todos.
  const setoresPermitidos = Array.isArray(usuario?.setores) && usuario.setores.length > 0
    ? usuario.setores
    : null;
  const podeAcessar = (s) => SETORES_BUILD.includes(s) && (!setoresPermitidos || setoresPermitidos.includes(s)) && moduloHabilitado(s);

  const navegar = (destino) => {
    if (destino === "cardapio") { window.location.href = "/"; return; }
    if (destino === "suporte") {
      if (!podeAcessar("suporte")) return;
      if (!suporteLiberado) {
        // window.prompt() no Electron retorna null sem mostrar UI — modal customizado
        setSenhaSuporte("");
        setErroSuporte("");
        setModalSuporte(true);
        return;
      }
      setSetor("suporte");
      return;
    }
    if (["cozinha", "caixa", "produtos", "estoque", "financeiro", "config", "pedidos"].includes(destino)) {
      if (!podeAcessar(destino)) return;
      setSetor(destino);
      return;
    }
    // fallback: volta pra caixa (que é a "home" do PDV)
    setSetor(IS_ONLINE ? "pedidos" : "caixa");
  };

  // Setor restaurado do localStorage mas sem permissão → fallback pra home
  if (setor && !podeAcessar(setor)) {
    const home = IS_ONLINE ? "pedidos" : "caixa";
    if (podeAcessar(home)) setSetor(home);
    else setSetor(null);
    return null;
  }

  // ─── Renderização do conteúdo do setor (dentro da sidebar) ────────────────
  const conteudoSetor = (() => {
    if (setor === "pedidos")    return <PedidosOnlineApp onNavegar={navegar} />;
    if (setor === "cozinha")    return <CozinhaApp onNavegar={navegar} />;
    if (setor === "produtos")   return <ProdutosApp onNavegar={navegar} />;
    if (setor === "caixa")      return <FrenteCaixa onNavegar={navegar} nomeUsuario={usuario?.nome} modoPerfil={perfil?.modo || "mesas"} />;
    if (setor === "estoque")    return <EstoqueApp onNavegar={navegar} />;
    if (setor === "financeiro") return <FinanceiroApp onNavegar={navegar} />;
    if (setor === "config")     return <ConfigApp onNavegar={navegar} />;
    if (setor === "suporte")    return <SuporteApp onNavegar={navegar} perfil={perfil} onPerfilChange={setPerfil} />;
    return null;
  })();

  // ─── Layout: sidebar + conteúdo — vale pro PDV e pro online. No online
  // a sidebar mostra só Pedidos + Configurações (que é tudo que o admin do
  // cardápio tem). No PDV mostra todas as seções.
  if (conteudoSetor) {
    const handleResetLicenca = (IS_DESKTOP && window.licenca?.reset)
      ? () => { if (confirm("Resetar licença? O programa pedirá uma nova ativação.")) window.licenca.reset(); }
      : null;

    const confirmarSenhaSuporte = () => {
      if (senhaSuporte === SENHA_SUPORTE) {
        setSuporteLiberado(true);
        setModalSuporte(false);
        setSenhaSuporte("");
        setErroSuporte("");
        setSetor("suporte");
      } else {
        setErroSuporte("Senha incorreta");
      }
    };

    return (
      <div style={{ minHeight: "100vh", paddingLeft: SIDEBAR_LAYOUT_WIDTH, background: "#f5f5f4" }}>
        <SidebarNav
          setorAtivo={setor}
          onNavegar={navegar}
          onLogout={handleLogout}
          onResetLicenca={handleResetLicenca}
          usuario={usuario}
          perfil={perfil}
          loginNecessario={loginNecessario}
          pendentesCount={pendentesCount}
          podeAcessar={podeAcessar}
          syncStatus={syncStatus}
        />
        <div style={{ minHeight: "100vh" }}>{conteudoSetor}</div>

        {/* Modal de senha do Suporte */}
        {modalSuporte && (
          <div onClick={() => setModalSuporte(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,26,23,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", width: 400, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🛟</div>
                <div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 800 }}>Área do Suporte Nexus</div>
                  <div style={{ fontSize: 12, color: "#78716c" }}>Digite a senha de suporte para continuar</div>
                </div>
              </div>
              <input type="password" autoFocus value={senhaSuporte}
                onChange={e => { setSenhaSuporte(e.target.value); setErroSuporte(""); }}
                onKeyDown={e => { if (e.key === "Enter") confirmarSenhaSuporte(); if (e.key === "Escape") setModalSuporte(false); }}
                placeholder="Senha de suporte"
                style={{ width: "100%", padding: "12px 14px", border: `1.5px solid ${erroSuporte ? "#fecaca" : "#e7e5e4"}`, borderRadius: 10, fontSize: 14, outline: "none", fontFamily: "inherit", marginTop: 18 }} />
              {erroSuporte && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>❌ {erroSuporte}</div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
                <button onClick={() => setModalSuporte(false)}
                  style={{ padding: "10px 18px", border: "1.5px solid #e7e5e4", borderRadius: 9, background: "#fff", color: "#78716c", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancelar
                </button>
                <button onClick={confirmarSenhaSuporte}
                  style={{ padding: "10px 22px", border: "none", borderRadius: 9, background: "#15803d", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Entrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sem conteúdo → fallback pra home. Nunca deveria chegar aqui.
  const home = IS_ONLINE ? "pedidos" : "caixa";
  if (podeAcessar(home)) { setTimeout(() => setSetor(home), 0); }
  return null;
}
