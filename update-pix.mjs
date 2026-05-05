import { Client } from 'ssh2';

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => { out += d; process.stderr.write(d); });
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

const conn = new Client();
conn.on('ready', async () => {
  try {
    const script = `
import Database from 'better-sqlite3';
const db = new Database('/var/www/neuzalanches/fluxo-caixa.db');
const up = db.prepare("INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
up.run('pix_key','18991589923');
up.run('pix_nome','Antônio Joalisson Nobrega Costa');
const rows = db.prepare("SELECT * FROM config WHERE key IN ('pix_key','pix_nome')").all();
console.log(JSON.stringify(rows, null, 2));
`;
    await exec(conn, `cat > /var/www/neuzalanches/_upd-pix.mjs <<'EOF'\n${script}\nEOF`);
    console.log('=== Atualizando ===');
    await exec(conn, `cd /var/www/neuzalanches && node _upd-pix.mjs && rm _upd-pix.mjs`);

    console.log('\n=== Verificando via API ===');
    await exec(conn, 'curl -s http://localhost:3003/api/config/pix');
    console.log();

    console.log('\n✅ Pix atualizado!');
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
