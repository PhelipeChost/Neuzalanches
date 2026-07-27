// ─── Cliente SSE do backend local (real-time push) ──────────────────────────
// Escuta /api/events (rota pública em localhost/LAN — server responde só o
// TIPO da mudança, dados sensíveis o front puxa via GET autenticado depois).
// EventSource nativo do browser reconecta sozinho em caso de queda.
//
// Uso:
//   const parar = conectarEventosSync({
//     comanda: () => carregarComandas(),
//     pedido: () => carregarPedidos(),
//     mesa: () => carregarMesas(),
//   });
//   // depois: parar();
import { API_URL } from "./api";

export function conectarEventosSync(handlers = {}) {
  if (typeof window === "undefined" || !window.EventSource) return () => {};

  // Cache-buster no query pra evitar cache agressivo de proxy/browser
  const es = new EventSource(`${API_URL}/events?_=${Date.now()}`);

  const on = (evt, fn) => {
    if (typeof fn !== "function") return;
    es.addEventListener(evt, (e) => {
      let data = null;
      try { data = e.data ? JSON.parse(e.data) : null; } catch { /* payload pode vir vazio */ }
      try { fn(data); } catch { /* handler não deve derrubar SSE */ }
    });
  };

  on("comanda", handlers.comanda);
  on("pedido", handlers.pedido);
  on("mesa", handlers.mesa);

  // Erros: EventSource reconecta sozinho (segue o retry: enviado pelo server).
  // Não logamos pra não poluir console com transient errors.
  es.onerror = () => { /* browser retry automático */ };

  return () => { try { es.close(); } catch {} };
}
