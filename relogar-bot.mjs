import { Client } from 'ssh2';
function exec(conn, cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error(err.message); return resolve(''); }
      let out = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => { out += d; process.stderr.write(d); });
      stream.on('close', () => resolve(out.trim()));
    });
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const conn = new Client();
conn.on('ready', async () => {
  try {
    const H = '-H "apikey: neuzalanches-secret-key-2024"';
    const URL = 'http://localhost:8080';
    const I = 'neuzalanches';

    console.log('=== 1. Estado antes ===');
    await exec(conn, `curl -s ${H} ${URL}/instance/connectionState/${I}`);

    console.log('\n\n=== 2. Logout (desconecta sessão atual) ===');
    await exec(conn, `curl -s -X DELETE ${H} ${URL}/instance/logout/${I}`);

    console.log('\n\n=== 3. Aguardando 4s ===');
    await sleep(4000);

    console.log('\n=== 4. Estado depois do logout ===');
    await exec(conn, `curl -s ${H} ${URL}/instance/connectionState/${I}`);

    console.log('\n\n=== 5. Connect (gera novo QR) ===');
    await exec(conn, `curl -s ${H} ${URL}/instance/connect/${I} | head -c 400`);

    console.log('\n\n=== 6. Aguardando 3s e checando estado final ===');
    await sleep(3000);
    await exec(conn, `curl -s ${H} ${URL}/instance/connectionState/${I}`);

    console.log('\n\n=== PRONTO ===');
    console.log('Acesse https://neuzalanches.com.br/api/bot/qr e escaneie o QR no celular do bot.');
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
