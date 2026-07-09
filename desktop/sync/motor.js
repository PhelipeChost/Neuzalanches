// ─── Motor de sincronização (cozinha simultânea local ↔ nuvem) ───────────────
// Desenho com injeção de dependência para ser 100% testável:
//   local   = { pedidosAlteradosDesde, upsertPedidoSync }  (banco do desktop)
//   obterToken = async () => JWT válido da VPS
//   cursor  = { getPull/setPull/getPush/setPush }  (persistido em userData)
//
// A cada tick: PULL (baixa pedidos novos/alterados da VPS → upsert local) e
// PUSH (sobe pedidos locais novos/alterados → VPS). Idempotente, last-write-wins.
export function criarMotorSync({ vpsUrl, obterToken, local, cursor, log = () => {} }) {
  const base = String(vpsUrl || "").replace(/\/+$/, "");
  let rodando = false, timer = null, ultimoEstado = "parado";

  async function req(path, opts = {}) {
    const token = await obterToken();
    const r = await fetch(base + path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(opts.headers || {}) },
    });
    if (!r.ok) throw new Error("VPS HTTP " + r.status);
    return r.json();
  }

  async function pull() {
    const desde = cursor.getPull() || "1970-01-01T00:00:00";
    const { pedidos = [], cursor: novo } = await req("/api/sync/pull?desde=" + encodeURIComponent(desde));
    for (const p of pedidos) local.upsertPedidoSync(p);
    if (novo && novo > desde) cursor.setPull(novo);
    return pedidos.length;
  }

  async function push() {
    const desde = cursor.getPush() || "1970-01-01T00:00:00";
    const pedidos = local.pedidosAlteradosDesde(desde);
    if (pedidos.length === 0) return 0;
    await req("/api/sync/push", { method: "POST", body: JSON.stringify({ pedidos }) });
    const novo = pedidos.reduce((m, p) => { const t = p.updated_at || p.created_at || ""; return t > m ? t : m; }, desde);
    if (novo > desde) cursor.setPush(novo);
    return pedidos.length;
  }

  async function tick() {
    const puxados = await pull();
    const enviados = await push();
    ultimoEstado = "online";
    return { puxados, enviados };
  }

  return {
    tick,
    estado: () => ultimoEstado,
    start(intervaloMs = 4000) {
      if (rodando) return;
      rodando = true;
      const loop = async () => {
        if (!rodando) return;
        try { const r = await tick(); log(`sync ok (↓${r.puxados} ↑${r.enviados})`); }
        catch (e) { ultimoEstado = "offline"; log("sync offline: " + e.message); }
        if (rodando) timer = setTimeout(loop, intervaloMs);
      };
      loop();
    },
    stop() { rodando = false; if (timer) clearTimeout(timer); ultimoEstado = "parado"; },
  };
}

// Autenticação na VPS: usa token permanente de sincronização (preferencial)
// ou faz login e mantém o JWT em cache (fallback para compat).
export function criarAuthVps({ vpsUrl, email, senha, syncToken }) {
  const base = String(vpsUrl || "").replace(/\/+$/, "");
  if (syncToken) return async () => syncToken;
  let token = null;
  return async function obterToken() {
    if (token) return token;
    const r = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    if (!r.ok) throw new Error("login VPS falhou (" + r.status + ")");
    const j = await r.json();
    token = j.token;
    return token;
  };
}
