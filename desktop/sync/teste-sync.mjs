// Teste REAL do sync: 2 processos (VPS = filho, Desktop = este) com bancos
// separados. Prova: pedido do cardápio online aparece no desktop e vice-versa,
// e o status propaga (cozinha simultânea). Rodar: node desktop/sync/teste-sync.mjs
import { spawn } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { criarMotorSync, criarAuthVps } from "./motor.js";

const ROOT = "C:/Users/Felipe/Desktop/NEXO/Clientes/FRENTE DE CAIXA - PROTÓTIPO";
const VPS_PORT = 5401, DESK_PORT = 5402;
const ADMIN = { email: "reinonexusideal@gmail.com", senha: "31076hibridos" };
const dirVps = mkdtempSync(join(tmpdir(), "vps-"));
const dirDesk = mkdtempSync(join(tmpdir(), "desk-"));
const erros = [];
const ok = (n, c) => { if (!c) erros.push(n); else console.log("  ✓", n); };
let vps;

async function esperar(port) {
  const ate = Date.now() + 15000;
  for (;;) {
    try { const r = await fetch(`http://localhost:${port}/api/produtos`); if (r.ok) return; } catch {}
    if (Date.now() > ate) throw new Error("porta " + port + " não subiu");
    await new Promise(r => setTimeout(r, 300));
  }
}

try {
  // 1. VPS (processo filho, banco próprio)
  vps = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT, stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, PORT: String(VPS_PORT), FLUXO_DB_PATH: join(dirVps, "v.db"), JWT_SECRET: "sync-vps", NODE_ENV: "production", FLUXO_DIST_PATH: join(dirVps, "no-dist") },
  });
  await esperar(VPS_PORT);

  // 2. Desktop (este processo, banco próprio)
  process.env.PORT = String(DESK_PORT);
  process.env.FLUXO_DB_PATH = join(dirDesk, "d.db");
  process.env.JWT_SECRET = "sync-desk";
  process.env.NODE_ENV = "production";
  process.env.FLUXO_DIST_PATH = join(dirDesk, "no-dist");
  await import(pathToFileURL(join(ROOT, "server", "index.js")).href);
  const dbLocal = await import(pathToFileURL(join(ROOT, "server", "database.js")).href);
  await esperar(DESK_PORT);

  // 3. Pedido do CARDÁPIO ONLINE (na VPS, via endpoint público)
  const rOnline = await fetch(`http://localhost:${VPS_PORT}/api/pedidos/publico`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cliente_nome: "Cliente Online", cliente_telefone: "11999990000",
      itens: [{ produto_id: "X1", produto_nome: "X-Burger", quantidade: 1, preco_unitario: 20 }] }),
  });
  if (rOnline.status !== 201) { const t = await rOnline.text(); throw new Error("POST /api/pedidos/publico deu " + rOnline.status + ": " + t.slice(0, 120)); }
  const pedOnline = await rOnline.json();
  ok("pedido online criado na VPS", rOnline.status === 201 && pedOnline.id);

  // 4. Pedido PRESENCIAL (no desktop, direto no banco local)
  const pedDesk = dbLocal.criarPedido({ cliente_nome: "Mesa 3", cliente_telefone: "",
    itens: [{ produto_id: "Y1", produto_nome: "Refrigerante", quantidade: 2, preco_unitario: 6 }], tipo: "presencial" });
  ok("pedido presencial criado no desktop", !!pedDesk.id);

  // 5. Motor de sync desktop ↔ VPS
  const cur = { p: "1970-01-01T00:00:00", u: "1970-01-01T00:00:00",
    getPull() { return this.p; }, setPull(v) { this.p = v; }, getPush() { return this.u; }, setPush(v) { this.u = v; } };
  const vpsUrl = `http://localhost:${VPS_PORT}`;
  const sync = criarMotorSync({
    vpsUrl, obterToken: criarAuthVps({ vpsUrl, ...ADMIN }),
    local: { pedidosAlteradosDesde: dbLocal.pedidosAlteradosDesde, upsertPedidoSync: dbLocal.upsertPedidoSync },
    cursor: cur, log: () => {},
  });

  const r1 = await sync.tick();
  console.log(`  tick 1: ↓${r1.puxados} ↑${r1.enviados}`);

  // 6. Cozinha simultânea: os dois pedidos existem nos DOIS lados
  ok("desktop recebeu o pedido do cardápio online", !!dbLocal.buscarPedido(pedOnline.id));

  const auth = criarAuthVps({ vpsUrl, ...ADMIN });
  const puxarVps = async () => {
    const tk = await auth();
    const r = await fetch(`${vpsUrl}/api/sync/pull?desde=1970-01-01T00:00:00`, { headers: { Authorization: "Bearer " + tk } });
    return (await r.json()).pedidos;
  };
  let naVps = await puxarVps();
  ok("VPS recebeu o pedido presencial do desktop", naVps.some(p => p.id === pedDesk.id));

  // 7. Propagação de STATUS (o coração da cozinha): muda no desktop → VPS vê
  dbLocal.atualizarStatusPedido(pedDesk.id, "preparando");
  await sync.tick();
  naVps = await puxarVps();
  const noVps = naVps.find(p => p.id === pedDesk.id);
  ok("status 'preparando' propagou desktop → VPS", noVps && noVps.status === "preparando");

  // 8. Propagação de status VPS → desktop (muda o online na VPS)
  const tk = await auth();
  await fetch(`${vpsUrl}/api/pedidos/${pedOnline.id}/status`, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
    body: JSON.stringify({ status: "pronto" }),
  });
  await new Promise(r => setTimeout(r, 1100)); // updated_at tem resolução de 1s
  await sync.tick();
  const onlineNoDesk = dbLocal.buscarPedido(pedOnline.id);
  ok("status 'pronto' propagou VPS → desktop", onlineNoDesk && onlineNoDesk.status === "pronto");

  if (erros.length) { console.log("\nFALHOU:"); erros.forEach(e => console.log(" ✗", e)); process.exitCode = 1; }
  else console.log("\nSYNC OK — cozinha simultânea local ↔ VPS funcionando (criação e status, nos dois sentidos).");
} catch (e) {
  console.log("ERRO:", e.stack || e.message); process.exitCode = 1;
} finally {
  try { vps && vps.kill(); } catch {}
  try { rmSync(dirVps, { recursive: true, force: true }); } catch {}
  try { rmSync(dirDesk, { recursive: true, force: true }); } catch {}
  setTimeout(() => process.exit(process.exitCode || 0), 300);
}
