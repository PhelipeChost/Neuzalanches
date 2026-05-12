import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";
import { ImagemProduto } from "./Produtos";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

let uidCounter = 0;
function nextUid() { return `_${Date.now()}_${++uidCounter}`; }

// ─── SLIDESHOW ───────────────────────────────────────────────────────────────
function SlideshowModal({ produto }) {
  const [imagens, setImagens] = useState(produto.imagem ? [produto.imagem] : []);
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => {
    api.produtos.imagens.listar(produto.id).then(imgs => {
      if (imgs.length > 0) setImagens(imgs.map(i => i.imagem));
      else if (produto.imagem) setImagens([produto.imagem]);
      setIdx(0);
    }).catch(() => {});
  }, [produto.id]);

  const prev = () => setIdx(i => (i - 1 + imagens.length) % imagens.length);
  const next = () => setIdx(i => (i + 1) % imagens.length);
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
    touchStartX.current = null;
  };

  if (imagens.length === 0) return (
    <div style={{ width: "100%", height: 240, background: "var(--surface-warm)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 56, opacity: 0.35 }}>🍽️</span>
    </div>
  );

  return (
    <div style={{ position: "relative", width: "100%", height: 260, background: "#5C2A0A", overflow: "hidden", userSelect: "none" }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <img src={imagens[idx]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      {imagens.length > 1 && (
        <>
          <button onClick={prev} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 38, height: 38, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <button onClick={next} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 38, height: 38, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
            {imagens.map((_, i) => (
              <div key={i} onClick={() => setIdx(i)}
                style={{ width: i === idx ? 22 : 7, height: 7, borderRadius: 4, background: i === idx ? "var(--brand)" : "rgba(255,255,255,0.7)", cursor: "pointer", transition: "width 0.2s", border: "1px solid rgba(0,0,0,0.15)" }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── CARD PRODUTO ─────────────────────────────────────────────────────────────
function CardProduto({ p, catPermiteAdicionais, adicionaisDisponiveis, onVerDetalhes, onAdd }) {
  const podePersonalizar = catPermiteAdicionais[p.categoria] && adicionaisDisponiveis.length > 0;
  const cfgPorCat = {
    "Hambúrgueres": { bg: "#5C2A0A", emoji: "🍔" }, "Hamburgueres": { bg: "#5C2A0A", emoji: "🍔" },
    "Beirutes": { bg: "#6B1A1A", emoji: "🥙" }, "Lanches": { bg: "#2A4A18", emoji: "🥪" },
    "Salgados": { bg: "#7A5A18", emoji: "🥟" }, "Porções": { bg: "#4A3214", emoji: "🍟" },
    "Porcoes": { bg: "#4A3214", emoji: "🍟" }, "Bebidas": { bg: "#12305A", emoji: "🥤" },
    "Sobremesas": { bg: "#5C1A4A", emoji: "🍰" },
  };
  const cfg = cfgPorCat[p.categoria] || { bg: "#5C2A0A", emoji: "🍽️" };

  return (
    <div onClick={() => onVerDetalhes(p)} style={{
      background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 16,
      overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column",
      transition: "border-color 0.2s, transform 0.15s", position: "relative",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = ""; }}
    >
      <div style={{ width: "100%", aspectRatio: "3/2", background: cfg.bg, position: "relative", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {p.imagem ? (
          <img src={p.imagem} alt={p.nome} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <span style={{ fontSize: 56, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.35))", position: "relative", zIndex: 1 }}>{cfg.emoji}</span>
        )}
      </div>
      <div style={{ padding: "14px 16px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6, lineHeight: 1.25 }}>{p.nome}</div>
        {p.descricao && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 10, flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.descricao}</div>
        )}
        {podePersonalizar && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 800, color: "var(--brand)", background: "var(--brand-light)", padding: "3px 10px", borderRadius: 100, marginBottom: 10, width: "fit-content" }}>
            ✦ Personalizável
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--brand)", fontVariantNumeric: "tabular-nums" }}>{fmt(p.preco)}</span>
          <button onClick={e => { e.stopPropagation(); onAdd(p); }}
            style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>
            + Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DETALHE ────────────────────────────────────────────────────────────
function ModalProduto({ produto, adicionais, permiteAdicionais, onAddSimples, onAddComAdicionais, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "22px 22px 0 0", width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 -10px 50px rgba(0,0,0,0.25)", animation: "slideUp 0.3s cubic-bezier(.32,.72,0,1)", border: "1.5px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 40, height: 4, background: "var(--border-dark)", borderRadius: 2 }} />
        </div>
        <div style={{ marginTop: 8 }}><SlideshowModal produto={produto} /></div>
        <div style={{ padding: "22px 24px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, lineHeight: 1.2, color: "var(--text)" }}>{produto.nome}</div>
            <button onClick={onClose} style={{ background: "var(--surface-warm)", border: "none", borderRadius: "50%", width: 34, height: 34, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--text-muted)" }}>✕</button>
          </div>
          {produto.descricao && <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 18, fontWeight: 500 }}>{produto.descricao}</p>}
          {permiteAdicionais && adicionais.length > 0 && (
            <div style={{ background: "var(--brand-light)", border: "1.5px solid var(--brand)", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "var(--brand)", fontWeight: 700 }}>
              ✦ Personalize com adicionais após clicar em adicionar
            </div>
          )}
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 32, fontWeight: 800, color: "var(--brand)", fontVariantNumeric: "tabular-nums" }}>{fmt(produto.preco)}</div>
          <button
            onClick={() => { permiteAdicionais && adicionais.length > 0 ? onAddComAdicionais(produto) : onAddSimples(produto, []); onClose(); }}
            style={{ marginTop: 18, width: "100%", padding: "16px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
            + Adicionar ao pedido
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL ADICIONAIS ─────────────────────────────────────────────────────────
function ModalAdicionais({ produto, adicionais, onConfirm, onClose }) {
  const [selecionados, setSelecionados] = useState([]);
  const updateQtdAd = (ad, delta) => {
    setSelecionados(prev => {
      const existing = prev.find(s => s.id === ad.id);
      if (existing) {
        const newQtd = existing.quantidade + delta;
        if (newQtd <= 0) return prev.filter(s => s.id !== ad.id);
        return prev.map(s => s.id === ad.id ? { ...s, quantidade: newQtd } : s);
      } else if (delta > 0) {
        return [...prev, { id: ad.id, nome: ad.nome, preco: ad.preco, quantidade: 1 }];
      }
      return prev;
    });
  };
  const totalAdicionais = selecionados.reduce((s, a) => s + a.preco * a.quantidade, 0);
  const totalItem = produto.preco + totalAdicionais;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "var(--surface)", borderRadius: 18, padding: "26px 28px", width: 440, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", border: "1.5px solid var(--border)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: "var(--text)" }}>Adicionais</div>
          <button onClick={onClose} style={{ background: "var(--surface-warm)", border: "none", borderRadius: "50%", width: 34, height: 34, fontSize: 16, cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18, padding: "14px 16px", background: "var(--surface-warm)", borderRadius: 12 }}>
          <ImagemProduto src={produto.imagem} tamanho={52} borderRadius={10} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: "var(--text)" }}>{produto.nome}</div>
            <div style={{ fontSize: 14, color: "var(--brand)", fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", marginTop: 2 }}>{fmt(produto.preco)}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {adicionais.map(ad => {
            const sel = selecionados.find(s => s.id === ad.id);
            const qtd = sel ? sel.quantidade : 0;
            return (
              <div key={ad.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: qtd > 0 ? "var(--brand-light)" : "var(--surface)", border: `1.5px solid ${qtd > 0 ? "var(--brand)" : "var(--border-dark)"}`, borderRadius: 10 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{ad.nome}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--brand)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>+ {fmt(ad.preco)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => updateQtdAd(ad, -1)} disabled={qtd === 0} style={{ width: 28, height: 28, border: "1.5px solid var(--border-dark)", borderRadius: 6, background: "var(--surface)", cursor: qtd > 0 ? "pointer" : "default", fontSize: 16, lineHeight: 1, color: qtd > 0 ? "var(--text)" : "var(--text-soft)", fontWeight: 700 }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 800, minWidth: 22, textAlign: "center", color: "var(--text)" }}>{qtd}</span>
                  <button onClick={() => updateQtdAd(ad, 1)} style={{ width: 28, height: 28, border: "1.5px solid var(--border-dark)", borderRadius: 6, background: "var(--surface)", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "var(--text)", fontWeight: 700 }}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ borderTop: "2px solid var(--border)", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-soft)", fontWeight: 800, letterSpacing: "0.08em" }}>TOTAL DO ITEM</div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, color: "var(--brand)", fontVariantNumeric: "tabular-nums" }}>{fmt(totalItem)}</div>
          </div>
          <button onClick={() => onConfirm(selecionados)} style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
            Adicionar ao pedido
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ÍCONES ───────────────────────────────────────────────────────────────────
function IconMoon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
}
function IconSun() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>;
}

// ─── MESA APP ─────────────────────────────────────────────────────────────────
export default function MesaApp({ mesaNumero }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [carrinho, setCarrinho] = useState([]);
  const [toast, setToast] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modalAdicional, setModalAdicional] = useState(null);
  const [modalProduto, setModalProduto] = useState(null);
  const [pedidoEnviado, setPedidoEnviado] = useState(null);
  const [clienteNome, setClienteNome] = useState("");
  const [busca, setBusca] = useState("");
  const [catAtiva, setCatAtiva] = useState(null);

  const [tema, setTema] = useState(() => {
    try { return localStorage.getItem("nl-mesa-theme") || "light"; } catch { return "light"; }
  });
  useEffect(() => {
    try { localStorage.setItem("nl-mesa-theme", tema); } catch {}
    const bg = tema === "dark" ? "#120A04" : "#FFF9F4";
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
  }, [tema]);
  const toggleTema = () => setTema(t => t === "light" ? "dark" : "light");

  const showToast = (msg, cor) => { setToast({ msg, cor: cor || "var(--brand)" }); setTimeout(() => setToast(""), 3500); };

  const carregar = useCallback(async () => {
    try {
      const data = await api.mesaPublica.info(mesaNumero);
      setDados(data);
    } catch (err) {
      setErro(err.message || "Mesa não encontrada");
    } finally {
      setLoading(false);
    }
  }, [mesaNumero]);

  useEffect(() => { carregar(); }, [carregar]);

  const produtos = dados ? dados.produtos.filter(p => p.disponivel && !p.eh_promocao) : [];
  const categorias = dados ? dados.categorias : [];
  const adicionaisDisponiveis = dados ? dados.adicionais.filter(a => a.disponivel) : [];

  const catPermiteAdicionais = {};
  categorias.forEach(c => { catPermiteAdicionais[c.nome] = !!c.permite_adicionais; });

  const categoriasComProdutos = [
    ...categorias.map(c => c.nome).filter(nome => produtos.some(p => p.categoria === nome)),
    ...(produtos.some(p => !p.categoria) ? ["Outros"] : []),
  ];

  const produtosFiltrados = busca.trim()
    ? produtos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.descricao || "").toLowerCase().includes(busca.toLowerCase()))
    : produtos;

  const scrollParaCategoria = (cat) => {
    setCatAtiva(cat);
    const el = document.getElementById(`mesa-cat-${cat.replace(/\s+/g, "-")}`);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 130;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (busca.trim()) return;
    const handleScroll = () => {
      for (let i = categoriasComProdutos.length - 1; i >= 0; i--) {
        const el = document.getElementById(`mesa-cat-${categoriasComProdutos[i].replace(/\s+/g, "-")}`);
        if (el && el.getBoundingClientRect().top <= 150) { setCatAtiva(categoriasComProdutos[i]); return; }
      }
      if (categoriasComProdutos.length > 0) setCatAtiva(categoriasComProdutos[0]);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [categoriasComProdutos, busca]);

  const handleAddProduto = (produto) => {
    if (catPermiteAdicionais[produto.categoria] && adicionaisDisponiveis.length > 0) {
      setModalAdicional(produto);
    } else {
      addCarrinhoSimples(produto, []);
    }
  };

  const addCarrinhoSimples = (produto, adicionaisSelecionados) => {
    const adKey = adicionaisSelecionados.map(a => `${a.id}:${a.quantidade || 1}`).sort().join(",");
    const existente = carrinho.find(i => i.produto_id === produto.id && (i._adKey || "") === adKey);
    if (existente) {
      setCarrinho(carrinho.map(i => i._uid === existente._uid ? { ...i, quantidade: i.quantidade + 1 } : i));
    } else {
      setCarrinho([...carrinho, {
        _uid: nextUid(), _adKey: adKey,
        produto_id: produto.id, produto_nome: produto.nome,
        preco_unitario: produto.preco, quantidade: 1,
        adicionais: adicionaisSelecionados,
      }]);
    }
    showToast(`${produto.nome} adicionado!`, "var(--new-green)");
  };

  const confirmarAdicionais = (adicionaisSelecionados) => {
    if (modalAdicional) {
      addCarrinhoSimples(modalAdicional, adicionaisSelecionados);
      setModalAdicional(null);
    }
  };

  const updateQtd = (uid, qtd) => {
    if (qtd < 1) return setCarrinho(carrinho.filter(i => i._uid !== uid));
    setCarrinho(carrinho.map(i => i._uid === uid ? { ...i, quantidade: qtd } : i));
  };

  const calcItemTotal = (item) => {
    const adTotal = (item.adicionais || []).reduce((s, a) => s + a.preco * (a.quantidade || 1), 0);
    return (item.preco_unitario + adTotal) * item.quantidade;
  };

  const totalCarrinho = carrinho.reduce((s, i) => s + calcItemTotal(i), 0);

  const enviarPedido = async () => {
    if (carrinho.length === 0) return;
    setEnviando(true);
    try {
      const itensLimpos = carrinho.map(({ _uid, _adKey, ...rest }) => rest);
      const result = await api.mesaPublica.pedido(mesaNumero, {
        itens: itensLimpos,
        cliente_nome: clienteNome.trim() || "Cliente Mesa " + mesaNumero,
      });
      setCarrinho([]);
      setClienteNome("");
      setPedidoEnviado(result);
      showToast("Pedido enviado para a cozinha!", "var(--new-green)");
    } catch (err) {
      showToast("Erro: " + err.message, "var(--hot)");
    } finally {
      setEnviando(false);
    }
  };

  // ─── STYLES ─────────────────────────────────────────────────────────────────
  const themeStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Nunito:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
    html, body { margin: 0 !important; padding: 0 !important; }
    #root { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; text-align: left !important; display: block !important; min-height: 100vh; }
    .mesa-app {
      --bg: #FFF9F4; --surface: #FFFFFF; --surface-warm: #FFF2E6;
      --brand: #E8650A; --brand-dark: #C0510A; --brand-light: #FEEADA;
      --text: #2B1608; --text-muted: #9A6E50; --text-soft: #C49878;
      --border: #EDD9C5; --border-dark: #D8BFA8;
      --hot: #DC2626; --new-green: #059669;
    }
    .mesa-app[data-theme="dark"] {
      --bg: #120A04; --surface: #1E1008; --surface-warm: #251408;
      --brand: #F07020; --brand-dark: #D05C10; --brand-light: #3A1A06;
      --text: #F5E8D8; --text-muted: #C09070; --text-soft: #7A5540;
      --border: #2E1A0A; --border-dark: #3E2414;
      --hot: #EF4444; --new-green: #10B981;
    }
    .mesa-app, .mesa-app * { box-sizing: border-box; }
    .mesa-app { font-family: 'Nunito', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    @keyframes fi { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideUp { from { transform: translateY(60px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .mesa-anim { animation: fi 0.25s ease; }
    .mesa-search:focus { border-color: var(--brand) !important; box-shadow: 0 0 0 3px rgba(232,101,10,0.1); }
    .mesa-cat-nav::-webkit-scrollbar { display: none; }
    .mesa-cat-nav { scrollbar-width: none; }
    .mesa-toast { position: fixed; bottom: 92px; right: 24px; padding: 14px 22px; border-radius: 12px; font-size: 13.5px; font-weight: 700; z-index: 999; animation: fi 0.3s ease; color: #fff; box-shadow: 0 8px 28px rgba(0,0,0,0.25); max-width: 360px; font-family: 'Nunito', sans-serif; }
    .mesa-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    @media (max-width: 740px) { .mesa-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 460px) { .mesa-grid { grid-template-columns: 1fr; } }
  `;

  if (loading) return (
    <div className="mesa-app"><style>{themeStyles}</style>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#9A6E50", fontSize: 14, fontWeight: 700 }}>Carregando cardápio da mesa {mesaNumero}...</div>
      </div>
    </div>
  );

  if (erro) return (
    <div className="mesa-app"><style>{themeStyles}</style>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 48 }}>😕</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#2B1608" }}>{erro}</div>
        <div style={{ fontSize: 14, color: "#9A6E50" }}>Verifique o número da mesa e tente novamente.</div>
      </div>
    </div>
  );

  // ─── Tela de confirmação ────────────────────────────────────────────────
  if (pedidoEnviado) {
    return (
      <div className="mesa-app" data-theme={tema}>
        <style>{themeStyles}</style>
        <div className="mesa-anim" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 18, padding: 44, maxWidth: 520, width: "100%", textAlign: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--brand-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 32, color: "var(--new-green)", fontWeight: 800 }}>✓</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, marginBottom: 10, color: "var(--brand)" }}>Pedido enviado!</div>
            <div style={{ fontSize: 16, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>
              Mesa {mesaNumero} — Comanda #{String(pedidoEnviado.comanda?.numero || "").padStart(3, "0")}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, fontWeight: 500 }}>
              {pedidoEnviado.itens?.map(item => `${item.quantidade}x ${item.produto_nome}`).join(", ")}
            </div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 32, fontWeight: 800, color: "var(--brand)", marginBottom: 8, fontVariantNumeric: "tabular-nums" }}>
              {fmt(pedidoEnviado.comanda?.total || 0)}
            </div>
            <div style={{ fontSize: 13, color: "var(--new-green)", fontWeight: 700, marginBottom: 28, padding: "10px 16px", background: "rgba(5,150,105,0.1)", borderRadius: 10, border: "1.5px solid rgba(5,150,105,0.3)" }}>
              Seus itens foram enviados para a cozinha. O pagamento é feito no caixa ao final.
            </div>
            <button onClick={() => setPedidoEnviado(null)}
              style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 10, padding: "13px 28px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
              Fazer novo pedido
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tab = carrinho.length > 0 ? "view" : "view";

  return (
    <div className="mesa-app" data-theme={tema}>
      <style>{themeStyles}</style>

      {/* NAV */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--surface)", borderBottom: "2px solid var(--brand)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", height: 60,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: "var(--brand)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, overflow: "hidden", flexShrink: 0 }}>
            <img src="/logo.png" alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement.innerHTML = "🍽️"; }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: "var(--text)", lineHeight: 1 }}>
              Cardápio Digital
            </div>
            <div style={{ fontSize: 11, color: "var(--brand)", fontWeight: 800, marginTop: 2 }}>
              Mesa {mesaNumero}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={toggleTema} style={{ width: 36, height: 36, borderRadius: 8, border: "1.5px solid var(--border-dark)", background: "var(--surface-warm)", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {tema === "dark" ? <IconSun /> : <IconMoon />}
          </button>
          {carrinho.length > 0 && (
            <button onClick={() => document.getElementById("mesa-carrinho")?.scrollIntoView({ behavior: "smooth" })}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--brand)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif", position: "relative" }}>
              🛒 {carrinho.length}
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800 }}>{fmt(totalCarrinho)}</span>
            </button>
          )}
        </div>
      </nav>

      {/* Comanda ativa info */}
      {dados?.comanda && (
        <div style={{ background: "var(--brand-light)", borderBottom: "1px solid var(--brand)", padding: "10px 20px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, color: "var(--brand)" }}>
          <span>📋</span>
          Comanda #{String(dados.comanda.numero).padStart(3, "0")} aberta — {dados.comanda.total_itens} {dados.comanda.total_itens === 1 ? "item" : "itens"} · {fmt(dados.comanda.total)}
        </div>
      )}

      {/* MAIN */}
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 120px" }}>
        {/* Search */}
        <div style={{ position: "relative", marginBottom: 20 }}>
          <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 17, pointerEvents: "none" }}>🔍</span>
          <input className="mesa-search" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar no cardápio..."
            style={{ width: "100%", padding: "12px 14px 12px 46px", border: "1.5px solid var(--border-dark)", borderRadius: 12, fontFamily: "'Nunito', sans-serif", fontSize: 15, outline: "none", color: "var(--text)", background: "var(--surface)", fontWeight: 600 }} />
          {busca && <button onClick={() => setBusca("")} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "var(--surface-warm)", border: "none", borderRadius: "50%", width: 24, height: 24, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontWeight: 700 }}>✕</button>}
        </div>

        {/* Category pills */}
        {!busca.trim() && categoriasComProdutos.length > 1 && (
          <div className="mesa-cat-nav" style={{ display: "flex", gap: 8, marginBottom: 24, overflowX: "auto", whiteSpace: "nowrap", position: "sticky", top: 60, zIndex: 40, background: "var(--bg)", margin: "0 -20px 24px", padding: "12px 20px 14px" }}>
            {categoriasComProdutos.map(cat => (
              <button key={cat} onClick={() => scrollParaCategoria(cat)}
                style={{ padding: "8px 18px", borderRadius: 100, fontFamily: "'Nunito', sans-serif", fontSize: 13.5, fontWeight: 700, border: `1.5px solid ${catAtiva === cat ? "var(--brand)" : "var(--border-dark)"}`, background: catAtiva === cat ? "var(--brand)" : "var(--surface)", color: catAtiva === cat ? "#fff" : "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Products */}
        {produtosFiltrados.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-soft)", background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 16, fontWeight: 600 }}>
            {busca ? `Nenhum produto encontrado para "${busca}".` : "Nenhum produto disponível no momento."}
          </div>
        ) : busca.trim() ? (
          <div className="mesa-grid">
            {produtosFiltrados.map(p => (
              <CardProduto key={p.id} p={p} catPermiteAdicionais={catPermiteAdicionais} adicionaisDisponiveis={adicionaisDisponiveis}
                onVerDetalhes={(pr) => setModalProduto(pr)} onAdd={handleAddProduto} />
            ))}
          </div>
        ) : (
          <div>
            {categoriasComProdutos.map(cat => (
              <div key={cat} id={`mesa-cat-${cat.replace(/\s+/g, "-")}`} style={{ marginBottom: 48, scrollMarginTop: 130 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <div style={{ width: 6, height: 6, background: "var(--brand)", borderRadius: "50%", flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: "var(--text-soft)", whiteSpace: "nowrap" }}>{cat}</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ fontSize: 12, color: "var(--text-soft)", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {produtos.filter(p => cat === "Outros" ? !p.categoria : p.categoria === cat).length} {produtos.filter(p => cat === "Outros" ? !p.categoria : p.categoria === cat).length === 1 ? "item" : "itens"}
                  </span>
                </div>
                <div className="mesa-grid">
                  {produtos.filter(p => cat === "Outros" ? !p.categoria : p.categoria === cat).map(p => (
                    <CardProduto key={p.id} p={p} catPermiteAdicionais={catPermiteAdicionais} adicionaisDisponiveis={adicionaisDisponiveis}
                      onVerDetalhes={(pr) => setModalProduto(pr)} onAdd={handleAddProduto} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CARRINHO (inline, not separate tab) */}
        {carrinho.length > 0 && (
          <div id="mesa-carrinho" style={{ marginTop: 40, scrollMarginTop: 80 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 16, color: "var(--text)" }}>Seu Pedido</div>
            <div style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
              {carrinho.map((item, i) => {
                const itemTotal = calcItemTotal(item);
                return (
                  <div key={item._uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: i < carrinho.length - 1 ? "1px solid var(--border)" : "none", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ flex: "1 1 200px" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", fontFamily: "'Syne', sans-serif" }}>{item.produto_nome}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, fontWeight: 600 }}>{fmt(item.preco_unitario)} cada</div>
                      {item.adicionais?.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {item.adicionais.map(a => (
                            <span key={a.id} style={{ display: "inline-block", background: "var(--brand-light)", color: "var(--brand)", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 100, marginRight: 4, marginBottom: 4 }}>
                              {(a.quantidade || 1) > 1 ? `${a.quantidade}x ` : "+ "}{a.nome}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button onClick={() => updateQtd(item._uid, item.quantidade - 1)} style={{ width: 28, height: 28, border: "1.5px solid var(--border-dark)", borderRadius: 7, background: "var(--surface)", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "var(--text)", fontWeight: 700 }}>−</button>
                      <span style={{ fontSize: 14, fontWeight: 800, minWidth: 22, textAlign: "center", color: "var(--text)" }}>{item.quantidade}</span>
                      <button onClick={() => updateQtd(item._uid, item.quantidade + 1)} style={{ width: 28, height: 28, border: "1.5px solid var(--border-dark)", borderRadius: 7, background: "var(--surface)", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "var(--text)", fontWeight: 700 }}>+</button>
                      <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 16, fontWeight: 800, color: "var(--brand)", minWidth: 80, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(itemTotal)}</span>
                    </div>
                  </div>
                );
              })}

              {/* Nome + enviar */}
              <div style={{ padding: "16px 18px", borderTop: "2px solid var(--border)" }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>
                  Seu nome (opcional)
                </label>
                <input value={clienteNome} onChange={e => setClienteNome(e.target.value)}
                  placeholder="Como deseja ser chamado?"
                  style={{ width: "100%", padding: "11px 14px", border: "1.5px solid var(--border-dark)", borderRadius: 10, fontFamily: "'Nunito', sans-serif", fontSize: 14, outline: "none", color: "var(--text)", background: "var(--surface)" }} />
              </div>

              <div style={{ padding: "18px", borderTop: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-soft)", fontWeight: 800, letterSpacing: "0.08em" }}>TOTAL</div>
                  <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--brand)", fontVariantNumeric: "tabular-nums" }}>{fmt(totalCarrinho)}</div>
                </div>
                <button onClick={enviarPedido} disabled={enviando}
                  style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 12, padding: "14px 32px", fontSize: 14, fontWeight: 800, cursor: enviando ? "wait" : "pointer", fontFamily: "'Nunito', sans-serif", opacity: enviando ? 0.7 : 1 }}>
                  {enviando ? "Enviando..." : "Enviar para cozinha"}
                </button>
              </div>

              <div style={{ padding: "0 18px 16px" }}>
                <div style={{ background: "rgba(5,150,105,0.08)", border: "1.5px solid rgba(5,150,105,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "var(--new-green)", fontWeight: 700, textAlign: "center" }}>
                  🏪 O pagamento é feito diretamente no caixa ao final
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {modalProduto && (
        <ModalProduto produto={modalProduto} adicionais={adicionaisDisponiveis}
          permiteAdicionais={!!catPermiteAdicionais[modalProduto.categoria]}
          onAddSimples={(p, ads) => addCarrinhoSimples(p, ads)}
          onAddComAdicionais={(p) => setModalAdicional(p)}
          onClose={() => setModalProduto(null)} />
      )}
      {modalAdicional && (
        <ModalAdicionais produto={modalAdicional} adicionais={adicionaisDisponiveis}
          onConfirm={confirmarAdicionais} onClose={() => setModalAdicional(null)} />
      )}
      {toast && <div className="mesa-toast" style={{ background: toast.cor || "var(--brand)" }}>{toast.msg}</div>}
    </div>
  );
}
