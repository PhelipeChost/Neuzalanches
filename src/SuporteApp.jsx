// ─── SUPORTE NEXUS — shell FORA do login do estabelecimento ──────────────────
// O Operador (Nexus) é maior que as contas do cliente: entra pela senha de
// suporte na tela inicial do PDV (botão 🛟), sem depender do login.
// Layout: menu lateral com seções por tipo de estabelecimento —
//   1) Operador   → tipos ativos, sync, licença/assinatura, backup, diagnóstico
//   2) Lanchonete → módulos, modo mesas/balcão, nome, ações de sync/update
//   3) Mercado    → status do stack próprio + acesso
// Novos tipos de estabelecimento entram como novas seções aqui.
import { useState, useEffect } from "react";
import { api } from "./api";
import NexusLogo from "./NexusLogo";

const IS_DESKTOP = import.meta.env.VITE_DESKTOP === "1";

const MODULOS_OPCIONAIS = [
  { id: "cozinha", icon: "🔥", label: "Cozinha",           desc: "Painel de pedidos em tempo real na cozinha" },
  { id: "estoque", icon: "📦", label: "Estoque e Insumos", desc: "Controle de estoque e fichas técnicas" },
  { id: "fiscal",  icon: "🧾", label: "Fiscal / NFC-e",    desc: "Emissão de nota fiscal ao consumidor" },
];

const TIPOS_ESTABELECIMENTO = [
  { id: "lanchonete", icon: "🍔", label: "Lanchonete / Pizzaria / Hamburgueria", desc: "Mesas e balcão, comandas, cozinha e cardápio online" },
  { id: "mercado",    icon: "🛒", label: "Mercado",                              desc: "Caixa por código de barras, estoque por setor e inventário" },
];

const cardStyle = { background: "#fff", borderRadius: 14, border: "1px solid #e7e5e4", padding: 22 };
const btnBase = { padding: "10px 18px", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" };
const tituloCard = { fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 4 };
const subCard = { fontSize: 12.5, color: "#78716c", marginBottom: 16 };

export default function SuporteApp({ onFechar, mercadoUrl = "http://localhost:41731" }) {
  const [secao, setSecao] = useState("operador");
  const [tipos, setTipos] = useState([]);
  const [toast, setToast] = useState(null);
  const showToast = (msg, cor = "#15803d") => { setToast({ msg, cor }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    api.tiposEstabelecimento.obter()
      .then(r => setTipos(r.definido ? r.tipos : ["lanchonete"]))
      .catch(() => setTipos(["lanchonete"]));
  }, []);

  const SECOES = [
    { key: "operador", icon: "🛟", label: "Operador", sub: "Plataforma Nexus" },
    { key: "relatorios", icon: "📊", label: "Relatórios", sub: "Impressão e pedidos" },
    ...TIPOS_ESTABELECIMENTO.filter(t => tipos.includes(t.id)).map(t => ({
      key: t.id, icon: t.icon, label: t.label.split(" / ")[0], sub: "Estabelecimento",
    })),
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f5f5f4", fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .sup-inp { width: 100%; padding: 10px 14px; border: 1.5px solid #e7e5e4; border-radius: 8px; font-size: 13px; outline: none; font-family: 'DM Sans', sans-serif; }
        .sup-inp:focus { border-color: #15803d; }
        .sup-nav-item { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 12px 14px; margin: 2px 0; border-radius: 11px; border: none; cursor: pointer; font-family: inherit; background: transparent; color: #d6d3d1; transition: background 0.12s; }
        .sup-nav-item:hover { background: rgba(255,255,255,0.05); }
        .sup-nav-item.on { background: #d97706; color: #fff; }
      `}</style>

      {/* Menu lateral do Suporte */}
      <aside style={{ width: 250, flexShrink: 0, background: "#171310", borderRight: "1px solid #2a221c", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid #2a221c", display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🛟</div>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15.5, fontWeight: 800, color: "#fff" }}>Suporte Nexus</div>
            <div style={{ fontSize: 10.5, color: "#78716c" }}>Área do Operador</div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: 12, overflowY: "auto" }}>
          {SECOES.map(sc => (
            <button key={sc.key} className={`sup-nav-item ${secao === sc.key ? "on" : ""}`} onClick={() => setSecao(sc.key)}>
              <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{sc.icon}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sc.label}</span>
                <span style={{ display: "block", fontSize: 10, opacity: 0.7 }}>{sc.sub}</span>
              </span>
            </button>
          ))}
        </nav>

        <div style={{ padding: 14, borderTop: "1px solid #2a221c" }}>
          <button onClick={onFechar}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "transparent", border: "1.5px solid #2a221c", color: "#d6d3d1", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            ← Sair do Suporte
          </button>
        </div>
      </aside>

      {/* Conteúdo da seção */}
      <main style={{ flex: 1, padding: "30px 34px 60px", overflowY: "auto" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
          {secao === "operador" && <SecaoOperador tipos={tipos} setTipos={setTipos} showToast={showToast} />}
          {secao === "relatorios" && <SecaoRelatorios showToast={showToast} />}
          {secao === "lanchonete" && <SecaoLanchonete showToast={showToast} />}
          {secao === "mercado" && <SecaoMercado mercadoUrl={mercadoUrl} showToast={showToast} />}
        </div>
      </main>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.cor, color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 100 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ═══ SEÇÃO 1: OPERADOR (plataforma Nexus) ═══════════════════════════════════
function SecaoOperador({ tipos, setTipos, showToast }) {
  const [salvando, setSalvando] = useState(false);
  const [sincStat, setSincStat] = useState(null);
  const [licenca, setLicenca] = useState(null);
  const [backups, setBackups] = useState(null);
  const [fazendoBackup, setFazendoBackup] = useState(false);
  const [pdvVer, setPdvVer] = useState("");
  const [statusServidor, setStatusServidor] = useState(null);

  useEffect(() => {
    api.sync.config().then(setSincStat).catch(() => {});
    api.suporte.backups().then(setBackups).catch(() => setBackups(null));
    fetch("/api/health").then(r => r.json()).then(setStatusServidor).catch(() => setStatusServidor({ ok: false }));
    try {
      if (window.licenca?.status) window.licenca.status().then(setLicenca).catch(() => {});
      if (window.pdvInfo?.getVersao) window.pdvInfo.getVersao().then(v => v && setPdvVer("v" + v)).catch(() => {});
    } catch { /* fora do Electron */ }
  }, []);

  const toggleTipo = async (id) => {
    const novo = tipos.includes(id) ? tipos.filter(t => t !== id) : [...tipos, id];
    if (novo.length === 0) { showToast("Ao menos um tipo precisa ficar ativo", "#dc2626"); return; }
    const rotulo = TIPOS_ESTABELECIMENTO.find(t => t.id === id)?.label || id;
    if (!confirm(`${tipos.includes(id) ? "Desabilitar" : "Habilitar"} o tipo "${rotulo}" neste PDV?\n\nOs dados do tipo não são apagados — só deixam de aparecer.`)) return;
    setSalvando(true);
    try {
      const r = await api.tiposEstabelecimento.salvar(novo);
      setTipos(r.tipos);
      showToast("Tipos de estabelecimento atualizados!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const forcarBackup = async () => {
    setFazendoBackup(true);
    try {
      const r = await api.suporte.backup();
      setBackups({ pasta: backups?.pasta, backups: r.backups });
      showToast(`Backup criado: ${r.arquivo}`);
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setFazendoBackup(false); }
  };

  const fmtBytes = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB";
  const licCor = licenca?.estado === "ativo" ? "#16a34a" : licenca?.estado === "tolerancia" ? "#d97706" : "#dc2626";

  return (
    <>
      <div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, color: "#1c1917" }}>Operador</div>
        <div style={{ fontSize: 13, color: "#78716c" }}>Configurações da plataforma Nexus — valem para todos os estabelecimentos deste PDV.</div>
      </div>

      {/* Tipos de estabelecimento */}
      <div style={cardStyle}>
        <div style={tituloCard}>Tipos de estabelecimento</div>
        <div style={subCard}>
          Cada tipo é um mundo separado (vendas, estoque e financeiro independentes) na mesma
          licença. Desabilitar não apaga dados. Ativos aparecem como seções no menu ao lado.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TIPOS_ESTABELECIMENTO.map(t => {
            const ativo = tipos.includes(t.id);
            return (
              <label key={t.id} onClick={() => !salvando && toggleTipo(t.id)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderRadius: 12, cursor: "pointer",
                  border: `1.5px solid ${ativo ? "#15803d" : "#e7e5e4"}`, background: ativo ? "#f0fdf4" : "#fafaf9", opacity: salvando ? 0.6 : 1 }}>
                <div style={{ fontSize: 22, width: 34, textAlign: "center" }}>{t.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ativo ? "#15803d" : "#1c1917" }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: "#78716c" }}>{t.desc}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: ativo ? "#dcfce7" : "#f5f5f4", color: ativo ? "#16a34a" : "#a8a29e" }}>
                  {ativo ? "ATIVO" : "DESABILITADO"}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Plano de assinatura / licença */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={tituloCard}>Plano de assinatura</div>
          {licenca && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 20, background: licCor + "22", color: licCor }}>
              {licenca.estado === "ativo" ? "🟢 ATIVA" : licenca.estado === "tolerancia" ? "🟡 TOLERÂNCIA" : "🔴 " + (licenca.estado || "").toUpperCase()}
            </span>
          )}
        </div>
        <div style={subCard}>Situação da chave de licença deste PDV.</div>
        {!licenca ? (
          <div style={{ fontSize: 12.5, color: "#a8a29e", padding: "8px 0" }}>
            {IS_DESKTOP ? "Carregando..." : "Disponível apenas no PDV desktop instalado (aqui é o modo navegador/dev)."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5, color: "#57534e", background: "#fafaf9", borderRadius: 8, padding: 14, border: "1px solid #f5f5f4" }}>
            <div><b>Expira em:</b> {licenca.expira_em ? new Date(licenca.expira_em).toLocaleDateString("pt-BR") : "—"}</div>
            <div><b>Dias restantes:</b> <span style={{ color: licCor, fontWeight: 700 }}>{licenca.dias_restantes ?? "—"}</span></div>
            <div><b>Plano:</b> {licenca.plano || "padrão"}</div>
            <div><b>Tolerância pós-venc.:</b> {licenca.grace_days || 0} dia(s)</div>
            {licenca.cliente && <div style={{ gridColumn: "1 / -1" }}><b>Cliente:</b> {licenca.cliente}</div>}
            <div style={{ gridColumn: "1 / -1", color: "#a8a29e" }}>{licenca.motivo}</div>
          </div>
        )}
      </div>

      {/* Sincronização */}
      <div style={cardStyle}>
        <div style={tituloCard}>Sincronização da plataforma</div>
        <div style={subCard}>Conexão do PDV com o cardápio online do cliente.</div>
        {sincStat ? (
          <div style={{ padding: "10px 14px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f5f5f4", fontSize: 12, color: "#57534e" }}>
            <div><b>Servidor remoto:</b> {sincStat.url || "não configurado"}</div>
            <div><b>Sync ativada:</b> {sincStat.enabled ? "sim 🟢" : "não 🔴"}</div>
            <div><b>Última sync:</b> {sincStat.last_sync ? new Date(sincStat.last_sync).toLocaleString("pt-BR") : "nunca"}</div>
            {sincStat.last_sync_result && <div><b>Resultado:</b> {sincStat.last_sync_result}</div>}
          </div>
        ) : <div style={{ fontSize: 12.5, color: "#a8a29e" }}>Carregando...</div>}
      </div>

      {/* Backup */}
      <div style={cardStyle}>
        <div style={tituloCard}>Backup do banco de dados</div>
        <div style={subCard}>
          Snapshot do banco (vendas, produtos, financeiro). Automático 1x por dia — mantém os 7
          mais recentes na pasta <code style={{ fontSize: 11 }}>{backups?.pasta || "backups/"}</code>.
        </div>
        <button onClick={forcarBackup} disabled={fazendoBackup}
          style={{ ...btnBase, background: "#15803d", color: "#fff", opacity: fazendoBackup ? 0.6 : 1, marginBottom: 12 }}>
          {fazendoBackup ? "Gerando..." : "💾 Fazer backup agora"}
        </button>
        {backups?.backups?.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {backups.backups.slice(0, 5).map(b => (
              <div key={b.arquivo} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#fafaf9", borderRadius: 8, fontSize: 12, color: "#57534e" }}>
                <span style={{ fontFamily: "monospace" }}>{b.arquivo}</span>
                <span>{fmtBytes(b.tamanho)} · {new Date(b.criado_em).toLocaleString("pt-BR")}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#a8a29e" }}>Nenhum backup ainda — o primeiro automático sai em até 24h, ou clique acima.</div>
        )}
      </div>

      {/* Diagnóstico */}
      <div style={cardStyle}>
        <div style={tituloCard}>Diagnóstico</div>
        <div style={subCard}>Informações para reportar problemas ao suporte.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5, color: "#57534e", background: "#fafaf9", borderRadius: 8, padding: 14, border: "1px solid #f5f5f4" }}>
          <div><b>PDV:</b> {pdvVer || "web / navegador"}</div>
          <div><b>Servidor local:</b> {statusServidor?.ok !== false ? "🟢 online" : "🔴 offline"}</div>
          <div><b>Tipos ativos:</b> {tipos.join(", ") || "—"}</div>
          <div><b>Desktop:</b> {statusServidor?.desktop ? "sim" : "não"}</div>
        </div>
      </div>
    </>
  );
}

// ═══ SEÇÃO 2: LANCHONETE / PIZZARIA / HAMBURGUERIA ═══════════════════════════
function SecaoLanchonete({ showToast }) {
  const [modulos, setModulos] = useState([]);
  const [modo, setModo] = useState("mesas");
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sincStat, setSincStat] = useState(null);

  useEffect(() => {
    api.perfil.obter().then(p => {
      setModulos(Array.isArray(p.modulos) ? p.modulos : []);
      setModo(p.modo || "mesas");
      setNome(p.nome_estabelecimento || "");
    }).catch(() => {});
    api.sync.config().then(setSincStat).catch(() => {});
  }, []);

  const toggleModulo = (id) => setModulos(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  const salvarModulos = async () => {
    setSalvando(true);
    try { await api.perfil.salvar({ modulos }); showToast("Módulos atualizados!"); }
    catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const salvarModo = async () => {
    if (!confirm(`Trocar modo do estabelecimento para "${modo === "mesas" ? "Mesas (salão)" : "Balcão"}"?\n\nIsso altera a interface da Frente de Caixa.`)) return;
    setSalvando(true);
    try { await api.perfil.salvar({ modo }); showToast("Modo atualizado!"); }
    catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const salvarNome = async () => {
    if (!nome.trim()) return showToast("Nome não pode ser vazio", "#dc2626");
    setSalvando(true);
    try { await api.perfil.salvar({ nome_estabelecimento: nome.trim() }); showToast("Nome atualizado!"); }
    catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const forcarSync = async () => {
    setSalvando(true);
    try {
      await api.sync.enviarProdutos();
      setSincStat(await api.sync.config());
      showToast("Catálogo sincronizado!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const forcarAtualizacao = () => {
    if (window.atualizacao?.verificar) { window.atualizacao.verificar(); showToast("Verificando atualizações..."); }
    else showToast("Só disponível no PDV desktop", "#dc2626");
  };

  const limparCacheLocal = () => {
    if (!confirm("Isso vai limpar preferências locais (tema, último setor, wizard). O cadastro não é afetado.\n\nContinuar?")) return;
    for (const k of ["nl_setor", "nl_onb_done", "nl_onb_steps", "caixa-tema", "cozinha-tema", "nl-mesa-theme"]) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    showToast("Cache local limpo!");
  };

  return (
    <>
      <div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, color: "#1c1917" }}>🍔 Lanchonete / Pizzaria / Hamburgueria</div>
        <div style={{ fontSize: 13, color: "#78716c" }}>Configurações estruturais do estabelecimento de alimentação.</div>
      </div>

      {/* Módulos habilitados */}
      <div style={cardStyle}>
        <div style={tituloCard}>Módulos habilitados</div>
        <div style={subCard}>
          Frente de Caixa, Produtos, Financeiro e Configurações estão sempre ativos. Os opcionais abaixo aparecem/somem no menu lateral.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MODULOS_OPCIONAIS.map(m => {
            const ativo = modulos.includes(m.id);
            return (
              <label key={m.id} onClick={() => toggleModulo(m.id)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderRadius: 12, cursor: "pointer",
                  border: `1.5px solid ${ativo ? "#15803d" : "#e7e5e4"}`, background: ativo ? "#f0fdf4" : "#fafaf9" }}>
                <div style={{ fontSize: 22, width: 34, textAlign: "center" }}>{m.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ativo ? "#15803d" : "#1c1917" }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: "#78716c" }}>{m.desc}</div>
                </div>
                <div style={{ width: 42, height: 24, borderRadius: 12, background: ativo ? "#15803d" : "#d6d3d1", position: "relative", transition: "background 0.2s" }}>
                  <div style={{ position: "absolute", top: 2, left: ativo ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                </div>
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button onClick={salvarModulos} disabled={salvando} style={{ ...btnBase, background: "#15803d", color: "#fff", opacity: salvando ? 0.6 : 1 }}>
            {salvando ? "Salvando..." : "Salvar módulos"}
          </button>
        </div>
      </div>

      {/* Modo Mesas/Balcão */}
      <div style={cardStyle}>
        <div style={tituloCard}>Modo de operação</div>
        <div style={subCard}>Define como a Frente de Caixa se comporta.</div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { id: "mesas",  icon: "🍽️", label: "Mesas (salão)", desc: "Cliente senta e pede pelo QR Code ou garçom" },
            { id: "balcao", icon: "🏪", label: "Balcão",         desc: "Todos os pedidos passam pelo caixa" },
          ].map(op => (
            <div key={op.id} onClick={() => setModo(op.id)}
              style={{ flex: 1, padding: "18px 14px", borderRadius: 12, cursor: "pointer", textAlign: "center",
                border: `2px solid ${modo === op.id ? "#15803d" : "#e7e5e4"}`, background: modo === op.id ? "#f0fdf4" : "#fafaf9" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{op.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: modo === op.id ? "#15803d" : "#1c1917" }}>{op.label}</div>
              <div style={{ fontSize: 11, color: "#78716c", marginTop: 3 }}>{op.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button onClick={salvarModo} disabled={salvando} style={{ ...btnBase, background: "#15803d", color: "#fff", opacity: salvando ? 0.6 : 1 }}>
            Aplicar modo
          </button>
        </div>
      </div>

      {/* Nome do estabelecimento */}
      <div style={cardStyle}>
        <div style={tituloCard}>Nome do estabelecimento</div>
        <div style={subCard}>Aparece no cardápio online, no PDV e nas notificações do bot.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={nome} onChange={e => setNome(e.target.value)} maxLength={60} className="sup-inp" placeholder="Ex: Lanches do Marcos" />
          <button onClick={salvarNome} disabled={salvando} style={{ ...btnBase, background: "#15803d", color: "#fff", opacity: salvando ? 0.6 : 1, whiteSpace: "nowrap" }}>
            Salvar
          </button>
        </div>
      </div>

      {/* Ações rápidas */}
      <div style={cardStyle}>
        <div style={tituloCard}>Ações rápidas</div>
        <div style={subCard}>Sync manual do catálogo, atualização do PDV e limpeza de cache.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={forcarSync} disabled={salvando || !sincStat?.url} style={{ ...btnBase, background: "#15803d", color: "#fff", opacity: (salvando || !sincStat?.url) ? 0.5 : 1 }}>
            🔄 Forçar sync catálogo agora
          </button>
          <button onClick={forcarAtualizacao} style={{ ...btnBase, background: "#1c1917", color: "#fff" }}>
            ⬇️ Verificar atualização do PDV
          </button>
          <button onClick={limparCacheLocal} style={{ ...btnBase, background: "#fff", color: "#78716c", border: "1.5px solid #e7e5e4" }}>
            🧹 Limpar cache local
          </button>
        </div>
      </div>
    </>
  );
}

// ═══ SEÇÃO 3: MERCADO (stack próprio) ════════════════════════════════════════
function SecaoMercado({ mercadoUrl, showToast }) {
  const [health, setHealth] = useState(undefined); // undefined = checando

  const checar = () => {
    fetch(`${mercadoUrl}/api/health`, { signal: AbortSignal.timeout(4000) })
      .then(r => r.json()).then(setHealth)
      .catch(() => setHealth(null));
  };
  useEffect(() => { checar(); const iv = setInterval(checar, 10000); return () => clearInterval(iv); }, [mercadoUrl]);

  const online = !!health?.ok;

  return (
    <>
      <div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, color: "#1c1917" }}>🛒 Mercado</div>
        <div style={{ fontSize: 13, color: "#78716c" }}>PDV de mercado — sistema separado com banco e usuários próprios.</div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={tituloCard}>Status do sistema</div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 20,
            background: online ? "#dcfce7" : health === undefined ? "#fef3c7" : "#fee2e2",
            color: online ? "#16a34a" : health === undefined ? "#92400e" : "#dc2626" }}>
            {online ? "🟢 NO AR" : health === undefined ? "⏳ Verificando..." : "🔴 FORA DO AR"}
          </span>
        </div>
        <div style={subCard}>
          O PDV Mercado roda embutido no Nexus PDV desktop, em {mercadoUrl}. Se estiver fora do ar,
          reinicie o Nexus PDV.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5, color: "#57534e", background: "#fafaf9", borderRadius: 8, padding: 14, border: "1px solid #f5f5f4", marginBottom: 14 }}>
          <div><b>Endereço:</b> {mercadoUrl}</div>
          <div><b>Uptime:</b> {online ? Math.round(health.uptime / 60) + " min" : "—"}</div>
          <div style={{ gridColumn: "1 / -1" }}><b>Acesso inicial:</b> usuário <code>admin</code> · senha <code>admin123</code> (troque em Ajustes → Usuários)</div>
        </div>
        <button onClick={() => { window.location.href = `${mercadoUrl}?pdv=${encodeURIComponent(window.location.origin)}`; }}
          disabled={!online}
          style={{ ...btnBase, background: online ? "#15803d" : "#d6d3d1", color: "#fff", padding: "12px 22px", fontSize: 14 }}>
          🛒 Abrir o PDV Mercado
        </button>
      </div>

      <div style={{ ...cardStyle, background: "#eff6ff", borderColor: "#bfdbfe" }}>
        <div style={{ fontSize: 12.5, color: "#1e40af", lineHeight: 1.6 }}>
          💡 <b>Modo quiosque:</b> no PDV Mercado, um usuário que só tem a permissão "PDV (Caixa)"
          entra direto na tela do caixa em tela cheia — ideal pro operador de caixa. Gerencie
          usuários e permissões dentro do Mercado em <b>Ajustes → Usuários</b>.
        </div>
      </div>
    </>
  );
}

// ═══ SEÇÃO: RELATÓRIOS (impressão + pedidos) ═════════════════════════════════
function SecaoRelatorios({ showToast }) {
  const [aba, setAba] = useState("impressao");
  return (
    <>
      <div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, color: "#1c1917" }}>📊 Relatórios</div>
        <div style={{ fontSize: 13, color: "#78716c" }}>Trilha das impressões da cozinha e histórico completo de pedidos.</div>
      </div>

      {/* Sub-abas */}
      <div style={{ display: "flex", gap: 6, background: "#e7e5e4", padding: 4, borderRadius: 10, width: "fit-content" }}>
        {[
          { key: "impressao", icon: "🖨️", label: "Lista de Impressão" },
          { key: "pedidos", icon: "📋", label: "Lista de Pedidos" },
        ].map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            style={{
              padding: "8px 14px", borderRadius: 7, border: "none",
              background: aba === a.key ? "#fff" : "transparent",
              color: aba === a.key ? "#1c1917" : "#78716c",
              fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              boxShadow: aba === a.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      {aba === "impressao" && <ListaImpressao showToast={showToast} />}
      {aba === "pedidos" && <ListaPedidos showToast={showToast} />}
    </>
  );
}

const fmtDataHora = (iso) => {
  if (!iso) return "—";
  try {
    const s = String(iso);
    const d = /Z$|[+-]\d{2}:?\d{2}$/.test(s) ? new Date(s) : new Date(s.replace(" ", "T") + "Z");
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso; }
};

function ListaImpressao({ showToast }) {
  const [eventos, setEventos] = useState(null);
  const [filtro, setFiltro] = useState("todos"); // todos | ok | erro

  const carregar = () => {
    api.impressao.listar({ limite: 500 })
      .then(setEventos)
      .catch(e => showToast("Erro ao carregar: " + e.message, "#dc2626"));
  };
  useEffect(() => { carregar(); const iv = setInterval(carregar, 15000); return () => clearInterval(iv); }, []);

  if (eventos === null) return <div style={{ fontSize: 13, color: "#a8a29e" }}>Carregando…</div>;

  const filtrados = eventos.filter(e => filtro === "todos" || e.status === filtro);
  const okCount = eventos.filter(e => e.status === "ok").length;
  const erroCount = eventos.filter(e => e.status === "erro").length;
  const modoLabel = { agente: "Agente", usb: "USB direta", manual: "Manual" };
  const origemLabel = { "cozinha-auto": "🍳 Automática", "cozinha-manual": "👆 Manual", "suporte": "🛟 Suporte" };

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ background: "#fff", padding: "10px 16px", borderRadius: 10, border: "1px solid #e7e5e4", fontSize: 12.5 }}>
          <b style={{ color: "#16a34a" }}>{okCount}</b> impressos · <b style={{ color: "#dc2626" }}>{erroCount}</b> falhas · <b>{eventos.length}</b> total
        </div>
        <div style={{ display: "flex", gap: 4, background: "#e7e5e4", padding: 3, borderRadius: 8 }}>
          {[
            { k: "todos", l: "Todos" },
            { k: "ok", l: "✓ Sucesso" },
            { k: "erro", l: "✗ Falhas" },
          ].map(f => (
            <button key={f.k} onClick={() => setFiltro(f.k)}
              style={{
                padding: "6px 12px", borderRadius: 6, border: "none",
                background: filtro === f.k ? "#fff" : "transparent",
                color: filtro === f.k ? "#1c1917" : "#78716c",
                fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>{f.l}</button>
          ))}
        </div>
        <button onClick={carregar}
          style={{ ...btnBase, background: "#f5f5f4", color: "#57534e", border: "1px solid #e7e5e4", padding: "8px 14px" }}>
          🔄 Atualizar
        </button>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "#fafaf9", borderBottom: "1.5px solid #e7e5e4", textAlign: "left" }}>
                {["Data/Hora", "Pedido", "Status", "Modo", "Impressora", "Tentativa", "Bytes", "Origem", "Erro"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", fontWeight: 700, color: "#57534e", fontSize: 11, letterSpacing: "0.04em" }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 30, textAlign: "center", color: "#a8a29e" }}>
                  {eventos.length === 0
                    ? "Nenhuma impressão registrada ainda. Assim que a Cozinha imprimir, aparece aqui."
                    : "Nenhum evento com esse filtro."}
                </td></tr>
              )}
              {filtrados.map(e => (
                <tr key={e.id} style={{ borderBottom: "1px solid #f5f5f4" }}>
                  <td style={{ padding: "9px 12px", whiteSpace: "nowrap", color: "#57534e" }}>{fmtDataHora(e.created_at)}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 11.5, color: "#1c1917" }}>
                    {e.pedido_id ? "#" + String(e.pedido_id).slice(0, 6).toUpperCase() : "—"}
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{
                      padding: "2px 10px", borderRadius: 20, fontSize: 10.5, fontWeight: 700,
                      background: e.status === "ok" ? "#dcfce7" : e.status === "erro" ? "#fee2e2" : "#fef3c7",
                      color: e.status === "ok" ? "#16a34a" : e.status === "erro" ? "#dc2626" : "#92400e",
                    }}>{e.status === "ok" ? "✓ OK" : e.status === "erro" ? "✗ ERRO" : e.status.toUpperCase()}</span>
                  </td>
                  <td style={{ padding: "9px 12px", color: "#57534e" }}>{modoLabel[e.modo] || e.modo || "—"}</td>
                  <td style={{ padding: "9px 12px", color: "#57534e", fontSize: 11.5 }}>{e.impressora || "—"}</td>
                  <td style={{ padding: "9px 12px", color: "#57534e" }}>#{e.tentativa}</td>
                  <td style={{ padding: "9px 12px", color: "#57534e", fontVariantNumeric: "tabular-nums" }}>
                    {e.bytes ? e.bytes.toLocaleString("pt-BR") : "—"}
                  </td>
                  <td style={{ padding: "9px 12px", color: "#57534e", fontSize: 11.5 }}>{origemLabel[e.origem] || e.origem || "—"}</td>
                  <td style={{ padding: "9px 12px", color: "#dc2626", fontSize: 11.5, maxWidth: 260 }}>
                    {e.erro ? <span title={e.erro} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.erro}</span> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ListaPedidos({ showToast }) {
  const [pedidos, setPedidos] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");

  const carregar = () => {
    api.suporte.pedidos({ limite: 500 })
      .then(setPedidos)
      .catch(e => showToast("Erro ao carregar: " + e.message, "#dc2626"));
  };
  useEffect(() => { carregar(); }, []);

  if (pedidos === null) return <div style={{ fontSize: 13, color: "#a8a29e" }}>Carregando…</div>;

  const filtrados = pedidos.filter(p => {
    if (status !== "todos" && p.status !== status) return false;
    if (busca) {
      const q = busca.toLowerCase();
      return (p.cliente_nome || "").toLowerCase().includes(q)
        || (p.cliente_telefone || "").includes(q)
        || String(p.id || "").toLowerCase().includes(q);
    }
    return true;
  });

  const fmtBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const CORES_STATUS = {
    pendente: { bg: "#fef3c7", fg: "#92400e" },
    confirmado: { bg: "#dbeafe", fg: "#1e40af" },
    preparando: { bg: "#fed7aa", fg: "#c2410c" },
    pronto: { bg: "#e9d5ff", fg: "#7c3aed" },
    entregue: { bg: "#dcfce7", fg: "#16a34a" },
    cancelado: { bg: "#fee2e2", fg: "#dc2626" },
  };
  const LABEL_METODO = { pix: "Pix", dinheiro: "Dinheiro", credito: "Cartão crédito", debito: "Cartão débito" };

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="Buscar por nome, telefone ou ID…" value={busca} onChange={e => setBusca(e.target.value)}
          className="sup-inp" style={{ maxWidth: 320 }} />
        <select value={status} onChange={e => setStatus(e.target.value)}
          style={{ padding: "10px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 12.5, background: "#fff", cursor: "pointer" }}>
          <option value="todos">Todos status</option>
          <option value="pendente">Pendentes</option>
          <option value="confirmado">Confirmados</option>
          <option value="preparando">Preparando</option>
          <option value="pronto">Prontos</option>
          <option value="entregue">Entregues</option>
          <option value="cancelado">Cancelados</option>
        </select>
        <div style={{ background: "#fff", padding: "8px 14px", borderRadius: 10, border: "1px solid #e7e5e4", fontSize: 12 }}>
          <b>{filtrados.length}</b> de {pedidos.length}
        </div>
        <button onClick={carregar}
          style={{ ...btnBase, background: "#f5f5f4", color: "#57534e", border: "1px solid #e7e5e4", padding: "8px 14px" }}>
          🔄 Atualizar
        </button>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {filtrados.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#a8a29e", fontSize: 13 }}>
            {pedidos.length === 0 ? "Nenhum pedido registrado ainda." : "Nenhum pedido com esse filtro."}
          </div>
        )}
        {filtrados.map(p => {
          const cor = CORES_STATUS[p.status] || { bg: "#f5f5f4", fg: "#57534e" };
          const isOpen = expandido === p.id;
          return (
            <div key={p.id} style={{ borderBottom: "1px solid #f5f5f4" }}>
              <div onClick={() => setExpandido(isOpen ? null : p.id)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", cursor: "pointer" }}>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "#78716c", minWidth: 66 }}>
                  #{String(p.id).slice(0, 6).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1917" }}>
                    {p.cliente_nome || "—"}
                    <span style={{ color: "#78716c", fontWeight: 500, marginLeft: 8, fontSize: 11.5 }}>{p.cliente_telefone || ""}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#78716c" }}>
                    {fmtDataHora(p.created_at)} · {(p.itens || []).length} item(ns) · {p.tipo === "online" ? "🌐 Online" : "🏪 Presencial"}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d", minWidth: 80, textAlign: "right" }}>{fmtBRL(p.total)}</div>
                <span style={{ padding: "3px 12px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, background: cor.bg, color: cor.fg, whiteSpace: "nowrap" }}>
                  {p.status.toUpperCase()}
                </span>
                <div style={{ color: "#a8a29e", fontSize: 14 }}>{isOpen ? "▲" : "▼"}</div>
              </div>

              {isOpen && (
                <div style={{ padding: "0 18px 18px", background: "#fafaf9", borderTop: "1px solid #f5f5f4" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
                    <PDado label="ID completo" v={p.id} mono />
                    <PDado label="Cliente" v={p.cliente_nome} />
                    <PDado label="Telefone" v={p.cliente_telefone} />
                    <PDado label="Email" v={p.cliente_email} />
                    <PDado label="Tipo entrega" v={p.tipo_entrega} />
                    <PDado label="Pagamento" v={LABEL_METODO[p.metodo_pagamento] || p.metodo_pagamento} />
                    {p.troco_para && <PDado label="Troco p/" v={fmtBRL(p.troco_para)} />}
                    <PDado label="Total" v={fmtBRL(p.total)} destaque />
                    <PDado label="Criado em" v={fmtDataHora(p.created_at)} />
                    {p.updated_at && <PDado label="Atualizado em" v={fmtDataHora(p.updated_at)} />}
                    {p.endereco_rua && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <PDado label="Endereço" v={`${p.endereco_rua}${p.endereco_numero ? ", " + p.endereco_numero : ""}${p.endereco_bairro ? " · " + p.endereco_bairro : ""}${p.endereco_referencia ? " (Ref: " + p.endereco_referencia + ")" : ""}`} />
                      </div>
                    )}
                    {p.obs && <div style={{ gridColumn: "1 / -1" }}><PDado label="Observação" v={p.obs} /></div>}
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, color: "#78716c", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 8 }}>ITENS</div>
                    <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10 }}>
                      {(p.itens || []).map((it, i) => (
                        <div key={i} style={{ padding: "10px 14px", borderBottom: i < p.itens.length - 1 ? "1px solid #f5f5f4" : "none", display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{it.quantidade}× {it.produto_nome}</div>
                            {(it.adicionais || []).length > 0 && (
                              <div style={{ fontSize: 11.5, color: "#78716c", marginTop: 3 }}>
                                {it.adicionais.map(a => `+ ${(a.quantidade || 1) > 1 ? a.quantidade + "× " : ""}${a.nome}`).join(", ")}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#57534e", whiteSpace: "nowrap" }}>{fmtBRL(it.preco_unitario * it.quantidade)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function PDado({ label, v, mono, destaque }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "#a8a29e", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 2 }}>{label.toUpperCase()}</div>
      <div style={{
        fontSize: destaque ? 15 : 12.5,
        fontWeight: destaque ? 800 : 500,
        color: destaque ? "#15803d" : "#1c1917",
        fontFamily: mono ? "monospace" : "inherit",
        wordBreak: "break-word",
      }}>{v || "—"}</div>
    </div>
  );
}
