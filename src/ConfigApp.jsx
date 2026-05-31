import { useState, useEffect } from "react";
import { api } from "./api";
import Lixeira from "./Lixeira";

const cfgInp = { padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917" };
const cfgBtn = { background: "#F38C24", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" };
const cfgDel = { background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#dc2626" };
const cfgRow = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "10px 14px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f5f5f4" };

const DIAS_SEMANA = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const NAV_TABS = [
  { key: "geral", icon: "⚙️", label: "Geral" },
  { key: "lixeira", icon: "🗑️", label: "Lixeira" },
];

// ─── CONFIGURAÇÕES GERAIS ────────────────────────────────────────────────────
function GeralTab() {
  const [emails, setEmails] = useState([]);
  const [novoEmail, setNovoEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // Horário de funcionamento
  const [horario, setHorario] = useState({ status: "auto", dias: [0,1,2,3,4,5,6], abertura: "19:00", fechamento: "01:00" });
  const [horarioAberto, setHorarioAberto] = useState(false);
  const [salvandoHorario, setSalvandoHorario] = useState(false);

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    Promise.all([
      api.adminEmails.listar(),
      api.horario.obter(),
    ]).then(([em, hor]) => {
      setEmails(em);
      const { aberto, ...cfg } = hor;
      setHorario(cfg);
      setHorarioAberto(aberto);
    }).catch(() => showToast("Erro ao carregar", "#dc2626")).finally(() => setLoading(false));
  }, []);

  const salvarHorario = async (novoHorario) => {
    setSalvandoHorario(true);
    try {
      const resultado = await api.horario.salvar(novoHorario);
      const { aberto, ...cfg } = resultado;
      setHorario(cfg);
      setHorarioAberto(aberto);
      showToast("Horário salvo!");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally {
      setSalvandoHorario(false);
    }
  };

  const toggleDia = (dia) => {
    const novosDias = horario.dias.includes(dia)
      ? horario.dias.filter(d => d !== dia)
      : [...horario.dias, dia].sort((a, b) => a - b);
    setHorario(h => ({ ...h, dias: novosDias }));
  };

  // ── Admin Emails ──
  const adicionarEmail = async () => {
    const email = novoEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return showToast("Digite um email valido", "#dc2626");
    if (emails.some(e => e.email === email)) return showToast("Email ja esta na lista", "#d97706");
    try {
      await api.adminEmails.adicionar(email);
      setEmails(es => [...es, { email, created_at: new Date().toISOString() }]);
      setNovoEmail("");
      showToast("Convite admin adicionado!");
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  const removerEmail = async (email) => {
    try {
      await api.adminEmails.remover(email);
      setEmails(es => es.filter(e => e.email !== email));
      showToast("Email removido", "#7c3aed");
    } catch (err) { showToast("Erro: " + err.message, "#dc2626"); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando...</div>;

  return (
    <div className="anim">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>

        {/* ── HORÁRIO DE FUNCIONAMENTO ───────────────────────────────── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Horário de Funcionamento</div>
            <span style={{
              background: horarioAberto ? "#dcfce7" : "#fee2e2",
              color: horarioAberto ? "#16a34a" : "#dc2626",
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
            }}>
              {horarioAberto ? "🟢 Aberto agora" : "🔴 Fechado agora"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 18 }}>
            Controle quando a plataforma aceita pedidos e o que o bot responde no WhatsApp.
          </div>

          {/* Status override */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 8 }}>MODO DE OPERAÇÃO</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { value: "auto", label: "⏰ Automático", desc: "Segue os horários abaixo" },
                { value: "aberto", label: "🟢 Forçar aberto", desc: "Sempre aberto" },
                { value: "fechado", label: "🔴 Forçar fechado", desc: "Sempre fechado" },
              ].map(opt => (
                <button key={opt.value} onClick={() => setHorario(h => ({ ...h, status: opt.value }))}
                  title={opt.desc}
                  style={{
                    flex: 1, padding: "9px 8px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                    background: horario.status === opt.value ? "#1c1917" : "#fff",
                    color: horario.status === opt.value ? "#fff" : "#57534e",
                    border: horario.status === opt.value ? "2px solid #1c1917" : "2px solid #e7e5e4",
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dias da semana */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 8 }}>DIAS DE FUNCIONAMENTO</div>
            <div style={{ display: "flex", gap: 6 }}>
              {DIAS_SEMANA.map(d => {
                const ativo = horario.dias.includes(d.value);
                return (
                  <button key={d.value} onClick={() => toggleDia(d.value)}
                    style={{
                      flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                      background: ativo ? "#F38C24" : "#f5f5f4",
                      color: ativo ? "#fff" : "#a8a29e",
                      border: ativo ? "2px solid #F38C24" : "2px solid #e7e5e4",
                    }}>
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horário */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 8 }}>HORÁRIO</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: "#78716c", display: "block", marginBottom: 4 }}>Abre às</label>
                <input type="time" value={horario.abertura}
                  onChange={e => setHorario(h => ({ ...h, abertura: e.target.value }))}
                  style={{ ...cfgInp, width: "100%" }} />
              </div>
              <div style={{ fontSize: 18, color: "#a8a29e", paddingTop: 18 }}>→</div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: "#78716c", display: "block", marginBottom: 4 }}>Fecha às</label>
                <input type="time" value={horario.fechamento}
                  onChange={e => setHorario(h => ({ ...h, fechamento: e.target.value }))}
                  style={{ ...cfgInp, width: "100%" }} />
              </div>
            </div>
            {horario.abertura > horario.fechamento || horario.fechamento < horario.abertura ? (
              <div style={{ fontSize: 11, color: "#78716c", marginTop: 6, fontStyle: "italic" }}>
                ℹ️ Horário atravessa a meia-noite (ex: 19:00 às 01:00)
              </div>
            ) : null}
          </div>

          <button onClick={() => salvarHorario(horario)} disabled={salvandoHorario}
            style={{ ...cfgBtn, width: "100%", padding: 11, opacity: salvandoHorario ? 0.6 : 1 }}>
            {salvandoHorario ? "Salvando..." : "💾 Salvar configuração"}
          </button>
        </div>

        {/* ── ADMIN EMAILS ───────────────────────────────────────────── */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Convite de Administradores</div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
            Adicione emails que terao acesso admin ao se registrarem.
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input value={novoEmail} onChange={e => setNovoEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && adicionarEmail()}
              placeholder="email@exemplo.com" style={{ ...cfgInp, flex: 1, minWidth: 0 }} />
            <button onClick={adicionarEmail} style={cfgBtn}>+ Convidar</button>
          </div>

          {emails.length === 0 ? (
            <div style={{ textAlign: "center", padding: 16, color: "#a8a29e", fontSize: 13 }}>Nenhum email admin cadastrado.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {emails.map(e => (
                <div key={e.email} style={cfgRow}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{e.email}</span>
                    <span style={{ fontSize: 10, color: "#a8a29e", marginLeft: 8 }}>
                      adicionado em {new Date(e.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <button onClick={() => removerEmail(e.email)} style={cfgDel}>Remover</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}

// ─── CONFIG APP ──────────────────────────────────────────────────────────────
export default function ConfigApp({ onNavegar }) {
  const [aba, setAba] = useState("geral");

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
        .anim { animation: fi 0.25s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 999; animation: fi 0.3s ease; color: #fff; }
        .pa-nav { display: flex; gap: 2px; background: #f5f5f4; border-radius: 10px; padding: 3px; flex-wrap: wrap; }
        .pa-pill { padding: 8px 18px; border-radius: 8px; border: none; background: none; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 13px; color: #78716c; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
        .pa-pill:hover { background: #fff; color: #1c1917; }
        .pa-pill.active { background: #fff; color: #78716c; font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        @media (max-width: 720px) { .pa-nav { width: 100%; } .pa-pill { flex: 1 1 100px; justify-content: center; } }
      `}</style>

      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e7e5e4", padding: "0 32px", minHeight: 56, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => onNavegar(null)} style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <img src="/logo.png" alt="Logo" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
            onError={e => { e.currentTarget.style.display = "none"; }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: "#1c1917" }}>Configurações</span>
        </button>

        <div style={{ width: 1, height: 22, background: "#e7e5e4" }} />

        <div className="pa-nav">
          {NAV_TABS.map(t => (
            <button key={t.key} className={`pa-pill ${aba === t.key ? "active" : ""}`} onClick={() => setAba(t.key)}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={() => onNavegar(null)} style={{ padding: "6px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
          {"←"} Início
        </button>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>
        {aba === "geral" && <GeralTab />}
        {aba === "lixeira" && <Lixeira />}
      </div>
    </div>
  );
}
