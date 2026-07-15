import { useState } from "react";
import { api } from "./api";
import Logo from "./Logo";

const ETAPAS = ["boas_vindas", "modo", "modulos", "nome", "pronto"];

const MODULOS_OPCIONAIS = [
  { id: "financeiro", icon: "💰", label: "Financeiro",       desc: "Lançamentos, DRE, fluxo de caixa e custos fixos" },
  { id: "cozinha",    icon: "🔥", label: "Cozinha",          desc: "Painel de pedidos para a cozinha em tempo real" },
  { id: "estoque",    icon: "📦", label: "Estoque e Insumos", desc: "Controle de entradas, saídas e fichas técnicas" },
  { id: "fiscal",     icon: "🧾", label: "Fiscal / NFC-e",   desc: "Emissão de notas fiscais de consumidor" },
];

export default function SetupWizard({ onComplete }) {
  const [etapa, setEtapa] = useState(0);
  const [modo, setModo] = useState("");
  const [modulos, setModulos] = useState(["financeiro", "cozinha", "estoque"]);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  const toggleModulo = (id) => setModulos(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  const avancar = () => setEtapa(e => Math.min(e + 1, ETAPAS.length - 1));
  const voltar = () => setEtapa(e => Math.max(e - 1, 0));

  const finalizar = async () => {
    setSalvando(true);
    try {
      await api.perfil.salvar({ modo, modulos, nome_estabelecimento: nome });
      onComplete({ modo, modulos, nome });
    } catch (e) {
      alert("Erro ao salvar: " + e.message);
    } finally { setSalvando(false); }
  };

  const wrap = { fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f5f5f4", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
  const card = { background: "#fff", borderRadius: 20, padding: "44px 40px", width: 520, maxWidth: "94vw", boxShadow: "0 12px 40px rgba(0,0,0,0.08)", textAlign: "center" };
  const title = { fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#1c1917", marginBottom: 6 };
  const sub = { fontSize: 13, color: "#78716c", marginBottom: 28, lineHeight: 1.5 };
  const btn = (primary) => ({
    padding: "12px 28px", border: primary ? "none" : "1.5px solid #e7e5e4", borderRadius: 10,
    background: primary ? "#15803d" : "#fff", color: primary ? "#fff" : "#78716c",
    fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    opacity: salvando ? 0.6 : 1,
  });
  const dots = (
    <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
      {ETAPAS.map((_, i) => (
        <div key={i} style={{ width: i === etapa ? 24 : 8, height: 8, borderRadius: 4, background: i <= etapa ? "#15803d" : "#e7e5e4", transition: "all 0.3s" }} />
      ))}
    </div>
  );

  return (
    <div style={wrap}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={card}>
        {dots}

        {/* Boas-vindas */}
        {etapa === 0 && (<>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><Logo size={72} /></div>
          <div style={title}>Bem-vindo ao Nexus PDV</div>
          <div style={sub}>Vamos configurar o sistema para o seu estabelecimento. Leva menos de um minuto.</div>
          <button style={btn(true)} onClick={avancar}>Começar</button>
        </>)}

        {/* Modo: Mesas vs Balcão */}
        {etapa === 1 && (<>
          <div style={title}>Como funciona seu atendimento?</div>
          <div style={sub}>Isso define como o Frente de Caixa vai funcionar. Você pode mudar depois.</div>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 24 }}>
            {[
              { id: "mesas", icon: "🍽️", label: "Mesas", desc: "Clientes sentam, pedem pelo QR Code ou pelo garçom" },
              { id: "balcao", icon: "🏪", label: "Balcão", desc: "Pedidos no caixa, sem mapa de mesas" },
            ].map(op => (
              <div key={op.id} onClick={() => setModo(op.id)}
                style={{
                  flex: 1, maxWidth: 200, padding: "24px 16px", borderRadius: 16, cursor: "pointer", textAlign: "center",
                  border: `2.5px solid ${modo === op.id ? "#15803d" : "#e7e5e4"}`,
                  background: modo === op.id ? "#f0fdf4" : "#fafaf9",
                  transition: "all 0.15s",
                }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{op.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: modo === op.id ? "#15803d" : "#1c1917" }}>{op.label}</div>
                <div style={{ fontSize: 11.5, color: "#78716c", marginTop: 4, lineHeight: 1.4 }}>{op.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button style={btn(false)} onClick={voltar}>Voltar</button>
            <button style={btn(true)} onClick={avancar} disabled={!modo}>Continuar</button>
          </div>
        </>)}

        {/* Módulos opcionais */}
        {etapa === 2 && (<>
          <div style={title}>Quais módulos deseja usar?</div>
          <div style={sub}>Frente de Caixa, Produtos e Financeiro estão sempre ativos. Selecione os opcionais:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24, textAlign: "left" }}>
            {MODULOS_OPCIONAIS.map(m => {
              const ativo = modulos.includes(m.id);
              return (
                <div key={m.id} onClick={() => toggleModulo(m.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 14, cursor: "pointer",
                    border: `2px solid ${ativo ? "#15803d" : "#e7e5e4"}`, background: ativo ? "#f0fdf4" : "#fafaf9",
                    transition: "all 0.15s",
                  }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: ativo ? "#15803d" : "#e7e5e4", color: ativo ? "#fff" : "#78716c", flexShrink: 0 }}>
                    {ativo ? "✓" : m.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: ativo ? "#15803d" : "#1c1917" }}>{m.label}</div>
                    <div style={{ fontSize: 12, color: "#78716c" }}>{m.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button style={btn(false)} onClick={voltar}>Voltar</button>
            <button style={btn(true)} onClick={avancar}>Continuar</button>
          </div>
        </>)}

        {/* Nome do estabelecimento */}
        {etapa === 3 && (<>
          <div style={title}>Nome do estabelecimento</div>
          <div style={sub}>Aparece nas impressões, cupons e no cardápio digital.</div>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Lanchonete do João" maxLength={60}
            style={{ width: "100%", padding: "14px 16px", border: "2px solid #e7e5e4", borderRadius: 12, fontSize: 15, outline: "none", fontFamily: "'DM Sans', sans-serif", color: "#1c1917", marginBottom: 24, textAlign: "center" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#15803d"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#e7e5e4"; }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button style={btn(false)} onClick={voltar}>Voltar</button>
            <button style={btn(true)} onClick={avancar} disabled={!nome.trim()}>Continuar</button>
          </div>
        </>)}

        {/* Resumo e finalizar */}
        {etapa === 4 && (<>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <div style={title}>Tudo pronto!</div>
          <div style={sub}>Confira as escolhas e finalize a configuração:</div>
          <div style={{ textAlign: "left", background: "#fafaf9", borderRadius: 14, padding: "18px 20px", marginBottom: 24, border: "1.5px solid #e7e5e4" }}>
            <div style={{ fontSize: 13, marginBottom: 10 }}><strong>Estabelecimento:</strong> {nome}</div>
            <div style={{ fontSize: 13, marginBottom: 10 }}><strong>Modo:</strong> {modo === "mesas" ? "Mesas (salão)" : "Balcão"}</div>
            <div style={{ fontSize: 13 }}><strong>Módulos:</strong> Frente de Caixa, Produtos{modulos.length > 0 ? ", " + modulos.map(m => MODULOS_OPCIONAIS.find(o => o.id === m)?.label || m).join(", ") : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button style={btn(false)} onClick={voltar}>Voltar</button>
            <button style={btn(true)} onClick={finalizar} disabled={salvando}>{salvando ? "Salvando..." : "Finalizar e entrar"}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}
