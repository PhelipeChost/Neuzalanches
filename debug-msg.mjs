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
    console.log('=== Mensagens recentes recebidas pelo Evolution (últimas 5) ===');
    await exec(conn, `curl -s -X POST -H "apikey: neuzalanches-secret-key-2024" -H "Content-Type: application/json" http://localhost:8080/chat/findMessages/neuzalanches -d '{"where":{"key":{"fromMe":false}},"limit":5,"offset":0}' | head -c 4000`);
    console.log();

    console.log('\n\n=== Logs últimos webhook calls (sem filtro, raw) ===');
    await exec(conn, `tail -n 80 /root/.pm2/logs/neuzalanches-out.log | grep -E '\\[bot' | tail -25`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
