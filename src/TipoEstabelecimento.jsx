// ─── 1º acesso: "Qual o tipo do seu estabelecimento?" ────────────────────────
// Multi-select — o cliente pode ter mais de um estabelecimento no mesmo
// computador (mundos separados, mesma licença). A lanchonete usa este stack;
// o mercado abre o stack próprio (backend/ + frontend/ — porta separada).
import { useState } from "react";
import { api } from "./api";
import NexusLogo from "./NexusLogo";

const OPCOES = [
  {
    key: "lanchonete", icone: "🍔",
    titulo: "Fast Food / Delivery",
    desc: "Lanchonete, pizzaria, pastelaria, sorveteria, açaiteria, hamburgueria, cafeteria, marmitaria e conveniência — mesas, comandas, cozinha e cardápio digital",
  },
  {
    key: "mercado", icone: "🛒",
    titulo: "Mercado",
    desc: "Caixa com leitor de código de barras, estoque por setor, inventário e fechamento de gaveta",
  },
  {
    key: "breve", icone: "⏳",
    titulo: "Outros tipos",
    desc: "Em breve implementaremos outros ramos de estabelecimento",
    desabilitado: true,
  },
];

// Info de exibição de cada tipo (reusada no seletor pré-login)
export const INFO_TIPOS = {
  lanchonete: { icone: "🍔", titulo: "Fast Food / Delivery", desc: "Mesas, comandas, cozinha e cardápio online" },
  mercado:    { icone: "🛒", titulo: "Mercado", desc: "Caixa com código de barras, estoque e inventário" },
};

// ─── Pré-login: qual estabelecimento usar NESTA sessão ───────────────────────
// Aparece quando o PDV tem mais de um tipo habilitado (mundos separados).
export function EscolhaEstabelecimento({ tipos, onEscolher }) {
  return (
    <div style={{
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif", minHeight: "100vh",
      background: "radial-gradient(1200px 700px at 15% 10%, #0f2b1e 0%, #0a1712 45%, #050a08 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: "#f5f5f4",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .nx-estab-card { transition: transform 0.15s, border-color 0.15s; }
        .nx-estab-card:hover { transform: translateY(-3px); border-color: #16a34a !important; }
      `}</style>

      <div style={{ width: 640, maxWidth: "94vw", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><NexusLogo size={68} /></div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 8 }}>
          Qual estabelecimento você vai usar?
        </div>
        <div style={{ fontSize: 13, color: "#a8a29e", marginBottom: 30 }}>
          Cada estabelecimento é um mundo separado — vendas, estoque e financeiro independentes.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(tipos.length, 2)}, 1fr)`, gap: 16 }}>
          {tipos.map(t => {
            const info = INFO_TIPOS[t] || { icone: "🏬", titulo: t, desc: "" };
            return (
              <button key={t} className="nx-estab-card" onClick={() => onEscolher(t)}
                style={{
                  padding: "34px 22px", borderRadius: 18, cursor: "pointer", textAlign: "center",
                  fontFamily: "inherit", color: "#f5f5f4",
                  border: "2px solid rgba(255,255,255,0.10)", background: "rgba(20,32,26,0.75)",
                }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>{info.icone}</div>
                <div style={{ fontSize: 16.5, fontWeight: 800, fontFamily: "'Inter', sans-serif" }}>{info.titulo}</div>
                <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 6, lineHeight: 1.5 }}>{info.desc}</div>
                <div style={{ marginTop: 16, display: "inline-block", padding: "8px 22px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)", color: "#fff" }}>
                  Entrar →
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TipoEstabelecimento({ onConfirmado }) {
  const [selecionados, setSelecionados] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const toggle = (key) => {
    setErro("");
    setSelecionados(s => s.includes(key) ? s.filter(k => k !== key) : [...s, key]);
  };

  const confirmar = async () => {
    if (selecionados.length === 0) { setErro("Selecione ao menos um tipo de estabelecimento"); return; }
    setSalvando(true);
    try {
      const r = await api.tiposEstabelecimento.salvar(selecionados);
      onConfirmado(r.tipos);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif", minHeight: "100vh",
      background: "radial-gradient(1200px 700px at 15% 10%, #0f2b1e 0%, #0a1712 45%, #050a08 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: "#f5f5f4",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      <div style={{
        width: 620, maxWidth: "94vw", padding: "42px 40px", borderRadius: 22,
        background: "rgba(20,32,26,0.75)", border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><NexusLogo size={72} /></div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 800, color: "#fff" }}>
            Qual o tipo do seu estabelecimento?
          </div>
          <div style={{ fontSize: 13, color: "#a8a29e", marginTop: 8, lineHeight: 1.5 }}>
            Selecione um ou mais — cada tipo funciona como um mundo separado no mesmo PDV
            (financeiro, estoque e vendas independentes).
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
          {OPCOES.map(op => {
            const ativo = selecionados.includes(op.key);
            return (
              <button key={op.key} disabled={op.desabilitado}
                onClick={() => toggle(op.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 16, textAlign: "left",
                  padding: "18px 20px", borderRadius: 14, cursor: op.desabilitado ? "not-allowed" : "pointer",
                  fontFamily: "inherit", transition: "all 0.15s",
                  border: `2px solid ${ativo ? "#16a34a" : "rgba(255,255,255,0.09)"}`,
                  background: ativo ? "rgba(22,163,74,0.14)" : "rgba(255,255,255,0.03)",
                  opacity: op.desabilitado ? 0.45 : 1,
                }}>
                <div style={{ fontSize: 32, flexShrink: 0 }}>{op.icone}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, color: ativo ? "#4ade80" : "#f5f5f4" }}>{op.titulo}</div>
                  <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 3, lineHeight: 1.45 }}>{op.desc}</div>
                </div>
                <div style={{
                  width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                  border: `2px solid ${ativo ? "#16a34a" : "rgba(255,255,255,0.2)"}`,
                  background: ativo ? "#16a34a" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 15, fontWeight: 800,
                }}>{ativo ? "✓" : ""}</div>
              </button>
            );
          })}
        </div>

        {erro && (
          <div style={{ background: "rgba(220,38,38,0.10)", border: "1px solid rgba(220,38,38,0.30)", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#fca5a5", marginBottom: 14 }}>
            {erro}
          </div>
        )}

        <button onClick={confirmar} disabled={salvando}
          style={{
            width: "100%", padding: "14px 20px", border: "none", borderRadius: 12, cursor: "pointer",
            fontSize: 15, fontWeight: 700, fontFamily: "inherit", color: "#fff",
            background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
            boxShadow: "0 8px 24px rgba(21,128,61,0.30)", opacity: salvando ? 0.6 : 1,
          }}>
          {salvando ? "Salvando..." : "Continuar →"}
        </button>
      </div>
    </div>
  );
}
