import { Client } from 'ssh2';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const HOST = '177.153.62.21';
const USER = 'root';
const PASS = 'A@Xn8felipe';
const REMOTE = '/var/www/prototipocompleto';
const PM2 = 'prototipocompleto';
const STAMP = Date.now();

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => { out += d; process.stderr.write(d); });
      stream.on('close', (code) => resolve({ out: out.trim(), code }));
    });
  });
}
function getSftp(conn) { return new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s))); }
function sftpWrite(sftp, remotePath, data) {
  return new Promise((res, rej) => { const ws = sftp.createWriteStream(remotePath); ws.on('error', rej); ws.on('close', res); ws.end(data); });
}
function getAllFiles(dir, base) {
  base = base || dir; let r = [];
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) r = r.concat(getAllFiles(full, base));
    else r.push({ local: full, rel: relative(base, full).replace(/\\/g, '/') });
  }
  return r;
}

const conn = new Client();
conn.on('ready', async () => {
  try {
    console.log('Conectado ao servidor do protótipo (177.153.62.21)\n');

    // 1. BACKUP (rollback rápido se necessário)
    console.log('=== Backup do estado atual ===');
    await exec(conn, `cp -r ${REMOTE}/dist ${REMOTE}/dist.bak.${STAMP} && cp ${REMOTE}/server/index.js ${REMOTE}/server/index.js.bak.${STAMP} && cp ${REMOTE}/server/database.js ${REMOTE}/server/database.js.bak.${STAMP} && echo "backup OK (.bak.${STAMP})"`);

    const sftp = await getSftp(conn);

    // 2. Upload dist (frontend buildado com base /prototipocompleto/ + 12 features)
    console.log('\n=== Enviando dist/ ===');
    await exec(conn, `mkdir -p ${REMOTE}/dist/assets`);
    const distFiles = getAllFiles('dist');
    for (const { local, rel } of distFiles) {
      const dir = rel.includes('/') ? rel.substring(0, rel.lastIndexOf('/')) : '';
      if (dir) await exec(conn, `mkdir -p ${REMOTE}/dist/${dir}`);
      await sftpWrite(sftp, `${REMOTE}/dist/${rel}`, readFileSync(local));
      console.log(`  dist/${rel}`);
    }

    // 3. Upload server (index + database + toda a pasta services/)
    console.log('\n=== Enviando server/ (index.js + database.js + services/*) ===');
    await exec(conn, `mkdir -p ${REMOTE}/server/services`);
    const serverFiles = ['server/index.js', 'server/database.js', ...getAllFiles('server/services').map(f => `server/services/${f.rel}`)];
    for (const f of serverFiles) {
      await sftpWrite(sftp, `${REMOTE}/${f}`, readFileSync(f));
      console.log(`  ${f}`);
    }
    sftp.end();

    // 4. Restart pm2 do protótipo (NÃO toca em neuzalanches/produção)
    console.log('\n=== pm2 restart prototipocompleto ===');
    await exec(conn, `pm2 restart ${PM2} --update-env`);

    // 5. Verificação
    console.log('\n=== Verificação ===');
    await exec(conn, `pm2 status ${PM2} --no-color`);
    await exec(conn, `sleep 2 && curl -s -o /dev/null -w "API local (3005): %{http_code}\\n" http://localhost:3005/api/produtos`);
    await exec(conn, `curl -s -o /dev/null -w "Site publico: %{http_code}\\n" https://reinonexusideal.com.br/prototipocompleto/`);

    console.log('\n✅ Deploy do protótipo concluído!');
  } catch (e) {
    console.error('\n❌ Deploy falhou:', e.message);
    process.exitCode = 1;
  } finally {
    conn.end();
  }
});
conn.on('error', e => { console.error('SSH error:', e.message); process.exitCode = 1; });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30000 });
