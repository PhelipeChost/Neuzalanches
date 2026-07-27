import { useEffect, useState } from "react";

// Indicador visível no canto inferior direito quando o túnel de suporte
// remoto Nexus está ativo. Existe pra o cliente NUNCA ser acessado sem
// perceber — se aparecer aqui, é porque a Nexus está (ou pode estar)
// olhando o PDV dele. Sem esse feedback visual seria um backdoor invisível.
//
// Só monta se window.nexusSuporte existir (Electron desktop). No navegador
// web comum, o componente vira no-op.
export default function SuporteIndicador() {
  const [estado, setEstado] = useState({ estado: "desconectado", sessaoAtiva: false });

  useEffect(() => {
    if (!window.nexusSuporte) return;
    let ativo = true;
    window.nexusSuporte.getEstado().then((s) => { if (ativo && s) setEstado(s); });
    const off = window.nexusSuporte.onEstado((s) => { if (ativo) setEstado(s); });
    return () => { ativo = false; try { off(); } catch {} };
  }, []);

  if (!window.nexusSuporte) return null;
  if (estado.estado !== "conectado") return null; // sem conexão = não mostra nada

  const ativa = !!estado.sessaoAtiva;
  return (
    <div
      title={ativa ? "Suporte Nexus está acessando este PDV agora" : "Túnel Nexus conectado (sem acesso ativo no momento)"}
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: ativa ? "#fff" : "#15803d",
        background: ativa ? "#dc2626" : "#dcfce7",
        border: ativa ? "1px solid #b91c1c" : "1px solid #86efac",
        boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
        pointerEvents: "auto",
        userSelect: "none",
        animation: ativa ? "nexus-suporte-pulse 1.6s ease-in-out infinite" : undefined,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: ativa ? "#fff" : "#15803d",
          boxShadow: ativa ? "0 0 6px #fff" : "none",
        }}
      />
      {ativa ? "Suporte Nexus acessando agora" : "Suporte Nexus conectado"}
      <style>{`
        @keyframes nexus-suporte-pulse {
          0%, 100% { box-shadow: 0 4px 14px rgba(220,38,38,0.35); }
          50% { box-shadow: 0 4px 22px rgba(220,38,38,0.75); }
        }
      `}</style>
    </div>
  );
}
