import { useState, useEffect } from "react";
import { api } from "./api";
import Lixeira from "./Lixeira";
import Logo from "./Logo";

const IS_ONLINE = import.meta.env.VITE_ONLINE === "1";

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
  { key: "conexao", icon: "🔗", label: "Conexão" },
  { key: "lixeira", icon: "🗑️", label: "Lixeira" },
];

// ─── FUNCIONÁRIOS + PERMISSÕES ───────────────────────────────────────────────
const SETORES_FUNC = [
  { key: "produtos", icon: "🍔", label: "Produtos e Promoções" },
  { key: "cozinha", icon: "🔥", label: "Cozinha" },
  { key: "caixa", icon: "🍽️", label: "Frente de Caixa" },
  { key: "estoque", icon: "📦", label: "Estoque e Insumos" },
  { key: "financeiro", icon: "💰", label: "Financeiro" },
  { key: "config", icon: "⚙️", label: "Configurações" },
];
const labelSetor = (k) => (SETORES_FUNC.find(s => s.key === k) || {}).label || k;

// ─── LOGIN E ACESSO (PDV) ────────────────────────────────────────────────────
// No PDV desktop o login nasce DESLIGADO (acesso direto). Aqui o dono ativa a
// exigência de login e passa a controlar o acesso por funcionário. A conta da
// Nexus continua existindo sempre (irremovível) para o suporte.
function LoginAcessoCard({ showToast }) {
  const [status, setStatus] = useState(null); // { login_necessario, desktop, login_ativo }
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.loginStatus().then(setStatus).catch(() => {});
  }, []);

  if (!status || !status.desktop) return null; // toggle só faz sentido no PDV

  const alternar = async () => {
    const novo = !status.login_ativo;
    if (novo && !confirm("Ativar o login? A partir do próximo acesso, cada funcionário precisará entrar com email e senha. Cadastre os funcionários abaixo antes de ativar.")) return;
    if (!novo && !confirm("Desativar o login? Qualquer pessoa com acesso ao computador poderá usar todas as seções do PDV.")) return;
    setSalvando(true);
    try {
      const r = await api.loginConfig(novo);
      setStatus(s => ({ ...s, login_ativo: r.login_ativo, login_necessario: r.login_necessario }));
      showToast(r.login_ativo ? "Login ativado! Será exigido no próximo acesso." : "Login desativado — acesso direto liberado.");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Login e acesso ao PDV</div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
          background: status.login_ativo ? "#dcfce7" : "#fef3c7", color: status.login_ativo ? "#16a34a" : "#92400e" }}>
          {status.login_ativo ? "🔒 Login exigido" : "🔓 Acesso direto"}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#78716c", marginBottom: 14 }}>
        Com o login desativado, o PDV abre direto em todas as seções. Ative para exigir email e senha
        por funcionário (cadastre-os abaixo). A conta da Nexus permanece sempre disponível para o suporte.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}>
        <div onClick={salvando ? undefined : alternar}
          style={{ width: 44, height: 24, borderRadius: 12, background: status.login_ativo ? "#15803d" : "#d6d3d1",
            position: "relative", transition: "background 0.2s", cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>
          <div style={{ position: "absolute", top: 2, left: status.login_ativo ? 22 : 2, width: 20, height: 20,
            borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#1c1917" }}>
          {salvando ? "Salvando..." : "Exigir login com email e senha"}
        </span>
      </label>
    </div>
  );
}

function FuncionariosCard({ showToast }) {
  const meuId = (() => { try { return JSON.parse(localStorage.getItem("usuario") || "{}").id; } catch { return null; } })();
  const [lista, setLista] = useState([]);
  const vazia = { nome: "", email: "", senha: "", funcoes: [] };
  const [form, setForm] = useState(vazia);
  const [editId, setEditId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => (api.funcionarios?.listar?.() || Promise.resolve([])).then(setLista).catch(() => {});
  useEffect(() => { carregar(); }, []);

  const toggleFunc = (key) => setForm(f => ({ ...f, funcoes: f.funcoes.includes(key) ? f.funcoes.filter(k => k !== key) : [...f.funcoes, key] }));
  const cancelar = () => { setForm(vazia); setEditId(null); };

  const editar = (u) => {
    setEditId(u.id);
    setForm({ nome: u.nome || "", email: u.email || "", senha: "", funcoes: Array.isArray(u.funcoes) ? u.funcoes : [] });
  };

  const salvar = async () => {
    if (!form.nome.trim()) { showToast("Informe o nome", "#dc2626"); return; }
    if (!editId && (!form.email.trim() || !form.senha)) { showToast("Email e senha são obrigatórios", "#dc2626"); return; }
    if (form.funcoes.length === 0) { showToast("Selecione ao menos uma função", "#dc2626"); return; }
    setSalvando(true);
    try {
      if (editId) {
        const patch = { nome: form.nome.trim(), funcoes: form.funcoes };
        if (form.senha) patch.senha = form.senha;
        await api.funcionarios.atualizar(editId, patch);
        showToast("Funcionário atualizado!");
      } else {
        await api.funcionarios.criar({ nome: form.nome.trim(), email: form.email.trim(), senha: form.senha, funcoes: form.funcoes });
        showToast("Funcionário criado!");
      }
      cancelar();
      await carregar();
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const excluir = async (u) => {
    if (u.id === meuId) { showToast("Você não pode remover a si mesmo", "#dc2626"); return; }
    if (!window.confirm(`Remover o acesso de ${u.nome}?`)) return;
    try { await api.funcionarios.excluir(u.id); await carregar(); showToast("Funcionário removido", "#7c3aed"); }
    catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
  };

  const chkBox = (ativo) => ({
    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
    border: `1.5px solid ${ativo ? "#15803d" : "#e7e5e4"}`, background: ativo ? "#f0fdf4" : "#fff",
    fontSize: 12.5, fontWeight: ativo ? 600 : 500, color: ativo ? "#15803d" : "#57534e",
  });

  return (
    <div className="card">
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Funcionários e permissões</div>
      <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
        Crie acessos para a equipe definindo a senha e <b>quais setores</b> cada um pode usar.
      </div>

      {/* Formulário */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "#fafaf9", border: "1px solid #e7e5e4", borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#57534e" }}>{editId ? "✎ Editar funcionário" : "+ Novo funcionário"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome" style={{ ...cfgInp, width: "100%" }} />
          <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email (login)" type="email" disabled={!!editId} style={{ ...cfgInp, width: "100%", opacity: editId ? 0.6 : 1 }} />
        </div>
        <input value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} placeholder={editId ? "Nova senha (deixe vazio para manter)" : "Senha do funcionário"} type="text" style={{ ...cfgInp, width: "100%" }} />

        <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginTop: 4 }}>FUNÇÕES QUE PODE ACESSAR</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {SETORES_FUNC.map(s => {
            const ativo = form.funcoes.includes(s.key);
            return (
              <label key={s.key} style={chkBox(ativo)}>
                <input type="checkbox" checked={ativo} onChange={() => toggleFunc(s.key)} style={{ accentColor: "#15803d" }} />
                <span>{s.icon} {s.label}</span>
              </label>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button onClick={salvar} disabled={salvando} style={{ ...cfgBtn, flex: 1, opacity: salvando ? 0.6 : 1 }}>
            {salvando ? "Salvando..." : editId ? "💾 Salvar alterações" : "+ Criar funcionário"}
          </button>
          {editId && <button onClick={cancelar} style={{ ...cfgInp, cursor: "pointer", fontWeight: 600, color: "#78716c", background: "#fff" }}>Cancelar</button>}
        </div>
      </div>

      {/* Lista */}
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {lista.length === 0 ? (
          <div style={{ fontSize: 12, color: "#a8a29e", textAlign: "center", padding: 12 }}>Nenhum funcionário cadastrado.</div>
        ) : lista.map(u => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid #e7e5e4", borderRadius: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.nome} {u.id === meuId && <span style={{ fontSize: 10, color: "#15803d", fontWeight: 700 }}>(você)</span>}</div>
              <div style={{ fontSize: 11, color: "#a8a29e" }}>{u.email}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                {u.funcoes === null ? (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#fef3c7", color: "#92400e" }}>👑 Acesso total</span>
                ) : (u.funcoes || []).map(k => (
                  <span key={k} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#f0fdf4", color: "#15803d" }}>{labelSetor(k)}</span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="icon-btn" onClick={() => editar(u)}>✎ Editar</button>
              {u.id !== meuId && <button className="icon-btn del" onClick={() => excluir(u)}>✕ Remover</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CONFIGURAÇÕES GERAIS ────────────────────────────────────────────────────
function GeralTab() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // Horário de funcionamento
  const [horario, setHorario] = useState({ status: "auto", dias: [0,1,2,3,4,5,6], abertura: "19:00", fechamento: "01:00" });
  const [horarioAberto, setHorarioAberto] = useState(false);
  const [salvandoHorario, setSalvandoHorario] = useState(false);

  // Chave Pix
  const [pixCfg, setPixCfg] = useState({ pix_key: "", pix_nome: "" });
  const [salvandoPix, setSalvandoPix] = useState(false);

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    const promises = [api.pix.obter().catch(() => ({ pix_key: "", pix_nome: "" }))];
    if (IS_ONLINE) promises.push(api.horario.obter());
    Promise.all(promises).then(([pix, extra]) => {
      setPixCfg({ pix_key: pix?.pix_key || "", pix_nome: pix?.pix_nome || "" });
      if (IS_ONLINE && extra) { const { aberto, ...cfg } = extra; setHorario(cfg); setHorarioAberto(aberto); }
    }).catch(() => showToast("Erro ao carregar", "#dc2626")).finally(() => setLoading(false));
  }, []);

  const salvarPix = async () => {
    setSalvandoPix(true);
    try {
      await api.pix.salvar({ pix_key: pixCfg.pix_key.trim(), pix_nome: pixCfg.pix_nome.trim() });
      showToast("Chave Pix salva!");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally {
      setSalvandoPix(false);
    }
  };

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

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando...</div>;

  return (
    <div className="anim">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>

        {/* ── HORÁRIO DE FUNCIONAMENTO (só online — PDV não controla isso) ── */}
        {IS_ONLINE && <div className="card">
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
        </div>}

        {/* ── DADOS DO ESTABELECIMENTO (só online) ──────────────────── */}
        {IS_ONLINE && <EstabelecimentoCard showToast={showToast} />}
        {IS_ONLINE && <BotWhatsAppCard showToast={showToast} />}

        {/* ── CHAVE PIX ──────────────────────────────────────────────── */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Chave Pix</div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
            Aparece para o cliente nos detalhes do pedido (pagamento Pix), para que ele possa pagar após finalizar.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 6 }}>CHAVE PIX</label>
              <input value={pixCfg.pix_key} onChange={e => setPixCfg(c => ({ ...c, pix_key: e.target.value }))}
                placeholder="CPF/CNPJ, telefone, e-mail ou chave aleatória"
                style={{ ...cfgInp, width: "100%" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 6 }}>NOME DO FAVORECIDO (opcional)</label>
              <input value={pixCfg.pix_nome} onChange={e => setPixCfg(c => ({ ...c, pix_nome: e.target.value }))}
                placeholder="Ex: Lanches do Marcos LTDA"
                style={{ ...cfgInp, width: "100%" }} />
            </div>
            <button onClick={salvarPix} disabled={salvandoPix}
              style={{ ...cfgBtn, width: "100%", padding: 11, opacity: salvandoPix ? 0.6 : 1 }}>
              {salvandoPix ? "Salvando..." : "💾 Salvar chave Pix"}
            </button>
          </div>
        </div>

        {/* ── LOGIN E ACESSO (só PDV desktop) ────────────────────────── */}
        <LoginAcessoCard showToast={showToast} />

        {/* ── FUNCIONÁRIOS + PERMISSÕES (só PDV) ─────────────────────── */}
        {!IS_ONLINE && <FuncionariosCard showToast={showToast} />}

        {/* Convite de Administradores removido — funcionários entram por
            "Funcionários e permissões" (card acima). */}
      </div>

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}

// ─── DADOS DO ESTABELECIMENTO (online) ──────────────────────────────────────
function EstabelecimentoCard({ showToast }) {
  const [cfg, setCfg] = useState({ nome_estabelecimento: "", whatsapp: "", logo: "" });
  const [salvando, setSalvando] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.config.obter()
      .then(c => setCfg({ nome_estabelecimento: c.nome_estabelecimento || "", whatsapp: c.whatsapp || "", logo: c.logo || "" }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const salvar = async () => {
    setSalvando(true);
    try {
      await api.config.salvar(cfg);
      showToast("Dados salvos!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const handleFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3_000_000) { showToast("Imagem muito grande (máx 3 MB)", "#dc2626"); return; }
    const reader = new FileReader();
    reader.onload = () => setCfg(c => ({ ...c, logo: reader.result }));
    reader.readAsDataURL(file);
  };

  if (loading) return null;

  return (
    <div className="card">
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Dados do Estabelecimento</div>
      <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
        Nome, foto e WhatsApp aparecem no cardápio digital para o cliente.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 6 }}>NOME DO ESTABELECIMENTO</label>
          <input value={cfg.nome_estabelecimento} onChange={e => setCfg(c => ({ ...c, nome_estabelecimento: e.target.value }))}
            placeholder="Ex: Marcos Lojo Lanches" maxLength={60} style={{ ...cfgInp, width: "100%" }} />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 6 }}>FOTO / LOGO</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {cfg.logo && <img src={cfg.logo} alt="logo" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "2px solid #e7e5e4" }} />}
            <label style={{ ...cfgBtn, background: "#1c1917", cursor: "pointer", display: "inline-block" }}>
              {cfg.logo ? "Trocar foto" : "Enviar foto"}
              <input type="file" accept="image/*" onChange={handleFoto} style={{ display: "none" }} />
            </label>
            {cfg.logo && <button onClick={() => setCfg(c => ({ ...c, logo: "" }))} style={{ ...cfgDel }}>Remover</button>}
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 6 }}>WHATSAPP</label>
          <input value={cfg.whatsapp} onChange={e => setCfg(c => ({ ...c, whatsapp: e.target.value }))}
            placeholder="(11) 99999-9999" maxLength={30} style={{ ...cfgInp, width: "100%" }} />
          <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4 }}>Aparece como ícone clicável no cardápio digital.</div>
        </div>

        <button onClick={salvar} disabled={salvando}
          style={{ ...cfgBtn, width: "100%", padding: 11, opacity: salvando ? 0.6 : 1 }}>
          {salvando ? "Salvando..." : "💾 Salvar dados"}
        </button>
      </div>
    </div>
  );
}

// ─── BOT WHATSAPP (online) ───────────────────────────────────────────────────
// O admin não configura nada técnico: a conexão com a Evolution é infra da
// Nexus (pré-configurada no servidor). Aqui ele só ativa o bot lendo o QR
// Code e gerencia a mensagem de alerta (adversidade).
function BotWhatsAppCard({ showToast }) {
  const [mensagem, setMensagem] = useState("");
  const [status, setStatus] = useState(null); // { configurado, estado }
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [loading, setLoading] = useState(true);

  const carregarStatus = () => api.whatsappBot.status().then(setStatus).catch(() => setStatus(null));

  useEffect(() => {
    api.config.obter()
      .then(c => setMensagem(c.mensagem_alerta || ""))
      .catch(() => {})
      .finally(() => setLoading(false));
    carregarStatus();
    const iv = setInterval(carregarStatus, 15000);
    return () => clearInterval(iv);
  }, []);

  const salvarMensagem = async () => {
    setSalvando(true);
    try {
      await api.config.salvar({ mensagem_alerta: mensagem });
      showToast(mensagem.trim() ? "Mensagem de alerta salva!" : "Alerta desativado.");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const enviarAlerta = async () => {
    const msg = mensagem.trim();
    if (!msg) { showToast("Escreva a mensagem de alerta antes de enviar", "#dc2626"); return; }
    if (!confirm("Enviar este alerta agora para TODOS os clientes com pedido em andamento?")) return;
    setEnviando(true);
    try {
      const r = await api.whatsappBot.enviarAlerta(msg);
      showToast(`Alerta enviado para ${r.enviados} de ${r.total} cliente(s)!`);
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setEnviando(false); }
  };

  const conectado = status?.estado === "open";
  const badge = !status || !status.configurado || status.estado === "inacessivel"
    ? { txt: "🔴 Bot indisponível — fale com o suporte", bg: "#fee2e2", cor: "#dc2626" }
    : conectado
      ? { txt: "🟢 Bot ativo", bg: "#dcfce7", cor: "#16a34a" }
      : { txt: "🟡 Aguardando ativação", bg: "#fef3c7", cor: "#92400e" };

  if (loading) return null;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Bot WhatsApp</div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: badge.bg, color: badge.cor }}>{badge.txt}</span>
      </div>
      <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
        O bot responde os clientes no WhatsApp com a saudação do estabelecimento, envia as notificações de cada
        atualização de pedido e — quando o cliente escolhe <b>Pix</b> como pagamento — manda a chave Pix (definida em
        "Dados do Estabelecimento") junto da confirmação.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {conectado ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 10 }}>
            <span style={{ fontSize: 22 }}>✅</span>
            <div style={{ fontSize: 12.5, color: "#15803d", lineHeight: 1.5 }}>
              <b>WhatsApp pareado e funcionando.</b><br />
              Para trocar de aparelho, desconecte no celular atual e ative de novo pelo QR Code.
            </div>
          </div>
        ) : (
          <button onClick={() => window.open("/api/bot/qr", "_blank")}
            style={{ ...cfgBtn, width: "100%", padding: "14px 20px", fontSize: 14, background: "#15803d" }}>
            📱 Ativar bot — ler QR Code no WhatsApp
          </button>
        )}
        {!conectado && (
          <div style={{ fontSize: 11, color: "#a8a29e", textAlign: "center", marginTop: -4 }}>
            No celular do estabelecimento: WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho
          </div>
        )}

        <div style={{ borderTop: "1px solid #f5f5f4", paddingTop: 12 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 6 }}>MENSAGEM DE ALERTA (adversidade)</label>
          <textarea value={mensagem} onChange={e => setMensagem(e.target.value)}
            placeholder="Ex: Estamos sem entregador hoje — só retirada no balcão." maxLength={600} rows={3}
            style={{ ...cfgInp, width: "100%", resize: "vertical", minHeight: 60 }} />
          <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4, marginBottom: 10 }}>
            Enquanto preenchida, o bot inclui o alerta na saudação de quem mandar mensagem. O botão ao lado dispara
            o alerta imediatamente para todos os clientes com pedido em andamento. Deixe vazio para desativar.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={salvarMensagem} disabled={salvando}
              style={{ ...cfgBtn, flex: 1, background: "#fff", color: "#57534e", border: "1.5px solid #e7e5e4", opacity: salvando ? 0.6 : 1 }}>
              {salvando ? "Salvando..." : "💾 Salvar mensagem"}
            </button>
            <button onClick={enviarAlerta} disabled={enviando || !mensagem.trim()}
              style={{ ...cfgBtn, flex: 1, background: "#b45309", opacity: (enviando || !mensagem.trim()) ? 0.5 : 1 }}>
              {enviando ? "Enviando..." : "⚠️ Enviar alerta agora"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CONEXÃO / SYNC ─────────────────────────────────────────────────────────
function ConexaoTab() {
  const [cfg, setCfg] = useState({ url: "", token: "", enabled: false, last_sync: null, last_sync_result: null });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [toast, setToast] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [meuToken, setMeuToken] = useState("");
  const [gerandoToken, setGerandoToken] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    api.sync.config().then(c => setCfg(c)).catch(() => {}).finally(() => setLoading(false));
    api.sync.meuToken().then(r => setMeuToken(r.token)).catch(() => {});
  }, []);

  const copiarMeuToken = async () => {
    try {
      await navigator.clipboard.writeText(meuToken);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { showToast("Não foi possível copiar", "#dc2626"); }
  };

  const gerarNovoToken = async () => {
    if (!confirm("Gerar um novo token invalida o token anterior — qualquer PDV conectado a este vai precisar colar o novo token. Continuar?")) return;
    setGerandoToken(true);
    try {
      const r = await api.sync.regenerarMeuToken();
      setMeuToken(r.token);
      showToast("Novo token gerado!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setGerandoToken(false); }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await api.sync.salvar({ url: cfg.url, token: cfg.token, enabled: cfg.enabled });
      setCfg(c => ({ ...c, ...r }));
      showToast("Configuração salva!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const testar = async () => {
    setTestando(true);
    setTestResult(null);
    try {
      const r = await api.sync.testar();
      setTestResult({ ok: true, nome: r.nome });
      showToast("Conexão OK!");
    } catch (e) {
      setTestResult({ ok: false, erro: e.message });
      showToast("Falha na conexão", "#dc2626");
    }
    finally { setTestando(false); }
  };

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await api.sync.enviarProdutos();
      const agora = new Date().toISOString();
      setCfg(c => ({ ...c, last_sync: agora, last_sync_result: `${r.produtos?.inserido || 0}+${r.produtos?.atualizado || 0} prod, ${r.categorias?.inserido || 0}+${r.categorias?.atualizado || 0} cat, ${r.adicionais?.inserido || 0}+${r.adicionais?.atualizado || 0} adic` }));
      showToast("Catálogo sincronizado!");
    } catch (e) {
      showToast("Erro: " + e.message, "#dc2626");
    }
    finally { setSincronizando(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando...</div>;

  const statusBadge = (ok, label) => (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
      background: ok ? "#dcfce7" : "#fee2e2", color: ok ? "#16a34a" : "#dc2626" }}>{label}</span>
  );

  return (
    <div className="anim">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>

        {/* Token que esta instalação expõe para outros PDVs se conectarem a ela */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Token desta plataforma</div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 14 }}>
            Cole este token no campo "Token de autenticação" de outro PDV para que ele consiga enviar o catálogo pra cá.
            Diferente do login, este token não expira — só muda se você gerar um novo.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={meuToken} onFocus={e => e.target.select()}
              style={{ ...cfgInp, flex: 1, fontFamily: "monospace", fontSize: 12, background: "#fafaf9" }} />
            <button onClick={copiarMeuToken} disabled={!meuToken}
              style={{ ...cfgBtn, background: copiado ? "#15803d" : "#1c1917", opacity: meuToken ? 1 : 0.5, whiteSpace: "nowrap" }}>
              {copiado ? "✅ Copiado" : "📋 Copiar"}
            </button>
            <button onClick={gerarNovoToken} disabled={gerandoToken}
              style={{ ...cfgBtn, background: "#b91c1c", opacity: gerandoToken ? 0.6 : 1, whiteSpace: "nowrap" }}>
              {gerandoToken ? "Gerando..." : "🔁 Gerar novo"}
            </button>
          </div>
        </div>

        {!IS_ONLINE && <>
        {/* Formulário de conexão */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Conexão com servidor remoto</div>
            {statusBadge(cfg.enabled, cfg.enabled ? "🟢 Ativo" : "🔴 Desativado")}
          </div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 18 }}>
            Configure a URL e o token de autenticação do servidor online para sincronizar produtos, categorias e adicionais.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 6 }}>URL DO SERVIDOR</label>
              <input value={cfg.url} onChange={e => setCfg(c => ({ ...c, url: e.target.value }))}
                placeholder="https://meu-servidor.com" style={{ ...cfgInp, width: "100%" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 6 }}>TOKEN DE AUTENTICAÇÃO</label>
              <input value={cfg.token} onChange={e => setCfg(c => ({ ...c, token: e.target.value }))}
                placeholder="Cole aqui o 'Token desta plataforma' copiado do servidor remoto" type="password" style={{ ...cfgInp, width: "100%" }} />
            </div>

            {/* Toggle ativar */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 0" }}>
              <div onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
                style={{ width: 44, height: 24, borderRadius: 12, background: cfg.enabled ? "#15803d" : "#d6d3d1",
                  position: "relative", transition: "background 0.2s", cursor: "pointer" }}>
                <div style={{ position: "absolute", top: 2, left: cfg.enabled ? 22 : 2, width: 20, height: 20,
                  borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#1c1917" }}>Sincronização ativada</span>
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={salvar} disabled={salvando}
                style={{ ...cfgBtn, flex: 1, opacity: salvando ? 0.6 : 1 }}>
                {salvando ? "Salvando..." : "💾 Salvar"}
              </button>
              <button onClick={testar} disabled={testando || !cfg.url}
                style={{ ...cfgBtn, flex: 1, background: "#1c1917", opacity: (testando || !cfg.url) ? 0.5 : 1 }}>
                {testando ? "Testando..." : "🔌 Testar conexão"}
              </button>
            </div>
          </div>

          {/* Resultado do teste */}
          {testResult && (
            <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8,
              background: testResult.ok ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}` }}>
              {testResult.ok ? (
                <div style={{ fontSize: 12.5, color: "#15803d" }}>
                  ✅ Conectado com sucesso — <b>{testResult.nome}</b>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                  ❌ {testResult.erro}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sincronização manual */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Sincronizar catálogo</div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 16 }}>
            Envia todos os produtos, categorias e adicionais do PDV local para o servidor remoto (sobrescreve por ID).
          </div>

          {cfg.last_sync && (
            <div style={{ fontSize: 12, color: "#78716c", marginBottom: 12, padding: "8px 12px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f5f5f4" }}>
              <div><b>Última sync:</b> {new Date(cfg.last_sync).toLocaleString("pt-BR")}</div>
              {cfg.last_sync_result && <div style={{ marginTop: 4 }}>{cfg.last_sync_result}</div>}
            </div>
          )}

          <button onClick={sincronizar} disabled={sincronizando || !cfg.url || !cfg.token}
            style={{ ...cfgBtn, width: "100%", padding: 11, background: "#15803d",
              opacity: (sincronizando || !cfg.url || !cfg.token) ? 0.5 : 1 }}>
            {sincronizando ? "Sincronizando..." : "🔄 Sincronizar agora"}
          </button>

          {(!cfg.url || !cfg.token) && (
            <div style={{ fontSize: 11, color: "#a8a29e", textAlign: "center", marginTop: 8 }}>
              Configure a URL e o token acima antes de sincronizar.
            </div>
          )}
        </div>
        </>}
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
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Logo size={32} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: "#1c1917" }}>Configurações</span>
        </div>

        <div style={{ width: 1, height: 22, background: "#e7e5e4" }} />

        <div className="pa-nav">
          {NAV_TABS.map(t => (
            <button key={t.key} className={`pa-pill ${aba === t.key ? "active" : ""}`} onClick={() => setAba(t.key)}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
      </header>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>
        {aba === "geral" && <GeralTab />}
        {aba === "conexao" && <ConexaoTab />}
        {aba === "lixeira" && <Lixeira />}
      </div>
    </div>
  );
}
