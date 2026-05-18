import { useState, useEffect } from "react";
import { api } from "./api";
import ClienteApp from "./ClienteApp";
import Pedidos from "./Pedidos";
import FrenteCaixa from "./FrenteCaixa";
import CozinhaApp from "./CozinhaApp";
import ProdutosApp from "./ProdutosApp";
import EstoqueApp from "./EstoqueApp";
import FinanceiroApp from "./FinanceiroApp";
import ConfigApp from "./ConfigApp";
import MesaApp from "./MesaApp";

export default function App() {
  // /mesa/:numero — cardápio público para QR code (sem login)
  const mesaMatch = window.location.pathname.match(/^\/mesa\/(\d+)/);
  if (mesaMatch) {
    return <MesaApp mesaNumero={parseInt(mesaMatch[1], 10)} />;
  }

  const isCaixaRoute = window.location.pathname.startsWith('/caixa');
  const isAdminRoute = window.location.pathname.startsWith('/admin') || isCaixaRoute;

  // /caixa agora redireciona para /admin (login unificado)
  if (isCaixaRoute) {
    window.history.replaceState(null, "", "/admin");
  }

  const [usuario, setUsuario] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setor, setSetor] = useState(null); // null = hub
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

  const navegar = (destino) => {
    if (destino === "cardapio") window.location.href = "/";
    else setSetor(["pedidos", "cozinha", "caixa", "produtos", "estoque", "financeiro", "config"].includes(destino) ? destino : null);
  };

  // ─── SETOR: Cozinha ──────────────────────────────────────────────────────
  if (setor === "cozinha") return <CozinhaApp onNavegar={navegar} />;

  // ─── SETOR: Produtos e Promoções ─────────────────────────────────────────
  if (setor === "produtos") return <ProdutosApp onNavegar={navegar} />;

  // ─── SETOR: Frente de Caixa ───────────────────────────────────────────────
  if (setor === "caixa") return <FrenteCaixa onNavegar={navegar} nomeUsuario={usuario?.nome} />;

  // ─── SETOR: Estoque e Insumos ─────────────────────────────────────────────
  if (setor === "estoque") return <EstoqueApp onNavegar={navegar} />;

  // ─── SETOR: Financeiro ────────────────────────────────────────────────────
  if (setor === "financeiro") return <FinanceiroApp onNavegar={navegar} />;

  // ─── SETOR: Configurações ─────────────────────────────────────────────────
  if (setor === "config") return <ConfigApp onNavegar={navegar} />;

  // ─── SETOR: Pedidos ───────────────────────────────────────────────────────
  if (setor === "pedidos") {
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
        `}</style>

        {/* Header */}
        <header style={{ background: "#fff", borderBottom: "1px solid #e7e5e4", padding: "0 32px", minHeight: 56, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => navegar(null)} style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <img src="/logo.png" alt="Logo" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
              onError={e => { e.currentTarget.style.display = "none"; }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: "#1c1917" }}>Pedidos</span>
          </button>

          <div style={{ flex: 1 }} />

          <button onClick={() => navegar(null)} style={{ padding: "6px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
            {"←"} Início
          </button>
        </header>

        {/* Content */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>
          <Pedidos />
        </div>
      </div>
    );
  }

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
        <div style={{ display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap", maxWidth: 900 }}>
          {/* Produtos e Promoções */}
          <div className="hub-card" onClick={() => setSetor("produtos")}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🍔</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Produtos e Promoções</div>
            <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Cardápio, categorias e adicionais</div>
          </div>

          {/* Pedidos */}
          <div className="hub-card" onClick={() => setSetor("pedidos")}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #15803d 0%, #166534 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>📋</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Pedidos</div>
            <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Gerenciar pedidos e acompanhar status</div>
            {pendentesCount > 0 && (
              <div style={{ background: "#dc2626", color: "#fff", borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700 }}>
                {pendentesCount} pendente{pendentesCount > 1 ? "s" : ""}
              </div>
            )}
          </div>

          {/* Cozinha */}
          <div className="hub-card" onClick={() => setSetor("cozinha")}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🔥</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Cozinha</div>
            <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Fila de preparo e botão de pronto</div>
          </div>

          {/* Frente de Caixa */}
          <div className="hub-card" onClick={() => setSetor("caixa")}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #D97706 0%, #B45309 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🍽️</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Frente de Caixa</div>
            <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Salão, mesas e comandas</div>
          </div>

          {/* Estoque e Insumos */}
          <div className="hub-card" onClick={() => setSetor("estoque")}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>📦</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Estoque e Insumos</div>
            <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Controle de estoque e ficha técnica</div>
          </div>

          {/* Financeiro */}
          <div className="hub-card" onClick={() => setSetor("financeiro")}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>💰</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Financeiro</div>
            <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Fluxo de caixa e lançamentos</div>
          </div>

          {/* Configurações */}
          <div className="hub-card" onClick={() => setSetor("config")}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #64748B 0%, #475569 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>⚙️</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#1c1917" }}>Configurações</div>
            <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.4 }}>Horário, admins e lixeira</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{ marginTop: 32, padding: "8px 20px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
          Sair da conta
        </button>
      </div>
    </div>
  );
}
