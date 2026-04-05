import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import { ImagemProduto } from "./Produtos";

const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABELS = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  pronto: "Pronto p/ retirada",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
const STATUS_CORES = {
  pendente: { bg: "#fefce8", color: "#ca8a04" },
  confirmado: { bg: "#eff6ff", color: "#2563eb" },
  preparando: { bg: "#fef3c7", color: "#d97706" },
  pronto: { bg: "#f0fdf4", color: "#16a34a" },
  entregue: { bg: "#dcfce7", color: "#15803d" },
  cancelado: { bg: "#fee2e2", color: "#dc2626" },
};
const STATUS_PIPELINE = ["pendente", "confirmado", "preparando", "pronto", "entregue"];

let uidCounter = 0;
function nextUid() { return `_${Date.now()}_${++uidCounter}`; }

// ─── MODAL ADICIONAIS ──────────────────────────────────────────────────────────
function ModalAdicionais({ produto, adicionais, onConfirm, onClose }) {
  const [selecionados, setSelecionados] = useState([]);

  const toggle = (ad) => {
    setSelecionados(prev =>
      prev.find(s => s.id === ad.id)
        ? prev.filter(s => s.id !== ad.id)
        : [...prev, { id: ad.id, nome: ad.nome, preco: ad.preco }]
    );
  };

  const totalAdicionais = selecionados.reduce((s, a) => s + a.preco, 0);
  const totalItem = produto.preco + totalAdicionais;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", width: 420, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500 }}>Adicionais</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>x</button>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, padding: "12px 14px", background: "#fafaf9", borderRadius: 10 }}>
          <ImagemProduto src={produto.imagem} tamanho={48} borderRadius={8} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{produto.nome}</div>
            <div style={{ fontSize: 13, color: "#15803d", fontWeight: 500 }}>{fmt(produto.preco)}</div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: "#78716c", marginBottom: 8, letterSpacing: "0.06em" }}>ESCOLHA SEUS ADICIONAIS</div>

        {adicionais.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "#a8a29e", fontSize: 13 }}>Nenhum adicional disponivel.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {adicionais.map(ad => {
              const ativo = selecionados.find(s => s.id === ad.id);
              return (
                <label key={ad.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  background: ativo ? "#f0fdf4" : "#fff", border: `1.5px solid ${ativo ? "#86efac" : "#e7e5e4"}`,
                  borderRadius: 10, cursor: "pointer", transition: "all 0.15s"
                }}>
                  <input type="checkbox" checked={!!ativo} onChange={() => toggle(ad)} style={{ accentColor: "#15803d" }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{ad.nome}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>+ {fmt(ad.preco)}</span>
                </label>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: "2px solid #e7e5e4", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 600 }}>TOTAL DO ITEM</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: "#15803d" }}>{fmt(totalItem)}</div>
          </div>
          <button onClick={() => onConfirm(selecionados)}
            style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Adicionar ao carrinho
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClienteApp({ usuario, onLogout }) {
  const [tab, setTab] = useState("catalogo");
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [adicionaisDisponiveis, setAdicionaisDisponiveis] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [carrinho, setCarrinho] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modalAdicional, setModalAdicional] = useState(null); // produto selecionado para adicionais

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  // Mapa: nome da categoria -> permite_adicionais
  const catPermiteAdicionais = {};
  categorias.forEach(c => { catPermiteAdicionais[c.nome] = !!c.permite_adicionais; });

  const carregar = useCallback(async () => {
    try {
      const [prods, peds, cats, adds] = await Promise.all([
        api.produtos.listar(),
        api.pedidos.listar(),
        api.categorias.listar(),
        api.adicionais.listar(),
      ]);
      setProdutos(prods.filter(p => p.disponivel));
      setPedidos(peds);
      setCategorias(cats);
      setAdicionaisDisponiveis(adds.filter(a => a.disponivel));
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try { setPedidos(await api.pedidos.listar()); } catch { /* ignore */ }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleAddProduto = (produto) => {
    // Se a categoria permite adicionais, abrir modal
    if (catPermiteAdicionais[produto.categoria] && adicionaisDisponiveis.length > 0) {
      setModalAdicional(produto);
    } else {
      // Sem adicionais: adicionar direto
      addCarrinhoSimples(produto, []);
    }
  };

  const addCarrinhoSimples = (produto, adicionaisSelecionados) => {
    const adTotal = adicionaisSelecionados.reduce((s, a) => s + a.preco, 0);
    const adKey = adicionaisSelecionados.map(a => a.id).sort().join(",");

    // Verificar se já tem o mesmo produto com os mesmos adicionais
    const existente = carrinho.find(i => i.produto_id === produto.id && (i._adKey || "") === adKey);

    if (existente) {
      setCarrinho(carrinho.map(i => i._uid === existente._uid ? { ...i, quantidade: i.quantidade + 1 } : i));
    } else {
      setCarrinho([...carrinho, {
        _uid: nextUid(),
        _adKey: adKey,
        produto_id: produto.id,
        produto_nome: produto.nome,
        preco_unitario: produto.preco,
        quantidade: 1,
        adicionais: adicionaisSelecionados,
      }]);
    }
    showToast(`${produto.nome} adicionado!`);
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
    const adTotal = (item.adicionais || []).reduce((s, a) => s + a.preco, 0);
    return (item.preco_unitario + adTotal) * item.quantidade;
  };

  const totalCarrinho = carrinho.reduce((s, i) => s + calcItemTotal(i), 0);

  const enviarPedido = async () => {
    if (carrinho.length === 0) return;
    setEnviando(true);
    try {
      // Limpar campos internos antes de enviar
      const itensLimpos = carrinho.map(({ _uid, _adKey, ...rest }) => rest);
      const novo = await api.pedidos.criar({ itens: itensLimpos, obs });
      setPedidos(ps => [novo, ...ps]);
      setCarrinho([]);
      setObs("");
      setTab("pedidos");
      showToast("Pedido enviado com sucesso!");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally {
      setEnviando(false);
    }
  };

  const categoriasUnicas = [...new Set(produtos.map(p => p.categoria).filter(Boolean))];

  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#f5f5f4", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#78716c", fontSize: 14 }}>Carregando...</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f5f5f4", minHeight: "100vh", color: "#1c1917" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Fraunces:ital,wght@0,300;0,500;0,600;1,300&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #d6d3d1; border-radius: 2px; }
        .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 20px 22px; }
        .nav-pill { padding: 7px 18px; border-radius: 8px; border: none; background: none; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 13px; color: #78716c; transition: all 0.15s; }
        .nav-pill:hover { background: #f5f5f4; color: #1c1917; }
        .nav-pill.active { background: #fff; color: #15803d; font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        .anim { animation: fi 0.25s ease; }
        @keyframes fi { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 999; animation: fi 0.3s ease; color: #fff; }
      `}</style>

      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e7e5e4", padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 30, height: 30, background: "#15803d", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 15 }}>$</span>
          </div>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600 }}>Cardapio</span>
        </div>

        <div style={{ width: 1, height: 22, background: "#e7e5e4" }} />

        <div style={{ display: "flex", gap: 2, background: "#f5f5f4", borderRadius: 10, padding: 3 }}>
          {[["catalogo", "Cardapio"], ["carrinho", `Carrinho (${carrinho.length})`], ["pedidos", "Meus Pedidos"]].map(([k, v]) => (
            <button key={k} className={`nav-pill ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{v}</button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 12, color: "#78716c" }}>Ola, {usuario.nome.split(" ")[0]}</div>
        <button onClick={onLogout} style={{ padding: "6px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>
          Sair
        </button>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px" }}>

        {/* CATALOGO */}
        {tab === "catalogo" && (
          <div className="anim">
            {produtos.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
                Nenhum produto disponivel no momento.
              </div>
            ) : (
              <>
                {categoriasUnicas.length > 0 ? categoriasUnicas.map(cat => (
                  <div key={cat} style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#57534e", marginBottom: 10, padding: "4px 0", borderBottom: "1px solid #e7e5e4" }}>{cat}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                      {produtos.filter(p => p.categoria === cat).map(p => (
                        <div key={p.id} className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", gap: 12 }}>
                            <ImagemProduto src={p.imagem} tamanho={64} borderRadius={10} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.nome}</div>
                              {p.descricao && <div style={{ fontSize: 12, color: "#78716c", marginTop: 4 }}>{p.descricao}</div>}
                            </div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                            <div>
                              <span style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 500, color: "#15803d" }}>{fmt(p.preco)}</span>
                              {catPermiteAdicionais[p.categoria] && adicionaisDisponiveis.length > 0 && (
                                <div style={{ fontSize: 10, color: "#78716c", marginTop: 2 }}>Adicionais disponiveis</div>
                              )}
                            </div>
                            <button onClick={() => handleAddProduto(p)} style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                              + Adicionar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                    {produtos.map(p => (
                      <div key={p.id} className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", gap: 12 }}>
                          <ImagemProduto src={p.imagem} tamanho={64} borderRadius={10} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{p.nome}</div>
                            {p.descricao && <div style={{ fontSize: 12, color: "#78716c", marginTop: 4 }}>{p.descricao}</div>}
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 500, color: "#15803d" }}>{fmt(p.preco)}</span>
                          <button onClick={() => handleAddProduto(p)} style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                            + Adicionar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* CARRINHO */}
        {tab === "carrinho" && (
          <div className="anim">
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 500, marginBottom: 16 }}>Seu Carrinho</div>

            {carrinho.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
                Seu carrinho esta vazio. Adicione produtos do cardapio.
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => setTab("catalogo")} style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    Ver cardapio
                  </button>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {carrinho.map((item, i) => {
                  const adTotal = (item.adicionais || []).reduce((s, a) => s + a.preco, 0);
                  const itemTotal = calcItemTotal(item);
                  return (
                    <div key={item._uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: i < carrinho.length - 1 ? "1px solid #f5f5f4" : "none" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{item.produto_nome}</div>
                        <div style={{ fontSize: 12, color: "#a8a29e" }}>{fmt(item.preco_unitario)} cada</div>
                        {item.adicionais && item.adicionais.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {item.adicionais.map(a => (
                              <span key={a.id} style={{ display: "inline-block", background: "#f0fdf4", color: "#15803d", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, marginRight: 4, marginBottom: 2 }}>
                                + {a.nome} ({fmt(a.preco)})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button onClick={() => updateQtd(item._uid, item.quantidade - 1)} style={{ width: 28, height: 28, border: "1px solid #e7e5e4", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>-</button>
                        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 24, textAlign: "center" }}>{item.quantidade}</span>
                        <button onClick={() => updateQtd(item._uid, item.quantidade + 1)} style={{ width: 28, height: 28, border: "1px solid #e7e5e4", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>+</button>
                        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 500, color: "#15803d", minWidth: 90, textAlign: "right" }}>{fmt(itemTotal)}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Observacao */}
                <div style={{ padding: "14px 18px", borderTop: "1px solid #e7e5e4" }}>
                  <label style={{ fontSize: 11, color: "#78716c", fontWeight: 600, display: "block", marginBottom: 5 }}>Observacao (opcional)</label>
                  <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Sem cebola, ponto da carne, etc."
                    style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917" }} />
                </div>

                {/* Total e enviar */}
                <div style={{ padding: "18px", borderTop: "2px solid #e7e5e4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#a8a29e", fontWeight: 600 }}>TOTAL</div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, color: "#15803d" }}>{fmt(totalCarrinho)}</div>
                  </div>
                  <button onClick={enviarPedido} disabled={enviando}
                    style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 14, fontWeight: 600, cursor: enviando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", opacity: enviando ? 0.7 : 1 }}>
                    {enviando ? "Enviando..." : "Fazer pedido"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MEUS PEDIDOS */}
        {tab === "pedidos" && (
          <div className="anim">
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 500, marginBottom: 16 }}>Meus Pedidos</div>

            {pedidos.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
                Voce ainda nao fez nenhum pedido.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {pedidos.map(p => {
                  const idx = STATUS_PIPELINE.indexOf(p.status);
                  const pct = p.status === "cancelado" ? 0 : ((idx + 1) / STATUS_PIPELINE.length) * 100;
                  return (
                    <div key={p.id} className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>Pedido #{p.id.slice(0, 6)}</span>
                          <span style={{ fontSize: 11, color: "#a8a29e", marginLeft: 8 }}>{new Date(p.created_at).toLocaleString("pt-BR")}</span>
                        </div>
                        <span style={{ background: STATUS_CORES[p.status].bg, color: STATUS_CORES[p.status].color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                          {STATUS_LABELS[p.status]}
                        </span>
                      </div>

                      {p.status !== "cancelado" && (
                        <div style={{ height: 6, background: "#f5f5f4", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: STATUS_CORES[p.status].color, borderRadius: 3, transition: "width 0.8s ease" }} />
                        </div>
                      )}

                      {/* Itens resumo com adicionais */}
                      <div style={{ fontSize: 12, color: "#78716c", marginBottom: 8 }}>
                        {p.itens?.map((item, idx) => {
                          const adTexto = item.adicionais && item.adicionais.length > 0
                            ? ` (+ ${item.adicionais.map(a => a.nome).join(", ")})`
                            : "";
                          return `${item.quantidade}x ${item.produto_nome}${adTexto}`;
                        }).join(", ")}
                      </div>
                      {p.obs && <div style={{ fontSize: 11, color: "#a8a29e", marginBottom: 8 }}>Obs: {p.obs}</div>}

                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, color: "#15803d" }}>{fmt(p.total)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Adicionais */}
      {modalAdicional && (
        <ModalAdicionais
          produto={modalAdicional}
          adicionais={adicionaisDisponiveis}
          onConfirm={confirmarAdicionais}
          onClose={() => setModalAdicional(null)}
        />
      )}

      {/* Toast */}
      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}
