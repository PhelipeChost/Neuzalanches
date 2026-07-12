// Sidebar de navegação do PDV — todas as seções sempre visíveis à esquerda.
// Frente de Caixa é o setor default (a plataforma vive orbitando em torno do caixa).
import NexusLogo from "./NexusLogo";

const SIDEBAR_WIDTH = 240;
// Email da conta admin irremovível da Nexus — quando é essa conta logada,
// a sidebar mostra a logo Nexus como avatar em vez das iniciais.
const NEXUS_ADMIN_EMAIL = "reinonexusideal@gmail.com";

// O Suporte Nexus saiu daqui: agora vive FORA do login (botão 🛟 na tela
// inicial do PDV) — é área do Operador Nexus, não do estabelecimento.
const SECOES = [
  { grupo: "operação",  key: "caixa",       icon: "🧾", label: "Frente de Caixa" },
  { grupo: "operação",  key: "mesas",       icon: "🍽️", label: "Atender Mesas" },   // só no build online
  { grupo: "operação",  key: "cozinha",     icon: "🔥", label: "Cozinha" },
  { grupo: "operação",  key: "pedidos",     icon: "📋", label: "Pedidos Online" },
  { grupo: "cadastros", key: "produtos",    icon: "🍔", label: "Produtos e Promoções" },
  { grupo: "cadastros", key: "estoque",     icon: "📦", label: "Estoque e Insumos" },
  { grupo: "gestão",    key: "financeiro",  icon: "💰", label: "Financeiro" },
  { grupo: "gestão",    key: "config",      icon: "⚙️", label: "Configurações" },
];

const GRUPOS = ["operação", "cadastros", "gestão"];

export const SIDEBAR_LAYOUT_WIDTH = SIDEBAR_WIDTH;

export default function SidebarNav({
  setorAtivo,
  onNavegar,
  onLogout,
  onResetLicenca,
  onTrocarEstab, // multi-estabelecimento: volta pro seletor pré-login
  usuario,
  perfil,
  loginNecessario,
  pendentesCount = 0,
  podeAcessar,
  syncStatus, // "ok" | "offline" | "sem-config"
}) {
  const nome = perfil?.nome_estabelecimento || "Nexus PDV";
  const ehNexus = (usuario?.email || "").toLowerCase() === NEXUS_ADMIN_EMAIL;
  // Só a primeira inicial pra funcionários (mais limpo que "MC", "FN" etc.)
  const iniciais = ((usuario?.nome || "N").trim()[0] || "N").toUpperCase();

  const secoesVisiveis = SECOES.filter(s => podeAcessar(s.key));
  const gruposComItens = GRUPOS.filter(g => secoesVisiveis.some(s => s.grupo === g));

  const statusLabel =
    syncStatus === "ok" ? "Tudo sincronizado · funciona offline" :
    syncStatus === "offline" ? "Sem conexão com o cardápio online" :
    syncStatus === "online-panel" ? "Painel do cardápio online" :
    "Cardápio online não conectado";
  const statusCor =
    syncStatus === "ok" ? "#22c55e" :
    syncStatus === "offline" ? "#f59e0b" :
    syncStatus === "online-panel" ? "#22c55e" : "#a8a29e";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap');
        .nx-sb {
          position: fixed; left: 0; top: 0; bottom: 0; width: ${SIDEBAR_WIDTH}px;
          background: #0f1a17; color: #e7e5e4;
          display: flex; flex-direction: column;
          font-family: 'DM Sans', 'Segoe UI', sans-serif;
          border-right: 1px solid #1c2622;
          z-index: 40;
        }
        .nx-sb-brand { padding: 22px 22px 16px; border-bottom: 1px solid #1c2622; }
        .nx-sb-brand-name { font-family: 'Inter', sans-serif; font-size: 17px; font-weight: 800; color: #fff; line-height: 1.15; }
        .nx-sb-brand-sub  { font-size: 11px; color: #78716c; margin-top: 2px; letter-spacing: 0.03em; }
        .nx-sb-brand-pill { display:inline-block; margin-top: 8px; padding: 2px 9px; background: #15803d; color:#fff; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; }

        .nx-sb-scroll { flex: 1; overflow-y: auto; padding: 12px 12px 8px; }
        .nx-sb-scroll::-webkit-scrollbar { width: 6px; }
        .nx-sb-scroll::-webkit-scrollbar-thumb { background: #1c2622; border-radius: 3px; }

        .nx-sb-grp { font-size: 10px; letter-spacing: 0.10em; text-transform: uppercase; color: #6b7280; padding: 14px 10px 6px; font-weight: 700; }
        .nx-sb-item {
          display: flex; align-items: center; gap: 12px; padding: 10px 12px;
          border-radius: 10px; cursor: pointer; font-size: 13.5px; font-weight: 500;
          color: #e7e5e4; margin: 2px 0; transition: background 0.12s;
          background: transparent; border: none; width: 100%; text-align: left;
          font-family: inherit;
        }
        .nx-sb-item:hover { background: #1a2622; }
        .nx-sb-item.active { background: #15803d; color: #fff; font-weight: 600; }
        .nx-sb-item.active .nx-sb-icon { filter: none; }
        .nx-sb-icon { width: 22px; text-align: center; font-size: 15px; }
        .nx-sb-badge {
          margin-left: auto; background: #dc2626; color: #fff; font-size: 10px; font-weight: 700;
          padding: 2px 7px; border-radius: 999px; min-width: 20px; text-align: center;
        }
        .nx-sb-badge.novo { background: #f59e0b; color: #1c1917; }

        .nx-sb-foot { padding: 10px 14px 14px; border-top: 1px solid #1c2622; }
        .nx-sb-status { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #a8a29e; padding: 6px 4px 10px; }
        .nx-sb-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .nx-sb-user { display: flex; align-items: center; gap: 10px; padding: 8px 6px; }
        .nx-sb-avatar { width: 34px; height: 34px; border-radius: 50%; background: #22c55e; color: #052e16; display:flex; align-items:center; justify-content:center; font-size: 12px; font-weight: 700; font-family: 'Inter', sans-serif; }
        .nx-sb-user-name { font-size: 12.5px; font-weight: 600; color: #f5f5f4; line-height: 1.2; }
        .nx-sb-user-role { font-size: 10.5px; color: #78716c; }

        .nx-sb-actions { display:flex; flex-direction: column; gap: 6px; margin-top: 10px; }
        .nx-sb-btn {
          padding: 9px 12px; border-radius: 9px; background: transparent; border: 1px solid #1c2622;
          color: #e7e5e4; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
          transition: background 0.12s;
        }
        .nx-sb-btn:hover { background: #1a2622; }
        .nx-sb-btn.danger { color: #f87171; border-color: #3a1414; }
        .nx-sb-btn.danger:hover { background: #2a0e0e; }

        @media print { .nx-sb { display: none !important; } }
      `}</style>

      <aside className="nx-sb">
        <div className="nx-sb-brand">
          <div className="nx-sb-brand-name">{nome}</div>
          <div className="nx-sb-brand-sub">Painel de controle</div>
          <span className="nx-sb-brand-pill">NEXUS PDV</span>
        </div>

        <div className="nx-sb-scroll">
          {gruposComItens.map(grupo => (
            <div key={grupo}>
              <div className="nx-sb-grp">{grupo}</div>
              {secoesVisiveis.filter(s => s.grupo === grupo).map(s => {
                const active = setorAtivo === s.key;
                const badge = (s.key === "pedidos" || s.key === "cozinha") && pendentesCount > 0
                  ? <span className="nx-sb-badge">{pendentesCount}</span>
                  : null;
                return (
                  <button key={s.key}
                    className={`nx-sb-item ${active ? "active" : ""}`}
                    onClick={() => onNavegar(s.key)}>
                    <span className="nx-sb-icon">{s.icon}</span>
                    <span>{s.label}</span>
                    {badge}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="nx-sb-foot">
          <div className="nx-sb-status">
            <span className="nx-sb-dot" style={{ background: statusCor }} />
            <span>{statusLabel}</span>
          </div>
          <div className="nx-sb-user">
            {ehNexus
              ? <NexusLogo size={34} style={{ borderRadius: 10 }} />
              : <div className="nx-sb-avatar">{iniciais}</div>}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="nx-sb-user-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {usuario?.nome || "Operador"}
              </div>
              <div className="nx-sb-user-role">
                {ehNexus ? "Nexus · Suporte" : (usuario?.tipo === "admin" ? "Administrador" : "Operador")}
              </div>
            </div>
          </div>

          <div className="nx-sb-actions">
            {onLogout && (
              <button className="nx-sb-btn" onClick={onLogout}>
                {usuario?.email ? "Sair da conta" : "Entrar com conta (admin)"}
              </button>
            )}
            {onTrocarEstab && (
              <button className="nx-sb-btn" onClick={onTrocarEstab}>🏬 Trocar de estabelecimento</button>
            )}
            {onResetLicenca && (
              <button className="nx-sb-btn danger" onClick={onResetLicenca}>Resetar licença</button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
