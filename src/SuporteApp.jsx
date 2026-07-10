import { useState, useEffect } from "react";
import { api } from "./api";

const MODULOS_OPCIONAIS = [
  { id: "cozinha", icon: "🔥", label: "Cozinha",           desc: "Painel de pedidos em tempo real na cozinha" },
  { id: "estoque", icon: "📦", label: "Estoque e Insumos", desc: "Controle de estoque e fichas técnicas" },
  { id: "fiscal",  icon: "🧾", label: "Fiscal / NFC-e",    desc: "Emissão de nota fiscal ao consumidor" },
];

// Tipos de estabelecimento que este PDV atende (multi-stack, mesma licença).
// Cada tipo é um mundo separado: financeiro, estoque e vendas independentes.
const TIPOS_ESTABELECIMENTO = [
  { id: "lanchonete", icon: "🍔", label: "Lanchonete / Pizzaria / Hamburgueria", desc: "Mesas e balcão, comandas, cozinha e cardápio online (este sistema)" },
  { id: "mercado",    icon: "🛒", label: "Mercado",                              desc: "Caixa por código de barras, estoque por setor e inventário (stack próprio)" },
];

const cardStyle = { background: "#fff", borderRadius: 14, border: "1px solid #e7e5e4", padding: 22 };
const btnBase = { padding: "10px 18px", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" };

export default function SuporteApp({ perfil, onPerfilChange }) {
  const [modulos, setModulos] = useState([]);
  const [modo, setModo] = useState("mesas");
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(null);
  const [sincStat, setSincStat] = useState(null);
  const [pdvVer, setPdvVer] = useState("");
  const [statusServidor, setStatusServidor] = useState(null);
  const [tipos, setTipos] = useState([]);

  const showToast = (msg, cor = "#15803d") => { setToast({ msg, cor }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    api.perfil.obter().then(p => {
      setModulos(Array.isArray(p.modulos) ? p.modulos : []);
      setModo(p.modo || "mesas");
      setNome(p.nome_estabelecimento || "");
    }).catch(() => {});
    api.tiposEstabelecimento.obter()
      .then(r => setTipos(r.definido ? r.tipos : ["lanchonete"]))
      .catch(() => setTipos(["lanchonete"]));
    api.sync.config().then(c => setSincStat(c)).catch(() => {});
    try {
      if (window.pdvInfo?.getVersao) {
        window.pdvInfo.getVersao().then(v => v && setPdvVer("v" + v)).catch(() => {});
      }
    } catch {}
    fetch("/api/health").then(r => r.json()).then(setStatusServidor).catch(() => setStatusServidor({ ok: false }));
  }, []);

  const toggleModulo = (id) => setModulos(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  const toggleTipo = async (id) => {
    const novo = tipos.includes(id) ? tipos.filter(t => t !== id) : [...tipos, id];
    if (novo.length === 0) { showToast("Ao menos um tipo precisa ficar ativo", "#dc2626"); return; }
    const rotulo = TIPOS_ESTABELECIMENTO.find(t => t.id === id)?.label || id;
    const acao = tipos.includes(id) ? "DESABILITAR" : "habilitar";
    if (!confirm(`${acao === "DESABILITAR" ? "Desabilitar" : "Habilitar"} o tipo "${rotulo}" neste PDV?\n\nOs dados do tipo não são apagados — só deixam de aparecer.`)) return;
    setSalvando(true);
    try {
      const r = await api.tiposEstabelecimento.salvar(novo);
      setTipos(r.tipos);
      showToast("Tipos de estabelecimento atualizados!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const salvarModulos = async () => {
    setSalvando(true);
    try {
      const p = await api.perfil.salvar({ modulos });
      onPerfilChange?.(p);
      showToast("Módulos atualizados!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const salvarModo = async () => {
    if (!confirm(`Trocar modo do estabelecimento para "${modo === "mesas" ? "Mesas (salão)" : "Balcão"}"?\n\nIsso altera a interface da Frente de Caixa.`)) return;
    setSalvando(true);
    try {
      const p = await api.perfil.salvar({ modo });
      onPerfilChange?.(p);
      showToast("Modo atualizado! Recarregando...");
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const salvarNome = async () => {
    if (!nome.trim()) return showToast("Nome não pode ser vazio", "#dc2626");
    setSalvando(true);
    try {
      const p = await api.perfil.salvar({ nome_estabelecimento: nome.trim() });
      onPerfilChange?.(p);
      showToast("Nome do estabelecimento atualizado!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const forcarSync = async () => {
    setSalvando(true);
    try {
      await api.sync.enviarProdutos();
      const cfg = await api.sync.config();
      setSincStat(cfg);
      showToast("Catálogo sincronizado!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const forcarAtualizacao = () => {
    if (window.atualizacao?.verificar) {
      window.atualizacao.verificar();
      showToast("Verificando atualizações...");
    } else {
      showToast("Só disponível no PDV desktop", "#dc2626");
    }
  };

  const limparCacheLocal = () => {
    if (!confirm("Isso vai limpar preferências locais (tema, último setor, wizard). O cadastro não é afetado.\n\nContinuar?")) return;
    for (const k of ["nl_setor", "nl_onb_done", "nl_onb_steps", "caixa-tema", "cozinha-tema", "nl-mesa-theme"]) {
      try { localStorage.removeItem(k); } catch {}
    }
    showToast("Cache local limpo! Recarregando...");
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <div style={{ padding: "28px 32px 60px", background: "#f5f5f4", minHeight: "100vh", fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <style>{`
        .sup-inp { width: 100%; padding: "10px 14px"; padding: 10px 14px; border: 1.5px solid #e7e5e4; border-radius: 8px; font-size: 13px; outline: none; font-family: 'DM Sans', sans-serif; }
        .sup-inp:focus { border-color: #15803d; }
      `}</style>

      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🛟</div>
            <div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, color: "#1c1917" }}>Suporte Nexus</div>
              <div style={{ fontSize: 13, color: "#78716c" }}>Área restrita — configurações estruturais do PDV</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Módulos habilitados */}
          <div style={cardStyle}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Módulos habilitados</div>
            <div style={{ fontSize: 12.5, color: "#78716c", marginBottom: 16 }}>
              Frente de Caixa, Produtos, Financeiro e Configurações estão sempre ativos. Os opcionais abaixo aparecem/somem no menu lateral.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MODULOS_OPCIONAIS.map(m => {
                const ativo = modulos.includes(m.id);
                return (
                  <label key={m.id}
                    onClick={() => toggleModulo(m.id)}
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

          {/* Tipos de estabelecimento (multi-stack) */}
          <div style={cardStyle}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Tipos de estabelecimento</div>
            <div style={{ fontSize: 12.5, color: "#78716c", marginBottom: 16 }}>
              O cliente pode usar mais de um tipo no mesmo PDV (mesma licença) — cada um é um mundo
              separado: financeiro, estoque e vendas independentes. Desabilitar não apaga dados.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {TIPOS_ESTABELECIMENTO.map(t => {
                const ativo = tipos.includes(t.id);
                return (
                  <label key={t.id}
                    onClick={() => !salvando && toggleTipo(t.id)}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderRadius: 12, cursor: "pointer",
                      border: `1.5px solid ${ativo ? "#15803d" : "#e7e5e4"}`, background: ativo ? "#f0fdf4" : "#fafaf9", opacity: salvando ? 0.6 : 1 }}>
                    <div style={{ fontSize: 22, width: 34, textAlign: "center" }}>{t.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: ativo ? "#15803d" : "#1c1917" }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: "#78716c" }}>{t.desc}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                      background: ativo ? "#dcfce7" : "#f5f5f4", color: ativo ? "#16a34a" : "#a8a29e" }}>
                      {ativo ? "ATIVO" : "DESABILITADO"}
                    </span>
                    <div style={{ width: 42, height: 24, borderRadius: 12, background: ativo ? "#15803d" : "#d6d3d1", position: "relative", transition: "background 0.2s" }}>
                      <div style={{ position: "absolute", top: 2, left: ativo ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                    </div>
                  </label>
                );
              })}
            </div>
            {tipos.includes("mercado") && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, color: "#1e40af" }}>
                🛒 O PDV Mercado roda como sistema separado. Acesso: <b>http://localhost:3202</b> (backend <code>backend/</code> precisa estar em execução).
              </div>
            )}
          </div>

          {/* Modo Mesas/Balcão */}
          <div style={cardStyle}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Modo de operação</div>
            <div style={{ fontSize: 12.5, color: "#78716c", marginBottom: 16 }}>
              Define como a Frente de Caixa se comporta.
            </div>
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
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Nome do estabelecimento</div>
            <div style={{ fontSize: 12.5, color: "#78716c", marginBottom: 14 }}>
              Aparece no cardápio online, no PDV e nas notificações do bot.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={nome} onChange={e => setNome(e.target.value)} maxLength={60} className="sup-inp" placeholder="Ex: Lanches do Marcos" />
              <button onClick={salvarNome} disabled={salvando} style={{ ...btnBase, background: "#15803d", color: "#fff", opacity: salvando ? 0.6 : 1, whiteSpace: "nowrap" }}>
                Salvar
              </button>
            </div>
          </div>

          {/* Sincronização & atualização */}
          <div style={cardStyle}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Sincronização & atualização</div>
            <div style={{ fontSize: 12.5, color: "#78716c", marginBottom: 14 }}>
              Ações rápidas para forçar sync manual e verificar novas versões do PDV.
            </div>

            {sincStat && (
              <div style={{ padding: "10px 14px", background: "#fafaf9", borderRadius: 8, border: "1px solid #f5f5f4", fontSize: 12, color: "#57534e", marginBottom: 12 }}>
                <div><b>Servidor remoto:</b> {sincStat.url || "não configurado"}</div>
                <div><b>Última sync:</b> {sincStat.last_sync ? new Date(sincStat.last_sync).toLocaleString("pt-BR") : "nunca"}</div>
                {sincStat.last_sync_result && <div><b>Resultado:</b> {sincStat.last_sync_result}</div>}
              </div>
            )}

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

          {/* Diagnóstico */}
          <div style={cardStyle}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Diagnóstico</div>
            <div style={{ fontSize: 12.5, color: "#78716c", marginBottom: 14 }}>Informações para reportar problemas ao suporte.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5, color: "#57534e", background: "#fafaf9", borderRadius: 8, padding: 14, border: "1px solid #f5f5f4" }}>
              <div><b>PDV:</b> {pdvVer || "web / navegador"}</div>
              <div><b>Servidor local:</b> {statusServidor?.ok !== false ? "🟢 online" : "🔴 offline"}</div>
              <div><b>Perfil configurado:</b> {perfil?.configurado ? "sim" : "não"}</div>
              <div><b>Modo atual:</b> {perfil?.modo || "não definido"}</div>
              <div style={{ gridColumn: "1 / -1" }}><b>Módulos ativos:</b> {(perfil?.modulos || []).join(", ") || "nenhum"}</div>
            </div>
          </div>

          {/* Info rodapé */}
          <div style={{ fontSize: 11.5, color: "#a8a29e", textAlign: "center", padding: "6px 20px", lineHeight: 1.6 }}>
            🛟 Área do suporte Nexus. Alterações feitas aqui afetam a estrutura do PDV.<br />
            Em caso de dúvida, entre em contato com o suporte antes de mudar qualquer coisa.
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.cor, color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 100 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
