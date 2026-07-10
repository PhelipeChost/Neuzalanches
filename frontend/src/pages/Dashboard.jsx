import { useEffect, useState } from "react";
import { api } from "../api";
import { s, cores, fmtBRL } from "../styles";

const METODO_LABEL = { dinheiro: "Dinheiro", pix: "Pix", credito: "Crédito", debito: "Débito", vale: "Vale" };

export default function Dashboard() {
  const [d, setD] = useState(null);

  useEffect(() => {
    api.dashboard().then(setD).catch(() => {});
    const iv = setInterval(() => api.dashboard().then(setD).catch(() => {}), 30000);
    return () => clearInterval(iv);
  }, []);

  if (!d) return <div style={{ padding: 50, textAlign: "center", color: cores.ink3 }}>Carregando...</div>;

  const Kpi = ({ label, value, sub, cor = cores.ink }) => (
    <div style={{ ...s.card, flex: "1 1 180px" }}>
      <div style={{ fontSize: 11, color: cores.ink2, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: cores.ink3, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={s.h1}>Resumo do dia</div>
        <div style={s.sub}>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <Kpi label="Caixa" value={d.caixa === "aberto" ? "🟢 Aberto" : "🔴 Fechado"} />
        <Kpi label="Vendas hoje" value={d.vendas_qtd} sub={`${fmtBRL(d.descontos)} em descontos`} cor={cores.azul} />
        <Kpi label="Faturamento hoje" value={fmtBRL(d.vendas_total)} cor={cores.verde} />
        <Kpi label="Estoque baixo" value={d.estoque_baixo} sub="produtos no mínimo" cor={d.estoque_baixo > 0 ? cores.ambar : cores.ink} />
        <Kpi label="Contas (3 dias)" value={d.contas_vencendo} sub="vencendo / vencidas" cor={d.contas_vencendo > 0 ? cores.vermelho : cores.ink} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>💳 Recebido por forma de pagamento</div>
          {d.por_metodo.length === 0
            ? <div style={{ color: cores.ink3, fontSize: 13 }}>Nenhuma venda hoje ainda.</div>
            : d.por_metodo.map(m => (
              <div key={m.method} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f5f5f4", fontSize: 13.5 }}>
                <span>{METODO_LABEL[m.method] || m.method}</span>
                <b>{fmtBRL(m.total)}</b>
              </div>
            ))}
        </div>

        <div style={s.card}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>🔥 Mais vendidos hoje</div>
          {d.top_produtos.length === 0
            ? <div style={{ color: cores.ink3, fontSize: 13 }}>Nenhuma venda hoje ainda.</div>
            : d.top_produtos.map((p, i) => (
              <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f5f5f4", fontSize: 13.5 }}>
                <span><b style={{ color: cores.ink3 }}>{i + 1}º</b> {p.name}</span>
                <span><b>{p.qtd}</b> · {fmtBRL(p.receita)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
