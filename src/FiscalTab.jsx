import { useState, useEffect } from "react";
import { api } from "./api";

const cfgInp = { padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917" };
const cfgBtn = { background: "#F38C24", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" };
const cfgDel = { background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#dc2626" };
const lblStyle = { display: "block", fontSize: 11, fontWeight: 600, color: "#78716c", letterSpacing: "0.06em", marginBottom: 6 };

const REGIMES = [
  { v: "simples", l: "Simples Nacional" },
  { v: "mei", l: "MEI" },
  { v: "normal", l: "Lucro Presumido/Real" },
];

// Config padrão — usada como estado inicial pra que o form renderize INSTANTÂNEO
// (sem tela de "Carregando..." que causava um flash perceptível). A chamada real
// à API roda em background e só substitui os valores quando chega.
const CFG_DEFAULT = {
  nfce_habilitado: false, ambiente: "homologacao",
  cnpj: "", razao_social: "", nome_fantasia: "", inscricao_estadual: "", regime_tributario: "simples",
  cep: "", logradouro: "", numero: "", bairro: "", municipio: "", codigo_municipio: "", uf: "",
  csc_id: "", csc_preenchido: false, serie: "1", proximo_numero: 1,
  antigo_habilitado: false,
  provedor: "nenhum", provedor_token_preenchido: false,
  cert_presente: false, cert_nome_arquivo: "", cert_cnpj: "", cert_titular: "", cert_validade_fim: "", cert_atualizado_em: "",
  email_contabilidade: "", relatorio_dia_mes: 5, n8n_webhook_relatorio: "",
};

// Aba Fiscal / NFC-e: identidade fiscal, certificado A1, provedor de emissão
// (Focus NFe) e relatório mensal automático pra contabilidade via n8n.
export default function FiscalTab() {
  const [cfg, setCfg] = useState(CFG_DEFAULT);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState("");

  const [arquivoCert, setArquivoCert] = useState(null);
  const [senhaCert, setSenhaCert] = useState("");
  const [enviandoCert, setEnviandoCert] = useState(false);
  const [removendoCert, setRemovendoCert] = useState(false);

  const [testando, setTestando] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 3000); };

  const carregar = () =>
    api.fiscal.obter().then(r => setCfg(c => ({ ...c, ...r }))).catch(() => showToast("Erro ao carregar", "#dc2626"));
  useEffect(() => { carregar(); }, []);

  const upd = (campo) => (e) => setCfg(c => ({ ...c, [campo]: e.target.value }));

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await api.fiscal.salvar(cfg);
      setCfg(c => ({ ...c, ...r }));
      showToast("Configuração fiscal salva!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setSalvando(false); }
  };

  const enviarCertificado = async () => {
    if (!arquivoCert) return showToast("Selecione o arquivo do certificado (.pfx/.p12)", "#dc2626");
    if (!senhaCert) return showToast("Digite a senha do certificado", "#dc2626");
    setEnviandoCert(true);
    try {
      const pfx_base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(arquivoCert);
      });
      const r = await api.fiscal.enviarCertificado({ nome_arquivo: arquivoCert.name, pfx_base64, senha: senhaCert });
      setCfg(c => ({ ...c, ...r }));
      setArquivoCert(null);
      setSenhaCert("");
      showToast("Certificado carregado com sucesso!");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setEnviandoCert(false); }
  };

  const removerCertificado = async () => {
    if (!confirm("Remover o certificado A1? A emissão real de NFC-e vai parar de funcionar até enviar um novo.")) return;
    setRemovendoCert(true);
    try {
      await api.fiscal.removerCertificado();
      await carregar();
      showToast("Certificado removido", "#7c3aed");
    } catch (e) { showToast("Erro: " + e.message, "#dc2626"); }
    finally { setRemovendoCert(false); }
  };

  const testarEmissao = async () => {
    setTestando(true);
    setTestResult(null);
    try {
      const r = await api.fiscal.testarNFCe();
      setTestResult({ ok: true, chave: r.chave, status: r.status });
      showToast("Emissão de teste concluída!");
    } catch (e) {
      setTestResult({ ok: false, erro: e.message });
      showToast("Falha na emissão de teste", "#dc2626");
    } finally { setTestando(false); }
  };

  // Sem tela de "Carregando..." — o formulário renderiza IMEDIATO com CFG_DEFAULT
  // e os valores reais entram assim que a chamada api.fiscal.obter() resolve.

  const statusBadge = (ok, label) => (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
      background: ok ? "#dcfce7" : "#fee2e2", color: ok ? "#16a34a" : "#dc2626" }}>{label}</span>
  );

  return (
    <div className="anim">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>

        {/* Ativação */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Emissão de NFC-e</div>
            {statusBadge(cfg.nfce_habilitado, cfg.nfce_habilitado ? "🟢 Ativo" : "🔴 Desativado")}
          </div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 14 }}>
            Habilite para emitir nota fiscal ao consumidor nos fechamentos. Enquanto desativado,
            nenhuma nota é emitida (mesmo com certificado configurado).
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={!!cfg.nfce_habilitado} onChange={e => setCfg(c => ({ ...c, nfce_habilitado: e.target.checked }))} />
            Habilitar emissão de NFC-e
          </label>
        </div>

        {/* Identidade fiscal */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Identidade fiscal</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lblStyle}>CNPJ</label>
              <input value={cfg.cnpj} onChange={upd("cnpj")} placeholder="00.000.000/0000-00" style={{ ...cfgInp, width: "100%" }} /></div>
            <div><label style={lblStyle}>INSCRIÇÃO ESTADUAL</label>
              <input value={cfg.inscricao_estadual} onChange={upd("inscricao_estadual")} style={{ ...cfgInp, width: "100%" }} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lblStyle}>RAZÃO SOCIAL</label>
              <input value={cfg.razao_social} onChange={upd("razao_social")} style={{ ...cfgInp, width: "100%" }} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lblStyle}>NOME FANTASIA</label>
              <input value={cfg.nome_fantasia} onChange={upd("nome_fantasia")} style={{ ...cfgInp, width: "100%" }} /></div>
            <div><label style={lblStyle}>REGIME TRIBUTÁRIO</label>
              <select value={cfg.regime_tributario} onChange={upd("regime_tributario")} style={{ ...cfgInp, width: "100%", cursor: "pointer" }}>
                {REGIMES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select></div>
            <div><label style={lblStyle}>AMBIENTE</label>
              <select value={cfg.ambiente} onChange={upd("ambiente")} style={{ ...cfgInp, width: "100%", cursor: "pointer" }}>
                <option value="homologacao">Homologação (testes)</option>
                <option value="producao">Produção (valor fiscal real)</option>
              </select></div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#57534e", margin: "18px 0 10px", borderTop: "1px solid #f5f5f4", paddingTop: 14 }}>Endereço fiscal</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label style={lblStyle}>CEP</label>
              <input value={cfg.cep} onChange={upd("cep")} style={{ ...cfgInp, width: "100%" }} /></div>
            <div style={{ gridColumn: "span 2" }}><label style={lblStyle}>LOGRADOURO</label>
              <input value={cfg.logradouro} onChange={upd("logradouro")} style={{ ...cfgInp, width: "100%" }} /></div>
            <div><label style={lblStyle}>NÚMERO</label>
              <input value={cfg.numero} onChange={upd("numero")} style={{ ...cfgInp, width: "100%" }} /></div>
            <div><label style={lblStyle}>BAIRRO</label>
              <input value={cfg.bairro} onChange={upd("bairro")} style={{ ...cfgInp, width: "100%" }} /></div>
            <div><label style={lblStyle}>UF</label>
              <input value={cfg.uf} onChange={upd("uf")} maxLength={2} style={{ ...cfgInp, width: "100%", textTransform: "uppercase" }} /></div>
            <div><label style={lblStyle}>MUNICÍPIO</label>
              <input value={cfg.municipio} onChange={upd("municipio")} style={{ ...cfgInp, width: "100%" }} /></div>
            <div><label style={lblStyle}>CÓD. IBGE DO MUNICÍPIO</label>
              <input value={cfg.codigo_municipio} onChange={upd("codigo_municipio")} placeholder="7 dígitos" style={{ ...cfgInp, width: "100%" }} /></div>
          </div>
        </div>

        {/* Certificado A1 */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Certificado digital A1</div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 14 }}>
            Necessário para assinar as notas fiscais. Peça o arquivo .pfx/.p12 e a senha ao contador
            ou à certificadora do cliente.
          </div>

          {cfg.cert_presente ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12.5 }}>
                <div><b>Titular:</b> {cfg.cert_titular || "—"}</div>
                <div><b>CNPJ do certificado:</b> {cfg.cert_cnpj || "—"}</div>
                <div><b>Validade:</b> {cfg.cert_validade_fim ? new Date(cfg.cert_validade_fim).toLocaleDateString("pt-BR") : "—"}</div>
                <div style={{ color: "#78716c" }}>Enviado em {cfg.cert_atualizado_em ? new Date(cfg.cert_atualizado_em).toLocaleString("pt-BR") : "—"}</div>
              </div>
              <button onClick={removerCertificado} disabled={removendoCert} style={{ ...cfgDel, alignSelf: "flex-start", opacity: removendoCert ? 0.6 : 1 }}>
                {removendoCert ? "Removendo..." : "Remover certificado"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ ...cfgBtn, background: "#fff", color: "#57534e", border: "1.5px solid #e7e5e4", textAlign: "center", cursor: "pointer" }}>
                {arquivoCert ? `📄 ${arquivoCert.name}` : "📎 Escolher arquivo .pfx/.p12"}
                <input type="file" accept=".pfx,.p12" style={{ display: "none" }} onChange={e => setArquivoCert(e.target.files?.[0] || null)} />
              </label>
              <input type="password" value={senhaCert} onChange={e => setSenhaCert(e.target.value)}
                placeholder="Senha do certificado" style={{ ...cfgInp, width: "100%" }} />
              <button onClick={enviarCertificado} disabled={enviandoCert} style={{ ...cfgBtn, opacity: enviandoCert ? 0.6 : 1 }}>
                {enviandoCert ? "Enviando..." : "Enviar certificado"}
              </button>
            </div>
          )}
        </div>

        {/* Motor de emissão: SEFAZ direto (grátis) ou provedor terceirizado (opcional) */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Motor de emissão</div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 14 }}>
            O CSC/CSC ID é obtido no portal da SEFAZ do estado do cliente e vale pros dois motores.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 14px", borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${cfg.antigo_habilitado ? "#15803d" : "#e7e5e4"}`, background: cfg.antigo_habilitado ? "#f0fdf415" : "#fafaf9" }}>
              <input type="radio" name="motorEmissao" checked={!!cfg.antigo_habilitado}
                onChange={() => setCfg(c => ({ ...c, antigo_habilitado: true }))} style={{ display: "none" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: cfg.antigo_habilitado ? "#15803d" : "#1c1917" }}>SEFAZ direto · grátis</span>
              <span style={{ fontSize: 11, color: "#78716c" }}>Sem intermediário, sem custo por nota. Hoje cobre só SP, com contingência automática se a SEFAZ ficar indisponível.</span>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 14px", borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${!cfg.antigo_habilitado ? "#15803d" : "#e7e5e4"}`, background: !cfg.antigo_habilitado ? "#f0fdf415" : "#fafaf9" }}>
              <input type="radio" name="motorEmissao" checked={!cfg.antigo_habilitado}
                onChange={() => setCfg(c => ({ ...c, antigo_habilitado: false, provedor: "focus" }))} style={{ display: "none" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: !cfg.antigo_habilitado ? "#15803d" : "#1c1917" }}>Provedor terceirizado · opcional</span>
              <span style={{ fontSize: 11, color: "#78716c" }}>Focus NFe cuida da comunicação com a SEFAZ. Cobre qualquer estado, custo por nota emitida.</span>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lblStyle}>CSC ID</label>
              <input value={cfg.csc_id} onChange={upd("csc_id")} style={{ ...cfgInp, width: "100%" }} /></div>
            <div><label style={lblStyle}>CSC (CÓDIGO DE SEGURANÇA)</label>
              <input type="password" onChange={upd("csc")}
                placeholder={cfg.csc_preenchido ? "•••••••••••• (já configurado — digite para trocar)" : "Código fornecido pela SEFAZ"}
                style={{ ...cfgInp, width: "100%" }} /></div>
            {!cfg.antigo_habilitado && (
              <div style={{ gridColumn: "1 / -1" }}><label style={lblStyle}>TOKEN DA API (FOCUS NFE)</label>
                <input type="password" onChange={upd("provedor_token")}
                  placeholder={cfg.provedor_token_preenchido ? "•••••••••••• (já configurado — digite para trocar)" : "Cole o token de acesso"}
                  style={{ ...cfgInp, width: "100%" }} /></div>
            )}
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #f5f5f4" }}>
            <button onClick={testarEmissao} disabled={testando} style={{ ...cfgBtn, background: "#1c1917", opacity: testando ? 0.6 : 1 }}>
              {testando ? "Emitindo..." : "🧪 Testar emissão"}
            </button>
            {testResult && (
              <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, fontSize: 12.5,
                background: testResult.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}` }}>
                {testResult.ok
                  ? <>✅ Nota de teste emitida — status: <b>{testResult.status}</b>{testResult.chave && <div style={{ fontFamily: "monospace", marginTop: 4, wordBreak: "break-all" }}>{testResult.chave}</div>}</>
                  : <>❌ {testResult.erro}</>}
              </div>
            )}
          </div>
        </div>

        {/* Relatório mensal automático */}
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Relatório mensal para a contabilidade</div>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 14 }}>
            Todo mês, no dia escolhido, as notas emitidas no mês anterior são enviadas automaticamente
            por e-mail (via n8n) para a contabilidade.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div><label style={lblStyle}>E-MAIL DA CONTABILIDADE</label>
              <input type="email" value={cfg.email_contabilidade || ""} onChange={upd("email_contabilidade")}
                placeholder="contabilidade@escritorio.com.br" style={{ ...cfgInp, width: "100%" }} /></div>
            <div><label style={lblStyle}>DIA DO ENVIO</label>
              <input type="number" min={1} max={28} value={cfg.relatorio_dia_mes || 5}
                onChange={e => setCfg(c => ({ ...c, relatorio_dia_mes: e.target.value }))} style={{ ...cfgInp, width: "100%" }} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lblStyle}>WEBHOOK DO N8N</label>
              <input value={cfg.n8n_webhook_relatorio || ""} onChange={upd("n8n_webhook_relatorio")}
                placeholder="https://n8n.seudominio.com/webhook/relatorio-fiscal" style={{ ...cfgInp, width: "100%" }} /></div>
          </div>
        </div>

        <button onClick={salvar} disabled={salvando} style={{ ...cfgBtn, padding: 12, opacity: salvando ? 0.6 : 1 }}>
          {salvando ? "Salvando..." : "Salvar configuração fiscal"}
        </button>
      </div>

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}
