import { useEffect, useState, useCallback } from "react";
import { api } from "./api";

const fmtBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Constrói datetime string YYYY-MM-DDTHH:MM a partir de data + hora separadas
function buildDateTime(data, hora, padraoHora) {
  if (!data) return null;
  return `${data}T${hora || padraoHora}`;
}

// Vigência baseada em janela datetime contínua [inicio, fim]
// inicio = data_inicio + hora_inicio (default 00:00)
// fim    = data_fim    + hora_fim    (default 23:59)
function vigenciaAgora(p) {
  if (!p.disponivel) return "pausada";

  const agora = new Date();
  agora.setUTCHours(agora.getUTCHours() - 3);
  const agoraIso = agora.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM

  const inicio = buildDateTime(p.promo_data_inicio, p.promo_hora_inicio, "00:00");
  const fim    = buildDateTime(p.promo_data_fim,    p.promo_hora_fim,    "23:59");

  if (inicio && agoraIso < inicio) return "agendada";
  if (fim    && agoraIso > fim)    return "expirada";
  return "ativa";
}

const STATUS_VISUAL = {
  ativa:    { cor: "#15803d", bg: "#f0fdf4", label: "🔥 ATIVA AGORA" },
  agendada: { cor: "#2563eb", bg: "#eff6ff", label: "📅 AGENDADA" },
  expirada: { cor: "#78716c", bg: "#f5f5f4", label: "⏱ EXPIRADA" },
  pausada:  { cor: "#dc2626", bg: "#fef2f2", label: "⏸ PAUSADA" },
};

// "10/05 19:00" a partir de "2026-05-10" + "19:00"
function fmtDataHora(data, hora) {
  if (!data) return null;
  const [y, m, d] = data.split("-");
  return `${d}/${m}${hora ? " " + hora : ""}`;
}

// Calcula duração legível entre dois datetimes (start, end) já formatados ISO
function duracaoLegivel(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const a = new Date(startIso.includes("T") ? startIso : startIso + "T00:00");
  const b = new Date(endIso.includes("T") ? endIso : endIso + "T23:59");
  if (b <= a) return null;
  const ms = b - a;
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const mm = min % 60;
  if (h < 24) return mm ? `${h}h ${mm}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d}d ${hh}h` : (d === 1 ? "1 dia" : `${d} dias`);
}

function calcularDesconto(preco, precoDe) {
  if (!precoDe || precoDe <= preco) return 0;
  return Math.round(((precoDe - preco) / precoDe) * 100);
}

// ──────────────── FORMULÁRIO DE PROMOÇÃO ────────────────
function FormPromocao({ inicial, onSalvar, onCancelar }) {
  const [nome, setNome]               = useState(inicial?.nome || "");
  const [descricao, setDescricao]     = useState(inicial?.promo_descricao || inicial?.descricao || "");
  const [precoDe, setPrecoDe]         = useState(inicial?.preco_de ?? "");
  const [preco, setPreco]             = useState(inicial?.preco ?? "");
  const [custo, setCusto]             = useState(inicial?.custo ?? "");
  const [imagem, setImagem]           = useState(inicial?.imagem || "");
  const [dataInicio, setDataInicio]   = useState(inicial?.promo_data_inicio || "");
  const [dataFim, setDataFim]         = useState(inicial?.promo_data_fim || "");
  const [horaInicio, setHoraInicio]   = useState(inicial?.promo_hora_inicio || "");
  const [horaFim, setHoraFim]         = useState(inicial?.promo_hora_fim || "");
  const [disponivel, setDisponivel]   = useState(inicial?.disponivel !== 0);
  const [destaque, setDestaque]       = useState(inicial?.promo_destaque !== 0);
  const [salvando, setSalvando]       = useState(false);
  const [erro, setErro]               = useState("");

  const desconto = calcularDesconto(Number(preco), Number(precoDe));

  // Preview da duração ao vivo
  const inicioIso = dataInicio ? `${dataInicio}T${horaInicio || "00:00"}` : null;
  const fimIso    = dataFim    ? `${dataFim}T${horaFim || "23:59"}` : null;
  const durStr    = duracaoLegivel(inicioIso, fimIso);
  const janelaInvalida = inicioIso && fimIso && fimIso <= inicioIso;

  async function handleSalvar(e) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) return setErro("Nome é obrigatório");
    if (!preco || Number(preco) <= 0) return setErro("Preço promocional é obrigatório");
    if (precoDe && Number(precoDe) <= Number(preco)) return setErro("'De' precisa ser maior que 'Por'");
    if (janelaInvalida) return setErro("Data/hora de fim precisa ser depois da de início");

    setSalvando(true);
    try {
      const dados = {
        nome: nome.trim(),
        descricao: "",
        promo_descricao: descricao.trim() || null,
        preco: Number(preco),
        preco_de: precoDe ? Number(precoDe) : null,
        custo: Number(custo) || 0,
        imagem: imagem || "",
        disponivel: disponivel ? 1 : 0,
        promo_destaque: destaque ? 1 : 0,
        promo_data_inicio: dataInicio || null,
        promo_data_fim: dataFim || null,
        promo_hora_inicio: horaInicio || null,
        promo_hora_fim: horaFim || null,
        promo_dias_semana: null, // não usado mais (substituído por datetime contínuo)
      };
      await onSalvar(dados);
    } catch (err) {
      setErro(err.message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  function handleImagem(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setErro("Imagem maior que 2MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setImagem(ev.target.result);
    reader.readAsDataURL(file);
  }

  return (
    <form onSubmit={handleSalvar} style={{ display: "grid", gap: 16 }}>
      {/* Cabeçalho com preview do desconto */}
      {desconto > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)",
          border: "1.5px solid #F59E0B", borderRadius: 10, padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 14
        }}>
          <div style={{ fontSize: 28 }}>🔥</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#78350F", fontSize: 14 }}>Desconto de {desconto}%</div>
            <div style={{ fontSize: 12, color: "#92400E" }}>De {fmtBRL(precoDe)} por {fmtBRL(preco)} — economia de {fmtBRL(Number(precoDe) - Number(preco))}</div>
          </div>
        </div>
      )}

      {/* Linha 1: Nome */}
      <div>
        <label style={lbl}>Nome da promoção *</label>
        <input style={inp} type="text" value={nome} onChange={e => setNome(e.target.value)}
          placeholder="Ex: Combo Casal Sexta · X-Burger Day · Pastel Duplo" required maxLength={80} />
      </div>

      {/* Descrição (livre) */}
      <div>
        <label style={lbl}>Descrição (aparece no card do cliente)</label>
        <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={descricao} onChange={e => setDescricao(e.target.value)}
          placeholder="Ex: 2x X-Bacon + Coca 2L + Batata G — só sexta, das 19h às 22h"
          maxLength={300} />
      </div>

      {/* Preços */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div>
          <label style={lbl}>De (preço normal)</label>
          <input style={inp} type="number" step="0.01" min="0" value={precoDe} onChange={e => setPrecoDe(e.target.value)}
            placeholder="Ex: 35,90" />
          <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 3 }}>Aparece riscado no card</div>
        </div>
        <div>
          <label style={lbl}>Por (promocional) *</label>
          <input style={{ ...inp, borderColor: "#F38C24", background: "#FFF8F0", fontWeight: 700 }}
            type="number" step="0.01" min="0" value={preco} onChange={e => setPreco(e.target.value)} required />
        </div>
        <div>
          <label style={lbl}>Custo (CMV)</label>
          <input style={inp} type="number" step="0.01" min="0" value={custo} onChange={e => setCusto(e.target.value)}
            placeholder="0,00" />
          <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 3 }}>Custo de produção do combo</div>
        </div>
      </div>

      {/* Imagem */}
      <div>
        <label style={lbl}>Imagem do combo</label>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {imagem ? (
            <div style={{ position: "relative" }}>
              <img src={imagem} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10, border: "1px solid #e7e5e4" }} />
              <button type="button" onClick={() => setImagem("")}
                style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", background: "#dc2626", color: "#fff", border: "2px solid #fff", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>
                ×
              </button>
            </div>
          ) : (
            <div style={{ width: 96, height: 96, borderRadius: 10, background: "#fafaf9", border: "1.5px dashed #d6d3d1", display: "flex", alignItems: "center", justifyContent: "center", color: "#a8a29e", fontSize: 30 }}>
              📷
            </div>
          )}
          <label style={{ ...btn, background: "#fff", border: "1px solid #e7e5e4", color: "#1c1917", cursor: "pointer", margin: 0 }}>
            {imagem ? "Trocar imagem" : "Escolher imagem"}
            <input type="file" accept="image/*" onChange={handleImagem} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Período da promoção — datetime contínuo (início → fim) */}
      <div>
        <label style={{ ...lbl, fontSize: 13, fontWeight: 700, color: "#1c1917", textTransform: "none", letterSpacing: 0 }}>
          📅 Período da promoção
        </label>
        <div style={{ background: "#fafaf9", padding: 14, borderRadius: 10, border: "1px solid #e7e5e4" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* INÍCIO */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: 0.6 }}>Início</span>
              </div>
              <input style={{ ...inp, marginBottom: 6 }} type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              <input style={inp} type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} placeholder="00:00" />
              <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 4 }}>Padrão: 00:00 se em branco</div>
            </div>

            {/* FIM */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: 0.6 }}>Fim</span>
              </div>
              <input style={{ ...inp, marginBottom: 6 }} type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              <input style={inp} type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)} placeholder="23:59" />
              <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 4 }}>Padrão: 23:59 se em branco</div>
            </div>
          </div>

          {/* Preview da duração / aviso */}
          {durStr && !janelaInvalida && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12, color: "#15803d", display: "flex", alignItems: "center", gap: 6 }}>
              ⏱ <b>Duração:</b> {durStr}
              {inicioIso && fimIso && (
                <span style={{ color: "#78716c", fontWeight: 500 }}>
                  &nbsp;· {fmtDataHora(dataInicio, horaInicio || "00:00")} → {fmtDataHora(dataFim, horaFim || "23:59")}
                </span>
              )}
            </div>
          )}
          {janelaInvalida && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#b91c1c" }}>
              ⚠ A data/hora de fim precisa ser depois da de início.
            </div>
          )}

          <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 8, lineHeight: 1.5 }}>
            💡 Atravessa a meia-noite? Sem problema: Ex. <b>10/05 às 19:00 → 11/05 às 01:00</b> dura 6h.<br />
            Deixe em branco pra promoção sem prazo.
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={tgl}>
          <input type="checkbox" checked={disponivel} onChange={e => setDisponivel(e.target.checked)} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Disponível</div>
            <div style={{ fontSize: 11, color: "#78716c" }}>Cliente pode pedir</div>
          </div>
        </label>
        <label style={tgl}>
          <input type="checkbox" checked={destaque} onChange={e => setDestaque(e.target.checked)} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>⭐ Destaque do dia</div>
            <div style={{ fontSize: 11, color: "#78716c" }}>Aparece no topo do cardápio</div>
          </div>
        </label>
      </div>

      {erro && (
        <div style={{ padding: 10, background: "#fef2f2", color: "#b91c1c", borderRadius: 8, fontSize: 13, border: "1px solid #fecaca" }}>
          ⚠ {erro}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid #e7e5e4", paddingTop: 14 }}>
        <button type="button" onClick={onCancelar} disabled={salvando} style={{ ...btn, background: "#fff", color: "#1c1917", border: "1px solid #e7e5e4" }}>
          Cancelar
        </button>
        <button type="submit" disabled={salvando} style={{ ...btn, background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)", color: "#fff", boxShadow: "0 2px 8px rgba(217,119,6,0.3)" }}>
          {salvando ? "Salvando..." : (inicial ? "Salvar alterações" : "Cadastrar promoção")}
        </button>
      </div>
    </form>
  );
}

// ──────────────── COMPONENTE PRINCIPAL ────────────────
export default function Promocoes() {
  const [promocoes, setPromocoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todas");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  const carregar = useCallback(async () => {
    try {
      const lista = await api.promocoes.listar();
      setPromocoes(lista);
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(dados) {
    if (editando?.id) {
      const upd = await api.promocoes.atualizar(editando.id, dados);
      setPromocoes(ps => ps.map(p => p.id === editando.id ? upd : p));
      showToast("Promoção atualizada!");
    } else {
      const nov = await api.promocoes.criar(dados);
      setPromocoes(ps => [...ps, nov]);
      showToast("Promoção cadastrada!");
    }
    setModal(false); setEditando(null);
  }

  async function excluir(id) {
    try {
      await api.promocoes.excluir(id);
      setPromocoes(ps => ps.filter(p => p.id !== id));
      setConfirmDel(null);
      showToast("Promoção movida para a lixeira", "#7c3aed");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    }
  }

  // Duplica: abre o modal de cadastro pré-preenchido com os dados (menos id e datas)
  function duplicar(p) {
    setEditando({
      ...p,
      id: undefined,             // força criar novo
      nome: `${p.nome} (cópia)`,
      promo_data_inicio: "",     // limpa datas — admin define novas
      promo_data_fim: "",
    });
    setModal(true);
  }

  const com_status = promocoes.map(p => ({ ...p, _status: vigenciaAgora(p) }));
  const filtradas = com_status.filter(p => filtroStatus === "todas" || p._status === filtroStatus);

  const counts = {
    todas: com_status.length,
    ativa: com_status.filter(p => p._status === "ativa").length,
    agendada: com_status.filter(p => p._status === "agendada").length,
    expirada: com_status.filter(p => p._status === "expirada").length,
    pausada: com_status.filter(p => p._status === "pausada").length,
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando promoções...</div>;

  return (
    <div className="anim">
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          background: "linear-gradient(135deg, #FFF8E1 0%, #FFE0B2 100%)",
          border: "1px solid #F59E0B",
          borderRadius: 14, padding: "16px 20px",
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap"
        }}>
          <div style={{ fontSize: 36 }}>🔥</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 19, fontWeight: 700, color: "#78350F" }}>Promoções & Destaques</div>
            <div style={{ fontSize: 12, color: "#92400E", marginTop: 2 }}>
              Engaje os clientes com promoções semanais, mensais ou em datas específicas. Aparecem no topo do cardápio como <b>"Destaques do dia"</b>.
            </div>
          </div>
          <button onClick={() => { setEditando(null); setModal(true); }}
            style={{ ...btn, background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)", color: "#fff", boxShadow: "0 2px 8px rgba(217,119,6,0.3)" }}>
            <span style={{ fontSize: 18 }}>+</span> Nova promoção
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          { k: "todas",    l: `Todas (${counts.todas})`,        c: "#1c1917" },
          { k: "ativa",    l: `🔥 Ativas (${counts.ativa})`,    c: "#15803d" },
          { k: "agendada", l: `📅 Agendadas (${counts.agendada})`, c: "#2563eb" },
          { k: "pausada",  l: `⏸ Pausadas (${counts.pausada})`, c: "#dc2626" },
          { k: "expirada", l: `⏱ Expiradas (${counts.expirada})`, c: "#78716c" },
        ].map(f => (
          <button key={f.k} onClick={() => setFiltroStatus(f.k)}
            style={{
              padding: "6px 14px", borderRadius: 8,
              border: filtroStatus === f.k ? `1.5px solid ${f.c}` : "1px solid #e7e5e4",
              background: filtroStatus === f.k ? f.c : "#fff",
              color: filtroStatus === f.k ? "#fff" : "#57534e",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
          {promocoes.length === 0 ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#1c1917", marginBottom: 6 }}>Nenhuma promoção cadastrada ainda</div>
              <div style={{ fontSize: 13 }}>Crie a primeira promoção e dê destaque no cardápio.</div>
            </>
          ) : "Nenhuma promoção nesse filtro."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 14 }}>
          {filtradas.map(p => {
            const sv = STATUS_VISUAL[p._status] || STATUS_VISUAL.expirada;
            const desconto = calcularDesconto(p.preco, p.preco_de);
            const periodoStr = (() => {
              if (!p.promo_data_inicio && !p.promo_data_fim) return "Sem prazo";
              const ini = p.promo_data_inicio ? fmtDataHora(p.promo_data_inicio, p.promo_hora_inicio || "00:00") : "sempre";
              const fim = p.promo_data_fim    ? fmtDataHora(p.promo_data_fim,    p.promo_hora_fim    || "23:59") : "sempre";
              return `${ini} → ${fim}`;
            })();
            const inicioIso = p.promo_data_inicio ? `${p.promo_data_inicio}T${p.promo_hora_inicio || "00:00"}` : null;
            const fimIso    = p.promo_data_fim    ? `${p.promo_data_fim}T${p.promo_hora_fim    || "23:59"}` : null;
            const dur = duracaoLegivel(inicioIso, fimIso);
            return (
              <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {/* Imagem com badges sobrepostos */}
                <div style={{ position: "relative", aspectRatio: "16/9", background: "#fafaf9", overflow: "hidden" }}>
                  {p.imagem ? (
                    <img src={p.imagem} alt={p.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, color: "#d6d3d1" }}>🍔</div>
                  )}
                  <div style={{ position: "absolute", top: 10, left: 10, background: sv.cor, color: "#fff", padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>
                    {sv.label}
                  </div>
                  {desconto > 0 && (
                    <div style={{ position: "absolute", top: 10, right: 10, background: "#dc2626", color: "#fff", padding: "6px 12px", borderRadius: 999, fontSize: 14, fontWeight: 800, boxShadow: "0 4px 10px rgba(220,38,38,0.35)" }}>
                      −{desconto}%
                    </div>
                  )}
                  {!p.promo_destaque && (
                    <div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(0,0,0,0.7)", color: "#fff", padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                      Sem destaque no topo
                    </div>
                  )}
                </div>

                {/* Conteúdo */}
                <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: "#1c1917", marginBottom: 4 }}>{p.nome}</div>
                  {(p.promo_descricao || p.descricao) && (
                    <div style={{ fontSize: 12, color: "#78716c", marginBottom: 10, lineHeight: 1.4 }}>{p.promo_descricao || p.descricao}</div>
                  )}

                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                    {p.preco_de && (
                      <span style={{ fontSize: 13, color: "#a8a29e", textDecoration: "line-through" }}>{fmtBRL(p.preco_de)}</span>
                    )}
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, color: "#dc2626" }}>{fmtBRL(p.preco)}</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 11, color: "#57534e", marginBottom: 12 }}>
                    <span style={{ color: "#a8a29e" }}>📅</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{periodoStr}</span>
                    {dur && (
                      <>
                        <span style={{ color: "#a8a29e" }}>⏱</span>
                        <span><b>{dur}</b> de duração</span>
                      </>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                    <button onClick={() => { setEditando(p); setModal(true); }}
                      title="Editar"
                      style={{ flex: 1, padding: "8px 12px", border: "1px solid #e7e5e4", borderRadius: 8, background: "#fff", color: "#1c1917", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      ✏ Editar
                    </button>
                    <button onClick={() => duplicar(p)}
                      title="Duplicar (para criar uma nova promoção igual em outra data)"
                      style={{ padding: "8px 12px", border: "1px solid #e7e5e4", borderRadius: 8, background: "#fff", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      📋
                    </button>
                    <button onClick={() => setConfirmDel(p)}
                      title="Excluir"
                      style={{ padding: "8px 12px", border: "1px solid #fecaca", borderRadius: 8, background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal cadastro/edição */}
      {modal && (
        <div onClick={() => { setModal(false); setEditando(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20, overflow: "auto" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", padding: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: "#1c1917" }}>
                {editando?.id ? "Editar promoção" : "🔥 Nova promoção"}
              </h2>
              <button onClick={() => { setModal(false); setEditando(null); }}
                style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", cursor: "pointer", fontSize: 16, color: "#78716c" }}>
                ×
              </button>
            </div>
            <FormPromocao
              inicial={editando}
              onSalvar={salvar}
              onCancelar={() => { setModal(false); setEditando(null); }}
            />
          </div>
        </div>
      )}

      {/* Confirma exclusão */}
      {confirmDel && (
        <div onClick={() => setConfirmDel(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 420, width: "100%" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1c1917", marginBottom: 8 }}>Excluir promoção?</div>
            <div style={{ fontSize: 13, color: "#78716c", marginBottom: 16 }}>
              <b>{confirmDel.nome}</b> vai pra lixeira — você pode restaurar depois se mudar de ideia.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDel(null)} style={{ ...btn, background: "#fff", color: "#1c1917", border: "1px solid #e7e5e4" }}>
                Cancelar
              </button>
              <button onClick={() => excluir(confirmDel.id)} style={{ ...btn, background: "#dc2626", color: "#fff" }}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.cor, color: "#fff", padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ────────────── ESTILOS LOCAIS ──────────────
const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: "#57534e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontFamily: "'DM Sans', sans-serif" };
const inp = { width: "100%", padding: "10px 12px", border: "1px solid #e7e5e4", borderRadius: 8, fontSize: 14, fontFamily: "'DM Sans', sans-serif", background: "#fff", color: "#1c1917", outline: "none" };
const btn = { padding: "10px 18px", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif" };
const tgl = { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #e7e5e4", borderRadius: 8, cursor: "pointer", background: "#fff" };
