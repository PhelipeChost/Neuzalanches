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
    console.log('=== Estado ===');
    await exec(conn, `curl -s -H "apikey: ${KEY}" http://localhost:8080/instance/connectionState/${INSTANCE}`);
    console.log();

    console.log('\n=== Webhook configurado ===');
    await exec(conn, `curl -s -H "apikey: ${KEY}" http://localhost:8080/webhook/find/${INSTANCE}`);
    console.log();

    console.log('\n=== Forçar nova geração de QR ===');
    await exec(conn, `curl -s -H "apikey: ${KEY}" http://localhost:8080/instance/connect/${INSTANCE} | head -c 100`);
    console.log();

    console.log('\n=== Aguardar 8s ===');
    await exec(conn, 'sleep 8');

    console.log('\n=== Logs neuzalanches últimos 25 ===');
    await exec(conn, `pm2 logs neuzalanches --lines 25 --nostream 2>&1 | grep -E 'webhook|QR|connection' | tail -30`);

    console.log('\n=== Idade QR atual ===');
    await exec(conn, `curl -s http://localhost:3003/api/bot/qr | grep -oE 'Idade: [0-9]+s' | head -1`);
    console.log();

    console.log('\n=== Teste webhook manual ===');
    await exec(conn, `curl -s -X POST -H "Content-Type: application/json" http://localhost:3003/api/bot/webhook -d '{"event":"QRCODE_UPDATED","data":{"qrcode":{"base64":"data:image/png;base64,TESTE"}}}'`);
    console.log();
    await exec(conn, `pm2 logs neuzalanches --lines 5 --nostream 2>&1 | tail -8`);
  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
