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

const KEY = 'neuzalanches-secret-key-2024';
const INSTANCE = 'neuzalanches';

const conn = new Client();
conn.on('ready', async () => {
  try {
    console.log('=== 1. Estado da instância ===');
    await exec(conn, `curl -s -H "apikey: ${KEY}" http://localhost:8080/instance/connectionState/${INSTANCE}`);
    console.log();

    console.log('\n=== 2. Idade do QR no /api/bot/qr ===');
    await exec(conn, `curl -s http://localhost:3003/api/bot/qr | grep -oE 'Idade: [0-9]+s' | head -1`);
    console.log();

    console.log('\n=== 3. Logs recentes do Evolution (últimas 30 linhas) ===');
    await exec(conn, `docker logs --tail 30 evolution_api 2>&1 || pm2 logs evolution --lines 30 --nostream 2>&1`);

    console.log('\n=== 4. Logs do neuzalanches (últimas 20 linhas) ===');
    await exec(conn, `pm2 logs neuzalanches --lines 20 --nostream 2>&1`);
  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
