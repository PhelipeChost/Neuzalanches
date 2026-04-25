import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";

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
function ModalProduto({ onSave, onFichaSalva, onClose, editando, categorias, insumos }) {
  const [form, setForm] = useState(editando || { nome: "", descricao: "", preco: "", custo: "", categoria: "", imagem: "", disponivel: true });
  const [salvando, setSalvando] = useState(false);
  const fileRef = useRef(null);
  const [abaModal, setAbaModal] = useState("produto"); // "produto" | "ficha"
  const [composicao, setComposicao] = useState([]);
  const [loadingComposicao, setLoadingComposicao] = useState(false);
  const [insumoSel, setInsumoSel] = useState("");
  const [qtdInsumo, setQtdInsumo] = useState("");

  // ── Múltiplas fotos ──────────────────────────────────────────────────────────
  const [imagens, setImagens] = useState([]); // [{ id, imagem, ordem }]
  const [loadingImagens, setLoadingImagens] = useState(false);
  const [slideFotoIdx, setSlideFotoIdx] = useState(0);

  // Carregar imagens ao abrir (editando)
  useEffect(() => {
    if (editando?.id) {
      setLoadingImagens(true);
      api.produtos.imagens.listar(editando.id)
        .then(imgs => {
          // Se não há imagens na tabela mas tem imagem legada, mostra ela
          if (imgs.length === 0 && editando.imagem) {
            setImagens([{ id: "__legado__", imagem: editando.imagem, ordem: 0 }]);
          } else {
            setImagens(imgs);
          }
          setSlideFotoIdx(0);
        })
        .catch(() => {})
        .finally(() => setLoadingImagens(false));
    }
  }, [editando?.id]);

  const adicionarFotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const novas = await Promise.all(files.map(f => comprimirImagem(f)));

    if (!editando?.id) {
      // Produto novo: apenas preview local (salvar depois)
      const locais = novas.map((img, i) => ({ id: `__local__${Date.now()}_${i}`, imagem: img, ordem: imagens.length + i }));
      const lista = [...imagens, ...locais];
      setImagens(lista);
      // Primeira foto vai para form.imagem
      if (!form.imagem) setForm(f => ({ ...f, imagem: lista[0].imagem }));
    } else {
      // Produto existente: salvar direto
      const ordem = imagens.length;
      const salvas = await Promise.all(
        novas.map((img, i) => api.produtos.imagens.adicionar(editando.id, img, ordem + i))
      );
      const lista = [...imagens, ...salvas];
      setImagens(lista);
      // Atualiza imagem principal se ainda vazia
      if (!form.imagem || imagens.length === 0) {
        const updated = { ...form, imagem: novas[0] };
        setForm(updated);
        await api.produtos.atualizar(editando.id, { ...updated, preco: parseFloat(updated.preco), custo: parseFloat(updated.custo) || 0 });
      }
    }
    setSlideFotoIdx(imagens.length);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removerFoto = async (img) => {
    if (img.id.startsWith("__local__") || img.id === "__legado__") {
      const lista = imagens.filter(i => i.id !== img.id);
      setImagens(lista);
      setForm(f => ({ ...f, imagem: lista[0]?.imagem || "" }));
      setSlideFotoIdx(0);
      return;
    }
    await api.produtos.imagens.remover(editando.id, img.id);
    const lista = imagens.filter(i => i.id !== img.id);
    setImagens(lista);
    const novaImagem = lista[0]?.imagem || "";
    setForm(f => ({ ...f, imagem: novaImagem }));
    if (editando?.id) {
      await api.produtos.atualizar(editando.id, { ...form, imagem: novaImagem, preco: parseFloat(form.preco), custo: parseFloat(form.custo) || 0 });
    }
    setSlideFotoIdx(Math.max(0, slideFotoIdx - 1));
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
    if (!form.nome || !form.preco) return;
    setSalvando(true);
    try {
      const primeiraImg = imagens[0]?.imagem || form.imagem || "";
      const produto = await onSave({ ...form, imagem: primeiraImg, preco: parseFloat(form.preco), custo: parseFloat(form.custo) || 0, disponivel: form.disponivel });
      // Salvar imagens locais do produto novo
      if (produto?.id && imagens.some(i => i.id.startsWith("__local__"))) {
        const locais = imagens.filter(i => i.id.startsWith("__local__"));
        await Promise.all(locais.map((img, i) => api.produtos.imagens.adicionar(produto.id, img.imagem, i)));
      }
      onClose();
    } catch {
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

        {/* Abas — só mostra Ficha Técnica se está editando */}
        {editando && (
          <div style={{ display: "flex", gap: 2, background: "#f5f5f4", borderRadius: 8, padding: 3, marginBottom: 20 }}>
            {[["produto", "Produto"], ["ficha", "Ficha Técnica"]].map(([k, v]) => (
              <button key={k} onClick={() => setAbaModal(k)}
                style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", background: abaModal === k ? "#fff" : "none", color: abaModal === k ? "#15803d" : "#78716c", fontWeight: abaModal === k ? 600 : 400, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: abaModal === k ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
                {v}
              </button>
            ))}
          </div>
        )}

        {/* ─── ABA: PRODUTO ─── */}
        {abaModal === "produto" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* ── Fotos do produto (múltiplas) ── */}
            <div>
              <label style={{ ...lbl, marginBottom: 8 }}>
                Fotos do produto
                <span style={{ marginLeft: 6, fontWeight: 400, color: "#a8a29e" }}>({imagens.length}/10)</span>
              </label>

              {/* Slideshow de preview */}
              {imagens.length > 0 && (
                <div style={{ position: "relative", width: "100%", height: 180, borderRadius: 10, overflow: "hidden", marginBottom: 10, background: "#f5f5f4" }}>
                  <img src={imagens[slideFotoIdx]?.imagem} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {imagens.length > 1 && (
                    <>
                      <button onClick={() => setSlideFotoIdx(i => (i - 1 + imagens.length) % imagens.length)}
                        style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 30, height: 30, fontSize: 16, cursor: "pointer" }}>‹</button>
                      <button onClick={() => setSlideFotoIdx(i => (i + 1) % imagens.length)}
                        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 30, height: 30, fontSize: 16, cursor: "pointer" }}>›</button>
                      <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
                        {imagens.map((_, i) => (
                          <div key={i} onClick={() => setSlideFotoIdx(i)}
                            style={{ width: 7, height: 7, borderRadius: "50%", background: i === slideFotoIdx ? "#fff" : "rgba(255,255,255,0.5)", cursor: "pointer", border: "1px solid rgba(255,255,255,0.6)" }} />
                        ))}
                      </div>
                    </>
                  )}
                  {/* Badge da foto atual */}
                  <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 10 }}>
                    {slideFotoIdx + 1}/{imagens.length}
                  </div>
                </div>
              )}

              {/* Grade de miniaturas */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {imagens.map((img, i) => (
                  <div key={img.id} onClick={() => setSlideFotoIdx(i)}
                    style={{ position: "relative", width: 56, height: 56, borderRadius: 8, overflow: "hidden", cursor: "pointer", border: i === slideFotoIdx ? "2px solid #15803d" : "2px solid #e7e5e4", flexShrink: 0 }}>
                    <img src={img.imagem} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {i === 0 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(21,128,61,0.85)", fontSize: 8, color: "#fff", textAlign: "center", padding: "1px 0", fontWeight: 600 }}>PRINCIPAL</div>}
                    <button type="button" onClick={e => { e.stopPropagation(); removerFoto(img); }}
                      style={{ position: "absolute", top: 1, right: 1, background: "rgba(220,38,38,0.85)", border: "none", borderRadius: "50%", width: 16, height: 16, color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                  </div>
                ))}
                {/* Botão adicionar */}
                {imagens.length < 10 && (
                  <div onClick={() => fileRef.current?.click()}
                    style={{ width: 56, height: 56, borderRadius: 8, border: "2px dashed #d6d3d1", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, background: "#fafaf9", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 18, color: "#a8a29e" }}>+</span>
                    <span style={{ fontSize: 8, color: "#a8a29e" }}>foto</span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" onClick={() => fileRef.current?.click()}
                  style={{ padding: "7px 14px", background: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e", fontWeight: 500 }}>
                  + Adicionar foto(s)
                </button>
                <span style={{ fontSize: 10, color: "#a8a29e" }}>JPG, PNG — múltiplas permitidas</span>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={adicionarFotos} style={{ display: "none" }} />
            </div>
            <div>
              <label style={lbl}>Nome do produto</label>
              <input style={inp} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Hambúrguer artesanal" />
            </div>
            <div>
              <label style={lbl}>Descrição</label>
              <input style={inp} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Breve descrição do produto" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div>
                <label style={lbl}>Preço de venda (R$)</label>
                <input style={inp} type="number" step="0.01" value={form.preco} onChange={e => setForm({ ...form, preco: e.target.value })} placeholder="0,00" />
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
                  <button onClick={salvarFicha} disabled={salvando}
                    style={{ flex: 2, padding: 11, background: "#15803d", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: salvando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: salvando ? 0.7 : 1 }}>
                    {salvando ? "Salvando..." : "Salvar ficha técnica"}
                  </button>
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

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function Produtos() {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState("");
  const [busca, setBusca] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  const carregar = useCallback(async () => {
    try {
      const [prods, cats, ins] = await Promise.all([
        api.produtos.listar(),
        api.categorias.listar(),
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
  }, []);

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

  const filtrados = produtos.filter(p =>
    !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.categoria.toLowerCase().includes(busca.toLowerCase())
  );

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a8a29e" }}>Carregando produtos...</div>;

  return (
    <div className="anim">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 600 }}>Produtos</div>
          <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 2 }}>{produtos.length} produtos cadastrados</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
          <input className="search" placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: 0, width: "100%" }} />
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
                <SlideshowAdmin imagens={p._imagens || (p.imagem ? [{ id: "0", imagem: p.imagem }] : [])} />
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
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600, color: "#15803d" }}>{fmt(p.preco)}</div>
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

      {modal && <ModalProduto onSave={salvar} onFichaSalva={fichaSalva} onClose={() => { setModal(false); setEditando(null); }} editando={editando} categorias={categorias} insumos={insumos} />}

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
