import FluxoCaixa from "./fluxo-de-caixa";

export default function FinanceiroApp({ onNavegar }) {
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
        .metric { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 18px 20px; }
        .saldo-card { background: linear-gradient(135deg, #15803d 0%, #166534 100%); border-radius: 14px; padding: 22px 24px; color: #fff; }
        .mes-sel { padding: 8px 14px; border: 1.5px solid #e7e5e4; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; color: #1c1917; background: #fff; cursor: pointer; }
        .saldo-edit-btn { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 6px; padding: 3px 10px; cursor: pointer; font-size: 11px; color: rgba(255,255,255,0.8); font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .saldo-edit-btn:hover { background: rgba(255,255,255,0.25); color: #fff; }
      `}</style>

      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e7e5e4", padding: "0 32px", minHeight: 56, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => onNavegar(null)} style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <img src="/logo.png" alt="Logo" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
            onError={e => { e.currentTarget.style.display = "none"; }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: "#1c1917" }}>Financeiro</span>
        </button>

        <div style={{ flex: 1 }} />

        <button onClick={() => onNavegar(null)} style={{ padding: "6px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
          {"←"} Início
        </button>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>
        <FluxoCaixa />
      </div>
    </div>
  );
}
