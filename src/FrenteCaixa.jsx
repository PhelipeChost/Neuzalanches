import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";
import QRCode from "qrcode";

const fmtBRL = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtHora = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "Z");
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const tempoDesde = (iso) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso + "Z").getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}min`;
};

export default function FrenteCaixa({ onVoltar }) {
  const [tema, setTema] = useState(() => localStorage.getItem("caixa-tema") || "light");
  const [mesas, setMesas] = useState([]);
  const [mesaSel, setMesaSel] = useState(null);
  const [comanda, setComanda] = useState(null);
  const [itens, setItens] = useState([]);
  const [fila, setFila] = useState([]);
  const [stats, setStats] = useState(null);
  const [filtro, setFiltro] = useState("todas");
  const [clock, setClock] = useState("");
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal abrir comanda
  const [modalAbrir, setModalAbrir] = useState(null);
  const [novoCliente, setNovoCliente] = useState("");
  const [novoPessoas, setNovoPessoas] = useState(1);

  // Modal adicionar item
  const [modalItem, setModalItem] = useState(false);
  const [busca, setBusca] = useState("");
  const [itemObs, setItemObs] = useState("");
  const [itemQtd, setItemQtd] = useState(1);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (msg, cor = "var(--success)") => { setToast({ msg, cor }); setTimeout(() => setToast(null), 2500); };

  // QR Code modal
  const [modalQR, setModalQR] = useState(false);
  const [qrUrls, setQrUrls] = useState({});

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // Tema
  useEffect(() => {
    localStorage.setItem("caixa-tema", tema);
  }, [tema]);

  // Carregar dados
  const carregarTudo = useCallback(async () => {
    try {
      const [m, f, s, p] = await Promise.all([
        api.mesas.listar(),
        api.cozinha.fila(),
        api.caixaStats(),
        api.produtos.listar(),
      ]);
      setMesas(m);
      setFila(f);
      setStats(s);
      setProdutos(p.filter(pr => pr.disponivel));
    } catch (err) {
      showToast("Erro ao carregar: " + err.message, "var(--danger)");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregarTudo(); }, [carregarTudo]);

  // Polling a cada 10s
  useEffect(() => {
    const iv = setInterval(carregarTudo, 10000);
    return () => clearInterval(iv);
  }, [carregarTudo]);

  // Gerar QR codes quando o modal abre
  useEffect(() => {
    if (!modalQR || mesas.length === 0) return;
    const baseUrl = window.location.origin;
    (async () => {
      const urls = {};
      for (const mesa of mesas) {
        urls[mesa.numero] = await QRCode.toDataURL(`${baseUrl}/mesa/${mesa.numero}`, {
          width: 300, margin: 2, color: { dark: "#1C1917", light: "#FFFFFF" },
        });
      }
      setQrUrls(urls);
    })();
  }, [modalQR, mesas]);

  // Imprimir QR codes em nova janela
  const handlePrintQR = (singleMesa) => {
    const lista = singleMesa ? [singleMesa] : mesas;
    const cards = lista.map(m => `
      <div style="page-break-inside:avoid;border:2px dashed #D6D3D1;border-radius:16px;padding:24px 20px;text-align:center;width:260px;">
        <div style="font-size:13px;font-weight:700;color:#78716C;letter-spacing:1px;margin-bottom:10px;">FAÇA SEU PEDIDO</div>
        <img src="${qrUrls[m.numero]}" width="200" height="200" style="display:block;margin:0 auto 14px;" />
        <div style="font-family:'Inter',sans-serif;font-size:38px;font-weight:800;letter-spacing:-1px;line-height:1;">Mesa ${m.numero}</div>
        <div style="font-size:11px;color:#78716C;margin-top:10px;line-height:1.5;">Escaneie o QR Code acima<br/>para ver o cardápio e fazer seu pedido</div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid #E7E5E4;font-size:9px;color:#A8A29E;">O pagamento é feito no caixa</div>
      </div>
    `).join("");
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><title>QR Codes - Mesas</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap" rel="stylesheet">
      <style>
        body{font-family:'Inter',sans-serif;margin:0;padding:20px;background:#FAFAF9;}
        .grid{display:flex;flex-wrap:wrap;gap:20px;justify-content:center;}
        .no-print{text-align:center;margin-bottom:24px;}
        @media print{@page{margin:10mm;}.no-print{display:none!important;}}
      </style></head><body>
      <div class="no-print"><button onclick="window.print()" style="padding:12px 28px;font-size:15px;font-weight:700;background:linear-gradient(135deg,#F59E0B,#D97706);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(217,119,6,0.3);">🖨️ Imprimir</button></div>
      <div class="grid">${cards}</div></body></html>`);
    win.document.close();
  };

  // Selecionar mesa
  const selecionarMesa = async (mesa) => {
    setMesaSel(mesa);
    if (mesa.comanda) {
      setComanda(mesa.comanda);
      try {
        const it = await api.comandas.itens.listar(mesa.comanda.id);
        setItens(it);
      } catch { setItens([]); }
    } else {
      setComanda(null);
      setItens([]);
    }
  };

  // Abrir comanda
  const handleAbrirComanda = async () => {
    if (!modalAbrir) return;
    try {
      const c = await api.comandas.abrir({ mesa_id: modalAbrir.id, cliente_nome: novoCliente, pessoas: novoPessoas });
      setComanda(c);
      setItens([]);
      setModalAbrir(null);
      setNovoCliente("");
      setNovoPessoas(1);
      await carregarTudo();
      const mesaAtualizada = (await api.mesas.listar()).find(m => m.id === modalAbrir.id);
      if (mesaAtualizada) setMesaSel(mesaAtualizada);
      showToast("Comanda aberta!");
    } catch (err) { showToast(err.message, "var(--danger)"); }
  };

  // Adicionar item à comanda
  const handleAdicionarItem = async (prod) => {
    if (!comanda) return;
    try {
      await api.comandas.itens.adicionar(comanda.id, {
        produto_id: prod.id,
        produto_nome: `${itemQtd}× ${prod.nome}`,
        quantidade: itemQtd,
        preco_unitario: prod.preco,
        obs: itemObs,
        origem: "caixa",
      });
      const it = await api.comandas.itens.listar(comanda.id);
      setItens(it);
      const c = await api.comandas.buscar(comanda.id);
      setComanda(c);
      await carregarTudo();
      setModalItem(false);
      setBusca("");
      setItemObs("");
      setItemQtd(1);
      showToast(`${prod.nome} adicionado!`);
    } catch (err) { showToast(err.message, "var(--danger)"); }
  };

  // Fechar comanda (cobrar)
  const handleFechar = async () => {
    if (!comanda) return;
    try {
      await api.comandas.fechar(comanda.id);
      setComanda(null);
      setItens([]);
      setMesaSel(null);
      await carregarTudo();
      showToast("Comanda fechada com sucesso!");
    } catch (err) { showToast(err.message, "var(--danger)"); }
  };

  // Cancelar comanda
  const handleCancelar = async () => {
    if (!comanda || !confirm("Tem certeza que deseja cancelar esta comanda?")) return;
    try {
      await api.comandas.cancelar(comanda.id);
      setComanda(null);
      setItens([]);
      setMesaSel(null);
      await carregarTudo();
      showToast("Comanda cancelada", "var(--warning)");
    } catch (err) { showToast(err.message, "var(--danger)"); }
  };

  // Pedir conta
  const handlePedirConta = async () => {
    if (!mesaSel) return;
    try {
      await api.mesas.pedirConta(mesaSel.id);
      await carregarTudo();
      showToast("Conta solicitada!");
    } catch (err) { showToast(err.message, "var(--danger)"); }
  };

  // Marcar item da fila como pronto
  const handleItemPronto = async (itemId) => {
    try {
      await api.comandas.itens.atualizarStatus(itemId, "pronto");
      await carregarTudo();
      if (comanda) {
        const it = await api.comandas.itens.listar(comanda.id);
        setItens(it);
      }
      showToast("Item marcado como pronto!");
    } catch (err) { showToast(err.message, "var(--danger)"); }
  };

  // Filtrar mesas
  const mesasFiltradas = mesas.filter(m => {
    if (filtro === "livres") return m.status === "livre";
    if (filtro === "ocupadas") return m.status === "ocupada" || m.status === "fechar";
    if (filtro === "reservadas") return m.status === "reservada";
    return true;
  });

  const totalMesas = mesas.length;
  const mesasLivres = mesas.filter(m => m.status === "livre").length;
  const mesasOcupadas = mesas.filter(m => m.status === "ocupada").length;
  const mesasFechando = mesas.filter(m => m.status === "fechar").length;

  const isDark = tema === "dark";

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", background: "#FAFAF9" }}>
      <div style={{ textAlign: "center", color: "#78716C" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Carregando frente de caixa...</div>
      </div>
    </div>
  );

  return (
    <div data-theme={isDark ? "dark" : undefined} style={{
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
      background: "var(--bg)",
      color: "var(--text)",
      minHeight: "100vh",
      "--gold": isDark ? "#FBBF24" : "#F59E0B",
      "--gold-deep": isDark ? "#F59E0B" : "#D97706",
      "--gold-soft": isDark ? "#422006" : "#FEF3C7",
      "--gold-glow": isDark ? "#FCD34D" : "#FBBF24",
      "--brown": isDark ? "#FED7AA" : "#78350F",
      "--brown-soft": isDark ? "#FCD34D" : "#92400E",
      "--cream": isDark ? "#2A1F12" : "#FFF7E6",
      "--cream-soft": isDark ? "#1F1810" : "#FFFBEB",
      "--bg": isDark ? "#0F0B07" : "#FAFAF9",
      "--bg-subtle": isDark ? "#1A130C" : "#F5F5F4",
      "--surface": isDark ? "#1A130C" : "#FFFFFF",
      "--surface-2": isDark ? "#221A11" : "#FAFAF9",
      "--border": isDark ? "#2D2317" : "#E7E5E4",
      "--border-strong": isDark ? "#3D2F1F" : "#D6D3D1",
      "--text": isDark ? "#F5F5F4" : "#1C1917",
      "--text-muted": isDark ? "#A8A29E" : "#78716C",
      "--text-soft": isDark ? "#78716C" : "#A8A29E",
      "--success": isDark ? "#4ADE80" : "#15803D",
      "--success-bg": isDark ? "#052E16" : "#F0FDF4",
      "--warning": isDark ? "#FBBF24" : "#D97706",
      "--warning-bg": isDark ? "#422006" : "#FEF3C7",
      "--danger": isDark ? "#F87171" : "#DC2626",
      "--danger-bg": isDark ? "#450A0A" : "#FEF2F2",
      "--info": isDark ? "#60A5FA" : "#2563EB",
      "--info-bg": isDark ? "#172554" : "#EFF6FF",
      "--header-bg": isDark ? "#1A130C" : "#FFFFFF",
      "--tab-bg": isDark ? "#221A11" : "#F5F5F4",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        .fc-topbar { position: sticky; top: 0; z-index: 50; background: var(--header-bg); border-bottom: 1px solid var(--border); padding: 14px 28px; display: flex; align-items: center; gap: 24px; }
        .fc-brand { display: flex; align-items: center; gap: 10px; }
        .fc-brand-logo { width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%); display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 12px rgba(217,119,6,0.25); }
        .fc-nav-tabs { display: flex; gap: 2px; background: var(--tab-bg); padding: 3px; border-radius: 10px; }
        .fc-nav-tab { padding: 7px 16px; border-radius: 8px; border: none; background: transparent; cursor: pointer; font-family: inherit; font-size: 13px; color: var(--text-muted); font-weight: 500; transition: all 0.15s; }
        .fc-nav-tab:hover { background: var(--surface); color: var(--text); }
        .fc-nav-tab.active { background: var(--surface); color: var(--gold-deep); font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        .fc-layout { max-width: 1480px; margin: 0 auto; padding: 24px 28px; display: grid; grid-template-columns: 1fr 380px; gap: 24px; }
        .fc-stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
        .fc-stat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; position: relative; overflow: hidden; }
        .fc-stat-icon { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .fc-map-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
        .fc-salon-bg { background: linear-gradient(135deg, ${isDark ? "#1F1610" : "#FFFBEB"} 0%, ${isDark ? "#2A1E12" : "#FEF3C7"} 100%); padding: 28px 24px; position: relative; }
        .fc-salon-bg::before { content: ""; position: absolute; inset: 0; background-image: radial-gradient(circle at 1px 1px, ${isDark ? "rgba(251,191,36,0.06)" : "rgba(217,119,6,0.05)"} 1px, transparent 0); background-size: 22px 22px; pointer-events: none; }
        .fc-mesas-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; position: relative; z-index: 1; }
        .fc-mesa { aspect-ratio: 1/1; background: var(--surface); border-radius: 16px; padding: 14px; cursor: pointer; border: 2px solid transparent; box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04); transition: transform 0.18s cubic-bezier(0.4,0,0.2,1), box-shadow 0.18s, border-color 0.18s; display: flex; flex-direction: column; position: relative; overflow: hidden; }
        .fc-mesa:hover { transform: translateY(-3px); box-shadow: 0 4px 8px rgba(0,0,0,0.06), 0 12px 28px rgba(217,119,6,0.15); border-color: var(--gold); }
        .fc-mesa.selected { transform: translateY(-3px); border-color: var(--gold-deep); box-shadow: 0 4px 8px rgba(0,0,0,0.08), 0 16px 32px rgba(217,119,6,0.22); }
        .fc-mesa-bar { height: 4px; border-radius: 2px; margin-bottom: 10px; width: 38px; }
        .fc-side-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
        .fc-side-head { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--surface-2); }
        .fc-comanda-itens { padding: 8px 0; max-height: 340px; overflow-y: auto; }
        .fc-comanda-item { padding: 10px 18px; border-bottom: 1px dashed var(--border); display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; }
        .fc-comanda-item:last-child { border-bottom: none; }
        .fc-btn { padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; font-family: inherit; border: 1px solid transparent; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .fc-btn-primary { grid-column: 1/-1; background: linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%); color: #fff; font-size: 14px; padding: 14px; box-shadow: 0 4px 14px rgba(217,119,6,0.3); }
        .fc-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(217,119,6,0.4); }
        .fc-btn-secondary { background: var(--surface); color: var(--text); border-color: var(--border-strong); }
        .fc-btn-secondary:hover { background: var(--surface-2); }
        .fc-btn-danger { grid-column: 1/-1; background: var(--surface); color: var(--danger); border-color: var(--danger-bg); font-size: 12px; padding: 8px; }
        .fc-btn-danger:hover { background: var(--danger-bg); }
        .fc-chip { padding: 6px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); font-size: 12px; font-weight: 600; color: var(--text-muted); cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .fc-chip:hover { background: var(--surface-2); color: var(--text); }
        .fc-chip.active { background: var(--text); color: var(--surface); border-color: var(--text); }
        .fc-pill { background: var(--gold-deep); color: #fff; padding: 2px 9px; border-radius: 10px; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .fc-badge { position: absolute; top: 10px; right: 10px; background: var(--danger); color: #fff; font-size: 10px; font-weight: 700; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(220,38,38,0.4); animation: fc-pulse 1.6s infinite; }
        @keyframes fc-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
        .fc-mesa.fechar::before { content: ""; position: absolute; inset: 0; border-radius: 16px; border: 2px solid #FBBF24; opacity: 0; animation: fc-ring 2s infinite; pointer-events: none; }
        @keyframes fc-ring { 0% { opacity: 0.7; transform: scale(1); } 100% { opacity: 0; transform: scale(1.04); } }
        .fc-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; }
        .fc-modal { background: var(--surface); border-radius: 16px; padding: 24px; width: 440px; max-width: 92vw; max-height: 80vh; overflow-y: auto; box-shadow: 0 16px 48px rgba(0,0,0,0.2); }
        .fc-input { padding: 9px 12px; border: 1.5px solid var(--border); border-radius: 8px; font-family: inherit; font-size: 13px; outline: none; color: var(--text); background: var(--surface); width: 100%; }
        .fc-input:focus { border-color: var(--gold); }
        .fc-toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 200; animation: fc-fadein 0.3s ease; color: #fff; }
        @keyframes fc-fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fc-theme-toggle { width: 38px; height: 38px; border: 1.5px solid var(--border); border-radius: 10px; background: var(--surface); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.18s; color: var(--text-muted); }
        .fc-theme-toggle:hover { background: var(--gold-soft); border-color: var(--gold); transform: rotate(15deg); color: var(--gold-deep); }
        .fc-new-order { padding: 10px 18px; border-bottom: 1px solid var(--border); display: flex; gap: 12px; align-items: flex-start; }
        .fc-new-order:last-child { border-bottom: none; }
        .fc-prod-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; max-height: 320px; overflow-y: auto; }
        .fc-prod-item { padding: 10px 12px; border: 1.5px solid var(--border); border-radius: 10px; cursor: pointer; transition: all 0.15s; }
        .fc-prod-item:hover { border-color: var(--gold); background: var(--gold-soft); }
        @media (max-width: 1100px) { .fc-layout { grid-template-columns: 1fr; } .fc-stats-row { grid-template-columns: repeat(2, 1fr); } }
      `}</style>

      {/* ─── HEADER ─── */}
      <header className="fc-topbar">
        <div className="fc-brand">
          <div className="fc-brand-logo">🍽️</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", letterSpacing: -0.2 }}>Frente de Caixa</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Salão & Comandas</div>
          </div>
        </div>
        <div style={{ width: 1, height: 26, background: "var(--border)" }} />
        <nav className="fc-nav-tabs">
          <button className="fc-nav-tab active" style={{ cursor: "default" }}>🍽️ Caixa</button>
          <button className="fc-nav-tab" onClick={() => onVoltar("admin")}>📊 Admin</button>
          <button className="fc-nav-tab" onClick={() => onVoltar("cardapio")}>📋 Cardápio</button>
          <button className="fc-nav-tab" onClick={() => setModalQR(true)}>📱 QR Codes</button>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>{clock}</span>
          <button className="fc-theme-toggle" onClick={() => setTema(t => t === "dark" ? "light" : "dark")} title="Alternar tema">
            {isDark ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      <div className="fc-layout">
        {/* ─── COLUNA ESQUERDA ─── */}
        <main>
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: -0.4, marginBottom: 4 }}>🍽️ Salão</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              {stats ? ` · ${stats.faturamento.mesas_atendidas || 0} mesas atendidas hoje` : ""}
            </p>
          </div>

          {/* STATS */}
          <div className="fc-stats-row">
            <div className="fc-stat">
              <div className="fc-stat-icon" style={{ background: "var(--success-bg)" }}>🟢</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Mesas livres</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.1 }}>{mesasLivres}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>de {totalMesas} mesas</div>
            </div>
            <div className="fc-stat">
              <div className="fc-stat-icon" style={{ background: "var(--gold-soft)" }}>🍽️</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Ocupadas</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.1 }}>{mesasOcupadas + mesasFechando}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{mesasOcupadas} comendo · {mesasFechando} fechando</div>
            </div>
            <div className="fc-stat">
              <div className="fc-stat-icon" style={{ background: "var(--warning-bg)" }}>⏱️</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Fila cozinha</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.1 }}>{fila.length}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>itens em preparo</div>
            </div>
            <div className="fc-stat">
              <div className="fc-stat-icon" style={{ background: "var(--info-bg)" }}>💰</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Faturamento hoje</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.1 }}>{stats ? fmtBRL(stats.faturamento.total) : "..."}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{stats ? stats.faturamento.pedidos : 0} comandas fechadas</div>
            </div>
          </div>

          {/* MAPA DE MESAS */}
          <div className="fc-map-card">
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>Mapa do Salão</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "var(--text-muted)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} /> Livre</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gold)", display: "inline-block" }} /> Ocupada</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FBBF24", display: "inline-block", boxShadow: "0 0 0 2px rgba(251,191,36,0.25)" }} /> Aguardando pgto</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366F1", display: "inline-block" }} /> Reservada</span>
              </div>
            </div>

            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap", background: "var(--surface)" }}>
              {[
                { key: "todas", label: `Todas (${totalMesas})` },
                { key: "livres", label: `🟢 Livres (${mesasLivres})` },
                { key: "ocupadas", label: `🍽️ Ocupadas (${mesasOcupadas + mesasFechando})` },
              ].map(f => (
                <button key={f.key} className={`fc-chip ${filtro === f.key ? "active" : ""}`} onClick={() => setFiltro(f.key)}>{f.label}</button>
              ))}
            </div>

            <div className="fc-salon-bg">
              <div className="fc-mesas-grid">
                {mesasFiltradas.map(mesa => {
                  const isSel = mesaSel?.id === mesa.id;
                  const statusColor = {
                    livre: "#22C55E",
                    ocupada: "var(--gold)",
                    fechar: "#FBBF24",
                    reservada: "#6366F1",
                  }[mesa.status];
                  const statusLabel = {
                    livre: "Livre",
                    ocupada: "Ocupada",
                    fechar: "⚠ Pediu a conta",
                    reservada: `Reservada ${mesa.reserva_hora || ""}`,
                  }[mesa.status];
                  const statusLabelColor = {
                    livre: "var(--success)",
                    ocupada: "var(--gold-deep)",
                    fechar: "var(--warning)",
                    reservada: "var(--info)",
                  }[mesa.status];
                  const pendentes = mesa.comanda ? fila.filter(f => f.comanda_numero === mesa.comanda.numero).length : 0;

                  return (
                    <div
                      key={mesa.id}
                      className={`fc-mesa ${mesa.status} ${isSel ? "selected" : ""}`}
                      onClick={() => {
                        if (mesa.status === "livre" && !mesa.comanda) {
                          setModalAbrir(mesa);
                          setMesaSel(mesa);
                        } else {
                          selecionarMesa(mesa);
                        }
                      }}
                    >
                      {pendentes > 0 && <div className="fc-badge">{pendentes}</div>}
                      <div className="fc-mesa-bar" style={{ background: statusColor }} />
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 800, lineHeight: 1, letterSpacing: -1 }}>{mesa.numero}</div>
                      <div style={{ fontSize: 10, color: "var(--text-soft)", marginTop: 2, fontWeight: 500 }}>{mesa.lugares} lugares</div>
                      <div style={{ marginTop: "auto" }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700, marginBottom: 6, color: statusLabelColor }}>{statusLabel}</div>
                        {mesa.comanda ? (
                          <>
                            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.2 }}>{fmtBRL(mesa.comanda.total)}</div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>⏱ aberta há {tempoDesde(mesa.comanda.opened_at)}</div>
                          </>
                        ) : mesa.status === "reservada" ? (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, marginTop: 2 }}>{mesa.reserva_nome || "—"} — {mesa.reserva_pessoas || "?"} pessoas</div>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, marginTop: 2 }}>Pronta pra atender</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>

        {/* ─── COLUNA DIREITA ─── */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* COMANDA DA MESA SELECIONADA */}
          <div className="fc-side-card">
            <div className="fc-side-head">
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
                {comanda ? "Comanda Aberta" : "Nenhuma mesa selecionada"}
              </div>
              {comanda && <span className="fc-pill">#{String(comanda.numero).padStart(4, "0")}</span>}
            </div>

            {comanda ? (
              <>
                <div style={{ padding: "14px 18px", background: `linear-gradient(135deg, var(--cream) 0%, var(--cream-soft) 100%)`, borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, color: "var(--brown)", letterSpacing: -0.5 }}>🪑 Mesa {comanda.mesa_numero}</div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: 11, color: "var(--brown-soft)", fontWeight: 500 }}>
                    <span><b style={{ color: "var(--brown)", fontWeight: 700 }}>Aberta:</b> {fmtHora(comanda.opened_at)}</span>
                    {comanda.cliente_nome && <span><b style={{ color: "var(--brown)", fontWeight: 700 }}>Cliente:</b> {comanda.cliente_nome}</span>}
                    <span><b style={{ color: "var(--brown)", fontWeight: 700 }}>Pessoas:</b> {comanda.pessoas}</span>
                  </div>
                </div>

                <div className="fc-comanda-itens">
                  {itens.length === 0 ? (
                    <div style={{ padding: "20px 18px", textAlign: "center", color: "var(--text-soft)", fontSize: 13 }}>Nenhum item ainda. Adicione pelo botão abaixo.</div>
                  ) : itens.map(item => (
                    <div key={item.id} className="fc-comanda-item">
                      <div style={{ fontSize: 10, color: "var(--text-soft)", gridColumn: "1/-1", marginBottom: 2, fontVariantNumeric: "tabular-nums" }}>
                        {fmtHora(item.created_at)} · {item.origem === "qr" ? "via QR Code 📱" : "adicionado pelo caixa"}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {item.produto_nome}
                        {item.status === "pronto" && <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "1px 7px", borderRadius: 4, letterSpacing: 0.5, marginLeft: 6, background: "var(--success-bg)", color: "var(--success)" }}>Pronto</span>}
                        {item.status === "preparando" && <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "1px 7px", borderRadius: 4, letterSpacing: 0.5, marginLeft: 6, background: "var(--warning-bg)", color: "var(--warning)" }}>Preparando</span>}
                        {item.status === "pendente" && <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "1px 7px", borderRadius: 4, letterSpacing: 0.5, marginLeft: 6, background: "var(--info-bg)", color: "var(--info)" }}>Pendente</span>}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(item.quantidade * item.preco_unitario)}</div>
                      {item.obs && (
                        <div style={{ gridColumn: "1/-1", fontSize: 11, color: "var(--brown-soft)", background: "var(--gold-soft)", padding: "4px 8px", borderRadius: 6, marginTop: 4, fontWeight: 500 }}>📝 {item.obs}</div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Total</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{comanda.total_itens} itens</div>
                  </div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: -0.4, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(comanda.total)}</div>
                </div>

                <div style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button className="fc-btn fc-btn-primary" onClick={handleFechar}>💳 Cobrar {fmtBRL(comanda.total)}</button>
                  <button className="fc-btn fc-btn-secondary" onClick={() => setModalItem(true)}>+ Adicionar item</button>
                  <button className="fc-btn fc-btn-secondary" onClick={handlePedirConta}>⚠ Pedir conta</button>
                  <button className="fc-btn fc-btn-danger" onClick={handleCancelar}>Cancelar comanda</button>
                </div>
              </>
            ) : (
              <div style={{ padding: "40px 18px", textAlign: "center", color: "var(--text-soft)", fontSize: 13 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🪑</div>
                Clique em uma mesa ocupada para ver a comanda, ou em uma mesa livre para abrir uma nova.
              </div>
            )}
          </div>

          {/* FILA DA COZINHA */}
          <div className="fc-side-card">
            <div className="fc-side-head">
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>🔔 Fila da cozinha</div>
              <span className="fc-pill" style={{ background: "var(--success)" }}>{fila.length} ativos</span>
            </div>
            <div style={{ padding: "8px 0" }}>
              {fila.length === 0 ? (
                <div style={{ padding: "20px 18px", textAlign: "center", color: "var(--text-soft)", fontSize: 13 }}>Nenhum item na fila</div>
              ) : fila.map(item => (
                <div key={item.id} className="fc-new-order">
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 38, marginTop: 1 }}>
                    {fmtHora(item.created_at)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gold-deep)", marginBottom: 2 }}>🪑 Mesa {item.mesa_numero}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.4 }}>{item.produto_nome}</div>
                  </div>
                  <button onClick={() => handleItemPronto(item.id)} style={{ fontSize: 10, background: "var(--success-bg)", color: "var(--success)", border: "none", padding: "4px 8px", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>Pronto</button>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* ─── MODAL: ABRIR COMANDA ─── */}
      {modalAbrir && (
        <div className="fc-modal-overlay" onClick={() => setModalAbrir(null)}>
          <div className="fc-modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Abrir Comanda</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Mesa {modalAbrir.numero} · {modalAbrir.lugares} lugares</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: 0.6, marginBottom: 5 }}>NOME DO CLIENTE (opcional)</label>
              <input className="fc-input" value={novoCliente} onChange={e => setNovoCliente(e.target.value)} placeholder="Ex: Maria" autoFocus />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: 0.6, marginBottom: 5 }}>NÚMERO DE PESSOAS</label>
              <input className="fc-input" type="number" min={1} value={novoPessoas} onChange={e => setNovoPessoas(parseInt(e.target.value) || 1)} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="fc-btn fc-btn-secondary" style={{ flex: 1 }} onClick={() => setModalAbrir(null)}>Cancelar</button>
              <button className="fc-btn fc-btn-primary" style={{ flex: 2 }} onClick={handleAbrirComanda}>🍽️ Abrir Comanda</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: ADICIONAR ITEM ─── */}
      {modalItem && comanda && (
        <div className="fc-modal-overlay" onClick={() => { setModalItem(false); setBusca(""); setItemObs(""); setItemQtd(1); }}>
          <div className="fc-modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Adicionar Item</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Comanda #{String(comanda.numero).padStart(4, "0")} · Mesa {comanda.mesa_numero}</div>
            <input className="fc-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar produto..." autoFocus style={{ marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Qtd</label>
                <input className="fc-input" type="number" min={1} value={itemQtd} onChange={e => setItemQtd(parseInt(e.target.value) || 1)} />
              </div>
              <div style={{ flex: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Observação</label>
                <input className="fc-input" value={itemObs} onChange={e => setItemObs(e.target.value)} placeholder="Ex: Sem cebola" />
              </div>
            </div>
            <div className="fc-prod-grid">
              {produtos.filter(p => !busca || p.nome.toLowerCase().includes(busca.toLowerCase())).map(prod => (
                <div key={prod.id} className="fc-prod-item" onClick={() => handleAdicionarItem(prod)}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{prod.nome}</div>
                  <div style={{ fontSize: 12, color: "var(--gold-deep)", fontWeight: 700, marginTop: 4 }}>{fmtBRL(prod.preco)}</div>
                  {prod.categoria && <div style={{ fontSize: 10, color: "var(--text-soft)", marginTop: 2 }}>{prod.categoria}</div>}
                </div>
              ))}
              {produtos.filter(p => !busca || p.nome.toLowerCase().includes(busca.toLowerCase())).length === 0 && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 20, color: "var(--text-soft)", fontSize: 13 }}>Nenhum produto encontrado</div>
              )}
            </div>
            <button className="fc-btn fc-btn-secondary" style={{ marginTop: 12, width: "100%" }} onClick={() => { setModalItem(false); setBusca(""); setItemObs(""); setItemQtd(1); }}>Fechar</button>
          </div>
        </div>
      )}

      {/* ─── MODAL: QR CODES ─── */}
      {modalQR && (
        <div className="fc-modal-overlay" onClick={() => setModalQR(false)}>
          <div className="fc-modal" onClick={e => e.stopPropagation()} style={{ width: 860, maxWidth: "95vw", maxHeight: "90vh", padding: 0 }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: "var(--surface-2)" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>📱 QR Codes das Mesas</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Imprima e cole nas mesas para pedidos pelo celular</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="fc-btn fc-btn-primary" style={{ gridColumn: "auto", padding: "10px 20px" }} onClick={() => handlePrintQR(null)} disabled={Object.keys(qrUrls).length === 0}>
                  🖨️ Imprimir Todos
                </button>
                <button className="fc-btn fc-btn-secondary" onClick={() => setModalQR(false)}>Fechar</button>
              </div>
            </div>

            <div style={{ padding: 20, overflowY: "auto", maxHeight: "calc(90vh - 90px)" }}>
              {Object.keys(qrUrls).length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-soft)", fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                  Gerando QR Codes...
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
                  {mesas.map(mesa => (
                    <div key={mesa.id} style={{
                      background: "var(--surface)",
                      border: "2px dashed var(--border-strong)",
                      borderRadius: 16,
                      padding: "20px 16px",
                      textAlign: "center",
                      transition: "all 0.15s",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 10 }}>FAÇA SEU PEDIDO</div>
                      {qrUrls[mesa.numero] && (
                        <img src={qrUrls[mesa.numero]} alt={`QR Mesa ${mesa.numero}`} style={{ width: 180, height: 180, display: "block", margin: "0 auto 12px", borderRadius: 8 }} />
                      )}
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 32, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>Mesa {mesa.numero}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>Escaneie o QR Code acima para<br />ver o cardápio e fazer seu pedido</div>
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", gap: 6, justifyContent: "center" }}>
                        <button
                          className="fc-btn fc-btn-secondary"
                          style={{ fontSize: 11, padding: "6px 12px" }}
                          onClick={() => handlePrintQR(mesa)}
                        >
                          🖨️ Imprimir
                        </button>
                        <button
                          className="fc-btn fc-btn-secondary"
                          style={{ fontSize: 11, padding: "6px 12px" }}
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = qrUrls[mesa.numero];
                            a.download = `qr-mesa-${mesa.numero}.png`;
                            a.click();
                            showToast(`QR da Mesa ${mesa.numero} baixado!`);
                          }}
                        >
                          ⬇️ Baixar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <div className="fc-toast" style={{ background: toast.cor }}>{toast.msg}</div>}
    </div>
  );
}
