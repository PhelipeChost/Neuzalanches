import FluxoCaixa from "./fluxo-de-caixa";

export default function FinanceiroApp({ onNavegar }) {
  return (
    <div className="ns-shell">
      {/* Classes legadas usadas por fluxo-de-caixa.jsx + CustosFixos.jsx — todas com tokens */}
      <style>{`
        .card { background: var(--card); border: 1px solid var(--linha); border-radius: var(--r); padding: 20px 22px; }
        .btn-add { display: inline-flex; align-items: center; gap: 8px; background: var(--laranja); color: #fff; border: none; border-radius: var(--r-sm); padding: 10px 18px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font-ui); box-shadow: 0 2px 8px rgba(242,116,26,0.28); transition: background 0.15s; }
        .btn-add:hover { background: var(--laranja-d); }
        .icon-btn { display: inline-flex; align-items: center; gap: 5px; background: var(--card); border: 1px solid var(--linha); border-radius: 8px; padding: 5px 11px; cursor: pointer; font-size: 12px; font-weight: 500; color: var(--ink2); font-family: var(--font-ui); transition: all 0.15s; }
        .icon-btn:hover { background: var(--card2); color: var(--ink); border-color: var(--linha2); }
        .icon-btn.del { color: var(--vermelho); border-color: #fecaca; }
        .icon-btn.del:hover { background: var(--vermelho-bg); border-color: var(--vermelho); color: var(--vermelho-d); }

        .search { padding: 8px 14px; border: 1px solid var(--linha); border-radius: 8px; font-family: var(--font-ui); font-size: 13px; outline: none; background: var(--card); width: 100%; max-width: 240px; min-width: 0; color: var(--ink); }
        .search:focus { border-color: var(--azul); }
        .search::placeholder { color: var(--ink3); }

        /* Botões de filtro (Todos / Entradas / Saídas etc.) */
        .fil { padding: 7px 14px; border: 1px solid var(--linha); border-radius: 8px; font-family: var(--font-ui); font-size: 12.5px; font-weight: 500; outline: none; color: var(--ink2); background: var(--card); cursor: pointer; transition: all 0.12s; }
        .fil:hover { background: var(--card2); color: var(--ink); }
        .fil.ativo { border-color: var(--ink); color: #fff; background: var(--ink); font-weight: 600; }
        /* Quando o <select> usa a classe .fil */
        select.fil { padding-right: 28px; appearance: none; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'><path d='M1 1L5 5L9 1' stroke='%235C6677' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>"); background-repeat: no-repeat; background-position: right 10px center; }

        .metric { background: var(--card); border: 1px solid var(--linha); border-radius: var(--r); padding: 18px 20px; }

        .anim { animation: fi 0.25s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 999; animation: fi 0.3s ease; color: #fff; font-family: var(--font-ui); }
      `}</style>

      <header className="ns-header">
        <div className="ns-header-brand" style={{ cursor: "default" }}>
          <img src="/logo.png" alt="Logo" onError={e => { e.currentTarget.style.display = "none"; }} />
          <span>Financeiro</span>
        </div>
        <div style={{ flex: 1 }} />
      </header>

      <div className="ns-content">
        <FluxoCaixa />
      </div>
    </div>
  );
}
