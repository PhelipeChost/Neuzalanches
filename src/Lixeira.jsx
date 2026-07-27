import { useEffect, useState } from "react";
import { api } from "./api";

const ICONES = {
  lancamentos: "💰",
  pedidos: "🧾",
  produtos: "🍔",
  promocoes: "🔥",
  categorias: "🏷️",
  adicionais: "➕",
  custos_fixos: "📅",
  estoque_itens: "📦",
  fornecedores: "🚚",
};

function fmtData(s) {
  if (!s) return "";
  // SQLite datetime sem timezone — interpretar como UTC e mostrar local
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Lixeira() {
  const [grupos, setGrupos] = useState({});
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(null); // { tipo, id }

  async function carregar() {
    setLoading(true);
    try {
      const data = await api.lixeira.listar();
      setGrupos(data);
    } catch (e) {
      alert("Erro ao carregar lixeira: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function restaurar(tipo, id) {
    try {
      await api.lixeira.restaurar(tipo, id);
      await carregar();
    } catch (e) {
      alert("Não foi possível restaurar: " + e.message);
    }
  }

  async function excluirDefinitivo(tipo, id) {
    try {
      await api.lixeira.excluirDefinitivo(tipo, id);
      setConfirmandoExcluir(null);
      await carregar();
    } catch (e) {
      alert("Erro ao excluir: " + e.message);
    }
  }

  async function esvaziarLixeira() {
    if (!confirm("Excluir DEFINITIVAMENTE todos os itens da lixeira?\n\nEssa ação não pode ser desfeita — os itens não poderão mais ser restaurados.")) return;
    try {
      const r = await api.lixeira.esvaziar();
      await carregar();
      alert(`Lixeira esvaziada — ${r.total} ${r.total === 1 ? "item removido" : "itens removidos"}.`);
    } catch (e) {
      alert("Erro ao esvaziar: " + e.message);
    }
  }

  const tipos = Object.keys(grupos).filter(t => grupos[t].itens.length > 0);
  const totalItens = Object.values(grupos).reduce((s, g) => s + g.itens.length, 0);
  const tiposVisiveis = filtroTipo === "todos" ? tipos : tipos.filter(t => t === filtroTipo);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#1c1917", fontFamily: "'Inter', sans-serif" }}>
            🗑️ Lixeira
          </h1>
          <div style={{ fontSize: 13, color: "#78716c", marginTop: 4 }}>
            Itens excluídos da plataforma. Você pode restaurar ou excluir definitivamente.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#78716c" }}>Total:</span>
          <span style={{ background: "#f5f5f4", color: "#1c1917", padding: "4px 12px", borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
            {totalItens} {totalItens === 1 ? "item" : "itens"}
          </span>
          <button
            onClick={carregar}
            style={{ padding: "6px 12px", border: "1px solid #e7e5e4", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, color: "#57534e" }}
          >
            ↻ Atualizar
          </button>
          {totalItens > 0 && (
            <button
              onClick={esvaziarLixeira}
              style={{ padding: "6px 12px", border: "1px solid #fecaca", borderRadius: 6, background: "#fef2f2", cursor: "pointer", fontSize: 12, color: "#dc2626", fontWeight: 600 }}
            >
              🗑️ Limpar Lixeira
            </button>
          )}
        </div>
      </div>

      {/* Filtro de tipo */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        <button
          onClick={() => setFiltroTipo("todos")}
          style={{
            padding: "6px 14px", borderRadius: 8, border: "1px solid #e7e5e4",
            background: filtroTipo === "todos" ? "#1c1917" : "#fff",
            color: filtroTipo === "todos" ? "#fff" : "#57534e",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Todos ({totalItens})
        </button>
        {tipos.map(t => (
          <button
            key={t}
            onClick={() => setFiltroTipo(t)}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "1px solid #e7e5e4",
              background: filtroTipo === t ? "#1c1917" : "#fff",
              color: filtroTipo === t ? "#fff" : "#57534e",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            {ICONES[t] || "📁"} {grupos[t].label} ({grupos[t].itens.length})
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ padding: 40, textAlign: "center", color: "#78716c" }}>
          Carregando…
        </div>
      )}

      {!loading && totalItens === 0 && (
        <div style={{ padding: 60, textAlign: "center", color: "#78716c", background: "#fff", borderRadius: 12, border: "1px solid #e7e5e4" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1c1917" }}>Lixeira vazia</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Quando algo for excluído da plataforma, aparece aqui para você restaurar.</div>
        </div>
      )}

      {!loading && tiposVisiveis.map(tipo => {
        const grupo = grupos[tipo];
        return (
          <section key={tipo} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#57534e", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
              {ICONES[tipo] || "📁"} {grupo.label} — {grupo.itens.length}
            </h2>
            <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 12, overflow: "hidden" }}>
              {grupo.itens.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px",
                    borderBottom: idx < grupo.itens.length - 1 ? "1px solid #f5f5f4" : "none",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#1c1917" }}>{item.resumo}</div>
                    <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>{item.detalhe}</div>
                    <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4 }}>
                      Excluído em {fmtData(item.deleted_at)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => restaurar(tipo, item.id)}
                      style={{
                        padding: "6px 14px", border: "1px solid #15803d", borderRadius: 6,
                        background: "#f0fdf4", color: "#15803d", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      ↺ Restaurar
                    </button>
                    {confirmandoExcluir?.tipo === tipo && confirmandoExcluir?.id === item.id ? (
                      <>
                        <button
                          onClick={() => excluirDefinitivo(tipo, item.id)}
                          style={{
                            padding: "6px 14px", border: "1px solid #b91c1c", borderRadius: 6,
                            background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setConfirmandoExcluir(null)}
                          style={{
                            padding: "6px 10px", border: "1px solid #e7e5e4", borderRadius: 6,
                            background: "#fff", color: "#57534e", fontSize: 12, cursor: "pointer",
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmandoExcluir({ tipo, id: item.id })}
                        style={{
                          padding: "6px 14px", border: "1px solid #e7e5e4", borderRadius: 6,
                          background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        🗑 Excluir definitivamente
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {!loading && totalItens > 0 && filtroTipo !== "todos" && tiposVisiveis.length === 0 && (
        <div style={{ padding: 30, textAlign: "center", color: "#78716c", fontSize: 13 }}>
          Nenhum item desse tipo na lixeira.
        </div>
      )}
    </div>
  );
}
