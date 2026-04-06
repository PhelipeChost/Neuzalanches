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

// ─── MODAL PRODUTO ────────────────────────────────────────────────────────────
function ModalProduto({ onSave, onClose, editando, categorias }) {
  const [form, setForm] = useState(editando || { nome: "", descricao: "", preco: "", custo: "", categoria: "", imagem: "", disponivel: true });
  const [salvando, setSalvando] = useState(false);
  const [previewImg, setPreviewImg] = useState(editando?.imagem || "");
  const fileRef = useRef(null);

  const handleImagem = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const comprimida = await comprimirImagem(file);
    setPreviewImg(comprimida);
    setForm({ ...form, imagem: comprimida });
  };

  const removerImagem = () => {
    setPreviewImg("");
    setForm({ ...form, imagem: "" });
    if (fileRef.current) fileRef.current.value = "";
  };

  const salvar = async () => {
    if (!form.nome || !form.preco) return;
    setSalvando(true);
    try {
      await onSave({ ...form, preco: parseFloat(form.preco), custo: parseFloat(form.custo) || 0, disponivel: form.disponivel });
      onClose();
    } catch {
      setSalvando(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", width: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600 }}>{editando ? "Editar" : "Novo"} Produto</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#a8a29e" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Foto do produto */}
          <div>
            <label style={lbl}>Foto do produto</label>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {previewImg ? (
                <img src={previewImg} alt="Preview" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 10, border: "1px solid #e7e5e4" }} />
              ) : (
                <div style={{ width: 90, height: 90, background: "#fafaf9", borderRadius: 10, border: "2px dashed #d6d3d1", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 24 }}>📷</span>
                  <span style={{ fontSize: 10, color: "#a8a29e" }}>Sem foto</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button type="button" onClick={() => fileRef.current?.click()}
                  style={{ padding: "7px 14px", background: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e", fontWeight: 500 }}>
                  {previewImg ? "Trocar foto" : "Selecionar foto"}
                </button>
                {previewImg && (
                  <button type="button" onClick={removerImagem}
                    style={{ padding: "5px 14px", background: "none", border: "1px solid #fecaca", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#dc2626" }}>
                    Remover
                  </button>
                )}
                <span style={{ fontSize: 10, color: "#a8a29e" }}>JPG, PNG — comprimida automaticamente</span>
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImagem} style={{ display: "none" }} />
            </div>
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
              <label style={lbl}>Custo de produção — CMV (R$)</label>
              <input style={inp} type="number" step="0.01" value={form.custo} onChange={e => setForm({ ...form, custo: e.target.value })} placeholder="0,00" />
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

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#57534e" }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ flex: 2, padding: 11, background: "#15803d", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: salvando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", opacity: salvando ? 0.7 : 1 }}>
            {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar produto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function Produtos() {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState("");
  const [busca, setBusca] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  const carregar = useCallback(async () => {
    try {
      const [prods, cats] = await Promise.all([
        api.produtos.listar(),
        api.categorias.listar(),
      ]);
      setProdutos(prods);
      setCategorias(cats);
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
        const atualizado = await api.produtos.atualizar(p.id, p);
        setProdutos(ps => ps.map(x => x.id === p.id ? atualizado : x));
        showToast("Produto atualizado!");
      } else {
        const novo = await api.produtos.criar(p);
        setProdutos(ps => [...ps, novo]);
        showToast("Produto cadastrado!");
      }
      setEditando(null);
    } catch (err) {
      showToast("Erro: " + err.message, "#dc2626");
      throw err;
    }
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
                <ImagemProduto src={p.imagem} tamanho={72} borderRadius={10} />
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

      {modal && <ModalProduto onSave={salvar} onClose={() => { setModal(false); setEditando(null); }} editando={editando} categorias={categorias} />}

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
