import { useState, useEffect, useCallback } from "react";
import { api } from "./api";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── INSUMOS (somente leitura) ────────────────────────────────────────────────
// A partir da unificação, os insumos SÃO os itens do Estoque. O cadastro e a
// edição acontecem em Estoque → Itens. Aqui é só a visão de custo p/ ficha técnica.
export default function Insumos({ onIrParaEstoque }) {
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [busca, setBusca] = useState("");

  const showToast = (msg, cor = "#14532d") => { setToast({ msg, cor }); setTimeout(() => setToast(""), 2500); };

  const carregar = useCallback(async () => {
    try {
      setInsumos(await api.insumos.listar());
    } catch (err) {
      showToast("Erro ao carregar insumos: " + err.message, "#dc2626");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = insumos.filter(i =>
    i.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (i.unidade || "").toLowerCase().includes(busca.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <div style={{ color: "#a8a29e", fontSize: 13 }}>Carregando insumos...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px" }} className="anim">

      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Insumos (ficha técnica)</div>
          <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 3 }}>
            Os insumos são os próprios itens do Estoque. O custo abaixo é usado para calcular o CMV dos produtos.
          </div>
        </div>
      </div>

      {/* Aviso de unificação */}
      <div style={{ marginBottom: 16, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", fontSize: 12.5, color: "#1e40af", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span>📦 Para <strong>cadastrar ou editar</strong> um insumo, use <strong>Estoque → Itens</strong>. Tudo que entra no estoque vira insumo automaticamente.</span>
        {onIrParaEstoque && (
          <button onClick={onIrParaEstoque}
            style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>
            Ir para Estoque →
          </button>
        )}
      </div>

      {/* Busca */}
      <div style={{ marginBottom: 16 }}>
        <input className="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar insumo..." />
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "#a8a29e" }}>
          {busca ? "Nenhum insumo encontrado." : "Nenhum item no estoque ainda. Cadastre em Estoque → Itens."}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafaf9", borderBottom: "1px solid #e7e5e4" }}>
                <th style={{ padding: "10px 18px", textAlign: "left", fontWeight: 600, color: "#57534e", fontSize: 11, letterSpacing: "0.05em" }}>INSUMO</th>
                <th style={{ padding: "10px 18px", textAlign: "center", fontWeight: 600, color: "#57534e", fontSize: 11, letterSpacing: "0.05em" }}>UNIDADE</th>
                <th style={{ padding: "10px 18px", textAlign: "right", fontWeight: 600, color: "#57534e", fontSize: 11, letterSpacing: "0.05em" }}>SALDO</th>
                <th style={{ padding: "10px 18px", textAlign: "right", fontWeight: 600, color: "#57534e", fontSize: 11, letterSpacing: "0.05em" }}>CUSTO / UNIDADE</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((ins, idx) => {
                const fonteMedio = Number(ins.custo_medio) > 0;
                return (
                  <tr key={ins.id} style={{ borderBottom: idx < filtrados.length - 1 ? "1px solid #f5f5f4" : "none" }}>
                    <td style={{ padding: "12px 18px", fontWeight: 500, color: "#1c1917" }}>{ins.nome}</td>
                    <td style={{ padding: "12px 18px", textAlign: "center" }}>
                      <span style={{ background: "#f5f5f4", color: "#57534e", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{ins.unidade}</span>
                    </td>
                    <td style={{ padding: "12px 18px", textAlign: "right", fontFamily: "'Inter', sans-serif", color: "#57534e" }}>
                      {Number(ins.saldo_atual || 0).toLocaleString("pt-BR")}
                    </td>
                    <td style={{ padding: "12px 18px", textAlign: "right", fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#15803d" }}>
                      {fmt(ins.preco_unitario)}
                      <div style={{ fontSize: 10, fontWeight: 500, color: "#a8a29e", marginTop: 2 }}>
                        {fonteMedio ? "custo médio (entradas)" : "custo de referência"}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Info CMV */}
      {insumos.length > 0 && (
        <div style={{ marginTop: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#15803d" }}>
          💡 O custo usado no CMV é o <strong>custo médio</strong> calculado pelas entradas do estoque. Se um item ainda
          não tem entradas, vale o <strong>custo de referência</strong> definido no cadastro do item (Estoque → Itens).
          Para montar a ficha técnica de um produto: <strong>Produtos → editar → Ficha Técnica</strong>.
        </div>
      )}

      {toast && <div className="toast" style={{ background: toast.cor || "#14532d" }}>{toast.msg}</div>}
    </div>
  );
}
