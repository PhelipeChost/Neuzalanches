// ─── Montagem de produto por segmento ────────────────────────────────────────
// Modal universal usado pelo PDV (FrenteCaixa), pelas mesas (MesaApp) e pelo
// cardápio digital (ClienteApp). O segmento do CARDÁPIO do produto define as
// etapas:
//   • tamanhos      → escolher tamanho (preço próprio)
//   • meio a meio   → pizzaria: 2º sabor da mesma categoria (preço maior/média)
//   • bordas        → pizzaria: borda recheada opcional (config do cardápio)
//   • complementos  → açaí/sorvete: adicionais com N inclusos grátis
//   • adicionais    → clássico (com max_quantidade)
//
// Devolve um item de carrinho pronto:
//   { produto_id, produto_nome, preco_unitario, quantidade, adicionais[], obs }
// O nome composto ("½ Calabresa ½ Marguerita — Grande") viaja pelo fluxo
// existente de pedidos/comandas/cozinha sem nenhuma mudança lá.
import { useState } from "react";
import { infoSegmento, parseConfig, tamanhosDoProduto, precoMeioAMeio, precoDoTamanho } from "./segmentos";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Precisa de montagem? (senão o chamador usa o fluxo simples/adicionais antigo)
export function precisaMontagem(produto, cardapio) {
  const seg = infoSegmento(cardapio?.tipo);
  if (seg.recursos.tamanhos && tamanhosDoProduto(produto).length > 0) return true;
  if (seg.recursos.meioAMeio) return true;
  if (seg.recursos.complementos) return true;
  return false;
}

export default function MontagemProduto({
  produto,            // produto base escolhido
  cardapio,           // cardápio do produto ({ tipo, config }) — pode ser null
  adicionais = [],    // adicionais aplicáveis (já filtrados por categoria)
  irmaos = [],        // produtos da mesma categoria (sabores para meio a meio)
  comObs = false,     // mostra campo de observação (PDV/atendente)
  onConfirm,          // (item) => void
  onClose,
}) {
  const seg = infoSegmento(cardapio?.tipo);
  const cfg = parseConfig(cardapio?.config);
  const tamanhos = tamanhosDoProduto(produto);

  const [tamanho, setTamanho] = useState(tamanhos.length === 1 ? tamanhos[0].nome : "");
  const [meioAMeio, setMeioAMeio] = useState(false);
  const [sabor2, setSabor2] = useState(null); // produto irmão
  const [borda, setBorda] = useState(null);   // { nome, preco }
  const [sel, setSel] = useState([]);         // [{ id, nome, preco, quantidade, _ordem }]
  const [obs, setObs] = useState("");
  const [qtd, setQtd] = useState(1);
  let ordemRef = sel.reduce((m, s) => Math.max(m, s._ordem || 0), 0);

  const temTamanhos = seg.recursos.tamanhos && tamanhos.length > 0;
  const permiteMeio = seg.recursos.meioAMeio && (cfg.meio_a_meio ?? true) !== false && irmaos.length > 0;
  const bordas = seg.recursos.bordas ? (cfg.bordas || []).filter(b => b.nome) : [];
  const inclusos = seg.recursos.complementos ? Math.max(0, parseInt(cfg.inclusos, 10) || 0) : 0;

  // Sabores compatíveis para meio a meio: irmãos que tenham o MESMO tamanho
  const irmaosCompativeis = irmaos.filter(p => {
    if (p.id === produto.id) return false;
    if (!temTamanhos) return true;
    if (!tamanho) return true;
    return tamanhosDoProduto(p).some(t => t.nome === tamanho);
  });

  // ── Preço ──────────────────────────────────────────────────────────────────
  const precoBase = (() => {
    const pA = temTamanhos ? precoDoTamanho(produto, tamanho || tamanhos[0]?.nome) : Number(produto.preco || 0);
    if (meioAMeio && sabor2) {
      const pB = temTamanhos ? precoDoTamanho(sabor2, tamanho || tamanhos[0]?.nome) : Number(sabor2.preco || 0);
      return precoMeioAMeio(pA, pB, cfg.regra_preco);
    }
    return pA;
  })();

  const updateQtdAd = (ad, delta) => {
    setSel(prev => {
      const existing = prev.find(s => s.id === ad.id);
      const max = Number(ad.max_quantidade) || 0;
      if (existing) {
        const nova = existing.quantidade + delta;
        if (nova <= 0) return prev.filter(s => s.id !== ad.id);
        if (max > 0 && nova > max) return prev;
        return prev.map(s => s.id === ad.id ? { ...s, quantidade: nova } : s);
      }
      if (delta > 0) {
        if (max > 0 && max < 1) return prev;
        return [...prev, { id: ad.id, nome: ad.nome, preco: Number(ad.preco), quantidade: 1, _ordem: ++ordemRef }];
      }
      return prev;
    });
  };

  // Complementos inclusos: as PRIMEIRAS N unidades escolhidas saem grátis;
  // o excedente cobra o preço do adicional. Entradas separadas ("incluso" ×
  // pago) pra cozinha e conta ficarem legíveis.
  const resolverAdicionais = () => {
    if (inclusos <= 0) return { lista: sel.map(({ _ordem, ...a }) => a), totalAdd: sel.reduce((s, a) => s + a.preco * a.quantidade, 0) };
    const ordenados = [...sel].sort((a, b) => (a._ordem || 0) - (b._ordem || 0));
    let restantes = inclusos;
    const lista = [];
    let totalAdd = 0;
    for (const a of ordenados) {
      const gratis = Math.min(restantes, a.quantidade);
      restantes -= gratis;
      const pagos = a.quantidade - gratis;
      if (gratis > 0) lista.push({ id: a.id, nome: `${a.nome} (incluso)`, preco: 0, quantidade: gratis });
      if (pagos > 0) { lista.push({ id: a.id, nome: a.nome, preco: a.preco, quantidade: pagos }); totalAdd += a.preco * pagos; }
    }
    return { lista, totalAdd };
  };

  const { lista: adicionaisFinal, totalAdd } = resolverAdicionais();
  const precoBorda = borda ? Number(borda.preco || 0) : 0;

  const prontoParaConfirmar = (!temTamanhos || !!tamanho) && (!meioAMeio || !!sabor2);

  const confirmar = () => {
    if (!prontoParaConfirmar) return;
    // Nome composto que viaja pra cozinha/conta
    let nome = produto.nome;
    if (meioAMeio && sabor2) nome = `½ ${produto.nome} ½ ${sabor2.nome}`;
    if (temTamanhos && tamanho) nome = `${nome} — ${tamanho}`;

    // Borda viaja como ADICIONAL (linha própria na cozinha/conta); o preço
    // unitário fica só com o valor do sabor/tamanho pra não cobrar duas vezes.
    const ads = [...adicionaisFinal];
    if (borda) ads.push({ id: `borda:${borda.nome}`, nome: `Borda ${borda.nome}`, preco: Number(borda.preco || 0), quantidade: 1 });

    onConfirm({
      produto_id: produto.id,
      produto_nome: nome,
      preco_unitario: precoBase,
      quantidade: qtd,
      adicionais: ads,
      obs: obs.trim(),
    });
  };

  const precoUnitarioFinal = precoBase;

  const totalSelUnidades = sel.reduce((s, a) => s + a.quantidade, 0);

  const S = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans', 'Nunito', 'Segoe UI', sans-serif" },
    modal: { background: "#fff", borderRadius: 18, width: 500, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", color: "#1c1917" },
    head: { padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
    body: { padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 18 },
    secTitle: { fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "#78716c", textTransform: "uppercase", marginBottom: 8 },
    pill: (on) => ({ padding: "9px 16px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, border: `1.5px solid ${on ? "#15803d" : "#e7e5e4"}`, background: on ? "#f0fdf4" : "#fff", color: on ? "#15803d" : "#57534e" }),
    row: (on) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 10, border: `1.5px solid ${on ? "#15803d" : "#e7e5e4"}`, background: on ? "#f0fdf4" : "#fff" }),
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.head}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{seg.icone} {produto.nome}</div>
            <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>{seg.nome} · monte o item</div>
          </div>
          <button onClick={onClose} style={{ background: "#f5f5f4", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 15, cursor: "pointer", color: "#78716c" }}>✕</button>
        </div>

        <div style={S.body}>
          {/* 1. Tamanho */}
          {temTamanhos && (
            <div>
              <div style={S.secTitle}>1. Escolha o tamanho</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tamanhos.map(t => (
                  <button key={t.nome} style={S.pill(tamanho === t.nome)} onClick={() => { setTamanho(t.nome); if (sabor2 && !tamanhosDoProduto(sabor2).some(x => x.nome === t.nome)) setSabor2(null); }}>
                    {t.nome}
                    <span style={{ display: "block", fontSize: 11, fontWeight: 800, marginTop: 2 }}>{fmt(t.preco)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Meio a meio (pizzaria) */}
          {permiteMeio && (
            <div>
              <div style={S.secTitle}>{temTamanhos ? "2." : "1."} Sabores</div>
              <div style={{ display: "flex", gap: 8, marginBottom: meioAMeio ? 10 : 0 }}>
                <button style={S.pill(!meioAMeio)} onClick={() => { setMeioAMeio(false); setSabor2(null); }}>Sabor único</button>
                <button style={S.pill(meioAMeio)} onClick={() => setMeioAMeio(true)}>🍕 Meio a meio (2 sabores)</button>
              </div>
              {meioAMeio && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                  <div style={{ fontSize: 11.5, color: "#78716c" }}>
                    1ª metade: <b>{produto.nome}</b> · escolha a 2ª metade
                    {cfg.regra_preco === "media" ? " (preço = média dos sabores)" : " (preço = sabor mais caro)"}
                  </div>
                  {irmaosCompativeis.map(p => {
                    const on = sabor2?.id === p.id;
                    const preco = temTamanhos && tamanho ? precoDoTamanho(p, tamanho) : Number(p.preco || 0);
                    return (
                      <div key={p.id} style={{ ...S.row(on), cursor: "pointer" }} onClick={() => setSabor2(on ? null : p)}>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{p.nome}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#15803d" }}>{fmt(preco)}</span>
                        <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${on ? "#15803d" : "#d6d3d1"}`, background: on ? "#15803d" : "#fff", color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{on ? "✓" : ""}</span>
                      </div>
                    );
                  })}
                  {irmaosCompativeis.length === 0 && (
                    <div style={{ fontSize: 12, color: "#a8a29e", padding: 8 }}>Nenhum outro sabor com esse tamanho.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. Borda (pizzaria) */}
          {bordas.length > 0 && (
            <div>
              <div style={S.secTitle}>Borda recheada (opcional)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={S.pill(!borda)} onClick={() => setBorda(null)}>Sem borda</button>
                {bordas.map(b => (
                  <button key={b.nome} style={S.pill(borda?.nome === b.nome)} onClick={() => setBorda(borda?.nome === b.nome ? null : b)}>
                    {b.nome} <span style={{ fontSize: 11, fontWeight: 800 }}>+{fmt(b.preco)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Complementos / adicionais */}
          {adicionais.length > 0 && (
            <div>
              <div style={S.secTitle}>
                {seg.recursos.complementos
                  ? `Complementos${inclusos > 0 ? ` — ${Math.min(totalSelUnidades, inclusos)}/${inclusos} inclusos grátis` : ""}`
                  : "Adicionais"}
              </div>
              {inclusos > 0 && (
                <div style={{ fontSize: 11.5, color: "#5b21b6", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: "7px 10px", marginBottom: 8 }}>
                  Os primeiros {inclusos} complementos são grátis; os demais cobram o valor de cada um.
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {adicionais.map(ad => {
                  const s = sel.find(x => x.id === ad.id);
                  const q = s ? s.quantidade : 0;
                  const max = Number(ad.max_quantidade) || 0;
                  const noLimite = max > 0 && q >= max;
                  return (
                    <div key={ad.id} style={S.row(q > 0)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{ad.nome}</div>
                        {max > 0 && <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 700 }}>Máx. {max}</div>}
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: "#15803d" }}>+ {fmt(ad.preco)}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={() => updateQtdAd(ad, -1)} disabled={q === 0}
                          style={{ width: 26, height: 26, border: "1.5px solid #e7e5e4", borderRadius: 6, background: "#fff", cursor: q > 0 ? "pointer" : "default", fontSize: 15, color: q > 0 ? "#1c1917" : "#d6d3d1", fontWeight: 700, lineHeight: 1 }}>−</button>
                        <span style={{ fontSize: 13, fontWeight: 800, minWidth: 18, textAlign: "center" }}>{q}</span>
                        <button onClick={() => updateQtdAd(ad, 1)} disabled={noLimite}
                          style={{ width: 26, height: 26, border: "1.5px solid #e7e5e4", borderRadius: 6, background: "#fff", cursor: noLimite ? "not-allowed" : "pointer", fontSize: 15, color: noLimite ? "#d6d3d1" : "#1c1917", fontWeight: 700, lineHeight: 1, opacity: noLimite ? 0.5 : 1 }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Observação (PDV/atendente) */}
          {comObs && (
            <div>
              <div style={S.secTitle}>Observação (opcional)</div>
              <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex: sem cebola, bem passado…"
                style={{ width: "100%", padding: "10px 13px", border: "1.5px solid #e7e5e4", borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          )}

          {/* Rodapé: quantidade + total + confirmar */}
          <div style={{ borderTop: "2px solid #f5f5f4", paddingTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setQtd(q => Math.max(1, q - 1))}
                style={{ width: 32, height: 32, border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 17, fontWeight: 700, lineHeight: 1 }}>−</button>
              <span style={{ fontSize: 15, fontWeight: 800, minWidth: 24, textAlign: "center" }}>{qtd}</span>
              <button onClick={() => setQtd(q => q + 1)}
                style={{ width: 32, height: 32, border: "1.5px solid #e7e5e4", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 17, fontWeight: 700, lineHeight: 1 }}>+</button>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#a8a29e", fontWeight: 800, letterSpacing: "0.08em" }}>TOTAL</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#15803d" }}>{fmt((precoUnitarioFinal + precoBorda + totalAdd) * qtd)}</div>
            </div>
            <button onClick={confirmar} disabled={!prontoParaConfirmar}
              style={{ background: prontoParaConfirmar ? "#15803d" : "#d6d3d1", color: "#fff", border: "none", borderRadius: 11, padding: "13px 26px", fontSize: 14, fontWeight: 800, cursor: prontoParaConfirmar ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Adicionar ao pedido
            </button>
          </div>
          {!prontoParaConfirmar && (
            <div style={{ fontSize: 11.5, color: "#d97706", marginTop: -8 }}>
              {temTamanhos && !tamanho ? "Escolha um tamanho. " : ""}{meioAMeio && !sabor2 ? "Escolha a 2ª metade." : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
