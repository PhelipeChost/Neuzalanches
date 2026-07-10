// ─── Ajustes: loja, horário, impressora e usuários (admin) ───────────────────
import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { s, cores } from "../styles";

const DIAS = [
  { v: 0, l: "Dom" }, { v: 1, l: "Seg" }, { v: 2, l: "Ter" }, { v: 3, l: "Qua" },
  { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" },
];

const PAGINAS_PERM = [
  { key: "dashboard", label: "Início" },
  { key: "pdv", label: "PDV (Caixa)" },
  { key: "products", label: "Produtos" },
  { key: "stock", label: "Estoque" },
  { key: "suppliers", label: "Fornecedores" },
  { key: "finance", label: "Financeiro" },
  { key: "settings", label: "Ajustes" },
];

export default function Settings() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [impressoras, setImpressoras] = useState([]);
  const [toast, setToast] = useState(null);
  const showToast = (msg, cor = cores.verdeEscuro) => { setToast({ msg, cor }); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    api.settings.obter().then(c => setCfg({ ...c, open_days: JSON.parse(c.open_days || "[]") })).catch(() => {});
    api.print.impressoras().then(setImpressoras).catch(() => {});
  }, []);

  const salvar = async () => {
    try {
      await api.settings.salvar({ ...cfg, open_days: JSON.stringify(cfg.open_days) });
      showToast("Ajustes salvos!");
    } catch (e) { showToast(e.message, cores.vermelho); }
  };

  if (!cfg) return <div style={{ color: cores.ink3, padding: 40 }}>Carregando...</div>;

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={s.h1}>⚙️ Ajustes</div>
        <div style={s.sub}>Configurações da loja, impressora e usuários.</div>
      </div>

      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Loja</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={s.label}>Nome da loja</label>
            <input style={s.input} value={cfg.store_name} onChange={e => setCfg({ ...cfg, store_name: e.target.value })} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><label style={s.label}>Abre às</label>
              <input style={s.input} type="time" value={cfg.opening_time} onChange={e => setCfg({ ...cfg, opening_time: e.target.value })} /></div>
            <div><label style={s.label}>Fecha às</label>
              <input style={s.input} type="time" value={cfg.closing_time} onChange={e => setCfg({ ...cfg, closing_time: e.target.value })} /></div>
            <div><label style={s.label}>Fundo padrão (R$)</label>
              <input style={s.input} type="number" step="0.01" value={cfg.default_opening_amount} onChange={e => setCfg({ ...cfg, default_opening_amount: e.target.value })} /></div>
          </div>
          <div>
            <label style={s.label}>Dias abertos</label>
            <div style={{ display: "flex", gap: 6 }}>
              {DIAS.map(d => {
                const ativo = cfg.open_days.includes(d.v);
                return (
                  <button key={d.v}
                    onClick={() => setCfg(c => ({ ...c, open_days: ativo ? c.open_days.filter(x => x !== d.v) : [...c.open_days, d.v].sort() }))}
                    style={{
                      flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      border: `1.5px solid ${ativo ? cores.verde : cores.linha}`,
                      background: ativo ? cores.verdeBg : "#fff", color: ativo ? cores.verde : cores.ink3,
                    }}>{d.l}</button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>🖨️ Impressora de cupom (XP-80)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={s.label}>Modo de impressão</label>
            <select style={{ ...s.input, cursor: "pointer" }} value={cfg.print_mode} onChange={e => setCfg({ ...cfg, print_mode: e.target.value })}>
              <option value="agent">Agente local (recomendado)</option>
              <option value="local">Direto do servidor (spooler)</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Impressora</label>
            <select style={{ ...s.input, cursor: "pointer" }} value={cfg.printer_name} onChange={e => setCfg({ ...cfg, printer_name: e.target.value })}>
              <option value="">Selecione...</option>
              {impressoras.map(i => <option key={i} value={i}>{i}</option>)}
              {cfg.printer_name && !impressoras.includes(cfg.printer_name) && <option value={cfg.printer_name}>{cfg.printer_name}</option>}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: cores.ink3, marginTop: 8 }}>
          O cupom sai em ESC/POS 80mm. Se a venda tiver NFC-e vinculada, o cupom inclui a chave e o QR Code da nota.
        </div>
      </div>

      <button style={{ ...s.btn, width: "100%", padding: 13, marginBottom: 24 }} onClick={salvar}>💾 Salvar ajustes</button>

      {user?.is_admin && <Usuarios showToast={showToast} />}

      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", borderRadius: 10, background: toast.cor, color: "#fff", fontSize: 13.5, zIndex: 999 }}>{toast.msg}</div>}
    </div>
  );
}

function Usuarios({ showToast }) {
  const [lista, setLista] = useState([]);
  const VAZIO = { name: "", username: "", password: "", permissions: ["pdv"], is_admin: false };
  const [form, setForm] = useState(VAZIO);
  const [editando, setEditando] = useState(null);

  const carregar = () => api.users.listar().then(setLista).catch(() => {});
  useEffect(() => { carregar(); }, []);

  const togglePerm = (k) => setForm(f => ({
    ...f, permissions: f.permissions.includes(k) ? f.permissions.filter(x => x !== k) : [...f.permissions, k],
  }));

  const salvar = async () => {
    if (!form.name || (!editando && (!form.username || !form.password))) return showToast("Preencha nome, usuário e senha", cores.vermelho);
    try {
      if (editando) {
        const patch = { name: form.name, permissions: form.permissions, is_admin: form.is_admin };
        if (form.password) patch.password = form.password;
        await api.users.atualizar(editando, patch);
        showToast("Usuário atualizado!");
      } else {
        await api.users.criar(form);
        showToast("Usuário criado!");
      }
      setForm(VAZIO); setEditando(null); carregar();
    } catch (e) { showToast(e.message, cores.vermelho); }
  };

  return (
    <div style={s.card}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>👥 Usuários e permissões</div>
      <div style={{ fontSize: 12, color: cores.ink3, marginBottom: 14 }}>
        Operador com permissão só de <b>PDV</b> entra direto no modo quiosque (caixa em tela cheia).
      </div>

      <div style={{ background: "#fafaf9", border: `1px solid ${cores.linha}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={s.label}>Nome</label><input style={s.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><label style={s.label}>Usuário (login)</label><input style={s.input} disabled={!!editando} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></div>
          <div><label style={s.label}>{editando ? "Nova senha (opcional)" : "Senha"}</label><input style={s.input} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
        </div>
        <label style={{ ...s.label, marginBottom: 8 }}>Páginas liberadas</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {PAGINAS_PERM.map(p => {
            const ativo = form.permissions.includes(p.key);
            return (
              <button key={p.key} onClick={() => togglePerm(p.key)}
                style={{
                  padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  border: `1.5px solid ${ativo ? cores.verde : cores.linha}`,
                  background: ativo ? cores.verdeBg : "#fff", color: ativo ? cores.verde : cores.ink2,
                }}>{p.label}</button>
            );
          })}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={form.is_admin} onChange={e => setForm({ ...form, is_admin: e.target.checked })} style={{ accentColor: cores.verde }} />
          Administrador (acesso total)
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={s.btn} onClick={salvar}>{editando ? "💾 Salvar" : "+ Criar usuário"}</button>
          {editando && <button style={s.btnSec} onClick={() => { setForm(VAZIO); setEditando(null); }}>Cancelar</button>}
        </div>
      </div>

      {lista.map(u => (
        <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${cores.linha}`, borderRadius: 10, marginBottom: 8, opacity: u.active ? 1 : 0.5 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.name} <span style={{ color: cores.ink3, fontSize: 11.5 }}>({u.username})</span></div>
            <div style={{ fontSize: 11, color: cores.ink3, marginTop: 2 }}>
              {u.is_admin ? "👑 Administrador" : u.permissions.map(k => PAGINAS_PERM.find(p => p.key === k)?.label || k).join(" · ")}
            </div>
          </div>
          <button style={{ ...s.btnSec, padding: "5px 12px", fontSize: 12 }}
            onClick={() => { setEditando(u.id); setForm({ name: u.name, username: u.username, password: "", permissions: u.permissions, is_admin: u.is_admin }); }}>
            ✎ Editar
          </button>
          {u.active && <button style={{ ...s.btnDanger, padding: "5px 12px", fontSize: 12 }}
            onClick={() => { if (confirm(`Desativar ${u.name}?`)) api.users.excluir(u.id).then(carregar); }}>Desativar</button>}
        </div>
      ))}
    </div>
  );
}
