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
    console.log('=== Status atual da instância ===');
    await exec(conn, `curl -s -H "apikey: ${KEY}" http://localhost:8080/instance/connectionState/${INSTANCE}`);
    console.log();

    console.log('\n=== Fazendo logout do número atual (deslogando do WhatsApp) ===');
    await exec(conn, `curl -s -X DELETE -H "apikey: ${KEY}" http://localhost:8080/instance/logout/${INSTANCE}`);
    console.log();

    console.log('\n=== Aguardando 3 segundos ===');
    await exec(conn, 'sleep 3');

    console.log('\n=== Solicitando novo QR Code ===');
    await exec(conn, `curl -s -H "apikey: ${KEY}" http://localhost:8080/instance/connect/${INSTANCE}`);
    console.log();

    console.log('\n=== Aguardando 5 segundos para o QR ser gerado ===');
    await exec(conn, 'sleep 5');

    console.log('\n=== Verificando se o QR foi capturado pelo webhook ===');
    await exec(conn, 'curl -s http://localhost:3003/api/bot/qr | head -c 200');
    console.log();

    console.log('\n✅ QR gerado!');
    console.log('🌐 Abra: https://neuzalanches.com.br/api/bot/qr');
    console.log('   Escaneie com o NOVO celular (use WhatsApp → Aparelhos conectados → Conectar aparelho)');
  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
