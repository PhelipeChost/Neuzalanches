// ─── App: navegação própria (pushState) + sidebar por permissão + quiosque ──
import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { cores } from "./styles";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import PDV from "./pages/PDV";
import Products from "./pages/Products";
import Stock from "./pages/Stock";
import Suppliers from "./pages/Suppliers";
import Finance from "./pages/Finance";
import Settings from "./pages/Settings";

const SIDEBAR_W = 240;

// path <-> página
const PAGINAS = [
  { key: "dashboard", path: "/",            label: "Início",        icon: "🏠", comp: Dashboard },
  { key: "pdv",       path: "/pdv",         label: "PDV (Caixa)",   icon: "🛒", comp: PDV },
  { key: "products",  path: "/produtos",    label: "Produtos",      icon: "🏷️", comp: Products },
  { key: "stock",     path: "/estoque",     label: "Estoque",       icon: "📦", comp: Stock },
  { key: "suppliers", path: "/fornecedores",label: "Fornecedores",  icon: "🚚", comp: Suppliers },
  { key: "finance",   path: "/financeiro",  label: "Financeiro",    icon: "💰", comp: Finance },
  { key: "settings",  path: "/ajustes",     label: "Ajustes",       icon: "⚙️", comp: Settings },
];

const porPath = (path) => PAGINAS.find(p => p.path === path) || PAGINAS[0];

export default function App() {
  const { user, loading, logout } = useAuth();
  const [pagina, setPagina] = useState(() => porPath(window.location.pathname).key);

  // navegação própria: pushState + popstate
  useEffect(() => {
    const onPop = () => setPagina(porPath(window.location.pathname).key);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navegar = (key) => {
    const p = PAGINAS.find(x => x.key === key);
    if (!p) return;
    window.history.pushState({}, "", p.path);
    setPagina(p.key);
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: cores.ink3 }}>Carregando...</div>;
  if (!user) return <Login />;

  const permitidas = user.is_admin ? PAGINAS.map(p => p.key) : (user.permissions || []);
  const visiveis = PAGINAS.filter(p => permitidas.includes(p.key));

  // modo QUIOSQUE: operador que só tem o PDV cai direto na tela cheia do caixa
  const quiosque = !user.is_admin && permitidas.length === 1 && permitidas[0] === "pdv";
  if (quiosque) {
    return (
      <div style={{ minHeight: "100vh", background: cores.fundo }}>
        <PDV quiosque onLogout={logout} />
      </div>
    );
  }

  const atual = PAGINAS.find(p => p.key === pagina && permitidas.includes(p.key)) || visiveis[0];
  const Comp = atual?.comp || Dashboard;

  return (
    <div style={{ minHeight: "100vh", background: cores.fundo }}>
      {/* Sidebar */}
      <aside style={{
        position: "fixed", left: 0, top: 0, bottom: 0, width: SIDEBAR_W, zIndex: 40,
        background: cores.sidebar, color: "#e7e5e4", display: "flex", flexDirection: "column",
        borderRight: "1px solid #1c2622",
      }}>
        <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid #1c2622" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>Nexus Mercado</div>
          <div style={{ fontSize: 11, color: "#78716c", marginTop: 2 }}>Ponto de venda</div>
          <span style={{ display: "inline-block", marginTop: 8, padding: "2px 9px", background: cores.verde, color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>NEXUS PDV</span>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {visiveis.map(p => {
            const ativo = atual?.key === p.key;
            return (
              <button key={p.key} onClick={() => navegar(p.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                  padding: "11px 12px", margin: "2px 0", borderRadius: 10, border: "none", cursor: "pointer",
                  fontSize: 13.5, fontWeight: ativo ? 600 : 500, fontFamily: "inherit",
                  background: ativo ? cores.verde : "transparent", color: ativo ? "#fff" : "#e7e5e4",
                }}>
                <span style={{ width: 22, textAlign: "center" }}>{p.icon}</span>
                <span>{p.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ padding: 14, borderTop: "1px solid #1c2622" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#22c55e", color: "#052e16", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
              {(user.name || "?")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#f5f5f4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
              <div style={{ fontSize: 10.5, color: "#78716c" }}>{user.is_admin ? "Administrador" : "Operador"}</div>
            </div>
          </div>
          <button onClick={logout}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 9, background: "transparent", border: "1px solid #1c2622", color: "#e7e5e4", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Sair da conta
          </button>
          {sessionStorage.getItem("nx_pdv_url") && (
            <button onClick={() => { window.location.href = sessionStorage.getItem("nx_pdv_url"); }}
              style={{ width: "100%", marginTop: 6, padding: "9px 12px", borderRadius: 9, background: "transparent", border: "1px solid #1c2622", color: "#e7e5e4", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              🏬 Trocar de estabelecimento
            </button>
          )}
          {/* Suporte Nexus: volta pro shell do PDV com ?suporte=1 → abre o modal.
              O Operador Nexus é maior que a conta do cliente, então precisa
              estar acessível também de dentro do Mercado. */}
          {sessionStorage.getItem("nx_pdv_url") && (
            <button onClick={() => { window.location.href = sessionStorage.getItem("nx_pdv_url") + "?suporte=1"; }}
              title="Área do Suporte Nexus"
              style={{ width: "100%", marginTop: 6, padding: "9px 12px", borderRadius: 9, background: "transparent", border: "1px solid #1c2622", color: "#e7e5e4", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              🛟 Suporte Nexus
            </button>
          )}
        </div>
      </aside>

      {/* Conteúdo */}
      <main style={{ paddingLeft: SIDEBAR_W, minHeight: "100vh" }}>
        <div style={{ padding: "26px 30px", maxWidth: 1200, margin: "0 auto" }}>
          <Comp />
        </div>
      </main>
    </div>
  );
}
