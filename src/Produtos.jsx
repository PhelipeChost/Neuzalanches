import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";
import { infoSegmento, parseConfig, tamanhosDoProduto, precoExibicao, tamanhosPizzaDoCardapio, ingredientesDoProduto, produtoPorPeso } from "./segmentos";

const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lbl = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };
const inp = { width: "100%", padding: "9px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917", background: "#fff" };

// ─── COMPRESSÃO DE IMAGEM ─────────────────────────────────────────────────────
function comprimirImagem(file, maxWidth = 400, quality = 0.75) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── PLACEHOLDER DE IMAGEM ────────────────────────────────────────────────────
function ImagemProduto({ src, tamanho = 80, borderRadius = 8 }) {
  if (src) {
    return <img src={src} alt="" style={{ width: tamanho, height: tamanho, objectFit: "cover", borderRadius, flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: tamanho, height: tamanho, background: "#f5f5f4", borderRadius, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px dashed #d6d3d1" }}>
      <span style={{ fontSize: tamanho * 0.35, color: "#d6d3d1" }}>📷</span>
    </div>
  );
}

// ─── SLIDESHOW ADMIN CARD (carrega do banco) ─────────────────────────────────
function SlideshowAdminCard({ produtoId, imagemLegada }) {
  const [imagens, setImagens] = useState(
    imagemLegada ? [{ id: "0", imagem: imagemLegada }] : []
  );
  useEffect(() => {
    api.produtos.imagens.listar(produtoId).then(imgs => {
      if (imgs.length > 0) setImagens(imgs);
      else if (imagemLegada) setImagens([{ id: "0", imagem: imagemLegada }]);
    }).catch(() => {});
  }, [produtoId]);
  return <SlideshowAdmin imagens={imagens} />;
}

// ─── SLIDESHOW ADMIN (miniaturas + seta) ─────────────────────────────────────
function SlideshowAdmin({ imagens }) {
  const [idx, setIdx] = useState(0);
  if (!imagens || imagens.length === 0) return (
    <div style={{ width: 80, height: 80, background: "#f5f5f4", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #d6d3d1" }}>
      <span style={{ fontSize: 28, color: "#d6d3d1" }}>📷</span>
    </div>
  );
  if (imagens.length === 1) return (
    <img src={imagens[0].imagem} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} />
  );
  return (
    <div style={{ position: "relative", width: 80, height: 80, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
      <img src={imagens[idx].imagem} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <button onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + imagens.length) % imagens.length); }}
        style={{ position: "absolute", left: 1, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.45)", border: "none", color: "#fff", borderRadius: 4, width: 18, height: 22, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
      <button onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % imagens.length); }}
        style={{ position: "absolute", right: 1, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.45)", border: "none", color: "#fff", borderRadius: 4, width: 18, height: 22, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
      <div style={{ position: "absolute", bottom: 3, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 3 }}>
        {imagens.map((_, i) => (
          <div key={i} onClick={e => { e.stopPropagation(); setIdx(i); }}
            style={{ width: 5, height: 5, borderRadius: "50%", background: i === idx ? "#fff" : "rgba(255,255,255,0.5)", cursor: "pointer" }} />
        ))}
      </div>
    </div>
  );
}

// ─── MODAL PRODUTO ────────────────────────────────────────────────────────────
function ModalProduto({ onSave, onFichaSalva, onClose, editando, categorias, insumos, cardapioTipo = "snack_bar", cardapio = null }) {
  const [form, setForm] = useState(editando || { nome: "", descricao: "", preco: "", custo: "", categoria: "", imagem: "", disponivel: true, codigo: "", codigo_barras: "", ncm: "", cest: "", um: "un", pertence_estoque: false });
  // Segmento do cardápio ativo define os recursos do form (tamanhos etc.)
  const segmento = infoSegmento(cardapioTipo);
  // Pizzaria v2: tamanhos moram no CARDÁPIO. O sabor só preenche o preço
  // para cada um. Sem tamanhos no cardápio → cai no fluxo antigo (tamanhos livres).
  const tamanhosPizzaCardapio = tamanhosPizzaDoCardapio(cardapio);
  const usaTamanhosCardapio = cardapioTipo === "pizzeria" && tamanhosPizzaCardapio.length > 0;
  const [tamanhos, setTamanhos] = useState(() => {
    const dopr = tamanhosDoProduto(editando);
    if (usaTamanhosCardapio) {
      // Mescla: um input de preço por tamanho do cardápio, herdando o preço
      // já cadastrado no produto (se houver) ou vazio.
      return tamanhosPizzaCardapio.map(t => {
        const existente = dopr.find(x => x.nome === t.nome);
        return { nome: t.nome, preco: existente ? String(existente.preco) : "" };
      });
    }
    return dopr.map(t => ({ nome: t.nome, preco: String(t.preco) }));
  });
  // Pizzaria v2: ingredientes do sabor (chips editáveis)
  const [ingredientes, setIngredientes] = useState(() => ingredientesDoProduto(editando));
  const [ingredienteNovo, setIngredienteNovo] = useState("");
  // Venda por peso (peixaria e outros): só pra cardápios com recurso vendaPorPeso.
  // Marcar transforma "Preço" em "Preço por kg" e o lançamento no PDV pede peso.
  const [porPeso, setPorPeso] = useState(() => produtoPorPeso(editando));
  const [salvando, setSalvando] = useState(false);
  const fileRef = useRef(null);
  const [abaModal, setAbaModal] = useState("produto");
  const [composicao, setComposicao] = useState([]);
  const [loadingComposicao, setLoadingComposicao] = useState(false);
  const [insumoSel, setInsumoSel] = useState("");
  const [qtdInsumo, setQtdInsumo] = useState("");

  // ── Múltiplas fotos ──────────────────────────────────────────────────────────
  // source: 'db' = já está no banco  |  'new' = novo upload local  |  'legacy' = campo imagem legado
  const [imagens, setImagens] = useState([]);
  const [deletarIds, setDeletarIds] = useState([]); // ids de imagens 'db' a remover ao salvar
  const [fotoIdx, setFotoIdx] = useState(0);
  // Ref garante que o salvar() sempre lê o estado mais atual (evita closure stale)
  const imagensRef = useRef([]);
  const deletarIdsRef = useRef([]);
  useEffect(() => { imagensRef.current = imagens; }, [imagens]);
  useEffect(() => { deletarIdsRef.current = deletarIds; }, [deletarIds]);

  // Carregar imagens ao abrir edição
  useEffect(() => {
    if (!editando?.id) return;
    api.produtos.imagens.listar(editando.id).then(dbImgs => {
      if (dbImgs.length > 0) {
        setImagens(dbImgs.map(i => ({ ...i, source: 'db' })));
      } else if (editando.imagem) {
        // Imagem legada no campo produtos.imagem
        setImagens([{ id: '__legado__', imagem: editando.imagem, ordem: 0, source: 'legacy' }]);
      }
      setFotoIdx(0);
    }).catch(() => {});
  }, [editando?.id]);

  // Adicionar fotos (só preview local — tudo salvo no "Salvar")
  const adicionarFotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const novas = await Promise.all(files.map(f => comprimirImagem(f)));
    setImagens(prev => {
      const novos = novas.map((img, i) => ({
        id: `__new__${Date.now()}_${i}`,
        imagem: img,
        ordem: prev.length + i,
        source: 'new',
      }));
      return [...prev, ...novos];
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  // Remover foto (só remove do estado — DB é atualizado no Salvar)
  const removerFoto = (img) => {
    setImagens(prev => {
      const lista = prev.filter(i => i.id !== img.id);
      setFotoIdx(f => Math.min(f, Math.max(0, lista.length - 1)));
      return lista;
    });
    if (img.source === 'db') {
      setDeletarIds(prev => [...prev, img.id]);
    }
  };

  // Definir foto como principal (move para posição 0)
  const setPrincipal = (img) => {
    setImagens(prev => [img, ...prev.filter(i => i.id !== img.id)]);
    setFotoIdx(0);
  };

  // Carregar composição ao abrir ficha técnica
  useEffect(() => {
    if (abaModal === "ficha" && editando?.id) {
      setLoadingComposicao(true);
      api.composicao.listar(editando.id)
        .then(rows => setComposicao(rows))
        .catch(() => {})
        .finally(() => setLoadingComposicao(false));
    }
  }, [abaModal, editando?.id]);

  // CMV calculado pela ficha técnica
  const cmvFicha = composicao.reduce((s, r) => s + r.preco_unitario * r.quantidade, 0);
  const temFicha = composicao.length > 0;

  const adicionarInsumoFicha = () => {
    if (!insumoSel || !qtdInsumo || parseFloat(qtdInsumo) <= 0) return;
    const ins = insumos.find(i => i.id === insumoSel);
    if (!ins) return;
    if (composicao.find(r => r.insumo_id === insumoSel)) {
      // atualiza quantidade
      setComposicao(c => c.map(r => r.insumo_id === insumoSel ? { ...r, quantidade: parseFloat(qtdInsumo) } : r));
    } else {
      setComposicao(c => [...c, { insumo_id: ins.id, insumo_nome: ins.nome, unidade: ins.unidade, preco_unitario: ins.preco_unitario, quantidade: parseFloat(qtdInsumo) }]);
    }
    setInsumoSel(""); setQtdInsumo("");
  };

  const removerInsumoFicha = (insumoId) => setComposicao(c => c.filter(r => r.insumo_id !== insumoId));

  const salvarFicha = async () => {
    if (!editando?.id) return;
    setSalvando(true);
    try {
      const { produto } = await api.composicao.salvar(
        editando.id,
        composicao.map(r => ({ insumo_id: r.insumo_id, quantidade: r.quantidade }))
      );
      // Atualiza o form localmente com o novo CMV
      setForm(f => ({ ...f, custo: produto.custo }));
      // Notifica o pai para atualizar o card do produto (sem chamar PUT /api/produtos novamente)
      onFichaSalva(produto);
    } catch (err) {
      // erro já exibido via toast do pai se necessário
    } finally {
      setSalvando(false);
    }
  };

  const salvar = async () => {
    // Tamanhos válidos (nome + preço numérico). Com tamanhos, o preço base
    // vira o menor deles — o card mostra "a partir de".
    const tamanhosValidos = segmento.recursos.tamanhos
      ? tamanhos.filter(t => t.nome.trim() && !isNaN(parseFloat(t.preco)) && parseFloat(t.preco) >= 0)
          .map(t => ({ nome: t.nome.trim(), preco: parseFloat(t.preco) }))
      : [];
    const precoBase = tamanhosValidos.length > 0
      ? Math.min(...tamanhosValidos.map(t => t.preco))
      : parseFloat(form.preco);
    if (!form.nome || isNaN(precoBase)) return;
    setSalvando(true);
    try {
      // Lê do ref para garantir o valor mais atual (evita closure stale)
      const imgs = imagensRef.current;
      const toDelete = deletarIdsRef.current;
      const primeiraImg = imgs[0]?.imagem || "";

      // 1. Criar ou atualizar o produto (campo imagem = foto principal)
      const produto = await onSave({
        ...form,
        imagem: primeiraImg,
        preco: precoBase,
        custo: parseFloat(form.custo) || 0,
        disponivel: form.disponivel,
        pertence_estoque: !!form.pertence_estoque,
        um: (form.um || "un").trim() || "un",
        config: { ...parseConfig(editando?.config), tamanhos: tamanhosValidos, ingredientes: ingredientes.filter(s => s && s.trim()), venda_por_peso: !!porPeso },
      });

      if (produto?.id) {
        // 2. Deletar imagens removidas pelo usuário
        for (const imgId of toDelete) {
          await api.produtos.imagens.remover(produto.id, imgId).catch(() => {});
        }

        // 3. Salvar fotos novas e legadas que ainda não estão em produto_imagens
        const paraSubir = imgs.filter(i => i.source === 'new' || i.source === 'legacy');
        for (let i = 0; i < paraSubir.length; i++) {
          await api.produtos.imagens.adicionar(produto.id, paraSubir[i].imagem, i);
        }

        // 4. T8: ficha técnica montada na criação — salva junto com o produto novo
        if (!editando && composicao.length > 0) {
          await api.composicao.salvar(
            produto.id,
            composicao.map(r => ({ insumo_id: r.insumo_id, quantidade: r.quantidade }))
          ).catch(() => {});
        }
      }

      onClose(); // só fecha depois de tudo salvo com sucesso
    } catch (err) {
      console.error("Erro ao salvar produto/imagens:", err);
      setSalvando(false);
    }
  };

  const fmt = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", width: 520, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600 }}>{editando ? "Editar" : "Novo"} Produto</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>×</button>
        </div>

        {/* Abas — Produto + Ficha Técnica (T8: ficha disponível também na criação) */}
        <div style={{ display: "flex", gap: 2, background: "#f5f5f4", borderRadius: 8, padding: 3, marginBottom: 20 }}>
          {[["produto", "Produto"], ["ficha", "Ficha Técnica (opcional)"]].map(([k, v]) => (
            <button key={k} onClick={() => setAbaModal(k)}
              style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", background: abaModal === k ? "#fff" : "none", color: abaModal === k ? "#15803d" : "#78716c", fontWeight: abaModal === k ? 600 : 400, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: abaModal === k ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
              {v}
            </button>
          ))}
        </div>

        {/* ─── ABA: PRODUTO ─── */}
        {abaModal === "produto" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* ── Fotos do produto (múltiplas) ── */}
            <div>
              <label style={{ ...lbl, marginBottom: 8 }}>
                Fotos do produto
                <span style={{ marginLeft: 6, fontWeight: 400, color: "#a8a29e" }}>({imagens.length}/10)</span>
              </label>

              {/* Preview grande da foto selecionada */}
              {imagens.length > 0 ? (
                <div style={{ position: "relative", width: "100%", height: 190, borderRadius: 10, overflow: "hidden", marginBottom: 10, background: "#f5f5f4" }}>
                  <img src={imagens[fotoIdx]?.imagem} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {imagens.length > 1 && (
                    <>
                      <button type="button" onClick={() => setFotoIdx(i => (i - 1 + imagens.length) % imagens.length)}
                        style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 30, height: 30, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                      <button type="button" onClick={() => setFotoIdx(i => (i + 1) % imagens.length)}
                        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 30, height: 30, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
                      <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
                        {imagens.map((_, i) => (
                          <div key={i} onClick={() => setFotoIdx(i)}
                            style={{ width: i === fotoIdx ? 16 : 7, height: 7, borderRadius: 4, background: i === fotoIdx ? "#F38C24" : "rgba(255,255,255,0.7)", cursor: "pointer", transition: "width 0.2s" }} />
                        ))}
                      </div>
                    </>
                  )}
                  <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 4 }}>
                    {fotoIdx === 0
                      ? <span style={{ background: "#15803d", color: "#fff", fontSize: 10, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>✓ Principal</span>
                      : <button type="button" onClick={() => setPrincipal(imagens[fotoIdx])}
                          style={{ background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", fontSize: 10, padding: "2px 7px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                          ☆ Usar como principal
                        </button>
                    }
                  </div>
                  <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
                    <span style={{ background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 10, padding: "2px 7px", borderRadius: 8 }}>{fotoIdx + 1}/{imagens.length}</span>
                    <button type="button" onClick={() => removerFoto(imagens[fotoIdx])}
                      style={{ background: "rgba(220,38,38,0.8)", color: "#fff", border: "none", fontSize: 12, width: 22, height: 22, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>×</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => fileRef.current?.click()} style={{ width: "100%", height: 120, background: "#fafaf9", borderRadius: 10, border: "2px dashed #d6d3d1", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, cursor: "pointer", marginBottom: 10 }}>
                  <span style={{ fontSize: 32, color: "#d6d3d1" }}>📷</span>
                  <span style={{ fontSize: 12, color: "#a8a29e" }}>Clique para adicionar fotos</span>
                </div>
              )}

              {/* Grade de miniaturas */}
              {imagens.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {imagens.map((img, i) => (
                    <div key={img.id} onClick={() => setFotoIdx(i)}
                      style={{ position: "relative", width: 52, height: 52, borderRadius: 7, overflow: "hidden", cursor: "pointer", border: i === fotoIdx ? "2.5px solid #F38C24" : "2px solid #e7e5e4", flexShrink: 0, opacity: 1 }}>
                      <img src={img.imagem} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {i === 0 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(21,128,61,0.9)", fontSize: 7, color: "#fff", textAlign: "center", padding: "1px 0", fontWeight: 700, letterSpacing: "0.03em" }}>PRINCIPAL</div>}
                    </div>
                  ))}
                  {imagens.length < 10 && (
                    <div onClick={() => fileRef.current?.click()}
                      style={{ width: 52, height: 52, borderRadius: 7, border: "2px dashed #d6d3d1", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, background: "#fafaf9", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: 16, color: "#a8a29e" }}>+</span>
                      <span style={{ fontSize: 7, color: "#a8a29e" }}>foto</span>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" onClick={() => fileRef.current?.click()}
                  style={{ padding: "7px 14px", background: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e", fontWeight: 500 }}>
                  + Adicionar foto(s)
                </button>
                <span style={{ fontSize: 10, color: "#a8a29e" }}>JPG, PNG • múltiplas • comprimidas automaticamente</span>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={adicionarFotos} style={{ display: "none" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>Nome do produto</label>
                <input style={inp} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Hambúrguer artesanal" />
              </div>
              <div>
                <label style={lbl}>Código (SKU/EAN)</label>
                <input style={inp} value={form.codigo || ""} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="Ex: 7891234000010" />
              </div>
            </div>
            <div>
              <label style={lbl}>Descrição</label>
              <input style={inp} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Breve descrição do produto" />
            </div>
            {/* Tamanhos com preço próprio (pizzaria, açaí, sorvete, marmita, café…) */}
            {segmento.recursos.tamanhos && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 14px" }}>
                <label style={{ ...lbl, color: "#15803d", marginBottom: 4 }}>
                  {segmento.icone} Tamanhos ({segmento.nome})
                </label>
                <div style={{ fontSize: 11, color: "#78716c", marginBottom: 10 }}>
                  {usaTamanhosCardapio ? (
                    <>Herdados do cardápio (nome, fatias e máx. sabores). Aqui você só preenche o <b>preço deste sabor</b> em cada tamanho.</>
                  ) : (
                    <>Cada tamanho tem seu preço (ex: Broto/Grande, 300ml/500ml, P/M/G). Com tamanhos
                    cadastrados, o cliente escolhe o tamanho na montagem e o preço base vira o menor deles.
                    Sem tamanhos, vale o preço de venda abaixo.</>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {tamanhos.map((t, i) => {
                    const meta = usaTamanhosCardapio ? tamanhosPizzaCardapio.find(x => x.nome === t.nome) : null;
                    return (
                      <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input style={{ ...inp, flex: 1, padding: "7px 10px", fontSize: 12.5, background: usaTamanhosCardapio ? "#fafaf9" : "#fff" }}
                          value={t.nome}
                          readOnly={usaTamanhosCardapio}
                          onChange={e => setTamanhos(ts => ts.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                          placeholder={cardapioTipo === "pizzeria" ? "Ex: Grande" : "Ex: 500ml"} />
                        {meta && (
                          <span style={{ fontSize: 10, color: "#78716c", background: "#fff", border: "1px solid #e7e5e4", borderRadius: 6, padding: "5px 8px", whiteSpace: "nowrap" }}>
                            {meta.fatias} fatias · até {meta.max_sabores} sabor{meta.max_sabores > 1 ? "es" : ""}
                          </span>
                        )}
                        <input style={{ ...inp, width: 100, padding: "7px 10px", fontSize: 12.5 }} type="number" step="0.01" value={t.preco}
                          onChange={e => setTamanhos(ts => ts.map((x, j) => j === i ? { ...x, preco: e.target.value } : x))}
                          placeholder="R$" />
                        {!usaTamanhosCardapio && (
                          <button type="button" onClick={() => setTamanhos(ts => ts.filter((_, j) => j !== i))}
                            style={{ background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", color: "#dc2626" }}>×</button>
                        )}
                      </div>
                    );
                  })}
                  {!usaTamanhosCardapio && (
                    <button type="button" onClick={() => setTamanhos(ts => [...ts, { nome: "", preco: "" }])}
                      style={{ alignSelf: "flex-start", padding: "6px 14px", background: "#fff", border: "1.5px solid #bbf7d0", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#15803d" }}>
                      + Adicionar tamanho
                    </button>
                  )}
                  {usaTamanhosCardapio && (
                    <div style={{ fontSize: 11, color: "#78716c", fontStyle: "italic" }}>
                      Para editar nomes/fatias/máx. sabores, vá em <b>Cardápios</b> → editar → Tamanhos de pizza.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pizzaria v2: ingredientes do sabor (chips) — cliente pode remover na montagem */}
            {cardapioTipo === "pizzeria" && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 14px" }}>
                <label style={{ ...lbl, color: "#92400e", marginBottom: 4 }}>🧀 Ingredientes do sabor</label>
                <div style={{ fontSize: 11, color: "#78716c", marginBottom: 10 }}>
                  Lista dos ingredientes deste sabor (ex: queijo, molho, cebola, azeitona). Na montagem
                  o cliente pode marcar quais tirar ("sem cebola"). Deixe vazio se não quiser essa opção.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {ingredientes.map((ing, i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#fff", border: "1.5px solid #fde68a", borderRadius: 999, fontSize: 12, color: "#92400e" }}>
                      {ing}
                      <button type="button" onClick={() => setIngredientes(list => list.filter((_, j) => j !== i))}
                        style={{ background: "none", border: "none", color: "#a16207", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                  {ingredientes.length === 0 && (
                    <span style={{ fontSize: 11, color: "#a8a29e", fontStyle: "italic" }}>Nenhum ingrediente cadastrado.</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...inp, flex: 1, padding: "7px 10px", fontSize: 12.5 }} value={ingredienteNovo}
                    onChange={e => setIngredienteNovo(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = ingredienteNovo.trim();
                        if (v && !ingredientes.includes(v)) setIngredientes(list => [...list, v]);
                        setIngredienteNovo("");
                      }
                    }}
                    placeholder="Ex: queijo mussarela" />
                  <button type="button"
                    onClick={() => {
                      const v = ingredienteNovo.trim();
                      if (v && !ingredientes.includes(v)) setIngredientes(list => [...list, v]);
                      setIngredienteNovo("");
                    }}
                    style={{ padding: "6px 14px", background: "#fff", border: "1.5px solid #fde68a", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#92400e" }}>
                    + Adicionar
                  </button>
                </div>
              </div>
            )}
            {segmento.recursos.vendaPorPeso && (
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" id="por-peso" checked={porPeso} onChange={e => setPorPeso(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#0284c7" }} />
                <label htmlFor="por-peso" style={{ fontSize: 12.5, color: "#0c4a6e", cursor: "pointer", flex: 1 }}>
                  <strong>Vender por peso (kg)</strong>
                  <span style={{ display: "block", fontSize: 11, color: "#075985", marginTop: 2 }}>
                    O preço abaixo passa a ser "por kg". No lançamento (PDV), o operador digita o peso da peça e o total sai por multiplicação.
                  </span>
                </label>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div>
                <label style={lbl}>{porPeso ? "Preço por kg (R$)" : "Preço de venda (R$)"}{tamanhos.some(t => t.nome.trim()) ? " — automático (menor tamanho)" : ""}</label>
                <input style={{ ...inp, background: tamanhos.some(t => t.nome.trim()) ? "#fafaf9" : "#fff" }}
                  type="number" step="0.01" value={form.preco}
                  readOnly={tamanhos.some(t => t.nome.trim())}
                  onChange={e => setForm({ ...form, preco: e.target.value })} placeholder="0,00" />
              </div>
              <div>
                <label style={lbl}>
                  CMV — Custo (R$)
                  {temFicha && <span style={{ marginLeft: 6, background: "#f0fdf4", color: "#15803d", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>AUTO</span>}
                </label>
                <input style={{ ...inp, background: temFicha ? "#fafaf9" : "#fff", color: temFicha ? "#78716c" : "#1c1917" }}
                  type="number" step="0.01" value={temFicha ? cmvFicha.toFixed(2) : form.custo}
                  readOnly={temFicha}
                  onChange={e => !temFicha && setForm({ ...form, custo: e.target.value })}
                  placeholder="0,00" />
                {temFicha && <div style={{ fontSize: 11, color: "#78716c", marginTop: 4 }}>Calculado pela ficha técnica • <button style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 11, padding: 0 }} onClick={() => setAbaModal("ficha")}>ver composição →</button></div>}
              </div>
            </div>
            <div>
              <label style={lbl}>Categoria</label>
              <select style={{ ...inp, cursor: "pointer" }} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                <option value="">Selecione...</option>
                {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>

            {/* ── FISCAL & ESTOQUE — código, EAN, NCM, CEST, UM ── */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ ...lbl, color: "#334155", marginBottom: 0 }}>🏷️ Fiscal & Estoque</label>
                <span style={{ fontSize: 10, color: "#64748b" }}>Opcional — necessário para NFC-e e importação</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                <div>
                  <label style={{ ...lbl, fontSize: 10 }}>Código (interno)</label>
                  <input style={{ ...inp, padding: "7px 10px", fontSize: 12 }} value={form.codigo || ""}
                    onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="Ex: PX0001" />
                </div>
                <div>
                  <label style={{ ...lbl, fontSize: 10 }}>Código de barras (EAN)</label>
                  <input style={{ ...inp, padding: "7px 10px", fontSize: 12 }} value={form.codigo_barras || ""}
                    onChange={e => setForm({ ...form, codigo_barras: e.target.value })} placeholder="Ex: 7891234567890" />
                </div>
                <div>
                  <label style={{ ...lbl, fontSize: 10 }}>NCM</label>
                  <input style={{ ...inp, padding: "7px 10px", fontSize: 12 }} value={form.ncm || ""}
                    onChange={e => setForm({ ...form, ncm: e.target.value })} placeholder="8 dígitos" />
                </div>
                <div>
                  <label style={{ ...lbl, fontSize: 10 }}>CEST</label>
                  <input style={{ ...inp, padding: "7px 10px", fontSize: 12 }} value={form.cest || ""}
                    onChange={e => setForm({ ...form, cest: e.target.value })} placeholder="7 dígitos" />
                </div>
                <div>
                  <label style={{ ...lbl, fontSize: 10 }}>Unidade (UM)</label>
                  <select style={{ ...inp, padding: "7px 10px", fontSize: 12, cursor: "pointer" }} value={form.um || "un"}
                    onChange={e => setForm({ ...form, um: e.target.value })}>
                    <option value="un">UN — unidade</option>
                    <option value="kg">KG — quilograma</option>
                    <option value="g">G — grama</option>
                    <option value="l">L — litro</option>
                    <option value="ml">ML — mililitro</option>
                    <option value="cx">CX — caixa</option>
                    <option value="pct">PCT — pacote</option>
                    <option value="dz">DZ — dúzia</option>
                    <option value="m">M — metro</option>
                  </select>
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", marginTop: 12, background: "#fff", border: "1.5px solid #cbd5e1", borderRadius: 8, padding: "9px 12px" }}>
                <input type="checkbox" checked={!!form.pertence_estoque} onChange={e => setForm({ ...form, pertence_estoque: e.target.checked })}
                  style={{ marginTop: 2, cursor: "pointer" }} />
                <span style={{ fontSize: 12.5, color: "#334155", flex: 1 }}>
                  <strong>Pertence ao estoque?</strong>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    Ao marcar, o item entra em <b>Estoque</b> como <b>revenda</b> (mesmo código). Cada venda desconta 1 unidade do saldo. Precisa ter <b>código</b> ou <b>EAN</b> pra funcionar.
                  </span>
                </span>
              </label>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={form.disponivel} onChange={e => setForm({ ...form, disponivel: e.target.checked })} />
              <span style={{ color: form.disponivel ? "#15803d" : "#a8a29e", fontWeight: 500 }}>
                {form.disponivel ? "Disponível para venda" : "Indisponível"}
              </span>
            </label>
          </div>
        )}

        {/* ─── ABA: FICHA TÉCNICA ─── */}
        {abaModal === "ficha" && (
          <div>
            {loadingComposicao ? (
              <div style={{ textAlign: "center", padding: 32, color: "#a8a29e", fontSize: 13 }}>Carregando...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!editando && (
                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#1e40af" }}>
                    💡 Opcional. A ficha é salva junto com o produto e calcula o CMV automaticamente. Você também pode cadastrá-la depois.
                  </div>
                )}
                {insumos.length === 0 && (
                  <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e" }}>
                    Nenhum insumo cadastrado ainda. Cadastre em <b>Estoque e Insumos → Insumos</b> para montar a ficha técnica.
                  </div>
                )}
                {/* Adicionar insumo */}
                <div style={{ background: "#fafaf9", borderRadius: 10, padding: "14px 16px", border: "1px solid #e7e5e4" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#57534e", marginBottom: 10 }}>ADICIONAR INSUMO</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select style={{ ...inp, flex: "1 1 180px", cursor: "pointer" }} value={insumoSel} onChange={e => setInsumoSel(e.target.value)}>
                      <option value="">Selecione o insumo...</option>
                      {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade}) — {fmt(i.preco_unitario)}/{i.unidade}</option>)}
                    </select>
                    <input style={{ ...inp, width: 110, flex: "0 0 110px" }} type="number" step="0.001" min="0.001"
                      placeholder="Qtd" value={qtdInsumo} onChange={e => setQtdInsumo(e.target.value)} />
                    <button onClick={adicionarInsumoFicha}
                      style={{ padding: "9px 16px", background: "#15803d", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", whiteSpace: "nowrap" }}>
                      + Adicionar
                    </button>
                  </div>
                  {insumoSel && qtdInsumo && (() => {
                    const ins = insumos.find(i => i.id === insumoSel);
                    if (!ins) return null;
                    const custo = ins.preco_unitario * parseFloat(qtdInsumo || 0);
                    return <div style={{ fontSize: 11, color: "#78716c", marginTop: 6 }}>Custo: {fmt(custo)} ({qtdInsumo} {ins.unidade} × {fmt(ins.preco_unitario)})</div>;
                  })()}
                </div>

                {/* Lista da composição */}
                {composicao.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#a8a29e", fontSize: 13 }}>
                    Nenhum insumo na ficha técnica. Adicione acima.
                  </div>
                ) : (
                  <div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e7e5e4" }}>
                          <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 11, color: "#78716c", fontWeight: 600 }}>INSUMO</th>
                          <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: "#78716c", fontWeight: 600 }}>QUANTIDADE</th>
                          <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 11, color: "#78716c", fontWeight: 600 }}>CUSTO</th>
                          <th style={{ width: 32 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {composicao.map(r => (
                          <tr key={r.insumo_id} style={{ borderBottom: "1px solid #f5f5f4" }}>
                            <td style={{ padding: "8px 8px", fontWeight: 500 }}>{r.insumo_nome}</td>
                            <td style={{ padding: "8px 8px", textAlign: "center", color: "#57534e" }}>
                              <input type="number" step="0.001" min="0.001" value={r.quantidade}
                                onChange={e => setComposicao(c => c.map(x => x.insumo_id === r.insumo_id ? { ...x, quantidade: parseFloat(e.target.value) || 0 } : x))}
                                style={{ width: 80, padding: "4px 8px", border: "1.5px solid #e7e5e4", borderRadius: 6, fontSize: 12, textAlign: "center", fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                              <span style={{ marginLeft: 4, fontSize: 11, color: "#a8a29e" }}>{r.unidade}</span>
                            </td>
                            <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 600, color: "#15803d" }}>
                              {fmt(r.preco_unitario * r.quantidade)}
                            </td>
                            <td style={{ padding: "8px 4px", textAlign: "right" }}>
                              <button onClick={() => removerInsumoFicha(r.insumo_id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 14, padding: "2px 6px" }}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid #e7e5e4", background: "#fafaf9" }}>
                          <td colSpan={2} style={{ padding: "10px 8px", fontWeight: 700, fontSize: 13 }}>CMV Total</td>
                          <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, fontSize: 15, color: "#15803d", fontFamily: "'Inter', sans-serif" }}>
                            {fmt(cmvFicha)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button onClick={() => setAbaModal("produto")}
                    style={{ flex: 1, padding: 11, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>
                    ← Voltar
                  </button>
                  {editando ? (
                    <button onClick={salvarFicha} disabled={salvando}
                      style={{ flex: 2, padding: 11, background: "#15803d", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: salvando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: salvando ? 0.7 : 1 }}>
                      {salvando ? "Salvando..." : "Salvar ficha técnica"}
                    </button>
                  ) : (
                    <button onClick={() => setAbaModal("produto")}
                      style={{ flex: 2, padding: 11, background: "#15803d", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>
                      Concluir ficha → voltar ao produto
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Botões da aba Produto */}
        {abaModal === "produto" && (
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 11, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} style={{ flex: 2, padding: 11, background: "#15803d", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: salvando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: salvando ? 0.7 : 1 }}>
              {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar produto"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── T9: IMPORTAÇÃO VIA CSV ───────────────────────────────────────────────────
function splitCSVLine(line, delim) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === delim && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function parsePrecoBR(s) {
  s = String(s || "").replace(/[R$\s]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  return parseFloat(s);
}
// Parser CSV completo — colunas mínimas: nome + preco. Todas as outras opcionais.
// Aliases pra tolerar cabeçalhos que vieram do fornecedor/planilha do cliente.
function parseProdutosCSV(text) {
  const linhas = String(text).trim().split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) return { rows: [], erro: "Inclua um cabeçalho e ao menos 1 linha de produto." };
  const delim = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ";" : ",";
  const norm = s => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s_-]+/g, "");
  const headers = splitCSVLine(linhas[0], delim).map(norm);
  const acha = (alts) => headers.findIndex(h => alts.includes(h));
  const idx = {
    nome:            acha(["nome", "produto", "name", "item", "descricao", "descriminacao", "discriminacao"]),
    preco:           acha(["preco", "price", "valor", "venda", "precovenda", "valorvenda", "preco_venda"]),
    categoria:       acha(["categoria", "category", "cat", "grupo", "grupoproduto"]),
    descricao:       acha(["descricaocomplementar", "detalhe", "obs", "observacao", "detalhes", "description", "desc"]),
    custo:           acha(["custo", "cmv", "cost", "custocompra", "precocompra"]),
    disponivel:      acha(["disponivel", "ativo", "available", "status"]),
    codigo:          acha(["codigo", "cod", "code", "sku"]),
    codigo_barras:   acha(["codigobarras", "codbarras", "ean", "ean13", "gtin", "nan"]),
    ncm:             acha(["ncm"]),
    cest:            acha(["cest"]),
    um:              acha(["um", "unidade", "unidmedida", "unid", "un"]),
    estoque_inicial: acha(["estoque", "estoqueinicial", "saldo", "saldoatual", "qtdestoque", "unidadeestoque", "valorunidadeestoque"]),
    estoque_minimo:  acha(["estoqueminimo", "minimo", "estoquemin", "min"]),
    pertence_estoque:acha(["pertenceestoque", "controlaestoque", "estoquecontrolado"]),
  };
  if (idx.nome < 0 || idx.preco < 0) return { rows: [], erro: "O cabeçalho precisa ter pelo menos as colunas 'nome' e 'preco'." };
  const rows = [];
  const truthy = (s) => /^(1|s|sim|y|yes|true|v|verdadeiro)$/i.test(String(s || "").trim());
  for (let i = 1; i < linhas.length; i++) {
    const cols = splitCSVLine(linhas[i], delim);
    const nome = (cols[idx.nome] || "").trim();
    const preco = parsePrecoBR(cols[idx.preco]);
    if (!nome || isNaN(preco)) continue;
    const um = idx.um >= 0 ? (cols[idx.um] || "").trim().toLowerCase() : "";
    const pertence = idx.pertence_estoque >= 0
      ? truthy(cols[idx.pertence_estoque])
      : (idx.estoque_inicial >= 0 && !isNaN(parseFloat(String(cols[idx.estoque_inicial] || "").replace(",", "."))));
    rows.push({
      nome,
      preco,
      categoria: idx.categoria >= 0 ? (cols[idx.categoria] || "").trim() : "",
      descricao: idx.descricao >= 0 ? (cols[idx.descricao] || "").trim() : "",
      custo:     idx.custo >= 0 ? (parsePrecoBR(cols[idx.custo]) || 0) : 0,
      disponivel: idx.disponivel >= 0 ? !/^(0|nao|n|false|indispon|inativo)/i.test(String(cols[idx.disponivel] || "").trim().toLowerCase()) : true,
      codigo:        idx.codigo >= 0 ? (cols[idx.codigo] || "").trim() : "",
      codigo_barras: idx.codigo_barras >= 0 ? (cols[idx.codigo_barras] || "").trim() : "",
      ncm:  idx.ncm >= 0 ? (cols[idx.ncm] || "").trim() : "",
      cest: idx.cest >= 0 ? (cols[idx.cest] || "").trim() : "",
      um:   um || "un",
      estoque_inicial: idx.estoque_inicial >= 0 ? parseFloat(String(cols[idx.estoque_inicial] || "").replace(",", ".")) : undefined,
      estoque_minimo:  idx.estoque_minimo >= 0 ? parseFloat(String(cols[idx.estoque_minimo] || "").replace(",", ".")) : undefined,
      pertence_estoque: pertence,
    });
  }
  return { rows, erro: rows.length ? null : "Nenhuma linha válida encontrada (verifique nome e preço)." };
}

// Parser JSON — aceita array de objetos com as MESMAS chaves do CSV. Formato
// mais fácil de gerar via ChatGPT ("converta esses prints em JSON com os campos X, Y, Z").
function parseProdutosJSON(text) {
  const s = String(text).trim();
  if (!s) return { rows: [], erro: "" };
  let raw;
  try { raw = JSON.parse(s); }
  catch (e) { return { rows: [], erro: "JSON inválido: " + e.message }; }
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.itens) ? raw.itens : (Array.isArray(raw?.produtos) ? raw.produtos : null));
  if (!arr) return { rows: [], erro: "Envie um array de produtos (ou um objeto com 'itens' / 'produtos')." };
  const rows = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const nome = String(it.nome || it.name || it.produto || "").trim();
    const preco = Number(String(it.preco ?? it.price ?? it.valor ?? "").replace(",", "."));
    if (!nome || !isFinite(preco)) continue;
    rows.push({
      nome, preco,
      categoria: String(it.categoria || it.category || "").trim(),
      descricao: String(it.descricao || it.description || "").trim(),
      custo: Number(String(it.custo ?? it.cmv ?? 0).toString().replace(",", ".")) || 0,
      disponivel: it.disponivel === false ? false : true,
      codigo: String(it.codigo || it.cod || "").trim(),
      codigo_barras: String(it.codigo_barras || it.ean || it.gtin || it.nan || "").trim(),
      ncm: String(it.ncm || "").trim(),
      cest: String(it.cest || "").trim(),
      um: String(it.um || it.unidade || "un").trim().toLowerCase() || "un",
      estoque_inicial: it.estoque_inicial != null ? Number(String(it.estoque_inicial).replace(",", ".")) : (it.estoque != null ? Number(String(it.estoque).replace(",", ".")) : undefined),
      estoque_minimo: it.estoque_minimo != null ? Number(String(it.estoque_minimo).replace(",", ".")) : undefined,
      pertence_estoque: it.pertence_estoque === true || it.controla_estoque === true || (it.estoque_inicial != null),
    });
  }
  return { rows, erro: rows.length ? null : "Nenhum produto válido no JSON (cada item precisa de 'nome' e 'preco')." };
}

// Modal completo: dois formatos (JSON ou CSV), prévia em tabela, envia em UM
// POST para /api/produtos/importar (o endpoint faz idempotência por código,
// cria categorias faltantes e vincula ao cardápio ativo).
function ModalImportarProdutos({ onImport, onClose, cardapioNome }) {
  const [aba, setAba] = useState("json"); // "json" | "csv"
  const [texto, setTexto] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null); // relatório do server após importar
  const fileRef = useRef(null);

  const parsed = aba === "json" ? parseProdutosJSON(texto) : parseProdutosCSV(texto);
  const { rows, erro } = parsed;

  const carregarArquivo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const nome = (f.name || "").toLowerCase();
    setAba(nome.endsWith(".json") ? "json" : "csv");
    const reader = new FileReader();
    reader.onload = () => setTexto(String(reader.result || ""));
    reader.readAsText(f, "utf-8");
  };

  const importar = async () => {
    if (!rows.length) return;
    setImportando(true);
    try {
      const r = await onImport(rows);
      setResultado(r);
    } catch (err) {
      setResultado({ criados: 0, atualizados: 0, erros: [{ linha: 0, msg: err.message }], categorias_criadas: [] });
    } finally {
      setImportando(false);
    }
  };

  const exemploJSON = JSON.stringify([
    { codigo: "PX001", codigo_barras: "7891234567890", nome: "Filé de Tilápia", categoria: "Peixes", preco: 45.00, custo: 28, um: "kg", ncm: "03038900", cest: "", estoque_inicial: 15, pertence_estoque: true },
    { codigo: "PX002", nome: "Camarão VG", categoria: "Frutos do mar", preco: 89.90, um: "kg", estoque_inicial: 3.5, pertence_estoque: true },
    { nome: "Refrigerante 2L", categoria: "Bebidas", preco: 12, um: "un" },
  ], null, 2);
  const exemploCSV = "codigo,codigo_barras,nome,categoria,preco,custo,um,ncm,cest,estoque_inicial,pertence_estoque\nPX001,7891234567890,Filé de Tilápia,Peixes,45.00,28,kg,03038900,,15,sim\nPX002,,Camarão VG,Frutos do mar,89.90,,kg,,,3.5,sim\n,,Refrigerante 2L,Bebidas,12,,un,,,,";

  const setExemplo = () => setTexto(aba === "json" ? exemploJSON : exemploCSV);

  const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "26px 28px", width: 780, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600 }}>Importar produtos</div>
            {cardapioNome && <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>Cardápio ativo: <b>{cardapioNome}</b></div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>×</button>
        </div>

        {/* Resultado da última importação */}
        {resultado && (
          <div style={{ marginTop: 12, background: resultado.erros?.length ? "#fffbeb" : "#f0fdf4", border: `1px solid ${resultado.erros?.length ? "#fde68a" : "#bbf7d0"}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: resultado.erros?.length ? "#92400e" : "#15803d" }}>
              {resultado.criados} criado(s) · {resultado.atualizados} atualizado(s)
              {resultado.erros?.length ? ` · ${resultado.erros.length} erro(s)` : ""}
            </div>
            {resultado.categorias_criadas?.length > 0 && (
              <div style={{ fontSize: 12, color: "#57534e", marginTop: 4 }}>Categorias novas: {resultado.categorias_criadas.join(", ")}</div>
            )}
            {resultado.erros?.length > 0 && (
              <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 12, color: "#dc2626" }}>
                {resultado.erros.slice(0, 10).map((e, i) => <li key={i}>Linha {e.linha}: {e.msg}</li>)}
                {resultado.erros.length > 10 && <li>... e mais {resultado.erros.length - 10}.</li>}
              </ul>
            )}
            <button onClick={onClose} style={{ marginTop: 10, padding: "8px 16px", background: "#15803d", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Fechar</button>
          </div>
        )}

        {!resultado && (
          <>
            <div style={{ fontSize: 12, color: "#78716c", marginTop: 10, marginBottom: 14 }}>
              Cole a lista em <b>JSON</b> ou <b>CSV</b>, ou carregue um arquivo. Campos aceitos: <b>nome</b>, <b>preco</b> (obrigatórios), codigo, codigo_barras (EAN), ncm, cest, um (un/kg/g/l/ml…), categoria, descricao, custo, estoque_inicial, estoque_minimo, pertence_estoque. Categorias novas na lista são criadas e vinculadas a este cardápio.
            </div>

            <div style={{ display: "flex", gap: 2, background: "#f5f5f4", borderRadius: 8, padding: 3, marginBottom: 10, width: "fit-content" }}>
              {[["json", "JSON"], ["csv", "CSV"]].map(([k, v]) => (
                <button key={k} onClick={() => setAba(k)}
                  style={{ padding: "6px 18px", borderRadius: 6, border: "none", background: aba === k ? "#fff" : "none", color: aba === k ? "#F38C24" : "#78716c", fontWeight: aba === k ? 700 : 500, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: aba === k ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
                  {v}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <button onClick={() => fileRef.current?.click()} style={{ padding: "8px 14px", background: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e", fontWeight: 500 }}>📄 Carregar arquivo</button>
              <button onClick={setExemplo} style={{ padding: "8px 14px", background: "#fff", border: "1px solid #e7e5e4", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#78716c" }}>Usar exemplo</button>
              <input ref={fileRef} type="file" accept=".csv,.json,.txt,text/csv,application/json,text/plain" onChange={carregarArquivo} style={{ display: "none" }} />
            </div>

            <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder={aba === "json" ? exemploJSON : exemploCSV}
              style={{ width: "100%", minHeight: 170, padding: "10px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "monospace", fontSize: 12, outline: "none", resize: "vertical", color: "#1c1917" }} />

            {texto && erro && (
              <div style={{ marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#dc2626" }}>{erro}</div>
            )}

            {rows.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#15803d", marginBottom: 6 }}>
                  {rows.length} produto(s) prontos para importar — prévia:
                </div>
                <div style={{ border: "1px solid #e7e5e4", borderRadius: 8, overflow: "auto", maxHeight: 240 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                    <thead><tr style={{ background: "#fafaf9" }}>
                      {["Nome", "Cat.", "Cód.", "EAN", "UM", "Preço", "CMV", "Estoq.", "Est?"].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10.5, color: "#78716c", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {rows.slice(0, 100).map((r, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #f5f5f4" }}>
                          <td style={{ padding: "5px 8px", fontWeight: 500, whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{r.nome}</td>
                          <td style={{ padding: "5px 8px", color: "#78716c" }}>{r.categoria || "—"}</td>
                          <td style={{ padding: "5px 8px", color: "#57534e", fontFamily: "monospace", fontSize: 10.5 }}>{r.codigo || "—"}</td>
                          <td style={{ padding: "5px 8px", color: "#57534e", fontFamily: "monospace", fontSize: 10.5 }}>{r.codigo_barras || "—"}</td>
                          <td style={{ padding: "5px 8px", color: "#78716c", textTransform: "uppercase" }}>{r.um || "un"}</td>
                          <td style={{ padding: "5px 8px", color: "#15803d", fontWeight: 600 }}>{fmt(r.preco)}</td>
                          <td style={{ padding: "5px 8px", color: "#78716c" }}>{r.custo ? fmt(r.custo) : "—"}</td>
                          <td style={{ padding: "5px 8px", color: "#57534e" }}>{isFinite(r.estoque_inicial) ? r.estoque_inicial : "—"}</td>
                          <td style={{ padding: "5px 8px" }}>{r.pertence_estoque ? "📦" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 100 && <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4 }}>Mostrando 100 de {rows.length}. Todos serão importados.</div>}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 11, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>Cancelar</button>
              <button onClick={importar} disabled={!rows.length || importando}
                style={{ flex: 2, padding: 11, background: "#F38C24", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: (!rows.length || importando) ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: (!rows.length || importando) ? 0.5 : 1 }}>
                {importando ? "Importando..." : `Importar ${rows.length || ""} produto(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
// cardapioAtivo: id do cardápio ativo (recebido do ProdutosApp). Se presente,
// filtra produtos pelas categorias desse cardápio e força a criação vinculada.
export default function Produtos({ cardapioAtivo, cardapioNome, cardapioTipo = "snack_bar", cardapio = null } = {}) {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [modalImport, setModalImport] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState("");
  const [busca, setBusca] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  const carregar = useCallback(async () => {
    try {
      const [prods, cats, ins] = await Promise.all([
        api.produtos.listar(),
        api.categorias.listar({ cardapio_id: cardapioAtivo }),
        api.insumos.listar(),
      ]);
      setProdutos(prods);
      setCategorias(cats);
      setInsumos(ins);
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, [cardapioAtivo]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (p) => {
    try {
      if (editando) {
        const atualizado = await api.produtos.atualizar(editando.id, { ...p });
        setProdutos(ps => ps.map(x => x.id === editando.id ? atualizado : x));
        showToast("Produto atualizado!");
        return atualizado;
      } else {
        const novo = await api.produtos.criar(p);
        setProdutos(ps => [...ps, novo]);
        showToast("Produto cadastrado!");
        return novo;
      }
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
      throw err;
    }
  };

  // Importação em lote — envia UM POST, o server valida/cria categorias/atualiza duplicados.
  // O modal usa o relatório retornado (criados/atualizados/erros) e mostra na tela.
  const importarProdutos = async (rows) => {
    const relatorio = await api.produtos.importar(rows, cardapioAtivo || undefined);
    // Recarrega a lista pra refletir criações/atualizações (evita casar por id em lote).
    try {
      const [prods, cats] = await Promise.all([
        api.produtos.listar(),
        api.categorias.listar({ cardapio_id: cardapioAtivo }),
      ]);
      setProdutos(prods);
      setCategorias(cats);
    } catch {}
    const cor = relatorio.erros?.length ? "#d97706" : "#14532d";
    showToast(`${relatorio.criados} criado(s), ${relatorio.atualizados} atualizado(s)${relatorio.erros?.length ? `, ${relatorio.erros.length} erro(s)` : ""}.`, cor);
    return relatorio;
  };

  // Chamado pela ficha técnica após salvar composição (já atualizou CMV no servidor)
  const fichaSalva = (produto) => {
    setProdutos(ps => ps.map(x => x.id === produto.id ? produto : x));
    showToast("Ficha técnica salva! CMV atualizado.");
  };

  const excluir = async (id) => {
    try {
      await api.produtos.excluir(id);
      setProdutos(ps => ps.filter(p => p.id !== id));
      setConfirmDel(null);
      showToast("Produto excluído.", "#7c3aed");
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
    }
  };

  // Não mostra promoções na aba de produtos — promoções vivem em sua própria sub-aba
  const produtosSemPromo = produtos.filter(p => !p.eh_promocao);

  // Só produtos cujo campo "categoria" (nome) está nas categorias do cardápio ativo
  const nomesCatDoCardapio = new Set(categorias.map(c => c.nome));
  const produtosDoCardapio = cardapioAtivo
    ? produtosSemPromo.filter(p => nomesCatDoCardapio.has(p.categoria))
    : produtosSemPromo;

  const filtrados = produtosDoCardapio.filter(p =>
    !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.categoria || "").toLowerCase().includes(busca.toLowerCase())
  );

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando produtos...</div>;

  return (
    <div className="anim">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600 }}>Produtos {cardapioNome ? `— ${cardapioNome}` : ""}</div>
          <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 2 }}>{produtosDoCardapio.length} produto{produtosDoCardapio.length !== 1 ? "s" : ""} neste cardápio</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
          <input className="search" placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: 0, width: "100%" }} />
          <button className="btn-add" onClick={() => setModalImport(true)} style={{ background: "#fff", color: "#57534e", border: "1.5px solid #e7e5e4", flex: "0 0 auto" }}>
            ⬆ Importar produtos
          </button>
          <button className="btn-add" onClick={() => { setEditando(null); setModal(true); }} style={{ background: "#F38C24", flex: "0 0 auto" }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Novo produto
          </button>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
          {produtos.length === 0 ? "Nenhum produto cadastrado. Comece adicionando seu primeiro produto." : "Nenhum produto encontrado para a busca."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {filtrados.map(p => (
            <div key={p.id} className="card" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
                <SlideshowAdminCard produtoId={p.id} imagemLegada={p.imagem} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: p.categoria === "Lanches" ? "#7B4532" : "#1c1917" }}>{p.nome}</div>
                    <span style={{ background: p.disponivel ? "#dcfce7" : "#fee2e2", color: p.disponivel ? "#15803d" : "#dc2626", padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                      {p.disponivel ? "Disponível" : "Indisponível"}
                    </span>
                  </div>
                  {p.categoria && <span style={{ fontSize: 10, color: "#78716c", background: "#f5f5f4", padding: "2px 8px", borderRadius: 4, marginTop: 4, display: "inline-block" }}>{p.categoria}</span>}
                  {p.descricao && <div style={{ fontSize: 12, color: "#78716c", marginTop: 4 }}>{p.descricao}</div>}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  {(() => {
                    const pe = precoExibicao(p);
                    const ts = tamanhosDoProduto(p);
                    return (
                      <>
                        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600, color: "#15803d" }}>
                          {pe.aPartirDe && <span style={{ fontSize: 11, fontWeight: 500, color: "#78716c" }}>a partir de </span>}
                          {fmt(pe.preco)}
                        </div>
                        {ts.length > 0 && <div style={{ fontSize: 10, color: "#2563eb", fontWeight: 600 }}>{ts.length} tamanho{ts.length > 1 ? "s" : ""}</div>}
                      </>
                    );
                  })()}
                  {p.custo > 0 && <div style={{ fontSize: 11, color: "#a8a29e" }}>CMV: {fmt(p.custo)}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="icon-btn" onClick={() => { setEditando(p); setModal(true); }}>✎ Editar</button>
                  <button className="icon-btn del" onClick={() => setConfirmDel(p.id)}>✕ Excluir</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <ModalProduto onSave={salvar} onFichaSalva={fichaSalva} onClose={() => { setModal(false); setEditando(null); }} editando={editando} categorias={categorias} insumos={insumos} cardapioTipo={cardapioTipo} cardapio={cardapio} />}
      {modalImport && <ModalImportarProdutos onImport={importarProdutos} onClose={() => setModalImport(false)} cardapioNome={cardapioNome} />}

      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConfirmDel(null)}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "26px 28px", width: 360 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Excluir produto?</div>
            <div style={{ fontSize: 13, color: "#78716c", marginBottom: 22 }}>Essa ação não pode ser desfeita.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDel(null)} style={{ flex: 1, padding: 10, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
              <button onClick={() => excluir(confirmDel)} style={{ flex: 1, padding: 10, background: "#dc2626", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}

export { ImagemProduto };
