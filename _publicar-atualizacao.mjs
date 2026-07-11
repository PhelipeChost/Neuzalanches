// ─── Publicar uma atualização do Nexus PDV ───────────────────────────────────
// Fluxo do dono (Nexus):
//   1. Edite a "version" em desktop/package.json (ex.: 1.0.0 -> 1.0.1)
//   2. Rode: node _publicar-atualizacao.mjs
// O script builda o instalador e sobe os 3 arquivos do auto-update para a VPS.
// Os clientes recebem a atualização sozinhos ao abrir o programa.
//
// Cada build usa uma pasta de saída NOVA (dist-build-<timestamp>): o Windows
// (indexador/antivírus) costuma prender o app.asar de builds antigos e o
// electron-builder falha ao tentar limpar a pasta ("arquivo em uso").
//
// Flags:  --no-build   sobe o build mais recente já existente (não rebuilda)
import { spawnSync } from "child_process";
import { Client } from "ssh2";
import { readFileSync, existsSync, statSync, createReadStream, readdirSync } from "fs";
import { join } from "path";

const HOST = "177.153.62.21", USER = "root", PASS = "A@Xn8felipe";
const REMOTE = "/var/www/prototipocompleto/updates";
const DESKTOP = "desktop";

const pkg = JSON.parse(readFileSync(join(DESKTOP, "package.json"), "utf8"));
const version = pkg.version;
const exe = `NexusPDV-Setup-${version}.exe`;
// Ordem importa: sobe o .exe e o blockmap PRIMEIRO, e o latest.yml POR ÚLTIMO —
// assim o cliente nunca vê um manifesto apontando para um arquivo que ainda não subiu.
const arquivos = [exe, `${exe}.blockmap`, "latest.yml"];

function acharBuildMaisRecente() {
  const dirs = readdirSync(DESKTOP)
    .filter(d => d.startsWith("dist-build-") && existsSync(join(DESKTOP, d, exe)))
    .sort();
  return dirs.length ? join(DESKTOP, dirs[dirs.length - 1]) : null;
}

async function main() {
  console.log(`\n╔══ Publicar Nexus PDV v${version} ══╗\n`);

  let DIST;
  if (process.argv.includes("--no-build")) {
    DIST = acharBuildMaisRecente();
    if (!DIST) { console.error(`✗ Nenhum build existente com ${exe}. Rode sem --no-build.`); process.exit(1); }
    console.log(`→ Usando build existente: ${DIST}\n`);
  } else {
    const OUT = `dist-build-${Date.now()}`;
    DIST = join(DESKTOP, OUT);

    // Recompilar better-sqlite3 para o ABI do Electron (o Node.js do sistema
    // pode ser uma versão diferente — ex.: Node 24 = MODULE_VERSION 137 vs
    // Electron 33/Node 22 = MODULE_VERSION 130).
    // Usa prebuild-install para baixar o binário pré-compilado correto.
    const electronVer = JSON.parse(readFileSync(join(DESKTOP, "node_modules/electron/package.json"), "utf8")).version;
    console.log(`→ Baixando better-sqlite3 para Electron ${electronVer}…\n`);
    const rb = spawnSync("npx", ["prebuild-install", "--runtime=electron", `--target=${electronVer}`, "--arch=x64", "--tag-prefix=v"],
      { cwd: join(process.cwd(), "node_modules", "better-sqlite3"), stdio: "inherit", shell: true });
    if (rb.status !== 0) { console.error("\n✗ prebuild-install falhou."); process.exit(1); }

    // 🔧 CRÍTICO: buildar o frontend antes do electron-builder — senão o
    // app-dist/ empacotado fica do build anterior (bug: v1.4.x foi publicado
    // com React antigo). VITE_DESKTOP=1 pra pegar as flags corretas.
    console.log("\n→ Buildando o frontend (Vite → desktop/app-dist)…\n");
    const fe = spawnSync("npx",
      ["vite", "build", "--base=/", "--outDir", "desktop/app-dist", "--emptyOutDir"],
      { stdio: "inherit", shell: true, env: { ...process.env, VITE_DESKTOP: "1", MSYS_NO_PATHCONV: "1" } });
    if (fe.status !== 0) { console.error("\n✗ Build do frontend falhou."); process.exit(1); }

    // Frontend do PDV Mercado (2º stack) — entra no instalador como frontend-dist
    console.log("\n→ Buildando o frontend do Mercado (frontend/ → frontend/dist)…\n");
    const fm = spawnSync("npx", ["vite", "build"],
      { cwd: join(process.cwd(), "frontend"), stdio: "inherit", shell: true, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
    if (fm.status !== 0) { console.error("\n✗ Build do frontend Mercado falhou."); process.exit(1); }

    console.log(`\n→ Buildando instalador em ${OUT}… isso leva alguns minutos.\n`);
    const r = spawnSync("npx", ["electron-builder", `-c.directories.output=${OUT}`],
      { cwd: DESKTOP, stdio: "inherit", shell: true });

    // Recompila better-sqlite3 de volta para o Node.js do sistema (senão o server
    // de dev local quebra).
    console.log("\n→ Restaurando better-sqlite3 para o Node.js do sistema…");
    spawnSync("npx", ["prebuild-install", "--tag-prefix=v"],
      { cwd: join(process.cwd(), "node_modules", "better-sqlite3"), stdio: "inherit", shell: true });

    if (r.status !== 0) { console.error("\n✗ Build falhou. Nada foi publicado."); process.exit(1); }
  }

  // Confere que os 3 artefatos existem
  for (const f of arquivos) {
    const p = join(DIST, f);
    if (!existsSync(p)) {
      console.error(`\n✗ Arquivo não encontrado: ${p}`);
      process.exit(1);
    }
  }

  const conn = new Client();
  await new Promise((res, rej) => { conn.on("ready", res).on("error", rej).connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30000 }); });
  const sftp = await new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s)));
  const sftpStat = (p) => new Promise((res, rej) => sftp.stat(p, (e, st) => e ? rej(e) : res(st)));

  await new Promise((res, rej) => conn.exec(`mkdir -p ${REMOTE}`, (e, st) => e ? rej(e) : st.on("close", res).resume()));

  for (const f of arquivos) {
    const local = join(DIST, f);
    const tamLocal = statSync(local).size;
    // Até 3 tentativas: uploads grandes já chegaram truncados sem erro do sftp.
    let ok = false;
    for (let tent = 1; tent <= 3 && !ok; tent++) {
      process.stdout.write(`→ Enviando ${f} (${(tamLocal / 1e6).toFixed(1)} MB)${tent > 1 ? ` [tentativa ${tent}]` : ""}… `);
      await new Promise((res, rej) => {
        const ws = sftp.createWriteStream(`${REMOTE}/${f}`);
        ws.on("close", res); ws.on("error", rej);
        createReadStream(local).pipe(ws);
      });
      const remoto = await sftpStat(`${REMOTE}/${f}`);
      if (remoto.size === tamLocal) { console.log("ok (íntegro)"); ok = true; }
      else console.log(`INCOMPLETO (${remoto.size}/${tamLocal} bytes) — reenviando`);
    }
    if (!ok) { console.error(`\n✗ ${f} não subiu íntegro após 3 tentativas.`); sftp.end(); conn.end(); process.exit(1); }
  }
  sftp.end(); conn.end();

  // Verifica que o manifesto ficou acessível publicamente
  const url = "https://reinonexusideal.com.br/prototipocompleto/updates/latest.yml";
  try {
    const txt = await fetch(url).then(r => r.text());
    const v = (txt.match(/version:\s*([0-9.]+)/) || [])[1];
    console.log(`\n✓ Publicado! Manifesto no ar em ${url} (version: ${v || "?"})`);
    console.log("  Os clientes vão baixar a atualização automaticamente ao abrir o programa.");
  } catch {
    console.log(`\n✓ Arquivos enviados. (Não consegui confirmar o manifesto público daqui — verifique ${url})`);
  }
}
main().catch(e => { console.error("✗ Erro:", e.message); process.exit(1); });
