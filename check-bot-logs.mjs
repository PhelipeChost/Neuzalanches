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

    console.log('\n=== Webhook configurado? ===');
    await exec(conn, `curl -s -H "apikey: neuzalanches-secret-key-2024" http://localhost:8080/webhook/find/neuzalanches`);
    console.log();

    console.log('\n=== Logs OUT últimas 50 linhas (todos webhook events) ===');
    await exec(conn, `pm2 logs neuzalanches --lines 50 --nostream --raw 2>&1 | grep -E 'webhook|saudacao|bot|cooldown|enviando|MESSAGES' | tail -40`);

    console.log('\n=== Logs ERR últimas 30 linhas ===');
    await exec(conn, `tail -n 30 /root/.pm2/logs/neuzalanches-error.log`);

    console.log('\n=== Teste enviar mensagem direto pela API Evolution (verifica se sender funciona) ===');
    await exec(conn, `curl -s -X POST -H "apikey: neuzalanches-secret-key-2024" -H "Content-Type: application/json" http://localhost:8080/message/sendText/neuzalanches -d '{"number":"5518991589923","text":"🤖 Teste de conexão do bot — ignore esta mensagem."}'`);
    console.log();
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
