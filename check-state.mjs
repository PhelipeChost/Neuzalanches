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
    console.log('=== Estado atual ===');
    await exec(conn, `curl -s -H "apikey: neuzalanches-secret-key-2024" http://localhost:8080/instance/connectionState/neuzalanches`);
    console.log('\n\n=== Últimos 15 connection.update do log ===');
    await exec(conn, `grep 'connection.update' /root/.pm2/logs/neuzalanches-out.log | tail -15`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
