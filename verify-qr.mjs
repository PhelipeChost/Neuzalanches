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
    console.log('=== Estado da instância ===');
    await exec(conn, `curl -s -H "apikey: neuzalanches-secret-key-2024" http://localhost:8080/instance/connectionState/neuzalanches`);
    console.log();
    console.log('\n=== Testando /api/bot/qr (cabeçalho) ===');
    await exec(conn, `curl -s http://localhost:3003/api/bot/qr | grep -oE 'Estado: <b>[^<]+</b>|Fonte: [^ ]+|Idade: [0-9]+s' | head -3`);
    console.log();
    console.log('\n=== Tem QR sendo servido? (tamanho) ===');
    await exec(conn, `curl -s http://localhost:3003/api/bot/qr | wc -c`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
