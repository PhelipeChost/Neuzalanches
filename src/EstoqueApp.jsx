import { useState } from "react";
import Estoque from "./Estoque";
import Insumos from "./Insumos";

const NAV_TABS = [
  { key: "estoque", label: "Estoque" },
  { key: "insumos", label: "Insumos" },
];

export default function EstoqueApp({ onNavegar }) {
  const [aba, setAba] = useState("estoque");

  return (
    <div className="ns-shell">
      {/* Estilos legados ainda usados por Estoque.jsx (.card, .btn-add, .icon-btn, .search, .fil, .metric)
          mas com paleta unificada (verde-d em vez de teal). */}
      <style>{`
        .card { background: var(--card); border: 1px solid var(--linha); border-radius: var(--r); padding: 20px 22px; }
        .btn-add { display: inline-flex; align-items: center; gap: 8px; background: var(--verde); color: #fff; border: none; border-radius: 9px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-ui); transition: background 0.2s; }
        .btn-add:hover { background: var(--verde-d); }
        .icon-btn { background: none; border: 1px solid var(--linha); border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px; color: var(--ink2); transition: all 0.15s; font-family: var(--font-ui); }
        .icon-btn:hover { background: var(--card2); color: var(--ink); }
        .icon-btn.del:hover { background: var(--vermelho-bg); border-color: #fecaca; color: var(--vermelho); }
        .search { padding: 8px 14px; border: 1px solid var(--linha); border-radius: 8px; font-family: var(--font-ui); font-size: 13px; outline: none; background: var(--card); width: 100%; max-width: 260px; min-width: 0; color: var(--ink); }
        .search:focus { border-color: var(--verde); }
        .fil { padding: 7px 12px; border: 1px solid var(--linha); border-radius: 8px; font-family: var(--font-ui); font-size: 12px; outline: none; color: var(--ink2); background: var(--card); cursor: pointer; }
        .fil.ativo { border-color: var(--verde); color: var(--verde-d); background: var(--verde-bg); font-weight: 600; }
        .anim { animation: fi 0.25s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 999; animation: fi 0.3s ease; color: #fff; font-family: var(--font-ui); }
        .metric { background: var(--card); border: 1px solid var(--linha); border-radius: var(--r); padding: 18px 20px; }
      `}</style>

      <header className="ns-header">
        <button onClick={() => onNavegar(null)} className="ns-header-brand">
          <img src="/logo.png" alt="Logo" onError={e => { e.currentTarget.style.display = "none"; }} />
          <span>Estoque e Insumos</span>
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => onNavegar(null)} className="ns-header-btn">← Início</button>
      </header>

      <div className="ns-content">
        {/* Sub-nav unificada com o resto da plataforma */}
        <div className="ns-tabs">
          {NAV_TABS.map(t => (
            <button key={t.key} className={`ns-tab ${aba === t.key ? "on" : ""}`} onClick={() => setAba(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {aba === "estoque" && <Estoque />}
        {aba === "insumos" && <Insumos onIrParaEstoque={() => setAba("estoque")} />}
      </div>
    </div>
  );
}
