// Adiciona as locations /boutiquedepeixes ao nginx (sites-enabled/nexo, arquivo
// vivo). Faz backup, insere o bloco antes de "# ===== NEXO PRINCIPAL =====",
// testa (nginx -t) e recarrega. Se o teste falhar, RESTAURA o backup.
import { Client } from "ssh2";
const HOST = "177.153.62.21", USER = "root", PASS = "A@Xn8felipe";
const FILE = "/etc/nginx/sites-enabled/nexo";
const STAMP = Date.now();

const BLOCO = `
    # ===== BOUTIQUE DE PEIXES (cardapio online do cliente) =====
    location /boutiquedepeixes/api/ {
        proxy_pass http://127.0.0.1:3006/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location = /boutiquedepeixes {
        return 301 /boutiquedepeixes/;
    }

    location /boutiquedepeixes/assets/ {
        alias /var/www/boutiquedepeixes/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /boutiquedepeixes/ {
        alias /var/www/boutiquedepeixes/dist/;
        index index.html;
        try_files $uri $uri/ /boutiquedepeixes/index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
    }

`;

function exec(conn, cmd) {
  return new Promise((res, rej) => conn.exec(cmd, (e, s) => {
    if (e) return rej(e);
    let out = ""; s.on("data", d => { out += d; process.stdout.write(d); });
    s.stderr.on("data", d => { out += d; process.stderr.write(d); });
    s.on("close", code => res({ out: out.trim(), code }));
  }));
}
function getSftp(conn) { return new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s))); }
function readFile(sftp, p) { return new Promise((res, rej) => sftp.readFile(p, (e, d) => e ? rej(e) : res(d.toString("utf8")))); }
function writeFile(sftp, p, data) { return new Promise((res, rej) => { const w = sftp.createWriteStream(p); w.on("error", rej); w.on("close", res); w.end(data); }); }

const conn = new Client();
conn.on("ready", async () => {
  try {
    const sftp = await getSftp(conn);
    let conf = await readFile(sftp, FILE);

    if (conf.includes("/boutiquedepeixes/")) {
      console.log("Bloco já existe no nginx. Nada a fazer.");
      conn.end(); return;
    }

    // Backup
    console.log("=== Backup do nginx ===");
    await exec(conn, `cp ${FILE} ${FILE}.bak-boutique-${STAMP} && echo "backup: ${FILE}.bak-boutique-${STAMP}"`);

    // Inserir antes da 1ª ocorrência de "# ===== NEXO PRINCIPAL ====="
    const marcador = "# ===== NEXO PRINCIPAL =====";
    const idx = conf.indexOf(marcador);
    if (idx < 0) throw new Error("marcador NEXO PRINCIPAL não encontrado");
    conf = conf.slice(0, idx) + BLOCO.trimStart() + "\n    " + conf.slice(idx);

    await writeFile(sftp, FILE, Buffer.from(conf, "utf8"));
    sftp.end();
    console.log("Bloco inserido. Testando nginx…\n");

    // Testar
    const t = await exec(conn, "nginx -t 2>&1");
    if (t.out.includes("test is successful") || t.code === 0) {
      console.log("\n→ nginx -t OK. Recarregando…");
      await exec(conn, "systemctl reload nginx && echo 'nginx recarregado'");
    } else {
      console.log("\n✗ nginx -t FALHOU — restaurando backup.");
      await exec(conn, `cp ${FILE}.bak-boutique-${STAMP} ${FILE} && nginx -t && systemctl reload nginx && echo 'restaurado'`);
      throw new Error("nginx -t falhou; backup restaurado.");
    }

    // Verificação pública
    console.log("\n=== Verificação pública ===");
    await exec(conn, `curl -s -o /dev/null -w "cardapio boutique: %{http_code}\\n" https://reinonexusideal.com.br/boutiquedepeixes/`);
    await exec(conn, `curl -s -o /dev/null -w "api boutique:      %{http_code}\\n" https://reinonexusideal.com.br/boutiquedepeixes/api/produtos`);
    await exec(conn, `curl -s -o /dev/null -w "prototipo updates (intacto): %{http_code}\\n" https://reinonexusideal.com.br/prototipocompleto/updates/latest.yml`);
    console.log("\n✅ Rota nginx configurada.");
  } catch (e) {
    console.error("\n❌ Falhou:", e.message);
    process.exitCode = 1;
  } finally {
    conn.end();
  }
});
conn.on("error", e => { console.error("SSH error:", e.message); process.exitCode = 1; });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30000 });
