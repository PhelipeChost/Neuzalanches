// Provisiona o cardápio online da Boutique de Peixes em /var/www/boutiquedepeixes.
// Espelha o setup do prototipocompleto: server/ + node_modules (reuso) + dist/ +
// .env, pm2 na porta 3006, banco novo (criado no 1º boot). NÃO toca em nada
// existente (prototipocompleto/updates preservado).
import { Client } from "ssh2";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const HOST = "177.153.62.21", USER = "root", PASS = "A@Xn8felipe";
const REMOTE = "/var/www/boutiquedepeixes";
const PORT = 3006;
const JWT_SECRET = "362fd0e42e50beda681a0b790c207c9036f11c448fccb29b171d3c70d27c9b1b";
const FISCAL_SECRET = "b1na9c8f2d4e6a7c0b3d5f8e1a2c4b6d8e0f1a3c5b7d9e2f4a6c8b0d1e3f5a7c";

function exec(conn, cmd) {
  return new Promise((res, rej) => conn.exec(cmd, (e, s) => {
    if (e) return rej(e);
    let out = ""; s.on("data", d => { out += d; process.stdout.write(d); });
    s.stderr.on("data", d => { out += d; process.stderr.write(d); });
    s.on("close", (code) => res({ out: out.trim(), code }));
  }));
}
function getSftp(conn) { return new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s))); }
function sftpWrite(sftp, remotePath, data) {
  return new Promise((res, rej) => { const ws = sftp.createWriteStream(remotePath); ws.on("error", rej); ws.on("close", res); ws.end(data); });
}
function getAllFiles(dir, base) {
  base = base || dir; let r = [];
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) r = r.concat(getAllFiles(full, base));
    else r.push({ local: full, rel: relative(base, full).replace(/\\/g, "/") });
  }
  return r;
}

const conn = new Client();
conn.on("ready", async () => {
  try {
    console.log("Conectado ao VPS.\n");

    // 1. Estrutura + reuso de node_modules e package.json do prototipocompleto
    console.log("=== Preparando /var/www/boutiquedepeixes ===");
    await exec(conn, `mkdir -p ${REMOTE}/server/services ${REMOTE}/dist/assets`);
    console.log("→ Copiando node_modules do prototipocompleto (better-sqlite3 já compilado)…");
    await exec(conn, `test -d ${REMOTE}/node_modules || cp -r /var/www/prototipocompleto/node_modules ${REMOTE}/node_modules`);
    await exec(conn, `cp /var/www/prototipocompleto/package.json ${REMOTE}/package.json`);

    const sftp = await getSftp(conn);

    // 2. server/ (fresh do local — inclui todos os fixes fiscais)
    console.log("\n=== Enviando server/ ===");
    const serverFiles = ["server/index.js", "server/database.js", ...getAllFiles("server/services").map(f => `server/services/${f.rel}`)];
    for (const f of serverFiles) { await sftpWrite(sftp, `${REMOTE}/${f}`, readFileSync(f)); console.log("  " + f); }

    // 3. dist/ (build com base /boutiquedepeixes/)
    console.log("\n=== Enviando dist/ ===");
    for (const { local, rel } of getAllFiles("dist")) {
      const d = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
      if (d) await exec(conn, `mkdir -p ${REMOTE}/dist/${d}`);
      await sftpWrite(sftp, `${REMOTE}/dist/${rel}`, readFileSync(local));
      console.log("  dist/" + rel);
    }

    // 4. .env
    console.log("\n=== .env ===");
    const env = `PORT=${PORT}\nJWT_SECRET=${JWT_SECRET}\nFISCAL_SECRET=${FISCAL_SECRET}\nNODE_ENV=production\n`;
    await sftpWrite(sftp, `${REMOTE}/.env`, Buffer.from(env, "utf8"));
    console.log("  .env (PORT=" + PORT + ")");
    sftp.end();

    // 5. pm2 start (cwd = REMOTE p/ o banco cair em ../fluxo-caixa.db)
    console.log("\n=== pm2 start boutiquedepeixes ===");
    await exec(conn, `cd ${REMOTE} && pm2 delete boutiquedepeixes 2>/dev/null; pm2 start server/index.js --name boutiquedepeixes --cwd ${REMOTE} && pm2 save`);

    // 6. Verificação da API local
    console.log("\n=== Verificação ===");
    await exec(conn, `sleep 2 && curl -s -o /dev/null -w "API local (${PORT}): %{http_code}\\n" http://localhost:${PORT}/api/produtos`);
    await exec(conn, `pm2 status boutiquedepeixes --no-color`);
    console.log("\n✅ Backend provisionado (porta " + PORT + ").");
  } catch (e) {
    console.error("\n❌ Falhou:", e.message);
    process.exitCode = 1;
  } finally {
    conn.end();
  }
});
conn.on("error", e => { console.error("SSH error:", e.message); process.exitCode = 1; });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30000 });
