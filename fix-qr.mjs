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
    console.log('=== Como Evolution está rodando? ===');
    await exec(conn, 'pm2 list && docker ps 2>/dev/null | head -10');

    console.log('\n=== Listar instâncias na Evolution ===');
    await exec(conn, `curl -s -H "apikey: ${KEY}" http://localhost:8080/instance/fetchInstances`);
    console.log();

    console.log('\n=== DELETAR instância antiga (reset total) ===');
    await exec(conn, `curl -s -X DELETE -H "apikey: ${KEY}" http://localhost:8080/instance/delete/${INSTANCE}`);
    console.log();

    console.log('\n=== Aguardando 3s ===');
    await exec(conn, 'sleep 3');

    console.log('\n=== CRIAR instância nova ===');
    await exec(conn, `curl -s -X POST -H "apikey: ${KEY}" -H "Content-Type: application/json" http://localhost:8080/instance/create -d '${JSON.stringify({
      instanceName: INSTANCE,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS"
    })}'`);
    console.log();

    console.log('\n=== Aguardando 3s ===');
    await exec(conn, 'sleep 3');

    console.log('\n=== Reconfigurar webhook ===');
    await exec(conn, `curl -s -X POST -H "apikey: ${KEY}" -H "Content-Type: application/json" http://localhost:8080/webhook/set/${INSTANCE} -d '${JSON.stringify({
      webhook: {
        enabled: true,
        url: "http://localhost:3003/api/bot/webhook",
        webhookByEvents: false,
        events: ["QRCODE_UPDATED","CONNECTION_UPDATE","MESSAGES_UPSERT"]
      }
    })}'`);
    console.log();

    console.log('\n=== Conectar e gerar QR ===');
    await exec(conn, `curl -s -H "apikey: ${KEY}" http://localhost:8080/instance/connect/${INSTANCE} | head -c 200`);
    console.log();

    console.log('\n=== Aguardando 6s para QR ser gerado e capturado ===');
    await exec(conn, 'sleep 6');

    console.log('\n=== Estado atual ===');
    await exec(conn, `curl -s -H "apikey: ${KEY}" http://localhost:8080/instance/connectionState/${INSTANCE}`);
    console.log();

    console.log('\n=== Idade do QR no /api/bot/qr ===');
    await exec(conn, `curl -s http://localhost:3003/api/bot/qr | grep -oE 'Idade: [0-9]+s' | head -1`);

    console.log('\n✅ Reset completo!');
    console.log('🌐 Abra: https://neuzalanches.com.br/api/bot/qr  (atualize a página com Ctrl+F5)');
  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
